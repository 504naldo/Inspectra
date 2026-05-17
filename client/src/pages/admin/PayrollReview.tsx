import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Download,
  User,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Lock,
  FileDown,
} from "lucide-react";
import { Link } from "wouter";

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

function fmtH(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

function fmtHDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2) + "h";
}

function periodBounds(preset: string): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const day = now.getDay();

  if (preset === "thisWeek") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (preset === "lastWeek") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7) - 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  if (preset === "last14") {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(now.getDate() - 13);
    return { from: fmt(start), to: fmt(end) };
  }
  if (preset === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(start), to: fmt(now) };
  }
  if (preset === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(start), to: fmt(end) };
  }
  return { from: fmt(now), to: fmt(now) };
}

function buildCSV(entries: any[], userMap: Map<number, any>): string {
  const headers = [
    "Entry ID", "Employee Name", "Employee Email", "Role", "Date",
    "Pay Period Start", "Pay Period End", "Start Time", "End Time",
    "Break Minutes", "Regular Hours", "Overtime Hours", "Total Hours",
    "Work Type", "Status", "Job ID", "Work Order ID", "Description",
    "Employee Notes", "Admin Notes", "Approved By", "Approved At", "Exported At",
  ];
  const escape = (v: any) => {
    if (v == null || v === "") return "";
    const s = String(v).replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };
  const rows = entries.map((e) => {
    const u = userMap.get(e.userId);
    return [
      e.id,
      u?.name ?? `User #${e.userId}`,
      u?.email ?? "",
      u?.role ?? "",
      String(e.entryDate).slice(0, 10),
      e.payPeriodStart ? String(e.payPeriodStart).slice(0, 10) : "",
      e.payPeriodEnd ? String(e.payPeriodEnd).slice(0, 10) : "",
      e.startTime ?? "",
      e.endTime ?? "",
      e.breakMinutes ?? 0,
      ((e.regularMinutes ?? 0) / 60).toFixed(2),
      e.overtimeMinutes != null ? (e.overtimeMinutes / 60).toFixed(2) : "",
      (e.totalMinutes / 60).toFixed(2),
      WORK_TYPE_LABELS[e.workType] ?? e.workType,
      e.status,
      e.jobId ?? "",
      e.workOrderId ?? "",
      e.description ?? "",
      e.employeeNotes ?? "",
      e.adminNotes ?? "",
      e.approvedById ? (userMap.get(e.approvedById)?.name ?? `User #${e.approvedById}`) : "",
      e.approvedAt ? new Date(e.approvedAt).toISOString().slice(0, 16).replace("T", " ") : "",
      e.exportedAt ? new Date(e.exportedAt).toISOString().slice(0, 16).replace("T", " ") : "",
    ].map(escape).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

function triggerCSVDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary, missingCount }: { summary: any; missingCount: number }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-yellow-600">{summary.pendingCount}</div>
        <div className="text-xs text-muted-foreground">Pending approval</div>
        <div className="text-xs text-yellow-600 font-medium">{fmtH(summary.pendingMinutes)}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-green-600">{summary.approvedCount}</div>
        <div className="text-xs text-muted-foreground">Approved (export-ready)</div>
        <div className="text-xs text-green-600 font-medium">{fmtH(summary.approvedMinutes)}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-red-600">{summary.rejectedCount}</div>
        <div className="text-xs text-muted-foreground">Rejected entries</div>
        {summary.draftCount > 0 && (
          <div className="text-xs text-gray-500">{summary.draftCount} draft(s)</div>
        )}
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className={`text-xl font-bold ${missingCount > 0 ? "text-orange-600" : "text-muted-foreground"}`}>{missingCount}</div>
        <div className="text-xs text-muted-foreground">No submitted hours</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-blue-600">{summary.exportedCount}</div>
        <div className="text-xs text-muted-foreground">Exported / locked</div>
        <div className="text-xs text-blue-600 font-medium">{fmtH(summary.exportedMinutes)}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold">{fmtHDecimal(summary.totalMinutes)}</div>
        <div className="text-xs text-muted-foreground">Total hours</div>
        <div className="text-xs text-muted-foreground">{summary.uniqueEmployees} employees</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-primary">{fmtHDecimal(summary.totalRegularMinutes)}</div>
        <div className="text-xs text-muted-foreground">Regular hours</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-orange-600">{fmtHDecimal(summary.totalOvertimeMinutes)}</div>
        <div className="text-xs text-muted-foreground">Overtime hours</div>
      </CardContent></Card>
    </div>
  );
}

