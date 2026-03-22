import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, officeProcedure } from "../_core/trpc";
import * as db from "../db";

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

export { companyRouter, customerOrgRouter };
