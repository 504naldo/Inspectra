import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import {
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
  mkdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { runMigrations, splitSqlStatements } from "./runMigrations";

const manualFiles = [
  "0086_audit_receipts_outbox_calendar.sql",
  "0087_payment_protocol_guard.sql",
  "0088_inspection_template_capture.sql",
  "0089_finalization_hash_version.sql",
  "0090_captured_device_evidence.sql",
  "0091_invoice_payment_state_guards.sql",
  "0092_durable_signature_keys.sql",
] as const;
const expectedGuardNames = [
  "inspectra_invoice_payment_state_v3",
  "inspectra_invoice_payment_v2",
  "inspectra_invoice_unpaid_insert_v3",
  "inspectra_payment_insert_v2",
  "inspectra_payment_no_delete",
  "inspectra_payment_no_update",
];
let admin: mysql.Connection, connection: mysql.Connection;
let databaseUrl: string, name: string, directory: string;
let createdDatabase = false;
const journalDir = resolve("drizzle");

async function invariants() {
  const queries = {
    totals:
      "SELECT (SELECT COUNT(*) FROM invoices) invoiceCount, (SELECT SUM(amountPaid) FROM invoices) paidTotal, (SELECT COUNT(*) FROM fire_alarm_inspection_results) captureCount",
    fireCaptures:
      "SELECT jobId, checklistItemId, itemSnapshot, result FROM fire_alarm_inspection_results ORDER BY id",
    invoiceOwnership:
      "SELECT id, companyId, customerOrgId, status, total, amountPaid, balanceDue, paidAt FROM invoices ORDER BY id",
    jobs: "SELECT id, companyId, customerOrgId, siteId, finalizedAt, finalizationHash, tech_signature_url, contact_signature_url FROM jobs ORDER BY id",
    templateResponses:
      "SELECT id, companyId, jobId, templateId, sectionId, itemId, responseValue, responseText, notes FROM inspection_template_responses ORDER BY id",
    deviceResults:
      "SELECT id, jobId, deviceId, result, notes FROM inspection_results ORDER BY id",
    deficiencies:
      "SELECT id, jobId, deviceId, inspectionResultId, reportedById, status, title, description FROM deficiencies ORDER BY id",
    devices:
      "SELECT id, companyId, siteId, category, deviceType, location FROM devices ORDER BY id",
  };
  const captured: Record<string, unknown> = {};
  for (const [key, query] of Object.entries(queries)) {
    const [rows] = await connection.query(query);
    captured[key] = rows;
  }
  return captured;
}

function canonicalSql(sql: string) {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .trim()
    .replace(/;$/, "")
    .replace(/\s+/g, " ");
}

async function paymentGuards() {
  const [guards] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT TRIGGER_NAME name, EVENT_MANIPULATION eventType, EVENT_OBJECT_TABLE tableName, ACTION_TIMING timing, ACTION_STATEMENT body FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'inspectra_%' ORDER BY TRIGGER_NAME"
  );
  return guards.map(guard => ({
    name: guard.name,
    event: guard.eventType,
    tableName: guard.tableName,
    timing: guard.timing,
    body: canonicalSql(guard.body),
  }));
}

