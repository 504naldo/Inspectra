import { beforeEach, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  assertJobCompany: vi.fn(), assertJobNotFinalized: vi.fn(), withAudit: vi.fn(),
  getInspectionStats: vi.fn(), getDeficienciesByJob: vi.fn(), createReport: vi.fn(),
  getReportById: vi.fn(), updateReport: vi.fn(),
}));
const transaction = {} as any;
let events: string[];
let active = false, locked = false;
function caller() {
  return appRouter.createCaller({ user: { id: 7, companyId: 10, role: "office" }, req: { headers: {} }, res: {} } as unknown as TrpcContext);
}
beforeEach(() => {
  vi.resetAllMocks();
  events = []; active = false; locked = false;
  vi.mocked(db.assertJobCompany).mockImplementation(async () => {
    if (active && !locked) throw new Error("stale snapshot before lock");
    events.push(active ? "checked-current" : "preflight");
    return { id: 20, companyId: 10 } as any;
  });
  vi.mocked(db.assertJobNotFinalized).mockImplementation(async (_id, tx) => {
    expect(tx).toBe(transaction); locked = true; events.push("lock");
  });
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, write) => {
    active = true;
    try { return await write(transaction); } finally { active = false; }
  });
  vi.mocked(db.getInspectionStats).mockResolvedValue({ total: 2, pass: 1, fail: 1 } as any);
  vi.mocked(db.getDeficienciesByJob).mockResolvedValue([]);
  vi.mocked(db.createReport).mockResolvedValue({ id: 30 } as any);
  vi.mocked(db.getReportById).mockResolvedValue({ id: 30, jobId: 20 } as any);
});

it("creates report metadata within the job seal lock", async () => {
  expect(await caller().report.create({ jobId: 20, title: "Captured report" })).toEqual({ id: 30 });
  expect(events).toEqual(["preflight", "lock", "checked-current"]);
  expect(db.createReport).toHaveBeenCalledWith(expect.objectContaining({ jobId: 20, generatedById: 7, deviceCount: 2 }));
});
it("does not create or update report content if job finalization wins", async () => {
  vi.mocked(db.assertJobNotFinalized).mockRejectedValue(new Error("sealed"));
  await expect(caller().report.create({ jobId: 20, title: "Late" })).rejects.toThrow("sealed");
  await expect(caller().report.update({ id: 30, title: "Late" })).rejects.toThrow("sealed");
  expect(db.createReport).not.toHaveBeenCalled();
  expect(db.updateReport).not.toHaveBeenCalled();
});
it("revalidates the actual report parent after locking", async () => {
  vi.mocked(db.getReportById).mockResolvedValueOnce({ id: 30, jobId: 20 } as any).mockResolvedValueOnce({ id: 30, jobId: 21 } as any);
  await expect(caller().report.update({ id: 30, title: "Changed" })).rejects.toMatchObject({ code: "CONFLICT" });
  expect(db.updateReport).not.toHaveBeenCalled();
});
it("allows a normal unsealed metadata edit under the job lock", async () => {
  await expect(caller().report.update({ id: 30, title: "Corrected" })).resolves.toEqual({ success: true });
  expect(events).toEqual(["preflight", "lock", "checked-current"]);
  expect(db.updateReport).toHaveBeenCalledWith(30, { title: "Corrected" });
});
it.each(["fileKey", "fileUrl"])("cannot attach an arbitrary storage reference using report.update.%s", async field => {
  await expect(caller().report.update({ id: 30, [field]: "someone-elses-file" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(db.getReportById).not.toHaveBeenCalled();
  expect(db.updateReport).not.toHaveBeenCalled();
});
