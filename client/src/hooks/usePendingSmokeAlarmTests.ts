import { useEffect, useState } from "react";
import {
  offlineStorage,
  subscribePendingSmokeTests,
  type PendingSmokeAlarmTest,
} from "@/lib/offlineStorage";
import { useOfflineScope } from "./useOfflineScope";
import { offlineScopeKey } from "@/lib/offlineScope";
export function usePendingSmokeAlarmTests() {
  const scope = useOfflineScope();
  const scopeKey = scope ? offlineScopeKey(scope) : "";
  const [state, setState] = useState<{
    scopeKey: string;
    items: PendingSmokeAlarmTest[];
  }>({ scopeKey: "", items: [] });
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      offlineStorage
        .getPendingSmokeTests(scope)
        .then(items => {
          if (!cancelled) setState({ scopeKey, items });
        })
        .catch(() => {
          if (!cancelled) setState({ scopeKey, items: [] });
        });
    };
    refresh();
    const unsubscribe = subscribePendingSmokeTests(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [scopeKey]);
  return state.scopeKey === scopeKey ? state.items : [];
}
