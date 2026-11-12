import { describe, expect, it, vi } from "vitest";
import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import {
  buildSchemaContract,
  checkSchemaContract,
  metadataQueries,
  normalizeMySqlType,
  type TableContract,
} from "./schemaContract";

const example = mysqlTable(
  "example",
  {
    id: int("id").primaryKey(),
    email: varchar("email", { length: 80 }).unique(),
    active: boolean("active").notNull(),
    role: mysqlEnum("role", ["Admin", "user"]),
  },
  t => [
    index("email_idx").on(t.email),
    unique("email_active").on(t.email, t.active),
  ]
);
const contract = buildSchemaContract({ example });
function fixture(tables: TableContract[] = contract) {
  return {
    tables: tables.map(t => ({ TABLE_NAME: t.name, TABLE_TYPE: "BASE TABLE" })),
    columns: tables.flatMap(t =>
      t.columns.map(c => ({
        TABLE_NAME: t.name,
        COLUMN_NAME: c.name,
        COLUMN_TYPE: c.type,
        IS_NULLABLE: c.nullable ? "YES" : "NO",
      }))
    ),
    indexes: tables.flatMap(t =>
      t.indexes.flatMap(idx =>
        idx.columns.map((c, i) => ({
          TABLE_NAME: t.name,
          INDEX_NAME: idx.name,
          COLUMN_NAME: c,
          NON_UNIQUE: idx.unique ? 0 : 1,
          SEQ_IN_INDEX: i + 1,
          SUB_PART: null as number | null,
          INDEX_TYPE: idx.type,
          COLLATION: "A",
        }))
      )
    ),
  };
}
function adapter(data = fixture()) {
  return {
    query: vi.fn(async (sql: string, _parameters: string[]) => {
      const key = Object.entries(metadataQueries).find(
        ([, query]) => sql === query
      )?.[0] as keyof typeof data;
      if (!key) throw new Error("Unexpected query");
      return data[key];
    }),
    end: vi.fn(async () => {}),
  };
}

