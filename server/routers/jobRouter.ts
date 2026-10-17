import { buildTemplatePacketData } from "../canonicalTemplateReport";
import {
  toCustomerSafeJob,
  toCustomerSafeSite,
  toCustomerSafeDeficiency,
} from "../customerDto";
import { assertJobAccess } from "../tenantGuards";
import { assertCustomerOrgAccess } from "../tenantGuards";
import { z } from "zod";
import { eq, and, inArray, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure, technicianProcedure, } from "../_core/trpc";
import * as db from "../db";
import { withAudit } from "../db";
import { withMutableJob } from "../jobWriteTransaction";
import { assertJobTechnician, syncLinkedWorkOrders } from "../jobLifecycleSync";
import { getJobForCompany, assertSiteCompany, assertCustomerOrgCompany, } from "../tenantGuards";
import { logActivity } from "../activityLogger";
import { JOB_FINALIZED_IMMUTABLE } from "../../shared/_core/errors";
import { populateJobFireAlarmChecklist } from "../fireAlarmRouter";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import * as schema from "../../drizzle/schema";
import { sendJobScheduledEmail } from "../emailService";
import { ENV } from "../_core/env";
import { sendPushToUser } from "../pushService";

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

// Job router
const jobRouter = router({
  listByCompany: officeProcedure
    .input(
      z.object({
        companyId: z.number(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      return db.getJobsByCompany(input.companyId, input.status);
    }),

  listByTechnician: technicianProcedure
    .input(
      z.object({
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return db.getJobsByTechnician(ctx.user.id, input.status);
    }),

  listByCustomerOrg: protectedProcedure
    .input(z.object({ customerOrgId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCustomerOrgAccess(input.customerOrgId, ctx.user);
      const jobs = await db.getJobsByCustomerOrg(input.customerOrgId);
      return ctx.user.role === "customer" ? jobs.map(toCustomerSafeJob) : jobs;
    }),

  listBySite: officeProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      return db.getJobsBySite(input.siteId);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const job = await assertJobAccess(input.id, ctx.user);
      return ctx.user.role === "customer" ? toCustomerSafeJob(job) : job;
    }),

  getWithDetails: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const job = await assertJobAccess(input.id, ctx.user);
      const site = await db.getSiteById(job.siteId);
      const customerOrg = await db.getCustomerOrgById(job.customerOrgId);
      const devices = await db.getDevicesBySite(job.siteId);
      const inspectionResults = await db.getInspectionResultsByJob(job.id);
      const deficiencies = await db.getDeficienciesByJob(job.id);
      const stats = await db.getInspectionStats(job.id);
      if (ctx.user.role === "customer")
        return {
          job: toCustomerSafeJob(job),
          site: site ? toCustomerSafeSite(site) : site,
          customerOrg: customerOrg
            ? ({
                id: customerOrg.id,
                name: customerOrg.name,
              } as typeof customerOrg)
            : customerOrg,
          devices: [],
          inspectionResults: [],
          deficiencies: deficiencies.map(toCustomerSafeDeficiency),
          stats,
        };
      return {
        job,
        site,
        customerOrg,
        devices,
        inspectionResults,
        deficiencies,
        stats,
      };
    }),

  create: officeProcedure
    .input(
      z.object({
        companyId: z.number(),
        siteId: z.number(),
        customerOrgId: z.number(),
        assignedTechnicianId: z.number().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        jobType: z
          .enum([
            "annual",
            "semi_annual",
            "quarterly",
            "monthly",
            "service_call",
            "repair",
          ])
          .optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        scheduledDate: z.date().optional(),
        scheduledStartAt: z.date().optional(),
        scheduledEndAt: z.date().optional(),
        scopeOfWork: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Prevent cross-company job creation.
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot create a job for another company.",
        });
      }
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      const customerOrg = await assertCustomerOrgCompany(
        input.customerOrgId,
        ctx.user.companyId!
      );
      // The site/org guards bypass the company check for an admin platform operator,
      // so re-assert the job's refs are internally consistent: a job in companyId
      // must not link a site or customer org from a different company.
      if (
        site.companyId !== input.companyId ||
        customerOrg.companyId !== input.companyId ||
        site.customerOrgId !== input.customerOrgId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Site and customer org must belong to the job's company.",
        });
      }

      const jobNumber = `JOB-${nanoid(12).toUpperCase()}`;

      // Find the last finalized job for this site so we can copy its inspection_results
      const lastJob = await db.getLastCompletedJobForSite(input.siteId);

      // Create the job and (if applicable) pre-fill inspection_results in a single transaction
      const newJob = await withAudit(ctx, "job.create", async tx => {
        // Insert the new job row
        const insertResult = await tx
          .insert(schema.jobs)
          .values({
            ...input,
            jobNumber,
            copiedFromJobId: lastJob?.id ?? null,
          } as schema.InsertJob);
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
            const rows = priorResults.map(r => ({
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
          companyId: input.companyId,
          siteId: input.siteId,
          customerOrgId: input.customerOrgId,
          jobId: newJobId,
          workOrderNumber: `WO-${nanoid(12).toUpperCase()}`,
          title: input.title,
          workType: jobTypeToWorkType(input.jobType),
          status: "pending",
          priority: input.priority ?? "medium",
          scheduledDate: input.scheduledDate ?? null,
          assignedTechnicianIds: input.assignedTechnicianId
            ? [input.assignedTechnicianId]
            : [],
        } as schema.InsertWorkOrder);

        // Re-fetch the new job row to return the same shape as db.createJob
        const fetched = await tx
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.id, newJobId))
          .limit(1);
        const row = fetched[0];
        if (!row)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Job creation failed",
          });
        return row;
      });

      // A visit needs explicit instants; a date alone never invents an 8am visit.
      if (input.scheduledStartAt && input.scheduledEndAt) {
        try {
          const { getValidGoogleToken } = await import("../_core/googleAuth");
          const accessToken = await getValidGoogleToken(ctx.user.id);
          if (accessToken) {
            const { buildEventBody } = await import("./calendarRouter");
            const eventBody = await buildEventBody(newJob.id);
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
              const event = (await response.json()) as { id?: unknown };
              if (typeof event.id !== "string" || !event.id.trim()) throw new Error("Calendar provider returned no event ID");
              await withMutableJob(ctx, "job.create.calendarLink", newJob.id, async current => {
                if (current.googleCalendarEventId || current.scheduledStartAt?.toISOString() !== eventBody.start.dateTime || current.scheduledEndAt?.toISOString() !== eventBody.end.dateTime) {
                  throw new TRPCError({ code: "CONFLICT", message: "The job schedule changed while its calendar event was being created; reconcile the event before retrying." });
                }
                await db.updateJob(newJob.id, {
                  googleCalendarEventId: event.id as string,
                  googleCalendarOwnerId: ctx.user.id,
                  googleCalendarId: "primary",
                });
              });
            } else {
              console.warn(
                "[Calendar] Auto-create event failed:",
                response.status
              );
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
        console.warn(
          "[FireAlarmChecklist] Auto-populate failed for job",
          newJob.id,
          err
        );
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
            if (
              customerOrg?.contactEmail &&
              customerOrg.notifyJobScheduled !== 0
            ) {
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
            console.warn(
              "[email] Failed to send job scheduled notification:",
              err
            );
          }
        })();
      }

      return newJob;
    }),

  // Quick-create an urgent service call and alert all on-call technicians
  // (push + in-app notification) so they can respond immediately.
  createEmergencyCall: officeProcedure
    .input(
      z.object({
        siteId: z.number(),
        description: z.string().min(1),
        callerName: z.string().optional(),
        callerPhone: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      if (site.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The emergency call site must belong to the selected company." });
      }

      const jobNumber = `JOB-${nanoid(12).toUpperCase()}`;
      const title = `Emergency Call - ${site.name}`;
      const noteParts = [input.description];
      if (input.callerName) noteParts.push(`Caller: ${input.callerName}`);
      if (input.callerPhone) noteParts.push(`Phone: ${input.callerPhone}`);

      const newJob = await withAudit(
        ctx,
        "job.createEmergencyCall",
        async tx => {
          const insertResult = await tx.insert(schema.jobs).values({
            companyId: ctx.user.companyId!,
            siteId: input.siteId,
            customerOrgId: site.customerOrgId,
            jobNumber,
            title,
            description: noteParts.join("\n"),
            jobType: "service_call",
            priority: "urgent",
          } as schema.InsertJob);
          const newJobId = Number(insertResult[0].insertId);

          await tx.insert(schema.workOrders).values({
            companyId: ctx.user.companyId!,
            siteId: input.siteId,
            customerOrgId: site.customerOrgId,
            jobId: newJobId,
            workOrderNumber: `WO-${nanoid(12).toUpperCase()}`,
            title,
            workType: "emergency",
            status: "pending",
            priority: "urgent",
          } as schema.InsertWorkOrder);

          const fetched = await tx
            .select()
            .from(schema.jobs)
            .where(eq(schema.jobs.id, newJobId))
            .limit(1);
          const row = fetched[0];
          if (!row)
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Job creation failed",
            });
          return row;
        }
      );

      void logActivity({
        ctx,
        entityType: "job",
        entityId: newJob.id,
        eventType: "created",
        title: `Emergency call: ${title}`,
        description: input.description,
      });

      // Alert every on-call technician — push notification + in-app alert.
      const onCallTechs = await db.getOnCallTechnicians(ctx.user.companyId!);
      for (const tech of onCallTechs) {
        void sendPushToUser(
          tech.id,
          "Emergency Call",
          `${site.name}: ${input.description}`,
          { jobId: String(newJob.id) }
        );
        void db.createNotification({
          companyId: ctx.user.companyId!,
          userId: tech.id,
          roleTarget: "technician",
          entityType: "job",
          entityId: newJob.id,
          type: "emergency_job",
          severity: "critical",
          title: "Emergency Call",
          message: `${site.name}: ${input.description}`,
          href: `/tech/jobs/${newJob.id}`,
        });
      }

      return { ...newJob, notifiedCount: onCallTechs.length };
    }),

  update: officeProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        assignedTechnicianId: z.number().optional(),
        jobType: z
          .enum([
            "annual",
            "semi_annual",
            "quarterly",
            "monthly",
            "service_call",
            "repair",
          ])
          .optional(),
        status: z
          .enum([
            "pending",
            "scheduled",
            "in_progress",
            "completed",
            "cancelled",
          ])
          .optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        scheduledDate: z.date().optional(),
        scheduledStartAt: z.date().nullable().optional(),
        scheduledEndAt: z.date().nullable().optional(),
        scopeOfWork: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const job = await withMutableJob(ctx, "job.update", id, async job => {
        if (input.assignedTechnicianId !== undefined) await assertJobTechnician(job, input.assignedTechnicianId);
        await db.updateJob(id, {
          ...data,
          ...(input.assignedTechnicianId !== undefined && {
            leadTechnicianId: input.assignedTechnicianId, assignedAt: new Date(), assignedByUserId: ctx.user.id,
          }),
        });
        if (input.assignedTechnicianId !== undefined) {
          if (job.leadTechnicianId && job.leadTechnicianId !== input.assignedTechnicianId) await db.removeJobAssignment(id, job.leadTechnicianId);
          await db.removeJobAssignment(id, input.assignedTechnicianId);
          await db.addJobAssignment({ jobId: id, userId: input.assignedTechnicianId, role: "LEAD", assignedByUserId: ctx.user.id });
          const assignments = await db.getJobTechnicians(id);
          await syncLinkedWorkOrders(job, { assignedTechnicianIds: [input.assignedTechnicianId, ...assignments.additional.map(tech => tech.id)] });
        }
        if (input.scheduledDate !== undefined) await syncLinkedWorkOrders(job, { scheduledDate: input.scheduledDate });
        return job;
      });

      if (input.status && input.status !== job?.status) {
        void logActivity({
          ctx,
          entityType: "job",
          entityId: id,
          eventType: "status_changed",
          title: "Job status changed",
          oldValue: job?.status ?? undefined,
          newValue: input.status,
        });
      } else if (input.scheduledDate !== undefined) {
        const oldDate = job?.scheduledDate
          ? new Date(job.scheduledDate).toLocaleDateString("en-CA", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : null;
        const newDate = input.scheduledDate
          ? new Date(input.scheduledDate).toLocaleDateString("en-CA", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : null;
        const verb =
          oldDate && newDate && oldDate !== newDate
            ? "rescheduled"
            : newDate
              ? "scheduled"
              : "updated";
        void logActivity({
          ctx,
          entityType: "job",
          entityId: id,
          eventType: verb === "rescheduled" ? "rescheduled" : "scheduled",
          title:
            verb === "rescheduled"
              ? `Job rescheduled from ${oldDate} to ${newDate}`
              : `Job scheduled for ${newDate ?? "TBD"}`,
          oldValue: oldDate ?? undefined,
          newValue: newDate ?? undefined,
        });
      } else if (Object.keys(data).length > 0) {
        void logActivity({
          ctx,
          entityType: "job",
          entityId: id,
          eventType: "updated",
          title: "Job updated",
        });
      }

      return { success: true };
    }),

  start: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await withMutableJob(ctx, "job.start", input.id, async job => {
        const now = new Date();
        await db.updateJob(input.id, { status: "in_progress", startedAt: now });
        await syncLinkedWorkOrders(job, { status: "in_progress", startedAt: now });
      });
      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.id,
        eventType: "started",
        title: "Job started",
      });
      return { success: true };
    }),

  complete: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const completedNow = new Date();
      const job = await withMutableJob(ctx, "job.complete", input.id, async job => {
        if (job.status !== "in_progress") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only in-progress jobs can be completed" });
        }
        if (!job.techSignatureKey && !job.techSignatureUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Technician signature is required before completing the job." });
        }
        await db.updateJob(input.id, { status: "completed", completedAt: completedNow });
        await syncLinkedWorkOrders(job, { status: "completed", completedAt: completedNow });
        return job;
      });
      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.id,
        eventType: "completed",
        title: "Job completed",
      });

      // Best-effort sync to monthly_service_tracking and service schedule.
      // Never fail job completion if tracker sync has an unexpected issue.
      try {
        const trackerRow = await db.getMonthlyTrackingByLinkedJobId(job.id);
        if (trackerRow) {
          const site = await db.getSiteById(job.siteId);
          const existingBuildingId = trackerRow.buildingId?.trim();
          const siteBuildingId = site?.buildingId?.trim();

          const trackerUpdate: Partial<schema.InsertMonthlyServiceTracking> = {
            status: "completed",
            reportStatus: "pending",
          };

          // Preserve tracker buildingId if already populated.
          if (!existingBuildingId && siteBuildingId) {
            trackerUpdate.buildingId = siteBuildingId;
          }

          await db.updateMonthlyTrackingByLinkedJobId(job.id, trackerUpdate);

          // Advance the service schedule's next due date
          if (trackerRow.serviceScheduleId) {
            const sched = await db.getServiceScheduleById(
              trackerRow.serviceScheduleId
            );
            if (sched) {
              const nextDueAt = addFrequencyToDate(
                completedNow,
                sched.frequency
              );
              await db.updateServiceScheduleCompletion(
                sched.id,
                completedNow,
                nextDueAt
              );
            }
          }
        }
      } catch (trackerErr) {
        console.warn(
          `[MonthlyTracking] Failed to sync completion for job ${job.id}:`,
          trackerErr
        );
      }

      return { success: true };
    }),

  saveSignatures: technicianProcedure
    .input(
      z.object({
        jobId: z.number(),
        /** Base64-encoded PNG of the technician's signature */
        techSignatureBase64: z.string().min(1),
        /** Optional: base64-encoded PNG of the on-site contact's signature */
        contactSignatureBase64: z.string().min(1).optional(),
        /** Optional: name of the on-site contact who signed */
        contactName: z.string().min(1).max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await withMutableJob(ctx, "job.saveSignatures", input.jobId, async () => {
        const now = new Date();
        const techResult = await storagePut(
          `signatures/${nanoid()}.png`,
          Buffer.from(input.techSignatureBase64, "base64"),
          "image/png"
        );

        const updates: Parameters<typeof db.updateJob>[1] = {
          techSignatureUrl: techResult.url,
          techSignatureKey: techResult.key,
          techSignedAt: now,
        };

        if (input.contactSignatureBase64 && input.contactName) {
          const contactResult = await storagePut(
            `signatures/${nanoid()}.png`,
            Buffer.from(input.contactSignatureBase64, "base64"),
            "image/png"
          );
          updates.contactSignatureUrl = contactResult.url;
          updates.contactSignatureKey = contactResult.key;
          updates.contactName = input.contactName;
          updates.contactSignedAt = now;
        }

        await db.updateJob(input.jobId, updates);
      });
      return { success: true };
    }),

  search: officeProcedure
    .input(
      z.object({
        companyId: z.number(),
        query: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      return db.searchJobs(input.companyId, input.query);
    }),

  getSummary: technicianProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertJobAccess(input.id, ctx.user);
      const { getJobSummary } = await import("../jobSummary");
      return getJobSummary(input.id);
    }),

  // Multi-tech assignment procedures
  assignLeadTechnician: officeProcedure
    .input(
      z.object({
        jobId: z.number(),
        technicianId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const technician = await withMutableJob(ctx, "job.assignLeadTechnician", input.jobId, async job => {
        const technician = await assertJobTechnician(job, input.technicianId);
        if (job.leadTechnicianId && job.leadTechnicianId !== input.technicianId) await db.removeJobAssignment(input.jobId, job.leadTechnicianId);
        await db.removeJobAssignment(input.jobId, input.technicianId);
        await db.addJobAssignment({ jobId: input.jobId, userId: input.technicianId, role: "LEAD", assignedByUserId: ctx.user.id });
        await db.updateJob(input.jobId, {
          leadTechnicianId: input.technicianId, assignedTechnicianId: input.technicianId, assignedAt: new Date(), assignedByUserId: ctx.user.id,
        });
        const assignments = await db.getJobTechnicians(input.jobId);
        await syncLinkedWorkOrders(job, { assignedTechnicianIds: Array.from(new Set([input.technicianId, ...assignments.additional.map(tech => tech.id)])) });
        return technician;
      });
      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "assigned",
        title: `Lead technician assigned: ${technician.name ?? "Unknown"}`,
      });
      void sendPushToUser(
        input.technicianId,
        "New Job Assigned",
        `You've been assigned as lead technician for job #${input.jobId}.`,
        { jobId: String(input.jobId) }
      );

    return { success: true };
  }),

  addAdditionalTechnician: officeProcedure.input(z.object({
    jobId: z.number(),
    technicianId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await withMutableJob(ctx, "job.addAdditionalTechnician", input.jobId, async job => {
      if (job.leadTechnicianId === input.technicianId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lead technician cannot be added as additional" });
      }
      await assertJobTechnician(job, input.technicianId);
      if (await db.isUserAssignedToJob(input.jobId, input.technicianId)) return;
      await db.addJobAssignment({ jobId: input.jobId, userId: input.technicianId, role: "ASSIST", assignedByUserId: ctx.user.id });
      const assignments = await db.getJobTechnicians(input.jobId);
      await syncLinkedWorkOrders(job, { assignedTechnicianIds: [job.leadTechnicianId, ...assignments.additional.map(tech => tech.id)].filter((id): id is number => id != null) });
    });
    void sendPushToUser(input.technicianId, "New Job Assigned", `You've been assigned as additional technician for job #${input.jobId}.`,
        { jobId: String(input.jobId) }
      );

      return { success: true };
    }),

  removeAdditionalTechnician: officeProcedure
    .input(
      z.object({
        jobId: z.number(),
        technicianId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await withMutableJob(ctx, "job.removeAdditionalTechnician", input.jobId, async job => {
        if (job.leadTechnicianId === input.technicianId || job.assignedTechnicianId === input.technicianId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Use the lead assignment workflow to remove the lead technician." });
        }
        await db.removeJobAssignment(input.jobId, input.technicianId);
        const assignments = await db.getJobTechnicians(input.jobId);
        await syncLinkedWorkOrders(job, { assignedTechnicianIds: [job.leadTechnicianId, ...assignments.additional.map(tech => tech.id)].filter((id): id is number => id != null) });
      });
      return { success: true };
    }),

  setTechnicians: officeProcedure
    .input(
      z.object({
        jobId: z.number(),
        leadTechnicianId: z.number(),
        additionalTechnicianIds: z.array(z.number()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const additionalIds = Array.from(new Set(input.additionalTechnicianIds.filter(id => id !== input.leadTechnicianId)));
      const leadTech = await withMutableJob(ctx, "job.setTechnicians", input.jobId, async job => {
        const leadTech = await assertJobTechnician(job, input.leadTechnicianId);
        for (const techId of additionalIds) await assertJobTechnician(job, techId);
        await db.updateJob(input.jobId, { leadTechnicianId: input.leadTechnicianId, assignedTechnicianId: input.leadTechnicianId, assignedAt: new Date(), assignedByUserId: ctx.user.id });
        await db.clearJobAssignments(input.jobId);
        await db.addJobAssignment({ jobId: input.jobId, userId: input.leadTechnicianId, role: "LEAD", assignedByUserId: ctx.user.id });
        for (const techId of additionalIds) {
          await db.addJobAssignment({ jobId: input.jobId, userId: techId, role: "ASSIST", assignedByUserId: ctx.user.id });
        }
        await syncLinkedWorkOrders(job, { assignedTechnicianIds: [input.leadTechnicianId, ...additionalIds] });
        return leadTech;
      });
      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "assignment_changed",
        title: `Technicians set: ${leadTech.name ?? "Unknown"} (lead)${additionalIds.length > 0 ? ` + ${additionalIds.length} additional` : ""}`, });

    return { success: true };
  }),

  unassignJob: officeProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await withMutableJob(ctx, "job.unassignJob", input.jobId, async job => {
      await db.updateJob(input.jobId, { leadTechnicianId: null, assignedTechnicianId: null, assignedAt: null, assignedByUserId: null, status: "pending" });
      await db.clearJobAssignments(input.jobId);
      await syncLinkedWorkOrders(job, { assignedTechnicianIds: [], status: "pending" });
    });
    void logActivity({ ctx, entityType: "job", entityId: input.jobId, eventType: "updated",
      title: "Job unassigned", });
    return { success: true };
  }),

  getJobTechnicians: protectedProcedure.input(z.object({
    jobId: z.number(),
  })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer') {
      const job = await db.getJobById(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      if (ctx.user.customerOrgId == null || ctx.user.customerOrgId !== job.customerOrgId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    } else {
      await getJobForCompany(input.jobId, ctx.user.companyId!);
    }
    return db.getJobTechnicians(input.jobId);
  }),

  clone: officeProcedure.input(z.object({
    jobId: z.number(),
    scheduledDate: z.date().optional(),
  })).mutation(async ({ input, ctx }) => {
    const authorizedSource = await getJobForCompany(input.jobId, ctx.user.companyId!);
    const jobNumber = `JOB-${nanoid(12).toUpperCase()}`;
    const newJob = await withAudit(ctx, "job.clone", async tx => {
      const [sourceJob] = await tx.select().from(schema.jobs).where(eq(schema.jobs.id, input.jobId)).for("update");
      if (!sourceJob) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (sourceJob.companyId !== authorizedSource.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (!sourceJob.finalizedAt && !["completed", "finalized"].includes(sourceJob.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed or finalized jobs can be re-inspected" });
      }
      const site = await assertSiteCompany(sourceJob.siteId, sourceJob.companyId);
      const org = await assertCustomerOrgCompany(sourceJob.customerOrgId, sourceJob.companyId);
      if (site.companyId !== sourceJob.companyId || org.companyId !== sourceJob.companyId || site.customerOrgId !== sourceJob.customerOrgId) {
        throw new TRPCError({ code: "CONFLICT", message: "Source job links are inconsistent; reconcile them before cloning." });
      }
      if (sourceJob.assignedTechnicianId) await assertJobTechnician(sourceJob, sourceJob.assignedTechnicianId);
      const newJob = await db.createJob({
        companyId: sourceJob.companyId, siteId: sourceJob.siteId, customerOrgId: sourceJob.customerOrgId,
        assignedTechnicianId: sourceJob.assignedTechnicianId ?? undefined,
        title: `Re-inspect: ${sourceJob.title}`, description: sourceJob.description ?? undefined,
        jobType: sourceJob.jobType ?? undefined, priority: sourceJob.priority ?? undefined,
        scheduledDate: input.scheduledDate, jobNumber,
      });
      await db.createWorkOrder({
        companyId: sourceJob.companyId, siteId: sourceJob.siteId, customerOrgId: sourceJob.customerOrgId,
        jobId: newJob.id, workOrderNumber: `WO-${nanoid(12).toUpperCase()}`,
        title: `Re-inspect: ${sourceJob.title}`, workType: jobTypeToWorkType(sourceJob.jobType),
        status: "pending", priority: sourceJob.priority ?? "medium", scheduledDate: input.scheduledDate ?? null,
        assignedTechnicianIds: sourceJob.assignedTechnicianId ? [sourceJob.assignedTechnicianId] : [],
      });
      await populateJobFireAlarmChecklist(newJob.id, newJob.siteId);
      return newJob;
    });

      return { newJobId: newJob.id, jobNumber };
    }),

  delete: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const job = await withMutableJob(ctx, "job.delete", input.id, async job => {
        await db.deleteJobCascade(input.id);
        return job;
      });

      // Best-effort: remove Google Calendar event
      if (job.googleCalendarEventId && job.googleCalendarOwnerId === ctx.user.id && job.googleCalendarId) {
        try {
          const { getValidGoogleToken } = await import("../_core/googleAuth");
          const accessToken = await getValidGoogleToken(ctx.user.id);
          if (accessToken) {
            await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(job.googleCalendarId)}/events/${encodeURIComponent(job.googleCalendarEventId)}?sendUpdates=all`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
          }
        } catch (err) {
          console.warn(
            "[Calendar] Failed to delete event for job",
            input.id,
            err
          );
        }
      }

      return { success: true };
    }),

  getScheduleSummary: officeProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      const jobs = await db.getJobsByCompany(input.companyId);
      const now = new Date();
      const overdue = jobs.filter((j: any) => {
        if (!j.scheduledDate) return false;
        if (["completed", "finalized"].includes(j.status)) return false;
        return new Date(j.scheduledDate) < now;
      });
      const upcoming = jobs.filter((j: any) => {
        if (!j.scheduledDate) return false;
        if (["completed", "finalized"].includes(j.status)) return false;
        const d = new Date(j.scheduledDate);
        return d >= now;
      });
      return { overdue, upcoming, all: jobs };
    }),

  // ── Offline Job Packet ────────────────────────────────────────────────────────
  // Returns a technician-safe snapshot of everything needed to work offline.
  // Technicians must be assigned; admin/office can always fetch for testing.
  getOfflineJobPacket: technicianProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const rawDb = await db.getDb();
      if (!rawDb)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const job = await getJobForCompany(input.jobId, ctx.user.companyId!);
      const companyId = job.companyId;

      // Technicians must be assigned to the job
      if (ctx.user.role === "technician") {
        const isAssigned = await db.isUserAssignedToJob(
          input.jobId,
          ctx.user.id
        );
        if (!isAssigned)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not assigned to this job",
          });
      }

      // Parallel-fetch all packet data
      const [site, customerOrg, devices, workSiteInfo, currentDeficiencies] =
        await Promise.all([
          db.getSiteById(job.siteId),
          db.getCustomerOrgById(job.customerOrgId),
          db.getDevicesBySite(job.siteId),
          db.getWorkSiteInfoBySiteId(job.siteId),
          db.getDeficienciesByJob(input.jobId),
        ]);

      // Previous unresolved deficiencies from last completed job at this site
      let previousUnresolved: Awaited<
        ReturnType<typeof db.getDeficienciesByJob>
      > = [];
      const lastJob = await db.getLastCompletedJobForSite(job.siteId);
      if (lastJob && lastJob.id !== input.jobId) {
        const prevDefs = await db.getDeficienciesByJob(lastJob.id);
        previousUnresolved = prevDefs.filter(
          d => d.status === "open" || d.status === "in_progress"
        );
      }

      const templateResponses = await rawDb.select().from(schema.inspectionTemplateResponses)
        .where(eq(schema.inspectionTemplateResponses.jobId, job.id));
      // Sealed jobs use captured questions only, including archived/deleted definitions.
      const assignments = job.finalizedAt ? [] : await rawDb
        .select({
          templateId: schema.inspectionTemplateAssignments.templateId,
          jobType: schema.inspectionTemplateAssignments.jobType,
          siteId: schema.inspectionTemplateAssignments.siteId,
          customerOrgId: schema.inspectionTemplateAssignments.customerOrgId,
        })
        .from(schema.inspectionTemplateAssignments)
        .where(
          and(
            eq(schema.inspectionTemplateAssignments.companyId, companyId),
            eq(schema.inspectionTemplateAssignments.isActive, 1)
          )
        );

      const matchingIds = new Set<number>();
      for (const a of assignments) {
        const jobTypeOk = !a.jobType || a.jobType === job.jobType;
        const siteOk = !a.siteId || a.siteId === job.siteId;
        const orgOk = !a.customerOrgId || a.customerOrgId === job.customerOrgId;
        if (jobTypeOk && siteOk && orgOk) matchingIds.add(a.templateId);
      }

      const templates =
        matchingIds.size > 0
          ? await rawDb
              .select()
              .from(schema.inspectionTemplates)
              .where(
                and(
                  eq(schema.inspectionTemplates.companyId, companyId),
                  eq(schema.inspectionTemplates.status, "active"),
                  inArray(
                    schema.inspectionTemplates.id,
                    Array.from(matchingIds)
                  )
                )
              )
          : [];

      const [templateSections, templateItems] =
        templates.length > 0
          ? await Promise.all([
              rawDb
                .select()
                .from(schema.inspectionTemplateSections)
                .where(
                  and(
                    eq(schema.inspectionTemplateSections.companyId, companyId),
                    inArray(
                      schema.inspectionTemplateSections.templateId,
                      templates.map(t => t.id)
                    )
                  )
                )
                .orderBy(
                  asc(schema.inspectionTemplateSections.templateId),
                  asc(schema.inspectionTemplateSections.sortOrder)
                ),
              rawDb
                .select()
                .from(schema.inspectionTemplateItems)
                .where(
                  and(
                    eq(schema.inspectionTemplateItems.companyId, companyId),
                    inArray(
                      schema.inspectionTemplateItems.templateId,
                      templates.map(t => t.id)
                    )
                  )
                )
                .orderBy(
                  asc(schema.inspectionTemplateItems.sectionId),
                  asc(schema.inspectionTemplateItems.sortOrder)
                ),
            ])
          : [[], []];

      const templateData = buildTemplatePacketData({ job, templates, sections: templateSections, items: templateItems, responses: templateResponses, actorId: ctx.user.id });

      // lastUpdatedAt = latest of job.updatedAt and site.updatedAt
      const timestamps: Date[] = [new Date(job.updatedAt)];
      if (site?.updatedAt) timestamps.push(new Date(site.updatedAt));
      for (const record of [...templates, ...templateSections, ...templateItems, ...templateResponses]) {
        if (record.updatedAt && Number.isFinite(new Date(record.updatedAt).getTime())) timestamps.push(new Date(record.updatedAt));
      }
      const lastUpdatedAt = new Date(
        Math.max(...timestamps.map(t => t.getTime()))
      );

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
          ? {
              id: site.id,
              name: site.name,
              address: site.address,
              city: site.city,
              state: site.state,
              postalCode: site.postalCode,
              phone: (site as any).phone,
              notes: site.notes,
            }
          : null,
        customerOrg: customerOrg
          ? {
              name: customerOrg.name,
              phone: (customerOrg as any).phone ?? null,
            }
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
        ...templateData,
        deficiencies: currentDeficiencies.filter(
          d => d.status === "open" || d.status === "in_progress"
        ),
        previousUnresolvedDeficiencies: previousUnresolved,
        lastUpdatedAt: lastUpdatedAt.toISOString(),
        cacheVersion: lastUpdatedAt.getTime().toString(),
      };
    }),

  recordCustomerDecline: officeProcedure
    .input(
      z.object({
        jobId: z.number(),
        reason: z.string().max(1000).optional(),
        customerName: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await withMutableJob(ctx, "job.recordCustomerDecline", input.jobId, async () => {
        await db.updateJob(input.jobId, {
          customerDeclinedAt: new Date(), customerDeclinedReason: input.reason ?? null,
          customerDeclinedByName: input.customerName ?? null,
        });
      });

      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "updated",
        title: `Customer declined service${input.customerName ? ` (${input.customerName})` : ""}`,
      });

      return { success: true };
    }),
});

export { jobRouter };
