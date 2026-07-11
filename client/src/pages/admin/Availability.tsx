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
  CalendarOff,
  CheckCircle2,
  XCircle,
  User,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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
  requested: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  cancelled: "bg-muted text-muted-foreground",
};

const TYPE_COLORS: Record<string, string> = {
  vacation: "bg-blue-100 text-blue-700",
  sick: "bg-orange-100 text-orange-700",
  personal: "bg-purple-100 text-purple-700",
  training: "bg-cyan-100 text-cyan-700",
  stat_holiday: "bg-green-100 text-green-700",
  unavailable: "bg-red-100 text-red-700",
  available_override: "bg-emerald-100 text-emerald-700",
  other: "bg-muted text-muted-foreground",
};

const BLOCK_TYPES = Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekBounds() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    from: mon.toISOString().slice(0, 10),
    to: sun.toISOString().slice(0, 10),
  };
}

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function fmtDateRange(start: any, end: any): string {
  const s = String(start).slice(0, 10);
  const e = String(end).slice(0, 10);
  return s === e ? s : `${s} – ${e}`;
}

// ─── Overview cards ───────────────────────────────────────────────────────────

function OverviewCards({ blocks }: { blocks: any[] }) {
  const today = todayStr();
  const week = weekBounds();

  const pending = blocks.filter(b => b.status === "requested").length;
  const approvedThisWeek = blocks.filter(b =>
    b.status === "approved" &&
    String(b.startDate).slice(0, 10) <= week.to &&
    String(b.endDate).slice(0, 10) >= week.from,
  ).length;
  const unavailableToday = blocks.filter(b =>
    b.status === "approved" &&
    String(b.startDate).slice(0, 10) <= today &&
    String(b.endDate).slice(0, 10) >= today &&
    b.type !== "available_override",
  ).length;
  const trainingDays = blocks.filter(b =>
    b.status === "approved" && b.type === "training",
  ).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <Card><CardContent className="pt-3 pb-2">
        <div className={`text-xl font-bold ${pending > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>{pending}</div>
        <div className="text-xs text-muted-foreground">Pending requests</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-green-600">{approvedThisWeek}</div>
        <div className="text-xs text-muted-foreground">Approved this week</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className={`text-xl font-bold ${unavailableToday > 0 ? "text-red-600" : "text-muted-foreground"}`}>{unavailableToday}</div>
        <div className="text-xs text-muted-foreground">Unavailable today</div>
      </CardContent></Card>
      <Card><CardContent className="pt-3 pb-2">
        <div className="text-xl font-bold text-cyan-600">{trainingDays}</div>
        <div className="text-xs text-muted-foreground">Training blocks</div>
      </CardContent></Card>
    </div>
  );
}

// ─── Block row ────────────────────────────────────────────────────────────────

function BlockRow({
  block,
  currentUserId,
  onApprove,
  onReject,
  onCancel,
}: {
  block: any;
  currentUserId: number;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onCancel: (id: number) => void;
}) {
  const isSelf = block.userId === currentUserId;
  const canReview = block.status === "requested" && !isSelf;
  const canCancel = block.status === "requested";

  return (
    <div className="flex flex-wrap items-start gap-2 px-4 py-3 border-b last:border-0 hover:bg-muted/20">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[block.status]}`}>
            {block.status}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${TYPE_COLORS[block.type] ?? "bg-muted"}`}>
            {TYPE_LABELS[block.type] ?? block.type}
          </span>
          <span className="text-sm font-medium">{fmtDateRange(block.startDate, block.endDate)}</span>
          {!block.allDay && block.startTime && block.endTime && (
            <span className="text-xs text-muted-foreground">{block.startTime}–{block.endTime}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium">{block.userName ?? `User #${block.userId}`}</span>
          <span className="text-xs text-muted-foreground">({block.userRole})</span>
        </div>
        {block.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{block.reason}</p>}
        {block.adminNotes && <p className="text-xs text-blue-600 truncate">Admin: {block.adminNotes}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        {canReview && (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-700 border-green-300" onClick={() => onApprove(block.id)}>
              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-300" onClick={() => onReject(block.id)}>
              <XCircle className="h-3 w-3 mr-0.5" /> Reject
            </Button>
          </>
        )}
        {isSelf && block.status === "requested" && (
          <span className="text-xs text-muted-foreground italic self-center">Your request</span>
        )}
        {canCancel && !isSelf && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onCancel(block.id)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Add block dialog ─────────────────────────────────────────────────────────

function AddBlockDialog({
  users,
  onClose,
  onSuccess,
}: {
  users: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<string>("vacation");
  const [status, setStatus] = useState<string>("approved");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  const utils = trpc.useUtils();
  const createMut = trpc.availability.createAdminBlock.useMutation({
    onSuccess: () => {
      toast.success("Block created.");
      utils.availability.listCompanyAvailability.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function submit() {
    if (!userId) { toast.error("Select an employee."); return; }
    if (startDate > endDate) { toast.error("Start must be before end."); return; }
    createMut.mutate({
      userId: parseInt(userId),
      type: type as any,
      status: status as any,
      startDate,
      endDate,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      reason,
      adminNotes: adminNotes || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Availability Block</DialogTitle>
          <DialogDescription>Create a block for any employee.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" className="mt-1 h-8 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" className="mt-1 h-8 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="allday-admin" checked={allDay} onCheckedChange={(v) => setAllDay(!!v)} />
            <Label htmlFor="allday-admin" className="text-sm cursor-pointer">All day</Label>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Start Time</Label>
                <Input type="time" className="mt-1 h-8 text-sm" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">End Time</Label>
                <Input type="time" className="mt-1 h-8 text-sm" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs">Reason</Label>
            <Input className="mt-1 h-8 text-sm" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label className="text-xs">Admin Notes</Label>
            <Textarea rows={2} className="mt-1 text-sm" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Internal notes" />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={createMut.isPending} onClick={submit}>Create Block</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  blockId,
  onClose,
}: {
  blockId: number;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const rejectMut = trpc.availability.rejectTimeOffRequest.useMutation({
    onSuccess: () => {
      toast.success("Request rejected.");
      utils.availability.listCompanyAvailability.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject Request</DialogTitle>
          <DialogDescription>The employee will be notified.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={rejectMut.isPending} onClick={() => rejectMut.mutate({ id: blockId, reason: reason || undefined })}>
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "This Week", bounds: weekBounds },
  { label: "This Month", bounds: monthBounds },
];

export default function AdminAvailability() {
  const { user } = useAuth();

  const defaultBounds = weekBounds();
  const [from, setFrom] = useState(defaultBounds.from);
  const [to, setTo] = useState(defaultBounds.to);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterRole, setFilterRole] = useState("");

  const [showAddBlock, setShowAddBlock] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  const utils = trpc.useUtils();

  const { data: blocks = [], isLoading } = trpc.availability.listCompanyAvailability.useQuery({
    status: (filterStatus as any) || undefined,
    type: (filterType as any) || undefined,
    userId: filterUserId ? parseInt(filterUserId) : undefined,
    from,
    to,
  });

  const { data: allUsersRaw = [] } = trpc.user.listUsers.useQuery(
    { companyId: user!.companyId! },
    { enabled: !!user?.companyId },
  );

  const allUsers = allUsersRaw as any[];

  const approveMut = trpc.availability.approveTimeOffRequest.useMutation({
    onSuccess: () => {
      toast.success("Approved.");
      utils.availability.listCompanyAvailability.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMut = trpc.availability.cancelTimeOffRequest.useMutation({
    onSuccess: () => {
      toast.success("Cancelled.");
      utils.availability.listCompanyAvailability.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredBlocks = useMemo(() => {
    let list = blocks as any[];
    if (filterRole) list = list.filter(b => b.userRole === filterRole);
    if (showPendingOnly) list = list.filter(b => b.status === "requested");
    return list;
  }, [blocks, filterRole, showPendingOnly]);

  const pendingCount = useMemo(() => (blocks as any[]).filter(b => b.status === "requested").length, [blocks]);

  return (
    <AdminLayout title="Availability">
      {/* Overview */}
      <OverviewCards blocks={blocks as any[]} />

      {/* Filter row */}
      <Card className="mb-4">
        <CardContent className="pt-3 pb-3">
          <div className="flex flex-wrap gap-2 items-end">
            {/* Presets */}
            <div className="flex gap-1.5">
              {PRESETS.map(p => {
                const b = p.bounds();
                const active = from === b.from && to === b.to;
                return (
                  <Button key={p.label} size="sm" variant={active ? "default" : "outline"} className="h-8 text-xs"
                    onClick={() => { setFrom(b.from); setTo(b.to); }}>
                    {p.label}
                  </Button>
                );
              })}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" className="mt-0.5 h-8 text-sm w-32" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" className="mt-0.5 h-8 text-sm w-32" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="min-w-[100px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus || "_all"} onValueChange={v => setFilterStatus(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[100px]">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={filterType || "_all"} onValueChange={v => setFilterType(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All types</SelectItem>
                  {BLOCK_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[100px]">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={filterRole || "_all"} onValueChange={v => setFilterRole(v === "_all" ? "" : v)}>
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
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={filterUserId || "_all"} onValueChange={v => setFilterUserId(v === "_all" ? "" : v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All employees</SelectItem>
                  {allUsers.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
              setFilterStatus(""); setFilterType(""); setFilterUserId(""); setFilterRole("");
            }}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {pendingCount > 0 && (
          <Button
            size="sm"
            variant={showPendingOnly ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setShowPendingOnly(v => !v)}
          >
            {showPendingOnly ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            {pendingCount} pending
          </Button>
        )}
        <Button size="sm" className="h-8 text-xs ml-auto" onClick={() => setShowAddBlock(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Block
        </Button>
      </div>

      {/* List */}
      <Card>
        {isLoading && <div className="text-sm text-muted-foreground p-4">Loading…</div>}
        {!isLoading && filteredBlocks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No availability blocks found for this period.</p>
          </div>
        )}
        {filteredBlocks.map((block: any) => (
          <BlockRow
            key={block.id}
            block={block}
            currentUserId={user!.id}
            onApprove={(id) => approveMut.mutate({ id })}
            onReject={setRejectId}
            onCancel={(id) => cancelMut.mutate({ id })}
          />
        ))}
      </Card>

      {/* Dialogs */}
      {showAddBlock && (
        <AddBlockDialog
          users={allUsers}
          onClose={() => setShowAddBlock(false)}
          onSuccess={() => utils.availability.listCompanyAvailability.invalidate()}
        />
      )}
      {rejectId !== null && (
        <RejectDialog blockId={rejectId} onClose={() => setRejectId(null)} />
      )}
    </AdminLayout>
  );
}
