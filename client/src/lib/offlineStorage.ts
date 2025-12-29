/**
 * IndexedDB wrapper for offline storage of inspection results
 * Stores pending changes when offline and syncs when connection returns
 */

const DB_NAME = "FireInspectOffline";
const DB_VERSION = 1;
const STORE_NAME = "pendingInspectionResults";

export interface PendingInspectionResult {
  id: string; // Unique ID for this pending item (timestamp-based)
  jobId: number;
  fireAlarmSystemId: number;
  checklistItemId: number;
  result: "pass" | "fail" | "na" | "not_tested";
  notes?: string;
  numericValue?: string;
  textValue?: string;
  timestamp: number; // When this was saved offline
  synced: boolean; // Whether this has been synced to server
}

class OfflineStorage {
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB connection
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for pending inspection results
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("jobId", "jobId", { unique: false });
          store.createIndex("synced", "synced", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }

  /**
   * Save inspection result to local storage
   */
  async savePendingResult(data: Omit<PendingInspectionResult, "id" | "timestamp" | "synced">): Promise<string> {
    if (!this.db) await this.init();

    const id = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const item: PendingInspectionResult = {
      ...data,
      id,
      timestamp: Date.now(),
      synced: false,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all pending (unsynced) results
   */
  async getPendingResults(): Promise<PendingInspectionResult[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter for unsynced items
        const results = request.result.filter((item: PendingInspectionResult) => !item.synced);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all pending results for a specific job
   */
  async getPendingResultsForJob(jobId: number): Promise<PendingInspectionResult[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("jobId");
      const request = index.getAll(jobId);

      request.onsuccess = () => {
        // Filter for unsynced items only
        const results = request.result.filter((item: PendingInspectionResult) => !item.synced);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Mark a pending result as synced
   */
  async markAsSynced(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.synced = true;
          const updateRequest = store.put(item);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve(); // Item doesn't exist, consider it synced
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Delete a synced result from local storage
   */
  async deleteSyncedResult(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all synced results (cleanup)
   */
  async clearSyncedResults(): Promise<void> {
    if (!this.db) await this.init();

    const allResults = await this.getAllResults();
    const syncedResults = allResults.filter((item) => item.synced);

    for (const item of syncedResults) {
      await this.deleteSyncedResult(item.id);
    }
  }

  /**
   * Get all results (for debugging)
   */
  async getAllResults(): Promise<PendingInspectionResult[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get count of pending results
   */
  async getPendingCount(): Promise<number> {
    const pending = await this.getPendingResults();
    return pending.length;
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorage();
