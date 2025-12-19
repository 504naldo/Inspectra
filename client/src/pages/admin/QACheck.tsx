import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Loader2,
  FileText
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

interface QACheckProps {
  jobId: number;
}

export default function QACheck({ jobId }: QACheckProps) {
  const [, setLocation] = useLocation();
  const [qaComments, setQaComments] = useState("");
  const [qaStatus, setQaStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const { data: jobData, isLoading } = trpc.job.getWithDetails.useQuery({ id: jobId });

  // AI QA Check
  const aiQaCheck = trpc.ai.runQACheck.useMutation({
    onSuccess: () => {
      toast.success('QA analysis complete');
    },
    onError: () => {
      toast.error('Failed to run QA check');
    }
  });

  const handleRunAICheck = () => {
    if (!jobData) return;
    aiQaCheck.mutate({ jobId });
  };

  const updateJob = trpc.job.update.useMutation({
    onSuccess: () => {
      toast.success('QA status updated');
      setLocation('/admin/jobs');
    },
    onError: () => {
      toast.error('Failed to update QA status');
    }
  });

  const handleApprove = () => {
    updateJob.mutate({
      id: jobId,
      notes: `QA Approved: ${qaComments}`,
    });
  };

  const handleReject = () => {
    updateJob.mutate({
      id: jobId,
      notes: `QA Rejected: ${qaComments}`,
      status: 'in_progress',
    });
  };

  if (isLoading) {
    return (
      <AdminLayout title="QA Review">
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!jobData?.job) {
    return (
      <AdminLayout title="QA Review">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Job not found</p>
            <Link href="/admin/jobs">
              <Button className="mt-4">Back to Jobs</Button>
            </Link>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  const { job, site, devices, inspectionResults, deficiencies, stats } = jobData;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/jobs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">QA Review</h1>
            <p className="text-muted-foreground">{job.title} - {job.jobNumber}</p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold">{stats?.total || 0}</p>
              <p className="text-sm text-muted-foreground">Total Devices</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-700">{stats?.pass || 0}</p>
              <p className="text-sm text-green-600">Passed</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-700">{stats?.fail || 0}</p>
              <p className="text-sm text-red-600">Failed</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-amber-700">{deficiencies?.length || 0}</p>
              <p className="text-sm text-amber-600">Deficiencies</p>
            </CardContent>
          </Card>
        </div>

        {/* AI QA Check */}
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Quality Assurance Check
            </CardTitle>
            <CardDescription>
              Run an AI-powered analysis to identify potential issues, missing data, or inconsistencies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={handleRunAICheck}
              disabled={aiQaCheck.isPending}
            >
              {aiQaCheck.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Run QA Analysis
                </>
              )}
            </Button>

            {aiQaCheck.data && (
              <div className="space-y-4 mt-4">
                {/* Overall Assessment */}
                <div className={`p-4 rounded-lg ${
                  aiQaCheck.data.passedQA ? 'bg-green-50 border border-green-200' :
                  'bg-amber-50 border border-amber-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {aiQaCheck.data.passedQA ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    )}
                    <span className="font-semibold">
                      {aiQaCheck.data.passedQA ? 'QA Check Passed' : 'Issues Found'}
                    </span>
                  </div>
                  <p className="text-sm">
                    Site: {aiQaCheck.data.siteName} | 
                    Tested: {aiQaCheck.data.testedDevices}/{aiQaCheck.data.totalDevices} devices | 
                    Deficiencies: {aiQaCheck.data.deficienciesCount}
                  </p>
                </div>

                {/* Issues */}
                {aiQaCheck.data.issues && aiQaCheck.data.issues.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Issues Found:</h4>
                    {aiQaCheck.data.issues.map((issue: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-muted rounded">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deficiencies Review */}
        {deficiencies && deficiencies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Deficiencies</CardTitle>
              <CardDescription>Review all reported deficiencies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {deficiencies.map((def: any) => (
                <div key={def.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{def.title}</h4>
                    <Badge variant={
                      def.severity === 'critical' ? 'destructive' :
                      def.severity === 'major' ? 'default' :
                      'secondary'
                    }>
                      {def.severity}
                    </Badge>
                  </div>
                  {def.description && (
                    <p className="text-sm text-muted-foreground mb-2">{def.description}</p>
                  )}
                  {def.correctiveAction && (
                    <div className="text-sm">
                      <span className="font-medium">Corrective Action:</span> {def.correctiveAction}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* QA Decision */}
        <Card>
          <CardHeader>
            <CardTitle>QA Decision</CardTitle>
            <CardDescription>Approve or reject this inspection report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Comments</label>
              <Textarea
                placeholder="Add QA comments or notes..."
                value={qaComments}
                onChange={(e) => setQaComments(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            
            <div className="flex gap-3">
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleApprove}
                disabled={updateJob.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve Report
              </Button>
              <Button 
                variant="destructive"
                className="flex-1"
                onClick={handleReject}
                disabled={updateJob.isPending}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject & Return
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
