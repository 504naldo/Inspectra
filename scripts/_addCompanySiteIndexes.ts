/**
 * scripts/_addCompanySiteIndexes.ts
 *
 * Applies migration 0071_company_site_indexes.sql — adds indexes on
 * companyId/siteId/customerOrgId for jobs, devices, sites, customer_orgs.
 * Safe to re-run — already-present indexes are skipped.
 *
 * Usage:
 *   npx tsx scripts/_addCompanySiteIndexes.ts
 */

import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const INDEXES: { table: string; index: string; columns: string }[] = [
  { table: "jobs", index: "jobs_companyId_idx", columns: "`companyId`" },
  { table: "jobs", index: "jobs_siteId_idx", columns: "`siteId`" },
  { table: "jobs", index: "jobs_customerOrgId_idx", columns: "`customerOrgId`" },
  { table: "devices", index: "devices_companyId_idx", columns: "`companyId`" },
  { table: "devices", index: "devices_siteId_idx", columns: "`siteId`" },
  { table: "sites", index: "sites_companyId_idx", columns: "`companyId`" },
  { table: "sites", index: "sites_customerOrgId_idx", columns: "`customerOrgId`" },
  { table: "customer_orgs", index: "customer_orgs_companyId_idx", columns: "`companyId`" },
];

async function main() {
  const conn = await mysql.createConnection(url!);
  try {
    for (const { table, index, columns } of INDEXES) {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [table, index]
      );
      if (rows.length > 0) {
        console.log(`${table}.${index}: already present — skipping.`);
      } else {
        await conn.execute(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
        console.log(`${table}.${index}: ADDED`);
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  const msg: string = err?.message ?? String(err);
  console.error("Error:", msg.replace(url ?? "", "[DATABASE_URL]"));
  process.exit(1);
});
