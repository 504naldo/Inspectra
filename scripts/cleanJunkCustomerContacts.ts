/**
 * scripts/cleanJunkCustomerContacts.ts
 *
 * Deletes customer_contacts rows where the name is clearly garbage data
 * (phone labels, buzzer codes, postal codes, bare emails, generic labels)
 * that were promoted from sites.summary.contacts[] during the backfill.
 *
 * Garbage patterns detected (same logic as cleanSiteContactNames.ts):
 *   1. Starts with "Contact Phone" or "Contact Email"
 *   2. Starts with "Phone Number:"
 *   3. Canadian postal code only (e.g. "V6J 1P5")
 *   4. Pure email address (contains @, no spaces before @)
 *   5. Generic labels: INVOICES, Office, ERIN/INVOICES, NEIL BUZZ 24
 *
 * Dry-run by default. Pass --apply to execute deletes.
 *
 * Usage:
 *   npx tsx scripts/cleanJunkCustomerContacts.ts --company 1
 *   npx tsx scripts/cleanJunkCustomerContacts.ts --company 1 --apply
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, and } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// ─── Pattern detection (mirrors cleanSiteContactNames.ts) ─────────────────────

const CA_POSTAL = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
const PURE_EMAIL = /^[^\s@]+@[^\s]+$/;
const GENERIC_LABELS = new Set([
  "invoices",
  "office",
  "erin/invoices",
  "neil buzz 24",
  "v6j 1p5",
  "v6v 3c2",
  "v6p 6p2",
]);

function isGarbage(name: string): { garbage: boolean; reason: string } {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  if (/^contact\s*phone/i.test(trimmed) || /^contact\s*email/i.test(trimmed)) {
    return { garbage: true, reason: "label (Contact Phone/Email)" };
  }
  if (/^phone\s*number:/i.test(trimmed)) {
    return { garbage: true, reason: "buzzer/access code entry" };
  }
  if (CA_POSTAL.test(trimmed)) {
    return { garbage: true, reason: "Canadian postal code" };
  }
  if (PURE_EMAIL.test(trimmed)) {
    return { garbage: true, reason: "email address used as name" };
  }
  if (GENERIC_LABELS.has(lower)) {
    return { garbage: true, reason: "generic label" };
  }

  return { garbage: false, reason: "" };
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let companyId = 1;
let apply = false;

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--company") companyId = parseInt(argv[++i], 10);
  else if (argv[i] === "--apply") apply = true;
  else if (argv[i].startsWith("--")) {
    console.error(`Unknown option: ${argv[i]}`);
    process.exit(1);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection(url!);
  const db = drizzle(conn, { schema, mode: "default" });

  const allContacts = await db
    .select({
      id: schema.customerContacts.id,
      name: schema.customerContacts.name,
      role: schema.customerContacts.role,
      siteId: schema.customerContacts.siteId,
      customerOrgId: schema.customerContacts.customerOrgId,
    })
    .from(schema.customerContacts)
    .where(eq(schema.customerContacts.companyId, companyId));

  const junk: { id: number; name: string; role: string; siteId: number | null; reason: string }[] = [];

  for (const c of allContacts) {
    const { garbage, reason } = isGarbage(c.name);
    if (garbage) {
      junk.push({ id: c.id, name: c.name, role: c.role, siteId: c.siteId, reason });
    }
  }

  console.log(`Contacts scanned: ${allContacts.length}`);
  console.log(`Junk contacts:    ${junk.length}`);
  console.log();

  if (junk.length === 0) {
    console.log("No junk contacts found.");
    await conn.end();
    return;
  }

  console.log("JUNK CONTACTS TO DELETE:");
  console.log("─".repeat(80));
  for (const c of junk) {
    const name = c.name.length > 40 ? c.name.slice(0, 37) + "..." : c.name;
    const site = c.siteId ? `site=${c.siteId}` : `org=${c.customerOrgId ?? "?"}`;
    console.log(`  id=${String(c.id).padEnd(5)} ${site.padEnd(10)} [${c.reason}]  "${name}"`);
  }
  console.log();

  if (!apply) {
    console.log(`DRY RUN — ${junk.length} contact(s) would be deleted.`);
    console.log("Re-run with --apply to execute.");
    await conn.end();
    return;
  }

  let deleted = 0;
  for (const c of junk) {
    await db
      .delete(schema.customerContacts)
      .where(and(
        eq(schema.customerContacts.id, c.id),
        eq(schema.customerContacts.companyId, companyId),
      ));
    deleted++;
  }

  console.log(`Deleted ${deleted} junk contact(s).`);
  await conn.end();
}

main().catch((err) => {
  const msg: string = err?.message ?? String(err);
  console.error("Error:", msg.replace(url ?? "", "[DATABASE_URL]"));
  process.exit(1);
});
