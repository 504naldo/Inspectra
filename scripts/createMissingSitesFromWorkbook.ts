/**
 * scripts/createMissingSitesFromWorkbook.ts
 *
 * Bulk-create stub sites for every workbook FILE# that has no matching DB site.
 * After this runs, seedMonthlyTracking.ts will match all rows by buildingId.
 *
 * Customer org resolution (per row, in priority order):
 *   1. --customer-org <id>   Force every row to this org. Skips all inference.
 *   2. --mapping-file <path> JSON file: { "#0032": 3, "#0330-1": 4 }
 *                            Explicit per-FILE# org assignment. Takes priority
 *                            over auto-inference for listed FILE#s.
 *   3. buildingId match      Existing DB site already has this FILE# as buildingId
 *                            → reuse its customerOrgId. Deterministic.
 *   4. City inference        All existing DB sites in this city share one org
 *                            → use that org. Deterministic.
 *
 * If none of the above resolves confidently the row is SKIPPED:
 *   - ambiguous  : city exists in DB but maps to multiple orgs → cannot guess
 *   - unresolved : city not present in any existing DB site, or no city in workbook
 *
 * There is no default-org fallback. Junk data under the wrong org is worse
 * than a skipped row that you fix manually.
 *
 * Mapping file format (JSON):
 *   {
 *     "#0032":   3,
 *     "#0330-1": 4,
 *     "#509":    3
 *   }
 *   Keys are FILE# strings (as they appear in the workbook, case-insensitive,
 *   leading-zero variations are normalised automatically). Values are org IDs.
 *
 * Usage:
 *   # Dry-run — see what would be created and under which org
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" \
 *     --company 1 --dry-run
 *
 *   # Supply a mapping file to assign specific FILE#s to specific orgs
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "..." --company 1 --mapping-file ./mapping.json --dry-run
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "..." --company 1 --mapping-file ./mapping.json
 *
 *   # Force ALL rows into one known org (use when the whole batch is one org)
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "..." --company 1 --customer-org 3 --dry-run
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "..." --company 1 --customer-org 3
 *
 *   # Include SPRING sheet FILE# values (skipped by default)
 *   pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \
 *     --file "..." --company 1 --include-spring --dry-run
 *
 * After running:
 *   pnpm exec tsx scripts/seedMonthlyTracking.ts \
 *     --file "..." --company 1 --all-sheets --dry-run
 */

import XLSX from 'xlsx';
import fs from 'fs';
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
  /** If set, ALL rows use this org. Disables all inference. */
  customerOrgId: number;
  /** Path to a JSON mapping file: { "#0032": 3, "#0330-1": 4 } */
  mappingFile: string;
  dryRun: boolean;
  includeSpring: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = {
    file: '', companyId: 1, customerOrgId: 0,
    mappingFile: '', dryRun: false, includeSpring: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':           a.file          = argv[++i]; break;
      case '--company':        a.companyId     = parseInt(argv[++i], 10); break;
      case '--customer-org':   a.customerOrgId = parseInt(argv[++i], 10); break;
      case '--mapping-file':   a.mappingFile   = argv[++i]; break;
      case '--dry-run':        a.dryRun        = true; break;
      case '--include-spring': a.includeSpring = true; break;
    }
  }
  return a;
}

// ─── Mapping file ─────────────────────────────────────────────────────────────

interface OrgRef { id: number; name: string }

/**
 * Load a JSON mapping file of the form { "#0032": 3, "#0330-1": 4 }.
 * Returns a Map<normFile, OrgRef>.
 * Warns and skips entries whose org ID doesn't exist under this company.
 */
function loadMappingFile(
  mappingFilePath: string,
  allOrgs: { id: number; name: string }[],
): Map<string, OrgRef> {
  const absPath = path.isAbsolute(mappingFilePath)
    ? mappingFilePath
    : path.resolve(process.cwd(), mappingFilePath);

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err: any) {
    console.error(`Cannot read mapping file "${absPath}": ${err.message}`);
    process.exit(1);
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    console.error(
      `Mapping file must be a JSON object like { "#0032": 3, "#0033": 4 }.\n` +
      `Got: ${JSON.stringify(raw)?.slice(0, 80)}`
    );
    process.exit(1);
  }

  const orgById = new Map(allOrgs.map(o => [o.id, o]));
  const result  = new Map<string, OrgRef>();
  const warnings: string[] = [];

  for (const [fileKey, orgIdRaw] of Object.entries(raw as Record<string, unknown>)) {
    const orgId = typeof orgIdRaw === 'number' ? orgIdRaw : parseInt(String(orgIdRaw), 10);
    if (isNaN(orgId)) {
      warnings.push(`  "${fileKey}": value "${orgIdRaw}" is not a valid org ID — skipped`);
      continue;
    }
    const org = orgById.get(orgId);
    if (!org) {
      warnings.push(`  "${fileKey}": org ID ${orgId} not found under this company — skipped`);
      continue;
    }
    result.set(normBldg(fileKey), { id: org.id, name: org.name });
  }

  console.log(`Mapping file: ${absPath}`);
  console.log(`  ${result.size} valid entries loaded`);
  if (warnings.length > 0) {
    console.log(`  ${warnings.length} entries skipped (invalid):`);
    warnings.forEach(w => console.log(w));
  }

  return result;
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

