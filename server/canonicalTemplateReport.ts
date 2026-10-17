import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  inspectionTemplateAssignments, inspectionTemplateItems, inspectionTemplateResponses,
  inspectionTemplateSections, inspectionTemplates, jobs,
  type InspectionTemplate, type InspectionTemplateItem, type InspectionTemplateSection,
  type InspectionTemplateResponse,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createCaptureRevision } from "./captureRevision";

const snapshotSchema = z.object({
  captureProvenance: z.literal("captured"),
  capturedAt: z.string().datetime(),
  capturedById: z.number().int().positive(),
  companyId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  template: z.object({
    id: z.number().int().positive(), name: z.string().min(1), systemType: z.string().min(1),
    inspectionType: z.string().min(1), version: z.number().int().positive(),
  }),
  section: z.object({ id: z.number().int().positive(), title: z.string().min(1), sortOrder: z.number().int(), description: z.string().nullable() }),
  item: z.object({
    id: z.number().int().positive(), code: z.string().nullable(), wording: z.string().min(1),
    responseType: z.string().min(1), isRequired: z.boolean(), sortOrder: z.number().int(),
    codeReference: z.string().nullable(),
    helpText: z.string().nullable(), options: z.unknown(), deficiencyTrigger: z.unknown(),
  }),
});
export type TemplateItemSnapshot = z.infer<typeof snapshotSchema>;
type Database = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">;

export function buildTemplateItemSnapshot(input: {
  companyId: number; jobId: number; capturedById: number; capturedAt: Date;
  template: InspectionTemplate; section: InspectionTemplateSection; item: InspectionTemplateItem;
}): TemplateItemSnapshot {
  const { template, section, item } = input;
  return snapshotSchema.parse({
    captureProvenance: "captured", capturedAt: input.capturedAt.toISOString(),
    capturedById: input.capturedById, companyId: input.companyId, jobId: input.jobId,
    template: { id: template.id, name: template.name, systemType: template.systemType, inspectionType: template.inspectionType, version: template.version },
    section: { id: section.id, title: section.title, sortOrder: section.sortOrder, description: section.description ?? null },
    item: { id: item.id, code: item.itemCode, wording: item.questionText, responseType: item.responseType, isRequired: item.isRequired === 1, sortOrder: item.sortOrder, codeReference: item.codeReference, helpText: item.helpText ?? null, options: item.options ?? null, deficiencyTrigger: item.deficiencyTrigger ?? null },
  });
}

export function templateQuestionRevision(snapshot: TemplateItemSnapshot): string {
  return createCaptureRevision("template-question", { companyId: snapshot.companyId, jobId: snapshot.jobId, template: snapshot.template, section: snapshot.section, item: snapshot.item });
}

export function readCapturedTemplateQuestion(row: InspectionTemplateResponse): TemplateItemSnapshot {
  return capturedSnapshot(row);
}

export function templateQuestionView(snapshot: TemplateItemSnapshot) {
  return {
    id: snapshot.item.id, companyId: snapshot.companyId, templateId: snapshot.template.id, sectionId: snapshot.section.id,
    itemCode: snapshot.item.code, questionText: snapshot.item.wording, helpText: snapshot.item.helpText,
    responseType: snapshot.item.responseType, isRequired: snapshot.item.isRequired ? 1 : 0, sortOrder: snapshot.item.sortOrder,
    deficiencyTrigger: snapshot.item.deficiencyTrigger, options: snapshot.item.options, codeReference: snapshot.item.codeReference,
    questionRevision: templateQuestionRevision(snapshot),
    capturedTemplateName: snapshot.template.name, capturedTemplateVersion: snapshot.template.version,
    capturedSectionTitle: snapshot.section.title,
    capturedSectionDescription: snapshot.section.description,
  };
}

