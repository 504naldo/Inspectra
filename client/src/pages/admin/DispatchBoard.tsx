import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  JOB_STATUS_LABELS,
  getJobStatusLabel,
  getJobStatusBadgeClass,
  getPriorityLabel,
  getPriorityBadgeClass,
  getJobTypeLabel,
} from "@/lib/statusLabels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ExternalLink, Users, X, Shuffle, GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// ── Constants ──────────────────────────────────────────────────────────────────

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
  dragHandleRef,
  dragHandleProps,
}: {
  job: DispatchJob;
  technicians: Tech[];
  onAssign: (jobId: number, techId: number | null) => void;
  onStatus: (jobId: number, status: string) => void;
  onAddAssist: (jobId: number, techId: number) => void;
  onRemoveAssist: (jobId: number, techId: number) => void;
  dragHandleRef?: (el: HTMLElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
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
        <div className="flex items-center gap-1 min-w-0">
          {dragHandleRef && (
            <button
              ref={dragHandleRef}
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none flex-shrink-0"
              title="Drag to reassign"
            >
              <GripVertical className="h-3 w-3" />
            </button>
          )}
          <span className="font-mono text-[11px] text-muted-foreground leading-tight truncate">
            {job.jobNumber ?? `#${job.id}`}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {job.priority !== "low" && (
            <span className={cn("text-[10px] rounded px-1 py-0.5 leading-none", getPriorityBadgeClass(job.priority))}>
              {getPriorityLabel(job.priority)}
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
          <span className="text-[10px] text-muted-foreground">{getJobTypeLabel(job.jobType)}</span>
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
            <span className={cn("rounded px-1 text-[10px]", getJobStatusBadgeClass(job.status))}>
              {getJobStatusLabel(job.status)}
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

// ── Draggable Job Card (Day View) ────────────────────────────────────────────
// Wraps JobCard with @dnd-kit/core's useDraggable so it can be dropped onto
// another technician's column to reassign the lead (see DroppableTechColumn).

type JobActions = {
  technicians: Tech[];
  onAssign: (jobId: number, techId: number | null) => void;
  onStatus: (jobId: number, status: string) => void;
  onAddAssist: (jobId: number, techId: number) => void;
  onRemoveAssist: (jobId: number, techId: number) => void;
};

function DraggableJobCard({ job, ...actions }: { job: DispatchJob } & JobActions) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40 relative z-10")}>
      <JobCard job={job} {...actions} dragHandleRef={setActivatorNodeRef} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Droppable Tech Column (Day View) ──────────────────────────────────────────
// Wraps TechColumn with useDroppable so a dragged JobCard can be released here
// to reassign its lead technician. `techId` is null for the "Unassigned" column.

function DroppableTechColumn({ id, techId, ...props }: { id: string; techId: number | null } & TechColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { techId } });

  return (
    <div ref={setNodeRef} className={cn("rounded-lg transition-colors", isOver && "bg-primary/5 ring-2 ring-primary/30")}>
      <TechColumn {...props} />
    </div>
  );
}

// ── Tech Column ───────────────────────────────────────────────────────────────

type TechColumnProps = JobActions & {
  label: string;
  jobs: DispatchJob[];
};

function TechColumn({ label, jobs, technicians, onAssign, onStatus, onAddAssist, onRemoveAssist }: TechColumnProps) {
  const actions = { technicians, onAssign, onStatus, onAddAssist, onRemoveAssist };
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
          <DraggableJobCard key={job.id} job={job} {...actions} />
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

  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignFrom, setReassignFrom] = useState("");
  const [reassignTo, setReassignTo] = useState("");

  const reassignMutation = trpc.jobAssignment.reassignTechnician.useMutation({
    onSuccess: ({ reassigned }) => {
      toast.success(`Reassigned ${reassigned} job${reassigned !== 1 ? "s" : ""}`);
      setReassignOpen(false);
      setReassignFrom("");
      setReassignTo("");
      refetch();
    },
    onError: (e) => toast.error(e.message || "Reassignment failed"),
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

  const reassignFromJobs = useMemo(() => {
    if (!reassignFrom) return [];
    const tid = Number(reassignFrom);
    return jobs.filter((j) => j.assignedTechnicians.some((t) => t.id === tid));
  }, [reassignFrom, jobs]);

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

  // Drag-and-drop reassignment (Day View): dragging a job card onto another
  // technician's column (or "Unassigned") sets that technician as the lead.
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [draggingJob, setDraggingJob] = useState<DispatchJob | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setDraggingJob((event.active.data.current?.job as DispatchJob | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingJob(null);
    const { active, over } = event;
    if (!over) return;

    const job = active.data.current?.job as DispatchJob | undefined;
    if (!job) return;

    const newLeadId = (over.data.current as { techId: number | null } | undefined)?.techId ?? null;
    const currentLeadId = job.assignedTechnicians.find((t) => t.role === "LEAD")?.id ?? null;
    if (currentLeadId === newLeadId) return; // dropped back onto its own column — no-op

    handleAssign(job.id, newLeadId);
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

  // Day view shows every technician as a column, including those with no jobs today
  const techsWithJobs = technicians;

  // ── Day View ──────────────────────────────────────────────────────────────

  function renderDayView() {
    const columnActions = { technicians, onAssign: handleAssign, onStatus: handleStatus, onAddAssist: handleAddAssist, onRemoveAssist: handleRemoveAssist };
    return (
      <DndContext sensors={dndSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {/* Unassigned column */}
            <DroppableTechColumn id="unassigned" techId={null} label="Unassigned" jobs={unassigned} {...columnActions} />

            {/* Divider */}
            <div className="w-px bg-border self-stretch" />

            {/* Tech columns */}
            {techsWithJobs.map((tech) => {
              const techJobs = jobs.filter((j) => j.assignedTechnicians.some((t) => t.id === tech.id));
              return (
                <DroppableTechColumn
                  key={tech.id}
                  id={`tech-${tech.id}`}
                  techId={tech.id}
                  label={tech.name ?? tech.email ?? `Tech #${tech.id}`}
                  jobs={techJobs}
                  {...columnActions}
                />
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {draggingJob ? (
            <div className="w-56 rotate-2 shadow-lg opacity-95">
              <JobCard job={draggingJob} {...columnActions} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
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

        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setReassignOpen(true)}>
          <Shuffle className="h-3 w-3" /> Bulk Reassign
        </Button>

        {/* Summary chips */}
        {viewMode === "day" && !isLoading && (
          <div className="flex items-center gap-1.5 ml-auto text-[11px] text-muted-foreground">
            <span className="hidden sm:inline-flex items-center gap-1 text-muted-foreground/60">
              <GripVertical className="h-3 w-3" /> Drag a job to reassign
            </span>
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

      {/* Bulk Reassign Dialog */}
      <Dialog open={reassignOpen} onOpenChange={(v) => { if (!v) { setReassignOpen(false); setReassignFrom(""); setReassignTo(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shuffle className="h-4 w-4" /> Bulk Reassign Jobs
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Move all jobs from one technician to another within the current view.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">From technician</label>
              <Select value={reassignFrom} onValueChange={(v) => { setReassignFrom(v); setReassignTo(""); }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select technician…" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)} className="text-sm">
                      {t.name ?? t.email ?? `Tech #${t.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reassignFrom && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {reassignFromJobs.length === 0
                  ? "No jobs assigned to this technician in the current view."
                  : `${reassignFromJobs.length} job${reassignFromJobs.length !== 1 ? "s" : ""} will be reassigned:`}
                {reassignFromJobs.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {reassignFromJobs.slice(0, 5).map((j) => (
                      <li key={j.id} className="truncate">· {j.siteName ?? j.title} {j.scheduledDate ? `(${new Date(j.scheduledDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" })})` : "(unscheduled)"}</li>
                    ))}
                    {reassignFromJobs.length > 5 && <li className="text-muted-foreground">…and {reassignFromJobs.length - 5} more</li>}
                  </ul>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">To technician</label>
              <Select value={reassignTo} onValueChange={setReassignTo} disabled={!reassignFrom || reassignFromJobs.length === 0}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select technician…" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.filter((t) => String(t.id) !== reassignFrom).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)} className="text-sm">
                      {t.name ?? t.email ?? `Tech #${t.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setReassignOpen(false); setReassignFrom(""); setReassignTo(""); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!reassignFrom || !reassignTo || reassignFromJobs.length === 0 || reassignMutation.isPending}
              onClick={() => reassignMutation.mutate({
                fromTechId: Number(reassignFrom),
                toTechId: Number(reassignTo),
                jobIds: reassignFromJobs.map((j) => j.id),
              })}
            >
              {reassignMutation.isPending ? "Reassigning…" : `Reassign ${reassignFromJobs.length} job${reassignFromJobs.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
