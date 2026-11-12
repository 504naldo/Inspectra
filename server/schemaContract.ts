import { is } from "drizzle-orm";
import {
  getTableConfig,
  MySqlColumn,
  MySqlTable,
} from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";

export interface ColumnContract {
  name: string;
  type: string;
  nullable: boolean;
}
export interface IndexContract {
  name: string;
  columns: string[];
  unique: boolean;
  type: string;
}
export interface TableContract {
  name: string;
  columns: ColumnContract[];
  indexes: IndexContract[];
}
export interface SchemaFinding {
  severity: "blocking" | "review" | "unknown";
  code: string;
  table?: string;
  object?: string;
  expected?: string;
  actual?: string;
}
export interface SchemaContractReport {
  status: "compatible" | "drift" | "unknown";
  expectedTables: number;
  expectedColumns: number;
  blockingCount: number;
  reviewCount: number;
  unknownCount: number;
  migrationMetadataTables: string[];
  findings: SchemaFinding[];
  // Compatibility here covers only these properties, not overall release readiness.
  scope: string[];
  notVerified: string[];
}
export interface MetadataAdapter {
  query(sql: string, parameters: string[]): Promise<unknown>;
  end(): Promise<unknown>;
}

/** Preserve enum spelling/case, precision, signedness and all non-integer widths. */
export function normalizeMySqlType(type: string): string {
  return type
    .trim()
    .replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)/i, "$1");
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Uses Drizzle metadata rather than migration ledgers or hand-maintained lists. */
export function buildSchemaContract(
  exports: Record<string, unknown> = schema
): TableContract[] {
  const tables = new Map<string, TableContract>();
  for (const value of Object.values(exports)) {
    if (!is(value, MySqlTable)) continue;
    const config = getTableConfig(value);
    const indexes: IndexContract[] = [];
    const add = (
      name: string | undefined,
      columns: MySqlColumn[],
      unique: boolean,
      type = "BTREE"
    ) => {
      if (!name) throw new Error("Unsupported unnamed index contract");
      indexes.push({
        name,
        columns: columns.map(c => c.name),
        unique,
        type: type.toUpperCase(),
      });
    };
    const primary = config.columns.filter(c => c.primary);
    if (primary.length) add("PRIMARY", primary, true);
    for (const key of config.primaryKeys) add("PRIMARY", key.columns, true);
    for (const column of config.columns)
      if (column.isUnique) add(column.uniqueName, [column], true);
    for (const key of config.uniqueConstraints)
      add(key.getName(), key.columns, true);
    for (const index of config.indexes) {
      if (!index.config.columns.every(c => is(c, MySqlColumn)))
        throw new Error("Expression indexes require explicit verification");
      add(
        index.config.name,
        index.config.columns as MySqlColumn[],
        !!index.config.unique,
        index.config.using
      );
    }
    if (tables.has(config.name)) throw new Error("Duplicate table contract");
    tables.set(config.name, {
      name: config.name,
      columns: config.columns
        .map(c => ({
          name: c.name,
          // MySQL implements BOOLEAN as TINYINT(1); this is a known physical alias.
          type: normalizeMySqlType(
            c.getSQLType() === "boolean" ? "tinyint" : c.getSQLType()
          ),
          nullable: !c.notNull,
        }))
        .sort((a, b) => compare(a.name, b.name)),
      indexes: indexes.sort((a, b) => compare(a.name, b.name)),
    });
  }
  if (!tables.size) throw new Error("Empty schema contract");
  return Array.from(tables.values()).sort((a, b) => compare(a.name, b.name));
}

// Explicit metadata-only projections: never read application rows, defaults or credentials.
export const metadataQueries = {
  tables:
    "SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
  columns:
    "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION",
  indexes:
    "SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX, SUB_PART, INDEX_TYPE, COLLATION FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
} as const;
// Presence is recorded only; these names do not prove a migration was applied.
export const migrationMetadataTableNames = [
  "__schema_migrations",
  "__drizzle_migrations",
] as const;
type Row = Record<string, unknown>;
function rows(result: unknown, required: string[]): Row[] {
  if (
    !Array.isArray(result) ||
    !result.every(
      r => r && typeof r === "object" && required.every(k => k in r)
    )
  )
    throw new Error("Invalid metadata result");
  return result as Row[];
}

