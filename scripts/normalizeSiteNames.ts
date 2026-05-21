/**
 * scripts/normalizeSiteNames.ts
 *
 * Normalize site.name values to match the Customer Records format:
 *   "{address}. {city}"   e.g. "1577 West 4th Ave. Vancouver"
 *
 * The target name is derived from the site's own address + city columns —
 * no Google Drive access required. For sites that came from Customer Records,
 * this produces names that match the Drive folder name (the part after "#NNNN - ").
 *
 * NOTE: site.fileNumber is shown as a separate badge in the UI, so the name
 * field should NOT include the "#NNNN - " prefix.
 *
 * What it changes:
 *   site.name → "{address}. {city}"   (or just "{address}" when city is absent
 *                                       or already present in the address)
 *
 * What it never changes:
 *   - Sites with no address (can't construct a reliable name)
 *   - Sites whose current name already matches the target (idempotent)
 *
 * Usage:
 *   # Dry run — see every change before applying
 *   DATABASE_URL=mysql://... pnpm exec tsx scripts/normalizeSiteNames.ts
 *
 *   # Apply changes
 *   DATABASE_URL=mysql://... pnpm exec tsx scripts/normalizeSiteNames.ts --apply
 *
 *   # Limit to one customer org
 *   DATABASE_URL=mysql://... pnpm exec tsx scripts/normalizeSiteNames.ts --apply --org 42
 *
 *   # Show all sites including those that need no change
 *   DATABASE_URL=mysql://... pnpm exec tsx scripts/normalizeSiteNames.ts --verbose
 */

import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';

config();

// ─── Args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const APPLY   = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const ORG_IDX = argv.indexOf('--org');
const ORG_ID  = ORG_IDX !== -1 ? parseInt(argv[ORG_IDX + 1], 10) : undefined;
const CO_IDX  = argv.indexOf('--company');
const CO_ID   = CO_IDX !== -1 ? parseInt(argv[CO_IDX + 1], 10) : 1;

// ─── Target name logic ────────────────────────────────────────────────────────

/**
 * Construct the target site name from address + city fields.
 *
 * Rules:
 *   1. If no address → return null (skip; can't construct a name)
 *   2. If no city → return address trimmed
 *   3. If city already appears in address (case-insensitive) → return address trimmed
 *   4. Otherwise → "{address trimmed}. {city trimmed}"
 *
 * The ". " separator mirrors the Customer Records folder convention where the
 * street-type abbreviation (Ave., St., Blvd., etc.) is followed by the city:
 *   "1577 West 4th Ave. Vancouver"
 *   "8911-152nd Ave. Surrey"
 */
function targetName(address: string | null, city: string | null): string | null {
  const addr = address?.trim();
  const cty  = city?.trim();
  if (!addr) return null;
  if (!cty)  return addr;
  if (addr.toLowerCase().includes(cty.toLowerCase())) return addr;
  // Add ". city" — if address already ends with "." add a space only
  const sep = addr.endsWith('.') ? ' ' : '. ';
  return `${addr}${sep}${cty}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = mysql.createPool({
    uri: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000,
  });
  const db = drizzle(pool, { schema, mode: 'default' });

  console.log(`\n${'='.repeat(60)}`);
  console.log('  Normalize Site Names → Customer Records format');
  console.log(`${'='.repeat(60)}`);
  console.log(`  company  : ${CO_ID}`);
  if (ORG_ID !== undefined) console.log(`  org      : ${ORG_ID}`);
  console.log(`  mode     : ${APPLY ? 'APPLY (live writes)' : 'DRY RUN (no changes)'}`);
  console.log();

  const conditions = ORG_ID !== undefined
    ? and(eq(schema.sites.companyId, CO_ID), eq(schema.sites.customerOrgId, ORG_ID))!
    : eq(schema.sites.companyId, CO_ID);

  const sites = await db.select().from(schema.sites).where(conditions);
  console.log(`Loaded ${sites.length} sites.\n`);

  let changed = 0;
  let skipped = 0;
  let noAddress = 0;
  let alreadyCorrect = 0;

  const changes: Array<{ id: number; fileNumber: string | null; current: string; target: string }> = [];

  for (const site of sites) {
    const target = targetName(site.address, site.city);

    if (target === null) {
      noAddress++;
      if (VERBOSE) console.log(`  SKIP (no address)  id=${site.id}  name="${site.name}"`);
      continue;
    }

    if (site.name === target) {
      alreadyCorrect++;
      if (VERBOSE) console.log(`  OK                 id=${site.id}  "${site.name}"`);
      continue;
    }

    changes.push({ id: site.id, fileNumber: site.fileNumber, current: site.name, target });
  }

  // Print changes table
  if (changes.length > 0) {
    console.log(`Changes (${changes.length}):`);
    console.log(`  ${'ID'.padEnd(6)} ${'FILE #'.padEnd(10)} CURRENT → TARGET`);
    console.log(`  ${'─'.repeat(80)}`);
    for (const c of changes) {
      const fn = c.fileNumber ?? '(none)';
      console.log(`  ${String(c.id).padEnd(6)} ${fn.padEnd(10)} "${c.current}"`);
      console.log(`  ${' '.repeat(18)} → "${c.target}"`);
    }
    console.log();
  }

  if (APPLY && changes.length > 0) {
    console.log('Applying...');
    for (const c of changes) {
      await db.update(schema.sites).set({ name: c.target }).where(eq(schema.sites.id, c.id));
      changed++;
      process.stdout.write('.');
    }
    console.log(`\nUpdated ${changed} sites.`);
  } else if (!APPLY && changes.length > 0) {
    console.log(`DRY RUN: would update ${changes.length} sites. Pass --apply to apply.`);
  }

  console.log(`\nSummary:`);
  console.log(`  Need change   : ${changes.length}`);
  console.log(`  Already OK    : ${alreadyCorrect}`);
  console.log(`  Skipped (no address) : ${noAddress}`);
  console.log(`  Applied       : ${APPLY ? changed : 0}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
