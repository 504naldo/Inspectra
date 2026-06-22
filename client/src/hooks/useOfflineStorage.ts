import { useState, useEffect, useCallback } from 'react';
import type { OfflineInspectionResult, OfflineDeficiency, OfflineChecklistResponse, OfflineTemplateResponse, SyncStatus } from '@shared/types';
import { usePendingPhotoCount } from './usePendingPhotoCount';

const STORAGE_KEYS = {
  INSPECTION_RESULTS: 'fire_inspect_offline_results',
  DEFICIENCIES: 'fire_inspect_offline_deficiencies',
  CHECKLIST_RESPONSES: 'fire_inspect_offline_checklist_responses',
  TEMPLATE_RESPONSES: 'fire_inspect_offline_template_responses',
  CACHED_JOBS: 'fire_inspect_cached_jobs',
  LAST_SYNC: 'fire_inspect_last_sync',
};

export function useOfflineStorage() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pendingResults: 0,
    pendingDeficiencies: 0,
    pendingChecklistResponses: 0,
    pendingTemplateResponses: 0,
    pendingAttachments: 0,
    isOnline: navigator.onLine,
  });

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus(prev => ({ ...prev, isOnline: true }));
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load sync status on mount
  useEffect(() => {
    updateSyncStatus();
  }, []);

  const updateSyncStatus = useCallback(() => {
    const results = getOfflineResults();
    const deficiencies = getOfflineDeficiencies();
    const checklistResponses = getOfflineChecklistResponses();
    const templateResponses = getOfflineTemplateResponses();
    const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);

    setSyncStatus(prev => ({
      ...prev,
      pendingResults: results.filter(r => !r.synced).length,
      pendingDeficiencies: deficiencies.filter(d => !d.synced).length,
      pendingChecklistResponses: checklistResponses.filter(r => !r.synced).length,
      pendingTemplateResponses: templateResponses.filter(r => !r.synced).length,
      lastSyncAt: lastSync ? new Date(lastSync) : undefined,
      isOnline: navigator.onLine,
    }));
  }, []);

  // Pending deficiency photos live in IndexedDB (offlineStorage.ts), tracked reactively here
  const pendingAttachments = usePendingPhotoCount();

  // Inspection Results
  const getOfflineResults = useCallback((): OfflineInspectionResult[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.INSPECTION_RESULTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }, []);

  const saveOfflineResult = useCallback((result: OfflineInspectionResult) => {
    const results = getOfflineResults();
    const existingIndex = results.findIndex(
      r => r.jobId === result.jobId && r.deviceId === result.deviceId
    );
    
    if (existingIndex >= 0) {
      results[existingIndex] = result;
    } else {
      results.push(result);
    }
    
    localStorage.setItem(STORAGE_KEYS.INSPECTION_RESULTS, JSON.stringify(results));
    updateSyncStatus();
  }, [getOfflineResults, updateSyncStatus]);

  const getResultsForJob = useCallback((jobId: number): OfflineInspectionResult[] => {
    return getOfflineResults().filter(r => r.jobId === jobId);
  }, [getOfflineResults]);

  const markResultsSynced = useCallback((jobId: number) => {
    const results = getOfflineResults();
    const updated = results.map(r => 
      r.jobId === jobId ? { ...r, synced: true } : r
    );
    localStorage.setItem(STORAGE_KEYS.INSPECTION_RESULTS, JSON.stringify(updated));
    updateSyncStatus();
  }, [getOfflineResults, updateSyncStatus]);

  const clearSyncedResults = useCallback(() => {
    const results = getOfflineResults().filter(r => !r.synced);
    localStorage.setItem(STORAGE_KEYS.INSPECTION_RESULTS, JSON.stringify(results));
    updateSyncStatus();
  }, [getOfflineResults, updateSyncStatus]);

  // Deficiencies
  const getOfflineDeficiencies = useCallback((): OfflineDeficiency[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DEFICIENCIES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }, []);

  const saveOfflineDeficiency = useCallback((deficiency: OfflineDeficiency) => {
    const deficiencies = getOfflineDeficiencies();
    const existingIndex = deficiencies.findIndex(d => d.localId === deficiency.localId);
    
    if (existingIndex >= 0) {
      deficiencies[existingIndex] = deficiency;
    } else {
      deficiencies.push(deficiency);
    }
    
    localStorage.setItem(STORAGE_KEYS.DEFICIENCIES, JSON.stringify(deficiencies));
    updateSyncStatus();
  }, [getOfflineDeficiencies, updateSyncStatus]);

  const getDeficienciesForJob = useCallback((jobId: number): OfflineDeficiency[] => {
    return getOfflineDeficiencies().filter(d => d.jobId === jobId);
  }, [getOfflineDeficiencies]);

  const markDeficienciesSynced = useCallback((localIds: string[]) => {
    const deficiencies = getOfflineDeficiencies();
    const updated = deficiencies.map(d =>
      localIds.includes(d.localId) ? { ...d, synced: true } : d
    );
    localStorage.setItem(STORAGE_KEYS.DEFICIENCIES, JSON.stringify(updated));
    updateSyncStatus();
  }, [getOfflineDeficiencies, updateSyncStatus]);

  const clearSyncedDeficiencies = useCallback(() => {
    const deficiencies = getOfflineDeficiencies().filter(d => !d.synced);
    localStorage.setItem(STORAGE_KEYS.DEFICIENCIES, JSON.stringify(deficiencies));
    updateSyncStatus();
  }, [getOfflineDeficiencies, updateSyncStatus]);

  // Checklist (inspection template) responses
  const getOfflineChecklistResponses = useCallback((): OfflineChecklistResponse[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CHECKLIST_RESPONSES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }, []);

  const saveOfflineChecklistResponse = useCallback((response: OfflineChecklistResponse) => {
    const responses = getOfflineChecklistResponses();
    const existingIndex = responses.findIndex(r => r.localId === response.localId);

    if (existingIndex >= 0) {
      responses[existingIndex] = response;
    } else {
      responses.push(response);
    }

    localStorage.setItem(STORAGE_KEYS.CHECKLIST_RESPONSES, JSON.stringify(responses));
    updateSyncStatus();
  }, [getOfflineChecklistResponses, updateSyncStatus]);

  const getChecklistResponsesForJob = useCallback((jobId: number): OfflineChecklistResponse[] => {
    return getOfflineChecklistResponses().filter(r => r.jobId === jobId);
  }, [getOfflineChecklistResponses]);

  const markChecklistResponsesSynced = useCallback((localIds: string[]) => {
    const responses = getOfflineChecklistResponses();
    const updated = responses.map(r =>
      localIds.includes(r.localId) ? { ...r, synced: true } : r
    );
    localStorage.setItem(STORAGE_KEYS.CHECKLIST_RESPONSES, JSON.stringify(updated));
    updateSyncStatus();
  }, [getOfflineChecklistResponses, updateSyncStatus]);

  const clearSyncedChecklistResponses = useCallback(() => {
    const responses = getOfflineChecklistResponses().filter(r => !r.synced);
    localStorage.setItem(STORAGE_KEYS.CHECKLIST_RESPONSES, JSON.stringify(responses));
    updateSyncStatus();
  }, [getOfflineChecklistResponses, updateSyncStatus]);

  // Inspection template (custom form) responses
  const getOfflineTemplateResponses = useCallback((): OfflineTemplateResponse[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TEMPLATE_RESPONSES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }, []);

  const saveOfflineTemplateResponse = useCallback((response: OfflineTemplateResponse) => {
    const responses = getOfflineTemplateResponses();
    const existingIndex = responses.findIndex(r => r.localId === response.localId);

    if (existingIndex >= 0) {
      responses[existingIndex] = response;
    } else {
      responses.push(response);
    }

    localStorage.setItem(STORAGE_KEYS.TEMPLATE_RESPONSES, JSON.stringify(responses));
    updateSyncStatus();
  }, [getOfflineTemplateResponses, updateSyncStatus]);

  const getTemplateResponsesForJob = useCallback((jobId: number, templateId: number): OfflineTemplateResponse[] => {
    return getOfflineTemplateResponses().filter(r => r.jobId === jobId && r.templateId === templateId);
  }, [getOfflineTemplateResponses]);

  const markTemplateResponsesSynced = useCallback((localIds: string[]) => {
    const responses = getOfflineTemplateResponses();
    const updated = responses.map(r =>
      localIds.includes(r.localId) ? { ...r, synced: true } : r
    );
    localStorage.setItem(STORAGE_KEYS.TEMPLATE_RESPONSES, JSON.stringify(updated));
    updateSyncStatus();
  }, [getOfflineTemplateResponses, updateSyncStatus]);

  const clearSyncedTemplateResponses = useCallback(() => {
    const responses = getOfflineTemplateResponses().filter(r => !r.synced);
    localStorage.setItem(STORAGE_KEYS.TEMPLATE_RESPONSES, JSON.stringify(responses));
    updateSyncStatus();
  }, [getOfflineTemplateResponses, updateSyncStatus]);

  // Job caching for offline access
  const cacheJobData = useCallback((jobId: number, data: any) => {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHED_JOBS) || '{}');
      cached[jobId] = { data, cachedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEYS.CACHED_JOBS, JSON.stringify(cached));
    } catch (e) {
      console.error('Failed to cache job data:', e);
    }
  }, []);

  const getCachedJobData = useCallback((jobId: number) => {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHED_JOBS) || '{}');
      return cached[jobId]?.data || null;
    } catch {
      return null;
    }
  }, []);

  const setLastSyncTime = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    updateSyncStatus();
  }, [updateSyncStatus]);

  const clearAllOfflineData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.INSPECTION_RESULTS);
    localStorage.removeItem(STORAGE_KEYS.DEFICIENCIES);
    localStorage.removeItem(STORAGE_KEYS.CHECKLIST_RESPONSES);
    localStorage.removeItem(STORAGE_KEYS.TEMPLATE_RESPONSES);
    localStorage.removeItem(STORAGE_KEYS.CACHED_JOBS);
    localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
    updateSyncStatus();
  }, [updateSyncStatus]);

  return {
    isOnline,
    syncStatus: { ...syncStatus, pendingAttachments },
    // Results
    getOfflineResults,
    saveOfflineResult,
    getResultsForJob,
    markResultsSynced,
    clearSyncedResults,
    // Deficiencies
    getOfflineDeficiencies,
    saveOfflineDeficiency,
    getDeficienciesForJob,
    markDeficienciesSynced,
    clearSyncedDeficiencies,
    // Checklist responses
    getOfflineChecklistResponses,
    saveOfflineChecklistResponse,
    getChecklistResponsesForJob,
    markChecklistResponsesSynced,
    clearSyncedChecklistResponses,
    // Template responses
    getOfflineTemplateResponses,
    saveOfflineTemplateResponse,
    getTemplateResponsesForJob,
    markTemplateResponsesSynced,
    clearSyncedTemplateResponses,
    // Job caching
    cacheJobData,
    getCachedJobData,
    // Sync
    setLastSyncTime,
    updateSyncStatus,
    clearAllOfflineData,
  };
}
