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
  Info,
  Copy,
  ArrowRight,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  type AiReviewResult,
  riskBadge,
  findingSeverityClass,
  FindingIcon,
} from "@/lib/aiReviewHelpers";

interface QACheckProps {
  jobId: number;
}

export default function QACheck({ jobId }: QACheckProps) {
  const [, setLocation] = useLocation();
  const [qaComments, setQaComments] = useState("");

  const { data: jobData, isLoading } = trpc.job.getWithDetails.useQuery({ id: jobId });

  const aiQaCheck = trpc.ai.runQACheck.useMutation({
    onSuccess: () => toast.success("QA analysis complete"),
    onError: () => toast.error("Failed to run QA check"),
  });

  const aiReview = trpc.aiAssistant.runReportQAReview.useMutation({
    onSuccess: () => toast.success("AI review complete"),
    onError: (e) => toast.error(e.message || "AI review failed"),
  });

  const dismissReview = trpc.aiAssistant.dismissReview.useMutation({
    onSuccess: () => { toast.success("Review dismissed"); aiReview.reset(); },
    onError: (e) => toast.error(e.message || "Failed to dismiss"),
  });

  const updateJob = trpc.job.update.useMutation({
    onSuccess: () => { toast.success("QA status updated"); setLocation("/admin/jobs"); },
    onError: () => toast.error("Failed to update QA status"),
  });

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

  const { job, deficiencies, stats } = jobData;
  const r = aiReview.data as AiReviewResult | undefined;

  return (
    <AdminLayout>
      <div className="space-y-6">
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

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold">{stats?.total || 0}</p>
              <p className="text-sm text-muted-foreground">Total Devices</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--success)]/20 bg-[var(--success)]/5">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-[var(--success)]">{stats?.pass || 0}</p>
              <p className="text-sm text-[var(--success)]">Passed</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-destructive">{stats?.fail || 0}</p>
              <p className="text-sm text-destructive">Failed</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-amber-700">{deficiencies?.length || 0}</p>
              <p className="text-sm text-amber-600">Deficiencies</p>
            </CardContent>
          </Card>
        </div>

        {/* Logic-based QA Check */}
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
            <Button onClick={() => aiQaCheck.mutate({ jobId })} disabled={aiQaCheck.isPending}>
              {aiQaCheck.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Run QA Analysis</>
              )}
            </Button>

            {aiQaCheck.data && (
              <div className="space-y-4 mt-4">
                <div className={`p-4 rounded-lg ${
                  aiQaCheck.data.passedQA
                    ? "bg-[var(--success)]/5 border border-[var(--success)]/20"
                    : "bg-amber-50 border border-amber-200"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {aiQaCheck.data.passedQA
                      ? <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
                      : <AlertTriangle className="h-5 w-5 text-amber-600" />
                    }
                    <span className="font-semibold">
                      {aiQaCheck.data.passedQA ? "QA Check Passed" : "Issues Found"}
                    </span>
                  </div>
                  <p className="text-sm">
                    Site: {aiQaCheck.data.siteName} |{" "}
                    Tested: {aiQaCheck.data.testedDevices}/{aiQaCheck.data.totalDevices} devices |{" "}
                    Deficiencies: {aiQaCheck.data.deficienciesCount}
                  </p>
                </div>
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

        {/* LLM-powered AI Report Review */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Report Review
            </CardTitle>
            <CardDescription>
              LLM-powered review: completion gaps, deficiency quality, compliance risk, and suggested QA note.
              Advisory only — no records are changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => aiReview.mutate({ jobId })}
              disabled={aiReview.isPending}
              variant="outline"
            >
              {aiReview.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Run AI Review</>
              )}
            </Button>

            {r && (
              <div className="space-y-4 mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Risk level:</span>
                  {riskBadge(r.riskLevel)}
                </div>
                <div className="rounded-md border p-3 bg-muted/30 text-sm">{r.summary}</div>

                {r.findings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Findings ({r.findings.length})</p>
                    {(["blocker", "warning", "info"] as const).map((sev) =>
                      r.findings.filter((f) => f.severity === sev).map((f, i) => (
                        <div key={`${sev}-${i}`} className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${findingSeverityClass(f.severity)}`}>
                          <FindingIcon severity={f.severity} />
                          <span>{f.issue}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {r.missingDataWarnings.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Missing data</p>
                    {r.missingDataWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Info className="h-3 w-3 shrink-0 mt-0.5" /><span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {r.suggestedQaNote && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Suggested QA note</p>
                    <div className="rounded-md border p-3 bg-muted/30 text-xs whitespace-pre-wrap">{r.suggestedQaNote}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { navigator.clipboard.writeText(r.suggestedQaNote!); toast.success("Copied"); }}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy note
                    </Button>
                  </div>
                )}

                {r.suggestedActions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Suggested actions</p>
                    <ul className="space-y-1">
                      {r.suggestedActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-primary" /><span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    disabled={dismissReview.isPending}
                    onClick={() => dismissReview.mutate({ reviewId: r.reviewId })}
                  >
                    {dismissReview.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                    Dismiss this review
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
                      def.severity === "critical" ? "destructive" :
                      def.severity === "major" ? "default" :
                      "secondary"
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
                className="flex-1 bg-[var(--success)] hover:bg-[var(--success)]/90"
                onClick={() => updateJob.mutate({ id: jobId, notes: `QA Approved: ${qaComments}` })}
                disabled={updateJob.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve Report
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => updateJob.mutate({ id: jobId, notes: `QA Rejected: ${qaComments}`, status: "in_progress" })}
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
