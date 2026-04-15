/**
 * scripts/backfillSiteBuildingIds.ts
 *
 * Diagnostic + targeted backfill: reconcile sites.buildingId against the workbook.
 *
 * KEY FACT: this workbook has NO site-name column.
 * Columns present: ANNUAL AGREEMENT SIGNED? | FILE # | CITY | SERVICE TYPE | ...
 *
 * Because the workbook has no building name, we CANNOT automatically match
 * workbook FILE # values to existing DB sites by name.
 *
 * What this script CAN safely do:
 *   1. Report which DB sites already have buildingId matching a workbook FILE #
 *      (already correct — no action needed).
 *   2. Report which DB sites have a non-empty buildingId that is NOT in the
 *      workbook at all (possible stale/wrong value).
 *   3. Report which workbook FILE # values have no matching DB site at all
 *      (these need createMissingSitesFromWorkbook.ts).
 *   4. If a --name-col override is given (from a different workbook that HAS a
 *      name column), use name + city matching for those rows only.
 *
 * Usage:
 *   # Report current state (no DB writes)
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" --company 1
 *
 *   # Same — show raw workbook columns
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "..." --company 1 --dump-headers
 *
 *   # If you have a different workbook that includes a building name column,
 *   # specify which column index (0-based) holds the name:
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "..." --company 1 --name-col 2 --dry-run
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "..." --company 1 --name-col 2
 *
 * Safety rules (enforced regardless of matching mode):
 *   - Never overwrite a non-empty buildingId with a conflicting value.
 *   - Ambiguous matches (>1 DB site) → reported, never written.
 *   - Already-correct rows → counted as no-ops.
 *   - Safe to rerun: idempotent.
 */

import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';
import path from 'path';

config();

// ─── Normalization ────────────────────────────────────────────────────────────

/** Normalize a building/file ID — matches serviceScheduleRouter.normBldg() */
function normBldg(s: string): string {
  const a = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^\d+$/.test(a) ? String(parseInt(a, 10)) : a;
}

function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normCity(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Column detection ─────────────────────────────────────────────────────────

const FILE_KEYWORDS = ['file #', 'file#', 'file number', 'filenumber', 'file no', 'file'];
const NAME_KEYWORDS = ['building name', 'buildingname', 'property name', 'site name', 'sitename', 'building', 'property', 'site', 'name'];
const CITY_KEYWORDS = ['city', 'municipality', 'town'];

function findColByKeywords(headers: string[], keywords: string[]): number {
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

// ─── Sheet helpers ────────────────────────────────────────────────────────────

const SKIP_SHEETS = new Set(['SPRING', 'WINTER']);
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
  dryRun: boolean;
  dumpHeaders: boolean;
  nameColOverride: number; // -1 = not provided (workbook has no name col)
  cityColOverride: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = { file: '', companyId: 1, dryRun: false, dumpHeaders: false, nameColOverride: -1, cityColOverride: -1 };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':        a.file           = argv[++i]; break;
      case '--company':     a.companyId      = parseInt(argv[++i], 10); break;
      case '--dry-run':     a.dryRun         = true; break;
      case '--dump-headers': a.dumpHeaders   = true; break;
      case '--name-col':    a.nameColOverride = parseInt(argv[++i], 10); break;
      case '--city-col':    a.cityColOverride = parseInt(argv[++i], 10); break;
    }
  }
  return a;
}

// ─── Workbook index ───────────────────────────────────────────────────────────

interface WbEntry {
  fileNum: string;   // raw, e.g. "#0032"
  normFile: string;  // normalized, e.g. "32"
  name: string;      // raw name (empty if column not present)
  normName: string;
  city: string;
  normCity: string;
  sheet: string;
}

