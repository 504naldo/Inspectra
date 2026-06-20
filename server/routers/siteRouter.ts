import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure, technicianProcedure } from "../_core/trpc";
import { geocodeAddress } from "../_core/map";
import * as db from "../db";
import type { SiteSummary } from "../../drizzle/schema";

// Joins the address fields into a single string for geocoding; skips empty parts
// so a site with only a city still resolves to a usable (if coarse) location.
function formatAddressForGeocoding(parts: { address?: string | null; city?: string | null; state?: string | null; postalCode?: string | null }): string {
  return [parts.address, parts.city, parts.state, parts.postalCode].filter((s): s is string => !!s?.trim()).join(", ");
}

// Site router
const siteRouter = router({
  listByCompany: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
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
  })).mutation(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    const customerOrg = await db.getCustomerOrgById(input.customerOrgId);
    if (!customerOrg || customerOrg.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid customer organization' });
    }
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
    
    // Best-effort geocode so the site shows up on the route-optimized dispatch view;
    // never blocks site creation if the address is incomplete or geocoding fails.
    const coords = await geocodeAddress(formatAddressForGeocoding(input));

    return db.createSite({
      ...input,
      summary,
      latitude: coords ? String(coords.lat) : undefined,
      longitude: coords ? String(coords.lng) : undefined,
    });
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    buildingId: z.string().max(50).nullish(),
    fileNumber: z.string().max(20).nullish(),
    customerOrgId: z.number().optional(),
    address: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postalCode: z.string().nullish(),
    contactName: z.string().nullish(),
    contactPhone: z.string().nullish(),
    contactEmail: z.string().nullish(),
    notes: z.string().nullish(),
    keyLocation: z.string().nullish(),
    keyNumber: z.string().nullish(),
    keySignOutDate: z.string().nullish(),
    keySignedOutBy: z.string().nullish(),
  })).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;

    // Get existing site to merge with updates
    const existingSite = await db.getSiteById(id);
    if (!existingSite) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    }
    if (existingSite.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
    if (data.customerOrgId !== undefined) {
      const customerOrg = await db.getCustomerOrgById(data.customerOrgId);
      if (!customerOrg || customerOrg.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid customer organization' });
      }
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
    
    // Re-geocode only when an address field actually changed — keeps edits to
    // unrelated fields (notes, key tracking, etc.) from costing an API call.
    let coordsUpdate: { latitude?: string | null; longitude?: string | null } = {};
    if (data.address !== undefined || data.city !== undefined || data.state !== undefined || data.postalCode !== undefined) {
      const coords = await geocodeAddress(formatAddressForGeocoding({
        address: data.address ?? existingSite.address,
        city: data.city ?? existingSite.city,
        state: data.state ?? existingSite.state,
        postalCode: data.postalCode ?? existingSite.postalCode,
      }));
      coordsUpdate = { latitude: coords ? String(coords.lat) : null, longitude: coords ? String(coords.lng) : null };
    }

    await db.updateSite(id, {
      ...data,
      ...coordsUpdate,
      summary: updatedSummary,
      keySignOutDate: data.keySignOutDate ? new Date(data.keySignOutDate) : undefined,
    });
    return { success: true };
  }),

  getLastInspectionSummary: officeProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input }) => {
      return db.getLastInspectionSummaryForSite(input.siteId);
    }),

  // Full Summary Sheet editor (admin/office) — covers the fields the quick Edit Site
  // dialog doesn't touch: building details, billing address, monitoring, estimates,
  // and the full contacts list. Never touches `totals`, which is derived from device counts.
  updateSummarySheet: officeProcedure.input(z.object({
    id: z.number(),
    summary: z.object({
      building: z.object({
        year: z.string().optional(),
        class: z.string().optional(),
        stories: z.string().optional(),
      }).optional(),
      billing: z.object({
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
      }).optional(),
      contacts: z.array(z.object({
        name: z.string().optional(),
        role: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      })).optional(),
      monitoring: z.object({
        company: z.string().optional(),
        accountNumber: z.string().optional(),
        phone: z.string().optional(),
        password: z.string().optional(),
      }).optional(),
      estimates: z.object({
        servicingHours: z.string().optional(),
        repairBudget: z.string().optional(),
      }).optional(),
    }),
  })).mutation(async ({ input, ctx }) => {
    const existingSite = await db.getSiteById(input.id);
    if (!existingSite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    if (existingSite.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN' });

    const merged: SiteSummary = {
      ...existingSite.summary,
      building: { ...existingSite.summary?.building, ...input.summary.building },
      billing: { ...existingSite.summary?.billing, ...input.summary.billing },
      monitoring: { ...existingSite.summary?.monitoring, ...input.summary.monitoring },
      estimates: { ...existingSite.summary?.estimates, ...input.summary.estimates },
      contacts: input.summary.contacts ?? existingSite.summary?.contacts,
    };

    await db.updateSite(input.id, { summary: merged });
    return { success: true };
  }),

  // Technician-editable slice of the Summary Sheet: just the servicing hours estimate,
  // which techs are best placed to refine after walking the site.
  updateEstimate: technicianProcedure.input(z.object({
    id: z.number(),
    servicingHours: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const existingSite = await db.getSiteById(input.id);
    if (!existingSite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    if (existingSite.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN' });

    const merged: SiteSummary = {
      ...existingSite.summary,
      estimates: { ...existingSite.summary?.estimates, servicingHours: input.servicingHours },
    };

    await db.updateSite(input.id, { summary: merged });
    return { success: true };
  }),

  // One-time backfill for sites created before geocoding was wired into create/update.
  // Geocodes sequentially (Google's API has per-second rate limits) and is safe to
  // re-run — it only targets sites that still lack coordinates.
  delete: officeProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const site = await db.getSiteById(input.id);
    if (!site) throw new TRPCError({ code: 'NOT_FOUND' });
    if (site.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN' });
    const result = await db.deleteSite(input.id);
    if (result.blocked) throw new TRPCError({ code: 'BAD_REQUEST', message: result.reason });
    return { success: true };
  }),

  geocodeMissingSites: officeProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const candidates = await db.getSitesMissingCoordinates(input.companyId);
      let geocoded = 0;
      let skipped = 0;
      for (const site of candidates) {
        const coords = await geocodeAddress(formatAddressForGeocoding(site));
        if (coords) {
          await db.updateSite(site.id, { latitude: String(coords.lat), longitude: String(coords.lng) });
          geocoded++;
        } else {
          skipped++;
        }
      }
      return { total: candidates.length, geocoded, skipped };
    }),
});

export { siteRouter };
