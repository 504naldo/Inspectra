import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Send,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const WORK_TYPE_LABELS: Record<string, string> = {
  regular_work: "Regular Work",
  job_site: "Job Site",
  travel: "Travel",
  office_admin: "Office / Admin",
  shop_time: "Shop Time",
  inventory: "Inventory",
  training: "Training",
  meeting: "Meeting",
  sick_time: "Sick Time",
  vacation: "Vacation",
  stat_holiday: "Stat Holiday",
  unpaid_time: "Unpaid Time",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  exported: "bg-blue-100 text-blue-700",
  locked: "bg-purple-100 text-purple-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

function calcTotal(startTime: string, endTime: string, breakMins: number): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (end <= start) return 0;
  return Math.max(0, end - start - breakMins);
}

function weekBounds(offsetWeeks = 0): { from: string; to: string; label: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const label = offsetWeeks === 0 ? "This Week" : offsetWeeks === -1 ? "Last Week" : fmt(monday);
  return { from: fmt(monday), to: fmt(sunday), label };
}

// ─── Entry form ───────────────────────────────────────────────────────────────

type EntryFormProps = {
  initial?: {
    id?: number;
    entryDate?: string;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
    totalMinutes?: number;
    regularMinutes?: number;
    workType?: string;
    description?: string;
    employeeNotes?: string;
  };
  onClose: () => void;
  onSaved: () => void;
};

