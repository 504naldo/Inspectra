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
 * Immutability: once finalizedAt is set, all mutations are blocked.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc.js";
import * as db from "../db.js";
import { ENV } from "../_core/env.js";
import { storagePut } from "../storage.js";
import { generateRepairQuotePDF } from "../quotePdfGenerator.js";
import { logActivity } from "../activityLogger.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const GST_RATE = 0.05;
const PST_RATE = 0.07;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcItemTotals(item: {
  quantity: number;
  partUnitPrice: number;
  techHours: number;
  fitterHours: number;
  techLabourRate: number;
  fitterLabourRate: number;
  fuelCharge: number;
  backflowReportFee: number;
}) {
  const partTotal = item.quantity * item.partUnitPrice;
  const labourTotal = item.techHours * item.techLabourRate + item.fitterHours * item.fitterLabourRate;
  const lineSubtotal = partTotal + labourTotal + item.fuelCharge + item.backflowReportFee;
  const gst = (partTotal + labourTotal + item.backflowReportFee) * GST_RATE;
  const pst = partTotal * PST_RATE;
  const total = lineSubtotal + gst + pst;
  return { partTotal, labourTotal, lineSubtotal, gst, pst, total };
}

function calcQuoteTotals(items: Array<{ partTotal: number; labourTotal: number; fuelCharge: number; backflowReportFee: number; gst: number; pst: number; total: number }>) {
  const subtotal = items.reduce((s, i) => s + i.partTotal + i.labourTotal + i.fuelCharge + i.backflowReportFee, 0);
  const gst = items.reduce((s, i) => s + i.gst, 0);
  const pst = items.reduce((s, i) => s + i.pst, 0);
  const total = subtotal + gst + pst;
  return { subtotal, gst, pst, total };
}

function toNum(v: unknown): number {
  return parseFloat(String(v ?? "0")) || 0;
}

