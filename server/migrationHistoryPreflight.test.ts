import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createConnection: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  end: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: { createConnection: mocks.createConnection },
}));
vi.mock("fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readdirSync: mocks.readdirSync,
  },
}));

import { runMigrations } from "./runMigrations";

const databaseUrl = "mysql://fixture@localhost/inspectra_preflight_fixture";
const pending = "0086_audit_receipts_outbox_calendar.sql";

describe("read-only migration history classification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createConnection.mockResolvedValue({
      query: mocks.query,
      execute: mocks.execute,
      end: mocks.end,
    });
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([pending, "RAILWAY_CATCHUP.sql"]);
  });

  afterEach(() => {
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledOnce();
    // Startup must never create a ledger, apply DDL or record a migration.
    for (const [statement] of mocks.query.mock.calls)
      expect(statement).toMatch(/^(SHOW|SELECT) /);
    vi.restoreAllMocks();
  });

  it("rejects pending manual history when an empty journal table exists", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ table: "__drizzle_migrations" }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ migration_name: "0085_job_schedule_times_scope.sql" }]]);

    await expect(runMigrations({ databaseUrl })).rejects.toThrow(
      `Explicit maintenance required; startup will not apply pending migrations: ${pending}`
    );
    expect(mocks.query.mock.calls.map(([sql]) => sql)).toEqual([
      "SHOW TABLES LIKE '__drizzle_migrations'",
      "SELECT 1 FROM __drizzle_migrations LIMIT 1",
      "SELECT migration_name FROM __schema_migrations",
    ]);
  });

  it("accepts complete manual history even with an empty journal table", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ table: "__drizzle_migrations" }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ migration_name: pending }]]);
    await expect(runMigrations({ databaseUrl })).resolves.toBeUndefined();
  });

  it("preserves the existing populated-journal route to required-schema checks", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ table: "__drizzle_migrations" }]])
      .mockResolvedValueOnce([[{ "1": 1 }]]);
    await expect(runMigrations({ databaseUrl })).resolves.toBeUndefined();
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.readdirSync).not.toHaveBeenCalled();
  });

  it("enforces manual history when no journal table exists", async () => {
    mocks.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
    await expect(runMigrations({ databaseUrl })).rejects.toThrow(/Explicit maintenance required/);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("fails closed if the journal cannot be read", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ table: "__drizzle_migrations" }]])
      .mockRejectedValueOnce(new Error("journal metadata unavailable"));
    await expect(runMigrations({ databaseUrl })).rejects.toThrow("journal metadata unavailable");
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("fails closed if an empty journal has no readable manual ledger", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ table: "__drizzle_migrations" }]])
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(new Error("manual ledger unavailable"));
    await expect(runMigrations({ databaseUrl })).rejects.toThrow("manual ledger unavailable");
  });

  it("does not expand unselected maintenance into a whole manual-history replay", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ table: "__drizzle_migrations" }]])
      .mockResolvedValueOnce([[]]);
    await expect(runMigrations({ databaseUrl, apply: true })).rejects.toThrow(
      "Empty journal requires reviewed history and an explicitly selected migrationsDir before maintenance"
    );
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.readdirSync).not.toHaveBeenCalled();
  });

  it("still checks an explicitly selected manual directory with a journal table", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ table: "__drizzle_migrations" }]])
      .mockResolvedValueOnce([[]]);
    await expect(
      runMigrations({ databaseUrl, migrationsDir: "/reviewed/selected" })
    ).rejects.toThrow(/Explicit maintenance required/);
    expect(mocks.query).not.toHaveBeenCalledWith("SELECT 1 FROM __drizzle_migrations LIMIT 1");
  });
});
