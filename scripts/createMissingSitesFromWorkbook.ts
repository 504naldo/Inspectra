/**
 * scripts/createMissingSitesFromWorkbook.ts
 *
 * Bulk-create stub sites for every workbook FILE # that has no matching DB site.
 * After this runs, seedMonthlyTracking.ts will match all rows by buildingId.
 *
 * What it creates:
 *   name         = "Site [FILE#]"  (placeholder — update manually later)
 *   city         = CITY column value from the workbook
 *   buildingId   = FILE #  (e.g. "#0032")
 *   fileNumber   = FILE #
 *   companyId    = from --company flag
 *   customerOrgId = from --customer-org flag
 *                   (if omitted and only one org exists for the company, that one is used)
 *
 * Skips:
 *   - Any FILE # where a site with that buildingId already exists in the DB.
 *   - Any FILE # that is blank or clearly a header/junk value.
 *
 * Usage:
 *   # See what would be created
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" \
 *     --company 1 --customer-org 2 --dry-run
 *
 *   # Live run
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" \
 *     --company 1 --customer-org 2
 *
 *   # If only one customer org exists for the company, --customer-org is optional:
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "..." --company 1 --dry-run
 *
 *   # Include SPRING sheet FILE# values (skipped by default):
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "..." --company 1 --customer-org 2 --include-spring --dry-run
 *
 * After running:
 *   pnpm exec tsx scripts/seedMonthlyTracking.ts \
 *     --file "..." --company 1 --all-sheets --dry-run
 */

import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';
import path from 'path';

config();

// ─── Normalization ────────────────────────────────────────────────────────────

function normBldg(s: string): string {
  const a = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^\d+$/.test(a) ? String(parseInt(a, 10)) : a;
}

function normCity(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Column detection ─────────────────────────────────────────────────────────

function findCol(headers: string[], ...keywords: string[]): number {
  const h = headers.map(x => x.toLowerCase().trim());
  for (const kw of keywords) {
    const i = h.indexOf(kw.toLowerCase());
    if (i !== -1) return i;
  }
  for (const kw of keywords) {
    const i = h.findIndex(x => x.includes(kw.toLowerCase()));
    if (i !== -1) return i;
  }
  return -1;
}

// ─── Sheet config ─────────────────────────────────────────────────────────────

const SHEET_MONTH_MAP: Record<string, string> = {
  JAN: '2026-01', FEB: '2026-02', MAR: '2026-03', APR: '2026-04',
  MAY: '2026-05', JUN: '2026-06', JUL: '2026-07', AUG: '2026-08',
  SEP: '2026-09', OCT: '2026-10', NOV: '2026-11', DEC: '2026-12',
};

function detectHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if ((rows[i] as unknown[]).some(c => String(c ?? '').toLowerCase().includes('file'))) return i;
  }
  return 1;
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

interface CliArgs {
  file: string;
  companyId: number;
  customerOrgId: number;  // 0 = auto-detect from DB
  dryRun: boolean;
  includeSpring: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = { file: '', companyId: 1, customerOrgId: 0, dryRun: false, includeSpring: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':          a.file          = argv[++i]; break;
      case '--company':       a.companyId     = parseInt(argv[++i], 10); break;
      case '--customer-org':  a.customerOrgId = parseInt(argv[++i], 10); break;
      case '--dry-run':       a.dryRun        = true; break;
      case '--include-spring': a.includeSpring = true; break;
    }
  }
  return a;
}

// ─── Workbook extraction ──────────────────────────────────────────────────────

interface WbSiteEntry {
  fileNum: string;
  normFile: string;
  city: string;
  sheet: string;
}

/**
 * Collect every unique FILE # from the workbook.
 * For each FILE #, we take the city from the first occurrence.
 * SPRING is included only when includeSpring=true; WINTER always skipped.
 *
 * Validation rules applied per row:
 *   - FILE # must be non-empty and start with '#' followed by at least one digit
 *   - Rows failing validation are counted in junkSkipped and logged
 *   - Empty city is allowed (site is still created, logged as a warning)
 */
