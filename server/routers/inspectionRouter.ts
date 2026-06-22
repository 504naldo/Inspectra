import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, technicianProcedure, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { withAudit, assertJobNotFinalized, assertJobCompany } from "../db";

// Inspection Result router
const inspectionResultRouter = router({
  listByJob: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return db.getInspectionResultsByJob(input.jobId);
  }),

  getByJobAndDevice: technicianProcedure.input(z.object({
    jobId: z.number(),
    deviceId: z.number()
  })).query(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return db.getInspectionResultByJobAndDevice(input.jobId, input.deviceId);
  }),

  upsert: technicianProcedure.input(z.object({
    jobId: z.number(),
    deviceId: z.number(),
    result: z.enum(['pass', 'fail', 'na', 'not_tested']),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return withAudit(ctx, 'inspectionResult.upsert', async (_tx) => {
      await assertJobNotFinalized(input.jobId, _tx);
      const data = {
        ...input,
        technicianId: ctx.user.id,
        testedAt: new Date(),
        syncedAt: new Date(),
      };
      return db.upsertInspectionResult(data);
    });
  }),

  bulkMarkPass: technicianProcedure.input(z.object({
    jobId: z.number(),
    deviceIds: z.array(z.number()),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return withAudit(ctx, 'inspectionResult.bulkMarkPass', async (_tx) => {
      await assertJobNotFinalized(input.jobId, _tx);
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
    });
  }),

  getStats: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return db.getInspectionStats(input.jobId);
  }),

  // Returns the result for this device from the most recent completed job at the same site.
  // Used to pre-fill suggestions and detect regressions on DeviceTest.
  getHistoricalForDevice: technicianProcedure
    .input(z.object({ jobId: z.number(), deviceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const job = await assertJobCompany(input.jobId, ctx.user.companyId!);
      if (!job.siteId) return null;

      const lastJob = await db.getLastCompletedJobForSite(job.siteId);
      if (!lastJob || lastJob.id === input.jobId) return null;

      const result = await db.getInspectionResultByJobAndDevice(lastJob.id, input.deviceId);
      if (!result || result.result === "not_tested") return null;

      return {
        result: result.result as "pass" | "fail" | "na",
        notes: result.notes ?? null,
        testedAt: result.testedAt ?? null,
        priorJobId: lastJob.id,
        priorJobCompletedAt: lastJob.finalizedAt ?? null,
      };
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
    const jobIds = Array.from(new Set(input.results.map((r) => r.jobId)));
    for (const jobId of jobIds) {
      await assertJobCompany(jobId, ctx.user.companyId!);
      await assertJobNotFinalized(jobId);
    }

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


// Checklist router
const checklistRouter = router({
  saveResponse: technicianProcedure.input(z.object({
    jobId: z.number(),
    sectionNumber: z.string(),
    itemId: z.string(),
    status: z.enum(['PASS', 'DEFICIENT', 'NA']),
    comment: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    await assertJobNotFinalized(input.jobId);
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
  })).mutation(async ({ input, ctx }) => {
    const jobIds = Array.from(new Set(input.responses.map((r) => r.jobId)));
    for (const jobId of jobIds) {
      await assertJobCompany(jobId, ctx.user.companyId!);
      await assertJobNotFinalized(jobId);
    }
    await db.bulkSaveChecklistResponses(input.responses);
    return { success: true };
  }),

  getByJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return db.getChecklistResponsesByJob(input.jobId);
  }),

  getByJobAndItem: protectedProcedure.input(z.object({
    jobId: z.number(),
    sectionNumber: z.string(),
    itemId: z.string(),
  })).query(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return db.getChecklistResponseByJobAndItem(input.jobId, input.sectionNumber, input.itemId);
  }),

  deleteByJob: officeProcedure.input(z.object({ jobId: z.number() })).mutation(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    await db.deleteChecklistResponsesByJob(input.jobId);
    return { success: true };
  }),
});

export { inspectionResultRouter, checklistRouter };
