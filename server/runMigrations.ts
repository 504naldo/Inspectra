/**
 * Read-only startup migration preflight. Journal installations are verified by
 * requiredSchema; manual histories must have no pending files. Explicit
 * maintenance runs apply sequentially, stop on failure and refuse historical
 * backfills/constraint changes that require reviewed evidence.
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Split SQL text into individual statements, respecting single-quoted string
 * literals so that semicolons inside strings are not treated as terminators.
 * Also strips line comments (-- ...).
 */
export function splitSqlStatements(sql: string): string[] {
  if (/^DELIMITER /m.test(sql)) {
    const statements: string[] = [];
    let delimiter = ";", chunk = "";
    for (const line of sql.split("\n")) {
      const change = /^DELIMITER\s+(\S+)\s*$/.exec(line);
      if (change) {
        if (chunk.trim()) statements.push(...(delimiter === ";" ? splitSqlStatements(chunk) : chunk.split(delimiter).map(s => s.trim()).filter(Boolean)));
        chunk = ""; delimiter = change[1];
      } else chunk += line + "\n";
    }
    if (chunk.trim()) statements.push(...(delimiter === ";" ? splitSqlStatements(chunk) : chunk.split(delimiter).map(s => s.trim()).filter(Boolean)));
    return statements;
  }
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (inString) {
      current += ch;
      if (ch === "'") {
        if (i + 1 < sql.length && sql[i + 1] === "'") {
          // Escaped single quote inside string — consume both characters
          i++;
          current += sql[i];
        } else {
          inString = false;
        }
      }
      i++;
      continue;
    }

    // Not inside a string literal
    if (ch === "'") {
      inString = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === "-" && i + 1 < sql.length && sql[i + 1] === "-") {
      // Line comment — skip to end of line
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    if (ch === ";") {
      const stmt = current.trim();
      if (stmt.length > 0) statements.push(stmt);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const remaining = current.trim();
  if (remaining.length > 0) statements.push(remaining);

  return statements.filter((s) => s.length > 0 && !s.startsWith("--"));
}

export async function runMigrations(options: { databaseUrl?: string; migrationsDir?: string; apply?: boolean } = {}): Promise<void> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[Migrations] DATABASE_URL not set, skipping migrations.");
    return;
  }

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);

    // Startup is read-only: explicit maintenance runs alone may execute DDL.
    // Journal installations must not replay the unrelated manual history.
    const [journal] = await connection.query<mysql.RowDataPacket[]>("SHOW TABLES LIKE '__drizzle_migrations'");
    if (journal.length && !options.migrationsDir) return;
    if (!options.apply) {
      const directory = options.migrationsDir ?? path.resolve(__dirname, "../drizzle/migrations");
      if (!fs.existsSync(directory)) throw new Error("Migration history directory unavailable");
      const [recorded] = await connection.query<mysql.RowDataPacket[]>("SELECT migration_name FROM __schema_migrations");
      const applied = new Set(recorded.map(row => row.migration_name));
      const pending = fs.readdirSync(directory).filter(file => file.endsWith(".sql") && file !== "RAILWAY_CATCHUP.sql" && !applied.has(file));
      if (pending.length) throw new Error(`Explicit maintenance required; startup will not apply pending migrations: ${pending.join(", ")}`);
      return;
    }
    // Ensure the migrations tracking table exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS __schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(256) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Find all migration files
    const migrationsDir = options.migrationsDir ?? path.resolve(__dirname, "../drizzle/migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log("[Migrations] No migrations directory found, skipping.");
      return;
    }

    // RAILWAY_CATCHUP.sql is a consolidated, manual-only reference (its own
    // header says to paste statements one at a time into Railway's query
    // console) — it uses MariaDB-only "IF NOT EXISTS" ALTER syntax that
    // throws a real syntax error on Railway's vanilla MySQL, which isn't
    // one of the "already applied" errors this loop knows how to ignore.
    // Auto-applying it here would needlessly retry on every boot.
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && f !== "RAILWAY_CATCHUP.sql")
      .sort();

    // Get already-applied migrations
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      "SELECT migration_name FROM __schema_migrations"
    );
    const applied = new Set(rows.map((r) => r.migration_name as string));

    // Explicit maintenance only: stop at the first error so later constraints
    // never overtake an incomplete prerequisite. Retry committed DDL safely.
    for (const file of migrationFiles) {
      if (applied.has(file)) continue;

      if (/^00(06|10|11|12|13|14|15)_/.test(file))
        throw new Error(`Migration ${file} requires reviewed historical evidence and explicit separate maintenance; no automatic backfill or constraint tightening`);

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      // Split on semicolons using a quote-aware parser so that semicolons
      // inside SQL string literals (e.g. 'specification; or documentation.')
      // are not treated as statement terminators.
      const statements = splitSqlStatements(sql);

      console.log(`[Migrations] Applying: ${file}`);
      try {
        for (const stmt of statements) {
          try {
            await connection.query(stmt);
          } catch (err: unknown) {
            const error = err as { code?: string; message?: string };
            // Ignore "column/key/table already exists" errors so migrations
            // are idempotent across retries of a partially-applied file.
            if (
              error.code === "ER_DUP_FIELDNAME" ||
              error.code === "ER_TABLE_EXISTS_ERROR" ||
              error.code === "ER_DUP_KEYNAME" ||
              error.code === "ER_TRG_ALREADY_EXISTS" ||
              error.message?.includes("Duplicate column name") ||
              error.message?.includes("Duplicate key name") ||
              error.message?.includes("already exists")
            ) {
              console.warn(`[Migrations] Skipping already-applied statement in ${file}: ${error.message}`);
            } else {
              throw err;
            }
          }
        }

        // Mark migration as applied
        await connection.execute(
          "INSERT INTO __schema_migrations (migration_name) VALUES (?)",
          [file]
        );
        console.log(`[Migrations] Applied: ${file}`);
      } catch (err) {
        console.error(`[Migrations] Failed to apply ${file}, will retry on next boot:`, err);
        throw err;
      }
    }

    console.log("[Migrations] Finished migration pass.");
  } catch (err) {
    console.error("[Migrations] Migration failed:", err);
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}
