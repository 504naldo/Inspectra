// Test-only helper for a random isolated local database. Do not use for operational DDL.
import { readFile } from "node:fs/promises";
import type mysql from "mysql2/promise";
import { splitSqlStatements } from "../runMigrations";

export async function installPaymentGuardAttestationFixture(connection: mysql.Connection) {
  const [identity] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT DATABASE() AS db, CURRENT_USER() AS definer, @@SESSION.sql_mode AS mode, @@SESSION.collation_connection AS collation, @@SESSION.character_set_client AS charset"
  );
  const { db, definer, mode, collation, charset } = identity[0];
  if (typeof db !== "string" || !/^inspectra_(?:recovery|forward)_[a-f0-9]+$/.test(db)) {
    throw new Error("Guard attestation fixture requires an owned random local DB");
  }
  const exactGuards = splitSqlStatements(
    await readFile("drizzle/migrations/0087_payment_protocol_guard.sql", "utf8")
  );
  const routine = splitSqlStatements(
    await readFile("docs/runbooks/sql/inspectra_attest_payment_guards_v1.sql", "utf8")
  );
  if (exactGuards.length !== 4 || routine.length !== 1) throw new Error("Unexpected fixture DDL");
  await connection.query("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
  await connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci");
  try {
    for (const exact of exactGuards) {
      const name = /^CREATE TRIGGER (inspectra_[a-z_0-9]+) /i.exec(exact.trim())?.[1];
      if (!name) throw new Error("Unexpected payment guard name");
      await connection.query("DROP TRIGGER IF EXISTS `" + name + "`");
      await connection.query(exact);
    }
    await connection.query(routine[0]);

  } finally {
    await connection.query("SET SESSION sql_mode = ?, SESSION character_set_client = ?, SESSION collation_connection = ?", [mode, charset, collation]);
  }
  return String(definer);
}


export async function installConfirmedTaxStorageFixture(connection: mysql.Connection) {
  const [identity] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db");
  const db = identity[0]?.db;
  if (typeof db !== "string" || !/^inspectra_(?:recovery|forward)_[a-f0-9]+$/.test(db))
    throw new Error("Tax storage fixture requires an owned random local DB");
  const taxStorage = splitSqlStatements(
    await readFile("docs/runbooks/sql/inspectra_add_confirmed_invoice_tax.sql", "utf8")
  );
  if (taxStorage.length !== 1) throw new Error("Unexpected fixture tax DDL");
  await connection.query(taxStorage[0]);
}
