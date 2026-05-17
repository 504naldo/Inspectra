import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";
import { LIFECYCLE_EVENT_TYPES, LIFECYCLE_SOURCE_TYPES } from "../../drizzle/schema";

const lifecycleStatusEnum = z.enum([
  "active", "needs_service", "repair_required",
  "replacement_recommended", "replaced", "removed",
]);
const assetConditionEnum = z.enum(["good", "fair", "poor", "failed", "unknown"]);

function computeIndicators(device: any, openDefs: any[], allDefs: any[]) {
  const now = new Date();
  const eighteenMonthsAgo = new Date(now.getTime() - 18 * 30 * 24 * 60 * 60 * 1000);
  const twentyFourMonthsAgo = new Date(now.getTime() - 24 * 30 * 24 * 60 * 60 * 1000);

  const openDefCount = openDefs.filter((d) => d.deviceId === device.id).length;
  const hasOpenCritical = openDefs.some((d) => d.deviceId === device.id && d.severity === "critical");

  const recentFailDefs = allDefs.filter(
    (d) => d.deviceId === device.id && new Date(d.createdAt) > twentyFourMonthsAgo,
  );
  const repeatedFailure = recentFailDefs.length >= 2 || openDefCount >= 2;

  const lastInspDate = device.lastInspectionDate ? new Date(device.lastInspectionDate) : null;
  const notInspectedRecently = !lastInspDate || lastInspDate < eighteenMonthsAgo;

  const nextServiceDate = device.nextServiceDate ? new Date(device.nextServiceDate) : null;
  const serviceOverdue = !!nextServiceDate && nextServiceDate < now;

  let batteryAgeWarning = false;
  if (device.category === "EMERGENCY_LIGHT" && device.batteryYear) {
    const year = parseInt(String(device.batteryYear));
    if (!isNaN(year) && now.getFullYear() - year >= 5) batteryAgeWarning = true;
  }

  let extinguisherServiceDue = false;
  if (device.category === "FIRE_EXTINGUISHER") {
    if (device.last6yr) {
      const year = parseInt(String(device.last6yr));
      if (!isNaN(year) && now.getFullYear() - year >= 6) extinguisherServiceDue = true;
    }
    if (device.lastHST) {
      const year = parseInt(String(device.lastHST));
      if (!isNaN(year) && now.getFullYear() - year >= 12) extinguisherServiceDue = true;
    }
  }

  return {
    openDeficiencyCount: openDefCount,
    hasOpenCriticalDeficiency: hasOpenCritical,
    repeatedFailure,
    notInspectedRecently,
    serviceOverdue,
    batteryAgeWarning,
    extinguisherServiceDue,
  };
}

