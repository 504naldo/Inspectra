/**
 * scripts/backfillSiteBuildingIds.ts
 *
 * Reconcile sites.buildingId against the monthly service workbook.
 *
 * KEY FACT: the FILE MONTHLY SERVICE LIST workbook has NO site-name column.
 * Columns present: ANNUAL AGREEMENT SIGNED? | FILE # | CITY | SERVICE TYPE | ...
 *
 * Matching strategies (applied in order, most precise first):
 *   1. Exact buildingId   normBldg(site.buildingId) == normBldg(FILE#) → already correct
 *   2. Name + city        only when --name-col provided; unique name+city pair
 *   3. Name unique        only when --name-col provided; globally unique name
 *   4. City unique        exactly ONE unmatched workbook FILE# AND exactly ONE unbound
 *                         DB site share the same normalized city — no other candidates
 *   5. Ambiguous          multiple candidates on either side → NEVER assigned
 *   6. No candidate       no DB site for this FILE# → direct to createMissingSitesFromWorkbook
 *
 * Safety rules (always enforced):
 *   - Never overwrite a non-empty buildingId with a conflicting value
 *   - Multiple candidates on either side → ambiguous, skipped
 *   - Already-correct rows are no-ops
 *   - Safe to rerun (idempotent)
 *   - Original FILE# values are preserved (#0330-1 stays #0330-1)
 *
 * Usage:
 *   # Dry-run report (no DB writes)
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" \
 *     --company 1 --dry-run
 *
 *   # Live run
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "..." --company 1
 *
 *   # Inspect workbook column layout
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "..." --company 1 --dump-headers
 *
 *   # Workbook that also has a site-name column (enables strategies 2 & 3)
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "..." --company 1 --name-col 2 --dry-run
 */

import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';
import path from 'path';

config();

// ─── Normalization ────────────────────────────────────────────────────────────

/** Mirrors serviceScheduleRouter.normBldg(): "#0007"→"7", "#0330-1"→"03301" */
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
  nameColOverride: number; // -1 = not provided
  cityColOverride: number; // -1 = not provided
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = { file: '', companyId: 1, dryRun: false, dumpHeaders: false, nameColOverride: -1, cityColOverride: -1 };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':          a.file            = argv[++i]; break;
      case '--company':       a.companyId       = parseInt(argv[++i], 10); break;
      case '--dry-run':       a.dryRun          = true; break;
      case '--dump-headers':  a.dumpHeaders     = true; break;
      case '--name-col':      a.nameColOverride = parseInt(argv[++i], 10); break;
      case '--city-col':      a.cityColOverride = parseInt(argv[++i], 10); break;
    }
  }
  return a;
}

// ─── Workbook index ───────────────────────────────────────────────────────────

interface WbEntry {
  fileNum:  string; // raw, e.g. "#0032"
  normFile: string; // normalized, e.g. "32"
  name:     string; // raw name (empty if no name column)
  normName: string;
  city:     string; // raw city
  normCity: string;
  sheet:    string;
}

interface WorkbookIndex {
  entries:       Map<string, WbEntry>;   // normFile → entry (first occurrence wins)
  byNormCity:    Map<string, WbEntry[]>; // normCity → entries
  columnReport:  string[];
  hasNameCol:    boolean;
  hasCityCol:    boolean;
}

