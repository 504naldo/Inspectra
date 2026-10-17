import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./runMigrations";

function canonicalSql(sql: string) {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .trim()
    .replace(/;$/, "")
    .replace(/\s+/g, " ");
}

describe("manual invoice-state migration", () => {
  it("passes each complete trigger to MySQL, matching the journal migration", () => {
    const manual = splitSqlStatements(
      readFileSync("drizzle/migrations/0091_invoice_payment_state_guards.sql", "utf8")
    );
    const journal = readFileSync(
      "drizzle/0041_invoice_payment_state_guards.sql", "utf8"
    ).split("--> statement-breakpoint");

    expect(manual).toHaveLength(2);
    expect(manual.map(canonicalSql)).toEqual(journal.map(canonicalSql));
    for (const statement of manual) {
      expect(canonicalSql(statement)).toMatch(/^CREATE TRIGGER .+ BEGIN .+ END$/);
      expect(statement).not.toMatch(/DELIMITER/);
    }
  });
});
