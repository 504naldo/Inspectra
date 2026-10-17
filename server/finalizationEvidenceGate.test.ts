import { beforeEach, expect, it, vi } from "vitest";
import { finalizeJob } from "./compliance/finalizeJob";
import { buildFinalizationPayload, computeFinalizationHash } from "./compliance/hash";
import { getCanonicalFireAlarmChecklist } from "./canonicalFireAlarmReport";
import { assertCapturedTemplateEvidence } from "./canonicalTemplateReport";
import { assertDeviceEvidenceForReport } from "./canonicalDeviceEvidence";
import type { TrpcContext } from "./_core/context";

vi.mock("./canonicalFireAlarmReport", () => ({ getCanonicalFireAlarmChecklist: vi.fn() }));
vi.mock("./canonicalTemplateReport", () => ({ assertCapturedTemplateEvidence: vi.fn() }));
vi.mock("./canonicalDeviceEvidence", () => ({ assertDeviceEvidenceForReport: vi.fn() }));
vi.mock("./compliance/hash", () => ({ buildFinalizationPayload: vi.fn(), computeFinalizationHash: vi.fn() }));
const context = { user: { id: 7, companyId: 10, role: "admin" } } as unknown as TrpcContext;
let job: Record<string, unknown>;
let writes: Record<string, unknown>[];
let database: any;
beforeEach(() => {
  vi.resetAllMocks(); writes = [];
  job = { id: 20, companyId: 10, jobType: "annual", status: "in_progress", finalizedAt: null, techSignatureUrl: "captured-signature", leadTechnicianId: 7 };
  database = {
    select: () => ({ from: () => ({ where: () => ({
      for: async () => [job], limit: async () => [], then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
    }) }) }),
    update: () => ({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) }),
  };
  vi.mocked(buildFinalizationPayload).mockResolvedValue({ fireAlarmInspectionResults: [], inspectionResults: [], deficiencies: [] } as any);
  vi.mocked(getCanonicalFireAlarmChecklist).mockResolvedValue([]);
  vi.mocked(assertCapturedTemplateEvidence).mockResolvedValue(undefined);
  vi.mocked(computeFinalizationHash).mockReturnValue("verified-hash");
});
it("an annual job with zero fire-alarm rows cannot bypass captured evidence validation", async () => {
  vi.mocked(getCanonicalFireAlarmChecklist).mockRejectedValue(new Error("no captured checklist"));
  await expect(finalizeJob({ jobId: 20, clientAssertsSynced: true }, context, database)).rejects.toThrow("no captured checklist");
  expect(getCanonicalFireAlarmChecklist).toHaveBeenCalledWith(20);
  expect(computeFinalizationHash).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
});
it("non-annual jobs with fire-alarm answers also validate their captured evidence", async () => {
  job.jobType = "repair";
  vi.mocked(buildFinalizationPayload).mockResolvedValue({ fireAlarmInspectionResults: [{ id: 1 }] } as any);
  vi.mocked(getCanonicalFireAlarmChecklist).mockRejectedValue(new Error("unverified legacy capture"));
  await expect(finalizeJob({ jobId: 20, clientAssertsSynced: true }, context, database)).rejects.toThrow("unverified legacy capture");
  expect(writes).toEqual([]);
});
it("generic assigned-template evidence must pass before sealing or hashing", async () => {
  vi.mocked(assertCapturedTemplateEvidence).mockRejectedValue(new Error("required assigned question missing"));
  await expect(finalizeJob({ jobId: 20, clientAssertsSynced: true }, context, database)).rejects.toThrow("required assigned question missing");
  expect(assertCapturedTemplateEvidence).toHaveBeenCalledWith(20, 10, database);
  expect(computeFinalizationHash).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
});
it("missing or unverified device identity cannot become immutable evidence", async () => {
  vi.mocked(assertDeviceEvidenceForReport).mockImplementation(() => { throw new Error("device snapshot missing"); });
  await expect(finalizeJob({ jobId: 20, clientAssertsSynced: true }, context, database)).rejects.toThrow("device snapshot missing");
  expect(computeFinalizationHash).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
});
it("unrelated jobs without fire-alarm captures still pass the generic evidence gate", async () => {
  job.jobType = "repair";
  expect(await finalizeJob({ jobId: 20, clientAssertsSynced: true }, context, database)).toMatchObject({ finalizationHash: "verified-hash" });
  expect(getCanonicalFireAlarmChecklist).not.toHaveBeenCalled();
  expect(assertCapturedTemplateEvidence).toHaveBeenCalledOnce();
  expect(buildFinalizationPayload).toHaveBeenCalledWith(20, database, 2);
  expect(writes[0]).toMatchObject({ status: "completed", finalizationHash: "verified-hash", finalizationHashVersion: 2 });
});
