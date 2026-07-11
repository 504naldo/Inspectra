import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  ClipboardList,
  ExternalLink,
  Camera,
  Eye,
  EyeOff,
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
  const { data: jobMedia = [] } = trpc.media.getMediaForJob.useQuery({ jobId }, { enabled: !!jobId });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const photosByDefId = useMemo(() => {
    const m = new Map<number, typeof jobMedia>();
    for (const p of jobMedia) {
      const arr = m.get(p.entityId) ?? [];
      arr.push(p);
      m.set(p.entityId, arr);
    }
    return m;
  }, [jobMedia]);

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

  const { data: templateSummaries = [] } = trpc.inspectionTemplate.getReportResponseSummary.useQuery(
    { jobId },
    { enabled: !!jobId, staleTime: 60_000 }
  );

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
              <CardDescription>Review all reported deficiencies and attached photos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {deficiencies.map((def: any) => {
                const photos = photosByDefId.get(def.id) ?? [];
                const hasNoPhoto = def.severity === "critical" && photos.length === 0;
                return (
                  <div key={def.id} className={`border rounded-lg overflow-hidden ${hasNoPhoto ? "border-amber-300" : ""}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium">{def.title}</h4>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {hasNoPhoto && (
                            <span className="flex items-center gap-1 text-xs text-amber-600">
                              <Camera className="h-3 w-3" /> No photo
                            </span>
                          )}
                          <Badge variant={
                            def.severity === "critical" ? "destructive" :
                            def.severity === "major" ? "default" :
                            "secondary"
                          }>
                            {def.severity}
                          </Badge>
                        </div>
                      </div>
                      {def.description && (
                        <p className="text-sm text-muted-foreground mb-2">{def.description}</p>
                      )}
                      {def.correctiveAction && (
                        <div className="text-sm mb-2">
                          <span className="font-medium">Corrective Action:</span> {def.correctiveAction}
                        </div>
                      )}
                    </div>

                    {/* Photo gallery */}
                    {photos.length > 0 && (
                      <div className="border-t bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <Camera className="h-3 w-3" /> {photos.length} photo{photos.length !== 1 ? "s" : ""}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {photos.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <img
                                src={photo.fileUrl}
                                alt={photo.caption || photo.fileName}
                                className="h-20 w-20 object-cover rounded cursor-pointer border"
                                onClick={() => setLightboxUrl(photo.fileUrl)}
                              />
                              <div className="absolute top-0.5 right-0.5">
                                {photo.isCustomerFacing ? (
                                  <Eye className="h-3 w-3 text-green-500 drop-shadow" />
                                ) : (
                                  <EyeOff className="h-3 w-3 text-muted-foreground drop-shadow" />
                                )}
                              </div>
                              {photo.caption && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 w-20 truncate">{photo.caption}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

        {/* Template Inspection Summary */}
        {templateSummaries.length > 0 && (
          <div className="space-y-4">
            {templateSummaries.map((tmpl) => {
              const failedNoDeficiency = tmpl.sections
                .flatMap((s: any) => s.items)
                .filter((i: any) => {
                  const v = (i.responseValue ?? "").toLowerCase();
                  return (v === "fail" || v === "no") && !i.deficiencyId;
                });
              const hasWarnings = tmpl.unansweredRequiredItems > 0 || failedNoDeficiency.length > 0;

              return (
                <Card key={tmpl.templateId} className={hasWarnings ? "border-amber-300" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        {tmpl.templateName}
                      </CardTitle>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs capitalize">{tmpl.systemType.replace(/_/g, " ")}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{tmpl.inspectionType}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <Progress value={tmpl.completionPercent} className="flex-1 h-2" />
                      <span className="text-xs text-muted-foreground shrink-0">
                        {tmpl.completionPercent}% ({tmpl.answeredItems}/{tmpl.totalItems})
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Stats row */}
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span className="flex items-center gap-1 text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Pass: {tmpl.passCount}
                      </span>
                      <span className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-3.5 w-3.5" />
                        Fail: {tmpl.failCount}
                      </span>
                      <span className="text-muted-foreground">N/A: {tmpl.naCount}</span>
                    </div>

                    {/* Warning banners */}
                    {tmpl.unansweredRequiredItems > 0 && (
                      <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {tmpl.unansweredRequiredItems} required item{tmpl.unansweredRequiredItems !== 1 ? "s" : ""} not answered
                      </div>
                    )}
                    {failedNoDeficiency.length > 0 && (
                      <div className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 text-red-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          {failedNoDeficiency.length} failed response{failedNoDeficiency.length !== 1 ? "s" : ""} without linked deficiency:{" "}
                          {failedNoDeficiency.slice(0, 3).map((i: any) => i.questionText.slice(0, 50)).join("; ")}
                          {failedNoDeficiency.length > 3 ? ` +${failedNoDeficiency.length - 3} more` : ""}
                        </span>
                      </div>
                    )}

                    {/* Section breakdown */}
                    {tmpl.sections.map((sec: any) => {
                      const secAnswered = sec.items.filter((i: any) => i.responseValue || i.responseText).length;
                      return (
                        <div key={sec.sectionId} className="border rounded-md overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 text-xs font-medium">
                            <span>{sec.sectionTitle}</span>
                            <span className="text-muted-foreground">{secAnswered}/{sec.items.length}</span>
                          </div>
                          <div className="divide-y">
                            {sec.items.map((item: any, idx: any) => {
                              const v = (item.responseValue ?? "").toLowerCase();
                              const isFail = v === "fail" || v === "no";
                              const isMissing = !item.responseValue && !item.responseText;
                              return (
                                <div
                                  key={idx}
                                  className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                                    isFail ? "bg-red-50" : isMissing && item.isRequired ? "bg-amber-50" : ""
                                  }`}
                                >
                                  <span className="flex-1 truncate text-muted-foreground">{item.questionText}</span>
                                  {isFail ? (
                                    <Badge variant="destructive" className="text-xs px-1.5 py-0.5 h-5">Fail</Badge>
                                  ) : isMissing && item.isRequired ? (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-5 border-amber-400 text-amber-700">Missing</Badge>
                                  ) : item.responseValue ? (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-5 border-green-400 text-green-700 capitalize">{item.responseValue}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                  {item.deficiencyId && (
                                    <span className="text-xs text-muted-foreground">Def #{item.deficiencyId}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                        <a href={`/admin/inspection-templates/${tmpl.templateId}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Open Template
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
