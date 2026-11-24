import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getDb } from "./db";
import { verifyAuditRequiredSchema } from "./requiredSchema";
vi.mock("./db", () => ({ getDb: vi.fn() }));
const execute = vi.fn();
const definer = "fixture_guard@localhost";
const mode = "STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION";
const guards = [
  ["inspectra_payment_insert_v2", "invoice_payments", "INSERT", "3f166278cfcb28bf38f565100ba4901b12504b218c111b4a825f998d73063acd"],
  ["inspectra_payment_no_update", "invoice_payments", "UPDATE", "58aa2ba4dc5668f4e19c0a04855c4b7b9868bceae64eb2c94cb7a609ea8ac21c"],
  ["inspectra_payment_no_delete", "invoice_payments", "DELETE", "58aa2ba4dc5668f4e19c0a04855c4b7b9868bceae64eb2c94cb7a609ea8ac21c"],
  ["inspectra_invoice_payment_v2", "invoices", "UPDATE", "65d8daa0fbaaa0103ce867d4c28d309d80b5ed674814b06c96a5a8e071a94ff9"],
].map(([trigger_name, object_table, event_type, body_hash]) => ({
  trigger_name, object_table, event_type, body_hash,
  action_timing: "BEFORE", action_order: 1, creation_mode: mode,
  guard_definer: definer, attestor_definer: definer, client_charset: "utf8mb4",
  connection_collation: "utf8mb4_0900_ai_ci", database_collation: "utf8mb4_0900_ai_ci",
}));
const taxShape = [{ dataType: "json", isNullable: "YES", columnDefault: null, extra: "" }];
function prerequisites() {
  for (let i = 0; i < 6; i++) execute.mockResolvedValueOnce([[], []]);
}
beforeEach(() => vi.stubEnv("INSPECTRA_PAYMENT_GUARD_DEFINER", definer));
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockResolvedValue({ execute } as any);
  execute.mockResolvedValue([[], []]);
});
it("checks required authentication, capture, schedule, receipt and outbox columns", async () => {
  for (let i = 0; i < 6; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[guards, { affectedRows: 0 }], []]);
  execute.mockResolvedValueOnce([taxShape, []]);
  await verifyAuditRequiredSchema();
  expect(execute).toHaveBeenCalledTimes(8);
});
it("missing required migrations fail closed before serving requests", async () => {
  execute.mockRejectedValueOnce(new Error("Unknown column sessionVersion"));
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    "Required schema preflight failed for users.sessionVersion"
  );
  expect(execute).toHaveBeenCalledTimes(1);
});
it("unreviewed legacy snapshots are a release blocker", async () => {
  for (let i = 0; i < 5; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[{ id: 1 }], []]);
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /Legacy fire-alarm snapshots/
  );
});

it("missing payment protocol guards block startup", async () => {
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /protocol v2 migration guards/
  );
});

it("reproduces the Railway missing calendar migration and identifies its prerequisite without driver payloads", async () => {
  const privateDetail =
    "mysql://private-user:private-password@private-host/private-db";
  const driverError = Object.assign(
    new Error(`Unknown column googleCalendarOwnerId; ${privateDetail}`),
    {
      code: "ER_BAD_FIELD_ERROR",
      errno: 1054,
      sqlState: "42S22",
      sql: `SELECT secret FROM private_table WHERE credential = '${privateDetail}'`,
      parameters: [privateDetail],
      connection: { uri: privateDetail },
    }
  );
  execute.mockImplementation(async query => {
    if (
      new MySqlDialect().sqlToQuery(query).sql.includes("googleCalendarOwnerId")
    )
      throw Object.assign(
        new Error(`Failed query with params ${privateDetail}`),
        { cause: driverError }
      );
    return [[], []];
  });
  const error = await verifyAuditRequiredSchema().catch(error => error);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toMatch(/jobs.googleCalendarOwnerId\/googleCalendarId/);
  expect(error.message).toMatch(/manual migration 0086; journal 0036/);
  expect(error.message).toMatch(/startup does not apply migrations/);
  expect(error.message).toMatch(/docs\/runbooks\/PR18_RELEASE_SAFETY.md/);
  expect(error.cause).toMatchObject({
    code: "ER_BAD_FIELD_ERROR",
    errno: 1054,
    sqlState: "42S22",
  });
  expect(error.cause).not.toBe(driverError);
  expect(inspect(error, { depth: 10 })).not.toMatch(
    /private-user|private-password|private-host|private-db|SELECT secret|parameters|connection:/
  );
  expect(execute).toHaveBeenCalledTimes(3);
});

