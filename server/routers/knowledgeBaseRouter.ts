/**
 * knowledgeBaseRouter — Internal AI knowledge base management.
 *
 * Rules:
 * - admin/office can manage all items (list, create, update, deactivate)
 * - technicians can read technician-visible items (read-only)
 * - customers cannot access in v1
 * - companyId always from ctx.user.companyId — never trusted from client
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";

// ── Constants ─────────────────────────────────────────────────────────────────

export const KB_CATEGORIES = [
  "sop",
  "code_reference",
  "inspection_guidance",
  "deficiency_wording",
  "quote_template",
  "report_template",
  "customer_message",
  "manufacturer_manual",
  "site_note",
  "training_note",
  "other",
] as const;

export const KB_SYSTEM_TYPES = [
  "fire_alarm",
  "sprinkler",
  "emergency_lighting",
  "fire_extinguisher",
  "backflow",
  "smoke_alarm",
  "general",
] as const;

export const KB_VISIBILITY = ["admin_office", "technician", "ai_only"] as const;

// ── Shared input schemas ──────────────────────────────────────────────────────

const itemWriteSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.string().min(1).max(50),
  content: z.string().max(20000).optional(),
  systemType: z.string().max(50).optional(),
  tagsJson: z.array(z.string().max(50)).max(20).optional(),
  visibility: z.enum(["admin_office", "technician", "ai_only"]).default("admin_office"),
  siteId: z.number().int().positive().optional(),
  customerOrgId: z.number().int().positive().optional(),
  sourceType: z.enum(["manual", "file", "document"]).default("manual"),
  sourceFileId: z.number().int().positive().optional(),
  sourceDocumentId: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const knowledgeBaseRouter = router({

  list: officeProcedure
    .input(z.object({
      search: z.string().max(200).optional(),
      category: z.string().max(50).optional(),
      systemType: z.string().max(50).optional(),
      visibility: z.enum(["admin_office", "technician", "ai_only"]).optional(),
      includeInactive: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(200),
    }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const items = await db.listKnowledgeBase(companyId, {
        category: input.category,
        systemType: input.systemType,
        visibility: input.visibility,
        includeInactive: input.includeInactive,
        search: input.search,
        limit: input.limit,
      });
      return items;
    }),

  get: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const item = await db.getKnowledgeBaseById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      if (item.companyId !== ctx.user.companyId!) throw new TRPCError({ code: "FORBIDDEN" });
      return item;
    }),

  create: officeProcedure
    .input(itemWriteSchema)
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const item = await db.createKnowledgeBaseEntry({
        companyId,
        title: input.title,
        category: input.category,
        content: input.content ?? null,
        fileKey: null,
        fileUrl: null,
        uploadedById: ctx.user.id,
        isActive: input.isActive,
        systemType: input.systemType ?? null,
        tagsJson: input.tagsJson ?? null,
        visibility: input.visibility,
        siteId: input.siteId ?? null,
        customerOrgId: input.customerOrgId ?? null,
        sourceType: input.sourceType,
        sourceFileId: input.sourceFileId ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
      } as any);

      void logActivity({
        ctx,
        entityType: "knowledge_base",
        entityId: item.id,
        eventType: "knowledge_base.created",
        title: `Knowledge item created: ${input.title}`,
        metadata: { category: input.category, systemType: input.systemType, visibility: input.visibility },
      });

      return item;
    }),

  update: officeProcedure
    .input(z.object({ id: z.number().int().positive() }).merge(itemWriteSchema))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getKnowledgeBaseById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.companyId !== ctx.user.companyId!) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateKnowledgeBaseEntry(input.id, {
        title: input.title,
        category: input.category,
        content: input.content ?? null,
        systemType: input.systemType ?? null,
        tagsJson: input.tagsJson ?? null,
        visibility: input.visibility,
        siteId: input.siteId ?? null,
        customerOrgId: input.customerOrgId ?? null,
        sourceType: input.sourceType,
        sourceFileId: input.sourceFileId ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        isActive: input.isActive,
      } as any);

      void logActivity({
        ctx,
        entityType: "knowledge_base",
        entityId: input.id,
        eventType: "knowledge_base.updated",
        title: `Knowledge item updated: ${input.title}`,
        metadata: { category: input.category, systemType: input.systemType },
      });

      return { success: true as const };
    }),

  deactivate: officeProcedure
    .input(z.object({ id: z.number().int().positive(), reactivate: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getKnowledgeBaseById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.companyId !== ctx.user.companyId!) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateKnowledgeBaseEntry(input.id, { isActive: input.reactivate });

      void logActivity({
        ctx,
        entityType: "knowledge_base",
        entityId: input.id,
        eventType: input.reactivate ? "knowledge_base.reactivated" : "knowledge_base.deactivated",
        title: `Knowledge item ${input.reactivate ? "reactivated" : "deactivated"}: ${existing.title}`,
        metadata: {},
      });

      return { success: true as const };
    }),

  search: officeProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      systemType: z.string().max(50).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const results = await db.getRelevantKnowledgeContext(companyId, input.query, {
        systemType: input.systemType,
        limit: input.limit,
      });
      return results;
    }),

  getRelevantContext: officeProcedure
    .input(z.object({
      query: z.string().min(1).max(500),
      mode: z.string().max(50).optional(),
      systemType: z.string().max(50).optional(),
      limit: z.number().int().min(1).max(10).default(3),
    }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const snippets = await db.getRelevantKnowledgeContext(companyId, input.query, {
        mode: input.mode,
        systemType: input.systemType,
        limit: input.limit,
      });
      return snippets;
    }),
});
