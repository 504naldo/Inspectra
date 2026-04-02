import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure } from "../_core/trpc";
import * as db from "../db";

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
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const site = await db.getSiteById(input.id);
    if (!site) return undefined;
    // Scope: user must belong to the same company, or be customer of matching org
    if (ctx.user.role === 'customer') {
      if (ctx.user.customerOrgId !== site.customerOrgId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
    } else if (ctx.user.companyId !== site.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
    return site;
  }),
  
  create: officeProcedure.input(z.object({
    companyId: z.number(),
    customerOrgId: z.number(),
    name: z.string().min(1),
    buildingId: z.string().max(50).optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().optional(),
    notes: z.string().optional(),
    keyLocation: z.string().optional(),
    keyNumber: z.string().optional(),
  })).mutation(async ({ input }) => {
    // Build summary object from form data - always initialize with complete structure
    const summary = {
      client: {
        name: input.name, // Use site name as client name initially
      },
      building: {
        name: input.name || '',
      },
      address: {
        street: input.address || '',
        city: input.city || '',
        state: input.state || '',
        postalCode: input.postalCode || '',
      },
      contacts: [{
        name: input.contactName || '',
        phone: input.contactPhone || '',
        email: input.contactEmail || '',
        role: 'Primary Contact',
      }],
      monitoring: {
        company: '',
        accountNumber: '',
        phone: '',
        password: '',
      },
      notes: input.notes || '',
    };
    
    return db.createSite({ ...input, summary });
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    buildingId: z.string().max(50).optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().optional(),
    notes: z.string().optional(),
    keyLocation: z.string().optional(),
    keyNumber: z.string().optional(),
    keySignOutDate: z.string().optional(),
    keySignedOutBy: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    
    // Get existing site to merge with updates
    const existingSite = await db.getSiteById(id);
    if (!existingSite) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    }
    
    // Update summary to keep it in sync with flat columns
    const updatedSummary = {
      ...existingSite.summary,
      client: {
        ...existingSite.summary?.client,
        name: data.name ?? existingSite.summary?.client?.name ?? existingSite.name ?? '',
      },
      building: {
        ...existingSite.summary?.building,
        name: data.name ?? existingSite.summary?.building?.name ?? existingSite.name ?? '',
      },
      address: {
        ...existingSite.summary?.address,
        street: data.address ?? existingSite.summary?.address?.street ?? existingSite.address ?? '',
        city: data.city ?? existingSite.summary?.address?.city ?? existingSite.city ?? '',
        state: data.state ?? existingSite.summary?.address?.state ?? existingSite.state ?? '',
        postalCode: data.postalCode ?? existingSite.summary?.address?.postalCode ?? existingSite.postalCode ?? '',
      },
      contacts: existingSite.summary?.contacts?.length ? [
        {
          ...existingSite.summary.contacts[0],
          name: data.contactName ?? existingSite.summary.contacts[0]?.name ?? '',
          phone: data.contactPhone ?? existingSite.summary.contacts[0]?.phone ?? '',
          email: data.contactEmail ?? existingSite.summary.contacts[0]?.email ?? '',
        },
        ...existingSite.summary.contacts.slice(1),
      ] : [{
        name: data.contactName ?? existingSite.contactName ?? '',
        phone: data.contactPhone ?? existingSite.contactPhone ?? '',
        email: data.contactEmail ?? '',
        role: 'Primary Contact',
      }],
      monitoring: existingSite.summary?.monitoring || {
        company: '',
        accountNumber: '',
        phone: '',
        password: '',
      },
      notes: data.notes ?? existingSite.summary?.notes ?? existingSite.notes ?? '',
    };
    
    await db.updateSite(id, { ...data, summary: updatedSummary });
    return { success: true };
  }),
});

export { siteRouter };