function buildWorkbookIndex(
  workbook: XLSX.WorkBook,
  nameColOverride: number,
  cityColOverride: number,
): WorkbookIndex {
  const entries       = new Map<string, WbEntry>();
  const columnReport: string[] = [];
  const reportedSheets = new Set<string>();
  let detectedNameCol = -1;
  let detectedCityCol = -1;

  for (const sheetName of workbook.SheetNames) {
    const upper = sheetName.toUpperCase();
    if (SKIP_SHEETS.has(upper) || !SHEET_MONTH_MAP[upper]) continue;

    const ws = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const hi      = detectHeaderRow(rows);
    const headers = (rows[hi] as unknown[]).map(c => String(c ?? '').trim());

    const fileIdx = findColByKeywords(headers, FILE_KEYWORDS);
    const nameIdx = nameColOverride >= 0 ? nameColOverride : findColByKeywords(headers, NAME_KEYWORDS);
    const cityIdx = cityColOverride >= 0 ? cityColOverride : findColByKeywords(headers, CITY_KEYWORDS);

    if (detectedNameCol === -1 && nameIdx >= 0) detectedNameCol = nameIdx;
    if (detectedCityCol === -1 && cityIdx >= 0) detectedCityCol = cityIdx;

    if (!reportedSheets.has(upper)) {
      const fileLabel = fileIdx >= 0 ? `${fileIdx}:"${headers[fileIdx]}"` : 'none';
      const nameLabel = nameIdx >= 0 ? `${nameIdx}:"${headers[nameIdx]}"` : 'none';
      const cityLabel = cityIdx >= 0 ? `${cityIdx}:"${headers[cityIdx]}"` : 'none';
      columnReport.push(
        `  ${sheetName.padEnd(4)} headerRow=${hi}  FILE#=${fileLabel}  NAME=${nameLabel}  CITY=${cityLabel}`
      );
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
        fileNum:  rawFile,
        normFile: nFile,
        name:     rawName,
        normName: normStr(rawName),
        city:     rawCity,
        normCity: normCity(rawCity),
        sheet:    sheetName,
      });
    }
  }

  // Build city index over all workbook entries
  const byNormCity = new Map<string, WbEntry[]>();
  for (const entry of entries.values()) {
    if (!entry.normCity) continue;
    const arr = byNormCity.get(entry.normCity) ?? [];
    arr.push(entry);
    byNormCity.set(entry.normCity, arr);
  }

  return {
    entries,
    byNormCity,
    columnReport,
    hasNameCol: nameColOverride >= 0 || detectedNameCol >= 0,
    hasCityCol: cityColOverride >= 0 || detectedCityCol >= 0,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchStrategy = 'name+city' | 'name-unique' | 'city-unique';

interface MatchUpdate {
  siteId:   number;
  siteName: string;
  fileNum:  string;
  strategy: MatchStrategy;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error([
      'Usage: tsx scripts/backfillSiteBuildingIds.ts',
      '  --file <path> --company <id>',
      '  [--dry-run]          (default: live run)',
      '  [--dump-headers]     (inspect workbook columns and exit)',
      '  [--name-col N]       (0-based column index holding site name in workbook)',
      '  [--city-col N]       (0-based column index for city if auto-detect fails)',
    ].join('\n'));
    process.exit(1);
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  console.log(`\nReading: ${filePath}`);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (err: any) {
    console.error(`Cannot open file: ${err.message}`);
    process.exit(1);
  }

  const { entries: wbEntries, byNormCity: wbByCity, columnReport, hasNameCol, hasCityCol } =
    buildWorkbookIndex(workbook, args.nameColOverride, args.cityColOverride);

  // ── --dump-headers ──────────────────────────────────────────────────────────
  if (args.dumpHeaders) {
    console.log('\n── Workbook column layout ────────────────────────────────────────');
    columnReport.forEach(l => console.log(l));
    console.log(`\n── Workbook entries (${wbEntries.size} unique FILE#) ────────────────────`);
    for (const e of wbEntries.values()) {
      const namePart = e.name ? `  name="${e.name}"` : '  (no name col)';
      console.log(`  ${e.fileNum.padEnd(12)} city="${e.city}"${namePart}`);
    }
    process.exit(0);
  }

  // ── Column detection summary ────────────────────────────────────────────────
  console.log('\n── Workbook column detection ─────────────────────────────────────');
  columnReport.slice(0, 3).forEach(l => console.log(l));
  if (columnReport.length > 3) console.log(`  ... (${columnReport.length} sheets — all same layout)`);
  if (!hasNameCol) {
    console.log('\n  ⚠  No site-name column detected — strategies 2 (name+city) and 3 (name-unique) skipped.');
    console.log('     Pass --name-col N if your workbook has a building name at column index N.');
  }
  if (!hasCityCol) {
    console.log('  ⚠  No city column detected — strategy 4 (city-unique) skipped.');
  }

  if (!process.env.DATABASE_URL) { console.error('\nDATABASE_URL not set'); process.exit(1); }
  if (args.dryRun) console.log('\nDRY RUN — no DB writes');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });
  const allSites = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.companyId, args.companyId));

  // ── Categorise DB sites ─────────────────────────────────────────────────────
  const allWbNormFiles = new Set(wbEntries.keys());

  const alreadyCorrect: typeof allSites   = [];
  const staleId:        typeof allSites   = [];
  const unboundSites:   typeof allSites   = [];
  const siteByBldgNorm  = new Map<string, typeof allSites[0]>();

  for (const s of allSites) {
    if (s.buildingId) {
      const nb = normBldg(s.buildingId);
      siteByBldgNorm.set(nb, s);
      if (allWbNormFiles.has(nb)) {
        alreadyCorrect.push(s);
      } else {
        staleId.push(s); // has a buildingId but it's not in the workbook
      }
    } else {
      unboundSites.push(s);
    }
  }

  console.log(`\nDB sites for company ${args.companyId}: ${allSites.length} total`);
  console.log(`  already correct (buildingId in workbook) : ${alreadyCorrect.length}`);
  console.log(`  stale buildingId (not in workbook)       : ${staleId.length}`);
  console.log(`  no buildingId — candidates for matching  : ${unboundSites.length}`);
  console.log(`\nWorkbook unique FILE# values: ${wbEntries.size}`);

  if (unboundSites.length === 0) {
    console.log('\nAll DB sites already have buildingId — nothing to assign.');
    reportStaleIds(staleId);
    process.exit(0);
  }

  // ── Phase 2: Name + city  /  Name unique  (only when workbook has name col) ─
  const updates:        MatchUpdate[] = [];
  const ambiguous:      string[]      = [];
  const assignedSiteIds = new Set<number>();

  if (hasNameCol) {
    const byNameCity = new Map<string, typeof unboundSites>();
    const byName     = new Map<string, typeof unboundSites>();

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
      if (siteByBldgNorm.has(nFile)) continue; // already correct
      if (!wb.normName) continue;               // no name in workbook row → skip phases 2 & 3

      // Strategy 2: name + city
      const ncKey       = `${wb.normName}||${wb.normCity}`;
      const ncCandidates = byNameCity.get(ncKey) ?? [];

      if (ncCandidates.length === 1) {
        const s = ncCandidates[0];
        if (assignedSiteIds.has(s.id)) {
          const prior = updates.find(u => u.siteId === s.id);
          ambiguous.push(
            `  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}"` +
            ` → site already claimed by FILE# ${prior?.fileNum} [name+city: 2 FILE#s → 1 site]`
          );
        } else {
          updates.push({ siteId: s.id, siteName: s.name, fileNum: wb.fileNum, strategy: 'name+city' });
          assignedSiteIds.add(s.id);
        }
        continue;
      }
      if (ncCandidates.length > 1) {
        ambiguous.push(
          `  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}"` +
          ` → ${ncCandidates.length} DB sites match name+city [ambiguous]`
        );
        continue;
      }

      // Strategy 3: name only (globally unique among unbound sites)
      const nameCandidates = byName.get(wb.normName) ?? [];

      if (nameCandidates.length === 1) {
        const s = nameCandidates[0];
        if (assignedSiteIds.has(s.id)) {
          const prior = updates.find(u => u.siteId === s.id);
          ambiguous.push(
            `  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}"` +
            ` → site already claimed by FILE# ${prior?.fileNum} [name-unique: 2 FILE#s → 1 site]`
          );
        } else {
          updates.push({ siteId: s.id, siteName: s.name, fileNum: wb.fileNum, strategy: 'name-unique' });
          assignedSiteIds.add(s.id);
        }
        continue;
      }
      if (nameCandidates.length > 1) {
        ambiguous.push(
          `  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}"` +
          ` → ${nameCandidates.length} DB sites share this name [ambiguous]`
        );
      }
      // name not found at all → will be caught by city-unique or needsSiteCreation below
    }
  }

  // ── Phase 3: City-unique matching ───────────────────────────────────────────
  // Assign only when BOTH sides are unique in that city:
  //   - exactly 1 unmatched workbook FILE# has this normalized city
  //   - exactly 1 unbound DB site (not yet assigned) has this normalized city
  //
  // Prevents the "Vancouver problem": 307 workbook entries → ambiguous, never assigned.
  if (hasCityCol) {
    // Unbound DB sites not yet assigned, grouped by city
    const dbByCityUnbound = new Map<string, typeof unboundSites>();
    for (const s of unboundSites) {
      if (assignedSiteIds.has(s.id)) continue;
      const sc = normCity(s.city ?? '');
      if (!sc) continue;
      const arr = dbByCityUnbound.get(sc) ?? [];
      arr.push(s);
      dbByCityUnbound.set(sc, arr);
    }

    // Workbook FILE#s not yet matched (not in siteByBldgNorm, not in updates), grouped by city
    const assignedNormFilesSet = new Set(updates.map(u => normBldg(u.fileNum)));
    const wbByCityUnmatched    = new Map<string, WbEntry[]>();
    for (const [nFile, wb] of wbEntries) {
      if (siteByBldgNorm.has(nFile))     continue; // already correct
      if (assignedNormFilesSet.has(nFile)) continue; // name-matched
      if (!wb.normCity)                   continue;
      const arr = wbByCityUnmatched.get(wb.normCity) ?? [];
      arr.push(wb);
      wbByCityUnmatched.set(wb.normCity, arr);
    }

    for (const [city, wbList] of wbByCityUnmatched) {
      const dbList = dbByCityUnbound.get(city) ?? [];

      if (wbList.length === 1 && dbList.length === 1) {
        // Unique on both sides — safe to assign
        const wb = wbList[0];
        const s  = dbList[0];
        if (assignedSiteIds.has(s.id)) {
          const prior = updates.find(u => u.siteId === s.id);
          ambiguous.push(
            `  FILE# ${wb.fileNum.padEnd(12)} city="${wb.city}"` +
            ` → site "${s.name}" already claimed by FILE# ${prior?.fileNum} [city-unique conflict]`
          );
        } else {
          updates.push({ siteId: s.id, siteName: s.name, fileNum: wb.fileNum, strategy: 'city-unique' });
          assignedSiteIds.add(s.id);
        }
      } else {
        // Not unique — report all unmatched workbook entries in this city as ambiguous
        for (const wb of wbList) {
          let reason: string;
          if (wbList.length > 1 && dbList.length > 1) {
            reason = `${wbList.length} workbook FILE#s and ${dbList.length} DB sites share city "${wb.city}"`;
          } else if (wbList.length > 1) {
            reason = `${wbList.length} workbook FILE#s share city "${wb.city}" (${dbList.length} DB site${dbList.length !== 1 ? 's' : ''})`;
          } else {
            reason = `1 workbook FILE# but ${dbList.length} DB sites in city "${wb.city}"`;
          }
          ambiguous.push(`  FILE# ${wb.fileNum.padEnd(12)} city="${wb.city}" → ${reason} [city not unique, ambiguous]`);
        }
      }
    }
  }

  // ── Apply updates ──────────────────────────────────────────────────────────
  if (!args.dryRun && updates.length > 0) {
    console.log(`\nApplying ${updates.length} buildingId updates...`);
    for (const u of updates) {
      await db
        .update(schema.sites)
        .set({ buildingId: u.fileNum })
        .where(eq(schema.sites.id, u.siteId));
    }
    console.log('Done.');
  }

  // ── Workbook FILE#s that have no DB site at all ────────────────────────────
  const assignedNormFiles  = new Set(updates.map(u => normBldg(u.fileNum)));
  const needsSiteCreation: WbEntry[] = [];
  for (const [nFile, wb] of wbEntries) {
    if (siteByBldgNorm.has(nFile))   continue;
    if (assignedNormFiles.has(nFile)) continue;
    needsSiteCreation.push(wb);
  }

  // DB sites still without a match
  const unmatchedDbSites = unboundSites.filter(s => !assignedSiteIds.has(s.id));

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(`  Workbook unique FILE# values     : ${wbEntries.size}`);
  console.log(`  DB sites (company ${args.companyId})           : ${allSites.length}`);
  console.log(`    already correct                : ${alreadyCorrect.length}`);
  console.log(`    stale buildingId (not in wb)   : ${staleId.length}`);
  console.log(`    unbound (no buildingId)        : ${unboundSites.length}`);
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  Matched via name+city            : ${updates.filter(u => u.strategy === 'name+city').length}`);
  console.log(`  Matched via name-unique          : ${updates.filter(u => u.strategy === 'name-unique').length}`);
  console.log(`  Matched via city-unique          : ${updates.filter(u => u.strategy === 'city-unique').length}`);
  console.log(`  Ambiguous — skipped              : ${ambiguous.length}`);
  console.log(`  DB sites with no match           : ${unmatchedDbSites.length}`);
  console.log(`  Workbook FILE#s needing new site : ${needsSiteCreation.length}`);
  if (args.dryRun && updates.length > 0) {
    console.log(`  Would update (dry run)           : ${updates.length}`);
  }

  reportStaleIds(staleId);

  if (updates.length > 0) {
    const label = args.dryRun ? 'Matched — DRY RUN (would apply)' : 'Applied';
    console.log(`\n── ${label} (${updates.length}) ──────────────────────────────────────`);
    for (const u of updates) {
      console.log(`  [${u.strategy.padEnd(12)}] site "${u.siteName}" (id=${u.siteId}) ← buildingId="${u.fileNum}"`);
    }
  }

  if (ambiguous.length > 0) {
    console.log(`\n── Ambiguous (${ambiguous.length} — skipped) ─────────────────────────────────`);
    ambiguous.forEach(l => console.log(l));
  }

  if (unmatchedDbSites.length > 0) {
    console.log(`\n── DB sites with no buildingId and no workbook match (${unmatchedDbSites.length}) ─────────`);
    console.log('   These sites exist in the DB but no workbook FILE# maps to them.');
    console.log('   They require manual review or a different workbook with a name column.\n');
    unmatchedDbSites.forEach(s =>
      console.log(`  id=${String(s.id).padEnd(5)} name="${s.name}"  city="${s.city ?? ''}"`)
    );
  }

  if (needsSiteCreation.length > 0) {
    console.log(`\n── ${needsSiteCreation.length} workbook FILE#s need a new DB site ────────────────────────`);
    const preview = needsSiteCreation.slice(0, 25);
    preview.forEach(e => console.log(`  ${e.fileNum.padEnd(12)} city="${e.city}"`));
    if (needsSiteCreation.length > 25) console.log(`  ... and ${needsSiteCreation.length - 25} more`);
    console.log('\nNext step — create stub sites for all of them:');
    console.log(`  pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \\`);
    console.log(`    --file "${args.file}" --company ${args.companyId} --dry-run`);
    console.log(`  pnpm exec tsx scripts/createMissingSitesFromWorkbook.ts \\`);
    console.log(`    --file "${args.file}" --company ${args.companyId}`);
  }

  console.log('');
}

function reportStaleIds(staleId: { id: number; name: string; buildingId: string | null }[]) {
  if (staleId.length === 0) return;
  console.log('\n── Sites with stale buildingId (not in workbook) ─────────────────');
  console.log('   buildingId is set but does not match any workbook FILE#.');
  console.log('   Review manually — do not auto-reassign.\n');
  staleId.forEach(s =>
    console.log(`  id=${String(s.id).padEnd(5)} buildingId="${s.buildingId}"  name="${s.name}"`)
  );
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
