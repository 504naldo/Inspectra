/**
 * customerSafeReport.ts — central allow-list serializer for customer-facing reports (PR-12).
 *
 * Customer-facing PDF generators must never receive raw database rows. Historically
 * the sanitization boundary was implicit: each generator declared a narrow typed
 * input and the router hand-built it. That is include-by-default — a new sensitive
 * field spreads into the report the moment someone `...spread`s a row or copies a
 * field across.
 *
 * `buildCustomerSafeReportData` makes the boundary explicit and exclude-by-default:
 * it copies ONLY the allow-listed fields into a fresh object, so anything not
 * enumerated here (internal notes, monitoring/lockbox codes, wage/margin data, AI
 * prompts, storage keys, integration metadata) is dropped, even if it was present
 * on the input. New fields are excluded until deliberately added to the allow-list.
 *
 * `findProhibitedFields` is a defensive deep scan used by the regression test (and
 * available as a runtime assertion) to prove no known-sensitive key ever survives.
 */
import type {
  ReportData,
  DeviceSummary,
  Deficiency,
  InspectionResult,
  FireAlarmChecklistItem,
  TemplatePdfSection,
  TemplatePdfItem,
} from "./pdfGeneratorFirePro.js";

// ── Allow-list projections (exclude-by-default) ─────────────────────────────

function safeDeviceSummary(d: DeviceSummary): DeviceSummary {
  return { deviceType: d.deviceType, total: d.total, passed: d.passed, failed: d.failed, na: d.na };
}

function safeDeficiency(d: Deficiency): Deficiency {
  return {
    id: d.id,
    title: d.title,
    severity: d.severity,
    status: d.status,
    description: d.description,
    correctiveAction: d.correctiveAction,
    deviceType: d.deviceType,
    location: d.location,
    estimatedCost: d.estimatedCost,
    systemCategory: d.systemCategory,
    photos: d.photos?.map((p) => ({ buffer: p.buffer, caption: p.caption, locationNote: p.locationNote })),
  };
}

function safeInspectionResult(r: InspectionResult): InspectionResult {
  return {
    deviceId: r.deviceId,
    deviceType: r.deviceType,
    location: r.location,
    serialNumber: r.serialNumber,
    result: r.result,
    notes: r.notes,
  };
}

function safeChecklistItem(i: FireAlarmChecklistItem): FireAlarmChecklistItem {
  return {
    id: i.id,
    sectionName: i.sectionName,
    sectionOrder: i.sectionOrder,
    itemLetter: i.itemLetter,
    itemDescription: i.itemDescription,
    inputType: i.inputType,
    numericLabel: i.numericLabel,
    numericUnit: i.numericUnit,
    result: i.result,
    numericValue: i.numericValue,
    textValue: i.textValue,
    notes: i.notes,
  };
}

function safeTemplateItem(i: TemplatePdfItem): TemplatePdfItem {
  return {
    itemCode: i.itemCode,
    questionText: i.questionText,
    responseValue: i.responseValue,
    responseText: i.responseText,
    notes: i.notes,
    codeReference: i.codeReference,
    isRequired: i.isRequired,
    deficiencyId: i.deficiencyId,
  };
}

function safeTemplateSection(s: TemplatePdfSection): TemplatePdfSection {
  return {
    templateName: s.templateName,
    systemType: s.systemType,
    completionPercent: s.completionPercent,
    totalItems: s.totalItems,
    answeredItems: s.answeredItems,
    passCount: s.passCount,
    failCount: s.failCount,
    naCount: s.naCount,
    unansweredRequiredItems: s.unansweredRequiredItems,
    sections: s.sections.map((sec) => ({
      sectionTitle: sec.sectionTitle,
      items: sec.items.map(safeTemplateItem),
    })),
  };
}

/**
 * Project the assembled report input onto the customer-safe allow-list. The return
 * value contains only fields explicitly enumerated here; any other property present
 * on `input` is discarded.
 */
