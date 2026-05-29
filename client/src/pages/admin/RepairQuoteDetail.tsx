import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { ImageLightbox } from "@/components/ImageLightbox";
import { WorkflowHint } from "@/components/help/WorkflowHint";
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
  Sparkles, ArrowRight, Package, ThumbsUp, ThumbsDown, Eye,
  ClipboardCheck, AlertTriangle, HelpCircle, Camera, EyeOff,
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
  draft:                     "bg-gray-100 text-gray-600 border-gray-200",
  ready_to_send:             "bg-violet-50 text-violet-700 border-violet-200",
  sent:                      "bg-blue-50 text-blue-700 border-blue-200",
  viewed:                    "bg-sky-50 text-sky-700 border-sky-200",
  partially_approved:        "bg-amber-50 text-amber-700 border-amber-200",
  approved:                  "bg-emerald-50 text-emerald-700 border-emerald-200",
  accepted:                  "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined:                  "bg-red-50 text-red-700 border-red-200",
  expired:                   "bg-orange-50 text-orange-700 border-orange-200",
  converted_to_approved_work:"bg-teal-50 text-teal-700 border-teal-200",
  cancelled:                 "bg-gray-100 text-gray-500 border-gray-200",
};

const ITEM_STATUS_BADGE: Record<string, string> = {
  pending:                   "bg-gray-100 text-gray-500 border-gray-200",
  approved:                  "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined:                  "bg-red-50 text-red-600 border-red-200",
  needs_review:              "bg-amber-50 text-amber-700 border-amber-200",
  converted_to_approved_work:"bg-teal-50 text-teal-700 border-teal-200",
};

const APPROVAL_SOURCE_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  signed_pdf: "Signed PDF",
  in_person: "In Person",
  portal_later: "Portal (later)",
  internal_entry: "Internal Entry",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready_to_send: "Ready to Send",
  sent: "Sent",
  viewed: "Viewed",
  partially_approved: "Partially Approved",
  approved: "Approved",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  converted_to_approved_work: "Converted to Work",
  cancelled: "Cancelled",
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

