import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ChevronRight,
  Plus,
  Calendar,
  User,
  Building2,
  DollarSign,
  Wrench,
  Package,
} from "lucide-react";

// ── Status config ─────────────────────────────────────────────────────────────

type StatusFilter =
  | "all"
  | "approved"
  | "ready_to_schedule"
  | "scheduled"
  | "assigned"
  | "in_progress"
  | "parts_required"
  | "awaiting_parts"
  | "parts_ordered"
  | "parts_received"
  | "completed"
  | "report_pending"
  | "invoiced"
  | "closed"
  | "cancelled";

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all",              label: "All" },
  { value: "approved",         label: "Approved" },
  { value: "ready_to_schedule", label: "Ready to Schedule" },
  { value: "scheduled",        label: "Scheduled" },
  { value: "assigned",         label: "Assigned" },
  { value: "in_progress",      label: "In Progress" },
  { value: "awaiting_parts",   label: "Awaiting Parts" },
  { value: "completed",        label: "Completed" },
  { value: "closed",           label: "Closed" },
];

const STATUS_SUMMARY = [
  { value: "approved",        label: "Approved" },
  { value: "in_progress",     label: "In Progress" },
  { value: "awaiting_parts",  label: "Awaiting Parts" },
  { value: "completed",       label: "Completed" },
] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":          return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "ready_to_schedule": return "bg-accent/10 text-accent";
    case "scheduled":         return "bg-accent/10 text-accent";
    case "assigned":          return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "in_progress":       return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "parts_required":    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
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

function typeBadgeClass(type: string): string {
  return type === "repair_order"
    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
    : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
}

