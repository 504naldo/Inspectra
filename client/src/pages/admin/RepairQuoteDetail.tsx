import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import {
  Plus, Trash2, Pencil, Loader2, FileText, CheckCircle,
  Send, Lock, ChevronDown, ChevronUp, ExternalLink, Bot, Copy,
  Sparkles, ArrowRight, Package,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600 border-gray-200",
  sent:     "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-700 border-red-200",
};

const SYSTEM_OPTIONS = [
  { value: "FIRE_ALARM", label: "Fire Alarm" },
  { value: "SMOKE_ALARM", label: "Smoke Alarm" },
  { value: "FIRE_EXTINGUISHER", label: "Fire Extinguisher" },
  { value: "EMERGENCY_LIGHTING", label: "Emergency Lighting" },
  { value: "SPRINKLER", label: "Sprinkler" },
  { value: "BACKFLOW", label: "Backflow" },
  { value: "OTHER", label: "Other" },
];

interface ItemForm {
  description: string;
  repairNotes: string;
  systemType: string;
  location: string;
  quantity: string;
  partId: string;
  partDescription: string;
  partUnitPrice: string;
  techHours: string;
  fitterHours: string;
  techLabourRate: string;
  fitterLabourRate: string;
  fuelCharge: string;
  backflowReportFee: string;
}

const emptyItem = (techRate: string, fitterRate: string): ItemForm => ({
  description: "", repairNotes: "", systemType: "", location: "",
  quantity: "1", partId: "", partDescription: "", partUnitPrice: "0",
  techHours: "0", fitterHours: "0",
  techLabourRate: techRate, fitterLabourRate: fitterRate,
  fuelCharge: "0", backflowReportFee: "0",
});

function calcItemPreview(f: ItemForm) {
  const qty = parseFloat(f.quantity) || 1;
  const partUnitPrice = parseFloat(f.partUnitPrice) || 0;
  const partTotal = qty * partUnitPrice;
  const techHours = parseFloat(f.techHours) || 0;
  const fitterHours = parseFloat(f.fitterHours) || 0;
  const techRate = parseFloat(f.techLabourRate) || 0;
  const fitterRate = parseFloat(f.fitterLabourRate) || 0;
  const labourTotal = techHours * techRate + fitterHours * fitterRate;
  const fuel = parseFloat(f.fuelCharge) || 0;
  const backflow = parseFloat(f.backflowReportFee) || 0;
  const gst = (partTotal + labourTotal + backflow) * 0.05;
  const pst = partTotal * 0.07;
  const total = partTotal + labourTotal + fuel + backflow + gst + pst;
  return { partTotal, labourTotal, fuel, backflow, gst, pst, total };
}

