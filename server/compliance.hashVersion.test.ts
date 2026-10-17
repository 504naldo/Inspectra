import { beforeEach, describe, expect, it } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { buildFinalizationPayload, computeFinalizationHash, serializeForHash } from "./compliance/hash";

// Run the actual emitted eq/inArray/and/or/isNull predicates against isolated
// fixture rows. This catches missing entityType filters without a live database.
function predicate(condition: SQL): (row: any) => boolean {
  const query = new MySqlDialect().sqlToQuery(condition);
  const tokens = query.sql.match(/`[^`]+`\.`[^`]+`|[a-z_]+|[()?=,]/gi)!;
  let position = 0, parameter = 0;
  function take(expected: string) {
    if (tokens[position++] !== expected) throw new Error(`Expected ${expected} in ${query.sql}`);
  }
  function atom(): (row: any) => boolean {
    if (tokens[position] === "(") { position++; const result = or(); take(")"); return result; }
    const column = tokens[position++].split("`")[3];
    const operator = tokens[position++];
    if (operator === "=") { take("?"); const value = query.params[parameter++]; return row => row[column] === value; }
    if (operator === "is") { take("null"); return row => row[column] == null; }
    if (operator === "in") {
      take("("); const values: unknown[] = [];
      do { if (tokens[position] === ",") position++; take("?"); values.push(query.params[parameter++]); } while (tokens[position] !== ")");
      take(")"); return row => values.includes(row[column]);
    }
    throw new Error(`Unsupported predicate: ${query.sql}`);
  }
  function and(): (row: any) => boolean {
    let result = atom();
    while (tokens[position] === "and") { position++; const left = result, right = atom(); result = row => left(row) && right(row); }
    return result;
  }
  function or(): (row: any) => boolean {
    let result = and();
    while (tokens[position] === "or") { position++; const left = result, right = and(); result = row => left(row) || right(row); }
    return result;
  }
  const result = or();
  if (position !== tokens.length || parameter !== query.params.length) throw new Error(`Unconsumed predicate: ${query.sql}`);
  return result;
}

let rows: Record<string, any[]>;
let reads: string[];
const database = {
  select: (fields?: Record<string, unknown>) => ({ from: (table: any) => {
    const name = getTableName(table); reads.push(name);
    return { where: async (condition: SQL) => {
      const selected = (rows[name] ?? []).filter(predicate(condition));
      return fields ? selected.map(row => Object.fromEntries(Object.keys(fields).map(key => [key, row[key]]))) : selected;
    } };
  } }),
} as any;
const at = new Date("2026-10-16T12:00:00Z");
const attachment = (id: number, entityType: string, entityId: number, jobId: number | null = null, companyId: number | null = 7) => ({
  id, entityType, entityId, jobId, companyId, fileKey: `photo-${id}`, fileName: `${id}.jpg`,
  fileSize: 100, mimeType: "image/jpeg", createdAt: at, caption: "Original caption",
});

beforeEach(() => {
  reads = [];
  rows = {
    jobs: [{ id: 1, companyId: 7, jobNumber: "J-1", siteId: 10, customerOrgId: 20, leadTechnicianId: 3, jobType: "annual", title: "Inspection", description: null, notes: null, technicianNotes: null, officeNotes: null, techSignatureUrl: "signed-tech", contactSignatureUrl: "signed-contact", contactName: "Contact", techSignedAt: at, contactSignedAt: at }],
    inspection_results: [{ id: 101, jobId: 1, notes: "Inspection" }],
    fire_alarm_inspection_results: [{ id: 201, jobId: 1, itemSnapshot: { wording: "Captured fire question" } }],
    deficiencies: [{ id: 301, jobId: 1, title: "Fault" }],
    repairs: [{ id: 401, deficiencyId: 301, notes: "Repair" }],
    attachments: [attachment(501, "job", 1, 1), attachment(502, "device", 301), attachment(503, "deficiency", 301, null, 8)],
    inspection_template_responses: [{ id: 601, jobId: 1, itemSnapshot: { wording: "Captured template question" }, responseValue: "pass" }],
    inspection_checklist_responses: [{ id: 701, jobId: 1, status: "PASS" }],
    fire_alarm_form_header: [{ id: 801, jobId: 1, systemManufacturer: "Original manufacturer" }],
    fire_alarm_attendance_log: [{ id: 901, jobId: 1, techName: "Original technician" }],
    fire_alarm_ancillary_circuits: [{ id: 1001, jobId: 1, operationConfirmed: "yes" }],
    sprinkler_inspections: [{ id: 1101, jobId: 1, inspectionDate: at }, { id: 1102, jobId: 2 }],
    sprinkler_systems: [{ id: 1201, inspectionId: 1101, systemWaterPressure: 40 }, { id: 1202, inspectionId: 1102 }],
    sprinkler_checklist_items: [{ id: 1301, inspectionId: 1101, response: "YES" }],
    sprinkler_devices: [{ id: 1401, inspectionId: 1101, location: "Original location" }],
  };
});

