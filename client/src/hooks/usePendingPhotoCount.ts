import { useEffect, useState } from "react";
import { offlineStorage, subscribePendingPhotos } from "@/lib/offlineStorage";
import { useOfflineScope } from "./useOfflineScope";
import { offlineScopeKey } from "@/lib/offlineScope";
export function usePendingPhotoCount() {
  const scope = useOfflineScope();
  const scopeKey = scope ? offlineScopeKey(scope) : "";
  const [state, setState] = useState({ scopeKey: "", count: 0 });
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      offlineStorage
        .getPendingPhotoCount(scope)
        .then(count => {
          if (!cancelled) setState({ scopeKey, count });
        })
        .catch(() => {});
    };
    refresh();
    const unsubscribe = subscribePendingPhotos(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [scopeKey]);
  return state.scopeKey === scopeKey ? state.count : 0;
}