/**
 * Resolution result for a single workbook row.
 *
 * forced     — --customer-org override; all rows assigned unconditionally
 * mapped     — explicit entry in the --mapping-file JSON
 * auto       — deterministic inference from existing DB site data
 * ambiguous  — city is present in DB but maps to multiple orgs; cannot guess
 * unresolved — no city data, or city has no existing DB sites to infer from
 */
type OrgResolution =
  | { type: 'forced';     org: OrgRef }
  | { type: 'mapped';     org: OrgRef }
  | { type: 'auto';       org: OrgRef; reason: string }
  | { type: 'ambiguous';  reason: string }
  | { type: 'unresolved'; reason: string };

/**
 * Build lookup tables for per-row org resolution from existing DB site data.
 *
 * orgByBldgNorm  — normBldg(buildingId) → OrgRef
 * orgByNormCity  — normCity(city) → OrgRef | 'ambiguous'
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
  mappedOrgs: Map<string, OrgRef>,
): OrgResolution {
  // Strategy 1: global --customer-org override
  if (forcedOrg) {
    return { type: 'forced', org: forcedOrg };
  }

  // Strategy 2: explicit mapping file entry
  const mappedOrg = mappedOrgs.get(entry.normFile);
  if (mappedOrg) {
    return { type: 'mapped', org: mappedOrg };
  }

  // Strategy 3: existing DB site already has this buildingId → reuse its org
  const bldgOrg = orgByBldgNorm.get(entry.normFile);
  if (bldgOrg) {
    return {
      type: 'auto',
      org: bldgOrg,
      reason: `existing site with buildingId="${entry.fileNum}" uses this org`,
    };
  }

  // Strategy 4: city present → look up existing DB sites in that city
  if (entry.normCity) {
    const cityResult = orgByNormCity.get(entry.normCity);

    if (cityResult && cityResult !== 'ambiguous') {
      return {
        type: 'auto',
        org: cityResult,
        reason: `all existing sites in "${entry.city}" use this org`,
      };
    }

    if (cityResult === 'ambiguous') {
      return {
        type: 'ambiguous',
        reason: `city "${entry.city}" has existing sites in multiple orgs — add to --mapping-file or use --customer-org`,
      };
    }

    return {
      type: 'unresolved',
      reason: `no existing DB sites in "${entry.city}" — add to --mapping-file or use --customer-org`,
    };
  }

  return {
    type: 'unresolved',
    reason: 'workbook row has no CITY value — add to --mapping-file or use --customer-org',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error([
      'Usage: tsx scripts/createMissingSitesFromWorkbook.ts',
      '  --file <path> --company <id>',
      '  [--mapping-file <path>]   JSON: { "#0032": 3, "#0330-1": 4 }',
      '                            Explicit per-FILE# org assignment (takes priority over auto-inference)',
      '  [--customer-org <id>]     Force ALL rows into this org (overrides everything)',
      '  [--dry-run]',
      '  [--include-spring]',
      '',
      'Org is resolved per row (priority: --customer-org > mapping file > buildingId match > city inference).',
      'Rows that cannot be resolved confidently are skipped and logged for manual review.',
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

  // ── Resolve forced org (--customer-org) ──────────────────────────────────
  let forcedOrg: OrgRef | null = null;
  if (args.customerOrgId) {
    const o = allOrgs.find(x => x.id === args.customerOrgId);
    if (!o) {
      console.error(`\n--customer-org ${args.customerOrgId} not found under company ${args.companyId}.`);
      process.exit(1);
    }
    forcedOrg = { id: o.id, name: o.name };
    console.log(`\n--customer-org set: ALL rows will be assigned to "${o.name}" (id=${o.id})`);
  }

  // ── Load mapping file (--mapping-file) ──────────────────────────────────
  let mappedOrgs = new Map<string, OrgRef>();
  if (args.mappingFile) {
    if (forcedOrg) {
      console.log('\n--mapping-file is ignored when --customer-org is set (--customer-org takes priority).');
    } else {
      console.log('');
      mappedOrgs = loadMappingFile(args.mappingFile, allOrgs);
    }
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
    const cityEntries     = [...orgByNormCity.entries()];
    const uniqueCities    = cityEntries.filter(([, v]) => v !== 'ambiguous').length;
    const ambiguousCities = cityEntries.filter(([, v]) => v === 'ambiguous').length;
    console.log(`  City → org inference: ${uniqueCities} cities map to one org, ${ambiguousCities} cities are ambiguous`);
    if (uniqueCities === 0 && mappedOrgs.size === 0) {
      console.log('  No unambiguous city→org mappings and no --mapping-file supplied.');
      console.log('  Most rows will be unresolved unless you use --customer-org <id> or --mapping-file.');
    }
  }

  // ── Extract workbook FILE# values ────────────────────────────────────────
  const { entries: wbEntries, junkSkipped, noCity } =
    extractAllFileNumbers(workbook, args.includeSpring);

  console.log(`\nWorkbook: ${wbEntries.size} unique FILE# values found`);
  if (args.includeSpring)  console.log('  (including SPRING sheet)');
  if (junkSkipped > 0)     console.log(`  ${junkSkipped} junk/non-FILE# values skipped`);
  if (noCity.length > 0)   console.log(`  ${noCity.length} FILE#s have no CITY value`);

  // Warn about mapping file entries that don't match any workbook FILE#
  if (mappedOrgs.size > 0) {
    const unmatchedMappings = [...mappedOrgs.keys()].filter(nf => !wbEntries.has(nf));
    if (unmatchedMappings.length > 0) {
      console.log(`\n  Mapping file entries not found in workbook (${unmatchedMappings.length}):`);
      unmatchedMappings.forEach(nf => console.log(`    normFile="${nf}" — no matching workbook row`));
    }
  }

  // ── Classify and resolve orgs ────────────────────────────────────────────
  interface PendingCreate {
    entry:      WbSiteEntry;
    resolution: Extract<OrgResolution, { type: 'forced' | 'mapped' | 'auto' }>;
  }

  const alreadyExists: WbSiteEntry[]                        = [];
  const toCreate:      PendingCreate[]                      = [];
  const ambiguous:     Array<{ entry: WbSiteEntry; reason: string }> = [];
  const unresolved:    Array<{ entry: WbSiteEntry; reason: string }> = [];

  for (const [nFile, entry] of wbEntries) {
    if (existingBldgNorms.has(nFile)) {
      alreadyExists.push(entry);
      continue;
    }

    const resolution = resolveOrg(entry, orgByBldgNorm, orgByNormCity, forcedOrg, mappedOrgs);

    switch (resolution.type) {
      case 'forced':
      case 'mapped':
      case 'auto':
        toCreate.push({ entry, resolution });
        break;
      case 'ambiguous':
        ambiguous.push({ entry, reason: resolution.reason });
        break;
      case 'unresolved':
        unresolved.push({ entry, reason: resolution.reason });
        break;
    }
  }

  // Sort for predictable output
  toCreate.sort((a, b) => a.entry.fileNum.localeCompare(b.entry.fileNum));
  alreadyExists.sort((a, b) => a.fileNum.localeCompare(b.fileNum));
  ambiguous.sort((a, b) => a.entry.fileNum.localeCompare(b.entry.fileNum));
  unresolved.sort((a, b) => a.entry.fileNum.localeCompare(b.entry.fileNum));

  // ── Summary preview ──────────────────────────────────────────────────────
  console.log('\n── Classification ────────────────────────────────────────────────');
  console.log(`  Already have site (skip)  : ${alreadyExists.length}`);
  console.log(`  Will create               : ${toCreate.length}`);
  console.log(`    forced (--customer-org) : ${toCreate.filter(x => x.resolution.type === 'forced').length}`);
  console.log(`    mapped (--mapping-file) : ${toCreate.filter(x => x.resolution.type === 'mapped').length}`);
  console.log(`    auto-resolved           : ${toCreate.filter(x => x.resolution.type === 'auto').length}`);
  console.log(`  Ambiguous (skip)          : ${ambiguous.length}`);
  console.log(`  Unresolved (skip)         : ${unresolved.length}`);

  if (toCreate.length === 0 && ambiguous.length === 0 && unresolved.length === 0) {
    console.log('\nAll FILE# values already have a matching site. Nothing to do.');
    process.exit(0);
  }

  if (toCreate.length > 0) {
    console.log('\n── Sites to create ───────────────────────────────────────────────');
    for (const { entry, resolution } of toCreate) {
      const cityLabel = entry.city || '(no city)';
      const orgLabel  = `org="${resolution.org.name}" (id=${resolution.org.id})`;
      const stratLabel =
        resolution.type === 'forced' ? '[--customer-org override]' :
        resolution.type === 'mapped' ? '[--mapping-file]' :
        `[auto: ${resolution.reason}]`;
      console.log(`  ${entry.fileNum.padEnd(12)} city="${cityLabel.padEnd(20)}" ${orgLabel}  ${stratLabel}`);
    }
  }

  if (ambiguous.length > 0) {
    console.log('\n── Ambiguous — NOT created (city maps to multiple orgs) ──────────');
    for (const { entry, reason } of ambiguous) {
      console.log(`  ${entry.fileNum.padEnd(12)} city="${entry.city || '(none)'}"  → ${reason}`);
    }
  }

  if (unresolved.length > 0) {
    console.log('\n── Unresolved — NOT created (no org signal available) ────────────');
    for (const { entry, reason } of unresolved) {
      console.log(`  ${entry.fileNum.padEnd(12)} city="${entry.city || '(none)'}"  → ${reason}`);
    }
  }

  const skippedCount = ambiguous.length + unresolved.length;
  if (skippedCount > 0) {
    console.log(`\n── Manual review required for ${skippedCount} skipped rows ──────────────────`);
    console.log('  These FILE#s were not created because their customer org cannot be');
    console.log('  determined from the workbook data or existing site relationships.');
    console.log('');
    console.log('  Options:');
    console.log('  a) Add them to a mapping file and rerun with --mapping-file <path>:');
    console.log('       Create a JSON file: { "#0032": 3, "#0033-1": 4 }');
    console.log('     Available orgs:');
    allOrgs.forEach(o => console.log(`       ${o.id}: "${o.name}"`));
    console.log('');
    console.log('  b) If a whole batch belongs to one org, rerun with:');
    console.log('       --customer-org <id>   (forces all rows to that org)');
    console.log('');
    console.log('  c) Create the sites manually in the app with the correct org assigned.');
    console.log('     Once created, rerun this script — it will skip sites that already exist.');

    // Emit a ready-to-edit mapping file stub for the skipped rows
    const stubPath = path.join(process.cwd(), 'mapping-stub.json');
    if (!fs.existsSync(stubPath)) {
      const stub: Record<string, string> = {};
      [...ambiguous, ...unresolved].forEach(({ entry }) => {
        stub[entry.fileNum] = '<orgId>';
      });
      console.log(`\n  Mapping file stub written to: ${stubPath}`);
      console.log('  Edit it (replace <orgId> with actual numbers) then rerun with --mapping-file mapping-stub.json');
      if (!args.dryRun) {
        fs.writeFileSync(stubPath, JSON.stringify(stub, null, 2) + '\n', 'utf8');
      } else {
        console.log('  (dry-run: stub not written to disk)');
      }
    } else {
      console.log(`\n  Tip: mapping-stub.json already exists — update it and rerun with --mapping-file mapping-stub.json`);
    }
  }

  if (args.dryRun) {
    console.log(`\nDRY RUN: would create ${toCreate.length} sites; ${skippedCount} skipped (need manual review).`);
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
  console.log(`  Created          : ${created}`);
  console.log(`  Skipped (exists) : ${alreadyExists.length}`);
  console.log(`  Ambiguous (skip) : ${ambiguous.length}`);
  console.log(`  Unresolved (skip): ${unresolved.length}`);
  console.log(`  Junk             : ${junkSkipped} (malformed FILE# values)`);
  console.log(`  Errors           : ${errors}`);

  if (errMessages.length) {
    console.log('\n── Errors ────────────────────────────────────────────────────────');
    errMessages.forEach(l => console.log(l));
  }

  if (skippedCount > 0) {
    console.log(`\n── ${skippedCount} rows still need manual org assignment ──────────────────────`);
    if (ambiguous.length > 0) {
      console.log(`\n  Ambiguous (${ambiguous.length}) — city maps to multiple orgs:`);
      ambiguous.forEach(({ entry }) =>
        console.log(`    ${entry.fileNum.padEnd(12)} city="${entry.city}"`)
      );
    }
    if (unresolved.length > 0) {
      console.log(`\n  Unresolved (${unresolved.length}) — no org inference possible:`);
      unresolved.forEach(({ entry }) =>
        console.log(`    ${entry.fileNum.padEnd(12)} city="${entry.city || '(none)'}"`)
      );
    }
    console.log('');
    console.log('  Add these to a mapping file and rerun with --mapping-file <path>.');
    console.log('  Available orgs:');
    allOrgs.forEach(o => console.log(`    id=${o.id}  "${o.name}"`));
  }

  if (created > 0) {
    console.log('\nSites created. Now run the monthly tracking seed:');
    console.log(`  pnpm exec tsx scripts/seedMonthlyTracking.ts \\`);
    console.log(`    --file "${args.file}" --company ${args.companyId} --all-sheets --dry-run`);
    console.log(`  pnpm exec tsx scripts/seedMonthlyTracking.ts \\`);
    console.log(`    --file "${args.file}" --company ${args.companyId} --all-sheets`);
  }

  console.log('');
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