/** Owns and always closes the adapter, including on query failure. No SQL mutations. */
export async function checkSchemaContract(
  adapter: MetadataAdapter,
  database: string,
  suppliedContract?: TableContract[]
): Promise<SchemaContractReport> {
  const findings: SchemaFinding[] = [];
  let contract = suppliedContract ?? [];
  const report: SchemaContractReport = {
    status: "unknown",
    blockingCount: 0,
    reviewCount: 0,
    unknownCount: 0,
    migrationMetadataTables: [],
    expectedTables: contract.length,
    expectedColumns: contract.reduce((sum, t) => sum + t.columns.length, 0),
    findings,
    notVerified: [
      "column defaults and generated expressions",
      "auto-increment attributes",
      "foreign keys and check constraints",
      "character sets and collations",
      "index visibility",
      "triggers, routines and scheduled events",
      "data contents and migration history",
      "concurrent DDL changes (metadata reads are not an atomic snapshot)",
    ],
    scope: [
      "tables",
      "column types",
      "column nullability",
      "named index columns/order/uniqueness/type/prefix/direction",
    ],
  };
  try {
    contract = suppliedContract ?? buildSchemaContract();
    report.expectedTables = contract.length;
    report.expectedColumns = contract.reduce(
      (sum, t) => sum + t.columns.length,
      0
    );
    if (!database || !contract.length)
      throw new Error("Missing database or contract");
    const tables = rows(
      await adapter.query(metadataQueries.tables, [database]),
      ["TABLE_NAME", "TABLE_TYPE"]
    );
    const columns = rows(
      await adapter.query(metadataQueries.columns, [database]),
      ["TABLE_NAME", "COLUMN_NAME", "COLUMN_TYPE", "IS_NULLABLE"]
    );
    const indexes = rows(
      await adapter.query(metadataQueries.indexes, [database]),
      [
        "TABLE_NAME",
        "INDEX_NAME",
        "COLUMN_NAME",
        "NON_UNIQUE",
        "SEQ_IN_INDEX",
        "SUB_PART",
        "INDEX_TYPE",
        "COLLATION",
      ]
    );
    const add = (
      code: string,
      table: string,
      object?: string,
      expected?: string,
      actual?: string,
      severity: SchemaFinding["severity"] = "blocking"
    ) => findings.push({ code, table, object, expected, actual, severity });
    for (const table of contract) {
      const actualTable = tables.find(r => r.TABLE_NAME === table.name);
      if (!actualTable) {
        add("missing_table", table.name);
        continue;
      }
      if (actualTable.TABLE_TYPE !== "BASE TABLE")
        add(
          "table_kind_mismatch",
          table.name,
          undefined,
          "BASE TABLE",
          String(actualTable.TABLE_TYPE)
        );
      const actualColumns = columns.filter(r => r.TABLE_NAME === table.name);
      for (const column of table.columns) {
        const actual = actualColumns.find(r => r.COLUMN_NAME === column.name);
        if (!actual) {
          add("missing_column", table.name, column.name);
          continue;
        }
        if (
          typeof actual.COLUMN_TYPE !== "string" ||
          !["YES", "NO"].includes(String(actual.IS_NULLABLE))
        )
          throw new Error("Invalid column metadata");
        if (
          normalizeMySqlType(column.type) !==
          normalizeMySqlType(actual.COLUMN_TYPE)
        )
          add(
            "column_type_mismatch",
            table.name,
            column.name,
            column.type,
            actual.COLUMN_TYPE
          );
        if (column.nullable !== (actual.IS_NULLABLE === "YES"))
          add(
            "column_nullability_mismatch",
            table.name,
            column.name,
            column.nullable ? "YES" : "NO",
            String(actual.IS_NULLABLE)
          );
      }
      for (const column of actualColumns)
        if (!table.columns.some(c => c.name === column.COLUMN_NAME))
          add(
            "extra_column",
            table.name,
            String(column.COLUMN_NAME),
            undefined,
            undefined,
            "review"
          );
      const actualIndexes = indexes.filter(r => r.TABLE_NAME === table.name);
      for (const index of table.indexes) {
        const actual = actualIndexes
          .filter(r => r.INDEX_NAME === index.name)
          .sort((a, b) => Number(a.SEQ_IN_INDEX) - Number(b.SEQ_IN_INDEX));
        if (!actual.length) {
          add("missing_index", table.name, index.name);
          continue;
        }
        const valid =
          actual.length === index.columns.length &&
          actual.every(
            (r, i) =>
              r.COLUMN_NAME === index.columns[i] &&
              Number(r.SEQ_IN_INDEX) === i + 1 &&
              Number(r.NON_UNIQUE) === (index.unique ? 0 : 1) &&
              r.SUB_PART === null &&
              r.INDEX_TYPE === index.type &&
              (r.COLLATION === "A" ||
                (index.type === "HASH" && r.COLLATION === null))
          );
        if (!valid)
          add(
            "index_mismatch",
            table.name,
            index.name,
            JSON.stringify(index),
            JSON.stringify(actual)
          );
      }
      for (const name of Array.from(
        new Set(actualIndexes.map(r => String(r.INDEX_NAME)))
      ))
        if (!table.indexes.some(i => i.name === name))
          add("extra_index", table.name, name, undefined, undefined, "review");
    }
    report.migrationMetadataTables = tables
      .map(t => String(t.TABLE_NAME))
      .filter(name =>
        migrationMetadataTableNames.some(allowed => allowed === name)
      )
      .sort(compare);
    for (const table of tables)
      if (
        !contract.some(t => t.name === table.TABLE_NAME) &&
        !report.migrationMetadataTables.includes(String(table.TABLE_NAME))
      )
        add(
          "extra_table",
          String(table.TABLE_NAME),
          undefined,
          undefined,
          undefined,
          "review"
        );
  } catch {
    // Driver exceptions can contain URLs, credentials or server details: never print them.
    findings.push({
      code: "metadata_verification_failed",
      severity: "unknown",
    });
  } finally {
    try {
      await adapter.end();
    } catch {
      findings.push({ code: "connection_cleanup_failed", severity: "unknown" });
    }
  }
  findings.sort((a, b) =>
    compare(
      JSON.stringify([a.table, a.object, a.code]),
      JSON.stringify([b.table, b.object, b.code])
    )
  );
  report.blockingCount = findings.filter(f => f.severity === "blocking").length;
  report.reviewCount = findings.filter(f => f.severity === "review").length;
  report.unknownCount = findings.filter(f => f.severity === "unknown").length;
  report.status = findings.some(f => f.severity === "unknown")
    ? "unknown"
    : findings.length
      ? "drift"
      : "compatible";
  return report;
}
