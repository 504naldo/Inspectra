import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireAlarmRouter } from "./fireAlarmRouter";
import { fireAlarmQuestionRevision } from "./canonicalFireAlarmReport";
import {
  fireAlarmSystems,
  fireAlarmChecklistTemplates,
  fireAlarmInspectionResults,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
vi.mock("./db", () => ({
  getDb: vi.fn(),
  assertJobCompany: vi.fn(),
  assertJobNotFinalized: vi.fn(),
  withAudit: vi.fn(),
}));
const context = {
  user: { id: 7, companyId: 10, role: "technician" },
  req: { headers: {} },
  res: {},
} as unknown as TrpcContext;
const caller = () => fireAlarmRouter.createCaller(context);
let question: Record<string, any>, captured: any[], writes: number;
const input = (revision?: string) => ({
  jobId: 20,
  fireAlarmSystemId: 1,
  checklistItemId: 3,
  questionRevision: revision,
  result: "pass" as const,
});
beforeEach(() => {
  vi.resetAllMocks();
  captured = [];
  writes = 0;
  question = {
    id: 3,
    sectionName: "Battery",
    sectionOrder: 1,
    itemLetter: "A",
    itemDescription: "Measure the recorded battery voltage",
    inputType: "voltage",
    numericLabel: "Voltage",
    numericUnit: "V",
    isRequired: true,
    requirementType: "test",
    standardId: "ulc_s536",
    standardVersion: "2019",
    hasSubItems: false,
    subItems: null,
    headerFields: null,
    notApplicableNote: null,
    isActive: true,
  };
  const rows = (table: unknown) =>
    structuredClone(
      table === fireAlarmSystems
        ? [{ id: 1, siteId: 2 }]
        : table === fireAlarmChecklistTemplates
          ? [question]
          : captured
    );
  const database = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => rows(table).slice(0, 1),
          orderBy: async () => rows(table),
          then: (resolve: any, reject: any) =>
            Promise.resolve(rows(table)).then(resolve, reject),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: any) => {
        expect(table).toBe(fireAlarmInspectionResults);
        writes++;
        captured.push({ ...structuredClone(values), id: 50 });
        return [{ insertId: 50 }];
      },
    }),
    update: (table: unknown) => ({
      set: (values: any) => ({
        where: async () => {
          expect(table).toBe(fireAlarmInspectionResults);
          writes++;
          Object.assign(captured[0], structuredClone(values));
        },
      }),
    }),
  };
  vi.mocked(db.getDb).mockResolvedValue(database as any);
  vi.mocked(db.assertJobCompany).mockResolvedValue({
    id: 20,
    companyId: 10,
    siteId: 2,
    finalizedAt: null,
  } as any);
  vi.mocked(db.assertJobNotFinalized).mockResolvedValue(undefined);
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, write) =>
    write(database as any)
  );
});
describe("displayed fire-alarm question revisions", () => {
  it("binds first answer to the displayed question and rejects a later wording replacement", async () => {
    const shown = (await caller().getJobChecklist({ jobId: 20 }))[0];
    question.itemDescription =
      "Replacement question after technician went offline";
    await expect(
      caller().saveInspectionResult(input(shown.questionRevision))
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(captured).toEqual([]);
    expect(writes).toBe(0);
  });
  it("rejects a changed standard version even when the wording remains identical", async () => {
    const shown = (await caller().getJobChecklist({ jobId: 20 }))[0];
    question.standardVersion = "2026";
    await expect(
      caller().saveInspectionResult(input(shown.questionRevision))
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(writes).toBe(0);
  });
  it("accepts an unchanged displayed first answer and records its verified revision", async () => {
    const shown = (await caller().getJobChecklist({ jobId: 20 }))[0];
    expect(shown.questionRevision).toBe(fireAlarmQuestionRevision(question));
    await expect(
      caller().saveInspectionResult(input(shown.questionRevision))
    ).resolves.toMatchObject({ success: true, id: 50 });
    expect(captured[0].itemSnapshot).toMatchObject({
      itemDescription: question.itemDescription,
      standardVersion: "2019",
      displayedQuestionRevision: shown.questionRevision,
      captureProvenance: "captured",
    });
  });
  it("existing field display remains on captured wording and rejects saving against changed live requirements", async () => {
    const shown = (await caller().getJobChecklist({ jobId: 20 }))[0];
    await caller().saveInspectionResult(input(shown.questionRevision));
    const snapshot = structuredClone(captured[0]);
    question.numericUnit = "A";
    question.subItems = ["New interpretation"];
    const reopened = (await caller().getJobChecklist({ jobId: 20 }))[0];
    expect(reopened.numericUnit).toBe("V");
    expect(reopened.questionRevision).toBe(shown.questionRevision);
    await expect(
      caller().saveInspectionResult({
        ...input(reopened.questionRevision),
        result: "fail",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(captured[0]).toEqual(snapshot);
    expect(writes).toBe(1);
  });
  it("quarantines absent/unknown revision identities without creating an answer", async () => {
    await expect(caller().saveInspectionResult(input())).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(
      caller().saveInspectionResult(input("unversioned"))
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(writes).toBe(0);
  });
  it("an inactive first question cannot be answered using an earlier displayed version", async () => {
    const shown = (await caller().getJobChecklist({ jobId: 20 }))[0];
    question.isActive = false;
    await expect(
      caller().saveInspectionResult(input(shown.questionRevision))
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(writes).toBe(0);
  });
  it("subquestion order/help/input details participate in displayed identity while timestamps do not", () => {
    const revision = fireAlarmQuestionRevision(question);
    for (const patch of [
      { subItems: ["A", "B"] },
      { headerFields: ["Different"] },
      { notApplicableNote: "Different help" },
      { inputType: "text" },
      { numericUnit: "A" },
    ])
      expect(fireAlarmQuestionRevision({ ...question, ...patch })).not.toBe(
        revision
      );
    expect(
      fireAlarmQuestionRevision({
        ...question,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toBe(revision);
  });
});