describe("Versioned job finalization hashes", () => {
  it("preserves the exact historical v1 selection and serialization by default", async () => {
    const payload = await buildFinalizationPayload(1, database);
    expect(payload.attachments.map(row => row.id)).toEqual([501, 502, 503]);
    expect(Object.keys(payload)).toEqual(["job", "inspectionResults", "fireAlarmInspectionResults", "deficiencies", "repairs", "attachments"]);
    expect(Object.keys(payload.job)).toEqual(["id", "jobNumber", "siteId", "customerOrgId", "leadTechnicianId", "jobType"]);
    // Pinned from the historical field set/serializer, including its old ID-collision selection.
    expect(computeFinalizationHash(payload)).toBe("0be1449af2747e492ecf49695219ca2ecc145a714b80f54d34702477d2cc01b2");
    expect(serializeForHash(payload)).not.toContain("Original caption");
    expect(reads).not.toContain("inspection_template_responses");
  });

  it("keeps old hashes stable when fields introduced in v2 change", async () => {
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 1));
    rows.inspection_template_responses[0].responseValue = "fail";
    rows.jobs[0].techSignatureUrl = "replacement";
    rows.fire_alarm_form_header[0].systemManufacturer = "Replacement manufacturer";
    rows.sprinkler_devices[0].location = "Replacement location";
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 1))).toBe(original);
  });

  it("v2 excludes entity ID collisions and foreign-company links while including canonical parents", async () => {
    rows.attachments.push(attachment(504, "deficiency", 301), attachment(505, "repair", 401), attachment(506, "inspection_result", 101), attachment(507, "job", 1), attachment(508, "repair", 401, 2));
    const payload = await buildFinalizationPayload(1, database, 2);
    expect(payload.attachments.map(row => row.id).sort()).toEqual([501, 504, 505, 506, 507]);
    expect(payload).toMatchObject({ payloadVersion: 2, job: { companyId: 7, techSignatureUrl: "signed-tech" }, sprinklerSystems: [{ id: 1201 }] });
  });

  it.each([
    ["jobs", "techSignatureUrl"], ["jobs", "contactSignatureUrl"], ["jobs", "contactName"],
    ["inspection_template_responses", "responseValue"], ["inspection_template_responses", "itemSnapshot"],
    ["inspection_checklist_responses", "status"], ["fire_alarm_form_header", "systemManufacturer"],
    ["fire_alarm_attendance_log", "techName"], ["fire_alarm_ancillary_circuits", "operationConfirmed"],
    ["sprinkler_inspections", "inspectionDate"], ["sprinkler_systems", "systemWaterPressure"],
    ["sprinkler_checklist_items", "response"], ["sprinkler_devices", "location"], ["attachments", "caption"],
  ])("v2 detects changes to %s.%s", async (table, field) => {
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 2));
    rows[table][0][field] = "Tampered evidence";
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 2))).not.toBe(original);
  });

  it("v2 includes empty evidence collections so new post-seal rows change the hash", async () => {
    rows.inspection_template_responses = [];
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 2));
    rows.inspection_template_responses.push({ id: 602, jobId: 1, responseValue: "pass" });
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 2))).not.toBe(original);
  });

  it.each(["fire_alarm_inspection_results", "inspection_template_responses"])("v2 detects the displayed order of nested captured %s entries", async table => {
    rows[table][0].itemSnapshot = { wording: "Original question", options: [{ id: 1, text: "First" }, { id: 2, text: "Second" }], subItems: [{ id: 3, text: "First sub-item" }, { id: 4, text: "Second sub-item" }] };
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 2));
    rows[table][0].itemSnapshot.options.reverse();
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 2))).not.toBe(original);
    rows[table][0].itemSnapshot.options.reverse();
    rows[table][0].itemSnapshot.subItems.reverse();
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 2))).not.toBe(original);
  });

  it("v2 ignores the database ordering of every top-level evidence collection", async () => {
    for (const [table, evidence] of Object.entries(rows)) {
      if (table === "jobs" || !evidence.length) continue;
      evidence.push({ ...structuredClone(evidence[0]), id: evidence[0].id + 10000 });
    }
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 2));
    for (const [table, evidence] of Object.entries(rows)) if (table !== "jobs") evidence.reverse();
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 2))).toBe(original);
  });

  it("retains v1's historical recursive nested-id sorting for existing seals", async () => {
    rows.fire_alarm_inspection_results[0].itemSnapshot = { subItems: [{ id: 1, text: "First" }, { id: 2, text: "Second" }] };
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 1));
    rows.fire_alarm_inspection_results[0].itemSnapshot.subItems.reverse();
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 1))).toBe(original);
  });

  it("does not include sprinkler evidence belonging to a different job", async () => {
    const original = computeFinalizationHash(await buildFinalizationPayload(1, database, 2));
    rows.sprinkler_systems[1].systemWaterPressure = 999;
    expect(computeFinalizationHash(await buildFinalizationPayload(1, database, 2))).toBe(original);
  });

  it("rejects unknown versions before building an ambiguous payload", async () => {
    await expect(buildFinalizationPayload(1, database, 3)).rejects.toThrow(/Unsupported finalization hash version/);
    expect(reads).toEqual([]);
  });
});
