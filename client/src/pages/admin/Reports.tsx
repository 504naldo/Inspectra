import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FileText,
  Plus,
  Download,
  Sparkles,
  Loader2,
  ChevronRight,
  CheckCircle2,
  Clock,
  FileDown,
  ExternalLink,
  Mail,
  AlertCircle,
  HardDrive
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

// ── Recipient suggestion for report email ─────────────────────────────────────

function ReportRecipientSuggestion({
  jobId,
  jobs,
  onSelect,
}: {
  jobId: number | null;
  jobs: any[] | undefined;
  onSelect: (email: string) => void;
}) {
  const job = useMemo(() => jobs?.find((j: any) => j.id === jobId), [jobs, jobId]);
  const { data } = trpc.contact.getRecipientsForWorkflow.useQuery(
    {
      customerOrgId: job?.customerOrgId ?? undefined,
      siteId: job?.siteId ?? undefined,
      workflowType: "report",
    },
    { enabled: !!(job?.customerOrgId || job?.siteId) },
  );

  const suggestions = [...(data?.recommended ?? []), ...(data?.fallback ?? [])].filter((c) => c.email);
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50 dark:bg-cyan-950/20 dark:border-cyan-800 p-3 space-y-1.5">
      <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-300 uppercase tracking-wide">Suggested recipients</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.email!)}
            className="text-xs bg-card dark:bg-cyan-900/40 border border-cyan-200 dark:border-cyan-700 rounded px-2 py-1 hover:bg-cyan-100 dark:hover:bg-cyan-800/40 transition-colors text-left"
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-muted-foreground ml-1">· {c.email}</span>
          </button>
        ))}
      </div>
      {data?.warnings && data.warnings.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{data.warnings[0]}</p>
      )}
    </div>
  );
}

