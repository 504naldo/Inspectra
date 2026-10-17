import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { getDb, withAudit } from "./db";
import { inspectionTemplateRouter } from "./routers/inspectionTemplateRouter";
import { buildTemplateItemSnapshot, templateQuestionRevision } from "./canonicalTemplateReport";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn(), withAudit: vi.fn() }));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));

const input = { jobId: 1, templateId: 10, sectionId: 20, itemId: 30, responseValue: "pass", questionRevision: "" };
const ctx = { user: { id: 3, role: "technician", companyId: 7 }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
const caller = inspectionTemplateRouter.createCaller(ctx);
let rows: Record<string, any[]>;
let events: string[];
const insert = vi.fn();
const update = vi.fn();
const tx = {
  select: () => ({ from: (table: any) => {
    const name = getTableName(table);
    events.push(`read:${name}`);
    const query = {
      where: (_condition: any) => query,
      for: (mode: string) => { events.push(`lock:${name}:${mode}`); return Promise.resolve(rows[name] ?? []); },
      limit: (_limit: number) => Promise.resolve(rows[name] ?? []),
      orderBy: (..._order: any[]) => Promise.resolve(rows[name] ?? []),
      then: (resolve: any, reject: any) => Promise.resolve(rows[name] ?? []).then(resolve, reject),
    };
    return query;
  } }),
  insert: (_table: any) => ({ values: insert }),
  update: (_table: any) => ({ set: (value: any) => ({ where: async (_condition: any) => { update(value); } }) }),
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  rows = {
    jobs: [{ id: 1, companyId: 7, finalizedAt: null }],
    inspection_templates: [{ id: 10, companyId: 7, name: "Template", systemType: "general", inspectionType: "annual", version: 1 }],
    inspection_template_sections: [{ id: 20, templateId: 10, companyId: 7, title: "Section", sortOrder: 0 }],
    inspection_template_items: [{ id: 30, templateId: 10, sectionId: 20, companyId: 7, itemCode: "A", questionText: "Original question", responseType: "pass_fail_na", isRequired: 1, sortOrder: 1, codeReference: null }],
    inspection_template_responses: [],
  };
  vi.mocked(withAudit).mockImplementation(async (_ctx, _name, fn) => fn(tx));
  vi.mocked(getDb).mockResolvedValue(tx);
  input.questionRevision = templateQuestionRevision(buildTemplateItemSnapshot({ companyId: 7, jobId: 1, capturedById: 3, capturedAt: new Date(), template: rows.inspection_templates[0], section: rows.inspection_template_sections[0], item: rows.inspection_template_items[0] }));
});

