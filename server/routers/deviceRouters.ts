import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { assertSiteCompany, assertAreaCompany, assertDeviceCompany } from "../tenantGuards";

// Area router
const areaRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input, ctx }) => {
    await assertSiteCompany(input.siteId, ctx.user.companyId!);
    return db.getAreasBySite(input.siteId);
  }),

  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    return assertAreaCompany(input.id, ctx.user.companyId!);
  }),

  create: officeProcedure.input(z.object({
    siteId: z.number(),
    name: z.string().min(1),
    floor: z.string().optional(),
    building: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
    return db.createArea(input);
  }),

  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    floor: z.string().optional(),
    building: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    await assertAreaCompany(id, ctx.user.companyId!);
    await db.updateArea(id, data);
    return { success: true };
  }),
});

// Device router
const deviceRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input, ctx }) => {
    await assertSiteCompany(input.siteId, ctx.user.companyId!);
    return db.getDevicesBySite(input.siteId);
  }),

  listByArea: technicianProcedure.input(z.object({ areaId: z.number() })).query(async ({ input, ctx }) => {
    await assertAreaCompany(input.areaId, ctx.user.companyId!);
    return db.getDevicesByArea(input.areaId);
  }),

  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    return assertDeviceCompany(input.id, ctx.user.companyId!);
  }),

  create: officeProcedure.input(z.object({
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
  })).mutation(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
    if (input.areaId !== undefined) {
      const area = await db.getAreaById(input.areaId);
      if (!area || area.siteId !== input.siteId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid area for this site' });
      }
    }
    return db.createDevice(input);
  }),
  
  update: officeProcedure.input(z.object({
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
  })).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    await assertDeviceCompany(id, ctx.user.companyId!);
    await db.updateDevice(id, data);
    return { success: true };
  }),

  // Technicians can update inspection-time fields during a job
  technicianUpdate: technicianProcedure.input(z.object({
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
    powerType: z.enum(['hardwired', 'battery', 'sealed', 'unknown']).optional(),
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
  })).mutation(async ({ input, ctx }) => {
    const { id, ...rawData } = input;
    await assertDeviceCompany(id, ctx.user.companyId!);

    // Normalize payload so cleared text fields (empty string) persist as NULL.
    // Also drop undefined keys so we don't generate no-op/invalid updates.
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawData)) {
      if (value === undefined) continue;
      data[key] = typeof value === "string" && value === "" ? null : value;
    }

    // If nothing was provided (or all values were undefined), treat as no-op.
    if (Object.keys(data).length === 0) {
      return { success: true };
    }

    await db.updateDevice(id, data as any);
    return { success: true };
  }),

  getCount: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input, ctx }) => {
    await assertSiteCompany(input.siteId, ctx.user.companyId!);
    return db.getDeviceCountBySite(input.siteId);
  }),

  // Add a brand-new device to a site during an active inspection
  addDuringInspection: technicianProcedure.input(z.object({
    jobId: z.number(),
    siteId: z.number(),
    companyId: z.number(),
    category: z.enum(['FIRE_ALARM_DEVICE', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHT', 'SMOKE_ALARM', 'SPRINKLER']),
    deviceType: z.string().min(1),
    location: z.string().optional(),
    notes: z.string().optional(),
    suiteNumber: z.string().optional(),
    powerType: z.enum(['hardwired', 'battery', 'sealed', 'unknown']).optional(),
  })).mutation(async ({ input, ctx }) => {
    const { jobId, ...deviceData } = input;
    const job = await db.assertJobCompany(jobId, ctx.user.companyId!);
    if ((job as any).finalizedAt) throw new TRPCError({ code: 'FORBIDDEN', message: 'Job is finalized' });
    const site = await assertSiteCompany(deviceData.siteId, ctx.user.companyId!);
    // Always attribute the device to the job's own company, never a client-supplied value.
    const device = await db.createDevice({ ...deviceData, companyId: job.companyId } as any);
    return { success: true, deviceId: device.id };
  }),

  reorder: officeProcedure.input(z.object({
    orderedIds: z.array(z.number()),
  })).mutation(async ({ input, ctx }) => {
    if (input.orderedIds.length === 0) return { success: true };
    const ownedDevices = await db.getDevicesByIds(input.orderedIds);
    if (ownedDevices.length !== input.orderedIds.length || ownedDevices.some((d) => d.companyId !== ctx.user.companyId)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    await db.reorderDevices(input.orderedIds);
    return { success: true };
  }),

  clearSortOrder: officeProcedure.input(z.object({
    siteId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await assertSiteCompany(input.siteId, ctx.user.companyId!);
    await db.clearDeviceSortOrder(input.siteId);
    return { success: true };
  }),

  // Soft-delete a device (marks isActive = false) — only allowed while job is not finalized
  softDelete: technicianProcedure.input(z.object({
    deviceId: z.number(),
    jobId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const job = await db.assertJobCompany(input.jobId, ctx.user.companyId!);
    if ((job as any).finalizedAt) throw new TRPCError({ code: 'FORBIDDEN', message: 'Job is finalized' });
    await assertDeviceCompany(input.deviceId, ctx.user.companyId!);
    await db.updateDevice(input.deviceId, { isActive: false } as any);
    return { success: true };
  }),
});

// Smoke Alarm router
const smokeAlarmRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input, ctx }) => {
    await assertSiteCompany(input.siteId, ctx.user.companyId!);
    const { calculateSmokeAlarmExpiry } = await import('../../shared/smokeAlarmExpiry');
    const smokeAlarms = await db.getSmokeAlarmsBySite(input.siteId);
    return smokeAlarms.map(alarm => ({
      ...alarm,
      expiryInfo: calculateSmokeAlarmExpiry(alarm.installDate, alarm.powerType),
    }));
  }),

  listByJob: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    await db.assertJobCompany(input.jobId, ctx.user.companyId!);
    const { calculateSmokeAlarmExpiry } = await import('../../shared/smokeAlarmExpiry');
    const smokeAlarms = await db.getSmokeAlarmsByJob(input.jobId);
    return smokeAlarms.map(alarm => ({
      ...alarm,
      expiryInfo: calculateSmokeAlarmExpiry(alarm.installDate, alarm.powerType),
    }));
  }),

  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    return assertDeviceCompany(input.id, ctx.user.companyId!);
  }),

  create: technicianProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    suiteNumber: z.string().min(1),
    location: z.string().optional(),
    powerType: z.enum(['hardwired', 'battery', 'sealed', 'unknown']).optional(),
    installDate: z.string().optional(), // ISO date string
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
    const { installDate, ...rest } = input;
    return db.createDevice({
      ...rest,
      category: 'SMOKE_ALARM',
      deviceType: 'Smoke Alarm',
      installDate: installDate ? new Date(installDate) : undefined,
    });
  }),
  
  update: technicianProcedure.input(z.object({
    id: z.number(),
    suiteNumber: z.string().optional(),
    location: z.string().optional(),
    powerType: z.enum(['hardwired', 'battery', 'sealed', 'unknown']).optional(),
    installDate: z.string().optional(), // ISO date string
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const { id, installDate, ...data } = input;
    await assertDeviceCompany(id, ctx.user.companyId!);
    await db.updateDevice(id, {
      ...data,
      installDate: installDate ? new Date(installDate) : undefined,
    });
    return { success: true };
  }),

  recordTest: technicianProcedure.input(z.object({
    id: z.number(),
    testResult: z.enum(['pass', 'fail', 'no_access', 'na']),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertDeviceCompany(input.id, ctx.user.companyId!);
    await db.updateSmokeAlarmTestResult(input.id, input.testResult, input.notes);

    // If test failed or no access, prompt for deficiency
    if (input.testResult === 'fail' || input.testResult === 'no_access') {
      return { success: true, requiresDeficiency: true };
    }

    return { success: true, requiresDeficiency: false };
  }),

  getCount: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input, ctx }) => {
    await assertSiteCompany(input.siteId, ctx.user.companyId!);
    return db.getSmokeAlarmCountBySite(input.siteId);
  }),
});

export { areaRouter, deviceRouter, smokeAlarmRouter };
