/**
 * scripts/_addUserOnCall.mjs
 *
 * Applies migration 0072_user_on_call.sql — adds the isOnCall column to users.
 * Safe to re-run — already-present columns are skipped.
 *
 * Usage:
 *   node scripts/_addUserOnCall.mjs
 */

import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(url);
  try {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'isOnCall' LIMIT 1`
    );
    if (rows.length > 0) {
      console.log("users.isOnCall: already present — nothing to do.");
    } else {
      await conn.execute("ALTER TABLE `users` ADD COLUMN `isOnCall` tinyint NOT NULL DEFAULT 0");
      console.log("users.isOnCall: ADDED");
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
