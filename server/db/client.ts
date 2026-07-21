// Shared Drizzle client (lazy singleton).
//
// Extracted from server/db.ts so that domain data-access modules (e.g.
// server/db/jobs.ts) and server/db.ts itself can share one connection without
// importing each other. server/db.ts re-exports getDb, so existing
// `import { getDb } from "../db"` call sites are unchanged.

import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";

/** The connected Drizzle database type. */
export type Db = ReturnType<typeof drizzle>;

let _db: Db | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
