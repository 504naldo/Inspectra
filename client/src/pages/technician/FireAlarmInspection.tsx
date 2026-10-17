import { useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { FireAlarmChecklist } from "@/components/inspection/FireAlarmChecklist";
import { useOfflineScope } from "@/hooks/useOfflineScope";
import { useOfflineJobPacket } from "@/hooks/useOfflineJobPacket";
import { offlineScopeKey } from "@/lib/offlineScope";
import { useTrackInspectionProgress } from "@/hooks/useInspectionProgress";

/** The dedicated route shares the same durable editor as the job checklist. */
export default function FireAlarmInspection({ jobId }: { jobId: number }) {
  const [location, navigate] = useLocation();
  const scope = useOfflineScope();
  const scopeKey = scope ? offlineScopeKey(scope) : "signed-out";
  useTrackInspectionProgress(jobId, location, "fire-alarm", "Fire Alarm Inspection");
  const { data, isLoading } = trpc.job.get.useQuery({ id: jobId }, { enabled: !!scope });
  const { packet } = useOfflineJobPacket(jobId);
  const job = scope ? data ?? packet?.job : undefined;
  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <Button variant="ghost" onClick={() => navigate(`/tech/jobs/${jobId}`)}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Job
      </Button>
      <h1 className="text-2xl font-bold">Fire Alarm Inspection</h1>
      {isLoading && !job ? <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading inspection…</p> :
        !job || job.id !== jobId || !job.siteId ? <p role="alert">This job is unavailable. Open its job details to load the inspection.</p> :
          <FireAlarmChecklist key={`${scopeKey}:${jobId}`} jobId={jobId} siteId={job.siteId} isFinalized={!!job.finalizedAt} />}
    </main>
  );
}
