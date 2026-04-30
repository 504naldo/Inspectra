import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus, Package, Pencil, X, Check, ChevronDown, ChevronRight, Search, Filter,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

interface PartForm {
  category: string;
  productName: string;
  sku: string;
  unitPrice: string;
  defaultLabourHours: string;
  taxableGst: boolean;
  taxablePst: boolean;
  description: string;
}

const EMPTY_FORM: PartForm = {
  category: "",
  productName: "",
  sku: "",
  unitPrice: "",
  defaultLabourHours: "0",
  taxableGst: true,
  taxablePst: true,
  description: "",
};

export default function PartsCatalog() {
  const [showInactive, setShowInactive] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PartForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<PartForm>(EMPTY_FORM);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const { data: parts = [], refetch } = trpc.partsCatalog.list.useQuery({ includeInactive: showInactive });
  const createMut = trpc.partsCatalog.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_FORM); toast.success("Part added"); },
  });
  const updateMut = trpc.partsCatalog.update.useMutation({
    onSuccess: () => { refetch(); setEditingId(null); toast.success("Part updated"); },
  });
  const deactivateMut = trpc.partsCatalog.deactivate.useMutation({
    onSuccess: () => { refetch(); toast.success("Part deactivated"); },
  });
  const reactivateMut = trpc.partsCatalog.reactivate.useMutation({
    onSuccess: () => { refetch(); toast.success("Part reactivated"); },
  });

  const allCategories = useMemo(() => {
    const cats = Array.from(new Set(parts.map((p) => p.category ?? "Uncategorized"))).sort();
    return cats;
  }, [parts]);

  const filteredParts = useMemo(() => {
    let list = parts;
    if (filterCategory !== "all") list = list.filter((p) => (p.category ?? "Uncategorized") === filterCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [parts, search, filterCategory]);

  const byCategory = useMemo(
    () =>
      filteredParts.reduce<Record<string, typeof filteredParts>>((acc, p) => {
        const cat = p.category ?? "Uncategorized";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(p);
        return acc;
      }, {}),
    [filteredParts]
  );

  const toggleCat = (cat: string) => setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  const isCatOpen = (cat: string) => expandedCategories[cat] !== false;

  function handleAdd() {
    if (!form.category.trim() || !form.productName.trim() || !form.unitPrice.trim()) {
      toast.error("Category, product name, and price are required.");
      return;
    }
    createMut.mutate({
      category: form.category.trim(),
      productName: form.productName.trim(),
      sku: form.sku.trim() || undefined,
      unitPrice: parseFloat(form.unitPrice) || 0,
      defaultLabourHours: parseFloat(form.defaultLabourHours) || 0,
      taxableGst: form.taxableGst,
      taxablePst: form.taxablePst,
      description: form.description.trim() || null,
    });
  }

  function startEdit(p: (typeof parts)[0]) {
    setEditingId(p.id);
    setEditForm({
      category: p.category,
      productName: p.productName,
      sku: p.sku ?? "",
      unitPrice: String(parseFloat(String(p.unitPrice))),
      defaultLabourHours: String(parseFloat(String(p.defaultLabourHours ?? "0"))),
      taxableGst: p.taxableGst === 1,
      taxablePst: p.taxablePst === 1,
      description: p.description ?? "",
    });
  }

  function handleSaveEdit() {
    if (!editingId) return;
    updateMut.mutate({
      id: editingId,
      category: editForm.category.trim(),
      productName: editForm.productName.trim(),
      sku: editForm.sku.trim() || null,
      unitPrice: parseFloat(editForm.unitPrice) || 0,
      defaultLabourHours: parseFloat(editForm.defaultLabourHours) || 0,
      taxableGst: editForm.taxableGst,
      taxablePst: editForm.taxablePst,
      description: editForm.description.trim() || null,
    });
  }

  return (
    <AdminLayout title="Parts Catalog">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6" />
              Parts Catalog
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pricing catalog for fire protection parts and materials.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Show inactive
            </label>
            <Button onClick={() => setShowAdd(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Part
            </Button>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search parts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48">
              <Filter className="h-4 w-4 mr-1.5" />
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add form */}
        {showAdd && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New Part</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Category *</Label>
                  <Input placeholder="e.g. Smoke Detectors" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Product Name *</Label>
                  <Input placeholder="e.g. Ionization Smoke Detector" value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>SKU</Label>
                  <Input placeholder="Optional" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Unit Price (CAD) *</Label>
                  <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Default Labour Hours</Label>
                  <Input type="number" min="0" step="0.25" placeholder="0" value={form.defaultLabourHours} onChange={(e) => setForm((f) => ({ ...f, defaultLabourHours: e.target.value }))} />
                </div>
                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={form.taxableGst} onCheckedChange={(v) => setForm((f) => ({ ...f, taxableGst: v }))} />
                    GST taxable
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={form.taxablePst} onCheckedChange={(v) => setForm((f) => ({ ...f, taxablePst: v }))} />
                    PST taxable
                  </label>
                </div>
                <div className="space-y-1 sm:col-span-2 md:col-span-3">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Optional product description or notes"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleAdd} disabled={createMut.isPending} className="gap-1.5">
                  <Check className="h-4 w-4" /> Save Part
                </Button>
                <Button variant="outline" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats bar */}
        {parts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filteredParts.length} of {parts.length} parts
            {filterCategory !== "all" && ` in "${filterCategory}"`}
            {search && ` matching "${search}"`}
          </p>
        )}

        {/* Parts grouped by category */}
        {filteredParts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Package className="h-8 w-8 mx-auto text-muted-foreground/40" />
              {parts.length === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">No parts in catalog yet.</p>
                  <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add First Part
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No parts match your search.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          Object.entries(byCategory).map(([category, catParts]) => (
            <Card key={category}>
              <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => toggleCat(category)}>
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {isCatOpen(category) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {category}
                    <Badge variant="secondary" className="text-xs">{catParts.length}</Badge>
                  </span>
                </CardTitle>
              </CardHeader>
              {isCatOpen(category) && (
                <CardContent className="pt-0">
                  <div className="divide-y">
                    {catParts.map((part) => (
                      <div key={part.id} className="py-3">
                        {editingId === part.id ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Category</Label>
                              <Input value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Product Name</Label>
                              <Input value={editForm.productName} onChange={(e) => setEditForm((f) => ({ ...f, productName: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">SKU</Label>
                              <Input value={editForm.sku} onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Unit Price</Label>
                              <Input type="number" min="0" step="0.01" value={editForm.unitPrice} onChange={(e) => setEditForm((f) => ({ ...f, unitPrice: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Default Labour Hours</Label>
                              <Input type="number" min="0" step="0.25" value={editForm.defaultLabourHours} onChange={(e) => setEditForm((f) => ({ ...f, defaultLabourHours: e.target.value }))} />
                            </div>
                            <div className="space-y-2 pt-1">
                              <label className="flex items-center gap-2 text-xs cursor-pointer">
                                <Switch checked={editForm.taxableGst} onCheckedChange={(v) => setEditForm((f) => ({ ...f, taxableGst: v }))} />
                                GST
                              </label>
                              <label className="flex items-center gap-2 text-xs cursor-pointer">
                                <Switch checked={editForm.taxablePst} onCheckedChange={(v) => setEditForm((f) => ({ ...f, taxablePst: v }))} />
                                PST
                              </label>
                            </div>
                            <div className="space-y-1 sm:col-span-2 md:col-span-3">
                              <Label className="text-xs">Description</Label>
                              <Textarea
                                value={editForm.description}
                                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                                rows={2}
                                className="resize-none text-sm"
                              />
                            </div>
                            <div className="flex gap-2 md:col-span-3">
                              <Button size="sm" onClick={handleSaveEdit} disabled={updateMut.isPending} className="gap-1">
                                <Check className="h-3.5 w-3.5" /> Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{part.productName}</span>
                                {part.sku && <span className="text-xs text-muted-foreground">SKU: {part.sku}</span>}
                                {!part.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                                {part.taxableGst === 1 ? <Badge variant="outline" className="text-xs">GST</Badge> : null}
                                {part.taxablePst === 1 ? <Badge variant="outline" className="text-xs">PST</Badge> : null}
                              </div>
                              {part.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{part.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {part.defaultLabourHours && parseFloat(String(part.defaultLabourHours)) > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    Labour: {part.defaultLabourHours}h
                                  </span>
                                )}
                                {part.sourceWorkbook && (
                                  <span className="text-xs text-muted-foreground/60">
                                    Source: {part.sourceWorkbook}
                                    {part.sourceRow != null ? ` row ${part.sourceRow}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-semibold tabular-nums">
                                {CAD.format(parseFloat(String(part.unitPrice)))}
                              </span>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(part)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <button
                                onClick={() =>
                                  part.isActive
                                    ? deactivateMut.mutate({ id: part.id })
                                    : reactivateMut.mutate({ id: part.id })
                                }
                                className={`text-xs underline-offset-2 underline cursor-pointer ${part.isActive ? "text-muted-foreground" : "text-primary"}`}
                              >
                                {part.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
