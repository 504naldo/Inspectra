import { useEffect, useState } from "react";
import { offlineStorage, subscribePendingResults, type PendingInspectionResult } from "@/lib/offlineStorage";

/**
 * Tracks pending fire-alarm checklist results queued in IndexedDB awaiting sync.
 * Reacts instantly to save/sync/clear via offlineStorage's pub/sub instead of polling.
 */
export function usePendingFireAlarmResults() {
  const [results, setResults] = useState<PendingInspectionResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      offlineStorage.getPendingResults().then((items) => {
        if (!cancelled) setResults(items);
      }).catch(() => {});
    };

    refresh();
    return subscribePendingResults(refresh);
  }, []);

  return results;
}
