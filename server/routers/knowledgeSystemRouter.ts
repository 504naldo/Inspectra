/**
 * Property & Equipment Knowledge System routers.
 *
 * Hard rules enforced here (see plan §9, §10):
 * - Every procedure validates ctx.user.companyId against the target record's
 *   companyId. Role middleware never scopes by company on its own.
 * - Write procedures are office/admin only. Reads use technicianProcedure (which
 *   also admits office/admin); technicians see VERIFIED facts only.
 * - No customerProcedure anywhere — customers get no access to this feature.
 * - AI-generated facts are rejected unless they carry >=1 source citation.
 * - Nothing here writes to reports/attachments/inspection_results/deficiencies.
 *   Original source records are only read and referenced by id.
 * - "verified" status can only be set by an explicit human action, never by the
 *   ingestion pipeline regardless of model confidence.
 */

import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";
import { extractPdfText } from "../_core/pdfImport";
import { classifyDocumentText } from "../_core/knowledgeExtraction";
import { invokeLLM } from "../_core/llm";
import { logActivity } from "../activityLogger";
import { KNOWLEDGE_DOCUMENT_TYPES } from "../../drizzle/schema";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB decoded — well within the 50MB body limit
const STORED_TEXT_CAP = 60000; // stay within MySQL TEXT (~64KB) and match what was classified
const QA_MODEL = "gpt-4o-mini";

function sanitizeFilename(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "").replace(/_{2,}/g, "_").slice(0, 120) || "document";
}

/** Load a site and assert it belongs to the caller's company. */
async function assertSiteCompany(siteId: number, companyId: number) {
  const site = await db.getSiteById(siteId);
  if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
  if (site.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return site;
}

/** Load a knowledge page and assert it belongs to the caller's company. */
async function assertPageCompany(pageId: number, companyId: number) {
  const page = await db.getKnowledgePageById(pageId);
  if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge page not found" });
  if (page.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return page;
}

/** Load a fact and assert it belongs to the caller's company. */
async function assertFactCompany(factId: number, companyId: number) {
  const fact = await db.getKnowledgeFactById(factId);
  if (!fact) throw new TRPCError({ code: "NOT_FOUND", message: "Fact not found" });
  if (fact.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return fact;
}

// ── Pages ───────────────────────────────────────────────────────────────────

export const knowledgePageRouter = router({
  listBySite: technicianProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      await assertSiteCompany(input.siteId, companyId);
      return db.listKnowledgePagesBySite(companyId, input.siteId);
    }),

  get: technicianProcedure
    .input(z.object({ pageId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return assertPageCompany(input.pageId, ctx.user.companyId!);
    }),

  /** Returns the site's existing property page, creating one if none exists. */
  getOrCreateForSite: officeProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const site = await assertSiteCompany(input.siteId, companyId);

      const existing = await db.listKnowledgePagesBySite(companyId, input.siteId);
      const sitePage = existing.find((p) => p.subjectType === "site");
      if (sitePage) return sitePage;

      const page = await db.createKnowledgePage({
        companyId,
        subjectType: "site",
        siteId: input.siteId,
        title: `${site.name} — Property Knowledge`,
        createdById: ctx.user.id,
      });

      void logActivity({
        ctx,
        entityType: "knowledge_page",
        entityId: page.id,
        eventType: "knowledge_page.created",
        title: `Property knowledge page created for ${site.name}`,
        metadata: { siteId: input.siteId },
      });

      return page;
    }),
});

// ── Ingestion ─────────────────────────────────────────────────────────────────

