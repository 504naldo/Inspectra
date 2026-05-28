/**
 * scripts/cleanSiteContactNames.ts
 *
 * Identifies sites where contactName contains garbage data (phone-as-name,
 * buzzer codes, postal codes, email-as-name, or generic labels) and either
 * reports them (dry-run) or nulls them out (--apply).
 *
 * Run BEFORE backfillContactsFromCustomerRecords so junk names are not
 * promoted into the customer_contacts table.
 *
 * Garbage patterns detected:
 *   1. Starts with "Contact Phone" or "Contact Email" (label, not a name)
 *   2. Starts with "Phone Number:" (buzzer/alarm code entries)
 *   3. Canadian postal code only (e.g. "V6J 1P5", "V6V 3C2")
 *   4. Pure email address (contains @, no spaces before @)
 *   5. Generic labels: "INVOICES", "Office", "ERIN/INVOICES", "LAKEPARK@..."
 *
 * NOT touched (by design):
 *   - Names with phone/email concatenated (e.g. "ALYSHA604-306-3394alysha@..."):
 *     these are valid names with extra info — handled separately
 *   - Single first-names like "Dick", "Meg", "ASH" — real contacts
 *
 * Usage:
 *   npx tsx scripts/cleanSiteContactNames.ts --company 1
 *   npx tsx scripts/cleanSiteContactNames.ts --company 1 --apply
 *
 * Requires DATABASE_URL in .env or environment.
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, and, isNotNull } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// ─── Pattern detection ─────────────────────────────────────────────────────────

// Canadian postal code: A1A 1A1 or A1A1A1
const CA_POSTAL = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;

// Pure email with no name prefix (no word chars before @)
// e.g. "richmondmarina2023@hotmail.com", "LAKEPARK@MORETHANAROOF.ORF"
// Excludes "ALYSHA604-306-3394alysha@..." because it has a name prefix
const PURE_EMAIL = /^[^\s@]+@[^\s]+$/;

// Generic labels that are clearly not person names
const GENERIC_LABELS = new Set([
  "invoices",
  "office",
  "erin/invoices",
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

  const allSites = await db
    .select({
      id: schema.sites.id,
      name: schema.sites.name,
      contactName: schema.sites.contactName,
      contactPhone: schema.sites.contactPhone,
    })
    .from(schema.sites)
    .where(and(eq(schema.sites.companyId, companyId), isNotNull(schema.sites.contactName)));

  const garbage: { id: number; siteName: string; contactName: string; reason: string }[] = [];

  for (const site of allSites) {
    if (!site.contactName) continue;
    const { garbage: isGarb, reason } = isGarbage(site.contactName);
    if (isGarb) {
      garbage.push({ id: site.id, siteName: site.name, contactName: site.contactName, reason });
    }
  }

  console.log(`Sites scanned:  ${allSites.length}`);
  console.log(`Garbage names:  ${garbage.length}`);
  console.log();

  if (garbage.length === 0) {
    console.log("No garbage names found.");
    await conn.end();
    return;
  }

  console.log("GARBAGE NAMES FOUND:");
  console.log("─".repeat(80));
  for (const g of garbage) {
    const name = g.contactName.length > 45 ? g.contactName.slice(0, 42) + "..." : g.contactName;
    console.log(`  site=${String(g.id).padEnd(5)} [${g.reason}]  "${name}"`);
  }
  console.log();

  if (!apply) {
    console.log(`DRY RUN — ${garbage.length} contactName(s) would be set to NULL.`);
    console.log("Re-run with --apply to execute.");
    await conn.end();
    return;
  }

  // Apply: null out each garbage contactName
  let nulled = 0;
  for (const g of garbage) {
    await db
      .update(schema.sites)
      .set({ contactName: null })
      .where(and(eq(schema.sites.id, g.id), eq(schema.sites.companyId, companyId)));
    nulled++;
  }

  console.log(`Applied: ${nulled} contactName(s) set to NULL.`);
  await conn.end();
}

main().catch((err) => {
  const msg: string = err?.message ?? String(err);
  console.error("Error:", msg.replace(url ?? "", "[DATABASE_URL]"));
  process.exit(1);
});
