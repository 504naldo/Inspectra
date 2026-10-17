/**
 * repairQuoteRouter.ts
 *
 * tRPC procedures for the Repair Quote Sheet workflow.
 *
 * Pricing rules (BC fire protection):
 *   partTotal      = quantity × partUnitPrice (snapshot — never recalculates from live catalog)
 *   labourTotal    = techHours × techLabourRate + fitterHours × fitterLabourRate
 *   lineSubtotal   = partTotal + labourTotal + fuelCharge + backflowReportFee
 *   GST (5%)       = (partTotal + labourTotal + backflowReportFee) × 0.05
 *   PST (7%)       = partTotal × 0.07
 *   lineTotal      = lineSubtotal + GST + PST
 *
 * Quote-level:
 *   subtotal       = Σ lineSubtotal
 *   gst            = Σ item.gst
 *   pst            = Σ item.pst
 *   total          = subtotal + gst + pst
 *
 * Immutability: finalized pricing and scope cannot change. Delivery and
 * customer-approval status can still advance after finalization.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc.js";
import type { TrpcContext } from "../_core/context.js";
import { calculateRepairItem, calculateRepairQuoteTotals, isRepairDecimal, assertRecordedRepairTotal } from "../repairQuotePricing.js";
import * as db from "../db.js";
import { getJobForCompany, getQuoteForCompany, assertPartsCatalogItemCompany, } from "../tenantGuards.js";
import { ENV } from "../_core/env.js";
import { storagePut } from "../storage.js";
import { generateRepairQuotePDF } from "../quotePdfGenerator.js";
import { buildCustomerSafeRepairQuoteData } from "../customerSafeReport.js";
import { logActivity } from "../activityLogger.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { jobs, quotes, repairQuoteItems, workOrders, approvedWork, type Quote, type RepairQuoteItem } from "../../drizzle/schema.js";
import { sendEmailOnce, EmailProviderRejected } from "../emailOutbox.js";
import { withAuthorizedRepairQuoteLifecycle, withLockedRepairQuoteLifecycle, assertRepairQuoteApprovalMutable, assertRepairQuoteDeliveryTransition, type RepairQuoteLifecycle } from "../repairQuoteLifecycle.js";
import { assertRepairQuoteEditable, assertRepairQuoteFinalized, assertRepairQuoteItemLinks, withLockedRepairQuote } from "../repairQuoteIntegrity.js";

// ─── Pricing helpers ──────────────────────────────────────────────────────────

const calcItemTotals = calculateRepairItem;
const repairDecimal = (maximum = 99999999.99) => z.number().nonnegative().max(maximum)
  .refine(isRepairDecimal, "Use at most two decimal places");

function toNum(v: unknown): number {
  return parseFloat(String(v ?? "0")) || 0;
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

// Keep defaults out of the patch schema: Zod 4 applies an inner default even
// when .partial() makes the field optional, which would zero omitted prices.
const repairItemFieldsSchema = z.object({
  deficiencyId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1).max(500),
  repairNotes: z.string().max(2000).optional().nullable(),
  systemType: z.enum(["FIRE_ALARM", "SMOKE_ALARM", "FIRE_EXTINGUISHER", "EMERGENCY_LIGHTING", "SPRINKLER", "BACKFLOW", "OTHER",]).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  quantity: z.number().int().min(1).max(2147483647),
  // Part (optional — some items are labour-only)
  partId: z.number().int().positive().optional().nullable(),
  partDescription: z.string().max(255).optional().nullable(),
  partUnitPrice: repairDecimal(),
  // Labour
  techHours: repairDecimal(9999.99),
  fitterHours: repairDecimal(9999.99),
  techLabourRate: repairDecimal(999999.99),
  fitterLabourRate: repairDecimal(999999.99),
  // Per-item fees
  fuelCharge: repairDecimal(999999.99),
  backflowReportFee: repairDecimal(999999.99),
  sortOrder: z.number().int(),
});
const repairItemInputSchema = repairItemFieldsSchema.extend({
  quantity: repairItemFieldsSchema.shape.quantity.default(1),
  partUnitPrice: repairItemFieldsSchema.shape.partUnitPrice.default(0),
  techHours: repairItemFieldsSchema.shape.techHours.default(0),
  fitterHours: repairItemFieldsSchema.shape.fitterHours.default(0),
  techLabourRate: repairItemFieldsSchema.shape.techLabourRate.default(0),
  fitterLabourRate: repairItemFieldsSchema.shape.fitterLabourRate.default(0),
  fuelCharge: repairItemFieldsSchema.shape.fuelCharge.default(0),
  backflowReportFee: repairItemFieldsSchema.shape.backflowReportFee.default(0),
  sortOrder: repairItemFieldsSchema.shape.sortOrder.default(0),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const repairQuoteRouter = router({

  // ── Parts catalog ───────────────────────────────────────────────────────────

  listParts: officeProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      return db.getPartsCatalogByCompany(ctx.user.companyId!, input.includeInactive);
    }),

  createPart: officeProcedure
    .input(z.object({
      category: z.string().min(1).max(100),
      productName: z.string().min(1).max(255),
      sku: z.string().max(100).optional().nullable(),
      unitPrice: repairDecimal(),
      defaultLabourHours: repairDecimal(999.99).default(0),
      taxableGst: z.boolean().default(true),
      taxablePst: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.createPartsCatalogItem({
        companyId: ctx.user.companyId!,
        category: input.category,
        productName: input.productName,
        sku: input.sku ?? null,
        unitPrice: String(input.unitPrice),
        defaultLabourHours: String(input.defaultLabourHours),
        taxableGst: input.taxableGst ? 1 : 0,
        taxablePst: input.taxablePst ? 1 : 0,
        isActive: true,
      });
      return item;
    }),

  updatePart: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      category: z.string().min(1).max(100).optional(),
      productName: z.string().min(1).max(255).optional(),
      sku: z.string().max(100).optional().nullable(),
      unitPrice: repairDecimal().optional(),
      defaultLabourHours: repairDecimal(999.99).optional(),
      taxableGst: z.boolean().optional(),
      taxablePst: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const part = await assertPartsCatalogItemCompany(input.id, ctx.user.companyId!);

      const { id, unitPrice, defaultLabourHours, taxableGst, taxablePst, ...rest } = input;
      await db.updatePartsCatalogItem(id, {
        ...rest,
        ...(unitPrice !== undefined ? { unitPrice: String(unitPrice) } : {}),
        ...(defaultLabourHours !== undefined ? { defaultLabourHours: String(defaultLabourHours) } : {}),
        ...(taxableGst !== undefined ? { taxableGst: taxableGst ? 1 : 0 } : {}),
        ...(taxablePst !== undefined ? { taxablePst: taxablePst ? 1 : 0 } : {}),
      });
      return { success: true };
    }),

  // ── Repair Quotes ────────────────────────────────────────────────────────────

  createRepairQuote: officeProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
      deficiencyIds: z.array(z.number().int().positive()).optional(),
      techLabourRate: repairDecimal(999999.99).default(75),
      fitterLabourRate: repairDecimal(999999.99).default(65),
      notes: z.string().max(2000).optional().nullable(),
      terms: z.string().max(2000).optional().nullable(),
      validDays: z.number().int().min(1).max(365).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      await getJobForCompany(input.jobId, ctx.user.companyId!);
      return db.withAudit(ctx, "repairQuote.createRepairQuote", async tx => {
      await tx.select().from(jobs).where(eq(jobs.id, input.jobId)).for("update");
      // Keep the new parent and every child invisible until the whole quote is
      // committed, so finalization cannot interleave with pre-population.
      const job = await getJobForCompany(input.jobId, ctx.user.companyId!);
      const settings = await db.getCompanySettings(job.companyId);

      const rqPrefix = settings.repairQuoteNumberPrefix ?? "RQ";
      const year = new Date().getFullYear();
      const existing = await db.getQuotesByCompany(job.companyId);
      const repairCount = existing.filter((q: any) => q.quoteType === "repair").length;
      const quoteNumber = `${rqPrefix}-${year}-${String(repairCount + 1).padStart(3, "0")}`;

      const effectiveValidDays = input.validDays ?? settings.quoteValidityDays ?? 30;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + effectiveValidDays);

      const quote = await db.createQuote({
        jobId: input.jobId,
        siteId: job.siteId,
        customerOrgId: job.customerOrgId,
        companyId: job.companyId,
        lineItems: [],
        total: "0",
        notes: input.notes ?? null,
        status: "draft",
        quoteType: "repair",
        quoteNumber,
        techLabourRate: String(input.techLabourRate),
        fitterLabourRate: String(input.fitterLabourRate),
        subtotal: "0",
        gst: "0",
        pst: "0",
        validUntil: validUntil.toISOString().split("T")[0],
        createdById: ctx.user.id,
      } as any);

      // Pre-populate items from deficiencies if provided
      if (input.deficiencyIds?.length) {
        const defs = await Promise.all(input.deficiencyIds.map(id => db.getDeficiencyById(id)));
        if (defs.some(deficiency => !deficiency || deficiency.jobId !== input.jobId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected deficiency must belong to this quote's job." });
        }
        const valid = defs.filter((d): d is NonNullable<typeof d> => !!d && d.jobId === input.jobId);
        for (let i = 0; i < valid.length; i++) {
          const d = valid[i];
          const initial = calcItemTotals({
            quantity: 1, partUnitPrice: 0, techHours: 0, fitterHours: 0,
            techLabourRate: input.techLabourRate, fitterLabourRate: input.fitterLabourRate,
            fuelCharge: toNum(settings.defaultFuelCharge), backflowReportFee: 0,
          });
          await db.createRepairQuoteItem({
            quoteId: quote.id,
            deficiencyId: d.id,
            description: d.title,
            repairNotes: d.correctiveAction ?? null,
            systemType: (d.systemCategory as any) ?? null,
            location: null,
            quantity: 1,
            partId: null,
            partDescription: null,
            partUnitPrice: "0",
            partTotal: String(initial.partTotal),
            techHours: "0",
            fitterHours: "0",
            techLabourRate: String(input.techLabourRate),
            fitterLabourRate: String(input.fitterLabourRate),
            labourTotal: String(initial.labourTotal),
            fuelCharge: String(settings.defaultFuelCharge ?? "0"),
            backflowReportFee: "0",
            gst: String(initial.gst),
            pst: String(initial.pst),
            total: String(initial.total),
            sortOrder: i,
          } as any);
        }
      }

      await _recalcQuoteTotals(quote.id);
      await logActivity({ ctx, entityType: "repair_quote", entityId: quote.id, eventType: "created",
        title: `Repair quote created: ${quoteNumber}`,
        relatedEntityType: "job", relatedEntityId: input.jobId, });
      return { quoteId: quote.id, quoteNumber };
      });
    }),

  getRepairQuote: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const quote = await getQuoteForCompany(input.id, ctx.user.companyId!);

      const [items, job, site, customer, company] = await Promise.all([
        db.getRepairQuoteItemsByQuote(input.id),
        db.getJobById(quote.jobId),
        db.getSiteById(quote.siteId),
        db.getCustomerOrgById(quote.customerOrgId),
        db.getCompanyById(quote.companyId),
      ]);

      return { quote, items, job, site, customer, company };
    }),

  listByJob: officeProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await getJobForCompany(input.jobId, ctx.user.companyId!); // authorize job access
      const quotes = await db.getQuotesByJob(input.jobId);
      return quotes.filter((q: any) => q.quoteType === "repair");
    }),

  listByCompany: officeProcedure.query(async ({ ctx }) => {
    const quotes = await db.getQuotesByCompany(ctx.user.companyId!);
    return quotes.filter((q: any) => q.quoteType === "repair");
  }),

  updateRepairQuote: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      notes: z.string().max(2000).optional().nullable(),
      terms: z.string().max(2000).optional().nullable(),
      techLabourRate: repairDecimal(999999.99).optional(),
      fitterLabourRate: repairDecimal(999999.99).optional(),
      validDays: z.number().int().min(1).max(365).optional(),
    }))
    .mutation(async ({ ctx, input }) =>
      withLockedRepairQuote(ctx, "repairQuote.updateRepairQuote", input.id, ctx.user.companyId!, async quote => {
      assertRepairQuoteEditable(quote);

      const validUntil = input.validDays
        ? (() => { const d = new Date(); d.setDate(d.getDate() + input.validDays!); return d.toISOString().split("T")[0]; })()
        : undefined;

      await db.updateQuote(input.id, {
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.techLabourRate !== undefined ? { techLabourRate: String(input.techLabourRate) } : {}),
        ...(input.fitterLabourRate !== undefined ? { fitterLabourRate: String(input.fitterLabourRate) } : {}),
        ...(validUntil ? { validUntil } : {}),
      } as any);

      return { success: true };
    })),

  // ── Quote Items ──────────────────────────────────────────────────────────────

  addItem: officeProcedure
    .input(z.object({ quoteId: z.number().int().positive() }).merge(repairItemInputSchema))
    .mutation(async ({ ctx, input }) =>
      withLockedRepairQuote(ctx, "repairQuote.addItem", input.quoteId, ctx.user.companyId!, async quote => {
      assertRepairQuoteEditable(quote);
      const part = await assertRepairQuoteItemLinks(quote, input);

      // Snapshot part price if partId given
      let partDescription = input.partDescription ?? null;
      let partUnitPrice = input.partUnitPrice;
      if (part) {
        partDescription = partDescription ?? part.productName;
        if (partUnitPrice === 0) partUnitPrice = toNum(part.unitPrice);
      }

      // Inherit labour rates from quote if not overridden
      const techLabourRate = input.techLabourRate || toNum((quote as any).techLabourRate);
      const fitterLabourRate = input.fitterLabourRate || toNum((quote as any).fitterLabourRate);

      const calc = calcItemTotals({ ...input, partUnitPrice, techLabourRate, fitterLabourRate, });

      const item = await db.createRepairQuoteItem({
        quoteId: input.quoteId,
        deficiencyId: input.deficiencyId ?? null,
        description: input.description,
        repairNotes: input.repairNotes ?? null,
        systemType: input.systemType ?? null,
        location: input.location ?? null,
        quantity: input.quantity,
        partId: input.partId ?? null,
        partDescription,
        partUnitPrice: String(partUnitPrice),
        partTotal: String(calc.partTotal),
        techHours: String(input.techHours),
        fitterHours: String(input.fitterHours),
        techLabourRate: String(techLabourRate),
        fitterLabourRate: String(fitterLabourRate),
        labourTotal: String(calc.labourTotal),
        fuelCharge: String(input.fuelCharge),
        backflowReportFee: String(input.backflowReportFee),
        gst: String(calc.gst),
        pst: String(calc.pst),
        total: String(calc.total),
        sortOrder: input.sortOrder,
      } as any);

      await _recalcQuoteTotals(input.quoteId);
      return item;
    })),

  updateItem: officeProcedure
    .input(z.object({ id: z.number().int().positive(), quoteId: z.number().int().positive(), }).merge(repairItemFieldsSchema.partial()))
    .mutation(async ({ ctx, input }) =>
      withLockedRepairQuote(ctx, "repairQuote.updateItem", input.quoteId, ctx.user.companyId!, async (quote, tx) => {
      assertRepairQuoteEditable(quote);
      const existing = await db.getRepairQuoteItemById(input.id);
      if (!existing || existing.quoteId !== input.quoteId) throw new TRPCError({ code: "NOT_FOUND" });
      const part = await assertRepairQuoteItemLinks(quote, input);

      // Merge with existing values for calculation
      const merged = {
        quantity: input.quantity ?? toNum(existing.quantity),
        partUnitPrice: input.partUnitPrice ?? toNum(existing.partUnitPrice),
        techHours: input.techHours ?? toNum(existing.techHours),
        fitterHours: input.fitterHours ?? toNum(existing.fitterHours),
        techLabourRate: input.techLabourRate ?? toNum(existing.techLabourRate),
        fitterLabourRate: input.fitterLabourRate ?? toNum(existing.fitterLabourRate),
        fuelCharge: input.fuelCharge ?? toNum(existing.fuelCharge),
        backflowReportFee: input.backflowReportFee ?? toNum(existing.backflowReportFee),
      };

      // Re-snapshot if part changed
      if (part) {
        if (!input.partDescription) merged.partUnitPrice = merged.partUnitPrice || toNum(part.unitPrice);
      }

      const calc = calcItemTotals(merged);

      await tx.update(repairQuoteItems).set({
        ...(input.deficiencyId !== undefined ? { deficiencyId: input.deficiencyId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.repairNotes !== undefined ? { repairNotes: input.repairNotes } : {}),
        ...(input.systemType !== undefined ? { systemType: input.systemType } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.partId !== undefined ? { partId: input.partId } : {}),
        ...(input.partDescription !== undefined ? { partDescription: input.partDescription } : {}),
        partUnitPrice: String(merged.partUnitPrice),
        partTotal: String(calc.partTotal),
        techHours: String(merged.techHours),
        fitterHours: String(merged.fitterHours),
        techLabourRate: String(merged.techLabourRate),
        fitterLabourRate: String(merged.fitterLabourRate),
        labourTotal: String(calc.labourTotal),
        fuelCharge: String(merged.fuelCharge),
        backflowReportFee: String(merged.backflowReportFee),
        gst: String(calc.gst),
        pst: String(calc.pst),
        total: String(calc.total),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      }).where(and(eq(repairQuoteItems.id, input.id), eq(repairQuoteItems.quoteId, quote.id)));

      await _recalcQuoteTotals(input.quoteId);
      return { success: true };
    })),

  removeItem: officeProcedure
    .input(z.object({ id: z.number().int().positive(), quoteId: z.number().int().positive(), }))
    .mutation(async ({ ctx, input }) =>
      withLockedRepairQuote(ctx, "repairQuote.removeItem", input.quoteId, ctx.user.companyId!, async (quote, tx) => {
      assertRepairQuoteEditable(quote);
      const item = await db.getRepairQuoteItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      if (item.quoteId !== input.quoteId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Item does not belong to this quote",
        });
      await tx.delete(repairQuoteItems)
        .where(and(eq(repairQuoteItems.id, input.id), eq(repairQuoteItems.quoteId, quote.id)));
      await _recalcQuoteTotals(input.quoteId);
      return { success: true };
    })),

  // ── Finalize / status ────────────────────────────────────────────────────────

  finalizeQuote: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      withLockedRepairQuote(ctx, "repairQuote.finalizeQuote", input.id, ctx.user.companyId!, async quote => {
      if ((quote as any).finalizedAt) throw new TRPCError({ code: "CONFLICT", message: "Already finalized.", });
      if (quote.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotes can be finalized.", });
      const items = await db.getRepairQuoteItemsByQuote(input.id);
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one item before finalizing.", });

      await _recalcQuoteTotals(input.id);
      await db.updateQuote(input.id, { finalizedAt: new Date() } as any);
      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "status_changed",
        title: "Repair quote finalized", });
      return { success: true };
    })),

  updateStatus: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["sent", "accepted", "declined"]),
    }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.updateStatus", input.id, async lifecycle => {
      const { quote } = lifecycle;
      if (input.status === "sent") assertRepairQuoteDeliveryTransition(quote, "sent");
      else assertRepairQuoteApprovalMutable(quote);
      if (input.status === "declined" && ["accepted", "approved", "partially_approved", "converted_to_approved_work"].includes(quote.status)) {
        throw new TRPCError({ code: "CONFLICT", message: "An approved scope cannot be declined. Create a new quote for a revised decision." });
      }

      const extra: Record<string, unknown> = {};
      if (input.status === "sent" && !quote.sentAt) extra.sentAt = new Date();
      if (input.status === "accepted" && !quote.approvedAt) extra.approvedAt = new Date();
      if (input.status === "accepted" && !quote.acceptedAt) extra.acceptedAt = new Date();
      if (input.status === "declined") extra.declinedAt = new Date();

      if (input.status !== "accepted" || !quote.acceptedAt || !["accepted", "approved", "converted_to_approved_work"].includes(quote.status)) {
        await db.updateQuote(input.id, { status: input.status, ...extra } as any);
      }

      if (input.status === "accepted") {
        const items = await db.getRepairQuoteItemsByQuote(quote.id);
        for (const item of items) {
          if (item.approvalStatus !== "converted_to_approved_work") await updateApprovalItem(lifecycle, item, "approved");
        }
        await convertApprovedRepairItems(lifecycle, "internal", ctx.user.id);
      }

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "status_changed",
        title: `Repair quote ${input.status}`, oldValue: quote.status, newValue: input.status, });
      return { success: true };
      });
    }),

  // ── PDF ──────────────────────────────────────────────────────────────────────

  generatePDF: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      assertRepairQuoteFinalized(quote);

      const [items, job, site, customer, company] = await Promise.all([
        db.getRepairQuoteItemsByQuote(input.id),
        db.getJobById(quote.jobId),
        db.getSiteById(quote.siteId),
        db.getCustomerOrgById(quote.customerOrgId),
        db.getCompanyById(quote.companyId),
      ]);

      assertRecordedRepairTotal(quote, items);
      const q = quote as any;

      const pdfBuffer = await generateRepairQuotePDF(buildCustomerSafeRepairQuoteData({
        quoteId: quote.id,
        quoteNumber: q.quoteNumber ?? `RQ-${quote.id}`,
        companyName: company?.name ?? "EWF",
        companyPhone: company?.phone ?? "",
        companyEmail: company?.email ?? "",
        companyAddress: company?.address ?? "",
        customerName: customer?.name ?? "Customer",
        customerContactName: customer?.contactName ?? "",
        siteName: site?.name ?? "",
        siteAddress: [site?.address, site?.city, site?.state].filter(Boolean).join(", "),
        jobNumber: job?.jobNumber ?? `JOB-${quote.jobId}`,
        createdAt: quote.createdAt,
        validUntil: q.validUntil ? new Date(q.validUntil) : null,
        items: items.map(i => ({
          description: i.description,
          repairNotes: i.repairNotes ?? null,
          systemType: i.systemType ?? null,
          location: i.location ?? null,
          quantity: toNum(i.quantity),
          partDescription: i.partDescription ?? null,
          partUnitPrice: toNum(i.partUnitPrice),
          partTotal: toNum(i.partTotal),
          techHours: toNum(i.techHours),
          fitterHours: toNum(i.fitterHours),
          techLabourRate: toNum(i.techLabourRate),
          fitterLabourRate: toNum(i.fitterLabourRate),
          labourTotal: toNum(i.labourTotal),
          fuelCharge: toNum(i.fuelCharge),
          backflowReportFee: toNum(i.backflowReportFee),
          gst: toNum(i.gst),
          pst: toNum(i.pst),
          total: toNum(i.total),
        })),
        subtotal: toNum(q.subtotal),
        gst: toNum(q.gst),
        pst: toNum(q.pst),
        total: toNum(quote.total),
        notes: quote.notes ?? null,
      }));

      const pdfKey = `quotes/${quote.companyId}/${quote.id}/repair-quote-${quote.id}-${crypto.randomUUID()}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      await db.updateQuote(input.id, { pdfUrl } as any);

      return { pdfUrl };
    }),

  send: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      to: z.array(z.string().email()).min(1),
      requestId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      const q = quote as any;
      assertRepairQuoteFinalized(quote);
      if (!ENV.resendApiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email delivery is not configured" });
      }
      let pdfUrl = quote.pdfUrl;
      let attempted = false;
      const result = await sendEmailOnce({
        requestId: input.requestId,
        companyId: quote.companyId,
        userId: ctx.user.id,
        entityType: "repair_quote",
        entityId: quote.id,
        provider: "resend",
        payload: input,
        send: async () => {
          if (!["draft", "ready_to_send", "sent", "viewed"].includes(quote.status)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Only open finalized repair quotes can be sent." });
          }
          attempted = true;

          const [items, job, site, customer, company] = await Promise.all([
            db.getRepairQuoteItemsByQuote(input.id),
            db.getJobById(quote.jobId),
            db.getSiteById(quote.siteId),
            db.getCustomerOrgById(quote.customerOrgId),
            db.getCompanyById(quote.companyId),
          ]);

          assertRecordedRepairTotal(quote, items);
          const pdfBuffer = await generateRepairQuotePDF(buildCustomerSafeRepairQuoteData({
            quoteId: quote.id,
            quoteNumber: q.quoteNumber ?? `RQ-${quote.id}`,
            companyName: company?.name ?? "EWF",
            companyPhone: company?.phone ?? "",
            companyEmail: company?.email ?? "",
            companyAddress: company?.address ?? "",
            customerName: customer?.name ?? "Customer",
            customerContactName: customer?.contactName ?? "",
            siteName: site?.name ?? "",
            siteAddress: [site?.address, site?.city, site?.state].filter(Boolean).join(", "),
            jobNumber: job?.jobNumber ?? `JOB-${quote.jobId}`,
            createdAt: quote.createdAt,
            validUntil: q.validUntil ? new Date(q.validUntil) : null,
            items: items.map(i => ({
              description: i.description,
              repairNotes: i.repairNotes ?? null,
              systemType: i.systemType ?? null,
              location: i.location ?? null,
              quantity: toNum(i.quantity),
              partDescription: i.partDescription ?? null,
              partUnitPrice: toNum(i.partUnitPrice),
              partTotal: toNum(i.partTotal),
              techHours: toNum(i.techHours),
              fitterHours: toNum(i.fitterHours),
              techLabourRate: toNum(i.techLabourRate),
              fitterLabourRate: toNum(i.fitterLabourRate),
              labourTotal: toNum(i.labourTotal),
              fuelCharge: toNum(i.fuelCharge),
              backflowReportFee: toNum(i.backflowReportFee),
              gst: toNum(i.gst),
              pst: toNum(i.pst),
              total: toNum(i.total),
            })),
            subtotal: toNum(q.subtotal),
            gst: toNum(q.gst),
            pst: toNum(q.pst),
            total: toNum(quote.total),
            notes: quote.notes ?? null,
          }));

          const pdfKey = `quotes/${quote.companyId}/${quote.id}/repair-quote-${quote.id}-${crypto.randomUUID()}.pdf`;
          ({ url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf"));
          await db.updateQuote(input.id, { pdfUrl });

          const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", });
          const total = CAD.format(toNum(quote.total));
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
  <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
    <div style="background:#1e3a8a;padding:20px 24px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">Deficiency Repair Quote</h1>
    </div>
    <div style="padding:24px;">
      <p>Hello ${customer?.name ?? ""},</p>
      <p>Please find attached the deficiency repair quote for <strong>${site?.name ?? ""}</strong> (${job?.jobNumber ?? ""}).</p>
      <p><strong>Quote Total: ${total}</strong></p>
      <p>Please review the attached PDF and reply to this email with your approval or any questions.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;margin:0;">This quote was prepared by ${company?.name ?? ""}.</p>
    </div>
  </body></html>`;
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${ENV.resendApiKey}`, "Idempotency-Key": input.requestId, },
            body: JSON.stringify({
              from: `${company?.name ?? "Inspectra"} <noreply@inspectrafire.ca>`,
              to: input.to,
              subject: `Repair Quote — ${site?.name ?? ""} (${job?.jobNumber ?? ""})`,
              html,
              attachments: [{ filename: `repair-quote-${quote.id}.pdf`, content: pdfBuffer.toString("base64"), },],
            }),
          });
          if (!response.ok) {
            if ([401, 403, 429].includes(response.status)) {
              throw new EmailProviderRejected(`Provider rejected the repair quote (${response.status})`);
            }
            throw new Error(`Repair quote delivery outcome needs reconciliation (${response.status})`);
          }
          const receipt = await response.json() as { id?: unknown };
          if (typeof receipt?.id !== "string" || !receipt.id.trim()) {
            throw new Error("Repair quote delivery outcome needs reconciliation: provider returned no message ID");
          }
          return { id: receipt.id };
        },
      });
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await database.update(quotes).set({ status: "sent", sentAt: sql`COALESCE(${quotes.sentAt}, NOW())` })
        .where(and(eq(quotes.id, quote.id), eq(quotes.companyId, quote.companyId), inArray(quotes.status, ["draft", "ready_to_send", "sent"])));
      if (attempted) void logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.sent",
        title: `Quote emailed to ${input.to.join(", ")}`, oldValue: q.status, newValue: "sent", });

      return { pdfUrl, acceptance: result.acceptance, messageId: result.id };
    }),

  // ── Work Order conversion ─────────────────────────────────────────────────────

  convertToWorkOrder: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.convertToWorkOrder", input.id, async lifecycle => {
      const { quote } = lifecycle;
      const q = quote as any;
      const approvedStatuses = ["accepted", "approved", "partially_approved", "converted_to_approved_work",];
      if (!approvedStatuses.includes(q.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved quotes can be converted to a work order.", });
      }
      return ensureRepairWorkOrder(lifecycle);
      });
    }),

  // ── Approval workflow ─────────────────────────────────────────────────────────

  markReadyToSend: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.markReadyToSend", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteDeliveryTransition(quote, "ready_to_send");
      const q = quote as any;
      if (!q.finalizedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Finalize the quote before marking it ready to send.", });
      const items = await db.getRepairQuoteItemsByQuote(input.id);
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one item before marking ready to send.", });

      await db.updateQuote(input.id, { status: "ready_to_send" } as any);
      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "status_changed",
        title: "Quote marked ready to send", oldValue: quote.status, newValue: "ready_to_send", });
      return { success: true as const };
      });
    }),

  markSent: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.markSent", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteDeliveryTransition(quote, "sent");
      const q = quote as any;

      const update: Record<string, unknown> = { status: "sent" };
      if (!q.sentAt) update.sentAt = new Date();
      await db.updateQuote(input.id, update as any);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.sent",
        title: "Quote marked sent", oldValue: quote.status, newValue: "sent", });
      return { success: true as const };
      });
    }),

  markViewed: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.markViewed", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteDeliveryTransition(quote, "viewed");
      const q = quote as any;

      const update: Record<string, unknown> = { status: "viewed" };
      if (!q.viewedAt) update.viewedAt = new Date();
      await db.updateQuote(input.id, update as any);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.viewed",
        title: "Quote marked viewed by customer", oldValue: quote.status, newValue: "viewed", });
      return { success: true as const };
      });
    }),

  recordApproval: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      approvedByName: z.string().max(255).optional().nullable(),
      approvedByEmail: z.string().email().max(320).optional().nullable(),
      approvalSource: z.enum(["email", "phone", "signed_pdf", "in_person", "portal_later", "internal_entry",]),
      approvedAt: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.recordApproval", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteApprovalMutable(quote);
      if (Array.from(lifecycle.linkedJobs.values()).some(job => job.id !== quote.jobId && job.finalizedAt)) {
        throw new TRPCError({ code: "CONFLICT", message: "The repair job is finalized; its approval record cannot be changed." });
      }

      const resolvedAt = input.approvedAt ? new Date(input.approvedAt) : new Date();
      if (!Number.isFinite(resolvedAt.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Approval time is invalid." });

      await db.updateQuote(input.id, {
        approvedAt: resolvedAt,
        approvedByName: input.approvedByName ?? null,
        approvedByEmail: input.approvedByEmail ?? null,
        approvalSource: input.approvalSource,
      } as any);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.approvalRecorded",
        title: `Approval recorded (${input.approvalSource})`,
        metadata: { approvedByName: input.approvedByName, approvalSource: input.approvalSource, }, });
      return { success: true as const };
      });
    }),

  approveAllItems: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.approveAllItems", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteApprovalMutable(quote);

      const items = await db.getRepairQuoteItemsByQuote(input.id);
      for (const item of items) if (item.approvalStatus !== "converted_to_approved_work") await updateApprovalItem(lifecycle, item, "approved");
      await _recalcQuoteApprovalStatus(input.id);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.allItemsApproved",
        title: `All ${items.length} items approved`, });
      return { success: true as const };
      });
    }),

  declineAllItems: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.declineAllItems", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteApprovalMutable(quote);

      const items = await db.getRepairQuoteItemsByQuote(input.id);
      for (const item of items) await updateApprovalItem(lifecycle, item, "declined");
      await db.updateQuote(input.id, { status: "declined", declinedAt: new Date(), } as any);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.allItemsDeclined",
        title: `All ${items.length} items declined`, newValue: "declined", });

      const companyId = quote.companyId;
      const dedupeKey = `quote-declined-${input.id}`;
      const alreadyNotified = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!alreadyNotified) {
        await db.createNotification({
          companyId,
          roleTarget: "office",
          entityType: "repair_quote",
          entityId: input.id,
          type: "quote_declined",
          severity: "warning",
          title: `Repair quote declined — ${(quote as any).quoteNumber ?? `#${input.id}`}`,
          message: "Customer declined all items on this repair quote.",
          href: `/admin/repair-quotes/${input.id}`,
          dedupeKey,
        } as any);
      }
      return { success: true as const };
      });
    }),

  approveSelectedItems: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      itemIds: z.array(z.number().int().positive()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.approveSelectedItems", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteApprovalMutable(quote);

      const items = await db.getRepairQuoteItemsByQuote(input.id);
      const validIds = new Set(items.map(i => i.id));
      const toApprove = input.itemIds.filter(id => validIds.has(id));
      if (toApprove.length !== input.itemIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected item must belong to this quote." });

      for (const item of items.filter(item => toApprove.includes(item.id))) {
        if (item.approvalStatus !== "converted_to_approved_work") await updateApprovalItem(lifecycle, item, "approved");
      }
      const newStatus = await _recalcQuoteApprovalStatus(input.id);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.itemsApproved",
        title: `${toApprove.length} item(s) approved`, metadata: { itemIds: toApprove, newQuoteStatus: newStatus }, });
      return { success: true as const, newStatus };
      });
    }),

  declineSelectedItems: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      itemIds: z.array(z.number().int().positive()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.declineSelectedItems", input.id, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteApprovalMutable(quote);

      const items = await db.getRepairQuoteItemsByQuote(input.id);
      const validIds = new Set(items.map(i => i.id));
      const toDecline = input.itemIds.filter(id => validIds.has(id));
      if (toDecline.length !== input.itemIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Every selected item must belong to this quote." });

      for (const item of items.filter(item => toDecline.includes(item.id))) await updateApprovalItem(lifecycle, item, "declined");
      const newStatus = await _recalcQuoteApprovalStatus(input.id);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.itemsDeclined",
        title: `${toDecline.length} item(s) declined`, metadata: { itemIds: toDecline, newQuoteStatus: newStatus }, });
      return { success: true as const, newStatus };
      });
    }),

  updateItemApprovalStatus: officeProcedure
    .input(z.object({
      itemId: z.number().int().positive(),
      quoteId: z.number().int().positive(),
      approvalStatus: z.enum(["pending", "approved", "declined", "needs_review",]),
      customerNotes: z.string().max(1000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.updateItemApprovalStatus", input.quoteId, async lifecycle => {
      const { quote } = lifecycle;
      assertRepairQuoteApprovalMutable(quote);

      const item = await db.getRepairQuoteItemById(input.itemId);
      if (!item || item.quoteId !== input.quoteId) throw new TRPCError({ code: "NOT_FOUND" });

      await updateApprovalItem(lifecycle, item, input.approvalStatus, input.customerNotes);

      const newStatus = await _recalcQuoteApprovalStatus(input.quoteId);
      await logActivity({ ctx, entityType: "repair_quote", entityId: input.quoteId, eventType: "quote.itemStatusChanged",
        title: `Item #${input.itemId} → ${input.approvalStatus}`,
        metadata: { itemId: input.itemId, approvalStatus: input.approvalStatus, }, });
      return { success: true as const, newStatus };
      });
    }),

  convertApprovedItemsToApprovedWork: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      approvalSource: z.enum(["email", "phone", "signed_pdf", "in_person", "portal_later", "internal_entry",]).default("internal_entry"),
    }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.convertApprovedItemsToApprovedWork", input.id, async lifecycle => {
      const { quote } = lifecycle;
      const companyId = quote.companyId;

      const q = quote as any;
      const approvedStatuses = ["approved", "accepted", "partially_approved", "converted_to_approved_work",];
      if (!approvedStatuses.includes(q.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Quote must be approved or partially approved before converting items.", });
      }

      const { created, skipped } = await convertApprovedRepairItems(lifecycle, input.approvalSource, ctx.user.id);

      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.converted",
        title: `${created} item(s) converted to Approved Work`,
        metadata: { created, skipped }, });

      const dedupeKey = `quote-approved-ready-${input.id}`;
      const alreadyNotified = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!alreadyNotified && created > 0) {
        await db.createNotification({
          companyId,
          roleTarget: "office",
          entityType: "repair_quote",
          entityId: input.id,
          type: "quote_converted",
          severity: "info",
          title: `${created} repair item(s) converted to Approved Work`,
          message: `From quote ${q.quoteNumber ?? `#${input.id}`}. Ready to schedule.`,
          href: `/admin/approved-work`,
          dedupeKey,
        } as any);
      }

      return { success: true as const, created, skipped };
      });
    }),

  expireQuote: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.expireQuote", input.id, async lifecycle => {
      const { quote } = lifecycle;
      if (["accepted", "approved", "partially_approved", "converted_to_approved_work"].includes(quote.status)) {
        throw new TRPCError({ code: "CONFLICT", message: "A quote with an approved scope cannot be closed by this action. Create a revision or reconcile the approved work." });
      }

      await db.updateQuote(input.id, { status: "expired" } as any);
      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.expired",
        title: "Quote expired", oldValue: quote.status, newValue: "expired", });
      return { success: true as const };
      }, false);
    }),

  cancelQuote: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return withLockedRepairQuoteLifecycle(ctx, "repairQuote.cancelQuote", input.id, async lifecycle => {
      const { quote } = lifecycle;
      if (["accepted", "approved", "partially_approved", "converted_to_approved_work"].includes(quote.status)) {
        throw new TRPCError({ code: "CONFLICT", message: "A quote with an approved scope cannot be closed by this action. Create a revision or reconcile the approved work." });
      }

      await db.updateQuote(input.id, { status: "cancelled" } as any);
      await logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "quote.cancelled",
        title: "Quote cancelled", oldValue: quote.status, newValue: "cancelled", });
      return { success: true as const };
      }, false);
    }),
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _recalcQuoteApprovalStatus(quoteId: number): Promise<string> {
  const items = await db.getRepairQuoteItemsByQuote(quoteId);
  if (!items.length) return "";

  const approvedOrConverted = items.filter(i =>
    (i as any).approvalStatus === "approved" || (i as any).approvalStatus === "converted_to_approved_work"
  ).length;
  const declined = items.filter(i => (i as any).approvalStatus === "declined").length;
  const converted = items.filter(i => i.approvalStatus === "converted_to_approved_work").length;
  const total = items.length;

  let newStatus: string | null = null;
  if (converted > 0 && items.every(item => ["converted_to_approved_work", "declined", "needs_review"].includes(item.approvalStatus))) {
    newStatus = "converted_to_approved_work";
  } else if (approvedOrConverted === total) {
    newStatus = "approved";
  } else if (declined === total) {
    newStatus = "declined";
  } else if (approvedOrConverted > 0 || declined > 0) {
    newStatus = "partially_approved";
  } else {
    const quote = await db.getQuoteById(quoteId);
    newStatus = quote?.viewedAt ? "viewed" : quote?.sentAt ? "sent" : "draft";
  }

  if (newStatus) {
    const extra: Record<string, unknown> = { status: newStatus };
    if (newStatus === "approved") extra.approvedAt = extra.approvedAt ?? new Date();
    if (newStatus === "declined") extra.declinedAt = extra.declinedAt ?? new Date();
    await db.updateQuote(quoteId, extra as any);
  }

  return newStatus ?? "";
}

async function _recalcQuoteTotals(quoteId: number) {
  const items = await db.getRepairQuoteItemsByQuote(quoteId);
  const totals = calculateRepairQuoteTotals(items);
  await db.updateQuote(quoteId, {
    subtotal: String(totals.subtotal),
    gst: String(totals.gst),
    pst: String(totals.pst),
    total: String(totals.total),
  } as any);
}

async function updateApprovalItem(
  lifecycle: RepairQuoteLifecycle,
  item: RepairQuoteItem,
  status: "pending" | "approved" | "declined" | "needs_review",
  customerNotes?: string | null,
) {
  if (item.quoteId !== lifecycle.quote.id) throw new TRPCError({ code: "NOT_FOUND" });
  if (Array.from(lifecycle.linkedJobs.values()).some(job => job.id !== lifecycle.quote.jobId && job.finalizedAt)) {
    throw new TRPCError({ code: "CONFLICT", message: "The repair job is finalized; create a new quote for a revised approval." });
  }
  if (item.approvalStatus === "converted_to_approved_work") {
    throw new TRPCError({ code: "CONFLICT", message: "This approved item has been converted to work and its decision cannot be changed." });
  }
  const existing = await db.getApprovedWorkByQuoteItem(item.id);
  if (existing && status !== "approved") {
    throw new TRPCError({ code: "CONFLICT", message: "This item already has approved work. Reconcile it before changing the decision." });
  }
  await lifecycle.tx.update(repairQuoteItems).set({
    approvalStatus: status,
    ...(customerNotes !== undefined && { customerNotes }),
  }).where(and(eq(repairQuoteItems.id, item.id), eq(repairQuoteItems.quoteId, lifecycle.quote.id)));
}

/** Conversion creates a separate repair scope; it never alters inspection facts. */
async function ensureRepairWorkOrder(lifecycle: RepairQuoteLifecycle): Promise<{ workOrderId: number; jobId: number }> {
  const { quote, tx } = lifecycle;
  const allItems = await db.getRepairQuoteItemsByQuote(quote.id);
  assertRecordedRepairTotal(quote, allItems);
  const items = allItems.filter(item => ["approved", "converted_to_approved_work"].includes(item.approvalStatus));
  if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Approve at least one item before creating repair work." });
  for (const item of items) await assertRepairQuoteItemLinks(quote, { deficiencyId: item.deficiencyId });
  const lineItems = items.map(item => ({ deficiencyId: null, description: item.description, qty: 1, unitPrice: toNum(item.total) }));
  const total = calculateRepairQuoteTotals(items).total.toFixed(2);
  if (lifecycle.orders.length > 1) throw new TRPCError({ code: "CONFLICT", message: "Multiple work orders are linked to this quote. Reconcile them before continuing." });
  const existing = lifecycle.orders[0];
  if (existing) {
    const repairJob = lifecycle.linkedJobs.get(existing.jobId)!;
    if (existing.companyId !== quote.companyId || existing.siteId !== quote.siteId || existing.customerOrgId !== quote.customerOrgId || repairJob.jobType !== "repair" || existing.jobId === quote.jobId) {
      throw new TRPCError({ code: "CONFLICT", message: "The existing work order is linked to the source inspection. Reconcile that legacy link before converting this quote." });
    }
    if (existing.finalizedAt || repairJob.finalizedAt) {
      const stored = (existing.lineItems ?? []).map(item => ({ description: item.description, qty: Number(item.qty), unitPrice: Number(item.unitPrice), deficiencyId: item.deficiencyId }));
      const expected = lineItems.map(item => ({ description: item.description, qty: item.qty, unitPrice: item.unitPrice, deficiencyId: item.deficiencyId }));
      if (Number(existing.total) !== Number(total) || JSON.stringify(stored) !== JSON.stringify(expected)) {
        throw new TRPCError({ code: "CONFLICT", message: "The repair work is finalized. Create a new quote for a revised scope." });
      }
    } else {
      await tx.update(workOrders).set({ total, lineItems }).where(and(eq(workOrders.id, existing.id), eq(workOrders.quoteId, quote.id)));
      await db.updateJob(repairJob.id, { scopeOfWork: items.map(item => item.description).join("\n") });
    }
    return { workOrderId: existing.id, jobId: existing.jobId };
  }
  const repairJob = await db.createJob({
    companyId: quote.companyId, siteId: quote.siteId, customerOrgId: quote.customerOrgId,
    jobNumber: `JOB-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
    title: `Repair — ${quote.quoteNumber ?? `Quote #${quote.id}`}`,
    description: items.map(item => item.description).join("\n"),
    scopeOfWork: items.map(item => item.description).join("\n"),
    jobType: "repair", status: "pending", priority: "medium",
  });
  const order = await db.createWorkOrder({
    companyId: quote.companyId, siteId: quote.siteId, customerOrgId: quote.customerOrgId,
    jobId: repairJob.id, quoteId: quote.id, assignedTechnicianIds: [],
    workOrderNumber: `WO-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
    title: `Repair — ${quote.quoteNumber ?? `Quote #${quote.id}`}`,
    workType: "repair", status: "pending", priority: "medium", total, lineItems,
  });
  lifecycle.orders.push(order);
  lifecycle.linkedJobs.set(repairJob.id, repairJob as typeof lifecycle.sourceJob);
  return { workOrderId: order.id, jobId: repairJob.id };
}

