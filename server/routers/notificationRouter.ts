import { z } from "zod";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { eq, and, desc, inArray, lt, sql } from "drizzle-orm";
import {
  notifications,
  jobs, reports, deficiencies, approvedWork, invoices,
} from "../../drizzle/schema";
import type { InsertNotification } from "../../drizzle/schema";

// ── Alert generation helpers ──────────────────────────────────────────────────

async function getDb() {
  return db.getDb ? db.getDb() : null;
}

// Conditionally create a notification if no undismissed copy with the same
// dedupeKey already exists for this company.
async function maybeCreate(data: InsertNotification & { dedupeKey: string }): Promise<boolean> {
  const exists = await db.hasUndismissedNotification(data.companyId, data.dedupeKey);
  if (exists) return false;
  await db.createNotification(data);
  return true;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const notificationRouter = router({

  list: officeProcedure
    .input(z.object({
      filter: z.enum(["all", "unread", "critical", "urgent", "warning", "info"]).default("all"),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      return db.getNotificationsForCompany(companyId, {
        unreadOnly: input.filter === "unread",
        severity: ["critical", "urgent", "warning", "info"].includes(input.filter)
          ? input.filter
          : undefined,
        limit: input.limit,
      });
    }),

  getUnreadCount: officeProcedure.query(async ({ ctx }) => {
    return db.getUnreadNotificationCount(ctx.user.companyId!);
  }),

  markRead: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.markNotificationRead(input.id, ctx.user.companyId!);
      return { success: true };
    }),

  markAllRead: officeProcedure.mutation(async ({ ctx }) => {
    await db.markAllNotificationsRead(ctx.user.companyId!);
    return { success: true };
  }),

  dismiss: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.dismissNotification(input.id, ctx.user.companyId!);
      return { success: true };
    }),

  /**
   * Generate (or refresh) operational alerts.
   * Queries live data and creates a notification for each actionable item
   * unless an undismissed notification with the same dedupeKey already exists.
   * Returns the count of newly created notifications.
   */
  generateAlerts: officeProcedure.mutation(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const rawDb = await getDb();
    if (!rawDb) return { created: 0 };

    let created = 0;
    const now = new Date();

    // ── 1. Overdue jobs ───────────────────────────────────────────────────────
    const overdueJobs = await rawDb
      .select({ id: jobs.id, title: jobs.title, jobNumber: jobs.jobNumber, scheduledDate: jobs.scheduledDate, priority: jobs.priority })
      .from(jobs)
      .where(and(
        eq(jobs.companyId, companyId),
        lt(jobs.scheduledDate, now),
        inArray(jobs.status, ["pending", "scheduled", "in_progress"]),
      ))
      .limit(20);

    for (const j of overdueJobs) {
      const daysOverdue = j.scheduledDate
        ? Math.floor((now.getTime() - new Date(j.scheduledDate).getTime()) / 86_400_000)
        : 0;
      const severity = daysOverdue >= 7 ? "urgent" : "warning";
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "job",
        entityId: j.id,
        type: "job_overdue",
        severity,
        title: `Overdue: ${j.title}`,
        message: `${j.jobNumber} — scheduled ${daysOverdue}d ago and not yet completed.`,
        href: `/admin/jobs/${j.id}`,
        dedupeKey: `job_overdue:${j.id}`,
      });
      if (ok) created++;
    }

    // ── 2. Reports pending review ──────────────────────────────────────────────
    const pendingReports = await rawDb
      .select({ id: reports.id, reportNumber: reports.reportNumber, title: reports.title, jobId: reports.jobId })
      .from(reports)
      .where(and(
        inArray(reports.status, ["draft", "generated"]),
      ))
      .limit(20);

    // Filter by companyId — reports don't have companyId directly; we join through jobs
    // Since this is a lightweight check, we'll filter after joining
    const jobIds = Array.from(new Set(pendingReports.map((r) => r.jobId)));
    let companyJobIds = new Set<number>();
    if (jobIds.length > 0) {
      const compJobs = await rawDb
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.companyId, companyId), inArray(jobs.id, jobIds)));
      companyJobIds = new Set(compJobs.map((j) => j.id));
    }

    for (const r of pendingReports.filter((r) => companyJobIds.has(r.jobId))) {
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "report",
        entityId: r.id,
        type: "report_pending_review",
        severity: "info",
        title: `Report pending review: ${r.reportNumber}`,
        message: r.title,
        href: `/admin/reports`,
        dedupeKey: `report_pending_review:${r.id}`,
      });
      if (ok) created++;
    }

    // ── 3. Approved Work: ready to schedule ───────────────────────────────────
    const readyToSchedule = await rawDb
      .select({ id: approvedWork.id, approvedScope: approvedWork.approvedScope })
      .from(approvedWork)
      .where(and(
        eq(approvedWork.companyId, companyId),
        inArray(approvedWork.status, ["approved", "ready_to_schedule"]),
      ))
      .limit(20);

    for (const aw of readyToSchedule) {
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "approved_work",
        entityId: aw.id,
        type: "approved_work_ready",
        severity: "warning",
        title: "Approved Work ready to schedule",
        message: aw.approvedScope?.slice(0, 120) ?? `Record #${aw.id}`,
        href: `/admin/approved-work/${aw.id}`,
        dedupeKey: `approved_work_ready:${aw.id}`,
      });
      if (ok) created++;
    }

    // ── 4. Approved Work: awaiting parts ──────────────────────────────────────
    const awaitingParts = await rawDb
      .select({ id: approvedWork.id, approvedScope: approvedWork.approvedScope })
      .from(approvedWork)
      .where(and(
        eq(approvedWork.companyId, companyId),
        inArray(approvedWork.status, ["parts_required", "awaiting_parts"]),
      ))
      .limit(20);

    for (const aw of awaitingParts) {
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "approved_work",
        entityId: aw.id,
        type: "approved_work_awaiting_parts",
        severity: "info",
        title: "Approved Work awaiting parts",
        message: aw.approvedScope?.slice(0, 120) ?? `Record #${aw.id}`,
        href: `/admin/approved-work/${aw.id}`,
        dedupeKey: `approved_work_awaiting_parts:${aw.id}`,
      });
      if (ok) created++;
    }

    // ── 5. Overdue invoices ───────────────────────────────────────────────────
    const overdueInvoices = await rawDb
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total, balanceDue: invoices.balanceDue })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.status, "overdue"),
      ))
      .limit(20);

    for (const inv of overdueInvoices) {
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "invoice",
        entityId: inv.id,
        type: "invoice_overdue",
        severity: "urgent",
        title: `Invoice overdue: ${inv.invoiceNumber}`,
        message: `Balance due: $${parseFloat(String(inv.balanceDue ?? inv.total ?? "0")).toFixed(2)}`,
        href: `/admin/invoices/${inv.id}`,
        dedupeKey: `invoice_overdue:${inv.id}`,
      });
      if (ok) created++;
    }

    // ── 6. Sage export errors ─────────────────────────────────────────────────
    const sageErrors = await rawDb
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.sageExportStatus, "error"),
      ))
      .limit(10);

    for (const inv of sageErrors) {
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "invoice",
        entityId: inv.id,
        type: "sage_export_error",
        severity: "warning",
        title: `Sage export failed: ${inv.invoiceNumber}`,
        message: "The Sage export for this invoice encountered an error. Please retry.",
        href: `/admin/invoices/${inv.id}`,
        dedupeKey: `sage_export_error:${inv.id}`,
      });
      if (ok) created++;
    }

    // ── 7. Invoices ready for Sage export ─────────────────────────────────────
    const sageReady = await rawDb
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.sageExportStatus, "pending"),
        inArray(invoices.status, ["approved", "paid", "partial"]),
      ))
      .limit(5); // cap to avoid flooding

    if (sageReady.length > 0) {
      // Single summary notification instead of one per invoice
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "invoice",
        entityId: sageReady[0].id,
        type: "invoice_ready_for_sage",
        severity: "info",
        title: `${sageReady.length} invoice${sageReady.length > 1 ? "s" : ""} ready for Sage export`,
        message: sageReady.map((i) => i.invoiceNumber).join(", "),
        href: `/admin/invoices`,
        dedupeKey: `invoice_ready_for_sage:batch:${sageReady.map((i) => i.id).sort().join("-")}`,
      });
      if (ok) created++;
    }

    // ── 8. Critical open deficiencies ─────────────────────────────────────────
    // Deficiencies joined through jobs for company scoping
    const criticalDefs = await rawDb
      .select({
        id: deficiencies.id,
        title: deficiencies.title,
        jobId: deficiencies.jobId,
        createdAt: deficiencies.createdAt,
      })
      .from(deficiencies)
      .innerJoin(jobs, eq(deficiencies.jobId, jobs.id))
      .where(and(
        eq(jobs.companyId, companyId),
        eq(deficiencies.severity, "critical"),
        inArray(deficiencies.status, ["open", "in_progress"]),
      ))
      .limit(15);

    for (const d of criticalDefs) {
      const ok = await maybeCreate({
        companyId,
        roleTarget: "office",
        entityType: "deficiency",
        entityId: d.id,
        type: "deficiency_critical",
        severity: "critical",
        title: `Critical deficiency: ${d.title}`,
        message: `Open critical deficiency linked to job #${d.jobId}`,
        href: `/admin/jobs/${d.jobId}`,
        dedupeKey: `deficiency_critical:${d.id}`,
      });
      if (ok) created++;
    }

    return { created };
  }),
});
