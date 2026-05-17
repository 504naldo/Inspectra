import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  CheckSquare,
  Wrench,
  Receipt,
  CheckCircle2,
  Building2,
  ArrowRight,
  RefreshCw,
  Plus,
  Flame,
  AlertOctagon,
  TrendingUp,
  Database,
  Bell,
  ShieldAlert,
  Info,
  Zap,
  BrainCircuit,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";

// ── Helper utilities ──────────────────────────────────────────────────────────

function dayLabel(n: number) {
  if (n === 0) return "Today";
  if (n === 1) return "1 day ago";
  return `${n}d ago`;
}

function statusColor(status: string): string {
  switch (status) {
    case "pending":       return "bg-muted text-muted-foreground";
    case "scheduled":     return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "in_progress":   return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "completed":     return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "cancelled":     return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "approved":      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "ready_to_schedule": return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
    case "draft":         return "bg-muted text-muted-foreground";
    case "sent":          return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    default:              return "bg-muted text-muted-foreground";
  }
}

function severityColor(s: string | null): string {
  switch (s) {
    case "critical":    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "major":       return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "minor":       return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "observation": return "bg-muted text-muted-foreground";
    default:            return "bg-muted text-muted-foreground";
  }
}

function priorityColor(p: string | null): string {
  switch (p) {
    case "urgent": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "high":   return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "low":    return "bg-muted text-muted-foreground";
    default:       return "bg-muted text-muted-foreground";
  }
}

