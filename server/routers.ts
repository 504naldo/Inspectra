import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { generateInspectionReportPDF } from "./pdfGeneratorFirePro";
import { generateComplianceReportPDF } from "./pdfGeneratorCompliance";
import * as checklists from "./complianceChecklists";
import { fireAlarmRouter } from "./fireAlarmRouter";
import { sprinklerRouter } from "./sprinklerRouter";
import { jobAssignmentRouter } from "./jobAssignmentRouter";
import { userRouter as userManagementRouter } from "./userRouter";
import { assetImportRouter } from "./routers/assetImportRouter";
import { filesRouter } from "./routers/filesRouter";

// Role-based procedure helpers
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

const officeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'office'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Office or Admin access required' });
  }
  return next({ ctx });
});

const technicianProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'office', 'technician'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Technician access required' });
  }
  return next({ ctx });
});

const customerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'customer') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
  }
  return next({ ctx });
});

// Company router
const companyRouter = router({
  list: adminProcedure.query(async () => {
    return db.getAllCompanies();
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getCompanyById(input.id);
  }),
  
  create: adminProcedure.input(z.object({
    name: z.string().min(1),
    logo: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  })).mutation(async ({ input }) => {
    return db.createCompany(input);
  }),
  
  update: adminProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    logo: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateCompany(id, data);
    return { success: true };
  }),
});

// Customer Organization router
const customerOrgRouter = router({
  list: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getCustomerOrgsByCompany(input.companyId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const org = await db.getCustomerOrgById(input.id);
    // Customer can only see their own org
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== input.id) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return org;
  }),
  
  create: officeProcedure.input(z.object({
    companyId: z.number(),
    name: z.string().min(1),
    contactName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    address: z.string().optional(),
  })).mutation(async ({ input }) => {
    return db.createCustomerOrg(input);
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    address: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateCustomerOrg(id, data);
    return { success: true };
  }),
});

// Site router
const siteRouter = router({
  listByCompany: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getSitesByCompany(input.companyId);
  }),
  
  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== input.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.getSitesByCustomerOrg(input.customerOrgId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getSiteById(input.id);
  }),
  
  create: officeProcedure.input(z.object({
    companyId: z.number(),
    customerOrgId: z.number(),
    name: z.string().min(1),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    return db.createSite(input);
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateSite(id, data);
    return { success: true };
  }),
});

// Area router
const areaRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getAreasBySite(input.siteId);
  }),
  
  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getAreaById(input.id);
  }),
  
  create: officeProcedure.input(z.object({
    siteId: z.number(),
    name: z.string().min(1),
    floor: z.string().optional(),
    building: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    return db.createArea(input);
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    floor: z.string().optional(),
    building: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateArea(id, data);
    return { success: true };
  }),
});

// Device router
const deviceRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getDevicesBySite(input.siteId);
  }),
  
  listByArea: technicianProcedure.input(z.object({ areaId: z.number() })).query(async ({ input }) => {
    return db.getDevicesByArea(input.areaId);
  }),
  
  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getDeviceById(input.id);
  }),
  
  create: officeProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    areaId: z.number().optional(),
    deviceType: z.string().min(1),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    location: z.string().optional(),
    barcode: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    return db.createDevice(input);
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    deviceType: z.string().optional(),
    areaId: z.number().optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    location: z.string().optional(),
    barcode: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateDevice(id, data);
    return { success: true };
  }),
  
  getCount: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getDeviceCountBySite(input.siteId);
  }),
});

