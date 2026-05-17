import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Plus, Search, Building2, Calendar, ChevronRight,
  AlertTriangle, ScrollText, Loader2,
} from "lucide-react";
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

const TABS: Array<{ label: string; value: ServiceAgreementStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Active", value: "active" },
  { label: "Expiring Soon", value: "expiring_soon" },
  { label: "Expired", value: "expired" },
  { label: "Cancelled", value: "cancelled" },
];

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

const emptyForm = {
  customerOrgId: "",
  name: "",
  status: "draft" as ServiceAgreementStatus,
  startDate: "",
  endDate: "",
  renewalDate: "",
  billingCycle: "annual" as ServiceAgreementBillingCycle,
  billingNotes: "",
  internalNotes: "",
  includedServices: [] as string[],
};

export default function ServiceAgreements() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? 0;

  const [tab, setTab] = useState<ServiceAgreementStatus | "">("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const utils = trpc.useUtils();

  const { data: agreements = [], isLoading } = trpc.serviceAgreement.list.useQuery(
    { status: tab || undefined },
  );

  const { data: customers = [] } = trpc.customerOrg.list.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const createMut = trpc.serviceAgreement.create.useMutation({
    onSuccess: (d) => {
      utils.serviceAgreement.list.invalidate();
      toast.success(`Agreement ${d.agreementNumber} created`);
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (agreements as any[]).filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.name?.toLowerCase().includes(q) ||
      a.agreementNumber?.toLowerCase().includes(q) ||
      a.customerName?.toLowerCase().includes(q)
    );
  });

  const counts = TABS.reduce((acc, t) => {
    if (t.value === "") {
      acc[""] = (agreements as any[]).length;
    } else {
      acc[t.value] = (agreements as any[]).filter((a: any) => a.status === t.value).length;
    }
    return acc;
  }, {} as Record<string, number>);

  function toggleService(val: string) {
    setForm((f) => ({
      ...f,
      includedServices: f.includedServices.includes(val)
        ? f.includedServices.filter((s) => s !== val)
        : [...f.includedServices, val],
    }));
  }

  function handleCreate() {
    if (!form.customerOrgId) { toast.error("Select a customer"); return; }
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    createMut.mutate({
      customerOrgId: parseInt(form.customerOrgId),
      name: form.name.trim(),
      status: form.status,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      renewalDate: form.renewalDate || undefined,
      billingCycle: form.billingCycle,
      billingNotes: form.billingNotes || undefined,
      internalNotes: form.internalNotes || undefined,
      includedServicesJson: form.includedServices.length ? form.includedServices : undefined,
    });
  }

  return (
    <AdminLayout title="Service Agreements">
      <div className="space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search agreements…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Agreement
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {t.label}
              {counts[t.value] != null && (
                <span className="ml-1.5 text-xs opacity-70">({counts[t.value]})</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <ScrollText className="h-8 w-8 mx-auto mb-3 opacity-30" />
              {search ? "No agreements match your search." : "No agreements yet. Click \"New Agreement\" to create the first one."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((a: any) => (
              <Link key={a.id} href={`/admin/service-agreements/${a.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold truncate">{a.name}</span>
                          {a.agreementNumber && (
                            <span className="text-xs text-muted-foreground shrink-0">{a.agreementNumber}</span>
                          )}
                          <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_BADGE[a.status] ?? ""}`}>
                            {a.status === "expiring_soon" && <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                            {STATUS_LABELS[a.status] ?? a.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                          {a.customerName && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {a.customerName}
                            </span>
                          )}
                          {a.endDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Expires {fmtDate(a.endDate)}
                            </span>
                          )}
                          {a.billingCycle && (
                            <span>{BILLING_CYCLE_LABELS[a.billingCycle] ?? a.billingCycle}</span>
                          )}
                          <span>{a.coveredSiteCount ?? 0} site{a.coveredSiteCount !== 1 ? "s" : ""}</span>
                          {a.includedServicesJson?.length > 0 && (
                            <span className="hidden sm:inline">
                              {(a.includedServicesJson as string[])
                                .map((s) => INCLUDED_SERVICES_OPTIONS.find((o) => o.value === s)?.label ?? s)
                                .join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Service Agreement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Customer *</Label>
              <Select value={form.customerOrgId} onValueChange={(v) => setForm((f) => ({ ...f, customerOrgId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
                <SelectContent>
                  {(customers as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Agreement Name *</Label>
              <Input
                placeholder="e.g. Annual Fire Protection Service"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ServiceAgreementStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Billing Cycle</Label>
                <Select value={form.billingCycle} onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as ServiceAgreementBillingCycle }))}>
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
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Renewal Date</Label>
                <Input type="date" value={form.renewalDate} onChange={(e) => setForm((f) => ({ ...f, renewalDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Included Services</Label>
              <div className="flex flex-wrap gap-2">
                {INCLUDED_SERVICES_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleService(o.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      form.includedServices.includes(o.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Billing Notes</Label>
              <Textarea
                rows={2}
                placeholder="Billing terms, PO numbers, billing contact…"
                value={form.billingNotes}
                onChange={(e) => setForm((f) => ({ ...f, billingNotes: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Internal Notes</Label>
              <Textarea
                rows={2}
                placeholder="Internal notes visible to office/admin only"
                value={form.internalNotes}
                onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending} className="gap-1.5">
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Agreement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
