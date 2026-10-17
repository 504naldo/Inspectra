import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadAndCachePacket,
  readPacketStore,
  readScopedPacketRecovery,
  removePacketById,
  savePacketEntry,
  type PacketEntry,
} from "./scopedPacketStore";
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
const scope = { userId: 1, companyId: 7 };
const packet = (id = 20) => ({
  job: { id, companyId: 7, title: "Private job" },
  site: { id: 30 },
  devices: [],
  deficiencies: [],
  cacheVersion: "v1",
});
const entry = (id = 20): PacketEntry => ({
  packet: packet(id),
  cachedAt: "2026-10-16T12:00:00Z",
  cacheVersion: "v1",
  status: "cached",
});
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

describe("Account and company scoped offline job packets", () => {
  it("isolates cached packet reads and removal across users and companies", () => {
    savePacketEntry(20, entry(), scope, storage);
    expect(readPacketStore(scope, storage)["20"].packet.job.title).toBe(
      "Private job"
    );
    for (const other of [
      { ...scope, userId: 2 },
      { ...scope, companyId: 8 },
    ]) {
      expect(readPacketStore(other, storage)).toEqual({});
      removePacketById(20, other, storage);
    }
    expect(readPacketStore(scope, storage)["20"]).toBeDefined();
    expect(readPacketStore(null, storage)).toEqual({});
  });

  it("keeps the old global packet store untouched and never adopts it for the next login", () => {
    const raw = JSON.stringify({ "20": entry() });
    storage.setItem("fire_inspect_job_packets", raw);
    expect(readPacketStore(scope, storage)).toEqual({});
    expect(readPacketStore({ ...scope, userId: 2 }, storage)).toEqual({});
    savePacketEntry(21, entry(21), scope, storage);
    removePacketById(21, scope, storage);
    expect(storage.getItem("fire_inspect_job_packets")).toBe(raw);
  });

  it("stores jobs individually so separate tabs do not erase unrelated caches", () => {
    savePacketEntry(20, entry(), scope, storage);
    savePacketEntry(21, entry(21), scope, storage);
    expect(Object.keys(readPacketStore(scope, storage))).toEqual(["20", "21"]);
    removePacketById(20, scope, storage);
    expect(Object.keys(readPacketStore(scope, storage))).toEqual(["21"]);
  });

  it("quarantines malformed own packets and retains exact raw data for recovery", () => {
    const key = "inspectra_job_packets_v2:1:7:20";
    storage.setItem(key, "{malformed");
    expect(readPacketStore(scope, storage)).toEqual({});
    expect(readScopedPacketRecovery(scope, storage)).toEqual([
      { key, raw: "{malformed" },
    ]);
    expect(() => savePacketEntry(20, entry(), scope, storage)).toThrow(
      /recovery/
    );
    expect(() => removePacketById(20, scope, storage)).toThrow(/exported/);
    expect(storage.getItem(key)).toBe("{malformed");
  });

  it("rejects mislabeled packet identity and cache version before saving", () => {
    expect(() => savePacketEntry(20, entry(21), scope, storage)).toThrow(
      /invalid/
    );
    expect(() =>
      savePacketEntry(20, { ...entry(), cacheVersion: "other" }, scope, storage)
    ).toThrow(/invalid/);
    expect(() => savePacketEntry(20, entry(), null, storage)).toThrow(
      /Sign in/
    );
    expect(storage.length).toBe(0);
  });

  it("does not claim offline availability after a quota failure", async () => {
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    await expect(
      loadAndCachePacket(
        20,
        scope,
        async () => packet(),
        () => true,
        storage
      )
    ).rejects.toThrow("Quota exceeded");
    expect(readPacketStore(scope, storage)).toEqual({});
  });

  it("does not save a late fetch after logout, account change, job navigation or superseding request", async () => {
    let complete!: (value: unknown) => void;
    let current = true;
    const cached = loadAndCachePacket(
      20,
      scope,
      () =>
        new Promise(resolve => {
          complete = resolve;
        }),
      () => current,
      storage
    );
    current = false;
    complete(packet());
    await expect(cached).resolves.toBeUndefined();
    expect(storage.length).toBe(0);
  });

  it("checks current identity before making the fetch and validates its returned job", async () => {
    const fetch = vi.fn(async () => packet());
    await loadAndCachePacket(20, scope, fetch, () => false, storage);
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      loadAndCachePacket(
        20,
        scope,
        async () => packet(21),
        () => true,
        storage
      )
    ).rejects.toThrow(/different job/);
    expect(storage.length).toBe(0);
  });

  it("returns availability only after the scoped cache write succeeds", async () => {
    const saved = await loadAndCachePacket(
      20,
      scope,
      async () => packet(),
      () => true,
      storage
    );
    expect(saved?.status).toBe("cached");
    expect(readPacketStore(scope, storage)["20"]).toEqual(saved);
  });
});
