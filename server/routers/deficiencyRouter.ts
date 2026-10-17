import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  technicianProcedure,
  customerProcedure,
} from "../_core/trpc";
import * as db from "../db";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { withAudit, assertJobNotFinalized } from "../db";
import { assertCustomerOrgCompany } from "../tenantGuards";
import {
  toCustomerSafeDeficiency,
  toCustomerSafeRepair,
  toCustomerSafeAttachment,
} from "../customerDto";
import {
  assertAttachmentDestination,
  filterAuthorizedAttachments,
} from "../attachmentAccess";
import { withMutableJob } from "../jobWriteTransaction";
import type { TrpcContext } from "../_core/context";
import type { Db } from "../db/client";

async function withMutableDeficiency<T>(
  ctx: TrpcContext,
  procedure: string,
  id: number,
  write: (
    row: NonNullable<Awaited<ReturnType<typeof db.getDeficiencyById>>>,
    tx: Db
  ) => Promise<T>
) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const candidate = await db.getDeficiencyById(id);
  if (!candidate)
    throw new TRPCError({ code: "NOT_FOUND", message: "Deficiency not found" });
  await assertAttachmentDestination(
    { entityType: "deficiency", entityId: id },
    ctx.user
  );
  return withAudit(ctx, procedure, async tx => {
    await assertJobNotFinalized(candidate.jobId, tx);
    const current = await db.getDeficiencyById(id);
    if (!current)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Deficiency not found",
      });
    if (current.jobId !== candidate.jobId)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Deficiency job changed. Refresh and try again.",
      });
    await assertAttachmentDestination(
      { entityType: "deficiency", entityId: id },
      ctx.user!
    );
    return write(current, tx);
  });
}

// Deficiency router
const deficiencyRouter = router({
  listByJob: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      await db.assertJobCompany(input.jobId, ctx.user.companyId!);
      return db.getDeficienciesByJob(input.jobId);
    }),

  listByCustomerOrg: protectedProcedure
    .input(z.object({ customerOrgId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "customer") {
        if (ctx.user.customerOrgId !== input.customerOrgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else {
        await assertCustomerOrgCompany(
          input.customerOrgId,
          ctx.user.companyId!
        );
      }
      const deficiencies = await db.getDeficienciesByCustomerOrg(
        input.customerOrgId
      );
      return ctx.user.role === "customer"
        ? deficiencies.map(toCustomerSafeDeficiency)
        : deficiencies;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const deficiency = await db.getDeficiencyById(input.id);
      if (!deficiency) return null;
      await assertAttachmentDestination(
        { entityType: "deficiency", entityId: input.id },
        ctx.user
      );
      const attachments = await filterAuthorizedAttachments(
        await db.getAttachmentsByEntity("deficiency", input.id),
        ctx.user
      );
      const repairs = await db.getRepairsByDeficiency(input.id);
      const isCustomer = ctx.user.role === "customer";
      return {
        deficiency: isCustomer
          ? toCustomerSafeDeficiency(deficiency)
          : deficiency,
        attachments: isCustomer
          ? attachments
              .filter(a => a.isCustomerFacing === 1)
              .map(toCustomerSafeAttachment)
          : attachments,
        repairs: isCustomer ? repairs.map(toCustomerSafeRepair) : repairs,
      };
    }),

  create: technicianProcedure
    .input(
      z.object({
        jobId: z.number(),
        deviceId: z.number().optional(),
        inspectionResultId: z.number().optional(),
        expectedDeviceRevision: z.string().optional(),
        title: z.string().min(1),
        severity: z
          .enum(["critical", "major", "minor", "observation"])
          .optional(),
        description: z.string().optional(),
        observedIssue: z.string().optional(),
        correctiveAction: z.string().optional(),
        customerExplanation: z.string().optional(),
        codeReference: z.string().optional(),
        aiGeneratedAt: z.date().optional(),
        systemCategory: z
          .enum([
            "FIRE_ALARM",
            "FIRE_EXTINGUISHER",
            "EMERGENCY_LIGHTING",
            "SPRINKLER",
            "SMOKE_ALARM",
          ])
          .optional(),
        estimatedCost: z.number().nonnegative().optional(),
        // Offline-sync idempotency: the client's stable local id for this deficiency.
        // On reconnect the same create may be replayed (e.g. a lost response); we
        // find-or-create on this key so a retry never duplicates the record.
        idempotencyKey: z.string().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Reassignment cannot discard captured offline work; scope to company and
      // finalized state, while retaining the device definition actually displayed.
      await assertAttachmentDestination(
        { entityType: "job", entityId: input.jobId },
        ctx.user
      );
      const replay = async () => {
        if (!input.idempotencyKey) return undefined;
        const existing = await db.getDeficiencyByIdempotencyKey(
          input.idempotencyKey,
          input.jobId
        );
        if (existing && existing.reportedById !== ctx.user.id)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Deficiency upload key is already in use.",
          });
        return existing;
      };
      const existing = await replay();
      if (existing) return existing;
      return withMutableJob(
        ctx,
        "deficiency.create",
        input.jobId,
        async job => {
          await assertAttachmentDestination(
            { entityType: "job", entityId: job.id },
            ctx.user
          );
          const existing = await replay();
          if (existing) return existing;
          let deviceId = input.deviceId;
          if (input.inspectionResultId != null) {
            const result = await db.getInspectionResultById(
              input.inspectionResultId
            );
            if (
              !result ||
              result.jobId !== job.id ||
              (result.companyId != null &&
                result.companyId !== job.companyId) ||
              (deviceId != null && result.deviceId !== deviceId)
            )
              throw new TRPCError({
                code: "FORBIDDEN",
                message:
                  "Inspection result does not belong to the deficiency job/device.",
              });
            deviceId = result.deviceId;
          }
          const deviceSnapshot =
            deviceId == null
              ? null
              : await db.captureDeviceSnapshotForJob(
                  job.id,
                  deviceId,
                  ctx.user.id,
                  input.expectedDeviceRevision
                );
          const { estimatedCost, expectedDeviceRevision, ...rest } = input;
          return db.createDeficiency({
            ...rest,
            deviceId,
            deviceSnapshot,
            reportedById: ctx.user.id,
            ...(estimatedCost != null
              ? { estimatedCost: String(estimatedCost) }
              : {}),
          });
        }
      );
    }),

  signOffFromPortal: customerProcedure
    .input(z.object({ deficiencyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const deficiency = await db.getDeficiencyById(input.deficiencyId);
      if (!deficiency) throw new TRPCError({ code: "NOT_FOUND" });

      await assertAttachmentDestination(
        { entityType: "deficiency", entityId: deficiency.id },
        ctx.user
      );

      if (deficiency.customerSignedOffAt) {
        return { success: true };
      }

      return withMutableDeficiency(
        ctx,
        "deficiency.signOffFromPortal",
        input.deficiencyId,
        async current => {
          if (current.customerSignedOffAt) return { success: true };
          await db.updateDeficiency(current.id, {
            customerSignedOffAt: new Date(),
            customerSignedOffByName: ctx.user.name ?? ctx.user.email,
            ...(current.status === "resolved" && { status: "closed" }),
          });
          return { success: true };
        }
      );
    }),

  update: technicianProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        severity: z
          .enum(["critical", "major", "minor", "observation"])
          .optional(),
        status: z
          .enum(["open", "in_progress", "resolved", "closed", "deferred"])
          .optional(),
        description: z.string().optional(),
        observedIssue: z.string().optional(),
        correctiveAction: z.string().optional(),
        customerExplanation: z.string().optional(),
        codeReference: z.string().optional(),
        resolutionNotes: z.string().optional(),
        systemCategory: z
          .enum([
            "FIRE_ALARM",
            "FIRE_EXTINGUISHER",
            "EMERGENCY_LIGHTING",
            "SPRINKLER",
            "SMOKE_ALARM",
          ])
          .optional(),
        estimatedCost: z.number().nonnegative().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return withMutableDeficiency(
        ctx,
        "deficiency.update",
        input.id,
        async () => {
          const { id, status, estimatedCost, ...data } = input;
          const updateData: any = { ...data };
          if (estimatedCost != null)
            updateData.estimatedCost = String(estimatedCost);
          if (status) {
            updateData.status = status;
            if (status === "resolved" || status === "closed") {
              updateData.resolvedAt = new Date();
              updateData.resolvedById = ctx.user.id;
            }
          }
          await db.updateDeficiency(id, updateData);
          return { success: true };
        }
      );
    }),
});