async function convertApprovedRepairItems(lifecycle: RepairQuoteLifecycle, approvalSource: string, userId: number | undefined) {
  const { quote, tx } = lifecycle;
  const all = await tx.select().from(approvedWork).where(eq(approvedWork.quoteId, quote.id));
  if (all.some(record => record.quoteItemId == null)) {
    throw new TRPCError({ code: "CONFLICT", message: "This quote already has an aggregate approved work record. Reconcile it before creating individual item records." });
  }
  const items = (await db.getRepairQuoteItemsByQuote(quote.id)).filter(item => ["approved", "converted_to_approved_work"].includes(item.approvalStatus));
  const { workOrderId, jobId } = await ensureRepairWorkOrder(lifecycle);
  let created = 0, skipped = 0;
  for (const item of items) {
    const existing = all.find(record => record.quoteItemId === item.id);
    if (existing) {
      if (existing.companyId !== quote.companyId || existing.quoteId !== quote.id || Number(existing.approvedAmount) !== toNum(item.total) || existing.approvedScope !== item.description || existing.workOrderId !== workOrderId || existing.jobId !== jobId) {
        throw new TRPCError({ code: "CONFLICT", message: "An existing approved work snapshot does not match this item. Reconcile it before retrying." });
      }
      skipped++;
    } else {
      const duplicate = await db.getApprovedWorkByQuoteItem(item.id);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "This quote item already belongs to another approved work record." });
      await db.createApprovedWork({
        companyId: quote.companyId, siteId: quote.siteId, customerOrgId: quote.customerOrgId,
        jobId, workOrderId, quoteId: quote.id, quoteItemId: item.id,
        type: "repair_order", status: "approved", approvalSource: approvalSource as any,
        approvedAt: quote.approvedAt ?? new Date(), approvedByName: quote.approvedByName,
        approvedByEmail: quote.approvedByEmail, approvedAmount: String(toNum(item.total)),
        approvedScope: item.description, createdById: userId,
      });
      created++;
    }
    await tx.update(repairQuoteItems).set({ approvalStatus: "converted_to_approved_work" })
      .where(and(eq(repairQuoteItems.id, item.id), eq(repairQuoteItems.quoteId, quote.id)));
  }
  const refreshed = await db.getRepairQuoteItemsByQuote(quote.id);
  if (refreshed.every(item => ["converted_to_approved_work", "declined", "needs_review"].includes(item.approvalStatus))) {
    await db.updateQuote(quote.id, { status: "converted_to_approved_work" });
  }
  return { created, skipped };
}

