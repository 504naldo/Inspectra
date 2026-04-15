/**
 * scripts/createMissingSitesFromWorkbook.ts
 *
 * Bulk-create stub sites for every workbook FILE # that has no matching DB site.
 * After this runs, seedMonthlyTracking.ts will match all rows by buildingId.
 *
 * Customer org resolution (per row, in priority order):
 *   1. --customer-org <id>  Force every row to this org. Skips all inference.
 *   2. Existing site match  If a DB site already has this buildingId, reuse its org.
 *   3. City inference       If ALL existing sites in this city belong to one org, use it.
 *   4. --default-org <id>  Fallback for rows that can't be inferred automatically.
 *   5. Unresolved           No org found and no default provided → logged, not created.
 *
 * Usage:
 *   # Dry-run — see what would be created and under which org
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" \
 *     --company 1 --dry-run
 *
 *   # With a default org for rows that can't be auto-resolved
 *   ... --default-org 3 --dry-run
 *   ... --default-org 3
 *
 *   # Force ALL rows into one org (old behaviour, use when you know all sites belong to one org)
 *   ... --customer-org 3
 *
 *   # Include SPRING sheet FILE# values (skipped by default)
 *   ... --include-spring --dry-run
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
  /** If set, ALL rows use this org. Disables per-row inference. */
  customerOrgId: number;
  /** If set, used as fallback when per-row inference finds no org. */
  defaultOrgId: number;
  dryRun: boolean;
  includeSpring: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = {
    file: '', companyId: 1, customerOrgId: 0, defaultOrgId: 0,
    dryRun: false, includeSpring: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':           a.file          = argv[++i]; break;
      case '--company':        a.companyId     = parseInt(argv[++i], 10); break;
      case '--customer-org':   a.customerOrgId = parseInt(argv[++i], 10); break;
      case '--default-org':    a.defaultOrgId  = parseInt(argv[++i], 10); break;
      case '--dry-run':        a.dryRun        = true; break;
      case '--include-spring': a.includeSpring = true; break;
    }
  }
  return a;
}

// ─── Workbook extraction ──────────────────────────────────────────────────────

interface WbSiteEntry {
  fileNum:  string;
  normFile: string;
  city:     string;
  normCity: string;
  sheet:    string;
}

/** Returns true only for FILE# values like "#0032", "#0330-1", "#509" */
function isValidFileNum(raw: string): boolean {
  return /^#\d/.test(raw);
}

function extractAllFileNumbers(
  workbook: XLSX.WorkBook,
  includeSpring: boolean,
): { entries: Map<string, WbSiteEntry>; junkSkipped: number; noCity: string[] } {
  const entries    = new Map<string, WbSiteEntry>();
  const cityByFile = new Map<string, string>();
  let   junkSkipped = 0;
  const noCity: string[] = [];

  const sheetsToRead = workbook.SheetNames.filter(name => {
    const u = name.toUpperCase();
    if (u === 'WINTER') return false;
    if (u === 'SPRING') return includeSpring;
    return true;
  });

  // First pass: monthly sheets
  for (const sheetName of sheetsToRead) {
    const upper = sheetName.toUpperCase();
    if (upper === 'SPRING') continue;

    const ws = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const hi      = detectHeaderRow(rows);
    const headers = (rows[hi] as unknown[]).map(c => String(c ?? '').trim());
    const fileIdx = findCol(headers, 'file #', 'file#', 'file number', 'file no', 'file');
    const cityIdx = findCol(headers, 'city');
    if (fileIdx === -1) continue;

    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      if (row.every(c => c == null || c === '')) continue;

      const rawFile = String(row[fileIdx] ?? '').trim();
      if (!rawFile) continue;
      if (!isValidFileNum(rawFile)) { junkSkipped++; continue; }

      const nFile   = normBldg(rawFile);
      const rawCity = cityIdx >= 0 ? String(row[cityIdx] ?? '').trim() : '';

      if (!cityByFile.has(nFile)) cityByFile.set(nFile, rawCity);
      if (!entries.has(nFile)) {
        if (!rawCity) noCity.push(rawFile);
        entries.set(nFile, {
          fileNum: rawFile, normFile: nFile,
          city: rawCity, normCity: normCity(rawCity),
          sheet: sheetName,
        });
      }
    }
  }

  // Second pass: SPRING
  if (includeSpring && workbook.Sheets['SPRING']) {
    const ws = workbook.Sheets['SPRING'];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hi      = detectHeaderRow(rows);
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
          entries.set(nFile, {
            fileNum: rawFile, normFile: nFile,
            city, normCity: normCity(city),
            sheet: 'SPRING',
          });
        }
      }
    }
  }

  return { entries, junkSkipped, noCity };
}

