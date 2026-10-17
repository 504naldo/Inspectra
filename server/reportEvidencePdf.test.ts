import parsePdf from "pdf-parse/lib/pdf-parse.js";
import { expect, it } from "vitest";
import { buildCanonicalFireAlarmChecklist } from "./canonicalFireAlarmReport";
import { buildRecordedReportFacts } from "./recordedReportFacts";
import { generateComplianceReportPDF, type ComplianceReportData } from "./pdfGeneratorCompliance";

it("prints captured questions and unknown facts without invented system or certification declarations", async () => {
  const facts = buildRecordedReportFacts(null, []);
  const data: ComplianceReportData = {
    workOrderNumber: "CAPTURE-1", dateOfService: new Date("2026-10-16T12:00:00Z"), inspectionFrequency: "Annual",
    contactPerson: "Recorded contact", contactPhone: "", buildingName: "Recorded building", buildingAddress: "Recorded address", city: "Recorded city",
    systemsInspected: { fireAlarmSystem: true, commonAreaDevices: false, inSuiteDevices: false, sprinklerSystem: false, fireExtinguishers: true, emergencyLighting: true, hydrant: false, winterization: false, generator: false, backflow: false, monitoring: false, smokeControl: false, suppressionSystems: false, standpipe: false, kitchen: false },
    ...facts, deficienciesIdentified: false, companyName: "Recorded company", companyPhone: "",
    checklists: buildCanonicalFireAlarmChecklist([{ checklistItemId: 1, result: "pass", notes: "Captured answer note", itemSnapshot: { sectionName: "Original section", sectionOrder: 1, itemLetter: "A", itemDescription: "Original captured wording", inputType: "checkbox", requirementType: "test", isRequired: true, standardVersion: "2019" } }] as any),
    fireAlarmDevices: [{ deviceType: "Smoke detector", location: "Untested location", result: "NOT TESTED" }],
    fireExtinguishers: [{ location: "Not applicable location", type: "Recorded type", result: "N/A" }],
    emergencyLights: [{ location: "Untested light", functionalTest: "NOT TESTED" }], deficiencies: [],
  };
  const { text } = await parsePdf(await generateComplianceReportPDF(data));
  const normalized = text.replace(/\s+/g, " ");
  expect(normalized).toContain("Original captured wording");
  expect(normalized).toContain("standard 2019");
  expect(normalized).toContain("Captured answer note");
  expect(normalized).toContain("System functionality not recorded");
  expect(normalized).toContain("Not recorded");
  expect(normalized).toContain("NOT TESTED");
  expect(normalized).not.toMatch(/EDWARDS|BARTEC|604-299|info@ewf.ca|ASTTBC|in conformance with|qualified technician|left in an operational condition|PASS - System Fully Functional/);
});
