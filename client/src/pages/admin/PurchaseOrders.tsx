import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { ClipboardPen, Plus, ChevronRight, AlertTriangle, Calendar } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready_to_order: "Ready to Order",
  ordered: "Ordered",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready_to_order: "bg-blue-100 text-blue-700",
  ordered: "bg-indigo-100 text-indigo-700",
  partially_received: "bg-yellow-100 text-yellow-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700 font-semibold",
};

const ALL_STATUSES = [
  "draft", "ready_to_order", "ordered", "partially_received", "received", "cancelled",
] as const;

// ─── Overview cards ────────────────────────────────────────────────────────────

function OverviewCards({ counts, urgentCount, overdueCount }: {
  counts: Record<string, number>;
  urgentCount: number;
  overdueCount: number;
}) {
  const tiles = [
    { label: "Draft",            key: "draft",            color: "text-muted-foreground"   },
    { label: "Ready to Order",   key: "ready_to_order",   color: "text-blue-700"   },
    { label: "Ordered",          key: "ordered",          color: "text-indigo-700" },
    { label: "Part. Received",   key: "partially_received", color: "text-yellow-700" },
    { label: "Urgent",           key: "_urgent",          color: "text-red-600"    },
    { label: "Overdue",          key: "_overdue",         color: "text-orange-600" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {tiles.map((t) => (
        <Card key={t.key}>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${t.color}`}>
              {t.key === "_urgent"
                ? urgentCount
                : t.key === "_overdue"
                  ? overdueCount
                  : (counts[t.key] ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Create PO dialog ─────────────────────────────────────────────────────────

function CreatePODialog({
  open,
  onClose,
  vendors,
}: {
  open: boolean;
  onClose: () => void;
  vendors: any[];
}) {
  const [, navigate] = useLocation();
  const [vendorId, setVendorId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  const createMut = trpc.vendorPurchase.createPurchaseOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`PO ${data.poNumber} created.`);
      onClose();
      navigate(`/admin/purchase-orders/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Purchase Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vendor</Label>
            <Select value={vendorId || "_none"} onValueChange={(v) => setVendorId(v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select vendor (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No vendor yet</SelectItem>
                {vendors.map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expected Date</Label>
              <Input
                type="date"
                className="mt-1"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={createMut.isPending}
            onClick={() =>
              createMut.mutate({
                vendorId: vendorId ? parseInt(vendorId) : undefined,
                priority: priority as any,
                expectedDate: expectedDate || undefined,
                notes: notes.trim() || undefined,
              })
            }
          >
            Create PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PO row ───────────────────────────────────────────────────────────────────

function PORow({ po, vendorMap }: { po: any; vendorMap: Map<number, string> }) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue =
    po.expectedDate &&
    !["received", "cancelled"].includes(po.status) &&
    String(po.expectedDate).slice(0, 10) < today;

  return (
    <Link href={`/admin/purchase-orders/${po.id}`}>
      <div className="border rounded-lg bg-card px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-sm font-semibold">{po.poNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[po.status] ?? "bg-muted"}`}>
                {STATUS_LABELS[po.status] ?? po.status}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[po.priority] ?? ""}`}>
                {po.priority}
              </span>
              {po.priority === "urgent" && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {po.vendorId && vendorMap.has(po.vendorId) && (
                <span>Vendor: <strong className="text-foreground">{vendorMap.get(po.vendorId)}</strong></span>
              )}
              {po.expectedDate && (
                <span className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : ""}`}>
                  <Calendar className="h-3 w-3" />
                  Expected: {String(po.expectedDate).slice(0, 10)}
                  {isOverdue && " (overdue)"}
                </span>
              )}
              {po.total && Number(po.total) > 0 && (
                <span>Total: <strong className="text-foreground">${Number(po.total).toFixed(2)}</strong></span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
            <span>{String(po.createdAt).slice(0, 10)}</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PurchaseOrders() {
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [search, setSearch] = useState("");

  const { data: overview } = trpc.vendorPurchase.getOverview.useQuery();
  const { data: pos = [], isLoading } = trpc.vendorPurchase.listPurchaseOrders.useQuery(
    { status: (filterStatus as any) || undefined },
  );
  const { data: vendors = [] } = trpc.vendorPurchase.listVendors.useQuery({ includeInactive: false });

  const vendorMap = new Map((vendors as any[]).map((v) => [v.id, v.name]));
  const today = new Date().toISOString().slice(0, 10);

  const filtered = (pos as any[]).filter((p) => {
    if (filterVendor && String(p.vendorId) !== filterVendor) return false;
    if (filterPriority && p.priority !== filterPriority) return false;
    if (filterOverdue) {
      const isOverdue = p.expectedDate && String(p.expectedDate).slice(0, 10) < today && !["received", "cancelled"].includes(p.status);
      if (!isOverdue) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        p.poNumber?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q) ||
        vendorMap.get(p.vendorId)?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AdminLayout title="Purchase Orders">
      {overview && (
        <OverviewCards
          counts={overview.counts}
          urgentCount={overview.urgentCount}
          overdueCount={overview.overdueCount}
        />
      )}

      {/* Actions + filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New PO
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="PO #, vendor, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="min-w-[150px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus || "_all"} onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Vendor</Label>
              <Select value={filterVendor || "_all"} onValueChange={(v) => setFilterVendor(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All vendors</SelectItem>
                  {(vendors as any[]).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px]">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={filterPriority || "_all"} onValueChange={(v) => setFilterPriority(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterOverdue}
                  onChange={(e) => setFilterOverdue(e.target.checked)}
                  className="rounded"
                />
                Overdue only
              </label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setFilterStatus("");
                setFilterVendor("");
                setFilterPriority("");
                setFilterOverdue(false);
                setSearch("");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-2">
        {isLoading && <p className="text-muted-foreground text-sm">Loading purchase orders…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardPen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No purchase orders found.</p>
          </div>
        )}
        {filtered.map((p: any) => <PORow key={p.id} po={p} vendorMap={vendorMap} />)}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {(pos as any[]).length} purchase orders
        </div>
      )}

      <CreatePODialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        vendors={vendors as any[]}
      />
    </AdminLayout>
  );
}
