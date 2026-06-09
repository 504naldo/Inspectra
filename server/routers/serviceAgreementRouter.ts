import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, customerProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";

function generateAgreementNumber(): string {
  const year = new Date().getFullYear();
  const seq = Date.now().toString(36).toUpperCase().slice(-4);
  return `SA-${year}-${seq}`;
}

const INCLUDED_SERVICES_OPTIONS = [
  "annual_fire_alarm",
  "sprinkler",
  "emergency_lighting",
  "fire_extinguishers",
  "backflow",
  "monitoring",
  "monthly_service",
  "deficiency_followup",
] as const;

const statusEnum = z.enum(["draft", "active", "expiring_soon", "expired", "cancelled"]);
const billingCycleEnum = z.enum(["monthly", "quarterly", "semi_annual", "annual", "per_service", "custom"]);

async function _autoRecalcStatus(
  companyId: number,
  agreements: Awaited<ReturnType<typeof db.getServiceAgreementsByCompany>>,
) {
  const now = new Date();
  const soonMs = 60 * 24 * 60 * 60 * 1000;
  for (const a of agreements) {
    if (!a.endDate) continue;
    const end = new Date(a.endDate);
    if ((a.status === "active" || a.status === "expiring_soon") && end < now) {
      void db.updateServiceAgreement(a.id, { status: "expired" });
      (a as any).status = "expired";
    } else if (a.status === "active" && end.getTime() - now.getTime() <= soonMs) {
      void db.updateServiceAgreement(a.id, { status: "expiring_soon" });
      (a as any).status = "expiring_soon";
    }
  }
}

