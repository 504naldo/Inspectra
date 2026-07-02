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
import { buildCustomerSafeReportData, findProhibitedFields, PROHIBITED_KEY_PATTERNS } from "./customerSafeReport";
import type { ReportData } from "./pdfGeneratorFirePro";

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