export const assetLifecycleRouter = router({
  listAssets: officeProcedure
    .input(z.object({
      siteId: z.number().int().positive().optional(),
      customerOrgId: z.number().int().positive().optional(),
      category: z.string().optional(),
      lifecycleStatus: lifecycleStatusEnum.optional(),
      assetCondition: assetConditionEnum.optional(),
      replacementRecommended: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;

      // Determine target site IDs
      let targetSiteIds: number[] | null = null;
      if (input.siteId) {
        const site = await db.getSiteById(input.siteId);
        if (!site || site.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
        targetSiteIds = [input.siteId];
      } else if (input.customerOrgId) {
        const orgSites = await db.getSitesByCustomerOrg(input.customerOrgId);
        targetSiteIds = orgSites.filter((s) => s.companyId === companyId).map((s) => s.id);
        if (!targetSiteIds.length) return { devices: [] };
      }

      // Fetch devices
      let deviceList = await db.getDevicesByCompany(companyId);
      if (targetSiteIds) deviceList = deviceList.filter((d) => targetSiteIds!.includes(d.siteId));

      // Apply field filters
      if (input.category) deviceList = deviceList.filter((d) => d.category === input.category);
      if (input.lifecycleStatus !== undefined) {
        deviceList = deviceList.filter((d) => (d as any).lifecycleStatus === input.lifecycleStatus);
      }
      if (input.assetCondition !== undefined) {
        deviceList = deviceList.filter((d) => (d as any).assetCondition === input.assetCondition);
      }
      if (input.replacementRecommended !== undefined) {
        deviceList = deviceList.filter(
          (d) => !!(d as any).replacementRecommended === input.replacementRecommended,
        );
      }

      if (!deviceList.length) return { devices: [] };

      const deviceIds = deviceList.map((d) => d.id);

      // Batch fetch deficiencies
      const [openDefs, allDefs] = await Promise.all([
        db.getOpenDeficienciesByDeviceIds(deviceIds),
        db.getAllDeficienciesByDeviceIds(deviceIds),
      ]);

      // Enrich site names
      const allSites = await db.getSitesByCompany(companyId);
      const siteMap = new Map(allSites.map((s) => [s.id, s]));

      const enriched = deviceList.map((d) => ({
        ...d,
        siteName: siteMap.get(d.siteId)?.name ?? null,
        siteCity: siteMap.get(d.siteId)?.city ?? null,
        ...computeIndicators(d, openDefs, allDefs),
      }));

      return { devices: enriched };
    }),

  getAssetLifecycle: officeProcedure
    .input(z.object({ deviceId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const device = await db.getDeviceById(input.deviceId);
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });
      if (device.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const [inspectionHistory, deficiencyHistory, lifecycleEvents, site] = await Promise.all([
        db.getInspectionResultsByDevice(input.deviceId),
        db.getDeficienciesByDevice(input.deviceId),
        db.getLifecycleEventsByDevice(input.deviceId),
        db.getSiteById(device.siteId),
      ]);

      return {
        device,
        site,
        inspectionHistory,
        deficiencyHistory,
        lifecycleEvents,
      };
    }),

  createLifecycleEvent: officeProcedure
    .input(z.object({
      deviceId: z.number().int().positive(),
      siteId: z.number().int().positive(),
      eventType: z.enum(LIFECYCLE_EVENT_TYPES),
      eventDate: z.string(),
      sourceType: z.enum(LIFECYCLE_SOURCE_TYPES).default("manual"),
      sourceId: z.number().int().positive().optional(),
      title: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const device = await db.getDeviceById(input.deviceId);
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });
      if (device.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const id = await db.createLifecycleEvent({
        companyId,
        siteId: input.siteId,
        deviceId: input.deviceId,
        eventType: input.eventType,
        eventDate: input.eventDate,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        title: input.title,
        description: input.description ?? null,
        performedById: ctx.user.id,
        notes: input.notes ?? null,
      } as any);

      void logActivity({
        ctx,
        entityType: "device",
        entityId: input.deviceId,
        eventType: "lifecycle_event_created",
        title: `Lifecycle event: ${input.title}`,
        metadata: { eventType: input.eventType, eventDate: input.eventDate },
      });

      return { id };
    }),

  updateAssetLifecycleStatus: officeProcedure
    .input(z.object({
      deviceId: z.number().int().positive(),
      lifecycleStatus: lifecycleStatusEnum.optional(),
      assetCondition: assetConditionEnum.optional(),
      nextServiceDate: z.string().nullable().optional(),
      serviceNotes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const { deviceId, ...fields } = input;
      const device = await db.getDeviceById(deviceId);
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });
      if (device.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const oldStatus = (device as any).lifecycleStatus;
      const oldCondition = (device as any).assetCondition;

      await db.updateDevice(deviceId, fields as any);

      if (fields.lifecycleStatus && fields.lifecycleStatus !== oldStatus) {
        void logActivity({
          ctx,
          entityType: "device",
          entityId: deviceId,
          eventType: "lifecycle_status_changed",
          title: `Lifecycle status: ${oldStatus ?? "unset"} → ${fields.lifecycleStatus}`,
          oldValue: oldStatus ?? null,
          newValue: fields.lifecycleStatus,
        });
      }
      if (fields.assetCondition && fields.assetCondition !== oldCondition) {
        void logActivity({
          ctx,
          entityType: "device",
          entityId: deviceId,
          eventType: "condition_changed",
          title: `Condition: ${oldCondition ?? "unset"} → ${fields.assetCondition}`,
          oldValue: oldCondition ?? null,
          newValue: fields.assetCondition,
        });
      }

      return { success: true as const };
    }),

  markReplacementRecommended: officeProcedure
    .input(z.object({
      deviceId: z.number().int().positive(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const device = await db.getDeviceById(input.deviceId);
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });
      if (device.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateDevice(input.deviceId, {
        replacementRecommended: true,
        replacementRecommendedAt: new Date(),
        lifecycleStatus: "replacement_recommended",
        serviceNotes: input.notes ?? (device as any).serviceNotes ?? null,
      } as any);

      void logActivity({
        ctx,
        entityType: "device",
        entityId: input.deviceId,
        eventType: "replacement_recommended",
        title: "Replacement recommended",
        metadata: { notes: input.notes },
      });

      // Notification (deduped)
      const dedupeKey = `asset_replacement_${input.deviceId}`;
      const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!exists) {
        void db.createNotification({
          companyId,
          roleTarget: "office",
          entityType: "device",
          entityId: input.deviceId,
          type: "asset_replacement_recommended",
          severity: "warning",
          title: "Replacement recommended",
          message: `${device.deviceType}${device.location ? ` at ${device.location}` : ""} has been flagged for replacement`,
          href: `/admin/asset-lifecycle`,
          dedupeKey,
        });
      }

      return { success: true as const };
    }),

  clearReplacementRecommendation: officeProcedure
    .input(z.object({ deviceId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const device = await db.getDeviceById(input.deviceId);
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });
      if (device.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateDevice(input.deviceId, {
        replacementRecommended: false,
        replacementRecommendedAt: null,
        lifecycleStatus: "active",
      } as any);

      void logActivity({
        ctx,
        entityType: "device",
        entityId: input.deviceId,
        eventType: "replacement_recommendation_cleared",
        title: "Replacement recommendation cleared",
      });

      return { success: true as const };
    }),

  getSiteAssetSummary: officeProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      const site = await db.getSiteById(input.siteId);
      if (!site || site.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const siteDevices = await db.getDevicesBySite(input.siteId);
      const deviceIds = siteDevices.map((d) => d.id);

      const [openDefs, allDefs] = await Promise.all([
        db.getOpenDeficienciesByDeviceIds(deviceIds),
        db.getAllDeficienciesByDeviceIds(deviceIds),
      ]);

      const now = new Date();
      let replacementCount = 0;
      let criticalDefCount = 0;
      let repeatedFailureCount = 0;

      for (const d of siteDevices) {
        const indicators = computeIndicators(d, openDefs, allDefs);
        if ((d as any).replacementRecommended) replacementCount++;
        if (indicators.hasOpenCriticalDeficiency) criticalDefCount++;
        if (indicators.repeatedFailure) repeatedFailureCount++;
      }

      return {
        totalDevices: siteDevices.length,
        replacementRecommended: replacementCount,
        criticalDeficiencies: criticalDefCount,
        repeatedFailures: repeatedFailureCount,
      };
    }),

  getAssetsDueForService: officeProcedure
    .input(z.object({ siteId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      let deviceList = await db.getDevicesByCompany(companyId);
      if (input.siteId) deviceList = deviceList.filter((d) => d.siteId === input.siteId);

      const now = new Date();
      const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      return deviceList.filter((d) => {
        const nextSvc = (d as any).nextServiceDate;
        if (!nextSvc) return false;
        const svcDate = new Date(nextSvc);
        return svcDate <= soon;
      });
    }),

  getRepeatedFailureAssets: officeProcedure
    .input(z.object({ siteId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      let deviceList = await db.getDevicesByCompany(companyId);
      if (input.siteId) deviceList = deviceList.filter((d) => d.siteId === input.siteId);

      const deviceIds = deviceList.map((d) => d.id);
      const allDefs = await db.getAllDeficienciesByDeviceIds(deviceIds);
      const openDefs = allDefs.filter((d) => ["open", "in_progress"].includes(d.status));

      const allSites = await db.getSitesByCompany(companyId);
      const siteMap = new Map(allSites.map((s) => [s.id, s]));

      return deviceList
        .map((d) => ({
          ...d,
          siteName: siteMap.get(d.siteId)?.name ?? null,
          ...computeIndicators(d, openDefs, allDefs),
        }))
        .filter((d) => d.repeatedFailure);
    }),
});
