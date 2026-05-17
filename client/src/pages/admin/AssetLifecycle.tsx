import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Flame,
  RefreshCw,
  Wrench,
  X,
  Plus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LifecycleStatus =
  | "active"
  | "needs_service"
  | "repair_required"
  | "replacement_recommended"
  | "replaced"
  | "removed";

type AssetCondition = "good" | "fair" | "poor" | "failed" | "unknown";

// ─── Label helpers ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LifecycleStatus, string> = {
  active: "Active",
  needs_service: "Needs Service",
  repair_required: "Repair Required",
  replacement_recommended: "Replacement Recommended",
  replaced: "Replaced",
  removed: "Removed",
};

const CONDITION_LABELS: Record<AssetCondition, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  failed: "Failed",
  unknown: "Unknown",
};

const STATUS_VARIANT: Record<LifecycleStatus, string> = {
  active: "bg-green-100 text-green-800",
  needs_service: "bg-yellow-100 text-yellow-800",
  repair_required: "bg-orange-100 text-orange-800",
  replacement_recommended: "bg-red-100 text-red-800",
  replaced: "bg-gray-200 text-gray-600",
  removed: "bg-gray-200 text-gray-500",
};

const CONDITION_VARIANT: Record<AssetCondition, string> = {
  good: "bg-green-100 text-green-800",
  fair: "bg-yellow-100 text-yellow-800",
  poor: "bg-orange-100 text-orange-800",
  failed: "bg-red-100 text-red-800",
  unknown: "bg-gray-100 text-gray-500",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  installed: "Installed",
  inspected: "Inspected",
  passed: "Passed",
  failed: "Failed",
  deficiency_created: "Deficiency Created",
  repaired: "Repaired",
  replaced: "Replaced",
  removed_from_service: "Removed from Service",
  maintenance_completed: "Maintenance Completed",
  parts_replaced: "Parts Replaced",
  recommended_replacement: "Replacement Recommended",
  warranty_expired: "Warranty Expired",
  other: "Other",
};

const CATEGORY_LABELS: Record<string, string> = {
  FIRE_EXTINGUISHER: "Fire Extinguisher",
  EMERGENCY_LIGHT: "Emergency Light",
  FIRE_ALARM_DEVICE: "Fire Alarm Device",
  SMOKE_ALARM: "Smoke Alarm",
  SPRINKLER: "Sprinkler",
  BACKFLOW: "Backflow",
};

// ─── Overview cards ────────────────────────────────────────────────────────────

