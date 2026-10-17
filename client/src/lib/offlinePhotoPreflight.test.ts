import { describe, expect, it, vi } from "vitest";
import { readPhotoQaState } from "./offlinePhotoPreflight";
const scope = { userId: 1, companyId: 2 };
describe("fresh QA evidence preflight", () => {
  it("queries the exact job/account and keeps unreadable data separate from foreign accounts", async () => {
    const store = { getPendingPhotosForJob: vi.fn(async () => [{ id: "a" }, { id: "b" }]),
      recoverySummary: vi.fn(async () => ({ legacy: 1, invalid: 2, foreign: 9 })) };
    expect(await readPhotoQaState(10, scope, store)).toEqual({ count: 2, blockers: 3 });
    expect(store.getPendingPhotosForJob).toHaveBeenCalledWith(10, scope);
    expect(store.recoverySummary).toHaveBeenCalledWith(scope);
  });
  it("never treats failed IndexedDB reads as an empty photo queue", async () => {
    const store = { getPendingPhotosForJob: vi.fn(async () => { throw new Error("Read failed"); }),
      recoverySummary: vi.fn(async () => ({ legacy: 0, invalid: 0, foreign: 0 })) };
    await expect(readPhotoQaState(10, scope, store)).rejects.toThrow("Read failed");
  });
  it("requires a resolved account before reading saved evidence", async () => {
    const store = { getPendingPhotosForJob: vi.fn(), recoverySummary: vi.fn() };
    await expect(readPhotoQaState(10, null, store)).rejects.toThrow(/Sign in/);
    expect(store.getPendingPhotosForJob).not.toHaveBeenCalled();
  });
});
