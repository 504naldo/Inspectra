const EXPECTED = new Map<string, readonly [string, string, string]>([
  ["inspectra_payment_insert_v2", ["invoice_payments", "INSERT", "3f166278cfcb28bf38f565100ba4901b12504b218c111b4a825f998d73063acd"]],
  ["inspectra_payment_no_update", ["invoice_payments", "UPDATE", "58aa2ba4dc5668f4e19c0a04855c4b7b9868bceae64eb2c94cb7a609ea8ac21c"]],
  ["inspectra_payment_no_delete", ["invoice_payments", "DELETE", "58aa2ba4dc5668f4e19c0a04855c4b7b9868bceae64eb2c94cb7a609ea8ac21c"]],
  ["inspectra_invoice_payment_v2", ["invoices", "UPDATE", "65d8daa0fbaaa0103ce867d4c28d309d80b5ed674814b06c96a5a8e071a94ff9"]],
]);
const SQL_MODES = "ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,NO_ZERO_DATE,NO_ZERO_IN_DATE,STRICT_ALL_TABLES";
const COLLATION = "utf8mb4_0900_ai_ci";
function recordedSqlMode(value: unknown) {
  return typeof value === "string" ? value.split(",").sort().join(",") : null;
}

/** Strictly compare live metadata returned by the reviewed procedure, not a stored receipt. */
export function verifyPaymentGuardRows(rows: unknown, expectedDefiner: string | undefined): boolean {
  if (!expectedDefiner?.match(/^[a-zA-Z0-9_]{1,32}@[a-zA-Z0-9_.:%-]{1,255}$/) ||
      !Array.isArray(rows) || rows.length !== EXPECTED.size) return false;
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const r = row as Record<string, unknown>;
    const name = r.trigger_name;
    if (typeof name !== "string" || seen.has(name)) return false;
    seen.add(name);
    const expected = EXPECTED.get(name);
    if (!expected || r.object_table !== expected[0] || r.event_type !== expected[1] ||
        r.body_hash !== expected[2] || r.action_timing !== "BEFORE" ||
        (r.action_order !== 1 && r.action_order !== "1") ||
        r.guard_definer !== expectedDefiner || r.attestor_definer !== expectedDefiner ||
        recordedSqlMode(r.creation_mode) !== SQL_MODES || r.client_charset !== "utf8mb4" ||
        r.connection_collation !== COLLATION || r.database_collation !== COLLATION) return false;
  }
  return true;
}

/** mysql2 CALL's first packet is result sets followed by a routine result header. */
export function verifyPaymentGuardCall(packet: unknown, expectedDefiner: string | undefined): boolean {
  return Array.isArray(packet) && packet.length === 2 &&
    verifyPaymentGuardRows(packet[0], expectedDefiner);
}