async function assertNotFinalized(quoteId: number) {
  const q = await db.getQuoteById(quoteId);
  if (!q) throw new TRPCError({ code: "NOT_FOUND" });
  if ((q as any).finalizedAt) {
    throw new TRPCError({ code: "CONFLICT", message: "This quote is finalized and cannot be edited. Create a revision to make changes." });
  }
  return q;
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const repairItemInputSchema = z.object({
  deficiencyId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1).max(500),
  repairNotes: z.string().max(2000).optional().nullable(),
  systemType: z.enum(["FIRE_ALARM", "SMOKE_ALARM", "FIRE_EXTINGUISHER", "EMERGENCY_LIGHTING", "SPRINKLER", "BACKFLOW", "OTHER"]).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  // Part (optional — some items are labour-only)
  partId: z.number().int().positive().optional().nullable(),
  partDescription: z.string().max(255).optional().nullable(),
  partUnitPrice: z.number().nonnegative().default(0),
  // Labour
  techHours: z.number().nonnegative().default(0),
  fitterHours: z.number().nonnegative().default(0),
  techLabourRate: z.number().nonnegative().default(0),
  fitterLabourRate: z.number().nonnegative().default(0),
  // Per-item fees
  fuelCharge: z.number().nonnegative().default(0),
  backflowReportFee: z.number().nonnegative().default(0),
  sortOrder: z.number().int().default(0),
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
      unitPrice: z.number().nonnegative(),
      defaultLabourHours: z.number().nonnegative().default(0),
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
      unitPrice: z.number().nonnegative().optional(),
      defaultLabourHours: z.number().nonnegative().optional(),
      taxableGst: z.boolean().optional(),
      taxablePst: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const part = await db.getPartsCatalogItemById(input.id);
      if (!part) throw new TRPCError({ code: "NOT_FOUND" });
      if (part.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

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
      techLabourRate: z.number().nonnegative().default(75),
      fitterLabourRate: z.number().nonnegative().default(65),
      notes: z.string().max(2000).optional().nullable(),
      terms: z.string().max(2000).optional().nullable(),
      validDays: z.number().int().min(1).max(365).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const [job, settings] = await Promise.all([
        db.getJobById(input.jobId),
        db.getCompanySettings(ctx.user.companyId!),
      ]);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const rqPrefix = settings.repairQuoteNumberPrefix ?? "RQ";
      const year = new Date().getFullYear();
      const existing = await db.getQuotesByCompany(ctx.user.companyId!);
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
        const defs = await Promise.all(input.deficiencyIds.map((id) => db.getDeficiencyById(id)));
        const valid = defs.filter((d): d is NonNullable<typeof d> => !!d && d.jobId === input.jobId);
        for (let i = 0; i < valid.length; i++) {
          const d = valid[i];
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
            partTotal: "0",
            techHours: "0",
            fitterHours: "0",
            techLabourRate: String(input.techLabourRate),
            fitterLabourRate: String(input.fitterLabourRate),
            labourTotal: "0",
            fuelCharge: "0",
            backflowReportFee: "0",
            gst: "0",
            pst: "0",
            total: "0",
            sortOrder: i,
          } as any);
        }
      }

      void logActivity({ ctx, entityType: "repair_quote", entityId: quote.id, eventType: "created",
        title: `Repair quote created: ${quoteNumber}`,
        relatedEntityType: "job", relatedEntityId: input.jobId });
      return { quoteId: quote.id, quoteNumber };
    }),

  getRepairQuote: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

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
      const job = await db.getJobById(input.jobId);
      if (!job || job.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
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
      techLabourRate: z.number().nonnegative().optional(),
      fitterLabourRate: z.number().nonnegative().optional(),
      validDays: z.number().int().min(1).max(365).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await assertNotFinalized(input.id);
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

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
    }),

  // ── Quote Items ──────────────────────────────────────────────────────────────

  addItem: officeProcedure
    .input(z.object({ quoteId: z.number().int().positive() }).merge(repairItemInputSchema))
    .mutation(async ({ ctx, input }) => {
      const quote = await assertNotFinalized(input.quoteId);
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      // Snapshot part price if partId given
      let partDescription = input.partDescription ?? null;
      let partUnitPrice = input.partUnitPrice;
      if (input.partId) {
        const part = await db.getPartsCatalogItemById(input.partId);
        if (!part || part.companyId !== ctx.user.companyId) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid part" });
        partDescription = partDescription ?? part.productName;
        if (partUnitPrice === 0) partUnitPrice = toNum(part.unitPrice);
      }

      // Inherit labour rates from quote if not overridden
      const techLabourRate = input.techLabourRate || toNum((quote as any).techLabourRate);
      const fitterLabourRate = input.fitterLabourRate || toNum((quote as any).fitterLabourRate);

      const calc = calcItemTotals({ ...input, partUnitPrice, techLabourRate, fitterLabourRate });

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
    }),

  updateItem: officeProcedure
    .input(z.object({ id: z.number().int().positive(), quoteId: z.number().int().positive() }).merge(repairItemInputSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const quote = await assertNotFinalized(input.quoteId);
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const existing = await db.getRepairQuoteItemById(input.id);
      if (!existing || existing.quoteId !== input.quoteId) throw new TRPCError({ code: "NOT_FOUND" });

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
      if (input.partId) {
        const part = await db.getPartsCatalogItemById(input.partId);
        if (!part || part.companyId !== ctx.user.companyId) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid part" });
        if (!input.partDescription) merged.partUnitPrice = merged.partUnitPrice || toNum(part.unitPrice);
      }

      const calc = calcItemTotals(merged);

      await db.updateRepairQuoteItem(input.id, {
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
      } as any);

      await _recalcQuoteTotals(input.quoteId);
      return { success: true };
    }),

  removeItem: officeProcedure
    .input(z.object({ id: z.number().int().positive(), quoteId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await assertNotFinalized(input.quoteId);
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await db.deleteRepairQuoteItem(input.id);
      await _recalcQuoteTotals(input.quoteId);
      return { success: true };
    }),

  // ── Finalize / status ────────────────────────────────────────────────────────

  finalizeQuote: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if ((quote as any).finalizedAt) throw new TRPCError({ code: "CONFLICT", message: "Already finalized." });
      if (quote.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotes can be finalized." });
      const items = await db.getRepairQuoteItemsByQuote(input.id);
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one item before finalizing." });

      await db.updateQuote(input.id, { finalizedAt: new Date() } as any);
      void logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "status_changed",
        title: "Repair quote finalized" });
      return { success: true };
    }),

  updateStatus: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["sent", "accepted", "declined"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const extra: Record<string, unknown> = {};
      if (input.status === "sent" && !quote.sentAt) extra.sentAt = new Date();
      if (input.status === "accepted") extra.approvedAt = new Date();
      if (input.status === "declined") extra.declinedAt = new Date();

      await db.updateQuote(input.id, { status: input.status, ...extra } as any);

      if (input.status === "accepted") {
        await _createWorkOrderFromQuote(quote.id, ctx.user.companyId!);
        _createApprovedWorkFromQuote(quote.id, "internal").catch((err) => {
          console.warn("[ApprovedWork] Auto-create failed on office accept:", err);
        });
      }

      void logActivity({ ctx, entityType: "repair_quote", entityId: input.id, eventType: "status_changed",
        title: `Repair quote ${input.status}`, oldValue: quote.status, newValue: input.status });
      return { success: true };
    }),

  // ── PDF ──────────────────────────────────────────────────────────────────────

  generatePDF: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const [items, job, site, customer, company] = await Promise.all([
        db.getRepairQuoteItemsByQuote(input.id),
        db.getJobById(quote.jobId),
        db.getSiteById(quote.siteId),
        db.getCustomerOrgById(quote.customerOrgId),
        db.getCompanyById(quote.companyId),
      ]);

      const q = quote as any;

      const pdfBuffer = await generateRepairQuotePDF({
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
        items: items.map((i) => ({
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
      });

      const pdfKey = `quotes/${quote.companyId}/${quote.id}/repair-quote-${quote.id}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      await db.updateQuote(input.id, { pdfUrl } as any);

      return { pdfUrl };
    }),

  // ── Work Order conversion ─────────────────────────────────────────────────────

  convertToWorkOrder: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (quote.status !== "accepted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only accepted quotes can be converted to a work order." });
      }
      return _createWorkOrderFromQuote(quote.id, ctx.user.companyId!);
    }),
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _recalcQuoteTotals(quoteId: number) {
  const items = await db.getRepairQuoteItemsByQuote(quoteId);
  const mapped = items.map((i) => ({
    partTotal: toNum(i.partTotal),
    labourTotal: toNum(i.labourTotal),
    fuelCharge: toNum(i.fuelCharge),
    backflowReportFee: toNum(i.backflowReportFee),
    gst: toNum(i.gst),
    pst: toNum(i.pst),
    total: toNum(i.total),
  }));
  const totals = calcQuoteTotals(mapped);
  await db.updateQuote(quoteId, {
    subtotal: String(totals.subtotal),
    gst: String(totals.gst),
    pst: String(totals.pst),
    total: String(totals.total),
  } as any);
}

async function _createApprovedWorkFromQuote(quoteId: number, approvalSource: "email" | "internal"): Promise<void> {
  const existing = await db.getApprovedWorkByQuote(quoteId);
  if (existing) return;
  const quote = await db.getQuoteById(quoteId);
  if (!quote) return;
  await db.createApprovedWork({
    companyId: quote.companyId,
    siteId: quote.siteId,
    customerOrgId: quote.customerOrgId,
    jobId: quote.jobId,
    quoteId,
    type: "repair_order",
    status: "approved",
    approvalSource,
    approvedAt: new Date(),
    approvedAmount: String(quote.total),
    approvedScope: (quote as any).quoteNumber ? `Quote ${(quote as any).quoteNumber}` : `Quote #${quoteId}`,
  });
}

