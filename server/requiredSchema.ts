import { sql } from "drizzle-orm";
import { getDb } from "./db";
/** Required columns must exist before a configured deployment serves traffic. */
export async function verifyAuditRequiredSchema() {
  const database = await getDb();
  if (!database) throw new Error("Required schema cannot be verified");
  for (const query of [
    sql`SELECT sessionVersion FROM users LIMIT 0`,
    sql`SELECT itemSnapshot, technicianCertificationSnapshot FROM fire_alarm_inspection_results LIMIT 0`,
    sql`SELECT googleCalendarOwnerId, googleCalendarId FROM jobs LIMIT 0`,
    sql`SELECT requestId, result FROM invoice_payments LIMIT 0`,
    sql`SELECT requestId, status, providerMessageId FROM email_outbox LIMIT 0`,
  ])
    await database.execute(query);
  const [rows] = await database.execute(
    sql`SELECT id FROM fire_alarm_inspection_results WHERE itemSnapshot IS NULL LIMIT 1`
  );
  if ((rows as unknown as unknown[]).length)
    throw new Error(
      "Legacy fire-alarm snapshots need reviewed remediation before release"
    );
  const [guards] = await database.execute(sql`SELECT COUNT(*) AS guardCount
    FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN
    ('inspectra_payment_insert_v2', 'inspectra_payment_no_update', 'inspectra_payment_no_delete', 'inspectra_invoice_payment_v2')`);
  if (Number((guards as unknown as { guardCount: number }[])[0]?.guardCount) !== 4)
    throw new Error("Payment protocol v2 migration guards are required before startup");
}
