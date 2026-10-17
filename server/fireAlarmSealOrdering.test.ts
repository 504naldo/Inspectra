import { fireAlarmQuestionRevision } from "./canonicalFireAlarmReport";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireAlarmRouter } from "./fireAlarmRouter";
import { fireAlarmFormRouter } from "./routers/fireAlarmFormRouter";
import * as db from "./db";
import {
  fireAlarmSystems, fireAlarmChecklistTemplates, fireAlarmInspectionResults,
  fireAlarmFormHeader, fireAlarmAttendanceLog, fireAlarmAncillaryCircuits,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(), getSiteById: vi.fn(), assertJobCompany: vi.fn(),
  assertJobNotFinalized: vi.fn(), withAudit: vi.fn(),
}));

let active = false, locked = false, sealed = false;
let reads: unknown[], writes: unknown[], events: string[];
let database: any;
const context = { user: { id: 7, companyId: 10, role: "office" }, req: { headers: {} }, res: {} } as unknown as TrpcContext;

beforeEach(() => {
  vi.resetAllMocks();
  active = false; locked = false; sealed = false;
  reads = []; writes = []; events = [];
  const result = (table: unknown) => {
    if (active && !locked) throw new Error("consistent read before seal lock");
    reads.push(table);
    if (table === fireAlarmSystems) return [{ id: 1, siteId: 2 }];
    if (table === fireAlarmChecklistTemplates) return [{ id: 3, sectionName: "Recorded", itemDescription: "Question", isRequired: true, standardVersion: "2019", requirementType: "test" }];
    if (table === fireAlarmInspectionResults) return [{ id: 4, itemSnapshot: { captureProvenance: "captured", id: 3, sectionName: "Recorded", itemDescription: "Question", isRequired: true, standardVersion: "2019", requirementType: "test" } }];
    return [{ id: 5, jobId: 20 }];
  };
  database = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => result(table) }) }) }),
    update: (table: unknown) => ({ set: () => ({ where: async () => { expect(active && locked).toBe(true); writes.push(table); } }) }),
    delete: (table: unknown) => ({ where: async () => { expect(active && locked).toBe(true); writes.push(table); } }),
  };
  vi.mocked(db.getDb).mockResolvedValue(database);
  vi.mocked(db.assertJobCompany).mockImplementation(async () => {
    if (active && !locked) throw new Error("parent snapshot before seal lock");
    events.push(active ? "scoped-after-lock" : "preflight");
    return { id: 20, companyId: 10, siteId: 2 } as any;
  });
  vi.mocked(db.assertJobNotFinalized).mockImplementation(async (_id, transaction) => {
    expect(active).toBe(true);
    expect(transaction).toBe(database);
    events.push("lock");
    locked = true;
    if (sealed) throw new Error("sealed");
  });
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _procedure, action) => {
    active = true;
    try { return await action(database); } finally { active = false; }
  });
});

const operations = [
  { name: "fire-alarm result", run: () => fireAlarmRouter.createCaller(context).saveInspectionResult({ jobId: 20, fireAlarmSystemId: 1, checklistItemId: 3, questionRevision: fireAlarmQuestionRevision({id:3,sectionName:"Recorded",itemDescription:"Question",isRequired:true,standardVersion:"2019",requirementType:"test"}), result: "pass" }), table: fireAlarmInspectionResults },
  { name: "form header", run: () => fireAlarmFormRouter.createCaller(context).upsertHeader({ jobId: 20, systemModel: "Recorded" }), table: fireAlarmFormHeader },
  { name: "attendance edit", run: () => fireAlarmFormRouter.createCaller(context).upsertAttendanceRow({ jobId: 20, id: 5, techName: "Recorded" }), table: fireAlarmAttendanceLog },
  { name: "circuit edit", run: () => fireAlarmFormRouter.createCaller(context).upsertAncillaryCircuit({ jobId: 20, id: 5, notes: "Recorded" }), table: fireAlarmAncillaryCircuits },
  { name: "attendance delete", run: () => fireAlarmFormRouter.createCaller(context).deleteAttendanceRow({ id: 5 }), table: fireAlarmAttendanceLog },
  { name: "circuit delete", run: () => fireAlarmFormRouter.createCaller(context).deleteAncillaryCircuit({ id: 5 }), table: fireAlarmAncillaryCircuits },
];

describe.each(operations)("Seal lock ordering: $name", ({ run, table }) => {
  it("locks before transactional ownership/record reads and keeps writes on that transaction", async () => {
    await run();
    expect(events).toEqual(["preflight", "lock", "scoped-after-lock"]);
    expect(writes).toEqual([table]);
  });
  it("does not write when finalization wins", async () => {
    sealed = true;
    await expect(run()).rejects.toThrow("sealed");
    expect(writes).toEqual([]);
  });
});
