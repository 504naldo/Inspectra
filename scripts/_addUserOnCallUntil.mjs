/**
 * scripts/_addUserOnCallUntil.mjs
 *
 * Applies migration 0073_user_oncall_until.sql — adds the onCallUntil column to users.
 * Safe to re-run — already-present columns are skipped.
 *
 * Usage:
 *   node scripts/_addUserOnCallUntil.mjs
 */

import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(url);
  try {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'onCallUntil' LIMIT 1`
    );
    if (rows.length > 0) {
      console.log("users.onCallUntil: already present — nothing to do.");
    } else {
      await conn.execute("ALTER TABLE `users` ADD COLUMN `onCallUntil` timestamp NULL");
      console.log("users.onCallUntil: ADDED");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  const msg = err?.message ?? String(err);
  console.error("Error:", msg.replace(url ?? "", "[DATABASE_URL]"));
  process.exit(1);
});
