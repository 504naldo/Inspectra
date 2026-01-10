import { useEffect, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';

/**
 * Hook for tracking inspection progress using localStorage
 * Stores the last visited route per user + job for resume functionality
 */

export interface InspectionProgress {
  route: string;
  updatedAt: number;
  inspectionType?: 'fire-alarm' | 'sprinkler-itm' | 'deficiency' | 'general';
  label?: string; // Friendly name for UI display
}

export function useInspectionProgress(jobId: number | string) {
  const { user } = useAuth();

  const getStorageKey = useCallback(() => {
    if (!user?.id) return null;
    return `resume:${user.id}:${jobId}`;
  }, [user?.id, jobId]);

  /**
   * Save current inspection progress
   */
  const saveProgress = useCallback((
    route: string,
    inspectionType?: InspectionProgress['inspectionType'],
    label?: string
  ) => {
    const key = getStorageKey();
    if (!key) return;

    const progress: InspectionProgress = {
      route,
      updatedAt: Date.now(),
      inspectionType,
      label,
    };

    try {
      localStorage.setItem(key, JSON.stringify(progress));
    } catch (error) {
      console.warn('Failed to save inspection progress:', error);
    }
  }, [getStorageKey]);

  /**
   * Get saved inspection progress
   */
  const getProgress = useCallback((): InspectionProgress | null => {
    const key = getStorageKey();
    if (!key) return null;

    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const progress: InspectionProgress = JSON.parse(stored);
      
      // Validate the stored data has required fields
      if (!progress.route || !progress.updatedAt) return null;

      return progress;
    } catch (error) {
      console.warn('Failed to get inspection progress:', error);
      return null;
    }
  }, [getStorageKey]);

  /**
   * Clear saved inspection progress
   */
  const clearProgress = useCallback(() => {
    const key = getStorageKey();
    if (!key) return;

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to clear inspection progress:', error);
    }
  }, [getStorageKey]);

  /**
   * Check if progress is recent (within last 7 days)
   */
  const isProgressRecent = useCallback((progress: InspectionProgress | null): boolean => {
    if (!progress) return false;
    
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    return progress.updatedAt > sevenDaysAgo;
  }, []);

  return {
    saveProgress,
    getProgress,
    clearProgress,
    isProgressRecent,
  };
}

/**
 * Hook to automatically track current route as inspection progress
 * Call this in inspection pages to auto-save progress on mount and route changes
 */
export function useTrackInspectionProgress(
  jobId: number | string,
  currentRoute: string,
  inspectionType?: InspectionProgress['inspectionType'],
  label?: string
) {
  const { saveProgress } = useInspectionProgress(jobId);

  useEffect(() => {
    // Save progress when route changes
    if (currentRoute) {
      saveProgress(currentRoute, inspectionType, label);
    }
  }, [currentRoute, inspectionType, label, saveProgress]);
}
