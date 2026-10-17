/** Typed account/company-scoped offline capture. Legacy data is preserved, never replayed. */
import { z } from "zod";
import {
  belongsToOfflineScope,
  requireOfflineScope,
  type OfflineScope,
} from "./offlineScope";
const DB_NAME = "FireInspectOffline";
const DB_VERSION = 3;
const STORE_NAME = "pendingInspectionResults";
const PHOTO_STORE_NAME = "pendingDeficiencyPhotos";
const SMOKE_TEST_STORE_NAME = "pendingSmokeAlarmTests";
export interface PendingInspectionResult {
  id: string; // Unique ID for this pending item (timestamp-based)
  jobId: number;
  fireAlarmSystemId: number;
  checklistItemId: number;
  questionRevision: string;
  result: "pass" | "fail" | "na" | "not_tested";
  notes?: string;
  numericValue?: string;
  textValue?: string;
  timestamp: number; // When this was saved offline
  synced: boolean; // Whether this has been synced to server
}

export interface PendingSmokeAlarmTest {
  id: string; // Unique ID for this pending item (timestamp-based)
  jobId: number; // For grouping/display in SyncScreen (not sent to the server)
  alarmId: number; // The smoke-alarm device id the test result applies to
  expectedDeviceRevision: string;
  testResult: "pass" | "fail" | "no_access" | "na";
  notes?: string;
  timestamp: number; // When this was saved offline
  synced: boolean; // Whether this has been synced to server
}

export interface PendingDeficiencyPhoto {
  jobId: number; // Required parent job; unscoped legacy photos are preserved for review
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
  pendingPhotoListeners.forEach(l => l());
}

export function subscribePendingPhotos(listener: () => void): () => void {
  pendingPhotoListeners.add(listener);
  return () => pendingPhotoListeners.delete(listener);
}

// Same pattern for pending fire-alarm/smoke-alarm checklist results, so SyncScreen
// and OfflineBanner can react instantly instead of polling IndexedDB
const pendingResultListeners = new Set<() => void>();

function notifyPendingResultListeners() {
  pendingResultListeners.forEach(l => l());
}

export function subscribePendingResults(listener: () => void): () => void {
  pendingResultListeners.add(listener);
  return () => pendingResultListeners.delete(listener);
}

// Same pattern for pending smoke-alarm test results (a separate store/shape from the
// fire-alarm checklist queue above — keyed by alarm device id, not checklist item)
const pendingSmokeTestListeners = new Set<() => void>();

function notifyPendingSmokeTestListeners() {
  pendingSmokeTestListeners.forEach(l => l());
}

export function subscribePendingSmokeTests(listener: () => void): () => void {
  pendingSmokeTestListeners.add(listener);
  return () => pendingSmokeTestListeners.delete(listener);
}