export function buildCustomerSafeReportData(input: ReportData): ReportData {
  return {
    jobNumber: input.jobNumber,
    jobTitle: input.jobTitle,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    siteCity: input.siteCity,
    siteState: input.siteState,
    customerName: input.customerName,
    customerAddress: input.customerAddress,
    customerCity: input.customerCity,
    customerState: input.customerState,
    customerPostalCode: input.customerPostalCode,
    attentionTo: input.attentionTo,
    attentionEmail: input.attentionEmail,
    inspectionDate: input.inspectionDate,
    completedDate: input.completedDate,
    technicianName: input.technicianName,
    technicianTitle: input.technicianTitle,
    technicianCertNumber: input.technicianCertNumber,
    technicianEmail: input.technicianEmail,
    companyName: input.companyName,
    companyAddress: input.companyAddress,
    companyPhone: input.companyPhone,
    companyEmail: input.companyEmail,
    companyLogo: input.companyLogo,
    summary: input.summary,
    deviceSummaries: input.deviceSummaries.map(safeDeviceSummary),
    deficiencies: input.deficiencies.map(safeDeficiency),
    inspectionResults: input.inspectionResults.map(safeInspectionResult),
    missingLocationDeficiencies: input.missingLocationDeficiencies?.map((m) => ({
      id: m.id,
      description: m.description,
      severity: m.severity,
    })),
    techSignatureUrl: input.techSignatureUrl,
    fireAlarmChecklist: input.fireAlarmChecklist?.map(safeChecklistItem),
    fireAlarmSystem: input.fireAlarmSystem
      ? {
          operationType: input.fireAlarmSystem.operationType,
          connectedToMonitoring: input.fireAlarmSystem.connectedToMonitoring,
          monitoringCentreName: input.fireAlarmSystem.monitoringCentreName,
          manufacturer: input.fireAlarmSystem.manufacturer,
          modelNumber: input.fireAlarmSystem.modelNumber,
        }
      : undefined,
    includeFireAlarmChecklist: input.includeFireAlarmChecklist,
    templateChecklistSections: input.templateChecklistSections?.map(safeTemplateSection),
    companyLogoBuffer: input.companyLogoBuffer,
    reportFooterText: input.reportFooterText,
    gstRate: input.gstRate,
    pstRate: input.pstRate,
  };
}

// ── Defensive deep scan (used by the regression test) ───────────────────────

/**
 * Key-name substrings that must never appear anywhere in customer-facing report
 * data. Matched case-insensitively against object keys, so `internalNotes`,
 * `monitoringPassword`, `techWageRate`, `aiSystemPrompt`, `s3StorageKey`, etc. are
 * all caught. Field names that are legitimately customer-safe (e.g. `notes`,
 * `monitoringCentreName`) are intentionally NOT listed — only internal-only concepts.
 */
export const PROHIBITED_KEY_PATTERNS: readonly string[] = [
  "internalnote",
  "officenote",
  "privatenote",
  "qacomment",
  "accesscode",
  "lockbox",
  "passcode",
  "password",
  "wage",
  "payroll",
  "margin",
  "costing",
  "hourlyrate",
  "payrate",
  "aiprompt",
  "systemprompt",
  "storagekey",
  "filekey",
  "s3key",
  "secret",
  "apikey",
  "accesstoken",
];

export interface ProhibitedHit {
  path: string;
  key: string;
}

/**
 * Recursively scan a value for object keys matching any prohibited pattern.
 * Returns every hit with a dotted path so tests can report exactly what leaked.
 * Buffers and Dates are treated as leaves (never descended into).
 */
export function findProhibitedFields(value: unknown, path = ""): ProhibitedHit[] {
  const hits: ProhibitedHit[] = [];
  if (value === null || typeof value !== "object") return hits;
  if (Buffer.isBuffer(value) || value instanceof Date) return hits;

  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...findProhibitedFields(item, `${path}[${i}]`)));
    return hits;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (PROHIBITED_KEY_PATTERNS.some((p) => lower.includes(p))) {
      hits.push({ path: path ? `${path}.${key}` : key, key });
    }
    hits.push(...findProhibitedFields(child, path ? `${path}.${key}` : key));
  }
  return hits;
}
