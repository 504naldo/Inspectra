import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, AlertTriangle, Users, Calendar, Download } from "lucide-react";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const fmt = (n: number) => CAD.format(n);
const pct = (n: number, total: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "—";

function downloadCsv(filename: string, rows: string[][]): void {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const JOB_TYPE_LABELS: Record<string, string> = {
  annual: "Annual", semi_annual: "Semi-annual", quarterly: "Quarterly",
  monthly: "Monthly", service_call: "Service Call", repair: "Repair", other: "Other",
};

// ── AR Aging ─────────────────────────────────────────────────────────────────

function ARAgingTab() {
  const { data, isLoading } = trpc.financialReporting.arAging.useQuery();

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const { rows, totals, asOf } = data;
  const hasData = rows.length > 0;

  function exportCsv() {
    const asOfDate = new Date(asOf).toLocaleDateString("en-CA");
    const header = ["Customer", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total", "Invoice Count"];
    const body = rows.map((r) => [r.name, r.current, r.d1_30, r.d31_60, r.d61_90, r.d90plus, r.total, r.invoiceCount]);
    const foot = ["TOTAL", totals.current, totals.d1_30, totals.d31_60, totals.d61_90, totals.d90plus, totals.total, totals.invoiceCount];
    downloadCsv(`ar-aging-${asOfDate}.csv`, [header, ...body, foot] as string[][]);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Current" value={fmt(totals.current)} />
        <StatCard label="1–30 days" value={fmt(totals.d1_30)} />
        <StatCard label="31–60 days" value={fmt(totals.d31_60)} />
        <StatCard label="61–90 days" value={fmt(totals.d61_90)} />
        <StatCard label="90+ days" value={fmt(totals.d90plus)} sub={totals.d90plus > 0 ? "⚠ Overdue" : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Accounts Receivable Aging</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">As of {new Date(asOf).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} · {totals.invoiceCount} open invoice{totals.invoiceCount !== 1 ? "s" : ""} · Total outstanding: <strong>{fmt(totals.total)}</strong></p>
          </div>
          {hasData && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!hasData ? (
            <p className="text-sm text-muted-foreground px-6 py-8">No open invoices.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Customer</th>
                    <th className="text-right px-3 py-2.5">Current</th>
                    <th className="text-right px-3 py-2.5">1–30</th>
                    <th className="text-right px-3 py-2.5">31–60</th>
                    <th className="text-right px-3 py-2.5">61–90</th>
                    <th className="text-right px-3 py-2.5">90+</th>
                    <th className="text-right px-4 py-2.5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.current > 0 ? fmt(r.current) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.d1_30 > 0 ? fmt(r.d1_30) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{r.d31_60 > 0 ? fmt(r.d31_60) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-orange-600">{r.d61_90 > 0 ? fmt(r.d61_90) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600 font-medium">{r.d90plus > 0 ? fmt(r.d90plus) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.current)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.d1_30)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{fmt(totals.d31_60)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-orange-600">{fmt(totals.d61_90)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{fmt(totals.d90plus)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Revenue by Period ─────────────────────────────────────────────────────────

function RevenueTab() {
  const { data: rev, isLoading: revLoading } = trpc.financialReporting.revenueByPeriod.useQuery();
  const { data: summary, isLoading: sumLoading } = trpc.financialReporting.invoiceSummary.useQuery();
  const { data: concentration, isLoading: conLoading } = trpc.financialReporting.customerConcentration.useQuery();

  if (revLoading || sumLoading || conLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!rev || !summary) return null;

  const last12 = rev.months.slice(-12);
  const maxInvoiced = Math.max(...last12.map((m) => m.invoiced), 1);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Invoiced (24mo)" value={fmt(rev.totalInvoiced)} />
        <StatCard label="Total Collected (24mo)" value={fmt(rev.totalCollected)} />
        <StatCard label="Outstanding" value={fmt(summary.totalOutstanding)} />
        <StatCard label="Days Sales Outstanding" value={summary.dso != null ? `${summary.dso} days` : "—"} sub="avg days overdue on open invoices" />
      </div>

      {/* Revenue bar chart (text-based) */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-base">Monthly Revenue — Last 12 Months</CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => {
            const today = new Date().toLocaleDateString("en-CA");
            const header = ["Month", "Invoiced (CAD)", "Collected (CAD)", "Invoice Count"];
            const body = last12.map((m) => [m.label, m.invoiced, m.collected, m.invoiceCount]);
            downloadCsv(`revenue-by-period-${today}.csv`, [header, ...body] as string[][]);
          }}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 w-28">Month</th>
                  <th className="px-4 py-2.5">Invoiced</th>
                  <th className="text-right px-4 py-2.5 w-32">Invoiced</th>
                  <th className="text-right px-4 py-2.5 w-32">Collected</th>
                  <th className="text-right px-4 py-2.5 w-16">#</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {last12.map((m) => (
                  <tr key={m.key} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium text-xs">{m.label}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-4 rounded-sm bg-blue-500"
                          style={{ width: `${Math.max(2, (m.invoiced / maxInvoiced) * 160)}px` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.invoiced > 0 ? fmt(m.invoiced) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{m.collected > 0 ? fmt(m.collected) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{m.invoiceCount || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Invoice status breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Invoice Status Breakdown</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">#</th>
                  <th className="text-right px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(summary.byStatus)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([status, s]) => (
                    <tr key={status} className="hover:bg-muted/20">
                      <td className="px-4 py-2 capitalize">{status.replace(/_/g, " ")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(s.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Customer concentration */}
        {concentration && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Top Customers by Revenue</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-2">Customer</th>
                    <th className="text-right px-4 py-2">Invoiced</th>
                    <th className="text-right px-4 py-2">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {concentration.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2 truncate max-w-[160px]" title={r.name}>{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(r.invoiced)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Job Pipeline Forecast ─────────────────────────────────────────────────────

function PipelineTab() {
  const { data, isLoading } = trpc.financialReporting.jobPipelineForecast.useQuery();

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const { months, totalJobs, totalRevenue } = data;
  const hasRevenue = months.some((m) => m.potentialRevenue > 0);
  const maxJobs = Math.max(...months.map((m) => m.jobCount), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Scheduled Jobs (12mo)" value={String(totalJobs)} />
        <StatCard label="Potential Revenue (12mo)" value={hasRevenue ? fmt(totalRevenue) : "—"} sub={hasRevenue ? "from quoted jobs" : "no quotes linked yet"} />
        <StatCard label="Monthly Average" value={totalJobs > 0 ? `${Math.round(totalJobs / 12)} jobs` : "—"} />
      </div>

      {!hasRevenue && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Potential revenue is based on accepted or sent quotes linked to each job. Jobs without a linked quote show $0.
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-base">Scheduled Jobs — Next 12 Months</CardTitle>
          {totalJobs > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => {
              const today = new Date().toLocaleDateString("en-CA");
              const header = ["Month", "Job Count", "Job Types", "Potential Revenue (CAD)"];
              const body = months.map((m) => [
                m.label,
                m.jobCount,
                Object.entries(m.jobTypes).map(([t, c]) => `${JOB_TYPE_LABELS[t] ?? t} x${c}`).join("; "),
                m.potentialRevenue,
              ]);
              const foot = ["TOTAL", totalJobs, "", totalRevenue];
              downloadCsv(`job-pipeline-forecast-${today}.csv`, [header, ...body, foot] as string[][]);
            }}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 w-28">Month</th>
                  <th className="px-4 py-2.5">Jobs</th>
                  <th className="text-right px-4 py-2.5 w-16">Count</th>
                  <th className="text-left px-4 py-2.5">Job Types</th>
                  <th className="text-right px-4 py-2.5 w-40">Potential Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {months.map((m) => (
                  <tr key={m.key} className={m.jobCount === 0 ? "opacity-40" : "hover:bg-muted/20"}>
                    <td className="px-4 py-2.5 font-medium text-xs">{m.label}</td>
                    <td className="px-4 py-2.5">
                      <div
                        className="h-4 rounded-sm bg-indigo-500"
                        style={{ width: `${Math.max(m.jobCount > 0 ? 4 : 0, (m.jobCount / maxJobs) * 120)}px` }}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{m.jobCount || "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(m.jobTypes).map(([type, count]) => (
                          <span key={type} className="text-xs bg-muted rounded-full px-2 py-0.5">
                            {JOB_TYPE_LABELS[type] ?? type} ×{count}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {m.potentialRevenue > 0
                        ? <span className="text-emerald-600 font-medium">{fmt(m.potentialRevenue)}</span>
                        : <span className="text-muted-foreground text-xs">{m.jobCount > 0 ? "No quotes" : "—"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <td />
                  <td className="px-4 py-2.5 text-right tabular-nums">{totalJobs}</td>
                  <td />
                  <td className="px-4 py-2.5 text-right tabular-nums">{hasRevenue ? fmt(totalRevenue) : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Customer Concentration ────────────────────────────────────────────────────

function CustomersTab() {
  const { data, isLoading } = trpc.financialReporting.customerConcentration.useQuery();

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const { rows, grandTotal } = data;
  const top3Pct = rows.slice(0, 3).reduce((s, r) => s + r.invoiced, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Revenue (all customers)" value={fmt(grandTotal)} />
        <StatCard label="Top 3 Customer Share" value={pct(top3Pct, grandTotal)} sub={fmt(top3Pct)} />
        <StatCard label="Customers Tracked" value={String(rows.length)} />
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Customer Revenue Concentration</CardTitle>
          {rows.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => {
              const today = new Date().toLocaleDateString("en-CA");
              const header = ["Rank", "Customer", "% of Total", "Invoiced (CAD)", "Collected (CAD)", "Outstanding (CAD)"];
              const body = rows.map((r, i) => [i + 1, r.name, `${r.pct}%`, r.invoiced, r.collected, r.outstanding]);
              downloadCsv(`customer-concentration-${today}.csv`, [header, ...body] as string[][]);
            }}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 py-8">No invoiced revenue yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">#</th>
                  <th className="text-left px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Share</th>
                  <th className="text-right px-4 py-2.5">Invoiced</th>
                  <th className="text-right px-4 py-2.5">Collected</th>
                  <th className="text-right px-4 py-2.5">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{r.pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.invoiced)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{r.collected > 0 ? fmt(r.collected) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{r.outstanding > 0 ? fmt(r.outstanding) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancialReports() {
  return (
    <AdminLayout title="Financial Reports">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Financial Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">AR aging, revenue analysis, and job pipeline forecast.</p>
        </div>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline" className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Job Pipeline</TabsTrigger>
            <TabsTrigger value="aging" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> AR Aging</TabsTrigger>
            <TabsTrigger value="revenue" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Revenue</TabsTrigger>
            <TabsTrigger value="customers" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Customers</TabsTrigger>
          </TabsList>
          <TabsContent value="pipeline" className="mt-4"><PipelineTab /></TabsContent>
          <TabsContent value="aging" className="mt-4"><ARAgingTab /></TabsContent>
          <TabsContent value="revenue" className="mt-4"><RevenueTab /></TabsContent>
          <TabsContent value="customers" className="mt-4"><CustomersTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
