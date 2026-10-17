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
import { getJobForCompany, getQuoteForCompany } from "../tenantGuards.js";
import { assertQuoteAvailableForDecision, assertStandardQuoteEditable, assertStandardQuoteStatusTransition, withLockedQuoteDecision, withLockedStandardQuote } from "../standardQuoteIntegrity.js";
import { ENV } from "../_core/env.js";
import { storagePut } from "../storage.js";
import { generateQuotePDF, generateBuildingQuotePDF } from "../quotePdfGenerator.js";
import { buildCustomerSafeQuoteData, buildCustomerSafeBuildingQuoteData } from "../customerSafeReport.js";
import { quotes, type QuoteLineItem } from "../../drizzle/schema.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { sendEmailOnce, EmailProviderRejected } from "../emailOutbox.js";
import { approveRepairQuoteFromCustomer } from "./repairQuoteRouter.js";
import { approveStandardQuoteFromCustomer } from "../standardQuoteLifecycle.js";

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
      const job = await getJobForCompany(input.jobId, ctx.user.companyId!);

      // Build line items
      let items: QuoteLineItem[] = input.lineItems
        ? (input.lineItems as QuoteLineItem[])
        : [];

      if (!items.length && input.deficiencyIds?.length) {
        const defs = await Promise.all(
          input.deficiencyIds.map((id) => db.getDeficiencyById(id))
        );
        if (defs.some(d => !d || d.jobId !== job.id)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Deficiency does not belong to this quote's job." });
        }
        items = defs
          .filter((d): d is NonNullable<typeof d> => !!d && d.jobId === input.jobId)
          .map((d) => ({
            deficiencyId: d.id,
            description: `${d.title}${d.observedIssue ? ` — ${d.observedIssue}` : ""}`,
            unitPrice: d.estimatedCost ? parseFloat(String(d.estimatedCost)) : 0,
            qty: 1,
          }));
      }

      await assertQuoteDeficiencyLinks(job.id, items);
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
      const quote = await getQuoteForCompany(input.id, ctx.user.companyId!);
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
      await getJobForCompany(input.jobId, ctx.user.companyId!); // authorize job access
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
      const authorizedQuote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      if (authorizedQuote.quoteType === "repair") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Edit repair quotes through the repair quote workflow." });
      }
      await withLockedStandardQuote(ctx, "quote.update", input.id, authorizedQuote.companyId, async (quote, tx) => {
        if (quote.quoteType === "building") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Edit building quotes through the building quote workflow." });
        }
        await assertStandardQuoteEditable(quote, tx);
        const items = input.lineItems
          ? (input.lineItems as QuoteLineItem[])
          : quote.lineItems;
        await assertQuoteDeficiencyLinks(quote.jobId, items);
        const total = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
        await tx.update(quotes).set({
          lineItems: items,
          notes: input.notes ?? quote.notes,
          total: String(total),
        }).where(eq(quotes.id, quote.id));
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
        requestId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const authorizedQuote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      if (authorizedQuote.quoteType === "repair") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Send repair quotes through the repair quote workflow." });
      }
      if (authorizedQuote.quoteType === "building") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use the building quote PDF and delivery workflow." });
      }
      if (!ENV.resendApiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email delivery is not configured" });
      }
      let pdfUrl = authorizedQuote.pdfUrl;
      const result = await sendEmailOnce({
        requestId: input.requestId,
        companyId: authorizedQuote.companyId,
        userId: ctx.user.id,
        entityType: "quote",
        entityId: authorizedQuote.id,
        provider: "resend",
        payload: input,
        send: async () => {
          const database = await db.getDb();
          if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
          // Initialize the link under a short lock. Concurrent explicit sends
          // share a live token, and receipt retries never replace the emailed link.
          const quote = await database.transaction(async tx => {
            const [current] = await tx.select().from(quotes)
              .where(and(eq(quotes.id, authorizedQuote.id), eq(quotes.companyId, authorizedQuote.companyId)))
              .for("update");
            if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
            if (current.quoteType === "repair" || current.quoteType === "building" || !["draft", "sent"].includes(current.status)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Quote is already accepted or declined, or cannot be sent through this workflow." });
            }
            await assertQuoteDeficiencyLinks(current.jobId, current.lineItems);
            // Seal before PDF/storage/provider work. Draft status is not evidence
            // that no customer has received this scope: the final state write may
            // fail, or the provider response may be lost. Content edits take this
            // same parent lock, so they either finish first or see the durable seal.
            const finalizedAt = current.finalizedAt ?? new Date();
            const liveToken = current.acceptToken && (!current.acceptTokenExpiresAt || new Date(current.acceptTokenExpiresAt) > new Date());
            const acceptToken = liveToken ? current.acceptToken! : crypto.randomBytes(32).toString("hex");
            const acceptTokenExpiresAt = liveToken ? current.acceptTokenExpiresAt : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            await tx.update(quotes).set({ finalizedAt, acceptToken, acceptTokenExpiresAt }).where(eq(quotes.id, current.id));
            return { ...current, finalizedAt, acceptToken, acceptTokenExpiresAt };
          });
          const acceptUrl = `${ENV.appUrl}/quote/accept?token=${quote.acceptToken}`;
          const [job, site, customer, company] = await Promise.all([
            db.getJobById(quote.jobId), db.getSiteById(quote.siteId),
            db.getCustomerOrgById(quote.customerOrgId), db.getCompanyById(quote.companyId),
          ]);
          const lineItems = quote.lineItems as QuoteLineItem[];
          const defIds = lineItems.map(i => i.deficiencyId).filter((id): id is number => id !== null);
          const defDetails = await Promise.all(defIds.map(id => db.getDeficiencyById(id)));
          const pdfBuffer = await generateQuotePDF(buildCustomerSafeQuoteData({
            quoteId: quote.id,
            jobNumber: job?.jobNumber ?? `JOB-${quote.jobId}`,
            siteName: site?.name ?? "Unknown Site",
            siteAddress: site?.address ?? "",
            customerName: customer?.name ?? "Customer",
            customerEmail: input.customerEmail,
            companyName: company?.name ?? "EWF",
            createdAt: quote.createdAt,
            lineItems,
            total: parseFloat(String(quote.total)),
            notes: quote.notes,
            acceptUrl,
            deficiencySummaries: defDetails
              .filter((d): d is NonNullable<typeof d> => !!d)
              .map(d => ({ title: d.title, severity: d.severity, description: d.observedIssue ?? d.description, location: null })),
          }));
          const pdfKey = `quotes/${quote.companyId}/${quote.id}/quote-${quote.id}.pdf`;
          ({ url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf"));
          // Save preparation separately from provider acceptance. A retry after
          // the final state update fails can return the original PDF and token.
          await db.updateQuote(quote.id, { pdfUrl });
          const html = buildQuoteEmailHtml({
            customerName: customer?.name ?? "Customer", siteName: site?.name ?? "",
            jobNumber: job?.jobNumber ?? "", total: parseFloat(String(quote.total)),
            acceptUrl, pdfUrl: pdfUrl!,
          });
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ENV.resendApiKey}`,
              "Idempotency-Key": input.requestId,
            },
            body: JSON.stringify({
              from: `${company?.name ?? "Inspectra"} <noreply@inspectrafire.ca>`,
              to: [input.customerEmail],
              subject: `Deficiency Repair Quote — ${site?.name ?? ""} (${job?.jobNumber ?? ""})`,
              html,
              attachments: [{ filename: `quote-${quote.id}.pdf`, content: pdfBuffer.toString("base64") }],
            }),
          });
          if (!response.ok) {
            if ([401, 403, 429].includes(response.status)) {
              throw new EmailProviderRejected(`Provider rejected the quote (${response.status})`);
            }
            throw new Error(`Quote delivery outcome needs reconciliation (${response.status})`);
          }
          const receipt = await response.json() as { id?: unknown };
          if (typeof receipt?.id !== "string" || !receipt.id.trim()) {
            throw new Error("Quote delivery outcome needs reconciliation: provider returned no message ID");
          }
          return { id: receipt.id };
        },
      });
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // An accepted receipt may be replayed after the customer has acted.
      // Never downgrade that later decision back to sent.
      await database.update(quotes).set({ status: "sent", sentAt: sql`COALESCE(${quotes.sentAt}, NOW())` })
        .where(and(eq(quotes.id, authorizedQuote.id), eq(quotes.companyId, authorizedQuote.companyId), inArray(quotes.status, ["draft", "sent"])));
      return { success: true, pdfUrl, acceptance: result.acceptance, messageId: result.id };
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

      await assertBuildingQuoteLinks(ctx.user.companyId!, input.siteId ?? 0, input.customerOrgId ?? 0);

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
      const authorizedQuote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      if (authorizedQuote.quoteType !== "building") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a building quote." });
      }
      await withLockedStandardQuote(ctx, "quote.updateBuilding", input.id, authorizedQuote.companyId, async (quote, tx) => {
        if (quote.quoteType !== "building") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a building quote." });
        }
        await assertStandardQuoteEditable(quote, tx);
        const siteId = input.siteId ?? quote.siteId;
        const customerOrgId = input.customerOrgId ?? quote.customerOrgId;
        await assertBuildingQuoteLinks(quote.companyId, siteId, customerOrgId);
        const existingItems = quote.lineItems;
        const serviceItems: QuoteLineItem[] = input.serviceLines === undefined
          ? existingItems.filter(i => i.type !== "labour")
          : input.serviceLines.map(s => ({
            deficiencyId: null, description: s.description, unitPrice: s.unitPrice,
            qty: s.qty, type: "service", lineNotes: s.lineNotes,
          }));
        const labourItems: QuoteLineItem[] = input.labourLines === undefined
          ? existingItems.filter(i => i.type === "labour")
          : input.labourLines.map(l => ({
            deficiencyId: null, description: l.labourType, unitPrice: l.rate,
            qty: 1, type: "labour", hours: l.hours, rate: l.rate, lineNotes: l.lineNotes,
          }));
        if (!serviceItems.length && !labourItems.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "At least one service or labour line is required." });
        }
        const discount = input.discount ?? Number(quote.discount ?? 0);
        const subtotal = serviceItems.reduce((sum, i) => sum + i.unitPrice * i.qty, 0)
          + labourItems.reduce((sum, i) => sum + (i.hours ?? 0) * (i.rate ?? i.unitPrice), 0);
        await tx.update(quotes).set({
          siteId, customerOrgId,
          lineItems: [...serviceItems, ...labourItems],
          notes: input.comments ?? quote.notes,
          total: (subtotal * (1 - discount / 100)).toFixed(2),
          ...(input.buildingInfo && { buildingInfo: input.buildingInfo }),
          ...(input.discount !== undefined && { discount: input.discount.toFixed(2) }),
          ...(input.discountReason !== undefined && { discountReason: input.discountReason }),
        }).where(eq(quotes.id, quote.id));
      });

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
      const quote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      const company = await db.getCompanyById(quote.companyId);
      return { quote, company };
    }),

  /**
   * Generate and store a PDF for a building quote. Returns the S3 URL.
   */
  downloadBuildingPDF: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const quote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      if (quote.quoteType !== "building") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a building quote." });
      }

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

      const pdfBuffer = await generateBuildingQuotePDF(buildCustomerSafeBuildingQuoteData({
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
      }));

      // A draft can change while PDF/storage work is in flight. Never overwrite
      // a previously shared object's bytes, or attach the stale PDF to new scope.
      const pdfKey = `quotes/${quote.companyId}/${quote.id}/building-quote-${quote.id}-${crypto.randomUUID()}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      await withLockedStandardQuote(ctx, "quote.downloadBuildingPDF", quote.id, quote.companyId, async (current, tx) => {
        if (standardQuoteContent(current) !== standardQuoteContent(quote)) {
          throw new TRPCError({ code: "CONFLICT", message: "The quote changed while its PDF was being generated. Download the current version again." });
        }
        await tx.update(quotes).set({ pdfUrl }).where(eq(quotes.id, quote.id));
      });

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
      const authorizedQuote = await getQuoteForCompany(input.id, ctx.user.companyId!);
      if (authorizedQuote.quoteType !== "building") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a building quote." });
      }
      if (input.status === "accepted") {
        assertStandardQuoteStatusTransition(authorizedQuote, "accepted");
        await approveStandardQuoteFromCustomer(authorizedQuote, { companyId: authorizedQuote.companyId, name: ctx.user.name ?? "", email: ctx.user.email ?? "" }, ctx);
        return { success: true };
      }
      await withLockedStandardQuote(ctx, "quote.updateBuildingStatus", input.id, authorizedQuote.companyId, async (quote, tx) => {
        assertStandardQuoteStatusTransition(quote, input.status);
        if (input.status === "draft") await assertStandardQuoteEditable(quote, tx);
        await tx.update(quotes).set({
          status: input.status,
          ...(input.status !== "draft" && { finalizedAt: quote.finalizedAt ?? new Date() }),
          ...(input.status === "sent" && !quote.sentAt && { sentAt: new Date() }),
          ...(input.status === "accepted" && !quote.acceptedAt && { acceptedAt: new Date() }),
        }).where(eq(quotes.id, quote.id));
      });
      return { success: true };
    }),

  /**
   * Public token-gated endpoint — customer clicks the accept link.
   * Marks the quote as accepted and flags linked deficiencies as quoted.
   */
  accept: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const candidate = await db.getQuoteByToken(input.token);
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found or link has expired." });
      if (candidate.quoteType === "repair") return approveRepairQuoteFromCustomer(candidate, { token: input.token });
      return approveStandardQuoteFromCustomer(candidate, { token: input.token });
    }),

  listByCustomerOrg: customerProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.customerOrgId;
    if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "No customer org" });
    return db.getQuotesByCustomerOrg(orgId);
  }),

  approveFromPortal: customerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const candidate = await db.getQuoteById(input.id);
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND" });
      if (!ctx.user.customerOrgId || candidate.customerOrgId !== ctx.user.customerOrgId) throw new TRPCError({ code: "FORBIDDEN" });
      if (candidate.quoteType === "repair") {
        return approveRepairQuoteFromCustomer(candidate, {
          customerOrgId: ctx.user.customerOrgId, name: ctx.user.name ?? "", email: ctx.user.email ?? "",
        }, ctx);
      }
      const approvedByName = ctx.user.name ?? "";
      const approvedByEmail = ctx.user.email ?? "";
      const decision = await approveStandardQuoteFromCustomer(candidate, {
        customerOrgId: ctx.user.customerOrgId, name: approvedByName, email: approvedByEmail,
      }, ctx);
      if (decision.alreadyAccepted) return decision;
      const quote = candidate;

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

  declineFromPortal: customerProcedure
    .input(z.object({
      quoteId: z.number(),
      reason: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await withLockedQuoteDecision(input.quoteId, async (quote, tx) => {
        if (!ctx.user.customerOrgId || quote.customerOrgId !== ctx.user.customerOrgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (quote.status === "declined") return;
        await assertQuoteAvailableForDecision(quote, tx);
        await tx.update(quotes).set({
          status: "declined", declinedAt: new Date(),
          finalizedAt: quote.finalizedAt ?? new Date(),
          declinedReason: input.reason ?? null,
          declinedByName: ctx.user.name ?? null,
          declinedByEmail: ctx.user.email ?? null,
        }).where(eq(quotes.id, quote.id));
      });

      return { success: true };
    }),
});

