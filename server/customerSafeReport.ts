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
import type {
  ComplianceReportData,
  ChecklistSection,
  ChecklistItem,
  DeviceRecord,
  ExtinguisherRecord,
  EmergencyLightRecord,
  DeficiencySummary,
} from "./pdfGeneratorCompliance.js";
import type { InvoicePdfData, InvoiceLineItemDisplay } from "./invoicePdfGenerator.js";
import type {
  QuoteReportData,
  QuoteLineItemDisplay,
  RepairQuoteReportData,
  RepairQuoteItemDisplay,
  BuildingQuoteReportData,
  BuildingServiceLine,
  BuildingLabourLine,
} from "./quotePdfGenerator.js";

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

// ── Compliance report (CAN/ULC-S536) ────────────────────────────────────────

function safeChecklistSection(s: ChecklistSection): ChecklistSection {
  return {
    sectionNumber: s.sectionNumber,
    sectionTitle: s.sectionTitle,
    location: s.location,
    identification: s.identification,
    items: s.items.map((i: ChecklistItem) => ({ id: i.id, description: i.description, result: i.result })),
    overallResult: s.overallResult,
    comments: s.comments,
  };
}

function safeDeviceRecord(d: DeviceRecord): DeviceRecord {
  return { deviceType: d.deviceType, location: d.location, result: d.result, notes: d.notes };
}

function safeExtinguisherRecord(e: ExtinguisherRecord): ExtinguisherRecord {
  return { location: e.location, type: e.type, serialNumber: e.serialNumber, result: e.result };
}

function safeEmergencyLight(e: EmergencyLightRecord): EmergencyLightRecord {
  return { location: e.location, functionalTest: e.functionalTest, durationTest: e.durationTest, comments: e.comments };
}

function safeDeficiencySummary(d: DeficiencySummary): DeficiencySummary {
  return { system: d.system, location: d.location, description: d.description, severity: d.severity };
}

/** Project the assembled compliance-report input onto the customer-safe allow-list. */
export function buildCustomerSafeComplianceData(input: ComplianceReportData): ComplianceReportData {
  return {
    workOrderNumber: input.workOrderNumber,
    dateOfService: input.dateOfService,
    inspectionFrequency: input.inspectionFrequency,
    contactPerson: input.contactPerson,
    contactPhone: input.contactPhone,
    buildingName: input.buildingName,
    buildingAddress: input.buildingAddress,
    city: input.city,
    postalCode: input.postalCode,
    pmOrOwner: input.pmOrOwner,
    ownerPhone: input.ownerPhone,
    systemsInspected: { ...input.systemsInspected },
    systemModel: input.systemModel,
    systemOperation: input.systemOperation,
    fireSignalReceivingCentre: input.fireSignalReceivingCentre,
    connectedToFireSignalReceivingCentre: input.connectedToFireSignalReceivingCentre,
    systemFullyFunctional: input.systemFullyFunctional,
    deficienciesIdentified: input.deficienciesIdentified,
    deficienciesCorrectedDate: input.deficienciesCorrectedDate,
    recommendationsIdentified: input.recommendationsIdentified,
    technicianName: input.technicianName,
    technicianCertificateNumber: input.technicianCertificateNumber,
    secondaryTechnicianName: input.secondaryTechnicianName,
    secondaryTechnicianCertificateNumber: input.secondaryTechnicianCertificateNumber,
    companyName: input.companyName,
    companyPhone: input.companyPhone,
    techSignatureUrl: input.techSignatureUrl,
    checklists: input.checklists.map(safeChecklistSection),
    fireAlarmDevices: input.fireAlarmDevices.map(safeDeviceRecord),
    fireExtinguishers: input.fireExtinguishers.map(safeExtinguisherRecord),
    emergencyLights: input.emergencyLights.map(safeEmergencyLight),
    deficiencies: input.deficiencies.map(safeDeficiencySummary),
  };
}

// ── Invoice ──────────────────────────────────────────────────────────────────

function safeInvoiceLine(l: InvoiceLineItemDisplay): InvoiceLineItemDisplay {
  return { description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total, taxable: l.taxable };
}

