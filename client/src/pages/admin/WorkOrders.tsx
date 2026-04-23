import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import {
  ClipboardList,
  Loader2,
  AlertCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusBadgeClass(status: string) {
  switch (status) {
    case "completed": return "status-pass";
    case "in_progress": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "cancelled": return "status-fail";
    case "scheduled": return "bg-accent/10 text-accent";
    default: return "bg-muted text-muted-foreground";
  }
}

function priorityBadgeClass(priority: string) {
  switch (priority) {
    case "urgent": return "severity-critical";
    case "high": return "severity-major";
    case "medium": return "severity-minor";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function AdminWorkOrders() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: workOrders, isLoading } = trpc.workOrder.listByCompany.useQuery(
    {
      companyId: user!.companyId!,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { enabled: !!user?.companyId }
  );

  return (
    <AdminLayout title="Work Orders">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              Work Orders
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All work orders for your company
            </p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary counts */}
        {workOrders && workOrders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["pending", "in_progress", "completed", "cancelled"] as const).map((s) => {
              const count = workOrders.filter((w) => w.status === s).length;
              return (
                <Card key={s} className="p-3">
                  <p className="text-xs text-muted-foreground capitalize">{s.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold mt-0.5">{count}</p>
                </Card>
              );
            })}
          </div>
        )}

        {/* List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? "Loading…" : `${workOrders?.length ?? 0} work order${workOrders?.length !== 1 ? "s" : ""}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !workOrders || workOrders.length === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No work orders found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {workOrders.map((wo) => (
                  <Link key={wo.id} href={`/admin/jobs/${wo.jobId}`}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{wo.workOrderNumber}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(wo.status)}`}>
                            {wo.status.replace(/_/g, " ")}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${priorityBadgeClass(wo.priority)}`}>
                            {wo.priority}
                          </span>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent">
                            {wo.workType.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="font-medium mt-0.5 truncate">{wo.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          {wo.scheduledDate && (
                            <span>{formatDate(wo.scheduledDate)}</span>
                          )}
                          {wo.estimatedHours && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {parseFloat(wo.estimatedHours).toFixed(1)} h est.
                            </span>
                          )}
                          {wo.actualHours && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {parseFloat(wo.actualHours).toFixed(1)} h actual
                            </span>
                          )}
                          {parseFloat(wo.total) > 0 && (
                            <span className="font-mono">
                              ${parseFloat(wo.total).toLocaleString("en-CA", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
