import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, officeProcedure, customerProcedure } from "../_core/trpc";
import * as db from "../db";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { assertCustomerOrgCompany } from "../tenantGuards";

// Company router
const companyRouter = router({
  list: adminProcedure.query(async () => {
    return db.getAllCompanies();
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    // Non-admin users can only view their own company
    if (ctx.user.role !== 'admin' && ctx.user.companyId !== input.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot access other companies' });
    }
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
  list: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.getCustomerOrgsByCompany(input.companyId);
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const org = await db.getCustomerOrgById(input.id);
    if (!org) return org;
    // Customer can only see their own org; other roles are scoped to their own company
    if (ctx.user.role === 'customer') {
      if (ctx.user.customerOrgId !== input.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    } else if (org.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) {
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
  })).mutation(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.createCustomerOrg(input);
  }),

  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    address: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    await assertCustomerOrgCompany(id, ctx.user.companyId!);
    await db.updateCustomerOrg(id, data);
    return { success: true };
  }),

  getNotifPrefs: customerProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.customerOrgId;
    if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "No customer org" });
    const org = await db.getCustomerOrgById(orgId);
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return {
      notifyReportReady: org.notifyReportReady !== 0,
      notifyJobScheduled: org.notifyJobScheduled !== 0,
    };
  }),

  updateNotifPrefs: customerProcedure.input(z.object({
    notifyReportReady: z.boolean(),
    notifyJobScheduled: z.boolean(),
  })).mutation(async ({ input, ctx }) => {
    const orgId = ctx.user.customerOrgId;
    if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "No customer org" });
    await db.updateCustomerOrg(orgId, {
      notifyReportReady: input.notifyReportReady ? 1 : 0,
      notifyJobScheduled: input.notifyJobScheduled ? 1 : 0,
    } as any);
    return { success: true };
  }),

  delete: officeProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    await assertCustomerOrgCompany(input.id, ctx.user.companyId!);
    const result = await db.deleteCustomerOrg(input.id);
    if (result.blocked) throw new TRPCError({ code: "BAD_REQUEST", message: result.reason });
    return { success: true };
  }),
});

export { companyRouter, customerOrgRouter };
