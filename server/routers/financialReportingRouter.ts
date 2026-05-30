import { router, adminOrOfficeProcedure } from "../_core/trpc.js";
import * as db from "../db.js";

const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthKey(year: number, month: number) { return `${year}-${String(month).padStart(2, "0")}`; }
function monthLabel(year: number, month: number) { return `${MONTH_LABELS[month - 1]} ${year}`; }

export const financialReportingRouter = router({

  // ── AR Aging ────────────────────────────────────────────────────────────────
  arAging: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const [allInvoices, customerOrgs] = await Promise.all([
      db.getInvoicesByCompany(companyId),
      db.getCustomerOrgsByCompany(companyId),
    ]);
    const orgMap = new Map(customerOrgs.map((o) => [o.id, o.name]));
    const now = Date.now();

    const open = allInvoices.filter((inv) =>
      !["paid", "void", "draft"].includes(inv.status)
    );

    type Row = { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number; invoiceCount: number };
    const byCustomer = new Map<string, { name: string } & Row>();

    for (const inv of open) {
      const key = inv.customerOrgId != null ? String(inv.customerOrgId) : "unknown";
      const name = inv.customerOrgId != null
        ? (orgMap.get(inv.customerOrgId) ?? inv.billToName ?? `Org #${inv.customerOrgId}`)
        : (inv.billToName ?? "Unknown");

      if (!byCustomer.has(key)) {
        byCustomer.set(key, { name, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, invoiceCount: 0 });
      }
      const row = byCustomer.get(key)!;

      const due = inv.dueDate ? new Date(inv.dueDate).getTime() : null;
      const daysOverdue = due != null ? Math.floor((now - due) / 86400000) : -1;
      const balance = toNum(inv.balanceDue) || toNum(inv.total);

      if (daysOverdue <= 0) row.current += balance;
      else if (daysOverdue <= 30) row.d1_30 += balance;
      else if (daysOverdue <= 60) row.d31_60 += balance;
      else if (daysOverdue <= 90) row.d61_90 += balance;
      else row.d90plus += balance;

      row.total += balance;
      row.invoiceCount++;
    }

    const rows = Array.from(byCustomer.entries())
      .map(([, r]) => r)
      .sort((a, b) => b.total - a.total);

    const totals: Row = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0, invoiceCount: 0 };
    for (const r of rows) {
      totals.current += r.current;
      totals.d1_30 += r.d1_30;
      totals.d31_60 += r.d31_60;
      totals.d61_90 += r.d61_90;
      totals.d90plus += r.d90plus;
      totals.total += r.total;
      totals.invoiceCount += r.invoiceCount;
    }

    return { rows, totals, asOf: new Date().toISOString() };
  }),

  // ── Revenue by Period (last 24 months) ──────────────────────────────────────
  revenueByPeriod: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const allInvoices = await db.getInvoicesByCompany(companyId);

    const now = new Date();
    const months: { year: number; month: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const invoiced = new Map<string, number>();
    const collected = new Map<string, number>();
    const invoiceCount = new Map<string, number>();

    for (const inv of allInvoices) {
      if (["void", "draft"].includes(inv.status)) continue;
      const ref = inv.invoiceDate ?? inv.createdAt;
      if (!ref) continue;
      const d = new Date(ref);
      const k = monthKey(d.getFullYear(), d.getMonth() + 1);
      invoiced.set(k, (invoiced.get(k) ?? 0) + toNum(inv.total));
      invoiceCount.set(k, (invoiceCount.get(k) ?? 0) + 1);

      if (inv.amountPaid && toNum(inv.amountPaid) > 0) {
        const pd = inv.paidAt ? new Date(inv.paidAt) : d;
        const pk = monthKey(pd.getFullYear(), pd.getMonth() + 1);
        collected.set(pk, (collected.get(pk) ?? 0) + toNum(inv.amountPaid));
      }
    }

    const result = months.map(({ year, month }) => {
      const k = monthKey(year, month);
      return {
        key: k,
        label: monthLabel(year, month),
        invoiced: invoiced.get(k) ?? 0,
        collected: collected.get(k) ?? 0,
        invoiceCount: invoiceCount.get(k) ?? 0,
      };
    });

    const totalInvoiced = result.reduce((s, r) => s + r.invoiced, 0);
    const totalCollected = result.reduce((s, r) => s + r.collected, 0);

    return { months: result, totalInvoiced, totalCollected };
  }),

  // ── Invoice Status Summary ───────────────────────────────────────────────────
  invoiceSummary: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const allInvoices = await db.getInvoicesByCompany(companyId);

    const byStatus = new Map<string, { count: number; total: number; balanceDue: number }>();
    for (const inv of allInvoices) {
      const s = inv.status ?? "unknown";
      if (!byStatus.has(s)) byStatus.set(s, { count: 0, total: 0, balanceDue: 0 });
      const row = byStatus.get(s)!;
      row.count++;
      row.total += toNum(inv.total);
      row.balanceDue += toNum(inv.balanceDue);
    }

    const totalOutstanding = allInvoices
      .filter((i) => !["paid", "void", "draft"].includes(i.status))
      .reduce((s, i) => s + toNum(i.balanceDue), 0);

    const totalCollected = allInvoices
      .filter((i) => ["paid", "partial"].includes(i.status))
      .reduce((s, i) => s + toNum(i.amountPaid), 0);

    const overdueDays: number[] = [];
    const now = Date.now();
    for (const inv of allInvoices) {
      if (["paid", "void", "draft"].includes(inv.status)) continue;
      if (!inv.dueDate) continue;
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      if (days > 0) overdueDays.push(days);
    }
    const dso = overdueDays.length > 0
      ? Math.round(overdueDays.reduce((s, d) => s + d, 0) / overdueDays.length)
      : null;

    return {
      byStatus: Object.fromEntries(byStatus),
      totalOutstanding,
      totalCollected,
      dso,
      totalInvoices: allInvoices.length,
    };
  }),

  // ── Customer Concentration (top 10 by revenue) ───────────────────────────────
  customerConcentration: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const [allInvoices, customerOrgs] = await Promise.all([
      db.getInvoicesByCompany(companyId),
      db.getCustomerOrgsByCompany(companyId),
    ]);
    const orgMap = new Map(customerOrgs.map((o) => [o.id, o.name]));

    const byCustomer = new Map<string, { name: string; invoiced: number; collected: number; outstanding: number }>();
    for (const inv of allInvoices) {
      if (["void", "draft"].includes(inv.status)) continue;
      const key = inv.customerOrgId != null ? String(inv.customerOrgId) : `bt:${inv.billToName ?? "unknown"}`;
      const name = inv.customerOrgId != null
        ? (orgMap.get(inv.customerOrgId) ?? inv.billToName ?? `Org #${inv.customerOrgId}`)
        : (inv.billToName ?? "Unknown");
      if (!byCustomer.has(key)) byCustomer.set(key, { name, invoiced: 0, collected: 0, outstanding: 0 });
      const row = byCustomer.get(key)!;
      row.invoiced += toNum(inv.total);
      row.collected += toNum(inv.amountPaid);
      row.outstanding += toNum(inv.balanceDue);
    }

    const rows = Array.from(byCustomer.values()).sort((a, b) => b.invoiced - a.invoiced).slice(0, 10);
    const grandTotal = rows.reduce((s, r) => s + r.invoiced, 0);
    return {
      rows: rows.map((r) => ({
        ...r,
        pct: grandTotal > 0 ? Math.round((r.invoiced / grandTotal) * 100) : 0,
      })),
      grandTotal,
    };
  }),

  // ── Job Pipeline Forecast (next 12 months) ───────────────────────────────────
  jobPipelineForecast: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const [allJobs, allQuotes] = await Promise.all([
      db.getJobsByCompany(companyId),
      db.getQuotesByCompany(companyId),
    ]);

    const now = new Date();
    const months: { year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    // Index accepted/approved quotes by jobId
    const quoteRevenueByJob = new Map<number, number>();
    for (const q of allQuotes) {
      if (!q.jobId) continue;
      if (!["accepted", "approved", "partially_approved", "sent"].includes(q.status ?? "")) continue;
      quoteRevenueByJob.set(q.jobId, (quoteRevenueByJob.get(q.jobId) ?? 0) + toNum(q.total));
    }

    // Filter jobs with a future scheduledDate, not cancelled/completed
    const futureJobs = allJobs.filter((j) => {
      if (!j.scheduledDate) return false;
      if (["cancelled", "completed"].includes(j.status ?? "")) return false;
      const d = new Date(j.scheduledDate);
      return d >= new Date(now.getFullYear(), now.getMonth(), 1);
    });

    type MonthData = {
      key: string; label: string;
      jobCount: number;
      jobTypes: Record<string, number>;
      potentialRevenue: number;
      jobsWithQuotes: number;
    };

    const result: MonthData[] = months.map(({ year, month }) => ({
      key: monthKey(year, month),
      label: monthLabel(year, month),
      jobCount: 0,
      jobTypes: {},
      potentialRevenue: 0,
      jobsWithQuotes: 0,
    }));
    const monthIndex = new Map(result.map((r, i) => [r.key, i]));

    for (const job of futureJobs) {
      const d = new Date(job.scheduledDate!);
      const k = monthKey(d.getFullYear(), d.getMonth() + 1);
      const idx = monthIndex.get(k);
      if (idx === undefined) continue;

      const row = result[idx];
      row.jobCount++;
      const type = job.jobType ?? "other";
      row.jobTypes[type] = (row.jobTypes[type] ?? 0) + 1;

      const rev = quoteRevenueByJob.get(job.id);
      if (rev) {
        row.potentialRevenue += rev;
        row.jobsWithQuotes++;
      }
    }

    const totalJobs = result.reduce((s, r) => s + r.jobCount, 0);
    const totalRevenue = result.reduce((s, r) => s + r.potentialRevenue, 0);

    return { months: result, totalJobs, totalRevenue };
  }),
});
