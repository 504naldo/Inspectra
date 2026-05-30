import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { withAudit } from "../db";
import { logActivity } from "../activityLogger";
import { JOB_FINALIZED_IMMUTABLE } from "../../shared/_core/errors";
import { populateJobFireAlarmChecklist } from "../fireAlarmRouter";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import * as schema from "../../drizzle/schema";
import { sendJobScheduledEmail } from "../emailService";
import { ENV } from "../_core/env";

function addFrequencyToDate(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case "monthly":    d.setMonth(d.getMonth() + 1); break;
    case "quarterly":  d.setMonth(d.getMonth() + 3); break;
    case "semi_annual":d.setMonth(d.getMonth() + 6); break;
    default:           d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}

// ── Work-order helpers ────────────────────────────────────────────────────────

function jobTypeToWorkType(
  jobType: string | null | undefined
): schema.WorkOrder["workType"] {
  switch (jobType) {
    case "service_call": return "service_call";
    case "repair":       return "repair";
    default:             return "inspection";
  }
}

/** Fire-and-forget work-order sync — never throws. */
async function syncWorkOrder(jobId: number, patch: Partial<schema.InsertWorkOrder>) {
  try {
    const wo = await db.getWorkOrderByJob(jobId);
    if (wo) await db.updateWorkOrder(wo.id, patch);
  } catch (err) {
    console.warn(`[WorkOrder] Failed to sync for job ${jobId}:`, err);
  }
}

