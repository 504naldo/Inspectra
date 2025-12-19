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
  Clock
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

  const { data: jobs } = trpc.job.listByCompany.useQuery({
    companyId,
    status: 'completed'
  });

  // For now, we'll list reports by iterating through jobs
  // In a real app, you'd have a dedicated reports list endpoint

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

  const createReport = trpc.report.create.useMutation({
    onSuccess: () => {
      toast.success('Report created');
      setIsCreateOpen(false);
      setSelectedJobId("");
      setReportTitle("");
      setExecutiveSummary("");
    },
    onError: () => {
      toast.error('Failed to create report');
    }
  });

  const handleGenerateSummary = () => {
    if (!selectedJobId) {
      toast.error('Please select a job first');
      return;
    }
    generateSummary.mutate({ jobId: parseInt(selectedJobId) });
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="status-pass flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
      case 'sent':
        return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">Sent</span>;
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
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
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
                    className="min-h-[200px]"
                  />
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleCreateReport}
                  disabled={createReport.isPending}
                >
                  {createReport.isPending ? 'Creating...' : 'Create Report'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Completed Jobs for Reports */}
        <Card>
          <CardHeader>
            <CardTitle>Completed Inspections</CardTitle>
            <CardDescription>Generate reports from completed jobs</CardDescription>
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
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedJobId(job.id.toString());
                          setReportTitle(`${job.title} - Inspection Report`);
                          setIsCreateOpen(true);
                        }}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Generate
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
    </AdminLayout>
  );
}