// Job router
const jobRouter = router({
  listByCompany: officeProcedure.input(z.object({ 
    companyId: z.number(),
    status: z.string().optional()
  })).query(async ({ input }) => {
    return db.getJobsByCompany(input.companyId, input.status);
  }),
  
  listByTechnician: technicianProcedure.input(z.object({
    status: z.string().optional()
  })).query(async ({ input, ctx }) => {
    return db.getJobsByTechnician(ctx.user.id, input.status);
  }),
  
  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== input.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.getJobsByCustomerOrg(input.customerOrgId);
  }),
  
  listBySite: officeProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getJobsBySite(input.siteId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const job = await db.getJobById(input.id);
    if (!job) return null;
    // Customer can only see their own jobs
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== job.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return job;
  }),
  
  getWithDetails: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const job = await db.getJobById(input.id);
    if (!job) return null;
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== job.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    const site = await db.getSiteById(job.siteId);
    const customerOrg = await db.getCustomerOrgById(job.customerOrgId);
    const devices = await db.getDevicesBySite(job.siteId);
    const inspectionResults = await db.getInspectionResultsByJob(job.id);
    const deficiencies = await db.getDeficienciesByJob(job.id);
    const stats = await db.getInspectionStats(job.id);
    return { job, site, customerOrg, devices, inspectionResults, deficiencies, stats };
  }),
  
  create: officeProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    customerOrgId: z.number(),
    assignedTechnicianId: z.number().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    jobType: z.enum(['annual', 'semi_annual', 'quarterly', 'monthly', 'service_call', 'repair']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    scheduledDate: z.date().optional(),
  })).mutation(async ({ input }) => {
    const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`;
    return db.createJob({ ...input, jobNumber });
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    assignedTechnicianId: z.number().optional(),
    jobType: z.enum(['annual', 'semi_annual', 'quarterly', 'monthly', 'service_call', 'repair']).optional(),
    status: z.enum(['pending', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    scheduledDate: z.date().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateJob(id, data);
    return { success: true };
  }),
  
  start: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.updateJob(input.id, { status: 'in_progress', startedAt: new Date() });
    return { success: true };
  }),
  
  complete: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.updateJob(input.id, { status: 'completed', completedAt: new Date() });
    return { success: true };
  }),
  
  search: officeProcedure.input(z.object({
    companyId: z.number(),
    query: z.string()
  })).query(async ({ input }) => {
    return db.searchJobs(input.companyId, input.query);
  }),
});

// Inspection Result router
const inspectionResultRouter = router({
  listByJob: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    return db.getInspectionResultsByJob(input.jobId);
  }),
  
  getByJobAndDevice: technicianProcedure.input(z.object({ 
    jobId: z.number(),
    deviceId: z.number()
  })).query(async ({ input }) => {
    return db.getInspectionResultByJobAndDevice(input.jobId, input.deviceId);
  }),
  
  upsert: technicianProcedure.input(z.object({
    jobId: z.number(),
    deviceId: z.number(),
    result: z.enum(['pass', 'fail', 'na', 'not_tested']),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const data = {
      ...input,
      technicianId: ctx.user.id,
      testedAt: new Date(),
      syncedAt: new Date(),
    };
    return db.upsertInspectionResult(data);
  }),
  
  bulkMarkPass: technicianProcedure.input(z.object({
    jobId: z.number(),
    deviceIds: z.array(z.number()),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const results = [];
    for (const deviceId of input.deviceIds) {
      const data = {
        jobId: input.jobId,
        deviceId,
        result: 'pass' as const,
        notes: input.notes,
        technicianId: ctx.user.id,
        testedAt: new Date(),
        syncedAt: new Date(),
      };
      const saved = await db.upsertInspectionResult(data);
      results.push(saved);
    }
    return { count: results.length, results };
  }),
  
  getStats: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    return db.getInspectionStats(input.jobId);
  }),
  
  // Batch sync for offline data
  syncBatch: technicianProcedure.input(z.object({
    results: z.array(z.object({
      jobId: z.number(),
      deviceId: z.number(),
      result: z.enum(['pass', 'fail', 'na', 'not_tested']),
      notes: z.string().optional(),
      testedAt: z.date().optional(),
    }))
  })).mutation(async ({ input, ctx }) => {
    const synced = [];
    for (const result of input.results) {
      const data = {
        ...result,
        technicianId: ctx.user.id,
        testedAt: result.testedAt || new Date(),
        syncedAt: new Date(),
      };
      const saved = await db.upsertInspectionResult(data);
      synced.push(saved);
      
      // Log sync
      await db.createSyncLog({
        userId: ctx.user.id,
        entityType: 'inspection_result',
        entityId: saved.id!,
        action: 'create',
        payload: data,
      });
    }
    return { synced: synced.length };
  }),
});

// Deficiency router
const deficiencyRouter = router({
  listByJob: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    return db.getDeficienciesByJob(input.jobId);
  }),
  
  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== input.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.getDeficienciesByCustomerOrg(input.customerOrgId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const deficiency = await db.getDeficiencyById(input.id);
    if (!deficiency) return null;
    const attachments = await db.getAttachmentsByEntity('deficiency', input.id);
    const repairs = await db.getRepairsByDeficiency(input.id);
    return { deficiency, attachments, repairs };
  }),
  
  create: technicianProcedure.input(z.object({
    jobId: z.number(),
    deviceId: z.number().optional(),
    inspectionResultId: z.number().optional(),
    title: z.string().min(1),
    severity: z.enum(['critical', 'major', 'minor', 'observation']).optional(),
    description: z.string().optional(),
    observedIssue: z.string().optional(),
    correctiveAction: z.string().optional(),
    customerExplanation: z.string().optional(),
    codeReference: z.string().optional(),
    aiGenerated: z.boolean().optional(),
    systemCategory: z.enum(['FIRE_ALARM', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHTING', 'SPRINKLER']).optional(),
  })).mutation(async ({ input, ctx }) => {
    return db.createDeficiency({ ...input, reportedById: ctx.user.id });
  }),
  
  update: technicianProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    severity: z.enum(['critical', 'major', 'minor', 'observation']).optional(),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'deferred']).optional(),
    description: z.string().optional(),
    observedIssue: z.string().optional(),
    correctiveAction: z.string().optional(),
    customerExplanation: z.string().optional(),
    codeReference: z.string().optional(),
    resolutionNotes: z.string().optional(),
    systemCategory: z.enum(['FIRE_ALARM', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHTING', 'SPRINKLER']).optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, status, ...data } = input;
    const updateData: any = { ...data };
    if (status) {
      updateData.status = status;
      if (status === 'resolved' || status === 'closed') {
        updateData.resolvedAt = new Date();
        updateData.resolvedById = ctx.user.id;
      }
    }
    await db.updateDeficiency(id, updateData);
    return { success: true };
  }),
});

// Repair router
const repairRouter = router({
  listByDeficiency: technicianProcedure.input(z.object({ deficiencyId: z.number() })).query(async ({ input }) => {
    return db.getRepairsByDeficiency(input.deficiencyId);
  }),
  
  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getRepairById(input.id);
  }),
  
  create: technicianProcedure.input(z.object({
    deficiencyId: z.number(),
    description: z.string().optional(),
    partsUsed: z.string().optional(),
    laborHours: z.number().optional(),
    aiRecommendations: z.any().optional(),
  })).mutation(async ({ input, ctx }) => {
    return db.createRepair({ ...input, technicianId: ctx.user.id });
  }),
  
  update: technicianProcedure.input(z.object({
    id: z.number(),
    status: z.enum(['pending', 'in_progress', 'completed', 'parts_ordered']).optional(),
    description: z.string().optional(),
    partsUsed: z.string().optional(),
    laborHours: z.number().optional(),
  })).mutation(async ({ input }) => {
    const { id, status, ...data } = input;
    const updateData: any = { ...data };
    if (status) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }
    }
    await db.updateRepair(id, updateData);
    return { success: true };
  }),
});

// Attachment router - Enhanced with bulk upload, tagging, and linking
const attachmentRouter = router({
  listByEntity: protectedProcedure.input(z.object({
    entityType: z.enum(['inspection_result', 'deficiency', 'repair', 'device', 'job', 'site', 'customer_org']),
    entityId: z.number()
  })).query(async ({ input }) => {
    return db.getAttachmentsByEntity(input.entityType, input.entityId);
  }),
  
  listBySite: officeProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getAttachmentsBySite(input.siteId);
  }),
  
  listByJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    return db.getAttachmentsByJob(input.jobId);
  }),
  
  listByDevice: protectedProcedure.input(z.object({ deviceId: z.number() })).query(async ({ input }) => {
    return db.getAttachmentsByDevice(input.deviceId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getAttachmentById(input.id);
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
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateAttachment(id, { ...data, tags: data.tags as any });
    return { success: true };
  }),
  
  // Update tags only
  updateTags: officeProcedure.input(z.object({
    id: z.number(),
    tags: z.array(z.string()),
  })).mutation(async ({ input }) => {
    await db.updateAttachmentTags(input.id, input.tags);
    return { success: true };
  }),
  
  // Link attachment to additional entities
  linkToEntities: officeProcedure.input(z.object({
    id: z.number(),
    siteId: z.number().optional(),
    jobId: z.number().optional(),
    deviceId: z.number().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...links } = input;
    await db.updateAttachment(id, links);
    return { success: true };
  }),
  
  delete: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.deleteAttachment(input.id);
    return { success: true };
  }),
});

// File Tags router
const fileTagRouter = router({
  list: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getFileTagsByCompany(input.companyId);
  }),
  
  create: officeProcedure.input(z.object({
    companyId: z.number(),
    name: z.string().min(1),
    color: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    return db.createFileTag(input);
  }),
  
  delete: officeProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
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
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    const updateData: any = { ...data };
    
    if (data.status === 'uploading' && !data.progress) {
      updateData.startedAt = new Date();
    }
    if (data.status === 'completed') {
      updateData.completedAt = new Date();
      updateData.progress = 100;
    }
    if (data.status === 'failed') {
      const item = await db.getUploadQueueItemById(id);
      if (item) {
        updateData.retryCount = (item.retryCount || 0) + 1;
      }
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
    const item = await db.getUploadQueueItemById(input.id);
    if (!item) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload queue item not found' });
    }
    
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
  
  retry: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.updateUploadQueueItem(input.id, {
      status: 'queued',
      lastError: null,
    });
    return { success: true };
  }),
  
  remove: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.deleteUploadQueueItem(input.id);
    return { success: true };
  }),
  
  clearCompleted: technicianProcedure.mutation(async ({ ctx }) => {
    await db.clearCompletedUploads(ctx.user.id);
    return { success: true };
  }),
});

// Report router
const reportRouter = router({
  listByJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    return db.getReportsByJob(input.jobId);
  }),
  
  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== input.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.getReportsByCustomerOrg(input.customerOrgId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getReportById(input.id);
  }),
  
  create: officeProcedure.input(z.object({
    jobId: z.number(),
    title: z.string(),
    executiveSummary: z.string().optional(),
    aiSummary: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const stats = await db.getInspectionStats(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    const reportNumber = `RPT-${Date.now().toString(36).toUpperCase()}`;
    
    return db.createReport({
      ...input,
      generatedById: ctx.user.id,
      reportNumber,
      deviceCount: stats.total,
      passCount: stats.pass,
      failCount: stats.fail,
      deficiencyCount: deficiencies.length,
    });
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    executiveSummary: z.string().optional(),
    aiSummary: z.string().optional(),
    status: z.enum(['draft', 'generated', 'sent', 'approved']).optional(),
    fileKey: z.string().optional(),
    fileUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, status, ...data } = input;
    const updateData: any = { ...data };
    if (status) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approvedAt = new Date();
        updateData.approvedById = ctx.user.id;
      }
    }
    await db.updateReport(id, updateData);
    return { success: true };
  }),
  
  approve: customerProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    await db.updateReport(input.id, { 
      status: 'approved', 
      approvedAt: new Date(),
      approvedById: ctx.user.id 
    });
    return { success: true };
  }),
  
  generatePDF: officeProcedure.input(z.object({
    jobId: z.number(),
    summary: z.string().optional(),
    allowMissingLocations: z.boolean().optional(), // Admin override for test mode
  })).mutation(async ({ input, ctx }) => {
    // DEPRECATED: Use deficiencyReport.generate instead
    console.warn('[DEPRECATED] report.generatePDF is deprecated. Use deficiencyReport.generate instead.');
    
    // Get job details
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    
    // Get site details
    const site = await db.getSiteById(job.siteId);
    if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    
    // Get customer org
    const customerOrg = await db.getCustomerOrgById(job.customerOrgId);
    
    // Get company
    const company = await db.getCompanyById(job.companyId);
    
    // Get inspection results with device info
    const inspectionResults = await db.getInspectionResultsByJob(input.jobId);
    
    // Get deficiencies
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    // Validate deficiency locations before generating Deficiency report
    // Fetch device locations for deficiencies
    const deficienciesWithLocations = await Promise.all(deficiencies.map(async (d) => {
      let location: string | null = null;
      if (d.deviceId) {
        const device = await db.getDeviceById(d.deviceId);
        location = device?.location || null;
      }
      return {
        id: d.id,
        description: d.description || 'No description',
        severity: d.severity,
        location,
      };
    }));
    
    const { validateDeficiencyReportLocations } = await import('./locationValidation');
    
    // Check if admin override is enabled (only admins can use this)
    const allowOverride = input.allowMissingLocations === true && ctx.user.role === 'admin';
    
    const locationValidation = validateDeficiencyReportLocations(deficienciesWithLocations, allowOverride);
    
    if (!locationValidation.isValid) {
      const missingList = locationValidation.missingDeficiencies
        .map(d => `  - Deficiency #${d.id}: ${d.description.substring(0, 60)}${d.description.length > 60 ? '...' : ''} (${d.severity})`)
        .join('\n');
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot generate Deficiency report: ${locationValidation.totalMissing} deficiency/deficiencies missing location information.\n\nMissing locations for:\n${missingList}\n\nPlease add locations to all deficiencies before generating the Deficiency Report.`,
      });
    }
    
    // Calculate device summaries by type
    const deviceTypeMap: Record<string, { total: number; passed: number; failed: number; na: number }> = {};
    
    for (const result of inspectionResults) {
      const deviceType = result.deviceType || 'Unknown';
      if (!deviceTypeMap[deviceType]) {
        deviceTypeMap[deviceType] = { total: 0, passed: 0, failed: 0, na: 0 };
      }
      deviceTypeMap[deviceType].total++;
      if (result.result === 'pass') deviceTypeMap[deviceType].passed++;
      else if (result.result === 'fail') deviceTypeMap[deviceType].failed++;
      else deviceTypeMap[deviceType].na++;
    }
    
    const deviceSummaries = Object.entries(deviceTypeMap).map(([deviceType, stats]) => ({
      deviceType,
      ...stats
    }));
    
    // Get technician details
    const technician = await db.getUserById(job.assignedTechnicianId || ctx.user.id);
    
    // Generate PDF with Fire-Pro style
    const pdfBuffer = await generateInspectionReportPDF({
      jobNumber: job.jobNumber,
      jobTitle: job.title,
      siteName: site.name,
      siteAddress: site.address || '',
      siteCity: site.city || '',
      siteState: site.state || '',
      customerName: customerOrg?.name || 'Unknown Customer',
      customerAddress: customerOrg?.address || '',
      customerCity: '',
      customerState: '',
      customerPostalCode: '',
      attentionTo: customerOrg?.contactName || '',
      attentionEmail: customerOrg?.contactEmail || '',
      inspectionDate: job.scheduledDate || new Date(),
      completedDate: job.completedAt,
      technicianName: technician?.name || ctx.user.name || undefined,
      technicianTitle: 'Fire Alarm Technician',
      technicianEmail: technician?.email || ctx.user.email || undefined,
      companyName: company?.name || 'Fire Inspect Pro',
      companyAddress: '15-3871 North Fraser Way, Burnaby BC V5G 5J6',
      companyPhone: '604-299-1030',
      companyEmail: 'info@fireinspectpro.ca',
      summary: input.summary,
      deviceSummaries,
      deficiencies: await Promise.all(deficiencies.map(async (d) => {
        // Get device info if deviceId exists
        let deviceType: string | undefined = undefined;
        let location: string | undefined = undefined;
        if (d.deviceId) {
          const device = await db.getDeviceById(d.deviceId);
          if (device) {
            deviceType = device.deviceType;
            location = device.location || undefined;
          }
        }
        return {
          id: d.id,
          title: d.title,
          severity: d.severity,
          status: d.status,
          description: d.description,
          correctiveAction: d.correctiveAction,
          deviceType,
          location,
          estimatedCost: 0, // TODO: Add estimatedCost field to deficiencies table
          systemCategory: d.systemCategory,
        };
      })),
      inspectionResults: inspectionResults.map(r => ({
        deviceId: r.deviceId,
        deviceType: r.deviceType || 'Unknown',
        location: r.location,
        serialNumber: r.serialNumber,
        result: r.result,
        notes: r.notes,
      })),
      // Include missing location info if override mode is enabled
      missingLocationDeficiencies: allowOverride && locationValidation.missingDeficiencies.length > 0
        ? locationValidation.missingDeficiencies
        : undefined,
    });
    
    // Upload to S3
    const fileKey = `reports/${job.companyId}/Inspectra-${job.jobNumber.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
    
    // Create or update report record
    const reportNumber = `RPT-${Date.now().toString(36).toUpperCase()}`;
    const stats = await db.getInspectionStats(input.jobId);
    
    const report = await db.createReport({
      jobId: input.jobId,
      title: `Inspection Report - ${job.title}`,
      executiveSummary: input.summary,
      aiSummary: input.summary,
      generatedById: ctx.user.id,
      reportNumber,
      deviceCount: stats.total,
      passCount: stats.pass,
      failCount: stats.fail,
      deficiencyCount: deficiencies.length,
      fileKey,
      fileUrl: url,
      status: 'generated',
    });
    
    return { 
      success: true, 
      reportId: report.id,
      fileUrl: url,
      reportNumber,
    };
  }),
  
  generateCompliancePDF: officeProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    // DEPRECATED: Use annualReport.generate instead
    console.warn('[DEPRECATED] report.generateCompliancePDF is deprecated. Use annualReport.generate instead.');
    
    // Get job details
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    
    // Get site details
    const site = await db.getSiteById(job.siteId);
    if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    
    // Get customer org
    const customerOrg = await db.getCustomerOrgById(job.customerOrgId);
    
    // Get company
    const company = await db.getCompanyById(job.companyId);
    
    // Get inspection results with device info
    const inspectionResults = await db.getInspectionResultsByJob(input.jobId);
    
    // Get deficiencies
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    // Get technician details
    const technician = await db.getUserById(job.assignedTechnicianId || ctx.user.id);
    
    // Fetch saved checklist responses
    const savedResponses = await db.getChecklistResponsesByJob(input.jobId);
    
    // Audit checklist completeness
    const { auditChecklistCompleteness, formatMissingItemsMessage } = await import('./checklistValidation');
    const auditResult = auditChecklistCompleteness(savedResponses);
    
    if (!auditResult.isComplete) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Checklist incomplete (${auditResult.completionPercentage}% complete). ${formatMissingItemsMessage(auditResult.missingItems)}`,
      });
    }
    
    // Validate device locations before generating Annual report
    const { validateAnnualReportLocations } = await import('./locationValidation');
    const locationValidation = validateAnnualReportLocations({
      fireAlarmDevices: inspectionResults
        .filter(r => r.deviceType?.toLowerCase().includes('smoke') || 
                     r.deviceType?.toLowerCase().includes('heat') || 
                     r.deviceType?.toLowerCase().includes('pull') ||
                     r.deviceType?.toLowerCase().includes('horn') ||
                     r.deviceType?.toLowerCase().includes('strobe'))
        .map(r => ({
          id: r.id,
          deviceType: r.deviceType || 'Unknown',
          location: r.location,
          identification: r.serialNumber,
        })),
      fireExtinguishers: inspectionResults
        .filter(r => r.deviceType?.toLowerCase().includes('extinguisher'))
        .map(r => ({
          id: r.id,
          location: r.location,
          serialNumber: r.serialNumber,
        })),
      emergencyLights: inspectionResults
        .filter(r => r.deviceType?.toLowerCase().includes('emergency') || 
                     r.deviceType?.toLowerCase().includes('exit'))
        .map(r => ({
          id: r.id,
          location: r.location,
          identification: r.serialNumber,
        })),
    });
    
    if (!locationValidation.isValid) {
      const missingList = locationValidation.missingDevices
        .map(d => `  - ${d.type} (ID: ${d.id}${d.identification ? `, ${d.identification}` : ''}${d.deviceType ? `, Type: ${d.deviceType}` : ''})`)
        .join('\n');
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot generate Annual report: ${locationValidation.totalMissing} device(s) missing location information.\n\nMissing locations for:\n${missingList}\n\nPlease add locations to all devices before generating the Annual Inspection Report.`,
      });
    }
    
    // Build a map of responses for quick lookup
    const responseMap = new Map<string, { status: 'PASS' | 'DEFICIENT' | 'NA'; comment?: string }>();
    savedResponses.forEach(r => {
      const key = `${r.sectionNumber}-${r.itemId}`;
      responseMap.set(key, {
        status: r.status,
        comment: r.comment || undefined,
      });
    });
    
    // Helper to convert saved responses to checklist format
    const buildOverrides = (sectionNumber: string) => {
      const overrides: Record<string, 'YES' | 'NO' | 'N/A'> = {};
      savedResponses
        .filter(r => r.sectionNumber === sectionNumber)
        .forEach(r => {
          overrides[r.itemId] = r.status === 'PASS' ? 'YES' : r.status === 'DEFICIENT' ? 'NO' : 'N/A';
        });
      return Object.keys(overrides).length > 0 ? overrides : undefined;
    };
    
    // Build checklist sections using saved responses
    const checklistSections = [
      checklists.getControlUnitInspectionChecklist(
        'LOBBY',
        'EDWARDS EST 3X',
        buildOverrides('22.1')
      ),
      checklists.getControlUnitTestChecklist(
        'LOBBY',
        'EDWARDS EST 3X',
        buildOverrides('22.2'),
        deficiencies.length > 0 ? 'See deficiencies summary for details' : undefined
      ),
      checklists.getPowerSupplyInspectionChecklist(
        'LOBBY',
        'EDWARDS EST 3X',
        'P1 ELECTRICAL RM',
        '#24',
        buildOverrides('22.4')
      ),
      checklists.getEmergencyPowerSupplyChecklist(
        'LOBBY',
        'EDWARDS',
        27.33,
        0.15,
        25.62,
        0.39,
        24.775,
        4.71,
        buildOverrides('22.5')
      ),
      checklists.getAnnunciatorTestChecklist(
        'LOBBY',
        'EDWARDS',
        buildOverrides('22.6'),
        deficiencies.length > 0 ? 'See deficiencies summary for details' : undefined
      ),
      checklists.getCircuitSupervisionChecklist(
        buildOverrides('22.7')
      ),
      checklists.getSmokeDetectorsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('smoke')).length,
        buildOverrides('22.8')
      ),
      checklists.getHeatDetectorsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('heat')).length,
        buildOverrides('22.9')
      ),
      checklists.getDuctDetectorsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('duct')).length,
        buildOverrides('22.10')
      ),
      checklists.getManualPullStationsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('pull')).length,
        buildOverrides('22.11')
      ),
      checklists.getWaterflowDevicesChecklist(
        buildOverrides('22.12')
      ),
      checklists.getSupervisoryDevicesChecklist(
        buildOverrides('22.13')
      ),
      checklists.getFireSignalReceivingCentreChecklist(
        'BARTEC',
        undefined,
        buildOverrides('22.14')
      ),
      checklists.getAudibleSignalingDevicesChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('horn') || r.deviceType?.toLowerCase().includes('bell')).length,
        buildOverrides('22.15')
      ),
      checklists.getVisualSignalingDevicesChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('strobe')).length,
        buildOverrides('22.16')
      ),
    ]; // Build device records
    const fireAlarmDevices = inspectionResults
      .filter(r => r.deviceType?.toLowerCase().includes('smoke') || 
                   r.deviceType?.toLowerCase().includes('heat') || 
                   r.deviceType?.toLowerCase().includes('pull') ||
                   r.deviceType?.toLowerCase().includes('horn') ||
                   r.deviceType?.toLowerCase().includes('strobe'))
      .sort((a, b) => {
        // Sort by walkOrder (nulls last), then by location as fallback
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      })
      .map(r => ({
        deviceType: r.deviceType || 'Unknown',
        location: r.location || 'Unknown',
        result: r.result === 'pass' ? 'PASS' as const : r.result === 'fail' ? 'DEFICIENT' as const : 'NO ACCESS' as const,
        notes: r.notes || undefined,
      }));
    
    const fireExtinguishers = inspectionResults
      .filter(r => r.deviceType?.toLowerCase().includes('extinguisher'))
      .sort((a, b) => {
        // Sort by walkOrder (nulls last), then by location as fallback
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      })
      .map(r => ({
        location: r.location || 'Unknown',
        type: r.deviceType || 'Unknown',
        serialNumber: r.serialNumber || undefined,
        result: r.result === 'pass' ? 'PASS' as const : 'DEFICIENT' as const,
      }));
    
    const emergencyLights = inspectionResults
      .filter(r => r.deviceType?.toLowerCase().includes('emergency') || 
                   r.deviceType?.toLowerCase().includes('exit'))
      .sort((a, b) => {
        // Sort by walkOrder (nulls last), then by location as fallback
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      })
      .map(r => ({
        location: r.location || 'Unknown',
        functionalTest: r.result === 'pass' ? 'PASS' as const : 'FAIL' as const,
        durationTest: 'N/A' as const,
        comments: r.notes || undefined,
      }));
    
    // Build deficiencies summary
    const deficienciesSummary = await Promise.all(deficiencies.map(async (d) => {
      let deviceType: string | undefined = undefined;
      let location: string | undefined = undefined;
      if (d.deviceId) {
        const device = await db.getDeviceById(d.deviceId);
        if (device) {
          deviceType = device.deviceType;
          location = device.location || undefined;
        }
      }
      return {
        system: deviceType || 'Fire Alarm System',
        location: location || 'Various',
        description: d.description || 'No description provided',
      };
    }));
    
    // Generate compliance PDF
    const pdfBuffer = await generateComplianceReportPDF({
      workOrderNumber: job.jobNumber,
      dateOfService: job.scheduledDate || new Date(),
      inspectionFrequency: 'Annual',
      contactPerson: customerOrg?.contactName || 'N/A',
      contactPhone: customerOrg?.contactPhone || 'N/A',
      buildingName: site.name,
      buildingAddress: site.address || '',
      city: site.city || '',
      postalCode: site.postalCode || undefined,
      pmOrOwner: customerOrg?.name,
      ownerPhone: customerOrg?.contactPhone || undefined,
      
      systemsInspected: {
        fireAlarmSystem: true,
        commonAreaDevices: true,
        inSuiteDevices: false,
        sprinklerSystem: false,
        fireExtinguishers: fireExtinguishers.length > 0,
        emergencyLighting: emergencyLights.length > 0,
        hydrant: false,
        winterization: false,
        generator: false,
        backflow: false,
        monitoring: false,
        smokeControl: false,
        suppressionSystems: false,
        standpipe: false,
        kitchen: false,
      },
      
      systemModel: 'EDWARDS EST 3X',
      systemOperation: 'Single Stage',
      fireSignalReceivingCentre: 'BARTEC',
      connectedToFireSignalReceivingCentre: true,
      systemFullyFunctional: deficiencies.length === 0,
      deficienciesIdentified: deficiencies.length > 0,
      deficienciesCorrectedDate: undefined,
      recommendationsIdentified: false,
      
      technicianName: technician?.name || ctx.user.name || 'Unknown',
      technicianCertificateNumber: '1448',
      secondaryTechnicianName: undefined,
      secondaryTechnicianCertificateNumber: undefined,
      companyName: 'Earth Wind and Fire',
      companyPhone: '604-299-1030',
      
      checklists: checklistSections,
      fireAlarmDevices,
      fireExtinguishers,
      emergencyLights,
      deficiencies: deficienciesSummary,
    });
    
    // Upload to S3
    const fileKey = `reports/${job.companyId}/Inspectra-${job.jobNumber.replace(/[^a-zA-Z0-9]/g, '-')}-compliance-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
    
    // Create report record
    const reportNumber = `CMP-${Date.now().toString(36).toUpperCase()}`;
    const stats = await db.getInspectionStats(input.jobId);
    
    const report = await db.createReport({
      jobId: input.jobId,
      title: `CAN/ULC-S536 Compliance Report - ${job.title}`,
      executiveSummary: 'Annual fire alarm system inspection per CAN/ULC-S536:2019',
      aiSummary: 'Annual fire alarm system inspection per CAN/ULC-S536:2019',
      generatedById: ctx.user.id,
      reportNumber,
      deviceCount: stats.total,
      passCount: stats.pass,
      failCount: stats.fail,
      deficiencyCount: deficiencies.length,
      fileKey,
      fileUrl: url,
      status: 'generated',
    });
    
    return { 
      success: true, 
      reportId: report.id,
      fileUrl: url,
      reportNumber,
    };
  }),
});

// Checklist router
const checklistRouter = router({  
  saveResponse: technicianProcedure.input(z.object({
    jobId: z.number(),
    sectionNumber: z.string(),
    itemId: z.string(),
    status: z.enum(['PASS', 'DEFICIENT', 'NA']),
    comment: z.string().optional(),
  })).mutation(async ({ input }) => {
    await db.saveChecklistResponse(input);
    return { success: true };
  }),
  
  bulkSaveResponses: technicianProcedure.input(z.object({
    responses: z.array(z.object({
      jobId: z.number(),
      sectionNumber: z.string(),
      itemId: z.string(),
      status: z.enum(['PASS', 'DEFICIENT', 'NA']),
      comment: z.string().optional(),
    })),
  })).mutation(async ({ input }) => {
    await db.bulkSaveChecklistResponses(input.responses);
    return { success: true };
  }),
  
  getByJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    return db.getChecklistResponsesByJob(input.jobId);
  }),
  
  getByJobAndItem: protectedProcedure.input(z.object({
    jobId: z.number(),
    sectionNumber: z.string(),
    itemId: z.string(),
  })).query(async ({ input }) => {
    return db.getChecklistResponseByJobAndItem(input.jobId, input.sectionNumber, input.itemId);
  }),
  
  deleteByJob: officeProcedure.input(z.object({ jobId: z.number() })).mutation(async ({ input }) => {
    await db.deleteChecklistResponsesByJob(input.jobId);
    return { success: true };
  }),
});

// AI Features router
const aiRouter = router({
  // Deficiency narrative generator
  generateDeficiencyNarrative: technicianProcedure.input(z.object({
    deviceType: z.string(),
    location: z.string(),
    observedIssue: z.string(),
    testOutcome: z.string(),
    codeReference: z.string().optional(),
    priorHistory: z.string().optional(),
  })).mutation(async ({ input }) => {
    // Validate required fields
    const missingFields: string[] = [];
    
    if (!input.location || input.location.trim() === '' || input.location === 'Unknown location') {
      missingFields.push('location');
    }
    
    if (!input.observedIssue || input.observedIssue.trim() === '') {
      missingFields.push('observed issue');
    }
    
    if (!input.deviceType || input.deviceType.trim() === '') {
      missingFields.push('device type');
    }
    
    if (missingFields.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Missing required fields: ${missingFields.join(', ')}. Please provide all required information before generating narrative.`
      });
    }
    const prompt = `You are a fire alarm inspection expert. Generate a professional deficiency narrative based on the following information:

Device Type: ${input.deviceType}
Location: ${input.location}
Observed Issue: ${input.observedIssue}
Test Outcome: ${input.testOutcome}
${input.codeReference ? `Code Reference: ${input.codeReference}` : ''}
${input.priorHistory ? `Prior History: ${input.priorHistory}` : ''}

Please provide:
1. A professional deficiency description (technical, detailed)
2. Recommended corrective action (specific steps)
3. Customer-friendly explanation (non-technical, easy to understand)

Format your response as JSON with keys: description, correctiveAction, customerExplanation`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm inspection expert assistant. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "deficiency_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              description: { type: "string", description: "Technical deficiency description" },
              correctiveAction: { type: "string", description: "Recommended corrective action" },
              customerExplanation: { type: "string", description: "Customer-friendly explanation" }
            },
            required: ["description", "correctiveAction", "customerExplanation"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return { ...JSON.parse(content), isDraft: true };
  }),
  
  // Smart repair recommendations
  generateRepairRecommendations: technicianProcedure.input(z.object({
    deviceType: z.string(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    issue: z.string(),
    deficiencyDescription: z.string().optional(),
  })).mutation(async ({ input }) => {
    const prompt = `You are a fire alarm repair expert. Provide repair recommendations for:

Device Type: ${input.deviceType}
${input.manufacturer ? `Manufacturer: ${input.manufacturer}` : ''}
${input.model ? `Model: ${input.model}` : ''}
Issue: ${input.issue}
${input.deficiencyDescription ? `Deficiency Description: ${input.deficiencyDescription}` : ''}

Please provide:
1. Troubleshooting steps (numbered list)
2. Suggested parts and tools needed
3. Suggested evidence photos to take
4. Repair checklist

Format your response as JSON with keys: troubleshootingSteps (array), partsAndTools (array), suggestedPhotos (array), repairChecklist (array)`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm repair expert assistant. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "repair_recommendations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              troubleshootingSteps: { type: "array", items: { type: "string" } },
              partsAndTools: { type: "array", items: { type: "string" } },
              suggestedPhotos: { type: "array", items: { type: "string" } },
              repairChecklist: { type: "array", items: { type: "string" } }
            },
            required: ["troubleshootingSteps", "partsAndTools", "suggestedPhotos", "repairChecklist"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return JSON.parse(content);
  }),
  
  // Inspection report summary writer
  generateReportSummary: officeProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    
    const site = await db.getSiteById(job.siteId);
    const stats = await db.getInspectionStats(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    const criticalCount = deficiencies.filter(d => d.severity === 'critical').length;
    const majorCount = deficiencies.filter(d => d.severity === 'major').length;
    const minorCount = deficiencies.filter(d => d.severity === 'minor').length;
    
    const prompt = `You are a fire alarm inspection report writer. Generate an executive summary for this inspection:

Site: ${site?.name || 'Unknown'}
Address: ${site?.address || 'N/A'}
Job Type: ${job.jobType}
Inspection Date: ${job.completedAt || job.scheduledDate || 'N/A'}

Results:
- Total Devices Tested: ${stats.total}
- Passed: ${stats.pass}
- Failed: ${stats.fail}
- N/A: ${stats.na}
- Not Tested: ${stats.notTested}

Deficiencies Found: ${deficiencies.length}
- Critical: ${criticalCount}
- Major: ${majorCount}
- Minor: ${minorCount}

Deficiency Details:
${deficiencies.slice(0, 10).map(d => `- ${d.title}: ${d.description || 'No description'}`).join('\n')}

Please provide:
1. Executive summary bullets (3-5 key points)
2. Overall system status assessment
3. Priority items requiring immediate attention
4. Recommended next steps

Important: Only report observed facts. Do not make conclusions about cause or origin.

Format your response as JSON with keys: executiveSummary (array of strings), systemStatus (string), priorityItems (array), nextSteps (array)`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm inspection report writer. Only report observed facts, never conclusions about cause or origin. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "report_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              executiveSummary: { type: "array", items: { type: "string" } },
              systemStatus: { type: "string" },
              priorityItems: { type: "array", items: { type: "string" } },
              nextSteps: { type: "array", items: { type: "string" } }
            },
            required: ["executiveSummary", "systemStatus", "priorityItems", "nextSteps"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return { ...JSON.parse(content), stats, deficiencyCount: deficiencies.length };
  }),
  
  // Photo note helper
  generatePhotoCaption: technicianProcedure.input(z.object({
    label: z.string(),
    deviceType: z.string().optional(),
    context: z.string().optional(),
  })).mutation(async ({ input }) => {
    const prompt = `Generate a short, professional caption and inspection note for a photo labeled "${input.label}"${input.deviceType ? ` of a ${input.deviceType}` : ''}${input.context ? `. Context: ${input.context}` : ''}.

Format your response as JSON with keys: caption (short, 10 words max), inspectionNote (detailed, 1-2 sentences)`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a fire alarm inspection assistant. Generate concise, professional photo captions. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "photo_caption",
          strict: true,
          schema: {
            type: "object",
            properties: {
              caption: { type: "string" },
              inspectionNote: { type: "string" }
            },
            required: ["caption", "inspectionNote"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI response empty' });
    
    return JSON.parse(content);
  }),
  
  // QA check for admin
  runQACheck: adminProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    
    const site = await db.getSiteById(job.siteId);
    const devices = await db.getDevicesBySite(job.siteId);
    const results = await db.getInspectionResultsByJob(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    const issues: string[] = [];
    
    // Check for untested devices
    const testedDeviceIds = new Set(results.map(r => r.deviceId));
    const untestedDevices = devices.filter(d => !testedDeviceIds.has(d.id));
    if (untestedDevices.length > 0) {
      issues.push(`${untestedDevices.length} device(s) not tested: ${untestedDevices.slice(0, 5).map(d => d.deviceType + ' at ' + d.location).join(', ')}${untestedDevices.length > 5 ? '...' : ''}`);
    }
    
    // Check for failed devices without deficiencies
    const failedResults = results.filter(r => r.result === 'fail');
    const deficiencyDeviceIds = new Set(deficiencies.map(d => d.deviceId).filter(Boolean));
    const failedWithoutDeficiency = failedResults.filter(r => !deficiencyDeviceIds.has(r.deviceId));
    if (failedWithoutDeficiency.length > 0) {
      issues.push(`${failedWithoutDeficiency.length} failed device(s) without deficiency records`);
    }
    
    // Check for deficiencies without photos
    for (const def of deficiencies) {
      const photos = await db.getAttachmentsByEntity('deficiency', def.id);
      if (photos.length === 0) {
        issues.push(`Deficiency "${def.title}" has no photos attached`);
      }
    }
    
    // Check for missing notes on failed devices
    const failedWithoutNotes = failedResults.filter(r => !r.notes || r.notes.trim() === '');
    if (failedWithoutNotes.length > 0) {
      issues.push(`${failedWithoutNotes.length} failed device(s) without inspection notes`);
    }
    
    // Check job completion
    if (job.status !== 'completed' && results.length === devices.length) {
      issues.push('All devices tested but job not marked as completed');
    }
    
    return {
      jobId: input.jobId,
      siteName: site?.name,
      totalDevices: devices.length,
      testedDevices: results.length,
      deficienciesCount: deficiencies.length,
      issues,
      passedQA: issues.length === 0
    };
  }),
});

