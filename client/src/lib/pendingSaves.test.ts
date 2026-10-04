import { afterEach, expect, it, vi } from "vitest";
import {
  PendingSaves,
  fireAlarmDraftKey,
  pendingFireAlarmDraftCount,
} from "./pendingSaves";
afterEach(() => vi.useRealTimers());
function memoryStorage() {
  const data = new Map<string, string>();
  return {
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
    send = vi.fn();
  const queue = new PendingSaves({ key, storage, send });
  queue.schedule("header", () => first, 1500, { jobId: 20, version: 1 });
  const running = queue.flush();
  await Promise.resolve();
  queue.schedule("header", () => send(), 1500, { jobId: 20, version: 2 });
  acknowledge();
  await running;
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(1);
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
