import { useState, useDeferredValue } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { toast } from "sonner";
import {
  CalendarDays,
  Clock,
  User,
  Building2,
  ClipboardList,
  CheckSquare,
  Wrench,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Lightbulb,
  CalendarCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemType = "job" | "approved_work" | "work_order" | "service_tracking";

type QueueJob = {
  id: number; itemType: "job"; title: string; jobType: string; priority: string;
  status: string; notes: string | null; createdAt: Date; leadTechnicianId: number | null;
  leadTechnicianName: string | null; siteName: string | null; siteAddress: string | null;
  siteCity: string | null; buildingId: string | null; siteId: number; customerOrgId: number;
};
type QueueAW = {
  id: number; itemType: "approved_work"; title: string; awType: string | null; priority: null;
  status: string; description: string | null; createdAt: Date; assignedTechnicianIds: number[];
  assignedTechNames: string[]; siteName: string | null; siteAddress: string | null;
  siteCity: string | null; buildingId: string | null; siteId: number | null; customerOrgId: number | null;
};
type QueueWO = {
  id: number; itemType: "work_order"; title: string; workType: string; priority: string;
  status: string; estimatedHours: number | null; createdAt: Date; assignedTechnicianIds: number[];
  assignedTechNames: string[]; siteName: string | null; siteAddress: string | null;
  siteCity: string | null; buildingId: string | null; siteId: number; customerOrgId: number;
};
type QueueST = {
  id: number; itemType: "service_tracking"; title: string; serviceType: string;
  trackingMonth: string; targetDate: string | null; status: string; hoursRequired: number | null;
  techsRequired: number | null; hasLinkedJob: boolean; createdAt: Date; assignedTechnicianIds: number[];
  assignedTechNames: string[]; siteName: string | null; siteAddress: string | null;
  siteCity: string | null; buildingId: string | null; siteId: number; customerOrgId: number;
};
type QueueItem = QueueJob | QueueAW | QueueWO | QueueST;

type ScheduleTarget = { itemType: ItemType; itemId: number; title: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ItemType, string> = {
  job: "Job",
  approved_work: "Approved Work",
  work_order: "Work Order",
  service_tracking: "Service",
};

const TYPE_ICONS: Record<ItemType, React.ComponentType<{ className?: string }>> = {
  job: ClipboardList,
  approved_work: CheckSquare,
  work_order: Wrench,
  service_tracking: CalendarDays,
};

const TYPE_COLORS: Record<ItemType, string> = {
  job: "bg-blue-100 text-blue-800",
  approved_work: "bg-green-100 text-green-800",
  work_order: "bg-orange-100 text-orange-800",
  service_tracking: "bg-purple-100 text-purple-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

function itemTitle(item: QueueItem) {
  return item.title || `${TYPE_LABELS[item.itemType]} #${item.id}`;
}

function itemSubtitle(item: QueueItem) {
  const parts: string[] = [];
  if (item.siteName) parts.push(item.siteName);
  if (item.buildingId) parts.push(`BID: ${item.buildingId}`);
  if (item.siteCity) parts.push(item.siteCity);
  return parts.join(" · ");
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDateInput(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  const d = new Date();
  d.setFullYear(y, m - 1, day);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ── Availability conflict warning ─────────────────────────────────────────────

function AvailabilityConflictWarning({ userIds, date }: { userIds: number[]; date: string }) {
  const { data: conflicts = [] } = trpc.availability.checkSchedulingConflicts.useQuery(
    { userIds, startDate: date, endDate: date },
    { enabled: userIds.length > 0 && !!date },
  );
  if ((conflicts as any[]).length === 0) return null;
  return (
    <div className="rounded border border-orange-200 bg-orange-50 p-2 space-y-0.5">
      {(conflicts as any[]).map((c: any, i: number) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-orange-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>{c.userName}</strong> has approved {c.type} ({c.startDate}{c.startDate !== c.endDate ? ` – ${c.endDate}` : ""})
            {c.reason ? `: ${c.reason}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Schedule Dialog ───────────────────────────────────────────────────────────

function ScheduleDialog({
  target,
  techs,
  onClose,
  onApplied,
}: {
  target: ScheduleTarget;
  techs: { id: number; name: string }[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 3);
  const [dateStr, setDateStr] = useState(toDateInputValue(defaultDate));
  const [selectedTechId, setSelectedTechId] = useState<string>("none");
  const [overwrite, setOverwrite] = useState(false);

  const suggestInput = { itemType: target.itemType, itemId: target.itemId, preferredDate: parseDateInput(dateStr) };
  const { data: suggestion, isLoading: loadingSuggestion } = trpc.schedulingAutomation.suggestSchedule.useQuery(suggestInput);

  const apply = trpc.schedulingAutomation.applySchedule.useMutation({
    onSuccess: () => {
      toast.success(`${target.title} scheduled successfully`);
      onApplied();
      onClose();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("Already scheduled — enable Overwrite to replace");
        setOverwrite(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  const handleApply = () => {
    const techIds = selectedTechId !== "none" ? [Number(selectedTechId)] : undefined;
    apply.mutate({
      itemType: target.itemType,
      itemId: target.itemId,
      scheduledDate: parseDateInput(dateStr),
      technicianIds: techIds,
      overwrite,
    });
  };

  const useSuggestion = () => {
    if (!suggestion) return;
    setDateStr(toDateInputValue(suggestion.suggestedDate as unknown as Date));
    if (suggestion.suggestedTechnicianId) {
      setSelectedTechId(String(suggestion.suggestedTechnicianId));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Schedule Item
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-medium">{target.title}</p>
            <Badge className={`mt-1 text-xs ${TYPE_COLORS[target.itemType]}`}>
              {TYPE_LABELS[target.itemType]}
            </Badge>
          </div>

          {/* Suggestion */}
          {suggestion && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5" /> Suggested
              </div>
              <p className="text-sm">
                <span className="font-medium">{(suggestion.suggestedDate as unknown as string)?.slice(0, 10)}</span>
                {suggestion.suggestedTechnicianName && (
                  <> · {suggestion.suggestedTechnicianName}</>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
              <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={useSuggestion}>
                Use suggestion
              </Button>
            </div>
          )}
          {loadingSuggestion && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading suggestion…
            </div>
          )}

          {/* Date picker */}
          <div className="space-y-1.5">
            <Label htmlFor="sched-date">Scheduled Date</Label>
            <Input
              id="sched-date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>

          {/* Technician */}
          <div className="space-y-1.5">
            <Label>Assign Technician (optional)</Label>
            <Select value={selectedTechId} onValueChange={setSelectedTechId}>
              <SelectTrigger>
                <SelectValue placeholder="No technician assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No technician</SelectItem>
                {techs.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Availability conflict warning */}
          <AvailabilityConflictWarning
            userIds={selectedTechId !== "none" ? [Number(selectedTechId)] : []}
            date={dateStr}
          />

          {/* Overwrite */}
          {overwrite && (
            <div className="rounded border border-orange-200 bg-orange-50 p-2 text-xs text-orange-700">
              Overwrite enabled — existing scheduled date will be replaced.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={apply.isPending || !dateStr}>
            {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CalendarCheck className="h-4 w-4 mr-1" />}
            Apply Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Queue Item Card ───────────────────────────────────────────────────────────

function QueueCard({
  item,
  onSchedule,
}: {
  item: QueueItem;
  onSchedule: (target: ScheduleTarget) => void;
}) {
  const Icon = TYPE_ICONS[item.itemType];
  const priority = (item as QueueJob).priority ?? (item as QueueWO).priority ?? null;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30 transition-colors">
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{itemTitle(item)}</span>
          <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${TYPE_COLORS[item.itemType]}`}>
            {TYPE_LABELS[item.itemType]}
          </Badge>
          {priority && priority !== "medium" && (
            <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${PRIORITY_COLORS[priority]}`}>
              {priority}
            </Badge>
          )}
          {item.itemType === "service_tracking" && item.status === "overdue" && (
            <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-red-100 text-red-700">
              overdue
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{itemSubtitle(item)}</p>
        {item.itemType === "service_tracking" && item.targetDate && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Target: {item.targetDate} · Month: {item.trackingMonth}
          </p>
        )}
        {item.itemType === "service_tracking" && item.hoursRequired && (
          <p className="text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3 inline mr-0.5" />{item.hoursRequired}h required
            {item.techsRequired && item.techsRequired > 1 ? ` · ${item.techsRequired} techs` : ""}
          </p>
        )}
        {item.itemType === "work_order" && item.estimatedHours && (
          <p className="text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3 inline mr-0.5" />Est. {item.estimatedHours}h
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-7 text-xs"
        onClick={() => onSchedule({ itemType: item.itemType, itemId: item.id, title: itemTitle(item) })}
      >
        <CalendarDays className="h-3.5 w-3.5 mr-1" /> Schedule
      </Button>
    </div>
  );
}

// ── Availability Panel ────────────────────────────────────────────────────────

function AvailabilityPanel() {
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);

  const { data, isLoading } = trpc.schedulingAutomation.getTechnicianAvailability.useQuery({
    startDate: today,
    endDate: in30,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No active technicians found.</p>;
  }

  const sorted = [...data].sort((a, b) => a.totalScheduled - b.totalScheduled);

  return (
    <div className="space-y-2">
      {sorted.map(tech => (
        <div key={tech.id} className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{tech.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">({tech.role})</span>
          </div>
          <Badge
            className={`text-xs shrink-0 ${
              tech.totalScheduled === 0
                ? "bg-green-100 text-green-700"
                : tech.totalScheduled < 5
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {tech.totalScheduled} item{tech.totalScheduled !== 1 ? "s" : ""}
          </Badge>
        </div>
      ))}
      <p className="text-xs text-muted-foreground pt-1">Next 30 days</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type FilterType = "all" | ItemType;

export default function SchedulingAutomation() {
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDeferredValue(searchRaw.toLowerCase().trim());
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null);

  const { data, isLoading, isError, refetch } = trpc.schedulingAutomation.getQueue.useQuery(undefined, {
    enabled: !!user?.companyId,
  });

  // Fetch techs for the schedule dialog
  const { data: availability } = trpc.schedulingAutomation.getTechnicianAvailability.useQuery(
    { startDate: new Date(), endDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })() },
    { enabled: !!user?.companyId }
  );
  const techsForDialog = (availability ?? []).map(t => ({ id: t.id, name: t.name }));

  if (isLoading) {
    return (
      <AdminLayout title="Scheduling Automation">
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (isError || !data) {
    return (
      <AdminLayout title="Scheduling Automation">
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-muted-foreground">
          <AlertTriangle className="h-8 w-8" />
          <p>Failed to load scheduling queue. Please refresh.</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </AdminLayout>
    );
  }

  // Flatten all items for search/filter
  const allItems: QueueItem[] = [
    ...data.jobs,
    ...data.approvedWork,
    ...data.workOrders,
    ...data.serviceTracking,
  ];

  const filtered = allItems.filter(item => {
    if (activeFilter !== "all" && item.itemType !== activeFilter) return false;
    if (search) {
      const text = [
        item.title,
        item.siteName,
        item.buildingId,
        item.siteCity,
        item.siteAddress,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  const FILTER_TABS: { key: FilterType; label: string; count: number }[] = [
    { key: "all", label: "All", count: data.counts.total },
    { key: "job", label: "Jobs", count: data.counts.jobs },
    { key: "approved_work", label: "Approved Work", count: data.counts.approvedWork },
    { key: "work_order", label: "Work Orders", count: data.counts.workOrders },
    { key: "service_tracking", label: "Service", count: data.counts.serviceTracking },
  ];

  return (
    <AdminLayout title="Scheduling Automation">
      <div className="space-y-4">

        {/* Header description */}
        <p className="text-sm text-muted-foreground">
          Items that need scheduling — jobs, approved work, work orders, and service tracking rows.
          Review the queue, get a schedule suggestion, then confirm before applying.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* ── Queue panel ────────────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2">
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    activeFilter === tab.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent"
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0 text-[10px] ${
                    activeFilter === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <Input
              placeholder="Search by site name, building ID, city…"
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              className="max-w-sm"
            />

            {/* Queue list */}
            {filtered.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                {data.counts.total === 0 ? (
                  <>
                    <CalendarCheck className="mx-auto h-8 w-8 text-green-500 mb-2" />
                    <p className="font-medium">All caught up!</p>
                    <p className="text-sm text-muted-foreground mt-1">No items are waiting to be scheduled.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-muted-foreground">No results</p>
                    <p className="text-sm text-muted-foreground mt-1">Try adjusting the filter or search.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(item => (
                  <QueueCard
                    key={`${item.itemType}-${item.id}`}
                    item={item}
                    onSchedule={setScheduleTarget}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Sidebar ────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" /> Technician Load
              </h3>
              <AvailabilityPanel />
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Queue Summary
              </h3>
              {FILTER_TABS.filter(t => t.key !== "all").map(tab => (
                <div key={tab.key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tab.label}</span>
                  <span className="font-medium">{tab.count}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm border-t pt-2 mt-2">
                <span className="font-medium">Total</span>
                <span className="font-bold">{data.counts.total}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Dialog */}
      {scheduleTarget && (
        <ScheduleDialog
          target={scheduleTarget}
          techs={techsForDialog}
          onClose={() => setScheduleTarget(null)}
          onApplied={() => { refetch(); }}
        />
      )}
    </AdminLayout>
  );
}
