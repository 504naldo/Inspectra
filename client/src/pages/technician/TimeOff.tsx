import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield,
  LogOut,
  CalendarOff,
  Plus,
  XCircle,
  Edit2,
  CheckCircle2,
  Clock,
  ChevronLeft,
} from "lucide-react";
import { APP_NAME } from "../../../../shared/constants";
import { Link } from "wouter";

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  training: "Training",
  stat_holiday: "Stat Holiday",
  unavailable: "Unavailable",
  available_override: "Available (Override)",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-600 border-red-200",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  requested: <Clock className="h-4 w-4" />,
  approved: <CheckCircle2 className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
  cancelled: <CalendarOff className="h-4 w-4" />,
};

const BLOCK_TYPES = [
  "vacation", "sick", "personal", "training", "stat_holiday", "unavailable", "other",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateRange(start: any, end: any): string {
  const s = String(start).slice(0, 10);
  const e = String(end).slice(0, 10);
  return s === e ? s : `${s} – ${e}`;
}

// ─── Request form (shared between create and edit) ────────────────────────────

interface FormState {
  type: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  reason: string;
  employeeNotes: string;
}

function TimeOffForm({
  initialValues,
  isPending,
  onSubmit,
  onClose,
  submitLabel,
}: {
  initialValues?: Partial<FormState>;
  isPending: boolean;
  onSubmit: (values: FormState) => void;
  onClose: () => void;
  submitLabel: string;
}) {
  const [type, setType] = useState(initialValues?.type ?? "vacation");
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? todayStr());
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? todayStr());
  const [allDay, setAllDay] = useState(initialValues?.allDay ?? true);
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(initialValues?.endTime ?? "17:00");
  const [reason, setReason] = useState(initialValues?.reason ?? "");
  const [employeeNotes, setEmployeeNotes] = useState(initialValues?.employeeNotes ?? "");

  function submit() {
    if (startDate > endDate) {
      toast.error("Start date must be before end date.");
      return;
    }
    onSubmit({ type, startDate, endDate, allDay, startTime, endTime, reason, employeeNotes });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BLOCK_TYPES.map(t => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm font-medium">Start Date</Label>
          <Input type="date" className="mt-1" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-sm font-medium">End Date</Label>
          <Input type="date" className="mt-1" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="allday" checked={allDay} onCheckedChange={(v) => setAllDay(!!v)} />
        <Label htmlFor="allday" className="cursor-pointer">All day</Label>
      </div>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Start Time</Label>
            <Input type="time" className="mt-1" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm font-medium">End Time</Label>
            <Input type="time" className="mt-1" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <Label className="text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input className="mt-1" value={reason} onChange={e => setReason(e.target.value)} placeholder="Brief reason" />
      </div>
      <div>
        <Label className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea rows={2} className="mt-1" value={employeeNotes} onChange={e => setEmployeeNotes(e.target.value)} placeholder="Additional details" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" disabled={isPending} onClick={submit}>{submitLabel}</Button>
      </div>
    </div>
  );
}

// ─── Block card ───────────────────────────────────────────────────────────────

