import { toPublicUser } from "../publicUser";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { getQuoteForCompany } from "../tenantGuards";
import { APPROVED_WORK_STATUSES } from "../../drizzle/schema";
import { logActivity } from "../activityLogger";
import { generateInvoiceNumber } from "../invoiceNumber.js";
import { assertApprovedWorkLinks, assertApprovedWorkOpen, assertNoOverlappingQuoteApproval, markQuoteItemConverted, withApprovedWorkCreation, withLockedApprovedWork } from "../approvedWorkIntegrity";
import { assertRepairQuoteFinalized } from "../repairQuoteIntegrity";
import { assertInvoiceLinks } from "../invoiceLinks";

const STATUS_ENUM = z.enum(APPROVED_WORK_STATUSES);

const APPROVAL_SOURCE_ENUM = z.enum([
  "email", "phone", "signed_pdf", "in_person", "portal", "internal",
]);

const TYPE_ENUM = z.enum(["job_order", "repair_order"]);

export const approvedWorkRouter = router({

  // ── Queries ──────────────────────────────────────────────────────────────

  /**
   * List all approved work records for the current company, enriched with
   * site name, building ID, and customer org name for display.
   */
  list: officeProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      status: STATUS_ENUM.optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const records = await db.getApprovedWorkByCompany(
        input.companyId,
        input.status
      );

      if (records.length === 0) return [];
      await Promise.all(records.map(record => assertApprovedWorkLinks(record, record.companyId)));

      // Batch-enrich with site + customer org names
      const siteIds   = Array.from(new Set(records.map(r => r.siteId).filter(Boolean) as number[]));
      const orgIds    = Array.from(new Set(records.map(r => r.customerOrgId).filter(Boolean) as number[]));
      const woIds     = Array.from(new Set(records.map(r => r.workOrderId).filter(Boolean) as number[]));
      const userIds   = Array.from(new Set(records.flatMap(r => (r.assignedTechnicianIds as number[] | null) ?? [])));

      const [sites, orgs, wos, users] = await Promise.all([
        siteIds.length   ? Promise.all(siteIds.map(id => db.getSiteById(id)))   : Promise.resolve([]),
        orgIds.length    ? Promise.all(orgIds.map(id => db.getCustomerOrgById(id))) : Promise.resolve([]),
        woIds.length     ? Promise.all(woIds.map(id => db.getWorkOrderById(id))) : Promise.resolve([]),
        userIds.length   ? Promise.all(userIds.map(id => db.getUserById(id)))   : Promise.resolve([]),
      ]);

      const siteMap = new Map(sites.filter(Boolean).map(s => [s!.id, s!]));
      const orgMap  = new Map(orgs.filter(Boolean).map(o => [o!.id, o!]));
      const woMap   = new Map(wos.filter(Boolean).map(w => [w!.id, w!]));
      const userMap = new Map(users.filter(Boolean).map(u => [u!.id, u!]));

      return records.map(r => ({
        ...r,
        siteName:          siteMap.get(r.siteId ?? 0)?.name ?? null,
        buildingId:        siteMap.get(r.siteId ?? 0)?.buildingId ?? null,
        siteAddress:       siteMap.get(r.siteId ?? 0)?.address ?? null,
        customerOrgName:   orgMap.get(r.customerOrgId ?? 0)?.name ?? null,
        workOrderNumber:   woMap.get(r.workOrderId ?? 0)?.workOrderNumber ?? null,
        assignedTechNames: ((r.assignedTechnicianIds as number[] | null) ?? [])
          .map(id => userMap.get(id)?.name ?? null)
          .filter(Boolean) as string[],
      }));
    }),

  /**
   * Get a single approved work record by ID, enriched with related entity info.
   */
  get: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await assertApprovedWorkLinks(record, record.companyId);
      const [site, org, wo, job, deficiency, linkedInvoice] = await Promise.all([
        record.siteId       ? db.getSiteById(record.siteId)            : Promise.resolve(null),
        record.customerOrgId ? db.getCustomerOrgById(record.customerOrgId) : Promise.resolve(null),
        record.workOrderId  ? db.getWorkOrderById(record.workOrderId)  : Promise.resolve(null),
        record.jobId        ? db.getJobById(record.jobId)              : Promise.resolve(null),
        record.deficiencyId ? db.getDeficiencyById(record.deficiencyId) : Promise.resolve(null),
        db.getInvoiceByApprovedWork(record.id),
      ]);

      const techIds = (record.assignedTechnicianIds as number[] | null) ?? [];
      const techs = techIds.length
        ? (await Promise.all(techIds.map(id => db.getUserById(id)))).filter((u): u is NonNullable<typeof u> => !!u)
            .map(toPublicUser)
        : [];

      return {
        ...record,
        site: site ?? null,
        customerOrg: org ?? null,
        workOrder: wo ?? null,
        job: job ?? null,
        deficiency: deficiency ?? null,
        assignedTechs: techs,
        invoiceId: linkedInvoice?.id ?? null,
      };
    }),

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Manually create an approved work record.
   */
  create: officeProcedure
    .input(z.object({
      companyId:       z.number().int().positive(),
      customerOrgId:   z.number().int().positive().optional(),
      siteId:          z.number().int().positive().optional(),
      jobId:           z.number().int().positive().optional(),
      deficiencyId:    z.number().int().positive().optional(),
      quoteId:         z.number().int().positive().optional(),
      quoteItemId:     z.number().int().positive().optional(),
      type:            TYPE_ENUM,
      approvedScope:   z.string().max(5000).optional(),
      approvedAmount:  z.number().nonnegative().multipleOf(0.01).optional(),
      approvedAt:      z.date().optional(),
      approvedByName:  z.string().max(255).optional(),
      approvedByEmail: z.string().email().max(320).optional(),
      approvalSource:  APPROVAL_SOURCE_ENUM.optional(),
      officeNotes:     z.string().max(5000).optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      withApprovedWorkCreation(ctx, "approvedWork.create", input.companyId, input, async tx => {
        if (input.quoteId) await assertNoOverlappingQuoteApproval(tx, input.quoteId, input.quoteItemId);
        if (input.quoteItemId) {
          const item = await assertApprovedWorkLinks(input, input.companyId);
          const quote = await db.getQuoteById(input.quoteId!);
          assertRepairQuoteFinalized(quote!);
          if (!["approved", "accepted", "partially_approved", "converted_to_approved_work"].includes(quote!.status) ||
              !["approved", "converted_to_approved_work"].includes(item!.approvalStatus)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Approve the quote item before creating approved work" });
          }
          if (await db.getApprovedWorkByQuoteItem(input.quoteItemId)) {
            throw new TRPCError({ code: "CONFLICT", message: "An Approved Work record already exists for this quote item." });
          }
          // The selected approval's recorded scope/amount is authoritative.
          const record = await db.createApprovedWork({ ...input, approvedAmount: item!.total,
            approvedScope: item!.description, status: "approved", createdById: ctx.user.id });
          await markQuoteItemConverted(tx, input.quoteId!, item!.id);
          await logActivity({ ctx: { user: { ...ctx.user, companyId: record.companyId } }, entityType: "approved_work", entityId: record.id, eventType: "created", title: "Approved work record created" });
          return record;
        }
        let approvedAmount = input.approvedAmount != null ? input.approvedAmount.toFixed(2) : undefined;
        if (input.quoteId) {
          const quote = await db.getQuoteById(input.quoteId);
          if (quote?.quoteType === "repair") assertRepairQuoteFinalized(quote);
          if (!quote || !["approved", "accepted", "converted_to_approved_work"].includes(quote.status) ||
              (approvedAmount != null && Number(approvedAmount) !== Number(quote.total))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "A quote approval must preserve its approved scope and amount" });
          }
          approvedAmount = quote.total;
        }
        const record = await db.createApprovedWork({ ...input, approvedAmount,
          status: "approved", createdById: ctx.user.id });
        await logActivity({ ctx: { user: { ...ctx.user, companyId: record.companyId } }, entityType: "approved_work", entityId: record.id, eventType: "created", title: "Approved work record created" });
        return record;
      })),

  createFromQuoteItem: officeProcedure
    .input(z.object({
      quoteId:     z.number().int().positive(),
      quoteItemId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const candidate = await getQuoteForCompany(input.quoteId, ctx.user.companyId!);
      const links = { quoteId: candidate.id, quoteItemId: input.quoteItemId, jobId: candidate.jobId,
        siteId: candidate.siteId, customerOrgId: candidate.customerOrgId };
      return withApprovedWorkCreation(ctx, "approvedWork.createFromQuoteItem", candidate.companyId, links, async tx => {
        const quote = await db.getQuoteById(candidate.id);
        assertRepairQuoteFinalized(quote!);
        const item = await assertApprovedWorkLinks(links, candidate.companyId);
        if (!["approved", "accepted", "partially_approved", "converted_to_approved_work"].includes(quote!.status) ||
            !["approved", "converted_to_approved_work"].includes(item!.approvalStatus)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Approve the quote item before creating approved work" });
        }
        if (await db.getApprovedWorkByQuoteItem(item!.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "An Approved Work record already exists for this quote item." });
        }
        await assertNoOverlappingQuoteApproval(tx, quote!.id, item!.id);
        const record = await db.createApprovedWork({ ...links, deficiencyId: item!.deficiencyId,
          companyId: candidate.companyId, type: "repair_order", status: "approved",
          approvedAmount: item!.total, approvedScope: item!.description,
          approvedAt: quote!.approvedAt ?? new Date(), approvalSource: "portal", createdById: ctx.user.id });
        await markQuoteItemConverted(tx, quote!.id, item!.id);
        await logActivity({ ctx: { user: { ...ctx.user, companyId: record.companyId } }, entityType: "approved_work", entityId: record.id, eventType: "created",
          title: "Approved work created from quote item", relatedEntityType: "repair_quote", relatedEntityId: quote!.id });
        return record;
      });
    }),

  update: officeProcedure
    .input(z.object({
      id:              z.number().int().positive(),
      customerOrgId:   z.number().int().positive().optional().nullable(),
      siteId:          z.number().int().positive().optional().nullable(),
      jobId:           z.number().int().positive().optional().nullable(),
      deficiencyId:    z.number().int().positive().optional().nullable(),
      approvedScope:   z.string().max(5000).optional(),
      approvedAmount:  z.number().nonnegative().multipleOf(0.01).optional().nullable(),
      approvedAt:      z.date().optional().nullable(),
      approvedByName:  z.string().max(255).optional(),
      approvedByEmail: z.string().email().max(320).optional(),
      approvalSource:  APPROVAL_SOURCE_ENUM.optional().nullable(),
      scheduledDate:   z.date().optional().nullable(),
      assignedTechnicianIds: z.array(z.number().int().positive()).optional(),
      partsStatus:     z.string().max(100).optional().nullable(),
      invoiceNumber:   z.string().max(100).optional().nullable(),
      invoiceStatus:   z.string().max(100).optional().nullable(),
      officeNotes:     z.string().max(5000).optional(),
      technicianNotes: z.string().max(5000).optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      withLockedApprovedWork(ctx, "approvedWork.update", input.id, input, async record => {
        assertApprovedWorkOpen(record);
        if (input.invoiceNumber !== undefined || input.invoiceStatus !== undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Use the invoice workflow to change invoice tracking" });
        }
        const scopeChanged = ["customerOrgId", "siteId", "jobId", "deficiencyId", "approvedScope", "approvedAmount"]
          .some(key => (input as Record<string, unknown>)[key] !== undefined);
        if (scopeChanged && (record.invoiceNumber || await db.getInvoiceByApprovedWork(record.id))) {
          throw new TRPCError({ code: "CONFLICT", message: "Invoiced approved work scope and amount are locked" });
        }
        if (record.quoteId && (input.approvedScope !== undefined || input.approvedAmount !== undefined)) {
          throw new TRPCError({ code: "CONFLICT", message: "Quote approval snapshots cannot be changed. Create a revision." });
        }
        if (input.assignedTechnicianIds) {
          for (const id of input.assignedTechnicianIds) {
            const technician = await db.getUserById(id);
            if (!technician || technician.companyId !== record.companyId || technician.role !== "technician" || technician.isActive !== 1) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Assigned technician is not active in the approved work company" });
            }
          }
        }
        const { id, approvedAmount, invoiceNumber, invoiceStatus, ...rest } = input;
        await db.updateApprovedWork(id, { ...rest,
          ...(approvedAmount !== undefined ? { approvedAmount: approvedAmount != null ? approvedAmount.toFixed(2) : null } : {}) });
        return { success: true };
      })),

  updateStatus: officeProcedure
    .input(z.object({
      id:     z.number().int().positive(),
      status: STATUS_ENUM,
    }))
    .mutation(async ({ input, ctx }) =>
      withLockedApprovedWork(ctx, "approvedWork.updateStatus", input.id, {}, async record => {
        assertApprovedWorkOpen(record);
        if (input.status === "invoiced" && !record.invoiceNumber) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Create or record the invoice before marking this work invoiced" });
        }
        if (record.invoiceNumber && input.status !== "invoiced" && input.status !== "closed") {
          throw new TRPCError({ code: "CONFLICT", message: "Invoiced work cannot return to an earlier approval state" });
        }
        const timestamps: Record<string, Date> = {};
        if (input.status === "in_progress" && !record.startedAt) timestamps.startedAt = new Date();
        if (input.status === "completed" && !record.completedAt) timestamps.completedAt = new Date();
        if (input.status === "closed" && !record.closedAt) timestamps.closedAt = new Date();
        await db.updateApprovedWork(input.id, { status: input.status, ...timestamps });
        await logActivity({ ctx: { user: { ...ctx.user, companyId: record.companyId } }, entityType: "approved_work", entityId: input.id, eventType: "status_changed",
          title: `Approved work status changed to ${input.status}`, oldValue: record.status, newValue: input.status });
        return { success: true };
      })),

  markInvoiced: officeProcedure
    .input(z.object({
      id:            z.number().int().positive(),
      invoiceNumber: z.string().min(1).max(100),
      invoiceStatus: z.string().max(100).optional(),
      officeNotes:   z.string().max(5000).optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      withLockedApprovedWork(ctx, "approvedWork.markInvoiced", input.id, {}, async record => {
        const linked = await db.getInvoiceByApprovedWork(record.id);
        if (linked) {
          if (linked.companyId !== record.companyId) throw new TRPCError({ code: "FORBIDDEN" });
          await assertInvoiceLinks(linked, record.companyId);
        }
        if ((record.invoiceNumber && record.invoiceNumber !== input.invoiceNumber) ||
            (linked && linked.invoiceNumber !== input.invoiceNumber)) {
          throw new TRPCError({ code: "CONFLICT", message: "This approved work already tracks a different invoice" });
        }
        if (record.invoiceNumber === input.invoiceNumber && ["invoiced", "closed"].includes(record.status)) return { success: true };
        assertApprovedWorkOpen(record);
        await db.updateApprovedWork(input.id, { invoiceNumber: input.invoiceNumber, invoicedAt: record.invoicedAt ?? new Date(),
          invoiceStatus: input.invoiceStatus ?? "sent", status: "invoiced", ...(input.officeNotes ? { officeNotes: input.officeNotes } : {}) });
        return { success: true };
      }, { financialTracking: true })),

  linkWorkOrder: officeProcedure
    .input(z.object({
      id:          z.number().int().positive(),
      workOrderId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) =>
      withLockedApprovedWork(ctx, "approvedWork.linkWorkOrder", input.id, { workOrderId: input.workOrderId }, async record => {
        assertApprovedWorkOpen(record);
        if (record.workOrderId) throw new TRPCError({ code: "CONFLICT", message: "A work order is already linked to this Approved Work record." });
        const order = await db.getWorkOrderById(input.workOrderId);
        await db.updateApprovedWork(record.id, { workOrderId: order!.id, jobId: record.jobId ?? order!.jobId,
          siteId: record.siteId ?? order!.siteId, customerOrgId: record.customerOrgId ?? order!.customerOrgId });
        return { success: true };
      })),

  createWorkOrder: officeProcedure
    .input(z.object({
      id:             z.number().int().positive(),
      title:          z.string().min(1).max(255),
      priority:       z.enum(["low", "medium", "high", "urgent"]).optional(),
      estimatedHours: z.number().nonnegative().multipleOf(0.01).optional(),
      officeNotes:    z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      withLockedApprovedWork(ctx, "approvedWork.createWorkOrder", input.id, {}, async record => {
        assertApprovedWorkOpen(record);
        if (record.workOrderId) throw new TRPCError({ code: "CONFLICT", message: "A work order already exists for this Approved Work record." });
        if (!record.jobId || !record.siteId || !record.customerOrgId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A linked Job, Site and Customer are required to create a Work Order." });
        }
        const existing = await db.getWorkOrderByJob(record.jobId);
        if (existing) {
          if (existing.finalizedAt) throw new TRPCError({ code: "CONFLICT", message: "Work order is finalized. Reconcile its existing approval links instead of creating new execution links." });
          await assertApprovedWorkLinks({ ...record, workOrderId: existing.id }, record.companyId);
          await db.updateApprovedWork(record.id, { workOrderId: existing.id });
          return existing;
        }
        const wo = await db.createWorkOrder({ companyId: record.companyId, siteId: record.siteId, customerOrgId: record.customerOrgId,
          jobId: record.jobId, quoteId: record.quoteId ?? undefined, workOrderNumber: `WO-AW-${record.id}`,
          title: input.title, workType: record.type === "repair_order" ? "repair" : "inspection", status: "pending",
          priority: input.priority ?? "medium", estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : undefined,
          officeNotes: input.officeNotes ?? record.officeNotes ?? undefined,
          assignedTechnicianIds: (record.assignedTechnicianIds as number[] | null) ?? [], total: record.approvedAmount ?? "0" });
        await db.updateApprovedWork(record.id, { workOrderId: wo.id });
        await logActivity({ ctx: { user: { ...ctx.user, companyId: record.companyId } }, entityType: "approved_work", entityId: record.id, eventType: "linked",
          title: `Work order created: ${wo.workOrderNumber}`, relatedEntityType: "work_order", relatedEntityId: wo.id });
        return wo;
      })),

  createInvoice: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) =>
      withLockedApprovedWork(ctx, "approvedWork.createInvoice", input.id, {}, async record => {
        const existing = await db.getInvoiceByApprovedWork(record.id);
        if (existing) {
          if (existing.companyId !== record.companyId || record.invoiceNumber !== existing.invoiceNumber) {
            throw new TRPCError({ code: "CONFLICT", message: "Existing invoice tracking needs reconciliation" });
          }
          await assertInvoiceLinks(existing, record.companyId);
          return { invoiceId: existing.id, invoiceNumber: existing.invoiceNumber };
        }
        assertApprovedWorkOpen(record);
        if (record.invoiceNumber) {
          throw new TRPCError({ code: "CONFLICT", message: "An invoice already exists for this Approved Work record." });
        }
        if (record.approvedAmount == null || !/^\d+(?:\.\d{1,2})?$/.test(record.approvedAmount)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Record the approved amount before creating an invoice" });
        }
        const [customerOrg, settings] = await Promise.all([
          record.customerOrgId ? db.getCustomerOrgById(record.customerOrgId) : null, db.getCompanySettings(record.companyId),
        ]);
        const now = new Date(); const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + (settings.invoiceDueDays ?? 30));
        const inv = await db.createInvoice({ companyId: record.companyId,
          invoiceNumber: generateInvoiceNumber(settings.invoiceNumberPrefix ?? "INV", now), status: "draft",
          customerOrgId: record.customerOrgId, siteId: record.siteId, jobId: record.jobId,
          approvedWorkId: record.id, workOrderId: record.workOrderId, quoteId: record.quoteId,
          billToName: customerOrg?.name, billToEmail: customerOrg?.contactEmail, billToAddress: customerOrg?.address,
          invoiceDate: now, dueDate, taxRate: settings.gstRate,
          sageGlCode: settings.sageDefaultGlCode, sageDepartment: settings.sageDefaultDepartment,
          sageCustomerCode: settings.sageCustomerCodeDefault, createdById: ctx.user.id, internalNotes: record.officeNotes });
        // Bill exactly this immutable approval snapshot. A selected quote item
        // never expands into every quote line, and later source edits cannot
        // replace the approved amount or add tax a second time.
        await db.createInvoiceLineItem({ invoiceId: inv.id, description: record.approvedScope ?? `Approved work #${record.id}`,
          quantity: "1", unitPrice: record.approvedAmount, total: record.approvedAmount, taxable: false, sortOrder: 0 });
        await db.recalculateInvoiceTotals(inv.id);
        await db.updateApprovedWork(record.id, { invoiceNumber: inv.invoiceNumber, invoicedAt: now, invoiceStatus: "draft", status: "invoiced" });
        await logActivity({ ctx: { user: { ...ctx.user, companyId: record.companyId } }, entityType: "approved_work", entityId: record.id, eventType: "converted",
          title: `Invoice created: ${inv.invoiceNumber}`, relatedEntityType: "invoice", relatedEntityId: inv.id });
        return { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber };
      }, { financialTracking: true })),

  close: officeProcedure
    .input(z.object({
      id:          z.number().int().positive(),
      officeNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      withLockedApprovedWork(ctx, "approvedWork.close", input.id, {}, async record => {
        if (record.status === "closed") return { success: true };
        assertApprovedWorkOpen(record);
        await db.updateApprovedWork(record.id, { status: "closed", closedAt: new Date(), ...(input.officeNotes ? { officeNotes: input.officeNotes } : {}) });
        await logActivity({ ctx: { user: { ...ctx.user, companyId: record.companyId } }, entityType: "approved_work", entityId: record.id, eventType: "closed", title: "Approved work closed" });
        return { success: true };
      }, { financialTracking: true })),


});