const positiveId = z.number().int().positive();
const recordBase = {
  id: z.string().min(1),
  userId: positiveId,
  companyId: positiveId.nullable(),
  timestamp: z.number().finite().nonnegative(),
  jobId: positiveId,
};
const text = z.string().optional();
export const pendingOfflineSchemas = {
  [STORE_NAME]: z
    .object({
      ...recordBase,
      synced: z.boolean(),
      fireAlarmSystemId: positiveId,
      checklistItemId: positiveId,
    questionRevision: z.string().regex(/^inspection-capture-v1:fire-alarm-question:[a-f0-9]{64}$/),
      result: z.enum(["pass", "fail", "na", "not_tested"]),
      notes: text,
      numericValue: text,
      textValue: text,
    })
    .passthrough(),
  [SMOKE_TEST_STORE_NAME]: z
    .object({
      ...recordBase,
      synced: z.boolean(),
      alarmId: positiveId,
      expectedDeviceRevision: z.string().min(1),
      testResult: z.enum(["pass", "fail", "no_access", "na"]),
      notes: text,
    })
    .passthrough(),
  [PHOTO_STORE_NAME]: z
    .object({
      ...recordBase,
      deficiencyLocalId: z.string().min(1),
      resolvedDeficiencyId: positiveId.optional(),
      fileName: z.string().min(1),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      fileSize: z.number().int().positive(),
      fileData: z
        .string()
        .min(1)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      caption: text,
      locationNote: text,
    })
    .passthrough(),
};
type StoreName = keyof typeof pendingOfflineSchemas;
export function isOwnedOfflineRecord(
  store: StoreName,
  value: unknown,
  scope: OfflineScope | null
): boolean {
  return (
    belongsToOfflineScope(value, scope) &&
    pendingOfflineSchemas[store].safeParse(value).success
  );
}
export function canExportOfflineRecord(
  item: unknown,
  scope: OfflineScope | null
) {
  if (!scope) return false;
  if (!item || typeof item !== "object") return true;
  const record = item as Record<string, unknown>;
  return (
    (!Object.hasOwn(record, "userId") || record.userId === scope.userId) &&
    (!Object.hasOwn(record, "companyId") ||
      record.companyId === scope.companyId)
  );
}
export interface OfflineRecoverySummary {
  legacy: number;
  invalid: number;
  foreign: number;
}
export class OfflineStorage {
  private db: IDBDatabase | null = null;
  private opening: Promise<void> | null = null;
  async init(): Promise<void> {
    if (this.db) return;
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Close other Inspectra tabs to open offline storage"));
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve();
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("jobId", "jobId");
          store.createIndex("synced", "synced");
          store.createIndex("timestamp", "timestamp");
        }
        if (!db.objectStoreNames.contains(SMOKE_TEST_STORE_NAME)) {
          const store = db.createObjectStore(SMOKE_TEST_STORE_NAME, {
            keyPath: "id",
          });
          store.createIndex("jobId", "jobId");
          store.createIndex("alarmId", "alarmId");
          store.createIndex("synced", "synced");
        }
        if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
          const store = db.createObjectStore(PHOTO_STORE_NAME, {
            keyPath: "id",
          });
          store.createIndex("deficiencyLocalId", "deficiencyLocalId");
          store.createIndex("resolvedDeficiencyId", "resolvedDeficiencyId");
        }
      };
    });
    try {
      await this.opening;
    } finally {
      this.opening = null;
    }
  }
  private async read(store: StoreName): Promise<any[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readonly");
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error ?? new Error("Offline read aborted"));
    });
  }
  private async write(
    store: StoreName,
    update: (store: IDBObjectStore) => void
  ): Promise<void> {
    await this.init();
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(store, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Offline save failed"));
      tx.onabort = () =>
        reject(tx.error ?? new Error("Offline save was not committed"));
      try {
        update(tx.objectStore(store));
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
    if (store === STORE_NAME) notifyPendingResultListeners();
    if (store === SMOKE_TEST_STORE_NAME) notifyPendingSmokeTestListeners();
    if (store === PHOTO_STORE_NAME) notifyPendingPhotoListeners();
  }
  private async owned<T>(
    store: StoreName,
    scope: OfflineScope | null
  ): Promise<T[]> {
    if (!scope) return [];
    requireOfflineScope(scope);
    return (await this.read(store)).filter(item =>
      isOwnedOfflineRecord(store, item, scope)
    );
  }
  private async updateOwned(
    store: StoreName,
    id: string,
    scope: OfflineScope | null,
    update: (item: any, objectStore: IDBObjectStore) => void
  ) {
    requireOfflineScope(scope);
    await this.write(store, objectStore => {
      const request = objectStore.get(id);
      request.onsuccess = () => {
        if (isOwnedOfflineRecord(store, request.result, scope))
          update(request.result, objectStore);
      };
    });
  }
  async savePendingResult(
    data: Omit<PendingInspectionResult, "id" | "timestamp" | "synced">,
    scope: OfflineScope | null
  ): Promise<string> {
    requireOfflineScope(scope);
    const item = {
      ...data,
      ...scope,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      synced: false,
    };
    pendingOfflineSchemas[STORE_NAME].parse(item);
    await this.write(STORE_NAME, store => store.add(item));
    return item.id;
  }
  async getAllResults(
    scope: OfflineScope | null
  ): Promise<PendingInspectionResult[]> {
    return this.owned(STORE_NAME, scope);
  }
  async getPendingResults(
    scope: OfflineScope | null
  ): Promise<PendingInspectionResult[]> {
    return (await this.getAllResults(scope)).filter(item => !item.synced);
  }
  async getPendingResultsForJob(
    jobId: number,
    scope: OfflineScope | null
  ): Promise<PendingInspectionResult[]> {
    return (await this.getPendingResults(scope)).filter(
      item => item.jobId === jobId
    );
  }
  async getPendingCount(scope: OfflineScope | null) {
    return (await this.getPendingResults(scope)).length;
  }
  async markAsSynced(id: string, scope: OfflineScope | null) {
    await this.updateOwned(STORE_NAME, id, scope, (item, store) =>
      store.put({ ...item, synced: true })
    );
  }
  async deleteSyncedResult(id: string, scope: OfflineScope | null) {
    await this.updateOwned(STORE_NAME, id, scope, (item, store) => {
      if (item.synced) store.delete(id);
    });
  }
  async clearSyncedResults(scope: OfflineScope | null) {
    for (const item of await this.getAllResults(scope))
      if (item.synced) await this.deleteSyncedResult(item.id, scope);
  }
  async clearAllResults(scope: OfflineScope | null) {
    await this.clearSyncedResults(scope);
  }
  async savePendingSmokeTest(
    data: Omit<PendingSmokeAlarmTest, "id" | "timestamp" | "synced">,
    scope: OfflineScope | null
  ): Promise<string> {
    requireOfflineScope(scope);
    const item = {
      ...data,
      ...scope,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      synced: false,
    };
    pendingOfflineSchemas[SMOKE_TEST_STORE_NAME].parse(item);
    await this.write(SMOKE_TEST_STORE_NAME, store => {
      const request = store.index("alarmId").getAll(data.alarmId);
      request.onsuccess = () => {
        for (const old of request.result)
          if (
            isOwnedOfflineRecord(SMOKE_TEST_STORE_NAME, old, scope) &&
            old.jobId === data.jobId
          )
            store.delete(old.id);
        store.add(item);
      };
    });
    return item.id;
  }
  async getPendingSmokeTests(
    scope: OfflineScope | null
  ): Promise<PendingSmokeAlarmTest[]> {
    return (
      await this.owned<PendingSmokeAlarmTest>(SMOKE_TEST_STORE_NAME, scope)
    ).filter(item => !item.synced);
  }
  async deleteSmokeTest(id: string, scope: OfflineScope | null) {
    await this.updateOwned(SMOKE_TEST_STORE_NAME, id, scope, (_item, store) =>
      store.delete(id)
    );
  }
  async getPendingSmokeTestCount(scope: OfflineScope | null) {
    return (await this.getPendingSmokeTests(scope)).length;
  }
  async clearAllSmokeTests(scope: OfflineScope | null) {
    for (const item of await this.owned<PendingSmokeAlarmTest>(
      SMOKE_TEST_STORE_NAME,
      scope
    ))
      if (item.synced) await this.deleteSmokeTest(item.id, scope);
  }
  async savePendingPhoto(
    data: Omit<PendingDeficiencyPhoto, "id" | "timestamp">,
    scope: OfflineScope | null,
    stableId?: string
  ): Promise<string> {
    requireOfflineScope(scope);
    const item = {
      ...data,
      ...scope,
      id: stableId ?? crypto.randomUUID(),
      timestamp: Date.now(),
    };
    pendingOfflineSchemas[PHOTO_STORE_NAME].parse(item);
    await this.write(PHOTO_STORE_NAME, store => {
      const request = store.get(item.id);
      request.onsuccess = () => {
        if (request.result === undefined) store.add(item);
        else if (
          !isOwnedOfflineRecord(PHOTO_STORE_NAME, request.result, scope) ||
          Object.entries(data).some(
            ([key, value]) => request.result[key] !== value
          )
        )
          store.transaction.abort();
      };
    });
    return item.id;
  }
  async setPhotoResolvedDeficiencyId(
    id: string,
    deficiencyId: number,
    scope: OfflineScope | null,
    jobId: number
  ) {
    positiveId.parse(deficiencyId);
    await this.updateOwned(PHOTO_STORE_NAME, id, scope, (item, store) => {
      if (item.jobId !== jobId) {
        store.transaction.abort();
        return;
      }
      store.put({ ...item, resolvedDeficiencyId: deficiencyId });
    });
  }
  async getPendingPhotosForDeficiency(
    deficiencyLocalId: string,
    scope: OfflineScope | null
  ): Promise<PendingDeficiencyPhoto[]> {
    return (
      await this.owned<PendingDeficiencyPhoto>(PHOTO_STORE_NAME, scope)
    ).filter(item => item.deficiencyLocalId === deficiencyLocalId);
  }
  async getPhotosReadyToUpload(
    scope: OfflineScope | null
  ): Promise<PendingDeficiencyPhoto[]> {
    return (
      await this.owned<PendingDeficiencyPhoto>(PHOTO_STORE_NAME, scope)
    ).filter(item => item.resolvedDeficiencyId !== undefined);
  }
  async deletePendingPhoto(id: string, scope: OfflineScope | null) {
    await this.updateOwned(PHOTO_STORE_NAME, id, scope, (_item, store) =>
      store.delete(id)
    );
  }
  async getPendingPhotoCount(scope: OfflineScope | null) {
    return (await this.owned(PHOTO_STORE_NAME, scope)).length;
  }
  async getPendingPhotosForJob(jobId: number, scope: OfflineScope | null): Promise<PendingDeficiencyPhoto[]> {
    positiveId.parse(jobId);
    return (await this.owned<PendingDeficiencyPhoto>(PHOTO_STORE_NAME, scope)).filter(item => item.jobId === jobId);
  }
  async recoverySummary(
    scope: OfflineScope | null
  ): Promise<OfflineRecoverySummary> {
    const summary = { legacy: 0, invalid: 0, foreign: 0 };
    for (const store of Object.keys(pendingOfflineSchemas) as StoreName[]) {
      for (const item of await this.read(store)) {
        if (!canExportOfflineRecord(item, scope)) summary.foreign++;
        else if (
          !item ||
          typeof item !== "object" ||
          !Object.hasOwn(item, "userId") ||
          !Object.hasOwn(item, "companyId")
        )
          summary.legacy++;
        else if (!isOwnedOfflineRecord(store, item, scope)) summary.invalid++;
      }
    }
    return summary;
  }
  async exportRecovery(scope: OfflineScope | null, includeUnowned = false) {
    requireOfflineScope(scope);
    const records: Record<string, unknown[]> = {};
    for (const store of Object.keys(pendingOfflineSchemas) as StoreName[]) {
      records[store] = (await this.read(store)).filter(item =>
        canExportOfflineRecord(item, scope) &&
          (includeUnowned || belongsToOfflineScope(item, scope))
      );
    }
    return records;
  }
}
export const offlineStorage = new OfflineStorage();