function OverviewCards({ devices }: { devices: any[] }) {
  const total = devices.length;
  const needsService = devices.filter(
    (d) => d.lifecycleStatus === "needs_service" || d.lifecycleStatus === "repair_required",
  ).length;
  const replacementRec = devices.filter((d) => d.replacementRecommended).length;
  const repeatedFail = devices.filter((d) => d.repeatedFailure).length;
  const dueForService = devices.filter((d) => d.serviceOverdue).length;
  const batteryWarning = devices.filter((d) => d.batteryAgeWarning).length;
  const extinguisherDue = devices.filter((d) => d.extinguisherServiceDue).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
      <Card className="col-span-1">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Assets</div>
        </CardContent>
      </Card>
      <Card className="col-span-1">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-yellow-600">{needsService}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Needs Service</div>
        </CardContent>
      </Card>
      <Card className="col-span-1">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-red-600">{replacementRec}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Replacement Rec.</div>
        </CardContent>
      </Card>
      <Card className="col-span-1">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-orange-600">{repeatedFail}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Repeated Failure</div>
        </CardContent>
      </Card>
      <Card className="col-span-1">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-blue-600">{dueForService}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Service Overdue</div>
        </CardContent>
      </Card>
      <Card className="col-span-1">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-amber-600">{batteryWarning}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Battery Warning</div>
        </CardContent>
      </Card>
      <Card className="col-span-1">
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-amber-600">{extinguisherDue}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Ext. Service Due</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Indicator chips ────────────────────────────────────────────────────────────

function IndicatorChips({ device }: { device: any }) {
  const chips: { label: string; icon: React.ReactNode; color: string }[] = [];

  if (device.hasOpenCriticalDeficiency) {
    chips.push({ label: "Critical Deficiency", icon: <AlertTriangle className="h-3 w-3" />, color: "bg-red-100 text-red-700" });
  }
  if (device.repeatedFailure) {
    chips.push({ label: "Repeated Failure", icon: <RefreshCw className="h-3 w-3" />, color: "bg-orange-100 text-orange-700" });
  }
  if (device.serviceOverdue) {
    chips.push({ label: "Service Overdue", icon: <Clock className="h-3 w-3" />, color: "bg-blue-100 text-blue-700" });
  }
  if (device.notInspectedRecently) {
    chips.push({ label: "Not Inspected (18mo+)", icon: <ClipboardList className="h-3 w-3" />, color: "bg-gray-100 text-gray-600" });
  }
  if (device.batteryAgeWarning) {
    chips.push({ label: "Battery Aging", icon: <Battery className="h-3 w-3" />, color: "bg-amber-100 text-amber-700" });
  }
  if (device.extinguisherServiceDue) {
    chips.push({ label: "Ext. Service Due", icon: <Flame className="h-3 w-3" />, color: "bg-amber-100 text-amber-700" });
  }
  if (device.replacementRecommended) {
    chips.push({ label: "Replacement Recommended", icon: <X className="h-3 w-3" />, color: "bg-red-100 text-red-700" });
  }

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${c.color}`}
        >
          {c.icon}
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ─── History dialog ─────────────────────────────────────────────────────────────

function AssetHistoryDialog({
  deviceId,
  open,
  onClose,
}: {
  deviceId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.assetLifecycle.getAssetLifecycle.useQuery(
    { deviceId },
    { enabled: open && !!deviceId },
  );

  const [tab, setTab] = useState<"inspections" | "deficiencies" | "lifecycle">("lifecycle");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data?.device
              ? `${data.device.deviceType ?? data.device.category} — ${data.site?.name ?? "Unknown Site"}`
              : "Asset History"}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-muted-foreground text-sm py-4">Loading…</p>}

        {data && (
          <>
            {/* Tab bar */}
            <div className="flex gap-1 border-b pb-0 mb-4">
              {(
                [
                  { key: "lifecycle", label: "Lifecycle Events" },
                  { key: "inspections", label: "Inspection History" },
                  { key: "deficiencies", label: "Deficiencies" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-t border-b-2 transition-colors ${
                    tab === key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "lifecycle" && (
              <div className="space-y-3">
                {data.lifecycleEvents.length === 0 && (
                  <p className="text-muted-foreground text-sm">No lifecycle events recorded.</p>
                )}
                {data.lifecycleEvents.map((ev: any) => (
                  <div key={ev.id} className="flex gap-3 text-sm">
                    <div className="text-muted-foreground w-24 shrink-0 text-xs pt-0.5">
                      {String(ev.eventDate).slice(0, 10)}
                    </div>
                    <div>
                      <div className="font-medium">{ev.title}</div>
                      <div className="text-muted-foreground text-xs">
                        {EVENT_TYPE_LABELS[ev.eventType] ?? ev.eventType}
                        {ev.sourceType && ev.sourceType !== "manual" && ` · ${ev.sourceType}`}
                      </div>
                      {ev.description && (
                        <div className="text-muted-foreground mt-0.5">{ev.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "inspections" && (
              <div className="space-y-3">
                {data.inspectionHistory.length === 0 && (
                  <p className="text-muted-foreground text-sm">No inspection records found.</p>
                )}
                {data.inspectionHistory.map((r: any) => (
                  <div key={r.id} className="flex gap-3 text-sm">
                    <div className="text-muted-foreground w-24 shrink-0 text-xs pt-0.5">
                      {r.testedAt ? String(r.testedAt).slice(0, 10) : r.jobCompletedAt ? String(r.jobCompletedAt).slice(0, 10) : "—"}
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          r.result === "pass"
                            ? "bg-green-100 text-green-700"
                            : r.result === "fail"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {r.result?.toUpperCase() ?? "N/A"}
                      </span>
                      {r.notes && <div className="text-muted-foreground mt-0.5">{r.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "deficiencies" && (
              <div className="space-y-3">
                {data.deficiencyHistory.length === 0 && (
                  <p className="text-muted-foreground text-sm">No deficiencies linked to this device.</p>
                )}
                {data.deficiencyHistory.map((def: any) => (
                  <div key={def.id} className="flex gap-3 text-sm">
                    <div className="text-muted-foreground w-24 shrink-0 text-xs pt-0.5">
                      {def.createdAt ? String(def.createdAt).slice(0, 10) : "—"}
                    </div>
                    <div>
                      <div className="font-medium">{def.description ?? def.title ?? "Deficiency"}</div>
                      <div className="flex gap-2 mt-0.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            def.severity === "critical"
                              ? "bg-red-100 text-red-700"
                              : def.severity === "major"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {def.severity}
                        </span>
                        <span className="text-muted-foreground text-xs">{def.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Lifecycle Event dialog ───────────────────────────────────────────────

function AddEventDialog({
  device,
  open,
  onClose,
}: {
  device: any;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    eventType: "other" as string,
    eventDate: new Date().toISOString().slice(0, 10),
    title: "",
    description: "",
    notes: "",
  });

  const createMut = trpc.assetLifecycle.createLifecycleEvent.useMutation({
    onSuccess: () => {
      toast.success("Event recorded.");
      utils.assetLifecycle.listAssets.invalidate();
      utils.assetLifecycle.getAssetLifecycle.invalidate({ deviceId: device.id });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Lifecycle Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Event Type</Label>
            <Select
              value={form.eventType}
              onValueChange={(v) => setForm({ ...form, eventType: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Event Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Title</Label>
            <Input
              className="mt-1"
              placeholder="Brief summary"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!form.title.trim() || !form.eventDate || createMut.isPending}
            onClick={() =>
              createMut.mutate({
                deviceId: device.id,
                siteId: device.siteId,
                eventType: form.eventType as any,
                eventDate: form.eventDate,
                title: form.title.trim(),
                description: form.description.trim() || undefined,
                notes: form.notes.trim() || undefined,
              })
            }
          >
            Save Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Update Status dialog ─────────────────────────────────────────────────────

function UpdateStatusDialog({
  device,
  open,
  onClose,
}: {
  device: any;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    lifecycleStatus: (device?.lifecycleStatus ?? "") as string,
    assetCondition: (device?.assetCondition ?? "") as string,
    nextServiceDate: device?.nextServiceDate ? String(device.nextServiceDate).slice(0, 10) : "",
    serviceNotes: device?.serviceNotes ?? "",
  });

  const updateMut = trpc.assetLifecycle.updateAssetLifecycleStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated.");
      utils.assetLifecycle.listAssets.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Asset Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Lifecycle Status</Label>
            <Select
              value={form.lifecycleStatus || "_none"}
              onValueChange={(v) =>
                setForm({ ...form, lifecycleStatus: v === "_none" ? "" : v })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="No status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— No status —</SelectItem>
                {(
                  [
                    "active",
                    "needs_service",
                    "repair_required",
                    "replacement_recommended",
                    "replaced",
                    "removed",
                  ] as LifecycleStatus[]
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Condition</Label>
            <Select
              value={form.assetCondition || "_none"}
              onValueChange={(v) =>
                setForm({ ...form, assetCondition: v === "_none" ? "" : v })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Unknown" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Unknown —</SelectItem>
                {(["good", "fair", "poor", "failed", "unknown"] as AssetCondition[]).map(
                  (c) => (
                    <SelectItem key={c} value={c}>
                      {CONDITION_LABELS[c]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Next Service Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={form.nextServiceDate}
              onChange={(e) => setForm({ ...form, nextServiceDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Service Notes</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={form.serviceNotes}
              onChange={(e) => setForm({ ...form, serviceNotes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={updateMut.isPending}
            onClick={() =>
              updateMut.mutate({
                deviceId: device.id,
                ...(form.lifecycleStatus ? { lifecycleStatus: form.lifecycleStatus as any } : {}),
                ...(form.assetCondition ? { assetCondition: form.assetCondition as any } : {}),
                nextServiceDate: form.nextServiceDate || null,
                serviceNotes: form.serviceNotes.trim() || null,
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

// ─── Single asset row ──────────────────────────────────────────────────────────

function AssetRow({
  device,
  onViewHistory,
  onAddEvent,
  onUpdateStatus,
  onMarkReplacement,
  onClearReplacement,
}: {
  device: any;
  onViewHistory: (d: any) => void;
  onAddEvent: (d: any) => void;
  onUpdateStatus: (d: any) => void;
  onMarkReplacement: (d: any) => void;
  onClearReplacement: (d: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFlags =
    device.hasOpenCriticalDeficiency ||
    device.repeatedFailure ||
    device.serviceOverdue ||
    device.notInspectedRecently ||
    device.batteryAgeWarning ||
    device.extinguisherServiceDue ||
    device.replacementRecommended;

  return (
    <div className={`border rounded-lg bg-card ${hasFlags ? "border-orange-200" : ""}`}>
      {/* ── Collapsed header ── */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm truncate">
              {device.deviceType ?? CATEGORY_LABELS[device.category] ?? device.category}
            </span>
            {device.lifecycleStatus && (
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${STATUS_VARIANT[device.lifecycleStatus as LifecycleStatus] ?? "bg-gray-100 text-gray-600"}`}
              >
                {STATUS_LABELS[device.lifecycleStatus as LifecycleStatus] ?? device.lifecycleStatus}
              </span>
            )}
            {device.assetCondition && (
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${CONDITION_VARIANT[device.assetCondition as AssetCondition] ?? "bg-gray-100 text-gray-600"}`}
              >
                {CONDITION_LABELS[device.assetCondition as AssetCondition] ?? device.assetCondition}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {device.siteName ?? "Unknown Site"}
            {device.siteCity ? ` · ${device.siteCity}` : ""}
            {device.location ? ` · ${device.location}` : ""}
            {device.serialNumber ? ` · S/N: ${device.serialNumber}` : ""}
          </div>
          <IndicatorChips device={device} />
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          {device.openDeficiencyCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {device.openDeficiencyCount} open def.
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* ── Expanded actions ── */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t bg-muted/10 rounded-b-lg">
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => onViewHistory(device)}>
              <ClipboardList className="h-4 w-4 mr-1" />
              View History
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAddEvent(device)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Event
            </Button>
            <Button size="sm" variant="outline" onClick={() => onUpdateStatus(device)}>
              <Activity className="h-4 w-4 mr-1" />
              Update Status
            </Button>
            {device.replacementRecommended ? (
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => onClearReplacement(device)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Clear Replacement Flag
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-red-700 border-red-300 hover:bg-red-50"
                onClick={() => onMarkReplacement(device)}
              >
                <Wrench className="h-4 w-4 mr-1" />
                Mark for Replacement
              </Button>
            )}
          </div>

          {/* Extra details */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {device.manufacturer && <div><span className="font-medium">Make:</span> {device.manufacturer}</div>}
            {device.model && <div><span className="font-medium">Model:</span> {device.model}</div>}
            {device.installDate && (
              <div>
                <span className="font-medium">Installed:</span>{" "}
                {String(device.installDate).slice(0, 10)}
              </div>
            )}
            {device.nextServiceDate && (
              <div>
                <span className="font-medium">Next Service:</span>{" "}
                {String(device.nextServiceDate).slice(0, 10)}
              </div>
            )}
            {device.batteryYear && (
              <div>
                <span className="font-medium">Battery Year:</span> {device.batteryYear}
              </div>
            )}
            {device.last6yr && (
              <div>
                <span className="font-medium">Last 6yr:</span> {device.last6yr}
              </div>
            )}
            {device.lastHST && (
              <div>
                <span className="font-medium">Last HST:</span> {device.lastHST}
              </div>
            )}
            {device.serviceNotes && (
              <div className="col-span-2 sm:col-span-3">
                <span className="font-medium">Service Notes:</span> {device.serviceNotes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AssetLifecycle() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Filters
  const [filterSiteId, setFilterSiteId] = useState<number | undefined>(undefined);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCondition, setFilterCondition] = useState<string>("");
  const [filterReplacement, setFilterReplacement] = useState<string>("");
  const [search, setSearch] = useState("");

  // Dialog state
  const [historyDevice, setHistoryDevice] = useState<any>(null);
  const [addEventDevice, setAddEventDevice] = useState<any>(null);
  const [updateStatusDevice, setUpdateStatusDevice] = useState<any>(null);
  const [markReplacementDevice, setMarkReplacementDevice] = useState<any>(null);
  const [replacementNotes, setReplacementNotes] = useState("");

  // Site list for filter
  const { data: sitesData } = trpc.site.listByCompany.useQuery(
    { companyId: user?.companyId ?? 0 },
    { enabled: !!user?.companyId },
  );

  // Assets
  const { data, isLoading, refetch } = trpc.assetLifecycle.listAssets.useQuery(
    {
      siteId: filterSiteId,
      category: filterCategory || undefined,
      lifecycleStatus: (filterStatus as any) || undefined,
      assetCondition: (filterCondition as any) || undefined,
      replacementRecommended:
        filterReplacement === "true"
          ? true
          : filterReplacement === "false"
          ? false
          : undefined,
    },
    { enabled: !!user?.companyId },
  );

  const markMut = trpc.assetLifecycle.markReplacementRecommended.useMutation({
    onSuccess: () => {
      toast.success("Device flagged for replacement.");
      setMarkReplacementDevice(null);
      setReplacementNotes("");
      utils.assetLifecycle.listAssets.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const clearMut = trpc.assetLifecycle.clearReplacementRecommendation.useMutation({
    onSuccess: () => {
      toast.success("Replacement flag cleared.");
      utils.assetLifecycle.listAssets.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const devices: any[] = data?.devices ?? [];

  const filtered = search
    ? devices.filter((d) => {
        const q = search.toLowerCase();
        return (
          d.deviceType?.toLowerCase().includes(q) ||
          d.siteName?.toLowerCase().includes(q) ||
          d.serialNumber?.toLowerCase().includes(q) ||
          d.location?.toLowerCase().includes(q) ||
          d.manufacturer?.toLowerCase().includes(q) ||
          d.model?.toLowerCase().includes(q)
        );
      })
    : devices;

  const handleClearReplacement = (device: any) => {
    clearMut.mutate({ deviceId: device.id });
  };

  return (
    <AdminLayout title="Asset Lifecycle">
      {/* Overview cards */}
      <OverviewCards devices={devices} />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="Device type, site, serial #…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Site</Label>
              <Select
                value={filterSiteId ? String(filterSiteId) : "_all"}
                onValueChange={(v) =>
                  setFilterSiteId(v === "_all" ? undefined : parseInt(v))
                }
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="All sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All sites</SelectItem>
                  {(sitesData ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select
                value={filterCategory || "_all"}
                onValueChange={(v) => setFilterCategory(v === "_all" ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Lifecycle Status</Label>
              <Select
                value={filterStatus || "_all"}
                onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  {(Object.keys(STATUS_LABELS) as LifecycleStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Condition</Label>
              <Select
                value={filterCondition || "_all"}
                onValueChange={(v) => setFilterCondition(v === "_all" ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Any condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Any condition</SelectItem>
                  {(Object.keys(CONDITION_LABELS) as AssetCondition[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CONDITION_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Replacement Flag</Label>
              <Select
                value={filterReplacement || "_all"}
                onValueChange={(v) => setFilterReplacement(v === "_all" ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Any</SelectItem>
                  <SelectItem value="true">Flagged for replacement</SelectItem>
                  <SelectItem value="false">Not flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setFilterSiteId(undefined);
                setFilterCategory("");
                setFilterStatus("");
                setFilterCondition("");
                setFilterReplacement("");
                setSearch("");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Asset list */}
      <div className="space-y-2">
        {isLoading && (
          <p className="text-muted-foreground text-sm">Loading assets…</p>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No assets found matching your filters.</p>
          </div>
        )}
        {filtered.map((device) => (
          <AssetRow
            key={device.id}
            device={device}
            onViewHistory={setHistoryDevice}
            onAddEvent={setAddEventDevice}
            onUpdateStatus={setUpdateStatusDevice}
            onMarkReplacement={setMarkReplacementDevice}
            onClearReplacement={handleClearReplacement}
          />
        ))}
      </div>

      {/* Total count */}
      {!isLoading && filtered.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {devices.length} assets
        </div>
      )}

      {/* Dialogs */}

      {historyDevice && (
        <AssetHistoryDialog
          deviceId={historyDevice.id}
          open={!!historyDevice}
          onClose={() => setHistoryDevice(null)}
        />
      )}

      {addEventDevice && (
        <AddEventDialog
          device={addEventDevice}
          open={!!addEventDevice}
          onClose={() => setAddEventDevice(null)}
        />
      )}

      {updateStatusDevice && (
        <UpdateStatusDialog
          device={updateStatusDevice}
          open={!!updateStatusDevice}
          onClose={() => setUpdateStatusDevice(null)}
        />
      )}

      {/* Mark replacement dialog */}
      <Dialog
        open={!!markReplacementDevice}
        onOpenChange={(v) => { if (!v) { setMarkReplacementDevice(null); setReplacementNotes(""); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark for Replacement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Flag this asset as recommended for replacement. The status will be set to "Replacement
            Recommended" and a notification will be created.
          </p>
          <div className="mt-2">
            <Label>Notes (optional)</Label>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder="Reason for replacement recommendation…"
              value={replacementNotes}
              onChange={(e) => setReplacementNotes(e.target.value)}
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => { setMarkReplacementDevice(null); setReplacementNotes(""); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={markMut.isPending}
              onClick={() =>
                markMut.mutate({
                  deviceId: markReplacementDevice.id,
                  notes: replacementNotes.trim() || undefined,
                })
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