export const knowledgeIngestionRouter = router({
  /**
   * Full synchronous ingest: store the file, extract text, classify into draft
   * facts, persist each with a source citation. Status advances on the source
   * document row so a future async/queue split is non-breaking.
   */
  ingestDocument: officeProcedure
    .input(z.object({
      siteId: z.number().int().positive(),
      pageId: z.number().int().positive(),
      documentType: z.enum(KNOWLEDGE_DOCUMENT_TYPES),
      fileName: z.string().min(1).max(255),
      fileDataBase64: z.string().min(1),
      title: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const site = await assertSiteCompany(input.siteId, companyId);
      const page = await assertPageCompany(input.pageId, companyId);
      if (page.siteId !== input.siteId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Page does not belong to this site" });
      }

      // Decode + validate the upload.
      const base64 = input.fileDataBase64.includes(",")
        ? input.fileDataBase64.slice(input.fileDataBase64.indexOf(",") + 1)
        : input.fileDataBase64;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(base64, "base64");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File data is not valid base64" });
      }
      if (buffer.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Empty file" });
      if (buffer.length > MAX_FILE_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File exceeds 20MB limit" });
      }
      const isPdf =
        input.fileName.toLowerCase().endsWith(".pdf") ||
        buffer.subarray(0, 5).toString("latin1") === "%PDF-";
      if (!isPdf) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only PDF documents are supported in this version" });
      }

      // Store original to S3/R2 under a company-scoped key.
      const safeName = sanitizeFilename(input.fileName);
      const fileKey = `${companyId}/knowledge/${input.siteId}/${safeName}-${crypto.randomBytes(4).toString("hex")}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, "application/pdf");

      const sourceDoc = await db.createKnowledgeSourceDocument({
        companyId,
        siteId: input.siteId,
        pageId: input.pageId,
        documentType: input.documentType,
        title: input.title?.trim() || input.fileName,
        fileKey,
        fileUrl,
        mimeType: "application/pdf",
        fileSize: buffer.length,
        extractionStatus: "extracting",
        uploadedById: ctx.user.id,
      });

      // Extract text.
      let extractedText = "";
      try {
        extractedText = await extractPdfText(buffer);
      } catch (err) {
        await db.updateKnowledgeSourceDocument(sourceDoc.id, {
          extractionStatus: "failed",
          errorMessage: `Text extraction failed: ${String(err)}`.slice(0, 2000),
        });
        throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "Could not extract text from this PDF" });
      }

      const storedText = extractedText.slice(0, STORED_TEXT_CAP);
      await db.updateKnowledgeSourceDocument(sourceDoc.id, {
        extractionStatus: "classifying",
        extractedText: storedText,
      });

      if (!extractedText.trim()) {
        await db.updateKnowledgeSourceDocument(sourceDoc.id, {
          extractionStatus: "failed",
          errorMessage: "No extractable text (document may be a scanned image)",
        });
        throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "No extractable text found (is this a scanned image?)" });
      }

      // Classify into candidate facts.
      const propertyContext = [
        `Site: ${site.name}`,
        site.address ? `Address: ${site.address}` : "",
        site.city ? `City: ${site.city}` : "",
      ].filter(Boolean).join("\n");

      let classification;
      try {
        classification = await classifyDocumentText({
          text: extractedText,
          documentType: input.documentType,
          propertyContext,
        });
      } catch (err) {
        await db.updateKnowledgeSourceDocument(sourceDoc.id, {
          extractionStatus: "failed",
          errorMessage: `Classification failed: ${String(err)}`.slice(0, 2000),
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI classification failed" });
      }

      // Persist each candidate as a DRAFT fact with a source citation. A fact is
      // only created when it has a non-empty excerpt — enforcing the "every AI
      // statement keeps a reference to its source" rule at the write boundary.
      let factsCreated = 0;
      for (const cand of classification.facts) {
        if (!cand.content.trim() || !cand.citationExcerpt.trim()) continue;
        const fact = await db.createKnowledgeFact({
          companyId,
          pageId: input.pageId,
          content: cand.content,
          sourceType: cand.sourceType,
          status: "draft",
          confidence: cand.confidence,
          generatedByAi: true,
          aiModelId: classification.modelUsed,
          aiPromptHash: classification.promptHash,
          aiContext: { sourceDocumentId: sourceDoc.id, documentType: input.documentType },
          createdById: ctx.user.id,
        });
        await db.createKnowledgeFactCitation({
          companyId,
          factId: fact.id,
          sourceType: "knowledge_source_document",
          sourceId: sourceDoc.id,
          excerpt: cand.citationExcerpt.slice(0, 2000),
          locationRef: cand.locationRef,
        });
        factsCreated++;
      }

      await db.updateKnowledgeSourceDocument(sourceDoc.id, { extractionStatus: "ready" });
      await db.touchKnowledgePage(input.pageId);

      void logActivity({
        ctx,
        entityType: "knowledge_source_document",
        entityId: sourceDoc.id,
        eventType: "knowledge_document.ingested",
        title: `Ingested ${input.documentType} for ${site.name}`,
        metadata: { siteId: input.siteId, pageId: input.pageId, factsCreated, model: classification.modelUsed },
      });

      return {
        sourceDocumentId: sourceDoc.id,
        status: "ready" as const,
        factsCreated,
      };
    }),

  listSourceDocuments: officeProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      await assertSiteCompany(input.siteId, companyId);
      const docs = await db.listKnowledgeSourceDocumentsBySite(companyId, input.siteId);
      // Never return the raw extracted text in list view.
      return docs.map(({ extractedText: _omit, ...rest }) => rest);
    }),
});

// ── Facts (review / approval) ──────────────────────────────────────────────────

export const knowledgeFactRouter = router({
  /**
   * List facts for a page with their citations.
   * Office/admin see every status; technicians see VERIFIED facts only.
   */
  listForPage: technicianProcedure
    .input(z.object({ pageId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      await assertPageCompany(input.pageId, companyId);

      const isReviewer = ctx.user.role === "admin" || ctx.user.role === "office";
      const facts = await db.listKnowledgeFactsByPage(
        input.pageId,
        isReviewer ? {} : { statuses: ["verified"] },
      );

      const citations = await db.listCitationsByFactIds(facts.map((f) => f.id));
      const byFact = new Map<number, typeof citations>();
      for (const c of citations) {
        const arr = byFact.get(c.factId) ?? [];
        arr.push(c);
        byFact.set(c.factId, arr);
      }

      return facts.map((f) => ({ ...f, citations: byFact.get(f.id) ?? [] }));
    }),

  markReviewed: officeProcedure
    .input(z.object({ factId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const fact = await assertFactCompany(input.factId, ctx.user.companyId!);
      if (fact.status === "rejected" || fact.status === "stale") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot review a ${fact.status} fact` });
      }
      await db.updateKnowledgeFact(input.factId, {
        status: "reviewed",
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      });
      void logActivity({
        ctx,
        entityType: "knowledge_fact",
        entityId: input.factId,
        eventType: "knowledge_fact.reviewed",
        title: "Knowledge fact marked reviewed",
        metadata: { pageId: fact.pageId },
      });
      return { success: true as const };
    }),

  /** Explicit human verification — the only path to 'verified'. */
  approve: officeProcedure
    .input(z.object({ factId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const fact = await assertFactCompany(input.factId, ctx.user.companyId!);
      if (fact.status === "rejected" || fact.status === "stale") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot verify a ${fact.status} fact` });
      }
      // Guarantee: an AI fact can never be verified without a source citation.
      if (fact.generatedByAi) {
        const citationCount = await db.countCitationsForFact(input.factId);
        if (citationCount === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot verify an AI fact with no source citation" });
        }
      }
      await db.updateKnowledgeFact(input.factId, {
        status: "verified",
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      });
      void logActivity({
        ctx,
        entityType: "knowledge_fact",
        entityId: input.factId,
        eventType: "knowledge_fact.verified",
        title: "Knowledge fact verified",
        metadata: { pageId: fact.pageId, sourceType: fact.sourceType },
      });
      return { success: true as const };
    }),

  reject: officeProcedure
    .input(z.object({ factId: z.number().int().positive(), reason: z.string().max(1000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const fact = await assertFactCompany(input.factId, ctx.user.companyId!);
      await db.updateKnowledgeFact(input.factId, {
        status: "rejected",
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
        rejectionReason: input.reason ?? null,
      });
      void logActivity({
        ctx,
        entityType: "knowledge_fact",
        entityId: input.factId,
        eventType: "knowledge_fact.rejected",
        title: "Knowledge fact rejected",
        metadata: { pageId: fact.pageId },
      });
      return { success: true as const };
    }),

  /**
   * Edit a fact's wording. Append-only: creates a NEW draft fact pointing back
   * at the original via supersedesFactId, copies its citations forward, and
   * marks the original 'stale'. The original row is never destroyed.
   */
  edit: officeProcedure
    .input(z.object({ factId: z.number().int().positive(), content: z.string().min(1).max(5000) }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const original = await assertFactCompany(input.factId, companyId);

      const newFact = await db.createKnowledgeFact({
        companyId,
        pageId: original.pageId,
        content: input.content.trim(),
        sourceType: original.sourceType,
        status: "draft",
        confidence: original.confidence,
        generatedByAi: false,
        supersedesFactId: original.id,
        aiContext: original.aiContext,
        createdById: ctx.user.id,
      });

      // Carry citations forward so the edited fact keeps its sources.
      const citations = await db.listCitationsByFactIds([original.id]);
      for (const c of citations) {
        await db.createKnowledgeFactCitation({
          companyId,
          factId: newFact.id,
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          excerpt: c.excerpt,
          locationRef: c.locationRef,
        });
      }

      await db.updateKnowledgeFact(original.id, { status: "stale" });

      void logActivity({
        ctx,
        entityType: "knowledge_fact",
        entityId: newFact.id,
        eventType: "knowledge_fact.edited",
        title: "Knowledge fact edited (new version created)",
        metadata: { pageId: original.pageId, supersedesFactId: original.id },
      });

      return { newFactId: newFact.id };
    }),
});

// ── Source-linked Q&A ──────────────────────────────────────────────────────────

export const knowledgeQARouter = router({
  /**
   * Answer a question grounded ONLY in this page's facts. Technicians are
   * grounded on verified facts; office/admin may also draw on draft/reviewed
   * facts (each citation carries its status so unverified sources are visible).
   * Every answer is logged to knowledge_questions.
   */
  ask: technicianProcedure
    .input(z.object({
      pageId: z.number().int().positive(),
      question: z.string().min(1).max(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const page = await assertPageCompany(input.pageId, companyId);

      const isReviewer = ctx.user.role === "admin" || ctx.user.role === "office";
      const facts = await db.listKnowledgeFactsByPage(
        input.pageId,
        isReviewer ? { statuses: ["draft", "reviewed", "verified"] } : { statuses: ["verified"] },
      );

      if (facts.length === 0) {
        return {
          answer: "There is no approved knowledge for this property yet. Upload and verify source documents before asking questions.",
          citedFacts: [] as Array<{ id: number; content: string; status: string; sourceType: string }>,
          disclaimer: "AI answer grounded only in stored knowledge facts. Verify against original records.",
        };
      }

      const factBlock = facts
        .map((f) => `[fact ${f.id} | ${f.sourceType} | status: ${f.status}] ${f.content}`)
        .join("\n");

      const result = await invokeLLM({
        model: QA_MODEL,
        messages: [
          {
            role: "system",
            content: `You answer questions about a specific property using ONLY the provided facts. Rules:
- Use only the facts listed. Never add outside knowledge or assumptions.
- If the facts do not answer the question, say so plainly.
- Cite the fact id(s) you used in cited_fact_ids. Only cite ids from the list.
- Do not present anything as an approved or certified life-safety procedure.`,
          },
          {
            role: "user",
            content: `PROPERTY: ${page.title}\n\nFACTS:\n${factBlock}\n\nQUESTION: ${input.question}\n\nReturn JSON only.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "grounded_answer",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                cited_fact_ids: { type: "array", items: { type: "number" } },
              },
              required: ["answer", "cited_fact_ids"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 700,
      });

      const raw = result.choices[0]?.message?.content;
      if (!raw || typeof raw !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      }
      const parsed = JSON.parse(raw) as { answer: string; cited_fact_ids: number[] };

      // Only keep cited ids that are actually in the company/page-scoped set —
      // the model can never surface a fact it wasn't given.
      const validIds = new Set(facts.map((f) => f.id));
      const citedIds = (parsed.cited_fact_ids ?? []).filter((id) => validIds.has(id));
      const citedFacts = facts
        .filter((f) => citedIds.includes(f.id))
        .map((f) => ({ id: f.id, content: f.content, status: f.status, sourceType: f.sourceType }));

      const citations = await db.listCitationsByFactIds(citedIds);

      await db.createKnowledgeQuestion({
        companyId,
        pageId: input.pageId,
        askedById: ctx.user.id,
        question: input.question,
        answer: parsed.answer,
        citedFactIds: citedIds,
        modelUsed: QA_MODEL,
      });

      void logActivity({
        ctx,
        entityType: "knowledge_page",
        entityId: input.pageId,
        eventType: "knowledge_qa.asked",
        title: "Knowledge Q&A asked",
        metadata: { citedFactIds: citedIds },
      });

      return {
        answer: parsed.answer,
        citedFacts,
        citations: citations.map((c) => ({
          factId: c.factId,
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          excerpt: c.excerpt,
          locationRef: c.locationRef,
        })),
        disclaimer: "AI answer grounded only in stored knowledge facts. Verify against original records before acting.",
      };
    }),

  history: officeProcedure
    .input(z.object({ pageId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertPageCompany(input.pageId, ctx.user.companyId!);
      return db.listKnowledgeQuestionsByPage(input.pageId);
    }),
});
