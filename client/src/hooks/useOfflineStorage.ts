import { readScopedPacketRecovery } from "@/lib/scopedPacketStore";
import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  OfflineInspectionResult,
  OfflineDeficiency,
  OfflineChecklistResponse,
  OfflineTemplateResponse,
} from "@shared/types";
import { usePendingPhotoCount } from "./usePendingPhotoCount";
import { useOfflineScope } from "./useOfflineScope";
import { offlineScopeKey, requireOfflineScope } from "@/lib/offlineScope";
import {
  ScopedOfflineQueue,
  legacyOfflineRecovery,
  OFFLINE_QUEUE_EVENT,
} from "@/lib/scopedOfflineQueue";

export function useOfflineStorage() {
  const scope = useOfflineScope();
  const scopeKey = scope ? offlineScopeKey(scope) : "signed-out";
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [, refresh] = useState(0);
  const queues = useMemo(
    () => ({
      results: new ScopedOfflineQueue("results", scope),
      deficiencies: new ScopedOfflineQueue("deficiencies", scope),
      checklist: new ScopedOfflineQueue("checklist", scope),
      templates: new ScopedOfflineQueue("templates", scope),
    }),
    [scopeKey]
  );
  const updateSyncStatus = useCallback(() => refresh(value => value + 1), []);
  useEffect(() => {
    const online = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("storage", updateSyncStatus);
    window.addEventListener(OFFLINE_QUEUE_EVENT, updateSyncStatus);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("storage", updateSyncStatus);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, updateSyncStatus);
    };
  }, [updateSyncStatus]);
  const pendingAttachments = usePendingPhotoCount();
  const getOfflineResults = useCallback(() => queues.results.read(), [queues]);
  const getOfflineDeficiencies = useCallback(
    () => queues.deficiencies.read(),
    [queues]
  );
  const getOfflineChecklistResponses = useCallback(
    () => queues.checklist.read(),
    [queues]
  );
  const getOfflineTemplateResponses = useCallback(
    () => queues.templates.read(),
    [queues]
  );
  const saveOfflineResult = useCallback(
    (item: OfflineInspectionResult) => {
      // Device tests use a stable identity, so a later result supersedes an older draft.
      queues.results.save({
        ...item,
        localId: `${item.jobId}-${item.deviceId}`,
      });
    },
    [queues]
  );
  const saveOfflineDeficiency = useCallback(
    (item: OfflineDeficiency) => queues.deficiencies.save(item),
    [queues]
  );
  const saveOfflineChecklistResponse = useCallback(
    (item: OfflineChecklistResponse) => queues.checklist.save(item),
    [queues]
  );
  const saveOfflineTemplateResponse = useCallback(
    (item: OfflineTemplateResponse) => queues.templates.save(item),
    [queues]
  );
  const getResultsForJob = useCallback(
    (jobId: number) => getOfflineResults().filter(r => r.jobId === jobId),
    [getOfflineResults]
  );
  const getDeficienciesForJob = useCallback(
    (jobId: number) => getOfflineDeficiencies().filter(r => r.jobId === jobId),
    [getOfflineDeficiencies]
  );
  const getChecklistResponsesForJob = useCallback(
    (jobId: number) =>
      getOfflineChecklistResponses().filter(r => r.jobId === jobId),
    [getOfflineChecklistResponses]
  );
  const getTemplateResponsesForJob = useCallback(
    (jobId: number, templateId: number) =>
      getOfflineTemplateResponses().filter(
        r => r.jobId === jobId && r.templateId === templateId
      ),
    [getOfflineTemplateResponses]
  );
  const markResultsSynced = useCallback(
    (sent: OfflineInspectionResult[]) => queues.results.acknowledge(sent),
    [queues]
  );
  const markDeficienciesSynced = useCallback(
    (sent: OfflineDeficiency[]) => queues.deficiencies.acknowledge(sent),
    [queues]
  );
  const markChecklistResponsesSynced = useCallback(
    (sent: OfflineChecklistResponse[]) => queues.checklist.acknowledge(sent),
    [queues]
  );
  const markTemplateResponsesSynced = useCallback(
    (sent: OfflineTemplateResponse[]) => queues.templates.acknowledge(sent),
    [queues]
  );
  const clearSyncedResults = useCallback(
    () => queues.results.clearSynced(),
    [queues]
  );
  const clearSyncedDeficiencies = useCallback(
    () => queues.deficiencies.clearSynced(),
    [queues]
  );
  const clearSyncedChecklistResponses = useCallback(
    () => queues.checklist.clearSynced(),
    [queues]
  );
  const clearSyncedTemplateResponses = useCallback(
    () => queues.templates.clearSynced(),
    [queues]
  );
  const cacheKey = `fire_inspect_cached_jobs:${scopeKey}`;
  const lastSyncKey = `fire_inspect_last_sync:${scopeKey}`;
  const cacheJobData = useCallback(
    (jobId: number, data: unknown) => {
      requireOfflineScope(scope);
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
      cached[jobId] = { data, cachedAt: new Date().toISOString() };
      localStorage.setItem(cacheKey, JSON.stringify(cached));
    },
    [cacheKey, scope]
  );
  const getCachedJobData = useCallback(
    (jobId: number) => {
      if (!scope) return null;
      try {
        return (
          JSON.parse(localStorage.getItem(cacheKey) ?? "{}")[jobId]?.data ??
          null
        );
      } catch {
        return null;
      }
    },
    [cacheKey, scope]
  );
  const setLastSyncTime = useCallback(() => {
    requireOfflineScope(scope);
    localStorage.setItem(lastSyncKey, new Date().toISOString());
    updateSyncStatus();
  }, [lastSyncKey, scope, updateSyncStatus]);
  // Cleanup never removes pending, unreadable, unowned or another account's data.
  const clearAllOfflineData = useCallback(() => {
    localStorage.removeItem(cacheKey);
    updateSyncStatus();
  }, [queues, cacheKey, updateSyncStatus]);
  const recoveryRecords = [
    ...legacyOfflineRecovery(),
    ...readScopedPacketRecovery(scope),
    ...Object.values(queues).flatMap(queue => queue.recovery()),
  ];
  const criticalRecoveryCount = recoveryRecords.filter(
    record =>
      record.key !== "fire_inspect_job_packets" &&
      !record.key.startsWith("inspectra_job_packets_v2:")
  ).length;
  const lastSync = scope ? localStorage.getItem(lastSyncKey) : null;
  const syncStatus = {
    pendingResults: getOfflineResults().filter(r => !r.synced).length,
    pendingDeficiencies: getOfflineDeficiencies().filter(r => !r.synced).length,
    pendingChecklistResponses: getOfflineChecklistResponses().filter(
      r => !r.synced
    ).length,
    pendingTemplateResponses: getOfflineTemplateResponses().filter(
      r => !r.synced
    ).length,
    pendingAttachments,
    lastSyncAt: lastSync ? new Date(lastSync) : undefined,
    isOnline,
  };
  return {
    isOnline,
    scope,
    syncStatus,
    recoveryRecords,
    criticalRecoveryCount,
    getOfflineResults,
    saveOfflineResult,
    getResultsForJob,
    markResultsSynced,
    clearSyncedResults,
    getOfflineDeficiencies,
    saveOfflineDeficiency,
    getDeficienciesForJob,
    markDeficienciesSynced,
    clearSyncedDeficiencies,
    getOfflineChecklistResponses,
    saveOfflineChecklistResponse,
    getChecklistResponsesForJob,
    markChecklistResponsesSynced,
    clearSyncedChecklistResponses,
    getOfflineTemplateResponses,
    saveOfflineTemplateResponse,
    getTemplateResponsesForJob,
    markTemplateResponsesSynced,
    clearSyncedTemplateResponses,
    cacheJobData,
    getCachedJobData,
    setLastSyncTime,
    updateSyncStatus,
    clearAllOfflineData,
  };
}
