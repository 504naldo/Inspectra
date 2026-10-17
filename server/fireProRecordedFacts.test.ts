import parsePdf from "pdf-parse/lib/pdf-parse.js";
import { expect, it } from "vitest";
import { generateInspectionReportPDF, type ReportData } from "./pdfGeneratorFirePro";

it("a service report preserves an unknown date and avoids unsupported certification and full-system claims", async () => {
  const data: ReportData = {
    jobNumber: "SERVICE-CAPTURE", jobTitle: "Service visit", siteName: "Recorded building",
    siteAddress: "Recorded address", siteCity: "Recorded city", siteState: "BC",
    customerName: "Recorded customer", inspectionDate: null,
    technicianName: "Not recorded", technicianCertNumber: "", companyName: "Recorded company",
    deviceSummaries: [], deficiencies: [], inspectionResults: [],
  };
  const { text } = await parsePdf(await generateInspectionReportPDF(data));
  const normalized = text.replace(/\s+/g, " ");
  expect(normalized).toContain("Service Date: Not recorded");
  expect(normalized).toContain("No deficiencies are recorded in this report");
  expect(normalized).toContain("scope and outcomes are limited to the captured records");
  expect(normalized).toContain("Certification not recorded");
  expect(normalized).not.toMatch(/ASTTBC|our certified technician|conducted the annual|all systems and devices inspected were found|All inspected systems and devices are operating within normal parameters|All required documentation has been completed|in accordance with CAN\/ULC S536:2019/);
});

it("prints a captured CFAA credential as recorded without generating an ASTTBC professional seal", async () => {
  const data: ReportData = {
    jobNumber: "CAPTURED-CREDENTIAL", jobTitle: "Service visit", siteName: "Recorded building",
    siteAddress: "Recorded address", siteCity: "Recorded city", siteState: "BC",
    customerName: "Recorded customer", inspectionDate: null,
    technicianName: "Recorded technician", technicianCertNumber: "CFAA-12345", companyName: "Recorded company",
    deviceSummaries: [{ deviceType: "Smoke detector", total: 1, passed: 0, failed: 0, na: 0 }], deficiencies: [], inspectionResults: [],
  };
  const { text } = await parsePdf(await generateInspectionReportPDF(data));
  const normalized = text.replace(/\s+/g, " ");
  expect(normalized).toContain("CFAA-12345");
  expect(normalized).toContain("Not tested");
  expect(normalized).not.toContain("ASTTBC");
});

it("an undated deficiency report does not invent a quotation validity date", async () => {
  const data: ReportData = {
    jobNumber: "SERVICE-DEF", jobTitle: "Service visit", siteName: "Recorded building",
    siteAddress: "Recorded address", siteCity: "Recorded city", siteState: "BC",
    customerName: "Recorded customer", inspectionDate: null, companyName: "Recorded company",
    deviceSummaries: [], inspectionResults: [],
    deficiencies: [{ id: 1, title: "Recorded deficiency", description: "Recorded observation", severity: "major", status: "open", systemCategory: "FIRE_ALARM" }],
  };
  const { text } = await parsePdf(await generateInspectionReportPDF(data));
  expect(text.replace(/\s+/g, " ")).toContain("A quotation validity date has not been recorded");
  expect(text).not.toContain("Invalid Date");
});
