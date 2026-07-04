import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
  Clock,
  CheckCircle2,
  XCircle,
  Download,
  User,
  ChevronRight,
  AlertTriangle,
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

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

function weekBounds(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(monday), to: fmt(sunday) };
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
    const user = userMap.get(e.userId);
    return [
      e.id,
      user?.name ?? `User #${e.userId}`,
      user?.email ?? "",
      user?.role ?? "",
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

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Overview cards ───────────────────────────────────────────────────────────

function OverviewCards({ summary }: { summary: any }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <Card><CardContent className="pt-4 pb-3">
        <div className="text-2xl font-bold text-yellow-600">{fmtHours(summary.submittedMinutes)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Submitted (pending)</div>
      </CardContent></Card>
      <Card><CardContent className="pt-4 pb-3">
        <div className="text-2xl font-bold text-green-600">{fmtHours(summary.approvedMinutes)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Approved</div>
      </CardContent></Card>
      <Card><CardContent className="pt-4 pb-3">
        <div className="text-2xl font-bold text-blue-600">{fmtHours(summary.exportedMinutes)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Exported</div>
      </CardContent></Card>
      <Card><CardContent className="pt-4 pb-3">
        <div className="text-2xl font-bold text-primary">{summary.uniqueEmployees}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Employees (period)</div>
      </CardContent></Card>
    </div>
  );
}

// ─── Reject dialog ────────────────────────────────────────────────────────────

function RejectDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const rejectMut = trpc.payrollHours.reject.useMutation({
    onSuccess: () => {
      toast.success("Entry rejected.");
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getSummary.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject Payroll Entry</DialogTitle>
          <DialogDescription>Provide an optional reason. The employee will see this.</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason (optional)"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={rejectMut.isPending}
            onClick={() => rejectMut.mutate({ id, reason: reason.trim() || undefined })}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Admin notes dialog ───────────────────────────────────────────────────────

function AdminNotesDialog({ entry, onClose }: { entry: any; onClose: () => void }) {
  const [notes, setNotes] = useState(entry.adminNotes ?? "");
  const utils = trpc.useUtils();
  const updateMut = trpc.payrollHours.update.useMutation({
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
          <DialogDescription>Internal notes — not shown to the employee on their end.</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" />
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={updateMut.isPending} onClick={() => updateMut.mutate({ id: entry.id, adminNotes: notes } as any)}>Save</Button>
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
  canManage,
}: {
  entry: any;
  userMap: Map<number, any>;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onNotes: (entry: any) => void;
  currentUserId: number;
  canManage: boolean;
}) {
  const user = userMap.get(entry.userId);
  const isSelf = entry.userId === currentUserId;
  // Approval/rejection is admin-only (enforced server-side).
  const canApprove = canManage && entry.status === "submitted" && !isSelf;
  return (
    <div className={`border rounded-lg bg-card px-4 py-3 ${selected ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-start gap-3">
        {canApprove && (
          <Checkbox
            checked={selected}
            onCheckedChange={onSelect}
            className="mt-0.5 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.status] ?? "bg-gray-100"}`}>
              {entry.status}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {WORK_TYPE_LABELS[entry.workType] ?? entry.workType}
            </span>
            <span className="text-sm font-semibold tabular-nums">{fmtHours(entry.totalMinutes)}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {user?.name ?? `User #${entry.userId}`}
              {user?.role && <span className="text-muted-foreground/60">({user.role})</span>}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {String(entry.entryDate).slice(0, 10)}
              {entry.startTime && entry.endTime && ` · ${entry.startTime}–${entry.endTime}`}
            </span>
            {entry.jobId && (
              <Link href={`/admin/jobs/${entry.jobId}`}>
                <span className="text-primary hover:underline flex items-center gap-0.5">
                  Job #{entry.jobId} <ChevronRight className="h-3 w-3" />
                </span>
              </Link>
            )}
          </div>
          {entry.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>}
          {entry.employeeNotes && <p className="text-xs text-muted-foreground/80 italic mt-0.5 truncate">Note: {entry.employeeNotes}</p>}
          {entry.rejectionReason && <p className="text-xs text-red-600 mt-0.5">Rejected: {entry.rejectionReason}</p>}
          {entry.adminNotes && <p className="text-xs text-blue-600 mt-0.5 truncate">Admin: {entry.adminNotes}</p>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {canApprove && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-green-700 border-green-300"
                onClick={() => onApprove(entry.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-red-600 border-red-300"
                onClick={() => onReject(entry.id)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </>
          )}
          {isSelf && entry.status === "submitted" && (
            <span className="text-xs text-muted-foreground italic">Your entry</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onNotes(entry)}
          >
            Notes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPayrollHours() {
  const { user } = useAuth();
  // Payroll approval and export are admin-only (enforced server-side). Hide the
  // approve/reject/bulk/export controls from office users.
  const canManage = user?.role === "admin" || user?.role === "office";
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [notesEntry, setNotesEntry] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const week = weekBounds();
  const [from, setFrom] = useState(week.from);
  const [to, setTo] = useState(week.to);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  const utils = trpc.useUtils();

  const { data: summary } = trpc.payrollHours.getSummary.useQuery({ from, to });
  const { data: allUsers = [] } = trpc.user.listTechnicians.useQuery(
    { companyId: user!.companyId! },
    { enabled: !!user?.companyId }
  );
  const { data: entries = [], isLoading } = trpc.payrollHours.listCompany.useQuery({
    status: (filterStatus as any) || undefined,
    workType: (filterWorkType as any) || undefined,
    userId: filterUserId ? parseInt(filterUserId) : undefined,
    from: from || undefined,
    to: to || undefined,
  });
  // exportData is admin-only server-side; only fetch it for admins to avoid a 403.
  const { data: exportEntries = [] } = trpc.payrollHours.exportData.useQuery({
    from: from || undefined,
    to: to || undefined,
    userId: filterUserId ? parseInt(filterUserId) : undefined,
    status: (filterStatus as any) || undefined,
  }, { enabled: canManage });

  const approveMut = trpc.payrollHours.approve.useMutation({
    onSuccess: () => {
      toast.success("Entry approved.");
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkApproveMut = trpc.payrollHours.bulkApprove.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} entries approved.`);
      setSelectedIds(new Set());
      utils.payrollHours.listCompany.invalidate();
      utils.payrollHours.getSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markExportedMut = trpc.payrollHours.markExported.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} entries marked as exported.`);
      utils.payrollHours.listCompany.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const userMap = new Map(
    (allUsers as any[]).map((u) => [u.id, u])
  );

  const submittedSelectableIds = useMemo(() =>
    (entries as any[])
      .filter((e: any) => e.status === "submitted" && e.userId !== user!.id)
      .map((e: any) => e.id),
    [entries, user]
  );

  const allSelected = submittedSelectableIds.length > 0 &&
    submittedSelectableIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submittedSelectableIds));
    }
  }

  function handleExportCSV() {
    const csv = buildCSV(exportEntries as any[], userMap);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `payroll-hours-${from}-${to}-exported-${dateStr}.csv`);
  }

  const approvedIds = (entries as any[])
    .filter((e: any) => e.status === "approved")
    .map((e: any) => e.id);

  return (
    <AdminLayout title="Payroll Hours">
      <OverviewCards summary={summary} />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" className="mt-1 h-8 text-sm w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" className="mt-1 h-8 text-sm w-36" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="min-w-[130px]">
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
            <div className="min-w-[140px]">
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
                  {(allUsers as any[]).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                const w = weekBounds();
                setFrom(w.from); setTo(w.to);
              }}>This week</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
                setFilterStatus(""); setFilterWorkType(""); setFilterUserId("");
                setFrom(week.from); setTo(week.to);
              }}>Clear</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions — approval is admin-only */}
      {canManage && submittedSelectableIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            Select all submitted ({submittedSelectableIds.length})
          </label>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              className="h-8 text-xs text-green-700 bg-green-50 border border-green-300 hover:bg-green-100"
              disabled={bulkApproveMut.isPending}
              onClick={() => bulkApproveMut.mutate({ ids: Array.from(selectedIds) })}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Approve {selectedIds.size} selected
            </Button>
          )}
        </div>
      )}

      {/* Entry list */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading payroll hours…</p>}
        {!isLoading && (entries as any[]).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No payroll entries found.</p>
          </div>
        )}
        {(entries as any[]).map((entry: any) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            userMap={userMap}
            selected={selectedIds.has(entry.id)}
            onSelect={(checked) => {
              const next = new Set(selectedIds);
              if (checked) next.add(entry.id); else next.delete(entry.id);
              setSelectedIds(next);
            }}
            onApprove={(id) => approveMut.mutate({ id })}
            onReject={setRejectId}
            onNotes={setNotesEntry}
            currentUserId={user!.id}
            canManage={canManage}
          />
        ))}
      </div>

      {/* Footer */}
      {!isLoading && (entries as any[]).length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {(entries as any[]).length} entr{(entries as any[]).length !== 1 ? "ies" : "y"} ·{" "}
            Total: <strong>{fmtHours((entries as any[]).reduce((s: number, e: any) => s + e.totalMinutes, 0))}</strong>
          </span>
          {canManage && (
          <div className="flex gap-2">
            {approvedIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={markExportedMut.isPending}
                onClick={() => markExportedMut.mutate({ ids: approvedIds })}
              >
                Mark {approvedIds.length} Approved as Exported
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
          )}
        </div>
      )}

      {rejectId !== null && (
        <RejectDialog id={rejectId} onClose={() => setRejectId(null)} />
      )}
      {notesEntry !== null && (
        <AdminNotesDialog entry={notesEntry} onClose={() => setNotesEntry(null)} />
      )}
    </AdminLayout>
  );
}
