import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScopedOfflineQueue,
  legacyOfflineRecovery,
} from "./scopedOfflineQueue";
import { mutationQueue } from "./mutationQueue";
import { offlineScopeFromUser } from "./offlineScope";
class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const scope = { userId: 1, companyId: 2 };
const draft = {
  localId: "a",
  jobId: 10,
  deviceId: 20,
  expectedDeviceRevision: "displayed-device-revision",
  result: "pass" as const,
  testedAt: new Date("2026-10-16T00:00:00Z"),
  synced: false,
};
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});
describe("scoped offline queues", () => {
  it("quarantines older template answers without the displayed question revision", () => {
    const queue = new ScopedOfflineQueue("templates", scope, storage);
    const old = { localId: "template", jobId: 10, templateId: 20, sectionId: 30, itemId: 40, responseValue: "pass", synced: false };
    storage.setItem(queue.prefix + "template", JSON.stringify(old));
    expect(queue.read()).toEqual([]);
    expect(queue.recovery()).toHaveLength(1);
    expect(() => queue.save(old as any)).toThrow(/invalid/);
  });
  it("rejects unresolved identity rather than guessing a company/account", () => {
    expect(offlineScopeFromUser({ id: 1 })).toBeNull();
    expect(offlineScopeFromUser({ id: 1, companyId: null })).toEqual({
      userId: 1,
      companyId: null,
    });
    const queue = new ScopedOfflineQueue("results", null, storage);
    expect(() => queue.save(draft)).toThrow(/Sign in/);
    expect(storage.length).toBe(0);
  });
  it("separates both account and company while keeping unowned legacy data intact", () => {
    const legacy = JSON.stringify([draft]);
    storage.setItem("fire_inspect_offline_results", legacy);
    const queue = new ScopedOfflineQueue("results", scope, storage);
    queue.save(draft);
    expect(queue.read()).toHaveLength(1);
    expect(
      new ScopedOfflineQueue("results", { ...scope, userId: 3 }, storage).read()
    ).toEqual([]);
    expect(
      new ScopedOfflineQueue(
        "results",
        { ...scope, companyId: 4 },
        storage
      ).read()
    ).toEqual([]);
    expect(storage.getItem("fire_inspect_offline_results")).toBe(legacy);
    expect(legacyOfflineRecovery(storage)).toEqual([
      { key: "fire_inspect_offline_results", raw: legacy },
    ]);
  });
  it("preserves corrupt records and refuses to overwrite them with a new save", () => {
    const queue = new ScopedOfflineQueue("results", scope, storage);
    const key = queue.prefix + "a";
    storage.setItem(key, "{invalid");
    expect(queue.read()).toEqual([]);
    expect(queue.recovery()).toEqual([{ key, raw: "{invalid" }]);
    expect(() => queue.save(draft)).toThrow(/recovery/);
    queue.clearSynced();
    expect(storage.getItem(key)).toBe("{invalid");
  });
  it.each(["results", "deficiencies", "checklist", "templates"] as const)(
    "does not replay unknown shapes from %s",
    kind => {
      const queue = new ScopedOfflineQueue(kind, scope, storage);
      storage.setItem(
        queue.prefix + "unknown",
        JSON.stringify({
          localId: "unknown",
          jobId: 10,
          url: "/arbitrary",
          body: "{}",
        })
      );
      expect(queue.read()).toEqual([]);
      expect(queue.recovery()).toHaveLength(1);
    }
  );
  it("keeps newer edits when an old request is acknowledged, including another tab", () => {
    const tab1 = new ScopedOfflineQueue("results", scope, storage);
    const tab2 = new ScopedOfflineQueue("results", scope, storage);
    tab1.save(draft);
    const sent = tab1.read();
    tab2.save({ ...draft, result: "fail" });
    tab1.acknowledge(sent);
    expect(tab1.read()).toMatchObject([{ result: "fail" }]);
    tab2.acknowledge(tab2.read());
    expect(tab1.read()).toEqual([]);
  });
  it("does not let acknowledgement of one item delete other drafts from that job", () => {
    const queue = new ScopedOfflineQueue("results", scope, storage);
    queue.save(draft);
    const sent = queue.read();
    queue.save({ ...draft, localId: "b", deviceId: 21 });
    queue.acknowledge(sent);
    expect(queue.read().map(r => r.localId)).toEqual(["b"]);
  });
  it("stores individual records so separate tabs cannot overwrite unrelated changes", () => {
    new ScopedOfflineQueue("results", scope, storage).save(draft);
    new ScopedOfflineQueue("results", scope, storage).save({
      ...draft,
      localId: "b",
      deviceId: 21,
    });
    expect(
      new ScopedOfflineQueue("results", scope, storage).read()
    ).toHaveLength(2);
  });
  it("cleanup preserves every unsynced record", () => {
    const queue = new ScopedOfflineQueue("results", scope, storage);
    queue.save(draft);
    queue.clearSynced();
    expect(queue.read()).toHaveLength(1);
  });
  it("surfaces storage quota failure before claiming a successful save", () => {
    const queue = new ScopedOfflineQueue("results", scope, storage);
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => queue.save(draft)).toThrow("quota");
    expect(queue.read()).toEqual([]);
  });
  it("validates dates, status enums and financial/parent values before any write", () => {
    const queue = new ScopedOfflineQueue("results", scope, storage);
    expect(() =>
      queue.save({ ...draft, testedAt: "yesterday" as any })
    ).toThrow(/invalid/);
    expect(() => queue.save({ ...draft, deviceId: -1 })).toThrow(/invalid/);
    expect(storage.length).toBe(0);
  });
  it("quarantines older answers without a displayed device revision and preserves their original bytes", () => {
    const queue = new ScopedOfflineQueue("results", scope, storage);
    const { expectedDeviceRevision: _revision, ...legacy } = draft;
    const raw = JSON.stringify({ ...legacy, queueRevision: "older-answer" });
    const key = queue.prefix + encodeURIComponent(draft.localId);
    storage.setItem(key, raw);
    expect(queue.read()).toEqual([]);
    expect(queue.recovery()).toEqual([{ key, raw }]);
    expect(() => queue.save(draft)).toThrow(/recovery/);
    expect(storage.getItem(key)).toBe(raw);
  });
  it("requires captured device evidence only for a linked deficiency", () => {
    const queue = new ScopedOfflineQueue("deficiencies", scope, storage);
    const deficiency = { localId: "d", jobId: 10, title: "Observed issue", severity: "major" as const, synced: false };
    expect(() => queue.save({ ...deficiency, deviceId: 20 })).toThrow(/invalid/);
    queue.save({ ...deficiency, deviceId: 20, expectedDeviceRevision: "original-display" });
    expect(queue.read()).toMatchObject([{ deviceId: 20, expectedDeviceRevision: "original-display" }]);
    queue.save({ ...deficiency, localId: "job-only" });
    expect(queue.read().find(row => row.localId === "job-only")?.expectedDeviceRevision).toBeUndefined();
  });
});
describe("legacy requests", () => {
  it.each(["{broken", "{}", "null", "[null]"])(
    "counts malformed legacy data as blocked and never overwrites it: %s",
    raw => {
      storage.setItem("inspectra_mutation_queue", raw);
      expect(mutationQueue.count()).toBeGreaterThan(0);
      expect(() => mutationQueue.add("/api/trpc/arbitrary", "{}")).toThrow(
        /typed/
      );
      expect(() => mutationQueue.clear()).toThrow(/preserved/);
      expect(storage.getItem("inspectra_mutation_queue")).toBe(raw);
      expect(legacyOfflineRecovery(storage)).toEqual([
        { key: "inspectra_mutation_queue", raw },
      ]);
    }
  );
});
it("acknowledgement cannot erase a cross-tab edit inserted at the acknowledgement boundary", () => {
  const first = new ScopedOfflineQueue("results", scope, storage),
    second = new ScopedOfflineQueue("results", scope, storage);
  first.save(draft);
  const sent = first.read();
  const originalSet = storage.setItem.bind(storage);
  vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
    if (key.includes(":ack:")) {
      originalSet(
        first.prefix + encodeURIComponent(draft.localId),
        JSON.stringify({
          ...draft,
          result: "fail",
          queueRevision: "newer-tab-revision",
        })
      );
    }
    originalSet(key, value);
  });
  first.acknowledge(sent);
  expect(second.read()).toMatchObject([
    { result: "fail", queueRevision: "newer-tab-revision" },
  ]);
});