/** Project the assembled invoice input onto the customer-safe allow-list. */
export function buildCustomerSafeInvoiceData(input: InvoicePdfData): InvoicePdfData {
  return {
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    companyName: input.companyName,
    companyPhone: input.companyPhone,
    companyEmail: input.companyEmail,
    companyAddress: input.companyAddress,
    billToName: input.billToName,
    billToAddress: input.billToAddress,
    billToCity: input.billToCity,
    billToState: input.billToState,
    billToPostalCode: input.billToPostalCode,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    lineItems: input.lineItems.map(safeInvoiceLine),
    subtotal: input.subtotal,
    taxRate: input.taxRate,
    taxAmount: input.taxAmount,
    total: input.total,
    amountPaid: input.amountPaid,
    balanceDue: input.balanceDue,
    clientNotes: input.clientNotes,
  };
}

// ── Repair quote ───────────────────────────────────────────────────────────

function safeQuoteLine(l: QuoteLineItemDisplay): QuoteLineItemDisplay {
  return { deficiencyId: l.deficiencyId, description: l.description, unitPrice: l.unitPrice, qty: l.qty };
}

/** Project the assembled deficiency-quote input onto the customer-safe allow-list. */
export function buildCustomerSafeQuoteData(input: QuoteReportData): QuoteReportData {
  return {
    quoteId: input.quoteId,
    jobNumber: input.jobNumber,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    companyName: input.companyName,
    createdAt: input.createdAt,
    lineItems: input.lineItems.map(safeQuoteLine),
    total: input.total,
    notes: input.notes,
    acceptUrl: input.acceptUrl,
    deficiencySummaries: input.deficiencySummaries?.map((d) => ({
      title: d.title,
      severity: d.severity,
      description: d.description,
      location: d.location,
    })),
  };
}

function safeRepairQuoteItem(i: RepairQuoteItemDisplay): RepairQuoteItemDisplay {
  return {
    description: i.description,
    repairNotes: i.repairNotes,
    systemType: i.systemType,
    location: i.location,
    quantity: i.quantity,
    partDescription: i.partDescription,
    partUnitPrice: i.partUnitPrice,
    partTotal: i.partTotal,
    techHours: i.techHours,
    fitterHours: i.fitterHours,
    techLabourRate: i.techLabourRate,
    fitterLabourRate: i.fitterLabourRate,
    labourTotal: i.labourTotal,
    fuelCharge: i.fuelCharge,
    backflowReportFee: i.backflowReportFee,
    gst: i.gst,
    pst: i.pst,
    total: i.total,
  };
}

/** Project the assembled repair-quote input onto the customer-safe allow-list. */
export function buildCustomerSafeRepairQuoteData(input: RepairQuoteReportData): RepairQuoteReportData {
  return {
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber,
    companyName: input.companyName,
    companyPhone: input.companyPhone,
    companyEmail: input.companyEmail,
    companyAddress: input.companyAddress,
    customerName: input.customerName,
    customerContactName: input.customerContactName,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    jobNumber: input.jobNumber,
    createdAt: input.createdAt,
    validUntil: input.validUntil,
    items: input.items.map(safeRepairQuoteItem),
    subtotal: input.subtotal,
    gst: input.gst,
    pst: input.pst,
    total: input.total,
    notes: input.notes,
  };
}

// ── Building quote ───────────────────────────────────────────────────────────

function safeBuildingService(l: BuildingServiceLine): BuildingServiceLine {
  return { description: l.description, qty: l.qty, unitPrice: l.unitPrice, lineNotes: l.lineNotes };
}

function safeBuildingLabour(l: BuildingLabourLine): BuildingLabourLine {
  return { labourType: l.labourType, hours: l.hours, rate: l.rate, lineNotes: l.lineNotes };
}

/** Project the assembled building-quote input onto the customer-safe allow-list. */
export function buildCustomerSafeBuildingQuoteData(input: BuildingQuoteReportData): BuildingQuoteReportData {
  return {
    quoteId: input.quoteId,
    companyName: input.companyName,
    createdAt: input.createdAt,
    buildingName: input.buildingName,
    buildingId: input.buildingId,
    address: input.address,
    city: input.city,
    backflowFeeCity: input.backflowFeeCity,
    serviceLines: input.serviceLines.map(safeBuildingService),
    labourLines: input.labourLines.map(safeBuildingLabour),
    servicesSubtotal: input.servicesSubtotal,
    labourSubtotal: input.labourSubtotal,
    subtotal: input.subtotal,
    discount: input.discount,
    discountAmount: input.discountAmount,
    discountReason: input.discountReason,
    total: input.total,
    comments: input.comments,
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
