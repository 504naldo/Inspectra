import { z } from "zod";
import { router, technicianProcedure, adminOrOfficeProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import * as db from "../db";
import { attachments } from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { logActivity } from "../activityLogger";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

async function assertDeficiencyAccess(deficiencyId: number, companyId: number) {
  const deficiency = await db.getDeficiencyById(deficiencyId);
  if (!deficiency) throw new TRPCError({ code: "NOT_FOUND", message: "Deficiency not found" });
  const job = await db.getJobById(deficiency.jobId);
  if (!job || job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  if ((job as any).finalizedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Job is finalized" });
  return { deficiency, job };
}

async function assertAttachmentAccess(attachmentId: number, companyId: number) {
  const drizzle = await getDb();
  if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [att] = await drizzle.select().from(attachments).where(eq(attachments.id, attachmentId));
  if (!att) throw new TRPCError({ code: "NOT_FOUND" });
  if (att.entityType === "deficiency") {
    const deficiency = await db.getDeficiencyById(att.entityId);
    if (deficiency) {
      const job = await db.getJobById(deficiency.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
    }
  }
  return { att, drizzle };
}

export const mediaRouter = router({
  listDeficiencyMedia: technicianProcedure
    .input(z.object({ deficiencyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const deficiency = await db.getDeficiencyById(input.deficiencyId);
      if (!deficiency) return [];
      const job = await db.getJobById(deficiency.jobId);
      if (!job || job.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const drizzle = await getDb();
      if (!drizzle) return [];
      return drizzle
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.entityType, "deficiency"),
            eq(attachments.entityId, input.deficiencyId),
            eq(attachments.uploadStatus, "completed"),
          )
        )
        .orderBy(attachments.sortOrder, attachments.createdAt);
    }),

  uploadDeficiencyMedia: technicianProcedure
    .input(
      z.object({
        deficiencyId: z.number(),
        fileName: z.string().max(255),
        mimeType: z.enum(ALLOWED_IMAGE_TYPES),
        fileSize: z.number().max(MAX_IMAGE_BYTES),
        fileData: z.string(),
        caption: z.string().max(500).optional(),
        locationNote: z.string().max(255).optional(),
        // Offline-sync idempotency: the client's stable local id for this queued
        // photo. On reconnect the same upload may be replayed; find-or-create on
        // this key so a retry never duplicates the attachment or storage object.
        idempotencyKey: z.string().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const { deficiency, job } = await assertDeficiencyAccess(input.deficiencyId, companyId);

      // Idempotent replay: if this offline upload was already applied, return the
      // existing attachment without re-uploading to storage or re-inserting.
      if (input.idempotencyKey) {
        const existing = await db.getAttachmentByIdempotencyKey(input.idempotencyKey, "deficiency", input.deficiencyId);
        if (existing) return existing;
      }

      // Sanitise filename to prevent path traversal
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[input.mimeType];
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `${companyId}/deficiencies/${input.deficiencyId}/${randomSuffix}.${ext}`;

      const buffer = Buffer.from(input.fileData, "base64");
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await drizzle.insert(attachments).values({
        entityType: "deficiency",
        entityId: input.deficiencyId,
        jobId: deficiency.jobId,
        siteId: job.siteId,
        uploadedById: ctx.user.id,
        fileName: safeName,
        fileKey,
        fileUrl: url,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        caption: input.caption ?? null,
        locationNote: input.locationNote ?? null,
        isCustomerFacing: 1,
        sortOrder: 0,
        uploadStatus: "completed",
        importStatus: "none",
        idempotencyKey: input.idempotencyKey ?? null,
      });

      logActivity({
        ctx,
        entityType: "deficiency",
        entityId: input.deficiencyId,
        eventType: "photo_added",
        title: `Photo added: ${safeName}`,
      });

      return row;
    }),

  updateDeficiencyMedia: technicianProcedure
    .input(
      z.object({
        id: z.number(),
        caption: z.string().max(500).nullish(),
        locationNote: z.string().max(255).nullish(),
        isCustomerFacing: z.boolean().optional(),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const { drizzle } = await assertAttachmentAccess(input.id, companyId);

      const patch: Record<string, unknown> = {};
      if (input.caption !== undefined) patch.caption = input.caption;
      if (input.locationNote !== undefined) patch.locationNote = input.locationNote;
      if (input.isCustomerFacing !== undefined) patch.isCustomerFacing = input.isCustomerFacing ? 1 : 0;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

      await drizzle.update(attachments).set(patch).where(eq(attachments.id, input.id));
      return { success: true };
    }),

  deleteDeficiencyMedia: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const { drizzle } = await assertAttachmentAccess(input.id, companyId);
      // Soft delete: mark as failed so it no longer appears in queries
      await drizzle.update(attachments).set({ uploadStatus: "failed" }).where(eq(attachments.id, input.id));
      return { success: true };
    }),

  reorderDeficiencyMedia: adminOrOfficeProcedure
    .input(z.object({ deficiencyId: z.number(), orderedIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const deficiency = await db.getDeficiencyById(input.deficiencyId);
      if (!deficiency) throw new TRPCError({ code: "NOT_FOUND" });
      const job = await db.getJobById(deficiency.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Only reorder attachments that actually belong to this deficiency, so a
      // client can't use this endpoint to overwrite sortOrder on arbitrary attachments.
      await Promise.all(
        input.orderedIds.map((id, idx) =>
          drizzle.update(attachments).set({ sortOrder: idx }).where(
            and(
              eq(attachments.id, id),
              eq(attachments.entityType, "deficiency"),
              eq(attachments.entityId, input.deficiencyId)
            )
          )
        )
      );
      return { success: true };
    }),

  markCustomerFacing: adminOrOfficeProcedure
    .input(z.object({ id: z.number(), isCustomerFacing: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const { drizzle } = await assertAttachmentAccess(input.id, companyId);
      await drizzle
        .update(attachments)
        .set({ isCustomerFacing: input.isCustomerFacing ? 1 : 0 })
        .where(eq(attachments.id, input.id));
      return { success: true };
    }),

  getMediaForJob: adminOrOfficeProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const job = await db.getJobById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const drizzle = await getDb();
      if (!drizzle) return [];
      return drizzle
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.jobId, input.jobId),
            eq(attachments.entityType, "deficiency"),
            eq(attachments.uploadStatus, "completed"),
          )
        )
        .orderBy(attachments.entityId, attachments.sortOrder, attachments.createdAt);
    }),

  getMediaForReport: adminOrOfficeProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const job = await db.getJobById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const drizzle = await getDb();
      if (!drizzle) return [];
      return drizzle
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.jobId, input.jobId),
            eq(attachments.entityType, "deficiency"),
            eq(attachments.uploadStatus, "completed"),
            eq(attachments.isCustomerFacing, 1),
          )
        )
        .orderBy(attachments.entityId, attachments.sortOrder, attachments.createdAt);
    }),
});
