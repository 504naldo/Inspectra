/** Synthetic candidate rehearsal only; never an entry point for live maintenance. */
import { afterAll, beforeAll, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { createPool as createCallbackPool } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkSchemaContract,
  type SchemaContractReport,
} from "./schemaContract";
import { runMigrations, splitSqlStatements } from "./runMigrations";
import { verifyAuditRequiredSchema } from "./requiredSchema";
import { runWithDb } from "./db/client";

const selectedFiles = [
  "0086_audit_receipts_outbox_calendar.sql",
  "0087_payment_protocol_guard.sql",
];
let admin: mysql.Connection | undefined;
let connection: mysql.Connection | undefined;
let databaseUrl = "",
  name = "",
  directory = "",
  selected = "";
let createdDatabase = false;
let statements: string[] = [];
let additions: { table: string; column: string }[] = [];
let originalColumns: { table: string; columns: string[] }[] = [];
let originalLedger: string[] = [];
let originalLedgerRows: mysql.RowDataPacket[] = [];
const catalogPrefix = "Synthetic catalog " + "x".repeat(173);
const q = (identifier: string) => "`" + identifier.replaceAll("`", "``") + "`";

async function inspect(): Promise<SchemaContractReport> {
  const db = await mysql.createConnection(databaseUrl);
  return checkSchemaContract(
    {
      query: async (sql, parameters) => (await db.query(sql, parameters))[0],
      end: () => db.end(),
    },
    name
  );
}
async function count(table: string, where = "") {
  const [rows] = await connection!.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) n FROM ${q(table)} ${where}`
  );
  return Number(rows[0].n);
}
async function preservedRows() {
  const snapshot: Record<string, string[]> = {};
  for (const { table, columns } of originalColumns) {
    const [rows] = await connection!.query<mysql.RowDataPacket[]>(
      `SELECT ${columns.map(q).join(",")} FROM ${q(table)}`
    );
    snapshot[table] = rows.map(row => JSON.stringify(row)).sort();
  }
  return snapshot;
}
async function ledgerRows() {
  return (
    await connection!.query<mysql.RowDataPacket[]>(
      "SELECT id,migration_name,applied_at FROM __schema_migrations ORDER BY migration_name"
    )
  )[0];
}
async function ledger() {
  const [rows] = await connection!.query<mysql.RowDataPacket[]>(
    "SELECT migration_name FROM __schema_migrations ORDER BY migration_name"
  );
  return rows.map(row => String(row.migration_name));
}
async function foreignKeys() {
  return (
    await connection!.query<mysql.RowDataPacket[]>(
      `SELECT k.CONSTRAINT_SCHEMA,k.CONSTRAINT_NAME,k.TABLE_SCHEMA,k.TABLE_NAME,
        k.COLUMN_NAME,k.ORDINAL_POSITION,k.POSITION_IN_UNIQUE_CONSTRAINT,
        k.REFERENCED_TABLE_SCHEMA,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,
        r.UNIQUE_CONSTRAINT_SCHEMA,r.UNIQUE_CONSTRAINT_NAME,r.MATCH_OPTION,
        r.UPDATE_RULE,r.DELETE_RULE
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA
        AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
      WHERE k.TABLE_SCHEMA=? AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION`,
      [name]
    )
  )[0];
}
async function catalogIndexes() {
  return (
    await connection!.query<mysql.RowDataPacket[]>(
      "SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='parts_catalog' ORDER BY INDEX_NAME,SEQ_IN_INDEX",
      [name]
    )
  )[0];
}
async function catalogDuplicateGroups() {
  // Return only a count, never catalog keys. Match the full target key and its
  // explicit fixture collation, not the legacy lookup index's 191-char prefix.
  const [rows] = await connection!.query<mysql.RowDataPacket[]>(`
    SELECT COUNT(*) n FROM (
      SELECT 1 FROM parts_catalog
      GROUP BY companyId, category COLLATE utf8mb4_0900_ai_ci,
        productName COLLATE utf8mb4_0900_ai_ci
      HAVING COUNT(*) > 1
    ) duplicate_groups
  `);
  return Number(rows[0].n);
}
async function preflight() {
  // This helper is deliberately private to this test's owned, synthetic database.
  if (!createdDatabase || !name.startsWith("inspectra_forward_") || !connection)
    throw new Error("Synthetic database ownership required");
  if (await catalogDuplicateGroups())
    throw new Error("Duplicate catalog key groups: separate review required");
  const report = await inspect();
  if (report.status === "unknown")
    throw new Error("Schema metadata could not be verified");
  if (!report.blockingCount) return { report, needsRepair: false };
  for (const table of ["approved_work", "invoices", "invoice_line_items"])
    if (await count(table))
      throw new Error(`Nonempty ${table}: reviewed data conversion required`);
  if (
    await count("fire_alarm_inspection_results", "WHERE itemSnapshot IS NULL")
  )
    throw new Error(
      "Missing historical captures: no automatic reconstruction permitted"
    );

  const allowed = new Set<string>();
  for (const { table, column } of additions)
    allowed.add(`missing_column:${table}:${column}`);
  for (const column of ["googleCalendarId", "googleCalendarOwnerId"])
    allowed.add(`missing_column:jobs:${column}`);
  for (const table of ["invoice_payments", "email_outbox"])
    allowed.add(`missing_table:${table}:`);
  for (const statement of statements) {
    const modify = /^ALTER TABLE `(\w+)` MODIFY COLUMN `(\w+)`/i.exec(
      statement
    );
    if (modify)
      for (const code of [
        "column_type_mismatch",
        "column_nullability_mismatch",
      ])
        allowed.add(`${code}:${modify[1]}:${modify[2]}`);
    const index = /^CREATE INDEX `(\w+)` ON `(\w+)`/i.exec(statement);
    if (index) allowed.add(`missing_index:${index[2]}:${index[1]}`);
    const unique = /^ALTER TABLE `(\w+)` ADD CONSTRAINT `(\w+)` UNIQUE/i.exec(
      statement
    );
    if (unique) allowed.add(`missing_index:${unique[1]}:${unique[2]}`);
  }
  const unexpected = report.findings.filter(
    f =>
      f.severity === "blocking" &&
      !allowed.has(`${f.code}:${f.table ?? ""}:${f.object ?? ""}`)
  );
  if (unexpected.length)
    throw new Error("Unexpected schema drift requires separate review");
  // This fixture is not a general/idempotent migration engine. Interrupted DDL
  // must be inspected, not silently skipped or replayed against changed state.
  for (const { table, column } of additions)
    if (
      !report.findings.some(
        f =>
          f.code === "missing_column" &&
          f.table === table &&
          f.object === column
      )
    )
      throw new Error(
        "Partial or different schema requires a revised explicit plan"
      );
  return { report, needsRepair: true };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.protocol !== "mysql:" ||
    url.search ||
    url.hash ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/inspectra_")
  )
    throw new Error(
      "Forward rehearsal requires a disposable loopback Inspectra database"
    );
  name = `inspectra_forward_${randomUUID().replaceAll("-", "")}`;
  url.pathname = "/";
  admin = await mysql.createConnection(url.toString());
  await admin.query(
    `CREATE DATABASE ${q(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
  );
  createdDatabase = true;
  url.pathname = "/" + name;
  databaseUrl = url.toString();
  connection = await mysql.createConnection(databaseUrl);
  directory = await mkdtemp(join(tmpdir(), "inspectra-forward-"));
  selected = join(directory, "selected");
  await mkdir(selected);
  for (const file of selectedFiles)
    await copyFile(join("drizzle/migrations", file), join(selected, file));
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
  for (const entry of journal.entries)
    await copyFile(
      join("drizzle", entry.tag + ".sql"),
      join(oldJournal, entry.tag + ".sql")
    );
  await migrate(drizzle(connection), { migrationsFolder: oldJournal });
  // Reconstruct an abandoned journal marker ONLY inside the database just created
  // by this test. Deleting real migration history is never a recovery strategy.
  await connection.query("DELETE FROM __drizzle_migrations");
  await connection.query(
    "ALTER TABLE users ADD sessionVersion INT NOT NULL DEFAULT 1"
  );
  await connection.query(
    "CREATE TABLE __schema_migrations (id INT AUTO_INCREMENT PRIMARY KEY, migration_name VARCHAR(256) NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
  );
  originalLedger = (await readdir("drizzle/migrations"))
    .filter(
      f =>
        f.endsWith(".sql") &&
        f !== "RAILWAY_CATCHUP.sql" &&
        !selectedFiles.includes(f)
    )
    .sort();
  for (const file of originalLedger)
    await connection.query(
      "INSERT INTO __schema_migrations(migration_name) VALUES(?)",
      [file]
    );
  originalLedgerRows = await ledgerRows();
  statements = splitSqlStatements(
    await readFile("docs/runbooks/fixtures/empty-legacy-forward.sql", "utf8")
  );
  additions = statements.flatMap(statement => {
    const match = /^ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/i.exec(statement);
    return match ? [{ table: match[1], column: match[2] }] : [];
  });
  expect(additions).toHaveLength(52);
  // Remove fixture indexes before columns so a composite key is not silently
  // shortened. No existing external database is ever used for fixture creation.
  for (const statement of statements) {
    const index = /^CREATE INDEX `(\w+)` ON `(\w+)`/i.exec(statement);
    const unique = /^ALTER TABLE `(\w+)` ADD CONSTRAINT `(\w+)` UNIQUE/i.exec(
      statement
    );
    if (index)
      await connection.query(
        `ALTER TABLE ${q(index[2])} DROP INDEX ${q(index[1])}`
      );
    if (unique)
      await connection.query(
        `ALTER TABLE ${q(unique[1])} DROP INDEX ${q(unique[2])}`
      );
  }
  // Reproduce only the public manual 0039 nonunique prefix index definition.
  await connection.query(
    "CREATE INDEX `parts_catalog_cat_product_idx` ON `parts_catalog` (`companyId`, `category`(100), `productName`(191))"
  );
  for (const { table, column } of additions)
    await connection.query(`ALTER TABLE ${q(table)} DROP COLUMN ${q(column)}`);
  await connection.query(
    "ALTER TABLE invoices ADD totalAmount DECIMAL(10,2), ADD paidAmount DECIMAL(10,2), ADD notes TEXT, ADD INDEX invoices_jobId_idx(jobId)"
  );
  const legacy: Record<string, Record<string, string>> = {
    approved_work: {
      createdAt: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP",
      updatedAt:
        "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      jobId: "INT NOT NULL",
      status: "VARCHAR(50) DEFAULT 'approved'",
    },
    invoices: {
      createdAt: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP",
      updatedAt:
        "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      jobId: "INT NOT NULL",
      invoiceNumber: "VARCHAR(50) NULL",
      status: "VARCHAR(50) DEFAULT 'draft'",
      dueDate: "DATE NULL",
    },
    devices: { replacementRecommended: "BOOLEAN NOT NULL DEFAULT false" },
    fire_alarm_ancillary_circuits: {
      operationConfirmed: "ENUM('yes','no','na') NOT NULL DEFAULT 'na'",
    },
    fire_alarm_form_header: {
      connectedToFSRC: "BOOLEAN NOT NULL DEFAULT false",
    },
    fire_alarm_inspection_results: { itemSnapshot: "JSON NULL" },
    quotes: {
      discount: "DECIMAL(5,2) NOT NULL DEFAULT 0",
      quoteType: "VARCHAR(20) NOT NULL DEFAULT 'deficiency'",
    },
  };
  for (const [table, columns] of Object.entries(legacy))
    for (const [column, definition] of Object.entries(columns))
      await connection.query(
        `ALTER TABLE ${q(table)} MODIFY COLUMN ${q(column)} ${definition}`
      );
  // All four FK definitions from public manual 0007, without replaying its
  // migration or backfills. Supporting indexes are created by InnoDB as needed.
  for (const [table, column, referencedTable] of [
    ["inspection_results", "jobId", "jobs"],
    ["fire_alarm_inspection_results", "jobId", "jobs"],
    ["deficiencies", "jobId", "jobs"],
    ["repairs", "deficiencyId", "deficiencies"],
  ])
    await connection.query(
      `ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(`fk_${table}_${column}`)} FOREIGN KEY (${q(column)}) REFERENCES ${q(referencedTable)} (id)`
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
    "INSERT INTO jobs(id,companyId,customerOrgId,siteId,jobNumber,title,googleCalendarEventId,finalizationHash) VALUES(811,811,811,811,'SYN-811','Synthetic inspection','unknown-owner-event','original-synthetic-hash')"
  );
  await connection.query(
    "INSERT INTO fire_alarm_inspection_results(id,jobId,fireAlarmSystemId,checklistItemId,result,itemSnapshot) VALUES(811,811,811,811,'pass',JSON_OBJECT('captureProvenance','legacy_unknown','itemDescription','Synthetic historical wording'))"
  );
  await connection.query(
    "INSERT INTO parts_catalog(id,companyId,category,productName,sku,unitPrice,description) VALUES (811,811,'Synthetic sensors','Café sensor','SYN-A',12.34,'Invented catalog row'),(812,811,'Synthetic sensors',?,'SYN-B',23.45,'Invented long name A'),(813,811,'Synthetic sensors',?,'SYN-C',34.56,'Invented long name B')",
    [catalogPrefix + "-alpha", catalogPrefix + "-beta"]
  );
  const [columns] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME NOT IN ('__schema_migrations','__drizzle_migrations') ORDER BY TABLE_NAME,ORDINAL_POSITION",
    [name]
  );
  const grouped = new Map<string, string[]>();
  for (const row of columns)
    grouped.set(row.TABLE_NAME, [
      ...(grouped.get(row.TABLE_NAME) ?? []),
      row.COLUMN_NAME,
    ]);
  originalColumns = Array.from(grouped).map(([table, columns]) => ({
    table,
    columns,
  }));
}, 120000);