export default function RepairQuoteDetail() {
  const [, params] = useRoute("/admin/repair-quotes/:id");
  const [, navigate] = useLocation();
  const quoteId = parseInt(params?.id ?? "0");

  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItem("75", "65"));
  const [editItemForm, setEditItemForm] = useState<ItemForm>(emptyItem("75", "65"));
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [partsDefId, setPartsDefId] = useState<number | null>(null);

  const aiAsk = trpc.aiAssistant.ask.useMutation({
    onSuccess: (d) => { setAiContent(d.answer); setAiOpen(true); },
    onError: (e) => toast.error(e.message || "AI request failed"),
  });

  const quoteSummary = trpc.aiAssistant.draftRepairQuoteSummary.useMutation({
    onSuccess: () => setSummaryOpen(true),
    onError: (e) => toast.error(e.message || "AI summary failed"),
  });

  const partsFromDef = trpc.aiAssistant.suggestPartsFromDeficiency.useMutation({
    onSuccess: () => setPartsOpen(true),
    onError: (e) => toast.error(e.message || "Parts suggestion failed"),
  });

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.repairQuote.getRepairQuote.useQuery(
    { id: quoteId },
    { enabled: !!quoteId }
  );

  const { data: parts = [] } = trpc.repairQuote.listParts.useQuery({ includeInactive: false });

  const addItemMut = trpc.repairQuote.addItem.useMutation({
    onSuccess: () => {
      utils.repairQuote.getRepairQuote.invalidate({ id: quoteId });
      setShowAddItem(false);
      if (data) setItemForm(emptyItem(String(data.quote.techLabourRate ?? "75"), String(data.quote.fitterLabourRate ?? "65")));
      toast.success("Item added");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItemMut = trpc.repairQuote.updateItem.useMutation({
    onSuccess: () => {
      utils.repairQuote.getRepairQuote.invalidate({ id: quoteId });
      setEditingItemId(null);
      toast.success("Item updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeItemMut = trpc.repairQuote.removeItem.useMutation({
    onSuccess: () => { utils.repairQuote.getRepairQuote.invalidate({ id: quoteId }); toast.success("Item removed"); },
    onError: (e) => toast.error(e.message),
  });

  const finalizeMut = trpc.repairQuote.finalizeQuote.useMutation({
    onSuccess: () => { utils.repairQuote.getRepairQuote.invalidate({ id: quoteId }); toast.success("Quote finalized"); },
    onError: (e) => toast.error(e.message),
  });

  const statusMut = trpc.repairQuote.updateStatus.useMutation({
    onSuccess: () => { utils.repairQuote.getRepairQuote.invalidate({ id: quoteId }); toast.success("Status updated"); },
    onError: (e) => toast.error(e.message),
  });

  const pdfMut = trpc.repairQuote.generatePDF.useMutation({
    onSuccess: (d) => { toast.success("PDF generated"); window.open(d.pdfUrl, "_blank"); },
    onError: (e) => toast.error(e.message),
  });

  const convertWOMut = trpc.repairQuote.convertToWorkOrder.useMutation({
    onSuccess: (d) => { toast.success(`Work order created (WO #${d.workOrderId})`); navigate("/admin/work-orders"); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AdminLayout title="Repair Quote">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return <AdminLayout title="Repair Quote"><p className="text-muted-foreground p-6">Quote not found.</p></AdminLayout>;
  }

  const { quote, items, job, site, customer } = data;
  const q = quote as any;
  const isFinalized = !!q.finalizedAt;
  const canEdit = !isFinalized && quote.status === "draft";
  const techRate = String(q.techLabourRate ?? "75");
  const fitterRate = String(q.fitterLabourRate ?? "65");

  function handlePartSelect(partId: string, setter: (fn: (f: ItemForm) => ItemForm) => void) {
    const part = parts.find((p) => String(p.id) === partId);
    if (!part) return;
    setter((f) => ({
      ...f,
      partId,
      partDescription: part.productName,
      partUnitPrice: String(parseFloat(String(part.unitPrice))),
      techHours: f.techHours === "0" && part.defaultLabourHours ? String(parseFloat(String(part.defaultLabourHours))) : f.techHours,
    }));
  }

  function submitAddItem() {
    const f = itemForm;
    if (!f.description.trim()) { toast.error("Description is required."); return; }
    addItemMut.mutate({
      quoteId,
      description: f.description.trim(),
      repairNotes: f.repairNotes.trim() || undefined,
      systemType: f.systemType as any || undefined,
      location: f.location.trim() || undefined,
      quantity: parseInt(f.quantity) || 1,
      partId: f.partId ? parseInt(f.partId) : undefined,
      partDescription: f.partDescription.trim() || undefined,
      partUnitPrice: parseFloat(f.partUnitPrice) || 0,
      techHours: parseFloat(f.techHours) || 0,
      fitterHours: parseFloat(f.fitterHours) || 0,
      techLabourRate: parseFloat(f.techLabourRate) || 0,
      fitterLabourRate: parseFloat(f.fitterLabourRate) || 0,
      fuelCharge: parseFloat(f.fuelCharge) || 0,
      backflowReportFee: parseFloat(f.backflowReportFee) || 0,
    });
  }

  function startEditItem(item: (typeof items)[0]) {
    setEditingItemId(item.id);
    setEditItemForm({
      description: item.description,
      repairNotes: item.repairNotes ?? "",
      systemType: item.systemType ?? "",
      location: item.location ?? "",
      quantity: String(item.quantity),
      partId: item.partId ? String(item.partId) : "",
      partDescription: item.partDescription ?? "",
      partUnitPrice: String(parseFloat(String(item.partUnitPrice))),
      techHours: String(parseFloat(String(item.techHours))),
      fitterHours: String(parseFloat(String(item.fitterHours))),
      techLabourRate: String(parseFloat(String(item.techLabourRate))),
      fitterLabourRate: String(parseFloat(String(item.fitterLabourRate))),
      fuelCharge: String(parseFloat(String(item.fuelCharge))),
      backflowReportFee: String(parseFloat(String(item.backflowReportFee))),
    });
  }

  function submitEditItem() {
    const f = editItemForm;
    if (!editingItemId || !f.description.trim()) { toast.error("Description is required."); return; }
    updateItemMut.mutate({
      id: editingItemId,
      quoteId,
      description: f.description.trim(),
      repairNotes: f.repairNotes.trim() || undefined,
      systemType: f.systemType as any || undefined,
      location: f.location.trim() || undefined,
      quantity: parseInt(f.quantity) || 1,
      partId: f.partId ? parseInt(f.partId) : undefined,
      partDescription: f.partDescription.trim() || undefined,
      partUnitPrice: parseFloat(f.partUnitPrice) || 0,
      techHours: parseFloat(f.techHours) || 0,
      fitterHours: parseFloat(f.fitterHours) || 0,
      techLabourRate: parseFloat(f.techLabourRate) || 0,
      fitterLabourRate: parseFloat(f.fitterLabourRate) || 0,
      fuelCharge: parseFloat(f.fuelCharge) || 0,
      backflowReportFee: parseFloat(f.backflowReportFee) || 0,
    });
  }

  const ItemFormFields = ({
    form, setForm, onCancel, onSubmit, isPending, title,
  }: {
    form: ItemForm;
    setForm: (fn: (f: ItemForm) => ItemForm) => void;
    onCancel: () => void;
    onSubmit: () => void;
    isPending: boolean;
    title: string;
  }) => {
    const preview = calcItemPreview(form);
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input placeholder="What needs to be repaired?" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">System Type</Label>
              <Select value={form.systemType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, systemType: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {SYSTEM_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location</Label>
              <Input placeholder="e.g. Floor 2 — Room 204" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Repair Notes</Label>
              <Textarea rows={2} placeholder="Corrective action or notes…" value={form.repairNotes} onChange={(e) => setForm((f) => ({ ...f, repairNotes: e.target.value }))} />
            </div>
          </div>

          {/* Parts */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Parts</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Select from Catalog</Label>
                <Select value={form.partId || "none"} onValueChange={(v) => v !== "none" ? handlePartSelect(v, setForm) : setForm((f) => ({ ...f, partId: "", partDescription: "", partUnitPrice: "0" }))}>
                  <SelectTrigger><SelectValue placeholder="Choose part…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No part / custom —</SelectItem>
                    {parts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.category} — {p.productName} ({CAD.format(parseFloat(String(p.unitPrice)))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Part Description</Label>
                <Input placeholder="Custom description" value={form.partDescription} onChange={(e) => setForm((f) => ({ ...f, partDescription: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit Price</Label>
                <Input type="number" min="0" step="0.01" value={form.partUnitPrice} onChange={(e) => setForm((f) => ({ ...f, partUnitPrice: e.target.value }))} />
              </div>
            </div>
            {parseFloat(form.partUnitPrice) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Parts: {form.quantity} × {CAD.format(parseFloat(form.partUnitPrice))} = {CAD.format(preview.partTotal)}
              </p>
            )}
          </div>

          {/* Labour */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Labour</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tech Hours</Label>
                <Input type="number" min="0" step="0.25" value={form.techHours} onChange={(e) => setForm((f) => ({ ...f, techHours: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tech Rate ($/hr)</Label>
                <Input type="number" min="0" step="1" value={form.techLabourRate} onChange={(e) => setForm((f) => ({ ...f, techLabourRate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fitter Hours</Label>
                <Input type="number" min="0" step="0.25" value={form.fitterHours} onChange={(e) => setForm((f) => ({ ...f, fitterHours: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fitter Rate ($/hr)</Label>
                <Input type="number" min="0" step="1" value={form.fitterLabourRate} onChange={(e) => setForm((f) => ({ ...f, fitterLabourRate: e.target.value }))} />
              </div>
            </div>
            {preview.labourTotal > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Labour total: {CAD.format(preview.labourTotal)}</p>
            )}
          </div>

          {/* Fees */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Additional Fees</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fuel / Vehicle Charge</Label>
                <Input type="number" min="0" step="0.01" value={form.fuelCharge} onChange={(e) => setForm((f) => ({ ...f, fuelCharge: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Backflow Report Fee</Label>
                <Input type="number" min="0" step="0.01" value={form.backflowReportFee} onChange={(e) => setForm((f) => ({ ...f, backflowReportFee: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Line preview */}
          <div className="border-t pt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Line total (incl. taxes):</span>
            <span className="font-semibold tabular-nums">{CAD.format(preview.total)}</span>
          </div>

          <div className="flex gap-2">
            <Button onClick={onSubmit} disabled={isPending} size="sm" className="gap-1.5">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Item
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AdminLayout title={`Repair Quote ${q.quoteNumber ?? `#${quoteId}`}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{q.quoteNumber ?? `Quote #${quoteId}`}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[quote.status] ?? ""}`}>
                {quote.status}
              </span>
              {isFinalized && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <Lock className="h-3 w-3" /> Finalized
                </span>
              )}
              <span className="text-xs text-muted-foreground">{fmtDate(quote.createdAt)}</span>
              {q.validUntil && <span className="text-xs text-muted-foreground">· Valid until {fmtDate(q.validUntil)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
              disabled={aiAsk.isPending}
              onClick={() => aiAsk.mutate({
                message: "Summarize this repair quote's scope and draft a clear, customer-friendly description of the work to be done.",
                mode: "repair_quote",
                contextType: "repair_quote",
                contextId: quoteId,
              })}
            >
              {aiAsk.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
              Draft with AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
              disabled={quoteSummary.isPending}
              onClick={() => { quoteSummary.reset(); quoteSummary.mutate({ repairQuoteId: quoteId }); }}
            >
              {quoteSummary.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Draft Summary
            </Button>
            <Button variant="outline" size="sm" onClick={() => pdfMut.mutate({ id: quoteId })} disabled={pdfMut.isPending} className="gap-1.5">
              {pdfMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              PDF
            </Button>
            {quote.pdfUrl && (
              <a href={quote.pdfUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> View PDF
                </Button>
              </a>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => finalizeMut.mutate({ id: quoteId })} disabled={finalizeMut.isPending} className="gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Finalize
              </Button>
            )}
            {isFinalized && quote.status === "draft" && (
              <Button size="sm" onClick={() => statusMut.mutate({ id: quoteId, status: "sent" })} disabled={statusMut.isPending} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> Mark Sent
              </Button>
            )}
            {quote.status === "sent" && (
              <>
                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: quoteId, status: "accepted" })} disabled={statusMut.isPending} className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                  <CheckCircle className="h-3.5 w-3.5" /> Accepted
                </Button>
                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: quoteId, status: "declined" })} disabled={statusMut.isPending} className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50">
                  Declined
                </Button>
              </>
            )}
            {quote.status === "accepted" && (
              <Button size="sm" onClick={() => convertWOMut.mutate({ id: quoteId })} disabled={convertWOMut.isPending} className="gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" /> Create Work Order
              </Button>
            )}
          </div>
        </div>

        {/* Info block */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Customer</p>
              <p className="font-medium text-sm">{customer?.name ?? "—"}</p>
              {customer?.contactName && <p className="text-xs text-muted-foreground">{customer.contactName}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Site</p>
              <p className="font-medium text-sm">{site?.name ?? "—"}</p>
              {site?.address && <p className="text-xs text-muted-foreground">{site.address}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Job</p>
              <p className="font-medium text-sm">{job?.jobNumber ?? "—"}</p>
              {job?.title && <p className="text-xs text-muted-foreground">{job.title}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Line items */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Repair Items ({items.length})</CardTitle>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => { setShowAddItem(true); setItemForm(emptyItem(techRate, fitterRate)); }} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {showAddItem && (
              <ItemFormFields
                form={itemForm}
                setForm={setItemForm}
                onCancel={() => setShowAddItem(false)}
                onSubmit={submitAddItem}
                isPending={addItemMut.isPending}
                title="New Repair Item"
              />
            )}

            {items.length === 0 && !showAddItem && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No items yet.{canEdit && " Click \"Add Item\" to add the first repair line."}
              </div>
            )}

            {items.map((item, idx) => {
              const isExpanded = expandedItems[item.id] !== false;
              const toggleExpand = () => setExpandedItems((p) => ({ ...p, [item.id]: !isExpanded }));
              const pTotal = parseFloat(String(item.partTotal));
              const lTotal = parseFloat(String(item.labourTotal));
              const fees = parseFloat(String(item.fuelCharge)) + parseFloat(String(item.backflowReportFee));
              const lineTotal = parseFloat(String(item.total));

              return (
                <div key={item.id} className="border rounded-lg overflow-hidden">
                  {editingItemId === item.id ? (
                    <div className="p-3">
                      <ItemFormFields
                        form={editItemForm}
                        setForm={setEditItemForm}
                        onCancel={() => setEditingItemId(null)}
                        onSubmit={submitEditItem}
                        isPending={updateItemMut.isPending}
                        title="Edit Item"
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                        onClick={toggleExpand}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{item.description}</p>
                            {item.location && <p className="text-xs text-muted-foreground">{item.location}</p>}
                          </div>
                          {item.systemType && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {SYSTEM_OPTIONS.find((o) => o.value === item.systemType)?.label ?? item.systemType}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-sm font-semibold tabular-nums">{CAD.format(lineTotal)}</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3 space-y-3">
                          {item.repairNotes && (
                            <p className="text-xs text-muted-foreground italic">{item.repairNotes}</p>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {pTotal > 0 && (
                              <div>
                                <p className="text-muted-foreground">Parts</p>
                                <p className="font-medium">{CAD.format(pTotal)}</p>
                                {item.partDescription && <p className="text-muted-foreground">{item.quantity} × {item.partDescription}</p>}
                              </div>
                            )}
                            {lTotal > 0 && (
                              <div>
                                <p className="text-muted-foreground">Labour</p>
                                <p className="font-medium">{CAD.format(lTotal)}</p>
                                <p className="text-muted-foreground">
                                  {parseFloat(String(item.techHours)) > 0 && `Tech ${item.techHours}h`}
                                  {parseFloat(String(item.fitterHours)) > 0 && ` · Fitter ${item.fitterHours}h`}
                                </p>
                              </div>
                            )}
                            {fees > 0 && (
                              <div>
                                <p className="text-muted-foreground">Fees</p>
                                <p className="font-medium">{CAD.format(fees)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-muted-foreground">Tax (GST+PST)</p>
                              <p className="font-medium">{CAD.format(parseFloat(String(item.gst)) + parseFloat(String(item.pst)))}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {canEdit && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => startEditItem(item)} className="gap-1 h-7 text-xs">
                                  <Pencil className="h-3 w-3" /> Edit
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => removeItemMut.mutate({ id: item.id, quoteId })} disabled={removeItemMut.isPending} className="gap-1 h-7 text-xs text-destructive hover:text-destructive">
                                  <Trash2 className="h-3 w-3" /> Remove
                                </Button>
                              </>
                            )}
                            {(item as any).deficiencyId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1 h-7 text-xs text-primary"
                                disabled={partsFromDef.isPending}
                                onClick={() => { setPartsDefId((item as any).deficiencyId); partsFromDef.reset(); partsFromDef.mutate({ deficiencyId: (item as any).deficiencyId }); }}
                              >
                                {partsFromDef.isPending && partsDefId === (item as any).deficiencyId
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Package className="h-3 w-3" />}
                                Suggest Parts
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quote Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs ml-auto space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (before tax)</span>
                <span className="tabular-nums">{CAD.format(parseFloat(String(q.subtotal ?? "0")))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST (5%)</span>
                <span className="tabular-nums">{CAD.format(parseFloat(String(q.gst ?? "0")))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PST (7% on parts)</span>
                <span className="tabular-nums">{CAD.format(parseFloat(String(q.pst ?? "0")))}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums">{CAD.format(parseFloat(String(quote.total)))}</span>
              </div>
            </div>
            {quote.notes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm">{quote.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ActivityTimeline entityType="repair_quote" entityId={quoteId} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> AI Draft — Repair Quote
            </DialogTitle>
            <DialogDescription>Review before use. AI suggestions are drafts only.</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm max-h-72 overflow-y-auto border rounded-md p-3 bg-muted/30">
            {aiContent}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(aiContent); toast.success("Copied"); }}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAiOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote Summary dialog */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI Quote Summary
            </DialogTitle>
            <DialogDescription>Advisory draft only. Review before sending to customer.</DialogDescription>
          </DialogHeader>
          {quoteSummary.data && (() => {
            const s = quoteSummary.data as any;
            return (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-xs text-muted-foreground uppercase mb-1">Quote Title</p>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{s.quoteTitle}</p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs shrink-0" onClick={() => { navigator.clipboard.writeText(s.quoteTitle); toast.success("Copied"); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-xs text-muted-foreground uppercase mb-1">Executive Summary</p>
                  <div className="rounded border p-3 bg-muted/30 text-xs whitespace-pre-wrap">{s.executiveSummary}</div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={() => { navigator.clipboard.writeText(s.executiveSummary); toast.success("Copied"); }}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                </div>
                <div>
                  <p className="font-medium text-xs text-muted-foreground uppercase mb-1">Scope of Work</p>
                  <div className="rounded border p-3 bg-muted/30 text-xs whitespace-pre-wrap">{s.scopeOfWork}</div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={() => { navigator.clipboard.writeText(s.scopeOfWork); toast.success("Copied"); }}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                </div>
                <div>
                  <p className="font-medium text-xs text-muted-foreground uppercase mb-1">Customer Approval Note</p>
                  <div className="rounded border p-3 bg-muted/30 text-xs whitespace-pre-wrap">{s.customerApprovalNote}</div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={() => { navigator.clipboard.writeText(s.customerApprovalNote); toast.success("Copied"); }}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                </div>
                {s.exclusionsOrAssumptions && (
                  <div>
                    <p className="font-medium text-xs text-muted-foreground uppercase mb-1">Exclusions / Assumptions</p>
                    <p className="text-xs text-muted-foreground">{s.exclusionsOrAssumptions}</p>
                  </div>
                )}
                {s.warnings?.length > 0 && (
                  <div className="space-y-1">
                    {s.warnings.map((w: string, i: number) => (
                      <p key={i} className="text-xs text-amber-600">• {w}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSummaryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suggest Parts dialog */}
      <Dialog open={partsOpen} onOpenChange={setPartsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Suggested Parts
            </DialogTitle>
            <DialogDescription>AI-generated suggestions. Verify pricing before adding to quote.</DialogDescription>
          </DialogHeader>
          {partsFromDef.data && (() => {
            const p = partsFromDef.data as any;
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1">
                  {p.suggestedPartsSearchTerms.map((t: string, i: number) => (
                    <span key={i} className="text-xs bg-muted rounded-full px-2 py-0.5">{t}</span>
                  ))}
                </div>
                {p.matchingParts.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{p.matchingParts.length} catalog match{p.matchingParts.length !== 1 ? "es" : ""}</p>
                    {p.matchingParts.map((part: any) => (
                      <div key={part.id} className="border rounded p-3 text-xs space-y-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{part.productName}</p>
                          <p className="font-semibold tabular-nums shrink-0">{CAD.format(parseFloat(String(part.unitPrice)))}</p>
                        </div>
                        <p className="text-muted-foreground">{part.category}{part.sku ? ` · ${part.sku}` : ""}</p>
                        {part.description && <p className="text-muted-foreground">{part.description}</p>}
                        {part.defaultLabourHours > 0 && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <ArrowRight className="h-3 w-3" /> {parseFloat(String(part.defaultLabourHours))}h labour
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No catalog matches found for these search terms.</p>
                )}
                {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPartsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
