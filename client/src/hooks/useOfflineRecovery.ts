import { useCallback, useEffect, useState } from "react";
import { useOfflineScope } from "./useOfflineScope";
import { offlineScopeKey } from "@/lib/offlineScope";
import {
  offlineStorage,
  subscribePendingPhotos,
  subscribePendingResults,
  subscribePendingSmokeTests,
  type OfflineRecoverySummary,
} from "@/lib/offlineStorage";
const empty: OfflineRecoverySummary = { legacy: 0, invalid: 0, foreign: 0 };
export function useOfflineRecovery() {
  const scope = useOfflineScope();
  const key = scope ? offlineScopeKey(scope) : "";
  const [state, setState] = useState({ key: "", summary: empty, error: "" });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    if (!scope) {
      setState({ key, summary: empty, error: "" });
      return;
    }
    offlineStorage
      .recoverySummary(scope)
      .then(summary => {
        if (!cancelled) setState({ key, summary, error: "" });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            key,
            summary: empty,
            error:
              "Offline storage could not be read. Saved data has not been cleared.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [key, revision]);
  useEffect(() => {
    const unsubscribers = [
      subscribePendingPhotos(refresh),
      subscribePendingResults(refresh),
      subscribePendingSmokeTests(refresh),
    ];
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return {
    ...(state.key === key
      ? state
      : {
          key,
          summary: empty,
          error: scope ? "Checking saved offline data…" : "",
        }),
    refresh,
  };
}
