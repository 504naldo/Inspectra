import { toCustomerSafeAttachment } from "../customerDto";
import { withAudit } from "../db";
import {
  assertAttachmentDestination,
  assertAttachmentLinksUnchanged,
  requireUploadedAttachment,
  withAttachmentWrite,
  filterAuthorizedAttachments,
  findAttachmentReplay,
} from "../attachmentAccess";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  officeProcedure,
  technicianProcedure,
} from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { assertSiteCompany, assertAttachmentCompany } from "../tenantGuards";
import { users, type UploadQueueItem } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "../_core/context";

/**
 * Upload-queue items are owned by the technician who created them (the queue has
 * no companyId; ownership is the isolation boundary). Loads the item and rejects
 * any caller who is not its owner — used by every id-addressed queue mutation.
 */
async function requireOwnedQueueItem(id: number, userId: number) {
  const item = await db.getUploadQueueItemById(id);
  if (!item)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Upload queue item not found",
    });
  if (item.userId !== userId)
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return item;
}

async function visibleQueueItems(
  items: UploadQueueItem[],
  actor: NonNullable<TrpcContext["user"]>
) {
  const visible = await Promise.all(
    items.map(async item => {
      try {
        await assertAttachmentDestination(item, actor);
        return item;
      } catch (error) {
        if (
          error instanceof TRPCError &&
          ["FORBIDDEN", "NOT_FOUND"].includes(error.code)
        )
          return null;
        throw error;
      }
    })
  );
  return visible.filter((item): item is UploadQueueItem => item !== null);
}

