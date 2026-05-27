/**
 * scripts/_applyCustomerContactsTable.ts
 *
 * Safe, targeted script that:
 *   1. Checks whether __drizzle_migrations tracking table exists in the DB
 *   2. Checks whether customer_contacts table exists
 *   3. If customer_contacts is missing, creates it using the exact DDL from
 *      drizzle/migrations/0063_customer_contacts.sql (CREATE TABLE IF NOT EXISTS —
 *      non-destructive, safe to re-run)
 *   4. Reports state before and after — does NOT print DATABASE_URL
 *
 * Usage:
 *   npx tsx scripts/_applyCustomerContactsTable.ts
 *
 * Requires DATABASE_URL in .env or environment.
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
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function main() {
  const conn = await mysql.createConnection(url!);

  try {
    // 1. Check __drizzle_migrations tracking table
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

    // 2. Check customer_contacts
    const hasContacts = await tableExists(conn, "customer_contacts");
    console.log(`customer_contacts: ${hasContacts ? "EXISTS" : "MISSING"}`);

    if (hasContacts) {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM `customer_contacts`"
      );
      const cnt = (rows[0] as { cnt: number }).cnt;
      console.log(`  → ${cnt} row(s) currently in customer_contacts`);
      console.log("Nothing to do — table already exists.");
      return;
    }

    // 3. Apply the DDL from migration 0063
    console.log("\nCreating customer_contacts table...");

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

    // 4. Confirm creation
    const created = await tableExists(conn, "customer_contacts");
    if (created) {
      console.log("customer_contacts: CREATED successfully");
    } else {
      console.error("customer_contacts: CREATE executed but table still not found — check DB permissions");
      process.exit(1);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  // Print error message without leaking connection string
  const msg: string = err?.message ?? String(err);
  console.error("Error:", msg.replace(url ?? "", "[DATABASE_URL]"));
  process.exit(1);
});
