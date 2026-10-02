import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  fireAlarmInspectionResults,
  fireAlarmChecklistTemplates,
  type FireAlarmInspectionResult,
} from "../drizzle/schema";
import { getDb } from "./db";
import type { ChecklistSection } from "./pdfGeneratorCompliance";

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
      description: `${item.itemDescription}${evidence ? ` — Recorded: ${evidence}${item.numericUnit ? ` ${item.numericUnit}` : ""}` : ""}`,
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
  return buildCanonicalFireAlarmChecklist(rows);
}
