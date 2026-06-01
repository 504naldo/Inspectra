/**
 * quoteRouter.ts
 *
 * tRPC procedures for deficiency repair quotes.
 *
 * Procedures:
 *  create      – Build a draft quote from deficiency IDs for a job (officeProcedure)
 *  get         – Fetch a quote with all details (officeProcedure)
 *  list        – List quotes for a job (officeProcedure)
 *  update      – Edit a draft quote's line items / notes (officeProcedure)
 *  send        – Generate PDF, store in S3, email customer, set status→sent (officeProcedure)
 *  accept      – Token-gated public endpoint: mark quote accepted + deficiencies quoted
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, publicProcedure, customerProcedure } from "../_core/trpc.js";
import { sendQuoteApprovedNotification } from "../emailService.js";
import * as db from "../db.js";
import { ENV } from "../_core/env.js";
import { storagePut } from "../storage.js";
import { generateQuotePDF, generateBuildingQuotePDF } from "../quotePdfGenerator.js";
import type { QuoteLineItem } from "../../drizzle/schema.js";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const lineItemSchema = z.object({
  deficiencyId: z.number().nullable(),
  description: z.string().min(1).max(1000),
  unitPrice: z.number().nonnegative(),
  qty: z.number().int().positive(),
});

const serviceLineSchema = z.object({
  serviceType: z.string().min(1),
  description: z.string().min(1).max(500),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  lineNotes: z.string().max(500).optional(),
});

const labourLineSchema = z.object({
  labourType: z.string().min(1),
  hours: z.number().nonnegative(),
  rate: z.number().nonnegative(),
  lineNotes: z.string().max(500).optional(),
});

const buildingInfoSchema = z.object({
  city: z.string().optional(),
  backflowFeeCity: z.string().optional(),
  buildingId: z.string().optional(),
  buildingName: z.string().optional(),
  address: z.string().min(1, "Address is required"),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const quoteRouter = router({
  /**
   * Create a draft quote for a job.
   * If deficiencyIds are supplied the line items are pre-populated from the
   * deficiencies' title + estimatedCost.  The caller can also pass explicit
   * lineItems to override.
   */
  create: officeProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        deficiencyIds: z.array(z.number()).optional(),
        lineItems: z.array(lineItemSchema).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const job = await db.getJobById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Build line items
      let items: QuoteLineItem[] = input.lineItems
        ? (input.lineItems as QuoteLineItem[])
        : [];

      if (!items.length && input.deficiencyIds?.length) {
        const defs = await Promise.all(
          input.deficiencyIds.map((id) => db.getDeficiencyById(id))
        );
        items = defs
          .filter((d): d is NonNullable<typeof d> => !!d && d.jobId === input.jobId)
          .map((d) => ({
            deficiencyId: d.id,
            description: `${d.title}${d.observedIssue ? ` — ${d.observedIssue}` : ""}`,
            unitPrice: d.estimatedCost ? parseFloat(String(d.estimatedCost)) : 0,
            qty: 1,
          }));
      }

      const total = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

      const quote = await db.createQuote({
        jobId: input.jobId,
        siteId: job.siteId,
        customerOrgId: job.customerOrgId,
        companyId: job.companyId,
        lineItems: items,
        total: String(total),
        notes: input.notes,
        status: "draft",
      });

      return { quoteId: quote.id };
    }),

  /**
   * Fetch a single quote (with associated job + site + customer info).
   */
  get: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [job, site, customer] = await Promise.all([
        db.getJobById(quote.jobId),
        db.getSiteById(quote.siteId),
        db.getCustomerOrgById(quote.customerOrgId),
      ]);
      return { quote, job, site, customer };
    }),

  /**
   * List all quotes for a job.
   */
  listByJob: officeProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const job = await db.getJobById(input.jobId);
      if (!job || job.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.getQuotesByJob(input.jobId);
    }),

  /**
   * Update line items / notes on a draft quote.
   */
  update: officeProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        lineItems: z.array(lineItemSchema).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (quote.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotes can be edited." });
      }

      const items = input.lineItems
        ? (input.lineItems as QuoteLineItem[])
        : (quote.lineItems as QuoteLineItem[]);
      const total = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

      await db.updateQuote(input.id, {
        lineItems: items,
        notes: input.notes ?? quote.notes,
        total: String(total),
      });
      return { success: true };
    }),

  /**
   * Generate the quote PDF, upload to S3, email to customer, and set status→sent.
   */
  send: officeProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        customerEmail: z.string().email(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (quote.status !== "draft" && quote.status !== "sent") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Quote is already accepted or declined." });
      }

      const [job, site, customer, company] = await Promise.all([
        db.getJobById(quote.jobId),
        db.getSiteById(quote.siteId),
        db.getCustomerOrgById(quote.customerOrgId),
        db.getCompanyById(quote.companyId),
      ]);

      // Generate accept token
      const acceptToken = crypto.randomBytes(32).toString("hex");
      const acceptUrl = `${ENV.appUrl}/quote/accept?token=${acceptToken}`;

      // Gather deficiency summaries for the PDF
      const lineItems = quote.lineItems as QuoteLineItem[];
      const defIds = lineItems.map((i) => i.deficiencyId).filter((id): id is number => id !== null);
      const defDetails = await Promise.all(defIds.map((id) => db.getDeficiencyById(id)));

      // Generate PDF
      const pdfBuffer = await generateQuotePDF({
        quoteId: quote.id,
        jobNumber: job?.jobNumber ?? `JOB-${quote.jobId}`,
        siteName: site?.name ?? "Unknown Site",
        siteAddress: site?.address ?? "",
        customerName: customer?.name ?? "Customer",
        customerEmail: input.customerEmail,
        companyName: company?.name ?? "EWF",
        createdAt: quote.createdAt,
        lineItems: lineItems,
        total: parseFloat(String(quote.total)),
        notes: quote.notes,
        acceptUrl,
        deficiencySummaries: defDetails
          .filter((d): d is NonNullable<typeof d> => !!d)
          .map((d) => ({
            title: d.title,
            severity: d.severity,
            description: d.observedIssue ?? d.description,
            location: null,
          })),
      });

      // Upload to S3
      const pdfKey = `quotes/${quote.companyId}/${quote.id}/quote-${quote.id}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");

      // Send email to customer via Resend
      if (ENV.resendApiKey) {
        const emailBody = buildQuoteEmailHtml({
          customerName: customer?.name ?? "Customer",
          siteName: site?.name ?? "",
          jobNumber: job?.jobNumber ?? "",
          total: parseFloat(String(quote.total)),
          acceptUrl,
          pdfUrl,
        });

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ENV.resendApiKey}`,
          },
          body: JSON.stringify({
            from: `${company?.name ?? "Inspectra"} <noreply@inspectrafire.ca>`,
            to: [input.customerEmail],
            subject: `Deficiency Repair Quote — ${site?.name ?? ""} (${job?.jobNumber ?? ""})`,
            html: emailBody,
            attachments: [
              {
                filename: `quote-${quote.id}.pdf`,
                content: pdfBuffer.toString("base64"),
              },
            ],
          }),
        });
      }

      // Persist: token, expiry (90 days), pdfUrl, sentAt, status→sent
      const acceptTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await db.updateQuote(quote.id, {
        acceptToken,
        acceptTokenExpiresAt,
        pdfUrl,
        sentAt: new Date(),
        status: "sent",
      });

      return { success: true, pdfUrl };
    }),

  /**
   * Create a building quote (not tied to a specific job/deficiency).
   * Office/admin only. Accepts service lines, labour lines, discount, and
   * optional site/customer org links.
   */
  createBuilding: officeProcedure
    .input(
      z.object({
        siteId: z.number().int().positive().optional(),
        customerOrgId: z.number().int().positive().optional(),
        buildingInfo: buildingInfoSchema,
        serviceLines: z.array(serviceLineSchema),
        labourLines: z.array(labourLineSchema),
        discount: z.number().min(0).max(100).default(0),
        discountReason: z.string().max(500).optional(),
        comments: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!input.serviceLines.length && !input.labourLines.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one service or labour line is required.",
        });
      }

      // Build unified line items from services and labour
      const serviceItems: QuoteLineItem[] = input.serviceLines.map((s) => ({
        deficiencyId: null,
        description: s.description,
        unitPrice: s.unitPrice,
        qty: s.qty,
        type: "service" as const,
        lineNotes: s.lineNotes,
      }));

      const labourItems: QuoteLineItem[] = input.labourLines.map((l) => ({
        deficiencyId: null,
        description: l.labourType,
        unitPrice: l.rate,
        qty: 1,
        type: "labour" as const,
        hours: l.hours,
        rate: l.rate,
        lineNotes: l.lineNotes,
      }));

      const allItems = [...serviceItems, ...labourItems];

      // Calculate subtotals
      const servicesSubtotal = serviceItems.reduce(
        (sum, i) => sum + i.unitPrice * i.qty,
        0
      );
      const labourSubtotal = labourItems.reduce(
        (sum, i) => sum + (i.hours ?? 0) * (i.rate ?? 0),
        0
      );
      const subtotal = servicesSubtotal + labourSubtotal;
      const discountAmount = subtotal * (input.discount / 100);
      const total = subtotal - discountAmount;

      const quote = await db.createQuote({
        jobId: 0,
        siteId: input.siteId ?? 0,
        customerOrgId: input.customerOrgId ?? 0,
        companyId: ctx.user.companyId!,
        lineItems: allItems,
        total: total.toFixed(2),
        notes: input.comments ?? null,
        status: "draft",
        quoteType: "building",
        discount: input.discount.toFixed(2),
        discountReason: input.discountReason ?? null,
        buildingInfo: input.buildingInfo,
      });

      return { quoteId: quote.id };
    }),

  /**
   * Update a building quote (draft only).
   */
  updateBuilding: officeProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        siteId: z.number().int().positive().optional(),
        customerOrgId: z.number().int().positive().optional(),
        buildingInfo: buildingInfoSchema.optional(),
        serviceLines: z.array(serviceLineSchema).optional(),
        labourLines: z.array(labourLineSchema).optional(),
        discount: z.number().min(0).max(100).optional(),
        discountReason: z.string().max(500).optional(),
        comments: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (quote.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotes can be edited." });
      }

      const serviceLines = input.serviceLines;
      const labourLines = input.labourLines;

      let allItems = quote.lineItems as QuoteLineItem[];
      let total = parseFloat(String(quote.total));

      if (serviceLines !== undefined && labourLines !== undefined) {
        const serviceItems: QuoteLineItem[] = serviceLines.map((s) => ({
          deficiencyId: null,
          description: s.description,
          unitPrice: s.unitPrice,
          qty: s.qty,
          type: "service" as const,
          lineNotes: s.lineNotes,
        }));
        const labourItems: QuoteLineItem[] = labourLines.map((l) => ({
          deficiencyId: null,
          description: l.labourType,
          unitPrice: l.rate,
          qty: 1,
          type: "labour" as const,
          hours: l.hours,
          rate: l.rate,
          lineNotes: l.lineNotes,
        }));
        allItems = [...serviceItems, ...labourItems];
        const subtotal =
          serviceItems.reduce((s, i) => s + i.unitPrice * i.qty, 0) +
          labourItems.reduce((s, i) => s + (i.hours ?? 0) * (i.rate ?? 0), 0);
        const disc = input.discount ?? parseFloat(String((quote as any).discount ?? "0"));
        total = subtotal - subtotal * (disc / 100);
      }

      await db.updateQuote(input.id, {
        siteId: input.siteId ?? quote.siteId,
        customerOrgId: input.customerOrgId ?? quote.customerOrgId,
        lineItems: allItems,
        notes: input.comments ?? quote.notes,
        total: total.toFixed(2),
        ...(input.buildingInfo && { buildingInfo: input.buildingInfo }),
        ...(input.discount !== undefined && { discount: input.discount.toFixed(2) }),
        ...(input.discountReason !== undefined && { discountReason: input.discountReason }),
      } as any);

      return { success: true };
    }),

  /**
   * List all quotes for the current user's company.
   */
  listByCompany: officeProcedure.query(async ({ ctx }) => {
    return db.getQuotesByCompany(ctx.user.companyId!);
  }),

  /**
   * Fetch a single building quote with company info.
   */
  getBuilding: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const company = await db.getCompanyById(quote.companyId);
      return { quote, company };
    }),

  /**
   * Generate and store a PDF for a building quote. Returns the S3 URL.
   */
  downloadBuildingPDF: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const company = await db.getCompanyById(quote.companyId);
      const info = (quote as any).buildingInfo as { city?: string; backflowFeeCity?: string; buildingId?: string; buildingName?: string; address?: string } | null ?? {};
      const lineItems = quote.lineItems as import("../../drizzle/schema.js").QuoteLineItem[];
      const serviceLines = lineItems.filter((i) => i.type === "service" || !i.type);
      const labourLines  = lineItems.filter((i) => i.type === "labour");

      const discountPct = parseFloat(String((quote as any).discount ?? "0"));
      const servicesSubtotal = serviceLines.reduce((s, i) => s + i.unitPrice * i.qty, 0);
      const labourSubtotal   = labourLines.reduce((s, i) => s + (i.hours ?? 0) * (i.rate ?? i.unitPrice), 0);
      const subtotal         = servicesSubtotal + labourSubtotal;
      const discountAmount   = subtotal * (discountPct / 100);
      const total            = parseFloat(String(quote.total));

      const pdfBuffer = await generateBuildingQuotePDF({
        quoteId: quote.id,
        companyName: company?.name ?? "EWF",
        createdAt: quote.createdAt,
        buildingName:      info.buildingName,
        buildingId:        info.buildingId,
        address:           info.address,
        city:              info.city,
        backflowFeeCity:   info.backflowFeeCity,
        serviceLines: serviceLines.map((s) => ({
          description: s.description,
          qty:         s.qty,
          unitPrice:   s.unitPrice,
          lineNotes:   s.lineNotes,
        })),
        labourLines: labourLines.map((l) => ({
          labourType: l.description,
          hours:      l.hours ?? 0,
          rate:       l.rate ?? l.unitPrice,
          lineNotes:  l.lineNotes,
        })),
        servicesSubtotal,
        labourSubtotal,
        subtotal,
        discount:      discountPct,
        discountAmount,
        discountReason: (quote as any).discountReason ?? undefined,
        total,
        comments: quote.notes ?? undefined,
      });

      const pdfKey = `quotes/${quote.companyId}/${quote.id}/building-quote-${quote.id}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      await db.updateQuote(quote.id, { pdfUrl } as any);

      return { pdfUrl };
    }),

  /**
   * Update the status of a building quote (draft → sent → accepted/declined).
   */
  updateBuildingStatus: officeProcedure
    .input(
      z.object({
        id:     z.number().int().positive(),
        status: z.enum(["draft", "sent", "accepted", "declined"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const extra: Record<string, unknown> = {};
      if (input.status === "sent" && !quote.sentAt) extra.sentAt = new Date();
      if (input.status === "accepted" && !quote.acceptedAt) extra.acceptedAt = new Date();

      await db.updateQuote(input.id, { status: input.status, ...extra } as any);
      return { success: true };
    }),

  /**
   * Public token-gated endpoint — customer clicks the accept link.
   * Marks the quote as accepted and flags linked deficiencies as quoted.
   */
  accept: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const quote = await db.getQuoteByToken(input.token);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found or link has expired." });
      if (quote.status === "accepted") {
        return { success: true, alreadyAccepted: true };
      }
      if (quote.status !== "sent") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This quote is no longer available." });
      }
      if (quote.acceptTokenExpiresAt && new Date() > new Date(quote.acceptTokenExpiresAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This quote link has expired. Please contact us for a new quote." });
      }

      // Mark quote accepted
      await db.updateQuote(quote.id, {
        status: "accepted",
        acceptedAt: new Date(),
      });

      // Auto-create Approved Work record so office can schedule the repair without a manual step
      try {
        const existingAW = await db.getApprovedWorkByQuote(quote.id);
        if (!existingAW) {
          await db.createApprovedWork({
            companyId: quote.companyId,
            siteId: quote.siteId,
            customerOrgId: quote.customerOrgId,
            jobId: quote.jobId,
            quoteId: quote.id,
            type: "repair_order",
            status: "approved",
            approvalSource: "email",
            approvedAt: new Date(),
            approvedAmount: String(quote.total),
            approvedScope: quote.quoteNumber ? `Quote ${quote.quoteNumber}` : `Quote #${quote.id}`,
          });
        }
      } catch (awErr) {
        console.warn("[ApprovedWork] Auto-create failed on customer accept:", awErr);
      }

      // Flag linked deficiencies as quoted and link to work order
      const lineItems = quote.lineItems as QuoteLineItem[];
      const defIds = lineItems
        .map((i) => i.deficiencyId)
        .filter((id): id is number => id !== null);

      // Best-effort: link work order to this accepted quote
      try {
        const wo = await db.getWorkOrderByJob(quote.jobId);
        if (wo) {
          await db.updateWorkOrder(wo.id, {
            quoteId: quote.id,
            workType: "repair",
            lineItems: lineItems,
            total: String(quote.total),
          });
          // Link each deficiency to the work order
          await Promise.all(
            defIds.map((id) => db.updateDeficiency(id, { status: "quoted", workOrderId: wo.id }))
          );
        } else {
          await Promise.all(
            defIds.map((id) => db.updateDeficiency(id, { status: "quoted" }))
          );
        }
      } catch (woErr) {
        console.warn("[WorkOrder] Failed to link WO on quote accept:", woErr);
        // Still mark deficiencies quoted even if WO link fails
        await Promise.all(
          defIds.map((id) => db.updateDeficiency(id, { status: "quoted" }))
        );
      }

      return { success: true, alreadyAccepted: false };
    }),

  listByCustomerOrg: customerProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.customerOrgId;
    if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "No customer org" });
    return db.getQuotesByCustomerOrg(orgId);
  }),

  approveFromPortal: customerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const quote = await db.getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (quote.customerOrgId !== ctx.user.customerOrgId) throw new TRPCError({ code: "FORBIDDEN" });
      if (quote.status === "accepted") return { success: true, alreadyAccepted: true };
      if (quote.status !== "sent" && quote.status !== "viewed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This quote is not available for approval." });
      }

      const approvedByName = ctx.user.name ?? "";
      const approvedByEmail = ctx.user.email ?? "";

      await db.updateQuote(input.id, {
        status: "accepted",
        acceptedAt: new Date(),
        approvedAt: new Date(),
        approvedByName,
        approvedByEmail,
        approvalSource: "portal_later",
      } as any);

      // Auto-create ApprovedWork
      try {
        const existingAW = await db.getApprovedWorkByQuote(quote.id);
        if (!existingAW) {
          await db.createApprovedWork({
            companyId: quote.companyId,
            siteId: quote.siteId,
            customerOrgId: quote.customerOrgId,
            jobId: quote.jobId,
            quoteId: quote.id,
            type: "repair_order",
            status: "approved",
            approvalSource: "portal",
            approvedAt: new Date(),
            approvedAmount: String(quote.total),
            approvedScope: quote.quoteNumber ? `Quote ${quote.quoteNumber}` : `Quote #${quote.id}`,
          });
        }
      } catch (awErr) {
        console.warn("[ApprovedWork] Auto-create failed on portal approve:", awErr);
      }

      // Mark linked deficiencies as quoted
      try {
        const lineItems = (quote.lineItems ?? []) as QuoteLineItem[];
        const defIds = lineItems.map((i) => i.deficiencyId).filter((id): id is number => id !== null);
        if (defIds.length) {
          await Promise.all(defIds.map((id) => db.updateDeficiency(id, { status: "quoted" })));
        }
      } catch (err) {
        console.warn("[quote] Failed to mark deficiencies quoted on portal approve:", err);
      }

      // Notify admin
      const site = await db.getSiteById(quote.siteId).catch(() => undefined);
      void sendQuoteApprovedNotification({
        quoteNumber: quote.quoteNumber ?? `#${quote.id}`,
        siteName: (site as any)?.name ?? "",
        total: quote.total ?? 0,
        approvedByName,
        approvedByEmail,
      });

      return { success: true, alreadyAccepted: false };
    }),
});

