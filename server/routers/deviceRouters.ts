import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";

// Area router
const areaRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getAreasBySite(input.siteId);
  }),
  
  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getAreaById(input.id);
  }),
  
  create: officeProcedure.input(z.object({
    siteId: z.number(),
    name: z.string().min(1),
    floor: z.string().optional(),
    building: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    return db.createArea(input);
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    floor: z.string().optional(),
    building: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateArea(id, data);
    return { success: true };
  }),
});

// Device router
const deviceRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getDevicesBySite(input.siteId);
  }),
  
  listByArea: technicianProcedure.input(z.object({ areaId: z.number() })).query(async ({ input }) => {
    return db.getDevicesByArea(input.areaId);
  }),
  
  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getDeviceById(input.id);
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
  })).mutation(async ({ input }) => {
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
    barcode: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updateDevice(id, data);
    return { success: true };
  }),
  
  getCount: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getDeviceCountBySite(input.siteId);
  }),
});

// Smoke Alarm router
const smokeAlarmRouter = router({
  listBySite: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    const { calculateSmokeAlarmExpiry } = await import('../../shared/smokeAlarmExpiry');
    const smokeAlarms = await db.getSmokeAlarmsBySite(input.siteId);
    return smokeAlarms.map(alarm => ({
      ...alarm,
      expiryInfo: calculateSmokeAlarmExpiry(alarm.installDate, alarm.powerType),
    }));
  }),
  
  listByJob: technicianProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    const { calculateSmokeAlarmExpiry } = await import('../../shared/smokeAlarmExpiry');
    const smokeAlarms = await db.getSmokeAlarmsByJob(input.jobId);
    return smokeAlarms.map(alarm => ({
      ...alarm,
      expiryInfo: calculateSmokeAlarmExpiry(alarm.installDate, alarm.powerType),
    }));
  }),
  
  get: technicianProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getDeviceById(input.id);
  }),
  
  create: technicianProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    suiteNumber: z.string().min(1),
    location: z.string().optional(),
    powerType: z.enum(['hardwired', 'battery', 'sealed', 'unknown']).optional(),
    installDate: z.string().optional(), // ISO date string
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
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
  })).mutation(async ({ input }) => {
    const { id, installDate, ...data } = input;
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
  })).mutation(async ({ input }) => {
    await db.updateSmokeAlarmTestResult(input.id, input.testResult, input.notes);
    
    // If test failed or no access, prompt for deficiency
    if (input.testResult === 'fail' || input.testResult === 'no_access') {
      return { success: true, requiresDeficiency: true };
    }
    
    return { success: true, requiresDeficiency: false };
  }),
  
  getCount: technicianProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getSmokeAlarmCountBySite(input.siteId);
  }),
});

export { areaRouter, deviceRouter, smokeAlarmRouter };
