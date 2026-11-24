import { toPublicUser } from "../publicUser";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { router, protectedProcedure, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { getQuoteForCompany, assertWorkOrderCompany } from "../tenantGuards";
import {
  APPROVED_WORK_STATUSES, activityEvents, approvedWork as approvedWorkTable,
  invoices, quotes, repairQuoteItems,
} from "../../drizzle/schema";
import { exactInvoiceCents, exactInvoiceMoney, QUOTE_ITEM_INVOICE_EVENT } from "../confirmedInvoiceTax";
import { assertInvoiceLinks } from "../invoiceLinks";
import {
  approvalMoneyCents, BILLING_APPROVAL_EVENT, billingRejected,
  manualBillingPlan, quoteItemBillingPlan, requireApprovalEvidence,
} from "../approvedBillingEvidence";
import { logActivity } from "../activityLogger";
import { generateInvoiceNumber } from "../invoiceNumber.js";

const STATUS_ENUM = z.enum(APPROVED_WORK_STATUSES);

const APPROVAL_SOURCE_ENUM = z.enum([
  "email", "phone", "signed_pdf", "in_person", "portal", "internal",
]);

const TYPE_ENUM = z.enum(["job_order", "repair_order"]);

const APPROVED_MONEY_INPUT = z.number().nonnegative().refine(
  (value) => approvalMoneyCents(String(value)) != null,
  "Use a valid amount in exact cents.",
);
type BillingTx = Parameters<Parameters<typeof db.withAudit>[2]>[0];

async function lockedQuoteItem(tx: BillingTx, companyId: number, quoteId: number, itemId: number) {
  const [quote] = await tx.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId))).for("update");
  if (!quote) billingRejected("The approved repair quote could not be verified for this company.");
  const [item] = await tx.select().from(repairQuoteItems)
    .where(and(eq(repairQuoteItems.quoteId, quoteId), eq(repairQuoteItems.id, itemId))).for("update");
  if (!item) billingRejected("The selected approved item could not be verified on this repair quote.");
  return { quote, item };
}

async function storeBillingEvidence(
  tx: BillingTx, companyId: number, actorUserId: number, approvalId: number,
  prepared: ReturnType<typeof manualBillingPlan>,
) {
  // Only the named server billing-authority producers write this event.
  // It is required for conversion, so failure rolls back the approval itself.
  await tx.insert(activityEvents).values({
    companyId, actorUserId, entityType: "approved_work", entityId: approvalId,
    eventType: BILLING_APPROVAL_EVENT, title: "Verified billing approval recorded",
    metadata: prepared.evidence,
  });
}


/** Caller holds the same-tenant quote and literal item locks for the whole transaction. */
export async function createVerifiedQuoteItemWork(
  tx: BillingTx, companyId: number, actorUserId: number,
  quote: typeof quotes.$inferSelect, item: typeof repairQuoteItems.$inferSelect,
  approvalSource: z.infer<typeof APPROVAL_SOURCE_ENUM>,
) {
  const [existing] = await tx.select({id: approvedWorkTable.id}).from(approvedWorkTable)
    .where(and(eq(approvedWorkTable.companyId, companyId),
      eq(approvedWorkTable.quoteId, quote.id), eq(approvedWorkTable.quoteItemId, item.id)))
    .limit(1).for("update");
  if (existing) return null;
  const created = await db.createApprovedWork({
    companyId, customerOrgId: quote.customerOrgId, siteId: quote.siteId, jobId: quote.jobId,
    deficiencyId: item.deficiencyId ?? undefined, quoteId: quote.id, quoteItemId: item.id,
    type: "repair_order", status: "approved", approvedAmount: item.total,
    approvedScope: item.description, approvedAt: quote.approvedAt ?? new Date(),
    approvalSource, createdById: actorUserId,
  });
  const prepared = quoteItemBillingPlan(created, quote, item);
  await assertInvoiceLinks(created, companyId);
  await storeBillingEvidence(tx, companyId, actorUserId, created.id, prepared);
  return created;
}