// Job router
const jobRouter = router({
  listByCompany: officeProcedure.input(z.object({ 
    companyId: z.number(),
    status: z.string().optional()
  })).query(async ({ input }) => {
    return db.getJobsByCompany(input.companyId, input.status);
  }),
  
  listByTechnician: technicianProcedure.input(z.object({
    status: z.string().optional()
  })).query(async ({ input, ctx }) => {
    return db.getJobsByTechnician(ctx.user.id, input.status);
  }),
  
  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== input.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.getJobsByCustomerOrg(input.customerOrgId);
  }),
  
  listBySite: officeProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getJobsBySite(input.siteId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const job = await db.getJobById(input.id);
    if (!job) return null;
    // Customer can only see their own jobs
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== job.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return job;
  }),
  
  getWithDetails: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const job = await db.getJobById(input.id);
    if (!job) return null;
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== job.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    const site = await db.getSiteById(job.siteId);
    const customerOrg = await db.getCustomerOrgById(job.customerOrgId);
    const devices = await db.getDevicesBySite(job.siteId);
    const inspectionResults = await db.getInspectionResultsByJob(job.id);
    const deficiencies = await db.getDeficienciesByJob(job.id);
    const stats = await db.getInspectionStats(job.id);
    return { job, site, customerOrg, devices, inspectionResults, deficiencies, stats };
  }),
  
  create: officeProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    customerOrgId: z.number(),
    assignedTechnicianId: z.number().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    jobType: z.enum(['annual', 'semi_annual', 'quarterly', 'monthly', 'service_call', 'repair']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    scheduledDate: z.date().optional(),
  })).mutation(async ({ input, ctx }) => {
    // Prevent cross-company job creation.
    if (input.companyId !== ctx.user.companyId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot create a job for another company." });
    }

    const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`;

    // Find the last finalized job for this site so we can copy its inspection_results
    const lastJob = await db.getLastCompletedJobForSite(input.siteId);

    // Create the job and (if applicable) pre-fill inspection_results in a single transaction
    const newJob = await withAudit(ctx, "job.create", async (tx) => {
      // Insert the new job row
      const insertResult = await tx
        .insert(schema.jobs)
        .values({ ...input, jobNumber, copiedFromJobId: lastJob?.id ?? null } as schema.InsertJob);
      const newJobId = Number(insertResult[0].insertId);

      // Pre-fill inspection_results from prior job if one exists
      if (lastJob) {
        const priorResults = await tx
          .select({
            deviceId: schema.inspectionResults.deviceId,
            walkOrder: schema.inspectionResults.walkOrder,
          })
          .from(schema.inspectionResults)
          .where(eq(schema.inspectionResults.jobId, lastJob.id));

        if (priorResults.length > 0) {
          const rows = priorResults.map((r) => ({
            jobId: newJobId,
            deviceId: r.deviceId,
            technicianId: null as number | null,
            result: "not_tested" as const,
            notes: null as string | null,
            testedAt: null as Date | null,
            syncedAt: null as Date | null,
            walkOrder: r.walkOrder,
            carriedForward: 1,
          }));
          await tx.insert(schema.inspectionResults).values(rows);
        }
      }

      // Create work order in the same transaction
      await tx.insert(schema.workOrders).values({
        companyId:            input.companyId,
        siteId:               input.siteId,
        customerOrgId:        input.customerOrgId,
        jobId:                newJobId,
        workOrderNumber:      `WO-${Date.now().toString(36).toUpperCase()}`,
        title:                input.title,
        workType:             jobTypeToWorkType(input.jobType),
        status:               "pending",
        priority:             input.priority ?? "medium",
        scheduledDate:        input.scheduledDate ?? null,
        assignedTechnicianIds: input.assignedTechnicianId ? [input.assignedTechnicianId] : [],
      } as schema.InsertWorkOrder);

      // Re-fetch the new job row to return the same shape as db.createJob
      const fetched = await tx
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, newJobId))
        .limit(1);
      const row = fetched[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Job creation failed" });
      return row;
    });

    // Auto-create Google Calendar event if job has a scheduled date (best-effort)
    if (input.scheduledDate && ctx.user) {
      try {
        const { getValidGoogleToken } = await import("../_core/googleAuth");
        const accessToken = await getValidGoogleToken(ctx.user.id);
        if (accessToken) {
          const startDate = new Date(input.scheduledDate);
          if (startDate.getHours() === 0 && startDate.getMinutes() === 0) {
            startDate.setHours(8, 0, 0, 0);
          }
          const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
          const eventBody = {
            summary: `🔥 Inspection: ${input.title}`,
            start: {
              dateTime: startDate.toISOString(),
              timeZone: "America/Toronto",
            },
            end: {
              dateTime: endDate.toISOString(),
              timeZone: "America/Toronto",
            },
            reminders: {
              useDefault: false,
              overrides: [
                { method: "popup", minutes: 60 },
                { method: "popup", minutes: 1440 },
              ],
            },
            colorId: "11",
          };
          const response = await fetch(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventBody),
            }
          );
          if (response.ok) {
            const event = (await response.json()) as { id: string };
            await db.updateJob(newJob.id, { googleCalendarEventId: event.id });
          } else {
            console.warn("[Calendar] Auto-create event failed:", response.status);
          }
        }
      } catch (error) {
        // Calendar event creation is best-effort — don't fail the job creation
        console.warn("[Calendar] Auto-create event error:", error);
      }
    }

    // Auto-populate fire alarm checklist (best-effort)
    try {
      await populateJobFireAlarmChecklist(newJob.id, input.siteId);
    } catch (err) {
      console.warn("[FireAlarmChecklist] Auto-populate failed for job", newJob.id, err);
    }

    void logActivity({
      ctx,
      entityType: "job",
      entityId: newJob.id,
      eventType: "created",
      title: `Job created: ${input.title}`,
      description: input.scheduledDate
        ? `Scheduled for ${new Date(input.scheduledDate).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}`
        : undefined,
    });

    // Notify customer org contact when job is scheduled (best-effort)
    const scheduledDateForEmail = input.scheduledDate;
    const customerOrgIdForEmail = input.customerOrgId;
    if (scheduledDateForEmail && customerOrgIdForEmail) {
      void (async () => {
        try {
          const [site, customerOrg] = await Promise.all([
            db.getSiteById(input.siteId),
            db.getCustomerOrgById(customerOrgIdForEmail),
          ]);
          if (customerOrg?.contactEmail) {
            await sendJobScheduledEmail({
              to: customerOrg.contactEmail,
              customerName: customerOrg.contactName || customerOrg.name,
              siteName: site?.name ?? input.title,
              jobNumber: newJob.jobNumber,
              scheduledDate: scheduledDateForEmail,
              portalUrl: ENV.appUrl,
            });
          }
        } catch (err) {
          console.warn("[email] Failed to send job scheduled notification:", err);
        }
      })();
    }

    return newJob;
  }),

  update: officeProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    assignedTechnicianId: z.number().optional(),
    jobType: z.enum(['annual', 'semi_annual', 'quarterly', 'monthly', 'service_call', 'repair']).optional(),
    status: z.enum(['pending', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    scheduledDate: z.date().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    // Block updates to finalized jobs
    const job = await db.getJobById(input.id);
    if (job?.finalizedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: JOB_FINALIZED_IMMUTABLE });
    }
    const { id, ...data } = input;
    await db.updateJob(id, data);
    // Best-effort: sync scheduledDate to work order
    if (input.scheduledDate !== undefined) {
      void syncWorkOrder(id, { scheduledDate: input.scheduledDate });
    }

    if (input.status && input.status !== job?.status) {
      void logActivity({ ctx, entityType: "job", entityId: id, eventType: "status_changed",
        title: "Job status changed", oldValue: job?.status ?? undefined, newValue: input.status });
    } else if (input.scheduledDate !== undefined) {
      const oldDate = job?.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : null;
      const newDate = input.scheduledDate ? new Date(input.scheduledDate).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : null;
      const verb = oldDate && newDate && oldDate !== newDate ? "rescheduled" : (newDate ? "scheduled" : "updated");
      void logActivity({ ctx, entityType: "job", entityId: id, eventType: verb === "rescheduled" ? "rescheduled" : "scheduled",
        title: verb === "rescheduled" ? `Job rescheduled from ${oldDate} to ${newDate}` : `Job scheduled for ${newDate ?? "TBD"}`,
        oldValue: oldDate ?? undefined, newValue: newDate ?? undefined });
    } else if (Object.keys(data).length > 0) {
      void logActivity({ ctx, entityType: "job", entityId: id, eventType: "updated", title: "Job updated" });
    }

    return { success: true };
  }),

  start: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const job = await db.getJobById(input.id);
    if (job?.finalizedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: JOB_FINALIZED_IMMUTABLE });
    }
    const now = new Date();
    await db.updateJob(input.id, { status: 'in_progress', startedAt: now });
    void syncWorkOrder(input.id, { status: "in_progress", startedAt: now });
    void logActivity({ ctx, entityType: "job", entityId: input.id, eventType: "started", title: "Job started" });
    return { success: true };
  }),

  complete: technicianProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const job = await db.getJobById(input.id);
    if (!job) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    }
    if (job.finalizedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: JOB_FINALIZED_IMMUTABLE });
    }
    if (job.status !== 'in_progress') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only in-progress jobs can be completed' });
    }
    if (!job.techSignatureUrl) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Technician signature is required before completing the job.' });
    }
    const completedNow = new Date();
    await db.updateJob(input.id, { status: 'completed', completedAt: completedNow });
    void syncWorkOrder(input.id, { status: "completed", completedAt: completedNow });
    void logActivity({ ctx, entityType: "job", entityId: input.id, eventType: "completed", title: "Job completed" });

    // Best-effort sync to monthly_service_tracking and service schedule.
    // Never fail job completion if tracker sync has an unexpected issue.
    try {
      const trackerRow = await db.getMonthlyTrackingByLinkedJobId(job.id);
      if (trackerRow) {
        const site = await db.getSiteById(job.siteId);
        const existingBuildingId = trackerRow.buildingId?.trim();
        const siteBuildingId = site?.buildingId?.trim();

        const trackerUpdate: Partial<schema.InsertMonthlyServiceTracking> = {
          status: 'completed',
          reportStatus: 'pending',
        };

        // Preserve tracker buildingId if already populated.
        if (!existingBuildingId && siteBuildingId) {
          trackerUpdate.buildingId = siteBuildingId;
        }

        await db.updateMonthlyTrackingByLinkedJobId(job.id, trackerUpdate);

        // Advance the service schedule's next due date
        if (trackerRow.serviceScheduleId) {
          const sched = await db.getServiceScheduleById(trackerRow.serviceScheduleId);
          if (sched) {
            const nextDueAt = addFrequencyToDate(completedNow, sched.frequency);
            await db.updateServiceScheduleCompletion(sched.id, completedNow, nextDueAt);
          }
        }
      }
    } catch (trackerErr) {
      console.warn(`[MonthlyTracking] Failed to sync completion for job ${job.id}:`, trackerErr);
    }

    return { success: true };
  }),

  saveSignatures: technicianProcedure.input(z.object({
    jobId: z.number(),
    /** Base64-encoded PNG of the technician's signature */
    techSignatureBase64: z.string().min(1),
  })).mutation(async ({ input }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    if (job.finalizedAt) throw new TRPCError({ code: 'CONFLICT', message: JOB_FINALIZED_IMMUTABLE });

    const now = new Date();
    const techResult = await storagePut(
      `signatures/${nanoid()}.png`,
      Buffer.from(input.techSignatureBase64, "base64"),
      "image/png"
    );

    await db.updateJob(input.jobId, {
      techSignatureUrl: techResult.url,
      techSignedAt: now,
    });
    return { success: true };
  }),
  
  search: officeProcedure.input(z.object({
    companyId: z.number(),
    query: z.string()
  })).query(async ({ input }) => {
    return db.searchJobs(input.companyId, input.query);
  }),
  
  getSummary: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const { getJobSummary } = await import('../jobSummary');
    const summary = await getJobSummary(input.id);
    
    // Customer can only see their own job summaries
    const job = await db.getJobById(input.id);
    if (ctx.user.role === 'customer' && job && ctx.user.customerOrgId !== job.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    
    return summary;
  }),
  
  // Multi-tech assignment procedures
  assignLeadTechnician: officeProcedure.input(z.object({
    jobId: z.number(),
    technicianId: z.number()
  })).mutation(async ({ input, ctx }) => {
    // Verify technician exists and is active
    const technician = await db.getUserById(input.technicianId);
    if (!technician || !['technician', 'admin', 'office'].includes(technician.role) || !technician.isActive) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid technician' });
    }
    
    await db.updateJob(input.jobId, {
      leadTechnicianId: input.technicianId,
      assignedAt: new Date(),
      assignedByUserId: ctx.user.id
    });
    void syncWorkOrder(input.jobId, { assignedTechnicianIds: [input.technicianId] });
    void logActivity({ ctx, entityType: "job", entityId: input.jobId, eventType: "assigned",
      title: `Lead technician assigned: ${technician.name ?? "Unknown"}` });

    return { success: true };
  }),

  addAdditionalTechnician: officeProcedure.input(z.object({
    jobId: z.number(),
    technicianId: z.number()
  })).mutation(async ({ input, ctx }) => {
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    
    // Cannot add lead as additional
    if (job.leadTechnicianId === input.technicianId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lead technician cannot be added as additional' });
    }
    
    // Verify technician exists and is active
    const technician = await db.getUserById(input.technicianId);
    if (!technician || !['technician', 'admin', 'office'].includes(technician.role) || !technician.isActive) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid technician' });
    }
    
    await db.addJobAssignment({
      jobId: input.jobId,
      userId: input.technicianId,
      role: 'ASSIST',
      assignedByUserId: ctx.user.id
    });
    
    return { success: true };
  }),
  
  removeAdditionalTechnician: officeProcedure.input(z.object({
    jobId: z.number(),
    technicianId: z.number()
  })).mutation(async ({ input }) => {
    await db.removeJobAssignment(input.jobId, input.technicianId);
    return { success: true };
  }),
  
  setTechnicians: officeProcedure.input(z.object({
    jobId: z.number(),
    leadTechnicianId: z.number(),
    additionalTechnicianIds: z.array(z.number())
  })).mutation(async ({ input, ctx }) => {
    // Verify lead technician
    const leadTech = await db.getUserById(input.leadTechnicianId);
    if (!leadTech || !['technician', 'admin', 'office'].includes(leadTech.role) || !leadTech.isActive) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid lead technician' });
    }
    
    // Remove lead from additional list if present
    const additionalIds = input.additionalTechnicianIds.filter(id => id !== input.leadTechnicianId);
    
    // Verify all additional technicians
    for (const techId of additionalIds) {
      const tech = await db.getUserById(techId);
      if (!tech || !['technician', 'admin', 'office'].includes(tech.role) || !tech.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid technician: ${techId}` });
      }
    }
    
    // Update lead
    await db.updateJob(input.jobId, {
      leadTechnicianId: input.leadTechnicianId,
      assignedAt: new Date(),
      assignedByUserId: ctx.user.id
    });
    
    // Clear existing additional technicians
    await db.clearJobAssignments(input.jobId);
    
    // Add new additional technicians
    for (const techId of additionalIds) {
      await db.addJobAssignment({
        jobId: input.jobId,
        userId: techId,
        role: 'ASSIST',
        assignedByUserId: ctx.user.id
      });
    }
    void syncWorkOrder(input.jobId, {
      assignedTechnicianIds: [input.leadTechnicianId, ...additionalIds],
    });
    void logActivity({ ctx, entityType: "job", entityId: input.jobId, eventType: "assignment_changed",
      title: `Technicians set: ${leadTech.name ?? "Unknown"} (lead)${additionalIds.length > 0 ? ` + ${additionalIds.length} additional` : ""}` });

    return { success: true };
  }),

  unassignJob: officeProcedure.input(z.object({
    jobId: z.number()
  })).mutation(async ({ input, ctx }) => {
    const job = await db.getJobById(input.jobId);
    if (job?.finalizedAt) {
      throw new TRPCError({ code: 'CONFLICT', message: JOB_FINALIZED_IMMUTABLE });
    }
    await db.updateJob(input.jobId, {
      leadTechnicianId: null,
      assignedAt: null,
      assignedByUserId: null,
      status: 'pending'
    });
    await db.clearJobAssignments(input.jobId);
    void logActivity({ ctx, entityType: "job", entityId: input.jobId, eventType: "updated",
      title: "Job unassigned" });
    return { success: true };
  }),

  getJobTechnicians: protectedProcedure.input(z.object({
    jobId: z.number()
  })).query(async ({ input }) => {
    return db.getJobTechnicians(input.jobId);
  }),

  clone: officeProcedure.input(z.object({
    jobId: z.number(),
    scheduledDate: z.date().optional(),
  })).mutation(async ({ input, ctx }) => {
    // Load the source job
    const sourceJob = await db.getJobById(input.jobId);
    if (!sourceJob) throw new TRPCError({ code: 'NOT_FOUND', message: 'Source job not found' });

    // Only allow cloning finalized or completed jobs
    if (!['completed', 'finalized'].includes(sourceJob.status)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only completed or finalized jobs can be re-inspected' });
    }

    // Generate a new job number
    const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`;

    // Create the new draft job copying key fields from the source
    const newJob = await db.createJob({
      companyId: sourceJob.companyId,
      siteId: sourceJob.siteId,
      customerOrgId: sourceJob.customerOrgId,
      assignedTechnicianId: sourceJob.assignedTechnicianId ?? undefined,
      title: `Re-inspect: ${sourceJob.title}`,
      description: sourceJob.description ?? undefined,
      jobType: sourceJob.jobType ?? undefined,
      priority: sourceJob.priority ?? undefined,
      scheduledDate: input.scheduledDate,
      jobNumber,
    });
    await withAudit(ctx, 'job.clone', async () => {});

    // Best-effort: create work order for the cloned job
    try {
      await db.createWorkOrder({
        companyId:            sourceJob.companyId,
        siteId:               sourceJob.siteId,
        customerOrgId:        sourceJob.customerOrgId,
        jobId:                newJob.id,
        workOrderNumber:      `WO-${Date.now().toString(36).toUpperCase()}`,
        title:                `Re-inspect: ${sourceJob.title}`,
        workType:             jobTypeToWorkType(sourceJob.jobType),
        status:               "pending",
        priority:             (sourceJob.priority ?? "medium") as schema.InsertWorkOrder["priority"],
        scheduledDate:        input.scheduledDate ?? null,
        assignedTechnicianIds: sourceJob.assignedTechnicianId ? [sourceJob.assignedTechnicianId] : [],
      });
    } catch (err) {
      console.warn("[WorkOrder] Failed to create WO for cloned job", newJob.id, err);
    }

    // Auto-populate fire alarm checklist (best-effort)
    try {
      await populateJobFireAlarmChecklist(newJob.id, newJob.siteId);
    } catch (err) {
      console.warn("[FireAlarmChecklist] Auto-populate failed for cloned job", newJob.id, err);
    }

    return { newJobId: newJob.id, jobNumber };
  }),

  delete: officeProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const job = await db.getJobById(input.id);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    if (job.finalizedAt) throw new TRPCError({ code: 'CONFLICT', message: JOB_FINALIZED_IMMUTABLE });

    // Best-effort: remove Google Calendar event
    if (job.googleCalendarEventId && ctx.user) {
      try {
        const { getValidGoogleToken } = await import("../_core/googleAuth");
        const accessToken = await getValidGoogleToken(ctx.user.id);
        if (accessToken) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${job.googleCalendarEventId}?sendUpdates=all`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
          );
        }
      } catch (err) {
        console.warn('[Calendar] Failed to delete event for job', input.id, err);
      }
    }

    await withAudit(ctx, 'job.delete', async () => {
      await db.deleteJobCascade(input.id);
    });
    return { success: true };
  }),

  getScheduleSummary: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    const jobs = await db.getJobsByCompany(input.companyId);
    const now = new Date();
    const overdue = jobs.filter((j: any) => {
      if (!j.scheduledDate) return false;
      if (['completed', 'finalized'].includes(j.status)) return false;
      return new Date(j.scheduledDate) < now;
    });
    const upcoming = jobs.filter((j: any) => {
      if (!j.scheduledDate) return false;
      if (['completed', 'finalized'].includes(j.status)) return false;
      const d = new Date(j.scheduledDate);
      return d >= now;
    });
    return { overdue, upcoming, all: jobs };
  }),

  // ── Offline Job Packet ────────────────────────────────────────────────────────
  // Returns a technician-safe snapshot of everything needed to work offline.
  // Technicians must be assigned; admin/office can always fetch for testing.
  getOfflineJobPacket: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const rawDb = await db.getDb();
      if (!rawDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const job = await db.getJobById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      // Technicians must be assigned to the job
      if (ctx.user.role === "technician") {
        const isAssigned = await db.isUserAssignedToJob(input.jobId, ctx.user.id);
        if (!isAssigned) throw new TRPCError({ code: "FORBIDDEN", message: "Not assigned to this job" });
      }

      // Parallel-fetch all packet data
      const [site, customerOrg, devices, workSiteInfo, currentDeficiencies] = await Promise.all([
        db.getSiteById(job.siteId),
        db.getCustomerOrgById(job.customerOrgId),
        db.getDevicesBySite(job.siteId),
        db.getWorkSiteInfoBySiteId(job.siteId),
        db.getDeficienciesByJob(input.jobId),
      ]);

      // Previous unresolved deficiencies from last completed job at this site
      let previousUnresolved: Awaited<ReturnType<typeof db.getDeficienciesByJob>> = [];
      const lastJob = await db.getLastCompletedJobForSite(job.siteId);
      if (lastJob && lastJob.id !== input.jobId) {
        const prevDefs = await db.getDeficienciesByJob(lastJob.id);
        previousUnresolved = prevDefs.filter((d) => d.status === "open" || d.status === "in_progress");
      }

      // Inspection template list for this job (metadata only — no sections/items in v1)
      const assignments = await rawDb
        .select({
          templateId: schema.inspectionTemplateAssignments.templateId,
          jobType: schema.inspectionTemplateAssignments.jobType,
          siteId: schema.inspectionTemplateAssignments.siteId,
          customerOrgId: schema.inspectionTemplateAssignments.customerOrgId,
        })
        .from(schema.inspectionTemplateAssignments)
        .where(and(
          eq(schema.inspectionTemplateAssignments.companyId, companyId),
          eq(schema.inspectionTemplateAssignments.isActive, 1),
        ));

      const matchingIds = new Set<number>();
      for (const a of assignments) {
        const jobTypeOk = !a.jobType || a.jobType === job.jobType;
        const siteOk    = !a.siteId || a.siteId === job.siteId;
        const orgOk     = !a.customerOrgId || a.customerOrgId === job.customerOrgId;
        if (jobTypeOk && siteOk && orgOk) matchingIds.add(a.templateId);
      }

      const templates = matchingIds.size > 0
        ? await rawDb
            .select({
              id: schema.inspectionTemplates.id,
              name: schema.inspectionTemplates.name,
              description: schema.inspectionTemplates.description,
              systemType: schema.inspectionTemplates.systemType,
            })
            .from(schema.inspectionTemplates)
            .where(and(
              eq(schema.inspectionTemplates.companyId, companyId),
              eq(schema.inspectionTemplates.status, "active"),
              inArray(schema.inspectionTemplates.id, [...matchingIds]),
            ))
        : [];

      // lastUpdatedAt = latest of job.updatedAt and site.updatedAt
      const timestamps: Date[] = [new Date(job.updatedAt)];
      if (site?.updatedAt) timestamps.push(new Date(site.updatedAt));
      const lastUpdatedAt = new Date(Math.max(...timestamps.map((t) => t.getTime())));

      return {
        job: {
          id: job.id,
          jobNumber: job.jobNumber,
          title: job.title,
          description: job.description,
          jobType: job.jobType,
          status: job.status,
          priority: job.priority,
          scheduledDate: job.scheduledDate,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          finalizedAt: job.finalizedAt,
          technicianNotes: job.technicianNotes,
          siteId: job.siteId,
          customerOrgId: job.customerOrgId,
          companyId: job.companyId,
          updatedAt: job.updatedAt,
        },
        site: site
          ? { id: site.id, name: site.name, address: site.address, city: site.city,
              state: site.state, postalCode: site.postalCode, phone: site.phone, notes: site.notes }
          : null,
        customerOrg: customerOrg
          ? { name: customerOrg.name, phone: (customerOrg as any).phone ?? null }
          : null,
        workSiteInfo: workSiteInfo
          ? {
              siteContactName: workSiteInfo.siteContactName,
              siteContactPhone: workSiteInfo.siteContactPhone,
              accessNotes: workSiteInfo.accessNotes,
              keyLocation: workSiteInfo.keyLocation,
              keyNumber: workSiteInfo.keyNumber,
              lockboxCode: workSiteInfo.lockboxCode,
              parkingNotes: workSiteInfo.parkingNotes,
              serviceEntranceNotes: workSiteInfo.serviceEntranceNotes,
              fireAlarmPanelMake: workSiteInfo.fireAlarmPanelMake,
              fireAlarmPanelModel: workSiteInfo.fireAlarmPanelModel,
              fireAlarmPanelLocation: workSiteInfo.fireAlarmPanelLocation,
              annunciatorLocation: workSiteInfo.annunciatorLocation,
              monitoringCompany: workSiteInfo.monitoringCompany,
              monitoringPhone: workSiteInfo.monitoringPhone,
              monitoringAccount: workSiteInfo.monitoringAccount,
              sprinklerNotes: workSiteInfo.sprinklerNotes,
              backflowNotes: workSiteInfo.backflowNotes,
              emergencyLightingNotes: workSiteInfo.emergencyLightingNotes,
              fireExtinguisherNotes: workSiteInfo.fireExtinguisherNotes,
              generalNotes: workSiteInfo.generalNotes,
            }
          : null,
        devices,
        templates,
        deficiencies: currentDeficiencies.filter((d) => d.status === "open" || d.status === "in_progress"),
        previousUnresolvedDeficiencies: previousUnresolved,
        lastUpdatedAt: lastUpdatedAt.toISOString(),
        cacheVersion: lastUpdatedAt.getTime().toString(),
      };
    }),
});

export { jobRouter };
