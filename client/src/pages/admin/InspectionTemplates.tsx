import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Plus, Copy, Archive, ExternalLink, ClipboardList, Search, Filter,
} from "lucide-react";
import {
  TEMPLATE_SYSTEM_TYPES,
  TEMPLATE_INSPECTION_TYPES,
  TEMPLATE_FREQUENCIES,
  type TemplateStatus,
} from "../../../../drizzle/schema";

const SYSTEM_LABELS: Record<string, string> = {
  fire_alarm: "Fire Alarm",
  sprinkler: "Sprinkler",
  emergency_lighting: "Emergency Lighting",
  fire_extinguisher: "Fire Extinguisher",
  backflow: "Backflow",
  smoke_alarm: "Smoke Alarm",
  smoke_control: "Smoke Control",
  fire_pump: "Fire Pump",
  standpipe: "Standpipe",
  general: "General",
};

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
  service: "Service",
  verification: "Verification",
  custom: "Custom",
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
  other: "Other",
};

const STATUS_COLORS: Record<TemplateStatus, string> = {
  draft: "secondary",
  active: "default",
  archived: "outline",
};

// ─── Create Dialog ─────────────────────────────────────────────────────────────

function CreateTemplateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemType, setSystemType] = useState("general");
  const [inspectionType, setInspectionType] = useState("annual");
  const [frequency, setFrequency] = useState("annual");

  const createMutation = trpc.inspectionTemplate.create.useMutation({
    onSuccess: (data) => {
      toast.success("Template created");
      onCreated(data.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    createMutation.mutate({ name: name.trim(), description: description || undefined, systemType, inspectionType, frequency });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Inspection Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual Fire Alarm Inspection" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>System Type</Label>
              <Select value={systemType} onValueChange={setSystemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_SYSTEM_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>{SYSTEM_LABELS[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Inspection Type</Label>
              <Select value={inspectionType} onValueChange={setInspectionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_INSPECTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{INSPECTION_TYPE_LABELS[t] ?? t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATE_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f] ?? f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create & Open Builder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Clone Dialog ──────────────────────────────────────────────────────────────

function CloneDialog({
  templateId,
  onClose,
  onCloned,
}: {
  templateId: number;
  onClose: () => void;
  onCloned: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const cloneMutation = trpc.inspectionTemplate.clone.useMutation({
    onSuccess: (data) => {
      toast.success("Template cloned");
      onCloned(data.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Clone Template</DialogTitle></DialogHeader>
        <div className="py-2 space-y-2">
          <Label>New Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Copy of..." autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!name.trim()) return; cloneMutation.mutate({ id: templateId, name: name.trim() }); }} disabled={cloneMutation.isPending}>
            {cloneMutation.isPending ? "Cloning…" : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function InspectionTemplates() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [filterSystem, setFilterSystem] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [cloneId, setCloneId] = useState<number | null>(null);
  const [, navigate] = useState<string | null>(null);

  const { data: templates = [], isLoading, refetch } = trpc.inspectionTemplate.list.useQuery(undefined, {
    enabled: !!user?.companyId,
  });

  const archiveMutation = trpc.inspectionTemplate.update.useMutation({
    onSuccess: () => { toast.success("Template archived"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = templates.filter((t) => {
    if (filterSystem !== "all" && t.systemType !== filterSystem) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    const key = t.systemType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  function handleCreated(id: number) {
    setShowCreate(false);
    window.location.href = `/admin/inspection-templates/${id}`;
  }

  function handleCloned(id: number) {
    setCloneId(null);
    window.location.href = `/admin/inspection-templates/${id}`;
  }

  return (
    <AdminLayout title="Inspection Templates">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Manage reusable inspection checklists. Assign them to job types or specific sites.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreate(true)} className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterSystem} onValueChange={setFilterSystem}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-1.5 opacity-60" />
              <SelectValue placeholder="All systems" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Systems</SelectItem>
              {TEMPLATE_SYSTEM_TYPES.map((s) => (
                <SelectItem key={s} value={s}>{SYSTEM_LABELS[s] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Template count */}
        <p className="text-xs text-muted-foreground">
          {filtered.length} template{filtered.length !== 1 ? "s" : ""}
          {templates.length !== filtered.length ? ` of ${templates.length}` : ""}
        </p>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-16 text-muted-foreground">Loading templates…</div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No templates found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {templates.length === 0 ? "Create your first inspection template to get started." : "Try adjusting filters."}
              </p>
              {isAdmin && templates.length === 0 && (
                <Button className="mt-4" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Grouped cards */}
        {!isLoading && Object.entries(grouped).map(([systemType, items]) => (
          <div key={systemType}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {SYSTEM_LABELS[systemType] ?? systemType}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((t) => (
                <Card key={t.id} className={t.status === "archived" ? "opacity-60" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{t.name}</CardTitle>
                      <Badge variant={STATUS_COLORS[t.status] as "default" | "secondary" | "outline"} className="shrink-0 text-xs capitalize">
                        {t.status}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-1 mb-3">
                      <Badge variant="outline" className="text-xs">{INSPECTION_TYPE_LABELS[t.inspectionType] ?? t.inspectionType}</Badge>
                      <Badge variant="outline" className="text-xs">{FREQUENCY_LABELS[t.frequency] ?? t.frequency}</Badge>
                      {t.isDefault === 1 && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/admin/inspection-templates/${t.id}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          {isAdmin ? "Edit" : "View"}
                        </Button>
                      </Link>
                      {isAdmin && t.status !== "archived" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setCloneId(t.id)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Clone
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => {
                              if (confirm(`Archive "${t.name}"? It won't appear for new jobs.`)) {
                                archiveMutation.mutate({ id: t.id, status: "archived" });
                              }
                            }}
                          >
                            <Archive className="h-3 w-3 mr-1" />
                            Archive
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateTemplateDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {cloneId && (
        <CloneDialog
          templateId={cloneId}
          onClose={() => setCloneId(null)}
          onCloned={handleCloned}
        />
      )}
    </AdminLayout>
  );
}
