import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { ShoppingCart, ChevronRight, AlertTriangle, Calendar } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  ordered: "Ordered",
  partially_received: "Partially Received",
  received: "Received",
  issued: "Issued",
  used: "Used",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  ordered: "bg-indigo-100 text-indigo-700",
  partially_received: "bg-yellow-100 text-yellow-700",
  received: "bg-teal-100 text-teal-700",
  issued: "bg-purple-100 text-purple-700",
  used: "bg-slate-100 text-slate-700",
  cancelled: "bg-red-100 text-red-600 line-through",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700 font-semibold",
};

const ALL_STATUSES = [
  "draft", "submitted", "approved", "ordered",
  "partially_received", "received", "issued", "used", "cancelled",
] as const;

// ─── Overview cards ────────────────────────────────────────────────────────────

function OverviewCards({ counts, urgentCount }: { counts: Record<string, number>; urgentCount: number }) {
  const tiles = [
    { label: "Draft",       key: "draft",       color: "text-gray-700"   },
    { label: "Submitted",   key: "submitted",   color: "text-blue-700"   },
    { label: "Approved",    key: "approved",    color: "text-green-700"  },
    { label: "Ordered",     key: "ordered",     color: "text-indigo-700" },
    { label: "Received",    key: "received",    color: "text-teal-700"   },
    { label: "Urgent",      key: "_urgent",     color: "text-red-600"    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {tiles.map((t) => (
        <Card key={t.key}>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${t.color}`}>
              {t.key === "_urgent" ? urgentCount : (counts[t.key] ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Request row ──────────────────────────────────────────────────────────────

function RequestRow({ req }: { req: any }) {
  const isOverdue =
    req.neededByDate &&
    !["used", "cancelled"].includes(req.status) &&
    new Date(req.neededByDate) < new Date();

  return (
    <Link href={`/admin/parts-requests/${req.id}`}>
      <div className="border rounded-lg bg-card px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-sm font-semibold">{req.requestNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-700"}`}>
                {STATUS_LABELS[req.status] ?? req.status}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[req.priority] ?? ""}`}>
                {req.priority}
              </span>
              {req.priority === "urgent" && (
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {req.customerOrgName && <span>Customer: <strong className="text-foreground">{req.customerOrgName}</strong></span>}
              {req.siteName && <span>Site: <strong className="text-foreground">{req.siteName}</strong></span>}
              {req.jobId && <span>Job #{req.jobId}</span>}
              {req.workOrderId && <span>WO #{req.workOrderId}</span>}
              {req.approvedWorkId && <span>AW #{req.approvedWorkId}</span>}
              <span>Requested by: <strong className="text-foreground">{req.requestedByName ?? `User #${req.requestedById}`}</strong></span>
              {req.neededByDate && (
                <span className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : ""}`}>
                  <Calendar className="h-3 w-3" />
                  Needed by: {String(req.neededByDate).slice(0, 10)}
                  {isOverdue && " (overdue)"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
            <span>{String(req.createdAt).slice(0, 10)}</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PartsRequests() {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [search, setSearch] = useState("");

  const { data: overview } = trpc.inventory.getOverview.useQuery();
  const { data: requests = [], isLoading } = trpc.inventory.listPartsRequests.useQuery(
    { status: (filterStatus as any) || undefined },
  );

  const filtered = requests.filter((r: any) => {
    if (filterPriority && r.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.requestNumber?.toLowerCase().includes(q) ||
        r.requestedByName?.toLowerCase().includes(q) ||
        r.siteName?.toLowerCase().includes(q) ||
        r.customerOrgName?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AdminLayout title="Parts Requests">
      {overview && (
        <OverviewCards
          counts={overview.requestCounts}
          urgentCount={overview.urgentRequests}
        />
      )}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="Request #, customer, site, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="min-w-[150px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus || "_all"} onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[130px]">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={filterPriority || "_all"} onValueChange={(v) => setFilterPriority(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="All priorities" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setFilterStatus("");
                setFilterPriority("");
                setSearch("");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Request list */}
      <div className="space-y-2">
        {isLoading && <p className="text-muted-foreground text-sm">Loading requests…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No parts requests found.</p>
          </div>
        )}
        {filtered.map((r: any) => <RequestRow key={r.id} req={r} />)}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {requests.length} requests
        </div>
      )}
    </AdminLayout>
  );
}