// ─── Per-row org resolution ───────────────────────────────────────────────────

interface OrgRef { id: number; name: string }

type OrgResolution =
  | { type: 'forced';     org: OrgRef }                    // --customer-org override
  | { type: 'auto';       org: OrgRef; reason: string }    // inferred from data
  | { type: 'default';    org: OrgRef }                    // --default-org fallback
  | { type: 'unresolved'; reason: string };                // cannot determine

/**
 * Build lookup tables needed for per-row resolution from existing site data.
 *
 * orgByBldgNorm  — normBldg(buildingId) → OrgRef
 *   Used when a DB site already has this FILE# as its buildingId.
 *
 * orgByNormCity  — normCity(city) → OrgRef | 'ambiguous'
 *   Built from existing sites that have both city and customerOrgId set.
 *   A city is 'ambiguous' if its existing sites span more than one org.
 */
function buildOrgLookups(
  existingSites: { id: number; buildingId: string | null; city: string | null; customerOrgId: number }[],
  allOrgs: { id: number; name: string }[],
): {
  orgByBldgNorm: Map<string, OrgRef>;
  orgByNormCity: Map<string, OrgRef | 'ambiguous'>;
} {
  const orgMap = new Map(allOrgs.map(o => [o.id, o]));

  const orgByBldgNorm = new Map<string, OrgRef>();
  for (const s of existingSites) {
    if (!s.buildingId) continue;
    const org = orgMap.get(s.customerOrgId);
    if (org) orgByBldgNorm.set(normBldg(s.buildingId), { id: org.id, name: org.name });
  }

  const orgByNormCity = new Map<string, OrgRef | 'ambiguous'>();
  for (const s of existingSites) {
    if (!s.city) continue;
    const nc  = normCity(s.city);
    const org = orgMap.get(s.customerOrgId);
    if (!org) continue;

    const cur = orgByNormCity.get(nc);
    if (!cur) {
      orgByNormCity.set(nc, { id: org.id, name: org.name });
    } else if (cur !== 'ambiguous' && cur.id !== org.id) {
      orgByNormCity.set(nc, 'ambiguous');
    }
  }

  return { orgByBldgNorm, orgByNormCity };
}

