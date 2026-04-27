import { useState, useId } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft, FileText, Save } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Constants (update rates here, not scattered in the component) ────────────

export const LABOUR_RATES: Record<string, number> = {
  "Fire Alarm Technician": 156,
  "Sprinkler Fitter": 205,
  "Journeyman Electrician": 165,
};

const SERVICE_TYPES = [
  "Fire Alarm Inspection",
  "Fire Extinguisher Inspection",
  "Emergency Lighting Inspection",
  "Backflow Test",
  "Sprinkler Inspection",
  "Fire Hose / Standpipe Service",
  "Monitoring / Admin",
  "Custom Service",
] as const;

const BC_CITIES = [
  "Abbotsford", "Burnaby", "Chilliwack", "Coquitlam", "Delta",
  "Kamloops", "Kelowna", "Langley", "Maple Ridge", "Mission",
  "Nanaimo", "New Westminster", "North Vancouver", "Port Coquitlam",
  "Port Moody", "Prince George", "Richmond", "Surrey", "Trail",
  "Vancouver", "West Vancouver", "White Rock", "Victoria",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceLine {
  id: string;
  serviceType: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineNotes: string;
}

interface LabourLine {
  id: string;
  labourType: string;
  hours: number;
  rate: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function uid() {
  return Math.random().toString(36).slice(2);
}

function emptyService(): ServiceLine {
  return { id: uid(), serviceType: "", description: "", qty: 1, unitPrice: 0, lineNotes: "" };
}

function emptyLabour(): LabourLine {
  return { id: uid(), labourType: "", hours: 0, rate: 0 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewBuildingQuote() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // ── Building info ──
  const [city, setCity] = useState("");
  const [backflowCity, setBackflowCity] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [address, setAddress] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedCustomerOrgId, setSelectedCustomerOrgId] = useState<string>("");

  // ── Line items ──
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [labourLines, setLabourLines] = useState<LabourLine[]>([]);

  // ── Discount & comments ──
  const [discount, setDiscount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState("");
  const [comments, setComments] = useState("");

  // ── Data queries ──
  const { data: sites = [] } = trpc.site.listByCompany.useQuery(
    { companyId: user?.companyId ?? 0 },
    { enabled: !!user?.companyId }
  );
  const { data: customerOrgs = [] } = trpc.customerOrg.list.useQuery(
    { companyId: user?.companyId ?? 0 },
    { enabled: !!user?.companyId }
  );

  // Auto-fill building info from selected site
  const handleSiteChange = (val: string) => {
    setSelectedSiteId(val);
    if (val && val !== "__none") {
      const site = sites.find((s) => String(s.id) === val);
      if (site) {
        if (site.address) setAddress(site.address);
        if (site.name) setBuildingName(site.name);
        if (site.customerOrgId) setSelectedCustomerOrgId(String(site.customerOrgId));
      }
    }
  };

  // ── Mutations ──
  const createMutation = trpc.quote.createBuilding.useMutation({
    onSuccess: ({ quoteId }) => {
      toast.success("Quote saved as draft.");
      navigate(`/admin/quotes`);
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  // ── Calculations ──
  const servicesSubtotal = serviceLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const labourSubtotal   = labourLines.reduce((s, l) => s + l.hours * l.rate, 0);
  const subtotal         = servicesSubtotal + labourSubtotal;
  const discountAmount   = subtotal * (Math.min(100, Math.max(0, discount)) / 100);
  const total            = subtotal - discountAmount;

  // ── Service line handlers ──
  const addService = () => setServiceLines((p) => [...p, emptyService()]);
  const removeService = (id: string) => setServiceLines((p) => p.filter((l) => l.id !== id));
  const updateService = (id: string, patch: Partial<ServiceLine>) =>
    setServiceLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handleServiceTypeChange = (id: string, type: string) => {
    const desc = type === "Custom Service" ? "" : type;
    updateService(id, { serviceType: type, description: desc });
  };

  // ── Labour line handlers ──
  const addLabour = () => setLabourLines((p) => [...p, emptyLabour()]);
  const removeLabour = (id: string) => setLabourLines((p) => p.filter((l) => l.id !== id));
  const updateLabour = (id: string, patch: Partial<LabourLine>) =>
    setLabourLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handleLabourTypeChange = (id: string, type: string) => {
    const rate = LABOUR_RATES[type] ?? 0;
    updateLabour(id, { labourType: type, rate });
  };

  // ── Validation & submit ──
  const validate = () => {
    if (!address.trim()) { toast.error("Address is required."); return false; }
    if (!serviceLines.length && !labourLines.length) {
      toast.error("Add at least one service or labour line."); return false;
    }
    for (const s of serviceLines) {
      if (!s.serviceType) { toast.error("Select a service type for all service lines."); return false; }
      if (s.qty <= 0)     { toast.error("Service quantity must be greater than 0."); return false; }
    }
    for (const l of labourLines) {
      if (!l.labourType)  { toast.error("Select a labour type for all labour lines."); return false; }
      if (l.hours < 0)    { toast.error("Labour hours cannot be negative."); return false; }
    }
    if (discount < 0 || discount > 100) { toast.error("Discount must be between 0 and 100."); return false; }
    return true;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    createMutation.mutate({
      siteId: selectedSiteId && selectedSiteId !== "__none" ? parseInt(selectedSiteId) : undefined,
      customerOrgId: selectedCustomerOrgId && selectedCustomerOrgId !== "__none" ? parseInt(selectedCustomerOrgId) : undefined,
      buildingInfo: { city: city || undefined, backflowFeeCity: backflowCity || undefined, buildingId: buildingId || undefined, buildingName: buildingName || undefined, address },
      serviceLines: serviceLines.map((s) => ({ serviceType: s.serviceType, description: s.description || s.serviceType, qty: s.qty, unitPrice: s.unitPrice, lineNotes: s.lineNotes || undefined })),
      labourLines: labourLines.map((l) => ({ labourType: l.labourType, hours: l.hours, rate: l.rate })),
      discount,
      discountReason: discountReason || undefined,
      comments: comments || undefined,
    });
  };

  const isPending = createMutation.isPending;

  return (
    <AdminLayout title="">
      <form onSubmit={handleSave} noValidate>
        {/* ── Page header ── */}
        <div className="flex items-center gap-3 mb-6">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/admin/quotes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold leading-tight">New Building Quote</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Generate a quote using our standard service rates</p>
          </div>
        </div>

        {/* ── Two-column layout: form | sticky summary ── */}
        <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-6 space-y-4 lg:space-y-0">

          {/* ── Left: form sections ── */}
          <div className="space-y-4">

            {/* 1 · Building Information */}
            <SectionCard title="Building Information">
              <div className="space-y-4">
                <FieldRow>
                  <Field label="Link to Existing Site">
                    <Select value={selectedSiteId} onValueChange={handleSiteChange}>
                      <SelectTrigger><SelectValue placeholder="Select site (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No site</SelectItem>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Customer / Org">
                    <Select value={selectedCustomerOrgId} onValueChange={setSelectedCustomerOrgId}>
                      <SelectTrigger><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No customer</SelectItem>
                        {customerOrgs.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldRow>

                <Field label="Address" required>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main Street, Vancouver, BC" />
                </Field>

                <FieldRow>
                  <Field label="Building Name">
                    <Input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="e.g. Tower A" />
                  </Field>
                  <Field label="Building ID">
                    <Input value={buildingId} onChange={(e) => setBuildingId(e.target.value)} placeholder="Optional" />
                  </Field>
                </FieldRow>

                <FieldRow>
                  <Field label="City">
                    <Select value={city} onValueChange={setCity}>
                      <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                      <SelectContent>
                        {BC_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Backflow Fee City">
                    <Select value={backflowCity} onValueChange={setBackflowCity}>
                      <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                      <SelectContent>
                        {BC_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldRow>
              </div>
            </SectionCard>

            {/* 2 · Services */}
            <SectionCard title="Select Services">
              {serviceLines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No services selected. Click <strong>Add Service</strong> to begin.
                </p>
              ) : (
                <div className="space-y-3 mb-4">
                  {/* Header row — desktop only */}
                  <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>Service Type</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span>Line Total</span>
                    <span />
                  </div>

                  {serviceLines.map((line) => (
                    <div key={line.id} className="border rounded-lg p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_32px] sm:gap-2 sm:items-start">
                      <div className="space-y-2">
                        <Select value={line.serviceType} onValueChange={(v) => handleServiceTypeChange(line.id, v)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select service type" /></SelectTrigger>
                          <SelectContent>
                            {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {line.serviceType === "Custom Service" && (
                          <Input
                            className="h-8 text-sm"
                            placeholder="Describe the service"
                            value={line.description}
                            onChange={(e) => updateService(line.id, { description: e.target.value })}
                          />
                        )}
                        <Input
                          className="h-8 text-xs text-muted-foreground"
                          placeholder="Notes (optional)"
                          value={line.lineNotes}
                          onChange={(e) => updateService(line.id, { lineNotes: e.target.value })}
                        />
                      </div>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="h-9 text-sm"
                        value={line.qty}
                        onChange={(e) => updateService(line.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="h-9 text-sm pl-6"
                          value={line.unitPrice}
                          onChange={(e) => updateService(line.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="flex items-center h-9 text-sm font-medium">
                        {CAD.format(line.qty * line.unitPrice)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeService(line.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={addService} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Service
              </Button>
            </SectionCard>

            {/* 3 · Labour */}
            <SectionCard title="Labour">
              {labourLines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No labour added. Click <strong>Add Labour</strong> to begin.
                </p>
              ) : (
                <div className="space-y-3 mb-4">
                  <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>Labour Type</span>
                    <span>Hours</span>
                    <span>Rate / hr</span>
                    <span>Line Total</span>
                    <span />
                  </div>

                  {labourLines.map((line) => (
                    <div key={line.id} className="border rounded-lg p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_32px] sm:gap-2 sm:items-center">
                      <Select value={line.labourType} onValueChange={(v) => handleLabourTypeChange(line.id, v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select labour type" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(LABOUR_RATES).map(([type, rate]) => (
                            <SelectItem key={type} value={type}>{type} — {CAD.format(rate)}/hr</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        className="h-9 text-sm"
                        value={line.hours}
                        onChange={(e) => updateLabour(line.id, { hours: parseFloat(e.target.value) || 0 })}
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="h-9 text-sm pl-6"
                          value={line.rate}
                          onChange={(e) => updateLabour(line.id, { rate: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="flex items-center h-9 text-sm font-medium">
                        {CAD.format(line.hours * line.rate)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLabour(line.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={addLabour} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Labour
              </Button>
            </SectionCard>

            {/* 4 · Discount */}
            <SectionCard title="Discount">
              <FieldRow>
                <Field label="Discount (%)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={discount}
                    onChange={(e) => setDiscount(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    placeholder="0"
                  />
                </Field>
                <Field label="Reason (optional)">
                  <Input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="e.g. Loyalty discount"
                  />
                </Field>
              </FieldRow>
            </SectionCard>

            {/* 5 · Comments */}
            <SectionCard title="Comments">
              <Textarea
                rows={4}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add any additional notes or comments for this quote…"
              />
            </SectionCard>

            {/* Mobile action buttons */}
            <div className="flex gap-3 lg:hidden pb-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => navigate("/admin/quotes")} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 gap-1.5" disabled={isPending}>
                <Save className="h-4 w-4" />
                {isPending ? "Saving…" : "Save Draft"}
              </Button>
            </div>
          </div>

          {/* ── Right: sticky quote summary ── */}
          <div className="lg:sticky lg:top-24 lg:self-start space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Quote Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Services</span>
                  <span>{CAD.format(servicesSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labour</span>
                  <span>{CAD.format(labourSubtotal)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{CAD.format(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount ({discount}%{discountReason ? ` — ${discountReason}` : ""})</span>
                    <span>−{CAD.format(discountAmount)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold text-base pt-1">
                  <span>Total</span>
                  <span>{CAD.format(total)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">Amounts in CAD, excluding applicable taxes.</p>
              </CardContent>
            </Card>

            {/* Desktop action buttons */}
            <div className="hidden lg:flex flex-col gap-2">
              <Button type="submit" className="w-full gap-1.5" disabled={isPending}>
                <Save className="h-4 w-4" />
                {isPending ? "Saving…" : "Save Draft"}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/admin/quotes")} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </form>
    </AdminLayout>
  );
}