/** Approved work linked to a finalized job is part of its immutable record — block further changes. */
async function assertApprovedWorkJobNotFinalized(jobId: number | null | undefined) {
  if (jobId != null) await db.assertJobNotFinalized(jobId);
}

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
        input.status
      );

      if (records.length === 0) return [];

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
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const record = await db.getApprovedWorkById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
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
      approvedAmount:  APPROVED_MONEY_INPUT.optional(),
      confirmedBillingBasis: z.literal("CAD_GROSS").optional(),
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
      await assertApprovedWorkJobNotFinalized(input.jobId);

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

      const { confirmedBillingBasis, ...fields } = input;
      if (confirmedBillingBasis && (
        fields.quoteId != null || fields.quoteItemId != null || fields.deficiencyId != null ||
        !fields.approvedScope?.trim() || !(Number(fields.approvedAmount) > 0)
      )) billingRejected("Confirm gross CAD billing only for a manual approval with an approved scope and positive total.");
      const record = await db.withAudit(ctx, "approvedWork.create", async tx => {
        const created = await db.createApprovedWork({
          ...fields,
          approvedAmount: input.approvedAmount != null ? String(input.approvedAmount) : undefined,
          status: "approved",
          createdById: ctx.user.id,
        });
        const cents = approvalMoneyCents(created.approvedAmount);
        if (confirmedBillingBasis === "CAD_GROSS" && cents != null && cents > BigInt(0)) {
          await assertInvoiceLinks(created, created.companyId);
          await storeBillingEvidence(tx, created.companyId, ctx.user.id, created.id, manualBillingPlan(created));
        }
        return created;
      });

      void logActivity({ ctx, entityType: "approved_work", entityId: record.id, eventType: "created",
        title: "Approved work record created", });
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
      const companyId = ctx.user.companyId;
      if (!companyId) billingRejected("A company billing scope is required.");
      const record = await db.withAudit(ctx, "approvedWork.createFromQuoteItem", async tx => {
        const { quote, item } = await lockedQuoteItem(tx, companyId, input.quoteId, input.quoteItemId);
        const created = await createVerifiedQuoteItemWork(tx, companyId, ctx.user.id, quote, item, "internal");
        if (!created) throw new TRPCError({ code: "CONFLICT", message: "An Approved Work record already exists for this quote item." });
        return created;
      });

      void logActivity({ ctx, entityType: "approved_work", entityId: record.id, eventType: "created",
        title: "Approved work created from quote item",
        relatedEntityType: "repair_quote", relatedEntityId: input.quoteId, });
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
      approvedAmount:  APPROVED_MONEY_INPUT.optional().nullable(),
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
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (record.status === "closed" || record.status === "cancelled") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Cannot edit a ${record.status} record.`,
        });
      }
      await assertApprovedWorkJobNotFinalized(record.jobId);
      await assertApprovedWorkJobNotFinalized(input.jobId);

      const { id, approvedAmount, ...rest } = input;
      await db.updateApprovedWork(id, {
        ...rest,
        ...(approvedAmount !== undefined
          ? { approvedAmount: approvedAmount != null ? String(approvedAmount) : null, }
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
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
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

      await db.updateApprovedWork(input.id, { status: input.status, ...timestamps, });
      void logActivity({ ctx, entityType: "approved_work", entityId: input.id, eventType: "status_changed",
        title: `Approved work status changed to ${input.status}`,
        oldValue: record.status, newValue: input.status, });
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
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
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
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (record.workOrderId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A work order is already linked to this Approved Work record.",
        });
      }

      await assertWorkOrderCompany(input.workOrderId, ctx.user.companyId!); // authorize the linked work order

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
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
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
      await db.assertJobNotFinalized(record.jobId);

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
        relatedEntityType: "approved_work", relatedEntityId: record.id, });
      void logActivity({ ctx, entityType: "approved_work", entityId: record.id, eventType: "linked",
        title: `Work order created: ${wo.workOrderNumber}`,
        relatedEntityType: "work_order", relatedEntityId: wo.id, });
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
      const companyId = ctx.user.companyId;
      if (!companyId) billingRejected("A company billing scope is required.");
      // Discovery does not authorize billing. Select the same quote → item →
      // approval lock order as the producer, then re-read under lock.
      const discovery = await db.getApprovedWorkById(input.id);
      if (!discovery || discovery.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await db.withAudit(ctx, "approvedWork.createInvoice", async tx => {
        const quoteContext = discovery.quoteId != null && discovery.quoteItemId != null && discovery.workOrderId == null
          ? await lockedQuoteItem(tx, companyId, discovery.quoteId, discovery.quoteItemId) : null;
        const [record] = await tx.select().from(approvedWorkTable)
          .where(and(eq(approvedWorkTable.id, input.id), eq(approvedWorkTable.companyId, companyId))).for("update");
        if (!record) throw new TRPCError({ code: "NOT_FOUND" });
        if (record.quoteId !== discovery.quoteId || record.quoteItemId !== discovery.quoteItemId ||
            record.workOrderId !== discovery.workOrderId)
          billingRejected("The billing source changed during review. Reopen the approval before invoicing.");

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

        if (!["approved", "completed", "report_pending"].includes(record.status))
          billingRejected("This work is not in an invoice-ready approval status.");
        if (record.workOrderId != null)
          billingRejected("Work-order billing needs a reviewed approved scope and tax basis. No invoice was created.");
        if (record.quoteId != null && record.quoteItemId == null)
          billingRejected("This full-quote approval has no verified approved line set. Review the scope before invoicing.");
        if (record.quoteId == null && record.quoteItemId != null)
          billingRejected("The selected quote item has no verified parent quote. No invoice was created.");

        let prepared;
        if (record.quoteId != null && record.quoteItemId != null) {
          if (!quoteContext) billingRejected("The quoted billing source could not be locked.");
          const { quote, item } = quoteContext;
          prepared = quoteItemBillingPlan(record, quote, item);
          const [overlap] = await tx.select({id: approvedWorkTable.id}).from(approvedWorkTable)
            .where(and(eq(approvedWorkTable.companyId, companyId), eq(approvedWorkTable.quoteId, quote.id),
              ne(approvedWorkTable.id, record.id),
              or(eq(approvedWorkTable.quoteItemId, item.id), isNull(approvedWorkTable.quoteItemId))))
            .limit(1).for("update");
          if (overlap) billingRejected("Overlapping quote approvals must be reconciled before invoicing.");
          // A legacy or generic quote invoice may have billed every quote item.
          // Only a prior invoice with the dedicated atomic conversion receipt and
          // a distinct, stable same-quote item may coexist with this one.
          const prior = await tx.select({
            invoiceId: invoices.id, invoiceWorkId: invoices.approvedWorkId,
            workId: approvedWorkTable.id, workQuoteId: approvedWorkTable.quoteId,
            workItemId: approvedWorkTable.quoteItemId,
          }).from(invoices)
            .leftJoin(approvedWorkTable, and(eq(approvedWorkTable.id, invoices.approvedWorkId),
              eq(approvedWorkTable.companyId, companyId)))
            .where(and(eq(invoices.companyId, companyId), eq(invoices.quoteId, quote.id)))
            .limit(251).for("update");
          if (prior.length > 250) billingRejected("Review this quote’s extensive prior invoice activity before billing.");
          const usedItems = new Set<number>();
          for (const row of prior) {
            if (row.workId == null || row.workId !== row.invoiceWorkId || row.workQuoteId !== quote.id ||
                row.workItemId == null || row.workItemId === item.id || usedItems.has(row.workItemId))
              billingRejected("Overlapping or unverified prior quote billing must be reconciled.");
            const marks = await tx.select({ metadata: activityEvents.metadata }).from(activityEvents)
              .where(and(eq(activityEvents.companyId, companyId), eq(activityEvents.entityType, "invoice"),
                eq(activityEvents.entityId, row.invoiceId), eq(activityEvents.eventType, QUOTE_ITEM_INVOICE_EVENT),
                eq(activityEvents.relatedEntityType, "approved_work"), eq(activityEvents.relatedEntityId, row.workId)))
              .limit(2).for("update");
            const receipt = marks[0]?.metadata as { quoteId?: number; quoteItemId?: number } | undefined;
            if (marks.length !== 1 || receipt?.quoteId !== quote.id || receipt.quoteItemId !== row.workItemId)
              billingRejected("A prior quote invoice has no exact billing-scope receipt. Reconcile it before billing.");
            usedItems.add(row.workItemId);
          }
        } else {
          prepared = manualBillingPlan(record);
        }

        const authority = await tx.select({ metadata: activityEvents.metadata, actorUserId: activityEvents.actorUserId })
          .from(activityEvents)
          .where(and(eq(activityEvents.companyId, companyId), eq(activityEvents.entityType, "approved_work"),
            eq(activityEvents.entityId, record.id), eq(activityEvents.eventType, BILLING_APPROVAL_EVENT)))
          .limit(2).for("update");
        if (authority.length !== 1 || authority[0].actorUserId !== record.createdById)
          billingRejected("A single verified billing approval could not be found. Confirm a new approval before invoicing.");
        requireApprovalEvidence(authority[0].metadata, prepared);
        await assertInvoiceLinks(record, companyId);

        const [customerOrg, settings] = await Promise.all([
          record.customerOrgId ? db.getCustomerOrgById(record.customerOrgId) : Promise.resolve(null),
          db.getCompanySettings(record.companyId),
        ]);

        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + (settings.invoiceDueDays ?? 30));

        const invPrefix = settings.invoiceNumberPrefix ?? "INV";
        const invoiceNumber = generateInvoiceNumber(invPrefix, now);

        const stableTax = prepared.split && prepared.quoteId != null && prepared.quoteItemId != null
          ? {
            version: 1 as const, currency: "CAD" as const, kind: "repair_quote_item" as const,
            quoteId: prepared.quoteId, quoteItemId: prepared.quoteItemId, approvedWorkId: record.id,
            approvalFingerprint: prepared.evidence.fingerprint, description: prepared.description,
            ...prepared.split, gross: prepared.gross,
          } : null;
        if (prepared.kind === "quote_item" && !stableTax)
          billingRejected("A quoted invoice must preserve the source tax split.");
        const net = stableTax?.subtotal ?? prepared.gross;
        const taxAmount = stableTax
          ? exactInvoiceMoney(exactInvoiceCents(stableTax.gst)! + exactInvoiceCents(stableTax.pst)!) : "0.00";
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
          taxRate: "0.0000",
          subtotal: net,
          taxAmount,
          confirmedTax: stableTax,
          total: prepared.gross,
          amountPaid: "0.00",
          balanceDue: prepared.gross,
          sageGlCode: settings.sageDefaultGlCode ?? undefined,
          sageDepartment: settings.sageDefaultDepartment ?? undefined,
          sageCustomerCode: settings.sageCustomerCodeDefault ?? undefined,
          createdById: ctx.user.id,
          internalNotes: record.officeNotes ?? undefined,
        });

        // One gross billing line per complete approved scope/quote item.
        // This is not a unit-price recomputation of the quote's material count.
        await db.createInvoiceLineItem({
          invoiceId: inv.id,
          description: prepared.description,
          quantity: "1.00",
          unitPrice: net,
          total: net,
          taxable: false,
          sortOrder: 0,
        });

        if (prepared.kind === "quote_item") {
          await tx.insert(activityEvents).values({
            companyId, actorUserId: ctx.user.id, entityType: "invoice", entityId: inv.id,
            relatedEntityType: "approved_work", relatedEntityId: record.id,
            eventType: QUOTE_ITEM_INVOICE_EVENT, title: "Verified quote-item invoice scope recorded",
            metadata: { ...prepared.evidence, confirmedTaxV1: stableTax },
          });
        }

        await db.updateApprovedWork(record.id, {
          invoiceNumber: inv.invoiceNumber,
          invoicedAt: now,
          invoiceStatus: "draft",
          status: "invoiced",
        });

        return { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber };
      });
      void logActivity({ ctx, entityType: "approved_work", entityId: input.id, eventType: "converted",
        title: `Invoice created: ${result.invoiceNumber}`,
        relatedEntityType: "invoice", relatedEntityId: result.invoiceId, });
      return result;
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
      if (record.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
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
        title: "Approved work closed", });
      return { success: true };
    }),
});
