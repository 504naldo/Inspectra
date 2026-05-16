import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminOrOfficeProcedure, officeProcedure, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { withAudit } from "../db";
import { finalizeJob } from "../compliance/finalizeJob";
import { buildFinalizationPayload, computeFinalizationHash } from "../compliance/hash";
import { FINALIZATION_HASH_MISMATCH } from "../../shared/_core/errors";
import { eq, and, inArray } from "drizzle-orm";
import {
  sites, customerOrgs, jobs, deficiencies, reports,
  approvedWork, serviceSchedules, siteWorkSiteInfo,
} from "../../drizzle/schema";

async function getRawDb() {
  return db.getDb ? db.getDb() : null;
}

// ── Risk level types ───────────────────────────────────────────────────────────
export type RiskLevel = "compliant" | "watch" | "at_risk" | "critical";

const RISK_ORDER: Record<RiskLevel, number> = { critical: 0, at_risk: 1, watch: 2, compliant: 3 };

// ============================================================
// COMPLIANCE ROUTER
// ============================================================
const complianceRouter = router({
  /**
   * finalizeJob
   * Seals a job as immutable, computes a SHA-256 finalization hash,
   * and transitions status to 'completed'.
   * Requires: admin or lead technician role.
   * clientAssertsSynced must be true.
   */
  finalizeJob: protectedProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        clientAssertsSynced: z.literal(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return withAudit(ctx, "compliance.finalizeJob", async (tx) => {
        return finalizeJob(
          { jobId: input.jobId, clientAssertsSynced: input.clientAssertsSynced },
          ctx,
          tx as unknown as import("drizzle-orm/mysql2").MySql2Database<typeof import("../../drizzle/schema")>
        );
      });
    }),

  /**
   * verifyJobHash
   * Recomputes the finalization hash for a completed job and compares
   * it to the stored value. Returns match status and any mismatch details.
   * Requires: admin role only (audit-sensitive operation).
   */
  verifyJobHash: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const dbConn = await db.getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { jobs: jobsTable } = await import("../../drizzle/schema");
      const { eq: eqOp } = await import("drizzle-orm");

      const jobRows = await dbConn
        .select({
          id: jobsTable.id,
          finalizationHash: jobsTable.finalizationHash,
          finalizedAt: jobsTable.finalizedAt,
          status: jobsTable.status,
        })
        .from(jobsTable)
        .where(eqOp(jobsTable.id, input.jobId));

      if (jobRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Job ${input.jobId} not found` });
      }

      const job = jobRows[0];

      if (!job.finalizationHash || !job.finalizedAt) {
        return {
          jobId: input.jobId,
          isFinalized: false,
          hashMatch: null,
          message: "Job has not been finalized",
        };
      }

      const payload = await buildFinalizationPayload(input.jobId, dbConn as unknown as import("drizzle-orm/mysql2").MySql2Database<typeof import("../../drizzle/schema")>);
      const recomputedHash = computeFinalizationHash(payload);
      const hashMatch = recomputedHash === job.finalizationHash;

      if (!hashMatch) {
        console.error(
          `[compliance.verifyJobHash] HASH MISMATCH for job ${input.jobId}. ` +
          `stored=${job.finalizationHash} recomputed=${recomputedHash}`
        );
      }

      return {
        jobId: input.jobId,
        isFinalized: true,
        hashMatch,
        storedHash: job.finalizationHash,
        recomputedHash,
        finalizedAt: job.finalizedAt,
        message: hashMatch
          ? "Hash verified — record integrity confirmed"
          : FINALIZATION_HASH_MISMATCH,
      };
    }),

  /**
   * getSummary
   * Management-level compliance view: site risk list, deficiency aging,
   * report QA status, approved work compliance, and data quality gaps.
   * Scoped to ctx.user.companyId — never trusts client-supplied companyId.
   */
  getSummary: officeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const rawDb = await getRawDb();
    if (!rawDb) return buildEmptySummary();

    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const d60 = new Date(now.getTime() - 60 * 86_400_000);
    const d90 = new Date(now.getTime() - 90 * 86_400_000);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    // ── 1. All company sites + customer org names ─────────────────────────────
    const allSites = await rawDb
      .select({
        id: sites.id,
        name: sites.name,
        buildingId: sites.buildingId,
        fileNumber: sites.fileNumber,
        city: sites.city,
        customerOrgId: sites.customerOrgId,
        customerOrgName: customerOrgs.name,
        contactName: sites.contactName,
        contactPhone: sites.contactPhone,
      })
      .from(sites)
      .leftJoin(customerOrgs, eq(sites.customerOrgId, customerOrgs.id))
      .where(eq(sites.companyId, companyId));

    const siteIds = allSites.map((s) => s.id);

    // ── 2. All company jobs ───────────────────────────────────────────────────
    const allJobs = await rawDb
      .select({
        id: jobs.id,
        siteId: jobs.siteId,
        status: jobs.status,
        scheduledDate: jobs.scheduledDate,
        completedAt: jobs.completedAt,
      })
      .from(jobs)
      .where(eq(jobs.companyId, companyId));

    const companyJobIds = allJobs.map((j) => j.id);

    // Build: most-recent completed job per site
    const lastCompletedBySite = new Map<number, Date>();
    for (const j of allJobs) {
      if (j.status === "completed" && j.completedAt) {
        const existing = lastCompletedBySite.get(j.siteId);
        const completedAt = new Date(j.completedAt);
        if (!existing || completedAt > existing) {
          lastCompletedBySite.set(j.siteId, completedAt);
        }
      }
    }

    const jobToSite = new Map(allJobs.map((j) => [j.id, j.siteId]));

    // ── 3. Open deficiencies (scoped through jobs) ────────────────────────────
    type DefStat = { count: number; criticalCount: number; oldestCreatedAt: Date };
    const defsBySite = new Map<number, DefStat>();
    let defAging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };

    if (companyJobIds.length > 0) {
      const openDefs = await rawDb
        .select({
          jobId: deficiencies.jobId,
          severity: deficiencies.severity,
          createdAt: deficiencies.createdAt,
        })
        .from(deficiencies)
        .where(
          and(
            inArray(deficiencies.jobId, companyJobIds),
            inArray(deficiencies.status, ["open", "in_progress"]),
          ),
        );

      for (const d of openDefs) {
        const siteId = jobToSite.get(d.jobId);
        if (siteId == null) continue;

        const createdAt = new Date(d.createdAt);
        const cur = defsBySite.get(siteId) ?? { count: 0, criticalCount: 0, oldestCreatedAt: now };
        cur.count++;
        if (d.severity === "critical") cur.criticalCount++;
        if (createdAt < cur.oldestCreatedAt) cur.oldestCreatedAt = createdAt;
        defsBySite.set(siteId, cur);

        // Aging bucket
        const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
        if (ageDays >= 90) defAging.d90plus++;
        else if (ageDays >= 60) defAging.d61_90++;
        else if (ageDays >= 30) defAging.d31_60++;
        else defAging.d0_30++;
      }
    }

    // ── 4. Reports (scoped through jobs) ─────────────────────────────────────
    type ReportStat = { pendingCount: number; approvedNotSentCount: number };
    const reportsBySite = new Map<number, ReportStat>();
    let reportQaSummary = { fieldComplete: 0, needsReview: 0, correctionsRequired: 0, approvedNotSent: 0, sentThisWeek: 0 };

    if (companyJobIds.length > 0) {
      const allReports = await rawDb
        .select({
          jobId: reports.jobId,
          status: reports.status,
          updatedAt: reports.updatedAt,
        })
        .from(reports)
        .where(inArray(reports.jobId, companyJobIds));

      const reportedJobIds = new Set(allReports.map((r) => r.jobId));
      const completedJobIds = new Set(allJobs.filter((j) => j.status === "completed").map((j) => j.id));
      reportQaSummary.fieldComplete = [...completedJobIds].filter((id) => !reportedJobIds.has(id)).length;

      for (const r of allReports) {
        const siteId = jobToSite.get(r.jobId);

        // QA summary
        if (r.status === "generated") reportQaSummary.needsReview++;
        else if (r.status === "corrections_required") reportQaSummary.correctionsRequired++;
        else if (r.status === "approved") reportQaSummary.approvedNotSent++;
        else if (r.status === "sent" && new Date(r.updatedAt) >= weekAgo) reportQaSummary.sentThisWeek++;

        if (siteId == null) continue;
        const cur = reportsBySite.get(siteId) ?? { pendingCount: 0, approvedNotSentCount: 0 };
        if (r.status === "generated" || r.status === "corrections_required") cur.pendingCount++;
        if (r.status === "approved") cur.approvedNotSentCount++;
        reportsBySite.set(siteId, cur);
      }
    }

    // ── 5. Approved work ──────────────────────────────────────────────────────
    const awBySite = new Map<number, number>();
    const awCompliance = { approvedNotScheduled: 0, scheduledNotCompleted: 0, awaitingParts: 0, completedNotInvoiced: 0 };

    const allAw = await rawDb
      .select({ siteId: approvedWork.siteId, status: approvedWork.status, invoiceNumber: approvedWork.invoiceNumber })
      .from(approvedWork)
      .where(eq(approvedWork.companyId, companyId));

    for (const aw of allAw) {
      const active = !["cancelled", "closed", "invoiced"].includes(aw.status);
      if (active && aw.siteId != null) {
        awBySite.set(aw.siteId, (awBySite.get(aw.siteId) ?? 0) + 1);
      }

      if (["approved", "ready_to_schedule"].includes(aw.status)) awCompliance.approvedNotScheduled++;
      else if (["scheduled", "assigned", "in_progress"].includes(aw.status)) awCompliance.scheduledNotCompleted++;
      else if (["parts_required", "awaiting_parts", "parts_ordered", "parts_received"].includes(aw.status)) awCompliance.awaitingParts++;
      else if (["completed", "report_pending"].includes(aw.status) && !aw.invoiceNumber) awCompliance.completedNotInvoiced++;
    }

    // ── 6. Service schedules (nextDueAt) ──────────────────────────────────────
    const nextDueBySite = new Map<number, Date>();
    if (siteIds.length > 0) {
      const schedRows = await rawDb
        .select({ siteId: serviceSchedules.siteId, nextDueAt: serviceSchedules.nextDueAt })
        .from(serviceSchedules)
        .where(and(eq(serviceSchedules.companyId, companyId), eq(serviceSchedules.active, true)));

      for (const s of schedRows) {
        if (!s.nextDueAt) continue;
        const nextDue = new Date(s.nextDueAt);
        const existing = nextDueBySite.get(s.siteId);
        if (!existing || nextDue < existing) nextDueBySite.set(s.siteId, nextDue);
      }
    }

    // ── 7. Work site info presence ────────────────────────────────────────────
    const wsiSiteIds = new Set<number>();
    if (siteIds.length > 0) {
      const wsiRows = await rawDb
        .select({ siteId: siteWorkSiteInfo.siteId })
        .from(siteWorkSiteInfo)
        .where(eq(siteWorkSiteInfo.companyId, companyId));
      for (const w of wsiRows) wsiSiteIds.add(w.siteId);
    }

    // ── Per-site risk computation ─────────────────────────────────────────────
    const siteRiskList = allSites.map((site) => {
      const defs = defsBySite.get(site.id) ?? { count: 0, criticalCount: 0, oldestCreatedAt: now };
      const reps = reportsBySite.get(site.id) ?? { pendingCount: 0, approvedNotSentCount: 0 };
      const awCount = awBySite.get(site.id) ?? 0;
      const lastInspectionDate = lastCompletedBySite.get(site.id) ?? null;
      const nextDue = nextDueBySite.get(site.id) ?? null;
      const hasWsi = wsiSiteIds.has(site.id);

      const overdueDays =
        nextDue && nextDue < now ? Math.floor((now.getTime() - nextDue.getTime()) / 86_400_000) : null;

      const missingDataFlags: string[] = [];
      if (!site.buildingId?.trim()) missingDataFlags.push("no_building_id");
      if (!site.fileNumber?.trim()) missingDataFlags.push("no_file_number");
      if (!hasWsi) missingDataFlags.push("no_work_site_info");
      if (!lastInspectionDate) missingDataFlags.push("no_inspection_history");

      const riskReasons: string[] = [];
      let riskLevel: RiskLevel = "compliant";

      // Critical
      if (defs.criticalCount > 0)
        riskReasons.push(`${defs.criticalCount} critical deficiency${defs.criticalCount > 1 ? "s" : ""}`);
      if (defs.count > 0 && defs.oldestCreatedAt < d90) riskReasons.push("Open deficiency 90+ days");
      if (overdueDays != null && overdueDays >= 60) riskReasons.push(`Inspection overdue ${overdueDays}d`);
      if (riskReasons.length > 0) riskLevel = "critical";

      // At risk
      if (riskLevel === "compliant") {
        if (defs.count > 0 && defs.oldestCreatedAt < d60) riskReasons.push("Open deficiency 60+ days");
        if (overdueDays != null && overdueDays >= 30) riskReasons.push(`Inspection overdue ${overdueDays}d`);
        if (reps.pendingCount >= 2) riskReasons.push(`${reps.pendingCount} reports pending review`);
        if (riskReasons.length > 0) riskLevel = "at_risk";
      }

      // Watch
      if (riskLevel === "compliant") {
        if (defs.count > 0 && defs.oldestCreatedAt < d30) riskReasons.push("Open deficiency 30+ days");
        if (overdueDays != null && overdueDays > 0) riskReasons.push(`Inspection overdue ${overdueDays}d`);
        if (reps.pendingCount === 1) riskReasons.push("1 report pending review");
        if (reps.approvedNotSentCount > 0)
          riskReasons.push(`${reps.approvedNotSentCount} approved report${reps.approvedNotSentCount > 1 ? "s" : ""} not sent`);
        if (awCount > 0) riskReasons.push(`${awCount} open approved work item${awCount > 1 ? "s" : ""}`);
        if (missingDataFlags.length > 0) riskReasons.push("Missing site data");
        if (riskReasons.length > 0) riskLevel = "watch";
      }

      return {
        siteId: site.id,
        siteName: site.name,
        customerOrgName: site.customerOrgName ?? null,
        buildingId: site.buildingId ?? null,
        fileNumber: site.fileNumber ?? null,
        city: site.city ?? null,
        lastInspectionDate,
        nextDueDate: nextDue,
        overdueDays,
        openDeficiencyCount: defs.count,
        criticalDeficiencyCount: defs.criticalCount,
        reportsPendingReviewCount: reps.pendingCount,
        approvedWorkOpenCount: awCount,
        missingDataFlags,
        riskLevel,
        riskReasons,
        href: `/admin/sites/${site.id}`,
      };
    });

    siteRiskList.sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]);

    // ── Overview counts ───────────────────────────────────────────────────────
    const criticalSites   = siteRiskList.filter((s) => s.riskLevel === "critical").length;
    const atRiskSites     = siteRiskList.filter((s) => s.riskLevel === "at_risk").length;
    const watchSites      = siteRiskList.filter((s) => s.riskLevel === "watch").length;
    const compliantSites  = siteRiskList.filter((s) => s.riskLevel === "compliant").length;
    const overdueInspections = siteRiskList.filter((s) => s.overdueDays != null && s.overdueDays > 0).length;

    let totalOpenDefs = 0;
    let totalCriticalDefs = 0;
    for (const [, d] of defsBySite) {
      totalOpenDefs += d.count;
      totalCriticalDefs += d.criticalCount;
    }

    // Data quality counts
    const sitesMissingBuildingId = allSites.filter((s) => !s.buildingId?.trim()).length;
    const sitesMissingFileNumber = allSites.filter((s) => !s.fileNumber?.trim()).length;
    const sitesMissingCustomerOrg = allSites.filter((s) => !s.customerOrgId).length;
    const sitesMissingWorkSiteInfo = allSites.filter((s) => !wsiSiteIds.has(s.id)).length;
    const sitesMissingContacts = allSites.filter((s) => !s.contactName?.trim() && !s.contactPhone?.trim()).length;

    return {
      overview: {
        totalSites: allSites.length,
        compliantSites,
        watchSites,
        atRiskSites,
        criticalSites,
        sitesAtRisk: criticalSites + atRiskSites,
        overdueInspections,
        reportsPendingReview: reportQaSummary.needsReview + reportQaSummary.correctionsRequired,
        reportsApprovedNotSent: reportQaSummary.approvedNotSent,
        openDeficiencies: totalOpenDefs,
        criticalDeficiencies: totalCriticalDefs,
        deficienciesOlderThan30: defAging.d31_60 + defAging.d61_90 + defAging.d90plus,
        deficienciesOlderThan60: defAging.d61_90 + defAging.d90plus,
        deficienciesOlderThan90: defAging.d90plus,
        approvedWorkNotCompleted:
          awCompliance.approvedNotScheduled + awCompliance.scheduledNotCompleted + awCompliance.awaitingParts,
        completedWorkNotInvoiced: awCompliance.completedNotInvoiced,
        sitesMissingWorkSiteInfo,
        sitesMissingBuildingId,
      },
      siteRiskList,
      deficiencyAging: defAging,
      reportQaSummary,
      approvedWorkCompliance: awCompliance,
      dataQualityCompliance: {
        sitesMissingBuildingId,
        sitesMissingFileNumber,
        sitesMissingCustomerOrg,
        sitesMissingWorkSiteInfo,
        sitesMissingContacts,
      },
    };
  }),
});

function buildEmptySummary() {
  return {
    overview: {
      totalSites: 0, compliantSites: 0, watchSites: 0, atRiskSites: 0, criticalSites: 0,
      sitesAtRisk: 0, overdueInspections: 0, reportsPendingReview: 0, reportsApprovedNotSent: 0,
      openDeficiencies: 0, criticalDeficiencies: 0, deficienciesOlderThan30: 0,
      deficienciesOlderThan60: 0, deficienciesOlderThan90: 0, approvedWorkNotCompleted: 0,
      completedWorkNotInvoiced: 0, sitesMissingWorkSiteInfo: 0, sitesMissingBuildingId: 0,
    },
    siteRiskList: [] as ReturnType<typeof buildSiteRiskItem>[],
    deficiencyAging: { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
    reportQaSummary: { fieldComplete: 0, needsReview: 0, correctionsRequired: 0, approvedNotSent: 0, sentThisWeek: 0 },
    approvedWorkCompliance: { approvedNotScheduled: 0, scheduledNotCompleted: 0, awaitingParts: 0, completedNotInvoiced: 0 },
    dataQualityCompliance: {
      sitesMissingBuildingId: 0, sitesMissingFileNumber: 0, sitesMissingCustomerOrg: 0,
      sitesMissingWorkSiteInfo: 0, sitesMissingContacts: 0,
    },
  };
}

// Type helper used only for the empty summary return type
function buildSiteRiskItem() {
  return {
    siteId: 0, siteName: "", customerOrgName: null as string | null,
    buildingId: null as string | null, fileNumber: null as string | null, city: null as string | null,
    lastInspectionDate: null as Date | null, nextDueDate: null as Date | null, overdueDays: null as number | null,
    openDeficiencyCount: 0, criticalDeficiencyCount: 0, reportsPendingReviewCount: 0, approvedWorkOpenCount: 0,
    missingDataFlags: [] as string[], riskLevel: "compliant" as RiskLevel, riskReasons: [] as string[], href: "",
  };
}

export { complianceRouter };
