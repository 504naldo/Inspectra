import { expect, it } from "vitest";
import { buildRecordedReportFacts, recordedDeviceOutcome, recordedInspectionDate, recordedInspectionFrequency } from "./recordedReportFacts";

it("missing report facts never become sample panel, monitoring or credential claims", () => {
  const facts = buildRecordedReportFacts(null, []);
  expect(facts).toMatchObject({ systemModel: "Not recorded", technicianName: "Not recorded", technicianCertificateNumber: "" });
  expect(facts.systemOperation).toBeUndefined();
  expect(facts.connectedToFireSignalReceivingCentre).toBeUndefined();
  expect(facts.systemFullyFunctional).toBeUndefined();
  expect(facts.recommendationsIdentified).toBeUndefined();
  expect(JSON.stringify(facts)).not.toMatch(/EDWARDS|BARTEC|Single Stage|604-299|Fire Alarm Technician/);
});
it("uses the recorded job form and captured technician credentials", () => {
  const rows = [{ testedById: 7, technicianCertificationSnapshot: { name: "Recorded Tech", certNumber: "REC-1", certificationLevel: "Captured level" } }];
  expect(buildRecordedReportFacts({ systemModel: "Captured panel", operationType: "Two Stage", connectedToFSRC: true, fsrcName: "Captured centre", recommendations: "Recorded recommendation" }, rows, 7))
    .toMatchObject({ systemModel: "Captured panel", systemOperation: "Two Stage", fireSignalReceivingCentre: "Captured centre", connectedToFireSignalReceivingCentre: true, recommendationsIdentified: true, technicianName: "Recorded Tech", technicianCertificateNumber: "REC-1", technicianTitle: "Captured level" });
});
it("does not substitute a different technician's captured credentials", () => {
  expect(buildRecordedReportFacts(null, [{ technicianId: 8, technicianCertificationSnapshot: { name: "Different tech", certNumber: "OTHER" } }], 7))
    .toMatchObject({ technicianName: "Not recorded", technicianCertificateNumber: "" });
});
it("conflicting captured credentials remain unresolved instead of picking an arbitrary version", () => {
  const rows = ["FIRST", "SECOND"].map(certNumber => ({ technicianId: 7, technicianCertificationSnapshot: { name: "Same tech", certNumber } }));
  expect(buildRecordedReportFacts(null, rows, 7).technicianCertificateNumber).toBe("");
  expect(buildRecordedReportFacts({ techName: "Signed form", techCertNo: "FORM-CAPTURE" }, rows, 7).technicianCertificateNumber).toBe("FORM-CAPTURE");
});
it("legacy false/default flags do not fabricate an explicit negative observation", () => {
  expect(buildRecordedReportFacts({ connectedToFSRC: false }, []).connectedToFireSignalReceivingCentre).toBeUndefined();
});
it("an explicit recorded No stays distinct from a legacy default", () => {
  expect(buildRecordedReportFacts({ connectedToFSRC: false, sectionHeaderValues: { _inspection_capture: { connectedToFSRC: "false" } } }, []).connectedToFireSignalReceivingCentre).toBe(false);
});
it("does not combine one technician's recorded name with another's credential", () => {
  const row = { testedById: 7, technicianCertificationSnapshot: { name: "Other technician", certNumber: "OTHER" } };
  expect(buildRecordedReportFacts({ techName: "Form technician" }, [row], 7)).toMatchObject({ technicianName: "Form technician", technicianCertificateNumber: "" });
});
it.each([["pass", "PASS"], ["fail", "DEFICIENT"], ["na", "N/A"], ["not_tested", "NOT TESTED"]])("preserves recorded device outcome %s", (result, output) => {
  expect(recordedDeviceOutcome(result)).toBe(output);
});

it("keeps an absent inspection date unknown instead of substituting scheduled/current dates", () => {
  expect(buildRecordedReportFacts(null, []).inspectionDate).toBeNull();
  expect(buildRecordedReportFacts({ inspectionDate: new Date("2020-01-02T00:00:00Z") }, []).inspectionDate?.toISOString()).toBe("2020-01-02T00:00:00.000Z");
  expect(recordedInspectionDate("2020-01-02")?.toISOString()).toBe("2020-01-02T00:00:00.000Z");
  expect(recordedInspectionDate("2026-02-30")).toBeNull();
  expect(recordedInspectionDate(new Date("invalid"))).toBeNull();
});
it.each([["annual", "Annual"], ["semi_annual", "Semi-annual"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["repair", "Repair"], ["service_call", "Service"], ["unknown", undefined]])("maps the configured job type %s without inventing an annual inspection", (jobType, frequency) => {
  expect(recordedInspectionFrequency(jobType!)).toBe(frequency);
});