async function _fireExpiryNotifications(
  companyId: number,
  agreements: Awaited<ReturnType<typeof db.getServiceAgreementsByCompany>>,
) {
  const now = new Date();
  for (const a of agreements) {
    if (!a.endDate) continue;
    if (!["active", "expiring_soon"].includes(a.status)) continue;
    const end = new Date(a.endDate);
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      const dedupeKey = `agreement_expired_${a.id}`;
      const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!exists) {
        void db.createNotification({
          companyId,
          roleTarget: "office",
          entityType: "service_agreement",
          entityId: a.id,
          type: "agreement_expired",
          severity: "warning",
          title: "Service agreement expired",
          message: `${a.name} (${a.agreementNumber ?? `#${a.id}`}) expired on ${end.toLocaleDateString("en-CA")}`,
          href: `/admin/service-agreements/${a.id}`,
          dedupeKey,
        });
      }
      continue;
    }

    for (const threshold of [30, 60, 90] as const) {
      if (daysLeft <= threshold) {
        const dedupeKey = `agreement_expiring_${a.id}_${threshold}d`;
        const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
        if (!exists) {
          void db.createNotification({
            companyId,
            roleTarget: "office",
            entityType: "service_agreement",
            entityId: a.id,
            type: "agreement_expiring",
            severity: threshold <= 30 ? "warning" : "info",
            title: `Service agreement expiring in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
            message: `${a.name} (${a.agreementNumber ?? `#${a.id}`}) expires on ${end.toLocaleDateString("en-CA")}`,
            href: `/admin/service-agreements/${a.id}`,
            dedupeKey,
          });
        }
        break;
      }
    }
  }
}

export const serviceAgreementRouter = router({
  listByCustomerOrg: customerProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.customerOrgId;
    if (!orgId) return [];
    const agreements = await db.getServiceAgreementsByCustomerOrg(orgId);
    const sites = await Promise.all(agreements.map((a) => db.getAgreementSitesByAgreement(a.id)));
    const allSiteIds = Array.from(new Set(sites.flat().map((s) => s.siteId)));
    const siteData = allSiteIds.length
      ? await Promise.all(allSiteIds.map((id) => db.getSiteById(id)))
      : [];
    const siteMap = new Map(siteData.filter(Boolean).map((s) => [s!.id, s!]));

    return agreements.map((a, i) => ({
      id: a.id,
      agreementNumber: a.agreementNumber,
      name: a.name,
      status: a.status,
      startDate: a.startDate,
      endDate: a.endDate,
      renewalDate: a.renewalDate,
      billingCycle: a.billingCycle,
      includedServicesJson: a.includedServicesJson,
      excludedServicesJson: a.excludedServicesJson,
      sites: sites[i].map((as) => ({
        siteId: as.siteId,
        siteName: siteMap.get(as.siteId)?.name ?? null,
        siteAddress: siteMap.get(as.siteId)?.address ?? null,
        siteCity: siteMap.get(as.siteId)?.city ?? null,
        siteState: siteMap.get(as.siteId)?.state ?? null,
        includedServicesJson: as.includedServicesJson,
        siteSpecificNotes: as.siteSpecificNotes,
      })),
    }));
  }),

  list: officeProcedure
    .input(z.object({ status: statusEnum.optional() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      let rows = await db.getServiceAgreementsByCompany(companyId, input.status);

      // Auto-transition statuses and fire notifications (fire-and-forget)
      void _autoRecalcStatus(companyId, rows);
      void _fireExpiryNotifications(companyId, rows);

      // Enrich with customer names
      const customers = await db.getCustomerOrgsByCompany(companyId);
      const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));

      // Count covered sites per agreement
      const allSites = await Promise.all(
        rows.map((a) => db.getAgreementSitesByAgreement(a.id)),
      );
      const siteCounts = new Map(rows.map((a, i) => [a.id, allSites[i].length]));

      return rows.map((a) => ({
        ...a,
        customerName: customerMap.get(a.customerOrgId) ?? null,
        coveredSiteCount: siteCounts.get(a.id) ?? 0,
      }));
    }),

  get: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const agreement = await db.getServiceAgreementById(input.id);
      if (!agreement) throw new TRPCError({ code: "NOT_FOUND" });
      if (agreement.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const [customers, rawSites] = await Promise.all([
        db.getCustomerOrgsByCompany(companyId),
        db.getAgreementSitesByAgreement(input.id),
      ]);
      const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));

      const allSiteData = await db.getSitesByCompany(companyId);
      const siteMap = new Map(allSiteData.map((s) => [s.id, s]));

      const enrichedSites = rawSites.map((as) => ({
        ...as,
        siteName: siteMap.get(as.siteId)?.name ?? null,
        siteAddress: siteMap.get(as.siteId)?.address ?? null,
        siteCity: siteMap.get(as.siteId)?.city ?? null,
      }));

      // Alert if active but no sites
      if (agreement.status === "active" && enrichedSites.length === 0) {
        const dedupeKey = `agreement_no_sites_${agreement.id}`;
        const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
        if (!exists) {
          void db.createNotification({
            companyId,
            roleTarget: "office",
            entityType: "service_agreement",
            entityId: agreement.id,
            type: "agreement_no_sites",
            severity: "warning",
            title: "Active agreement has no covered sites",
            message: `${agreement.name} is active but has no sites assigned`,
            href: `/admin/service-agreements/${agreement.id}`,
            dedupeKey,
          });
        }
      }

      return {
        agreement,
        customerName: customerMap.get(agreement.customerOrgId) ?? null,
        sites: enrichedSites,
        availableSites: allSiteData.filter((s) => s.customerOrgId === agreement.customerOrgId),
      };
    }),

  create: officeProcedure
    .input(z.object({
      customerOrgId: z.number().int().positive(),
      name: z.string().min(1).max(255),
      status: statusEnum.default("draft"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      renewalDate: z.string().optional(),
      billingCycle: billingCycleEnum.default("annual"),
      billingNotes: z.string().max(5000).optional(),
      internalNotes: z.string().max(5000).optional(),
      includedServicesJson: z.array(z.string()).optional(),
      excludedServicesJson: z.array(z.string()).optional(),
      documentUrl: z.string().url().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      // Verify customerOrg belongs to this company
      const orgs = await db.getCustomerOrgsByCompany(companyId);
      const org = (orgs as any[]).find((o: any) => o.id === input.customerOrgId);
      if (!org) throw new TRPCError({ code: "FORBIDDEN", message: "Customer not found in your company" });

      const agreementNumber = generateAgreementNumber();

      const id = await db.createServiceAgreement({
        companyId,
        customerOrgId: input.customerOrgId,
        agreementNumber,
        name: input.name,
        status: input.status,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        renewalDate: input.renewalDate ?? null,
        billingCycle: input.billingCycle,
        billingNotes: input.billingNotes ?? null,
        internalNotes: input.internalNotes ?? null,
        includedServicesJson: input.includedServicesJson ?? null,
        excludedServicesJson: input.excludedServicesJson ?? null,
        documentUrl: input.documentUrl ?? null,
        createdById: ctx.user.id,
      } as any);

      void logActivity({
        ctx,
        entityType: "service_agreement",
        entityId: id,
        eventType: "created",
        title: `Agreement created: ${agreementNumber}`,
        metadata: { name: input.name, customerOrgId: input.customerOrgId, status: input.status },
      });

      return { id, agreementNumber };
    }),

  update: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255).optional(),
      status: statusEnum.optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      renewalDate: z.string().nullable().optional(),
      billingCycle: billingCycleEnum.optional(),
      billingNotes: z.string().max(5000).nullable().optional(),
      internalNotes: z.string().max(5000).nullable().optional(),
      includedServicesJson: z.array(z.string()).nullable().optional(),
      excludedServicesJson: z.array(z.string()).nullable().optional(),
      documentUrl: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const { id, ...fields } = input;
      const existing = await db.getServiceAgreementById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (existing.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update a cancelled agreement" });

      await db.updateServiceAgreement(id, fields as any);

      void logActivity({
        ctx,
        entityType: "service_agreement",
        entityId: id,
        eventType: "updated",
        title: `Agreement updated`,
        metadata: fields,
      });

      return { success: true as const };
    }),

  cancel: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const existing = await db.getServiceAgreementById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (existing.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Already cancelled" });

      await db.updateServiceAgreement(input.id, { status: "cancelled" });

      void logActivity({
        ctx,
        entityType: "service_agreement",
        entityId: input.id,
        eventType: "cancelled",
        title: "Agreement cancelled",
      });

      return { success: true as const };
    }),

  addSite: officeProcedure
    .input(z.object({
      agreementId: z.number().int().positive(),
      siteId: z.number().int().positive(),
      includedServicesJson: z.array(z.string()).optional(),
      siteSpecificNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const agreement = await db.getServiceAgreementById(input.agreementId);
      if (!agreement) throw new TRPCError({ code: "NOT_FOUND" });
      if (agreement.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (agreement.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot add sites to a cancelled agreement" });

      const site = await db.getSiteById(input.siteId);
      if (!site || site.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Site not found" });

      const id = await db.createAgreementSite({
        companyId,
        agreementId: input.agreementId,
        siteId: input.siteId,
        includedServicesJson: input.includedServicesJson ?? null,
        siteSpecificNotes: input.siteSpecificNotes ?? null,
      } as any);

      void logActivity({
        ctx,
        entityType: "service_agreement",
        entityId: input.agreementId,
        eventType: "site_added",
        title: `Site added: ${site.name}`,
        metadata: { siteId: input.siteId, siteName: site.name },
      });

      return { id };
    }),

  removeSite: officeProcedure
    .input(z.object({
      agreementSiteId: z.number().int().positive(),
      agreementId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const agreement = await db.getServiceAgreementById(input.agreementId);
      if (!agreement) throw new TRPCError({ code: "NOT_FOUND" });
      if (agreement.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const agreementSite = await db.getAgreementSiteById(input.agreementSiteId);
      if (!agreementSite || agreementSite.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await db.deleteAgreementSite(input.agreementSiteId, companyId);

      void logActivity({
        ctx,
        entityType: "service_agreement",
        entityId: input.agreementId,
        eventType: "site_removed",
        title: "Site removed from agreement",
        metadata: { agreementSiteId: input.agreementSiteId, siteId: agreementSite.siteId },
      });

      return { success: true as const };
    }),

  updateAgreementSite: officeProcedure
    .input(z.object({
      agreementSiteId: z.number().int().positive(),
      agreementId: z.number().int().positive(),
      includedServicesJson: z.array(z.string()).nullable().optional(),
      siteSpecificNotes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const agreement = await db.getServiceAgreementById(input.agreementId);
      if (!agreement) throw new TRPCError({ code: "NOT_FOUND" });
      if (agreement.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const agreementSite = await db.getAgreementSiteById(input.agreementSiteId);
      if (!agreementSite || agreementSite.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await db.updateAgreementSite(input.agreementSiteId, {
        includedServicesJson: input.includedServicesJson ?? undefined,
        siteSpecificNotes: input.siteSpecificNotes ?? undefined,
      } as any);

      return { success: true as const };
    }),

  getExpiringSoon: officeProcedure
    .input(z.object({ daysAhead: z.number().int().min(1).max(365).default(90) }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const rows = await db.getExpiringSoonAgreements(companyId, input.daysAhead);
      void _fireExpiryNotifications(companyId, rows);
      return rows;
    }),

  getAgreementForSite: officeProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      return db.getActiveAgreementForSite(input.siteId, companyId);
    }),
});
