import { router, officeProcedure } from "../_core/trpc";
import { eq, and, inArray, lt, or, isNotNull, isNull, ne } from "drizzle-orm";
import {
  reports, jobs, sites, customerOrgs,
  quotes, approvedWork, workOrders, invoices,
  payrollTimeEntries, partsRequests,
} from "../../drizzle/schema";
import * as db from "../db";

// ── Types ──────────────────────────────────────────────────────────────────────

export type BottleneckSeverity = "critical" | "warning" | "info";

export interface BottleneckItem {
  id: number;
  module: string;
  entityType: string;
  entityId: number;
  title: string;
  subtitle?: string;
  customerOrgName?: string;
  siteName?: string;
  status: string;
  severity: BottleneckSeverity;
  ageDays: number;
  lastUpdatedAt: string;
  reason: string;
  suggestedNextAction: string;
  href: string;
}

export interface WorkflowHealthSummary {
  overview: {
    totalBottlenecks: number;
    criticalBottlenecks: number;
    revenueBlocked: number;
    complianceBlocked: number;
    customerFollowupsNeeded: number;
    overdueItems: number;
    staleItems: number;
  };
  groups: {
    module: string;
    label: string;
    count: number;
    items: BottleneckItem[];
  }[];
  generatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ageDays(date: Date | string | null | undefined): number {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const workflowHealthRouter = router({
  getSummary: officeProcedure.query(async ({ ctx }): Promise<WorkflowHealthSummary> => {
    const companyId = ctx.user.companyId!;
    const rawDb = await db.getDb();

    const empty = (): WorkflowHealthSummary => ({
      overview: {
        totalBottlenecks: 0, criticalBottlenecks: 0, revenueBlocked: 0,
        complianceBlocked: 0, customerFollowupsNeeded: 0, overdueItems: 0, staleItems: 0,
      },
      groups: [],
      generatedAt: new Date().toISOString(),
    });

    if (!rawDb) return empty();

    const allItems: BottleneckItem[] = [];

    // ── 1. Report QA ─────────────────────────────────────────────────────────

    const companyJobRows = await rawDb
      .select({ id: jobs.id, title: jobs.title, jobNumber: jobs.jobNumber, siteId: jobs.siteId, customerOrgId: jobs.customerOrgId })
      .from(jobs)
      .where(eq(jobs.companyId, companyId));
    const companyJobIds = companyJobRows.map((j) => j.id);
    const jobMap = new Map(companyJobRows.map((j) => [j.id, j]));

    if (companyJobIds.length > 0) {
      const staleReportRows = await rawDb
        .select({
          id: reports.id,
          jobId: reports.jobId,
          title: reports.title,
          status: reports.status,
          updatedAt: reports.updatedAt,
        })
        .from(reports)
        .where(and(
          inArray(reports.jobId, companyJobIds),
          or(
            // Generated but waiting review > 2 days
            and(eq(reports.status, "generated"), lt(reports.updatedAt, daysAgo(2))),
            // Corrections required > 3 days
            and(eq(reports.status, "corrections_required"), lt(reports.updatedAt, daysAgo(3))),
            // Approved but not sent > 5 days
            and(eq(reports.status, "approved"), lt(reports.updatedAt, daysAgo(5))),
          ),
        ));

      // Resolve site/customer names in a single pass
      const siteIds = [...new Set(staleReportRows.map((r) => jobMap.get(r.jobId)?.siteId).filter(Boolean) as number[])];
      const orgIds  = [...new Set(staleReportRows.map((r) => jobMap.get(r.jobId)?.customerOrgId).filter(Boolean) as number[])];

      const [siteRows, orgRows] = await Promise.all([
        siteIds.length ? rawDb.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, siteIds)) : [],
        orgIds.length  ? rawDb.select({ id: customerOrgs.id, name: customerOrgs.name }).from(customerOrgs).where(inArray(customerOrgs.id, orgIds)) : [],
      ]);
      const siteNameMap = new Map(siteRows.map((s) => [s.id, s.name]));
      const orgNameMap  = new Map(orgRows.map((o) => [o.id, o.name]));

      for (const r of staleReportRows) {
        const job = jobMap.get(r.jobId);
        const age = ageDays(r.updatedAt);
        const isCorrections = r.status === "corrections_required";
        const isApproved    = r.status === "approved";

        allItems.push({
          id: allItems.length,
          module: "report_qa",
          entityType: "report",
          entityId: r.id,
          title: r.title,
          subtitle: job?.jobNumber,
          customerOrgName: job?.customerOrgId ? orgNameMap.get(job.customerOrgId) : undefined,
          siteName: job?.siteId ? siteNameMap.get(job.siteId) : undefined,
          status: r.status,
          severity: isCorrections ? "critical" : age > 7 ? "critical" : "warning",
          ageDays: age,
          lastUpdatedAt: new Date(r.updatedAt).toISOString(),
          reason: isCorrections
            ? `Corrections requested ${age}d ago — not resubmitted`
            : isApproved
            ? `Approved ${age}d ago — not yet sent to customer`
            : `Waiting for QA review for ${age} day${age !== 1 ? "s" : ""}`,
          suggestedNextAction: isCorrections
            ? "Open report and address QA corrections"
            : isApproved
            ? "Send the approved report to the customer"
            : "Open Report QA and approve or request corrections",
          href: `/admin/report-qa`,
        });
      }
    }

    // ── 2. Repair Quotes ─────────────────────────────────────────────────────

    const staleQuoteRows = await rawDb
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        sentAt: quotes.sentAt,
        approvedAt: quotes.approvedAt,
        createdAt: quotes.createdAt,
        updatedAt: quotes.updatedAt,
        total: quotes.total,
        customerOrgId: quotes.customerOrgId,
        siteId: quotes.siteId,
      })
      .from(quotes)
      .where(and(
        eq(quotes.companyId, companyId),
        eq(quotes.quoteType, "repair"),
        or(
          // Draft > 7 days
          and(eq(quotes.status, "draft"), lt(quotes.createdAt, daysAgo(7))),
          // Sent/viewed > 14 days with no response
          and(inArray(quotes.status, ["sent", "viewed"]), lt(quotes.sentAt, daysAgo(14))),
          // Approved but not converted > 5 days
          and(eq(quotes.status, "approved"), lt(quotes.approvedAt, daysAgo(5))),
        ),
      ));

    if (staleQuoteRows.length > 0) {
      const qSiteIds = [...new Set(staleQuoteRows.map((q) => q.siteId).filter(Boolean) as number[])];
      const qOrgIds  = [...new Set(staleQuoteRows.map((q) => q.customerOrgId).filter(Boolean) as number[])];
      const [qSiteRows, qOrgRows] = await Promise.all([
        qSiteIds.length ? rawDb.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, qSiteIds)) : [],
        qOrgIds.length  ? rawDb.select({ id: customerOrgs.id, name: customerOrgs.name }).from(customerOrgs).where(inArray(customerOrgs.id, qOrgIds)) : [],
      ]);
      const qSiteMap = new Map(qSiteRows.map((s) => [s.id, s.name]));
      const qOrgMap  = new Map(qOrgRows.map((o) => [o.id, o.name]));