it("keeps transient database failures distinct from missing columns and does not continue preflight", async () => {
  execute.mockRejectedValueOnce(
    Object.assign(new Error("private endpoint refused"), {
      code: "ECONNREFUSED",
    })
  );
  const error = await verifyAuditRequiredSchema().catch(error => error);
  expect(error.message).toMatch(/users.sessionVersion/);
  expect(error.message).toMatch(/Verify database access/);
  expect(error.cause).toMatchObject({ code: "ECONNREFUSED" });
  expect(inspect(error)).not.toContain("private endpoint");
  expect(execute).toHaveBeenCalledTimes(1);
});

it("labels inaccessible trigger metadata and blocks startup without exposing database errors", async () => {
  for (let i = 0; i < 6; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockRejectedValueOnce(
    Object.assign(new Error("secret trigger metadata error"), {
      code: "ER_TABLEACCESS_DENIED_ERROR",
    })
  );
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /live payment protocol v2 guard attestation/
  );
  expect(execute).toHaveBeenCalledTimes(7);
});

it("missing or failed database construction remains a labeled release blocker", async () => {
  vi.mocked(getDb).mockResolvedValueOnce(null);
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /database connection unavailable/
  );
  vi.mocked(getDb).mockRejectedValueOnce(
    Object.assign(new Error("private connection config"), { code: "ENOTFOUND" })
  );
  const error = await verifyAuditRequiredSchema().catch(error => error);
  expect(error.message).toMatch(/preflight failed for database connection/);
  expect(error.cause).toMatchObject({ code: "ENOTFOUND" });
  expect(inspect(error)).not.toContain("private connection config");
  expect(execute).not.toHaveBeenCalled();
});

it("preflight uses bounded SELECTs and only the reviewed no-argument attestation after all prerequisites succeed", async () => {
  for (let i = 0; i < 6; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[guards, { affectedRows: 0 }], []]);
  execute.mockResolvedValueOnce([taxShape, []]);
  await verifyAuditRequiredSchema();
  const queries = execute.mock.calls.map(
    ([query]) => new MySqlDialect().sqlToQuery(query).sql
  );
  expect(queries).toHaveLength(8);
  expect(queries.slice(0, 6).every(query => /^SELECT\b/.test(query))).toBe(true);
  expect(queries[6]).toBe("CALL inspectra_attest_payment_guards_v1()");
  expect(queries[7]).toMatch(/^SELECT DATA_TYPE.*information_schema\.COLUMNS/s);
});


it("fails closed when a previous pass is followed by live guard drift", async () => {
  prerequisites();
  execute.mockResolvedValueOnce([[guards, { affectedRows: 0 }], []]);
  execute.mockResolvedValueOnce([taxShape, []]);
  await expect(verifyAuditRequiredSchema()).resolves.toBeUndefined();
  prerequisites();
  const drifted = guards.map((guard, i) => i === 1 ? { ...guard, body_hash: "changed" } : guard);
  execute.mockResolvedValueOnce([[drifted, { affectedRows: 0 }], []]);
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(/Exact payment protocol v2 migration guards/);
});

it("fails closed for exact guards if the expected definer is missing", async () => {
  vi.stubEnv("INSPECTRA_PAYMENT_GUARD_DEFINER", undefined);
  prerequisites();
  execute.mockResolvedValueOnce([[guards, { affectedRows: 0 }], []]);
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(/Exact payment protocol v2 migration guards/);
});


it.each([
  { rows: [] },
  { rows: [{ ...taxShape[0], dataType: "varchar" }] },
  { rows: [{ ...taxShape[0], isNullable: "NO" }] },
  { rows: [{ ...taxShape[0], columnDefault: "(json_object())", extra: "DEFAULT_GENERATED" }] },
  { rows: [{ ...taxShape[0], extra: "VIRTUAL GENERATED" }] },
])("stops on missing or non-exact invoice tax storage: %j", async ({ rows }) => {
  prerequisites();
  execute.mockResolvedValueOnce([[guards, { affectedRows: 0 }], []]);
  execute.mockResolvedValueOnce([rows, []]);
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(/invoices.confirmedTax/);
});