export function buildTemplatePacketData(input: {
  job: { id: number; companyId: number; finalizedAt: Date | null };
  templates: InspectionTemplate[]; sections: InspectionTemplateSection[]; items: InspectionTemplateItem[];
  responses: InspectionTemplateResponse[]; actorId: number;
}) {
  const { job, responses } = input;
  const templates = new Map<number, TemplateItemSnapshot["template"]>();
  const sections = new Map<number, TemplateItemSnapshot["section"] & { templateId: number }>();
  const items = new Map<number, ReturnType<typeof templateQuestionView>>();
  if (!job.finalizedAt) {
    for (const template of input.templates) templates.set(template.id, { id: template.id, name: template.name, systemType: template.systemType, inspectionType: template.inspectionType, version: template.version });
    for (const item of input.items) {
      const template = input.templates.find(template => template.id === item.templateId);
      const section = input.sections.find(section => section.id === item.sectionId && section.templateId === item.templateId);
      if (!template || !section) evidenceError("Template question links changed. Reload the offline packet.");
      const snapshot = buildTemplateItemSnapshot({ companyId: job.companyId, jobId: job.id, capturedById: input.actorId, capturedAt: new Date(), template, section, item });
      sections.set(section.id, { ...snapshot.section, templateId: template.id });
      items.set(item.id, templateQuestionView(snapshot));
    }
  }
  const capturedTemplateIds = new Set<number>();
  for (const row of responses.slice().sort((a, b) => a.id - b.id)) {
    const snapshot = capturedSnapshot(row);
    if (snapshot.jobId !== job.id || snapshot.companyId !== job.companyId) evidenceError("Template capture does not belong to this offline job packet");
    if (!capturedTemplateIds.has(snapshot.template.id)) templates.set(snapshot.template.id, snapshot.template);
    capturedTemplateIds.add(snapshot.template.id);
    sections.set(snapshot.section.id, { ...snapshot.section, templateId: snapshot.template.id });
    items.set(snapshot.item.id, templateQuestionView(snapshot));
  }
  return { templates: Array.from(templates.values()), templateSections: Array.from(sections.values()), templateItems: Array.from(items.values()), templateResponses: responses };
}

/** An answer to an edited form cannot silently reuse the old question label. */
export function assertTemplateQuestionUnchanged(existing: InspectionTemplateResponse, current: TemplateItemSnapshot): void {
  const captured = capturedSnapshot(existing);
  if (JSON.stringify([captured.template, captured.section, captured.item]) !== JSON.stringify([current.template, current.section, current.item])) {
    evidenceError("Template question changed after capture; review the original evidence before editing this response");
  }
}

function evidenceError(message: string): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
}

function capturedSnapshot(row: InspectionTemplateResponse): TemplateItemSnapshot {
  const result = snapshotSchema.safeParse(row.itemSnapshot);
  if (!result.success) {
    evidenceError("Template item snapshot is missing or unverified; review original evidence before reporting legacy responses");
  }
  const snapshot = result.data;
  if (snapshot.companyId !== row.companyId || snapshot.jobId !== row.jobId || snapshot.template.id !== row.templateId || snapshot.section.id !== row.sectionId || snapshot.item.id !== row.itemId) {
    evidenceError("Template response does not match its captured question identity");
  }
  return snapshot;
}

function isAnswered(row: Pick<InspectionTemplateResponse, "responseValue" | "responseText">) {
  return [row.responseValue, row.responseText].some(value => typeof value === "string" && value.trim().length > 0);
}

/** Report identity, wording, order and requiredness come exclusively from captured evidence. */
export function buildCapturedTemplateReportData(rows: InspectionTemplateResponse[]) {
  const templates = new Map<string, { snapshot: TemplateItemSnapshot; rows: Array<{ row: InspectionTemplateResponse; snapshot: TemplateItemSnapshot }> }>();
  const identities = new Set<number>();
  for (const row of rows) {
    const snapshot = capturedSnapshot(row);
    if (identities.has(row.itemId)) evidenceError("Duplicate captured template question identity");
    identities.add(row.itemId);
    if (snapshot.item.isRequired && !isAnswered(row)) {
      evidenceError(`Template required item is unanswered: ${snapshot.item.wording}`);
    }
    const key = JSON.stringify(snapshot.template);
    if (!templates.has(key)) templates.set(key, { snapshot, rows: [] });
    templates.get(key)!.rows.push({ row, snapshot });
  }
  return Array.from(templates.values()).sort((a, b) => a.snapshot.template.id - b.snapshot.template.id || a.snapshot.template.version - b.snapshot.template.version).map(group => {
    const sections = new Map<string, { snapshot: TemplateItemSnapshot["section"]; rows: typeof group.rows }>();
    let passCount = 0, failCount = 0, naCount = 0;
    for (const evidence of group.rows) {
      const value = evidence.row.responseValue?.trim().toLowerCase();
      if (["pass", "yes", "checked"].includes(value ?? "")) passCount++;
      else if (["fail", "no"].includes(value ?? "")) failCount++;
      else if (value === "na") naCount++;
      const key = JSON.stringify(evidence.snapshot.section);
      if (!sections.has(key)) sections.set(key, { snapshot: evidence.snapshot.section, rows: [] });
      sections.get(key)!.rows.push(evidence);
    }
    const answeredItems = group.rows.filter(({ row }) => isAnswered(row)).length;
    return {
      templateId: group.snapshot.template.id,
      templateName: group.snapshot.template.name,
      templateVersion: group.snapshot.template.version,
      systemType: group.snapshot.template.systemType,
      inspectionType: group.snapshot.template.inspectionType,
      totalItems: group.rows.length,
      answeredItems,
      requiredItems: group.rows.filter(({ snapshot }) => snapshot.item.isRequired).length,
      unansweredRequiredItems: 0,
      completionPercent: Math.round(answeredItems / group.rows.length * 100),
      passCount, failCount, naCount,
      sections: Array.from(sections.values()).sort((a, b) => a.snapshot.sortOrder - b.snapshot.sortOrder || a.snapshot.id - b.snapshot.id).map(section => ({
        sectionId: section.snapshot.id,
        sectionTitle: section.snapshot.title,
        sectionSortOrder: section.snapshot.sortOrder,
        items: section.rows.sort((a, b) => a.snapshot.item.sortOrder - b.snapshot.item.sortOrder || a.snapshot.item.id - b.snapshot.item.id).map(({ row, snapshot }) => ({
          itemCode: snapshot.item.code, questionText: snapshot.item.wording,
          responseType: snapshot.item.responseType, codeReference: snapshot.item.codeReference,
          isRequired: snapshot.item.isRequired, responseValue: row.responseValue,
          responseText: row.responseText, notes: row.notes, deficiencyId: row.deficiencyId,
          answeredById: row.answeredById, answeredAt: row.answeredAt,
        })),
      })),
    };
  });
}