describe("Generic template capture mutations", () => {
  it("locks the parent job before reading definitions and captures provenance only on insert", async () => {
    await caller.saveResponse(input);
    expect(events.slice(0, 2)).toEqual(["read:jobs", "lock:jobs:update"]);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 7, jobId: 1, templateId: 10, sectionId: 20, itemId: 30,
      itemSnapshot: expect.objectContaining({
        captureProvenance: "captured", capturedById: 3, companyId: 7, jobId: 1,
        template: expect.objectContaining({ name: "Template", version: 1 }),
        section: expect.objectContaining({ title: "Section" }),
        item: expect.objectContaining({ wording: "Original question", isRequired: true }),
      }),
    }));
    expect(update).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves an existing snapshot, including legacy null (captured=%s)", captured => {
    const itemSnapshot = captured ? buildTemplateItemSnapshot({ companyId: 7, jobId: 1, capturedById: 2, capturedAt: new Date(), template: rows.inspection_templates[0], section: rows.inspection_template_sections[0], item: rows.inspection_template_items[0] }) : null;
    rows.inspection_template_responses = [{ id: 5, jobId: 1, companyId: 7, templateId: 10, sectionId: 20, itemId: 30, itemSnapshot }];
    return caller.saveResponse(input).then(() => {
      expect(insert).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ responseValue: "pass", answeredById: 3 }));
      expect(update.mock.calls[0][0]).not.toHaveProperty("itemSnapshot");
    });
  });

  it("accepts an answer to the displayed captured question after the library changes, preserving that snapshot", async () => {
    const itemSnapshot = buildTemplateItemSnapshot({ companyId: 7, jobId: 1, capturedById: 2, capturedAt: new Date(), template: rows.inspection_templates[0], section: rows.inspection_template_sections[0], item: rows.inspection_template_items[0] });
    rows.inspection_template_responses = [{ id: 5, jobId: 1, companyId: 7, templateId: 10, sectionId: 20, itemId: 30, itemSnapshot }];
    rows.inspection_template_items[0].questionText = "Replacement question";
    await expect(caller.saveResponse(input)).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).not.toHaveProperty("itemSnapshot");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a first offline answer if the displayed question changed before synchronization", async () => {
    rows.inspection_template_items[0].questionText = "Replacement question";
    await expect(caller.saveResponse(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects missing displayed question identity instead of creating today's snapshot for an unknown old answer", async () => {
    await expect(caller.saveResponse({ ...input, questionRevision: undefined })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("includes response options and section context in displayed identity", async () => {
    rows.inspection_template_items[0].options = ["Different option"];
    await expect(caller.saveResponse(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns a server revision for the exact displayed fields", async () => {
    const form = await caller.getTemplateWithResponses({ templateId: 10, jobId: 1 });
    expect(form.items[0]).toMatchObject({ questionText: "Original question", questionRevision: input.questionRevision, capturedTemplateName: "Template", capturedTemplateVersion: 1 });
  });

  it("renders finalized forms from captures without consulting today's library", async () => {
    const itemSnapshot = buildTemplateItemSnapshot({ companyId: 7, jobId: 1, capturedById: 3, capturedAt: new Date(), template: rows.inspection_templates[0], section: rows.inspection_template_sections[0], item: rows.inspection_template_items[0] });
    rows.jobs[0].finalizedAt = new Date();
    rows.inspection_template_responses = [{ id: 5, jobId: 1, companyId: 7, templateId: 10, sectionId: 20, itemId: 30, itemSnapshot }];
    rows.inspection_templates = [];
    rows.inspection_template_items = [];
    const form = await caller.getTemplateWithResponses({ templateId: 10, jobId: 1 });
    expect(form.finalized).toBe(true);
    expect(form.items[0].questionText).toBe("Original question");
    expect(events).not.toContain("read:inspection_templates");
  });

  it("keeps an open job's captured question accessible after its library template was removed", async () => {
    const itemSnapshot = buildTemplateItemSnapshot({ companyId: 7, jobId: 1, capturedById: 3, capturedAt: new Date(), template: rows.inspection_templates[0], section: { ...rows.inspection_template_sections[0], description: "Original instructions" }, item: rows.inspection_template_items[0] });
    rows.inspection_template_responses = [{ id: 5, jobId: 1, companyId: 7, templateId: 10, sectionId: 20, itemId: 30, itemSnapshot }];
    rows.inspection_templates = [];
    rows.inspection_template_sections = [];
    rows.inspection_template_items = [];
    const form = await caller.getTemplateWithResponses({ templateId: 10, jobId: 1 });
    expect(form.template.name).toBe("Template");
    expect(form.finalized).toBe(false);
    expect(form.items[0]).toMatchObject({ questionText: "Original question", capturedSectionDescription: "Original instructions" });
  });

  it.each([false, true])("lists captured templates even after assignments and definitions were removed (sealed=%s)", async sealed => {
    const itemSnapshot = buildTemplateItemSnapshot({ companyId: 7, jobId: 1, capturedById: 3, capturedAt: new Date(), template: rows.inspection_templates[0], section: rows.inspection_template_sections[0], item: rows.inspection_template_items[0] });
    rows.inspection_template_responses = [{ id: 5, jobId: 1, companyId: 7, templateId: 10, sectionId: 20, itemId: 30, itemSnapshot }];
    rows.jobs[0].finalizedAt = sealed ? new Date() : null;
    rows.inspection_templates = [];
    const templates = await caller.getTemplatesForJob({ jobId: 1 });
    expect(templates).toEqual([{ id: 10, name: "Template", systemType: "general", inspectionType: "annual", version: 1, description: null }]);
    expect(events).not.toContain("read:inspection_templates");
    if (sealed) expect(events).not.toContain("read:inspection_template_assignments");
  });

  it("rejects a concurrent job seal before any child read or write", async () => {
    rows.jobs[0].finalizedAt = new Date();
    await expect(caller.saveResponse(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(events).toEqual(["read:jobs", "lock:jobs:update"]);
    expect(insert).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it("rejects cross-company jobs even when the caller knows template identifiers", async () => {
    rows.jobs[0].companyId = 8;
    await expect(caller.saveResponse(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(["inspection_templates", "inspection_template_sections", "inspection_template_items"])("rejects a foreign or mismatched canonical parent: %s", async table => {
    rows[table] = [];
    await expect(caller.saveResponse(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a deficiency belonging to another job", async () => {
    rows.deficiencies = [];
    await expect(caller.saveResponse({ ...input, deficiencyId: 99 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an existing corrupt response instead of relabeling its parent identity", async () => {
    rows.inspection_template_responses = [{ id: 5, companyId: 8, templateId: 10, sectionId: 20, itemId: 30 }];
    await expect(caller.saveResponse(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(update).not.toHaveBeenCalled();
  });
});
