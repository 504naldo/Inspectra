import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as sprinklerDb from "./db.sprinkler";
import { assertJobCompany, assertJobNotFinalized, withAudit } from "./db";
import type { TrpcContext } from "./_core/context";

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

// Resolve indirect parents before the transaction: its first read must lock the
// job, so waiting for a concurrent seal cannot establish a stale RR snapshot.
async function withMutableInspection<T>(
  ctx: TrpcContext,
  procedure: string,
  inspectionId: number,
  fn: () => Promise<T>,
) {
  const companyId = ctx.user!.companyId!;
  const inspection = await assertInspectionCompany(inspectionId, companyId);
  return withAudit(ctx, procedure, async tx => {
    await assertJobNotFinalized(inspection.jobId, tx);
    const current = await assertInspectionCompany(inspectionId, companyId);
    if (current.jobId !== inspection.jobId) {
      throw new TRPCError({ code: "CONFLICT", message: "Inspection parent changed; retry the operation" });
    }
    return fn();
  });
}

async function withMutableChild<T extends { inspectionId: number }, R>(
  ctx: TrpcContext,
  procedure: string,
  getById: (id: number) => Promise<T | undefined>,
  id: number,
  notFoundLabel: string,
  fn: () => Promise<R>,
) {
  const row = await getById(id);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `${notFoundLabel} ${id} not found` });
  return withMutableInspection(ctx, procedure, row.inspectionId, async () => {
    const current = await getById(id);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: `${notFoundLabel} ${id} not found` });
    if (current.inspectionId !== row.inspectionId) {
      throw new TRPCError({ code: "CONFLICT", message: "Inspection parent changed; retry the operation" });
    }
    return fn();
  });
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
    return withAudit(ctx, "sprinkler.createInspection", async tx => {
      await assertJobNotFinalized(input.jobId, tx);
      await assertJobCompany(input.jobId, ctx.user.companyId!);
      return sprinklerDb.createSprinklerInspection(input as any);
    });
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
    return withMutableInspection(ctx, "sprinkler.updateInspection", input.id, async () => {
      const { id, ...data } = input;
      return sprinklerDb.updateSprinklerInspection(id, data);
    });
  }),

  finalizeInspection: technicianProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    return withMutableInspection(ctx, "sprinkler.finalizeInspection", input.id, async () => {
      const validation = await sprinklerDb.validateSprinklerInspectionForFinalize(input.id);
      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot finalize: ${validation.errors.join(', ')}`
        });
      }
      return sprinklerDb.finalizeSprinklerInspection(input.id, ctx.user.id);
    });
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
    return withMutableInspection(ctx, "sprinkler.upsertSystems", input.inspectionId,
      () => sprinklerDb.upsertSprinklerSystems(input.inspectionId, input.systems));
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
    return withMutableInspection(ctx, "sprinkler.upsertChecklistItems", input.inspectionId,
      () => sprinklerDb.upsertSprinklerChecklistItems(input.inspectionId, input.items));
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
    return withMutableChild(ctx, "sprinkler.updateChecklistItem", sprinklerDb.getSprinklerChecklistItemById,
      input.id, "Sprinkler checklist item", async () => {
        const { id, ...data } = input;
        return sprinklerDb.updateSprinklerChecklistItem(id, data);
      });
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
    return withMutableInspection(ctx, "sprinkler.upsertDevices", input.inspectionId,
      () => sprinklerDb.upsertSprinklerDevices(input.inspectionId, input.devices));
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
    return withMutableChild(ctx, "sprinkler.updateDevice", sprinklerDb.getSprinklerDeviceById,
      input.id, "Sprinkler device", async () => {
        const { id, ...data } = input;
        return sprinklerDb.updateSprinklerDevice(id, data);
      });
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
    return withMutableInspection(ctx, "sprinkler.createDevice", input.inspectionId,
      () => sprinklerDb.createSprinklerDevice(input as any));
  }),

  deleteDevice: technicianProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    return withMutableChild(ctx, "sprinkler.deleteDevice", sprinklerDb.getSprinklerDeviceById,
      input.id, "Sprinkler device", () => sprinklerDb.deleteSprinklerDevice(input.id));
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