function typeLabel(type: string): string {
  return type === "repair_order" ? "Repair Order" : "Job Order";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtAmount(amount: string | null | undefined): string | null {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (isNaN(n)) return null;
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Create dialog ─────────────────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: number;
  onCreated: (id: number) => void;
}

function CreateApprovedWorkDialog({ open, onClose, companyId, onCreated }: CreateDialogProps) {
  const utils = trpc.useUtils();
  const [type, setType] = useState<"job_order" | "repair_order">("repair_order");
  const [approvedScope, setApprovedScope] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [approvedByName, setApprovedByName] = useState("");
  const [approvalSource, setApprovalSource] = useState<string>("email");
  const [officeNotes, setOfficeNotes] = useState("");

  const createMutation = trpc.approvedWork.create.useMutation({
    onSuccess: (record) => {
      utils.approvedWork.list.invalidate();
      onCreated(record.id);
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setType("repair_order");
    setApprovedScope("");
    setApprovedAmount("");
    setApprovedByName("");
    setApprovalSource("email");
    setOfficeNotes("");
  };

  const handleSubmit = () => {
    createMutation.mutate({
      companyId,
      type,
      approvedScope: approvedScope || undefined,
      approvedAmount: approvedAmount ? parseFloat(approvedAmount) : undefined,
      approvedByName: approvedByName || undefined,
      approvalSource: approvalSource as any,
      officeNotes: officeNotes || undefined,
      approvedAt: new Date(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Approved Work</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="repair_order">Repair Order</SelectItem>
                <SelectItem value="job_order">Job Order</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Approved Scope</Label>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder="Describe the approved work scope..."
              value={approvedScope}
              onChange={(e) => setApprovedScope(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Approved Amount ($)</Label>
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Approval Source</Label>
              <Select value={approvalSource} onValueChange={setApprovalSource}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="signed_pdf">Signed PDF</SelectItem>
                  <SelectItem value="in_person">In Person</SelectItem>
                  <SelectItem value="portal">Portal</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Approved By (Name)</Label>
            <Input
              className="mt-1"
              placeholder="Contact name..."
              value={approvedByName}
              onChange={(e) => setApprovedByName(e.target.value)}
            />
          </div>

          <div>
            <Label>Office Notes</Label>
            <Textarea
              className="mt-1"
              rows={2}
              placeholder="Internal notes..."
              value={officeNotes}
              onChange={(e) => setOfficeNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApprovedWork() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: records, isLoading } = trpc.approvedWork.list.useQuery(
    {
      companyId: user!.companyId!,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { enabled: !!user?.companyId }
  );

  // For summary counts we always fetch all (unfiltered)
  const { data: allRecords } = trpc.approvedWork.list.useQuery(
    { companyId: user!.companyId! },
    { enabled: !!user?.companyId }
  );

  return (
    <AdminLayout title="">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CheckSquare className="h-6 w-6" />
              Approved Work
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track authorized work from approval through close-out
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Approved Work
          </Button>
        </div>

        {/* Summary stat cards */}
        {allRecords && allRecords.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUS_SUMMARY.map(({ value, label }) => {
              const count = allRecords.filter(r => r.status === value).length;
              return (
                <Card
                  key={value}
                  className="p-3 cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
                  onClick={() => setStatusFilter(value as StatusFilter)}
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold mt-0.5">{count}</p>
                </Card>
              );
            })}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
              {allRecords && tab.value !== "all" && (
                <span className="ml-1.5 opacity-70">
                  ({allRecords.filter(r => r.status === tab.value).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Records list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading
                ? "Loading…"
                : `${records?.length ?? 0} record${records?.length !== 1 ? "s" : ""}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !records || records.length === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">
                  {statusFilter === "all"
                    ? "No approved work records yet."
                    : `No records with status "${statusLabel(statusFilter)}".`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create First Record
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {records.map((r) => (
                  <Link key={r.id} href={`/admin/approved-work/${r.id}`}>
                    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        {/* Row 1: badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${typeBadgeClass(r.type)}`}>
                            {r.type === "repair_order" ? <Wrench className="h-2.5 w-2.5 mr-1" /> : null}
                            {typeLabel(r.type)}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(r.status)}`}>
                            {statusLabel(r.status)}
                          </span>
                          {r.workOrderNumber && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {r.workOrderNumber}
                            </span>
                          )}
                        </div>

                        {/* Row 2: scope */}
                        {r.approvedScope && (
                          <p className="mt-1 text-sm font-medium truncate text-foreground">
                            {r.approvedScope}
                          </p>
                        )}

                        {/* Row 3: site / customer */}
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          {r.customerOrgName && (
                            <span className="flex items-center gap-0.5">
                              <Building2 className="h-3 w-3" />
                              {r.customerOrgName}
                            </span>
                          )}
                          {r.siteName && (
                            <span>
                              {r.buildingId ? `#${r.buildingId} — ` : ""}{r.siteName}
                            </span>
                          )}
                        </div>

                        {/* Row 4: amounts, dates, techs */}
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          {r.approvedAmount && (
                            <span className="flex items-center gap-0.5 font-mono">
                              <DollarSign className="h-3 w-3" />
                              {fmtAmount(r.approvedAmount)}
                            </span>
                          )}
                          {r.scheduledDate && (
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-3 w-3" />
                              {formatDate(r.scheduledDate)}
                            </span>
                          )}
                          {r.assignedTechNames && r.assignedTechNames.length > 0 && (
                            <span className="flex items-center gap-0.5">
                              <User className="h-3 w-3" />
                              {r.assignedTechNames.join(", ")}
                            </span>
                          )}
                          {(r.partsStatus || r.status.startsWith("parts") || r.status === "awaiting_parts") && (
                            <span className="flex items-center gap-0.5">
                              <Package className="h-3 w-3" />
                              {r.partsStatus ?? "parts pending"}
                            </span>
                          )}
                          {r.approvedAt && (
                            <span className="text-muted-foreground/70">
                              Approved {formatDate(r.approvedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create dialog */}
      {user?.companyId && (
        <CreateApprovedWorkDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companyId={user.companyId}
          onCreated={(id) => navigate(`/admin/approved-work/${id}`)}
        />
      )}
    </AdminLayout>
  );
}
