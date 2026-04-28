import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import {
  CheckSquare,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Wrench,
  Building2,
  Calendar,
  User,
  DollarSign,
  Package,
  ClipboardList,
  ExternalLink,
  Edit,
  CheckCheck,
  X,
  ReceiptText,
  Link2,
} from "lucide-react";
import { APPROVED_WORK_STATUSES } from "../../../../drizzle/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Status = typeof APPROVED_WORK_STATUSES[number];

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function typeLabel(t: string) {
  return t === "repair_order" ? "Repair Order" : "Job Order";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":          return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "ready_to_schedule": return "bg-accent/10 text-accent";
    case "scheduled":         return "bg-accent/10 text-accent";
    case "assigned":          return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "in_progress":       return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "parts_required":
    case "awaiting_parts":    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    case "parts_ordered":     return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "parts_received":    return "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300";
    case "completed":         return "status-pass";
    case "report_pending":    return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300";
    case "invoiced":          return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300";
    case "closed":            return "bg-muted text-muted-foreground";
    case "cancelled":         return "status-fail";
    default:                  return "bg-muted text-muted-foreground";
  }
}

function fmtAmount(amount: string | null | undefined): string {
  if (!amount) return "—";
  const n = parseFloat(amount);
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Sub-dialogs ───────────────────────────────────────────────────────────────

interface UpdateStatusDialogProps {
  open: boolean;
  onClose: () => void;
  currentStatus: Status;
  onUpdate: (status: Status) => void;
  isPending: boolean;
}
function UpdateStatusDialog({ open, onClose, currentStatus, onUpdate, isPending }: UpdateStatusDialogProps) {
  const [status, setStatus] = useState<Status>(currentStatus);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Update Status</DialogTitle></DialogHeader>
        <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPROVED_WORK_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onUpdate(status)} disabled={isPending || status === currentStatus}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LinkWorkOrderDialogProps {
  open: boolean;
  onClose: () => void;
  onLink: (workOrderId: number) => void;
  isPending: boolean;
}
function LinkWorkOrderDialog({ open, onClose, onLink, isPending }: LinkWorkOrderDialogProps) {
  const [woId, setWoId] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Link Work Order</DialogTitle></DialogHeader>
        <div>
          <Label>Work Order ID</Label>
          <Input
            className="mt-1"
            type="number"
            placeholder="Enter work order ID..."
            value={woId}
            onChange={(e) => setWoId(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onLink(parseInt(woId, 10))} disabled={isPending || !woId}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateWorkOrderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; priority: "low" | "medium" | "high" | "urgent"; estimatedHours?: number }) => void;
  isPending: boolean;
}
function CreateWorkOrderDialog({ open, onClose, onCreate, isPending }: CreateWorkOrderDialogProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [estimatedHours, setEstimatedHours] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input className="mt-1" placeholder="Work order title..." value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Est. Hours</Label>
              <Input className="mt-1" type="number" min="0" step="0.5" placeholder="0.0" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onCreate({ title, priority, estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined })} disabled={isPending || !title.trim()}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create Work Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditNotesDialogProps {
  open: boolean;
  onClose: () => void;
  officeNotes: string;
  technicianNotes: string;
  onSave: (officeNotes: string, technicianNotes: string) => void;
  isPending: boolean;
}
function EditNotesDialog({ open, onClose, officeNotes: init1, technicianNotes: init2, onSave, isPending }: EditNotesDialogProps) {
  const [officeNotes, setOfficeNotes] = useState(init1);
  const [techNotes, setTechNotes] = useState(init2);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit Notes</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Office Notes</Label>
            <Textarea className="mt-1" rows={4} value={officeNotes} onChange={(e) => setOfficeNotes(e.target.value)} />
          </div>
          <div>
            <Label>Technician Notes</Label>
            <Textarea className="mt-1" rows={3} value={techNotes} onChange={(e) => setTechNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onSave(officeNotes, techNotes)} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail page ───────────────────────────────────────────────────────────────

interface Props {
  id: number;
}

export default function ApprovedWorkDetail({ id }: Props) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showLinkWoDialog, setShowLinkWoDialog] = useState(false);
  const [showCreateWoDialog, setShowCreateWoDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduledDateStr, setScheduledDateStr] = useState("");
  const [partsStatus, setPartsStatus] = useState("");

  const { data: record, isLoading, error } = trpc.approvedWork.get.useQuery(
    { id },
    { enabled: !!id }
  );

  const invalidate = () => {
    utils.approvedWork.get.invalidate({ id });
    utils.approvedWork.list.invalidate();
  };

  const updateStatusMut = trpc.approvedWork.updateStatus.useMutation({ onSuccess: invalidate });
  const updateMut       = trpc.approvedWork.update.useMutation({ onSuccess: invalidate });
  const linkWoMut       = trpc.approvedWork.linkWorkOrder.useMutation({ onSuccess: invalidate });
  const createWoMut     = trpc.approvedWork.createWorkOrder.useMutation({ onSuccess: invalidate });
  const closeMut        = trpc.approvedWork.close.useMutation({
    onSuccess: () => { invalidate(); },
  });

  if (isLoading) {
    return (
      <AdminLayout title="">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !record) {
    return (
      <AdminLayout title="">
        <div className="py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Approved Work record not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/approved-work")}>
            Back to list
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const isClosed = record.status === "closed" || record.status === "cancelled";

  return (
    <AdminLayout title="">
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Back + Header */}
        <div>
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={() => navigate("/admin/approved-work")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Approved Work
          </Button>

          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${record.type === "repair_order" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>
                  {record.type === "repair_order" ? <Wrench className="h-3 w-3 mr-1" /> : null}
                  {typeLabel(record.type)}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(record.status)}`}>
                  {statusLabel(record.status)}
                </span>
              </div>
              <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
                <CheckSquare className="h-6 w-6 text-primary" />
                Approved Work #{record.id}
              </h1>
              {record.approvedScope && (
                <p className="text-muted-foreground mt-1 text-sm max-w-xl">{record.approvedScope}</p>
              )}
            </div>

            {/* Quick actions */}
            {!isClosed && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowStatusDialog(true)}>
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Update Status
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowNotesDialog(true)}>
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Edit Notes
                </Button>
                {record.status !== "completed" && record.status !== "report_pending" && (
                  <Button
                    size="sm"
                    onClick={() => updateStatusMut.mutate({ id: record.id, status: "completed" })}
                    disabled={updateStatusMut.isPending}
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    Mark Complete
                  </Button>
                )}
                {record.status === "completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatusMut.mutate({ id: record.id, status: "invoiced" })}
                    disabled={updateStatusMut.isPending}
                  >
                    <ReceiptText className="h-3.5 w-3.5 mr-1" />
                    Mark Invoiced
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => closeMut.mutate({ id: record.id })}
                  disabled={closeMut.isPending}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── Approval info ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="h-4 w-4" /> Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Approved Amount">{fmtAmount(record.approvedAmount)}</Row>
              <Row label="Approved At">{record.approvedAt ? formatDate(record.approvedAt) : "—"}</Row>
              <Row label="Approved By">{record.approvedByName ?? "—"}</Row>
              {record.approvedByEmail && <Row label="Email">{record.approvedByEmail}</Row>}
              <Row label="Source">{record.approvalSource ? statusLabel(record.approvalSource) : "—"}</Row>
            </CardContent>
          </Card>

          {/* ── Scheduling & assignment ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Scheduled Date">
                {record.scheduledDate ? formatDate(record.scheduledDate) : "—"}
              </Row>
              <Row label="Started At">{record.startedAt ? formatDate(record.startedAt) : "—"}</Row>
              <Row label="Completed At">{record.completedAt ? formatDate(record.completedAt) : "—"}</Row>
              <Row label="Closed At">{record.closedAt ? formatDate(record.closedAt) : "—"}</Row>
              <Row label="Assigned Techs">
                {(record.assignedTechs ?? []).length > 0
                  ? (record.assignedTechs as any[]).map((t: any) => t?.name ?? t?.id).join(", ")
                  : "—"}
              </Row>

              {!isClosed && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setScheduledDateStr(record.scheduledDate ? new Date(record.scheduledDate).toISOString().split("T")[0] : "");
                      setShowScheduleDialog(true);
                    }}
                  >
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    {record.scheduledDate ? "Reschedule" : "Schedule"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Site / Customer ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Site & Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Customer">{record.customerOrg?.name ?? "—"}</Row>
              <Row label="Site">{record.site?.name ?? "—"}</Row>
              {record.site?.buildingId && <Row label="Building ID">#{record.site.buildingId}</Row>}
              {record.site?.address && <Row label="Address">{record.site.address}</Row>}
            </CardContent>
          </Card>

          {/* ── Parts & Invoice ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Parts & Invoice
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Parts Status">{record.partsStatus ?? "—"}</Row>
              <Row label="Invoice Status">{record.invoiceStatus ?? "—"}</Row>

              {!isClosed && (
                <div className="pt-2 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Parts status..."
                      value={partsStatus}
                      onChange={(e) => setPartsStatus(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updateMut.mutate({ id: record.id, partsStatus: partsStatus || null });
                        setPartsStatus("");
                      }}
                      disabled={updateMut.isPending || !partsStatus}
                    >
                      Save
                    </Button>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {["parts_required", "awaiting_parts", "parts_ordered", "parts_received"].map(s => (
                      <button
                        key={s}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
                        onClick={() => updateStatusMut.mutate({ id: record.id, status: s as Status })}
                      >
                        → {statusLabel(s)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Linked records ── */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Linked Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Job</p>
                  {record.job ? (
                    <Link href={`/admin/jobs/${record.jobId}`}>
                      <span className="text-primary hover:underline flex items-center gap-1 cursor-pointer">
                        Job #{record.jobId}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </Link>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Quote</p>
                  {record.quoteId ? (
                    <Link href={`/admin/repair-quotes/${record.quoteId}`}>
                      <span className="text-primary hover:underline flex items-center gap-1 cursor-pointer">
                        Quote #{record.quoteId}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </Link>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Deficiency</p>
                  {record.deficiency ? (
                    <span className="text-sm">#{record.deficiencyId}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Work Order</p>
                  {record.workOrder ? (
                    <Link href={`/admin/jobs/${record.workOrder.jobId}`}>
                      <span className="text-primary hover:underline flex items-center gap-1 cursor-pointer">
                        {record.workOrder.workOrderNumber}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </Link>
                  ) : (
                    !isClosed && (
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setShowCreateWoDialog(true)}
                        >
                          <ClipboardList className="h-3 w-3 mr-1" />
                          Create WO
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setShowLinkWoDialog(true)}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          Link WO
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Notes ── */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {record.officeNotes ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Office</p>
                  <p className="whitespace-pre-wrap">{record.officeNotes}</p>
                </div>
              ) : null}
              {record.technicianNotes ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Technician</p>
                  <p className="whitespace-pre-wrap">{record.technicianNotes}</p>
                </div>
              ) : null}
              {!record.officeNotes && !record.technicianNotes && (
                <p className="text-muted-foreground">No notes yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Dialogs */}
        <UpdateStatusDialog
          open={showStatusDialog}
          onClose={() => setShowStatusDialog(false)}
          currentStatus={record.status as Status}
          onUpdate={(s) => {
            updateStatusMut.mutate({ id: record.id, status: s });
            setShowStatusDialog(false);
          }}
          isPending={updateStatusMut.isPending}
        />

        <LinkWorkOrderDialog
          open={showLinkWoDialog}
          onClose={() => setShowLinkWoDialog(false)}
          onLink={(woId) => {
            linkWoMut.mutate({ id: record.id, workOrderId: woId });
            setShowLinkWoDialog(false);
          }}
          isPending={linkWoMut.isPending}
        />

        <CreateWorkOrderDialog
          open={showCreateWoDialog}
          onClose={() => setShowCreateWoDialog(false)}
          onCreate={(data) => {
            createWoMut.mutate({ id: record.id, ...data });
            setShowCreateWoDialog(false);
          }}
          isPending={createWoMut.isPending}
        />

        <EditNotesDialog
          open={showNotesDialog}
          onClose={() => setShowNotesDialog(false)}
          officeNotes={record.officeNotes ?? ""}
          technicianNotes={record.technicianNotes ?? ""}
          onSave={(on, tn) => {
            updateMut.mutate({ id: record.id, officeNotes: on, technicianNotes: tn });
            setShowNotesDialog(false);
          }}
          isPending={updateMut.isPending}
        />

        {/* Schedule dialog */}
        <Dialog open={showScheduleDialog} onOpenChange={(v) => { if (!v) setShowScheduleDialog(false); }}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader><DialogTitle>Schedule</DialogTitle></DialogHeader>
            <div>
              <Label>Scheduled Date</Label>
              <Input
                className="mt-1"
                type="date"
                value={scheduledDateStr}
                onChange={(e) => setScheduledDateStr(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const date = scheduledDateStr ? new Date(scheduledDateStr) : null;
                  updateMut.mutate({
                    id: record.id,
                    scheduledDate: date,
                    ...(record.status === "approved" || record.status === "ready_to_schedule"
                      ? {}
                      : {}),
                  });
                  if (record.status === "approved" || record.status === "ready_to_schedule" || record.status === "assigned") {
                    updateStatusMut.mutate({ id: record.id, status: "scheduled" });
                  }
                  setShowScheduleDialog(false);
                }}
                disabled={updateMut.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

// ── Simple label/value row ────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
