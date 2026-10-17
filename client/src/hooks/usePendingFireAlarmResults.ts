import { useEffect, useState } from "react";
import {
  offlineStorage,
  subscribePendingResults,
  type PendingInspectionResult,
} from "@/lib/offlineStorage";
import { useOfflineScope } from "./useOfflineScope";
import { offlineScopeKey } from "@/lib/offlineScope";
export function usePendingFireAlarmResults() {
  const scope = useOfflineScope();
  const scopeKey = scope ? offlineScopeKey(scope) : "";
  const [state, setState] = useState<{
    scopeKey: string;
    items: PendingInspectionResult[];
  }>({ scopeKey: "", items: [] });
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      offlineStorage
        .getPendingResults(scope)
        .then(items => {
          if (!cancelled) setState({ scopeKey, items });
        })
        .catch(() => {
          if (!cancelled) setState({ scopeKey, items: [] });
        });
    };
    refresh();
    const unsubscribe = subscribePendingResults(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [scopeKey]);
  return state.scopeKey === scopeKey ? state.items : [];
}
