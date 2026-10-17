import { afterEach, expect, it, vi } from "vitest";
import {
  PendingSaves,
  fireAlarmDraftKey,
  pendingFireAlarmDraftCount,
} from "./pendingSaves";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
it("retains different rows and coalesces only the same row", async () => {
  vi.useFakeTimers();
  const pending = new PendingSaves(),
    save = vi.fn();
  pending.schedule("result:1", () => save("old"), 1500);
  pending.schedule("result:2", () => save("two"), 1500);
  pending.schedule("result:1", () => save("new"), 1500);
  await vi.advanceTimersByTimeAsync(1500);
  expect(save.mock.calls).toEqual([["two"], ["new"]]);
});
it("flushes pending records once even when another flush occurs during acknowledgement", async () => {
  vi.useFakeTimers();
  const pending = new PendingSaves(),
    save = vi.fn();
  for (const key of ["header", "result:1", "attendance:1", "ancillary:1"])
    pending.schedule(key, () => save(key), 1500);
  await Promise.all([pending.flush(), pending.flush()]);
  await vi.runAllTimersAsync();
  expect(save.mock.calls.map(c => c[0])).toEqual([
    "header",
    "result:1",
    "attendance:1",
    "ancillary:1",
  ]);
});
it("persists all drafts before debounce and recovers them after unmount/reload", async () => {
  vi.useFakeTimers();
  const storage = memoryStorage(),
    send = vi.fn(async () => ({}));
  const key = fireAlarmDraftKey(1, 10, 20),
    queue = new PendingSaves({ key, storage, send });
  for (const field of ["header", "result:1", "attendance:1", "ancillary:1"])
    queue.schedule(field, () => send(field, { jobId: 20 }), 1500, {
      jobId: 20,
    });
  expect(pendingFireAlarmDraftCount(key, storage)).toBe(4);
  queue.close();
  await vi.runAllTimersAsync();
  expect(send).not.toHaveBeenCalled();
  const restored = new PendingSaves({ key, storage, send });
  await restored.flush();
  expect(send).toHaveBeenCalledTimes(4);
  expect(pendingFireAlarmDraftCount(key, storage)).toBe(0);
});
it("server rejection leaves the draft for recovery and keeps it out of another account", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 10, 20),
    send = vi.fn(async () => {
      throw new Error("offline");
    });
  const queue = new PendingSaves({ key, storage, send });
  queue.schedule("header", () => send(), 1500, {
    jobId: 20,
    systemModel: "Captured",
  });
  await queue.flush();
  expect(pendingFireAlarmDraftCount(key, storage)).toBe(1);
  const other = new PendingSaves({
    key: fireAlarmDraftKey(2, 10, 20),
    storage,
    send,
  });
  await other.flush();
  expect(send).toHaveBeenCalledTimes(1);
  expect(other.count()).toBe(0);
});
it("serializes edits to the same record and never acknowledges a newer version with an older reply", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 10, 20);
  let acknowledge!: () => void;
  const first = new Promise<void>(resolve => {
      acknowledge = resolve;
    }),
    send = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
  const queue = new PendingSaves({ key, storage, send });
  queue.schedule("header", () => first, 1500, { jobId: 20, version: 1 });
  const running = queue.flush();
  await Promise.resolve();
  queue.schedule("header", () => send(), 1500, { jobId: 20, version: 2 });
  acknowledge();
  await running;
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(2);
  expect(pendingFireAlarmDraftCount(key, storage)).toBe(0);
});
it("storage errors do not erase malformed older drafts", () => {
  const storage = memoryStorage(),
    key = "broken";
  storage.setItem(key, "keep this corrupt data");
  const queue = new PendingSaves({ key, storage, send: vi.fn() });
  expect(() => queue.schedule("header", vi.fn(), 1500, { jobId: 20 })).toThrow(
    /recovery/
  );
  expect(storage.getItem(key)).toBe("keep this corrupt data");
});