function BlockCard({
  block,
  onEdit,
  onCancel,
}: {
  block: any;
  onEdit: (block: any) => void;
  onCancel: (id: number) => void;
}) {
  const colorClass = STATUS_COLORS[block.status] ?? "bg-muted border-border";
  const icon = STATUS_ICONS[block.status];

  return (
    <div className={`border rounded-lg p-4 ${colorClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="font-semibold text-sm">{TYPE_LABELS[block.type] ?? block.type}</p>
            <p className="text-xs font-medium">{fmtDateRange(block.startDate, block.endDate)}</p>
            {!block.allDay && block.startTime && block.endTime && (
              <p className="text-xs opacity-75">{block.startTime}–{block.endTime}</p>
            )}
          </div>
        </div>
        <span className="text-xs font-semibold capitalize opacity-80">{block.status}</span>
      </div>
      {block.reason && <p className="text-xs mt-2 opacity-80">{block.reason}</p>}
      {block.adminNotes && (
        <p className="text-xs mt-1 opacity-70 italic">Admin note: {block.adminNotes}</p>
      )}
      {block.status === "requested" && (
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => onEdit(block)}>
            <Edit2 className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-red-600 border-red-300" onClick={() => onCancel(block.id)}>
            <XCircle className="h-3 w-3 mr-1" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function TechHeader() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-50 bg-card border-b">
      <div className="container flex h-16 items-center gap-4">
        <Link href="/tech">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/tech">
          <div className="flex items-center gap-2 cursor-pointer">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-bold hidden sm:inline">{APP_NAME}</span>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[140px]">{user?.name}</span>
          <Button variant="ghost" size="icon" onClick={() => logout().then(() => (window.location.href = "/"))}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TechTimeOff() {
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);

  const utils = trpc.useUtils();

  const { data: blocks = [], isLoading } = trpc.availability.listMyAvailability.useQuery({});

  const createMut = trpc.availability.createTimeOffRequest.useMutation({
    onSuccess: () => {
      toast.success("Time off requested.");
      utils.availability.listMyAvailability.invalidate();
      setShowRequestDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.availability.updateTimeOffRequest.useMutation({
    onSuccess: () => {
      toast.success("Request updated.");
      utils.availability.listMyAvailability.invalidate();
      setEditingBlock(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMut = trpc.availability.cancelTimeOffRequest.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled.");
      utils.availability.listMyAvailability.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const upcoming = (blocks as any[]).filter(b => b.status !== "cancelled");
  const cancelled = (blocks as any[]).filter(b => b.status === "cancelled");

  return (
    <div className="min-h-screen bg-background">
      <TechHeader />
      <main className="container max-w-xl py-6 space-y-5">

        {/* Title + request button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">My Time Off</h1>
            <p className="text-sm text-muted-foreground">Request and track your time off</p>
          </div>
          <Button onClick={() => setShowRequestDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Request
          </Button>
        </div>

        {/* Upcoming / current blocks */}
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && upcoming.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarOff className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No time off requests yet.</p>
            <Button variant="link" className="text-xs mt-1" onClick={() => setShowRequestDialog(true)}>
              Request time off
            </Button>
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="space-y-3">
            {upcoming.map(b => (
              <BlockCard
                key={b.id}
                block={b}
                onEdit={setEditingBlock}
                onCancel={(id) => cancelMut.mutate({ id })}
              />
            ))}
          </div>
        )}

        {/* Cancelled (collapsed) */}
        {cancelled.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              {cancelled.length} cancelled request{cancelled.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-2">
              {cancelled.map(b => (
                <BlockCard key={b.id} block={b} onEdit={() => {}} onCancel={() => {}} />
              ))}
            </div>
          </details>
        )}
      </main>

      {/* Create dialog */}
      {showRequestDialog && (
        <Dialog open onOpenChange={(v) => !v && setShowRequestDialog(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Request Time Off</DialogTitle>
              <DialogDescription>Your request will be reviewed by an admin.</DialogDescription>
            </DialogHeader>
            <TimeOffForm
              isPending={createMut.isPending}
              submitLabel="Submit Request"
              onClose={() => setShowRequestDialog(false)}
              onSubmit={(values) => createMut.mutate({
                type: values.type as any,
                startDate: values.startDate,
                endDate: values.endDate,
                allDay: values.allDay,
                startTime: values.allDay ? undefined : values.startTime,
                endTime: values.allDay ? undefined : values.endTime,
                reason: values.reason,
                employeeNotes: values.employeeNotes || undefined,
              })}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit dialog */}
      {editingBlock !== null && (
        <Dialog open onOpenChange={(v) => !v && setEditingBlock(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Request</DialogTitle>
            </DialogHeader>
            <TimeOffForm
              initialValues={{
                type: editingBlock.type,
                startDate: String(editingBlock.startDate).slice(0, 10),
                endDate: String(editingBlock.endDate).slice(0, 10),
                allDay: !!editingBlock.allDay,
                startTime: editingBlock.startTime ?? "09:00",
                endTime: editingBlock.endTime ?? "17:00",
                reason: editingBlock.reason ?? "",
                employeeNotes: editingBlock.employeeNotes ?? "",
              }}
              isPending={updateMut.isPending}
              submitLabel="Save Changes"
              onClose={() => setEditingBlock(null)}
              onSubmit={(values) => updateMut.mutate({
                id: editingBlock.id,
                type: values.type as any,
                startDate: values.startDate,
                endDate: values.endDate,
                allDay: values.allDay,
                startTime: values.allDay ? undefined : values.startTime,
                endTime: values.allDay ? undefined : values.endTime,
                reason: values.reason,
                employeeNotes: values.employeeNotes || undefined,
              })}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