/** Linked IDs must agree with the actual quote, including admin operations. */
async function assertQuoteDeficiencyLinks(jobId: number, items: QuoteLineItem[]) {
  for (const id of Array.from(new Set(items.map(item => item.deficiencyId).filter((id): id is number => id !== null)))) {
    const deficiency = await db.getDeficiencyById(id);
    if (!deficiency || deficiency.jobId !== jobId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Deficiency does not belong to this quote's job." });
    }
  }
}

async function assertBuildingQuoteLinks(companyId: number, siteId: number, customerOrgId: number) {
  if (customerOrgId) {
    const customer = await db.getCustomerOrgById(customerOrgId);
    if (!customer || customer.companyId !== companyId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Customer does not belong to this quote's company." });
    }
  }
  if (siteId) {
    const site = await db.getSiteById(siteId);
    if (!site || site.companyId !== companyId || (customerOrgId && site.customerOrgId !== customerOrgId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Site does not belong to this quote's company and customer." });
    }
  }
}

function standardQuoteContent(quote: typeof quotes.$inferSelect): string {
  return JSON.stringify({
    companyId: quote.companyId, jobId: quote.jobId, siteId: quote.siteId,
    customerOrgId: quote.customerOrgId, quoteType: quote.quoteType,
    lineItems: quote.lineItems, total: quote.total, notes: quote.notes,
    buildingInfo: quote.buildingInfo, discount: quote.discount, discountReason: quote.discountReason,
  });
}

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
