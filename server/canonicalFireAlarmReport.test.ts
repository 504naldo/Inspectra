import { expect, it } from "vitest";
import { buildCanonicalFireAlarmChecklist } from "./canonicalFireAlarmReport";
import type { FireAlarmInspectionResult } from "../drizzle/schema";
const captured = (patch: Partial<FireAlarmInspectionResult> = {}) =>
  ({
    checklistItemId: 123,
    result: "pass",
    itemSnapshot: {
      sectionName: "Captured wording",
      sectionOrder: 4,
      itemLetter: "A",
      itemDescription: "The actual captured question",
      inputType: "checkbox",
    },
    ...patch,
  }) as FireAlarmInspectionResult;
it("blocks empty legacy-only jobs and missing snapshots", () => {
  expect(() => buildCanonicalFireAlarmChecklist([])).toThrow(
    /Legacy responses/
  );
  expect(() =>
    buildCanonicalFireAlarmChecklist([captured({ itemSnapshot: null })])
  ).toThrow(/snapshot is missing/);
});
it("does not invent a YES for an untested question", () => {
  expect(() =>
    buildCanonicalFireAlarmChecklist([captured({ result: "not_tested" })])
  ).toThrow(/incomplete/);
});
it("uses captured question identity rather than legacy letter mappings or sample panel facts", () => {
  const section = buildCanonicalFireAlarmChecklist([
    captured({ result: "fail" }),
  ])[0];
  expect(section).toMatchObject({
    sectionTitle: "Captured wording",
    overallResult: "DEFICIENT",
    items: [
      { id: "A", description: "The actual captured question", result: "NO" },
    ],
  });
  expect(JSON.stringify(section)).not.toMatch(/LOBBY|EDWARDS|BARTEC|27.33/);
});
it("keeps recorded values separate from passing a checkbox", () => {
  const row = captured({
    result: "not_tested",
    numericValueRaw: "12.55",
    itemSnapshot: {
      sectionName: "Battery",
      sectionOrder: 1,
      itemDescription: "Measured battery voltage",
      inputType: "voltage",
      numericUnit: "V",
    },
  });
  expect(buildCanonicalFireAlarmChecklist([row])[0].items[0]).toMatchObject({
    result: "RECORDED",
    description: "Measured battery voltage — Recorded: 12.55 V",
  });
});
it("an entirely not-applicable section remains not applicable", () => {
  expect(
    buildCanonicalFireAlarmChecklist([captured({ result: "na" })])[0]
      .overallResult
  ).toBe("N/A");
});