function buildWorkbookIndex(
  workbook: XLSX.WorkBook,
  nameColOverride: number,
  cityColOverride: number,
): { entries: Map<string, WbEntry>; columnReport: string[] } {
  const entries = new Map<string, WbEntry>();
  const columnReport: string[] = [];
  const reportedSheets = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const upper = sheetName.toUpperCase();
    if (SKIP_SHEETS.has(upper) || !SHEET_MONTH_MAP[upper]) continue;

    const ws = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const hi = detectHeaderRow(rows);
    const headers = (rows[hi] as unknown[]).map(c => String(c ?? '').trim());

    const fileIdx = findColByKeywords(headers, FILE_KEYWORDS);
    const nameIdx = nameColOverride >= 0 ? nameColOverride : findColByKeywords(headers, NAME_KEYWORDS);
    const cityIdx = cityColOverride >= 0 ? cityColOverride : findColByKeywords(headers, CITY_KEYWORDS);

    if (!reportedSheets.has(upper)) {
      const colStr = headers.map((h, i) => `${i}:"${h}"`).join(', ');
      const detected = `FILE#=${fileIdx} NAME=${nameIdx} CITY=${cityIdx}`;
      columnReport.push(`  ${sheetName.padEnd(4)} headerRow=${hi} [${detected}] — ${colStr}`);
      reportedSheets.add(upper);
    }

    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      if (row.every(c => c == null || c === '')) continue;

      const rawFile = fileIdx >= 0 ? String(row[fileIdx] ?? '').trim() : '';
      if (!rawFile) continue;

      const nFile = normBldg(rawFile);
      if (entries.has(nFile)) continue; // first occurrence wins

      const rawName = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : '';
      const rawCity = cityIdx >= 0 ? String(row[cityIdx] ?? '').trim() : '';

      entries.set(nFile, {
        fileNum: rawFile,
        normFile: nFile,
        name: rawName,
        normName: normStr(rawName),
        city: rawCity,
        normCity: normCity(rawCity),
        sheet: sheetName,
      });
    }
  }

  return { entries, columnReport };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error('Usage: tsx scripts/backfillSiteBuildingIds.ts --file <path> --company <id> [--dry-run] [--dump-headers] [--name-col N]');
    process.exit(1);
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);

  console.log(`\nReading: ${filePath}`);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (err: any) {
    console.error(`Cannot open file: ${err.message}`); process.exit(1);
  }

  const { entries: wbEntries, columnReport } = buildWorkbookIndex(workbook, args.nameColOverride, args.cityColOverride);

  // ── --dump-headers ──────────────────────────────────────────────────────────
  if (args.dumpHeaders) {
    console.log('\n── Workbook column layout ────────────────────────────────────────');
    columnReport.forEach(l => console.log(l));
    console.log(`\n── Workbook entries (${wbEntries.size} unique FILE#) ────────────────────`);
    for (const [, e] of wbEntries) {
      const namePart = e.name ? `  name="${e.name}"` : '  (no name column)';
      console.log(`  ${e.fileNum.padEnd(12)} city="${e.city}"${namePart}`);
    }
    process.exit(0);
  }

  // ── Has name column? ────────────────────────────────────────────────────────
  const hasNameCol = args.nameColOverride >= 0 || [...wbEntries.values()].some(e => e.name);
  if (!hasNameCol) {
    console.log('\n⚠  Workbook has no building/site name column.');
    console.log('   This script can only report on already-matched sites.');
    console.log('   To create missing sites, run createMissingSitesFromWorkbook.ts instead.\n');
  }

  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
  if (args.dryRun) console.log('DRY RUN — no DB writes\n');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });
  const allSites = await db.select().from(schema.sites).where(eq(schema.sites.companyId, args.companyId));
  console.log(`DB sites for company ${args.companyId}: ${allSites.length}\n`);

  // Build lookup: normBldg(buildingId) → site (for sites that already have buildingId)
  const siteByBldg = new Map<string, typeof allSites[0]>();
  for (const s of allSites) {
    if (s.buildingId) siteByBldg.set(normBldg(s.buildingId), s);
  }

  // ── Phase 1: Exact buildingId match (already correct) ──────────────────────
  let nAlreadyCorrect = 0;
  let nSiteConflict   = 0;
  const conflicts: string[] = [];

  for (const [nFile, wb] of wbEntries) {
    const site = siteByBldg.get(nFile);
    if (!site) continue;

    if (normBldg(site.buildingId!) === nFile) {
      nAlreadyCorrect++;
    } else {
      nSiteConflict++;
      conflicts.push(`  FILE# ${wb.fileNum.padEnd(12)} → site "${site.name}" (id=${site.id}) has buildingId="${site.buildingId}"`);
    }
  }

  // ── Phase 2: Name+city matching (only when workbook has a name column) ──────
  let nUpdated   = 0;
  let nAmbiguous = 0;
  const updates:   Array<{ siteId: number; siteName: string; fileNum: string; strategy: string }> = [];
  const ambiguous: string[] = [];
  const unmatchedInDb: string[] = [];

  if (hasNameCol) {
    // Build name+city and name-only lookups over DB sites that lack buildingId
    const unboundSites = allSites.filter(s => !s.buildingId);
    const byNameCity = new Map<string, typeof allSites>();
    const byName     = new Map<string, typeof allSites>();
    for (const s of unboundSites) {
      const sn = normStr(s.name);
      const sc = normCity(s.city ?? '');
      const ncKey = `${sn}||${sc}`;
      if (!byNameCity.has(ncKey)) byNameCity.set(ncKey, []);
      byNameCity.get(ncKey)!.push(s);
      if (!byName.has(sn)) byName.set(sn, []);
      byName.get(sn)!.push(s);
    }

    for (const [nFile, wb] of wbEntries) {
      if (siteByBldg.has(nFile)) continue; // already matched
      if (!wb.normName) continue;          // no name → can't match

      // Strategy 1: exact name + city
      const ncKey = `${wb.normName}||${wb.normCity}`;
      const ncCandidates = byNameCity.get(ncKey) ?? [];
      if (ncCandidates.length === 1) {
        const s = ncCandidates[0];
        // Safety: make sure no other workbook FILE # is also targeting this same site
        const alreadyTargeted = updates.find(u => u.siteId === s.id);
        if (alreadyTargeted) {
          nAmbiguous++;
          ambiguous.push(`  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}" → same site as FILE# ${alreadyTargeted.fileNum} (ambiguous — multiple FILE# map to one DB site)`);
          continue;
        }
        console.log(`  [name+city] "${s.name}" (id=${s.id}) ← buildingId="${wb.fileNum}"`);
        updates.push({ siteId: s.id, siteName: s.name, fileNum: wb.fileNum, strategy: 'name+city' });
        nUpdated++;
        continue;
      }
      if (ncCandidates.length > 1) {
        nAmbiguous++;
        ambiguous.push(`  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}" → ${ncCandidates.length} sites match (ambiguous)`);
        continue;
      }

      // Strategy 2: exact name alone (only when globally unique among unbound sites)
      const nameCandidates = byName.get(wb.normName) ?? [];
      if (nameCandidates.length === 1) {
        const s = nameCandidates[0];
        const alreadyTargeted = updates.find(u => u.siteId === s.id);
        if (alreadyTargeted) {
          nAmbiguous++;
          ambiguous.push(`  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" → same site as FILE# ${alreadyTargeted.fileNum} (ambiguous)`);
          continue;
        }
        console.log(`  [name-unique] "${s.name}" (id=${s.id}) ← buildingId="${wb.fileNum}"`);
        updates.push({ siteId: s.id, siteName: s.name, fileNum: wb.fileNum, strategy: 'name-unique' });
        nUpdated++;
        continue;
      }

      // No safe match
      unmatchedInDb.push(`  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}" → no unbound site matches`);
    }
  }

  // ── Phase 3: Workbook FILE # values that have no DB site at all ─────────────
  const needsSiteCreation: WbEntry[] = [];
  for (const [nFile, wb] of wbEntries) {
    if (siteByBldg.has(nFile)) continue;
    if (updates.find(u => normBldg(u.fileNum) === nFile)) continue;
    needsSiteCreation.push(wb);
  }

  // ── Apply updates ─────────────────────────────────────────────────────────
  if (!args.dryRun && updates.length > 0) {
    console.log(`\nApplying ${updates.length} buildingId updates...`);
    for (const u of updates) {
      await db.update(schema.sites).set({ buildingId: u.fileNum }).where(eq(schema.sites.id, u.siteId));
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('\n── Column detection ──────────────────────────────────────────────');
  columnReport.slice(0, 3).forEach(l => console.log(l));
  if (columnReport.length > 3) console.log(`  ... (${columnReport.length} sheets total, all same layout)`);
  if (!hasNameCol) {
    console.log('\n  ℹ  No name column detected. Name+city matching was not attempted.');
    console.log('     Provide --name-col <N> if your workbook has a building name at a specific column index.');
  }

  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(`  Workbook unique FILE#          : ${wbEntries.size}`);
  console.log(`  DB sites (company ${args.companyId})        : ${allSites.length}`);
  console.log(`    with buildingId set           : ${siteByBldg.size}`);
  console.log(`    without buildingId            : ${allSites.length - siteByBldg.size}`);
  console.log(`  Already correctly matched       : ${nAlreadyCorrect}`);
  if (hasNameCol) {
    console.log(`  Matched via name (to update)    : ${nUpdated}${args.dryRun ? ' (dry run)' : ''}`);
    console.log(`  Ambiguous (skipped)             : ${nAmbiguous}`);
  }
  console.log(`  buildingId conflicts (skipped)  : ${nSiteConflict}`);
  console.log(`  Need site creation              : ${needsSiteCreation.length}`);

  if (conflicts.length) {
    console.log('\n── buildingId conflicts (review manually) ───────────────────────');
    conflicts.forEach(l => console.log(l));
  }
  if (ambiguous.length) {
    console.log('\n── Ambiguous matches (skipped) ───────────────────────────────────');
    ambiguous.forEach(l => console.log(l));
  }
  if (unmatchedInDb.length) {
    console.log('\n── Unmatched (no DB site with this name+city) ────────────────────');
    unmatchedInDb.forEach(l => console.log(l));
  }
  if (needsSiteCreation.length) {
    console.log(`\n── ${needsSiteCreation.length} FILE# values need a new site ──────────────────────────`);
    needsSiteCreation.forEach(e => console.log(`  ${e.fileNum.padEnd(12)} city="${e.city}"`));
    console.log('\nRun createMissingSitesFromWorkbook.ts to create these sites:');
    console.log(`  pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \\`);
    console.log(`    --file "${args.file}" --company ${args.companyId} --customer-org <ID> --dry-run`);
  }

  console.log('');
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
