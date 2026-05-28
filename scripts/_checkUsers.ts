import { config } from "dotenv";
import mysql from "mysql2/promise";

config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(url!);
  const [rows] = await conn.execute(
    "SELECT id, email, googleAccessToken IS NOT NULL AS hasToken FROM users LIMIT 10"
  );
  console.table(rows);
  await conn.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
