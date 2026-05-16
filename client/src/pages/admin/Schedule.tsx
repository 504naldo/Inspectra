import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import AdminLayout from "@/components/AdminLayout";
import { DispatchBoard } from "./DispatchBoard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Upload,
  Plus,
  Briefcase,
  CheckCircle2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const STATUS_LABELS: Record<string, string> = {
  not_scheduled: "Not Scheduled",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  report_pending: "Report Pending",
  rescheduled: "Rescheduled",
  overdue: "Overdue",
};

const STATUS_COLORS: Record<string, string> = {
  not_scheduled: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  report_pending: "bg-purple-100 text-purple-700",
  rescheduled: "bg-orange-100 text-orange-700",
  overdue: "bg-red-100 text-red-700",
};

const RL_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  draft_needed: "Draft Needed",
  drafted: "Drafted",
  sent: "Sent",
  follow_up_needed: "Follow-Up Needed",
  completed: "Completed",
  closed: "Closed",
};

const RL_STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  draft_needed: "bg-orange-100 text-orange-700",
  drafted: "bg-yellow-100 text-yellow-700",
  sent: "bg-blue-100 text-blue-700",
  follow_up_needed: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-400",
};

const REPORT_STATUS_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-500",
  pending: "bg-yellow-100 text-yellow-700",
  generated: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
};

const FREQ_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
  other: "Other",
};

function calendarStatusColor(status: string) {
  if (status === "completed" || status === "finalized") return "bg-[var(--success)]";
  if (status === "in_progress") return "bg-accent";
  if (status === "scheduled") return "bg-[var(--warning)]";
  return "bg-gray-400";
}

function monthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminSchedule() {
  const { user } = useAuth();
  const companyId = (user as any)?.companyId ?? 1;
  const utils = trpc.useUtils();

  return (
    <AdminLayout>
      <Tabs defaultValue="dispatch">
        <TabsList className="mb-4">
          <TabsTrigger value="dispatch">Dispatch Board</TabsTrigger>
          <TabsTrigger value="tracking">Monthly Tracking</TabsTrigger>
          <TabsTrigger value="repair">Repair Letter Tracking</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="schedules">Service Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="dispatch">
          <DispatchBoard companyId={companyId} />
        </TabsContent>

        <TabsContent value="tracking">
          <MonthlyTrackingTab companyId={companyId} utils={utils} />
        </TabsContent>

        <TabsContent value="repair">
          <RepairLetterTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="schedules">
          <ServiceSchedulesTab companyId={companyId} utils={utils} />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

// ── Monthly Tracking Tab ───────────────────────────────────────────────────────

function MonthlyTrackingTab({ companyId, utils }: { companyId: number; utils: any }) {
  const today = new Date();
  const [trackingMonth, setTrackingMonth] = useState(monthStr(today));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [jobModalRow, setJobModalRow] = useState<any | null>(null);

  const { data: trackingRows, isLoading, refetch } = trpc.serviceSchedule.listTracking.useQuery(
    {
      companyId,
      trackingMonth,
      status: statusFilter !== "all" ? (statusFilter as any) : undefined,
      search: search.trim() || undefined,
    },
    { enabled: !!companyId }
  );

  const { data: technicians = [] } = trpc.jobAssignment.listTechnicians.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const updateTracking = trpc.serviceSchedule.updateTracking.useMutation({
    onSuccess: () => {
      refetch();
      setEditingRow(null);
    },
  });

  const createJob = trpc.serviceSchedule.createJobFromTracking.useMutation({
    onSuccess: (res) => {
      refetch();
      setJobModalRow(null);
      toast.success(`Job ${res.jobNumber} created`, {
        action: { label: "Open", onClick: () => window.location.assign(`/admin/jobs/${res.jobId}`) },
      });
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to create job");
    },
  });

  function prevMonth() {
    const [y, m] = trackingMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setTrackingMonth(monthStr(d));
  }
  function nextMonth() {
    const [y, m] = trackingMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setTrackingMonth(monthStr(d));
  }

  function openEdit(row: any) {
    setEditingRow(row.id);
    setEditStatus(row.status);
    setEditNotes(row.notes ?? "");
  }

  function saveEdit(id: number) {
    updateTracking.mutate({
      id,
      status: editStatus as any,
      notes: editNotes || undefined,
    });
  }

  const rows = trackingRows ?? [];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm w-24 text-center">{trackingMonth}</span>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search building / service…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs w-52"
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left text-gray-500 font-semibold">
              <th className="px-3 py-2">Bldg ID</th>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Service Type</th>
              <th className="px-3 py-2">Target Date</th>
              <th className="px-3 py-2">Scheduled Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Job #</th>
              <th className="px-3 py-2">Report</th>
              <th className="px-3 py-2">Deficiencies</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={12} className="text-center py-8 text-gray-400">Loading…</td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-8 text-gray-400">
                  No tracking rows for {trackingMonth}.
                  {" "}<button className="text-blue-600 underline" onClick={() => setImportOpen(true)}>Import a spreadsheet</button>
                </td>
              </tr>
            )}
            {rows.map((row: any) => (
              <tr key={row.id} className="border-b hover:bg-gray-50 transition-colors align-top">
                <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{row.buildingId ?? "—"}</td>
                <td className="px-3 py-2 max-w-[140px]">
                  <span className="truncate block font-medium">{row.siteName}</span>
                </td>
                <td className="px-3 py-2 max-w-[120px] text-gray-500 truncate">{row.customerName}</td>
                <td className="px-3 py-2">{row.serviceType}</td>
                <td className="px-3 py-2 text-gray-500">
                  {row.targetDate ? new Date(row.targetDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {formatDate(row.scheduledDate)}
                </td>
                <td className="px-3 py-2">
                  {editingRow === row.id ? (
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger className="h-6 text-[11px] w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <button onClick={() => openEdit(row)}>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer ${STATUS_COLORS[row.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.linkedJob ? (
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/admin/jobs/${row.linkedJob.id}`}>
                        <span className="text-blue-600 underline">{row.linkedJob.jobNumber}</span>
                      </Link>
                      <span className={`inline-block px-1.5 py-0 rounded-full text-[10px] font-medium ${STATUS_COLORS[row.linkedJob.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[row.linkedJob.status] ?? row.linkedJob.status}
                      </span>
                    </div>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${REPORT_STATUS_COLORS[row.reportStatus] ?? "bg-gray-100 text-gray-500"}`}>
                    {row.reportStatus ?? "none"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {(row.deficiencyCount ?? 0) > 0 ? (
                    <span className="text-red-600 font-semibold">{row.deficiencyCount}</span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 max-w-[160px]">
                  {editingRow === row.id ? (
                    <Input
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="h-6 text-[11px]"
                    />
                  ) : (
                    <span className="text-gray-500 truncate block">{row.notes ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {editingRow === row.id ? (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => saveEdit(row.id)} disabled={updateTracking.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setEditingRow(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      {!row.linkedJobId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setJobModalRow(row)}
                          title="Create Job"
                        >
                          <Briefcase className="h-3 w-3 mr-1" />
                          Create Job
                        </Button>
                      ) : (
                        <Link href={`/admin/jobs/${row.linkedJob?.id ?? row.linkedJobId}`}>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]">
                            Open Job
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400">{rows.length} row{rows.length !== 1 ? "s" : ""} — click a status badge to edit inline</div>

      {importOpen && (
        <ImportDialog
          companyId={companyId}
          defaultMonth={trackingMonth}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); refetch(); }}
        />
      )}

      {jobModalRow && (
        <CreateJobModal
          row={jobModalRow}
          technicians={technicians}
          isPending={createJob.isPending}
          onClose={() => setJobModalRow(null)}
          onSubmit={(fields) => createJob.mutate({ trackingId: jobModalRow.id, ...fields })}
        />
      )}
    </div>
  );
}

// ── Create Job Modal ───────────────────────────────────────────────────────────

function CreateJobModal({
  row,
  technicians,
  isPending,
  onClose,
  onSubmit,
}: {
  row: any;
  technicians: any[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (fields: {
    title?: string;
    scheduledDate?: string;
    leadTechnicianId?: number;
    assignedTechnicianIds?: number[];
    notes?: string;
  }) => void;
}) {
  const defaultTitle = `${row.serviceType} — ${row.siteName}`;
  const defaultDate = row.scheduledDate
    ? new Date(row.scheduledDate).toISOString().slice(0, 10)
    : row.targetDate
    ? new Date(row.targetDate).toISOString().slice(0, 10)
    : "";

  const [title, setTitle] = useState(defaultTitle);
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [leadTechId, setLeadTechId] = useState<string>("");
  const [notes, setNotes] = useState(row.notes ?? "");

  function handleSubmit() {
    onSubmit({
      title: title.trim() || undefined,
      scheduledDate: scheduledDate || undefined,
      leadTechnicianId: leadTechId ? Number(leadTechId) : undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Job from Schedule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-xs text-gray-500">
            <span className="font-medium">{row.siteName}</span> · {row.serviceType}
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-title" className="text-xs">Job Title</Label>
            <Input
              id="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-date" className="text-xs">Scheduled Date</Label>
            <Input
              id="job-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lead Technician</Label>
            <Select
              value={leadTechId || "__unassigned__"}
              onValueChange={(v) => setLeadTechId(v === "__unassigned__" ? "" : v)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {technicians.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-notes" className="text-xs">Notes</Label>
            <Input
              id="job-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              className="text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Creating…" : "Create Job"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Import Dialog ──────────────────────────────────────────────────────────────

type PreviewRow = {
  rowIndex: number;
  rawBuildingId: string;
  rawSiteName: string;
  serviceType: string;
  targetDate: string;
  matchStatus: string;
  matchMethod: string;
  matchedSiteName: string | null;
  matchedBuildingId: string | null;
};

// ── Shared column-selector dropdown ──────────────────────────────────────────

function ColSelect({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-xs text-gray-600 shrink-0">{label}</span>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-7 text-xs flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="-1"><span className="text-gray-400">(not in file)</span></SelectItem>
          {headers.map((h, i) => (
            <SelectItem key={i} value={String(i)}>
              <span className="font-mono text-[11px] text-gray-500 mr-1">{i + 1}:</span> {h || <span className="text-gray-400">(empty)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ImportDialog({
  companyId,
  defaultMonth,
  onClose,
  onImported,
}: {
  companyId: number;
  defaultMonth: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "result">("upload");
  const [month, setMonth] = useState(defaultMonth);
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [rawPreviewRows, setRawPreviewRows] = useState<string[][]>([]);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [colBuildingId,  setColBuildingId]  = useState(-1);
  const [colSiteName,    setColSiteName]    = useState(-1);
  const [colServiceType, setColServiceType] = useState(-1);
  const [colTargetDate,  setColTargetDate]  = useState(-1);
  const [colNotes,       setColNotes]       = useState(-1);
  const [preview, setPreview] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [skipUnmatched, setSkipUnmatched] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [manualMappings, setManualMappings] = useState<{ rawBuildingId: string; siteId: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: sitesData } = trpc.site.listByCompany.useQuery({ companyId }, { enabled: !!companyId });

  const parseHeadersMutation = trpc.serviceSchedule.parseHeaders.useMutation({
    onSuccess: (data) => {
      setRawPreviewRows(data.rawPreviewRows as string[][]);
      setParsedHeaders(data.headers);
      setColBuildingId(data.detected.buildingId);
      setColSiteName(data.detected.siteName);
      setColServiceType(data.detected.serviceType);
      setColTargetDate(data.detected.targetDate);
      setColNotes(data.detected.notes);
      setStep("map");
    },
  });
  const importPreview = trpc.serviceSchedule.importPreview.useMutation({
    onSuccess: (data) => { setManualMappings([]); setPreview(data); setStep("preview"); },
  });
  const importExecute = trpc.serviceSchedule.importExecute.useMutation({
    onSuccess: (data) => { setResult(data); setStep("result"); },
  });

  function handleFile(f: File) {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const fd = (e.target?.result as string).split(",")[1] ?? "";
      setFileData(fd);
      parseHeadersMutation.mutate({ companyId, fileName: f.name, fileData: fd, headerRowIndex: 0 });
    };
    reader.readAsDataURL(f);
  }

  function reDetect(newIdx: number) {
    if (!fileData || !file) return;
    setHeaderRowIndex(newIdx);
    parseHeadersMutation.mutate({ companyId, fileName: file.name, fileData, headerRowIndex: newIdx });
  }

  function runPreview() {
    if (!file || !fileData) return;
    importPreview.mutate({
      companyId, trackingMonth: month, fileName: file.name, fileData, headerRowIndex,
      colOverrides: { buildingId: colBuildingId, siteName: colSiteName, serviceType: colServiceType, targetDate: colTargetDate, notes: colNotes },
    });
  }

  function runExecute() {
    if (!file || !fileData) return;
    importExecute.mutate({
      companyId, trackingMonth: month, fileName: file.name, fileData,
      skipUnmatched, updateExisting, headerRowIndex,
      colOverrides: { buildingId: colBuildingId, siteName: colSiteName, serviceType: colServiceType, targetDate: colTargetDate, notes: colNotes },
      manualMappings: manualMappings.filter((m) => m.siteId > 0),
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Monthly Service List</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Tracking Month</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-44"
              />
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-medium">
                {parseHeadersMutation.isPending ? "Reading file…" : file ? file.name : "Drop your XLSX here or click to browse"}
              </p>
              <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            {/* Raw rows preview — lets user identify which row has real headers */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">First rows of your file — click the row that contains column headers:</p>
              <div className="rounded border overflow-x-auto">
                <table className="text-[11px] w-full">
                  <tbody>
                    {rawPreviewRows.map((rawRow, ri) => (
                      <tr
                        key={ri}
                        onClick={() => reDetect(ri)}
                        className={`cursor-pointer border-b transition-colors ${headerRowIndex === ri ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"}`}
                      >
                        <td className={`px-2 py-1 font-semibold w-10 shrink-0 ${headerRowIndex === ri ? "text-blue-600" : "text-gray-400"}`}>
                          {headerRowIndex === ri ? "▶ " : ""}{ri + 1}
                        </td>
                        {rawRow.slice(0, 10).map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 truncate max-w-[100px] border-l text-gray-700">
                            {cell || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                        {rawRow.length > 10 && <td className="px-2 py-1 text-gray-400">+{rawRow.length - 10} more</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {headerRowIndex > 0 && (
                <p className="text-xs text-blue-600 mt-1">Using row {headerRowIndex + 1} as headers — data starts from row {headerRowIndex + 2}.</p>
              )}
            </div>

            <p className="text-sm text-gray-600">Map the columns detected from the selected header row:</p>

            <div className="space-y-2">
              <ColSelect label="Building ID *" headers={parsedHeaders} value={colBuildingId} onChange={setColBuildingId} />
              <ColSelect label="Site Name"     headers={parsedHeaders} value={colSiteName}   onChange={setColSiteName} />
              <ColSelect label="Service Type"  headers={parsedHeaders} value={colServiceType} onChange={setColServiceType} />
              <ColSelect label="Target Date"   headers={parsedHeaders} value={colTargetDate}  onChange={setColTargetDate} />
              <ColSelect label="Notes"         headers={parsedHeaders} value={colNotes}       onChange={setColNotes} />
            </div>
            {colBuildingId !== -1 && colSiteName === -1 && (
              <p className="text-xs text-green-700 bg-green-50 rounded p-2">
                Building ID is mapped — rows will be matched by file number. Site Name is only needed as a fallback when Building ID is absent.
              </p>
            )}
            {colBuildingId === -1 && colSiteName === -1 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                Neither Building ID nor Site Name column is mapped — rows won't match any sites. Please select at least one.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={runPreview} disabled={importPreview.isPending || (colBuildingId === -1 && colSiteName === -1)}>
                {importPreview.isPending ? "Previewing…" : "Preview Import"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && preview && (() => {
          const allSites: any[] = (sitesData as any) ?? [];
          const unmatchedBuildingIds: string[] = Array.from(
            new Set(
              (preview.previewRows as PreviewRow[])
                .filter((r) => r.matchStatus === "unmatched" && r.rawBuildingId)
                .map((r) => r.rawBuildingId)
            )
          );
          const manualCount = manualMappings.filter((m) => m.siteId > 0).length;
          const importCount = preview.matched + manualCount;
          return (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-green-700 font-semibold">{preview.matched} matched</span>
                <span className="text-red-600 font-semibold">{preview.unmatched} unmatched</span>
                <span className="text-gray-500">{preview.totalRows} total rows</span>
              </div>

              {preview.unmatched > 0 && unmatchedBuildingIds.length > 0 && (
                <div className="border rounded-lg p-3 bg-amber-50 space-y-2">
                  <p className="text-xs font-semibold text-amber-800">
                    {unmatchedBuildingIds.length} building ID{unmatchedBuildingIds.length !== 1 ? "s" : ""} couldn't be auto-matched.
                    Assign them to sites below, or they'll be skipped.
                  </p>
                  <div className="space-y-1.5">
                    {unmatchedBuildingIds.map((bldgId) => {
                      const current = manualMappings.find((m) => m.rawBuildingId === bldgId);
                      return (
                        <div key={bldgId} className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-700 w-20 shrink-0">{bldgId}</span>
                          <Select
                            value={String(current?.siteId ?? -1)}
                            onValueChange={(v) => {
                              const siteId = Number(v);
                              setManualMappings((prev) => {
                                const filtered = prev.filter((m) => m.rawBuildingId !== bldgId);
                                return siteId > 0 ? [...filtered, { rawBuildingId: bldgId, siteId }] : filtered;
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue placeholder="— assign to site —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-1"><span className="text-gray-400">— skip this building ID —</span></SelectItem>
                              {allSites.map((s: any) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.name}{s.buildingId ? ` (${s.buildingId})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  {manualCount > 0 && (
                    <p className="text-xs text-green-700">
                      {manualCount} manually assigned — building IDs will be saved to those sites automatically.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded border overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left border-b text-gray-500 font-semibold">
                      <th className="px-2 py-1">Row</th>
                      <th className="px-2 py-1">Bldg ID</th>
                      <th className="px-2 py-1">Site Name</th>
                      <th className="px-2 py-1">Service Type</th>
                      <th className="px-2 py-1">Target Date</th>
                      <th className="px-2 py-1">Match</th>
                      <th className="px-2 py-1">Matched To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.previewRows as PreviewRow[]).map((r) => {
                      const manual = r.matchStatus === "unmatched"
                        ? manualMappings.find((m) => m.rawBuildingId === r.rawBuildingId)
                        : undefined;
                      const manualSite = manual ? allSites.find((s: any) => s.id === manual.siteId) : undefined;
                      return (
                        <tr key={r.rowIndex} className={`border-b ${r.matchStatus === "unmatched" && !manual ? "bg-red-50" : r.matchStatus === "unmatched" && manual ? "bg-yellow-50" : ""}`}>
                          <td className="px-2 py-1 text-gray-400">{r.rowIndex}</td>
                          <td className="px-2 py-1 font-mono">{r.rawBuildingId || "—"}</td>
                          <td className="px-2 py-1">{r.rawSiteName || "—"}</td>
                          <td className="px-2 py-1">{r.serviceType}</td>
                          <td className="px-2 py-1">{r.targetDate || "—"}</td>
                          <td className="px-2 py-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              r.matchStatus === "matched" ? "bg-green-100 text-green-700"
                              : manualSite ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-600"
                            }`}>
                              {r.matchStatus === "matched" ? r.matchMethod : manualSite ? "manual" : "unmatched"}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-gray-500">{r.matchedSiteName ?? manualSite?.name ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={skipUnmatched} onChange={(e) => setSkipUnmatched(e.target.checked)} />
                  Skip unmatched rows
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                  Update existing rows
                </label>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
                <Button onClick={runExecute} disabled={importExecute.isPending || importCount === 0}>
                  {importExecute.isPending ? "Importing…" : `Import ${importCount} Rows`}
                </Button>
              </div>
            </div>
          );
        })()}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Import Complete</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-green-50 rounded p-3">
                <p className="text-green-700 font-semibold text-lg">{result.created}</p>
                <p className="text-green-600">Created</p>
              </div>
              <div className="bg-blue-50 rounded p-3">
                <p className="text-blue-700 font-semibold text-lg">{result.updated}</p>
                <p className="text-blue-600">Updated</p>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-gray-700 font-semibold text-lg">{result.skipped}</p>
                <p className="text-gray-500">Skipped</p>
              </div>
              <div className="bg-red-50 rounded p-3">
                <p className="text-red-700 font-semibold text-lg">{result.errors}</p>
                <p className="text-red-600">Errors</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={onImported}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Calendar Tab ───────────────────────────────────────────────────────────────

function CalendarTab({ companyId }: { companyId: number }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [deleteJobId, setDeleteJobId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.job.getScheduleSummary.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const deleteJob = trpc.job.delete.useMutation({
    onSuccess: () => {
      toast.success('Job deleted');
      setDeleteJobId(null);
      utils.job.getScheduleSummary.invalidate({ companyId });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to delete job'),
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const jobsByDay: Record<number, any[]> = {};
  ((data as any)?.all ?? []).forEach((job: any) => {
    if (!job.scheduledDate) return;
    const d = new Date(job.scheduledDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!jobsByDay[day]) jobsByDay[day] = [];
      jobsByDay[day].push(job);
    }
  });

  const selectedJobs = selectedDay ? (jobsByDay[selectedDay] ?? []) : [];

  return (
    <div className="space-y-6">
      {((data as any)?.overdue?.length ?? 0) > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              {(data as any).overdue.length} Overdue Inspection{(data as any).overdue.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data as any).overdue.map((job: any) => (
                <div key={job.id} className="flex items-center justify-between bg-white rounded p-2 border border-red-200">
                  <div>
                    <p className="font-medium text-sm">{job.title}</p>
                    <p className="text-xs text-gray-500">
                      Scheduled: {formatDate(job.scheduledDate)}
                    </p>
                  </div>
                  <Link href={`/admin/jobs/${job.id}`}>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/30">View</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base">{MONTHS[month]} {year}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">Loading schedule…</div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                  const isSelected = selectedDay === day;
                  const dayJobs = jobsByDay[day] ?? [];
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`rounded p-1 min-h-[48px] text-left transition-colors ${isSelected ? "bg-destructive/10 border border-destructive/40" : "hover:bg-gray-50"}`}
                    >
                      <span className={`text-xs block mb-1 ${isToday ? "text-destructive font-bold" : "text-gray-700"}`}>{day}</span>
                      <div className="flex flex-wrap gap-0.5">
                        {dayJobs.slice(0, 3).map((j: any) => (
                          <span key={j.id} className={`w-2 h-2 rounded-full ${calendarStatusColor(j.status)}`} title={j.title} />
                        ))}
                        {dayJobs.length > 3 && <span className="text-[9px] text-gray-400">+{dayJobs.length - 3}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-4 mt-4 text-xs text-gray-500">
              {[["bg-[var(--warning)]","Scheduled"],["bg-accent","In Progress"],["bg-[var(--success)]","Complete"],["bg-gray-400","Draft"]].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${c}`}/>{l}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {selectedDay ? `${MONTHS[month]} ${selectedDay}` : "Select a day"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDay && <p className="text-sm text-gray-400">Click a date to see jobs.</p>}
            {selectedDay && selectedJobs.length === 0 && (
              <p className="text-sm text-gray-400">No jobs scheduled.</p>
            )}
            <div className="space-y-3">
              {selectedJobs.map((job: any) => (
                <div key={job.id} className="border rounded p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{job.title}</p>
                    {job.googleCalendarEventId && (
                      <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-[var(--success)]" aria-label="Synced to Google Calendar" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{job.status?.replace("_"," ")}</Badge>
                    {job.jobType && <span className="text-xs text-gray-500">{job.jobType}</span>}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Link href={`/admin/jobs/${job.id}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full text-xs">Open Job</Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteJobId(job.id)}
                      aria-label="Delete job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteJobId !== null} onOpenChange={open => { if (!open) setDeleteJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the job and all its inspection data, deficiencies, and reports. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteJobId !== null && deleteJob.mutate({ id: deleteJobId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Service Schedules Tab ──────────────────────────────────────────────────────

function ServiceSchedulesTab({ companyId, utils }: { companyId: number; utils: any }) {
  const [addOpen, setAddOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [frequency, setFrequency] = useState<string>("annual");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [notes, setNotes] = useState("");

  const { data: schedules, isLoading, refetch } = trpc.serviceSchedule.listSchedules.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: sitesData } = trpc.site.listByCompany.useQuery({ companyId }, { enabled: !!companyId });
  const sites: any[] = (sitesData as any) ?? [];

  const createSchedule = trpc.serviceSchedule.createSchedule.useMutation({
    onSuccess: () => {
      refetch();
      setAddOpen(false);
      setSiteId("");
      setServiceType("");
      setFrequency("annual");
      setEstimatedHours("");
      setNotes("");
    },
  });

  const updateSchedule = trpc.serviceSchedule.updateSchedule.useMutation({
    onSuccess: () => refetch(),
  });

  function handleCreate() {
    if (!siteId || !serviceType) return;
    createSchedule.mutate({
      siteId: Number(siteId),
      serviceType,
      frequency: frequency as any,
      estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      notes: notes || undefined,
    });
  }

  const rows: any[] = schedules ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{rows.length} active service schedule{rows.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Schedule
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left text-gray-500 font-semibold">
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Bldg ID</th>
              <th className="px-3 py-2">Service Type</th>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2">Est. Hours</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No service schedules defined.</td></tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{r.siteId}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{r.buildingId ?? "—"}</td>
                <td className="px-3 py-2">{r.serviceType}</td>
                <td className="px-3 py-2">
                  <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[11px]">
                    {FREQ_LABELS[r.frequency] ?? r.frequency}
                  </span>
                </td>
                <td className="px-3 py-2">{r.estimatedHours ?? "—"}</td>
                <td className="px-3 py-2 max-w-[160px] text-gray-500 truncate">{r.notes ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.active ? (
                    <span className="text-green-600 font-medium">Active</span>
                  ) : (
                    <span className="text-gray-400">Inactive</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-gray-400 hover:text-red-600"
                      onClick={() => updateSchedule.mutate({ id: r.id, active: false })}
                      title="Deactivate"
                    >
                      Deactivate
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Schedule Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Service Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Site</Label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select site…" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.buildingId ? ` (${s.buildingId})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Service Type</Label>
              <Input value={serviceType} onChange={(e) => setServiceType(e.target.value)} placeholder="e.g. Annual Fire Alarm Inspection" />
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQ_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estimated Hours (optional)</Label>
              <Input type="number" min="0" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="e.g. 4" />
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions…" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!siteId || !serviceType || createSchedule.isPending}>
                {createSchedule.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Repair Letter Tracking Tab ────────────────────────────────────────────────

function RepairLetterTab({ companyId }: { companyId: number }) {
  const today = new Date();
  const [period, setPeriod] = useState(monthStr(today));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");

  const { data: rows = [], isLoading, refetch } = trpc.repairLetter.listTracking.useQuery(
    {
      companyId,
      trackingPeriod: period,
      status: statusFilter !== "all" ? (statusFilter as any) : undefined,
      search: search.trim() || undefined,
    },
    { enabled: !!companyId }
  );

  const updateTracking = trpc.repairLetter.updateTracking.useMutation({
    onSuccess: () => { refetch(); setEditingRow(null); },
  });

  function prevPeriod() {
    const [y, m] = period.split("-").map(Number);
    setPeriod(monthStr(new Date(y, m - 2, 1)));
  }
  function nextPeriod() {
    const [y, m] = period.split("-").map(Number);
    setPeriod(monthStr(new Date(y, m, 1)));
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={prevPeriod}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-semibold text-sm w-24 text-center">{period}</span>
          <Button variant="ghost" size="icon" onClick={nextPeriod}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(RL_STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search building / notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs w-52"
        />
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left text-gray-500 font-semibold">
              <th className="px-3 py-2">Bldg ID</th>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Job #</th>
              <th className="px-3 py-2">Deficiencies</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Letter Sent</th>
              <th className="px-3 py-2">Follow-Up Date</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && (rows as any[]).length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-400">
                  No repair letter rows for {period}.{" "}
                  <button className="text-blue-600 underline" onClick={() => setImportOpen(true)}>Import a spreadsheet</button>
                </td>
              </tr>
            )}
            {(rows as any[]).map((row: any) => (
              <tr key={row.id} className="border-b hover:bg-gray-50 align-top">
                <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{row.buildingId ?? "—"}</td>
                <td className="px-3 py-2 max-w-[140px]"><span className="truncate block font-medium">{row.siteName}</span></td>
                <td className="px-3 py-2 max-w-[120px] text-gray-500 truncate">{row.customerName}</td>
                <td className="px-3 py-2">
                  {row.linkedJob ? (
                    <Link href={`/admin/jobs/${row.linkedJob.id}`}>
                      <span className="text-blue-600 underline">{row.linkedJob.jobNumber}</span>
                    </Link>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  {(row.deficiencyCount ?? 0) > 0 ? (
                    <span className="text-red-600 font-semibold">{row.deficiencyCount}</span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  {editingRow === row.id ? (
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger className="h-6 text-[11px] w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RL_STATUS_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <button onClick={() => { setEditingRow(row.id); setEditStatus(row.repairLetterStatus); setEditNotes(row.notes ?? ""); }}>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer ${RL_STATUS_COLORS[row.repairLetterStatus] ?? "bg-gray-100 text-gray-500"}`}>
                        {RL_STATUS_LABELS[row.repairLetterStatus] ?? row.repairLetterStatus}
                      </span>
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {row.letterSentDate ? new Date(row.letterSentDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {row.followUpDate ? new Date(row.followUpDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 max-w-[160px]">
                  {editingRow === row.id ? (
                    <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="h-6 text-[11px]" />
                  ) : (
                    <span className="text-gray-500 truncate block">{row.notes ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {editingRow === row.id ? (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 px-2 text-[11px]"
                        onClick={() => updateTracking.mutate({ id: row.id, repairLetterStatus: editStatus as any, notes: editNotes || undefined })}
                        disabled={updateTracking.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setEditingRow(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400">{(rows as any[]).length} row{(rows as any[]).length !== 1 ? "s" : ""} — click a status badge to edit inline</div>

      {importOpen && (
        <RepairLetterImportDialog
          companyId={companyId}
          defaultPeriod={period}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}

// ── Repair Letter Import Dialog ────────────────────────────────────────────────

function RepairLetterImportDialog({
  companyId,
  defaultPeriod,
  onClose,
  onImported,
}: {
  companyId: number;
  defaultPeriod: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [period, setPeriod] = useState(defaultPeriod);
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>("");
  const [preview, setPreview] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [skipUnmatched, setSkipUnmatched] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importPreview = trpc.repairLetter.importPreview.useMutation({
    onSuccess: (data) => { setPreview(data); setStep("preview"); },
  });
  const importExecute = trpc.repairLetter.importExecute.useMutation({
    onSuccess: (data) => { setResult(data); setStep("result"); },
  });

  function handleFile(f: File) {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setFileData((e.target?.result as string).split(",")[1] ?? "");
    reader.readAsDataURL(f);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Repair Letter Tracking</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Tracking Period</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
            </div>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-medium">{file ? file.name : "Drop your XLSX here or click to browse"}</p>
              <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div className="bg-blue-50 rounded p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">Expected columns (order flexible):</p>
              <p>Building ID / File No., Site Name, Deficiencies, Letter Sent Date, Follow-Up Date, Notes</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => { if (file && fileData) importPreview.mutate({ companyId, trackingPeriod: period, fileName: file.name, fileData }); }}
                disabled={!file || importPreview.isPending}>
                {importPreview.isPending ? "Parsing…" : "Preview Import"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-green-700 font-semibold">{preview.matched} matched</span>
              <span className="text-red-600 font-semibold">{preview.unmatched} unmatched</span>
              <span className="text-gray-500">{preview.totalRows} total rows</span>
            </div>
            <div className="rounded border overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left border-b text-gray-500 font-semibold">
                    <th className="px-2 py-1">Row</th>
                    <th className="px-2 py-1">Bldg ID</th>
                    <th className="px-2 py-1">Site Name</th>
                    <th className="px-2 py-1">Defs</th>
                    <th className="px-2 py-1">Match</th>
                    <th className="px-2 py-1">Matched To</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.previewRows as any[]).map((r: any) => (
                    <tr key={r.rowIndex} className={`border-b ${r.matchStatus === "unmatched" ? "bg-red-50" : ""}`}>
                      <td className="px-2 py-1 text-gray-400">{r.rowIndex}</td>
                      <td className="px-2 py-1 font-mono">{r.rawBldg || "—"}</td>
                      <td className="px-2 py-1">{r.rawSite || "—"}</td>
                      <td className="px-2 py-1">{r.rawDefs || "—"}</td>
                      <td className="px-2 py-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${r.matchStatus === "matched" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {r.matchStatus === "matched" ? r.matchMethod : "unmatched"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-gray-500">{r.matchedSiteName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={skipUnmatched} onChange={(e) => setSkipUnmatched(e.target.checked)} />
                Skip unmatched rows
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                Update existing rows
              </label>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={() => { if (file && fileData) importExecute.mutate({ companyId, trackingPeriod: period, fileName: file.name, fileData, skipUnmatched, updateExisting }); }}
                disabled={importExecute.isPending}>
                {importExecute.isPending ? "Importing…" : `Import ${preview.matched} Rows`}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Import Complete</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Created", result.created, "bg-green-50 text-green-700"], ["Updated", result.updated, "bg-blue-50 text-blue-700"],
                ["Skipped", result.skipped, "bg-gray-50 text-gray-700"], ["Errors", result.errors, "bg-red-50 text-red-700"]].map(([label, val, cls]) => (
                <div key={label as string} className={`rounded p-3 ${cls}`}>
                  <p className="font-semibold text-lg">{val}</p>
                  <p>{label}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={onImported}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
