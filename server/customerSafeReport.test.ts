/**
 * customerSafeReport.test.ts — PR-12 privacy regression.
 *
 * Seeds an assembled report input with internal-only fields (technician wages,
 * monitoring passwords, internal notes, AI prompts, storage keys, …) and asserts
 * that `buildCustomerSafeReportData` strips every one of them while preserving the
 * customer-safe fields the PDF actually renders. This is the automated guardrail
 * that PR-12 (CUSTOMER_REPORT_PRIVACY.md) called for: new fields are dropped by
 * default, so a leak can only happen by deliberately extending the allow-list.
 */
import { describe, it, expect } from "vitest";
import {
  buildCustomerSafeReportData,
  buildCustomerSafeComplianceData,
  buildCustomerSafeInvoiceData,
  buildCustomerSafeQuoteData,
  buildCustomerSafeRepairQuoteData,
  buildCustomerSafeBuildingQuoteData,
  findProhibitedFields,
  PROHIBITED_KEY_PATTERNS,
} from "./customerSafeReport";
import type { ReportData } from "./pdfGeneratorFirePro";
import type { ComplianceReportData } from "./pdfGeneratorCompliance";
import type { InvoicePdfData } from "./invoicePdfGenerator";
import type { QuoteReportData, RepairQuoteReportData, BuildingQuoteReportData } from "./quotePdfGenerator";

// A minimal, valid customer-safe report plus a pile of prohibited internal fields
// injected at every nesting level. Cast through `any` because these extra keys are
// intentionally NOT part of ReportData — that's the point: they must be dropped.
function pollutedInput(): ReportData {
  return {
    jobNumber: "J-1",
    jobTitle: "Annual Inspection",
    siteName: "Acme Tower",
    siteAddress: "1 Main St",
    siteCity: "Vancouver",
    siteState: "BC",
    customerName: "Acme Corp",
    inspectionDate: new Date("2026-01-15"),
    companyName: "Inspectra Fire",
    deviceSummaries: [
      { deviceType: "Smoke", total: 10, passed: 9, failed: 1, na: 0, internalCostPerDevice: 4.5 } as any,
    ],
    deficiencies: [
      {
        id: 1,
        title: "Blocked exit",
        severity: "high",
        status: "open",
        description: "Exit obstructed",
        correctiveAction: "Clear the exit",
        // prohibited internal-only fields injected on the deficiency
        internalNotes: "customer is behind on payments — chase AR",
        technicianWage: 42.5,
        photos: [{ buffer: Buffer.from("img"), caption: "photo", locationNote: "north wall", storageKey: "s3/secret/path.jpg" } as any],
      } as any,
    ],
    inspectionResults: [
      { deviceId: 1, deviceType: "Smoke", result: "pass", notes: "ok", officeNote: "tech was late", payRate: 30 } as any,
    ],
    fireAlarmSystem: {
      manufacturer: "Notifier",
      monitoringCentreName: "Central Station",
      // prohibited
      monitoringPassword: "hunter2",
      lockboxCode: "4821",
    } as any,
    templateChecklistSections: [
      {
        templateName: "ULC-S536",
        systemType: "fire_alarm",
        completionPercent: 100,
        totalItems: 1,
        answeredItems: 1,
        passCount: 1,
        failCount: 0,
        naCount: 0,
        unansweredRequiredItems: 0,
        sections: [
          {
            sectionTitle: "General",
            items: [
              { questionText: "Panel powered?", responseValue: "pass", isRequired: true, aiPrompt: "you are a fire inspector", apiKey: "sk-123" } as any,
            ],
          },
        ],
      } as any,
    ],
    // top-level prohibited fields
    ...( { internalQaComment: "rushed job", jobCostingMargin: 0.35, s3StorageKey: "reports/raw", accessToken: "abc" } as any ),
  } as ReportData;
}