export default function AdminReports() {
  const { user } = useAuth();

  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Reports">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground">Loading session...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const companyId = user.companyId;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [reportTitle, setReportTitle] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [generatedReportNumber, setGeneratedReportNumber] = useState<string | null>(null);
  const [generatedReportId, setGeneratedReportId] = useState<number | null>(null);
  const [generatedDriveUrl, setGeneratedDriveUrl] = useState<string | null>(null);
  const [driveSavedJobIds, setDriveSavedJobIds] = useState<Set<number>>(new Set());
  const [reportType, setReportType] = useState<'deficiency' | 'compliance'>('deficiency');
  const [allowMissingLocations, setAllowMissingLocations] = useState(false);

  // Email dialog state
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  // Track the active job/report when emailing an existing (pre-generated) report
  const [activeEmailJobId, setActiveEmailJobId] = useState<number | null>(null);

  const { data: jobs, refetch: refetchJobs } = trpc.job.listByCompany.useQuery({
    companyId,
    status: 'completed'
  });

  const { data: allReports, refetch: refetchReports } = trpc.report.listByCompany.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Gmail connection check
  const { data: gmailConnection } = trpc.gmail.checkConnection.useQuery();

  // Drive connection check
  const { data: driveConnection } = trpc.drive.checkConnection.useQuery();

  const generateSummary = trpc.ai.generateReportSummary.useMutation({
    onSuccess: (data) => {
      const summaryText = data.executiveSummary.join('\n\n') +
        '\n\nSystem Status: ' + data.systemStatus +
        '\n\nPriority Items:\n' + data.priorityItems.map((p: string) => '• ' + p).join('\n') +
        '\n\nNext Steps:\n' + data.nextSteps.map((s: string) => '• ' + s).join('\n');
      setExecutiveSummary(summaryText);
      toast.success('AI summary generated');
    },
    onError: () => {
      toast.error('Failed to generate summary');
    }
  });

  // Phase 2: Use new explicit endpoints
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const generateDeficiencyReport = trpc.deficiencyReport.generate.useMutation({
    onSuccess: (data) => {
      setGeneratedPdfUrl(data.fileUrl);
      setGeneratedReportNumber(data.reportNumber);
      setGeneratedReportId(data.reportId);
      const dUrl = (data as any).driveUrl ?? null;
      setGeneratedDriveUrl(dUrl);
      if (dUrl && selectedJobId) {
        setDriveSavedJobIds(prev => new Set(prev).add(parseInt(selectedJobId)));
      }
      toast.success('Deficiency report generated successfully!');
      refetchJobs();
    },
    onError: (error) => {
      setValidationError(error.message);
      setShowErrorModal(true);
      toast.error('Failed to generate deficiency report');
    }
  });

  const generateAnnualReport = trpc.annualReport.generate.useMutation({
    onSuccess: (data) => {
      setGeneratedPdfUrl(data.fileUrl);
      setGeneratedReportNumber(data.reportNumber);
      setGeneratedReportId(data.reportId);
      const dUrl = (data as any).driveUrl ?? null;
      setGeneratedDriveUrl(dUrl);
      if (dUrl && selectedJobId) {
        setDriveSavedJobIds(prev => new Set(prev).add(parseInt(selectedJobId)));
      }
      toast.success('Annual inspection report generated successfully!');
      refetchJobs();
    },
    onError: (error) => {
      setValidationError(error.message);
      setShowErrorModal(true);
      toast.error('Failed to generate annual report');
    }
  });

  const createReport = trpc.report.create.useMutation({
    onSuccess: () => {
      toast.success('Report created');
      setIsCreateOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error('Failed to create report');
    }
  });

  const sendReport = trpc.gmail.sendReport.useMutation({
    onSuccess: () => {
      toast.success('Report emailed successfully!');
      setIsEmailOpen(false);
      setEmailTo("");
      setActiveEmailJobId(null);
      refetchReports();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send email');
    }
  });

  const saveReportToDrive = trpc.drive.saveReport.useMutation({
    onSuccess: (data) => {
      setGeneratedDriveUrl(data.driveUrl);
      if (selectedJobId) {
        setDriveSavedJobIds(prev => new Set(prev).add(parseInt(selectedJobId)));
      }
      if (data.alreadySaved) {
        toast.success('Already saved to Drive');
      } else {
        toast.success('Saved to Google Drive!');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save to Drive');
    }
  });

  const resetForm = () => {
    setSelectedJobId("");
    setReportTitle("");
    setExecutiveSummary("");
    setGeneratedPdfUrl(null);
    setGeneratedReportNumber(null);
    setGeneratedReportId(null);
    setGeneratedDriveUrl(null);
  };

  const handleGenerateSummary = () => {
    if (!selectedJobId) {
      toast.error('Please select a job first');
      return;
    }
    generateSummary.mutate({ jobId: parseInt(selectedJobId) });
  };

  const handleGeneratePDF = () => {
    if (!selectedJobId) {
      toast.error('Please select a job first');
      return;
    }

    // Phase 2: Use explicit endpoints
    if (reportType === 'compliance') {
      generateAnnualReport.mutate({
        jobId: parseInt(selectedJobId),
      });
    } else {
      generateDeficiencyReport.mutate({
        jobId: parseInt(selectedJobId),
        summary: executiveSummary || undefined,
        allowMissingLocations: allowMissingLocations || undefined,
      });
    }
  };

  const handleCreateReport = () => {
    if (!selectedJobId || !reportTitle) {
      toast.error('Please fill in required fields');
      return;
    }
    createReport.mutate({
      jobId: parseInt(selectedJobId),
      title: reportTitle,
      executiveSummary: executiveSummary || undefined,
    });
  };

  const handleDownloadPDF = () => {
    if (generatedPdfUrl) {
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = generatedPdfUrl;
      link.download = `Fire-Inspection-Report-${new Date().toISOString().split('T')[0]}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const buildEmailBody = (siteName: string, jobNumber: string, reportNumber: string, inspectionDate: string) =>
`Dear Property Manager,

Please find attached the inspection report for ${siteName}.

Job Number: ${jobNumber}
Report Number: ${reportNumber}
Inspection Date: ${inspectionDate}

If you have any questions regarding this report, please don't hesitate to contact us.

Best regards,
${user?.name || "Inspectra Team"}
EWF Fire & Security`;

  const handleOpenEmailDialog = () => {
    // Pre-fill from the just-generated report (generate flow)
    const selectedJob = jobs?.find((j: any) => j.id.toString() === selectedJobId);
    const siteName = selectedJob?.title || "Inspection";
    const jobNumber = selectedJob?.jobNumber || "";
    const reportNumber = generatedReportNumber || "";
    const inspectionDate = selectedJob?.completedAt
      ? new Date(selectedJob.completedAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
      : new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

    setActiveEmailJobId(parseInt(selectedJobId));
    setEmailSubject(`Inspection Report - ${siteName} - ${reportNumber}`);
    setEmailBody(buildEmailBody(siteName, jobNumber, reportNumber, inspectionDate));
    setEmailTo("");
    setIsEmailOpen(true);
  };

  const handleEmailExistingReport = (r: NonNullable<typeof allReports>[number]) => {
    // Pre-fill from an existing report row (list flow)
    const siteName = r.siteName || r.jobTitle || "Inspection";
    const reportNumber = r.reportNumber || "";
    const inspectionDate = new Date(r.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

    setActiveEmailJobId(r.jobId);
    setGeneratedReportId(r.id);
    setGeneratedReportNumber(reportNumber);
    setEmailTo(r.contactEmail || "");
    setEmailSubject(`Inspection Report - ${siteName} - ${reportNumber}`);
    setEmailBody(buildEmailBody(siteName, r.jobNumber || "", reportNumber, inspectionDate));
    setIsEmailOpen(true);
  };

  const handleSendEmail = () => {
    if (!emailTo || !emailSubject || !emailBody) {
      toast.error('Please fill in all required fields');
      return;
    }
    const jobId = activeEmailJobId ?? (selectedJobId ? parseInt(selectedJobId) : null);
    if (!generatedReportId || !jobId) {
      toast.error('No report selected');
      return;
    }
    sendReport.mutate({
      jobId,
      reportId: generatedReportId,
      recipientEmail: emailTo,
      subject: emailSubject,
      body: emailBody,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="status-pass flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
      case 'sent':
        return <span className="bg-accent/10 text-accent px-2 py-0.5 rounded text-xs">Sent</span>;
      case 'generated':
        return <span className="status-pending flex items-center gap-1"><Clock className="h-3 w-3" /> Generated</span>;
      default:
        return <span className="status-na">Draft</span>;
    }
  };

  return (
    <AdminLayout title="Reports">
      <div className="space-y-6">
        {/* Actions */}
        <div className="flex justify-end">
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Generate Inspection Report</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Select Completed Job *</Label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a completed job" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs?.map((job: any) => (
                        <SelectItem key={job.id} value={job.id.toString()}>
                          {job.jobNumber} - {job.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Report Title *</Label>
                  <Input
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    placeholder="e.g., Annual Fire Alarm Inspection Report"
                  />
                </div>

                {/* Report Type Selector */}
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <Label className="text-base font-medium">Report Type</Label>
                  <div className="space-y-2">
                    <div
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        reportType === 'deficiency'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => setReportType('deficiency')}
                    >
                      <input
                        type="radio"
                        name="reportType"
                        value="deficiency"
                        checked={reportType === 'deficiency'}
                        onChange={() => setReportType('deficiency')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium mb-1">Deficiency Report (Quote)</div>
                        <p className="text-sm text-muted-foreground">
                          Professional report with pricing, device tables, and repair cost estimates. Ideal for providing quotes to clients.
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        reportType === 'compliance'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => setReportType('compliance')}
                    >
                      <input
                        type="radio"
                        name="reportType"
                        value="compliance"
                        checked={reportType === 'compliance'}
                        onChange={() => setReportType('compliance')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium mb-1">CAN/ULC-S536 Compliance Report</div>
                        <p className="text-sm text-muted-foreground">
                          Official inspection form with detailed checklists, device records, and technician certification. No pricing included.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Admin Override Toggle - Only for Deficiency Reports and Admin Users */}
                {reportType === 'deficiency' && user?.role === 'admin' && (
                  <div className="border rounded-lg p-4 bg-[var(--warning)]/5 space-y-2">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="allowMissingLocations"
                        checked={allowMissingLocations}
                        onChange={(e) => setAllowMissingLocations(e.target.checked)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="allowMissingLocations" className="font-medium text-[var(--warning)] cursor-pointer">
                          Allow missing locations (Test Mode)
                        </Label>
                        <p className="text-sm text-[var(--warning)] mt-1">
                          Admin override: Generate report even if deficiencies are missing location information.
                          Report will include warnings and a "Missing Locations" appendix.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Only show Executive Summary for Deficiency Report */}
                {reportType === 'deficiency' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Executive Summary</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateSummary}
                        disabled={generateSummary.isPending || !selectedJobId}
                      >
                        {generateSummary.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1" />
                        )}
                        AI Generate
                      </Button>
                    </div>
                    <Textarea
                      value={executiveSummary}
                      onChange={(e) => setExecutiveSummary(e.target.value)}
                      placeholder="Executive summary of the inspection..."
                      className="min-h-[200px] max-h-[300px] resize-y"
                    />
                  </div>
                )}

                {/* PDF Generation Section */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">
                        Generate {reportType === 'compliance' ? 'Compliance' : 'Deficiency'} Report
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {reportType === 'compliance'
                          ? 'CAN/ULC-S536 inspection form with checklists and device records'
                          : 'Professional report with pricing and repair estimates'
                        }
                      </p>
                    </div>
                    <Button
                      onClick={handleGeneratePDF}
                      disabled={(generateDeficiencyReport.isPending || generateAnnualReport.isPending) || !selectedJobId}
                      className="bg-primary"
                    >
                      {(generateDeficiencyReport.isPending || generateAnnualReport.isPending) ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileDown className="h-4 w-4 mr-2" />
                          Generate PDF
                        </>
                      )}
                    </Button>
                  </div>

                  {/* PDF Generated Success */}
                  {generatedPdfUrl && (
                    <div className="bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-[var(--success)] mb-2">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">PDF Generated Successfully!</span>
                      </div>
                      <p className="text-sm text-[var(--success)] mb-3">
                        Report Number: {generatedReportNumber}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadPDF}
                          className="border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success)]/10"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download PDF
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(generatedPdfUrl, '_blank')}
                          className="text-[var(--success)] hover:bg-[var(--success)]/10"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Open in New Tab
                        </Button>
                        {/* Email Report button */}
                        {gmailConnection?.connected === false ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            title="Log out and log back in to connect your Gmail account"
                            className="opacity-60"
                          >
                            <AlertCircle className="h-4 w-4 mr-1" />
                            Gmail Not Connected
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleOpenEmailDialog}
                            className="border-accent/30 text-accent hover:bg-accent/10"
                          >
                            <Mail className="h-4 w-4 mr-1" />
                            Email Report
                          </Button>
                        )}
                        {/* Drive button */}
                        {generatedDriveUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(generatedDriveUrl, '_blank')}
                            className="border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success)]/10"
                          >
                            <HardDrive className="h-4 w-4 mr-1" />
                            View in Drive
                          </Button>
                        ) : driveConnection?.connected === false ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            title="Log out and log back in to connect your Google Drive"
                            className="opacity-60"
                          >
                            <AlertCircle className="h-4 w-4 mr-1" />
                            Drive Not Connected
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={saveReportToDrive.isPending || !generatedReportId}
                            onClick={() => {
                              if (generatedReportId && selectedJobId) {
                                saveReportToDrive.mutate({
                                  reportId: generatedReportId,
                                  jobId: parseInt(selectedJobId),
                                });
                              }
                            }}
                          >
                            {saveReportToDrive.isPending ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <HardDrive className="h-4 w-4 mr-1" />
                            )}
                            Save to Drive
                          </Button>
                        )}
                      </div>
                      {gmailConnection?.connected === false && (
                        <p className="text-xs text-muted-foreground mt-2">
                          To enable email sending, log out and log back in to connect your Gmail account.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCreateReport}
                    disabled={createReport.isPending}
                  >
                    {createReport.isPending ? 'Saving...' : 'Save Report Record Only (No PDF)'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Completed Jobs for Reports */}
        <Card>
          <CardHeader>
            <CardTitle>Completed Inspections</CardTitle>
            <CardDescription>Generate PDF reports from completed jobs</CardDescription>
          </CardHeader>
          <CardContent>
            {!jobs || jobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No completed jobs available for reports
              </p>
            ) : (
              <div className="space-y-3">
                {jobs.map((job: any) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{job.title}</span>
                        {driveSavedJobIds.has(job.id) && (
                          <HardDrive
                            className="h-3.5 w-3.5 text-[var(--success)]"
                            aria-label="Report saved to Google Drive"
                          />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.jobNumber} • Completed {job.completedAt ? new Date(job.completedAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedJobId(job.id.toString());
                          setReportTitle(`${job.title} - Inspection Report`);
                          setIsCreateOpen(true);
                        }}
                      >
                        <FileDown className="h-4 w-4 mr-1" />
                        Generate PDF
                      </Button>
                      <Link href={`/tech/jobs/${job.id}`}>
                        <Button variant="ghost" size="icon">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Generated Reports */}
        <Card>
          <CardHeader>
            <CardTitle>Generated Reports</CardTitle>
            <CardDescription>All reports — download or email to client</CardDescription>
          </CardHeader>
          <CardContent>
            {!allReports || allReports.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No reports generated yet</p>
            ) : (
              <div className="space-y-2">
                {allReports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">{r.siteName || r.jobTitle}</span>
                        {getStatusBadge(r.status)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.reportNumber} · {r.jobNumber} · {new Date(r.createdAt).toLocaleDateString()}
                        {r.approvedAt && (
                          <span className="text-green-600 ml-1">
                            · Approved {new Date(r.approvedAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {r.fileUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(r.fileUrl!, '_blank')}
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {gmailConnection?.connected === false ? (
                        <Button variant="ghost" size="sm" disabled title="Gmail not connected">
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEmailExistingReport(r)}
                          className="text-accent border-accent/30 hover:bg-accent/10"
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          Email
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Phase 2: Validation Error Modal */}
      <Dialog open={showErrorModal} onOpenChange={setShowErrorModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">Report Generation Failed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono">{validationError}</pre>
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">To fix this:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>If checklist items are missing: Complete the CAN/ULC-S536 checklist for this job</li>
                <li>If device locations are missing: Add location information to all devices</li>
                <li>If deficiency locations are missing: Add location information to all deficiencies</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowErrorModal(false)}>
                Close
              </Button>
              <Button onClick={() => {
                setShowErrorModal(false);
                if (selectedJobId) {
                  window.location.href = `/tech/jobs/${selectedJobId}`;
                }
              }}>
                Go to Job Details
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Report Dialog */}
      <Dialog open={isEmailOpen} onOpenChange={setIsEmailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Report to Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <ReportRecipientSuggestion
              jobId={activeEmailJobId}
              jobs={jobs}
              onSelect={(email) => setEmailTo(email)}
            />
            <div className="space-y-2">
              <Label htmlFor="email-to">Recipient Email *</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject *</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-body">Message *</Label>
              <Textarea
                id="email-body"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="min-h-[220px] resize-y font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The report PDF ({generatedReportNumber}) will be attached automatically.
              This email is sent from your Gmail account.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEmailOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={sendReport.isPending || !emailTo}
              >
                {sendReport.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
