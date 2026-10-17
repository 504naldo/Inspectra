import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { withMutableAssignmentJobs, readJobAssignments, replaceJobAssignments } from "./jobAssignmentIntegrity";
import { callerIsPlatformOperator } from "./_core/actorContext";
import { jobs, users, jobAssignments, sites, customerOrgs } from "../drizzle/schema";
import { eq, inArray, and, or, isNull, gte, lte, sql } from "drizzle-orm";

/**
 * Company-scope a client-supplied `companyId` on a read endpoint. Office/technician
 * callers may only pass their own company; `admin` is the cross-company platform
 * operator (docs/ROLE_TRUST_MODEL.md) and may pass any company.
 */
function assertCompanyScope(inputCompanyId: number, callerCompanyId: number | null | undefined): void {
  if (inputCompanyId !== callerCompanyId && !callerIsPlatformOperator()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cannot access another company's data" });
  }
}

function assertAssignmentOffice(role: string) {
  if (!["admin", "office"].includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only admin or office users can change assignments." });
}

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
        assignmentRole: sql<"LEAD" | "ASSIST">`CASE WHEN ${jobs.leadTechnicianId} = ${ctx.user.id} OR ${jobs.assignedTechnicianId} = ${ctx.user.id} THEN 'LEAD' ELSE 'ASSIST' END`,
        assignedAt: jobs.assignedAt,
      })
      .from(jobs)
      .where(and(
        eq(jobs.companyId, ctx.user.companyId ?? 0),
        or(eq(jobs.leadTechnicianId, ctx.user.id), eq(jobs.assignedTechnicianId, ctx.user.id),
          sql`EXISTS (SELECT 1 FROM job_assignments AS my_assignment WHERE my_assignment.jobId = ${jobs.id} AND my_assignment.userId = ${ctx.user.id})`),
      ))
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
      // Never trust the client-supplied companyId: office is scoped to its own
      // company; only the admin platform operator may query another company.
      assertCompanyScope(input.companyId, ctx.user.companyId);

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
      assertCompanyScope(input.companyId, ctx.user.companyId);

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
        jobId: z.number().int().positive(),
        technicianIds: z.array(z.number().int().positive()),
        leadId: z.number().int().nonnegative(), // REQUIRED lead technician
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAssignmentOffice(ctx.user.role);
      const technicianIds = Array.from(new Set(input.technicianIds));
      return withMutableAssignmentJobs(ctx, "jobAssignment.setJobAssignments", [input.jobId], async ([job], tx) => {
        await replaceJobAssignments(ctx, job, tx, technicianIds, technicianIds.length ? input.leadId : null);
        return { success: true, count: technicianIds.length };
      });
    }),

  /**
   * Add technicians to a job (without removing existing assignments)
   */
  addJobAssignments: protectedProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        technicianIds: z.array(z.number().int().positive()),
        leadId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAssignmentOffice(ctx.user.role);
      return withMutableAssignmentJobs(ctx, "jobAssignment.addJobAssignments", [input.jobId], async ([job], tx) => {
        const previous = await readJobAssignments(job, tx);
        const incoming = Array.from(new Set(input.technicianIds));
        const next = Array.from(new Set([...previous.ids, ...incoming]));
        const added = incoming.filter(id => !previous.ids.includes(id)).length;
        await replaceJobAssignments(ctx, job, tx, next, input.leadId ?? previous.leadId);
        return { success: true, added, skipped: incoming.length - added };
      });
    }),

  /**
   * Remove a technician from a job
   */
  removeJobAssignment: protectedProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        technicianId: z.number().int().positive(),
        newLeadId: z.number().int().positive().optional(), // Required if removing current Lead
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAssignmentOffice(ctx.user.role);
      return withMutableAssignmentJobs(ctx, "jobAssignment.removeJobAssignment", [input.jobId], async ([job], tx) => {
        const previous = await readJobAssignments(job, tx);
        const next = previous.ids.filter(id => id !== input.technicianId);
        if (input.newLeadId !== undefined && !next.includes(input.newLeadId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The replacement lead must already be assigned to this job." });
        }
        const leadId = previous.leadId === input.technicianId ? (input.newLeadId ?? null) : previous.leadId;
        if (input.newLeadId !== undefined && previous.leadId !== input.technicianId && input.newLeadId !== previous.leadId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only removing the current lead can promote a replacement." });
        }
        await replaceJobAssignments(ctx, job, tx, next, leadId);
        return { success: true };
      });
    }),

  /**
   * Bulk assign multiple jobs to multiple technicians
   */
  bulkAssignJobs: protectedProcedure
    .input(
      z.object({
        jobIds: z.array(z.number().int().positive()).min(1),
        technicianIds: z.array(z.number().int().positive()),
        mode: z.enum(['add', 'replace']).default('add'),
        leadId: z.number().int().nonnegative(), // REQUIRED lead technician
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAssignmentOffice(ctx.user.role);
      const technicianIds = Array.from(new Set(input.technicianIds));
      if (!technicianIds.length || !technicianIds.includes(input.leadId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select technicians and include the required lead." });
      }
      return withMutableAssignmentJobs(ctx, "jobAssignment.bulkAssignJobs", input.jobIds, async (parents, tx) => {
        // Validate the whole batch before replacing any assignment set.
        const plans = [];
        for (const job of parents) {
          const previous = await readJobAssignments(job, tx);
          plans.push({ job, previous, ids: input.mode === "replace" ? technicianIds : Array.from(new Set([...previous.ids, ...technicianIds])) });
        }
        let added = 0;
        for (const plan of plans) {
          await replaceJobAssignments(ctx, plan.job, tx, plan.ids, input.leadId);
          added += input.mode === "replace" ? technicianIds.length : technicianIds.filter(id => !plan.previous.ids.includes(id)).length;
        }
        return { success: true, added, total: parents.length * technicianIds.length };
      });
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
      assertCompanyScope(input.companyId, ctx.user.companyId);

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

  /**
   * Bulk reassign: replace fromTech with toTech across a set of jobs,
   * preserving each technician's role (LEAD stays LEAD, ASSIST stays ASSIST).
   * If toTech is already assigned, their existing role is promoted to LEAD when
   * appropriate and fromTech is removed.
   */
  reassignTechnician: protectedProcedure
    .input(z.object({
      fromTechId: z.number().int().positive(),
      toTechId:   z.number().int().positive(),
      jobIds:     z.array(z.number().int().positive()).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      assertAssignmentOffice(ctx.user.role);
      if (input.fromTechId === input.toTechId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "From and to technician must be different." });
      }
      return withMutableAssignmentJobs(ctx, "jobAssignment.reassignTechnician", input.jobIds, async (parents, tx) => {
        const plans = [];
        for (const job of parents) {
          const previous = await readJobAssignments(job, tx);
          if (!previous.ids.includes(input.fromTechId)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "The source technician must be assigned to every selected job. Refresh the selection before retrying." });
          }
          const ids = Array.from(new Set([...previous.ids.filter(id => id !== input.fromTechId), input.toTechId]));
          const leadId = previous.leadId === input.fromTechId ? input.toTechId : previous.leadId;
          plans.push({ job, ids, leadId });
        }
        for (const plan of plans) await replaceJobAssignments(ctx, plan.job, tx, plan.ids, plan.leadId);
        return { reassigned: parents.length };
      });
    }),
});
