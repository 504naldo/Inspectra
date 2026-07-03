import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure, technicianProcedure, adminProcedure } from "../_core/trpc";

import * as db from "../db";
import { callerIsPlatformOperator } from "../_core/actorContext";

// User management router
const userRouter = router({
  list: adminProcedure.input(z.object({ companyId: z.number().optional() })).query(async ({ input, ctx }) => {
    // Fall back to the caller's own company — never return all-company data to a non-super-admin.
    return db.getAllUsers(input.companyId ?? ctx.user.companyId ?? undefined);
  }),
  
  listTechnicians: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const users = await db.getAllUsers(input.companyId);
    return users.filter((u: any) => ['technician', 'admin', 'office'].includes(u.role) && u.isActive === 1);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const target = await db.getUserById(input.id);
    if (!target) return null;
    // Users may read their own record; otherwise the target must be in the caller's company.
    if (target.id !== ctx.user.id && target.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return target;
  }),

  updateRole: adminProcedure.input(z.object({
    userId: z.number(),
    role: z.enum(['admin', 'office', 'technician', 'customer']),
    companyId: z.number().optional(),
    customerOrgId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    // The target user must already belong to the admin's company; the role is
    // always applied within the admin's own company (never another tenant).
    const target = await db.getUserById(input.userId);
    if (!target || target.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    await db.updateUserRole(input.userId, input.role, ctx.user.companyId ?? undefined, input.customerOrgId);
    return { success: true };
  }),
});

// Dashboard router
const dashboardRouter = router({
  getStats: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return db.getDashboardStats(input.companyId);
  }),

  getRecentJobs: officeProcedure.input(z.object({
    companyId: z.number(),
    limit: z.number().optional()
  })).query(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const jobs = await db.getJobsByCompany(input.companyId);
    return jobs.slice(0, input.limit || 10);
  }),

  getOperationsSummary: officeProcedure.query(async ({ ctx }) => {
    if (!ctx.user.companyId) return null;
    return db.getOperationsSummary(ctx.user.companyId);
  }),
});


// Sync router for offline support
const syncRouter = router({
  getLogs: technicianProcedure.input(z.object({ limit: z.number().optional() })).query(async ({ input, ctx }) => {
    return db.getSyncLogsByUser(ctx.user.id, input.limit);
  }),
  
  getJobDataForOffline: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    const job = await db.getJobById(input.jobId);
    // Enforce company ownership: a technician must not pull another company's job
    // packet by guessing an id. Return null (same as not-found) so existence isn't revealed.
    if (!job || job.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) return null;

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

export { dashboardRouter, syncRouter, userRouter };