it("never dispatches an edit whose durable write failed, even after a later flush", async () => {
  const storage = memoryStorage(),
    send = vi.fn(),
    key = fireAlarmDraftKey(1, 2, 3);
  const queue = new PendingSaves({ key, storage, send });
  vi.spyOn(storage, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() => queue.schedulePersisted("header", { jobId: 3 }, 1500)).toThrow(
    "quota"
  );
  await queue.flush();
  expect(queue.count()).toBe(0);
  expect(send).not.toHaveBeenCalled();
});
it("does not cancel or replace the prior durable draft when a replacement hits quota", async () => {
  const storage = memoryStorage(),
    send = vi.fn(),
    key = fireAlarmDraftKey(1, 2, 3);
  const queue = new PendingSaves({ key, storage, send });
  queue.schedulePersisted("header", { jobId: 3, systemModel: "old" }, 1500);
  const write = vi.spyOn(storage, "setItem");
  write.mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(() =>
    queue.schedulePersisted(
      "header",
      { jobId: 3, systemModel: "unpersisted" },
      1500
    )
  ).toThrow("quota");
  expect(queue.payload("header")).toMatchObject({ systemModel: "old" });
  await queue.flush();
  expect(send).toHaveBeenCalledWith("header", { jobId: 3, systemModel: "old" });
});
it("retains durable and in-memory recovery when acknowledgement persistence fails", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    errors = vi.fn();
  const send = vi.fn(async () => {
    vi.spyOn(storage, "setItem").mockImplementationOnce(() => {
      throw new Error("ack quota");
    });
  });
  const queue = new PendingSaves({ key, storage, send, onError: errors });
  queue.schedulePersisted(
    "header",
    { jobId: 3, systemModel: "captured" },
    1500
  );
  await queue.flush();
  expect(errors).toHaveBeenCalled();
  expect(queue.count()).toBe(1);
  expect(queue.payload("header")).toMatchObject({ systemModel: "captured" });
  queue.close();
  const recoveredSend = vi.fn(async () => {});
  const recovered = new PendingSaves({ key, storage, send: recoveredSend });
  await recovered.flush();
  expect(recoveredSend).toHaveBeenCalledOnce();
  expect(recovered.count()).toBe(0);
});
it("two instances retain unrelated rows and observe acknowledged tombstones without stale replay", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    send = vi.fn(async () => {});
  const first = new PendingSaves({ key, storage, send }),
    second = new PendingSaves({ key, storage, send });
  first.schedulePersisted("header", { jobId: 3 }, 1500);
  second.schedulePersisted("result:1", { jobId: 3 }, 1500);
  expect(first.count()).toBe(2);
  expect(second.count()).toBe(2);
  await Promise.all([first.flush(), second.flush()]);
  expect(send).toHaveBeenCalledTimes(2);
  expect(first.count()).toBe(0);
  expect(second.count()).toBe(0);
  const restored = new PendingSaves({ key, storage, send });
  await restored.flush();
  expect(send).toHaveBeenCalledTimes(2);
});
it("serializes sends across instances and an older reply never clears a newer durable row", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3);
  let accept!: () => void;
  const blocked = new Promise<void>(resolve => {
    accept = resolve;
  });
  const send = vi
    .fn()
    .mockImplementationOnce(() => blocked)
    .mockResolvedValue(undefined);
  const first = new PendingSaves({ key, storage, send }),
    second = new PendingSaves({ key, storage, send });
  first.schedulePersisted("header", { jobId: 3, systemModel: "old" }, 1500);
  const running = first.flush();
  await Promise.resolve();
  await Promise.resolve();
  second.schedulePersisted("header", { jobId: 3, systemModel: "new" }, 1500);
  const later = second.flush();
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
  accept();
  await Promise.all([running, later]);
  expect(send.mock.calls.map(call => call[1].systemModel)).toEqual([
    "old",
    "new",
  ]);
  expect(second.count()).toBe(0);
});
it("dispatches the serialized durable snapshot even if the caller mutates its payload", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    send = vi.fn(async () => {});
  const queue = new PendingSaves({ key, storage, send }),
    payload = { jobId: 3, nested: { captured: "original" } };
  queue.schedulePersisted("header", payload, 1500);
  payload.nested.captured = "unpersisted";
  await queue.flush();
  expect(send).toHaveBeenCalledWith("header", {
    jobId: 3,
    nested: { captured: "original" },
  });
});
it.each(["[]", "[1]", "null", '"text"', "true", "12"])(
  "preserves malformed legacy containers, never overwrites or dispatches them: %s",
  raw => {
    const storage = memoryStorage(),
      key = fireAlarmDraftKey(1, 2, 3),
      send = vi.fn();
    storage.setItem(key, raw);
    const queue = new PendingSaves({ key, storage, send });
    expect(() => queue.schedulePersisted("header", { jobId: 3 }, 1500)).toThrow(
      /recovery/
    );
    expect(queue.count()).toBe(1);
    expect(storage.getItem(key)).toBe(raw);
    expect(send).not.toHaveBeenCalled();
    expect(queue.exportSaved()).toEqual({ [key]: raw });
  }
);
it("archives the exact scoped legacy source before retiring its replay path", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    send = vi.fn(async () => {});
  const raw = JSON.stringify({
    header: { jobId: 3, systemModel: "historic capture" },
  });
  storage.setItem(key, raw);
  const queue = new PendingSaves({ key, storage, send });
  await queue.flush();
  expect(send).toHaveBeenCalledWith("header", {
    jobId: 3,
    systemModel: "historic capture",
  });
  expect(Object.values(queue.exportSaved())).toContain(raw);
  expect(storage.getItem(key)).toBeNull();
  const restored = new PendingSaves({ key, storage, send });
  await restored.flush();
  expect(send).toHaveBeenCalledOnce();
});
it("preserves a partially migrated legacy source and retries without duplicate replay", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    send = vi.fn(async () => {});
  const raw = JSON.stringify({
    header: { jobId: 3 },
    "result:1": { jobId: 3 },
  });
  storage.setItem(key, raw);
  const original = storage.setItem.bind(storage);
  let writes = 0;
  const write = vi
    .spyOn(storage, "setItem")
    .mockImplementation((key, value) => {
      if (++writes >= 3) throw new Error("quota during migration");
      original(key, value);
    });
  const queue = new PendingSaves({ key, storage, send });
  await queue.flush();
  expect(storage.getItem(key)).toBe(raw);
  expect(send).not.toHaveBeenCalled();
  write.mockRestore();
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(2);
  expect(queue.count()).toBe(0);
});
it("fails closed on conflicting simultaneous revisions and retains both payloads for export", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    send = vi.fn(),
    queue = new PendingSaves({ key, storage, send });
  queue.schedulePersisted("header", { jobId: 3, systemModel: "one" }, 1500);
  const firstKey = storage.key(0)!,
    record = JSON.parse(storage.getItem(firstKey)!);
  const other = {
    ...record,
    revision: "concurrent",
    payload: { jobId: 3, systemModel: "two" },
  };
  storage.setItem(`${key}:journal:header:concurrent`, JSON.stringify(other));
  await queue.flush();
  expect(send).not.toHaveBeenCalled();
  expect(queue.count()).toBeGreaterThan(0);
  expect(
    Object.values(queue.exportSaved()).map(
      raw => JSON.parse(raw).payload.systemModel
    )
  ).toEqual(["one", "two"]);
  queue.close();
});
it("retains drafts without dispatch when the browser cannot coordinate cross-tab writes", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    send = vi.fn();
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("navigator", {});
  const queue = new PendingSaves({ key, storage, send });
  queue.schedulePersisted("header", { jobId: 3 }, 1500);
  await queue.flush();
  expect(send).not.toHaveBeenCalled();
  expect(queue.count()).toBe(1);
  expect(queue.error()?.message).toMatch(/coordinate/);
  queue.close();
});
it("compacts superseded row payloads only after durable acknowledgement while retaining a replay tombstone", async () => {
  const storage = memoryStorage(),
    key = fireAlarmDraftKey(1, 2, 3),
    send = vi.fn(async () => {}),
    queue = new PendingSaves({ key, storage, send });
  for (let version = 0; version < 8; version++)
    queue.schedulePersisted("header", { jobId: 3, version }, 1500);
  expect(storage.length).toBe(8);
  await queue.flush();
  expect(storage.length).toBe(1);
  expect(queue.count()).toBe(0);
  const restored = new PendingSaves({ key, storage, send });
  await restored.flush();
  expect(send).toHaveBeenCalledOnce();
});