// ── Email HTML helper ─────────────────────────────────────────────────────────

function buildQuoteEmailHtml(opts: {
  customerName: string;
  siteName: string;
  jobNumber: string;
  total: number;
  acceptUrl: string;
  pdfUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#1e3a8a;padding:20px 24px;">
    <h1 style="color:#fff;margin:0;font-size:20px;">Deficiency Repair Quote</h1>
  </div>
  <div style="padding:24px;">
    <p>Hello ${opts.customerName},</p>
    <p>
      A repair quote has been prepared for deficiencies found during the inspection at
      <strong>${opts.siteName}</strong> (${opts.jobNumber}).
    </p>
    <p><strong>Quote Total: $${opts.total.toFixed(2)}</strong></p>
    <p>The full quote is attached as a PDF. To accept this quote, click the button below:</p>
    <p style="text-align:center;margin:32px 0;">
      <a href="${opts.acceptUrl}"
         style="background:#1e3a8a;color:#fff;padding:12px 28px;border-radius:6px;
                text-decoration:none;font-size:15px;font-weight:bold;">
        Accept Quote
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px;">
      Or copy this link into your browser:<br />
      <a href="${opts.acceptUrl}" style="color:#3b82f6;">${opts.acceptUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;margin:0;">
      If you have questions about this quote, please reply to this email.
    </p>
  </div>
</body>
</html>`.trim();
}
