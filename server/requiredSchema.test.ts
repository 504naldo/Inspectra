import { beforeEach, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { verifyAuditRequiredSchema } from "./requiredSchema";
vi.mock("./db", () => ({ getDb: vi.fn() }));
const execute = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockResolvedValue({ execute } as any);
  execute.mockResolvedValue([[], []]);
});
it("checks required authentication, capture, schedule, receipt and outbox columns", async () => {
  for (let i = 0; i < 6; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[{ guardCount: 4 }], []]);
  await verifyAuditRequiredSchema();
  expect(execute).toHaveBeenCalledTimes(7);
});
it("missing required migrations fail closed before serving requests", async () => {
  execute.mockRejectedValueOnce(new Error("Unknown column sessionVersion"));
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    "Unknown column sessionVersion"
  );
  expect(execute).toHaveBeenCalledTimes(1);
});
it("unreviewed legacy snapshots are a release blocker", async () => {
  for (let i = 0; i < 5; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[{ id: 1 }], []]);
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /Legacy fire-alarm snapshots/
  );
});

it("missing payment protocol guards block startup", async () => {
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(/protocol v2 migration guards/);
});