// Attachment router - Enhanced with bulk upload, tagging, and linking
const attachmentRouter = router({
  listByEntity: protectedProcedure
    .input(
      z.object({
        entityType: z.enum([
          "inspection_result",
          "deficiency",
          "repair",
          "device",
          "job",
          "site",
          "customer_org",
        ]),
        entityId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertAttachmentDestination(input, ctx.user);
      const rows = await filterAuthorizedAttachments(
        await db.getAttachmentsByEntity(input.entityType, input.entityId),
        ctx.user
      );
      return ctx.user.role === "customer"
        ? rows
            .filter(row => row.isCustomerFacing === 1)
            .map(toCustomerSafeAttachment)
        : rows;
    }),

  listBySite: officeProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertSiteCompany(input.siteId, ctx.user.companyId!);
      return filterAuthorizedAttachments(
        await db.getAttachmentsBySite(input.siteId),
        ctx.user
      );
    }),

  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAttachmentDestination(
        { entityType: "job", entityId: input.jobId },
        ctx.user
      );
      const rows = await filterAuthorizedAttachments(
        await db.getAttachmentsByJob(input.jobId),
        ctx.user
      );
      return ctx.user.role === "customer"
        ? rows
            .filter(row => row.isCustomerFacing === 1)
            .map(toCustomerSafeAttachment)
        : rows;
    }),

  listByDevice: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAttachmentDestination(
        { entityType: "device", entityId: input.deviceId },
        ctx.user
      );
      const rows = await filterAuthorizedAttachments(
        await db.getAttachmentsByDevice(input.deviceId),
        ctx.user
      );
      return ctx.user.role === "customer"
        ? rows
            .filter(row => row.isCustomerFacing === 1)
            .map(toCustomerSafeAttachment)
        : rows;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const attachment = await db.getAttachmentById(input.id);
      if (!attachment) return undefined;
      await assertAttachmentDestination(attachment, ctx.user);
      if (ctx.user.role === "customer" && attachment.isCustomerFacing !== 1)
        throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.user.role === "customer"
        ? toCustomerSafeAttachment(attachment)
        : attachment;
    }),

  upload: technicianProcedure
    .input(
      z.object({
        entityType: z.enum([
          "inspection_result",
          "deficiency",
          "repair",
          "device",
          "job",
          "site",
          "customer_org",
        ]),
        entityId: z.number(),
        fileName: z.string(),
        fileData: z.string(), // Base64 encoded
        mimeType: z.string(),
        caption: z.string().optional(),
        tags: z.array(z.string()).optional(),
        siteId: z.number().optional(),
        jobId: z.number().optional(),
        deviceId: z.number().optional(),
        idempotencyKey: z.string().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.idempotencyKey) {
        const replay = await findAttachmentReplay(
          input,
          input.idempotencyKey,
          ctx.user
        );
        if (replay) return replay;
      }
      return withAttachmentWrite(
        ctx,
        "attachment.upload",
        [input],
        async ([parent]) => {
          if (input.idempotencyKey) {
            const replay = await findAttachmentReplay(
              input,
              input.idempotencyKey,
              ctx.user
            );
            if (replay) return replay;
          }

          const buffer = Buffer.from(input.fileData, "base64");
          const fileKey = `attachments/${input.entityType}/${input.entityId}/${nanoid()}-${input.fileName}`;
          const { url } = await storagePut(fileKey, buffer, input.mimeType);

          return db.createAttachment({
            companyId: parent.companyId,
            entityType: input.entityType,
            entityId: input.entityId,
            uploadedById: ctx.user.id,
            fileName: input.fileName,
            fileKey,
            fileUrl: url,
            mimeType: input.mimeType,
            fileSize: buffer.length,
            caption: input.caption,
            tags: input.tags as any,
            siteId: parent.siteId,
            jobId: parent.jobId,
            deviceId: parent.deviceId,
            idempotencyKey: input.idempotencyKey,
          });
        }
      );
    }),

  // Bulk upload multiple files
  bulkUpload: officeProcedure
    .input(
      z.object({
        entityType: z.enum([
          "inspection_result",
          "deficiency",
          "repair",
          "device",
          "job",
          "site",
          "customer_org",
        ]),
        entityId: z.number(),
        files: z.array(
          z.object({
            fileName: z.string(),
            fileData: z.string(),
            mimeType: z.string(),
            caption: z.string().optional(),
          })
        ),
        tags: z.array(z.string()).optional(),
        siteId: z.number().optional(),
        jobId: z.number().optional(),
        deviceId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withAttachmentWrite(
        ctx,
        "attachment.bulkUpload",
        [input],
        async ([parent]) => {
          const results = [];

          for (const file of input.files) {
            const buffer = Buffer.from(file.fileData, "base64");
            const fileKey = `attachments/${input.entityType}/${input.entityId}/${nanoid()}-${file.fileName}`;
            const { url } = await storagePut(fileKey, buffer, file.mimeType);

            const attachment = await db.createAttachment({
              companyId: parent.companyId,
              entityType: input.entityType,
              entityId: input.entityId,
              uploadedById: ctx.user.id,
              fileName: file.fileName,
              fileKey,
              fileUrl: url,
              mimeType: file.mimeType,
              fileSize: buffer.length,
              caption: file.caption,
              tags: input.tags as any,
              siteId: parent.siteId,
              jobId: parent.jobId,
              deviceId: parent.deviceId,
            });
            results.push(attachment);
          }

          return { success: true, count: results.length, attachments: results };
        }
      )
    ),

  // Update attachment metadata
  update: officeProcedure
    .input(
      z.object({
        id: z.number(),
        caption: z.string().optional(),
        tags: z.array(z.string()).optional(),
        siteId: z.number().optional(),
        jobId: z.number().optional(),
        deviceId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const attachment = await assertAttachmentCompany(id, ctx.user.companyId!);
      return withAttachmentWrite(
        ctx,
        "attachment.update",
        [attachment, { ...attachment, ...data }],
        async () => {
          await assertAttachmentLinksUnchanged(attachment);
          await db.updateAttachment(id, { ...data, tags: data.tags as any });
          return { success: true };
        }
      );
    }),

  // Update tags only
  updateTags: officeProcedure
    .input(
      z.object({
        id: z.number(),
        tags: z.array(z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const attachment = await assertAttachmentCompany(
        input.id,
        ctx.user.companyId!
      );
      return withAttachmentWrite(
        ctx,
        "attachment.updateTags",
        [attachment],
        async () => {
          await assertAttachmentLinksUnchanged(attachment);
          await db.updateAttachmentTags(input.id, input.tags);
          return { success: true };
        }
      );
    }),

  // Link attachment to additional entities
  linkToEntities: officeProcedure
    .input(
      z.object({
        id: z.number(),
        siteId: z.number().optional(),
        jobId: z.number().optional(),
        deviceId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...links } = input;
      const attachment = await assertAttachmentCompany(id, ctx.user.companyId!);
      return withAttachmentWrite(
        ctx,
        "attachment.linkToEntities",
        [attachment, { ...attachment, ...links }],
        async () => {
          await assertAttachmentLinksUnchanged(attachment);
          await db.updateAttachment(id, links);
          return { success: true };
        }
      );
    }),

  delete: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const attachment = await assertAttachmentCompany(
        input.id,
        ctx.user.companyId!
      );
      return withAttachmentWrite(
        ctx,
        "attachment.delete",
        [attachment],
        async () => {
          await assertAttachmentLinksUnchanged(attachment);
          await db.deleteAttachment(input.id);
          return { success: true };
        }
      );
    }),
});

// File Tags router
const fileTagRouter = router({
  list: officeProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Never trust a client-supplied companyId — scope to the caller's tenant.
      if (input.companyId !== ctx.user.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      return db.getFileTagsByCompany(input.companyId);
    }),

  create: officeProcedure
    .input(
      z.object({
        companyId: z.number(),
        name: z.string().min(1),
        color: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      // Stamp the caller's own company, ignoring any mismatched client value.
      return db.createFileTag({ ...input, companyId: ctx.user.companyId! });
    }),

  delete: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Load the tag and confirm it belongs to the caller's company before deleting.
      const tag = await db.getFileTagById(input.id);
      if (!tag) throw new TRPCError({ code: "NOT_FOUND" });
      if (tag.companyId !== ctx.user.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      await db.deleteFileTag(input.id);
      return { success: true };
    }),
});