/** Customer acceptance and its repair artifacts commit together, including exact retry recovery. */
export async function approveRepairQuoteFromCustomer(
  candidate: Quote,
  authorization: { token: string } | { customerOrgId: number; name: string; email: string },
  ctx?: TrpcContext,
): Promise<{ success: true; alreadyAccepted: boolean }> {
  return withAuthorizedRepairQuoteLifecycle(ctx, "quote.customerRepairApproval", candidate, async lifecycle => {
    const { quote, tx } = lifecycle;
    if ("token" in authorization) {
      if (quote.acceptToken !== authorization.token) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found or link has expired." });
      if (quote.acceptTokenExpiresAt && new Date(quote.acceptTokenExpiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This quote link has expired." });
      }
    } else if (!authorization.customerOrgId || quote.customerOrgId !== authorization.customerOrgId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const alreadyAccepted = ["accepted", "approved", "converted_to_approved_work"].includes(quote.status);
    if (!alreadyAccepted && !["sent", "viewed"].includes(quote.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This quote is not available for approval." });
    }
    const items = await db.getRepairQuoteItemsByQuote(quote.id);
    if (quote.status === "converted_to_approved_work" && items.some(item => item.approvalStatus !== "converted_to_approved_work")) {
      throw new TRPCError({ code: "CONFLICT", message: "A partial approved scope has already been converted. Contact the office before approving additional work." });
    }
    for (const item of items) {
      if (item.approvalStatus !== "converted_to_approved_work") await updateApprovalItem(lifecycle, item, "approved");
    }
    if (!alreadyAccepted) {
      await tx.update(quotes).set({
        status: "accepted", acceptedAt: quote.acceptedAt ?? new Date(), approvedAt: quote.approvedAt ?? new Date(),
        approvalSource: "token" in authorization ? "email" : "portal_later",
        ...(!("token" in authorization) && { approvedByName: authorization.name, approvedByEmail: authorization.email }),
      }).where(eq(quotes.id, quote.id));
    }
    await convertApprovedRepairItems(lifecycle, "token" in authorization ? "email" : "portal", ctx?.user?.id ?? quote.createdById ?? undefined);
    return { success: true, alreadyAccepted };
  });
}
