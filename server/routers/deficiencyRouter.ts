import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, technicianProcedure, customerProcedure } from "../_core/trpc";
import * as db from "../db";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { withAudit, assertJobNotFinalized } from "../db";
import { assertCustomerOrgCompany } from "../tenantGuards";
import { toCustomerSafeDeficiency, toCustomerSafeRepair } from "../customerDto";

// Deficiency router
const deficiencyRouter = router({
  listByJob: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    await db.assertJobCompany(input.jobId, ctx.user.companyId!);
    return db.getDeficienciesByJob(input.jobId);
  }),
  
  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer') {
      if (ctx.user.customerOrgId !== input.customerOrgId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    } else {
      await assertCustomerOrgCompany(input.customerOrgId, ctx.user.companyId!);
    }
    const deficiencies = await db.getDeficienciesByCustomerOrg(input.customerOrgId);
    return ctx.user.role === 'customer' ? deficiencies.map(toCustomerSafeDeficiency) : deficiencies;
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const deficiency = await db.getDeficiencyById(input.id);
    if (!deficiency) return null;
    // Scope: verify user has access via the parent job's company
    const job = await db.getJobById(deficiency.jobId);
    if (job) {
      if (ctx.user.role === 'customer') {
        if (ctx.user.customerOrgId !== job.customerOrgId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      } else if (ctx.user.companyId !== job.companyId && !callerIsPlatformOperator()) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
    }
    const attachments = await db.getAttachmentsByEntity('deficiency', input.id);
    const repairs = await db.getRepairsByDeficiency(input.id);
    const isCustomer = ctx.user.role === 'customer';
    return {
      deficiency: isCustomer ? toCustomerSafeDeficiency(deficiency) : deficiency,
      attachments: isCustomer ? attachments.filter((a) => a.isCustomerFacing === 1) : attachments,
      repairs: isCustomer ? repairs.map(toCustomerSafeRepair) : repairs,
    };
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
    aiGeneratedAt: z.date().optional(),
    systemCategory: z.enum(['FIRE_ALARM', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHTING', 'SPRINKLER', 'SMOKE_ALARM']).optional(),
    estimatedCost: z.number().nonnegative().optional(),
    // Offline-sync idempotency: the client's stable local id for this deficiency.
    // On reconnect the same create may be replayed (e.g. a lost response); we
    // find-or-create on this key so a retry never duplicates the record.
    idempotencyKey: z.string().min(1).max(64).optional(),
  })).mutation(async ({ input, ctx }) => {
    await db.assertJobCompany(input.jobId, ctx.user.companyId!);

    // Idempotent replay: if this offline create was already applied, return the
    // existing deficiency instead of creating a duplicate. Confirm it belongs to
    // the same job (defense against an improbable key collision across tenants).
    if (input.idempotencyKey) {
      const existing = await db.getDeficiencyByIdempotencyKey(input.idempotencyKey);
      if (existing && existing.jobId === input.jobId) return existing;
    }

    return withAudit(ctx, 'deficiency.create', async (_tx) => {
      await assertJobNotFinalized(input.jobId, _tx);
      const { estimatedCost, ...rest } = input;
      return db.createDeficiency({
        ...rest,
        reportedById: ctx.user.id,
        ...(estimatedCost != null ? { estimatedCost: String(estimatedCost) } : {}),
      });
    });
  }),
  
  signOffFromPortal: customerProcedure
    .input(z.object({ deficiencyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const deficiency = await db.getDeficiencyById(input.deficiencyId);
      if (!deficiency) throw new TRPCError({ code: "NOT_FOUND" });

      const job = await db.getJobById(deficiency.jobId);
      if (!job || job.customerOrgId !== ctx.user.customerOrgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (deficiency.customerSignedOffAt) {
        return { success: true };
      }

      const updateData: any = {
        customerSignedOffAt: new Date(),
        customerSignedOffByName: ctx.user.name ?? ctx.user.email,
      };
      if (deficiency.status === "resolved") {
        updateData.status = "closed";
      }

      await db.updateDeficiency(input.deficiencyId, updateData);
      return { success: true };
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
    systemCategory: z.enum(['FIRE_ALARM', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHTING', 'SPRINKLER', 'SMOKE_ALARM']).optional(),
    estimatedCost: z.number().nonnegative().optional(),
  })).mutation(async ({ input, ctx }) => {
    // Fetch the deficiency to get jobId for finalization guard
    const existing = await db.getDeficiencyById(input.id);
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deficiency not found' });
    await db.assertJobCompany(existing.jobId, ctx.user.companyId!);
    return withAudit(ctx, 'deficiency.update', async (_tx) => {
      await assertJobNotFinalized(existing.jobId, _tx);
      const { id, status, estimatedCost, ...data } = input;
      const updateData: any = { ...data };
      if (estimatedCost != null) updateData.estimatedCost = String(estimatedCost);
      if (status) {
        updateData.status = status;
        if (status === 'resolved' || status === 'closed') {
          updateData.resolvedAt = new Date();
          updateData.resolvedById = ctx.user.id;
        }
      }
      await db.updateDeficiency(id, updateData);
      return { success: true };
    });
  }),
});

// Repair router
const repairRouter = router({
  listByDeficiency: technicianProcedure.input(z.object({ deficiencyId: z.number() })).query(async ({ input, ctx }) => {
    const deficiency = await db.getDeficiencyById(input.deficiencyId);
    if (!deficiency) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deficiency not found' });
    await db.assertJobCompany(deficiency.jobId, ctx.user.companyId!);
    return db.getRepairsByDeficiency(input.deficiencyId);
  }),

  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const repair = await db.getRepairById(input.id);
    if (!repair) return null;
    const deficiency = await db.getDeficiencyById(repair.deficiencyId);
    if (deficiency) await db.assertJobCompany(deficiency.jobId, ctx.user.companyId!);
    return repair;
  }),
  
  create: technicianProcedure.input(z.object({
    deficiencyId: z.number(),
    description: z.string().optional(),
    partsUsed: z.string().optional(),
    laborHours: z.number().optional(),
    aiRecommendations: z.any().optional(),
  })).mutation(async ({ input, ctx }) => {
    // Fetch deficiency to get jobId for finalization guard
    const deficiency = await db.getDeficiencyById(input.deficiencyId);
    if (!deficiency) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deficiency not found' });
    await db.assertJobCompany(deficiency.jobId, ctx.user.companyId!);
    return withAudit(ctx, 'repair.create', async (_tx) => {
      await assertJobNotFinalized(deficiency.jobId, _tx);
      return db.createRepair({ ...input, technicianId: ctx.user.id });
    });
  }),
  
  update: technicianProcedure.input(z.object({
    id: z.number(),
    status: z.enum(['pending', 'in_progress', 'completed', 'parts_ordered']).optional(),
    description: z.string().optional(),
    partsUsed: z.string().optional(),
    laborHours: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const repair = await db.getRepairById(input.id);
    if (!repair) throw new TRPCError({ code: 'NOT_FOUND', message: 'Repair not found' });
    const deficiency = await db.getDeficiencyById(repair.deficiencyId);
    if (!deficiency) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deficiency not found' });
    await db.assertJobCompany(deficiency.jobId, ctx.user.companyId!);
    return withAudit(ctx, 'repair.update', async (_tx) => {
      await assertJobNotFinalized(deficiency.jobId, _tx);
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
    });
  }),
});

export { deficiencyRouter, repairRouter };