function EntryForm({ initial, onClose, onSaved }: EntryFormProps) {
  const isEdit = !!initial?.id;
  const [date, setDate] = useState(initial?.entryDate ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [breakMins, setBreakMins] = useState(String(initial?.breakMinutes ?? 0));
  const [manualMins, setManualMins] = useState(
    initial?.totalMinutes ? String(initial.totalMinutes) : ""
  );
  const [useTimer, setUseTimer] = useState(!!initial?.startTime);
  const [workType, setWorkType] = useState(initial?.workType ?? "regular_work");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.employeeNotes ?? "");

  const utils = trpc.useUtils();

  const totalMins = useMemo(() => {
    if (useTimer && startTime && endTime) return calcTotal(startTime, endTime, parseInt(breakMins) || 0);
    return parseInt(manualMins) || 0;
  }, [useTimer, startTime, endTime, breakMins, manualMins]);

  const createMut = trpc.payrollHours.create.useMutation({
    onSuccess: () => { toast.success("Hours saved."); utils.payrollHours.listMine.invalidate(); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.payrollHours.update.useMutation({
    onSuccess: () => { toast.success("Hours updated."); utils.payrollHours.listMine.invalidate(); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  function handleSave() {
    if (totalMins < 1) { toast.error("Total time must be at least 1 minute."); return; }
    const payload = {
      entryDate: date,
      startTime: useTimer ? startTime || undefined : undefined,
      endTime: useTimer ? endTime || undefined : undefined,
      breakMinutes: useTimer ? parseInt(breakMins) || 0 : 0,
      regularMinutes: totalMins,
      totalMinutes: totalMins,
      workType: workType as any,
      description,
      employeeNotes: notes || undefined,
    };
    if (isEdit) {
      updateMut.mutate({ id: initial!.id!, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={useTimer ? "default" : "outline"}
          className="flex-1 h-8 text-xs"
          onClick={() => setUseTimer(true)}
        >
          Clock In/Out
        </Button>
        <Button
          size="sm"
          variant={!useTimer ? "default" : "outline"}
          className="flex-1 h-8 text-xs"
          onClick={() => setUseTimer(false)}
        >
          Manual Hours
        </Button>
      </div>

      <div>
        <Label className="text-xs">Date</Label>
        <Input type="date" className="mt-1 h-9" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {useTimer ? (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Start</Label>
            <Input type="time" className="mt-1 h-9 text-sm" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">End</Label>
            <Input type="time" className="mt-1 h-9 text-sm" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Break (min)</Label>
            <Input type="number" min="0" max="480" className="mt-1 h-9 text-sm" value={breakMins} onChange={(e) => setBreakMins(e.target.value)} />
          </div>
        </div>
      ) : (
        <div>
          <Label className="text-xs">Total Minutes</Label>
          <Input
            type="number"
            min="1"
            max="1440"
            className="mt-1 h-9 text-sm"
            placeholder="e.g. 480 for 8h"
            value={manualMins}
            onChange={(e) => setManualMins(e.target.value)}
          />
        </div>
      )}

      {totalMins > 0 && (
        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-sm font-semibold text-primary text-center">
          Total: {fmtHours(totalMins)}
        </div>
      )}

      <div>
        <Label className="text-xs">Work Type</Label>
        <Select value={workType} onValueChange={setWorkType}>
          <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(WORK_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Description (optional)</Label>
        <Input className="mt-1 h-9 text-sm" placeholder="What did you work on?" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div>
        <Label className="text-xs">Personal Notes (optional)</Label>
        <Textarea className="mt-1 text-sm" rows={2} placeholder="Any notes for yourself or the reviewer" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="flex-1" onClick={handleSave} disabled={isPending || totalMins < 1}>
          {isEdit ? "Update" : "Save Draft"}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Entry card ───────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onEdit,
  onSubmit,
  onDelete,
}: {
  entry: any;
  onEdit: (entry: any) => void;
  onSubmit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const canEdit = entry.status === "draft" || entry.status === "rejected";
  return (
    <div className="border rounded-lg bg-card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.status] ?? "bg-gray-100"}`}>
              {entry.status}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {WORK_TYPE_LABELS[entry.workType] ?? entry.workType}
            </span>
            <span className="text-sm font-bold tabular-nums">{fmtHours(entry.totalMinutes)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {String(entry.entryDate).slice(0, 10)}
            {entry.startTime && entry.endTime && ` · ${entry.startTime}–${entry.endTime}`}
            {entry.breakMinutes > 0 && ` · ${entry.breakMinutes}m break`}
          </div>
          {entry.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>}
          {entry.rejectionReason && (
            <p className="text-xs text-red-600 mt-0.5">Rejected: {entry.rejectionReason}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => onEdit(entry)}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-400"
                onClick={() => onDelete(entry.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {entry.status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-primary border-primary/40"
              onClick={() => onSubmit(entry.id)}
            >
              <Send className="h-3 w-3 mr-1" /> Submit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TechPayrollHours() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<any | null>(null);

  const week = weekBounds(weekOffset);
  const utils = trpc.useUtils();

  const { data: entries = [], isLoading } = trpc.payrollHours.listMine.useQuery({
    from: week.from,
    to: week.to,
  });

  const submitMut = trpc.payrollHours.submit.useMutation({
    onSuccess: () => { toast.success("Hours submitted for approval."); utils.payrollHours.listMine.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.payrollHours.deleteDraft.useMutation({
    onSuccess: () => { toast.success("Entry deleted."); utils.payrollHours.listMine.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const totalMins = (entries as any[]).reduce((s: number, e: any) => s + e.totalMinutes, 0);
  const approvedMins = (entries as any[]).filter((e: any) => e.status === "approved" || e.status === "exported" || e.status === "locked")
    .reduce((s: number, e: any) => s + e.totalMinutes, 0);
  const draftCount = (entries as any[]).filter((e: any) => e.status === "draft").length;

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom pb-8">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-3">
          <Link href="/tech">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg leading-tight">My Payroll Hours</h1>
          </div>
          <Button size="sm" onClick={() => { setEditEntry(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Hours
          </Button>
        </div>
      </header>

      <main className="container max-w-lg py-4 space-y-4">
        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="font-semibold text-sm">{week.label}</p>
            <p className="text-xs text-muted-foreground">{week.from} – {week.to}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <Card><CardContent className="pt-3 pb-2 text-center">
            <div className="text-xl font-bold">{fmtHours(totalMins)}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 pb-2 text-center">
            <div className="text-xl font-bold text-green-600">{fmtHours(approvedMins)}</div>
            <div className="text-xs text-muted-foreground">Approved</div>
          </CardContent></Card>
          <Card><CardContent className="pt-3 pb-2 text-center">
            <div className="text-xl font-bold text-yellow-600">{draftCount}</div>
            <div className="text-xs text-muted-foreground">Unsubmitted</div>
          </CardContent></Card>
        </div>

        {/* Submit all drafts shortcut */}
        {draftCount > 1 && (
          <Button
            variant="outline"
            className="w-full text-sm h-9"
            disabled={submitMut.isPending}
            onClick={() => {
              const drafts = (entries as any[]).filter((e: any) => e.status === "draft");
              Promise.all(drafts.map((e: any) => submitMut.mutateAsync({ id: e.id })))
                .then(() => toast.success(`${drafts.length} entries submitted.`))
                .catch(() => {});
            }}
          >
            <Send className="h-4 w-4 mr-2" /> Submit All Drafts ({draftCount})
          </Button>
        )}

        {/* Entry list */}
        {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>}
        {!isLoading && (entries as any[]).length === 0 && (
          <div className="text-center py-12 text-muted-foreground space-y-2">
            <Clock className="h-8 w-8 mx-auto opacity-30" />
            <p className="text-sm">No hours logged for this week.</p>
            <Button size="sm" variant="outline" onClick={() => { setEditEntry(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Hours
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {(entries as any[]).map((entry: any) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={(e) => { setEditEntry(e); setShowForm(true); }}
              onSubmit={(id) => submitMut.mutate({ id })}
              onDelete={(id) => deleteMut.mutate({ id })}
            />
          ))}
        </div>
      </main>

      {/* Add/Edit dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setEditEntry(null); } }}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editEntry ? "Edit Hours" : "Log Hours"}</DialogTitle>
          </DialogHeader>
          <EntryForm
            initial={editEntry ?? undefined}
            onClose={() => { setShowForm(false); setEditEntry(null); }}
            onSaved={() => { setShowForm(false); setEditEntry(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
