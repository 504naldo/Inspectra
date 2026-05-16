import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  ShieldCheck,
  Eye,
  FileText,
  CheckSquare,
  Database,
  ArrowRight,
  Building2,
  Clock,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

// ── Risk level helpers ────────────────────────────────────────────────────────

type RiskLevel = "compliant" | "watch" | "at_risk" | "critical";

const RISK_FILTER_OPTIONS = [
  { value: "all",              label: "All Sites"       },
  { value: "critical",         label: "Critical"        },
  { value: "at_risk",          label: "At Risk"         },
  { value: "watch",            label: "Watch"           },
  { value: "compliant",        label: "Compliant"       },
  { value: "missing_data",     label: "Missing Data"    },
  { value: "open_deficiency",  label: "Open Deficiency" },
  { value: "overdue",          label: "Overdue"         },
] as const;

type RiskFilter = (typeof RISK_FILTER_OPTIONS)[number]["value"];

function riskBadgeClass(level: RiskLevel) {
  switch (level) {
    case "critical":  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200";
    case "at_risk":   return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200";
    case "watch":     return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200";
    case "compliant": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200";
  }
}

function riskLabel(level: RiskLevel) {
  switch (level) {
    case "critical":  return "Critical";
    case "at_risk":   return "At Risk";
    case "watch":     return "Watch";
    case "compliant": return "Compliant";
  }
}