function typeLabel(type: string): { label: string; color: string } {
  switch (type) {
    case "overdue_job":  return { label: "Overdue Job",    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
    case "deficiency":   return { label: "Deficiency",     color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
    case "approved_work":return { label: "Approved Work",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
    case "repair_quote": return { label: "Repair Quote",   color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" };
    default:             return { label: type,             color: "bg-muted text-muted-foreground" };
  }
}

const AW_STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  ready_to_schedule: "Ready to Schedule",
  scheduled: "Scheduled",
  assigned: "Assigned",
  in_progress: "In Progress",
  parts_required: "Parts Required",
  awaiting_parts: "Awaiting Parts",
  parts_ordered: "Parts Ordered",
  parts_received: "Parts Received",
  completed: "Completed",
  report_pending: "Report Pending",
  invoiced: "Invoiced",
  closed: "Closed",
  cancelled: "Cancelled",
};

const AW_STATUS_COLORS: Record<string, string> = {
  approved: "bg-blue-100 text-blue-700",
  ready_to_schedule: "bg-teal-100 text-teal-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  assigned: "bg-violet-100 text-violet-700",
  in_progress: "bg-amber-100 text-amber-700",
  parts_required: "bg-orange-100 text-orange-700",
  awaiting_parts: "bg-orange-100 text-orange-700",
  parts_ordered: "bg-yellow-100 text-yellow-700",
  parts_received: "bg-lime-100 text-lime-700",
  completed: "bg-green-100 text-green-700",
  report_pending: "bg-cyan-100 text-cyan-700",
  invoiced: "bg-emerald-100 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700",
};

// ── Snapshot card ─────────────────────────────────────────────────────────────

function SnapshotCard({
  icon: Icon,
  label,
  count,
  sub,
  href,
  urgent,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  sub?: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className={`cursor-pointer hover:shadow-md transition-shadow ${urgent && count > 0 ? "border-red-300 dark:border-red-800" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className={`p-2 rounded-lg ${urgent && count > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-primary/10"}`}>
              <Icon className={`h-4 w-4 ${urgent && count > 0 ? "text-red-600 dark:text-red-400" : "text-primary"}`} />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={`text-2xl font-bold mt-3 ${urgent && count > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{count}</div>
          <p className="text-sm font-medium mt-0.5">{label}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user } = useAuth();

  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  const { data: ops, isLoading, refetch, dataUpdatedAt } = trpc.dashboard.getOperationsSummary.useQuery(
    undefined,
    { staleTime: 60_000 }
  );

  const { data: topAlerts = [] } = trpc.notifications.list.useQuery(
    { filter: "all", limit: 5 },
    { staleTime: 60_000 }
  );
  const { data: unreadAlertCount = 0 } = trpc.notifications.getUnreadCount.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const generateAlerts = trpc.notifications.generateAlerts.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });
  const utils = trpc.useUtils();

  const [dashboardBriefing, setDashboardBriefing] = useState<{ summary: string; topPriorities: string[] } | null>(null);
  const dashboardBriefingMutation = trpc.aiAssistant.getAdminBriefing.useMutation({
    onSuccess: (data) => setDashboardBriefing({ summary: data.summary, topPriorities: data.topPriorities }),
    onError: () => setDashboardBriefing(null),
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  if (isLoading) {
    return (
      <AdminLayout title="Operations Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading operations summary…</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const snap = ops?.snapshot;

  return (
    <AdminLayout title="Operations Dashboard">
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, {user?.name?.split(" ")[0] || "Admin"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
              {lastUpdated && <span className="ml-2">· Updated {lastUpdated}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Link href="/admin/jobs">
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Job
              </Button>
            </Link>
            <Link href="/admin/sites">
              <Button size="sm" variant="outline">
                <Building2 className="h-3.5 w-3.5 mr-1.5" />
                Add Site
              </Button>
            </Link>
            <Link href="/admin/repair-quotes/new">
              <Button size="sm" variant="outline">
                <Wrench className="h-3.5 w-3.5 mr-1.5" />
                Repair Quote
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Snapshot Cards ── */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Operations Snapshot</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4">
            <SnapshotCard icon={Calendar}       label="Jobs Today"             count={snap?.jobsToday ?? 0}                    href="/admin/jobs" />
            <SnapshotCard icon={AlertOctagon}   label="Overdue Jobs"           count={snap?.overdueJobs ?? 0}                  href="/admin/jobs" urgent />
            <SnapshotCard icon={AlertTriangle}  label="Open Deficiencies"      count={snap?.openDeficiencies ?? 0}             href="/admin/reports" urgent={!!snap && snap.openDeficiencies > 0} />
            <SnapshotCard icon={CheckCircle2}   label="Completed This Week"    count={snap?.completedThisWeek ?? 0}            href="/admin/jobs" />
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 mt-3">
            <SnapshotCard icon={CheckSquare}    label="Ready to Schedule"      count={snap?.approvedWorkReadyToSchedule ?? 0}  href="/admin/approved-work" />
            <SnapshotCard icon={Wrench}         label="Repair Quotes Pending"  count={snap?.repairQuotesPending ?? 0}          href="/admin/repair-quotes" />
            <SnapshotCard icon={Receipt}        label="Invoices for Export"    count={snap?.invoicesReadyForExport ?? 0}       href="/admin/invoices" />
            <SnapshotCard icon={FileText}       label="Reports Pending Review" count={snap?.reportsPendingReview ?? 0}         href="/admin/report-qa" />
          </div>
        </div>

        {/* ── Attention Queue + Today's Schedule ── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Attention Queue */}
          <div className="lg:col-span-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Attention Queue</h2>
            <Card>
              <CardContent className="p-0">
                {!ops?.attentionQueue?.length ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <p className="font-medium text-sm">All caught up!</p>
                    <p className="text-xs text-muted-foreground">No overdue jobs, open deficiencies, or pending items.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {ops.attentionQueue.map((item, i) => {
                      const { label, color } = typeLabel(item.type);
                      return (
                        <Link key={`${item.type}-${item.id}-${i}`} href={item.link}>
                          <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${color}`}>{label}</span>
                                {item.severity && (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${severityColor(item.severity)}`}>{item.severity}</span>
                                )}
                                {item.priority && (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${priorityColor(item.priority)}`}>{item.priority}</span>
                                )}
                              </div>
                              <p className="text-sm font-medium truncate">{item.title}</p>
                              {item.siteName && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Building2 className="h-3 w-3 shrink-0" />
                                  {item.siteName}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted-foreground">{dayLabel(item.ageInDays)}</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${statusColor(item.status)}`}>{item.status.replace(/_/g, " ")}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Today's Schedule */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Today's Schedule
              {!!ops?.todaySchedule?.length && (
                <span className="ml-2 text-primary font-bold">{ops.todaySchedule.length}</span>
              )}
            </h2>
            <Card>
              <CardContent className="p-0">
                {!ops?.todaySchedule?.length ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
                    <Calendar className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Nothing scheduled today</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {ops.todaySchedule.map(item => (
                      <Link key={item.id} href={item.link}>
                        <div className="px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{item.title}</p>
                              <p className="text-xs text-muted-foreground">{item.jobNumber}</p>
                              {item.siteName && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Building2 className="h-3 w-3 shrink-0" />
                                  {item.siteName}
                                </p>
                              )}
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${statusColor(item.status)}`}>
                              {item.status.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Approved Work + Invoice Summary + Data Quality + Alerts ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

          {/* Approved Work Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                Approved Work
                <Link href="/admin/approved-work" className="ml-auto">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">View all <ArrowRight className="h-3 w-3 ml-1" /></Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!ops?.approvedWorkByStatus || Object.keys(ops.approvedWorkByStatus).length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">No approved work records yet</p>
                  <Link href="/admin/approved-work">
                    <Button variant="outline" size="sm" className="mt-2 text-xs">Open Approved Work</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(ops.approvedWorkByStatus)
                    .sort(([a], [b]) => {
                      const order = ["approved", "ready_to_schedule", "scheduled", "in_progress", "awaiting_parts", "completed", "closed", "cancelled"];
                      return (order.indexOf(a) ?? 99) - (order.indexOf(b) ?? 99);
                    })
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${AW_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
                          {AW_STATUS_LABELS[status] ?? status}
                        </span>
                        <span className="text-sm font-bold tabular-nums">{count}</span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice / Sage Prep */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Invoices / Sage Prep
                <Link href="/admin/invoices" className="ml-auto">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">View all <ArrowRight className="h-3 w-3 ml-1" /></Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!ops?.invoiceSummary || Object.values(ops.invoiceSummary).every(v => v === 0) ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">Invoice tracking not configured yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {([
                    ["draft",   "Draft",      "bg-muted text-muted-foreground"],
                    ["sent",    "Sent",        "bg-blue-100 text-blue-700"],
                    ["approved","Approved",    "bg-green-100 text-green-700"],
                    ["partial", "Partial",     "bg-yellow-100 text-yellow-700"],
                    ["overdue", "Overdue",     "bg-red-100 text-red-700"],
                    ["paid",    "Paid",        "bg-emerald-100 text-emerald-700"],
                    ["void",    "Void",        "bg-muted text-muted-foreground"],
                  ] as [keyof typeof ops.invoiceSummary, string, string][]).map(([key, label, cls]) => {
                    const count = ops.invoiceSummary[key] ?? 0;
                    if (count === 0) return null;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>{label}</span>
                        <span className="text-sm font-bold tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                  {(ops.snapshot?.invoicesReadyForExport ?? 0) > 0 && (
                    <div className="mt-3 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Ready for Sage Export</span>
                        <span className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">{ops.snapshot?.invoicesReadyForExport}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts / Notifications */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Alerts
                {unreadAlertCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {unreadAlertCount}
                  </span>
                )}
                <Link href="/admin/notifications" className="ml-auto">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">View all <ArrowRight className="h-3 w-3 ml-1" /></Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topAlerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-3 text-center">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  <p className="text-xs text-muted-foreground">No active alerts</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => generateAlerts.mutate()}
                    disabled={generateAlerts.isPending}
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    Scan
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {topAlerts.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      {a.severity === "critical" ? (
                        <ShieldAlert className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      ) : a.severity === "urgent" ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                      ) : a.severity === "warning" ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                      )}
                      <p className="text-xs leading-snug line-clamp-2">{a.title}</p>
                    </div>
                  ))}
                  {topAlerts.length > 4 && (
                    <Link href="/admin/notifications">
                      <p className="text-xs text-primary hover:underline cursor-pointer">
                        +{topAlerts.length - 4} more alerts
                      </p>
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Quality */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Data Quality
                <Link href="/admin/data-quality" className="ml-auto">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">View all <ArrowRight className="h-3 w-3 ml-1" /></Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!ops?.dataQuality ? (
                <p className="text-xs text-muted-foreground">No data</p>
              ) : (ops.dataQuality.sitesMissingBuildingId === 0 &&
                   ops.dataQuality.sitesMissingFileNumber === 0 &&
                   ops.dataQuality.sitesMissingCustomerOrg === 0) ? (
                <div className="flex flex-col items-center gap-2 py-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  <p className="text-xs text-muted-foreground">All {ops.totalSites} sites have complete data</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ops.dataQuality.sitesMissingBuildingId > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs">Missing Building ID</span>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">{ops.dataQuality.sitesMissingBuildingId}</Badge>
                    </div>
                  )}
                  {ops.dataQuality.sitesMissingFileNumber > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs">Missing File Number</span>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">{ops.dataQuality.sitesMissingFileNumber}</Badge>
                    </div>
                  )}
                  {ops.dataQuality.sitesMissingCustomerOrg > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs">Missing Customer Org</span>
                      <Badge variant="outline" className="text-xs text-red-600 border-red-300">{ops.dataQuality.sitesMissingCustomerOrg}</Badge>
                    </div>
                  )}
                  <Link href="/admin/data-quality">
                    <Button variant="outline" size="sm" className="w-full mt-1 text-xs">View Data Quality</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── AI Copilot Widget ── */}
        <Card className="border-primary/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" />
                AI Copilot
              </CardTitle>
              <Link href="/admin/ai-assistant">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  Open <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {dashboardBriefing ? (
              <div className="space-y-2 mb-3">
                <p className="text-xs text-muted-foreground">{dashboardBriefing.summary}</p>
                {dashboardBriefing.topPriorities.slice(0, 2).map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {p}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">
                Get an AI summary of today's priorities, risks, and recommended actions.
              </p>
            )}
            <Button
              size="sm"
              variant={dashboardBriefing ? "outline" : "default"}
              className="gap-1.5 text-xs h-7"
              onClick={() => dashboardBriefingMutation.mutate({ timeframe: "today" })}
              disabled={dashboardBriefingMutation.isPending}
            >
              {dashboardBriefingMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <BrainCircuit className="h-3 w-3" />
              }
              {dashboardBriefing ? "Refresh Briefing" : "Generate Daily Briefing"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Footer Summary ── */}
        {ops && (
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-4">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {ops.totalSites} site{ops.totalSites !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5" />
              {ops.totalJobs} total job{ops.totalJobs !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {ops.snapshot.completedThisWeek} completed this week
            </span>
            <Link href="/admin/schedule" className="ml-auto flex items-center gap-1.5 hover:text-primary transition-colors">
              <Calendar className="h-3.5 w-3.5" />
              Open Schedule
            </Link>
            <Link href="/admin/compliance" className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <ShieldAlert className="h-3.5 w-3.5" />
              Compliance
            </Link>
            <Link href="/admin/customer-records" className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <FileText className="h-3.5 w-3.5" />
              Customer Records
            </Link>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
