import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as sprinklerDb from "./db.sprinkler";
import { assertJobCompany, assertJobNotFinalized } from "./db";

// Role-based procedure helpers
const technicianProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'office', 'technician'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Technician, Office, or Admin access required' });
  }
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Resolves a sprinkler inspection and verifies its parent job belongs to companyId,
// preventing cross-company access via a directly-supplied inspectionId.
async function assertInspectionCompany(inspectionId: number, companyId: number) {
  const inspection = await sprinklerDb.getSprinklerInspectionById(inspectionId);
  if (!inspection) throw new TRPCError({ code: "NOT_FOUND", message: `Sprinkler inspection ${inspectionId} not found` });
  await assertJobCompany(inspection.jobId, companyId);
  return inspection;
}

// Same as assertInspectionCompany, plus blocks writes once the parent job is finalized.
async function assertInspectionMutable(inspectionId: number, companyId: number) {
  const inspection = await assertInspectionCompany(inspectionId, companyId);
  await assertJobNotFinalized(inspection.jobId);
  return inspection;
}

// Same as assertInspectionCompany, but for child records (systems/checklist items/devices)
// addressed only by their own id — resolves inspectionId via the provided lookup first.
async function assertChildCompany<T extends { inspectionId: number }>(
  getById: (id: number) => Promise<T | undefined>,
  id: number,
  companyId: number,
  notFoundLabel: string
) {
  const row = await getById(id);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `${notFoundLabel} ${id} not found` });
  await assertInspectionCompany(row.inspectionId, companyId);
  return row;
}

// Same as assertChildCompany, plus blocks writes once the parent job is finalized.
async function assertChildMutable<T extends { inspectionId: number }>(
  getById: (id: number) => Promise<T | undefined>,
  id: number,
  companyId: number,
  notFoundLabel: string
) {
  const row = await getById(id);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `${notFoundLabel} ${id} not found` });
  await assertInspectionMutable(row.inspectionId, companyId);
  return row;
}

