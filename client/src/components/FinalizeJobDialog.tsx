import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Lock,
  ShieldCheck,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
} from "lucide-react";

interface FinalizeJobDialogProps {
  jobId: number;
  jobNumber?: string;
  isFinalized: boolean;
  finalizedAt?: Date | string | null;
  finalizationHash?: string | null;
  onFinalized?: () => void;
}

type AiIssue = {
  device_id: number | null;
  device_type: string;
  field: string;
  issue: string;
  severity: "warning" | "blocker";
};

type ReviewStep = "idle" | "running" | "results";

export default function FinalizeJobDialog({
  jobId,
  jobNumber,
  isFinalized,
  finalizedAt,
  finalizationHash,
  onFinalized,
}: FinalizeJobDialogProps) {
  const [open, setOpen] = useState(false);
  const [syncAsserted, setSyncAsserted] = useState(false);
  const [copied, setCopied] = useState(false);

  // AI review state
  const [reviewStep, setReviewStep] = useState<ReviewStep>("idle");
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewIssues, setReviewIssues] = useState<AiIssue[]>([]);
  const [dismissedIndices, setDismissedIndices] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const finalizeJobMutation = trpc.compliance.finalizeJob.useMutation({
    onSuccess: () => {
      toast.success("Job finalized successfully. Record is now immutable.");
      utils.job.get.invalidate({ id: jobId });
      onFinalized?.();
    },
    onError: (error) => {
      toast.error(`Finalization failed: ${error.message}`);
    },
  });

  const prePublishReviewMutation = trpc.ai.prePublishReview.useMutation({
    onSuccess: (data) => {
      setReviewId(data.reviewId);
      setReviewIssues(data.issues as AiIssue[]);
      setReviewStep("results");
    },
    onError: (error) => {
      toast.error(`AI review failed: ${error.message}`);
      setReviewStep("idle");
    },
  });

  const saveOverridesMutation = trpc.ai.saveReviewOverrides.useMutation();

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setSyncAsserted(false);
      setReviewStep("idle");
      setReviewId(null);
      setReviewIssues([]);
      setDismissedIndices(new Set());
    }
  };

  // Step 1: user clicks "Finalize & Seal Record" → run AI review
  const handleStartFinalize = () => {
    if (!syncAsserted) return;
    setReviewStep("running");
    prePublishReviewMutation.mutate({ jobId });
  };

  const handleDismiss = (idx: number) => {
    setDismissedIndices((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const handleUndismiss = (idx: number) => {
    setDismissedIndices((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  // Compute pending blockers (not dismissed)
  const pendingBlockers = reviewIssues.filter(
    (iss, idx) => iss.severity === "blocker" && !dismissedIndices.has(idx)
  );
  const pendingWarnings = reviewIssues.filter(
    (iss, idx) => iss.severity === "warning" && !dismissedIndices.has(idx)
  );
  const canProceed = pendingBlockers.length === 0;

  // Step 2: user confirms after review
  const handleConfirmFinalize = async () => {
    if (!canProceed) return;
    // Save dismissed overrides if any
    if (reviewId !== null && dismissedIndices.size > 0) {
      await saveOverridesMutation.mutateAsync({
        reviewId,
        dismissedIndices: Array.from(dismissedIndices),
      });
    }
    finalizeJobMutation.mutate({ jobId, clientAssertsSynced: true });
  };

  const handleCopyHash = async () => {
    if (!finalizationHash) return;
    await navigator.clipboard.writeText(finalizationHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Already finalized view ──────────────────────────────────────────────────
  if (isFinalized && finalizationHash) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 border-green-600 text-green-700 hover:bg-green-50">
            <ShieldCheck className="h-4 w-4" />
            Finalized
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Job Finalized
            </DialogTitle>
            <DialogDescription>
              This job record has been sealed and is immutable. No further edits are permitted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-800 font-medium text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Record Integrity Confirmed
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Finalized At</p>
                <p className="text-sm font-mono">
                  {finalizedAt ? new Date(finalizedAt).toLocaleString() : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">SHA-256 Finalization Hash</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white border rounded px-2 py-1 font-mono break-all flex-1">
                    {finalizationHash}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={handleCopyHash}
                  >
                    {copied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This hash is a cryptographic fingerprint of all inspection results, deficiencies, and
              checklist responses at the time of finalization. Any modification to the underlying
              data will cause hash verification to fail.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Not yet finalized ───────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Lock className="h-4 w-4" />
          Finalize Job
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        {/* ── Step: idle (sync confirm) ── */}
        {reviewStep === "idle" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-600" />
                Finalize Job {jobNumber ? `#${jobNumber}` : `#${jobId}`}
              </DialogTitle>
              <DialogDescription>
                Finalizing this job seals the inspection record permanently. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  <strong>This action is irreversible.</strong> Once finalized:
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs">
                    <li>Inspection results cannot be added, edited, or deleted</li>
                    <li>Deficiencies cannot be modified</li>
                    <li>A SHA-256 hash will be computed and stored as proof of record integrity</li>
                    <li>The job status will be set to <strong>completed</strong></li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Pre-finalization checklist</p>
                <p className="text-xs text-muted-foreground">
                  Before finalizing, confirm that all field data has been synced from technician devices.
                </p>
                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    id="sync-assert"
                    checked={syncAsserted}
                    onCheckedChange={(v) => setSyncAsserted(v === true)}
                  />
                  <Label htmlFor="sync-assert" className="text-sm leading-snug cursor-pointer">
                    I confirm that all inspection results and deficiencies have been fully synced from
                    technician devices and reviewed for completeness.
                  </Label>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleStartFinalize}
                disabled={!syncAsserted}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Lock className="h-4 w-4" />
                Finalize & Seal Record
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step: running (AI review in progress) ── */}
        {reviewStep === "running" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                Running AI Pre-Publish Review
              </DialogTitle>
              <DialogDescription>
                Analyzing inspection data for quality issues before sealing the record…
              </DialogDescription>
            </DialogHeader>
            <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground text-sm">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>This usually takes 5–15 seconds.</p>
            </div>
          </>
        )}

        {/* ── Step: results (show issues) ── */}
        {reviewStep === "results" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {pendingBlockers.length > 0 ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : pendingWarnings.length > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                AI Inspection Review
              </DialogTitle>
              <DialogDescription>
                {reviewIssues.length === 0
                  ? "No issues found. The record is ready to seal."
                  : `Found ${reviewIssues.filter(i => i.severity === "blocker").length} blocker(s) and ${reviewIssues.filter(i => i.severity === "warning").length} warning(s).`}
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-3">
              {reviewIssues.length === 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3 text-green-800 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  All checks passed. No quality issues detected.
                </div>
              )}

              {reviewIssues.length > 0 && (
                <>
                  {pendingBlockers.length > 0 && (
                    <Alert className="border-red-200 bg-red-50">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800 text-sm">
                        <strong>{pendingBlockers.length} blocker(s) must be resolved</strong> before
                        you can finalize. Go back, correct the issues, then return to finalize.
                      </AlertDescription>
                    </Alert>
                  )}

                  <ScrollArea className="max-h-64 rounded-md border">
                    <div className="divide-y">
                      {reviewIssues.map((iss, idx) => {
                        const dismissed = dismissedIndices.has(idx);
                        return (
                          <div
                            key={idx}
                            className={`flex items-start gap-3 p-3 text-sm ${dismissed ? "opacity-40" : ""}`}
                          >
                            {iss.severity === "blocker" ? (
                              <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    iss.severity === "blocker"
                                      ? "border-red-300 text-red-700 text-[10px]"
                                      : "border-amber-300 text-amber-700 text-[10px]"
                                  }
                                >
                                  {iss.severity}
                                </Badge>
                                <span className="text-xs text-muted-foreground font-medium">
                                  {iss.device_type}
                                  {iss.field ? ` · ${iss.field}` : ""}
                                </span>
                              </div>
                              <p className={`mt-0.5 ${dismissed ? "line-through" : ""}`}>
                                {iss.issue}
                              </p>
                            </div>
                            {iss.severity === "warning" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 mt-0.5"
                                title={dismissed ? "Undo dismiss" : "Dismiss warning"}
                                onClick={() => dismissed ? handleUndismiss(idx) : handleDismiss(idx)}
                              >
                                {dismissed ? (
                                  <span className="text-xs text-muted-foreground">↩</span>
                                ) : (
                                  <X className="h-3 w-3 text-muted-foreground" />
                                )}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {pendingWarnings.length > 0 && pendingBlockers.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {pendingWarnings.length} warning(s) remaining. You may dismiss them and proceed.
                    </p>
                  )}
                </>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={finalizeJobMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmFinalize}
                disabled={!canProceed || finalizeJobMutation.isPending}
                className={`gap-2 text-white ${canProceed ? "bg-amber-600 hover:bg-amber-700" : "bg-gray-400 cursor-not-allowed"}`}
              >
                {finalizeJobMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finalizing…
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    {pendingBlockers.length > 0
                      ? `Resolve ${pendingBlockers.length} blocker(s) first`
                      : "Confirm & Seal Record"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
