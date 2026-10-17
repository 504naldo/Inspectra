import { describe, expect, it, vi } from "vitest";
import {
  dispatchFireAlarmDraft,
  isFireAlarmDraft,
  parseFireAlarmDraft,
} from "./fireAlarmDrafts";
import { PendingSaves, fireAlarmDraftKey } from "./pendingSaves";
const scope = { userId: 1, companyId: 2 };
const context = {
  scope,
  currentScope: () => scope,
  jobId: 3,
  isFinalized: () => false,
};
describe("typed fire-alarm draft dispatch", () => {
  it.each([
    [
      "header",
      {
        jobId: 3,
        systemModel: "captured",
        sectionHeaderValues: { "1": { model: "original" } },
      },
      "header",
    ],
    [
      "result:10",
      {
        jobId: 3,
        fireAlarmSystemId: 4,
        checklistItemId: 10,
        questionRevision:
          "inspection-capture-v1:fire-alarm-question:" + "a".repeat(64),
        result: "pass",
      },
      "result",
    ],
    [
      "attendance:11",
      { jobId: 3, id: 11, techName: "Captured", timeIn: "09:00" },
      "attendance",
    ],
    [
      "ancillary:12",
      { jobId: 3, id: 12, operationConfirmed: "yes" },
      "ancillary",
    ],
  ])(
    "dispatches only the validated %s operation",
    async (key, payload, kind) => {
      const send = vi.fn(async () => ({ ok: true }));
      await dispatchFireAlarmDraft(key as string, payload, context, send);
      expect(send).toHaveBeenCalledWith({ kind, payload });
    }
  );
  it.each([
    ["arbitrary:1", { jobId: 3 }],
    ["result:10:suffix", { jobId: 3 }],
    ["header", { jobId: 99 }],
    ["attendance:11", { jobId: 3, id: 12 }],
    ["attendance:11", { jobId: 3 }],
    [
      "result:10",
      { jobId: 3, fireAlarmSystemId: 4, checklistItemId: 11, result: "pass" },
    ],
    ["ancillary:12", { jobId: 3, id: 12, operationConfirmed: "unsafe" }],
    ["header", { jobId: 3, unknownMutationField: true }],
  ])(
    "preserves and refuses unknown or mismatched operation %s",
    async (key, payload) => {
      const send = vi.fn();
      await expect(
        dispatchFireAlarmDraft(key as string, payload, context, send)
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
      expect(isFireAlarmDraft(key as string, payload, 3)).toBe(false);
    }
  );
  it.each([{ userId: 9, companyId: 2 }, { userId: 1, companyId: 9 }, null])(
    "never replays under a changed or unresolved account: %j",
    async current => {
      const send = vi.fn();
      await expect(
        dispatchFireAlarmDraft(
          "header",
          { jobId: 3 },
          { ...context, currentScope: () => current },
          send
        )
      ).rejects.toThrow(/Account changed/);
      expect(send).not.toHaveBeenCalled();
    }
  );
  it("retains finalized-job drafts for review and never sends them", async () => {
    const send = vi.fn();
    await expect(
      dispatchFireAlarmDraft(
        "header",
        { jobId: 3 },
        { ...context, isFinalized: () => true },
        send
      )
    ).rejects.toThrow(/finalized/);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not migrate or replay an unknown key from an otherwise scoped legacy object", async () => {
    const key = fireAlarmDraftKey(1, 2, 3),
      values = new Map<string, string>();
    const raw = JSON.stringify({
      header: { jobId: 3 },
      "other:12": { jobId: 3 },
    });
    values.set(key, raw);
    const storage = {
      get length() {
        return values.size;
      },
      key: (i: number) => Array.from(values.keys())[i] ?? null,
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
      removeItem: (k: string) => {
        values.delete(k);
      },
    };
    const send = vi.fn(),
      queue = new PendingSaves({
        key,
        storage,
        send,
        validate: (k, p) => isFireAlarmDraft(k, p, 3),
      });
    await queue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(values.get(key)).toBe(raw);
    expect(values.size).toBe(1);
    expect(queue.count()).toBeGreaterThan(0);
  });
});
it("does not replay a saved fire result that predates displayed question revisions", async () => {
  const payload = {
    jobId: 3,
    fireAlarmSystemId: 4,
    checklistItemId: 10,
    result: "pass",
  };
  expect(isFireAlarmDraft("result:10", payload, 3)).toBe(false);
  const send = vi.fn();
  await expect(
    dispatchFireAlarmDraft("result:10", payload, context, send)
  ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
