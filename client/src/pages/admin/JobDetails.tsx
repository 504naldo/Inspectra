import { useState } from "react";
import { useParams, Link } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import FinalizeJobDialog from "@/components/FinalizeJobDialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Upload,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileDown,
  RefreshCw,
  Calendar,
  CalendarCheck,
  CalendarX,
  FileCheck,
  ClipboardList,
  Clock,
  Save,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function AdminJobDetails() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [reInspectDialogOpen, setReInspectDialogOpen] = useState(false);

  // Quote state
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [selectedDeficiencyIds, setSelectedDeficiencyIds] = useState<number[]>([]);
  const [quoteNotes, setQuoteNotes] = useState("");

  // Job edit state
  const [jobEditOpen, setJobEditOpen] = useState(false);
  const [jobEditTitle, setJobEditTitle] = useState("");
  const [jobEditDescription, setJobEditDescription] = useState("");
  const [jobEditNotes, setJobEditNotes] = useState("");
  const [jobEditJobType, setJobEditJobType] = useState("");
  const [jobEditPriority, setJobEditPriority] = useState("");
  const [jobEditScheduledDate, setJobEditScheduledDate] = useState("");

  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const updateJobMutation = trpc.job.update.useMutation({
    onSuccess: () => {
      toast.success("Job updated");
      setJobEditOpen(false);
      utils.job.get.invalidate({ id: parseInt(jobId!) });
    },
    onError: (err) => toast.error(err.message || "Failed to update job"),
  });

  const handleJobEditOpen = (job: any) => {
    setJobEditTitle(job.title ?? "");
    setJobEditDescription(job.description ?? "");
    setJobEditNotes(job.notes ?? "");
    setJobEditJobType(job.jobType ?? "annual");
    setJobEditPriority(job.priority ?? "medium");
    setJobEditScheduledDate(
      job.scheduledDate ? new Date(job.scheduledDate).toISOString().split("T")[0] : ""
    );
    setJobEditOpen(true);
  };

  const handleExportCSV = () => {
    if (!deficiencies || deficiencies.length === 0) return;
    const headers = ['ID', 'Title', 'Severity', 'System Category', 'Status', 'Est. Cost ($)', 'Observed Issue', 'Corrective Action', 'Code Reference', 'Created At'];
    const escape = (v: any) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };
    const rows = deficiencies.map((d: any) => [
      d.id,
      escape(d.title),
      escape(d.severity),
      escape(d.systemCategory ? d.systemCategory.replace(/_/g, ' ') : ''),
      escape(d.status?.replace(/_/g, ' ')),
      d.estimatedCost != null ? parseFloat(String(d.estimatedCost)).toFixed(2) : '',
      escape(d.observedIssue),
      escape(d.correctiveAction),
      escape(d.codeReference),
      d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-CA') : '',
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deficiencies-job-${jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${deficiencies.length} deficiencies to CSV`);
  };

  const cloneMutation = trpc.job.clone.useMutation({
    onSuccess: (data) => {
      toast.success(`Re-inspect job created: ${data.jobNumber}`);
      setReInspectDialogOpen(false);
      navigate(`/admin/jobs/${data.newJobId}`);
    },
    onError: (err) => {
      toast.error(`Failed to create re-inspect job: ${err.message}`);
    },
  });

  const createCalendarEventMutation = trpc.calendar.createEvent.useMutation({
    onSuccess: () => {
      toast.success("Calendar event created");
      utils.job.get.invalidate({ id: parseInt(jobId!) });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateCalendarEventMutation = trpc.calendar.updateEvent.useMutation({
    onSuccess: () => {
      toast.success("Calendar event updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteCalendarEventMutation = trpc.calendar.deleteEvent.useMutation({
    onSuccess: () => {
      toast.success("Calendar event removed");
      utils.job.get.invalidate({ id: parseInt(jobId!) });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleVerifyHash = async () => {
    setVerifyDialogOpen(true);
    setVerifyResult(null);
    try {
      const result = await utils.compliance.verifyJobHash.fetch({ jobId: parseInt(jobId!) });
      setVerifyResult(result);
    } catch (err: any) {
      setVerifyResult({ error: err.message || 'Verification failed' });
    }
  };

  const { data: job, isLoading: jobLoading } = trpc.job.get.useQuery(
    { id: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  const { data: files, isLoading: filesLoading } = trpc.files.listByJob.useQuery(
    { jobId: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  const { data: deficiencies, isLoading: deficienciesLoading } = trpc.deficiency.listByJob.useQuery(
    { jobId: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  const { data: quotes, refetch: refetchQuotes } = trpc.quote.listByJob.useQuery(
    { jobId: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  const { data: workOrder, refetch: refetchWorkOrder } = trpc.workOrder.listByJob.useQuery(
    { jobId: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  // Work order edit state
  const [woOfficeNotes, setWoOfficeNotes] = useState("");
  const [woPriority, setWoPriority] = useState<string>("");
  const [woWorkType, setWoWorkType] = useState<string>("");
  const [woEstimatedHours, setWoEstimatedHours] = useState("");
  const [woEditMode, setWoEditMode] = useState(false);

  const updateWorkOrderMutation = trpc.workOrder.update.useMutation({
    onSuccess: () => {
      toast.success("Work order updated");
      setWoEditMode(false);
      refetchWorkOrder();
    },
    onError: (err) => toast.error(err.message || "Failed to update work order"),
  });

  const createQuoteMutation = trpc.quote.create.useMutation({
    onSuccess: (data) => {
      toast.success("Quote created — navigate to Quotes to send it");
      setQuoteDialogOpen(false);
      setSelectedDeficiencyIds([]);
      setQuoteNotes("");
      refetchQuotes();
    },
    onError: (err) => toast.error(err.message || "Failed to create quote"),
  });

  const uploadMutation = trpc.files.create.useMutation({
    onSuccess: () => {
      toast.success("File uploaded successfully");
      utils.files.listByJob.invalidate();
      setSelectedFile(null);
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const previewImportMutation = trpc.files.previewImportExcel.useMutation({
    onSuccess: (data) => {
      setPreviewData(data);
      // Set default to first device sheet
      if (data.selectedSheet) {
        setSelectedSheets([data.selectedSheet]);
      }
      const deviceSheets = data.availableSheets?.filter((s: any) => s.isDevice).length || 0;
      toast.success(`Preview ready: ${deviceSheets} device sheets found, ${data.totalRows} total rows`);
    },
    onError: (error) => {
      toast.error(`Preview failed: ${error.message}`);
    },
  });

  const importMutation = trpc.files.importExcelDevices.useMutation({
    onSuccess: (data) => {
      const summary = `Imported ${data.imported.fireAlarm || 0} fire alarm devices, ${data.imported.extinguishers || 0} extinguishers, ${data.imported.emergencyLights || 0} emergency lights`;
      toast.success(summary);
      utils.files.listByJob.invalidate();
      // Clear preview data after successful import
      setPreviewData(null);
      setSelectedSheets([]);
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("Selected file:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be less than 50MB");
      return;
    }

    setSelectedFile(file);
    toast.success(`Selected: ${file.name}`);
  };

  const handleUpload = async () => {
    if (!selectedFile || !job || !user || !user.companyId) return;

    setIsUploading(true);
    try {
      // Use FormData for multipart upload (no base64 encoding)
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("entityType", "job");
      formData.append("entityId", job.id.toString());
      formData.append("companyId", user.companyId.toString());
      formData.append("jobId", job.id.toString());
      formData.append("siteId", job.siteId.toString());
      formData.append("userId", user.id.toString());

      // Upload via multipart API endpoint
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      
      // Refresh file list
      await utils.files.listByJob.invalidate();
      toast.success("File uploaded successfully");
      setSelectedFile(null);
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return <FileText className="h-5 w-5" />;
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("macroEnabled")) {
      return <FileSpreadsheet className="h-5 w-5 text-[var(--success)]" />;
    }
    if (mimeType.includes("image")) {
      return <ImageIcon className="h-5 w-5 text-accent" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  const isExcelFile = (mimeType: string | null, fileName?: string | null) => {
    // Check MIME type first
    if (mimeType) {
      const excelMimeTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
        "application/vnd.ms-excel", // .xls
        "application/vnd.openxmlformats-officedocument.spreadsheetml.template", // .xltx
      ];
      const mimeMatch = excelMimeTypes.some(type => mimeType.includes(type)) || 
                        mimeType.includes("spreadsheet") || 
                        mimeType.includes("excel");
      if (mimeMatch) return true;
    }

    // Fallback to extension check (critical for Chrome mobile/desktop with empty/generic MIME)
    if (fileName) {
      const ext = fileName.toLowerCase().split(".").pop();
      return ext === "xlsx" || ext === "xlsm" || ext === "xls" || ext === "csv";
    }

    return false;
  };

  const getImportStatusBadge = (status: string) => {
    switch (status) {
      case "imported":
        return <Badge variant="default" className="bg-[var(--success)]"><CheckCircle2 className="h-3 w-3 mr-1" />Imported</Badge>;
      case "previewed":
        return <Badge variant="secondary"><Eye className="h-3 w-3 mr-1" />Previewed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return null;
    }
  };



  if (jobLoading) {
    return (
      <AdminLayout title="Job Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!job) {
    return (
      <AdminLayout title="Job Not Found">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">Job not found</p>
          <Link href="/admin/jobs">
            <Button variant="link" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={`Job #${job.id}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/jobs">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Job #{job.id}</h1>
              <p className="text-sm text-muted-foreground">{job.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{job.status}</Badge>
            {/* Calendar sync controls */}
            {(user?.role === "admin" || user?.role === "office") && (
              job.googleCalendarEventId ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success)]/5"
                    onClick={() => updateCalendarEventMutation.mutate({ jobId: parseInt(jobId!) })}
                    disabled={updateCalendarEventMutation.isPending}
                  >
                    {updateCalendarEventMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarCheck className="h-4 w-4" />
                    )}
                    Synced
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    onClick={() => deleteCalendarEventMutation.mutate({ jobId: parseInt(jobId!) })}
                    disabled={deleteCalendarEventMutation.isPending}
                  >
                    {deleteCalendarEventMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarX className="h-4 w-4" />
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => createCalendarEventMutation.mutate({ jobId: parseInt(jobId!) })}
                  disabled={createCalendarEventMutation.isPending}
                >
                  {createCalendarEventMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calendar className="h-4 w-4" />
                  )}
                  Add to Calendar
                </Button>
              )
            )}
            {user?.role === "admin" && job.finalizedAt && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-accent/30 text-accent hover:bg-accent/5"
                onClick={handleVerifyHash}
              >
                <ShieldCheck className="h-4 w-4" />
                Verify Integrity
              </Button>
            )}
            {(user?.role === "admin" || user?.role === "office") && (job.status === 'completed' || !!job.finalizedAt) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-[var(--warning)]/30 text-[var(--warning)] hover:bg-[var(--warning)]/5"
                onClick={() => setReInspectDialogOpen(true)}
              >
                <RefreshCw className="h-4 w-4" />
                Re-inspect
              </Button>
            )}
            {(user?.role === "admin" || user?.role === "office") && (
              <FinalizeJobDialog
                jobId={job.id}
                jobNumber={job.jobNumber ?? undefined}
                isFinalized={!!job.finalizedAt}
                finalizedAt={job.finalizedAt}
                finalizationHash={job.finalizationHash}
                onFinalized={() => utils.job.get.invalidate({ id: job.id })}
              />
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="files" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="deficiencies">
              Deficiencies
              {deficiencies && deficiencies.length > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-1.5 py-0.5">
                  {deficiencies.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="work-order">
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
              Work Order
            </TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            {job.finalizedAt && (
              <div className="flex items-start gap-3 rounded-lg border border-[var(--success)]/20 bg-[var(--success)]/5 p-4">
                <ShieldCheck className="h-5 w-5 text-[var(--success)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[var(--success)]">Record Sealed — Immutable</p>
                  <p className="text-xs text-[var(--success)] mt-0.5">
                    Finalized on {new Date(job.finalizedAt).toLocaleString()}. No further edits are permitted.
                    {job.finalizationHash && (
                      <span className="block mt-1 font-mono text-[10px] break-all text-[var(--success)]">
                        SHA-256: {job.finalizationHash}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle>Job Information</CardTitle>
                {!job.finalizedAt && (user?.role === "admin" || user?.role === "office") && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleJobEditOpen(job)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Title</p>
                    <p className="mt-0.5">{job.title}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</p>
                    <p className="mt-0.5 capitalize">{job.status?.replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Type</p>
                    <p className="mt-0.5 capitalize">{job.jobType?.replace(/_/g, " ") ?? "—"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Priority</p>
                    <p className="mt-0.5 capitalize">{job.priority ?? "—"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Scheduled Date</p>
                    <p className="mt-0.5">
                      {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : "Not scheduled"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Job #</p>
                    <p className="mt-0.5 font-mono text-xs">{job.jobNumber ?? "—"}</p>
                  </div>
                  {job.description && (
                    <div className="col-span-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Description</p>
                      <p className="mt-0.5 whitespace-pre-line">{job.description}</p>
                    </div>
                  )}
                  {(job as any).notes && (
                    <div className="col-span-2">
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Notes</p>
                      <p className="mt-0.5 whitespace-pre-line">{(job as any).notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deficiencies" className="space-y-4">
            {deficienciesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !deficiencies || deficiencies.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground">No deficiencies recorded for this job.</p>
                </CardContent>
              </Card>
            ) : (() => {
              const totalCost = deficiencies.reduce((sum: number, d: any) => {
                const c = d.estimatedCost != null ? parseFloat(String(d.estimatedCost)) : 0;
                return sum + (isNaN(c) ? 0 : c);
              }, 0);
              const withCost = deficiencies.filter((d: any) => d.estimatedCost != null && parseFloat(String(d.estimatedCost)) > 0).length;
              return (
                <>
                  {/* Cost Summary Banner */}
                  {totalCost > 0 && (
                    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                      <CardContent className="py-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Total Estimated Repair Cost</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400">{withCost} of {deficiencies.length} deficiencies have cost estimates</p>
                        </div>
                        <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                          ${totalCost.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Existing Quotes */}
                  {quotes && quotes.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Quotes ({quotes.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left px-4 py-2 font-medium">Quote #</th>
                              <th className="text-left px-4 py-2 font-medium">Status</th>
                              <th className="text-right px-4 py-2 font-medium">Total</th>
                              <th className="text-left px-4 py-2 font-medium">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quotes.map((q: any) => (
                              <tr key={q.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="px-4 py-2 font-mono text-xs">Q-{q.id}</td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    q.status === "accepted" ? "status-pass" :
                                    q.status === "sent" ? "bg-blue-100 text-blue-700" :
                                    q.status === "declined" ? "status-fail" :
                                    "bg-muted text-muted-foreground"
                                  }`}>{q.status}</span>
                                </td>
                                <td className="px-4 py-2 text-right font-mono">
                                  ${parseFloat(String(q.total)).toFixed(2)}
                                </td>
                                <td className="px-4 py-2 text-xs text-muted-foreground">
                                  {new Date(q.createdAt).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Deficiency Table */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle>Deficiencies ({deficiencies.length})</CardTitle>
                      <div className="flex items-center gap-2">
                        {deficiencies.filter((d: any) => d.status === "open").length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-destructive border-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedDeficiencyIds(
                                deficiencies.filter((d: any) => d.status === "open").map((d: any) => d.id)
                              );
                              setQuoteDialogOpen(true);
                            }}
                          >
                            <FileCheck className="h-4 w-4" />
                            Create Quote
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={handleExportCSV}
                        >
                          <FileDown className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left px-4 py-3 font-medium">Title</th>
                              <th className="text-left px-4 py-3 font-medium">Severity</th>
                              <th className="text-left px-4 py-3 font-medium">System</th>
                              <th className="text-left px-4 py-3 font-medium">Status</th>
                              <th className="text-right px-4 py-3 font-medium">Est. Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deficiencies.map((def: any) => {
                              const cost = def.estimatedCost != null ? parseFloat(String(def.estimatedCost)) : null;
                              return (
                                <tr key={def.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                  <td className="px-4 py-3">
                                    <p className="font-medium">{def.title}</p>
                                    {def.observedIssue && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{def.observedIssue}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      def.severity === 'critical' ? 'severity-critical' :
                                      def.severity === 'major' ? 'severity-major' :
                                      def.severity === 'minor' ? 'severity-minor' :
                                      'severity-observation'
                                    }`}>{def.severity}</span>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground text-xs">
                                    {def.systemCategory ? def.systemCategory.replace(/_/g, ' ') : '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      def.status === 'open' ? 'status-fail' :
                                      def.status === 'in_progress' ? 'bg-accent/10 text-accent' :
                                      def.status === 'resolved' || def.status === 'closed' ? 'status-pass' :
                                      'status-na'
                                    }`}>{def.status?.replace(/_/g, ' ')}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    {cost != null && !isNaN(cost) && cost > 0
                                      ? `$${cost.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : <span className="text-muted-foreground">—</span>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {totalCost > 0 && (
                            <tfoot>
                              <tr className="border-t bg-muted/50 font-semibold">
                                <td colSpan={4} className="px-4 py-3 text-right">Total Estimated Cost</td>
                                <td className="px-4 py-3 text-right font-mono">
                                  ${totalCost.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          <TabsContent value="work-order" className="space-y-4">
            {!workOrder ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground">No work order linked to this job.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Header info */}
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        {workOrder.workOrderNumber}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">{workOrder.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {workOrder.finalizedAt ? (
                        <Badge variant="secondary" className="text-xs">Finalized</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            if (woEditMode) {
                              setWoEditMode(false);
                            } else {
                              setWoOfficeNotes(workOrder.officeNotes ?? "");
                              setWoPriority(workOrder.priority);
                              setWoWorkType(workOrder.workType);
                              setWoEstimatedHours(workOrder.estimatedHours ?? "");
                              setWoEditMode(true);
                            }
                          }}
                        >
                          {woEditMode ? "Cancel" : "Edit"}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Status row */}
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        workOrder.status === "completed" ? "status-pass" :
                        workOrder.status === "in_progress" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                        workOrder.status === "cancelled" ? "status-fail" :
                        "bg-muted text-muted-foreground"
                      }`}>{workOrder.status.replace(/_/g, " ")}</span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        workOrder.priority === "urgent" ? "severity-critical" :
                        workOrder.priority === "high" ? "severity-major" :
                        workOrder.priority === "medium" ? "severity-minor" :
                        "bg-muted text-muted-foreground"
                      }`}>{workOrder.priority}</span>
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-accent/10 text-accent">
                        {workOrder.workType.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Edit form or read view */}
                    {woEditMode ? (
                      <div className="space-y-4 pt-1">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Priority</Label>
                            <Select value={woPriority} onValueChange={setWoPriority}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Work Type</Label>
                            <Select value={woWorkType} onValueChange={setWoWorkType}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="inspection">Inspection</SelectItem>
                                <SelectItem value="repair">Repair</SelectItem>
                                <SelectItem value="service_call">Service Call</SelectItem>
                                <SelectItem value="maintenance">Maintenance</SelectItem>
                                <SelectItem value="emergency">Emergency</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Estimated Hours</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={woEstimatedHours}
                            onChange={(e) => setWoEstimatedHours(e.target.value)}
                            placeholder="e.g. 2.5"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Office Notes</Label>
                          <Textarea
                            value={woOfficeNotes}
                            onChange={(e) => setWoOfficeNotes(e.target.value)}
                            placeholder="Internal notes for the office..."
                            rows={3}
                          />
                        </div>
                        <Button
                          className="gap-1.5"
                          disabled={updateWorkOrderMutation.isPending}
                          onClick={() =>
                            updateWorkOrderMutation.mutate({
                              id: workOrder.id,
                              priority: woPriority as any,
                              workType: woWorkType as any,
                              estimatedHours: woEstimatedHours ? parseFloat(woEstimatedHours) : null,
                              officeNotes: woOfficeNotes,
                            })
                          }
                        >
                          {updateWorkOrderMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save Changes
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Scheduled</p>
                          <p className="mt-0.5">{workOrder.scheduledDate ? new Date(workOrder.scheduledDate).toLocaleDateString() : "—"}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Estimated Hours</p>
                          <p className="mt-0.5 flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {workOrder.estimatedHours ? `${parseFloat(workOrder.estimatedHours).toFixed(1)} h` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Actual Hours</p>
                          <p className="mt-0.5 flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {workOrder.actualHours ? `${parseFloat(workOrder.actualHours).toFixed(1)} h` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Total</p>
                          <p className="mt-0.5 font-mono">
                            {parseFloat(workOrder.total) > 0
                              ? `$${parseFloat(workOrder.total).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`
                              : "—"}
                          </p>
                        </div>
                        {workOrder.officeNotes && (
                          <div className="col-span-2">
                            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Office Notes</p>
                            <p className="mt-0.5 text-sm whitespace-pre-line">{workOrder.officeNotes}</p>
                          </div>
                        )}
                        {workOrder.techNotes && (
                          <div className="col-span-2">
                            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Tech Notes</p>
                            <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{workOrder.techNotes}</p>
                          </div>
                        )}
                        {workOrder.completionSummary && (
                          <div className="col-span-2">
                            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Completion Summary</p>
                            <p className="mt-0.5 text-sm whitespace-pre-line">{workOrder.completionSummary}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Line Items — repair WOs with accepted quote */}
                {workOrder.lineItems && (workOrder.lineItems as any[]).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Line Items</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-4 py-2 font-medium">Description</th>
                            <th className="text-right px-4 py-2 font-medium">Qty</th>
                            <th className="text-right px-4 py-2 font-medium">Unit Cost</th>
                            <th className="text-right px-4 py-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(workOrder.lineItems as any[]).map((item: any, i: number) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-4 py-2">{item.description}</td>
                              <td className="px-4 py-2 text-right font-mono">{item.qty}</td>
                              <td className="px-4 py-2 text-right font-mono">${parseFloat(item.unitCost).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-mono">${(item.qty * item.unitCost).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/50 font-semibold">
                            <td colSpan={3} className="px-4 py-2 text-right">Total</td>
                            <td className="px-4 py-2 text-right font-mono">${parseFloat(workOrder.total).toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </CardContent>
                  </Card>
                )}

                {/* Materials used by tech */}
                {workOrder.materialsUsed && (workOrder.materialsUsed as any[]).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Materials Used</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-4 py-2 font-medium">Description</th>
                            <th className="text-right px-4 py-2 font-medium">Qty</th>
                            <th className="text-right px-4 py-2 font-medium">Unit Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(workOrder.materialsUsed as any[]).map((m: any, i: number) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-4 py-2">{m.description}</td>
                              <td className="px-4 py-2 text-right font-mono">{m.qty}</td>
                              <td className="px-4 py-2 text-right font-mono">${parseFloat(m.unitCost).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                    accept=".xlsx,.xlsm,.xls,.csv,.pdf,.jpg,.jpeg,.png"
                  />
                  <div className="flex flex-col gap-1">
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                        <Upload className="h-4 w-4 mr-2" />
                        Choose File
                      </div>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Accepted: .xlsx, .xlsm, .xls, .csv, .pdf, .jpg, .jpeg, .png
                    </p>
                  </div>
                  {selectedFile && (
                    <>
                      <span className="text-sm text-muted-foreground">{selectedFile.name}</span>
                      <Button 
                        onClick={handleUpload} 
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          "Upload"
                        )}
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Accepted formats: Excel (.xlsx, .xlsm, .csv), PDF, Images (JPG, PNG). Max size: 50MB
                </p>
              </CardContent>
            </Card>

            {/* Files List */}
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Files</CardTitle>
              </CardHeader>
              <CardContent>
                {filesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : files && files.length > 0 ? (
                  <div className="space-y-2">
                    {files.map((file: any) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType)}
                          <div>
                            <p className="text-sm font-medium">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              Uploaded {new Date(file.createdAt).toLocaleDateString()} by User #{file.uploadedById}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getImportStatusBadge(file.importStatus)}
                          {isExcelFile(file.mimeType, file.fileName) && file.importStatus === "none" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => previewImportMutation.mutate({ fileId: file.id })}
                                disabled={previewImportMutation.isPending}
                              >
                                {previewImportMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Eye className="h-4 w-4 mr-1" />
                                    Preview Import
                                  </>
                                )}
                              </Button>
                              {previewData && previewData.availableSheets && (
                                <div className="flex items-center gap-2">
                                  <select
                                    className="text-sm border rounded px-2 py-1"
                                    value={selectedSheets[0] || ""}
                                    onChange={(e) => {
                                      const newSheet = e.target.value;
                                      setSelectedSheets([newSheet]);
                                      // Refresh preview with new sheet
                                      previewImportMutation.mutate({ fileId: file.id, sheetName: newSheet });
                                    }}
                                  >
                                    {previewData.availableSheets.map((sheet: any) => (
                                      <option key={sheet.name} value={sheet.name}>
                                        {sheet.name} {sheet.isDevice ? "✓" : "(excluded)"} ({sheet.rowCount} rows)
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => importMutation.mutate({ 
                                  fileId: file.id,
                                  siteId: job.siteId,
                                  jobId: job.id,
                                  selectedSheets: selectedSheets.length > 0 ? selectedSheets : undefined
                                })}
                                disabled={importMutation.isPending}
                              >
                                {importMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Import Devices"
                                )}
                              </Button>
                            </>
                          )}
                          <a href={file.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No files uploaded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Hash Verify Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Record Integrity Verification
            </DialogTitle>
            <DialogDescription>
              Recomputes the SHA-256 finalization hash and compares it to the stored value.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!verifyResult ? (
              <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Verifying record integrity...</span>
              </div>
            ) : verifyResult.error ? (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <ShieldX className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-destructive">Verification Error</p>
                  <p className="text-sm text-destructive mt-1">{verifyResult.error}</p>
                </div>
              </div>
            ) : verifyResult.hashMatch ? (
              <div className="flex items-start gap-3 rounded-lg border border-[var(--success)]/20 bg-[var(--success)]/5 p-4">
                <CheckCircle2 className="h-5 w-5 text-[var(--success)] mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-[var(--success)]">Integrity Confirmed</p>
                  <p className="text-sm text-[var(--success)] mt-1">{verifyResult.message}</p>
                  <p className="text-xs text-[var(--success)] mt-2 font-mono break-all">{verifyResult.storedHash}</p>
                  {verifyResult.finalizedAt && (
                    <p className="text-xs text-[var(--success)] mt-1">Sealed: {new Date(verifyResult.finalizedAt).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-destructive">Hash Mismatch — Record May Be Tampered</p>
                    <p className="text-sm text-destructive mt-1">{verifyResult.message}</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 space-y-2 text-xs font-mono">
                  <div>
                    <p className="text-muted-foreground font-sans font-medium">Stored hash:</p>
                    <p className="break-all text-foreground">{verifyResult.storedHash}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-sans font-medium">Recomputed hash:</p>
                    <p className="break-all text-destructive">{verifyResult.recomputedHash}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Re-inspect Confirmation Dialog */}
      <Dialog open={reInspectDialogOpen} onOpenChange={setReInspectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-[var(--warning)]" />
              Create Re-inspect Job
            </DialogTitle>
            <DialogDescription>
              This will create a new draft job copied from the current one. The following will be carried over:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Site and customer organisation</li>
              <li>Job type, priority, and description</li>
              <li>Assigned technician (if any)</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Inspection results, deficiencies, and reports are <strong>not</strong> copied — the new job starts as a clean draft.
            </p>
            {job && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Source: {job.title}</p>
                <p className="text-muted-foreground">Job #{job.id} &middot; {job.status}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setReInspectDialogOpen(false)} disabled={cloneMutation.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-[var(--warning)] hover:bg-[var(--warning)]/90 text-white"
              onClick={() => cloneMutation.mutate({ jobId: parseInt(jobId!) })}
              disabled={cloneMutation.isPending}
            >
              {cloneMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" />Create Re-inspect Job</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Quote Dialog */}
      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-destructive" />
              Create Repair Quote
            </DialogTitle>
            <DialogDescription>
              Select deficiencies to include in the quote. Line items will be pre-populated from estimated costs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Deficiency checkboxes */}
            <div className="space-y-2">
              {(deficiencies ?? []).filter((d: any) => d.status !== "resolved" && d.status !== "closed").map((def: any) => {
                const cost = def.estimatedCost != null ? parseFloat(String(def.estimatedCost)) : 0;
                const checked = selectedDeficiencyIds.includes(def.id);
                return (
                  <div
                    key={def.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
                    onClick={() =>
                      setSelectedDeficiencyIds((prev) =>
                        prev.includes(def.id) ? prev.filter((id) => id !== def.id) : [...prev, def.id]
                      )
                    }
                  >
                    <Checkbox checked={checked} onCheckedChange={() => {}} className="mt-0.5 pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{def.title}</p>
                      {def.observedIssue && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{def.observedIssue}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium ${
                          def.severity === "critical" ? "text-red-600" :
                          def.severity === "major" ? "text-orange-600" :
                          "text-yellow-600"
                        }`}>{def.severity}</span>
                        {cost > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Est. ${cost.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Additional notes for the customer..."
              />
            </div>

            {/* Total preview */}
            {selectedDeficiencyIds.length > 0 && (() => {
              const total = (deficiencies ?? [])
                .filter((d: any) => selectedDeficiencyIds.includes(d.id))
                .reduce((sum: number, d: any) => sum + (d.estimatedCost ? parseFloat(String(d.estimatedCost)) : 0), 0);
              return (
                <p className="text-sm font-medium text-right">
                  Estimated Total: ${total.toFixed(2)}
                </p>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setQuoteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={selectedDeficiencyIds.length === 0 || createQuoteMutation.isPending}
                onClick={() =>
                  createQuoteMutation.mutate({
                    jobId: parseInt(jobId!),
                    deficiencyIds: selectedDeficiencyIds,
                    notes: quoteNotes || undefined,
                  })
                }
              >
                {createQuoteMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><FileCheck className="h-4 w-4 mr-2" />Create Quote</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Job Edit Dialog */}
      <Dialog open={jobEditOpen} onOpenChange={setJobEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Job
            </DialogTitle>
            <DialogDescription>
              Update job details. Status changes and finalization are managed separately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={jobEditTitle} onChange={(e) => setJobEditTitle(e.target.value)} placeholder="Job title" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Job Type</Label>
                <Select value={jobEditJobType} onValueChange={setJobEditJobType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="service_call">Service Call</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={jobEditPriority} onValueChange={setJobEditPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={jobEditScheduledDate}
                onChange={(e) => setJobEditScheduledDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={jobEditDescription}
                onChange={(e) => setJobEditDescription(e.target.value)}
                placeholder="Job description..."
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={jobEditNotes}
                onChange={(e) => setJobEditNotes(e.target.value)}
                placeholder="Internal notes..."
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setJobEditOpen(false)} disabled={updateJobMutation.isPending}>
                Cancel
              </Button>
              <Button
                disabled={!jobEditTitle.trim() || updateJobMutation.isPending}
                onClick={() =>
                  updateJobMutation.mutate({
                    id: parseInt(jobId!),
                    title: jobEditTitle.trim(),
                    description: jobEditDescription || undefined,
                    notes: jobEditNotes || undefined,
                    jobType: jobEditJobType as any,
                    priority: jobEditPriority as any,
                    scheduledDate: jobEditScheduledDate ? new Date(jobEditScheduledDate) : undefined,
                  })
                }
              >
                {updateJobMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Save Changes</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
