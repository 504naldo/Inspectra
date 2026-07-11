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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Truck,
  PackageCheck,
  Plus,
  AlertTriangle,
  Calendar,
  Store,
  Trash2,
} from "lucide-react";

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

// ─── Add Item dialog ──────────────────────────────────────────────────────────

function AddItemDialog({
  poId,
  open,
  onClose,
}: {
  poId: number;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: invItems = [] } = trpc.inventory.listInventory.useQuery({ includeInactive: false });
  const [form, setForm] = useState({
    description: "",
    quantityOrdered: "1",
    unitCost: "0",
    inventoryItemId: "",
    supplierPartNumber: "",
    notes: "",
  });

  const addMut = trpc.vendorPurchase.addPurchaseOrderItem.useMutation({
    onSuccess: () => {
      toast.success("Item added.");
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id: poId });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedInvItem = (invItems as any[]).find((i) => String(i.id) === form.inventoryItemId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Inventory Item (optional)</Label>
            <Select
              value={form.inventoryItemId || "_none"}
              onValueChange={(v) => {
                const inv = (invItems as any[]).find((i) => String(i.id) === v);
                setForm((p) => ({
                  ...p,
                  inventoryItemId: v === "_none" ? "" : v,
                  description: inv ? inv.name : p.description,
                  unitCost: inv ? String(Number(inv.unitCost ?? 0)) : p.unitCost,
                  supplierPartNumber: inv?.supplierPartNumber ?? p.supplierPartNumber,
                }));
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Link to inventory item (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No inventory link</SelectItem>
                {(invItems as any[]).map((i: any) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name} — {i.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description *</Label>
            <Input
              className="mt-1"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Part description"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Qty</Label>
              <Input
                type="number"
                min="1"
                className="mt-1"
                value={form.quantityOrdered}
                onChange={(e) => setForm((p) => ({ ...p, quantityOrdered: e.target.value }))}
              />
            </div>
            <div>
              <Label>Unit Cost ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="mt-1"
                value={form.unitCost}
                onChange={(e) => setForm((p) => ({ ...p, unitCost: e.target.value }))}
              />
            </div>
            <div>
              <Label>Supplier P/N</Label>
              <Input
                className="mt-1"
                value={form.supplierPartNumber}
                onChange={(e) => setForm((p) => ({ ...p, supplierPartNumber: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              className="mt-1"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          {selectedInvItem && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
              On hand: {selectedInvItem.quantityOnHand} · Reorder at: {selectedInvItem.reorderPoint}
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.description.trim() || addMut.isPending}
            onClick={() =>
              addMut.mutate({
                purchaseOrderId: poId,
                description: form.description.trim(),
                quantityOrdered: parseInt(form.quantityOrdered) || 1,
                unitCost: parseFloat(form.unitCost) || 0,
                inventoryItemId: form.inventoryItemId ? parseInt(form.inventoryItemId) : undefined,
                supplierPartNumber: form.supplierPartNumber.trim() || undefined,
                notes: form.notes.trim() || undefined,
              })
            }
          >
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Receive Items dialog ──────────────────────────────────────────────────────

function ReceiveItemsDialog({
  poId,
  items,
  open,
  onClose,
}: {
  poId: number;
  items: any[];
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const pendingItems = items.filter(
    (i) => (i.quantityReceived ?? 0) < i.quantityOrdered,
  );

  const [receipts, setReceipts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      pendingItems.map((i) => [
        i.id,
        String(i.quantityOrdered - (i.quantityReceived ?? 0)),
      ]),
    ),
  );

  const receiveMut = trpc.vendorPurchase.receiveItems.useMutation({
    onSuccess: (data) => {
      toast.success(`Items received. Status: ${data.newStatus.replace(/_/g, " ")}`);
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id: poId });
      utils.inventory.listInventory.invalidate();
      utils.inventory.getOverview.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Items</DialogTitle>
        </DialogHeader>
        {pendingItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">All items already received.</p>
        ) : (
          <div className="space-y-3">
            {pendingItems.map((item) => (
              <div key={item.id} className="border rounded p-3">
                <div className="font-medium text-sm mb-1">{item.description}</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Ordered: {item.quantityOrdered} · Previously received: {item.quantityReceived ?? 0}
                </div>
                <div>
                  <Label className="text-xs">Qty Receiving Now</Label>
                  <Input
                    type="number"
                    min="0"
                    max={item.quantityOrdered - (item.quantityReceived ?? 0)}
                    className="mt-1 h-7 w-24 text-sm"
                    value={receipts[item.id] ?? ""}
                    onChange={(e) =>
                      setReceipts((p) => ({ ...p, [item.id]: e.target.value }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={receiveMut.isPending || pendingItems.length === 0}
            onClick={() => {
              const validReceipts = pendingItems
                .map((i) => ({
                  itemId: i.id,
                  quantityReceived: parseInt(receipts[i.id] ?? "0") || 0,
                }))
                .filter((r) => r.quantityReceived > 0);
              if (validReceipts.length === 0) {
                toast.error("Enter at least one quantity to receive");
                return;
              }
              receiveMut.mutate({ id: poId, receipts: validReceipts });
            }}
          >
            <PackageCheck className="h-4 w-4 mr-1" /> Confirm Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit PO dialog ───────────────────────────────────────────────────────────

function EditPODialog({
  po,
  vendors,
  open,
  onClose,
}: {
  po: any;
  vendors: any[];
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [vendorId, setVendorId] = useState(po.vendorId ? String(po.vendorId) : "");
  const [priority, setPriority] = useState(po.priority ?? "medium");
  const [expectedDate, setExpectedDate] = useState(
    po.expectedDate ? String(po.expectedDate).slice(0, 10) : "",
  );
  const [notes, setNotes] = useState(po.notes ?? "");
  const [internalNotes, setInternalNotes] = useState(po.internalNotes ?? "");
  const [tax, setTax] = useState(String(Number(po.tax ?? 0)));
  const [shipping, setShipping] = useState(String(Number(po.shipping ?? 0)));

  const updateMut = trpc.vendorPurchase.updatePurchaseOrder.useMutation({
    onSuccess: () => {
      toast.success("PO updated.");
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id: po.id });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit PO {po.poNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vendor</Label>
            <Select value={vendorId || "_none"} onValueChange={(v) => setVendorId(v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="No vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No vendor</SelectItem>
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
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
              <Input type="date" className="mt-1" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
            <div>
              <Label>Tax ($)</Label>
              <Input type="number" min="0" step="0.01" className="mt-1" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <div>
              <Label>Shipping ($)</Label>
              <Input type="number" min="0" step="0.01" className="mt-1" value={shipping} onChange={(e) => setShipping(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Internal Notes</Label>
            <Textarea className="mt-1" rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Internal only" />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={updateMut.isPending}
            onClick={() =>
              updateMut.mutate({
                id: po.id,
                vendorId: vendorId ? parseInt(vendorId) : null,
                priority: priority as any,
                expectedDate: expectedDate || null,
                notes: notes.trim() || null,
                internalNotes: internalNotes.trim() || null,
                tax: parseFloat(tax) || 0,
                shipping: parseFloat(shipping) || 0,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Items table ──────────────────────────────────────────────────────────────

function ItemsTable({ poId, items, canEdit }: { poId: number; items: any[]; canEdit: boolean }) {
  const utils = trpc.useUtils();

  const removeMut = trpc.vendorPurchase.removePurchaseOrderItem.useMutation({
    onSuccess: () => {
      toast.success("Item removed.");
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id: poId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No items yet. Add items to this PO.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="pb-2 pr-4 font-medium">Description</th>
            <th className="pb-2 pr-3 font-medium text-right">Qty Ord</th>
            <th className="pb-2 pr-3 font-medium text-right">Qty Rec</th>
            <th className="pb-2 pr-3 font-medium text-right">Unit Cost</th>
            <th className="pb-2 pr-3 font-medium text-right">Line Total</th>
            {canEdit && <th className="pb-2 font-medium"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const received = item.quantityReceived ?? 0;
            const fullyReceived = received >= item.quantityOrdered;
            return (
              <tr key={item.id} className={`border-b last:border-0 ${fullyReceived ? "opacity-60" : ""}`}>
                <td className="py-2 pr-4">
                  <div>{item.description}</div>
                  {item.supplierPartNumber && (
                    <div className="text-xs text-muted-foreground">P/N: {item.supplierPartNumber}</div>
                  )}
                  {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                  {item.inventoryItemId && (
                    <div className="text-xs text-blue-600">→ Inv #{item.inventoryItemId}</div>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">{item.quantityOrdered}</td>
                <td className="py-2 pr-3 text-right">
                  <span className={received >= item.quantityOrdered ? "text-green-700 font-medium" : received > 0 ? "text-yellow-700" : ""}>
                    {received}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right">${Number(item.unitCost ?? 0).toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">${Number(item.lineTotal ?? 0).toFixed(2)}</td>
                {canEdit && (
                  <td className="py-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-red-600"
                      disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate({ id: item.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PurchaseOrderDetail({ id }: { id: number }) {
  const utils = trpc.useUtils();
  const [showAddItem, setShowAddItem] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const { data, isLoading } = trpc.vendorPurchase.getPurchaseOrder.useQuery({ id });
  const { data: vendors = [] } = trpc.vendorPurchase.listVendors.useQuery({ includeInactive: true });

  const readyMut = trpc.vendorPurchase.markReadyToOrder.useMutation({
    onSuccess: () => {
      toast.success("PO marked ready to order.");
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  const orderedMut = trpc.vendorPurchase.markOrdered.useMutation({
    onSuccess: () => {
      toast.success("PO marked ordered.");
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  const fullyReceivedMut = trpc.vendorPurchase.markFullyReceived.useMutation({
    onSuccess: () => {
      toast.success("PO marked fully received.");
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id });
      utils.inventory.getOverview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMut = trpc.vendorPurchase.cancelPurchaseOrder.useMutation({
    onSuccess: () => {
      toast.success("PO cancelled.");
      utils.vendorPurchase.getPurchaseOrder.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <AdminLayout><p className="text-muted-foreground text-sm">Loading…</p></AdminLayout>;
  }

  if (!data) {
    return <AdminLayout><p className="text-muted-foreground text-sm">Purchase order not found.</p></AdminLayout>;
  }

  const { po, items, vendor } = data;
  const status = po.status as string;

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue =
    po.expectedDate &&
    !["received", "cancelled"].includes(status) &&
    String(po.expectedDate).slice(0, 10) < today;

  const canEdit = !["received", "cancelled"].includes(status);
  const canMarkReady = status === "draft";
  const canMarkOrdered = ["draft", "ready_to_order"].includes(status);
  const canReceive = ["ordered", "partially_received"].includes(status);
  const canMarkFullyReceived = ["ordered", "partially_received"].includes(status);
  const canCancel = !["received", "cancelled"].includes(status);

  const subtotal = Number(po.subtotal ?? 0);
  const tax = Number(po.tax ?? 0);
  const shipping = Number(po.shipping ?? 0);
  const total = Number(po.total ?? 0);

  return (
    <AdminLayout>
      {/* Back */}
      <div className="mb-4">
        <Link href="/admin/purchase-orders">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Purchase Orders
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold font-mono">{po.poNumber}</h1>
            <span className={`text-sm px-2.5 py-0.5 rounded-full ${STATUS_COLORS[status] ?? "bg-muted"}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
            <span className={`text-sm px-2.5 py-0.5 rounded-full ${PRIORITY_COLORS[po.priority as string] ?? ""}`}>
              {po.priority}
            </span>
            {po.priority === "urgent" && <AlertTriangle className="h-4 w-4 text-red-600" />}
          </div>
          {isOverdue && (
            <div className="flex items-center gap-1 text-red-600 text-sm mt-1">
              <Calendar className="h-4 w-4" />
              Expected {String(po.expectedDate).slice(0, 10)} — overdue
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Edit PO</Button>
          )}
          {canMarkReady && (
            <Button size="sm" variant="outline" onClick={() => readyMut.mutate({ id })} disabled={readyMut.isPending}>
              <CheckCircle className="h-4 w-4 mr-1" /> Ready to Order
            </Button>
          )}
          {canMarkOrdered && (
            <Button size="sm" variant="outline" onClick={() => orderedMut.mutate({ id })} disabled={orderedMut.isPending}>
              <Truck className="h-4 w-4 mr-1" /> Mark Ordered
            </Button>
          )}
          {canReceive && (
            <Button size="sm" variant="outline" onClick={() => setShowReceive(true)}>
              <PackageCheck className="h-4 w-4 mr-1" /> Receive Items
            </Button>
          )}
          {canMarkFullyReceived && (
            <Button size="sm" variant="outline" onClick={() => fullyReceivedMut.mutate({ id })} disabled={fullyReceivedMut.isPending}>
              <CheckCircle className="h-4 w-4 mr-1" /> Mark Fully Received
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground"
              onClick={() => { if (confirm("Cancel this purchase order?")) cancelMut.mutate({ id }); }}
              disabled={cancelMut.isPending}
            >
              <XCircle className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Items + totals */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Line Items</CardTitle>
                {canEdit && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddItem(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ItemsTable poId={id} items={items} canEdit={canEdit} />

              {/* Totals */}
              {items.length > 0 && (
                <div className="mt-4 pt-4 border-t space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span>${shipping.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Vendor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="h-4 w-4" /> Vendor
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {vendor ? (
                <>
                  <div className="font-medium">{vendor.name}</div>
                  {vendor.contactName && <div className="text-muted-foreground">{vendor.contactName}</div>}
                  {vendor.phone && <div className="text-muted-foreground">{vendor.phone}</div>}
                  {vendor.email && <div className="text-muted-foreground">{vendor.email}</div>}
                  <div className="pt-1">
                    <Link href="/admin/vendors">
                      <span className="text-xs text-primary hover:underline cursor-pointer">View all vendors →</span>
                    </Link>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No vendor assigned. Edit PO to add one.</p>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{String(po.createdAt).slice(0, 10)}</span>
              </div>
              {po.orderDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ordered</span>
                  <span>{String(po.orderDate).slice(0, 10)}</span>
                </div>
              )}
              {po.expectedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected</span>
                  <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                    {String(po.expectedDate).slice(0, 10)}
                  </span>
                </div>
              )}
              {po.receivedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received</span>
                  <span className="text-green-700">{String(po.receivedDate).slice(0, 10)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked parts request */}
          {po.partsRequestId && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Linked Parts Request</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href={`/admin/parts-requests/${po.partsRequestId}`}>
                  <span className="text-sm text-primary hover:underline cursor-pointer">
                    Parts Request #{po.partsRequestId} →
                  </span>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {(po.notes || po.internalNotes) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                {po.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">General</p>
                    <p className="whitespace-pre-wrap">{po.notes}</p>
                  </div>
                )}
                {po.internalNotes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Internal</p>
                    <p className="whitespace-pre-wrap">{po.internalNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AddItemDialog poId={id} open={showAddItem} onClose={() => setShowAddItem(false)} />
      <ReceiveItemsDialog poId={id} items={items} open={showReceive} onClose={() => setShowReceive(false)} />
      {showEdit && (
        <EditPODialog
          po={po}
          vendors={vendors as any[]}
          open={showEdit}
          onClose={() => setShowEdit(false)}
        />
      )}
    </AdminLayout>
  );
}
