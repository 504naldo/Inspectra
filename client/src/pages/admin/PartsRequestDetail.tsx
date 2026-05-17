import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  PackageCheck,
  Truck,
  Wrench,
  ShoppingCart,
  AlertTriangle,
  Calendar,
} from "lucide-react";

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
  cancelled: "bg-red-100 text-red-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700 font-semibold",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  requested: "bg-gray-100 text-gray-700",
  approved: "bg-green-100 text-green-700",
  ordered: "bg-indigo-100 text-indigo-700",
  received: "bg-teal-100 text-teal-700",
  issued: "bg-purple-100 text-purple-700",
  used: "bg-slate-100 text-slate-700",
  unavailable: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-500 line-through",
};

// ─── Approve dialog ────────────────────────────────────────────────────────────

function ApproveDialog({
  requestId,
  items,
  open,
  onClose,
}: {
  requestId: number;
  items: any[];
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [approvals, setApprovals] = useState<Record<number, { qty: string; status: "approved" | "unavailable" }>>(() =>
    Object.fromEntries(items.map((i) => [i.id, { qty: String(i.quantityRequested), status: "approved" as const }]))
  );

  const approveMut = trpc.inventory.approvePartsRequest.useMutation({
    onSuccess: () => {
      toast.success("Parts request approved.");
      utils.inventory.getPartsRequest.invalidate({ id: requestId });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve Parts Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded p-3 space-y-2">
              <div className="font-medium text-sm">{item.description}</div>
              <div className="text-xs text-muted-foreground">Requested: {item.quantityRequested}</div>
              <div className="flex gap-3">
                <div>
                  <Label className="text-xs">Qty Approved</Label>
                  <Input
                    type="number"
                    min="0"
                    max={item.quantityRequested}
                    className="mt-1 h-7 w-20 text-sm"
                    value={approvals[item.id]?.qty ?? ""}
                    onChange={(e) =>
                      setApprovals((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], qty: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <select
                    className="mt-1 h-7 text-sm border rounded px-2 bg-background"
                    value={approvals[item.id]?.status ?? "approved"}
                    onChange={(e) =>
                      setApprovals((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], status: e.target.value as "approved" | "unavailable" },
                      }))
                    }
                  >
                    <option value="approved">Approved</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={approveMut.isPending}
            onClick={() =>
              approveMut.mutate({
                id: requestId,
                itemApprovals: items.map((i) => ({
                  itemId: i.id,
                  quantityApproved: parseInt(approvals[i.id]?.qty ?? "0") || 0,
                  status: approvals[i.id]?.status ?? "approved",
                })),
              })
            }
          >
            <CheckCircle className="h-4 w-4 mr-1" /> Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark Ordered dialog ───────────────────────────────────────────────────────

function MarkOrderedDialog({
  requestId,
  items,
  open,
  onClose,
}: {
  requestId: number;
  items: any[];
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const approvedItems = items.filter((i) => i.status === "approved");
  const [orders, setOrders] = useState<Record<number, string>>(() =>
    Object.fromEntries(approvedItems.map((i) => [i.id, String(i.quantityApproved)]))
  );

  const markOrderedMut = trpc.inventory.markOrdered.useMutation({
    onSuccess: () => {
      toast.success("Parts marked as ordered.");
      utils.inventory.getPartsRequest.invalidate({ id: requestId });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark Parts Ordered</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {approvedItems.length === 0 && (
            <p className="text-muted-foreground text-sm">No approved items to order.</p>
          )}
          {approvedItems.map((item) => (
            <div key={item.id} className="border rounded p-3 space-y-2">
              <div className="font-medium text-sm">{item.description}</div>
              <div className="text-xs text-muted-foreground">Approved: {item.quantityApproved}</div>
              <div>
                <Label className="text-xs">Qty Ordered</Label>
                <Input
                  type="number"
                  min="1"
                  className="mt-1 h-7 w-20 text-sm"
                  value={orders[item.id] ?? ""}
                  onChange={(e) =>
                    setOrders((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={markOrderedMut.isPending || approvedItems.length === 0}
            onClick={() =>
              markOrderedMut.mutate({
                id: requestId,
                itemOrders: approvedItems.map((i) => ({
                  itemId: i.id,
                  quantityOrdered: parseInt(orders[i.id] ?? "0") || 0,
                })),
              })
            }
          >
            <Truck className="h-4 w-4 mr-1" /> Mark Ordered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark Received dialog ──────────────────────────────────────────────────────

function MarkReceivedDialog({
  requestId,
  items,
  open,
  onClose,
}: {
  requestId: number;
  items: any[];
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const orderedItems = items.filter((i) => ["ordered", "approved"].includes(i.status));
  const [receipts, setReceipts] = useState<Record<number, string>>(() =>
    Object.fromEntries(orderedItems.map((i) => [i.id, String(i.quantityOrdered || i.quantityApproved || i.quantityRequested)]))
  );

  const markReceivedMut = trpc.inventory.markReceived.useMutation({
    onSuccess: () => {
      toast.success("Parts marked as received.");
      utils.inventory.getPartsRequest.invalidate({ id: requestId });
      utils.inventory.getOverview.invalidate();
      utils.inventory.listInventory.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark Parts Received</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {orderedItems.length === 0 && (
            <p className="text-muted-foreground text-sm">No items awaiting receipt.</p>
          )}
          {orderedItems.map((item) => (
            <div key={item.id} className="border rounded p-3 space-y-2">
              <div className="font-medium text-sm">{item.description}</div>
              <div className="text-xs text-muted-foreground">
                Ordered: {item.quantityOrdered ?? "—"} | Previously received: {item.quantityReceived ?? 0}
              </div>
              <div>
                <Label className="text-xs">Qty Received Now</Label>
                <Input
                  type="number"
                  min="1"
                  className="mt-1 h-7 w-20 text-sm"
                  value={receipts[item.id] ?? ""}
                  onChange={(e) =>
                    setReceipts((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={markReceivedMut.isPending || orderedItems.length === 0}
            onClick={() =>
              markReceivedMut.mutate({
                id: requestId,
                itemReceipts: orderedItems.map((i) => ({
                  itemId: i.id,
                  quantityReceived: parseInt(receipts[i.id] ?? "0") || 0,
                })),
              })
            }
          >
            <PackageCheck className="h-4 w-4 mr-1" /> Mark Received
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Items table ──────────────────────────────────────────────────────────────

function ItemsTable({ items }: { items: any[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No items on this request.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="pb-2 pr-4 font-medium">Description</th>
            <th className="pb-2 pr-3 font-medium text-right">Req</th>
            <th className="pb-2 pr-3 font-medium text-right">App</th>
            <th className="pb-2 pr-3 font-medium text-right">Ord</th>
            <th className="pb-2 pr-3 font-medium text-right">Rec</th>
            <th className="pb-2 pr-3 font-medium text-right">Used</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-2 pr-4">
                <div>{item.description}</div>
                {item.notes && (
                  <div className="text-xs text-muted-foreground mt-0.5">{item.notes}</div>
                )}
                {(item.unitCost || item.unitPrice) && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.unitCost ? `Cost: $${Number(item.unitCost).toFixed(2)}` : ""}
                    {item.unitCost && item.unitPrice ? " · " : ""}
                    {item.unitPrice ? `Price: $${Number(item.unitPrice).toFixed(2)}` : ""}
                  </div>
                )}
              </td>
              <td className="py-2 pr-3 text-right">{item.quantityRequested}</td>
              <td className="py-2 pr-3 text-right">{item.quantityApproved ?? "—"}</td>
              <td className="py-2 pr-3 text-right">{item.quantityOrdered ?? "—"}</td>
              <td className="py-2 pr-3 text-right">{item.quantityReceived ?? "—"}</td>
              <td className="py-2 pr-3 text-right">{item.quantityUsed ?? "—"}</td>
              <td className="py-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${ITEM_STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {item.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PartsRequestDetail({ id }: { id: number }) {
  const utils = trpc.useUtils();
  const [showApprove, setShowApprove] = useState(false);
  const [showOrdered, setShowOrdered] = useState(false);
  const [showReceived, setShowReceived] = useState(false);

  const { data, isLoading } = trpc.inventory.getPartsRequest.useQuery({ id });

  const submitMut = trpc.inventory.submitPartsRequest.useMutation({
    onSuccess: () => {
      toast.success("Request submitted.");
      utils.inventory.getPartsRequest.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  const issueMut = trpc.inventory.issueParts.useMutation({
    onSuccess: () => {
      toast.success("Parts issued.");
      utils.inventory.getPartsRequest.invalidate({ id });
      utils.inventory.getOverview.invalidate();
      utils.inventory.listInventory.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMut = trpc.inventory.cancelPartsRequest.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled.");
      utils.inventory.getPartsRequest.invalidate({ id });
      utils.inventory.getOverview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout>
        <p className="text-muted-foreground text-sm">Parts request not found.</p>
      </AdminLayout>
    );
  }

  const { request: req, items } = data;
  const status = req.status as string;

  const canSubmit = status === "draft";
  const canApprove = status === "submitted" || status === "draft";
  const canMarkOrdered = status === "approved";
  const canMarkReceived = status === "ordered" || status === "partially_received";
  const canIssue = status === "received" || status === "partially_received" || status === "approved";
  const canCancel = !["used", "cancelled"].includes(status);

  const isOverdue =
    req.neededByDate &&
    canCancel &&
    new Date(req.neededByDate as string) < new Date();

  return (
    <AdminLayout>
      {/* Back nav */}
      <div className="mb-4">
        <Link href="/admin/parts-requests">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Parts Requests
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold font-mono">{req.requestNumber}</h1>
            <span className={`text-sm px-2.5 py-0.5 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
            <span className={`text-sm px-2.5 py-0.5 rounded-full ${PRIORITY_COLORS[req.priority as string] ?? ""}`}>
              {req.priority}
            </span>
            {req.priority === "urgent" && (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
          </div>
          {isOverdue && (
            <div className="flex items-center gap-1 text-red-600 text-sm mt-1">
              <Calendar className="h-4 w-4" />
              Needed by {String(req.neededByDate).slice(0, 10)} — overdue
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {canSubmit && (
            <Button size="sm" onClick={() => submitMut.mutate({ id })} disabled={submitMut.isPending}>
              <ShoppingCart className="h-4 w-4 mr-1" /> Submit
            </Button>
          )}
          {canApprove && (
            <Button size="sm" variant="outline" onClick={() => setShowApprove(true)}>
              <CheckCircle className="h-4 w-4 mr-1" /> Approve
            </Button>
          )}
          {canMarkOrdered && (
            <Button size="sm" variant="outline" onClick={() => setShowOrdered(true)}>
              <Truck className="h-4 w-4 mr-1" /> Mark Ordered
            </Button>
          )}
          {canMarkReceived && (
            <Button size="sm" variant="outline" onClick={() => setShowReceived(true)}>
              <PackageCheck className="h-4 w-4 mr-1" /> Mark Received
            </Button>
          )}
          {canIssue && (
            <Button size="sm" variant="outline" onClick={() => issueMut.mutate({ id })} disabled={issueMut.isPending}>
              <Wrench className="h-4 w-4 mr-1" /> Issue Parts
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground"
              onClick={() => {
                if (confirm("Cancel this parts request?")) cancelMut.mutate({ id });
              }}
              disabled={cancelMut.isPending}
            >
              <XCircle className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Requested Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemsTable items={items} />
            </CardContent>
          </Card>
        </div>

        {/* Details sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested by</span>
                <span className="font-medium">{(req as any).requestedByName ?? `User #${req.requestedById}`}</span>
              </div>
              {(req as any).assignedToName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned to</span>
                  <span className="font-medium">{(req as any).assignedToName}</span>
                </div>
              )}
              {req.neededByDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Needed by</span>
                  <span className={`font-medium ${isOverdue ? "text-red-600" : ""}`}>
                    {String(req.neededByDate).slice(0, 10)}
                  </span>
                </div>
              )}
              {req.submittedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submitted</span>
                  <span>{String(req.submittedAt).slice(0, 10)}</span>
                </div>
              )}
              {req.approvedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved</span>
                  <span>{String(req.approvedAt).slice(0, 10)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{String(req.createdAt).slice(0, 10)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Linked to */}
          {(req.siteId || req.jobId || req.workOrderId || req.approvedWorkId || req.customerOrgId) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Linked To</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {req.customerOrgId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer</span>
                    <Link href={`/admin/customers/${req.customerOrgId}`}>
                      <span className="text-primary hover:underline cursor-pointer">
                        {(req as any).customerOrgName ?? `#${req.customerOrgId}`}
                      </span>
                    </Link>
                  </div>
                )}
                {req.siteId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Site</span>
                    <Link href={`/admin/sites/${req.siteId}`}>
                      <span className="text-primary hover:underline cursor-pointer">
                        {(req as any).siteName ?? `#${req.siteId}`}
                      </span>
                    </Link>
                  </div>
                )}
                {req.jobId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Job</span>
                    <Link href={`/admin/jobs/${req.jobId}`}>
                      <span className="text-primary hover:underline cursor-pointer">Job #{req.jobId}</span>
                    </Link>
                  </div>
                )}
                {req.workOrderId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Work Order</span>
                    <Link href={`/admin/work-orders/${req.workOrderId}`}>
                      <span className="text-primary hover:underline cursor-pointer">WO #{req.workOrderId}</span>
                    </Link>
                  </div>
                )}
                {req.approvedWorkId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved Work</span>
                    <Link href={`/admin/approved-work/${req.approvedWorkId}`}>
                      <span className="text-primary hover:underline cursor-pointer">AW #{req.approvedWorkId}</span>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {req.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{req.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ApproveDialog
        requestId={id}
        items={items}
        open={showApprove}
        onClose={() => setShowApprove(false)}
      />
      <MarkOrderedDialog
        requestId={id}
        items={items}
        open={showOrdered}
        onClose={() => setShowOrdered(false)}
      />
      <MarkReceivedDialog
        requestId={id}
        items={items}
        open={showReceived}
        onClose={() => setShowReceived(false)}
      />
    </AdminLayout>
  );
}
