import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import {
  buildFinalizationPayload, computeFinalizationHash,
  legacyDeficiencyColumns, legacyInspectionResultColumns,
} from "./compliance/hash";

// This retained schema predates device snapshots. It is independent evidence
// of the columns/properties whose bytes existing version-1 seals included.
const beforeMigration = JSON.parse(readFileSync(new URL("../drizzle/meta/0039_snapshot.json", import.meta.url), "utf8"));
function oldProperties(table: string): string[] {
  return Object.keys(beforeMigration.tables[table].columns).map(name => name === "carried_forward" ? "carriedForward" : name);
}
const inspectionKeys = oldProperties("inspection_results");
const deficiencyKeys = oldProperties("deficiencies");
const at = new Date("2026-10-16T12:00:00Z");
let rows: Record<string, Record<string, any>[]>;
let projected: Record<string, string[][]>;
const database = {
  select: (fields?: Record<string, unknown>) => ({ from: (table: any) => ({ where: async () => {
    const name = getTableName(table);
    (projected[name] ??= []).push(fields ? Object.keys(fields) : []);
    return (rows[name] ?? []).map(row => fields
      ? Object.fromEntries(Object.keys(fields).map(key => [key, structuredClone(row[key])]))
      : structuredClone(row));
  } }) }),
} as any;

beforeEach(() => {
  projected = {};
  rows = {
    jobs: [{ id: 1, companyId: 7, jobNumber: "CAPTURE-1", siteId: 20, customerOrgId: 30, leadTechnicianId: 4, jobType: "annual",
      title: "Captured inspection", description: null, notes: null, technicianNotes: null, officeNotes: null,
      techSignatureUrl: null, contactSignatureUrl: null, contactName: null, techSignedAt: null, contactSignedAt: null }],
    inspection_results: [{ ...Object.fromEntries(inspectionKeys.map(key => [key, null])),
      id: 101, jobId: 1, deviceId: 41, technicianId: 4, result: "fail", notes: "Original recorded test", carriedForward: 1,
      companyId: 7, createdAt: at, updatedAt: at, deviceSnapshot: null }],
    deficiencies: [{ ...Object.fromEntries(deficiencyKeys.map(key => [key, null])),
      id: 201, jobId: 1, deviceId: 41, inspectionResultId: 101, reportedById: 4, status: "open", severity: "major",
      title: "Original captured fault", createdAt: at, updatedAt: at, deviceSnapshot: null }],
  };
});

describe("Device snapshot migration and existing finalization seals", () => {
  it("freezes the exact pre-migration field sets for both affected tables", () => {
    expect(inspectionKeys).not.toContain("deviceSnapshot"); expect(deficiencyKeys).not.toContain("deviceSnapshot");
    expect(Object.keys(legacyInspectionResultColumns).sort()).toEqual([...inspectionKeys].sort());
    expect(Object.keys(legacyDeficiencyColumns).sort()).toEqual([...deficiencyKeys].sort());
    for (const column of [...Object.values(legacyInspectionResultColumns), ...Object.values(legacyDeficiencyColumns)]) expect(column).toBeDefined();
  });

  it("retains the TypeScript carriedForward property for SQL carried_forward", async () => {
    expect(legacyInspectionResultColumns.carriedForward).toBe(schema.inspectionResults.carriedForward);
    expect(legacyInspectionResultColumns.carriedForward.name).toBe("carried_forward");
    const payload = await buildFinalizationPayload(1, database, 1);
    expect(payload.inspectionResults[0]).toHaveProperty("carriedForward", 1);
    expect(payload.inspectionResults[0]).not.toHaveProperty("carried_forward");
  });

  it("keeps version-1 payload/hash identical after nullable snapshot columns are populated", async () => {
    const before = await buildFinalizationPayload(1, database, 1);
    const original = computeFinalizationHash(before);
    rows.inspection_results[0].deviceSnapshot = { version: 1, deviceType: "Smoke Detector", serialNumber: "Captured serial" };
    rows.deficiencies[0].deviceSnapshot = { version: 1, deviceType: "Smoke Detector", location: "Captured location" };
    const after = await buildFinalizationPayload(1, database, 1);
    expect(after).toEqual(before); expect(computeFinalizationHash(after)).toBe(original);
    expect(after.inspectionResults[0]).not.toHaveProperty("deviceSnapshot");
    expect(after.deficiencies[0]).not.toHaveProperty("deviceSnapshot");
    expect(projected.inspection_results.every(keys => !keys.includes("deviceSnapshot"))).toBe(true);
    expect(projected.deficiencies.every(keys => !keys.includes("deviceSnapshot"))).toBe(true);
  });

  it.each(["inspection_results", "deficiencies"])("version 2 detects changes to %s.deviceSnapshot", async table => {
    rows[table][0].deviceSnapshot = { version: 1, deviceType: "Smoke Detector", location: "Original capture" };
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 2));
    rows[table][0].deviceSnapshot.location = "Tampered capture";
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 2))).not.toBe(original);
    expect(projected[table].every(keys => keys.includes("deviceSnapshot"))).toBe(true);
  });

  it("keeps existing version-1 hashes stable whether new nullable columns are absent or null", async () => {
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 1));
    delete rows.inspection_results[0].deviceSnapshot; delete rows.deficiencies[0].deviceSnapshot;
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 1))).toBe(original);
  });
});
