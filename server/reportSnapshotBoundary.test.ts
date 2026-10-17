import { beforeEach, expect, it, vi } from "vitest";
import * as db from "./db";
import { withReportJob } from "./jobWriteTransaction";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ assertJobCompany: vi.fn(), withAudit: vi.fn() }));
const context = { user: { id: 7, companyId: 10, role: "office" } } as unknown as TrpcContext;
let active = false, locked = false, events: string[], record: any;
const tx = { select: () => ({ from: () => ({ where: () => ({ for: async () => { locked = true; events.push("lock"); return record ? [record] : []; } }) }) }) } as any;
beforeEach(() => {
  vi.resetAllMocks(); active = false; locked = false; events = [];
  record = { id: 20, companyId: 10, finalizedAt: null, title: "Current title" };
  vi.mocked(db.assertJobCompany).mockImplementation(async () => {
    if (active && !locked) throw new Error("snapshot before lock");
    events.push(active ? "current-scope" : "preflight");
    return record;
  });
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, action) => {
    active = true;
    try { const result = await action(tx); events.push("commit"); return result; }
    catch (error) { events.push("rollback"); throw error; }
    finally { active = false; }
  });
});
it.each([null, new Date("2026-10-16T12:00:00Z")])("publishes under one coherent job lock, including historical finalized jobs: %s", async finalizedAt => {
  record.finalizedAt = finalizedAt;
  const result = await withReportJob(context, "report.generatePDF", 20, async (job, connection) => {
    expect(connection).toBe(tx); expect(active && locked).toBe(true);
    await Promise.resolve();
    expect(active && locked).toBe(true);
    events.push("captured-and-published"); return job.title;
  });
  expect(result).toBe("Current title");
  expect(events).toEqual(["preflight", "lock", "current-scope", "captured-and-published", "commit"]);
});
it("does not generate PDFs or publish metadata if current ownership changed while waiting", async () => {
  vi.mocked(db.assertJobCompany).mockResolvedValueOnce(record).mockRejectedValueOnce(new Error("foreign owner"));
  const generate = vi.fn();
  await expect(withReportJob(context, "report.generatePDF", 20, generate)).rejects.toThrow("foreign owner");
  expect(generate).not.toHaveBeenCalled(); expect(events.at(-1)).toBe("rollback");
});
it("does not publish when the locked parent was deleted", async () => {
  vi.mocked(db.assertJobCompany).mockResolvedValue(record); record = null;
  const generate = vi.fn();
  await expect(withReportJob(context, "report.generatePDF", 20, generate)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(generate).not.toHaveBeenCalled();
});
it("PDF/storage/publication failures abort the metadata transaction", async () => {
  await expect(withReportJob(context, "report.generatePDF", 20, async () => { throw new Error("publication failed"); })).rejects.toThrow("publication failed");
  expect(events.at(-1)).toBe("rollback"); expect(events).not.toContain("commit");
});
