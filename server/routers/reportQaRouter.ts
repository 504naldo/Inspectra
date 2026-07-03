import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { getJobForCompany } from "../tenantGuards";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import {
  reports, jobs, sites, customerOrgs, deficiencies,
} from "../../drizzle/schema";
import { logActivity } from "../activityLogger";

async function getRawDb() {
  return db.getDb ? db.getDb() : null;
}

const QA_FILTER_VALUES = ["all", "generated", "corrections_required", "approved", "sent", "archived", "field_complete"] as const;
type QaFilter = (typeof QA_FILTER_VALUES)[number];

const REPORT_STATUSES = ["generated", "corrections_required", "approved", "sent", "archived"] as const;

export const reportQaRouter = router({

  // ── Queue list ────────────────────────────────────────────────────────────
  listQueue: officeProcedure
    .input(z.object({
      filter: z.enum(QA_FILTER_VALUES).default("generated"),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const rawDb = await getRawDb();

      const emptyCounts: Record<string, number> = {
        all: 0, generated: 0, corrections_required: 0, approved: 0, sent: 0, archived: 0, field_complete: 0,
      };
      if (!rawDb) return { items: [], counts: emptyCounts };

      // 1. All job IDs for this company
      const companyJobRows = await rawDb
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.companyId, companyId));
      const companyJobIds = companyJobRows.map((j) => j.id);
      if (companyJobIds.length === 0) return { items: [], counts: emptyCounts };

      // 2. Status counts for tab badges
      const statusCountRows = await rawDb
        .select({ status: reports.status, cnt: sql<number>`count(*)` })
        .from(reports)
        .where(inArray(reports.jobId, companyJobIds))
        .groupBy(reports.status);

      const counts: Record<string, number> = { ...emptyCounts };
      for (const r of statusCountRows) {
        counts[r.status] = Number(r.cnt);
        counts.all += Number(r.cnt);
      }

      // 3. Open deficiency counts per job (single batch query)
      const openDefRows = await rawDb
        .select({ jobId: deficiencies.jobId, cnt: sql<number>`count(*)` })
        .from(deficiencies)
        .where(and(
          inArray(deficiencies.jobId, companyJobIds),
          inArray(deficiencies.status, ["open", "in_progress"]),
        ))
        .groupBy(deficiencies.jobId);
      const openDefMap = new Map<number, number>(openDefRows.map((r) => [r.jobId, Number(r.cnt)]));

      // 4. "Field complete" — completed jobs with no report at all
      let fieldCompleteItems: ReturnType<typeof makeFieldCompleteItem>[] = [];
      if (input.filter === "field_complete" || input.filter === "all") {
        const reportedJobRows = await rawDb
          .select({ jobId: reports.jobId })
          .from(reports)
          .where(inArray(reports.jobId, companyJobIds));
        const reportedJobIdSet = new Set(reportedJobRows.map((r) => r.jobId));

        const completedJobRows = await rawDb
          .select({
            id: jobs.id,
            jobNumber: jobs.jobNumber,
            jobType: jobs.jobType,
            siteName: sites.name,
            customerName: customerOrgs.name,
            leadTechnicianId: jobs.leadTechnicianId,
            completedAt: jobs.completedAt,
          })
          .from(jobs)
          .leftJoin(sites, eq(jobs.siteId, sites.id))
          .leftJoin(customerOrgs, eq(jobs.customerOrgId, customerOrgs.id))
          .where(and(eq(jobs.companyId, companyId), eq(jobs.status, "completed")))
          .orderBy(desc(jobs.completedAt))
          .limit(50);

        fieldCompleteItems = completedJobRows
          .filter((j) => !reportedJobIdSet.has(j.id))
          .map((j) => makeFieldCompleteItem(j, openDefMap));

        counts.field_complete = fieldCompleteItems.length;
      }

      // 5. Fetch reports with joined job/site/customer data
      let reportItems: ReturnType<typeof makeReportItem>[] = [];
      if (input.filter !== "field_complete") {
        const statusWhere = (REPORT_STATUSES as readonly string[]).includes(input.filter)
          ? eq(reports.status, input.filter as typeof REPORT_STATUSES[number])
          : undefined;

        const rows = await rawDb
          .select({
            reportId: reports.id,
            jobId: jobs.id,
            jobNumber: jobs.jobNumber,
            jobType: jobs.jobType,
            reportNumber: reports.reportNumber,
            siteName: sites.name,
            customerName: customerOrgs.name,
            leadTechnicianId: jobs.leadTechnicianId,
            completedAt: jobs.completedAt,
            reportCreatedAt: reports.createdAt,
            reportUpdatedAt: reports.updatedAt,
            reportStatus: reports.status,
            deficiencyCount: reports.deficiencyCount,
            fileUrl: reports.fileUrl,
            qaNote: reports.qaNote,
            approvedAt: reports.approvedAt,
          })
          .from(reports)
          .innerJoin(jobs, eq(reports.jobId, jobs.id))
          .leftJoin(sites, eq(jobs.siteId, sites.id))
          .leftJoin(customerOrgs, eq(jobs.customerOrgId, customerOrgs.id))
          .where(
            statusWhere
              ? and(inArray(reports.jobId, companyJobIds), statusWhere)
              : inArray(reports.jobId, companyJobIds),
          )
          .orderBy(desc(reports.updatedAt))
          .limit(input.limit);

        reportItems = rows.map((r) => makeReportItem(r, openDefMap));
      }

      // 6. Resolve technician names (fetch only unique IDs)
      const allItems = [...reportItems, ...fieldCompleteItems];
      const techIds = Array.from(new Set(
        allItems.map((i) => i.technicianId).filter((id): id is number => id != null),
      ));
      const techMap = new Map<number, string>();
      for (const id of techIds) {
        const u = await db.getUserById(id);
        if (u?.name) techMap.set(id, u.name);
      }

      const items = allItems.map((item) => ({
        ...item,
        technicianName: item.technicianId != null ? (techMap.get(item.technicianId) ?? null) : null,
        technicianId: undefined,
      }));

      return { items, counts };
    }),

  // ── Mark needs review (submit to QA queue) ────────────────────────────────
  markNeedsReview: officeProcedure
    .input(z.object({ reportId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const report = await db.getReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwns(report.jobId, ctx.user.companyId!);
      await db.updateReport(input.reportId, { status: "generated" });
      void logActivity({
        ctx, entityType: "report", entityId: input.reportId,
        eventType: "report.submitted_for_review",
        title: `Report ${report.reportNumber} submitted for QA review`,
        relatedEntityType: "job", relatedEntityId: report.jobId,
      });
      return { success: true };
    }),

  // ── Approve ───────────────────────────────────────────────────────────────
  approveReport: officeProcedure
    .input(z.object({
      reportId: z.number().int().positive(),
      note: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const report = await db.getReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwns(report.jobId, ctx.user.companyId!);
      await db.updateReport(input.reportId, {
        status: "approved",
        approvedAt: new Date(),
        approvedById: ctx.user.id,
        ...(input.note ? { qaNote: input.note } : {}),
      });
      void logActivity({
        ctx, entityType: "report", entityId: input.reportId,
        eventType: "report.approved",
        title: `Report ${report.reportNumber} approved`,
        description: input.note ?? null,
        newValue: "approved",
        oldValue: report.status,
        relatedEntityType: "job", relatedEntityId: report.jobId,
      });
      return { success: true };
    }),

  // ── Request corrections ───────────────────────────────────────────────────
  requestCorrections: officeProcedure
    .input(z.object({
      reportId: z.number().int().positive(),
      note: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const report = await db.getReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwns(report.jobId, ctx.user.companyId!);
      await db.updateReport(input.reportId, { status: "corrections_required", qaNote: input.note });
      void logActivity({
        ctx, entityType: "report", entityId: input.reportId,
        eventType: "report.corrections_requested",
        title: `Corrections requested for report ${report.reportNumber}`,
        description: input.note,
        newValue: "corrections_required",
        oldValue: report.status,
        relatedEntityType: "job", relatedEntityId: report.jobId,
      });
      return { success: true };
    }),

  // ── Mark sent ─────────────────────────────────────────────────────────────
  markSent: officeProcedure
    .input(z.object({
      reportId: z.number().int().positive(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const report = await db.getReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwns(report.jobId, ctx.user.companyId!);
      await db.updateReport(input.reportId, {
        status: "sent",
        ...(input.note ? { qaNote: input.note } : {}),
      });
      void logActivity({
        ctx, entityType: "report", entityId: input.reportId,
        eventType: "report.marked_sent",
        title: `Report ${report.reportNumber} marked as sent`,
        description: input.note ?? null,
        newValue: "sent",
        oldValue: report.status,
        relatedEntityType: "job", relatedEntityId: report.jobId,
      });
      return { success: true };
    }),

  // ── Archive ───────────────────────────────────────────────────────────────
  archiveReport: officeProcedure
    .input(z.object({
      reportId: z.number().int().positive(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const report = await db.getReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwns(report.jobId, ctx.user.companyId!);
      await db.updateReport(input.reportId, {
        status: "archived",
        ...(input.note ? { qaNote: input.note } : {}),
      });
      void logActivity({
        ctx, entityType: "report", entityId: input.reportId,
        eventType: "report.archived",
        title: `Report ${report.reportNumber} archived`,
        description: input.note ?? null,
        newValue: "archived",
        oldValue: report.status,
        relatedEntityType: "job", relatedEntityId: report.jobId,
      });
      return { success: true };
    }),

  // ── Add / update QA note ──────────────────────────────────────────────────
  addQaNote: officeProcedure
    .input(z.object({
      reportId: z.number().int().positive(),
      note: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const report = await db.getReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwns(report.jobId, ctx.user.companyId!);
      await db.updateReport(input.reportId, { qaNote: input.note });
      void logActivity({
        ctx, entityType: "report", entityId: input.reportId,
        eventType: "report.qa_note_added",
        title: `QA note added to report ${report.reportNumber}`,
        description: input.note,
        relatedEntityType: "job", relatedEntityId: report.jobId,
      });
      return { success: true };
    }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertCompanyOwns(jobId: number, companyId: number) {
  // Delegate to the shared scoped getter so job-ownership enforcement lives in
  // one place (tenantGuards); the local name is kept for the existing callers.
  await getJobForCompany(jobId, companyId);
}

function makeReportItem(
  r: {
    reportId: number;
    jobId: number;
    jobNumber: string;
    jobType: string | null;
    reportNumber: string;
    siteName: string | null | undefined;
    customerName: string | null | undefined;
    leadTechnicianId: number | null | undefined;
    completedAt: Date | null | undefined;
    reportCreatedAt: Date;
    reportUpdatedAt: Date;
    reportStatus: string;
    deficiencyCount: number | null | undefined;
    fileUrl: string | null | undefined;
    qaNote: string | null | undefined;
    approvedAt: Date | null | undefined;
  },
  openDefMap: Map<number, number>,
) {
  return {
    reportId: r.reportId,
    jobId: r.jobId,
    jobNumber: r.jobNumber,
    jobType: r.jobType,
    reportNumber: r.reportNumber,
    siteName: r.siteName ?? null,
    customerName: r.customerName ?? null,
    technicianId: r.leadTechnicianId ?? null,
    technicianName: null as string | null, // resolved after
    completedAt: r.completedAt ?? null,
    generatedAt: r.reportCreatedAt,
    status: r.reportStatus,
    deficiencyCount: r.deficiencyCount ?? 0,
    openDeficiencyCount: openDefMap.get(r.jobId) ?? 0,
    fileUrl: r.fileUrl ?? null,
    qaNote: r.qaNote ?? null,
    approvedAt: r.approvedAt ?? null,
    lastUpdated: r.reportUpdatedAt,
    href: `/admin/report-qa`,
    qaHref: `/admin/qa/${r.jobId}`,
    jobHref: `/admin/jobs/${r.jobId}`,
  };
}

function makeFieldCompleteItem(
  j: {
    id: number;
    jobNumber: string;
    jobType: string | null;
    siteName: string | null | undefined;
    customerName: string | null | undefined;
    leadTechnicianId: number | null | undefined;
    completedAt: Date | null | undefined;
  },
  openDefMap: Map<number, number>,
) {
  return {
    reportId: null as number | null,
    jobId: j.id,
    jobNumber: j.jobNumber,
    jobType: j.jobType,
    reportNumber: null as string | null,
    siteName: j.siteName ?? null,
    customerName: j.customerName ?? null,
    technicianId: j.leadTechnicianId ?? null,
    technicianName: null as string | null,
    completedAt: j.completedAt ?? null,
    generatedAt: null as Date | null,
    status: "field_complete" as const,
    deficiencyCount: 0,
    openDeficiencyCount: openDefMap.get(j.id) ?? 0,
    fileUrl: null as string | null,
    qaNote: null as string | null,
    approvedAt: null as Date | null,
    lastUpdated: j.completedAt ?? new Date(),
    href: `/admin/qa/${j.id}`,
    qaHref: `/admin/qa/${j.id}`,
    jobHref: `/admin/jobs/${j.id}`,
  };
}
