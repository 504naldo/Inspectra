import { beforeEach, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getDb } from "./db";
import { verifyAuditRequiredSchema } from "./requiredSchema";
vi.mock("./db", () => ({ getDb: vi.fn() }));
const execute = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockResolvedValue({ execute } as any);
  execute.mockResolvedValue([[], []]);
});
it("checks required authentication, capture, schedule, receipt and outbox columns", async () => {
  for (let i = 0; i < 10; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[{ guardCount: 6 }], []]);
  await verifyAuditRequiredSchema();
  expect(execute).toHaveBeenCalledTimes(11);
  expect(execute.mock.calls.some(([query]) => new MySqlDialect().sqlToQuery(query).sql.includes("tech_signature_key, contact_signature_key"))).toBe(true);
});
it("missing required migrations fail closed before serving requests", async () => {
  execute.mockRejectedValueOnce(new Error("Unknown column sessionVersion"));
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    "Required schema preflight failed for users.sessionVersion"
  );
  expect(execute).toHaveBeenCalledTimes(1);
});
it("unreviewed legacy snapshots are a release blocker", async () => {
  for (let i = 0; i < 9; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[{ id: 1 }], []]);
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /Legacy fire-alarm snapshots/
  );
});

it("missing payment protocol guards block startup", async () => {
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /protocol v2 and invoice-state migration guards/
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
  expect(error.message).toMatch(
    /jobs.googleCalendarOwnerId\/googleCalendarId\/finalizationHashVersion/
  );
  expect(error.message).toMatch(
    /manual migrations 0086\/0089; journal 0036\/0039/
  );
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
  expect(execute).toHaveBeenCalledTimes(6);
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
  for (let i = 0; i < 10; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockRejectedValueOnce(
    Object.assign(new Error("secret trigger metadata error"), {
      code: "ER_TABLEACCESS_DENIED_ERROR",
    })
  );
  await expect(verifyAuditRequiredSchema()).rejects.toThrow(
    /payment protocol v2 and invoice-state trigger metadata/
  );
  expect(execute).toHaveBeenCalledTimes(11);
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

it("preflight executes only read queries after all prerequisites succeed", async () => {
  for (let i = 0; i < 10; i++) execute.mockResolvedValueOnce([[], []]);
  execute.mockResolvedValueOnce([[{ guardCount: 6 }], []]);
  await verifyAuditRequiredSchema();
  const queries = execute.mock.calls.map(
    ([query]) => new MySqlDialect().sqlToQuery(query).sql
  );
  expect(queries).toHaveLength(11);
  expect(queries.every(query => /^SELECT\b/.test(query))).toBe(true);
});
