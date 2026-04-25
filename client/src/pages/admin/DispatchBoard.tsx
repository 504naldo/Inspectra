import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ExternalLink, Users, X } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const JOB_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const JOB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700 font-semibold",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
  service_call: "Service Call",
  repair: "Repair",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - ((day + 6) % 7)); // Monday-start
  return r;
}

function getWeekDates(d: Date): Date[] {
  const mon = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

function formatHeaderDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(dt: string | Date | null): string {
  if (!dt) return "";
  const d = typeof dt === "string" ? new Date(dt) : dt;
  return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true });
}

function sameDay(a: string | Date | null, b: string): boolean {
  if (!a) return false;
  const d = typeof a === "string" ? new Date(a) : a;
  return toDateStr(d) === b;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type DispatchJob = {
  id: number;
  jobNumber: string | null;
  title: string;
  jobType: string | null;
  status: string;
  priority: string;
  scheduledDate: string | Date | null;
  siteName: string | null;
  customerName: string | null;
  assignedTechnicians: { id: number; name: string | null; email: string | null; role: string }[];
};

type Tech = { id: number; name: string | null; email: string | null };

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({
  job,
  technicians,
  onAssign,
  onStatus,
  onAddAssist,
  onRemoveAssist,
}: {
  job: DispatchJob;
  technicians: Tech[];
  onAssign: (jobId: number, techId: number | null) => void;
  onStatus: (jobId: number, status: string) => void;
  onAddAssist: (jobId: number, techId: number) => void;
  onRemoveAssist: (jobId: number, techId: number) => void;
}) {
  const lead = job.assignedTechnicians.find((t) => t.role === "LEAD");
  const assists = job.assignedTechnicians.filter((t) => t.role !== "LEAD");
  const assignedIds = new Set(job.assignedTechnicians.map((t) => t.id));
  const availableForAssist = technicians.filter((t) => !assignedIds.has(t.id));

  return (
    <div
      className={cn(
        "rounded-md border p-2 mb-2 bg-card text-sm shadow-sm",
        job.priority === "urgent" && "border-red-400"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-mono text-[11px] text-muted-foreground leading-tight">
          {job.jobNumber ?? `#${job.id}`}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {job.priority !== "low" && (
            <span className={cn("text-[10px] rounded px-1 py-0.5 leading-none", PRIORITY_COLORS[job.priority])}>
              {job.priority}
            </span>
          )}
        </div>
      </div>

      {/* Site & customer */}
      <p className="font-medium text-[13px] leading-tight truncate">{job.siteName ?? job.title}</p>
      {job.siteName && job.siteName !== job.title && (
        <p className="text-[11px] text-muted-foreground truncate">{job.title}</p>
      )}
      {job.customerName && (
        <p className="text-[11px] text-muted-foreground truncate">{job.customerName}</p>
      )}

      {/* Type + time */}
      <div className="flex items-center gap-2 mt-0.5">
        {job.jobType && (
          <span className="text-[10px] text-muted-foreground">{JOB_TYPE_LABELS[job.jobType] ?? job.jobType}</span>
        )}
        {job.scheduledDate && (
          <span className="text-[10px] text-muted-foreground">{formatTime(job.scheduledDate)}</span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-2 space-y-1">
        {/* Status select */}
        <Select value={job.status} onValueChange={(v) => onStatus(job.id, v)}>
          <SelectTrigger className="h-6 text-[11px] px-2 py-0">
            <span className={cn("rounded px-1 text-[10px]", JOB_STATUS_COLORS[job.status])}>
              {JOB_STATUS_LABELS[job.status] ?? job.status}
            </span>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(JOB_STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Lead assign select */}
        <Select
          value={lead ? String(lead.id) : "none"}
          onValueChange={(v) => onAssign(job.id, v === "none" ? null : Number(v))}
        >
          <SelectTrigger className="h-6 text-[11px] px-2 py-0">
            <span className="truncate text-[10px] text-muted-foreground mr-1">Lead:</span>
            <span className="truncate">
              {lead ? (lead.name ?? lead.email ?? "Tech") : <span className="text-muted-foreground">Unassigned</span>}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs text-muted-foreground">Unassigned</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                {t.name ?? t.email ?? `Tech #${t.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assist chips + add assist */}
        {(assists.length > 0 || availableForAssist.length > 0) && (
          <div className="space-y-0.5">
            {assists.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {assists.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-0.5 text-[10px] bg-muted rounded px-1 py-0.5 leading-none"
                  >
                    <span className="text-[9px] text-muted-foreground mr-0.5">+</span>
                    {a.name ?? a.email ?? "?"}
                    <button
                      onClick={() => onRemoveAssist(job.id, a.id)}
                      className="ml-0.5 text-muted-foreground/60 hover:text-red-500 transition-colors"
                      title={`Remove ${a.name ?? a.email ?? "tech"}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {availableForAssist.length > 0 && (
              <Select
                value=""
                onValueChange={(v) => onAddAssist(job.id, Number(v))}
              >
                <SelectTrigger className="h-6 text-[11px] px-2 py-0 text-muted-foreground">
                  <span>+ Add assist</span>
                </SelectTrigger>
                <SelectContent>
                  {availableForAssist.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                      {t.name ?? t.email ?? `Tech #${t.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Open link */}
      <div className="mt-1.5 flex justify-end">
        <Link href={`/jobs/${job.id}`}>
          <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
            Open <ExternalLink className="h-2.5 w-2.5" />
          </button>
        </Link>
      </div>
    </div>
  );
}

// ── Tech Column ───────────────────────────────────────────────────────────────

function TechColumn({
  label,
  jobs,
  technicians,
  onAssign,
  onStatus,
  onAddAssist,
  onRemoveAssist,
}: {
  label: string;
  jobs: DispatchJob[];
  technicians: Tech[];
  onAssign: (jobId: number, techId: number | null) => void;
  onStatus: (jobId: number, status: string) => void;
  onAddAssist: (jobId: number, techId: number) => void;
  onRemoveAssist: (jobId: number, techId: number) => void;
}) {
  return (
    <div className="flex-shrink-0 w-56">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold truncate">{label}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 leading-none flex-shrink-0">
          {jobs.length}
        </span>
      </div>
      <div className="min-h-[4rem]">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} technicians={technicians} onAssign={onAssign} onStatus={onStatus} onAddAssist={onAddAssist} onRemoveAssist={onRemoveAssist} />
        ))}
        {jobs.length === 0 && (
          <div className="rounded border border-dashed border-muted-foreground/25 h-16 flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground/50">No jobs</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function DispatchBoard({ companyId }: { companyId: number }) {
  const today = toDateStr(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState("active"); // 'active' | 'all' | specific status
  const [techFilter, setTechFilter] = useState("all");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  // Date range for the query
  const { startDate, endDate } = useMemo(() => {
    if (viewMode === "day") {
      return { startDate: selectedDate, endDate: selectedDate };
    }
    const weekDates = getWeekDates(new Date(selectedDate + "T12:00:00"));
    return { startDate: toDateStr(weekDates[0]), endDate: toDateStr(weekDates[6]) };
  }, [viewMode, selectedDate]);

  const { data: rawJobs, isLoading, refetch } = trpc.jobAssignment.listDispatch.useQuery(
    { companyId, startDate, endDate },
    { enabled: !!companyId }
  );

  const { data: technicians = [] } = trpc.jobAssignment.listTechnicians.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const utils = trpc.useUtils();

  const setAssignments = trpc.jobAssignment.setJobAssignments.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e) => toast.error(e.message || "Failed to update assignment"),
  });

  const addAssistMutation = trpc.jobAssignment.addJobAssignments.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e) => toast.error(e.message || "Failed to add assist technician"),
  });

  const removeAssistMutation = trpc.jobAssignment.removeJobAssignment.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e) => toast.error(e.message || "Failed to remove assist technician"),
  });

  const updateJob = trpc.job.update.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e) => toast.error(e.message || "Failed to update job"),
  });

  // Filter jobs
  const jobs: DispatchJob[] = useMemo(() => {
    if (!rawJobs) return [];
    let filtered = rawJobs as DispatchJob[];

    if (statusFilter === "active") {
      filtered = filtered.filter((j) => j.status !== "completed" && j.status !== "cancelled");
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((j) => j.status === statusFilter);
    }

    if (unassignedOnly) {
      filtered = filtered.filter((j) => j.assignedTechnicians.length === 0);
    }

    if (techFilter !== "all") {
      const tid = Number(techFilter);
      filtered = filtered.filter((j) => j.assignedTechnicians.some((t) => t.id === tid));
    }

    return filtered;
  }, [rawJobs, statusFilter, techFilter, unassignedOnly]);

  // Stats per tech
  const techJobCounts = useMemo(() => {
    const m: Record<number, number> = {};
    jobs.forEach((j) => {
      j.assignedTechnicians.forEach((t) => {
        m[t.id] = (m[t.id] ?? 0) + 1;
      });
    });
    return m;
  }, [jobs]);

  function handleAssign(jobId: number, techId: number | null) {
    if (techId === null) {
      setAssignments.mutate({ jobId, technicianIds: [], leadId: 0 });
    } else {
      // When changing lead, keep existing assists and add the new lead
      const job = jobs.find((j) => j.id === jobId);
      const assistIds = (job?.assignedTechnicians ?? [])
        .filter((t) => t.role !== "LEAD" && t.id !== techId)
        .map((t) => t.id);
      setAssignments.mutate({ jobId, technicianIds: [techId, ...assistIds], leadId: techId });
    }
  }

  function handleAddAssist(jobId: number, techId: number) {
    addAssistMutation.mutate({ jobId, technicianIds: [techId] });
  }

  function handleRemoveAssist(jobId: number, techId: number) {
    removeAssistMutation.mutate({ jobId, technicianId: techId });
  }

  function handleStatus(jobId: number, status: string) {
    updateJob.mutate({ id: jobId, status: status as any });
  }

  // Navigate day / week
  function navigate(dir: 1 | -1) {
    const d = new Date(selectedDate + "T12:00:00");
    if (viewMode === "day") {
      setSelectedDate(toDateStr(addDays(d, dir)));
    } else {
      setSelectedDate(toDateStr(addDays(d, dir * 7)));
    }
  }

  const unassigned = jobs.filter((j) => j.assignedTechnicians.length === 0);

  // For day view: show all active techs + their jobs
  const techsWithJobs = useMemo(() => {
    const seen = new Set<number>();
    jobs.forEach((j) => j.assignedTechnicians.forEach((t) => seen.add(t.id)));
    // Show all technicians; those with no jobs show empty column
    return technicians;
  }, [technicians, jobs]);

  // ── Day View ──────────────────────────────────────────────────────────────

  function renderDayView() {
    return (
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {/* Unassigned column */}
          <TechColumn
            label="Unassigned"
            jobs={unassigned}
            technicians={technicians}
            onAssign={handleAssign}
            onStatus={handleStatus}
            onAddAssist={handleAddAssist}
            onRemoveAssist={handleRemoveAssist}
          />

          {/* Divider */}
          <div className="w-px bg-border self-stretch" />

          {/* Tech columns */}
          {techsWithJobs.map((tech) => {
            const techJobs = jobs.filter((j) => j.assignedTechnicians.some((t) => t.id === tech.id));
            return (
              <TechColumn
                key={tech.id}
                label={tech.name ?? tech.email ?? `Tech #${tech.id}`}
                jobs={techJobs}
                technicians={technicians}
                onAssign={handleAssign}
                onStatus={handleStatus}
                onAddAssist={handleAddAssist}
                onRemoveAssist={handleRemoveAssist}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── Week View ─────────────────────────────────────────────────────────────

  function renderWeekView() {
    const weekDates = getWeekDates(new Date(selectedDate + "T12:00:00"));

    // Unscheduled jobs (scheduledDate is null) — shown at top
    const unscheduledJobs = jobs.filter((j) => !j.scheduledDate);
    const scheduledJobs = jobs.filter((j) => !!j.scheduledDate);

    return (
      <div className="space-y-4">
        {/* Tech load summary */}
        {technicians.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {technicians.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs bg-muted/30">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span>{t.name ?? t.email ?? `Tech #${t.id}`}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {techJobCounts[t.id] ?? 0}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Unscheduled */}
        {unscheduledJobs.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Unscheduled ({unscheduledJobs.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {unscheduledJobs.map((job) => (
                <JobCard key={job.id} job={job} technicians={technicians} onAssign={handleAssign} onStatus={handleStatus} onAddAssist={handleAddAssist} onRemoveAssist={handleRemoveAssist} />
              ))}
            </div>
          </div>
        )}

        {/* Days */}
        {weekDates.map((day) => {
          const dayStr = toDateStr(day);
          const dayJobs = scheduledJobs.filter((j) => sameDay(j.scheduledDate, dayStr));
          return (
            <div key={dayStr}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold">
                  {formatShortDate(day)}
                </h3>
                <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 leading-none">
                  {dayJobs.length}
                </span>
                {dayStr === today && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 leading-none">Today</span>
                )}
              </div>
              {dayJobs.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {dayJobs.map((job) => (
                    <JobCard key={job.id} job={job} technicians={technicians} onAssign={handleAssign} onStatus={handleStatus} onAddAssist={handleAddAssist} onRemoveAssist={handleRemoveAssist} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/50 ml-2">No jobs</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Header label ──────────────────────────────────────────────────────────

  const headerLabel = useMemo(() => {
    if (viewMode === "day") {
      const d = new Date(selectedDate + "T12:00:00");
      const label = formatShortDate(d);
      return selectedDate === today ? `Today — ${label}` : label;
    }
    const week = getWeekDates(new Date(selectedDate + "T12:00:00"));
    return `${formatHeaderDate(week[0])} – ${formatHeaderDate(week[6])}`;
  }, [viewMode, selectedDate, today]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date nav */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-sm font-medium min-w-[14rem] text-center">{headerLabel}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          {selectedDate !== today && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedDate(today)}>
              Today
            </Button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex rounded border overflow-hidden text-xs">
          <button
            className={cn("px-3 py-1 transition-colors", viewMode === "day" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
            onClick={() => setViewMode("day")}
          >
            Day
          </button>
          <button
            className={cn("px-3 py-1 transition-colors", viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
            onClick={() => setViewMode("week")}
          >
            Week
          </button>
        </div>

        {/* Filters */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 text-xs w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active" className="text-xs">Active (excl. done)</SelectItem>
            <SelectItem value="all" className="text-xs">All statuses</SelectItem>
            {Object.entries(JOB_STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={techFilter} onValueChange={setTechFilter}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="Technician" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All technicians</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                {t.name ?? t.email ?? `Tech #${t.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded"
          />
          Unassigned only
        </label>

        {/* Summary chips */}
        {viewMode === "day" && !isLoading && (
          <div className="flex items-center gap-1.5 ml-auto text-[11px] text-muted-foreground">
            <span>{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
            {unassigned.length > 0 && (
              <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 leading-none">
                {unassigned.length} unassigned
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading dispatch board…</div>
      ) : viewMode === "day" ? (
        renderDayView()
      ) : (
        renderWeekView()
      )}
    </div>
  );
}