// ─── Missing hours panel ──────────────────────────────────────────────────────

function MissingHoursPanel({ employees }: { employees: any[] }) {
  const [open, setOpen] = useState(false);
  if (employees.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-4">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-9 text-sm text-orange-700 border-orange-300 bg-orange-50 hover:bg-orange-100">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {employees.length} employee{employees.length !== 1 ? "s" : ""} with no submitted hours in this period
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-orange-200 border-t-0 rounded-b-lg bg-orange-50/50 divide-y divide-orange-100">
          {employees.map((emp) => (
            <div key={emp.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">{emp.name}</span>
              <span className="text-xs text-muted-foreground">({emp.role})</span>
              <div className="ml-auto flex gap-2 text-xs">
                {!emp.hasAnyEntries && <span className="text-muted-foreground">No entries</span>}
                {emp.draftCount > 0 && <span className="text-gray-600">{emp.draftCount} draft{emp.draftCount !== 1 ? "s" : ""} not submitted</span>}
                {emp.rejectedCount > 0 && <span className="text-red-600">{emp.rejectedCount} rejected — needs resubmit</span>}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  variant = "default",
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Admin notes dialog ───────────────────────────────────────────────────────

function AdminNotesDialog({ entry, onClose }: { entry: any; onClose: () => void }) {
  const [notes, setNotes] = useState(entry.adminNotes ?? "");
  const utils = trpc.useUtils();
  const setNotesMut = trpc.payrollHours.setAdminNotes.useMutation({
    onSuccess: () => {
      toast.success("Notes saved.");
      utils.payrollHours.listCompany.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Admin Notes</DialogTitle>
          <DialogDescription>Internal notes — visible to admins only.</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" />
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={setNotesMut.isPending} onClick={() => setNotesMut.mutate({ id: entry.id, adminNotes: notes })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk reject dialog ───────────────────────────────────────────────────────

function BulkRejectDialog({
  count,
  onConfirm,
  onClose,
}: {
  count: number;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject {count} Entries</DialogTitle>
          <DialogDescription>All selected employees will see this reason.</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason (optional)"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason.trim())}>
            Reject {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Entry row ────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  userMap,
  selected,
  onSelect,
  onApprove,
  onReject,
  onNotes,
  currentUserId,
}: {
  entry: any;
  userMap: Map<number, any>;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onNotes: (entry: any) => void;
  currentUserId: number;
}) {
  const isSelf = entry.userId === currentUserId;
  const canApprove = entry.status === "submitted" && !isSelf;
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 border-b last:border-0 ${selected ? "bg-primary/5" : ""}`}>
      {canApprove && (
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          className="mt-0.5 shrink-0"
        />
      )}
      {!canApprove && <div className="w-4 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[entry.status] ?? "bg-gray-100"}`}>
            {entry.status}
          </span>
          <span className="text-xs text-muted-foreground">{WORK_TYPE_LABELS[entry.workType] ?? entry.workType}</span>
          <span className="text-sm font-bold tabular-nums">{fmtH(entry.totalMinutes)}</span>
          <span className="text-xs text-muted-foreground">{String(entry.entryDate).slice(0, 10)}</span>
          {entry.startTime && entry.endTime && (
            <span className="text-xs text-muted-foreground">{entry.startTime}–{entry.endTime}</span>
          )}
          {(entry.status === "exported" || entry.status === "locked") && (
            <Lock className="h-3 w-3 text-blue-500" />
          )}
        </div>
        {entry.description && <p className="text-xs text-muted-foreground truncate">{entry.description}</p>}
        {entry.employeeNotes && <p className="text-xs text-muted-foreground/70 italic truncate">"{entry.employeeNotes}"</p>}
        {entry.rejectionReason && <p className="text-xs text-red-600">Rejected: {entry.rejectionReason}</p>}
        {entry.adminNotes && <p className="text-xs text-blue-600 truncate">Admin: {entry.adminNotes}</p>}
        {entry.jobId && (
          <Link href={`/admin/jobs/${entry.jobId}`}>
            <span className="text-xs text-primary hover:underline flex items-center gap-0.5">Job #{entry.jobId} <ChevronRight className="h-3 w-3" /></span>
          </Link>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {canApprove && (
          <>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-green-700 border-green-300" onClick={() => onApprove(entry.id)}>
              <CheckCircle2 className="h-3 w-3 mr-0.5" /> OK
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-red-600 border-red-300" onClick={() => onReject(entry.id)}>
              <XCircle className="h-3 w-3 mr-0.5" /> Reject
            </Button>
          </>
        )}
        {isSelf && entry.status === "submitted" && (
          <span className="text-xs text-muted-foreground italic self-center">Your entry</span>
        )}
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => onNotes(entry)} title="Admin notes">
          <FileDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Employee group ───────────────────────────────────────────────────────────

function EmployeeGroup({
  userId,
  user,
  entries,
  userMap,
  selectedIds,
  onSelect,
  onApprove,
  onReject,
  onNotes,
  currentUserId,
}: {
  userId: number;
  user: any;
  entries: any[];
  userMap: Map<number, any>;
  selectedIds: Set<number>;
  onSelect: (id: number, checked: boolean) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onNotes: (entry: any) => void;
  currentUserId: number;
}) {
  const [open, setOpen] = useState(true);
  const totalMins = entries.reduce((s, e) => s + e.totalMinutes, 0);
  const statusBreakdown = entries.reduce((acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="border rounded-lg bg-card overflow-hidden mb-3">
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm">{user?.name ?? `User #${userId}`}</span>
          <span className="text-xs text-muted-foreground ml-2">({user?.role ?? "?"})</span>
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
          {Object.entries(statusBreakdown).map(([status, count]) => (
            <span key={status} className={`px-1.5 py-0.5 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-100"}`}>
              {count} {status}
            </span>
          ))}
          <span className="font-bold text-foreground">{fmtH(totalMins)}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              userMap={userMap}
              selected={selectedIds.has(entry.id)}
              onSelect={(checked) => onSelect(entry.id, checked)}
              onApprove={onApprove}
              onReject={onReject}
              onNotes={onNotes}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "This Week", key: "thisWeek" },
  { label: "Last Week", key: "lastWeek" },
  { label: "Last 14 Days", key: "last14" },
  { label: "This Month", key: "thisMonth" },
  { label: "Last Month", key: "lastMonth" },
];

export default function PayrollReview() {
  const { user } = useAuth();

  // Period state
  const [activePreset, setActivePreset] = useState("thisWeek");
  const defaultPeriod = periodBounds("thisWeek");
  const [from, setFrom] = useState(defaultPeriod.from);
  const [to, setTo] = useState(defaultPeriod.to);

  function applyPreset(key: string) {
    const bounds = periodBounds(key);
    setFrom(bounds.from);
    setTo(bounds.to);
    setActivePreset(key);
  }

  function handleDateChange(field: "from" | "to", val: string) {
    if (field === "from") setFrom(val);
    else setTo(val);
    setActivePreset("custom");
  }

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterRole, setFilterRole] = useState("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Dialogs
  const [rejectSingleId, setRejectSingleId] = useState<number | null>(null);
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false);
  const [showBulkRejectDialog, setShowBulkRejectDialog] = useState(false);
  const [showMarkExportedConfirm, setShowMarkExportedConfirm] = useState(false);
  const [notesEntry, setNotesEntry] = useState<any | null>(null);

  const utils = trpc.useUtils();

  // Data
  const { data: reviewSummary } = trpc.payrollHours.getReviewSummary.useQuery({ from, to });
  const { data: missingEmployees = [] } = trpc.payrollHours.getMissingHoursSummary.useQuery({ from, to });
  const { data: allUsers = [] } = trpc.user.listTechnicians.useQuery(
    { companyId: user!.companyId! },
    { enabled: !!user?.companyId },
  );
  const { data: entries = [], isLoading } = trpc.payrollHours.listCompany.useQuery({
    status: (filterStatus as any) || undefined,
    workType: (filterWorkType as any) || undefined,
    userId: filterUserId ? parseInt(filterUserId) : undefined,
    from,
    to,
  });
  const { data: exportAllEntries = [] } = trpc.payrollHours.exportData.useQuery({ from, to });

  // Mutations
  const approveMut = trpc.payrollHours.approve.useMutation({
    onSuccess: () => {
      toast.success("Approved.");
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getReviewSummary.invalidate();
      utils.payrollHours.getMissingHoursSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMut = trpc.payrollHours.reject.useMutation({
    onSuccess: () => {
      toast.success("Rejected.");
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getReviewSummary.invalidate();
      setRejectSingleId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkApproveMut = trpc.payrollHours.bulkApprove.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} entries approved.`);
      setSelectedIds(new Set());
      setShowBulkApproveConfirm(false);
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getReviewSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkRejectMut = trpc.payrollHours.bulkReject.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} entries rejected.`);
      setSelectedIds(new Set());
      setShowBulkRejectDialog(false);
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getReviewSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markExportedMut = trpc.payrollHours.markExported.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} entries marked as exported.`);
      setShowMarkExportedConfirm(false);
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getReviewSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Derived
  const userMap = useMemo(
    () => new Map((allUsers as any[]).map((u: any) => [u.id, u])),
    [allUsers],
  );

  const filteredEntries = useMemo(() => {
    let list = entries as any[];
    if (filterRole) list = list.filter((e) => userMap.get(e.userId)?.role === filterRole);
    return list;
  }, [entries, filterRole, userMap]);

  const grouped = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const entry of filteredEntries) {
      if (!map.has(entry.userId)) map.set(entry.userId, []);
      map.get(entry.userId)!.push(entry);
    }
    return Array.from(map.entries()).map(([userId, ents]) => ({
      userId,
      user: userMap.get(userId),
      entries: ents,
    }));
  }, [filteredEntries, userMap]);

  const submittedSelectableIds = useMemo(
    () => filteredEntries
      .filter((e: any) => e.status === "submitted" && e.userId !== user!.id)
      .map((e: any) => e.id),
    [filteredEntries, user],
  );

  const allSelected = submittedSelectableIds.length > 0 &&
    submittedSelectableIds.every((id) => selectedIds.has(id));

  const approvedIds = useMemo(
    () => (exportAllEntries as any[]).filter((e: any) => e.status === "approved").map((e: any) => e.id),
    [exportAllEntries],
  );

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(submittedSelectableIds));
  }

  function handleSelectEntry(id: number, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    setSelectedIds(next);
  }

  function exportSelected() {
    const toExport = (exportAllEntries as any[]).filter((e: any) => selectedIds.has(e.id));
    if (toExport.length === 0) { toast.error("No entries selected."); return; }
    const csv = buildCSV(toExport, userMap);
    triggerCSVDownload(csv, `payroll-selected-${from}-${to}.csv`);
    void logExportActivity();
  }

  function exportFiltered() {
    const csv = buildCSV(exportAllEntries as any[], userMap);
    triggerCSVDownload(csv, `payroll-${from}-${to}.csv`);
    void logExportActivity();
  }

  async function exportAndMark() {
    exportFiltered();
    if (approvedIds.length > 0) {
      await markExportedMut.mutateAsync({ ids: approvedIds });
    }
  }

  function logExportActivity() {
    // client-side only — activity logged server-side on markExported
  }

  const totalFilteredMins = filteredEntries.reduce((s: number, e: any) => s + e.totalMinutes, 0);

  return (
    <AdminLayout title="Payroll Review">
      {/* Pay period selector */}
      <Card className="mb-4">
        <CardContent className="pt-3 pb-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex gap-1.5 flex-wrap">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={activePreset === p.key ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2 items-center ml-auto">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  className="mt-0.5 h-8 text-sm w-32"
                  value={from}
                  onChange={(e) => handleDateChange("from", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  className="mt-0.5 h-8 text-sm w-32"
                  value={to}
                  onChange={(e) => handleDateChange("to", e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <SummaryCards summary={reviewSummary} missingCount={(missingEmployees as any[]).length} />

      {/* Missing hours */}
      <MissingHoursPanel employees={missingEmployees as any[]} />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-3 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[120px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus || "_all"} onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="exported">Exported</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[100px]">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={filterRole || "_all"} onValueChange={(v) => setFilterRole(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[130px]">
              <Label className="text-xs text-muted-foreground">Work Type</Label>
              <Select value={filterWorkType || "_all"} onValueChange={(v) => setFilterWorkType(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All types</SelectItem>
                  {Object.entries(WORK_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={filterUserId || "_all"} onValueChange={(v) => setFilterUserId(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All employees</SelectItem>
                  {(allUsers as any[]).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
              setFilterStatus(""); setFilterWorkType(""); setFilterUserId(""); setFilterRole("");
            }}>Clear filters</Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {submittedSelectableIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-lg border bg-muted/20">
          <label className="flex items-center gap-2 text-sm cursor-pointer mr-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            Select all submitted ({submittedSelectableIds.length})
          </label>
          {selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                disabled={bulkApproveMut.isPending}
                onClick={() => setShowBulkApproveConfirm(true)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve {selectedIds.size}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-red-600 border-red-300"
                disabled={bulkRejectMut.isPending}
                onClick={() => setShowBulkRejectDialog(true)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject {selectedIds.size}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={exportSelected}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export {selectedIds.size} selected
              </Button>
            </>
          )}
        </div>
      )}

      {/* Entry list grouped by employee */}
      {isLoading && <p className="text-sm text-muted-foreground py-4">Loading payroll entries…</p>}
      {!isLoading && filteredEntries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No payroll entries found for this period.</p>
        </div>
      )}
      {grouped.map(({ userId, user: empUser, entries: empEntries }) => (
        <EmployeeGroup
          key={userId}
          userId={userId}
          user={empUser}
          entries={empEntries}
          userMap={userMap}
          selectedIds={selectedIds}
          onSelect={handleSelectEntry}
          onApprove={(id) => approveMut.mutate({ id })}
          onReject={setRejectSingleId}
          onNotes={setNotesEntry}
          currentUserId={user!.id}
        />
      ))}

      {/* Footer / export controls */}
      {!isLoading && filteredEntries.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 py-3 border-t">
          <span className="text-xs text-muted-foreground">
            {filteredEntries.length} entries · Total: <strong>{fmtH(totalFilteredMins)}</strong>
          </span>
          <div className="flex flex-wrap gap-2">
            {approvedIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-blue-700 border-blue-300"
                disabled={markExportedMut.isPending}
                onClick={() => setShowMarkExportedConfirm(true)}
              >
                <Lock className="h-3.5 w-3.5 mr-1" />
                Mark {approvedIds.length} Approved as Exported
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportFiltered}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export Filtered CSV
            </Button>
            {approvedIds.length > 0 && (
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={markExportedMut.isPending}
                onClick={exportAndMark}
              >
                <FileDown className="h-3.5 w-3.5 mr-1" /> Export + Mark Exported
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Single reject dialog */}
      {rejectSingleId !== null && (
        <Dialog open onOpenChange={(v) => !v && setRejectSingleId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reject Entry</DialogTitle>
              <DialogDescription>Provide an optional reason. The employee will see this.</DialogDescription>
            </DialogHeader>
            <RejectReasonForm
              isPending={rejectMut.isPending}
              onConfirm={(reason) => rejectMut.mutate({ id: rejectSingleId!, reason: reason || undefined })}
              onClose={() => setRejectSingleId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk approve confirm */}
      <ConfirmDialog
        open={showBulkApproveConfirm}
        title={`Approve ${selectedIds.size} entries?`}
        description="This will approve all selected submitted entries. Approved entries are ready for export."
        confirmLabel={`Approve ${selectedIds.size}`}
        onConfirm={() => bulkApproveMut.mutate({ ids: Array.from(selectedIds) })}
        onClose={() => setShowBulkApproveConfirm(false)}
      />

      {/* Bulk reject dialog */}
      {showBulkRejectDialog && (
        <BulkRejectDialog
          count={selectedIds.size}
          onConfirm={(reason) => bulkRejectMut.mutate({ ids: Array.from(selectedIds), reason: reason || undefined })}
          onClose={() => setShowBulkRejectDialog(false)}
        />
      )}

      {/* Mark exported confirm */}
      <ConfirmDialog
        open={showMarkExportedConfirm}
        title={`Mark ${approvedIds.length} entries as exported?`}
        description="Exported entries will be locked for employee editing. This records that they were sent to payroll."
        confirmLabel="Mark as Exported"
        onConfirm={() => markExportedMut.mutate({ ids: approvedIds })}
        onClose={() => setShowMarkExportedConfirm(false)}
      />

      {/* Admin notes */}
      {notesEntry !== null && (
        <AdminNotesDialog entry={notesEntry} onClose={() => setNotesEntry(null)} />
      )}
    </AdminLayout>
  );
}

// Small inline reject reason form (used inside the single-reject dialog)
function RejectReasonForm({
  isPending,
  onConfirm,
  onClose,
}: {
  isPending: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <>
      <Textarea
        placeholder="Reason (optional)"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <DialogFooter className="mt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" disabled={isPending} onClick={() => onConfirm(reason.trim())}>
          Reject
        </Button>
      </DialogFooter>
    </>
  );
}
