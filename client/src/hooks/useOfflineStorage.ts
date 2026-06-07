import { useState, useEffect, useCallback } from 'react';
import type { OfflineInspectionResult, OfflineDeficiency, SyncStatus } from '@shared/types';
import { usePendingPhotoCount } from './usePendingPhotoCount';

const STORAGE_KEYS = {
  INSPECTION_RESULTS: 'fire_inspect_offline_results',
  DEFICIENCIES: 'fire_inspect_offline_deficiencies',
  CACHED_JOBS: 'fire_inspect_cached_jobs',
  LAST_SYNC: 'fire_inspect_last_sync',
};

export function useOfflineStorage() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pendingResults: 0,
    pendingDeficiencies: 0,
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
    const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);

    setSyncStatus(prev => ({
      ...prev,
      pendingResults: results.filter(r => !r.synced).length,
      pendingDeficiencies: deficiencies.filter(d => !d.synced).length,
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
    // Job caching
    cacheJobData,
    getCachedJobData,
    // Sync
    setLastSyncTime,
    updateSyncStatus,
    clearAllOfflineData,
  };
}
