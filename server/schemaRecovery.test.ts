import { afterAll, beforeAll, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runWithDb } from "./db/client";
import { verifyAuditRequiredSchema } from "./requiredSchema";
import { runMigrations, splitSqlStatements } from "./runMigrations";

const files = [
  "0086_audit_receipts_outbox_calendar.sql",
  "0087_payment_protocol_guard.sql",
];
let admin: mysql.Connection | undefined;
let connection: mysql.Connection | undefined;
let createdDatabase = false;
let databaseUrl: string, name: string, directory: string, selected: string;

beforeAll(async () => {
  // Never use a real database or credentials; this test owns its random database.
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/inspectra_")
  )
    throw new Error(
      "Schema recovery test requires an isolated loopback Inspectra database"
    );
  name = `inspectra_recovery_${randomUUID().replaceAll("-", "")}`;
  url.pathname = "/";
  admin = await mysql.createConnection(url.toString());
  await admin.query(`CREATE DATABASE \`${name}\``);
  createdDatabase = true;
  url.pathname = "/" + name;
  databaseUrl = url.toString();
  connection = await mysql.createConnection(databaseUrl);
  directory = await mkdtemp(join(tmpdir(), "inspectra-schema-recovery-"));
  selected = join(directory, "selected");
  await mkdir(selected);
  for (const file of files)
    await copyFile(join("drizzle/migrations", file), join(selected, file));

  // Synthetic prerequisite schema, not a claim to reproduce production history.
  const oldJournal = join(directory, "journal");
  await mkdir(join(oldJournal, "meta"), { recursive: true });
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8")
  );
  journal.entries = journal.entries.filter(
    (entry: { idx: number }) => entry.idx < 36
  );
  await writeFile(
    join(oldJournal, "meta/_journal.json"),
    JSON.stringify(journal)
  );
  for (const entry of journal.entries) {
    await copyFile(
      resolve("drizzle", entry.tag + ".sql"),
      join(oldJournal, entry.tag + ".sql")
    );
  }
  await migrate(drizzle(connection), { migrationsFolder: oldJournal });
  // Establish 0014/0044 prerequisites on empty synthetic tables, without a backfill.
  await connection.query(
    "ALTER TABLE fire_alarm_inspection_results MODIFY itemSnapshot JSON NOT NULL"
  );
  await connection.query(
    "ALTER TABLE users ADD sessionVersion INT NOT NULL DEFAULT 1"
  );
  await connection.query(
    "CREATE TABLE __schema_migrations (id INT AUTO_INCREMENT PRIMARY KEY, migration_name VARCHAR(256) NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
  );
  await connection.query(
    "INSERT INTO companies(id,name) VALUES(811,'Synthetic A'),(812,'Synthetic B')"
  );
  await connection.query(
    "INSERT INTO customer_orgs(id,companyId,name) VALUES(811,811,'Synthetic A'),(812,812,'Synthetic B')"
  );
  await connection.query(
    "INSERT INTO sites(id,companyId,customerOrgId,name) VALUES(811,811,811,'Synthetic site')"
  );
  await connection.query(
    "INSERT INTO jobs(id,companyId,customerOrgId,siteId,jobNumber,title,googleCalendarEventId) VALUES(811,811,811,811,'SYN-811','Synthetic inspection','existing-event-unknown-owner')"
  );
  await connection.query(
    "INSERT INTO invoices(id,companyId,customerOrgId,invoiceNumber,status,total,amountPaid,balanceDue) VALUES(811,811,811,'SYN-811','partial',100,30,70),(812,812,812,'SYN-812','partial',200,50,150)"
  );
  await connection.query(
    "INSERT INTO fire_alarm_inspection_results(jobId,fireAlarmSystemId,checklistItemId,result,itemSnapshot) VALUES(811,811,811,'pass',JSON_OBJECT('captureProvenance','captured','itemDescription','Synthetic original','isRequired',true,'requirementType','test','standardVersion','2019'))"
  );
}, 30000);

