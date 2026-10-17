import assert from 'node:assert/strict';

export const paymentGuardNames = Object.freeze([
  'inspectra_invoice_payment_state_v3',
  'inspectra_invoice_payment_v2',
  'inspectra_invoice_unpaid_insert_v3',
  'inspectra_payment_insert_v2',
  'inspectra_payment_no_delete',
  'inspectra_payment_no_update',
]);

/** These destructive rehearsals must never infer a target from integration credentials. */
export function disposableDatabaseUrl(env = process.env) {
  if (env.DISPOSABLE_DB_ACCEPTANCE !== 'true')
    throw Error('DISPOSABLE_DB_ACCEPTANCE=true is required for synthetic database acceptance');
  let url;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch {
    throw Error('An explicitly isolated loopback Inspectra database URL is required');
  }
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      !/^\/inspectra_[a-zA-Z0-9_]+$/.test(url.pathname) || !url.username || url.search || url.hash)
    throw Error('An explicitly isolated loopback Inspectra database URL without overrides is required');
  return url;
}

/** Fail before exercising a built server when any new evidence/guard migration is absent. */
export async function assertCurrentPaymentSchema(connection) {
  const [columns] = await connection.query(`
    SELECT TABLE_NAME tableName, COLUMN_NAME columnName FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND (
      (TABLE_NAME='inspection_template_responses' AND COLUMN_NAME='itemSnapshot') OR
      (TABLE_NAME='jobs' AND COLUMN_NAME IN ('finalizationHashVersion','tech_signature_key','contact_signature_key')) OR
      (TABLE_NAME IN ('inspection_results','deficiencies') AND COLUMN_NAME='deviceSnapshot'))`);
  assert.deepEqual(columns.map(row => `${row.tableName}.${row.columnName}`).sort(), [
    'deficiencies.deviceSnapshot', 'inspection_results.deviceSnapshot',
    'inspection_template_responses.itemSnapshot', 'jobs.contact_signature_key',
    'jobs.finalizationHashVersion', 'jobs.tech_signature_key',
  ]);
  const [triggers] = await connection.query(`
    SELECT TRIGGER_NAME name FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'inspectra_%'`);
  assert.deepEqual(triggers.map(row => row.name).sort(), paymentGuardNames);
}
