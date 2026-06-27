import { useEffect, useState } from "react";
import { offlineStorage, subscribePendingSmokeTests, type PendingSmokeAlarmTest } from "@/lib/offlineStorage";

/**
 * Tracks pending smoke-alarm test results queued in IndexedDB awaiting sync.
 * Reacts instantly to save/sync/clear via offlineStorage's pub/sub instead of polling.
 */
export function usePendingSmokeAlarmTests() {
  const [tests, setTests] = useState<PendingSmokeAlarmTest[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      offlineStorage.getPendingSmokeTests().then((items) => {
        if (!cancelled) setTests(items);
      }).catch(() => {});
    };

    refresh();
    return subscribePendingSmokeTests(refresh);
  }, []);

  return tests;
}