export const sprinklerRouter = router({
  // ============================================
  // INSPECTION
  // ============================================
  
  createInspection: technicianProcedure.input(z.object({
    jobId: z.number(),
    inspectionDate: z.date(),
    buildingId: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    await assertJobNotFinalized(input.jobId);
    return sprinklerDb.createSprinklerInspection(input as any);
  }),

  getInspection: technicianProcedure.input(z.object({
    id: z.number(),
  })).query(async ({ input, ctx }) => {
    const inspection = await sprinklerDb.getSprinklerInspectionById(input.id);
    if (!inspection) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Inspection not found' });
    }
    await assertJobCompany(inspection.jobId, ctx.user.companyId!);
    return inspection;
  }),

  getInspectionByJobId: technicianProcedure.input(z.object({
    jobId: z.number(),
  })).query(async ({ input, ctx }) => {
    await assertJobCompany(input.jobId, ctx.user.companyId!);
    return sprinklerDb.getSprinklerInspectionByJobId(input.jobId);
  }),

  updateInspection: technicianProcedure.input(z.object({
    id: z.number(),
    inspectionDate: z.date().optional(),
    buildingId: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertInspectionMutable(input.id, ctx.user.companyId!);
    const { id, ...data } = input;
    return sprinklerDb.updateSprinklerInspection(id, data);
  }),

  finalizeInspection: technicianProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await assertInspectionCompany(input.id, ctx.user.companyId!);

    // Validate before finalizing
    const validation = await sprinklerDb.validateSprinklerInspectionForFinalize(input.id);
    if (!validation.valid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot finalize: ${validation.errors.join(', ')}`
      });
    }

    return sprinklerDb.finalizeSprinklerInspection(input.id, ctx.user.id);
  }),
  
  // ============================================
  // SYSTEMS
  // ============================================
  
  getSystems: technicianProcedure.input(z.object({
    inspectionId: z.number(),
  })).query(async ({ input, ctx }) => {
    await assertInspectionCompany(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.getSprinklerSystemsByInspectionId(input.inspectionId);
  }),

  upsertSystems: technicianProcedure.input(z.object({
    inspectionId: z.number(),
    systems: z.array(z.object({
      systemNumber: z.number(),
      isWet: z.boolean().optional(),
      isDryPipePartialTest: z.boolean().optional(),
      isDryPipeFullFlowTest: z.boolean().optional(),
      isDeluge: z.boolean().optional(),
      isPreaction: z.boolean().optional(),
      isOther: z.boolean().optional(),
      otherDescription: z.string().optional(),
      dateOfLastFullFlowTest: z.date().optional(),
      dateOfLast5YearInternal: z.date().optional(),
      areaOfCoverage: z.string().optional(),
      size: z.string().optional(),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      systemWaterPressure: z.number().optional(),
      supplyWaterPressure: z.number().optional(),
      residualPressure: z.number().optional(),
      waterPressureAtBaseOfRiser: z.number().optional(),
      systemAirPressure: z.number().optional(),
      lowAirSwitchCutIn: z.number().optional(),
      tripPressure: z.number().optional(),
      tripTime: z.number().optional(),
      waterDeliveryTime: z.number().optional(),
      gaugeYear: z.number().optional(),
      gaugeCondition: z.string().optional(),
      compressorMakeModel: z.string().optional(),
      compressorCutInPressure: z.number().optional(),
      compressorCutOutPressure: z.number().optional(),
      notes: z.string().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    await assertInspectionMutable(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.upsertSprinklerSystems(input.inspectionId, input.systems);
  }),

  // ============================================
  // CHECKLIST
  // ============================================

  getChecklistItems: technicianProcedure.input(z.object({
    inspectionId: z.number(),
  })).query(async ({ input, ctx }) => {
    await assertInspectionCompany(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.getSprinklerChecklistItemsByInspectionId(input.inspectionId);
  }),

  upsertChecklistItems: technicianProcedure.input(z.object({
    inspectionId: z.number(),
    items: z.array(z.object({
      section: z.string(),
      questionText: z.string(),
      questionOrder: z.number(),
      response: z.enum(['YES', 'NO', 'NA']).optional(),
      comment: z.string().optional(),
      createsDeficiencyWhen: z.enum(['NO', 'YES', 'NEVER']).optional(),
      numberValue: z.number().optional(),
      dateValue: z.date().optional(),
      tempValue: z.string().optional(),
      textValue: z.string().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    await assertInspectionMutable(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.upsertSprinklerChecklistItems(input.inspectionId, input.items);
  }),

  updateChecklistItem: technicianProcedure.input(z.object({
    id: z.number(),
    response: z.enum(['YES', 'NO', 'NA']).optional(),
    comment: z.string().optional(),
    numberValue: z.number().optional(),
    dateValue: z.date().optional(),
    tempValue: z.string().optional(),
    textValue: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertChildMutable(sprinklerDb.getSprinklerChecklistItemById, input.id, ctx.user.companyId!, "Sprinkler checklist item");
    const { id, ...data } = input;
    return sprinklerDb.updateSprinklerChecklistItem(id, data);
  }),

  // ============================================
  // DEVICES
  // ============================================

  getDevices: technicianProcedure.input(z.object({
    inspectionId: z.number(),
  })).query(async ({ input, ctx }) => {
    await assertInspectionCompany(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.getSprinklerDevicesByInspectionId(input.inspectionId);
  }),

  upsertDevices: technicianProcedure.input(z.object({
    inspectionId: z.number(),
    devices: z.array(z.object({
      deviceOrder: z.number(),
      location: z.string().optional(),
      labelText: z.string().optional(),
      deviceType: z.string().optional(),
      address: z.string().optional(),
      zone: z.string().optional(),
      checkA: z.boolean().optional(),
      checkB: z.boolean().optional(),
      checkC: z.boolean().optional(),
      checkD: z.boolean().optional(),
      checkE: z.boolean().optional(),
      checkF: z.boolean().optional(),
      remarks: z.string().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    await assertInspectionMutable(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.upsertSprinklerDevices(input.inspectionId, input.devices);
  }),
  
  updateDevice: technicianProcedure.input(z.object({
    id: z.number(),
    location: z.string().optional(),
    labelText: z.string().optional(),
    deviceType: z.string().optional(),
    address: z.string().optional(),
    zone: z.string().optional(),
    checkA: z.boolean().optional(),
    checkB: z.boolean().optional(),
    checkC: z.boolean().optional(),
    checkD: z.boolean().optional(),
    checkE: z.boolean().optional(),
    checkF: z.boolean().optional(),
    remarks: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertChildMutable(sprinklerDb.getSprinklerDeviceById, input.id, ctx.user.companyId!, "Sprinkler device");
    const { id, ...data } = input;
    return sprinklerDb.updateSprinklerDevice(id, data);
  }),
  
  createDevice: technicianProcedure.input(z.object({
    inspectionId: z.number(),
    deviceOrder: z.number(),
    location: z.string(),
    labelText: z.string().optional(),
    deviceType: z.string().optional(),
    address: z.string().optional(),
    zone: z.string().optional(),
    checkA: z.boolean().optional(),
    checkB: z.boolean().optional(),
    checkC: z.boolean().optional(),
    checkD: z.boolean().optional(),
    checkE: z.boolean().optional(),
    checkF: z.boolean().optional(),
    remarks: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertInspectionMutable(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.createSprinklerDevice(input as any);
  }),

  deleteDevice: technicianProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await assertChildMutable(sprinklerDb.getSprinklerDeviceById, input.id, ctx.user.companyId!, "Sprinkler device");
    return sprinklerDb.deleteSprinklerDevice(input.id);
  }),
  
  // ============================================
  // VALIDATION & DEFICIENCIES
  // ============================================
  
  validateForFinalize: technicianProcedure.input(z.object({
    inspectionId: z.number(),
  })).query(async ({ input, ctx }) => {
    await assertInspectionCompany(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.validateSprinklerInspectionForFinalize(input.inspectionId);
  }),

  getDeficiencies: technicianProcedure.input(z.object({
    inspectionId: z.number(),
  })).query(async ({ input, ctx }) => {
    await assertInspectionCompany(input.inspectionId, ctx.user.companyId!);
    return sprinklerDb.getSprinklerDeficiencies(input.inspectionId);
  }),
});