// Upload Queue router (for mobile background uploads)
const uploadQueueRouter = router({
  list: technicianProcedure.query(async ({ ctx }) => {
    return visibleQueueItems(
      await db.getUploadQueueByUser(ctx.user.id),
      ctx.user
    );
  }),

  pending: technicianProcedure.query(async ({ ctx }) => {
    return visibleQueueItems(await db.getPendingUploads(ctx.user.id), ctx.user);
  }),

  add: technicianProcedure
    .input(
      z.object({
        localFileId: z.string().min(1).max(100),
        fileName: z.string(),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
        entityType: z.enum([
          "inspection_result",
          "deficiency",
          "repair",
          "device",
          "job",
          "site",
          "customer_org",
        ]),
        entityId: z.number(),
        tags: z.array(z.string()).optional(),
        caption: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertAttachmentDestination(input, ctx.user);
      return withAudit(ctx, "uploadQueue.add", async tx => {
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .for("update");
        await assertAttachmentDestination(input, ctx.user);

        // Check if already exists
        const existing = await db.getUploadQueueItemByLocalId(
          ctx.user.id,
          input.localFileId
        );
        if (existing) {
          if (
            existing.entityType !== input.entityType ||
            existing.entityId !== input.entityId
          )
            throw new TRPCError({
              code: "CONFLICT",
              message: "Queued upload belongs to another destination.",
            });
          return existing;
        }

        return db.createUploadQueueItem({
          userId: ctx.user.id,
          localFileId: input.localFileId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          entityType: input.entityType,
          entityId: input.entityId,
          tags: input.tags as any,
          caption: input.caption,
          status: "queued",
        });
      });
    }),

  updateStatus: technicianProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum([
          "queued",
          "uploading",
          "paused",
          "completed",
          "failed",
        ]),
        progress: z.number().optional(),
        lastError: z.string().optional(),
        fileKey: z.string().optional(),
        fileUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withAudit(ctx, "uploadQueue.updateStatus", async () => {
        const { id, ...data } = input;

        // Ownership check: a queue item may only be mutated by the technician who
        // owns it. Without this any caller could flip another user's queue item or
        // point it at an arbitrary S3 object.
        const item = await requireOwnedQueueItem(id, ctx.user.id);
        await assertAttachmentDestination(item, ctx.user);

        const updateData: any = { ...data };
        if (
          data.status === "completed" ||
          data.fileKey != null ||
          data.fileUrl != null
        ) {
          const fileKey = data.fileKey ?? item.fileKey;
          if (!fileKey)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "An uploaded file is required.",
            });
          const attachment = await requireUploadedAttachment(
            item,
            fileKey,
            ctx.user
          );
          updateData.fileKey = attachment.fileKey;
          updateData.fileUrl = attachment.fileUrl;
        }

        if (data.status === "uploading" && !data.progress) {
          updateData.startedAt = new Date();
        }
        if (data.status === "completed") {
          updateData.completedAt = new Date();
          updateData.progress = 100;
        }
        if (data.status === "failed") {
          updateData.retryCount = (item.retryCount || 0) + 1;
        }

        await db.updateUploadQueueItem(id, updateData);
        return { success: true };
      })
    ),

  // Upload endpoints persist the attachment themselves. Completion only links
  // that proven upload to its queue item, so replays cannot duplicate it.
  complete: technicianProcedure
    .input(
      z.object({
        id: z.number(),
        fileKey: z.string(),
        fileUrl: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withAudit(ctx, "uploadQueue.complete", async () => {
        const item = await requireOwnedQueueItem(input.id, ctx.user.id);
        const attachment = await requireUploadedAttachment(
          item,
          input.fileKey,
          ctx.user
        );

        // Update queue item
        await db.updateUploadQueueItem(input.id, {
          status: "completed",
          fileKey: attachment.fileKey,
          fileUrl: attachment.fileUrl,
          completedAt: new Date(),
          progress: 100,
        });

        return { success: true, attachment };
      })
    ),

  retry: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const item = await requireOwnedQueueItem(input.id, ctx.user.id);
      await assertAttachmentDestination(item, ctx.user);
      await db.updateUploadQueueItem(input.id, {
        status: "queued",
        lastError: null,
      });
      return { success: true };
    }),

  remove: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedQueueItem(input.id, ctx.user.id);
      await db.deleteUploadQueueItem(input.id);
      return { success: true };
    }),

  clearCompleted: technicianProcedure.mutation(async ({ ctx }) => {
    await db.clearCompletedUploads(ctx.user.id);
    return { success: true };
  }),
});

export { attachmentRouter, fileTagRouter, uploadQueueRouter };