function riskIcon(level: RiskLevel) {
  switch (level) {
    case "critical":  return <AlertOctagon className="h-4 w-4" />;
    case "at_risk":   return <ShieldAlert className="h-4 w-4" />;
    case "watch":     return <Eye className="h-4 w-4" />;
    case "compliant": return <ShieldCheck className="h-4 w-4" />;
  }
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  count,
  sub,
  icon: Icon,
  urgent,
  href,
}: {
  label: string;
  count: number;
  sub?: string;
  icon: React.ElementType;
  urgent?: boolean;
  href?: string;
}) {
  const inner = (
    <Card className={`h-full ${urgent && count > 0 ? "border-red-300 dark:border-red-800" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`p-2 rounded-lg ${urgent && count > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-primary/10"}`}>
            <Icon className={`h-4 w-4 ${urgent && count > 0 ? "text-red-600 dark:text-red-400" : "text-primary"}`} />
          </div>
          {href && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className={`text-2xl font-bold mt-3 ${urgent && count > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{count}</div>
        <p className="text-sm font-medium mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}><div className="cursor-pointer hover:shadow-md transition-shadow h-full">{inner}</div></Link> : inner;
}

// ── Compliance section card ───────────────────────────────────────────────────

function ComplianceSection({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: React.ElementType;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
          <Link href={href} className="ml-auto">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color?: string }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color ?? ""}`}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComplianceDashboard() {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, error } = trpc.compliance.getSummary.useQuery(undefined, {
    staleTime: 60_000,
  });

  const ov = data?.overview;
  const siteRiskList = data?.siteRiskList ?? [];
  const defAging = data?.deficiencyAging ?? { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const reportQa = data?.reportQaSummary ?? { fieldComplete: 0, needsReview: 0, correctionsRequired: 0, approvedNotSent: 0, sentThisWeek: 0 };
  const awComp = data?.approvedWorkCompliance ?? { approvedNotScheduled: 0, scheduledNotCompleted: 0, awaitingParts: 0, completedNotInvoiced: 0 };
  const dqComp = data?.dataQualityCompliance ?? { sitesMissingBuildingId: 0, sitesMissingFileNumber: 0, sitesMissingCustomerOrg: 0, sitesMissingWorkSiteInfo: 0, sitesMissingContacts: 0 };

  // Client-side filter
  const filteredSites = siteRiskList.filter((site) => {
    if (search) {
      const q = search.toLowerCase();
      if (!site.siteName.toLowerCase().includes(q) &&
          !(site.customerOrgName ?? "").toLowerCase().includes(q) &&
          !(site.buildingId ?? "").toLowerCase().includes(q) &&
          !(site.city ?? "").toLowerCase().includes(q)) {
        return false;
      }
    }
    switch (riskFilter) {
      case "critical":        return site.riskLevel === "critical";
      case "at_risk":         return site.riskLevel === "at_risk";
      case "watch":           return site.riskLevel === "watch";
      case "compliant":       return site.riskLevel === "compliant";
      case "missing_data":    return site.missingDataFlags.length > 0;
      case "open_deficiency": return site.openDeficiencyCount > 0;
      case "overdue":         return site.overdueDays != null && site.overdueDays > 0;
      default:                return true;
    }
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading compliance summary…</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md w-full border-red-200">
            <CardContent className="p-6 text-center">
              <AlertOctagon className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <p className="font-medium mb-1">Failed to load compliance data</p>
              <p className="text-xs text-muted-foreground mb-4">{error.message}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Compliance Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Site risk, deficiency aging, report QA, and approved work status
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* ── Overview cards ── */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Compliance Overview
          </h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <MetricCard icon={ShieldCheck}   label="Sites Compliant"         count={ov?.compliantSites ?? 0}         sub={`of ${ov?.totalSites ?? 0} total`} />
            <MetricCard icon={ShieldAlert}   label="Sites At Risk"           count={ov?.sitesAtRisk ?? 0}            urgent href="/admin/compliance" />
            <MetricCard icon={Clock}         label="Overdue Inspections"     count={ov?.overdueInspections ?? 0}     urgent href="/admin/compliance" />
            <MetricCard icon={AlertOctagon}  label="Critical Deficiencies"   count={ov?.criticalDeficiencies ?? 0}   urgent href="/admin/compliance" />
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mt-3">
            <MetricCard icon={AlertTriangle} label="Open Deficiencies"       count={ov?.openDeficiencies ?? 0}       urgent={!!ov && ov.openDeficiencies > 0} href="/admin/compliance" />
            <MetricCard icon={FileText}      label="Reports Pending Review"  count={ov?.reportsPendingReview ?? 0}   href="/admin/report-qa" />
            <MetricCard icon={CheckSquare}   label="Approved Work Open"      count={ov?.approvedWorkNotCompleted ?? 0} href="/admin/approved-work" />
            <MetricCard icon={Database}      label="Data Issues"             count={(ov?.sitesMissingBuildingId ?? 0) + (ov?.sitesMissingWorkSiteInfo ?? 0)} href="/admin/data-quality" />
          </div>
        </div>

        {/* ── Site Risk List ── */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Site Risk
            <span className="ml-2 text-primary font-bold normal-case">{filteredSites.length}</span>
          </h2>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              placeholder="Search site, customer, building ID, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-9 w-full sm:max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex gap-1.5 flex-wrap">
              {RISK_FILTER_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={riskFilter === opt.value ? "default" : "outline"}
                  onClick={() => setRiskFilter(opt.value)}
                  className="text-xs h-9"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Site list */}
          {filteredSites.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                <p className="text-sm font-medium">
                  {search || riskFilter !== "all" ? "No sites match the current filter" : "All sites are compliant"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredSites.map((site) => (
                <Card key={site.siteId} className={`${site.riskLevel === "critical" ? "border-red-200 dark:border-red-900" : site.riskLevel === "at_risk" ? "border-orange-200 dark:border-orange-900" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Left: site info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${riskBadgeClass(site.riskLevel)}`}>
                            {riskIcon(site.riskLevel)}
                            {riskLabel(site.riskLevel)}
                          </span>
                          {site.riskReasons.map((reason, i) => (
                            <span key={i} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              {reason}
                            </span>
                          ))}
                        </div>
                        <p className="font-semibold text-sm">{site.siteName}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5 text-xs text-muted-foreground">
                          {site.customerOrgName && <span>{site.customerOrgName}</span>}
                          {site.buildingId && <span>· {site.buildingId}</span>}
                          {site.fileNumber && <span>· #{site.fileNumber}</span>}
                          {site.city && <span>· {site.city}</span>}
                        </div>
                        {/* Stats */}
                        <div className="flex gap-3 flex-wrap mt-2 text-xs">
                          {site.lastInspectionDate && (
                            <span className="text-muted-foreground">
                              Last inspected: {new Date(site.lastInspectionDate).toLocaleDateString()}
                            </span>
                          )}
                          {!site.lastInspectionDate && (
                            <span className="text-amber-600">No inspection history</span>
                          )}
                          {site.overdueDays != null && site.overdueDays > 0 && (
                            <span className="text-red-600 font-medium">Overdue {site.overdueDays}d</span>
                          )}
                          {site.openDeficiencyCount > 0 && (
                            <span className={site.criticalDeficiencyCount > 0 ? "text-red-600 font-medium" : "text-orange-600"}>
                              {site.openDeficiencyCount} deficienc{site.openDeficiencyCount > 1 ? "ies" : "y"}
                              {site.criticalDeficiencyCount > 0 && ` (${site.criticalDeficiencyCount} critical)`}
                            </span>
                          )}
                          {site.reportsPendingReviewCount > 0 && (
                            <span className="text-blue-600">{site.reportsPendingReviewCount} report{site.reportsPendingReviewCount > 1 ? "s" : ""} pending</span>
                          )}
                          {site.missingDataFlags.length > 0 && (
                            <span className="text-muted-foreground">{site.missingDataFlags.length} data gap{site.missingDataFlags.length > 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: action buttons */}
                      <div className="flex gap-2 shrink-0 sm:flex-col">
                        <Link href={site.href}>
                          <Button size="sm" variant="outline" className="text-xs w-full">
                            <Building2 className="h-3.5 w-3.5 mr-1" />
                            Site
                          </Button>
                        </Link>
                        <Link href={`/admin/work-site-info/${site.siteId}`}>
                          <Button size="sm" variant="outline" className="text-xs w-full">
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            WSI
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Three compliance grids ── */}
        <div className="grid gap-4 md:grid-cols-3">

          {/* Deficiency Aging */}
          <ComplianceSection title="Deficiency Aging" icon={AlertTriangle} href="/admin/data-quality">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "0–30 days",  value: defAging.d0_30,   color: "text-muted-foreground" },
                  { label: "31–60 days", value: defAging.d31_60,  color: "text-yellow-600" },
                  { label: "61–90 days", value: defAging.d61_90,  color: "text-orange-600" },
                  { label: "90+ days",   value: defAging.d90plus, color: "text-red-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`rounded-lg border p-3 ${value > 0 && label !== "0–30 days" ? "border-red-100 dark:border-red-900/50" : ""}`}>
                    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {(ov?.openDeficiencies ?? 0) === 0 && (
                <p className="text-xs text-center text-green-600 py-1">No open deficiencies</p>
              )}
            </div>
          </ComplianceSection>

          {/* Report QA */}
          <ComplianceSection title="Report QA" icon={FileText} href="/admin/report-qa">
            <div className="space-y-1.5">
              <StatRow label="Field complete (no PDF)" value={reportQa.fieldComplete} />
              <StatRow label="Needs review"            value={reportQa.needsReview}        color="text-blue-600" />
              <StatRow label="Corrections required"    value={reportQa.correctionsRequired} color="text-orange-600" />
              <StatRow label="Approved, not sent"      value={reportQa.approvedNotSent}     color="text-yellow-600" />
              <StatRow label="Sent this week"          value={reportQa.sentThisWeek}        color="text-green-600" />
              {reportQa.needsReview === 0 && reportQa.correctionsRequired === 0 && reportQa.approvedNotSent === 0 && (
                <div className="flex items-center gap-2 py-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">QA queue is clear</span>
                </div>
              )}
            </div>
          </ComplianceSection>

          {/* Approved Work */}
          <ComplianceSection title="Approved Work" icon={CheckSquare} href="/admin/approved-work">
            <div className="space-y-1.5">
              <StatRow label="Approved, not scheduled"  value={awComp.approvedNotScheduled}  color="text-blue-600" />
              <StatRow label="Scheduled / In progress"  value={awComp.scheduledNotCompleted}  color="text-amber-600" />
              <StatRow label="Awaiting parts"           value={awComp.awaitingParts}          color="text-orange-600" />
              <StatRow label="Completed, not invoiced"  value={awComp.completedNotInvoiced}   color="text-red-600" />
              {awComp.approvedNotScheduled === 0 && awComp.completedNotInvoiced === 0 && (
                <div className="flex items-center gap-2 py-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">No open approved work issues</span>
                </div>
              )}
            </div>
          </ComplianceSection>
        </div>

        {/* ── Data Quality ── */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Data Quality Gaps
          </h2>
          <Card>
            <CardContent className="p-4">
              {dqComp.sitesMissingBuildingId === 0 &&
               dqComp.sitesMissingFileNumber === 0 &&
               dqComp.sitesMissingCustomerOrg === 0 &&
               dqComp.sitesMissingWorkSiteInfo === 0 &&
               dqComp.sitesMissingContacts === 0 ? (
                <div className="flex items-center gap-3 py-2">
                  <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                  <p className="text-sm text-muted-foreground">All {ov?.totalSites ?? 0} sites have complete data</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: "Missing Building ID",     value: dqComp.sitesMissingBuildingId,   urgent: true  },
                    { label: "Missing File Number",      value: dqComp.sitesMissingFileNumber,   urgent: false },
                    { label: "Missing Customer Org",     value: dqComp.sitesMissingCustomerOrg,  urgent: true  },
                    { label: "Missing Work Site Info",   value: dqComp.sitesMissingWorkSiteInfo, urgent: false },
                    { label: "Missing Contact Info",     value: dqComp.sitesMissingContacts,     urgent: false },
                  ].map(({ label, value, urgent }) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <Badge variant="outline" className={`text-xs ml-2 ${value > 0 && urgent ? "text-red-600 border-red-300" : value > 0 ? "text-amber-600 border-amber-300" : "text-green-600 border-green-300"}`}>
                        {value}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t">
                <Link href="/admin/data-quality">
                  <Button variant="outline" size="sm" className="text-xs">
                    <Database className="h-3.5 w-3.5 mr-1.5" />
                    Open Full Data Quality Report
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </AdminLayout>
  );
}