function extractAllFileNumbers(
  workbook: XLSX.WorkBook,
  includeSpring: boolean,
): { entries: Map<string, WbSiteEntry>; junkSkipped: number; noCity: string[] } {
  const entries    = new Map<string, WbSiteEntry>();
  const cityByFile = new Map<string, string>();
  let   junkSkipped = 0;
  const noCity: string[] = [];

  /** Returns true only for FILE# values like "#0032", "#0330-1", "#509" */
  function isValidFileNum(raw: string): boolean {
    return /^#\d/.test(raw);
  }

  const sheetsToRead = workbook.SheetNames.filter(name => {
    const u = name.toUpperCase();
    if (u === 'WINTER') return false;
    if (u === 'SPRING') return includeSpring;
    return true;
  });

  // First pass: monthly sheets (definitive for CITY column)
  for (const sheetName of sheetsToRead) {
    const upper = sheetName.toUpperCase();
    if (upper === 'SPRING') continue;
    const ws = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const hi = detectHeaderRow(rows);
    const headers = (rows[hi] as unknown[]).map(c => String(c ?? '').trim());
    const fileIdx = findCol(headers, 'file #', 'file#', 'file number', 'file no', 'file');
    const cityIdx = findCol(headers, 'city');
    if (fileIdx === -1) continue;

    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      if (row.every(c => c == null || c === '')) continue;

      const rawFile = String(row[fileIdx] ?? '').trim();
      if (!rawFile) continue; // blank → silently skip

      if (!isValidFileNum(rawFile)) {
        junkSkipped++;
        continue; // header repeats, "N/A", etc.
      }

      const nFile   = normBldg(rawFile);
      const rawCity = cityIdx >= 0 ? String(row[cityIdx] ?? '').trim() : '';

      if (!cityByFile.has(nFile)) cityByFile.set(nFile, rawCity);

      if (!entries.has(nFile)) {
        if (!rawCity) noCity.push(rawFile);
        entries.set(nFile, { fileNum: rawFile, normFile: nFile, city: rawCity, sheet: sheetName });
      }
    }
  }

  // Second pass: SPRING (if opted in) — for FILE#s not already in monthly sheets
  if (includeSpring && workbook.Sheets['SPRING']) {
    const ws = workbook.Sheets['SPRING'];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hi = detectHeaderRow(rows);
    const headers = (rows[hi] as unknown[]).map(c => String(c ?? '').trim());
    const fileIdx = findCol(headers, 'file #', 'file#', 'file no', 'file');
    if (fileIdx >= 0) {
      for (let r = hi + 1; r < rows.length; r++) {
        const row = rows[r] as unknown[];
        if (row.every(c => c == null || c === '')) continue;

        const rawFile = String(row[fileIdx] ?? '').trim();
        if (!rawFile) continue;
        if (!isValidFileNum(rawFile)) { junkSkipped++; continue; }

        const nFile = normBldg(rawFile);
        if (!entries.has(nFile)) {
          const city = cityByFile.get(nFile) ?? '';
          if (!city) noCity.push(rawFile);
          entries.set(nFile, { fileNum: rawFile, normFile: nFile, city, sheet: 'SPRING' });
        }
      }
    }
  }

  return { entries, junkSkipped, noCity };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error([
      'Usage: tsx scripts/createMissingSitesFromWorkbook.ts',
      '         --file <path> --company <id> [--customer-org <id>]',
      '         [--dry-run] [--include-spring]',
    ].join('\n'));
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

  const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);

  console.log(`\nReading: ${filePath}`);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (err: any) {
    console.error(`Cannot open file: ${err.message}`); process.exit(1);
  }

  if (args.dryRun) console.log('DRY RUN — no DB writes\n');
  else             console.log('LIVE RUN — sites will be created\n');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });

  // ── Resolve customerOrgId ────────────────────────────────────────────────
  let customerOrgId = args.customerOrgId;
  if (!customerOrgId) {
    const orgs = await db.select().from(schema.customerOrgs).where(eq(schema.customerOrgs.companyId, args.companyId));
    if (orgs.length === 0) {
      console.error(`No customer orgs found for company ${args.companyId}. Create one first or pass --customer-org <id>.`);
      process.exit(1);
    }
    if (orgs.length === 1) {
      customerOrgId = orgs[0].id;
      console.log(`Using customer org: "${orgs[0].name}" (id=${customerOrgId})\n`);
    } else {
      console.error(`Multiple customer orgs found for company ${args.companyId}:`);
      orgs.forEach(o => console.error(`  id=${o.id}  name="${o.name}"`));
      console.error('Specify one with --customer-org <id>');
      process.exit(1);
    }
  } else {
    // Validate the given customerOrgId
    const orgs = await db.select().from(schema.customerOrgs).where(eq(schema.customerOrgs.companyId, args.companyId));
    const org = orgs.find(o => o.id === customerOrgId);
    if (!org) {
      console.error(`Customer org id=${customerOrgId} not found under company ${args.companyId}.`);
      console.error('Available orgs:');
      orgs.forEach(o => console.error(`  id=${o.id}  name="${o.name}"`));
      process.exit(1);
    }
    console.log(`Customer org: "${org.name}" (id=${customerOrgId})\n`);
  }

  // ── Extract workbook FILE # values ───────────────────────────────────────
  const { entries: wbEntries, junkSkipped, noCity } =
    extractAllFileNumbers(workbook, args.includeSpring);
  console.log(`Workbook: ${wbEntries.size} unique FILE# values found`);
  if (args.includeSpring) console.log('  (including SPRING sheet)');
  if (junkSkipped > 0)
    console.log(`  ${junkSkipped} junk/non-FILE# values skipped (header repeats, N/A, etc.)`);
  if (noCity.length > 0)
    console.log(`  ${noCity.length} FILE#s have no CITY value — sites will be created without city`);

  // ── Load existing sites ──────────────────────────────────────────────────
  const existingSites = await db
    .select({ id: schema.sites.id, buildingId: schema.sites.buildingId, name: schema.sites.name })
    .from(schema.sites)
    .where(eq(schema.sites.companyId, args.companyId));

  // Build set of normalized buildingIds already in DB
  const existingBldgIds = new Set<string>();
  for (const s of existingSites) {
    if (s.buildingId) existingBldgIds.add(normBldg(s.buildingId));
  }

  console.log(`DB sites: ${existingSites.length} total, ${existingBldgIds.size} with buildingId set\n`);

  // ── Classify ─────────────────────────────────────────────────────────────
  const toCreate: WbSiteEntry[] = [];
  const alreadyExists: WbSiteEntry[] = [];

  for (const [nFile, entry] of wbEntries) {
    if (existingBldgIds.has(nFile)) {
      alreadyExists.push(entry);
    } else {
      toCreate.push(entry);
    }
  }

  // Sort by file number for predictable output
  toCreate.sort((a, b) => a.fileNum.localeCompare(b.fileNum));
  alreadyExists.sort((a, b) => a.fileNum.localeCompare(b.fileNum));

  console.log(`Already have site (skip) : ${alreadyExists.length}`);
  console.log(`Need to create           : ${toCreate.length}`);

  if (toCreate.length === 0) {
    console.log('\nAll FILE# values already have a matching site. Nothing to create.');
    process.exit(0);
  }

  console.log('\n── Sites to create ───────────────────────────────────────────────');
  toCreate.forEach(e => {
    const namePlaceholder = `Site ${e.fileNum}`;
    const cityLabel = e.city ? `city="${e.city}"` : 'city=(empty — review later)';
    console.log(`  ${e.fileNum.padEnd(12)} ${cityLabel.padEnd(32)} → name="${namePlaceholder}"`);
  });

  if (args.dryRun) {
    console.log(`\nDRY RUN: would create ${toCreate.length} sites. Rerun without --dry-run to apply.`);
    process.exit(0);
  }

  // ── Create sites ──────────────────────────────────────────────────────────
  console.log(`\nCreating ${toCreate.length} sites...`);
  let created = 0, errors = 0;
  const errMessages: string[] = [];

  for (const entry of toCreate) {
    const siteName = `Site ${entry.fileNum}`;
    try {
      await db.insert(schema.sites).values({
        companyId:     args.companyId,
        customerOrgId: customerOrgId,
        name:          siteName,
        city:          entry.city || undefined,
        buildingId:    entry.fileNum,
        fileNumber:    entry.fileNum,
      } as schema.InsertSite);
      created++;
      process.stdout.write('.');
    } catch (err: any) {
      errors++;
      errMessages.push(`  ${entry.fileNum}: ${err?.message ?? err}`);
      process.stdout.write('X');
    }
  }

  console.log('\n');
  console.log('── Results ───────────────────────────────────────────────────────');
  console.log(`  Created  : ${created}`);
  console.log(`  Skipped  : ${alreadyExists.length} (already existed)`);
  console.log(`  Junk     : ${junkSkipped} (malformed FILE# values, not created)`);
  console.log(`  Errors   : ${errors}`);
  if (errMessages.length) {
    console.log('\n── Errors ────────────────────────────────────────────────────────');
    errMessages.forEach(l => console.log(l));
  }

  if (created > 0) {
    console.log('\n✓ Sites created. Now run the monthly tracking seed:');
    console.log(`  pnpm exec tsx scripts/seedMonthlyTracking.ts \\`);
    console.log(`    --file "${args.file}" --company ${args.companyId} --all-sheets --dry-run`);
    console.log(`  pnpm exec tsx scripts/seedMonthlyTracking.ts \\`);
    console.log(`    --file "${args.file}" --company ${args.companyId} --all-sheets`);
  }

  console.log('');
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