// User management router
const userRouter = router({
  list: adminProcedure.input(z.object({ companyId: z.number().optional() })).query(async ({ input }) => {
    return db.getAllUsers(input.companyId);
  }),
  
  listTechnicians: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    const users = await db.getAllUsers(input.companyId);
    return users.filter((u: any) => u.role === 'technician' && u.isActive === 1);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getUserById(input.id);
  }),
  
  updateRole: adminProcedure.input(z.object({
    userId: z.number(),
    role: z.enum(['admin', 'office', 'technician', 'customer']),
    companyId: z.number().optional(),
    customerOrgId: z.number().optional(),
  })).mutation(async ({ input }) => {
    await db.updateUserRole(input.userId, input.role, input.companyId, input.customerOrgId);
    return { success: true };
  }),
});

// Dashboard router
const dashboardRouter = router({
  getStats: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getDashboardStats(input.companyId);
  }),
  
  getRecentJobs: officeProcedure.input(z.object({ 
    companyId: z.number(),
    limit: z.number().optional()
  })).query(async ({ input }) => {
    const jobs = await db.getJobsByCompany(input.companyId);
    return jobs.slice(0, input.limit || 10);
  }),
});

// Import router for CSV/XLSX imports
const importRouter = router({
  // Get import history
  list: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getImportLogsByCompany(input.companyId);
  }),
  
  listBySite: officeProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getImportLogsBySite(input.siteId);
  }),
  
  get: officeProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getImportLogById(input.id);
  }),
  
  getResults: officeProcedure.input(z.object({ importLogId: z.number() })).query(async ({ input }) => {
    return db.getImportRowResultsByLog(input.importLogId);
  }),
  
  getErrors: officeProcedure.input(z.object({ importLogId: z.number() })).query(async ({ input }) => {
    return db.getImportErrorsByLog(input.importLogId);
  }),
  
  // Parse uploaded file and return preview data
  parseFile: officeProcedure.input(z.object({
    fileName: z.string(),
    fileData: z.string(), // Base64 encoded
    sheetName: z.string().optional(), // Optional: if not provided, use smart default
  })).mutation(async ({ input }) => {
    try {
      const XLSX = await import('xlsx');
      const buffer = Buffer.from(input.fileData, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      console.log('[parseFile] Workbook loaded:', {
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        requestedSheet: input.sheetName
      });
    
    // Smart default heuristic
    const getDefaultSheetName = () => {
      // Priority 1: Exact match for "Individual devices" or "Individual device record"
      const exactMatches = ['individual devices', 'individual device record', 'device list'];
      for (const target of exactMatches) {
        const match = workbook.SheetNames.find(name => 
          name && String(name).toLowerCase().trim() === target
        );
        if (match) return match;
      }
      
      // Priority 2: Contains high-priority device keywords (ordered by specificity)
      const highPriorityKeywords = [
        "individual device",  // Matches "Individual device record"
        "device list",
        "fire alarm devices"
      ];
      
      for (const keyword of highPriorityKeywords) {
        const match = workbook.SheetNames.find(name => 
          name && String(name).toLowerCase().includes(keyword)
        );
        if (match) return match;
      }
      
      // Priority 3: Contains general device keywords
      const generalKeywords = [
        "devices", "smoke", "heat", "pull",
        "extinguisher", "emergency light", "sprinkler"
      ];
      
      for (const keyword of generalKeywords) {
        const match = workbook.SheetNames.find(name => 
          name && String(name).toLowerCase().includes(keyword)
        );
        if (match) return match;
      }
      
      // Fallback: first sheet
      return workbook.SheetNames[0];
    };
    
    const sheetName = input.sheetName || getDefaultSheetName();
    
    // Validate sheet exists
    if (!workbook.Sheets[sheetName]) {
      throw new TRPCError({ 
        code: 'BAD_REQUEST', 
        message: `Sheet "${sheetName}" not found in workbook` 
      });
    }
    
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (data.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sheet is empty' });
    }
    
    // Convert headers to strings (handle numbers, dates, etc.)
    const headers = (data[0] as any[]).map(h => String(h || ''));
    const rows = data.slice(1, 11); // Preview first 10 rows
    const totalRows = data.length - 1;
    
    // Check if this looks like a device sheet
    const deviceHeaders = ['location', 'device', 'type', 'model', 'serial'];
    const hasDeviceHeaders = headers.some(h => {
      const headerStr = String(h || '').toLowerCase();
      return deviceHeaders.some(dh => headerStr.includes(dh));
    });
    
      console.log('[parseFile] Parse successful:', {
        sheetName,
        headerCount: headers.length,
        totalRows,
        hasDeviceHeaders
      });
      
      return {
        headers,
        previewRows: rows,
        totalRows,
        sheetName,
        sheetNames: workbook.SheetNames,
        defaultSheetName: sheetName,
        hasDeviceHeaders,
      };
    } catch (error: any) {
      console.error('[parseFile] Error:', {
        message: error.message,
        stack: error.stack,
        fileName: input.fileName
      });
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Failed to parse file: ${error.message}`
      });
    }
  }),
  
  // Validate import with column mapping
  validate: officeProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    importType: z.enum(['devices', 'sites', 'areas', 'customers']),
    fileName: z.string(),
    fileData: z.string(),
    sheetName: z.string(), // Required: which sheet to validate
    columnMapping: z.record(z.string(), z.string()), // targetField -> sourceColumn
    duplicateHandling: z.enum(['skip', 'update', 'create_new']).optional(),
  })).mutation(async ({ input }) => {
    const XLSX = await import('xlsx');
    const buffer = Buffer.from(input.fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Validate sheet exists
    if (!workbook.Sheets[input.sheetName]) {
      throw new TRPCError({ 
        code: 'BAD_REQUEST', 
        message: `Sheet "${input.sheetName}" not found` 
      });
    }
    
    const sheet = workbook.Sheets[input.sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    const headers = data[0] as string[];
    const rows = data.slice(1);
    
    const validationResults: Array<{
      rowNumber: number;
      status: 'valid' | 'error' | 'duplicate';
      errors: string[];
      data: Record<string, any>;
    }> = [];
    
    const requiredFields = input.importType === 'devices' 
      ? ['deviceType'] 
      : input.importType === 'sites' 
        ? ['name'] 
        : ['name'];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowData: Record<string, any> = {};
      const errors: string[] = [];
      
      // Map columns to fields
      for (const [targetField, sourceColumn] of Object.entries(input.columnMapping)) {
        const colIndex = headers.indexOf(sourceColumn);
        if (colIndex !== -1) {
          rowData[targetField] = row[colIndex];
        }
      }
      
      // Validate required fields
      for (const field of requiredFields) {
        if (!rowData[field] || String(rowData[field]).trim() === '') {
          errors.push(`Missing required field: ${field}`);
        }
      }
      
      // Check for duplicates (for devices)
      let isDuplicate = false;
      if (input.importType === 'devices' && (rowData.serialNumber || rowData.barcode)) {
        const existing = await db.findDuplicateDevice(
          input.siteId,
          rowData.serialNumber || null,
          rowData.barcode || null
        );
        if (existing) {
          isDuplicate = true;
        }
      }
      
      validationResults.push({
        rowNumber: i + 2, // 1-indexed, accounting for header
        status: errors.length > 0 ? 'error' : isDuplicate ? 'duplicate' : 'valid',
        errors,
        data: rowData,
      });
    }
    
    const validCount = validationResults.filter(r => r.status === 'valid').length;
    const errorCount = validationResults.filter(r => r.status === 'error').length;
    const duplicateCount = validationResults.filter(r => r.status === 'duplicate').length;
    
    return {
      totalRows: rows.length,
      validCount,
      errorCount,
      duplicateCount,
      results: validationResults,
    };
  }),
  
  // Execute import
  execute: officeProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    importType: z.enum(['devices', 'sites', 'areas', 'customers']),
    fileName: z.string(),
    fileData: z.string(),
    sheetName: z.string(), // Required: which sheet to import
    columnMapping: z.record(z.string(), z.string()),
    duplicateHandling: z.enum(['skip', 'update', 'create_new']),
  })).mutation(async ({ input, ctx }) => {
    const XLSX = await import('xlsx');
    const buffer = Buffer.from(input.fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Validate sheet exists
    if (!workbook.Sheets[input.sheetName]) {
      throw new TRPCError({ 
        code: 'BAD_REQUEST', 
        message: `Sheet "${input.sheetName}" not found` 
      });
    }
    
    const sheet = workbook.Sheets[input.sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    const headers = data[0] as string[];
    const rows = data.slice(1);
    
    // Create import log
    const importLog = await db.createImportLog({
      companyId: input.companyId,
      siteId: input.siteId,
      importedById: ctx.user.id,
      importType: input.importType,
      fileName: input.fileName,
      columnMapping: input.columnMapping as any,
      duplicateHandling: input.duplicateHandling,
      totalRows: rows.length,
      status: 'importing',
      startedAt: new Date(),
    });
    
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    const rowResults: Array<{
      importLogId: number;
      rowNumber: number;
      status: 'success' | 'error' | 'duplicate' | 'skipped';
      entityId?: number;
      originalData: any;
      errorMessage?: string;
    }> = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowData: Record<string, any> = {};
      
      // Map columns to fields
      for (const [targetField, sourceColumn] of Object.entries(input.columnMapping)) {
        const colIndex = headers.indexOf(sourceColumn);
        if (colIndex !== -1 && row[colIndex] !== undefined && row[colIndex] !== '') {
          rowData[targetField] = row[colIndex];
        }
      }
      
      try {
        if (input.importType === 'devices') {
          // Check for duplicate
          const existing = await db.findDuplicateDevice(
            input.siteId,
            rowData.serialNumber || null,
            rowData.barcode || null
          );
          
          if (existing) {
            if (input.duplicateHandling === 'skip') {
              skippedCount++;
              rowResults.push({
                importLogId: importLog.id,
                rowNumber: i + 2,
                status: 'skipped',
                originalData: rowData,
                errorMessage: 'Duplicate - skipped',
              });
              continue;
            } else if (input.duplicateHandling === 'update') {
              await db.updateDevice(existing.id, {
                ...rowData,
                siteId: input.siteId,
              });
              duplicateCount++;
              rowResults.push({
                importLogId: importLog.id,
                rowNumber: i + 2,
                status: 'duplicate',
                entityId: existing.id,
                originalData: rowData,
              });
              continue;
            }
            // create_new falls through to create
          }
          
          // Create new device
          const device = await db.createDevice({
            companyId: ctx.user.companyId!,
            siteId: input.siteId,
            deviceType: rowData.deviceType || 'Unknown',
            manufacturer: rowData.manufacturer,
            model: rowData.model,
            serialNumber: rowData.serialNumber,
            location: rowData.location,
            barcode: rowData.barcode,
            notes: rowData.notes,
          });
          
          successCount++;
          rowResults.push({
            importLogId: importLog.id,
            rowNumber: i + 2,
            status: 'success',
            entityId: device.id,
            originalData: rowData,
          });
        }
      } catch (error: any) {
        errorCount++;
        rowResults.push({
          importLogId: importLog.id,
          rowNumber: i + 2,
          status: 'error',
          originalData: rowData,
          errorMessage: error.message || 'Unknown error',
        });
      }
    }
    
    // Save row results
    await db.createBulkImportRowResults(rowResults);
    
    // Update import log
    await db.updateImportLog(importLog.id, {
      status: errorCount > 0 ? 'partial' : 'completed',
      successCount,
      errorCount,
      duplicateCount,
      skippedCount,
      completedAt: new Date(),
    });
    
    return {
      importLogId: importLog.id,
      totalRows: rows.length,
      successCount,
      errorCount,
      duplicateCount,
      skippedCount,
    };
  }),
});

// Sync router for offline support
const syncRouter = router({
  getLogs: technicianProcedure.input(z.object({ limit: z.number().optional() })).query(async ({ input, ctx }) => {
    return db.getSyncLogsByUser(ctx.user.id, input.limit);
  }),
  
  getJobDataForOffline: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) return null;
    
    const site = await db.getSiteById(job.siteId);
    const areas = site ? await db.getAreasBySite(site.id) : [];
    const devices = await db.getDevicesBySite(job.siteId);
    const existingResults = await db.getInspectionResultsByJob(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    return {
      job,
      site,
      areas,
      devices,
      existingResults,
      deficiencies,
      downloadedAt: new Date()
    };
  }),
});

// Phase 2: Explicit Report Endpoints
// These are simple wrappers that provide explicit naming and logging
// They call the same underlying generators (generateCompliancePDF for Annual, generatePDF for Deficiency)
// All Phase 1 validation is preserved and passed through unchanged

const annualReportRouter = router({
  // DEFINITIVE Annual Inspection Report endpoint
  // Routes to: generateCompliancePDF (CAN/ULC-S536 compliance report)
  // Enforces: Checklist completeness (122 items) + Device locations
  generate: reportRouter._def.procedures.generateCompliancePDF,
});

const deficiencyReportRouter = router({
  // DEFINITIVE Deficiency Report endpoint  
  // Routes to: generatePDF (Fire-Pro style with pricing)
  // Enforces: Deficiency locations
  generate: reportRouter._def.procedures.generatePDF,
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  
  company: companyRouter,
  customerOrg: customerOrgRouter,
  site: siteRouter,
  area: areaRouter,
  device: deviceRouter,
  job: jobRouter,
  inspectionResult: inspectionResultRouter,
  deficiency: deficiencyRouter,
  repair: repairRouter,
  attachment: attachmentRouter,
  report: reportRouter,
  annualReport: annualReportRouter,
  deficiencyReport: deficiencyReportRouter,
  checklist: checklistRouter,
  ai: aiRouter,
  user: router({
    ...userRouter._def.procedures,
    ...userManagementRouter._def.procedures,
  }),
  dashboard: dashboardRouter,
  sync: syncRouter,
  fileTag: fileTagRouter,
  uploadQueue: uploadQueueRouter,
  import: importRouter,
  fireAlarm: fireAlarmRouter,
  sprinkler: sprinklerRouter,
  jobAssignment: jobAssignmentRouter,
  assetImport: assetImportRouter,
  files: filesRouter,
});

export type AppRouter = typeof appRouter;
