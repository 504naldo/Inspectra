import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  AlertTriangle,
  User,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const LABOUR_TYPE_LABELS: Record<string, string> = {
  inspection: "Inspection",
  repair: "Repair",
  service_call: "Service Call",
  travel: "Travel",
  admin: "Admin",
  parts_run: "Parts Run",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  invoiced: "bg-blue-100 text-blue-700",
};

function fmtDuration(minutes: number): string {
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

// ─── Reject dialog ────────────────────────────────────────────────────────────

function RejectDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const rejectMut = trpc.timeTracking.reject.useMutation({
    onSuccess: () => {
      toast.success("Entry rejected.");
      utils.timeTracking.listCompany.invalidate();
      utils.timeTracking.getSummary.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reject Time Entry</DialogTitle></DialogHeader>
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

// ─── Overview cards ───────────────────────────────────────────────────────────

function OverviewCards({
  summary,
  labourRate,
}: {
  summary: { submittedMinutes: number; approvedMinutes: number; pendingCount: number; rejectedCount: number } | null | undefined;
  labourRate: number;
}) {
  if (!summary) return null;
  const approvedHours = summary.approvedMinutes / 60;
  const labourCost = approvedHours * labourRate;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <Card><CardContent className="pt-4 pb-3">
        <div className="text-2xl font-bold text-yellow-600">{fmtDuration(summary.submittedMinutes)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Submitted this week</div>
      </CardContent></Card>
      <Card><CardContent className="pt-4 pb-3">
        <div className="text-2xl font-bold text-green-600">{fmtDuration(summary.approvedMinutes)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Approved this week</div>
      </CardContent></Card>
      <Card><CardContent className="pt-4 pb-3">
        <div className="text-2xl font-bold text-orange-600">{summary.pendingCount}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Pending approval</div>
      </CardContent></Card>
      {labourRate > 0 ? (
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-primary">${labourCost.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Est. labour cost (approved)</div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-red-600">{summary.rejectedCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Rejected entries</div>
        </CardContent></Card>
      )}
    </div>
  );
}

// ─── Time entry row ───────────────────────────────────────────────────────────

function EntryRow({
  entry,
  userMap,
  onApprove,
  onReject,
}: {
  entry: any;
  userMap: Map<number, string>;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  return (
    <div className="border rounded-lg bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.status] ?? "bg-muted"}`}>
              {entry.status}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {LABOUR_TYPE_LABELS[entry.labourType] ?? entry.labourType}
            </span>
            <span className="text-sm font-semibold tabular-nums">{fmtDuration(entry.durationMinutes)}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {userMap.get(entry.userId) ?? `User #${entry.userId}`}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {String(entry.entryDate).slice(0, 10)}
            </span>
            {entry.jobId && (
              <Link href={`/admin/jobs/${entry.jobId}`}>
                <span className="text-primary hover:underline flex items-center gap-0.5">
                  Job #{entry.jobId} <ChevronRight className="h-3 w-3" />
                </span>
              </Link>
            )}
            {entry.workOrderId && (
              <Link href={`/admin/work-orders`}>
                <span className="text-primary hover:underline">WO #{entry.workOrderId}</span>
              </Link>
            )}
            {entry.approvedWorkId && (
              <Link href={`/admin/approved-work/${entry.approvedWorkId}`}>
                <span className="text-primary hover:underline">AW #{entry.approvedWorkId}</span>
              </Link>
            )}
          </div>
          {entry.description && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{entry.description}</p>
          )}
          {entry.internalNotes && entry.status === "rejected" && (
            <p className="text-xs text-red-600 mt-0.5">{entry.internalNotes}</p>
          )}
        </div>
        {entry.status === "submitted" && (
          <div className="flex gap-1.5 shrink-0">
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
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Timesheets() {
  const { user } = useAuth();
  const [rejectId, setRejectId] = useState<number | null>(null);

  const week = weekBounds();
  const [from, setFrom] = useState(week.from);
  const [to, setTo] = useState(week.to);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterLabourType, setFilterLabourType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  const utils = trpc.useUtils();

  const { data: summary } = trpc.timeTracking.getSummary.useQuery();
  const { data: settings } = trpc.companySettings.get.useQuery();
  const { data: technicians = [] } = trpc.user.listTechnicians.useQuery(
    { companyId: user!.companyId! },
    { enabled: !!user?.companyId }
  );
  const { data: entries = [], isLoading } = trpc.timeTracking.listCompany.useQuery({
    status: (filterStatus as any) || undefined,
    labourType: (filterLabourType as any) || undefined,
    userId: filterUserId ? parseInt(filterUserId) : undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const approveMut = trpc.timeTracking.approve.useMutation({
    onSuccess: () => {
      toast.success("Entry approved.");
      utils.timeTracking.listCompany.invalidate();
      utils.timeTracking.getSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const labourRate = parseFloat((settings as any)?.technicianLabourRate ?? "75") || 75;
  const userMap = new Map((technicians as any[]).map((u) => [u.id, u.name ?? `User #${u.id}`]));

  return (
    <AdminLayout title="Timesheets">
      <OverviewCards summary={summary} labourRate={labourRate} />

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
                  <SelectItem value="invoiced">Invoiced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[130px]">
              <Label className="text-xs text-muted-foreground">Labour Type</Label>
              <Select value={filterLabourType || "_all"} onValueChange={(v) => setFilterLabourType(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All types</SelectItem>
                  {Object.entries(LABOUR_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Technician</Label>
              <Select value={filterUserId || "_all"} onValueChange={(v) => setFilterUserId(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All technicians</SelectItem>
                  {(technicians as any[]).map((u) => (
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
                setFilterStatus(""); setFilterLabourType(""); setFilterUserId("");
                setFrom(week.from); setTo(week.to);
              }}>Clear</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading time entries…</p>}
        {!isLoading && (entries as any[]).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No time entries found.</p>
          </div>
        )}
        {(entries as any[]).map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            userMap={userMap}
            onApprove={(id) => approveMut.mutate({ id })}
            onReject={setRejectId}
          />
        ))}
      </div>

      {!isLoading && (entries as any[]).length > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{(entries as any[]).length} entr{(entries as any[]).length !== 1 ? "ies" : "y"}</span>
          <span>
            Total: <strong>{fmtDuration((entries as any[]).reduce((s: number, e: any) => s + e.durationMinutes, 0))}</strong>
          </span>
        </div>
      )}

      {rejectId !== null && (
        <RejectDialog id={rejectId} onClose={() => setRejectId(null)} />
      )}
    </AdminLayout>
  );
}