afterAll(async () => {
  try {
    try {
      await connection?.end();
    } finally {
      if (admin) {
        try {
          if (createdDatabase) await admin.query(`DROP DATABASE ${q(name)}`);
        } finally {
          await admin.end();
        }
      }
    }
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it("detects broader schema drift read-only despite a complete-looking manual ledger", async () => {
  const before = await preservedRows();
  const report = await inspect();
  expect(
    report.findings.filter(f => f.code === "missing_table").map(f => f.table)
  ).toEqual(["email_outbox", "invoice_payments"]);
  expect(report.findings.filter(f => f.code === "missing_column")).toHaveLength(
    54
  );
  expect(report.blockingCount).toBeGreaterThan(54);
  expect(report.migrationMetadataTables).toEqual([
    "__drizzle_migrations",
    "__schema_migrations",
  ]);
  expect(await preservedRows()).toEqual(before);
  expect(await ledger()).toEqual(originalLedger);
  expect(await ledgerRows()).toEqual(originalLedgerRows);
});

it("refuses nonempty business tables and null captures without DDL or invented history", async () => {
  const before = await preservedRows();
  for (const [table, insert] of [
    ["approved_work", "INSERT INTO approved_work(id,jobId) VALUES(901,811)"],
    [
      "invoices",
      "INSERT INTO invoices(id,jobId,totalAmount,paidAmount) VALUES(901,811,100,20)",
    ],
    [
      "invoice_line_items",
      "INSERT INTO invoice_line_items(id,invoiceId,description) VALUES(901,901,'Synthetic')",
    ],
  ]) {
    await connection!.query(insert);
    await expect(preflight()).rejects.toThrow(`Nonempty ${table}`);
    await connection!.query(`DELETE FROM ${q(table)} WHERE id=901`);
  }
  await connection!.query(
    "INSERT INTO fire_alarm_inspection_results(id,jobId,fireAlarmSystemId,checklistItemId,itemSnapshot) VALUES(902,811,811,811,NULL)"
  );
  await expect(preflight()).rejects.toThrow("Missing historical captures");
  await connection!.query(
    "DELETE FROM fire_alarm_inspection_results WHERE id=902"
  );
  expect(await preservedRows()).toEqual(before);
  expect(await ledger()).toEqual(originalLedger);
  expect(await ledgerRows()).toEqual(originalLedgerRows);
});

it("rejects case and accent equivalent full catalog keys before any repair DDL", async () => {
  const before = await preservedRows();
  const indexes = await catalogIndexes();
  const report = await inspect();
  for (const productName of ["CAFÉ SENSOR", "Cafe sensor"]) {
    await connection!.beginTransaction();
    try {
      await connection!.query(
        "INSERT INTO parts_catalog(companyId,category,productName) VALUES(811,'Synthetic sensors',?)",
        [productName]
      );
      expect(await catalogDuplicateGroups()).toBe(1);
      await expect(preflight()).rejects.toThrow(
        "Duplicate catalog key groups: separate review required"
      );
      expect(await catalogIndexes()).toEqual(indexes);
      expect((await inspect()).findings).toEqual(report.findings);
      expect(await ledgerRows()).toEqual(originalLedgerRows);
    } finally {
      // Undo only this test's invented conflicting insert, not a repair branch.
      await connection!.rollback();
    }
  }
  expect(await preservedRows()).toEqual(before);
});

it("rejects an interrupted or unexpected candidate rather than blind duplicate skipping", async () => {
  await connection!.query(statements[0]);
  await expect(preflight()).rejects.toThrow("Partial or different schema");
  // Reset only a synthetic column created immediately above in the owned fixture.
  await connection!.query(
    `ALTER TABLE ${q(additions[0].table)} DROP COLUMN ${q(additions[0].column)}`
  );
  await connection!.query(
    "ALTER TABLE jobs MODIFY title VARCHAR(254) NOT NULL"
  );
  await expect(preflight()).rejects.toThrow("Unexpected schema drift");
  await connection!.query(
    "ALTER TABLE jobs MODIFY title VARCHAR(255) NOT NULL"
  );
});

it("rehearses a complete synthetic forward sequence preserving every original value and ledger entry", async () => {
  const before = await preservedRows();
  const foreignKeysBefore = await foreignKeys();
  expect(foreignKeysBefore.map(row => row.CONSTRAINT_NAME)).toEqual([
    "fk_deficiencies_jobId",
    "fk_fire_alarm_inspection_results_jobId",
    "fk_inspection_results_jobId",
    "fk_repairs_deficiencyId",
  ]);
  const prefixBefore = (await catalogIndexes()).filter(
    row => row.INDEX_NAME === "parts_catalog_cat_product_idx"
  );
  expect(
    prefixBefore.map(row => [
      row.NON_UNIQUE,
      row.COLUMN_NAME,
      // A full-column prefix may be normalized to NULL by MySQL.
      row.COLUMN_NAME === "category" && row.SUB_PART === 100 ? null : row.SUB_PART,
    ])
  ).toEqual([
    [1, "companyId", null],
    [1, "category", null],
    [1, "productName", 191],
  ]);
  expect(catalogPrefix).toHaveLength(191);
  expect(await catalogDuplicateGroups()).toBe(0);
  expect((await preflight()).needsRepair).toBe(true);
  for (const statement of statements) await connection!.query(statement);
  await runMigrations({ databaseUrl, migrationsDir: selected, apply: true });
  const report = await inspect();
  expect(report.findings.filter(f => f.severity === "blocking")).toEqual([]);
  expect(report.unknownCount).toBe(0);
  expect(
    report.findings.filter(f => f.code === "extra_column").map(f => f.object)
  ).toEqual(["notes", "paidAmount", "totalAmount"]);
  expect(await preservedRows()).toEqual(before);
  expect(await foreignKeys()).toEqual(foreignKeysBefore);
  const indexesAfter = await catalogIndexes();
  expect(
    indexesAfter.filter(
      row => row.INDEX_NAME === "parts_catalog_cat_product_idx"
    )
  ).toEqual(prefixBefore);
  expect(
    indexesAfter
      .filter(row => row.INDEX_NAME === "parts_catalog_unique_cat_product")
      .map(row => [row.NON_UNIQUE, row.COLUMN_NAME, row.SUB_PART])
  ).toEqual([
    [0, "companyId", null],
    [0, "category", null],
    [0, "productName", null],
  ]);
  expect(await count("parts_catalog")).toBe(3);
  await expect(
    connection!.query(
      "INSERT INTO parts_catalog(companyId,category,productName) VALUES(811,'Synthetic sensors','CAFE SENSOR')"
    )
  ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  expect(await preservedRows()).toEqual(before);
  expect(await ledger()).toEqual([...originalLedger, ...selectedFiles].sort());
  expect(
    (await ledgerRows()).filter(
      row => !selectedFiles.includes(row.migration_name)
    )
  ).toEqual(originalLedgerRows);
  expect(await count("__drizzle_migrations")).toBe(0);
  expect(await count("invoice_payments")).toBe(0);
  expect(await count("email_outbox")).toBe(0);
  const verificationPool = createCallbackPool(databaseUrl);
  try {
    await runWithDb(drizzle(verificationPool), verifyAuditRequiredSchema);
  } finally {
    await verificationPool.promise().end();
  }
  expect((await preflight()).needsRepair).toBe(false);
  const [capture] = await connection!.query<mysql.RowDataPacket[]>(
    "SELECT itemSnapshot FROM fire_alarm_inspection_results WHERE id=811"
  );
  expect(capture[0].itemSnapshot).toMatchObject({
    captureProvenance: "legacy_unknown",
    itemDescription: "Synthetic historical wording",
  });
  const [guards] = await connection!.query<mysql.RowDataPacket[]>(
    "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY TRIGGER_NAME",
    [name]
  );
  expect(guards.map(r => r.TRIGGER_NAME)).toEqual([
    "inspectra_invoice_payment_v2",
    "inspectra_payment_insert_v2",
    "inspectra_payment_no_delete",
    "inspectra_payment_no_update",
  ]);
}, 60000);