function resolveOrg(
  entry: WbSiteEntry,
  orgByBldgNorm: Map<string, OrgRef>,
  orgByNormCity: Map<string, OrgRef | 'ambiguous'>,
  forcedOrg:  OrgRef | null,
  defaultOrg: OrgRef | null,
): OrgResolution {
  // Strategy 1: global force override
  if (forcedOrg) {
    return { type: 'forced', org: forcedOrg };
  }

  // Strategy 2: existing DB site already has this buildingId → reuse its org
  const bldgOrg = orgByBldgNorm.get(entry.normFile);
  if (bldgOrg) {
    return { type: 'auto', org: bldgOrg, reason: `existing site with buildingId="${entry.fileNum}" uses this org` };
  }

  // Strategy 3: city uniquely maps to one org across all existing sites
  if (entry.normCity) {
    const cityResult = orgByNormCity.get(entry.normCity);
    if (cityResult && cityResult !== 'ambiguous') {
      return { type: 'auto', org: cityResult, reason: `all existing sites in "${entry.city}" use this org` };
    }
    if (cityResult === 'ambiguous') {
      // City maps to multiple orgs — fall through to default
      if (defaultOrg) {
        return { type: 'default', org: defaultOrg };
      }
      return {
        type: 'unresolved',
        reason: `city "${entry.city}" has existing sites in multiple orgs — pass --default-org <id> to assign`,
      };
    }
  }

  // Strategy 4: default org fallback
  if (defaultOrg) {
    return { type: 'default', org: defaultOrg };
  }

  // Unresolved
  const why = entry.city
    ? `no existing sites in "${entry.city}" to infer org — pass --default-org <id>`
    : 'no city data and no --default-org provided';
  return { type: 'unresolved', reason: why };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error([
      'Usage: tsx scripts/createMissingSitesFromWorkbook.ts',
      '  --file <path> --company <id>',
      '  [--default-org <id>]    fallback org for rows that cannot be auto-resolved',
      '  [--customer-org <id>]   force ALL rows into this org (overrides inference)',
      '  [--dry-run]',
      '  [--include-spring]',
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

  // ── Load all customer orgs for this company ──────────────────────────────
  const allOrgs = await db
    .select()
    .from(schema.customerOrgs)
    .where(eq(schema.customerOrgs.companyId, args.companyId));

  if (allOrgs.length === 0) {
    console.error(`No customer orgs found for company ${args.companyId}. Create one first.`);
    process.exit(1);
  }

  console.log(`Customer orgs for company ${args.companyId} (${allOrgs.length} total):`);
  allOrgs.forEach(o => console.log(`  id=${o.id}  "${o.name}"`));

  // Resolve forced org (--customer-org)
  let forcedOrg: OrgRef | null = null;
  if (args.customerOrgId) {
    const o = allOrgs.find(x => x.id === args.customerOrgId);
    if (!o) {
      console.error(`\n--customer-org ${args.customerOrgId} not found under company ${args.companyId}.`);
      process.exit(1);
    }
    forcedOrg = { id: o.id, name: o.name };
    console.log(`\n⚠  --customer-org set: ALL rows will be assigned to "${o.name}" (id=${o.id})`);
  }

  // Resolve default org (--default-org)
  let defaultOrg: OrgRef | null = null;
  if (args.defaultOrgId) {
    const o = allOrgs.find(x => x.id === args.defaultOrgId);
    if (!o) {
      console.error(`\n--default-org ${args.defaultOrgId} not found under company ${args.companyId}.`);
      process.exit(1);
    }
    defaultOrg = { id: o.id, name: o.name };
    console.log(`\n   --default-org set: unresolved rows will fall back to "${o.name}" (id=${o.id})`);
  }

  if (!forcedOrg && !defaultOrg && allOrgs.length > 1) {
    console.log('\n  ℹ  No --default-org provided. Rows that cannot be auto-resolved will be skipped.');
    console.log('     Pass --default-org <id> to assign unresolved rows to a specific org.');
  }

  // ── Load existing sites ──────────────────────────────────────────────────
  const existingSites = await db
    .select({
      id:            schema.sites.id,
      buildingId:    schema.sites.buildingId,
      city:          schema.sites.city,
      customerOrgId: schema.sites.customerOrgId,
    })
    .from(schema.sites)
    .where(eq(schema.sites.companyId, args.companyId));

  const existingBldgNorms = new Set(
    existingSites.filter(s => s.buildingId).map(s => normBldg(s.buildingId!))
  );

  console.log(`\nDB sites: ${existingSites.length} total, ${existingBldgNorms.size} with buildingId set`);

  // ── Build org lookup tables ──────────────────────────────────────────────
  const { orgByBldgNorm, orgByNormCity } = buildOrgLookups(existingSites, allOrgs);

  if (!forcedOrg) {
    const cityEntries = [...orgByNormCity.entries()];
    const uniqueCities    = cityEntries.filter(([, v]) => v !== 'ambiguous').length;
    const ambiguousCities = cityEntries.filter(([, v]) => v === 'ambiguous').length;
    console.log(`  City → org inference: ${uniqueCities} cities map to one org, ${ambiguousCities} cities are ambiguous`);
  }

  // ── Extract workbook FILE # values ───────────────────────────────────────
  const { entries: wbEntries, junkSkipped, noCity } =
    extractAllFileNumbers(workbook, args.includeSpring);

  console.log(`\nWorkbook: ${wbEntries.size} unique FILE# values found`);
  if (args.includeSpring)  console.log('  (including SPRING sheet)');
  if (junkSkipped > 0)     console.log(`  ${junkSkipped} junk/non-FILE# values skipped`);
  if (noCity.length > 0)   console.log(`  ${noCity.length} FILE#s have no CITY value`);

  // ── Classify and resolve orgs ────────────────────────────────────────────
  interface PendingCreate {
    entry:      WbSiteEntry;
    resolution: Extract<OrgResolution, { type: 'forced' | 'auto' | 'default' }>;
  }

  const alreadyExists: WbSiteEntry[] = [];
  const toCreate:      PendingCreate[] = [];
  const unresolved:    Array<{ entry: WbSiteEntry; reason: string }> = [];

  for (const [nFile, entry] of wbEntries) {
    if (existingBldgNorms.has(nFile)) {
      alreadyExists.push(entry);
      continue;
    }

    const resolution = resolveOrg(entry, orgByBldgNorm, orgByNormCity, forcedOrg, defaultOrg);

    if (resolution.type === 'unresolved') {
      unresolved.push({ entry, reason: resolution.reason });
    } else {
      toCreate.push({ entry, resolution });
    }
  }

  // Sort for predictable output
  toCreate.sort((a, b) => a.entry.fileNum.localeCompare(b.entry.fileNum));
  alreadyExists.sort((a, b) => a.fileNum.localeCompare(b.fileNum));
  unresolved.sort((a, b) => a.entry.fileNum.localeCompare(b.entry.fileNum));

  // ── Summary preview ──────────────────────────────────────────────────────
  console.log('\n── Classification ────────────────────────────────────────────────');
  console.log(`  Already have site (skip)  : ${alreadyExists.length}`);
  console.log(`  Will create               : ${toCreate.length}`);
  console.log(`    forced (--customer-org) : ${toCreate.filter(x => x.resolution.type === 'forced').length}`);
  console.log(`    auto-resolved           : ${toCreate.filter(x => x.resolution.type === 'auto').length}`);
  console.log(`    default (--default-org) : ${toCreate.filter(x => x.resolution.type === 'default').length}`);
  console.log(`  Unresolved (skip)         : ${unresolved.length}`);

  if (toCreate.length === 0 && unresolved.length === 0) {
    console.log('\nAll FILE# values already have a matching site. Nothing to do.');
    process.exit(0);
  }

  if (toCreate.length > 0) {
    console.log('\n── Sites to create ───────────────────────────────────────────────');
    for (const { entry, resolution } of toCreate) {
      const cityLabel = entry.city || '(no city)';
      const orgLabel  = `org="${resolution.org.name}" (id=${resolution.org.id})`;
      const stratLabel = resolution.type === 'auto'
        ? `[auto: ${(resolution as any).reason}]`
        : `[${resolution.type}]`;
      console.log(`  ${entry.fileNum.padEnd(12)} city="${cityLabel.padEnd(20)}" ${orgLabel}  ${stratLabel}`);
    }
  }

  if (unresolved.length > 0) {
    console.log('\n── Unresolved — will NOT be created ──────────────────────────────');
    for (const { entry, reason } of unresolved) {
      console.log(`  ${entry.fileNum.padEnd(12)} city="${entry.city || '(none)'}"  → ${reason}`);
    }
    console.log('\nTo create these sites, add --default-org <id> to assign them a fallback org.');
    console.log('Available orgs:');
    allOrgs.forEach(o => console.log(`  --default-org ${o.id}   "${o.name}"`));
  }

  if (args.dryRun) {
    console.log(`\nDRY RUN: would create ${toCreate.length} sites, skip ${unresolved.length} unresolved.`);
    console.log('Rerun without --dry-run to apply.');
    process.exit(0);
  }

  // ── Create sites ──────────────────────────────────────────────────────────
  console.log(`\nCreating ${toCreate.length} sites...`);
  let created = 0, errors = 0;
  const errMessages: string[] = [];

  for (const { entry, resolution } of toCreate) {
    try {
      await db.insert(schema.sites).values({
        companyId:     args.companyId,
        customerOrgId: resolution.org.id,
        name:          `Site ${entry.fileNum}`,
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
  console.log(`  Created    : ${created}`);
  console.log(`  Skipped    : ${alreadyExists.length} (already existed)`);
  console.log(`  Unresolved : ${unresolved.length} (no org — not created)`);
  console.log(`  Junk       : ${junkSkipped} (malformed FILE# values)`);
  console.log(`  Errors     : ${errors}`);

  if (errMessages.length) {
    console.log('\n── Errors ────────────────────────────────────────────────────────');
    errMessages.forEach(l => console.log(l));
  }

  if (unresolved.length > 0) {
    console.log(`\n── ${unresolved.length} unresolved (not created) ──────────────────────────────`);
    unresolved.forEach(({ entry, reason }) =>
      console.log(`  ${entry.fileNum.padEnd(12)} ${reason}`)
    );
    console.log('\nRerun with --default-org <id> to create these under a fallback org.');
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
