import { useCallback, useEffect, useRef, useState } from "react";
import { useOfflineScope } from "./useOfflineScope";
import { offlineScopeKey } from "@/lib/offlineScope";
import { readPhotoQaState } from "@/lib/offlinePhotoPreflight";
import { subscribePendingPhotos } from "@/lib/offlineStorage";

export function useJobPhotoPreflight(jobId: number) {
  const scope = useOfflineScope();
  const scopeKey = scope ? offlineScopeKey(scope) : "signed-out";
  const identity = `${scopeKey}:${jobId}`;
  const active = useRef(identity);
  active.current = identity;
  const request = useRef(0);
  const [state, setState] = useState({ identity: "", count: 0, blockers: 0, checking: true, error: "" });
  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setState(previous => ({ ...previous, checking: true }));
    try {
      const value = await readPhotoQaState(jobId, scope);
      if (active.current !== identity) throw new Error("The account or job changed. Reopen QA submission.");
      if (request.current === sequence) setState({ identity, ...value, checking: false, error: "" });
      return value;
    } catch (reason) {
      if (active.current === identity && request.current === sequence) setState({ identity, count: 0, blockers: 1, checking: false,
        error: "Saved evidence could not be checked. Recover offline data before submitting for QA." });
      throw reason;
    }
  }, [scopeKey, jobId]);
  useEffect(() => {
    active.current = identity;
    return () => { active.current = "inactive"; };
  }, [identity]);
  useEffect(() => {
    const update = () => { void refresh().catch(() => {}); };
    update();
    const unsubscribe = subscribePendingPhotos(update);
    window.addEventListener("focus", update);
    return () => { unsubscribe(); window.removeEventListener("focus", update); };
  }, [refresh]);
  return { ...(state.identity === identity ? state : { identity, count: 0, blockers: 0, checking: true, error: "" }), refresh };
}