describe("read-only schema contract", () => {
  it("derives all current schema tables/columns and named constraints", () => {
    const actual = buildSchemaContract();
    expect(actual).toHaveLength(79);
    expect(actual.reduce((sum, t) => sum + t.columns.length, 0)).toBe(1348);
    expect(contract[0].indexes.map(i => i.name)).toEqual([
      "PRIMARY",
      "email_active",
      "email_idx",
      "example_email_unique",
    ]);
    expect(contract[0].columns.find(c => c.name === "active")?.type).toBe(
      "tinyint"
    );
  });
  it("accepts matching metadata, integer display widths, and closes connection", async () => {
    const data = fixture();
    data.columns.find(c => c.COLUMN_NAME === "active")!.COLUMN_TYPE =
      "tinyint(1)";
    const db = adapter(data);
    expect((await checkSchemaContract(db, "test", contract)).status).toBe(
      "compatible"
    );
    expect(db.end).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenCalledTimes(3);
    for (const [sql, parameters] of db.query.mock.calls) {
      expect(sql).toMatch(
        /^SELECT .* FROM INFORMATION_SCHEMA\.(TABLES|COLUMNS|STATISTICS) WHERE TABLE_SCHEMA = \?/
      );
      expect(sql).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i
      );
      expect(parameters).toEqual(["test"]);
    }
  });
  it("normalizes only integer widths, preserving signedness, decimal precision and enum case", () => {
    expect(normalizeMySqlType("int(11) unsigned")).toBe("int unsigned");
    for (const type of [
      "decimal(12,4)",
      "varchar(20)",
      "enum('Admin','user')",
      "int unsigned",
      "timestamp(6)",
    ])
      expect(normalizeMySqlType(type)).toBe(type);
  });
  it("classifies missing tables without spurious per-column findings", async () => {
    const data = fixture();
    data.tables = [];
    expect(
      (await checkSchemaContract(adapter(data), "test", contract)).findings.map(
        f => f.code
      )
    ).toEqual(["missing_table"]);
  });
  it("detects absent columns, type and nullability drift and review-only legacy columns", async () => {
    const data = fixture();
    data.columns = data.columns.filter(c => c.COLUMN_NAME !== "email");
    data.columns.find(c => c.COLUMN_NAME === "id")!.COLUMN_TYPE =
      "int unsigned";
    data.columns.find(c => c.COLUMN_NAME === "active")!.IS_NULLABLE = "YES";
    data.columns.push({
      TABLE_NAME: "example",
      COLUMN_NAME: "legacy",
      COLUMN_TYPE: "text",
      IS_NULLABLE: "YES",
    });
    const report = await checkSchemaContract(adapter(data), "test", contract);
    expect(report.status).toBe("drift");
    expect(report.findings.map(f => f.code)).toEqual([
      "column_nullability_mismatch",
      "missing_column",
      "column_type_mismatch",
      "extra_column",
    ]);
    expect(report.findings.find(f => f.code === "extra_column")?.severity).toBe(
      "review"
    );
  });
  it("preserves enum distinctions", async () => {
    const data = fixture();
    data.columns.find(c => c.COLUMN_NAME === "role")!.COLUMN_TYPE =
      "enum('admin','user')";
    expect(
      (await checkSchemaContract(adapter(data), "test", contract)).findings[0]
        .code
    ).toBe("column_type_mismatch");
  });
  it.each(["unique", "prefix", "direction", "order", "type", "missing"])(
    "detects %s index drift",
    async mode => {
      const data = fixture();
      const idx = data.indexes.find(i => i.INDEX_NAME === "email_active")!;
      if (mode === "unique") idx.NON_UNIQUE = 1;
      if (mode === "prefix") idx.SUB_PART = 10;
      if (mode === "direction") idx.COLLATION = "D";
      if (mode === "order") idx.COLUMN_NAME = "active";
      if (mode === "type") idx.INDEX_TYPE = "HASH";
      if (mode === "missing")
        data.indexes = data.indexes.filter(
          i => i.INDEX_NAME !== "email_active"
        );
      expect(
        (await checkSchemaContract(adapter(data), "test", contract)).findings[0]
          .code
      ).toBe(mode === "missing" ? "missing_index" : "index_mismatch");
    }
  );
  it("reports extra tables/indexes for review and does not mutate input", async () => {
    const data = fixture();
    data.tables.push({ TABLE_NAME: "legacy", TABLE_TYPE: "BASE TABLE" });
    data.indexes.push({ ...data.indexes[0], INDEX_NAME: "legacy_index" });
    const before = JSON.stringify(data);
    const report = await checkSchemaContract(adapter(data), "test", contract);
    expect(report.findings.map(f => f.code).sort()).toEqual([
      "extra_index",
      "extra_table",
    ]);
    expect(report.findings.every(f => f.severity === "review")).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("separates preserved legacy review from blocking drift and recognizes only migration metadata names", async () => {
    const data = fixture();
    data.tables.push(
      { TABLE_NAME: "__drizzle_migrations", TABLE_TYPE: "BASE TABLE" },
      { TABLE_NAME: "__schema_migrations", TABLE_TYPE: "BASE TABLE" }
    );
    const known = await checkSchemaContract(adapter(data), "test", contract);
    expect(known.status).toBe("compatible");
    expect(known.migrationMetadataTables).toEqual([
      "__drizzle_migrations",
      "__schema_migrations",
    ]);
    data.columns.push({
      TABLE_NAME: "example",
      COLUMN_NAME: "legacy",
      COLUMN_TYPE: "text",
      IS_NULLABLE: "YES",
    });
    const review = await checkSchemaContract(adapter(data), "test", contract);
    expect(review.status).toBe("drift");
    expect(review.blockingCount).toBe(0);
    expect(review.reviewCount).toBe(1);
    expect(review.unknownCount).toBe(0);
  });
  it("has deterministic output independent of metadata row order", async () => {
    const data = fixture();
    data.columns[0].COLUMN_TYPE = "text";
    data.indexes[0].NON_UNIQUE = 1;
    const first = await checkSchemaContract(adapter(data), "test", contract);
    data.tables.reverse();
    data.columns.reverse();
    data.indexes.reverse();
    expect(await checkSchemaContract(adapter(data), "test", contract)).toEqual(
      first
    );
  });
  it.each([1, 2, 3])(
    "fails closed and cleans up on query %s failure without leaking errors",
    async n => {
      const db = adapter();
      let count = 0;
      const original = db.query.getMockImplementation()!;
      db.query.mockImplementation(async (...args) => {
        if (++count === n)
          throw new Error("mysql://user:SECRET@host/db customer row");
        return original(...args);
      });
      const report = await checkSchemaContract(db, "test", contract);
      expect(report.status).toBe("unknown");
      expect(JSON.stringify(report)).not.toContain("SECRET");
      expect(db.end).toHaveBeenCalledOnce();
    }
  );
  it("fails closed on invalid metadata and cleanup failure", async () => {
    const db = adapter();
    db.query.mockResolvedValueOnce([{}] as never);
    db.end.mockRejectedValueOnce(new Error("SECRET"));
    const report = await checkSchemaContract(db, "test", contract);
    expect(report.status).toBe("unknown");
    expect(report.findings.map(f => f.code)).toEqual([
      "connection_cleanup_failed",
      "metadata_verification_failed",
    ]);
    expect(JSON.stringify(report)).not.toContain("SECRET");
  });
});

describe("schema contract CLI guards", () => {
  it.each(["example.invalid", "localhost", "127.0.0.1", "[::1]"])(
    "enforces verified TLS except explicit loopback for %s",
    async host => {
      const mysql = (await import("mysql2/promise")).default;
      const connect = vi
        .spyOn(mysql, "createConnection")
        .mockRejectedValueOnce(new Error("Connection stub"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { runSchemaContractCli } = await import(
          "../scripts/checkSchemaContract"
        );
        expect(
          await runSchemaContractCli([
            "--database-url",
            `mysql://user:SECRET@${host}/test`,
          ])
        ).toBe(2);
        const options = connect.mock.calls[0][0] as unknown as {
          ssl?: { rejectUnauthorized: boolean };
          host: string;
        };
        if (host === "example.invalid")
          expect(options.ssl).toEqual({ rejectUnauthorized: true });
        else expect(options.ssl).toBeUndefined();
        expect(options.host).toBe(host.replace(/^\[|\]$/g, ""));
      } finally {
        connect.mockRestore();
        log.mockRestore();
      }
    }
  );

  it.each([
    "?host=other.invalid",
    "?database=other",
    "?socketPath=/tmp/mysql.sock",
    "?debug=true",
    "#fragment",
    "?",
    "#",
  ])(
    "rejects URL overrides or fragments %s before connecting",
    async suffix => {
      const mysql = (await import("mysql2/promise")).default;
      const connect = vi.spyOn(mysql, "createConnection");
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { runSchemaContractCli } = await import(
          "../scripts/checkSchemaContract"
        );
        expect(
          await runSchemaContractCli([
            "--database-url",
            `mysql://user:SECRET@example.invalid/test${suffix}`,
          ])
        ).toBe(2);
        expect(connect).not.toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
      } finally {
        connect.mockRestore();
        log.mockRestore();
      }
    }
  );
  it("bounds metadata queries and destroys the connection after a timeout", async () => {
    const mysql = (await import("mysql2/promise")).default;
    const query = vi.fn().mockRejectedValue(new Error("SECRET timeout"));
    const destroy = vi.fn();
    const connect = vi
      .spyOn(mysql, "createConnection")
      .mockResolvedValue({ query, destroy } as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { runSchemaContractCli } = await import(
        "../scripts/checkSchemaContract"
      );
      expect(
        await runSchemaContractCli([
          "--database-url",
          "mysql://user:SECRET@example.invalid/test",
        ])
      ).toBe(2);
      expect(query).toHaveBeenCalledWith(
        { sql: metadataQueries.tables, timeout: 15_000 },
        ["test"]
      );
      expect(destroy).toHaveBeenCalledOnce();
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      connect.mockRestore();
      log.mockRestore();
    }
  });

  it("accepts only an explicitly named URL environment variable without exposing it", async () => {
    const mysql = (await import("mysql2/promise")).default;
    const connect = vi
      .spyOn(mysql, "createConnection")
      .mockRejectedValueOnce(new Error("SECRET"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const key = "INSPECTRA_SCHEMA_CONTRACT_TEST_URL";
    const previous = process.env[key];
    process.env[key] = "mysql://user:SECRET@example.invalid/test";
    try {
      const { runSchemaContractCli } = await import(
        "../scripts/checkSchemaContract"
      );
      expect(await runSchemaContractCli(["--database-url-env", key])).toBe(2);
      expect(connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "example.invalid",
          user: "user",
          password: "SECRET",
          database: "test",
          connectTimeout: 10_000,
          multipleStatements: false,
          debug: false,
        })
      );
      connect.mockClear();
      delete process.env[key];
      expect(await runSchemaContractCli(["--database-url-env", key])).toBe(2);
      expect(connect).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
      connect.mockRestore();
      log.mockRestore();
    }
  });

  it("requires an explicit URL, ignores ambient DATABASE_URL, and never connects on missing input", async () => {
    const mysql = (await import("mysql2/promise")).default;
    const connect = vi.spyOn(mysql, "createConnection");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://should-not-be-used:SECRET@host/db";
    try {
      const { runSchemaContractCli } = await import(
        "../scripts/checkSchemaContract"
      );
      expect(await runSchemaContractCli([])).toBe(2);
      expect(connect).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      connect.mockRestore();
      log.mockRestore();
    }
  });
  it("sanitizes connection errors and fails closed", async () => {
    const mysql = (await import("mysql2/promise")).default;
    const connect = vi
      .spyOn(mysql, "createConnection")
      .mockRejectedValueOnce(new Error("SECRET connection detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { runSchemaContractCli } = await import(
        "../scripts/checkSchemaContract"
      );
      expect(
        await runSchemaContractCli([
          "--database-url",
          "mysql://user:SECRET@example.invalid/test",
        ])
      ).toBe(2);
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    } finally {
      connect.mockRestore();
      log.mockRestore();
    }
  });
});
