import { useState } from "react";
import { useLocation } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Building2, Calendar, Pencil, Trash2, Plus, Loader2,
  ExternalLink, XCircle, FileText, ScrollText, AlertTriangle,
} from "lucide-react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import type { ServiceAgreementStatus, ServiceAgreementBillingCycle } from "../../../../drizzle/schema";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expiring_soon: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-600 border-red-200",
  cancelled: "bg-gray-100 text-gray-400 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  cancelled: "Cancelled",
};

const BILLING_CYCLE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
  per_service: "Per Service",
  custom: "Custom",
};

const INCLUDED_SERVICES_OPTIONS = [
  { value: "annual_fire_alarm", label: "Annual Fire Alarm" },
  { value: "sprinkler", label: "Sprinkler" },
  { value: "emergency_lighting", label: "Emergency Lighting" },
  { value: "fire_extinguishers", label: "Fire Extinguishers" },
  { value: "backflow", label: "Backflow" },
  { value: "monitoring", label: "Monitoring" },
  { value: "monthly_service", label: "Monthly Service" },
  { value: "deficiency_followup", label: "Deficiency Follow-up" },
];

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

function ServiceTagChip({ label, variant }: { label: string; variant?: "included" | "excluded" }) {
  return (
    <span className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border font-medium ${
      variant === "excluded"
        ? "bg-red-50 text-red-600 border-red-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-200"
    }`}>
      {label}
    </span>
  );
}

export default function ServiceAgreementDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const utils = trpc.useUtils();
  const invalidate = () => utils.serviceAgreement.get.invalidate({ id });

  const { data, isLoading } = trpc.serviceAgreement.get.useQuery({ id }, { enabled: !!id });

  const [editForm, setEditForm] = useState({
    name: "",
    status: "draft" as ServiceAgreementStatus,
    startDate: "",
    endDate: "",
    renewalDate: "",
    billingCycle: "annual" as ServiceAgreementBillingCycle,
    billingNotes: "",
    internalNotes: "",
    documentUrl: "",
    includedServices: [] as string[],
    excludedServices: [] as string[],
  });

  function openEdit() {
    if (!data) return;
    const a = data.agreement as any;
    setEditForm({
      name: a.name ?? "",
      status: a.status ?? "draft",
      startDate: a.startDate ? String(a.startDate).slice(0, 10) : "",
      endDate: a.endDate ? String(a.endDate).slice(0, 10) : "",
      renewalDate: a.renewalDate ? String(a.renewalDate).slice(0, 10) : "",
      billingCycle: a.billingCycle ?? "annual",
      billingNotes: a.billingNotes ?? "",
      internalNotes: a.internalNotes ?? "",
      documentUrl: a.documentUrl ?? "",
      includedServices: (a.includedServicesJson as string[]) ?? [],
      excludedServices: (a.excludedServicesJson as string[]) ?? [],
    });
    setEditOpen(true);
  }

  function toggleService(list: "includedServices" | "excludedServices", val: string) {
    setEditForm((f) => ({
      ...f,
      [list]: f[list].includes(val) ? f[list].filter((s) => s !== val) : [...f[list], val],
    }));
  }

  const updateMut = trpc.serviceAgreement.update.useMutation({
    onSuccess: () => { invalidate(); setEditOpen(false); toast.success("Agreement updated"); },
    onError: (e) => toast.error(e.message),
  });

  const cancelMut = trpc.serviceAgreement.cancel.useMutation({
    onSuccess: () => { invalidate(); setConfirmCancelOpen(false); toast.success("Agreement cancelled"); },
    onError: (e) => toast.error(e.message),
  });

  const addSiteMut = trpc.serviceAgreement.addSite.useMutation({
    onSuccess: () => { invalidate(); setAddSiteOpen(false); setSelectedSiteId(""); toast.success("Site added"); },
    onError: (e) => toast.error(e.message),
  });

  const removeSiteMut = trpc.serviceAgreement.removeSite.useMutation({
    onSuccess: () => { invalidate(); toast.success("Site removed"); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AdminLayout title="Service Agreement">
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return <AdminLayout title="Service Agreement"><p className="p-6 text-muted-foreground">Agreement not found.</p></AdminLayout>;
  }

  const { agreement: raw, customerName, sites, availableSites } = data;
  const a = raw as any;
  const isCancelled = a.status === "cancelled";

  const unaddedSites = availableSites.filter(
    (s: any) => !sites.some((as: any) => as.siteId === s.id),
  );

  return (
    <AdminLayout title={a.agreementNumber ?? `Agreement #${id}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{a.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[a.status] ?? ""}`}>
                {a.status === "expiring_soon" && <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                {STATUS_LABELS[a.status] ?? a.status}
              </span>
              {a.agreementNumber && <span className="text-xs text-muted-foreground">{a.agreementNumber}</span>}
              {customerName && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {customerName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isCancelled && (
              <>
                <Button size="sm" variant="outline" onClick={openEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddSiteOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Site
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmCancelOpen(true)} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <XCircle className="h-3.5 w-3.5" /> Cancel Agreement
                </Button>
              </>
            )}
            <Link href="/admin/service-agreements">
              <Button size="sm" variant="ghost" className="gap-1.5">
                <ScrollText className="h-3.5 w-3.5" /> All Agreements
              </Button>
            </Link>
          </div>
        </div>

        {/* Info block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Start Date</p>
              <p className="font-medium text-sm">{fmtDate(a.startDate)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">End Date</p>
              <p className="font-medium text-sm">{fmtDate(a.endDate)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Renewal Date</p>
              <p className="font-medium text-sm">{fmtDate(a.renewalDate)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Billing Cycle</p>
              <p className="font-medium text-sm">{BILLING_CYCLE_LABELS[a.billingCycle] ?? a.billingCycle ?? "—"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Services */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Included Services</CardTitle>
            </CardHeader>
            <CardContent>
              {(a.includedServicesJson as string[] | null)?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {(a.includedServicesJson as string[]).map((s: string) => (
                    <ServiceTagChip
                      key={s}
                      label={INCLUDED_SERVICES_OPTIONS.find((o) => o.value === s)?.label ?? s}
                      variant="included"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No services specified</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Excluded Services</CardTitle>
            </CardHeader>
            <CardContent>
              {(a.excludedServicesJson as string[] | null)?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {(a.excludedServicesJson as string[]).map((s: string) => (
                    <ServiceTagChip
                      key={s}
                      label={INCLUDED_SERVICES_OPTIONS.find((o) => o.value === s)?.label ?? s}
                      variant="excluded"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None specified</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Covered Sites */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Covered Sites ({sites.length})</CardTitle>
            {!isCancelled && unaddedSites.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setAddSiteOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Site
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No sites covered yet.</p>
            ) : (
              <div className="space-y-2">
                {(sites as any[]).map((as: any) => (
                  <div key={as.id} className="flex items-start justify-between gap-3 border rounded-lg px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{as.siteName ?? `Site #${as.siteId}`}</p>
                      {as.siteCity && <p className="text-xs text-muted-foreground">{as.siteCity}</p>}
                      {as.includedServicesJson?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(as.includedServicesJson as string[]).map((s: string) => (
                            <span key={s} className="text-xs bg-muted rounded-full px-2 py-0.5">
                              {INCLUDED_SERVICES_OPTIONS.find((o) => o.value === s)?.label ?? s}
                            </span>
                          ))}
                        </div>
                      )}
                      {as.siteSpecificNotes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{as.siteSpecificNotes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/admin/sites`}>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                      {!isCancelled && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                          disabled={removeSiteMut.isPending}
                          onClick={() => removeSiteMut.mutate({ agreementSiteId: as.id, agreementId: id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {(a.billingNotes || a.internalNotes || a.documentUrl) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {a.billingNotes && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Billing Notes</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.billingNotes}</p></CardContent>
              </Card>
            )}
            {a.internalNotes && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Internal Notes</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.internalNotes}</p></CardContent>
              </Card>
            )}
            {a.documentUrl && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Agreement Document</CardTitle></CardHeader>
                <CardContent>
                  <a href={a.documentUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> View Document
                    </Button>
                  </a>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Activity */}
        <Card>
          <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <ActivityTimeline entityType={"service_agreement" as any} entityId={id} />
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Agreement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Agreement Name *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as ServiceAgreementStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).filter(([v]) => v !== "cancelled").map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Billing Cycle</Label>
                <Select value={editForm.billingCycle} onValueChange={(v) => setEditForm((f) => ({ ...f, billingCycle: v as ServiceAgreementBillingCycle }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BILLING_CYCLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Renewal Date</Label>
                <Input type="date" value={editForm.renewalDate} onChange={(e) => setEditForm((f) => ({ ...f, renewalDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Included Services</Label>
              <div className="flex flex-wrap gap-2">
                {INCLUDED_SERVICES_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleService("includedServices", o.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      editForm.includedServices.includes(o.value)
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "border-border text-muted-foreground hover:border-emerald-400"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Excluded Services</Label>
              <div className="flex flex-wrap gap-2">
                {INCLUDED_SERVICES_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleService("excludedServices", o.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      editForm.excludedServices.includes(o.value)
                        ? "bg-red-600 text-white border-red-600"
                        : "border-border text-muted-foreground hover:border-red-400"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Billing Notes</Label>
              <Textarea rows={2} value={editForm.billingNotes} onChange={(e) => setEditForm((f) => ({ ...f, billingNotes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Internal Notes</Label>
              <Textarea rows={2} value={editForm.internalNotes} onChange={(e) => setEditForm((f) => ({ ...f, internalNotes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Document URL (signed PDF, cloud link)</Label>
              <Input
                type="url"
                placeholder="https://…"
                value={editForm.documentUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, documentUrl: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              disabled={updateMut.isPending}
              className="gap-1.5"
              onClick={() => {
                if (!editForm.name.trim()) { toast.error("Name is required"); return; }
                updateMut.mutate({
                  id,
                  name: editForm.name.trim(),
                  status: editForm.status,
                  startDate: editForm.startDate || null,
                  endDate: editForm.endDate || null,
                  renewalDate: editForm.renewalDate || null,
                  billingCycle: editForm.billingCycle,
                  billingNotes: editForm.billingNotes || null,
                  internalNotes: editForm.internalNotes || null,
                  includedServicesJson: editForm.includedServices.length ? editForm.includedServices : null,
                  excludedServicesJson: editForm.excludedServices.length ? editForm.excludedServices : null,
                  documentUrl: editForm.documentUrl || null,
                });
              }}
            >
              {updateMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Site Dialog */}
      <Dialog open={addSiteOpen} onOpenChange={setAddSiteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Site to Agreement</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Site *</Label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger><SelectValue placeholder="Select site…" /></SelectTrigger>
                <SelectContent>
                  {unaddedSites.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.city ? ` — ${s.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unaddedSites.length === 0 && (
                <p className="text-xs text-muted-foreground">All sites for this customer are already added, or there are no sites for this customer.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSiteOpen(false)}>Cancel</Button>
            <Button
              disabled={addSiteMut.isPending || !selectedSiteId}
              className="gap-1.5"
              onClick={() => addSiteMut.mutate({ agreementId: id, siteId: parseInt(selectedSiteId) })}
            >
              {addSiteMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add Site
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirm Dialog */}
      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Agreement?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will mark the agreement as cancelled. It cannot be undone without editing the status manually. Sites will remain linked.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancelOpen(false)}>Keep Agreement</Button>
            <Button
              variant="destructive"
              disabled={cancelMut.isPending}
              className="gap-1.5"
              onClick={() => cancelMut.mutate({ id })}
            >
              {cancelMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Cancel Agreement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
