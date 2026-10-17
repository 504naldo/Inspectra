import { describe, expect, it, vi } from "vitest";
import { acknowledgedDevicePatch, GridWriteBarrier, GridWriteGuard, RevisionBoundDraft } from "./gridWriteSafety";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("grid capture and save safety", () => {
  it("holds a synchronous lock across the entire metadata and result chain", async () => {
    const barrier = new GridWriteBarrier();
    const metadata = deferred();
    const result = deferred();
    const events: string[] = [];
    const saving = barrier.run(async () => {
      events.push("metadata");
      await metadata.promise;
      events.push("result");
      await result.promise;
      events.push("acknowledged");
    });
    expect(barrier.locked).toBe(true);
    expect(await barrier.run(async () => { events.push("duplicate"); })).toBe(false);
    metadata.resolve();
    await Promise.resolve();
    expect(events).toEqual(["metadata", "result"]);
    expect(barrier.locked).toBe(true);
    result.resolve();
    expect(await saving).toBe(true);
    expect(barrier.locked).toBe(false);
    expect(events).toEqual(["metadata", "result", "acknowledged"]);
  });

  it("blocks edits using the live lock before the disabled fieldset rerenders", async () => {
    const barrier = new GridWriteBarrier();
    const wait = deferred();
    const guard = GridWriteGuard({ barrier: { isLocked: false, isLockedNow: () => barrier.locked,
      run: operation => barrier.run(operation) }, children: null });
    const saving = barrier.run(() => wait.promise);
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    guard.props.onChangeCapture(event);
    guard.props.onClickCapture(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
    wait.resolve();
    await saving;
    guard.props.onClickCapture(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
  });

  it("unlocks after a failed request without running a duplicate save", async () => {
    const barrier = new GridWriteBarrier();
    const request = deferred();
    const saving = barrier.run(() => request.promise);
    const duplicate = vi.fn();
    expect(await barrier.run(duplicate)).toBe(false);
    request.reject(new Error("stale device"));
    await expect(saving).rejects.toThrow("stale device");
    expect(barrier.locked).toBe(false);
    expect(duplicate).not.toHaveBeenCalled();
  });

  it("retains focus-time text and revision when the displayed row refetches", () => {
    const edit = new RevisionBoundDraft();
    edit.begin("Old suite", "shown-revision");
    edit.change("Corrected suite", "Other actor's suite", "new-server-revision");
    expect(edit.finish()).toEqual({ value: "Corrected suite", original: "Old suite", revision: "shown-revision" });
    expect(edit.current).toBeNull();
    expect(edit.begin("Other actor's suite", "new-server-revision").revision).toBe("new-server-revision");
  });

  it("keeps the original revision across multiple keystrokes and refreshes", () => {
    const edit = new RevisionBoundDraft();
    edit.begin(1, "first");
    edit.change("2", 3, "second");
    edit.change("4", 5, "third");
    expect(edit.finish()).toEqual({ value: "4", original: "1", revision: "first" });
  });

  it("applies only acknowledged defined fields with the returned revision", () => {
    const rows = [{ id: 1, deviceRevision: "shown", suiteNumber: "old", batteryCount: 2, notes: "old" },
      { id: 2, deviceRevision: "untouched", suiteNumber: "second", batteryCount: 1, notes: "second" }];
    const next = acknowledgedDevicePatch(rows, 1, { suiteNumber: "new", batteryCount: undefined, notes: "",
      id: 9, jobId: 7, expectedDeviceRevision: "forged", deviceRevision: "forged" }, "accepted", "shown");
    expect(next[0]).toEqual({ id: 1, deviceRevision: "accepted", suiteNumber: "new", batteryCount: 2, notes: null });
    expect(next[1]).toBe(rows[1]);
    expect(rows[0].suiteNumber).toBe("old");
  });

  it("does not stamp a late acknowledgement onto a different refreshed definition", () => {
    const refreshed = [{ id: 1, deviceRevision: "other-actor", suiteNumber: "newer", notes: "other" }];
    expect(acknowledgedDevicePatch(refreshed, 1, { suiteNumber: "old request" }, "ack", "shown")[0]).toBe(refreshed[0]);
  });

  it("leaves displayed metadata unchanged on request failure", async () => {
    const barrier = new GridWriteBarrier();
    let rows = [{ id: 1, deviceRevision: "shown", suiteNumber: "saved suite" }];
    const request = deferred();
    const saving = barrier.run(async () => {
      await request.promise;
      rows = acknowledgedDevicePatch(rows, 1, { suiteNumber: "unsaved" }, "ack", "shown");
    });
    request.reject(new Error("conflict"));
    await expect(saving).rejects.toThrow("conflict");
    expect(rows).toEqual([{ id: 1, deviceRevision: "shown", suiteNumber: "saved suite" }]);
  });
});