      for (const q of staleQuoteRows) {
        const age = ageDays(q.updatedAt);
        const isAwaitingResponse = q.status === "sent" || q.status === "viewed";
        const isApproved = q.status === "approved";

        allItems.push({
          id: allItems.length,
          module: "repair_quotes",
          entityType: "quote",
          entityId: q.id,
          title: `Repair Quote ${q.quoteNumber ?? q.id}`,
          subtitle: q.total ? `$${Number(q.total).toLocaleString()}` : undefined,
          customerOrgName: q.customerOrgId ? qOrgMap.get(q.customerOrgId) : undefined,
          siteName: q.siteId ? qSiteMap.get(q.siteId) : undefined,
          status: q.status,
          severity: isApproved ? "critical" : age > 21 ? "critical" : "warning",
          ageDays: age,
          lastUpdatedAt: new Date(q.updatedAt).toISOString(),
          reason: isApproved
            ? `Approved ${ageDays(q.approvedAt)}d ago — not yet converted to approved work`
            : isAwaitingResponse
            ? `Awaiting customer response for ${ageDays(q.sentAt)} days`
            : `Draft quote idle for ${age} days`,
          suggestedNextAction: isApproved
            ? "Convert to Approved Work to begin scheduling"
            : isAwaitingResponse
            ? "Follow up with customer or set an expiry date"
            : "Finalize and send the quote to the customer",
          href: `/admin/repair-quotes/${q.id}`,
        });
      }
    }

    // ── 3. Approved Work ─────────────────────────────────────────────────────

    const staleApprovedRows = await rawDb
      .select({
        id: approvedWork.id,
        status: approvedWork.status,
        approvedAt: approvedWork.approvedAt,
        completedAt: approvedWork.completedAt,
        updatedAt: approvedWork.updatedAt,
        approvedScope: approvedWork.approvedScope,
        approvedAmount: approvedWork.approvedAmount,
        customerOrgId: approvedWork.customerOrgId,
        siteId: approvedWork.siteId,
      })
      .from(approvedWork)
      .where(and(
        eq(approvedWork.companyId, companyId),
        or(
          // Not scheduled > 7 days
          and(inArray(approvedWork.status, ["approved", "ready_to_schedule"]), lt(approvedWork.approvedAt, daysAgo(7))),
          // Parts blocked > 30 days
          and(inArray(approvedWork.status, ["awaiting_parts", "parts_ordered"]), lt(approvedWork.updatedAt, daysAgo(30))),
          // Completed but not invoiced > 14 days
          and(eq(approvedWork.status, "completed"), lt(approvedWork.completedAt, daysAgo(14))),
        ),
      ));

    if (staleApprovedRows.length > 0) {
      const awSiteIds = [...new Set(staleApprovedRows.map((a) => a.siteId).filter(Boolean) as number[])];
      const awOrgIds  = [...new Set(staleApprovedRows.map((a) => a.customerOrgId).filter(Boolean) as number[])];
      const [awSiteRows, awOrgRows] = await Promise.all([
        awSiteIds.length ? rawDb.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, awSiteIds)) : [],
        awOrgIds.length  ? rawDb.select({ id: customerOrgs.id, name: customerOrgs.name }).from(customerOrgs).where(inArray(customerOrgs.id, awOrgIds)) : [],
      ]);
      const awSiteMap = new Map(awSiteRows.map((s) => [s.id, s.name]));
      const awOrgMap  = new Map(awOrgRows.map((o) => [o.id, o.name]));

      for (const a of staleApprovedRows) {
        const isUnscheduled  = a.status === "approved" || a.status === "ready_to_schedule";
        const isPartsPending = a.status === "awaiting_parts" || a.status === "parts_ordered";
        const isCompleted    = a.status === "completed";
        const age = isUnscheduled
          ? ageDays(a.approvedAt)
          : isCompleted
          ? ageDays(a.completedAt)
          : ageDays(a.updatedAt);

        allItems.push({
          id: allItems.length,
          module: "approved_work",
          entityType: "approved_work",
          entityId: a.id,
          title: a.approvedScope ? (a.approvedScope.slice(0, 80) + (a.approvedScope.length > 80 ? "…" : "")) : `Approved Work #${a.id}`,
          subtitle: a.approvedAmount ? `$${Number(a.approvedAmount).toLocaleString()}` : undefined,
          customerOrgName: a.customerOrgId ? awOrgMap.get(a.customerOrgId) : undefined,
          siteName: a.siteId ? awSiteMap.get(a.siteId) : undefined,
          status: a.status,
          severity: isCompleted ? "critical" : age > 21 ? "critical" : "warning",
          ageDays: age,
          lastUpdatedAt: new Date(a.updatedAt).toISOString(),
          reason: isCompleted
            ? `Completed ${ageDays(a.completedAt)}d ago — not yet invoiced`
            : isPartsPending
            ? `Parts pending for ${ageDays(a.updatedAt)} days — may need follow-up`
            : `Approved ${ageDays(a.approvedAt)}d ago — not yet scheduled`,
          suggestedNextAction: isCompleted
            ? "Create an invoice to close out this approved work"
            : isPartsPending
            ? "Check parts order status and update approved work"
            : "Assign a technician and schedule the work",
          href: `/admin/approved-work`,
        });
      }
    }

    // ── 4. Work Orders ───────────────────────────────────────────────────────

    const staleWorkOrderRows = await rawDb
      .select({
        id: workOrders.id,
        workOrderNumber: workOrders.workOrderNumber,
        title: workOrders.title,
        status: workOrders.status,
        priority: workOrders.priority,
        scheduledDate: workOrders.scheduledDate,
        startedAt: workOrders.startedAt,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
        customerOrgId: workOrders.customerOrgId,
        siteId: workOrders.siteId,
      })
      .from(workOrders)
      .where(and(
        eq(workOrders.companyId, companyId),
        or(
          // Pending > 7 days
          and(eq(workOrders.status, "pending"), lt(workOrders.createdAt, daysAgo(7))),
          // Urgent and not yet assigned
          and(eq(workOrders.priority, "urgent"), inArray(workOrders.status, ["pending", "scheduled"])),
          // In progress > 14 days
          and(eq(workOrders.status, "in_progress"), lt(workOrders.startedAt, daysAgo(14))),
        ),
      ));

    if (staleWorkOrderRows.length > 0) {
      const woSiteIds = [...new Set(staleWorkOrderRows.map((w) => w.siteId).filter(Boolean) as number[])];
      const woOrgIds  = [...new Set(staleWorkOrderRows.map((w) => w.customerOrgId).filter(Boolean) as number[])];
      const [woSiteRows, woOrgRows] = await Promise.all([
        woSiteIds.length ? rawDb.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, woSiteIds)) : [],
        woOrgIds.length  ? rawDb.select({ id: customerOrgs.id, name: customerOrgs.name }).from(customerOrgs).where(inArray(customerOrgs.id, woOrgIds)) : [],
      ]);
      const woSiteMap = new Map(woSiteRows.map((s) => [s.id, s.name]));
      const woOrgMap  = new Map(woOrgRows.map((o) => [o.id, o.name]));

      for (const w of staleWorkOrderRows) {
        const isUrgent    = w.priority === "urgent";
        const isInProgress = w.status === "in_progress";
        const age = isInProgress ? ageDays(w.startedAt) : ageDays(w.createdAt);

        allItems.push({
          id: allItems.length,
          module: "work_orders",
          entityType: "work_order",
          entityId: w.id,
          title: w.title,
          subtitle: w.workOrderNumber,
          customerOrgName: w.customerOrgId ? woOrgMap.get(w.customerOrgId) : undefined,
          siteName: w.siteId ? woSiteMap.get(w.siteId) : undefined,
          status: w.status,
          severity: isUrgent ? "critical" : isInProgress && age > 21 ? "critical" : "warning",
          ageDays: age,
          lastUpdatedAt: new Date(w.updatedAt).toISOString(),
          reason: isUrgent && !isInProgress
            ? `Urgent work order not yet started`
            : isInProgress
            ? `In progress for ${age} days — may need attention`
            : `Pending for ${age} days without assignment`,
          suggestedNextAction: isUrgent && !isInProgress
            ? "Assign technician and begin urgent work order immediately"
            : isInProgress
            ? "Check technician status and update progress"
            : "Assign a technician or reschedule the work order",
          href: `/admin/work-orders`,
        });
      }
    }

    // ── 5. Invoices ──────────────────────────────────────────────────────────

    const staleInvoiceRows = await rawDb
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        sageExportStatus: invoices.sageExportStatus,
        dueDate: invoices.dueDate,
        sentAt: invoices.sentAt,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        total: invoices.total,
        balanceDue: invoices.balanceDue,
        customerOrgId: invoices.customerOrgId,
        siteId: invoices.siteId,
      })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        or(
          // Draft > 7 days
          and(eq(invoices.status, "draft"), lt(invoices.createdAt, daysAgo(7))),
          // Overdue status
          eq(invoices.status, "overdue"),
          // Sage export error
          eq(invoices.sageExportStatus, "error"),
          // Sent but past due date
          and(inArray(invoices.status, ["sent", "viewed"]), isNotNull(invoices.dueDate), lt(invoices.dueDate, new Date())),
        ),
      ));

    if (staleInvoiceRows.length > 0) {
      const invSiteIds = [...new Set(staleInvoiceRows.map((i) => i.siteId).filter(Boolean) as number[])];
      const invOrgIds  = [...new Set(staleInvoiceRows.map((i) => i.customerOrgId).filter(Boolean) as number[])];
      const [invSiteRows, invOrgRows] = await Promise.all([
        invSiteIds.length ? rawDb.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, invSiteIds)) : [],
        invOrgIds.length  ? rawDb.select({ id: customerOrgs.id, name: customerOrgs.name }).from(customerOrgs).where(inArray(customerOrgs.id, invOrgIds)) : [],
      ]);
      const invSiteMap = new Map(invSiteRows.map((s) => [s.id, s.name]));
      const invOrgMap  = new Map(invOrgRows.map((o) => [o.id, o.name]));

      for (const inv of staleInvoiceRows) {
        const isSageError = inv.sageExportStatus === "error";
        const isOverdue   = inv.status === "overdue" || (inv.dueDate && new Date(inv.dueDate) < new Date());
        const age = ageDays(inv.updatedAt);

        allItems.push({
          id: allItems.length,
          module: "invoices",
          entityType: "invoice",
          entityId: inv.id,
          title: `Invoice ${inv.invoiceNumber}`,
          subtitle: inv.total ? `$${Number(inv.total).toLocaleString()}` : undefined,
          customerOrgName: inv.customerOrgId ? invOrgMap.get(inv.customerOrgId) : undefined,
          siteName: inv.siteId ? invSiteMap.get(inv.siteId) : undefined,
          status: inv.status,
          severity: isSageError || isOverdue ? "critical" : "warning",
          ageDays: age,
          lastUpdatedAt: new Date(inv.updatedAt).toISOString(),
          reason: isSageError
            ? "Sage export failed — needs retry or manual intervention"
            : isOverdue
            ? `Past due date — balance $${Number(inv.balanceDue ?? inv.total).toLocaleString()}`
            : `Draft invoice idle for ${age} days`,
          suggestedNextAction: isSageError
            ? "Retry Sage export or contact accounting team"
            : isOverdue
            ? "Send a payment reminder or contact the customer"
            : "Finalize and send the invoice to the customer",
          href: `/admin/invoices/${inv.id}`,
        });
      }
    }

    // ── 6. Payroll ───────────────────────────────────────────────────────────

    const stalePayrollRows = await rawDb
      .select({
        id: payrollTimeEntries.id,
        status: payrollTimeEntries.status,
        submittedAt: payrollTimeEntries.submittedAt,
        rejectedAt: payrollTimeEntries.rejectedAt,
        entryDate: payrollTimeEntries.entryDate,
        updatedAt: payrollTimeEntries.updatedAt,
        userId: payrollTimeEntries.userId,
        totalMinutes: payrollTimeEntries.totalMinutes,
      })
      .from(payrollTimeEntries)
      .where(and(
        eq(payrollTimeEntries.companyId, companyId),
        or(
          // Submitted > 3 days without approval
          and(eq(payrollTimeEntries.status, "submitted"), lt(payrollTimeEntries.submittedAt, daysAgo(3))),
          // Rejected > 3 days without resubmission
          and(eq(payrollTimeEntries.status, "rejected"), lt(payrollTimeEntries.rejectedAt, daysAgo(3))),
        ),
      ));

    // Group payroll by user to avoid flooding — show one item per user
    const payrollByUser = new Map<number, typeof stalePayrollRows[number][]>();
    for (const p of stalePayrollRows) {
      const list = payrollByUser.get(p.userId) ?? [];
      list.push(p);
      payrollByUser.set(p.userId, list);
    }

    for (const [userId, entries] of payrollByUser) {
      const oldest = entries.reduce((a, b) => ageDays(a.submittedAt ?? a.rejectedAt) > ageDays(b.submittedAt ?? b.rejectedAt) ? a : b);
      const hasRejected = entries.some((e) => e.status === "rejected");
      const age = ageDays(hasRejected ? oldest.rejectedAt : oldest.submittedAt);

      allItems.push({
        id: allItems.length,
        module: "payroll",
        entityType: "payroll_entry",
        entityId: userId,
        title: `Payroll: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} waiting`,
        subtitle: `User ID ${userId}`,
        status: hasRejected ? "rejected" : "submitted",
        severity: hasRejected ? "critical" : age > 7 ? "critical" : "warning",
        ageDays: age,
        lastUpdatedAt: new Date(oldest.updatedAt).toISOString(),
        reason: hasRejected
          ? `${entries.filter((e) => e.status === "rejected").length} rejected entr${entries.filter((e) => e.status === "rejected").length === 1 ? "y" : "ies"} not resubmitted (${age}d)`
          : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} submitted ${age} days ago, pending approval`,
        suggestedNextAction: hasRejected
          ? "Contact employee to correct and resubmit rejected entries"
          : "Open Payroll Review and approve submitted entries",
        href: `/admin/payroll-review`,
      });
    }

    // ── 7. Parts Requests ────────────────────────────────────────────────────

    const stalePartsRows = await rawDb
      .select({
        id: partsRequests.id,
        requestNumber: partsRequests.requestNumber,
        status: partsRequests.status,
        priority: partsRequests.priority,
        submittedAt: partsRequests.submittedAt,
        approvedAt: partsRequests.approvedAt,
        neededByDate: partsRequests.neededByDate,
        updatedAt: partsRequests.updatedAt,
        customerOrgId: partsRequests.customerOrgId,
        siteId: partsRequests.siteId,
      })
      .from(partsRequests)
      .where(and(
        eq(partsRequests.companyId, companyId),
        or(
          // Urgent + submitted > 1 day without approval
          and(
            eq(partsRequests.priority, "urgent"),
            eq(partsRequests.status, "submitted"),
            lt(partsRequests.submittedAt, daysAgo(1)),
          ),
          // Ordered/partially received and past needed-by date
          and(
            inArray(partsRequests.status, ["ordered", "partially_received"]),
            isNotNull(partsRequests.neededByDate),
            lt(partsRequests.neededByDate, new Date()),
          ),
          // Any submitted > 7 days without approval
          and(eq(partsRequests.status, "submitted"), lt(partsRequests.submittedAt, daysAgo(7))),
        ),
      ));

    if (stalePartsRows.length > 0) {
      const prSiteIds = [...new Set(stalePartsRows.map((p) => p.siteId).filter(Boolean) as number[])];
      const prOrgIds  = [...new Set(stalePartsRows.map((p) => p.customerOrgId).filter(Boolean) as number[])];
      const [prSiteRows, prOrgRows] = await Promise.all([
        prSiteIds.length ? rawDb.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, prSiteIds)) : [],
        prOrgIds.length  ? rawDb.select({ id: customerOrgs.id, name: customerOrgs.name }).from(customerOrgs).where(inArray(customerOrgs.id, prOrgIds)) : [],
      ]);
      const prSiteMap = new Map(prSiteRows.map((s) => [s.id, s.name]));
      const prOrgMap  = new Map(prOrgRows.map((o) => [o.id, o.name]));

      for (const p of stalePartsRows) {
        const isOverdueDelivery = (p.status === "ordered" || p.status === "partially_received") && p.neededByDate && new Date(p.neededByDate) < new Date();
        const isUrgentPending   = p.priority === "urgent" && p.status === "submitted";
        const age = ageDays(p.submittedAt ?? p.updatedAt);

        allItems.push({
          id: allItems.length,
          module: "inventory_parts",
          entityType: "parts_request",
          entityId: p.id,
          title: `Parts Request ${p.requestNumber}`,
          customerOrgName: p.customerOrgId ? prOrgMap.get(p.customerOrgId) : undefined,
          siteName: p.siteId ? prSiteMap.get(p.siteId) : undefined,
          status: p.status,
          severity: isUrgentPending || isOverdueDelivery ? "critical" : "warning",
          ageDays: age,
          lastUpdatedAt: new Date(p.updatedAt).toISOString(),
          reason: isOverdueDelivery
            ? `Parts ordered but needed-by date has passed`
            : isUrgentPending
            ? `Urgent request waiting for approval (${age}d)`
            : `Submitted ${age} days ago without approval`,
          suggestedNextAction: isOverdueDelivery
            ? "Contact vendor to expedite delivery or find alternative"
            : "Open Parts Requests and approve or reject the request",
          href: `/admin/parts-requests`,
        });
      }
    }

    // ── Overview ─────────────────────────────────────────────────────────────

    const REVENUE_MODULES = new Set(["repair_quotes", "approved_work", "invoices"]);
    const COMPLIANCE_MODULES = new Set(["report_qa"]);
    const FOLLOWUP_MODULES = new Set(["repair_quotes"]);

    const overview = {
      totalBottlenecks: allItems.length,
      criticalBottlenecks: allItems.filter((i) => i.severity === "critical").length,
      revenueBlocked: allItems.filter((i) => REVENUE_MODULES.has(i.module)).length,
      complianceBlocked: allItems.filter((i) => COMPLIANCE_MODULES.has(i.module)).length,
      customerFollowupsNeeded: allItems.filter((i) => FOLLOWUP_MODULES.has(i.module) && (i.status === "sent" || i.status === "viewed")).length,
      overdueItems: allItems.filter((i) => i.status === "overdue" || i.severity === "critical").length,
      staleItems: allItems.filter((i) => i.ageDays > 14).length,
    };

    // ── Group ─────────────────────────────────────────────────────────────────

    const MODULE_META: Record<string, string> = {
      report_qa:       "Report QA",
      repair_quotes:   "Repair Quotes",
      approved_work:   "Approved Work",
      work_orders:     "Work Orders",
      invoices:        "Invoices",
      payroll:         "Payroll",
      inventory_parts: "Parts Requests",
    };

    const grouped = new Map<string, BottleneckItem[]>();
    for (const item of allItems) {
      const list = grouped.get(item.module) ?? [];
      list.push(item);
      grouped.set(item.module, list);
    }

    const groups = Object.keys(MODULE_META)
      .filter((m) => grouped.has(m))
      .map((m) => ({
        module: m,
        label: MODULE_META[m],
        count: grouped.get(m)!.length,
        items: grouped.get(m)!.sort((a, b) => {
          const sev = { critical: 0, warning: 1, info: 2 };
          return sev[a.severity] - sev[b.severity] || b.ageDays - a.ageDays;
        }),
      }));

    return {
      overview,
      groups,
      generatedAt: new Date().toISOString(),
    };
  }),
});