export async function getCapturedTemplateReportData(jobId: number, companyId: number, connection?: Database) {
  const database = connection ?? await getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [job] = await database.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId))).limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  const responses = await database.select().from(inspectionTemplateResponses)
    .where(eq(inspectionTemplateResponses.jobId, jobId));
  if (responses.some(row => row.companyId !== companyId)) evidenceError("Template response company does not match the job");
  const report = buildCapturedTemplateReportData(responses);
  if (job.finalizedAt) return report;

  // Before sealing, today's assigned active required questions must all have
  // actual captured answers. Even an entirely empty response set must be checked.
  const assignments = await database.select().from(inspectionTemplateAssignments)
    .where(and(eq(inspectionTemplateAssignments.companyId, companyId), eq(inspectionTemplateAssignments.isActive, 1)));
  const assigned = new Set(assignments.filter(a => (!a.jobType || a.jobType === job.jobType) && (!a.siteId || a.siteId === job.siteId) && (!a.customerOrgId || a.customerOrgId === job.customerOrgId)).map(a => a.templateId));
  if (!assigned.size) return report;
  const active = await database.select().from(inspectionTemplates)
    .where(and(eq(inspectionTemplates.companyId, companyId), eq(inspectionTemplates.status, "active"), inArray(inspectionTemplates.id, Array.from(assigned))));
  if (!active.length) return report;
  const required = await database.select().from(inspectionTemplateItems)
    .where(and(eq(inspectionTemplateItems.companyId, companyId), inArray(inspectionTemplateItems.templateId, active.map(t => t.id)), eq(inspectionTemplateItems.isRequired, 1)));
  const responsesByItem = new Map(responses.map(row => [row.itemId, row]));
  const sections = required.length ? await database.select().from(inspectionTemplateSections)
    .where(and(eq(inspectionTemplateSections.companyId, companyId), inArray(inspectionTemplateSections.templateId, active.map(template => template.id)))) : [];
  for (const item of required) {
    const row = responsesByItem.get(item.id);
    if (!row || !isAnswered(row)) evidenceError(`Template required item has no captured answer: ${item.questionText}`);
    const snapshot = capturedSnapshot(row);
    const template = active.find(t => t.id === item.templateId)!;
    const section = sections.find(section => section.id === item.sectionId && section.templateId === template.id);
    if (!section) evidenceError("Assigned template section is missing; review the form before sealing");
    const current = buildTemplateItemSnapshot({ companyId, jobId, capturedById: snapshot.capturedById, capturedAt: new Date(), template, section, item });
    if (row.templateId !== item.templateId || row.sectionId !== item.sectionId || templateQuestionRevision(snapshot) !== templateQuestionRevision(current)) {
      evidenceError("Assigned template requirements changed after capture; review the original evidence before sealing");
    }
  }
  return report;
}

export async function assertCapturedTemplateEvidence(jobId: number, companyId: number, connection?: Database): Promise<void> {
  await getCapturedTemplateReportData(jobId, companyId, connection);
}
