import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { verifyPaymentGuardCall } from "./verifyPaymentGuards";

const RELEASE_GUIDANCE =
  "Verify database access and the reviewed migration history before restarting; startup does not apply migrations. See docs/runbooks/PR18_RELEASE_SAFETY.md.";

/** Keep driver diagnostics useful without logging SQL, parameters or connection details. */
function safeDatabaseCause(error: unknown): Error {
  const diagnostics: { code?: string; errno?: number; sqlState?: string } = {};
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const record = current as Record<string, unknown>;
    if (
      typeof record.code === "string" &&
      /^[A-Z0-9_]{1,64}$/.test(record.code)
    )
      diagnostics.code = record.code;
    if (
      Number.isInteger(record.errno) &&
      Number(record.errno) >= 0 &&
      Number(record.errno) <= 65535
    )
      diagnostics.errno = Number(record.errno);
    if (
      typeof record.sqlState === "string" &&
      /^[A-Z0-9]{5}$/.test(record.sqlState)
    )
      diagnostics.sqlState = record.sqlState;
    current = record.cause;
  }
  const details = Object.entries(diagnostics)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  return Object.assign(
    new Error(
      `Database preflight query failed${details ? ` (${details})` : ""}`
    ),
    diagnostics
  );
}

async function checkedSchemaQuery<T>(
  check: string,
  query: () => Promise<T>
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    throw new Error(
      `Required schema preflight failed for ${check}. ${RELEASE_GUIDANCE}`,
      {
        cause: safeDatabaseCause(error),
      }
    );
  }
}

/** Required columns must exist before a configured deployment serves traffic. */
export async function verifyAuditRequiredSchema() {
  const database = await checkedSchemaQuery("database connection", getDb);
  if (!database)
    throw new Error(
      `Required schema cannot be verified: database connection unavailable. ${RELEASE_GUIDANCE}`
    );
  for (const [check, query] of [
    [
      "users.sessionVersion (manual migration 0044; journal 0036)",
      sql`SELECT sessionVersion FROM users LIMIT 0`,
    ],
    [
      "fire_alarm_inspection_results.itemSnapshot/technicianCertificationSnapshot",
      sql`SELECT itemSnapshot, technicianCertificationSnapshot FROM fire_alarm_inspection_results LIMIT 0`,
    ],
    [
      "jobs.googleCalendarOwnerId/googleCalendarId (manual migration 0086; journal 0036)",
      sql`SELECT googleCalendarOwnerId, googleCalendarId FROM jobs LIMIT 0`,
    ],
    [
      "invoice_payments.requestId/result (manual migration 0086; journal 0036)",
      sql`SELECT requestId, result FROM invoice_payments LIMIT 0`,
    ],
    [
      "email_outbox.requestId/status/providerMessageId (manual migration 0086; journal 0036)",
      sql`SELECT requestId, status, providerMessageId FROM email_outbox LIMIT 0`,
    ],
  ] as const)
    await checkedSchemaQuery(check, () => database.execute(query));
  const [rows] = await checkedSchemaQuery(
    "legacy fire-alarm snapshot evidence",
    () =>
      database.execute(
        sql`SELECT id FROM fire_alarm_inspection_results WHERE itemSnapshot IS NULL LIMIT 1`
      )
  );
  if ((rows as unknown as unknown[]).length)
    throw new Error(
      `Legacy fire-alarm snapshots need reviewed remediation before release. ${RELEASE_GUIDANCE}`
    );
  const [packet] = await checkedSchemaQuery(
    "live payment protocol v2 guard attestation",
    () => database.execute(sql`CALL inspectra_attest_payment_guards_v1()`)
  );
  if (!verifyPaymentGuardCall(packet, process.env.INSPECTRA_PAYMENT_GUARD_DEFINER))
    throw new Error(
      `Exact payment protocol v2 migration guards are required before startup. ${RELEASE_GUIDANCE}`
    );

  const [taxShape] = await checkedSchemaQuery(
    "invoices.confirmedTax reviewed split-tax storage",
    () => database.execute(sql`SELECT DATA_TYPE AS dataType, IS_NULLABLE AS isNullable,
      COLUMN_DEFAULT AS columnDefault, EXTRA AS extra
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME='invoices' AND COLUMN_NAME='confirmedTax'`)
  );
  const rowsForTax = taxShape as unknown as Record<string, unknown>[];
  if (!Array.isArray(rowsForTax) || rowsForTax.length !== 1 ||
      rowsForTax[0]?.dataType !== "json" || rowsForTax[0]?.isNullable !== "YES" ||
      rowsForTax[0]?.columnDefault !== null || rowsForTax[0]?.extra !== "")
    throw new Error(
      `Required schema preflight failed for invoices.confirmedTax: expected nullable JSON with no default or generated expression. ${RELEASE_GUIDANCE}`
    );
}
