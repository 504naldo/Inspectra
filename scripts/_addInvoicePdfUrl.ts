/**
 * scripts/_addInvoicePdfUrl.ts
 *
 * Adds the pdfUrl column to the invoices table if it doesn't exist.
 * Safe to re-run — already-present columns are skipped.
 *
 * Usage:
 *   npx tsx scripts/_addInvoicePdfUrl.ts
 */

import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(url!);
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'pdfUrl' LIMIT 1`
    );
    if (rows.length > 0) {
      console.log("invoices.pdfUrl: already present — nothing to do.");
    } else {
      await conn.execute("ALTER TABLE `invoices` ADD COLUMN `pdfUrl` text");
      console.log("invoices.pdfUrl: ADDED");
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
