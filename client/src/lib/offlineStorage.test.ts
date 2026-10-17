import { describe, expect, it, vi } from "vitest";
import {
  OfflineStorage,
  isOwnedOfflineRecord,
  subscribePendingResults,
} from "./offlineStorage";
const scope = { userId: 1, companyId: 2 };
const result = {
  jobId: 10,
  fireAlarmSystemId: 20,
  checklistItemId: 30,
  questionRevision:
    "inspection-capture-v1:fire-alarm-question:" + "a".repeat(64),
  result: "pass" as const,
};
const smoke = {
  jobId: 10,
  alarmId: 20,
  expectedDeviceRevision: "displayed-device-revision",
  testResult: "pass" as const,
};
const photo = {
  jobId: 10,
  deficiencyLocalId: "def",
  fileName: "a.jpg",
  mimeType: "image/jpeg" as const,
  fileSize: 3,
  fileData: "YWJj",
};
const names = [
  "pendingInspectionResults",
  "pendingSmokeAlarmTests",
  "pendingDeficiencyPhotos",
] as const;
/** Models the important IDB contract: request success precedes transaction commit,
 * and an aborted transaction rolls back all writes. No browser/server is used. */
function fixture() {
  const records = Object.fromEntries(
    names.map(name => [name, new Map<string, any>()])
  );
  let abortCommit = false;
  const db = {
    transaction(name: string, mode: string) {
      const copy = new Map(records[name]);
      let pending = 0;
      let done = false;
      let scheduled = false;
      const tx: any = {
        error: null,
        abort() {
          if (done) return;
          done = true;
          tx.onabort?.();
        },
        objectStore: () => store,
      };
      const finish = () => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          if (done || pending) return;
          if (mode === "readwrite" && abortCommit) {
            abortCommit = false;
            tx.abort();
            return;
          }
          done = true;
          if (mode === "readwrite") records[name] = copy;
          tx.oncomplete?.();
        }, 0);
      };
      const request = (run: () => any) => {
        const req: any = {};
        pending++;
        queueMicrotask(() => {
          if (done) return;
          try {
            req.result = run();
            req.onsuccess?.();
          } catch (error) {
            req.error = error;
            req.onerror?.();
            tx.abort();
          }
          pending--;
          finish();
        });
        return req;
      };
      const store: any = {
        transaction: tx,
        get: (id: string) => request(() => copy.get(id)),
        getAll: () => request(() => Array.from(copy.values())),
        add: (item: any) =>
          request(() => {
            if (copy.has(item.id)) throw new Error("duplicate");
            copy.set(item.id, structuredClone(item));
          }),
        put: (item: any) =>
          request(() => copy.set(item.id, structuredClone(item))),
        delete: (id: string) => request(() => copy.delete(id)),
        index: (key: string) => ({
          getAll: (value: unknown) =>
            request(() =>
              Array.from(copy.values()).filter(item => item[key] === value)
            ),
        }),
      };
      finish();
      return tx;
    },
  };
  const storage = new OfflineStorage();
  (storage as any).db = db;
  return {
    storage,
    records,
    failCommit: () => {
      abortCommit = true;
    },
  };
}
describe("typed IndexedDB offline recovery", () => {
  it("waits for transaction commit and never reports request success as durable save", async () => {
    const { storage, records, failCommit } = fixture();
    const notify = vi.fn();
    const unsubscribe = subscribePendingResults(notify);
    failCommit();
    await expect(storage.savePendingResult(result, scope)).rejects.toThrow(
      /committed/
    );
    expect(records.pendingInspectionResults.size).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    await storage.savePendingResult(result, scope);
    expect(records.pendingInspectionResults.size).toBe(1);
    expect(notify).toHaveBeenCalledOnce();
    unsubscribe();
  });
  it("requires resolved identity before persisting any data", async () => {
    const { storage, records } = fixture();
    await expect(storage.savePendingResult(result, null)).rejects.toThrow(
      /Sign in/
    );
    await expect(storage.savePendingSmokeTest(smoke, null)).rejects.toThrow(
      /Sign in/
    );
    await expect(storage.savePendingPhoto(photo, null)).rejects.toThrow(
      /Sign in/
    );
    expect(Object.values(records).every(map => map.size === 0)).toBe(true);
  });
  it("never replays legacy, foreign or invalid fire/smoke/photo records", async () => {
    const { storage, records } = fixture();
    await storage.savePendingResult(result, scope);
    await storage.savePendingSmokeTest(smoke, scope);
    await storage.savePendingPhoto(photo, scope);
    for (const name of names) {
      const owned = Array.from(records[name].values())[0];
      records[name].set("foreign", { ...owned, id: "foreign", userId: 50 });
      records[name].set("invalid", { ...owned, id: "invalid", jobId: -1 });
      const legacy = { ...owned, id: "legacy" };
      delete legacy.userId;
      delete legacy.companyId;
      records[name].set("legacy", legacy);
    }
    expect(await storage.getPendingResults(scope)).toHaveLength(1);
    expect(await storage.getPendingSmokeTests(scope)).toHaveLength(1);
    expect(await storage.getPendingPhotoCount(scope)).toBe(1);
    expect(await storage.recoverySummary(scope)).toEqual({
      legacy: 3,
      invalid: 3,
      foreign: 3,
    });
    const exported = await storage.exportRecovery(scope);
    expect(Object.values(exported).every(items => items.length === 2)).toBe(
      true
    );
    expect(JSON.stringify(exported)).not.toContain("foreign");
    const administratorRecovery = await storage.exportRecovery(scope, true);
    expect(Object.values(administratorRecovery).every(items => items.length === 3)).toBe(true);
    expect(JSON.stringify(administratorRecovery)).not.toContain("foreign");
  });
  it("a smoke-alarm update only replaces the same account/company/job result", async () => {
    const { storage } = fixture();
    const foreign = { ...scope, userId: 8 };
    await storage.savePendingSmokeTest(smoke, scope);
    await storage.savePendingSmokeTest(smoke, foreign);
    await storage.savePendingSmokeTest({ ...smoke, jobId: 11 }, scope);
    await storage.savePendingSmokeTest({ ...smoke, testResult: "fail" }, scope);
    expect(await storage.getPendingSmokeTests(scope)).toMatchObject([
      { jobId: 11 },
      { jobId: 10, testResult: "fail" },
    ]);
    expect(await storage.getPendingSmokeTests(foreign)).toMatchObject([
      { testResult: "pass" },
    ]);
  });
  it("foreign-account acknowledgements and cleanup cannot remove unsynced data", async () => {
    const { storage } = fixture();
    const id = await storage.savePendingResult(result, scope);
    await storage.markAsSynced(id, { ...scope, userId: 9 });
    await storage.deleteSyncedResult(id, scope);
    await storage.clearAllResults(scope);
    expect(await storage.getPendingResults(scope)).toHaveLength(1);
    await storage.markAsSynced(id, scope);
    await storage.deleteSyncedResult(id, scope);
    expect(await storage.getPendingResults(scope)).toEqual([]);
  });
  it("retains a newer smoke test when acknowledgement for the superseded record arrives", async () => {
    const { storage } = fixture();
    const old = await storage.savePendingSmokeTest(smoke, scope);
    await storage.savePendingSmokeTest({ ...smoke, testResult: "fail" }, scope);
    await storage.deleteSmokeTest(old, scope);
    expect(await storage.getPendingSmokeTests(scope)).toMatchObject([
      { testResult: "fail" },
    ]);
  });
  it("preserves smoke answers missing a displayed device revision instead of replaying or upgrading them", async () => {
    const { storage, records } = fixture();
    const id = await storage.savePendingSmokeTest(smoke, scope);
    const old = { ...records.pendingSmokeAlarmTests.get(id) };
    delete old.expectedDeviceRevision;
    records.pendingSmokeAlarmTests.set(id, old);
    expect(await storage.getPendingSmokeTests(scope)).toEqual([]);
    expect((await storage.recoverySummary(scope)).invalid).toBe(1);
    await storage.savePendingSmokeTest({ ...smoke, expectedDeviceRevision: "newly-displayed" }, scope);
    expect(records.pendingSmokeAlarmTests.get(id)).toEqual(old);
    expect(await storage.getPendingSmokeTests(scope)).toMatchObject([{ expectedDeviceRevision: "newly-displayed" }]);
  });
  it("keeps photos unresolved until their own job parent is durably linked", async () => {
    const { storage } = fixture();
    const id = await storage.savePendingPhoto(photo, scope);
    expect(await storage.getPhotosReadyToUpload(scope)).toEqual([]);
    await expect(
      storage.setPhotoResolvedDeficiencyId(id, 70, scope, 999)
    ).rejects.toThrow(/committed/);
    expect(await storage.getPhotosReadyToUpload(scope)).toEqual([]);
    await storage.setPhotoResolvedDeficiencyId(id, 70, scope, 10);
    expect(await storage.getPhotosReadyToUpload(scope)).toMatchObject([
      { resolvedDeficiencyId: 70 },
    ]);
    await storage.deletePendingPhoto(id, { ...scope, companyId: 99 });
    expect(await storage.getPendingPhotoCount(scope)).toBe(1);
  });
  it("counts pending photos for the actual account and job after their deficiency is resolved", async () => {
    const { storage, records } = fixture();
    await storage.savePendingPhoto(
      { ...photo, resolvedDeficiencyId: 70 },
      scope
    );
    await storage.savePendingPhoto({ ...photo, jobId: 11 }, scope);
    await storage.savePendingPhoto(photo, { ...scope, userId: 9 });
    const owned = Array.from(records.pendingDeficiencyPhotos.values())[0];
    records.pendingDeficiencyPhotos.set("unreadable", {
      ...owned,
      id: "unreadable",
      jobId: -1,
    });
    expect(await storage.getPendingPhotosForJob(10, scope)).toMatchObject([
      { jobId: 10, resolvedDeficiencyId: 70 },
    ]);
    expect(await storage.getPendingPhotosForJob(11, scope)).toHaveLength(1);
    expect(await storage.getPendingPhotosForJob(12, scope)).toEqual([]);
    expect(
      await storage.getPendingPhotosForJob(10, { ...scope, userId: 9 })
    ).toHaveLength(1);
    expect((await storage.recoverySummary(scope)).invalid).toBe(1);
    await expect(storage.getPendingPhotosForJob(0, scope)).rejects.toThrow();
  });
  it("reuses stable photo identity across commit retries and rejects foreign/changed collisions", async () => {
    const { storage } = fixture();
    const id = "stable";
    await storage.savePendingPhoto(photo, scope, id);
    await storage.savePendingPhoto(photo, scope, id);
    expect(await storage.getPendingPhotoCount(scope)).toBe(1);
    await expect(
      storage.savePendingPhoto({ ...photo, caption: "changed" }, scope, id)
    ).rejects.toThrow(/committed/);
    await expect(
      storage.savePendingPhoto(photo, { ...scope, userId: 9 }, id)
    ).rejects.toThrow(/committed/);
    expect(
      await storage.getPendingPhotosForDeficiency("def", scope)
    ).toMatchObject([{ id, fileData: "YWJj" }]);
  });
  it("validates record shapes before replay rather than trusting their TS cast", () => {
    expect(
      isOwnedOfflineRecord(
        "pendingInspectionResults",
        { ...result, ...scope, id: "a", timestamp: 1, synced: false },
        scope
      )
    ).toBe(true);
    expect(
      isOwnedOfflineRecord(
        "pendingInspectionResults",
        {
          ...result,
          ...scope,
          id: "a",
          timestamp: 1,
          synced: false,
          result: "arbitrary",
        },
        scope
      )
    ).toBe(false);
  });
});
it("exports quarantined partial ownership only when every recorded owner field matches", async () => {
  const { storage, records } = fixture();
  await storage.savePendingResult(result, scope);
  const original = Array.from(records.pendingInspectionResults.values())[0];
  const ownPartial = { ...original, id: "ownPartial" };
  delete ownPartial.companyId;
  const foreignPartial = { ...ownPartial, id: "foreignPartial", userId: 99 };
  records.pendingInspectionResults.set("ownPartial", ownPartial);
  records.pendingInspectionResults.set("foreignPartial", foreignPartial);
  expect(await storage.recoverySummary(scope)).toEqual({
    legacy: 1,
    invalid: 0,
    foreign: 1,
  });
  expect(
    (await storage.exportRecovery(scope, true)).pendingInspectionResults
  ).toContainEqual(ownPartial);
  expect((await storage.exportRecovery(scope)).pendingInspectionResults).not.toContainEqual(ownPartial);
  expect(JSON.stringify(await storage.exportRecovery(scope))).not.toContain(
    "foreignPartial"
  );
});
it("quarantines an older fire answer without the displayed question revision and preserves it for export", async () => {
  const { storage, records } = fixture();
  const id = await storage.savePendingResult(result, scope);
  const legacy = { ...records.pendingInspectionResults.get(id) };
  delete legacy.questionRevision;
  records.pendingInspectionResults.set(id, legacy);
  expect(await storage.getPendingResults(scope)).toEqual([]);
  expect(await storage.recoverySummary(scope)).toEqual({
    legacy: 0,
    invalid: 1,
    foreign: 0,
  });
  expect(
    (await storage.exportRecovery(scope)).pendingInspectionResults
  ).toContainEqual(legacy);
  await storage.clearAllResults(scope);
  expect(records.pendingInspectionResults.get(id)).toEqual(legacy);
});
