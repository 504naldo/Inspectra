import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { getDb } from "./db";
import {
  assertCapturedTemplateEvidence, buildCapturedTemplateReportData,
  buildTemplateItemSnapshot, getCapturedTemplateReportData,
  buildTemplatePacketData,
} from "./canonicalTemplateReport";
import type { InspectionTemplateResponse } from "../drizzle/schema";

vi.mock("./db", () => ({ getDb: vi.fn() }));

const template = { id: 10, companyId: 7, name: "Original template", systemType: "general", inspectionType: "annual", version: 1, status: "active" } as any;
const section = { id: 20, companyId: 7, templateId: 10, title: "Original section", sortOrder: 2 } as any;
const item = { id: 30, companyId: 7, templateId: 10, sectionId: 20, itemCode: "A", questionText: "Original question", responseType: "pass_fail_na", isRequired: 1, sortOrder: 2, codeReference: "Original code" } as any;
const snapshot = () => buildTemplateItemSnapshot({ companyId: 7, jobId: 1, capturedById: 3, capturedAt: new Date("2026-10-16T12:00:00Z"), template, section, item });
const response = (patch: Partial<InspectionTemplateResponse> = {}) => ({
  id: 1, companyId: 7, jobId: 1, templateId: 10, sectionId: 20, itemId: 30,
  itemSnapshot: snapshot(), responseValue: "pass", responseText: null,
  notes: null, deficiencyId: null, answeredById: 3, answeredAt: new Date(), ...patch,
}) as InspectionTemplateResponse;

let rows: Record<string, any[]>;
let reads: string[];
const database = {
  select: () => ({ from: (table: any) => {
    const name = getTableName(table);
    reads.push(name);
    const query = {
      where: (_condition: any) => query,
      limit: (_limit: number) => Promise.resolve(rows[name] ?? []),
      then: (resolve: any, reject: any) => Promise.resolve(rows[name] ?? []).then(resolve, reject),
    };
    return query;
  } }),
} as any;

beforeEach(() => {
  reads = [];
  rows = {
    jobs: [{ id: 1, companyId: 7, jobType: "annual", siteId: 40, customerOrgId: 50, finalizedAt: null }],
    inspection_template_responses: [response()],
    inspection_template_assignments: [{ templateId: 10, companyId: 7, isActive: 1, jobType: "annual", siteId: 40, customerOrgId: 50 }],
    inspection_templates: [template], inspection_template_items: [item], inspection_template_sections: [section],
  };
  vi.mocked(getDb).mockResolvedValue(database);
});

