/**
 * scripts/_applyCustomerContactsTable.ts
 *
 * Safe, forward-only schema patch script. Runs before the contacts backfill.
 *
 * What it does:
 *   1. Reports whether __drizzle_migrations tracking table exists (diagnostic only)
 *   2. Adds any missing columns to site_work_site_info (ALTER TABLE IF NOT EXISTS)
 *   3. Creates the customer_contacts table if it doesn't exist (migration 0063 DDL)
 *
 * All operations are non-destructive (ADD COLUMN / CREATE TABLE IF NOT EXISTS).
 * Safe to re-run — already-present columns and tables are skipped.
 * DATABASE_URL is never printed.
 *
 * Usage:
 *   npx tsx scripts/_applyCustomerContactsTable.ts
 */

import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env and retry.");
  process.exit(1);
}

async function tableExists(conn: mysql.Connection, table: string): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(conn: mysql.Connection, table: string, column: string): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(
  conn: mysql.Connection,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const exists = await columnExists(conn, table, column);
  if (exists) {
    console.log(`  ${table}.${column}: already present`);
    return;
  }
  await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  ${table}.${column}: ADDED`);
}

async function main() {
  const conn = await mysql.createConnection(url!);

  try {
    // ── 1. Drizzle tracking diagnostic ──────────────────────────────────────────
    const hasDrizzleMeta = await tableExists(conn, "__drizzle_migrations");
    if (hasDrizzleMeta) {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM `__drizzle_migrations`"
      );
      const cnt = (rows[0] as { cnt: number }).cnt;
      console.log(`__drizzle_migrations: EXISTS — ${cnt} row(s) recorded`);
    } else {
      console.log("__drizzle_migrations: MISSING (drizzle-kit tracking not initialised in this DB)");
    }

    // ── 2. Patch site_work_site_info — add columns added in migration 0042 ──────
    console.log("\nChecking site_work_site_info columns...");
    const hasWsi = await tableExists(conn, "site_work_site_info");
    if (!hasWsi) {
      console.log("  site_work_site_info: table not found — skipping column patch");
    } else {
      // Add all columns that migration 0042 defined but may be absent if the
      // table was created by an earlier schema version. No AFTER clause — MySQL
      // appends at the end, which is fine. Already-present columns are skipped.
      const wsi = "site_work_site_info";
      await addColumnIfMissing(conn, wsi, "customerOrgId",            "int");
      await addColumnIfMissing(conn, wsi, "siteContactName",          "varchar(255)");
      await addColumnIfMissing(conn, wsi, "siteContactPhone",         "varchar(50)");
      await addColumnIfMissing(conn, wsi, "siteContactEmail",         "varchar(320)");
      await addColumnIfMissing(conn, wsi, "propertyManagerName",      "varchar(255)");
      await addColumnIfMissing(conn, wsi, "propertyManagerPhone",     "varchar(50)");
      await addColumnIfMissing(conn, wsi, "propertyManagerEmail",     "varchar(320)");
      await addColumnIfMissing(conn, wsi, "accessNotes",              "text");
      await addColumnIfMissing(conn, wsi, "keyLocation",              "text");
      await addColumnIfMissing(conn, wsi, "keyNumber",                "varchar(50)");
      await addColumnIfMissing(conn, wsi, "lockboxCode",              "varchar(50)");
      await addColumnIfMissing(conn, wsi, "parkingNotes",             "text");
      await addColumnIfMissing(conn, wsi, "serviceEntranceNotes",     "text");
      await addColumnIfMissing(conn, wsi, "fireAlarmPanelMake",       "varchar(100)");
      await addColumnIfMissing(conn, wsi, "fireAlarmPanelModel",      "varchar(100)");
      await addColumnIfMissing(conn, wsi, "fireAlarmPanelLocation",   "text");
      await addColumnIfMissing(conn, wsi, "annunciatorLocation",      "text");
      await addColumnIfMissing(conn, wsi, "monitoringCompany",        "varchar(255)");
      await addColumnIfMissing(conn, wsi, "monitoringPhone",          "varchar(50)");
      await addColumnIfMissing(conn, wsi, "monitoringAccount",        "varchar(100)");
      await addColumnIfMissing(conn, wsi, "sprinklerNotes",           "text");
      await addColumnIfMissing(conn, wsi, "backflowNotes",            "text");
      await addColumnIfMissing(conn, wsi, "emergencyLightingNotes",   "text");
      await addColumnIfMissing(conn, wsi, "fireExtinguisherNotes",    "text");
      await addColumnIfMissing(conn, wsi, "generalNotes",             "text");
      await addColumnIfMissing(conn, wsi, "lastImportedFromWorkbook", "timestamp NULL");
      await addColumnIfMissing(conn, wsi, "sourceWorkbookName",       "varchar(255)");
      await addColumnIfMissing(conn, wsi, "sourceSheetName",          "varchar(100)");
      await addColumnIfMissing(conn, wsi, "sourceUpdatedAt",          "timestamp NULL");
    }

    // ── 3. Create customer_contacts if missing (migration 0063 DDL) ─────────────
    console.log("\nChecking customer_contacts table...");
    const hasContacts = await tableExists(conn, "customer_contacts");

    if (hasContacts) {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM `customer_contacts`"
      );
      const cnt = (rows[0] as { cnt: number }).cnt;
      console.log(`customer_contacts: EXISTS — ${cnt} row(s)`);
    } else {
      console.log("customer_contacts: MISSING — creating...");
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS \`customer_contacts\` (
          \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
          \`companyId\` int NOT NULL,
          \`customerOrgId\` int,
          \`siteId\` int,
          \`name\` varchar(255) NOT NULL,
          \`title\` varchar(255),
          \`companyName\` varchar(255),
          \`email\` varchar(320),
          \`phone\` varchar(50),
          \`mobile\` varchar(50),
          \`role\` enum('property_manager','strata_manager','building_manager','site_contact','billing_contact','quote_approver','report_recipient','emergency_contact','tenant_contact','other') NOT NULL DEFAULT 'other',
          \`isPrimary\` tinyint NOT NULL DEFAULT 0,
          \`receivesReports\` tinyint NOT NULL DEFAULT 0,
          \`receivesQuotes\` tinyint NOT NULL DEFAULT 0,
          \`receivesInvoices\` tinyint NOT NULL DEFAULT 0,
          \`receivesServiceUpdates\` tinyint NOT NULL DEFAULT 0,
          \`receivesComplianceNotices\` tinyint NOT NULL DEFAULT 0,
          \`isSiteAccessContact\` tinyint NOT NULL DEFAULT 0,
          \`preferredMethod\` enum('email','phone','mobile','none','other') NOT NULL DEFAULT 'email',
          \`notes\` text,
          \`isActive\` tinyint NOT NULL DEFAULT 1,
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`cc_companyId_idx\` (\`companyId\`),
          INDEX \`cc_customerOrgId_idx\` (\`customerOrgId\`),
          INDEX \`cc_siteId_idx\` (\`siteId\`),
          INDEX \`cc_role_idx\` (\`companyId\`, \`role\`),
          INDEX \`cc_active_idx\` (\`companyId\`, \`isActive\`)
        )
      `);
      const confirmed = await tableExists(conn, "customer_contacts");
      if (confirmed) {
        console.log("customer_contacts: CREATED successfully");
      } else {
        console.error("customer_contacts: CREATE executed but table still not found — check DB permissions");
        process.exit(1);
      }
    }

    console.log("\nDone. Schema is up to date.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  const msg: string = err?.message ?? String(err);
  console.error("Error:", msg.replace(url ?? "", "[DATABASE_URL]"));
  process.exit(1);
});
