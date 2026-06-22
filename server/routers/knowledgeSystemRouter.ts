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
import { invokeLLM, transcribeAudio } from "../_core/llm";
import { logActivity } from "../activityLogger";
import { KNOWLEDGE_DOCUMENT_TYPES } from "../../drizzle/schema";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB decoded — under Whisper's 25MB cap too
const STORED_TEXT_CAP = 60000; // stay within MySQL TEXT (~64KB) and match what was classified
const QA_MODEL = "gpt-4o-mini";

// Document types whose facts describe the property as of a single visit, so a
// later document of the same type may supersede them (unlike manuals/codes/
// procedures, which don't go stale just because a new inspection happened).
const STALE_PRONE_DOCUMENT_TYPES = new Set(["inspection_report", "voice_note"]);

// Fact source types that describe the property's current state, as opposed to
// a durable reference (manufacturer_doc/code_requirement/company_procedure)
// that doesn't change just because a service visit occurred.
const POINT_IN_TIME_FACT_SOURCE_TYPES = new Set(["technician_observation", "ai_inference"]);

// Whisper's supported container/codec list, minus formats this app has no other use for.
const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  mpeg: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
};

// Mirrors the SYSTEM_OPTIONS list used elsewhere (e.g. RepairQuoteDetail) so
// site-system knowledge pages line up with the same categories the rest of
// the app already inspects/repairs against.
const SITE_SYSTEM_TYPES = ["FIRE_ALARM", "SMOKE_ALARM", "FIRE_EXTINGUISHER", "EMERGENCY_LIGHTING", "SPRINKLER", "BACKFLOW", "OTHER"] as const;
const SYSTEM_LABELS: Record<string, string> = {
  FIRE_ALARM: "Fire Alarm",
  SMOKE_ALARM: "Smoke Alarm",
  FIRE_EXTINGUISHER: "Fire Extinguisher",
  EMERGENCY_LIGHTING: "Emergency Lighting",
  SPRINKLER: "Sprinkler",
  BACKFLOW: "Backflow",
  OTHER: "Other",
};

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

/**
 * Active, completed service schedules for a page's site that are relevant to
 * what the page covers — all systems for a site/equipment page, or only the
 * matching system for a site_system page (matched against serviceType text
 * since requiredSystems is never populated by any current write path).
 */
async function getRelevantServiceSchedules(
  page: { siteId: number | null; subjectType: string; systemType: string | null },
  companyId: number,
) {
  if (!page.siteId) return [];
  const schedules = await db.getServiceSchedulesBySite(page.siteId);
  const completed = schedules.filter((s) => s.companyId === companyId && s.active && s.lastCompletedAt);

  if (page.subjectType !== "site_system" || !page.systemType) return completed;

  const systemLabel = SYSTEM_LABELS[page.systemType]?.toLowerCase();
  return completed.filter((s) => {
    if (s.requiredSystems?.includes(page.systemType!)) return true;
    return !!systemLabel && s.serviceType.toLowerCase().includes(systemLabel);
  });
}

