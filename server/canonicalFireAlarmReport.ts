import { createCaptureRevision } from "./captureRevision";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  fireAlarmInspectionResults,
  jobs,
  fireAlarmChecklistTemplates,
  type FireAlarmInspectionResult,
} from "../drizzle/schema";
import { getDb } from "./db";
import type { ChecklistSection } from "./pdfGeneratorCompliance";

/** Only fields defining the displayed question participate in the revision. */
export function fireAlarmQuestionRevision(
  question: Record<string, unknown>
): string {
  const fields = [
    "id",
    "sectionName",
    "sectionOrder",
    "itemLetter",
    "itemDescription",
    "inputType",
    "numericLabel",
    "numericUnit",
    "requirementType",
    "isRequired",
    "standardId",
    "standardVersion",
    "subItems",
    "notApplicableNote",
    "headerFields",
  ];
  const evidence = Object.fromEntries(
    fields.map(key => [key, question[key] ?? null])
  );
  evidence.hasSubItems = question.hasSubItems ?? false;
  return createCaptureRevision("fire-alarm-question", evidence);
}
export function assertFireAlarmQuestionRevision(
  revision: string | undefined,
  question: Record<string, unknown>
) {
  if (!revision || revision !== fireAlarmQuestionRevision(question)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The displayed fire-alarm question is missing its version or has changed. Reload and review the original question before saving; the local answer was preserved.",
    });
  }
}
export function assertFireAlarmCaptureUnchanged(
  snapshot: unknown,
  current: Record<string, unknown>
) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return;
  const captured = snapshot as Record<string, unknown>;
  if (captured.captureProvenance !== "captured") return;
  if (
    fireAlarmQuestionRevision({ ...captured, id: current.id }) !==
    fireAlarmQuestionRevision(current)
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Fire-alarm question requirements changed after capture. Review the original question before editing or sealing.",
    });
  }
}

/** Keep the field form on the same captured wording used by historical PDFs. */
export function mergeCapturedFireAlarmQuestions<T extends { id: number }>(
  templates: T[],
  rows: FireAlarmInspectionResult[]
): T[] {
  const questions = new Map(templates.map(item => [item.id, item]));
  for (const row of rows) {
    const captured = row.itemSnapshot as Record<string, unknown> | null;
    if (
      !captured ||
      captured.captureProvenance !== "captured" ||
      typeof captured.itemDescription !== "string" ||
      typeof captured.sectionName !== "string"
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Job checklist has unverified legacy questions; original captured evidence needs review.",
      });
    }
    questions.set(row.checklistItemId, {
      ...questions.get(row.checklistItemId),
      ...captured,
      id: row.checklistItemId,
    } as unknown as T);
  }
  return Array.from(questions.values());
}

/** Capture and reporting use immutable question snapshots, never letter-based legacy mappings. */
export function buildCanonicalFireAlarmChecklist(
  rows: FireAlarmInspectionResult[]
): ChecklistSection[] {
  if (!rows.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Fire alarm checklist item(s) incomplete: no captured job checklist. Legacy responses need an explicit reviewed migration.",
    });
  const sections = new Map<string, ChecklistSection>();
  for (const row of rows) {
    const item = row.itemSnapshot as {
      sectionName?: string;
      sectionOrder?: number;
      itemLetter?: string;
      itemDescription?: string;
      inputType?: string;
      numericLabel?: string;
      numericUnit?: string;
      requirementType?: string;
      standardVersion?: string;
      isRequired?: boolean;
    } | null;
    if (!item?.sectionName || !item.itemDescription)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Checklist item snapshot is missing; review legacy records before reporting",
      });
    const evidence = [row.numericValueRaw ?? row.numericValue, row.textValue]
      .filter(v => v != null && String(v).trim() !== "")
      .map(String)
      .join("; ");
    const recordedOnly =
      row.result === "not_tested" &&
      item.inputType !== "checkbox" &&
      !!evidence;
    if ((!row.result || row.result === "not_tested") && !recordedOnly)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Fire alarm checklist item(s) incomplete: ${item.itemDescription}`,
      });
    const key = `${item.sectionOrder}:${item.sectionName}`;
    if (!sections.has(key))
      sections.set(key, {
        sectionNumber: String(item.sectionOrder ?? ""),
        sectionTitle: item.sectionName,
        items: [],
        overallResult: "PASS",
      });
    const section = sections.get(key)!;
    section.items.push({
      id: item.itemLetter ?? String(row.checklistItemId),
      description: `${item.itemDescription}${item.standardVersion ? ` [${item.requirementType ?? "requirement unknown"}; standard ${item.standardVersion}; ${item.isRequired === true ? "required" : item.isRequired === false ? "optional" : "requirement unknown"}]` : ""}${evidence ? ` — Recorded: ${evidence}${item.numericUnit ? ` ${item.numericUnit}` : ""}` : ""}`,
      result: recordedOnly
        ? "RECORDED"
        : row.result === "pass"
          ? "YES"
          : row.result === "fail"
            ? "NO"
            : "N/A",
    });
    if (row.notes)
      section.comments = [
        section.comments,
        `${item.itemLetter ?? row.checklistItemId}: ${row.notes}`,
      ]
        .filter(Boolean)
        .join("\n");
    if (row.result === "fail") section.overallResult = "DEFICIENT";
  }
  return Array.from(sections.values())
    .sort((a, b) => Number(a.sectionNumber) - Number(b.sectionNumber))
    .map(section => ({
      ...section,
      overallResult: section.items.every(i => i.result === "N/A")
        ? "N/A"
        : section.overallResult,
    }));
}
export async function getCanonicalFireAlarmChecklist(jobId: number) {
  const database = await getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const rows = await database
    .select()
    .from(fireAlarmInspectionResults)
    .where(eq(fireAlarmInspectionResults.jobId, jobId));
  const [job] = await database.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new TRPCError({ code: "NOT_FOUND" });
  if (!job.finalizedAt) {
    const required = await database
      .select()
      .from(fireAlarmChecklistTemplates)
      .where(eq(fireAlarmChecklistTemplates.isActive, true));
    const captured = new Set(rows.map(row => row.checklistItemId));
    if (required.some(item => item.isRequired && !captured.has(item.id)))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Fire alarm checklist item(s) incomplete: required questions have no capture",
      });
    for (const item of required.filter(item => item.isRequired)) {
      const row = rows.find(row => row.checklistItemId === item.id);
      if (row) assertFireAlarmCaptureUnchanged(row.itemSnapshot, item);
    }
  }
  if (
    rows.some(row => {
      const item = row.itemSnapshot as Record<string, unknown> | null;
      return (
        !item ||
        item.captureProvenance !== "captured" ||
        typeof item.isRequired !== "boolean" ||
        !item.requirementType ||
        !item.standardVersion
      );
    })
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Historical requirements/version cannot be reconstructed reliably; reviewed original evidence is required",
    });
  return buildCanonicalFireAlarmChecklist(rows);
}
