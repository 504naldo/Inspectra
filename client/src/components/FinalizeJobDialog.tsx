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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, ShieldCheck, Loader2, Copy, CheckCircle2, AlertTriangle } from "lucide-react";

interface FinalizeJobDialogProps {
  jobId: number;
  jobNumber?: string;
  isFinalized: boolean;
  finalizedAt?: Date | string | null;
  finalizationHash?: string | null;
  onFinalized?: () => void;
}

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
  const utils = trpc.useUtils();

  const finalizeJobMutation = trpc.compliance.finalizeJob.useMutation({
    onSuccess: (data) => {
      toast.success("Job finalized successfully. Record is now immutable.");
      utils.job.get.invalidate({ id: jobId });
      onFinalized?.();
    },
    onError: (error) => {
      toast.error(`Finalization failed: ${error.message}`);
    },
  });

  const handleFinalize = () => {
    if (!syncAsserted) return;
    finalizeJobMutation.mutate({ jobId, clientAssertsSynced: true });
  };

  const handleCopyHash = async () => {
    if (!finalizationHash) return;
    await navigator.clipboard.writeText(finalizationHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // If already finalized, show the hash info display
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

  // Not yet finalized — show finalization dialog
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSyncAsserted(false); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Lock className="h-4 w-4" />
          Finalize Job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
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
            onClick={() => { setOpen(false); setSyncAsserted(false); }}
            disabled={finalizeJobMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={!syncAsserted || finalizeJobMutation.isPending}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {finalizeJobMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Finalizing...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Finalize & Seal Record
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
