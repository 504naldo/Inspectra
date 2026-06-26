/**
 * IndexedDB wrapper for offline storage of inspection results
 * Stores pending changes when offline and syncs when connection returns
 */

const DB_NAME = "FireInspectOffline";
const DB_VERSION = 2;
const STORE_NAME = "pendingInspectionResults";
const PHOTO_STORE_NAME = "pendingDeficiencyPhotos";

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

export interface PendingDeficiencyPhoto {
  id: string; // Unique ID for this pending item (timestamp-based)
  deficiencyLocalId: string; // Links to OfflineDeficiency.localId until it's synced
  resolvedDeficiencyId?: number; // Set once the parent deficiency has synced and we know its server id
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  fileSize: number;
  fileData: string; // base64-encoded file contents
  caption?: string;
  locationNote?: string;
  timestamp: number; // When this was queued offline
}

// Module-level event bus so hooks can react instantly to pending-photo changes
// instead of polling IndexedDB (mirrors the pattern in useOfflineJobPacket.ts)
const pendingPhotoListeners = new Set<() => void>();

function notifyPendingPhotoListeners() {
  pendingPhotoListeners.forEach((l) => l());
}

export function subscribePendingPhotos(listener: () => void): () => void {
  pendingPhotoListeners.add(listener);
  return () => pendingPhotoListeners.delete(listener);
}

// Same pattern for pending fire-alarm/smoke-alarm checklist results, so SyncScreen
// and OfflineBanner can react instantly instead of polling IndexedDB
const pendingResultListeners = new Set<() => void>();

function notifyPendingResultListeners() {
  pendingResultListeners.forEach((l) => l());
}

export function subscribePendingResults(listener: () => void): () => void {
  pendingResultListeners.add(listener);
  return () => pendingResultListeners.delete(listener);
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

        // Create object store for pending deficiency photos (queued offline)
        if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
          const photoStore = db.createObjectStore(PHOTO_STORE_NAME, { keyPath: "id" });
          photoStore.createIndex("deficiencyLocalId", "deficiencyLocalId", { unique: false });
          // IndexedDB indexes skip records that lack the indexed property, so this
          // index naturally contains only photos whose parent deficiency has synced
          photoStore.createIndex("resolvedDeficiencyId", "resolvedDeficiencyId", { unique: false });
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

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    notifyPendingResultListeners();
    return id;
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

    await new Promise<void>((resolve, reject) => {
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
    notifyPendingResultListeners();
  }

  /**
   * Delete a synced result from local storage
   */
  async deleteSyncedResult(id: string): Promise<void> {
    if (!this.db) await this.init();

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    notifyPendingResultListeners();
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

  /**
   * Delete all pending (unsynced) results — used by "Clear All Offline Data"
   */
  async clearAllResults(): Promise<void> {
    if (!this.db) await this.init();

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    notifyPendingResultListeners();
  }

  /**
   * Queue a deficiency photo captured while offline (linked by the
   * deficiency's localId until the deficiency itself has synced)
   */
  async savePendingPhoto(data: Omit<PendingDeficiencyPhoto, "id" | "timestamp">): Promise<string> {
    if (!this.db) await this.init();

    const id = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const item: PendingDeficiencyPhoto = {
      ...data,
      id,
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([PHOTO_STORE_NAME], "readwrite");
      const store = transaction.objectStore(PHOTO_STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    notifyPendingPhotoListeners();
    return id;
  }

  /**
   * Record the server-side deficiency id once the parent offline deficiency has synced,
   * so a queued photo can still be uploaded (and retried) even after its local record is cleared
   */
  async setPhotoResolvedDeficiencyId(id: string, deficiencyId: number): Promise<void> {
    if (!this.db) await this.init();

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([PHOTO_STORE_NAME], "readwrite");
      const store = transaction.objectStore(PHOTO_STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.resolvedDeficiencyId = deficiencyId;
          const updateRequest = store.put(item);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
    notifyPendingPhotoListeners();
  }

  /**
   * Get all photos queued for a given offline deficiency (by local id)
   */
  async getPendingPhotosForDeficiency(deficiencyLocalId: string): Promise<PendingDeficiencyPhoto[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PHOTO_STORE_NAME], "readonly");
      const store = transaction.objectStore(PHOTO_STORE_NAME);
      const index = store.index("deficiencyLocalId");
      const request = index.getAll(deficiencyLocalId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get queued photos whose parent deficiency has synced and is ready to upload to.
   * Queries the resolvedDeficiencyId index directly so unresolved photos (whose base64
   * payload may be several MB) are never pulled into memory.
   */
  async getPhotosReadyToUpload(): Promise<PendingDeficiencyPhoto[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PHOTO_STORE_NAME], "readonly");
      const store = transaction.objectStore(PHOTO_STORE_NAME);
      const request = store.index("resolvedDeficiencyId").getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a queued photo once it has been uploaded to the server
   */
  async deletePendingPhoto(id: string): Promise<void> {
    if (!this.db) await this.init();

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([PHOTO_STORE_NAME], "readwrite");
      const store = transaction.objectStore(PHOTO_STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    notifyPendingPhotoListeners();
  }

  /**
   * Get count of queued deficiency photos, without loading their base64 payloads
   */
  async getPendingPhotoCount(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PHOTO_STORE_NAME], "readonly");
      const store = transaction.objectStore(PHOTO_STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorage();
