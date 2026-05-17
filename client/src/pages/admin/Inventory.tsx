import { useState } from "react";
import { useLocation } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Package,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MinusCircle,
  PlusCircle,
  History,
  Link2,
  ShoppingCart,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

const TRANSACTION_LABELS: Record<string, string> = {
  initial_count: "Initial Count",
  adjustment: "Adjustment",
  reserved: "Reserved",
  unreserved: "Unreserved",
  ordered: "Ordered",
  received: "Received",
  issued: "Issued",
  used: "Used",
  returned: "Returned",
  removed: "Removed",
};

// ─── Overview cards ────────────────────────────────────────────────────────────

function OverviewCards({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold">{data.totalActiveItems}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Active Items</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-yellow-600">{data.lowStockCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Low Stock</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-red-600">{data.outOfStockCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Out of Stock</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-blue-600">{data.reservedItemsCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">With Reservations</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-orange-600">{data.urgentRequests}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Urgent Requests</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-green-700">
            ${Number(data.inventoryValue).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Stock Value</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Add Item dialog ──────────────────────────────────────────────────────────

function AddItemDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    category: "",
    name: "",
    description: "",
    sku: "",
    unitCost: "",
    unitPrice: "",
    quantityOnHand: "0",
    reorderPoint: "0",
    reorderQuantity: "0",
    storageLocation: "",
    supplierName: "",
    supplierPartNumber: "",
  });

  const createMut = trpc.inventory.createInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("Inventory item created.");
      utils.inventory.listInventory.invalidate();
      utils.inventory.getOverview.invalidate();
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Category *</Label>
            <Input className="mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Detectors" />
          </div>
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Part name" />
          </div>
          <div>
            <Label>SKU</Label>
            <Input className="mt-1" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label>Storage Location</Label>
            <Input className="mt-1" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} placeholder="Shelf A-3" />
          </div>
          <div>
            <Label>Unit Cost ($)</Label>
            <Input type="number" min="0" step="0.01" className="mt-1" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <Label>Unit Price ($)</Label>
            <Input type="number" min="0" step="0.01" className="mt-1" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <Label>Qty on Hand</Label>
            <Input type="number" min="0" className="mt-1" value={form.quantityOnHand} onChange={(e) => setForm({ ...form, quantityOnHand: e.target.value })} />
          </div>
          <div>
            <Label>Reorder Point</Label>
            <Input type="number" min="0" className="mt-1" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} />
          </div>
          <div>
            <Label>Reorder Qty</Label>
            <Input type="number" min="0" className="mt-1" value={form.reorderQuantity} onChange={(e) => setForm({ ...form, reorderQuantity: e.target.value })} />
          </div>
          <div>
            <Label>Supplier</Label>
            <Input className="mt-1" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
          </div>
          <div>
            <Label>Supplier Part #</Label>
            <Input className="mt-1" value={form.supplierPartNumber} onChange={(e) => setForm({ ...form, supplierPartNumber: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Textarea className="mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.category.trim() || !form.name.trim() || createMut.isPending}
            onClick={() =>
              createMut.mutate({
                category: form.category.trim(),
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                sku: form.sku.trim() || undefined,
                unitCost: parseFloat(form.unitCost) || 0,
                unitPrice: parseFloat(form.unitPrice) || 0,
                quantityOnHand: parseInt(form.quantityOnHand) || 0,
                reorderPoint: parseInt(form.reorderPoint) || 0,
                reorderQuantity: parseInt(form.reorderQuantity) || 0,
                storageLocation: form.storageLocation.trim() || undefined,
                supplierName: form.supplierName.trim() || undefined,
                supplierPartNumber: form.supplierPartNumber.trim() || undefined,
              })
            }
          >
            Create Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Adjust Stock dialog ──────────────────────────────────────────────────────

function AdjustStockDialog({
  item,
  open,
  onClose,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [adjustment, setAdjustment] = useState("0");
  const [notes, setNotes] = useState("");

  const adjustMut = trpc.inventory.adjustStock.useMutation({
    onSuccess: (data) => {
      toast.success(`Stock updated to ${data.newQty}.`);
      utils.inventory.listInventory.invalidate();
      utils.inventory.getOverview.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const adj = parseInt(adjustment) || 0;
  const newQty = (item?.quantityOnHand ?? 0) + adj;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex-1 text-center">
              <div className="text-2xl font-bold">{item?.quantityOnHand ?? 0}</div>
              <div className="text-muted-foreground text-xs">Current</div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="flex-1 text-center">
              <div className={`text-2xl font-bold ${newQty < 0 ? "text-red-600" : "text-green-700"}`}>{newQty}</div>
              <div className="text-muted-foreground text-xs">After</div>
            </div>
          </div>
          <div>
            <Label>Adjustment (positive to add, negative to remove)</Label>
            <div className="flex gap-2 mt-1">
              <Button variant="outline" size="icon" onClick={() => setAdjustment(String(adj - 1))}>
                <MinusCircle className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
                className="text-center"
              />
              <Button variant="outline" size="icon" onClick={() => setAdjustment(String(adj + 1))}>
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for adjustment" />
          </div>
          {newQty < 0 && <p className="text-red-600 text-xs">Cannot adjust to negative stock.</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={adj === 0 || newQty < 0 || adjustMut.isPending}
            onClick={() =>
              adjustMut.mutate({ id: item.id, adjustment: adj, notes: notes.trim() || undefined })
            }
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction history dialog ───────────────────────────────────────────────

function TransactionHistoryDialog({
  item,
  open,
  onClose,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
}) {
  const { data: txData, isLoading } = trpc.inventory.getInventoryItem.useQuery(
    { id: item?.id },
    { enabled: open && !!item },
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[75vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction History — {item?.name}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-muted-foreground text-sm py-4">Loading…</p>}
        {txData && (
          <div className="space-y-2">
            {txData.transactions.length === 0 && (
              <p className="text-muted-foreground text-sm">No transactions recorded.</p>
            )}
            {txData.transactions.map((tx: any) => (
              <div key={tx.id} className="flex gap-3 text-sm border-b pb-2">
                <div className="w-24 shrink-0 text-xs text-muted-foreground pt-0.5">
                  {String(tx.createdAt).slice(0, 10)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${tx.quantity > 0 ? "text-green-700" : tx.quantity < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {tx.quantity > 0 ? "+" : ""}{tx.quantity}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {TRANSACTION_LABELS[tx.transactionType] ?? tx.transactionType}
                    </span>
                  </div>
                  {tx.notes && <div className="text-muted-foreground text-xs mt-0.5">{tx.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create from catalog dialog ───────────────────────────────────────────────

function CreateFromCatalogDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: catalog } = trpc.partsCatalog.list.useQuery({ includeInactive: false });
  const [selectedId, setSelectedId] = useState<string>("");
  const [qty, setQty] = useState("0");
  const [unitCost, setUnitCost] = useState("");
  const [reorderPoint, setReorderPoint] = useState("0");

  const createMut = trpc.inventory.createFromPartsCatalog.useMutation({
    onSuccess: () => {
      toast.success("Inventory item created from catalog.");
      utils.inventory.listInventory.invalidate();
      utils.inventory.getOverview.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create from Parts Catalog</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Parts Catalog Item *</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select catalog item" />
              </SelectTrigger>
              <SelectContent>
                {(catalog ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.productName} — {c.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Initial Qty</Label>
              <Input type="number" min="0" className="mt-1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label>Unit Cost ($)</Label>
              <Input type="number" min="0" step="0.01" className="mt-1" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Reorder Point</Label>
              <Input type="number" min="0" className="mt-1" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selectedId || createMut.isPending}
            onClick={() =>
              createMut.mutate({
                partsCatalogId: parseInt(selectedId),
                quantityOnHand: parseInt(qty) || 0,
                unitCost: parseFloat(unitCost) || 0,
                reorderPoint: parseInt(reorderPoint) || 0,
              })
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inventory item row ────────────────────────────────────────────────────────

function InventoryRow({
  item,
  onAdjust,
  onHistory,
  onRestock,
}: {
  item: any;
  onAdjust: (item: any) => void;
  onHistory: (item: any) => void;
  onRestock: (item: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const deactivateMut = trpc.inventory.deactivateInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("Item deactivated.");
      utils.inventory.listInventory.invalidate();
      utils.inventory.getOverview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const available = item.quantityOnHand - item.quantityReserved;
  const isLowStock = item.quantityOnHand <= item.reorderPoint && item.reorderPoint > 0;
  const isOutOfStock = item.quantityOnHand <= 0;

  return (
    <div className={`border rounded-lg bg-card ${isOutOfStock ? "border-red-200" : isLowStock ? "border-yellow-200" : ""}`}>
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{item.name}</span>
            <span className="text-xs text-muted-foreground">{item.category}</span>
            {item.sku && <span className="text-xs text-muted-foreground bg-muted px-1 rounded">{item.sku}</span>}
            {isOutOfStock && <span className="text-xs font-medium text-red-700 bg-red-100 px-1.5 rounded">Out of Stock</span>}
            {!isOutOfStock && isLowStock && <span className="text-xs font-medium text-yellow-700 bg-yellow-100 px-1.5 rounded">Low Stock</span>}
          </div>
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
            <span>On Hand: <strong className="text-foreground">{item.quantityOnHand}</strong></span>
            <span>Reserved: <strong className="text-foreground">{item.quantityReserved}</strong></span>
            <span>Available: <strong className={`${available < 0 ? "text-red-600" : "text-foreground"}`}>{available}</strong></span>
            <span>Reorder at: <strong className="text-foreground">{item.reorderPoint}</strong></span>
            {item.storageLocation && <span>Loc: <strong className="text-foreground">{item.storageLocation}</strong></span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t pt-3 bg-muted/10 rounded-b-lg space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {item.supplierName && <div><span className="font-medium">Supplier:</span> {item.supplierName}</div>}
            {item.supplierPartNumber && <div><span className="font-medium">Supplier P/N:</span> {item.supplierPartNumber}</div>}
            {item.unitCost && <div><span className="font-medium">Unit Cost:</span> ${Number(item.unitCost).toFixed(2)}</div>}
            {item.unitPrice && <div><span className="font-medium">Unit Price:</span> ${Number(item.unitPrice).toFixed(2)}</div>}
            {item.reorderQuantity > 0 && <div><span className="font-medium">Reorder Qty:</span> {item.reorderQuantity}</div>}
            {item.description && <div className="col-span-2 sm:col-span-4"><span className="font-medium">Description:</span> {item.description}</div>}
            {item.partsCatalogId && <div className="col-span-2"><span className="font-medium">Linked Catalog ID:</span> #{item.partsCatalogId}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onAdjust(item)}>
              <RefreshCw className="h-4 w-4 mr-1" /> Adjust Stock
            </Button>
            <Button size="sm" variant="outline" onClick={() => onHistory(item)}>
              <History className="h-4 w-4 mr-1" /> Transactions
            </Button>
            {isLowStock && (
              <Button size="sm" variant="outline" className="text-yellow-700 border-yellow-300" onClick={() => onRestock(item)}>
                <ShoppingCart className="h-4 w-4 mr-1" /> Restock PO
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground"
              disabled={deactivateMut.isPending}
              onClick={() => deactivateMut.mutate({ id: item.id })}
            >
              Deactivate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Inventory() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showFromCatalog, setShowFromCatalog] = useState(false);
  const [adjustItem, setAdjustItem] = useState<any>(null);
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [, navigate] = useLocation();
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [filterOutOfStock, setFilterOutOfStock] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  const { data: overview } = trpc.inventory.getOverview.useQuery();
  const { data: items = [], isLoading, refetch } = trpc.inventory.listInventory.useQuery({
    includeInactive: showInactive,
  });

  const restockMut = trpc.vendorPurchase.createRestockPO.useMutation({
    onSuccess: (data) => {
      toast.success(`Restock PO ${data.poNumber} created.`);
      navigate(`/admin/purchase-orders/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRestock = (item: any) => {
    restockMut.mutate({ inventoryItemIds: [item.id] });
  };

  const categories = [...new Set(items.map((i: any) => i.category))].sort();
  const suppliers = [...new Set(items.map((i: any) => i.supplierName).filter(Boolean))].sort() as string[];

  const filtered = items.filter((item: any) => {
    if (!showInactive && !item.isActive) return false;
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterSupplier && item.supplierName !== filterSupplier) return false;
    if (filterLowStock && !(item.quantityOnHand <= item.reorderPoint && item.reorderPoint > 0)) return false;
    if (filterOutOfStock && item.quantityOnHand > 0) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.supplierName?.toLowerCase().includes(q) ||
        item.storageLocation?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AdminLayout title="Inventory">
      <OverviewCards data={overview} />

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
        <Button variant="outline" onClick={() => setShowFromCatalog(true)}>
          <Link2 className="h-4 w-4 mr-1" /> From Parts Catalog
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="Name, SKU, category, supplier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={filterCategory || "_all"} onValueChange={(v) => setFilterCategory(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <Select value={filterSupplier || "_all"} onValueChange={(v) => setFilterSupplier(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All suppliers</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 items-center text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterLowStock}
                  onChange={(e) => setFilterLowStock(e.target.checked)}
                  className="rounded"
                />
                Low stock only
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterOutOfStock}
                  onChange={(e) => setFilterOutOfStock(e.target.checked)}
                  className="rounded"
                />
                Out of stock
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded"
                />
                Show inactive
              </label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setFilterCategory("");
                setFilterSupplier("");
                setFilterLowStock(false);
                setFilterOutOfStock(false);
                setSearch("");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Item list */}
      <div className="space-y-2">
        {isLoading && <p className="text-muted-foreground text-sm">Loading inventory…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No inventory items found.</p>
          </div>
        )}
        {filtered.map((item: any) => (
          <InventoryRow
            key={item.id}
            item={item}
            onAdjust={setAdjustItem}
            onHistory={setHistoryItem}
            onRestock={handleRestock}
          />
        ))}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {items.length} items
        </div>
      )}

      {/* Dialogs */}
      <AddItemDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} onCreated={refetch} />
      <CreateFromCatalogDialog open={showFromCatalog} onClose={() => setShowFromCatalog(false)} />
      {adjustItem && (
        <AdjustStockDialog item={adjustItem} open={!!adjustItem} onClose={() => setAdjustItem(null)} />
      )}
      {historyItem && (
        <TransactionHistoryDialog item={historyItem} open={!!historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </AdminLayout>
  );
}