describe("buildCustomerSafeReportData", () => {
  it("strips every prohibited internal field at all nesting levels", () => {
    const safe = buildCustomerSafeReportData(pollutedInput());
    const hits = findProhibitedFields(safe);
    expect(hits, `leaked internal fields: ${hits.map((h) => h.path).join(", ")}`).toEqual([]);
  });

  it("preserves the customer-safe fields the report renders", () => {
    const safe = buildCustomerSafeReportData(pollutedInput());
    expect(safe.jobNumber).toBe("J-1");
    expect(safe.customerName).toBe("Acme Corp");
    expect(safe.deviceSummaries[0]).toEqual({ deviceType: "Smoke", total: 10, passed: 9, failed: 1, na: 0 });
    expect(safe.deficiencies[0].description).toBe("Exit obstructed");
    expect(safe.deficiencies[0].correctiveAction).toBe("Clear the exit");
    // customer-facing photo metadata + buffer survive
    expect(safe.deficiencies[0].photos?.[0].caption).toBe("photo");
    expect(Buffer.isBuffer(safe.deficiencies[0].photos?.[0].buffer)).toBe(true);
    expect(safe.inspectionResults[0].notes).toBe("ok");
    // monitoring centre NAME is customer-safe (only the password is prohibited)
    expect(safe.fireAlarmSystem?.monitoringCentreName).toBe("Central Station");
    expect(safe.templateChecklistSections?.[0].sections[0].items[0].questionText).toBe("Panel powered?");
  });

  it("does not carry any key outside the ReportData allow-list", () => {
    const safe = buildCustomerSafeReportData(pollutedInput()) as Record<string, unknown>;
    // The injected top-level pollutant keys must be absent entirely.
    for (const leaked of ["internalQaComment", "jobCostingMargin", "s3StorageKey", "accessToken"]) {
      expect(leaked in safe).toBe(false);
    }
  });

  it("findProhibitedFields flags a seeded internal key (guards the guard)", () => {
    const hits = findProhibitedFields({ deep: { techWageRate: 50 } });
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe("deep.techWageRate");
  });

  it("does not treat legitimate customer-safe keys as prohibited", () => {
    // `notes` and `monitoringCentreName` are allowed — ensure no pattern over-matches.
    expect(findProhibitedFields({ notes: "x", monitoringCentreName: "y" })).toEqual([]);
    expect(PROHIBITED_KEY_PATTERNS).not.toContain("notes");
  });
});

describe("buildCustomerSafeComplianceData", () => {
  it("strips internal fields and keeps customer-safe ones", () => {
    const input = {
      workOrderNumber: "WO-1",
      dateOfService: new Date("2026-01-10"),
      inspectionFrequency: "Annual",
      contactPerson: "Jane",
      contactPhone: "555",
      buildingName: "Tower",
      buildingAddress: "1 Main",
      city: "Vancouver",
      systemsInspected: { fireAlarmSystem: true, commonAreaDevices: false, inSuiteDevices: false, sprinklerSystem: false, fireExtinguishers: false, emergencyLighting: false, hydrant: false, winterization: false, generator: false, backflow: false, monitoring: false, smokeControl: false, suppressionSystems: false, standpipe: false, kitchen: false },
      systemModel: "Notifier",
      systemOperation: "Single Stage",
      connectedToFireSignalReceivingCentre: true,
      systemFullyFunctional: true,
      deficienciesIdentified: false,
      recommendationsIdentified: false,
      technicianName: "Bob",
      technicianCertificateNumber: "C-9",
      companyName: "Inspectra",
      companyPhone: "555",
      checklists: [
        { sectionNumber: "1", sectionTitle: "Panel", items: [{ id: "a", description: "power", result: "YES", officeNote: "leak" } as any], overallResult: "PASS", comments: "fine", monitoringPassword: "x" } as any,
      ],
      fireAlarmDevices: [{ deviceType: "Smoke", location: "hall", result: "PASS", notes: "ok", techWage: 40 } as any],
      fireExtinguishers: [],
      emergencyLights: [],
      deficiencies: [{ system: "FA", location: "hall", description: "d", jobCostingMargin: 0.3 } as any],
      // top-level pollutant
      panelPasscode: "1234",
    } as unknown as ComplianceReportData;
    const safe = buildCustomerSafeComplianceData(input);
    expect(findProhibitedFields(safe)).toEqual([]);
    expect(safe.workOrderNumber).toBe("WO-1");
    expect(safe.checklists[0].items[0].description).toBe("power");
    expect(safe.fireAlarmDevices[0].notes).toBe("ok");
    expect((safe as Record<string, unknown>).panelPasscode).toBeUndefined();
  });
});

