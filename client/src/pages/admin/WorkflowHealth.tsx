import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Clock,
  FileText,
  Wrench,
  CheckSquare,
  Receipt,
  Users,
  Package,
  Activity,
  Info,
  Loader2,
  Building2,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import type { BottleneckItem, BottleneckSeverity } from "../../../../server/routers/workflowHealthRouter";

// ── Helpers ────────────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, React.ElementType> = {
  report_qa:       FileText,
  repair_quotes:   Wrench,
  approved_work:   CheckSquare,
  work_orders:     Wrench,
  invoices:        Receipt,
  payroll:         Users,
  inventory_parts: Package,
};

const SEVERITY_COLORS: Record<BottleneckSeverity, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  warning:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  info:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const SEVERITY_ICONS: Record<BottleneckSeverity, React.ElementType> = {
  critical: AlertOctagon,
  warning:  AlertTriangle,
  info:     Info,
};

function ageLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

// ── Overview card ──────────────────────────────────────────────────────────────

function OverviewCard({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  colorClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClass ? colorClass : "bg-primary/10"}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Bottleneck item row ────────────────────────────────────────────────────────

function BottleneckRow({ item }: { item: BottleneckItem }) {
  const SevIcon = SEVERITY_ICONS[item.severity];
  const sevClass = SEVERITY_COLORS[item.severity];

  return (
    <Link href={item.href}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors border-b last:border-b-0">
        <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${
          item.severity === "critical"
            ? "text-red-500"
            : item.severity === "warning"
            ? "text-amber-500"
            : "text-blue-500"
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          {(item.customerOrgName || item.siteName) && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" />
              {[item.customerOrgName, item.siteName].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1 italic leading-snug">{item.reason}</p>
          <p className="text-xs text-primary mt-1 leading-snug">{item.suggestedNextAction}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${sevClass}`}>
            {item.severity}
          </span>
          <span className="text-xs text-muted-foreground">{ageLabel(item.ageDays)}</span>
          {item.subtitle && (
            <span className="text-xs font-mono text-muted-foreground">{item.subtitle}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Module group ───────────────────────────────────────────────────────────────

function ModuleGroup({
  module,
  label,
  count,
  items,
}: {
  module: string;
  label: string;
  count: number;
  items: BottleneckItem[];
}) {
  const Icon = MODULE_ICONS[module] ?? Activity;
  const hasCritical = items.some((i) => i.severity === "critical");

  return (
    <Card className={hasCritical ? "border-red-200 dark:border-red-800" : undefined}>
      <CardHeader className="pb-0 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${hasCritical ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"}`}>
            <Icon className={`h-3.5 w-3.5 ${hasCritical ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
          </div>
          {label}
          <Badge
            className={`ml-1 text-[10px] px-1.5 py-0 ${hasCritical ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}
          >
            {count}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 mt-3">
        <div>
          {items.map((item, i) => (
            <BottleneckRow key={`${item.entityType}-${item.entityId}-${i}`} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function WorkflowHealthPage() {
  const { data, isLoading, refetch, dataUpdatedAt } = trpc.workflowHealth.getSummary.useQuery(
    undefined,
    { staleTime: 120_000 }
  );

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const ov = data?.overview;

  return (
    <AdminLayout title="Workflow Health">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-words flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary shrink-0" />
              Workflow Health
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 break-words">
              Identifies stuck or delayed records across all operational modules.
              {lastUpdated && <span className="ml-1">Last updated {lastUpdated}.</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center items-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Scanning workflow…</p>
            </div>
          </div>
        )}

        {!isLoading && data && (
          <>
            {/* Overview cards */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Overview
              </h2>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <OverviewCard
                  icon={AlertOctagon}
                  label="Total Bottlenecks"
                  value={ov?.totalBottlenecks ?? 0}
                  colorClass={ov?.totalBottlenecks ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-green-100 text-green-600"}
                />
                <OverviewCard
                  icon={AlertTriangle}
                  label="Critical"
                  value={ov?.criticalBottlenecks ?? 0}
                  colorClass={ov?.criticalBottlenecks ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted text-muted-foreground"}
                />
                <OverviewCard
                  icon={Receipt}
                  label="Revenue Blocked"
                  value={ov?.revenueBlocked ?? 0}
                  colorClass={ov?.revenueBlocked ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30" : "bg-muted text-muted-foreground"}
                />
                <OverviewCard
                  icon={FileText}
                  label="Compliance Blocked"
                  value={ov?.complianceBlocked ?? 0}
                  colorClass={ov?.complianceBlocked ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30" : "bg-muted text-muted-foreground"}
                />
              </div>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 mt-3">
                <OverviewCard
                  icon={ArrowRight}
                  label="Customer Follow-ups"
                  value={ov?.customerFollowupsNeeded ?? 0}
                  colorClass={ov?.customerFollowupsNeeded ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30" : "bg-muted text-muted-foreground"}
                />
                <OverviewCard
                  icon={Clock}
                  label="Overdue Items"
                  value={ov?.overdueItems ?? 0}
                  colorClass={ov?.overdueItems ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted text-muted-foreground"}
                />
                <OverviewCard
                  icon={RefreshCw}
                  label="Stale (14+ days)"
                  value={ov?.staleItems ?? 0}
                  colorClass={ov?.staleItems ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30" : "bg-muted text-muted-foreground"}
                />
              </div>
            </div>

            {/* All clear */}
            {data.groups.length === 0 && (
              <div className="rounded-lg border bg-muted/30 p-12 text-center space-y-3">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
                <p className="font-semibold text-lg">Workflow is healthy</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  No stuck or overdue items found across Report QA, Repair Quotes, Approved Work,
                  Work Orders, Invoices, Payroll, or Parts Requests.
                </p>
              </div>
            )}

            {/* Bottleneck groups */}
            {data.groups.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Bottlenecks by Module
                </h2>
                {data.groups.map((group) => (
                  <ModuleGroup
                    key={group.module}
                    module={group.module}
                    label={group.label}
                    count={group.count}
                    items={group.items}
                  />
                ))}
              </div>
            )}

            {/* Footer */}
            <p className="text-xs text-muted-foreground text-center pb-2">
              Read-only view — this page identifies issues but does not modify any records.
              Generated at {new Date(data.generatedAt).toLocaleTimeString()}.
            </p>
          </>
        )}

      </div>
    </AdminLayout>
  );
}