async function _createWorkOrderFromQuote(quoteId: number, companyId: number): Promise<{ workOrderId: number }> {
  const quote = await db.getQuoteById(quoteId);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
  const items = await db.getRepairQuoteItemsByQuote(quoteId);

  const existing = await db.getWorkOrderByJob(quote.jobId);
  if (existing) {
    // Update existing work order with quote link and repair line items
    await db.updateWorkOrder(existing.id, {
      quoteId: quoteId,
      workType: "repair",
      total: String(quote.total),
    });
    // Mark deficiencies as quoted
    const defIds = items.map((i) => i.deficiencyId).filter((id): id is number => id !== null);
    await Promise.all(defIds.map((id) => db.updateDeficiency(id, { status: "quoted", workOrderId: existing.id })));
    return { workOrderId: existing.id };
  }

  // Create a new work order
  const job = await db.getJobById(quote.jobId);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

  const woNumber = `WO-${Date.now()}`;
  const wo = await db.createWorkOrder({
    companyId,
    siteId: quote.siteId,
    customerOrgId: quote.customerOrgId,
    jobId: quote.jobId,
    quoteId: quoteId,
    assignedTechnicianIds: [],
    workOrderNumber: woNumber,
    title: `Repair — ${(quote as any).quoteNumber ?? `Quote #${quoteId}`}`,
    workType: "repair",
    status: "pending",
    priority: "medium",
    total: String(quote.total),
  });

  const defIds = items.map((i) => i.deficiencyId).filter((id): id is number => id !== null);
  await Promise.all(defIds.map((id) => db.updateDeficiency(id, { status: "quoted", workOrderId: wo.id })));

  return { workOrderId: wo.id };
}