describe("buildCustomerSafeInvoiceData", () => {
  it("strips internal fields and keeps the customer-safe invoice", () => {
    const input = {
      invoiceId: 1,
      invoiceNumber: "INV-1",
      companyName: "Inspectra",
      lineItems: [{ description: "Service", quantity: 1, unitPrice: 100, total: 100, taxable: true, internalCost: 40 } as any],
      subtotal: 100,
      taxRate: 0.05,
      taxAmount: 5,
      total: 105,
      amountPaid: 0,
      balanceDue: 105,
      clientNotes: "thanks",
      internalMargin: 0.6,
      payrollBatchId: "P-1",
    } as unknown as InvoicePdfData;
    const safe = buildCustomerSafeInvoiceData(input);
    expect(findProhibitedFields(safe)).toEqual([]);
    expect(safe.total).toBe(105);
    expect(safe.lineItems[0].total).toBe(100);
    expect((safe.lineItems[0] as Record<string, unknown>).internalCost).toBeUndefined();
    expect((safe as Record<string, unknown>).internalMargin).toBeUndefined();
  });
});

describe("buildCustomerSafeQuoteData", () => {
  it("strips internal fields on the deficiency quote", () => {
    const input = {
      quoteId: 1,
      jobNumber: "J-1",
      siteName: "Site",
      siteAddress: "1 Main",
      customerName: "Acme",
      companyName: "Inspectra",
      createdAt: new Date(),
      lineItems: [{ deficiencyId: 1, description: "Fix", unitPrice: 50, qty: 2, costingMargin: 0.4 } as any],
      total: 100,
      acceptUrl: "https://x/accept",
      deficiencySummaries: [{ title: "t", severity: "high", description: "d", location: "hall", internalNotes: "chase AR" } as any],
      hourlyRate: 30,
    } as unknown as QuoteReportData;
    const safe = buildCustomerSafeQuoteData(input);
    expect(findProhibitedFields(safe)).toEqual([]);
    expect(safe.lineItems[0].unitPrice).toBe(50);
    expect(safe.deficiencySummaries?.[0].title).toBe("t");
    expect((safe as Record<string, unknown>).hourlyRate).toBeUndefined();
  });
});

describe("buildCustomerSafeRepairQuoteData", () => {
  it("keeps billed labour rates but strips internal-only fields", () => {
    const input = {
      quoteId: 1,
      quoteNumber: "RQ-1",
      companyName: "Inspectra",
      customerName: "Acme",
      siteName: "Site",
      jobNumber: "J-1",
      createdAt: new Date(),
      items: [{
        description: "Repair", quantity: 1, partUnitPrice: 20, partTotal: 20,
        techHours: 2, fitterHours: 1, techLabourRate: 95, fitterLabourRate: 85,
        labourTotal: 275, fuelCharge: 10, backflowReportFee: 0, gst: 5, pst: 0, total: 315,
        internalCost: 120, // prohibited
      } as any],
      subtotal: 300,
      gst: 15,
      pst: 0,
      total: 315,
      marginPct: 0.5, // prohibited
    } as unknown as RepairQuoteReportData;
    const safe = buildCustomerSafeRepairQuoteData(input);
    expect(findProhibitedFields(safe)).toEqual([]);
    // Billed (customer-facing) labour rates ARE preserved — they're on the quote.
    expect(safe.items[0].techLabourRate).toBe(95);
    expect(safe.items[0].labourTotal).toBe(275);
    expect((safe.items[0] as Record<string, unknown>).internalCost).toBeUndefined();
    expect((safe as Record<string, unknown>).marginPct).toBeUndefined();
  });
});

describe("buildCustomerSafeBuildingQuoteData", () => {
  it("strips internal fields on the building quote", () => {
    const input = {
      quoteId: 1,
      companyName: "Inspectra",
      createdAt: new Date(),
      serviceLines: [{ description: "Service", qty: 1, unitPrice: 100, lineNotes: "n", costBasis: 40 } as any],
      labourLines: [{ labourType: "Tech", hours: 2, rate: 95, lineNotes: "n", payrollCode: "PR-9" } as any],
      servicesSubtotal: 100,
      labourSubtotal: 190,
      subtotal: 290,
      discount: 0,
      discountAmount: 0,
      total: 290,
      comments: "thanks",
    } as unknown as BuildingQuoteReportData;
    const safe = buildCustomerSafeBuildingQuoteData(input);
    expect(findProhibitedFields(safe)).toEqual([]);
    expect(safe.labourLines[0].rate).toBe(95);
    expect((safe.labourLines[0] as Record<string, unknown>).payrollCode).toBeUndefined();
    expect((safe.serviceLines[0] as Record<string, unknown>).costBasis).toBeUndefined();
  });
});
