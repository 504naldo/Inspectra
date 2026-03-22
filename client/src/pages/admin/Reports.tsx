import { useState } from "react";
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
  ExternalLink
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AdminReports() {
  const { user } = useAuth();
  const companyId = user?.companyId || 1;
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [reportTitle, setReportTitle] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [generatedReportNumber, setGeneratedReportNumber] = useState<string | null>(null);
  const [reportType, setReportType] = useState<'deficiency' | 'compliance'>('deficiency');
  const [allowMissingLocations, setAllowMissingLocations] = useState(false);

  const { data: jobs, refetch: refetchJobs } = trpc.job.listByCompany.useQuery({
    companyId,
    status: 'completed'
  });

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

  const resetForm = () => {
    setSelectedJobId("");
    setReportTitle("");
    setExecutiveSummary("");
    setGeneratedPdfUrl(null);
    setGeneratedReportNumber(null);
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
                      <div className="flex gap-2">
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
                      </div>
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
    </AdminLayout>
  );
}