afterAll(async () => {
  await connection?.end();
  if (admin) {
    if (createdDatabase) await admin.query(`DROP DATABASE \`${name}\``);
    await admin.end();
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function preflight() {
  return runWithDb(drizzle(connection!), verifyAuditRequiredSchema);
}

async function preservedState() {
  const result: Record<string, unknown> = {};
  for (const [key, query] of Object.entries({
    invoices:
      "SELECT id, companyId, customerOrgId, total, amountPaid, balanceDue, status, paidAt FROM invoices ORDER BY id",
    jobs: "SELECT id, companyId, customerOrgId, siteId, googleCalendarEventId, finalizedAt, finalizationHash FROM jobs ORDER BY id",
    captures:
      "SELECT id, jobId, checklistItemId, result, itemSnapshot FROM fire_alarm_inspection_results ORDER BY id",
  })) {
    const [rows] = await connection!.query(query);
    result[key] = rows;
  }
  return result;
}

async function ledger() {
  const [rows] = await connection!.query<mysql.RowDataPacket[]>(
    "SELECT migration_name FROM __schema_migrations ORDER BY migration_name"
  );
  return rows.map(row => row.migration_name);
}

function normalizedSql(value: string) {
  return value
    .replace(/^\s*--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");
}

it("recovers the missing-0086 failure with selected maintenance, exact partial-DDL retry and unchanged historical records", async () => {
  const before = await preservedState();
  const firstFailure = await preflight().catch(error => error);
  expect(firstFailure.message).toContain(
    "jobs.googleCalendarOwnerId/googleCalendarId (manual migration 0086; journal 0036)"
  );
  expect(firstFailure.cause).toMatchObject({
    code: "ER_BAD_FIELD_ERROR",
    errno: 1054,
    sqlState: "42S22",
  });
  await expect(
    runMigrations({ databaseUrl, migrationsDir: selected })
  ).rejects.toThrow(/Explicit maintenance required/);
  expect(await ledger()).toEqual([]);
  expect(await preservedState()).toEqual(before);

  const additions = splitSqlStatements(
    await readFile(join(selected, files[0]), "utf8")
  );
  // DDL commits independently: simulate interruption after known exact statements.
  await connection!.query(additions[0]);
  await connection!.query(
    additions.find(statement =>
      statement.includes("ADD `googleCalendarOwnerId`")
    )!
  );
  await expect(preflight()).rejects.toThrow(
    /jobs.googleCalendarOwnerId\/googleCalendarId/
  );
  await runMigrations({ databaseUrl, migrationsDir: selected, apply: true });
  await preflight();
  expect(await ledger()).toEqual(files);
  expect(await preservedState()).toEqual(before);

  const [pointers] = await connection!.query(
    "SELECT googleCalendarOwnerId, googleCalendarId FROM jobs"
  );
  expect(pointers).toEqual([
    { googleCalendarOwnerId: null, googleCalendarId: null },
  ]);
  const [invented] = await connection!.query<mysql.RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM invoice_payments) receipts, (SELECT COUNT(*) FROM email_outbox) deliveries"
  );
  expect(invented[0]).toMatchObject({ receipts: 0, deliveries: 0 });
  const [guards] = await connection!.query<mysql.RowDataPacket[]>(
    "SELECT TRIGGER_NAME name, EVENT_MANIPULATION eventType, EVENT_OBJECT_TABLE tableName, ACTION_TIMING timing, ACTION_STATEMENT body FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME"
  );
  const expectedGuards = splitSqlStatements(
    await readFile(join(selected, files[1]), "utf8")
  )
    .map(statement => {
      const match =
        /^CREATE TRIGGER (\w+) (BEFORE|AFTER) (INSERT|UPDATE|DELETE) ON (\w+) FOR EACH ROW\s+([\s\S]+)$/i.exec(
          normalizedSql(statement)
        );
      if (!match) throw new Error("Unexpected selected trigger definition");
      return {
        name: match[1],
        timing: match[2],
        eventType: match[3],
        tableName: match[4],
        body: normalizedSql(match[5]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(
    guards.map(guard => ({ ...guard, body: normalizedSql(guard.body) }))
  ).toEqual(expectedGuards);

  await runMigrations({ databaseUrl, migrationsDir: selected, apply: true });
  await runMigrations({ databaseUrl, migrationsDir: selected });
  await preflight();
  expect(await ledger()).toEqual(files);
  expect(await preservedState()).toEqual(before);
  await expect(
    connection!.query("UPDATE invoices SET amountPaid=10 WHERE id=811")
  ).rejects.toThrow(/protocol v2/);
  expect(await preservedState()).toEqual(before);

  // A recorded-but-missing schema is drift, not a pending migration. Normal replay
  // must not be presented as repairing it, or ledger rows deleted automatically.
  await connection!.query("ALTER TABLE jobs DROP COLUMN googleCalendarOwnerId");
  await runMigrations({ databaseUrl, migrationsDir: selected, apply: true });
  expect(await ledger()).toEqual(files);
  await expect(preflight()).rejects.toThrow(
    /jobs.googleCalendarOwnerId\/googleCalendarId/
  );
  expect(await preservedState()).toEqual(before);
}, 30000);