// Repair router
const repairRouter = router({
  listByDeficiency: technicianProcedure
    .input(z.object({ deficiencyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const deficiency = await db.getDeficiencyById(input.deficiencyId);
      if (!deficiency)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deficiency not found",
        });
      await db.assertJobCompany(deficiency.jobId, ctx.user.companyId!);
      return db.getRepairsByDeficiency(input.deficiencyId);
    }),

  get: technicianProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const repair = await db.getRepairById(input.id);
      if (!repair) return null;
      await assertAttachmentDestination(
        { entityType: "repair", entityId: repair.id },
        ctx.user
      );
      return repair;
    }),

  create: technicianProcedure
    .input(
      z.object({
        deficiencyId: z.number(),
        description: z.string().optional(),
        partsUsed: z.string().optional(),
        laborHours: z.number().optional(),
        aiRecommendations: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return withMutableDeficiency(
        ctx,
        "repair.create",
        input.deficiencyId,
        async () => {
          return db.createRepair({ ...input, technicianId: ctx.user.id });
        }
      );
    }),

  update: technicianProcedure
    .input(
      z.object({
        id: z.number(),
        status: z
          .enum(["pending", "in_progress", "completed", "parts_ordered"])
          .optional(),
        description: z.string().optional(),
        partsUsed: z.string().optional(),
        laborHours: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repair = await db.getRepairById(input.id);
      if (!repair)
        throw new TRPCError({ code: "NOT_FOUND", message: "Repair not found" });
      return withMutableDeficiency(
        ctx,
        "repair.update",
        repair.deficiencyId,
        async () => {
          const current = await db.getRepairById(input.id);
          if (!current)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Repair not found",
            });
          if (current.deficiencyId !== repair.deficiencyId)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Repair parent changed. Refresh and try again.",
            });
          const { id, status, ...data } = input;
          const updateData: any = { ...data };
          if (status) {
            updateData.status = status;
            if (status === "completed") {
              updateData.completedAt = new Date();
            }
          }
          await db.updateRepair(id, updateData);
          return { success: true };
        }
      );
    }),
});

export { deficiencyRouter, repairRouter };