/** Load an equipment model and assert it belongs to the caller's company. */
async function assertEquipmentModelCompany(modelId: number, companyId: number) {
  const model = await db.getEquipmentModelById(modelId);
  if (!model) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment model not found" });
  if (model.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return model;
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

  /**
   * Returns the site's existing knowledge page for one system category (e.g.
   * this property's Sprinkler system), creating one if none exists. Distinct
   * from the general property page so system-specific facts (test frequency,
   * panel model, valve locations) stay scoped to readers asking about that
   * system rather than mixed into general property knowledge.
   */
  getOrCreateForSiteSystem: officeProcedure
    .input(z.object({
      siteId: z.number().int().positive(),
      systemType: z.enum(SITE_SYSTEM_TYPES),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const site = await assertSiteCompany(input.siteId, companyId);

      const existing = await db.listKnowledgePagesBySite(companyId, input.siteId);
      const systemPage = existing.find(
        (p) => p.subjectType === "site_system" && p.systemType === input.systemType,
      );
      if (systemPage) return systemPage;

      const page = await db.createKnowledgePage({
        companyId,
        subjectType: "site_system",
        siteId: input.siteId,
        systemType: input.systemType,
        title: `${site.name} — ${SYSTEM_LABELS[input.systemType]} Knowledge`,
        createdById: ctx.user.id,
      });

      void logActivity({
        ctx,
        entityType: "knowledge_page",
        entityId: page.id,
        eventType: "knowledge_page.created",
        title: `${SYSTEM_LABELS[input.systemType]} knowledge page created for ${site.name}`,
        metadata: { siteId: input.siteId, systemType: input.systemType },
      });

      return page;
    }),
});

// ── Equipment models ──────────────────────────────────────────────────────────

export const knowledgeEquipmentRouter = router({
  listModels: technicianProcedure.query(async ({ ctx }) => {
    return db.listEquipmentModels(ctx.user.companyId!);
  }),

  getModel: technicianProcedure
    .input(z.object({ equipmentModelId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return assertEquipmentModelCompany(input.equipmentModelId, ctx.user.companyId!);
    }),

  listPages: technicianProcedure
    .input(z.object({ equipmentModelId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      await assertEquipmentModelCompany(input.equipmentModelId, companyId);
      return db.listKnowledgePagesByEquipmentModel(companyId, input.equipmentModelId);
    }),

  /** Find an existing manufacturer+model for the company, or register a new one. */
  createModel: officeProcedure
    .input(z.object({
      manufacturer: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      deviceType: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const manufacturer = input.manufacturer.trim();
      const model = input.model.trim();

      const existing = await db.findEquipmentModel(companyId, manufacturer, model);
      if (existing) return existing;

      const created = await db.createEquipmentModel({
        companyId,
        manufacturer,
        model,
        deviceType: input.deviceType?.trim() || null,
      });

      void logActivity({
        ctx,
        entityType: "equipment_model",
        entityId: created.id,
        eventType: "equipment_model.created",
        title: `Equipment model registered: ${manufacturer} ${model}`,
      });

      return created;
    }),

  /** Returns the equipment model's knowledge page, creating one if none exists. */
  getOrCreateForModel: officeProcedure
    .input(z.object({ equipmentModelId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const model = await assertEquipmentModelCompany(input.equipmentModelId, companyId);

      const existing = await db.listKnowledgePagesByEquipmentModel(companyId, input.equipmentModelId);
      const modelPage = existing.find((p) => p.subjectType === "equipment_model");
      if (modelPage) return modelPage;

      const page = await db.createKnowledgePage({
        companyId,
        subjectType: "equipment_model",
        equipmentModelId: input.equipmentModelId,
        title: `${model.manufacturer} ${model.model} — Equipment Knowledge`,
        createdById: ctx.user.id,
      });

      void logActivity({
        ctx,
        entityType: "knowledge_page",
        entityId: page.id,
        eventType: "knowledge_page.created",
        title: `Equipment knowledge page created for ${model.manufacturer} ${model.model}`,
        metadata: { equipmentModelId: input.equipmentModelId },
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
      pageId: z.number().int().positive(),
      // Optional: site-scoped callers still pass siteId so the cross-tenant
      // check fails fast. Equipment-model pages omit it.
      siteId: z.number().int().positive().optional(),
      documentType: z.enum(KNOWLEDGE_DOCUMENT_TYPES),
      fileName: z.string().min(1).max(255),
      fileDataBase64: z.string().min(1),
      title: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      // Validate siteId first (when supplied) so site-scoped uploads reject
      // cross-tenant access before any page lookup or storage work.
      const preValidatedSite = input.siteId !== undefined
        ? await assertSiteCompany(input.siteId, companyId)
        : null;

      const page = await assertPageCompany(input.pageId, companyId);

      // Resolve the subject (site or equipment model) for storage scoping and
      // classification context. The page's subjectType — not the caller — is the
      // source of truth for which kind of document this is.
      let propertyContext: string;
      let scopeSegment: string;
      let docSiteId: number | null;
      if (page.subjectType === "equipment_model") {
        if (!page.equipmentModelId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Equipment page has no associated model" });
        }
        const model = await assertEquipmentModelCompany(page.equipmentModelId, companyId);
        propertyContext = [
          `Equipment: ${model.manufacturer} ${model.model}`,
          model.deviceType ? `Type: ${model.deviceType}` : "",
        ].filter(Boolean).join("\n");
        scopeSegment = `equipment-${model.id}`;
        docSiteId = null;
      } else {
        if (!page.siteId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Site page has no associated site" });
        }
        if (input.siteId !== undefined && input.siteId !== page.siteId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Page does not belong to this site" });
        }
        const site = preValidatedSite && preValidatedSite.id === page.siteId
          ? preValidatedSite
          : await assertSiteCompany(page.siteId, companyId);
        propertyContext = [
          `Site: ${site.name}`,
          site.address ? `Address: ${site.address}` : "",
          site.city ? `City: ${site.city}` : "",
        ].filter(Boolean).join("\n");
        scopeSegment = String(page.siteId);
        docSiteId = page.siteId;
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

      const isVoiceNote = input.documentType === "voice_note";
      const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
      let mimeType: string;
      if (isVoiceNote) {
        if (!AUDIO_MIME_BY_EXT[ext]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only audio files (mp3, m4a, wav, webm, ogg) are supported for voice notes" });
        }
        mimeType = AUDIO_MIME_BY_EXT[ext];
      } else {
        const isPdf = ext === "pdf" || buffer.subarray(0, 5).toString("latin1") === "%PDF-";
        if (!isPdf) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only PDF documents are supported for this document type" });
        }
        mimeType = "application/pdf";
      }

      // Store original to S3/R2 under a company-scoped key.
      const safeName = sanitizeFilename(input.fileName);
      const fileKey = `${companyId}/knowledge/${scopeSegment}/${safeName}-${crypto.randomBytes(4).toString("hex")}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, mimeType);

      const sourceDoc = await db.createKnowledgeSourceDocument({
        companyId,
        siteId: docSiteId,
        pageId: input.pageId,
        documentType: input.documentType,
        title: input.title?.trim() || input.fileName,
        fileKey,
        fileUrl,
        mimeType,
        fileSize: buffer.length,
        extractionStatus: "extracting",
        uploadedById: ctx.user.id,
      });

      // Extract text — transcribe audio for voice notes, parse text for PDFs.
      let extractedText = "";
      try {
        extractedText = isVoiceNote
          ? await transcribeAudio(buffer, safeName, mimeType)
          : await extractPdfText(buffer);
      } catch (err) {
        await db.updateKnowledgeSourceDocument(sourceDoc.id, {
          extractionStatus: "failed",
          errorMessage: `${isVoiceNote ? "Transcription" : "Text extraction"} failed: ${String(err)}`.slice(0, 2000),
        });
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message: isVoiceNote ? "Could not transcribe this audio file" : "Could not extract text from this PDF",
        });
      }

      const storedText = extractedText.slice(0, STORED_TEXT_CAP);
      await db.updateKnowledgeSourceDocument(sourceDoc.id, {
        extractionStatus: "classifying",
        extractedText: storedText,
      });

      if (!extractedText.trim()) {
        await db.updateKnowledgeSourceDocument(sourceDoc.id, {
          extractionStatus: "failed",
          errorMessage: isVoiceNote ? "Transcription returned no speech" : "No extractable text (document may be a scanned image)",
        });
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message: isVoiceNote ? "No speech detected in this audio file" : "No extractable text found (is this a scanned image?)",
        });
      }

      // Classify into candidate facts.
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
        title: `Ingested ${input.documentType} into ${page.title}`,
        metadata: { siteId: docSiteId, pageId: input.pageId, factsCreated, model: classification.modelUsed },
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
      const page = await assertPageCompany(input.pageId, companyId);

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

      const sourceDocs = await db.listKnowledgeSourceDocumentsByPage(companyId, input.pageId);
      const docById = new Map(sourceDocs.map((d) => [d.id, d]));
      const latestByDocType = new Map<string, Date>();
      for (const d of sourceDocs) {
        const current = latestByDocType.get(d.documentType);
        if (!current || d.createdAt > current) latestByDocType.set(d.documentType, d.createdAt);
      }

      const relevantSchedules = await getRelevantServiceSchedules(page, companyId);

      return facts.map((f) => {
        const factCitations = byFact.get(f.id) ?? [];

        const docCitations = factCitations
          .filter((c) => c.sourceType === "knowledge_source_document" && c.sourceId !== null)
          .map((c) => docById.get(c.sourceId!))
          .filter((d): d is NonNullable<typeof d> => d !== undefined);

        const supersededByNewerDocument = docCitations.some((doc) => {
          if (!STALE_PRONE_DOCUMENT_TYPES.has(doc.documentType)) return false;
          const latest = latestByDocType.get(doc.documentType);
          return latest !== undefined && latest > doc.createdAt;
        });

        // Anchor: when this fact's truth was established — the latest of its
        // cited source documents, falling back to the fact's own createdAt.
        const establishedAt = docCitations.length > 0
          ? new Date(Math.max(...docCitations.map((d) => d.createdAt.getTime())))
          : f.createdAt;
        const supersededByServiceVisit = POINT_IN_TIME_FACT_SOURCE_TYPES.has(f.sourceType)
          && relevantSchedules.some((s) => s.lastCompletedAt && s.lastCompletedAt > establishedAt);

        return {
          ...f,
          citations: factCitations,
          potentiallyOutdated: supersededByNewerDocument || supersededByServiceVisit,
        };
      });
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