async function expectedPaymentGuards() {
  const statements = (
    await Promise.all(
      [
        "0037_payment_protocol_guard.sql",
        "0041_invoice_payment_state_guards.sql",
      ].map(async file =>
        (await readFile(join(journalDir, file), "utf8"))
          .split("--> statement-breakpoint")
          .map(canonicalSql)
      )
    )
  ).flat();
  return statements
    .map(statement => {
      const match =
        /^CREATE TRIGGER (\w+) (BEFORE|AFTER) (INSERT|UPDATE|DELETE) ON (\w+) FOR EACH ROW\s+([\s\S]+)$/i.exec(
          statement
        );
      if (!match)
        throw new Error("Expected a complete payment trigger definition");
      return {
        name: match[1],
        timing: match[2],
        event: match[3],
        tableName: match[4],
        body: canonicalSql(match[5]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function ledger() {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT migration_name FROM __schema_migrations ORDER BY migration_name"
  );
  return rows.map(row => row.migration_name as string);
}

it("current manual release manifest parses complete statements and matches all six journal trigger definitions", async () => {
  const statementCounts: number[] = [];
  for (const file of manualFiles)
    statementCounts.push(
      splitSqlStatements(
        await readFile(join("drizzle/migrations", file), "utf8")
      ).length
    );
  expect(statementCounts).toEqual([4, 4, 1, 1, 2, 2, 2]);
  for (const [manual, journal] of [
    [manualFiles[1], "0037_payment_protocol_guard.sql"],
    [manualFiles[5], "0041_invoice_payment_state_guards.sql"],
    [manualFiles[6], "0042_durable_signature_keys.sql"],
  ]) {
    const actual = splitSqlStatements(
      await readFile(join("drizzle/migrations", manual), "utf8")
    ).map(canonicalSql);
    const expected = (await readFile(join(journalDir, journal), "utf8"))
      .split("--> statement-breakpoint")
      .map(canonicalSql);
    expect(actual).toEqual(expected);
  }
  expect((await expectedPaymentGuards()).map(guard => guard.name)).toEqual(
    expectedGuardNames
  );
});

describe("selected manual-history MySQL acceptance", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        "Migration safety acceptance requires an explicitly disposable local MySQL DATABASE_URL"
      );
    const url = new URL(process.env.DATABASE_URL);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/inspectra_")
    )
      throw new Error(
        "Safety tests require an explicitly isolated local Inspectra database"
      );
    name = `inspectra_safety_upgrade_${process.pid}_${randomBytes(4).toString("hex")}`;
    url.pathname = "/";
    admin = await mysql.createConnection(url.toString());
    await admin.query(`CREATE DATABASE \`${name}\``);
  createdDatabase = true;
    url.pathname = "/" + name;
    databaseUrl = url.toString();
    connection = await mysql.createConnection(databaseUrl);
    directory = await mkdtemp(join(tmpdir(), "inspectra-migrations-"));
    const old = join(directory, "journal");
    await mkdir(join(old, "meta"), { recursive: true });
    const journal = JSON.parse(
      await readFile(join(journalDir, "meta/_journal.json"), "utf8")
    );
    journal.entries = journal.entries.filter(
      (entry: { idx: number }) => entry.idx < 36
    );
    await writeFile(join(old, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile(
        join(journalDir, entry.tag + ".sql"),
        join(old, entry.tag + ".sql")
      );
    await migrate(drizzle(connection), { migrationsFolder: old });
    // Selected manual-history fixture with existing tracking and a reviewed
    // session-version prerequisite. Never replay the full unrelated manual history.
    await connection.query(
      "CREATE TABLE __schema_migrations (id INT AUTO_INCREMENT PRIMARY KEY, migration_name VARCHAR(256) NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    );
    for (const statement of splitSqlStatements(
      await readFile("drizzle/migrations/0044_user_session_version.sql", "utf8")
    ))
      await connection.query(statement);
    const fixtures = [
      "INSERT INTO companies(id,name) VALUES(701,'Fixture A'),(702,'Fixture B')",
      "INSERT INTO customer_orgs(id,companyId,name) VALUES(701,701,'Org A'),(702,702,'Org B')",
      "INSERT INTO sites(id,companyId,customerOrgId,name) VALUES(701,701,701,'Site A'),(702,702,702,'Site B')",
      "INSERT INTO jobs(id,companyId,customerOrgId,siteId,jobNumber,title,finalizedAt,finalizationHash) VALUES(701,701,701,701,'HIST-701','Historical sealed fixture','2025-01-01',REPEAT('a',64)),(702,702,702,702,'HIST-702','Historical mutable fixture',NULL,NULL)",
      "UPDATE jobs SET tech_signature_url='https://legacy.example/expired-tech.png',contact_signature_url='https://legacy.example/expired-contact.png' WHERE id IN (701,702)",
      "INSERT INTO invoices(id,companyId,customerOrgId,invoiceNumber,status,total,amountPaid,balanceDue) VALUES(701,701,701,'HIST-701','partial',100,30,70),(702,702,702,'HIST-702','partial',200,50,150)",
      "INSERT INTO fire_alarm_checklist_templates(id,sectionName,sectionOrder,itemDescription,effectiveDate) VALUES(701,'Today',1,'Edited later','2026-01-01')",
      "INSERT INTO fire_alarm_inspection_results(jobId,fireAlarmSystemId,checklistItemId,result,itemSnapshot) VALUES(701,701,701,'pass',NULL),(701,701,702,'fail',JSON_OBJECT('captureProvenance','captured','itemDescription','Original','isRequired',true,'requirementType','test','standardVersion','2019'))",
      "INSERT INTO inspection_templates(id,companyId,name) VALUES(701,701,'Today A'),(702,702,'Today B')",
      "INSERT INTO inspection_template_sections(id,companyId,templateId,title) VALUES(701,701,701,'Today A'),(702,702,702,'Today B')",
      "INSERT INTO inspection_template_items(id,companyId,templateId,sectionId,questionText) VALUES(701,701,701,701,'Edited question A'),(702,702,702,702,'Edited question B')",
      "INSERT INTO inspection_template_responses(id,companyId,jobId,templateId,sectionId,itemId,responseValue,responseText,notes) VALUES(701,701,701,701,701,701,'fail','Original answer A','Original notes A'),(702,702,702,702,702,702,'pass','Original answer B','Original notes B')",
      "INSERT INTO devices(id,companyId,siteId,deviceType,location) VALUES(701,701,701,'Current master A','Current location A'),(702,702,702,'Current master B','Current location B')",
      "INSERT INTO inspection_results(id,jobId,deviceId,result,notes) VALUES(701,701,701,'fail','Historical result A'),(702,702,702,'pass','Historical result B')",
      "INSERT INTO deficiencies(id,jobId,deviceId,inspectionResultId,reportedById,title,description) VALUES(701,701,701,701,701,'Historical deficiency A','Original issue A'),(702,702,702,702,702,'Historical deficiency B','Original issue B')",
    ];
    for (const statement of fixtures) await connection.query(statement);
  }, 30000);

  afterAll(async () => {
    await connection?.end();
    if (admin) {
      if (createdDatabase) await admin.query(`DROP DATABASE \`${name}\``);
      await admin.end();
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("blocks legacy snapshot fabrication and dependent constraints, preserving nulls, tenant ownership and financial totals", async () => {
    const dir = join(directory, "unsafe");
    await mkdir(dir);
    for (const file of [
      "0011_backfill_item_snapshot.sql",
      "0014_enforce_not_null_item_snapshot.sql",
    ])
      await copyFile(join("drizzle/migrations", file), join(dir, file));
    const before = await invariants();
    await connection.beginTransaction();
    try {
      for (const statement of splitSqlStatements(
        await readFile(
          "drizzle/migrations/0011_backfill_item_snapshot.sql",
          "utf8"
        )
      ))
        await connection.query(statement);
      const [fabricated] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT itemSnapshot FROM fire_alarm_inspection_results WHERE checklistItemId=701"
      );
      expect(fabricated[0].itemSnapshot.itemDescription).toBe("Edited later");
    } finally {
      await connection.rollback();
    }
    await expect(
      runMigrations({ databaseUrl, migrationsDir: dir, apply: true })
    ).rejects.toThrow(/requires reviewed historical evidence/);
    expect(await invariants()).toEqual(before);
    const [untrusted] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT itemSnapshot FROM fire_alarm_inspection_results WHERE checklistItemId=701"
    );
    expect(untrusted[0].itemSnapshot).toBeNull();
    expect(await ledger()).toEqual([]);
  });

  it("upgrades through manual 0092, preserving unknown captures and v1 seals while recovering complete trigger bodies after interrupted DDL", async () => {
    const dir = join(directory, "safe");
    await mkdir(dir);
    for (const file of manualFiles)
      await copyFile(join("drizzle/migrations", file), join(dir, file));
    const before = await invariants();
    // 0086's first DDL committed, but no migration ledger entry was recorded.
    await connection.query(
      splitSqlStatements(await readFile(join(dir, manualFiles[0]), "utf8"))[0]
    );
    await expect(
      runMigrations({ databaseUrl, migrationsDir: dir })
    ).rejects.toThrow(/Explicit maintenance/);
    expect(await ledger()).toEqual([]);
    expect(await invariants()).toEqual(before);

    // Execute the actual first 0091 body, then simulate interruption before its
    // second body. Retry must use the restored exact reviewed file.
    const reviewed0091 = await readFile(join(dir, manualFiles[5]), "utf8");
    const [insertGuard, stateGuard] = splitSqlStatements(reviewed0091);
    expect(insertGuard).toMatch(
      /^CREATE TRIGGER inspectra_invoice_unpaid_insert_v3/
    );
    expect(stateGuard).toMatch(
      /^CREATE TRIGGER inspectra_invoice_payment_state_v3/
    );
    await writeFile(
      join(dir, manualFiles[5]),
      `DELIMITER $$\n${insertGuard}$$\nSELECT * FROM nonexistent_safety_trigger_boundary$$\n${stateGuard}$$\nDELIMITER ;\n`
    );
    await expect(
      runMigrations({ databaseUrl, migrationsDir: dir, apply: true })
    ).rejects.toThrow();
    expect(await ledger()).toEqual(manualFiles.slice(0, 5));
    expect((await paymentGuards()).map(guard => guard.name)).toEqual(
      expectedGuardNames.filter(
        name => name !== "inspectra_invoice_payment_state_v3"
      )
    );
    expect(await invariants()).toEqual(before);
    await expect(
      connection.query(
        "INSERT INTO invoices(companyId,customerOrgId,invoiceNumber,status,total,amountPaid,balanceDue) VALUES(701,701,'BLOCKED-INTERRUPTED','paid',100,0,100)"
      )
    ).rejects.toThrow(/New invoices must be unpaid/);

    await writeFile(join(dir, manualFiles[5]), reviewed0091);
    await runMigrations({ databaseUrl, migrationsDir: dir, apply: true });
    expect(await ledger()).toEqual([...manualFiles]);
    expect(await invariants()).toEqual(before);
    expect(await paymentGuards()).toEqual(await expectedPaymentGuards());
    expect((await paymentGuards()).map(guard => guard.name)).toEqual(
      expectedGuardNames
    );
    for (const [table, column] of [
      ["inspection_template_responses", "itemSnapshot"],
      ["inspection_results", "deviceSnapshot"],
      ["deficiencies", "deviceSnapshot"],
    ]) {
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT id,\`${column}\` snapshot FROM \`${table}\` ORDER BY id`
      );
      expect(rows.map(row => ({ id: row.id, snapshot: row.snapshot }))).toEqual(
        [
          { id: 701, snapshot: null },
          { id: 702, snapshot: null },
        ]
      );
    }
    const [versions] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id,finalizationHashVersion FROM jobs ORDER BY id"
    );
    expect(
      versions.map(row => ({
        id: row.id,
        version: row.finalizationHashVersion,
      }))
    ).toEqual([
      { id: 701, version: 1 },
      { id: 702, version: 1 },
    ]);
    const [signatures] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id,tech_signature_key,contact_signature_key FROM jobs ORDER BY id"
    );
    expect(signatures).toMatchObject([
      { id: 701, tech_signature_key: null, contact_signature_key: null },
      { id: 702, tech_signature_key: null, contact_signature_key: null },
    ]);
    const [signatureColumns] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COLUMN_NAME columnName,IS_NULLABLE nullable,COLUMN_DEFAULT defaultValue FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='jobs' AND COLUMN_NAME IN ('tech_signature_key','contact_signature_key') ORDER BY COLUMN_NAME"
    );
    expect(signatureColumns).toMatchObject([
      { columnName: "contact_signature_key", nullable: "YES", defaultValue: null },
      { columnName: "tech_signature_key", nullable: "YES", defaultValue: null },
    ]);
    const [columns] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME tableName,COLUMN_NAME columnName,IS_NULLABLE nullable,COLUMN_DEFAULT defaultValue FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='inspection_template_responses' AND COLUMN_NAME='itemSnapshot') OR (TABLE_NAME IN ('inspection_results','deficiencies') AND COLUMN_NAME='deviceSnapshot') OR (TABLE_NAME='jobs' AND COLUMN_NAME='finalizationHashVersion')) ORDER BY TABLE_NAME"
    );
    expect(
      columns.map(row => ({
        table: row.tableName,
        column: row.columnName,
        nullable: row.nullable,
        defaultValue: row.defaultValue,
      }))
    ).toEqual([
      {
        table: "deficiencies",
        column: "deviceSnapshot",
        nullable: "YES",
        defaultValue: null,
      },
      {
        table: "inspection_results",
        column: "deviceSnapshot",
        nullable: "YES",
        defaultValue: null,
      },
      {
        table: "inspection_template_responses",
        column: "itemSnapshot",
        nullable: "YES",
        defaultValue: null,
      },
      {
        table: "jobs",
        column: "finalizationHashVersion",
        nullable: "NO",
        defaultValue: "1",
      },
    ]);
    const [invented] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM invoice_payments) receipts,(SELECT COUNT(*) FROM email_outbox) deliveries"
    );
    expect(invented[0]).toMatchObject({ receipts: 0, deliveries: 0 });

    const completedGuards = await paymentGuards();
    await runMigrations({ databaseUrl, migrationsDir: dir, apply: true });
    await runMigrations({ databaseUrl, migrationsDir: dir });
    expect(await invariants()).toEqual(before);
    expect(await paymentGuards()).toEqual(completedGuards);
    expect(await ledger()).toEqual([...manualFiles]);
    await expect(
      connection.query("UPDATE invoices SET amountPaid=10 WHERE id=701")
    ).rejects.toThrow(/protocol v2/);
    await expect(
      connection.query("UPDATE invoices SET status='void' WHERE id=701")
    ).rejects.toThrow(/refund or credit/);
    await expect(
      connection.query(
        "INSERT INTO invoices(companyId,customerOrgId,invoiceNumber,status,total,amountPaid,balanceDue) VALUES(701,701,'BLOCKED-COMPLETE','partial',100,0,100)"
      )
    ).rejects.toThrow(/New invoices must be unpaid/);
    expect(await invariants()).toEqual(before);
  }, 30000);

  it("failure stops later migrations and explicit corrected retry preserves historical facts and all six guards", async () => {
    const dir = join(directory, "interrupt");
    await mkdir(dir);
    await writeFile(
      join(dir, "0092_interrupted.sql"),
      "CREATE TABLE safety_partial (id INT); SELECT * FROM nonexistent_safety_table;"
    );
    await writeFile(
      join(dir, "0093_after.sql"),
      "CREATE TABLE safety_after (id INT);"
    );
    const before = await invariants();
    const guards = await paymentGuards();
    await expect(
      runMigrations({ databaseUrl, migrationsDir: dir, apply: true })
    ).rejects.toThrow();
    const [later] = await connection.query("SHOW TABLES LIKE 'safety_after'");
    expect(later).toHaveLength(0);
    expect(await ledger()).not.toContain("0092_interrupted.sql");
    expect(await ledger()).not.toContain("0093_after.sql");
    await writeFile(
      join(dir, "0092_interrupted.sql"),
      "CREATE TABLE safety_partial (id INT); SELECT 1;"
    );
    await runMigrations({ databaseUrl, migrationsDir: dir, apply: true });
    expect(await ledger()).toEqual([
      ...manualFiles,
      "0092_interrupted.sql",
      "0093_after.sql",
    ]);
    expect(await invariants()).toEqual(before);
    expect(await paymentGuards()).toEqual(guards);
  });
});
