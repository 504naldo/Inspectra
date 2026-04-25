import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { jobs, users, jobAssignments, sites, customerOrgs } from "../drizzle/schema";
import { eq, inArray, and, or, isNull, gte, lte, sql } from "drizzle-orm";

/**
 * Job Assignment Router
 * Handles multi-technician job assignments for admin and filtered job lists for technicians
 */

export const jobAssignmentRouter = router({
  /**
   * List jobs assigned to the current technician
   * Returns jobs where the technician is in job_assignments table
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

    // Get jobs where user is assigned
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
        siteId: jobs.siteId,
        customerOrgId: jobs.customerOrgId,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        assignmentRole: jobAssignments.role,
        assignedAt: jobAssignments.assignedAt,
      })
      .from(jobs)
      .innerJoin(jobAssignments, eq(jobs.id, jobAssignments.jobId))
      .where(eq(jobAssignments.userId, ctx.user.id))
      .orderBy(jobs.scheduledDate);

    return assignedJobs;
  }),

  /**
   * List all jobs with assigned technicians (Admin/Office only)
   * Returns jobs with array of assigned technicians
   */
  listJobsWithAssignees: protectedProcedure
    .input(z.object({ 
      companyId: z.number(),
      status: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
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

      // Get all jobs for the company
      const whereConditions = input.status && input.status !== 'all'
        ? and(
            eq(jobs.companyId, input.companyId),
            eq(jobs.status, input.status as any)
          )
        : eq(jobs.companyId, input.companyId);

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
          siteId: jobs.siteId,
          customerOrgId: jobs.customerOrgId,
          createdAt: jobs.createdAt,
          updatedAt: jobs.updatedAt,
          companyId: jobs.companyId,
        })
        .from(jobs)
        .where(whereConditions)
        .orderBy(jobs.scheduledDate);

      // Get all assignments for these jobs
      const jobIds = allJobs.map(j => j.id);
      if (jobIds.length === 0) return [];

      const assignments = await db
        .select({
          jobId: jobAssignments.jobId,
          userId: jobAssignments.userId,
          role: jobAssignments.role,
          assignedAt: jobAssignments.assignedAt,
          technicianName: users.name,
          technicianEmail: users.email,
        })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(inArray(jobAssignments.jobId, jobIds));

      // Group assignments by job
      const jobsWithAssignees = allJobs.map(job => ({
        ...job,
        assignedTechnicians: assignments
          .filter(a => a.jobId === job.id)
          .map(a => ({
            id: a.userId,
            name: a.technicianName,
            email: a.technicianEmail,
            role: a.role,
            assignedAt: a.assignedAt,
          })),
      }));

      return jobsWithAssignees;
    }),

  /**
   * List all active technicians (for assignment dropdown)
   */
  listTechnicians: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
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

      // Get all technicians, then dedupe by normalized email in JavaScript
      const allTechnicians = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(and(
          eq(users.role, "technician"),
          eq(users.companyId, input.companyId),
          eq(users.isActive, 1)
        ))
        .orderBy(users.name);
      
      // Deduplicate by normalized email (trim + lowercase), keeping first occurrence
      const seen = new Set<string>();
      const technicians = allTechnicians.filter(tech => {
        if (!tech.email) return false; // Skip users without email
        const normalizedEmail = tech.email.trim().toLowerCase();
        if (seen.has(normalizedEmail)) return false;
        seen.add(normalizedEmail);
        return true;
      });

      return technicians;
    }),

  /**
   * Set job assignments (replace all assignments for a job)
   * Admin/Office only
   */
  setJobAssignments: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        technicianIds: z.array(z.number()),
        leadId: z.number(), // REQUIRED lead technician
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

      // Allow empty assignments (unassign all)
      if (input.technicianIds.length === 0) {
        // Delete all assignments and return
        await db
          .delete(jobAssignments)
          .where(eq(jobAssignments.jobId, input.jobId));
        return { success: true, count: 0 };
      }

      // Validate leadId is required when assigning technicians
      if (!input.leadId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Lead technician is required when assigning technicians to a job",
        });
      }

      // Validate leadId is included in technicianIds
      if (!input.technicianIds.includes(input.leadId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Lead technician must be included in the list of assigned technicians",
        });
      }

      // Validate all assigned users exist and are active (admin, office, or technician)
      if (input.technicianIds.length > 0) {
        const validTechs = await db
          .select({ id: users.id })
          .from(users)
          .where(and(
            inArray(users.id, input.technicianIds),
            inArray(users.role, ['technician', 'admin', 'office']),
            eq(users.isActive, 1)
          ));

        if (validTechs.length !== input.technicianIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more invalid or inactive technician IDs",
          });
        }
      }

      // Delete existing assignments
      await db
        .delete(jobAssignments)
        .where(eq(jobAssignments.jobId, input.jobId));

      // Insert new assignments
      if (input.technicianIds.length > 0) {
        const newAssignments = input.technicianIds.map(techId => ({
          jobId: input.jobId,
          userId: techId,
          role: (input.leadId && techId === input.leadId) ? 'LEAD' as const : 'ASSIST' as const,
          assignedByUserId: ctx.user.id,
        }));

        await db.insert(jobAssignments).values(newAssignments);
      }

      return { success: true, count: input.technicianIds.length };
    }),

  /**
   * Add technicians to a job (without removing existing assignments)
   */
  addJobAssignments: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        technicianIds: z.array(z.number()),
        leadId: z.number().optional(),
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

      // Validate assigned users exist and are active (admin, office, or technician)
      if (input.technicianIds.length > 0) {
        const validTechs = await db
          .select({ id: users.id })
          .from(users)
          .where(and(
            inArray(users.id, input.technicianIds),
            inArray(users.role, ['technician', 'admin', 'office']),
            eq(users.isActive, 1)
          ));

        if (validTechs.length !== input.technicianIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more invalid or inactive technician IDs",
          });
        }
      }

      // Get existing assignments
      const existing = await db
        .select({ userId: jobAssignments.userId })
        .from(jobAssignments)
        .where(eq(jobAssignments.jobId, input.jobId));

      const existingIds = new Set(existing.map(e => e.userId));

      // Filter out already-assigned technicians
      const newTechIds = input.technicianIds.filter(id => !existingIds.has(id));

      if (newTechIds.length > 0) {
        const newAssignments = newTechIds.map(techId => ({
          jobId: input.jobId,
          userId: techId,
          role: (input.leadId && techId === input.leadId) ? 'LEAD' as const : 'ASSIST' as const,
          assignedByUserId: ctx.user.id,
        }));

        await db.insert(jobAssignments).values(newAssignments);
      }

      return { success: true, added: newTechIds.length, skipped: input.technicianIds.length - newTechIds.length };
    }),

  /**
   * Remove a technician from a job
   */
  removeJobAssignment: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        technicianId: z.number(),
        newLeadId: z.number().optional(), // Required if removing current Lead
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "office") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admin or office users can remove assignments",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      // Check if removing the Lead technician
      const assignment = await db
        .select({ role: jobAssignments.role })
        .from(jobAssignments)
        .where(and(
          eq(jobAssignments.jobId, input.jobId),
          eq(jobAssignments.userId, input.technicianId)
        ))
        .limit(1);

      if (assignment.length > 0 && assignment[0].role === 'LEAD') {
        // Check if there are other assignments
        const otherAssignments = await db
          .select({ userId: jobAssignments.userId })
          .from(jobAssignments)
          .where(and(
            eq(jobAssignments.jobId, input.jobId),
            sql`${jobAssignments.userId} != ${input.technicianId}`
          ));

        if (otherAssignments.length > 0 && !input.newLeadId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove Lead technician without assigning a new Lead. Provide newLeadId.",
          });
        }

        // If newLeadId provided, promote them to Lead
        if (input.newLeadId) {
          await db
            .update(jobAssignments)
            .set({ role: 'LEAD' })
            .where(and(
              eq(jobAssignments.jobId, input.jobId),
              eq(jobAssignments.userId, input.newLeadId)
            ));
        }
      }

      // Remove the assignment
      await db
        .delete(jobAssignments)
        .where(and(
          eq(jobAssignments.jobId, input.jobId),
          eq(jobAssignments.userId, input.technicianId)
        ));

      return { success: true };
    }),

  /**
   * Bulk assign multiple jobs to multiple technicians
   */
  bulkAssignJobs: protectedProcedure
    .input(
      z.object({
        jobIds: z.array(z.number()),
        technicianIds: z.array(z.number()),
        mode: z.enum(['add', 'replace']).default('add'),
        leadId: z.number(), // REQUIRED lead technician
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "office") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admin or office users can bulk assign jobs",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      if (input.jobIds.length === 0 || input.technicianIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must select at least one job and one technician",
        });
      }

      // Validate leadId is required
      if (!input.leadId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Lead technician is required for bulk assignment",
        });
      }

      // Validate leadId is included in technicianIds
      if (!input.technicianIds.includes(input.leadId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Lead technician must be included in the list of assigned technicians",
        });
      }

      // Validate technicians
      const validTechs = await db
        .select({ id: users.id })
        .from(users)
        .where(and(
          inArray(users.id, input.technicianIds),
          eq(users.role, "technician"),
          eq(users.isActive, 1)
        ));

      if (validTechs.length !== input.technicianIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more invalid or inactive technician IDs",
        });
      }

      // If replace mode, delete existing assignments
      if (input.mode === 'replace') {
        await db
          .delete(jobAssignments)
          .where(inArray(jobAssignments.jobId, input.jobIds));
      }

      // Create new assignments for each job x technician combination
      const newAssignments = [];
      for (const jobId of input.jobIds) {
        for (const techId of input.technicianIds) {
          newAssignments.push({
            jobId,
            userId: techId,
            role: (input.leadId && techId === input.leadId) ? 'LEAD' as const : 'ASSIST' as const,
            assignedByUserId: ctx.user.id,
          });
        }
      }

      // In add mode, use INSERT IGNORE to skip duplicates
      if (input.mode === 'add') {
        // Insert one by one to handle duplicates gracefully
        let added = 0;
        for (const assignment of newAssignments) {
          try {
            await db.insert(jobAssignments).values(assignment);
            added++;
          } catch (err) {
            // Skip duplicates (unique constraint violation)
            continue;
          }
        }
        return { success: true, added, total: newAssignments.length };
      } else {
        await db.insert(jobAssignments).values(newAssignments);
        return { success: true, added: newAssignments.length, total: newAssignments.length };
      }
    }),

  /**
   * List jobs for the dispatch board — date range + unscheduled pending/scheduled jobs
   * Joins sites and customerOrgs for display names
   */
  listDispatch: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),   // YYYY-MM-DD
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "office") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin or office only" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate + "T00:00:00");
      const end = new Date(input.endDate + "T23:59:59");

      const jobRows = await db
        .select({
          id: jobs.id,
          jobNumber: jobs.jobNumber,
          title: jobs.title,
          jobType: jobs.jobType,
          status: jobs.status,
          priority: jobs.priority,
          scheduledDate: jobs.scheduledDate,
          siteId: jobs.siteId,
          siteName: sites.name,
          customerOrgId: jobs.customerOrgId,
          customerName: customerOrgs.name,
          companyId: jobs.companyId,
        })
        .from(jobs)
        .leftJoin(sites, eq(jobs.siteId, sites.id))
        .leftJoin(customerOrgs, eq(jobs.customerOrgId, customerOrgs.id))
        .where(and(
          eq(jobs.companyId, input.companyId),
          or(
            and(gte(jobs.scheduledDate, start), lte(jobs.scheduledDate, end)),
            and(isNull(jobs.scheduledDate), or(eq(jobs.status, "pending"), eq(jobs.status, "scheduled")))
          )
        ))
        .orderBy(jobs.scheduledDate);

      const jobIds = jobRows.map(j => j.id);
      if (jobIds.length === 0) return [];

      const assignments = await db
        .select({
          jobId: jobAssignments.jobId,
          userId: jobAssignments.userId,
          role: jobAssignments.role,
          technicianName: users.name,
          technicianEmail: users.email,
        })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(inArray(jobAssignments.jobId, jobIds));

      return jobRows.map(job => ({
        ...job,
        assignedTechnicians: assignments
          .filter(a => a.jobId === job.id)
          .map(a => ({ id: a.userId, name: a.technicianName, email: a.technicianEmail, role: a.role })),
      }));
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
