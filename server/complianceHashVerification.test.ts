import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { buildFinalizationPayload, computeFinalizationHash } from "./compliance/hash";
import { complianceRouter } from "./routers/complianceRouter";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn(), withAudit: vi.fn() }));
vi.mock("./compliance/hash", () => ({ buildFinalizationPayload: vi.fn(), computeFinalizationHash: vi.fn() }));
const caller = complianceRouter.createCaller({ user: { id: 3, companyId: 7, role: "admin" } } as unknown as TrpcContext);
const database = { select: () => ({ from: () => ({ where: async () => [job] }) }) } as any;
let job: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  job = { id: 1, companyId: 7, finalizationHash: "saved-hash", finalizedAt: new Date(), status: "completed", finalizationHashVersion: 1 };
  vi.mocked(getDb).mockResolvedValue(database);
  vi.mocked(buildFinalizationPayload).mockResolvedValue({} as any);
  vi.mocked(computeFinalizationHash).mockReturnValue("saved-hash");
});

describe("Hash verification uses the stored seal version", () => {
  it.each([1, 2])("rebuilds a version %i seal using that same version", async version => {
    job.finalizationHashVersion = version;
    const result = await caller.verifyJobHash({ jobId: 1 });
    expect(result.hashMatch).toBe(true);
    expect(buildFinalizationPayload).toHaveBeenCalledWith(1, database, version);
  });

  it("keeps pre-version records on the legacy algorithm", async () => {
    delete job.finalizationHashVersion;
    await caller.verifyJobHash({ jobId: 1 });
    expect(buildFinalizationPayload).toHaveBeenCalledWith(1, database, 1);
  });

  it.each([0, 3])("rejects unsupported version %i without attempting another algorithm", async version => {
    job.finalizationHashVersion = version;
    await expect(caller.verifyJobHash({ jobId: 1 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(buildFinalizationPayload).not.toHaveBeenCalled();
    expect(computeFinalizationHash).not.toHaveBeenCalled();
  });
});
