import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { mutationQueue } from "@/lib/mutationQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { usePendingFireAlarmResults } from "@/hooks/usePendingFireAlarmResults";
import { usePendingSmokeAlarmTests } from "@/hooks/usePendingSmokeAlarmTests";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useOfflineRecovery } from "@/hooks/useOfflineRecovery";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { syncStatus, recoveryRecords } = useOfflineStorage();
  const { summary, error: recoveryError } = useOfflineRecovery();
  const recoveryPending =
    recoveryRecords.filter(record => record.key !== "inspectra_mutation_queue")
      .length +
    summary.legacy +
    summary.invalid +
    (recoveryError ? 1 : 0);
  const pendingFireAlarmResults = usePendingFireAlarmResults();
  const pendingSmokeAlarmTests = usePendingSmokeAlarmTests();
  const [mqPending, setMqPending] = useState(() => mutationQueue.count());

  const offlineStorePending =
    syncStatus.pendingResults + syncStatus.pendingDeficiencies + syncStatus.pendingChecklistResponses + syncStatus.pendingTemplateResponses + syncStatus.pendingAttachments + pendingFireAlarmResults.length + pendingSmokeAlarmTests.length;
  const totalPending = mqPending + offlineStorePending + recoveryPending;

  // Refresh mutationQueue count every 2 seconds
  useEffect(() => {
    const id = setInterval(() => setMqPending(mutationQueue.count()), 2000);
    return () => clearInterval(id);
  }, []);

  // Legacy POST batches have no account or operation identity. Keep their data
  // for manual recovery; replaying under the current session could affect a
  // different tenant, and HTTP 207 does not acknowledge every operation.
    if (isOnline && totalPending === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-50 text-xs px-4 py-2.5 flex items-center justify-center gap-2",
        isOnline && totalPending > 0 ? "bg-amber-500 text-white" : "bg-gray-800 text-white"
      )}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      {!isOnline ? (
        <span>
          No connection —{" "}
          {totalPending > 0
            ? `${totalPending} item${totalPending !== 1 ? "s" : ""} saved locally`
            : "use inspection offline capture; other actions need a connection"}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          Back online —{" "}
          {mqPending > 0 || recoveryPending > 0 ? (
            <span>
              <Link href="/tech/sync" className="underline">
                Saved changes need recovery →
              </Link>{" "}
              <span className="sr-only">
                {mqPending + recoveryPending} record sources need
              </span>
              review before recovery
            </span>
          ) : null}
          {offlineStorePending > 0 && (
            <Link href="/tech/sync" className="underline font-medium">
              {mqPending > 0 ? `+ ${offlineStorePending} in sync queue` : `${offlineStorePending} item${offlineStorePending !== 1 ? "s" : ""} ready to sync →`}
            </Link>
          )}
        </span>
      )}
      {syncStatus.lastSyncAt && !totalPending && isOnline && (
        <span className="text-white/60 ml-1">
          · last synced{" "}
          {new Date(syncStatus.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", })}
        </span>
      )}
    </div>
  );
}
