import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { jobs, users } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Job Assignment Router
 * Handles technician job assignments for admin and filtered job lists for technicians
 */

export const jobAssignmentRouter = router({
  /**
   * List jobs assigned to the current technician
   * Only returns jobs where assignedTechnicianId matches current user
   */
  listMyJobs: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "technician") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only technicians can access their assigned jobs",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const assignedJobs = await db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        title: jobs.title,
        description: jobs.description,
        jobType: jobs.jobType,
        status: jobs.status,
        priority: jobs.priority,
        scheduledDate: jobs.scheduledDate,
        assignedAt: jobs.assignedAt,
        siteId: jobs.siteId,
        customerOrgId: jobs.customerOrgId,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.assignedTechnicianId, ctx.user.id))
      .orderBy(jobs.scheduledDate);

    return assignedJobs;
  }),

  /**
   * List all jobs with assignee information (Admin/Office only)
   * Returns all jobs with current assigned technician details
   */
  listJobsWithAssignee: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "office") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admin or office users can view all job assignments",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const allJobs = await db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        title: jobs.title,
        description: jobs.description,
        jobType: jobs.jobType,
        status: jobs.status,
        priority: jobs.priority,
        scheduledDate: jobs.scheduledDate,
        assignedTechnicianId: jobs.assignedTechnicianId,
        assignedAt: jobs.assignedAt,
        assignedByUserId: jobs.assignedByUserId,
        siteId: jobs.siteId,
        customerOrgId: jobs.customerOrgId,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        technicianName: users.name,
        technicianEmail: users.email,
      })
      .from(jobs)
      .leftJoin(users, eq(jobs.assignedTechnicianId, users.id))
      .orderBy(jobs.scheduledDate);

    return allJobs;
  }),

  /**
   * List all technicians (for assignment dropdown)
   */
  listTechnicians: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "office") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admin or office users can list technicians",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const technicians = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.role, "technician"))
      .orderBy(users.name);

    return technicians;
  }),

  /**
   * Assign a job to a technician (Admin/Office only)
   * Can also unassign by passing null as technicianId
   */
  assignJob: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        technicianId: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "office") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admin or office users can assign jobs",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      // Validate technician exists and has correct role
      if (input.technicianId !== null) {
        const technician = await db
          .select()
          .from(users)
          .where(eq(users.id, input.technicianId))
          .limit(1);

        if (technician.length === 0 || technician[0].role !== "technician") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid technician ID or user is not a technician",
          });
        }
      }

      // Update job assignment
      await db
        .update(jobs)
        .set({
          assignedTechnicianId: input.technicianId,
          assignedAt: input.technicianId !== null ? new Date() : null,
          assignedByUserId: input.technicianId !== null ? ctx.user.id : null,
        })
        .where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  /**
   * Bulk assign multiple jobs to a technician (Admin/Office only)
   */
  bulkAssignJobs: protectedProcedure
    .input(
      z.object({
        jobIds: z.array(z.number()),
        technicianId: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "office") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admin or office users can assign jobs",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      if (input.jobIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No jobs selected for assignment",
        });
      }

      // Validate technician exists and has correct role
      if (input.technicianId !== null) {
        const technician = await db
          .select()
          .from(users)
          .where(eq(users.id, input.technicianId))
          .limit(1);

        if (technician.length === 0 || technician[0].role !== "technician") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid technician ID or user is not a technician",
          });
        }
      }

      // Bulk update job assignments
      await db
        .update(jobs)
        .set({
          assignedTechnicianId: input.technicianId,
          assignedAt: input.technicianId !== null ? new Date() : null,
          assignedByUserId: input.technicianId !== null ? ctx.user.id : null,
        })
        .where(inArray(jobs.id, input.jobIds));

      return { success: true, count: input.jobIds.length };
    }),

  /**
   * Mark assignments as seen (updates seenAssignmentsAt timestamp)
   * Used to clear "new assignments" indicator
   */
  markAssignmentsSeen: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "technician") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only technicians can mark assignments as seen",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    await db
      .update(users)
      .set({ seenAssignmentsAt: new Date() })
      .where(eq(users.id, ctx.user.id));

    return { success: true };
  }),
});
