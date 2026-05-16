import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, technicianProcedure, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function reportNumber(jobId: number) {
  return `QA-${jobId}-${Date.now().toString(36).toUpperCase()}`;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const technicianRouter = router({

  /**
   * submitForQA — Signals the office that a job is ready for report generation.
   * Creates a report record with status='generated' (or promotes a draft),
   * then fires a notification to the office/admin team.
   * Does NOT complete the job — job.complete() (with signature) remains the
   * formal completion step.
   */
  submitForQA: technicianProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "No company context" });

      const job = await db.getJobById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if ((job as any).finalizedAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Job is finalized and cannot be modified" });
      }
      if (job.status !== "in_progress") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Job must be in_progress to submit for QA (current status: ${job.status})`,
        });
      }

      // Find existing report for this job
      const existingReports = await db.getReportsByJob(input.jobId);
      let reportId: number;

      const qaReport = existingReports.find(r =>
        r.status === "generated" || r.status === "draft" || r.status === "corrections_required"
      );

      if (qaReport) {
        // Promote draft → generated (or re-submit corrections_required → generated)
        if (qaReport.status !== "generated") {
          await db.updateReport(qaReport.id, { status: "generated" });
        }
        reportId = qaReport.id;
      } else {
        // Create a new report record
        const created = await db.createReport({
          jobId: input.jobId,
          generatedById: ctx.user.id,
          reportNumber: reportNumber(input.jobId),
          title: `${job.title} — Field Submission`,
          status: "generated",
        });
        reportId = created.id;
      }

      // Notify office/admin team (deduplicated per job per day)
      const dedupeKey = `qa-submit-${input.jobId}-${todayStr()}`;
      const notifExists = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!notifExists) {
        await db.createNotification({
          companyId,
          type: "report_pending_review",
          severity: "info",
          title: `Job ready for QA: ${job.title}`,
          message: `${ctx.user.name ?? "A technician"} submitted ${job.jobNumber} for QA review.`,
          entityType: "job",
          entityId: input.jobId,
          roleTarget: "office",
          href: `/admin/report-qa`,
          dedupeKey,
        });
      }

      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "technician.submitForQA",
        title: `Submitted for QA review`,
        description: `Technician ${ctx.user.name ?? ctx.user.id} submitted job ${job.jobNumber} for QA`,
        relatedEntityType: "report",
        relatedEntityId: reportId,
      });

      return { success: true as const, reportId };
    }),
});
