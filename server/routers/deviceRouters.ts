import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import {
  assertSiteCompany,
  assertAreaCompany,
  assertDeviceCompany,
  assertDeviceForJob,
} from "../tenantGuards";
import { withMutableJob } from "../jobWriteTransaction";
import { getDeviceRevision } from "../canonicalDeviceEvidence";

// Area router
const areaRouter = router({
  listBySite: technicianProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertSiteCompany(input.siteId, ctx.user.companyId!);
      return db.getAreasBySite(input.siteId);
    }),

  get: technicianProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return assertAreaCompany(input.id, ctx.user.companyId!);
    }),

  create: officeProcedure
    .input(
      z.object({
        siteId: z.number(),
        name: z.string().min(1),
        floor: z.string().optional(),
        building: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      return db.createArea(input);
    }),

  update: officeProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        floor: z.string().optional(),
        building: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await assertAreaCompany(id, ctx.user.companyId!);
      await db.updateArea(id, data);
      return { success: true };
    }),
});

// Device router
const deviceRouter = router({
  listBySite: technicianProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertSiteCompany(input.siteId, ctx.user.companyId!);
      return db.getDevicesBySite(input.siteId);
    }),

  listByArea: technicianProcedure
    .input(z.object({ areaId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAreaCompany(input.areaId, ctx.user.companyId!);
      return db.getDevicesByArea(input.areaId);
    }),

  get: technicianProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return assertDeviceCompany(input.id, ctx.user.companyId!);
    }),

  create: officeProcedure
    .input(
      z.object({
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      if (input.areaId !== undefined) {
        const area = await db.getAreaById(input.areaId);
        if (!area || area.siteId !== input.siteId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid area for this site",
          });
        }
      }
      return db.createDevice(input);
    }),

  update: officeProcedure
    .input(
      z.object({
        id: z.number(),
        deviceType: z.string().optional(),
        areaId: z.number().optional(),
        manufacturer: z.string().optional(),
        model: z.string().optional(),
        serialNumber: z.string().optional(),
        location: z.string().optional(),
        label: z.string().optional(),
        floor: z.string().optional(),
        circuitAddress: z.string().optional(),
        zone: z.string().optional(),
        barcode: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
        // Extinguisher fields
        mfgDate: z.string().optional(),
        lastHST: z.string().optional(),
        last6yr: z.string().optional(),
        // Emergency light fields
        ladderHeight: z.string().optional(),
        supplyVoltage: z.string().optional(),
        modelWattage: z.string().optional(),
        batteryYear: z.string().optional(),
        batterySize: z.string().optional(),
        batteryCount: z.number().optional(),
        lampCount: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await assertDeviceCompany(id, ctx.user.companyId!);
      await db.updateDevice(id, data);
      return { success: true };
    }),

  // Technicians can update inspection-time fields during a job
  technicianUpdate: technicianProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        expectedDeviceRevision: z.string().min(1),
        id: z.number(),
        label: z.string().optional(),
        floor: z.string().optional(),
        circuitAddress: z.string().optional(),
        zone: z.string().optional(),
        location: z.string().optional(),
        manufacturer: z.string().optional(),
        model: z.string().optional(),
        serialNumber: z.string().optional(),
        notes: z.string().optional(),
        // Smoke alarm fields
        deviceType: z.string().optional(),
        powerType: z
          .enum(["hardwired", "battery", "sealed", "unknown"])
          .optional(),
        suiteNumber: z.string().optional(),
        // Extinguisher fields
        mfgDate: z.string().optional(),
        lastHST: z.string().optional(),
        last6yr: z.string().optional(),
        // Emergency light fields
        ladderHeight: z.string().optional(),
        supplyVoltage: z.string().optional(),
        modelWattage: z.string().optional(),
        batteryYear: z.string().optional(),
        batterySize: z.string().optional(),
        batteryCount: z.number().optional(),
        batteryReplaced: z.string().optional(),
        maintenanceRequired: z.string().optional(),
        lampCount: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withMutableJob(ctx, "device.technicianUpdate", input.jobId, async job => {
        const { id, jobId, expectedDeviceRevision, ...rawData } = input;
        const device = await db.assertDeviceCaptureRevision(
          job.id,
          id,
          expectedDeviceRevision
        );

        // Normalize payload so cleared text fields (empty string) persist as NULL.
        // Also drop undefined keys so we don't generate no-op/invalid updates.
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawData)) {
          if (value === undefined) continue;
          data[key] = typeof value === "string" && value === "" ? null : value;
        }

        // If nothing was provided (or all values were undefined), treat as no-op.
        if (Object.keys(data).length === 0) {
          return { success: true, deviceRevision: getDeviceRevision(device) };
        }

        await db.updateDevice(id, data as any);
        const deviceRevision = await db.refreshJobDeviceEvidence(
          job.id,
          id,
          ctx.user.id
        );
        return { success: true, deviceRevision };
      })
    ),

  getCount: technicianProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertSiteCompany(input.siteId, ctx.user.companyId!);
      return db.getDeviceCountBySite(input.siteId);
    }),

  // Add a brand-new device to a site during an active inspection
  addDuringInspection: technicianProcedure
    .input(
      z.object({
        jobId: z.number(),
        siteId: z.number(),
        companyId: z.number(),
        category: z.enum([
          "FIRE_ALARM_DEVICE",
          "FIRE_EXTINGUISHER",
          "EMERGENCY_LIGHT",
          "SMOKE_ALARM",
          "SPRINKLER",
        ]),
        deviceType: z.string().min(1),
        location: z.string().optional(),
        notes: z.string().optional(),
        suiteNumber: z.string().optional(),
        powerType: z
          .enum(["hardwired", "battery", "sealed", "unknown"])
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withMutableJob(
        ctx,
        "device.addDuringInspection",
        input.jobId,
        async job => {
          const { jobId, ...deviceData } = input;
          if (deviceData.siteId !== job.siteId)
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Device site does not belong to this job.",
            });
          await assertSiteCompany(deviceData.siteId, ctx.user.companyId!);
          // Always attribute the device to the job's own company, never a client-supplied value.
          const device = await db.createDevice({
            ...deviceData,
            companyId: job.companyId,
          } as any);
          return { success: true, deviceId: device.id };
        }
      )
    ),

  reorder: officeProcedure
    .input(
      z.object({
        orderedIds: z.array(z.number()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.orderedIds.length === 0) return { success: true };
      const ownedDevices = await db.getDevicesByIds(input.orderedIds);
      if (
        ownedDevices.length !== input.orderedIds.length ||
        ownedDevices.some(d => d.companyId !== ctx.user.companyId)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.reorderDevices(input.orderedIds);
      return { success: true };
    }),

  clearSortOrder: officeProcedure
    .input(
      z.object({
        siteId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertSiteCompany(input.siteId, ctx.user.companyId!);
      await db.clearDeviceSortOrder(input.siteId);
      return { success: true };
    }),

  // Soft-delete a device (marks isActive = false) — only allowed while job is not finalized
  softDelete: technicianProcedure
    .input(
      z.object({
        deviceId: z.number(),
        jobId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withMutableJob(ctx, "device.softDelete", input.jobId, async job => {
        await assertDeviceForJob(input.deviceId, job);
        await db.updateDevice(input.deviceId, { isActive: false } as any);
        return { success: true };
      })
    ),

  // Office bulk soft-delete (marks isActive = false). Used by the Devices page's
  // "remove duplicates" flow. Every id must belong to the caller's company.
  bulkSoftDelete: officeProcedure
    .input(
      z.object({
        deviceIds: z.array(z.number()).min(1).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ids = Array.from(new Set(input.deviceIds));
      const owned = await db.getDevicesByIds(ids);
      if (
        owned.length !== ids.length ||
        owned.some(d => d.companyId !== ctx.user.companyId)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.setDevicesActive(ids, false);
      return { success: true, removed: ids.length };
    }),
});

// Smoke Alarm router
const smokeAlarmRouter = router({
  listBySite: technicianProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertSiteCompany(input.siteId, ctx.user.companyId!);
      const { calculateSmokeAlarmExpiry } = await import(
        "../../shared/smokeAlarmExpiry"
      );
      const smokeAlarms = await db.getSmokeAlarmsBySite(input.siteId);
      return smokeAlarms.map(alarm => ({
        ...alarm,
        expiryInfo: calculateSmokeAlarmExpiry(
          alarm.installDate,
          alarm.powerType
        ),
      }));
    }),

  listByJob: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      await db.assertJobCompany(input.jobId, ctx.user.companyId!);
      const { calculateSmokeAlarmExpiry } = await import(
        "../../shared/smokeAlarmExpiry"
      );
      const smokeAlarms = await db.getSmokeAlarmsByJob(input.jobId);
      return smokeAlarms.map(alarm => ({
        ...alarm,
        expiryInfo: calculateSmokeAlarmExpiry(
          alarm.installDate,
          alarm.powerType
        ),
      }));
    }),

  get: technicianProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return assertDeviceCompany(input.id, ctx.user.companyId!);
    }),

  create: technicianProcedure
    .input(
      z.object({
        jobId: z.number().int().positive().optional(),
        companyId: z.number(),
        siteId: z.number(),
        suiteNumber: z.string().min(1),
        location: z.string().optional(),
        powerType: z
          .enum(["hardwired", "battery", "sealed", "unknown"])
          .optional(),
        installDate: z.string().optional(), // ISO date string
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "technician" && input.jobId == null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An inspection job is required to add a smoke alarm.",
        });
      const create = async (
        job?: Awaited<ReturnType<typeof db.assertJobCompany>>
      ) => {
        const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
        if (
          (job &&
            (site.id !== job.siteId || site.companyId !== job.companyId)) ||
          input.companyId !== site.companyId
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Smoke alarm site does not match the job.",
          });
        const { installDate, jobId, ...rest } = input;
        return db.createDevice({
          ...rest,
          companyId: site.companyId,
          category: "SMOKE_ALARM",
          deviceType: "Smoke Alarm",
          installDate: installDate ? new Date(installDate) : undefined,
        });
      };
      return input.jobId != null
        ? withMutableJob(ctx, "smokeAlarm.create", input.jobId, job =>
            create(job)
          )
        : db.withAudit(ctx, "smokeAlarm.createMaster", () => create());
    }),

  update: technicianProcedure
    .input(
      z.object({
        jobId: z.number().int().positive().optional(),
        expectedDeviceRevision: z.string().optional(),
        id: z.number(),
        suiteNumber: z.string().optional(),
        location: z.string().optional(),
        powerType: z
          .enum(["hardwired", "battery", "sealed", "unknown"])
          .optional(),
        installDate: z.string().optional(), // ISO date string
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "technician" && input.jobId == null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An inspection job is required to edit a smoke alarm.",
        });
      const update = async (
        job?: Awaited<ReturnType<typeof db.assertJobCompany>>
      ) => {
        const { id, jobId, expectedDeviceRevision, installDate, ...data } =
          input;
        const device = job
          ? await db.assertDeviceCaptureRevision(
              job.id,
              id,
              expectedDeviceRevision
            )
          : await assertDeviceCompany(id, ctx.user.companyId!);
        if (device.category !== "SMOKE_ALARM")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Expected a smoke alarm.",
          });
        await db.updateDevice(id, {
          ...data,
          installDate: installDate ? new Date(installDate) : undefined,
        });
        const deviceRevision = job
          ? await db.refreshJobDeviceEvidence(job.id, id, ctx.user.id)
          : undefined;
        return { success: true, deviceRevision };
      };
      return input.jobId != null
        ? withMutableJob(ctx, "smokeAlarm.update", input.jobId, job =>
            update(job)
          )
        : db.withAudit(ctx, "smokeAlarm.updateMaster", () => update());
    }),

  recordTest: technicianProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        expectedDeviceRevision: z.string().min(1),
        id: z.number(),
        testResult: z.enum(["pass", "fail", "no_access", "na"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withMutableJob(ctx, "smokeAlarm.recordTest", input.jobId, async job => {
        // Offline captures remain company-scoped after reassignment, but a stale
        // job can never update device state after its finalization commits.
        const device = await assertDeviceForJob(input.id, job);
        if (device.category !== "SMOKE_ALARM")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Expected a smoke alarm.",
          });
        const now = new Date();
        await db.upsertInspectionResult({
          jobId: job.id,
          deviceId: device.id,
          technicianId: ctx.user.id,
          result:
            input.testResult === "no_access" ? "not_tested" : input.testResult,
          notes:
            input.testResult === "no_access"
              ? ["No access", input.notes].filter(Boolean).join(" — ")
              : input.notes,
          testedAt: now,
          syncedAt: now,
          carriedForward: 0,
          expectedDeviceRevision: input.expectedDeviceRevision,
        });
        await db.updateSmokeAlarmTestResult(input.id, input.testResult);

        // If test failed or no access, prompt for deficiency
        if (input.testResult === "fail" || input.testResult === "no_access") {
          return { success: true, requiresDeficiency: true };
        }

        return { success: true, requiresDeficiency: false };
      })
    ),

  getCount: technicianProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertSiteCompany(input.siteId, ctx.user.companyId!);
      return db.getSmokeAlarmCountBySite(input.siteId);
    }),
});

export { areaRouter, deviceRouter, smokeAlarmRouter };
