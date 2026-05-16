import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { APPROVED_WORK_STATUSES } from "../../drizzle/schema";
import { logActivity } from "../activityLogger";

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
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const records = await db.getApprovedWorkByCompany(
        input.companyId,
        input.status,
      );

      if (records.length === 0) return [];

      // Batch-enrich with site + customer org names
      const siteIds   = [...new Set(records.map(r => r.siteId).filter(Boolean) as number[])];
      const orgIds    = [...new Set(records.map(r => r.customerOrgId).filter(Boolean) as number[])];
      const woIds     = [...new Set(records.map(r => r.workOrderId).filter(Boolean) as number[])];
      const userIds   = [...new Set(records.flatMap(r => (r.assignedTechnicianIds as number[] | null) ?? []))];

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
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

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
        ? (await Promise.all(techIds.map(id => db.getUserById(id)))).filter(Boolean)
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
      approvedAmount:  z.number().nonnegative().optional(),
      approvedAt:      z.date().optional(),
      approvedByName:  z.string().max(255).optional(),
      approvedByEmail: z.string().email().max(320).optional(),
      approvalSource:  APPROVAL_SOURCE_ENUM.optional(),
      officeNotes:     z.string().max(5000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Prevent duplicate from same quote item
      if (input.quoteItemId) {
        const existing = await db.getApprovedWorkByQuoteItem(input.quoteItemId);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An Approved Work record already exists for this quote item.",
          });
        }
      }

      const record = await db.createApprovedWork({
        ...input,
        approvedAmount: input.approvedAmount != null ? String(input.approvedAmount) : undefined,
        status: "approved",
        createdById: ctx.user.id,
      });

      void logActivity({ ctx, entityType: "approved_work", entityId: record.id, eventType: "created",
        title: "Approved work record created" });
      return record;
    }),

  /**
   * Create an Approved Work record from an approved repair quote item.
   * Prevents duplicate creation from the same quote item.
   */
  createFromQuoteItem: officeProcedure
    .input(z.object({
      quoteId:     z.number().int().positive(),
      quoteItemId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Dedup check
      const existing = await db.getApprovedWorkByQuoteItem(input.quoteItemId);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An Approved Work record already exists for this quote item.",
        });
      }

      const item = await db.getRepairQuoteItemById(input.quoteItemId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item not found." });

      const quote = await db.getQuoteById(input.quoteId);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
      if (quote.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Must be an approved quote; declined items must not create approved work
      if (quote.status === "declined") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot create Approved Work from a declined quote.",
        });
      }
      if (quote.status === "pending" || quote.status === "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Quote must be approved before creating Approved Work.",
        });
      }

      const record = await db.createApprovedWork({
        companyId:      quote.companyId,
        customerOrgId:  quote.customerOrgId ?? undefined,
        siteId:         quote.siteId ?? undefined,
        quoteId:        input.quoteId,
        quoteItemId:    input.quoteItemId,
        type:           "repair_order",
        status:         "approved",
        // Snapshot the approved amount from the item — never recalculate later
        approvedAmount: item.total ?? undefined,
        approvedScope:  item.description ?? undefined,
        approvedAt:     quote.approvedAt ?? new Date(),
        approvalSource: "portal",
        createdById:    ctx.user.id,
      });

      void logActivity({ ctx, entityType: "approved_work", entityId: record.id, eventType: "created",
        title: "Approved work created from quote item",
        relatedEntityType: "repair_quote", relatedEntityId: input.quoteId });
      return record;
    }),

  /**
   * Update editable fields on an approved work record.
   */
  update: officeProcedure
    .input(z.object({
      id:              z.number().int().positive(),
      customerOrgId:   z.number().int().positive().optional().nullable(),
      siteId:          z.number().int().positive().optional().nullable(),
      jobId:           z.number().int().positive().optional().nullable(),
      deficiencyId:    z.number().int().positive().optional().nullable(),
      approvedScope:   z.string().max(5000).optional(),
      approvedAmount:  z.number().nonnegative().optional().nullable(),
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
    .mutation(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (record.status === "closed" || record.status === "cancelled") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Cannot edit a ${record.status} record.`,
        });
      }

      const { id, approvedAmount, ...rest } = input;
      await db.updateApprovedWork(id, {
        ...rest,
        ...(approvedAmount !== undefined
          ? { approvedAmount: approvedAmount != null ? String(approvedAmount) : null }
          : {}),
      });
      return { success: true };
    }),

  /**
   * Update the status of an approved work record.
   */
  updateStatus: officeProcedure
    .input(z.object({
      id:     z.number().int().positive(),
      status: STATUS_ENUM,
    }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const timestamps: Record<string, Date | null> = {};
      if (input.status === "in_progress" && !record.startedAt) {
        timestamps.startedAt = new Date();
      }
      if (input.status === "completed" && !record.completedAt) {
        timestamps.completedAt = new Date();
      }
      if (input.status === "closed" && !record.closedAt) {
        timestamps.closedAt = new Date();
      }

      await db.updateApprovedWork(input.id, { status: input.status, ...timestamps });
      void logActivity({ ctx, entityType: "approved_work", entityId: input.id, eventType: "status_changed",
        title: `Approved work status changed to ${input.status}`,
        oldValue: record.status, newValue: input.status });
      return { success: true };
    }),

  /**
   * Mark an approved work record as invoiced.
   * Captures invoice number, sets invoicedAt timestamp, and transitions status to "invoiced".
   * Blocked on closed/cancelled records.
   */
  markInvoiced: officeProcedure
    .input(z.object({
      id:            z.number().int().positive(),
      invoiceNumber: z.string().min(1).max(100),
      invoiceStatus: z.string().max(100).optional(),
      officeNotes:   z.string().max(5000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (record.status === "closed" || record.status === "cancelled") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Cannot invoice a ${record.status} record.`,
        });
      }

      await db.updateApprovedWork(input.id, {
        invoiceNumber: input.invoiceNumber,
        invoicedAt:    new Date(),
        invoiceStatus: input.invoiceStatus ?? "sent",
        status:        "invoiced",
        ...(input.officeNotes ? { officeNotes: input.officeNotes } : {}),
      });
      return { success: true };
    }),

  /**
   * Link an existing work order to this approved work record.
   * Prevents linking if a work order is already linked.
   */
  linkWorkOrder: officeProcedure
    .input(z.object({
      id:          z.number().int().positive(),
      workOrderId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (record.workOrderId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A work order is already linked to this Approved Work record.",
        });
      }

      const wo = await db.getWorkOrderById(input.workOrderId);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found." });
      if (wo.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.updateApprovedWork(input.id, { workOrderId: input.workOrderId });
      return { success: true };
    }),

  /**
   * Create a new work order from this approved work record.
   * Requires the approved work to have a linked jobId (work_orders.jobId is NOT NULL).
   * Prevents duplicate work orders from the same approved work record.
   */
  createWorkOrder: officeProcedure
    .input(z.object({
      id:             z.number().int().positive(),
      title:          z.string().min(1).max(255),
      priority:       z.enum(["low", "medium", "high", "urgent"]).optional(),
      estimatedHours: z.number().nonnegative().optional(),
      officeNotes:    z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Dedup: one work order per approved work record
      if (record.workOrderId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A work order already exists for this Approved Work record.",
        });
      }

      if (!record.jobId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A linked Job is required to create a Work Order. Link a Job to this Approved Work first.",
        });
      }

      if (!record.siteId || !record.customerOrgId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A Site and Customer are required to create a Work Order.",
        });
      }

      const wo = await db.createWorkOrder({
        companyId:      record.companyId,
        siteId:         record.siteId,
        customerOrgId:  record.customerOrgId,
        jobId:          record.jobId,
        quoteId:        record.quoteId ?? undefined,
        workOrderNumber: `WO-${Date.now().toString(36).toUpperCase()}`,
        title:          input.title,
        workType:       record.type === "repair_order" ? "repair" : "inspection",
        status:         "pending",
        priority:       input.priority ?? "medium",
        estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : undefined,
        officeNotes:    input.officeNotes ?? record.officeNotes ?? undefined,
        assignedTechnicianIds: (record.assignedTechnicianIds as number[] | null) ?? [],
        total:          record.approvedAmount ?? "0",
      });

      await db.updateApprovedWork(record.id, { workOrderId: wo.id });
      void logActivity({ ctx, entityType: "work_order", entityId: wo.id, eventType: "created",
        title: `Work order created: ${wo.workOrderNumber}`,
        relatedEntityType: "approved_work", relatedEntityId: record.id });
      void logActivity({ ctx, entityType: "approved_work", entityId: record.id, eventType: "linked",
        title: `Work order created: ${wo.workOrderNumber}`,
        relatedEntityType: "work_order", relatedEntityId: wo.id });
      return wo;
    }),

  /**
   * Create an Invoice from a completed Approved Work record.
   * Snapshots line items from the linked quote (preferred) or work order.
   * Prevents duplicate invoices from the same Approved Work.
   */
  createInvoice: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (record.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot invoice a cancelled record." });
      }

      if (record.invoiceNumber) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This Approved Work record already has an invoice number recorded. Use the existing invoice or void it before creating a new one.",
        });
      }

      const existing = await db.getInvoiceByApprovedWork(input.id);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invoice already exists for this Approved Work record.",
        });
      }

      const [customerOrg, settings] = await Promise.all([
        record.customerOrgId ? db.getCustomerOrgById(record.customerOrgId) : Promise.resolve(null),
        db.getCompanySettings(record.companyId),
      ]);

      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + (settings.invoiceDueDays ?? 30));

      const invPrefix = settings.invoiceNumberPrefix ?? "INV";
      const invSeq = Date.now().toString(36).toUpperCase().slice(-4);
      const invoiceNumber = `${invPrefix}-${now.getFullYear()}-${invSeq}`;

      const inv = await db.createInvoice({
        companyId: record.companyId,
        invoiceNumber,
        status: "draft",
        customerOrgId: record.customerOrgId ?? undefined,
        siteId: record.siteId ?? undefined,
        jobId: record.jobId ?? undefined,
        approvedWorkId: record.id,
        workOrderId: record.workOrderId ?? undefined,
        quoteId: record.quoteId ?? undefined,
        billToName: customerOrg?.name ?? undefined,
        billToEmail: customerOrg?.contactEmail ?? undefined,
        billToAddress: customerOrg?.address ?? undefined,
        invoiceDate: now,
        dueDate,
        taxRate: settings.gstRate as any,
        sageGlCode: settings.sageDefaultGlCode ?? undefined,
        sageDepartment: settings.sageDefaultDepartment ?? undefined,
        sageCustomerCode: settings.sageCustomerCodeDefault ?? undefined,
        createdById: ctx.user.id,
        internalNotes: record.officeNotes ?? undefined,
      });

      // Snapshot line items — prefer repair quote items, then WO line items, then AW summary
      let linesSaved = 0;
      if (record.quoteId) {
        const quoteItems = await db.getRepairQuoteItemsByQuote(record.quoteId);
        for (let i = 0; i < quoteItems.length; i++) {
          const qi = quoteItems[i];
          const lineTotal = parseFloat(String(qi.total ?? "0"));
          await db.createInvoiceLineItem({
            invoiceId: inv.id,
            description: qi.description ?? "Repair item",
            quantity: "1" as any,
            unitPrice: String(lineTotal) as any,
            total: String(lineTotal) as any,
            taxable: false,
            sortOrder: i,
          });
          linesSaved++;
        }
      } else if (record.workOrderId) {
        const wo = await db.getWorkOrderById(record.workOrderId);
        const woLines = (wo?.lineItems as Array<{ description: string; quantity: number; unitPrice: number; total?: number }> | null) ?? [];
        for (let i = 0; i < woLines.length; i++) {
          const wl = woLines[i];
          const lineTotal = wl.total ?? wl.quantity * wl.unitPrice;
          await db.createInvoiceLineItem({
            invoiceId: inv.id,
            description: wl.description,
            quantity: String(wl.quantity) as any,
            unitPrice: String(wl.unitPrice) as any,
            total: String(lineTotal) as any,
            taxable: false,
            sortOrder: i,
          });
          linesSaved++;
        }
      }

      if (linesSaved === 0) {
        const amount = parseFloat(String(record.approvedAmount ?? "0"));
        await db.createInvoiceLineItem({
          invoiceId: inv.id,
          description: record.approvedScope ?? "Repair/Service",
          quantity: "1" as any,
          unitPrice: String(amount) as any,
          total: String(amount) as any,
          taxable: false,
          sortOrder: 0,
        });
      }

      await db.recalculateInvoiceTotals(inv.id);

      await db.updateApprovedWork(record.id, {
        invoiceNumber: inv.invoiceNumber,
        invoicedAt: now,
        invoiceStatus: "draft",
        status: "invoiced",
      });

      void logActivity({ ctx, entityType: "approved_work", entityId: record.id, eventType: "converted",
        title: `Invoice created: ${inv.invoiceNumber}`,
        relatedEntityType: "invoice", relatedEntityId: inv.id });
      return { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber };
    }),

  /**
   * Close out an approved work record.
   */
  close: officeProcedure
    .input(z.object({
      id:          z.number().int().positive(),
      officeNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (record.status === "closed") {
        throw new TRPCError({ code: "CONFLICT", message: "Already closed." });
      }

      await db.updateApprovedWork(input.id, {
        status: "closed",
        closedAt: new Date(),
        ...(input.officeNotes ? { officeNotes: input.officeNotes } : {}),
      });
      void logActivity({ ctx, entityType: "approved_work", entityId: input.id, eventType: "closed",
        title: "Approved work closed" });
      return { success: true };
    }),
});