describe("Captured generic template reporting", () => {
  it("offline packets preserve captured definitions and include the saved response", () => {
    const result = buildTemplatePacketData({ job: rows.jobs[0], actorId: 3,
      templates: [{ ...template, name: "Replacement", version: 2 }], sections: [{ ...section, title: "Replacement section" }],
      items: [{ ...item, questionText: "Replacement question" }], responses: [response()] });
    expect(result.templates[0].name).toBe("Original template");
    expect(result.templateItems[0].questionText).toBe("Original question");
    expect(result.templateSections[0].title).toBe("Original section");
    expect(result.templateResponses[0].responseValue).toBe("pass");
  });
  it("finalized offline packets ignore all current definitions, and include captures whose library item was removed", () => {
    const result = buildTemplatePacketData({ job: { ...rows.jobs[0], finalizedAt: new Date() }, actorId: 3,
      templates: [{ ...template, id: 99, name: "Current unrelated" }], sections: [], items: [], responses: [response()] });
    expect(result.templates.map(template => template.id)).toEqual([10]);
    expect(result.templateItems[0].questionText).toBe("Original question");
  });
  it("offline packets fail closed for unknown legacy question evidence", () => {
    expect(() => buildTemplatePacketData({ job: rows.jobs[0], actorId: 3, templates: [], sections: [], items: [], responses: [response({ itemSnapshot: null })] })).toThrow(/unverified/);
  });
  it("retains original wording, ordering, version and requiredness", () => {
    const captured = response();
    const result = buildCapturedTemplateReportData([captured])[0];
    expect(result).toMatchObject({
      templateId: 10, templateName: "Original template", templateVersion: 1,
      totalItems: 1, answeredItems: 1, completionPercent: 100, passCount: 1,
      sections: [{ sectionTitle: "Original section", items: [{ questionText: "Original question", itemCode: "A", codeReference: "Original code", isRequired: true }] }],
    });
  });

  it.each([null, { ...snapshot(), captureProvenance: "reconstructed" }, { ...snapshot(), item: { id: 30 } }])("rejects legacy or unverified snapshots: %j", itemSnapshot => {
    expect(() => buildCapturedTemplateReportData([response({ itemSnapshot })])).toThrow(/snapshot is missing or unverified/);
  });

  it("rejects snapshots from a different tenant, parent or item", () => {
    for (const patch of [{ companyId: 8 }, { jobId: 2 }, { templateId: 11 }, { sectionId: 21 }, { itemId: 31 }]) {
      expect(() => buildCapturedTemplateReportData([response(patch)])).toThrow(/captured question identity/);
    }
  });

  it("rejects unanswered required items while preserving optional unanswered captures", () => {
    expect(() => buildCapturedTemplateReportData([response({ responseValue: "  " })])).toThrow(/required item is unanswered/);
    const itemSnapshot = snapshot();
    itemSnapshot.item.isRequired = false;
    expect(buildCapturedTemplateReportData([response({ itemSnapshot, responseValue: null })])[0]).toMatchObject({ totalItems: 1, answeredItems: 0, completionPercent: 0, passCount: 0 });
  });

  it("does not conflate different captured versions of one template", () => {
    const next = snapshot(); next.template.version = 2; next.item.id = 31;
    expect(buildCapturedTemplateReportData([response(), response({ id: 2, itemId: 31, itemSnapshot: next })]).map(t => t.templateVersion)).toEqual([1, 2]);
  });

  it("reads finalized evidence without ever joining mutable library definitions", async () => {
    rows.jobs[0].finalizedAt = new Date();
    rows.inspection_templates = [{ ...template, name: "Renamed", version: 9 }];
    rows.inspection_template_items = [{ ...item, questionText: "Replacement wording" }];
    const result = await getCapturedTemplateReportData(1, 7);
    expect(result[0].templateName).toBe("Original template");
    expect(result[0].sections[0].items[0].questionText).toBe("Original question");
    expect(reads).toEqual(["jobs", "inspection_template_responses"]);
  });

  it("blocks finalization when assigned required questions have no responses at all", async () => {
    rows.inspection_template_responses = [];
    await expect(assertCapturedTemplateEvidence(1, 7, database)).rejects.toThrow(/no captured answer/);
    expect(reads).toContain("inspection_template_items");
  });

  it("checks newly assigned required questions in addition to existing captures", async () => {
    rows.inspection_template_items.push({ ...item, id: 31, questionText: "Another required question" });
    await expect(assertCapturedTemplateEvidence(1, 7, database)).rejects.toThrow(/Another required question/);
  });

  it("does not reuse an answer as evidence for a changed current question", async () => {
    rows.inspection_template_items = [{ ...item, questionText: "A different question" }];
    await expect(assertCapturedTemplateEvidence(1, 7, database)).rejects.toThrow(/requirements changed after capture/);
  });

  it("allows jobs with no assigned generic templates and verifies a fully captured active template", async () => {
    await expect(assertCapturedTemplateEvidence(1, 7, database)).resolves.toBeUndefined();
    rows.inspection_template_assignments = [];
    rows.inspection_template_responses = [];
    await expect(getCapturedTemplateReportData(1, 7, database)).resolves.toEqual([]);
  });

  it("fails closed when a response tenant conflicts with the job", async () => {
    rows.inspection_template_responses = [response({ companyId: 8 })];
    await expect(getCapturedTemplateReportData(1, 7, database)).rejects.toThrow(/company does not match/);
  });

  it("uses the supplied finalization transaction without obtaining a second connection", async () => {
    vi.mocked(getDb).mockClear();
    await assertCapturedTemplateEvidence(1, 7, database);
    expect(getDb).not.toHaveBeenCalled();
  });
});
