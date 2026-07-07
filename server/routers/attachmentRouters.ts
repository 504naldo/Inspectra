import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { assertSiteCompany, assertAttachmentCompany, assertEntityCompany, assertDeviceCompany } from "../tenantGuards";

/** Finalized jobs are immutable — skip the check for attachments not linked to a job. */
async function assertAttachmentJobNotFinalized(jobId: number | null | undefined) {
  if (jobId != null) await db.assertJobNotFinalized(jobId);
}

/**
 * Upload-queue items are owned by the technician who created them (the queue has
 * no companyId; ownership is the isolation boundary). Loads the item and rejects
 * any caller who is not its owner — used by every id-addressed queue mutation.
 */
async function requireOwnedQueueItem(id: number, userId: number) {
  const item = await db.getUploadQueueItemById(id);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Upload queue item not found" });
  if (item.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  return item;
}

// Attachment router - Enhanced with bulk upload, tagging, and linking
const attachmentRouter = router({
  listByEntity: protectedProcedure.input(z.object({
    entityType: z.enum(['inspection_result', 'deficiency', 'repair', 'device', 'job', 'site', 'customer_org']),
    entityId: z.number()
  })).query(async ({ input, ctx }) => {
    await assertEntityCompany(input.entityType, input.entityId, ctx.user.companyId!);
    return db.getAttachmentsByEntity(input.entityType, input.entityId);
  }),
  
  listBySite: officeProcedure.input(z.object({ siteId: z.number() })).query(async ({ input, ctx }) => {
    await assertSiteCompany(input.siteId, ctx.user.companyId!);
    return db.getAttachmentsBySite(input.siteId);
  }),
  
  listByJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    const job = await db.getJobById(input.jobId);
    if (job && ctx.user.role !== 'admin' && ctx.user.companyId !== job.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
    return db.getAttachmentsByJob(input.jobId);
  }),
  
  listByDevice: protectedProcedure.input(z.object({ deviceId: z.number() })).query(async ({ input, ctx }) => {
    const device = await db.getDeviceById(input.deviceId);
    if (device && ctx.user.role !== 'admin' && ctx.user.companyId !== device.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
    return db.getAttachmentsByDevice(input.deviceId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const attachment = await db.getAttachmentById(input.id);
    if (!attachment) return undefined;
    // Scope: verify via parent job or site
    if (attachment.jobId) {
      const job = await db.getJobById(attachment.jobId);
      if (job && ctx.user.role !== 'admin' && ctx.user.companyId !== job.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
    } else if (attachment.siteId) {
      const site = await db.getSiteById(attachment.siteId);
      if (site && ctx.user.role !== 'admin' && ctx.user.companyId !== site.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
    }
    return attachment;
  }),
  
  upload: technicianProcedure.input(z.object({
    entityType: z.enum(['inspection_result', 'deficiency', 'repair', 'device', 'job', 'site', 'customer_org']),
    entityId: z.number(),
    fileName: z.string(),
    fileData: z.string(), // Base64 encoded
    mimeType: z.string(),
    caption: z.string().optional(),
    tags: z.array(z.string()).optional(),
    siteId: z.number().optional(),
    jobId: z.number().optional(),
    deviceId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const companyId = ctx.user.companyId!;
    await assertEntityCompany(input.entityType, input.entityId, companyId);
    if (input.siteId !== undefined) await assertSiteCompany(input.siteId, companyId);
    if (input.jobId !== undefined) await db.assertJobCompany(input.jobId, companyId);
    if (input.deviceId !== undefined) await assertDeviceCompany(input.deviceId, companyId);
    await assertAttachmentJobNotFinalized(input.jobId);

    const buffer = Buffer.from(input.fileData, 'base64');
    const fileKey = `attachments/${input.entityType}/${input.entityId}/${nanoid()}-${input.fileName}`;
    const { url } = await storagePut(fileKey, buffer, input.mimeType);

    return db.createAttachment({
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
      siteId: input.siteId,
      jobId: input.jobId,
      deviceId: input.deviceId,
    });
  }),
  
  // Bulk upload multiple files
  bulkUpload: officeProcedure.input(z.object({
    entityType: z.enum(['inspection_result', 'deficiency', 'repair', 'device', 'job', 'site', 'customer_org']),
    entityId: z.number(),
    files: z.array(z.object({
      fileName: z.string(),
      fileData: z.string(),
      mimeType: z.string(),
      caption: z.string().optional(),
    })),
    tags: z.array(z.string()).optional(),
    siteId: z.number().optional(),
    jobId: z.number().optional(),
    deviceId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const companyId = ctx.user.companyId!;
    await assertEntityCompany(input.entityType, input.entityId, companyId);
    if (input.siteId !== undefined) await assertSiteCompany(input.siteId, companyId);
    if (input.jobId !== undefined) await db.assertJobCompany(input.jobId, companyId);
    if (input.deviceId !== undefined) await assertDeviceCompany(input.deviceId, companyId);
    await assertAttachmentJobNotFinalized(input.jobId);

    const results = [];

    for (const file of input.files) {
      const buffer = Buffer.from(file.fileData, 'base64');
      const fileKey = `attachments/${input.entityType}/${input.entityId}/${nanoid()}-${file.fileName}`;
      const { url } = await storagePut(fileKey, buffer, file.mimeType);
      
      const attachment = await db.createAttachment({
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
        siteId: input.siteId,
        jobId: input.jobId,
        deviceId: input.deviceId,
      });
      results.push(attachment);
    }
    
    return { success: true, count: results.length, attachments: results };
  }),
  
  // Update attachment metadata
  update: officeProcedure.input(z.object({
    id: z.number(),
    caption: z.string().optional(),
    tags: z.array(z.string()).optional(),
    siteId: z.number().optional(),
    jobId: z.number().optional(),
    deviceId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    const attachment = await assertAttachmentCompany(id, ctx.user.companyId!);
    await assertAttachmentJobNotFinalized(attachment.jobId);
    await assertAttachmentJobNotFinalized(data.jobId);
    await db.updateAttachment(id, { ...data, tags: data.tags as any });
    return { success: true };
  }),

  // Update tags only
  updateTags: officeProcedure.input(z.object({
    id: z.number(),
    tags: z.array(z.string()),
  })).mutation(async ({ input, ctx }) => {
    const attachment = await assertAttachmentCompany(input.id, ctx.user.companyId!);
    await assertAttachmentJobNotFinalized(attachment.jobId);
    await db.updateAttachmentTags(input.id, input.tags);
    return { success: true };
  }),

  // Link attachment to additional entities
  linkToEntities: officeProcedure.input(z.object({
    id: z.number(),
    siteId: z.number().optional(),
    jobId: z.number().optional(),
    deviceId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, ...links } = input;
    const attachment = await assertAttachmentCompany(id, ctx.user.companyId!);
    await assertAttachmentJobNotFinalized(attachment.jobId);
    await assertAttachmentJobNotFinalized(links.jobId);
    await db.updateAttachment(id, links);
    return { success: true };
  }),

  delete: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const attachment = await assertAttachmentCompany(input.id, ctx.user.companyId!);
    await assertAttachmentJobNotFinalized(attachment.jobId);
    await db.deleteAttachment(input.id);
    return { success: true };
  }),
});

// File Tags router
const fileTagRouter = router({
  list: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input, ctx }) => {
    // Never trust a client-supplied companyId — scope to the caller's tenant.
    if (input.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
    return db.getFileTagsByCompany(input.companyId);
  }),

  create: officeProcedure.input(z.object({
    companyId: z.number(),
    name: z.string().min(1),
    color: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
    // Stamp the caller's own company, ignoring any mismatched client value.
    return db.createFileTag({ ...input, companyId: ctx.user.companyId! });
  }),

  delete: officeProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    // Load the tag and confirm it belongs to the caller's company before deleting.
    const tag = await db.getFileTagById(input.id);
    if (!tag) throw new TRPCError({ code: "NOT_FOUND" });
    if (tag.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
    await db.deleteFileTag(input.id);
    return { success: true };
  }),
});

// Upload Queue router (for mobile background uploads)
const uploadQueueRouter = router({
  list: technicianProcedure.query(async ({ ctx }) => {
    return db.getUploadQueueByUser(ctx.user.id);
  }),
  
  pending: technicianProcedure.query(async ({ ctx }) => {
    return db.getPendingUploads(ctx.user.id);
  }),
  
  add: technicianProcedure.input(z.object({
    localFileId: z.string(),
    fileName: z.string(),
    mimeType: z.string().optional(),
    fileSize: z.number().optional(),
    entityType: z.enum(['inspection_result', 'deficiency', 'repair', 'device', 'job', 'site', 'customer_org']),
    entityId: z.number(),
    tags: z.array(z.string()).optional(),
    caption: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertEntityCompany(input.entityType, input.entityId, ctx.user.companyId!);

    // Check if already exists
    const existing = await db.getUploadQueueItemByLocalId(ctx.user.id, input.localFileId);
    if (existing) {
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
      status: 'queued',
    });
  }),
  
  updateStatus: technicianProcedure.input(z.object({
    id: z.number(),
    status: z.enum(['queued', 'uploading', 'paused', 'completed', 'failed']),
    progress: z.number().optional(),
    lastError: z.string().optional(),
    fileKey: z.string().optional(),
    fileUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;

    // Ownership check: a queue item may only be mutated by the technician who
    // owns it. Without this any caller could flip another user's queue item or
    // point it at an arbitrary S3 object.
    const item = await requireOwnedQueueItem(id, ctx.user.id);

    const updateData: any = { ...data };

    if (data.status === 'uploading' && !data.progress) {
      updateData.startedAt = new Date();
    }
    if (data.status === 'completed') {
      updateData.completedAt = new Date();
      updateData.progress = 100;
    }
    if (data.status === 'failed') {
      updateData.retryCount = (item.retryCount || 0) + 1;
    }

    await db.updateUploadQueueItem(id, updateData);
    return { success: true };
  }),
  
  // Complete upload - creates attachment from queue item
  complete: technicianProcedure.input(z.object({
    id: z.number(),
    fileKey: z.string(),
    fileUrl: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const item = await requireOwnedQueueItem(input.id, ctx.user.id);

    // Create the attachment
    const attachment = await db.createAttachment({
      entityType: item.entityType,
      entityId: item.entityId,
      uploadedById: ctx.user.id,
      fileName: item.fileName,
      fileKey: input.fileKey,
      fileUrl: input.fileUrl,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      caption: item.caption,
      tags: item.tags as any,
    });
    
    // Update queue item
    await db.updateUploadQueueItem(input.id, {
      status: 'completed',
      fileKey: input.fileKey,
      fileUrl: input.fileUrl,
      completedAt: new Date(),
      progress: 100,
    });
    
    return { success: true, attachment };
  }),
  
  retry: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    await requireOwnedQueueItem(input.id, ctx.user.id);
    await db.updateUploadQueueItem(input.id, {
      status: 'queued',
      lastError: null,
    });
    return { success: true };
  }),

  remove: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
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