function SendQuoteDialog({
  open,
  onOpenChange,
  customerOrgId,
  siteId,
  onSend,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerOrgId?: number;
  siteId?: number;
  onSend: (to: string[]) => void;
  isPending: boolean;
}) {
  const { data } = trpc.contact.getRecipientsForWorkflow.useQuery(
    { customerOrgId, siteId, workflowType: "repair_quote" },
    { enabled: open && !!(customerOrgId || siteId) },
  );
  const suggestions = [...(data?.recommended ?? []), ...(data?.fallback ?? [])].filter((c) => c.email);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");

  useEffect(() => {
    if (suggestions.length > 0 && selected.size === 0) {
      setSelected(new Set(suggestions.map((c) => c.email!)));
    }
  }, [suggestions.length]);

  useEffect(() => {
    if (!open) { setSelected(new Set()); setExtra(""); }
  }, [open]);

  const toggle = (email: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(email) ? s.delete(email) : s.add(email); return s; });

  const extraEmails = extra.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.includes("@") && s.includes("."));
  const allTo = [...Array.from(selected), ...extraEmails];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Send Quote to Customer
          </DialogTitle>
          <DialogDescription>
            A PDF will be generated and emailed to the selected recipients with an accept link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {(data?.warnings ?? []).map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{w}
            </div>
          ))}
          {suggestions.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Recipients from contact list</Label>
              <div className="rounded-md border divide-y">
                {suggestions.map((c) => (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(c.email!)}
                      onChange={() => toggle(c.email!)}
                      className="rounded border-gray-300"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-1.5 truncate">{c.email}</span>
                    </span>
                    {(data?.recommended ?? []).some((r) => r.id === c.id) && (
                      <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5">flagged</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contacts found for this site. Enter an email below.</p>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Additional recipients</Label>
            <Input
              placeholder="extra@example.com"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Separate multiple with commas or spaces.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={allTo.length === 0 || isPending}
            onClick={() => onSend(allTo)}
            className="gap-1.5"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send to {allTo.length} recipient{allTo.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuoteApproverSuggestion({
  customerOrgId,
  siteId,
  onSelect,
}: {
  customerOrgId?: number;
  siteId?: number;
  onSelect: (name: string, email: string) => void;
}) {
  const { data } = trpc.contact.getRecipientsForWorkflow.useQuery(
    { customerOrgId, siteId, workflowType: "repair_quote" },
    { enabled: !!(customerOrgId || siteId) },
  );
  const suggestions = [...(data?.recommended ?? []), ...(data?.fallback ?? [])].filter((c) => c.email);
  if (suggestions.length === 0) return null;
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 space-y-1.5">
      <p className="text-xs font-semibold text-violet-700">Quote approver contacts</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.name, c.email!)}
            className="inline-flex items-center text-xs bg-white border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-100 transition-colors"
          >
            <span className="font-medium text-violet-900">{c.name}</span>
            <span className="text-violet-500 ml-1">· {c.email}</span>
          </button>
        ))}
      </div>
    </div>
  );
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
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSelected, setSendSelected] = useState<Set<string>>(new Set());
  const [sendExtra, setSendExtra] = useState("");

  // Approval workflow state
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalForm, setApprovalForm] = useState({
    approvedByName: "",
    approvedByEmail: "",
    approvalSource: "internal_entry" as "email" | "phone" | "signed_pdf" | "in_person" | "portal_later" | "internal_entry",
    approvedAt: "",
  });

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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  const invalidate = () => utils.repairQuote.getRepairQuote.invalidate({ id: quoteId });

  const markReadyMut = trpc.repairQuote.markReadyToSend.useMutation({
    onSuccess: () => { invalidate(); toast.success("Marked ready to send"); },
    onError: (e) => toast.error(e.message),
  });
  const markSentMut = trpc.repairQuote.markSent.useMutation({
    onSuccess: () => { invalidate(); toast.success("Marked as sent"); },
    onError: (e) => toast.error(e.message),
  });
  const markViewedMut = trpc.repairQuote.markViewed.useMutation({
    onSuccess: () => { invalidate(); toast.success("Marked as viewed"); },
    onError: (e) => toast.error(e.message),
  });
  const recordApprovalMut = trpc.repairQuote.recordApproval.useMutation({
    onSuccess: () => { invalidate(); setApprovalDialogOpen(false); toast.success("Approval recorded"); },
    onError: (e) => toast.error(e.message),
  });
  const approveAllMut = trpc.repairQuote.approveAllItems.useMutation({
    onSuccess: () => { invalidate(); toast.success("All items approved"); },
    onError: (e) => toast.error(e.message),
  });
  const declineAllMut = trpc.repairQuote.declineAllItems.useMutation({
    onSuccess: () => { invalidate(); toast.success("All items declined"); },
    onError: (e) => toast.error(e.message),
  });
  const itemStatusMut = trpc.repairQuote.updateItemApprovalStatus.useMutation({
    onSuccess: () => { invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const convertItemsMut = trpc.repairQuote.convertApprovedItemsToApprovedWork.useMutation({
    onSuccess: (d) => {
      invalidate();
      toast.success(`${d.created} item(s) converted to Approved Work${d.skipped ? ` (${d.skipped} already existed)` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const expireMut = trpc.repairQuote.expireQuote.useMutation({
    onSuccess: () => { invalidate(); toast.success("Quote expired"); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.repairQuote.cancelQuote.useMutation({
    onSuccess: () => { invalidate(); toast.success("Quote cancelled"); },
    onError: (e) => toast.error(e.message),
  });
  const sendMut = trpc.repairQuote.send.useMutation({
    onSuccess: () => {
      invalidate();
      setSendOpen(false);
      toast.success("Quote sent to customer");
    },
    onError: (e) => toast.error(e.message),
  });

  // Deficiency photos for linked job (populated after data loads)
  const linkedJobId = (data as any)?.job?.id as number | undefined;
  const { data: jobMedia = [] } = trpc.media.getMediaForJob.useQuery(
    { jobId: linkedJobId ?? 0 },
    { enabled: !!linkedJobId }
  );
  const photosByDefId = useMemo(() => {
    const m = new Map<number, typeof jobMedia>();
    for (const p of jobMedia) {
      const arr = m.get(p.entityId) ?? [];
      arr.push(p);
      m.set(p.entityId, arr);
    }
    return m;
  }, [jobMedia]);
  const markCustomerFacingMut = trpc.media.markCustomerFacing.useMutation({
    onSuccess: () => utils.media.getMediaForJob.invalidate({ jobId: linkedJobId }),
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
  const jobId = job?.id;
  const isFinalized = !!q.finalizedAt;
  const canEdit = !isFinalized && quote.status === "draft";
  const techRate = String(q.techLabourRate ?? "75");
  const fitterRate = String(q.fitterLabourRate ?? "65");

  // Approval computed values
  const approvedItems = items.filter((i) => (i as any).approvalStatus === "approved" || (i as any).approvalStatus === "converted_to_approved_work");
  const declinedItems = items.filter((i) => (i as any).approvalStatus === "declined");
  const pendingItems = items.filter((i) => ["pending", "needs_review"].includes((i as any).approvalStatus ?? "pending"));
  const convertibleItems = items.filter((i) => (i as any).approvalStatus === "approved");
  const approvedTotal = approvedItems.reduce((s, i) => s + parseFloat(String(i.total)), 0);
  const declinedTotal = declinedItems.reduce((s, i) => s + parseFloat(String(i.total)), 0);
  const pendingTotal = pendingItems.reduce((s, i) => s + parseFloat(String(i.total)), 0);

  const inApprovalFlow = ["sent", "viewed", "partially_approved", "approved", "accepted",
    "converted_to_approved_work"].includes(q.status ?? "");
  const canRecordApproval = ["sent", "viewed", "partially_approved"].includes(q.status ?? "");
  const canConvertItems = convertibleItems.length > 0 && ["approved", "accepted", "partially_approved", "converted_to_approved_work"].includes(q.status ?? "");

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
        <WorkflowHint hint="Once the customer approves this quote, use 'Convert to Approved Work' to begin scheduling the repair." />
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
            {/* New workflow: Ready to Send → Sent → Viewed → Approve/Decline → Convert */}
            {isFinalized && q.status === "draft" && (
              <Button size="sm" variant="outline" onClick={() => markReadyMut.mutate({ id: quoteId })} disabled={markReadyMut.isPending} className="gap-1.5">
                <ClipboardCheck className="h-3.5 w-3.5" /> Mark Ready
              </Button>
            )}
            {(q.status === "draft" || q.status === "ready_to_send") && isFinalized && (
              <Button size="sm" onClick={() => setSendOpen(true)} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> Send to Customer
              </Button>
            )}
            {(q.status === "draft" || q.status === "ready_to_send") && isFinalized && (
              <Button size="sm" variant="outline" onClick={() => markSentMut.mutate({ id: quoteId })} disabled={markSentMut.isPending} className="gap-1.5 text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5" /> Mark Sent (manual)
              </Button>
            )}
            {q.status === "sent" && (
              <Button size="sm" variant="outline" onClick={() => markViewedMut.mutate({ id: quoteId })} disabled={markViewedMut.isPending} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Mark Viewed
              </Button>
            )}
            {canRecordApproval && (
              <Button size="sm" className="gap-1.5" onClick={() => setApprovalDialogOpen(true)}>
                <CheckCircle className="h-3.5 w-3.5" /> Record Approval
              </Button>
            )}
            {canConvertItems && (
              <Button size="sm" className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => convertItemsMut.mutate({ id: quoteId, approvalSource: q.approvalSource ?? "internal_entry" })}
                disabled={convertItemsMut.isPending}
              >
                {convertItemsMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                Convert to Work ({convertibleItems.length})
              </Button>
            )}
            {(q.status === "approved" || q.status === "accepted" || q.status === "partially_approved" || q.status === "converted_to_approved_work") && (
              <Button size="sm" variant="outline" onClick={() => convertWOMut.mutate({ id: quoteId })} disabled={convertWOMut.isPending} className="gap-1.5">
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

        {/* Approval section */}
        {(inApprovalFlow || q.status === "ready_to_send") && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" /> Approval Status
              </CardTitle>
              {inApprovalFlow && (
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline"
                    className="gap-1.5 h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    disabled={approveAllMut.isPending}
                    onClick={() => approveAllMut.mutate({ id: quoteId })}
                  >
                    {approveAllMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                    Approve All
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="gap-1.5 h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                    disabled={declineAllMut.isPending}
                    onClick={() => declineAllMut.mutate({ id: quoteId })}
                  >
                    {declineAllMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3" />}
                    Decline All
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide mb-0.5">Sent</p>
                  <p className="font-medium">{fmtDate(q.sentAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide mb-0.5">Viewed</p>
                  <p className="font-medium">{fmtDate(q.viewedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide mb-0.5">Approved</p>
                  <p className="font-medium">{fmtDate(q.approvedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide mb-0.5">Valid Until</p>
                  <p className="font-medium">{fmtDate(q.validUntil)}</p>
                </div>
              </div>

              {(q.approvedByName || q.approvedByEmail || q.approvalSource) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-t pt-3">
                  {q.approvedByName && (
                    <div>
                      <p className="text-muted-foreground uppercase tracking-wide mb-0.5">Approved By</p>
                      <p className="font-medium">{q.approvedByName}</p>
                    </div>
                  )}
                  {q.approvedByEmail && (
                    <div>
                      <p className="text-muted-foreground uppercase tracking-wide mb-0.5">Contact Email</p>
                      <p className="font-medium">{q.approvedByEmail}</p>
                    </div>
                  )}
                  {q.approvalSource && (
                    <div>
                      <p className="text-muted-foreground uppercase tracking-wide mb-0.5">Approval Method</p>
                      <p className="font-medium">{APPROVAL_SOURCE_LABELS[q.approvalSource] ?? q.approvalSource}</p>
                    </div>
                  )}
                </div>
              )}

              {items.length > 0 && (
                <div className="grid grid-cols-3 gap-3 border-t pt-3">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs">
                    <p className="text-emerald-700 font-medium uppercase tracking-wide mb-1">Approved</p>
                    <p className="text-emerald-800 font-semibold tabular-nums text-sm">{CAD.format(approvedTotal)}</p>
                    <p className="text-emerald-600 mt-0.5">{approvedItems.length} item{approvedItems.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs">
                    <p className="text-red-700 font-medium uppercase tracking-wide mb-1">Declined</p>
                    <p className="text-red-800 font-semibold tabular-nums text-sm">{CAD.format(declinedTotal)}</p>
                    <p className="text-red-600 mt-0.5">{declinedItems.length} item{declinedItems.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs">
                    <p className="text-gray-600 font-medium uppercase tracking-wide mb-1">Pending</p>
                    <p className="text-gray-800 font-semibold tabular-nums text-sm">{CAD.format(pendingTotal)}</p>
                    <p className="text-gray-500 mt-0.5">{pendingItems.length} item{pendingItems.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                          {inApprovalFlow && (item as any).approvalStatus && (
                            <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${ITEM_STATUS_BADGE[(item as any).approvalStatus] ?? ""}`}>
                              {(item as any).approvalStatus === "converted_to_approved_work" ? "Converted" : (item as any).approvalStatus}
                            </span>
                          )}
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

                          {/* Per-item approval controls */}
                          {inApprovalFlow && (item as any).approvalStatus !== "converted_to_approved_work" && (
                            <div className="border-t pt-3 space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm" variant="outline"
                                  className={`gap-1 h-7 text-xs ${(item as any).approvalStatus === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}
                                  disabled={itemStatusMut.isPending || (item as any).approvalStatus === "approved"}
                                  onClick={() => itemStatusMut.mutate({ itemId: item.id, quoteId, approvalStatus: "approved" })}
                                >
                                  <ThumbsUp className="h-3 w-3" /> Approve
                                </Button>
                                <Button
                                  size="sm" variant="outline"
                                  className={`gap-1 h-7 text-xs ${(item as any).approvalStatus === "declined" ? "bg-red-50 text-red-700 border-red-300" : "text-red-700 border-red-200 hover:bg-red-50"}`}
                                  disabled={itemStatusMut.isPending || (item as any).approvalStatus === "declined"}
                                  onClick={() => itemStatusMut.mutate({ itemId: item.id, quoteId, approvalStatus: "declined" })}
                                >
                                  <ThumbsDown className="h-3 w-3" /> Decline
                                </Button>
                                <Button
                                  size="sm" variant="outline"
                                  className={`gap-1 h-7 text-xs ${(item as any).approvalStatus === "needs_review" ? "bg-amber-50 text-amber-700 border-amber-300" : "text-amber-700 border-amber-200 hover:bg-amber-50"}`}
                                  disabled={itemStatusMut.isPending || (item as any).approvalStatus === "needs_review"}
                                  onClick={() => itemStatusMut.mutate({ itemId: item.id, quoteId, approvalStatus: "needs_review" })}
                                >
                                  <HelpCircle className="h-3 w-3" /> Needs Review
                                </Button>
                              </div>
                              {(item as any).customerNotes && (
                                <p className="text-xs text-muted-foreground italic bg-muted/30 rounded px-2 py-1.5">
                                  <span className="font-medium not-italic text-foreground">Customer note:</span> {(item as any).customerNotes}
                                </p>
                              )}
                            </div>
                          )}
                          {(item as any).approvalStatus === "converted_to_approved_work" && (
                            <div className="border-t pt-2">
                              <span className="inline-flex items-center gap-1 text-xs text-teal-700">
                                <CheckCircle className="h-3 w-3" /> Converted to Approved Work
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Deficiency photos */}
        {jobMedia.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="h-4 w-4" /> Deficiency Photos
              </CardTitle>
              <p className="text-xs text-muted-foreground">Photos from linked deficiencies. Toggle customer-facing to control what appears in customer-facing output.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {items
                .filter((item) => (item as any).deficiencyId)
                .map((item) => {
                  const photos = photosByDefId.get((item as any).deficiencyId) ?? [];
                  if (photos.length === 0) return null;
                  return (
                    <div key={item.id} className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{item.description}</p>
                      <div className="flex gap-2 flex-wrap">
                        {photos.map((photo) => (
                          <div key={photo.id} className="relative group">
                            <img
                              src={photo.fileUrl}
                              alt={photo.caption || photo.fileName}
                              className="h-24 w-24 object-cover rounded border cursor-pointer"
                              onClick={() => setLightboxUrl(photo.fileUrl)}
                            />
                            <div className="absolute top-0.5 right-0.5">
                              <button
                                type="button"
                                title={photo.isCustomerFacing ? "Customer-facing — click to hide" : "Internal only — click to make customer-facing"}
                                onClick={() => markCustomerFacingMut.mutate({ id: photo.id, isCustomerFacing: !photo.isCustomerFacing })}
                                className="bg-black/60 rounded p-0.5"
                              >
                                {photo.isCustomerFacing ? (
                                  <Eye className="h-3 w-3 text-green-400" />
                                ) : (
                                  <EyeOff className="h-3 w-3 text-gray-300" />
                                )}
                              </button>
                            </div>
                            {photo.caption && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 w-24 truncate">{photo.caption}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
                .filter(Boolean)}
            </CardContent>
          </Card>
        )}

        {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

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

      {/* Record Approval dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" /> Record Approval
            </DialogTitle>
            <DialogDescription>Log who approved this quote and how the approval was received.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <QuoteApproverSuggestion
              customerOrgId={customer?.id}
              siteId={site?.id}
              onSelect={(name, email) => setApprovalForm((f) => ({
                ...f,
                approvedByName: f.approvedByName || name,
                approvedByEmail: email,
              }))}
            />
            <div className="space-y-1">
              <Label className="text-xs">Approved By (Name)</Label>
              <Input
                placeholder="Contact name"
                value={approvalForm.approvedByName}
                onChange={(e) => setApprovalForm((f) => ({ ...f, approvedByName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact Email</Label>
              <Input
                type="email"
                placeholder="contact@example.com"
                value={approvalForm.approvedByEmail}
                onChange={(e) => setApprovalForm((f) => ({ ...f, approvedByEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approval Method</Label>
              <Select
                value={approvalForm.approvalSource}
                onValueChange={(v) => setApprovalForm((f) => ({ ...f, approvalSource: v as typeof f.approvalSource }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(APPROVAL_SOURCE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approval Date (leave blank for today)</Label>
              <Input
                type="date"
                value={approvalForm.approvedAt}
                onChange={(e) => setApprovalForm((f) => ({ ...f, approvedAt: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setApprovalDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={recordApprovalMut.isPending}
              onClick={() => recordApprovalMut.mutate({
                id: quoteId,
                approvedByName: approvalForm.approvedByName || undefined,
                approvedByEmail: approvalForm.approvedByEmail || undefined,
                approvalSource: approvalForm.approvalSource,
                approvedAt: approvalForm.approvedAt || undefined,
              })}
            >
              {recordApprovalMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to Customer dialog */}
      <SendQuoteDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        customerOrgId={customer?.id}
        siteId={site?.id}
        isPending={sendMut.isPending}
        onSend={(to) => sendMut.mutate({ id: quoteId, to })}
      />

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
