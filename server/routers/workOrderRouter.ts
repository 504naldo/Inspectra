import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  officeProcedure,
  technicianProcedure,
} from "../_core/trpc";
import * as db from "../db";
import { assertWorkOrderCompany } from "../tenantGuards";
import { logActivity } from "../activityLogger";

const materialSchema = z.object({
  description: z.string().min(1),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

export const workOrderRouter = router({
  /**
   * Fetch a single work order by ID.
   */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const wo = await assertWorkOrderCompany(input.id, ctx.user.companyId!);
      return wo;
    }),

  /**
   * List work orders for the current company, optionally filtered by status.
   */
  listByCompany: officeProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.getWorkOrdersByCompany(input.companyId, input.status);
    }),

  /**
   * Get the work order linked to a specific job.
   */
  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const wo = await db.getWorkOrderByJob(input.jobId);
      if (!wo) return null;
      if (wo.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return wo;
    }),

  /**
   * Office-only: update work order scheduling, priority, notes, or title.
   * Blocked on finalized work orders.
   */
  update: officeProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        scheduledDate: z.date().optional().nullable(),
        estimatedHours: z.number().nonnegative().optional().nullable(),
        officeNotes: z.string().optional(),
        workType: z
          .enum(["inspection", "repair", "service_call", "maintenance", "emergency"])
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const wo = await assertWorkOrderCompany(input.id, ctx.user.companyId!);
      if (wo.finalizedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Work order is finalized and cannot be modified.",
        });
      }

      const { id, estimatedHours, ...rest } = input;
      await db.updateWorkOrder(id, {
        ...rest,
        ...(estimatedHours !== undefined
          ? { estimatedHours: estimatedHours !== null ? String(estimatedHours) : null }
          : {}),
      });
      if (input.scheduledDate !== undefined) {
        void logActivity({ ctx, entityType: "work_order", entityId: id, eventType: "scheduled",
          title: input.scheduledDate ? `Work order scheduled for ${new Date(input.scheduledDate).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}` : "Work order schedule cleared" });
      }
      return { success: true };
    }),

  /**
   * Technician-facing update: add tech notes, materials used, and log actual hours.
   * Blocked on finalized or completed work orders.
   */
  techUpdate: technicianProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        techNotes: z.string().optional(),
        materialsUsed: z.array(materialSchema).optional(),
        actualHours: z.number().nonnegative().optional(),
        completionSummary: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const wo = await assertWorkOrderCompany(input.id, ctx.user.companyId!);
      if (wo.finalizedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Work order is finalized and cannot be modified.",
        });
      }

      const { id, actualHours, ...rest } = input;
      await db.updateWorkOrder(id, {
        ...rest,
        ...(actualHours !== undefined ? { actualHours: String(actualHours) } : {}),
      });
      return { success: true };
    }),

  /**
   * Mark a work order as completed.
   * Technician or office can complete.
   */
  complete: technicianProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        completionSummary: z.string().optional(),
        actualHours: z.number().nonnegative().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const wo = await assertWorkOrderCompany(input.id, ctx.user.companyId!);
      if (wo.finalizedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Work order is finalized and cannot be modified.",
        });
      }
      if (wo.status === "completed" || wo.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Work order is already ${wo.status}.`,
        });
      }

      await db.updateWorkOrder(input.id, {
        status: "completed",
        completedAt: new Date(),
        completionSummary: input.completionSummary ?? wo.completionSummary,
        actualHours: input.actualHours !== undefined ? String(input.actualHours) : wo.actualHours,
      });
      void logActivity({ ctx, entityType: "work_order", entityId: input.id, eventType: "completed",
        title: "Work order completed" });
      return { success: true };
    }),

  /**
   * List work orders for a specific site.
   */
  listBySite: officeProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const wos = await db.getWorkOrdersBySite(input.siteId);
      // Filter to company scope
      return wos.filter((wo) => wo.companyId === ctx.user.companyId);
    }),
});
