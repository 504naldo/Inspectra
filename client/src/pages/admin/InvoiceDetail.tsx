import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { WorkflowHint } from "@/components/help/WorkflowHint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import {
  ArrowLeft,
  FileText,
  Loader2,
  AlertCircle,
  Building2,
  DollarSign,
  Calendar,
  ExternalLink,
  Download,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  Lock,
  Bot,
  Copy,
  Send,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { INVOICE_STATUSES, type InvoiceStatus } from "../../../../drizzle/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "$0.00";
  const n = parseFloat(String(v));
  if (isNaN(n)) return "$0.00";
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", approved: "Approved",
  paid: "Paid", partial: "Partial", overdue: "Overdue", void: "Void",
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft:    "bg-gray-100 text-gray-700",
  sent:     "bg-blue-100 text-blue-700",
  viewed:   "bg-purple-100 text-purple-700",
  approved: "bg-cyan-100 text-cyan-700",
  paid:     "bg-green-100 text-green-700",
  partial:  "bg-yellow-100 text-yellow-700",
  overdue:  "bg-red-100 text-red-700",
  void:     "bg-gray-100 text-gray-400",
};

// ── Sub-dialogs ───────────────────────────────────────────────────────────────

function AddLineItemDialog({
  invoiceId,
  onClose,
  onAdded,
}: { invoiceId: number; onClose: () => void; onAdded: () => void }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [taxable, setTaxable] = useState(false);

  const addItem = trpc.invoice.addLineItem.useMutation({
    onSuccess: () => { onAdded(); onClose(); },
    onError: () => toast.error("Failed to add line item"),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Description <span className="text-destructive">*</span></Label>
            <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Line item description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input className="mt-1" type="number" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label>Unit Price</Label>
              <Input className="mt-1" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="taxable"
              checked={taxable}
              onChange={(e) => setTaxable(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="taxable" className="cursor-pointer">Taxable</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={addItem.isPending}>Cancel</Button>
          <Button
            onClick={() => addItem.mutate({
              invoiceId,
              description: description.trim(),
              quantity: parseFloat(quantity) || 1,
              unitPrice: parseFloat(unitPrice) || 0,
              taxable,
            })}
            disabled={addItem.isPending || !description.trim()}
          >
            {addItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillingContactSuggestion({
  customerOrgId,
  onSelect,
}: { customerOrgId?: number; onSelect: (name: string, email: string) => void }) {
  const { data } = trpc.contact.getRecipientsForWorkflow.useQuery(
    { customerOrgId, workflowType: "invoice" },
    { enabled: !!customerOrgId },
  );
  const suggestions = [...(data?.recommended ?? []), ...(data?.fallback ?? [])].filter((c) => c.email);
  if (suggestions.length === 0) return null;
  return (
    <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-2.5 space-y-1.5">
      <p className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide">Billing contacts</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.name, c.email!)}
            className="text-xs bg-white dark:bg-green-900/40 border border-green-200 dark:border-green-700 rounded px-2 py-0.5 hover:bg-green-100 dark:hover:bg-green-800/40 transition-colors"
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-muted-foreground ml-1">· {c.email}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EditHeaderDialog({
  invoice,
  onClose,
  onSaved,
}: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    billToName: invoice.billToName ?? "",
    billToEmail: invoice.billToEmail ?? "",
    billToAddress: invoice.billToAddress ?? "",
    billToCity: invoice.billToCity ?? "",
    billToState: invoice.billToState ?? "",
    billToPostalCode: invoice.billToPostalCode ?? "",
    invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split("T")[0] : "",
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split("T")[0] : "",
    sageCustomerCode: invoice.sageCustomerCode ?? "",
    sageGlCode: invoice.sageGlCode ?? "",
    sageDepartment: invoice.sageDepartment ?? "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const update = trpc.invoice.update.useMutation({
    onSuccess: () => { toast.success("Invoice updated"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Invoice Header</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bill To</p>
            <div className="grid grid-cols-1 gap-3">
              <BillingContactSuggestion
                customerOrgId={invoice.customerOrgId}
                onSelect={(name, email) => setForm((f) => ({ ...f, billToName: f.billToName || name, billToEmail: email }))}
              />
              <div>
                <Label>Name</Label>
                <Input className="mt-1" value={form.billToName} onChange={set("billToName")} placeholder="Company or person name" />
              </div>
              <div>
                <Label>Email</Label>
                <Input className="mt-1" type="email" value={form.billToEmail} onChange={set("billToEmail")} placeholder="billing@example.com" />
              </div>
              <div>
                <Label>Address</Label>
                <Input className="mt-1" value={form.billToAddress} onChange={set("billToAddress")} placeholder="Street address" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <Label>City</Label>
                  <Input className="mt-1" value={form.billToCity} onChange={set("billToCity")} />
                </div>
                <div>
                  <Label>Province</Label>
                  <Input className="mt-1" value={form.billToState} onChange={set("billToState")} placeholder="ON" />
                </div>
                <div>
                  <Label>Postal Code</Label>
                  <Input className="mt-1" value={form.billToPostalCode} onChange={set("billToPostalCode")} placeholder="A1A 1A1" />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-3 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Invoice Date</Label>
                <Input className="mt-1" type="date" value={form.invoiceDate} onChange={set("invoiceDate")} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input className="mt-1" type="date" value={form.dueDate} onChange={set("dueDate")} />
              </div>
            </div>
          </div>
          <div className="space-y-3 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sage / Accounting</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Customer Code</Label>
                <Input className="mt-1" value={form.sageCustomerCode} onChange={set("sageCustomerCode")} placeholder="e.g. CUST001" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>GL Code</Label>
                  <Input className="mt-1" value={form.sageGlCode} onChange={set("sageGlCode")} placeholder="e.g. 4000" />
                </div>
                <div>
                  <Label>Department</Label>
                  <Input className="mt-1" value={form.sageDepartment} onChange={set("sageDepartment")} placeholder="e.g. OPS" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button
            onClick={() => update.mutate({
              id: invoice.id,
              billToName: form.billToName || undefined,
              billToEmail: form.billToEmail || undefined,
              billToAddress: form.billToAddress || undefined,
              billToCity: form.billToCity || undefined,
              billToState: form.billToState || undefined,
              billToPostalCode: form.billToPostalCode || undefined,
              invoiceDate: form.invoiceDate || undefined,
              dueDate: form.dueDate || undefined,
              sageCustomerCode: form.sageCustomerCode || undefined,
              sageGlCode: form.sageGlCode || undefined,
              sageDepartment: form.sageDepartment || undefined,
            })}
            disabled={update.isPending}
          >
            {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({
  invoice,
  onClose,
  onPaid,
}: { invoice: any; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = useState(String(parseFloat(String(invoice.balanceDue ?? invoice.total ?? "0")).toFixed(2)));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);

  const markPaid = trpc.invoice.markPaid.useMutation({
    onSuccess: () => { toast.success("Payment recorded"); onPaid(); onClose(); },
    onError: () => toast.error("Failed to record payment"),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount Paid</Label>
            <Input className="mt-1" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Payment Date</Label>
            <Input className="mt-1" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={markPaid.isPending}>Cancel</Button>
          <Button onClick={() => markPaid.mutate({ id: invoice.id, amountPaid: parseFloat(amount), paidAt })} disabled={markPaid.isPending || !amount || parseFloat(amount) <= 0}>
            {markPaid.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Send Invoice dialog ───────────────────────────────────────────────────────

function SendInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSend,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: { id: number; customerOrgId?: number | null; siteId?: number | null; billToEmail?: string | null };
  onSend: (to: string[]) => void;
  isPending: boolean;
}) {
  const { data } = trpc.contact.getRecipientsForWorkflow.useQuery(
    { customerOrgId: invoice.customerOrgId ?? undefined, siteId: invoice.siteId ?? undefined, workflowType: "invoice" },
    { enabled: open && !!(invoice.customerOrgId || invoice.siteId) },
  );
  const suggestions = [...(data?.recommended ?? []), ...(data?.fallback ?? [])].filter((c) => c.email);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");

  useEffect(() => {
    if (!open) { setSelected(new Set()); setExtra(""); return; }
    const initial = new Set<string>();
    if (suggestions.length > 0) {
      suggestions.forEach((c) => initial.add(c.email!));
    } else if (invoice.billToEmail) {
      initial.add(invoice.billToEmail);
    }
    if (initial.size > 0 && selected.size === 0) setSelected(initial);
  }, [open, suggestions.length]);

  const toggle = (email: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(email) ? s.delete(email) : s.add(email); return s; });

  const extraEmails = extra.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.includes("@") && s.includes("."));
  const allTo = [...Array.from(selected), ...extraEmails];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Send Invoice to Customer
          </DialogTitle>
          <DialogDescription>
            A PDF will be generated and emailed to the selected recipients.
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
          ) : invoice.billToEmail ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Bill-to email</Label>
              <label className="flex items-center gap-2.5 rounded-md border px-3 py-2 hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(invoice.billToEmail)}
                  onChange={() => toggle(invoice.billToEmail!)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{invoice.billToEmail}</span>
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contacts found. Enter an email below.</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props { id: number }

export default function InvoiceDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  // Void and Sage-export are admin-only capabilities (enforced server-side in
  // invoiceRouter). Hide their controls from office users so they don't click a
  // button that 403s.
  const canManage = user?.role === "admin" || user?.role === "office";

  const [showAddItem, setShowAddItem] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [showEditHeader, setShowEditHeader] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSubject, setAiSubject] = useState("");
  const [aiBody, setAiBody] = useState("");
  const aiDraft = trpc.aiAssistant.draftCustomerMessage.useMutation({
    onSuccess: (d) => { setAiSubject(d.subject); setAiBody(d.body); setAiOpen(true); },
    onError: (e) => toast.error(e.message || "AI request failed"),
  });

  const { data: invoice, isLoading, error } = trpc.invoice.get.useQuery({ id }, { enabled: !!id });

  const invalidate = () => utils.invoice.get.invalidate({ id });

  const updateStatus = trpc.invoice.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const removeItem = trpc.invoice.removeLineItem.useMutation({
    onSuccess: () => { toast.success("Line item removed"); invalidate(); },
    onError: () => toast.error("Failed to remove item"),
  });

  const updateItem = trpc.invoice.updateLineItem.useMutation({
    onSuccess: () => { toast.success("Line item updated"); setEditingItem(null); invalidate(); },
    onError: () => toast.error("Failed to update item"),
  });

  const voidInvoice = trpc.invoice.void.useMutation({
    onSuccess: () => { toast.success("Invoice voided"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const sendMut = trpc.invoice.send.useMutation({
    onSuccess: () => { toast.success("Invoice sent to customer"); setSendOpen(false); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const generatePdf = trpc.invoice.generatePdf.useMutation({
    onSuccess: ({ pdfUrl }) => { invalidate(); window.open(pdfUrl, "_blank", "noopener"); },
    onError: (e) => toast.error(e.message || "PDF generation failed"),
  });

  const markExportedToSage = trpc.invoice.markExportedToSage.useMutation({
    onSuccess: () => { toast.success("Marked as exported to Sage"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const exportSage = trpc.invoice.exportSage.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sage-export-${invoice?.invoiceNumber ?? id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.count} invoice(s) to CSV`);
      invalidate();
    },
    onError: (e) => toast.error(e.message || "Sage export failed"),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !invoice) {
    return (
      <AdminLayout>
        <div className="py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Invoice not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/invoices")}>
            Back to Invoices
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const isVoid = invoice.status === "void";
  const isPaid = invoice.status === "paid";
  const isSageExported = invoice.sageExportStatus === "exported";
  // Locked invoices cannot have their contents or amounts changed.
  // Voided/paid/Sage-exported are all accounting-final.
  const isLocked = isVoid || isPaid || isSageExported;
  const lockedReason = isVoid
    ? "This invoice has been voided and is read-only."
    : isPaid
    ? "This invoice has been marked paid and is locked for accounting integrity."
    : isSageExported
    ? "This invoice has been exported to Sage and is locked. Reset the Sage export status to unlock."
    : null;
  const lineItems = invoice.lineItems ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <WorkflowHint hint="Exported or paid invoices are locked for accounting integrity. Edit line items and amounts before exporting or recording payment." />
        {/* Back + Header */}
        <div>
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={() => navigate("/admin/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Invoices
          </Button>

          {isLocked && lockedReason && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{lockedReason}</span>
            </div>
          )}

          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[invoice.status as InvoiceStatus] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[invoice.status as InvoiceStatus] ?? invoice.status}
                </span>
                {invoice.sageExportStatus === "exported" && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700">
                    Sage Exported
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold mt-2 flex items-center gap-2 font-mono">
                <FileText className="h-6 w-6 text-primary" />
                {invoice.invoiceNumber}
              </h1>
              {(invoice.customerOrg?.name ?? invoice.billToName) && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {invoice.customerOrg?.name ?? invoice.billToName}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                disabled={aiDraft.isPending}
                onClick={() => aiDraft.mutate({ type: "invoice", entityId: invoice.id, tone: "professional" })}
              >
                {aiDraft.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                Draft Note
              </Button>
              {invoice.pdfUrl ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => window.open(invoice.pdfUrl!, "_blank", "noopener")}
                >
                  <Eye className="h-3.5 w-3.5" /> View PDF
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => generatePdf.mutate({ id: invoice.id })}
                  disabled={generatePdf.isPending}
                >
                  {generatePdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {generatePdf.isPending ? "Generating…" : "Generate PDF"}
                </Button>
              )}
              {!isLocked && (invoice.status === "draft" || invoice.status === "sent") && (
                <Button size="sm" className="gap-1.5" onClick={() => setSendOpen(true)}>
                  <Send className="h-3.5 w-3.5" /> Send Invoice
                </Button>
              )}
              {!isLocked && invoice.status === "draft" && (
                <Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground" onClick={() => updateStatus.mutate({ id: invoice.id, status: "sent" })} disabled={updateStatus.isPending}>
                  <CheckCircle className="h-3.5 w-3.5" /> Mark Sent (manual)
                </Button>
              )}
              {!isLocked && (invoice.status === "sent" || invoice.status === "viewed") && (
                <Button size="sm" onClick={() => updateStatus.mutate({ id: invoice.id, status: "approved" })} disabled={updateStatus.isPending}>
                  Mark Approved
                </Button>
              )}
              {!isVoid && !isPaid && !isSageExported && (
                <Button size="sm" variant="outline" onClick={() => setShowMarkPaid(true)}>
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> Record Payment
                </Button>
              )}
              {canManage && !isVoid && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportSage.mutate({ ids: [invoice.id] })}
                  disabled={exportSage.isPending}
                  title="Download Sage-ready CSV"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {exportSage.isPending ? "Exporting…" : "Export Sage CSV"}
                </Button>
              )}
              {canManage && !isVoid && !isSageExported && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markExportedToSage.mutate({ id: invoice.id })}
                  disabled={markExportedToSage.isPending}
                  title="Mark as already exported to Sage without re-downloading"
                >
                  {markExportedToSage.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                  Mark Exported
                </Button>
              )}
              {canManage && !isVoid && !isPaid && !isSageExported && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Void this invoice? This cannot be undone.")) {
                      voidInvoice.mutate({ id: invoice.id });
                    }
                  }}
                  disabled={voidInvoice.isPending}
                >
                  Void
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bill To */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Bill To</span>
                {!isLocked && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowEditHeader(true)}>
                    <Edit className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{invoice.billToName ?? invoice.customerOrg?.name ?? "—"}</p>
              {invoice.billToEmail && <p className="text-muted-foreground">{invoice.billToEmail}</p>}
              {invoice.billToAddress && <p className="text-muted-foreground">{invoice.billToAddress}</p>}
              {(invoice.billToCity || invoice.billToPostalCode) && (
                <p className="text-muted-foreground">{[invoice.billToCity, invoice.billToState, invoice.billToPostalCode].filter(Boolean).join(", ")}</p>
              )}
              {invoice.site?.name && <p className="text-muted-foreground mt-2">Site: {invoice.site.name}</p>}
            </CardContent>
          </Card>

          {/* Dates & Sage */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Dates & Sage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InvRow label="Invoice Date">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : "—"}</InvRow>
              <InvRow label="Due Date">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}</InvRow>
              {invoice.sentAt && <InvRow label="Sent At">{new Date(invoice.sentAt).toLocaleDateString()}</InvRow>}
              {invoice.paidAt && <InvRow label="Paid At">{new Date(invoice.paidAt).toLocaleDateString()}</InvRow>}
              {invoice.pdfUrl && (
                <InvRow label="PDF">
                  <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    <Download className="h-3 w-3" /> Download
                  </a>
                </InvRow>
              )}
              {invoice.sageCustomerCode && <InvRow label="Sage Customer">{invoice.sageCustomerCode}</InvRow>}
              {invoice.sageGlCode && <InvRow label="GL Code">{invoice.sageGlCode}</InvRow>}
              {invoice.sageDepartment && <InvRow label="Department">{invoice.sageDepartment}</InvRow>}
              {invoice.sageExportedAt && (
                <InvRow label="Sage Exported">{new Date(invoice.sageExportedAt).toLocaleDateString()}</InvRow>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Line Items */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Line Items</CardTitle>
              {!isLocked && (
                <Button size="sm" variant="outline" onClick={() => setShowAddItem(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {lineItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No line items yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground font-medium">
                      <th className="text-left py-2 pr-3">Description</th>
                      <th className="text-right py-2 px-3 w-16">Qty</th>
                      <th className="text-right py-2 px-3 w-28">Unit Price</th>
                      <th className="text-right py-2 px-3 w-28">Total</th>
                      <th className="text-center py-2 px-3 w-16">Tax</th>
                      {!isLocked && <th className="w-20"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item: any) => (
                      <tr key={item.id} className="border-b last:border-0">
                        {editingItem === item.id ? (
                          <>
                            <td className="py-2 pr-3">
                              <Input
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                className="h-7 text-xs"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                type="number"
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                className="h-7 text-xs text-right w-16"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                type="number"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="h-7 text-xs text-right w-24"
                              />
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground">
                              {fmt((parseFloat(editQty) || 0) * (parseFloat(editPrice) || 0))}
                            </td>
                            <td></td>
                            <td className="py-2 px-3">
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => updateItem.mutate({
                                    id: item.id,
                                    invoiceId: invoice.id,
                                    description: editDesc,
                                    quantity: parseFloat(editQty),
                                    unitPrice: parseFloat(editPrice),
                                  })}
                                  disabled={updateItem.isPending}
                                >
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setEditingItem(null)}>
                                  ✕
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 pr-3">{item.description}</td>
                            <td className="py-2 px-3 text-right">{parseFloat(String(item.quantity ?? "1"))}</td>
                            <td className="py-2 px-3 text-right">{fmt(item.unitPrice)}</td>
                            <td className="py-2 px-3 text-right font-medium">{fmt(item.total)}</td>
                            <td className="py-2 px-3 text-center text-xs text-muted-foreground">
                              {item.taxable ? "✓" : "—"}
                            </td>
                            {!isLocked && (
                              <td className="py-2 px-3">
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => {
                                      setEditingItem(item.id);
                                      setEditDesc(item.description);
                                      setEditQty(String(parseFloat(String(item.quantity ?? "1"))));
                                      setEditPrice(String(parseFloat(String(item.unitPrice ?? "0"))));
                                    }}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      if (confirm("Remove this line item?")) {
                                        removeItem.mutate({ id: item.id, invoiceId: invoice.id });
                                      }
                                    }}
                                    disabled={removeItem.isPending}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="mt-4 border-t pt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(invoice.subtotal)}</span>
              </div>
              {parseFloat(String(invoice.taxAmount ?? "0")) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({(parseFloat(String(invoice.taxRate ?? "0")) * 100).toFixed(0)}%)</span>
                  <span>{fmt(invoice.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>Total</span>
                <span>{fmt(invoice.total)}</span>
              </div>
              {parseFloat(String(invoice.amountPaid ?? "0")) > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Amount Paid</span>
                    <span className="text-green-600">– {fmt(invoice.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Balance Due</span>
                    <span className={parseFloat(String(invoice.balanceDue ?? "0")) > 0 ? "text-red-600" : "text-green-600"}>
                      {fmt(invoice.balanceDue)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Linked Records */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linked Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <LinkedRecord label="Approved Work" href={invoice.approvedWorkId ? `/admin/approved-work/${invoice.approvedWorkId}` : null} text={invoice.approvedWorkId ? `AW #${invoice.approvedWorkId}` : null} />
              <LinkedRecord label="Job" href={invoice.jobId ? `/admin/jobs/${invoice.jobId}` : null} text={invoice.jobId ? `Job #${invoice.jobId}` : null} />
              <LinkedRecord label="Quote" href={invoice.quoteId ? `/admin/repair-quotes/${invoice.quoteId}` : null} text={invoice.quoteId ? `Quote #${invoice.quoteId}` : null} />
              <LinkedRecord label="Work Order" href={null} text={invoice.workOrderId ? `WO #${invoice.workOrderId}` : null} />
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {(invoice.internalNotes || invoice.clientNotes) && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {invoice.internalNotes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Internal</p>
                  <p className="whitespace-pre-wrap">{invoice.internalNotes}</p>
                </div>
              )}
              {invoice.clientNotes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Client</p>
                  <p className="whitespace-pre-wrap">{invoice.clientNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ActivityTimeline entityType="invoice" entityId={id} />
          </CardContent>
        </Card>

        {/* Dialogs */}
        {showEditHeader && (
          <EditHeaderDialog
            invoice={invoice}
            onClose={() => setShowEditHeader(false)}
            onSaved={invalidate}
          />
        )}
        {showAddItem && (
          <AddLineItemDialog
            invoiceId={invoice.id}
            onClose={() => setShowAddItem(false)}
            onAdded={invalidate}
          />
        )}
        {showMarkPaid && (
          <MarkPaidDialog
            invoice={invoice}
            onClose={() => setShowMarkPaid(false)}
            onPaid={invalidate}
          />
        )}
      </div>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> AI Draft — Invoice Note
            </DialogTitle>
            <DialogDescription>Review before sending. AI suggestions are drafts only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {aiSubject && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Subject</p>
                <p className="text-sm font-medium">{aiSubject}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Body</p>
              <div className="whitespace-pre-wrap text-sm max-h-60 overflow-y-auto border rounded-md p-3 bg-muted/30">
                {aiBody}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const full = aiSubject ? `Subject: ${aiSubject}\n\n${aiBody}` : aiBody;
                navigator.clipboard.writeText(full);
                toast.success("Copied to clipboard");
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAiOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendInvoiceDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        invoice={{ id: invoice.id, customerOrgId: invoice.customerOrgId, siteId: invoice.siteId, billToEmail: invoice.billToEmail }}
        isPending={sendMut.isPending}
        onSend={(to) => sendMut.mutate({ id: invoice.id, to })}
      />
    </AdminLayout>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function InvRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}

function LinkedRecord({ label, href, text }: { label: string; href: string | null; text: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {href && text ? (
        <Link href={href}>
          <span className="text-primary hover:underline flex items-center gap-1 cursor-pointer">
            {text}
            <ExternalLink className="h-3 w-3" />
          </span>
        </Link>
      ) : text ? (
        <span className="text-sm">{text}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}
