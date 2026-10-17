import { describe, expect, it, vi } from "vitest";
import { runWithDb, type Db } from "./db/client";
import * as sprinklerDb from "./db.sprinkler";

describe("Sprinkler data access joins the caller's audited connection", () => {
  it.each([
    ["systems", () => sprinklerDb.upsertSprinklerSystems(1, [{ systemNumber: 1 }])],
    ["checklist", () => sprinklerDb.upsertSprinklerChecklistItems(1, [{ section: "A", questionText: "Test", questionOrder: 1 }])],
    ["devices", () => sprinklerDb.upsertSprinklerDevices(1, [{ deviceOrder: 1 }])],
  ] as const)("uses one contextual connection for %s replacement and readback", async (_label, action) => {
    const existing = [{ id: 5, inspectionId: 1 }];
    const remove = vi.fn(async () => undefined);
    const insert = vi.fn(async () => []);
    const read = vi.fn(async () => existing);
    const tx = {
      delete: vi.fn(() => ({ where: remove })),
      insert: vi.fn(() => ({ values: insert })),
      select: vi.fn(() => ({ from: () => ({ where: read }) })),
    } as unknown as Db;

    expect(await runWithDb(tx, action)).toEqual(existing);
    expect(remove).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
  });
});
