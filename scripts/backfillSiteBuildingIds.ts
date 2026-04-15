/**
 * scripts/backfillSiteBuildingIds.ts
 *
 * One-time backfill: read every monthly sheet in the service workbook,
 * extract (FILE #, site name, city) tuples, match them against DB sites,
 * and write buildingId = FILE # onto matched sites.
 *
 * After this runs, seedMonthlyTracking.ts (which matches on buildingId)
 * will be able to create monthly_service_tracking rows.
 *
 * Usage:
 *   # See what columns the workbook actually contains
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" --dump-headers
 *
 *   # Dry run — see what would be updated
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" --company 1 --dry-run
 *
 *   # Live run
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" --company 1
 *
 *   # If the name column index isn't auto-detected (0-based), specify it:
 *   pnpm exec tsx scripts/backfillSiteBuildingIds.ts \
 *     --file "..." --company 1 --name-col 2 --city-col 3 --dry-run
 *
 * Matching strategy (in order):
 *   1. Normalized name + normalized city  (most specific — preferred)
 *   2. Normalized name alone              (only when name is globally unique in DB)
 *   3. Normalized address + city          (fallback if no name col found)
 *
 * Safety rules:
 *   - Ambiguous matches (>1 DB site matches) → reported, never written
 *   - Conflicts (site already has a DIFFERENT buildingId) → reported, never overwritten
 *   - Already correct (site.buildingId === FILE #) → counted but not re-written
 *   - Blank FILE # rows → skipped
 *   - Safe to rerun: idempotent, no-ops on already-populated rows
 */

import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';
import path from 'path';

config();

// ─── Normalization ────────────────────────────────────────────────────────────

/** Strip punctuation/spaces/case for loose comparison */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Normalize a building/file ID.
 * "#0007" → "7", "#0330-1" → "3301", "0007" → "7"
 * Strips non-alphanumeric, collapses leading zeros for pure numeric segments.
 */
function normBldg(s: string): string {
  const stripped = s.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  // If purely numeric after stripping, remove leading zeros
  if (/^\d+$/.test(stripped)) return String(parseInt(stripped, 10));
  // For compound IDs like "0330-1", normalize each segment
  return stripped.split('-').map(seg =>
    /^\d+$/.test(seg) ? String(parseInt(seg, 10)) : seg
  ).join('-');
}

/** Normalize a city name for comparison */
function normCity(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Column detection ─────────────────────────────────────────────────────────

const NAME_KEYWORDS   = ['building name', 'buildingname', 'property name', 'site name', 'sitename', 'building', 'property', 'site', 'name', 'address'];
const CITY_KEYWORDS   = ['city', 'municipality', 'town', 'location'];
const FILE_KEYWORDS   = ['file #', 'file#', 'file number', 'filenumber', 'file no', 'file'];

function findColByKeywords(headers: string[], keywords: string[]): number {
  const normHeaders = headers.map(h => h.toLowerCase().trim());
  // Try exact match first
  for (const kw of keywords) {
    const idx = normHeaders.indexOf(kw.toLowerCase());
    if (idx !== -1) return idx;
  }
  // Try contains match
  for (const kw of keywords) {
    const idx = normHeaders.findIndex(h => h.includes(kw.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ─── Sheet/row helpers ────────────────────────────────────────────────────────

const SKIP_SHEETS = new Set(['SPRING', 'WINTER']);

const SHEET_MONTH_MAP: Record<string, string> = {
  JAN: '2026-01', FEB: '2026-02', MAR: '2026-03', APR: '2026-04',
  MAY: '2026-05', JUN: '2026-06', JUL: '2026-07', AUG: '2026-08',
  SEP: '2026-09', OCT: '2026-10', NOV: '2026-11', DEC: '2026-12',
};

/**
 * Detect the header row index.
 * Returns the first row (within the first 5) that contains "file" in any cell.
 */
function detectHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cells = (rows[i] as unknown[]).map(c => String(c ?? '').toLowerCase());
    if (cells.some(c => c.includes('file'))) return i;
  }
  return 1; // default: row index 1 (second row), matching the "title + header" pattern
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

interface CliArgs {
  file: string;
  companyId: number;
  dryRun: boolean;
  dumpHeaders: boolean;
  nameColOverride: number;    // -1 = auto-detect
  cityColOverride: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    file: '',
    companyId: 1,
    dryRun: false,
    dumpHeaders: false,
    nameColOverride: -1,
    cityColOverride: -1,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':       args.file           = argv[++i]; break;
      case '--company':    args.companyId      = parseInt(argv[++i], 10); break;
      case '--dry-run':    args.dryRun         = true; break;
      case '--dump-headers': args.dumpHeaders  = true; break;
      case '--name-col':   args.nameColOverride = parseInt(argv[++i], 10); break;
      case '--city-col':   args.cityColOverride = parseInt(argv[++i], 10); break;
    }
  }
  return args;
}

// ─── Workbook extraction ──────────────────────────────────────────────────────

interface WorkbookRow {
  fileNum: string;    // raw FILE # value, e.g. "#0032"
  normFile: string;   // normalized, e.g. "32"
  name: string;       // raw name candidate
  normName: string;
  city: string;       // raw city
  normCity: string;
  sheet: string;
}

/**
 * Extract one representative row per FILE # across all monthly sheets.
 * Duplicate FILE # values in different sheets → same entry (first wins).
 */
function extractWorkbookIndex(
  workbook: XLSX.WorkBook,
  nameColOverride: number,
  cityColOverride: number,
): { rows: Map<string, WorkbookRow>; columnReport: string[] } {
  const byFile = new Map<string, WorkbookRow>();
  const columnReport: string[] = [];
  const reportedSheets = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const upper = sheetName.toUpperCase();
    if (SKIP_SHEETS.has(upper)) continue;
    if (!SHEET_MONTH_MAP[upper]) continue;

    const ws = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const hi = detectHeaderRow(rows);
    const headers = (rows[hi] as unknown[]).map(c => String(c ?? '').trim());

    if (!reportedSheets.has(upper)) {
      columnReport.push(`Sheet ${sheetName}: headers = [${headers.map((h, i) => `${i}:"${h}"`).join(', ')}]`);
      reportedSheets.add(upper);
    }

    const fileColIdx = findColByKeywords(headers, FILE_KEYWORDS);
    const nameColIdx = nameColOverride >= 0 ? nameColOverride : findColByKeywords(headers, NAME_KEYWORDS);
    const cityColIdx = cityColOverride >= 0 ? cityColOverride : findColByKeywords(headers, CITY_KEYWORDS);

    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      if (row.every(c => c == null || c === '')) continue;

      const rawFile = fileColIdx >= 0 ? String(row[fileColIdx] ?? '').trim() : '';
      if (!rawFile) continue;

      const nFile = normBldg(rawFile);
      if (byFile.has(nFile)) continue; // already have a canonical entry for this FILE #

      const rawName = nameColIdx >= 0 ? String(row[nameColIdx] ?? '').trim() : '';
      const rawCity = cityColIdx >= 0 ? String(row[cityColIdx] ?? '').trim() : '';

      byFile.set(nFile, {
        fileNum: rawFile,
        normFile: nFile,
        name: rawName,
        normName: norm(rawName),
        city: rawCity,
        normCity: normCity(rawCity),
        sheet: sheetName,
      });
    }
  }

  return { rows: byFile, columnReport };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error('Usage: tsx scripts/backfillSiteBuildingIds.ts --file <path> [--company <id>] [--dry-run] [--dump-headers]');
    process.exit(1);
  }

  const filePath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(process.cwd(), args.file);

  console.log(`\nReading workbook: ${filePath}`);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (err: any) {
    console.error(`Cannot open file: ${err.message}`);
    process.exit(1);
  }

  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);

  const { rows: wbIndex, columnReport } = extractWorkbookIndex(
    workbook,
    args.nameColOverride,
    args.cityColOverride,
  );

  // ── Dump-headers mode: just print the column layout and exit ─────────────
  if (args.dumpHeaders) {
    console.log('\n── Column layout per sheet ───────────────────────────────────');
    for (const line of columnReport) console.log(' ', line);
    console.log(`\n── Unique FILE # values found: ${wbIndex.size} ──────────────────────`);
    for (const [, r] of wbIndex) {
      console.log(`  ${r.fileNum.padEnd(12)}  name="${r.name}"  city="${r.city}"  (sheet: ${r.sheet})`);
    }
    console.log('\nRe-run without --dump-headers to perform matching.');
    process.exit(0);
  }

  // ── Normal mode: match and update ─────────────────────────────────────────
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  if (args.dryRun) console.log('DRY RUN — no DB writes will occur\n');
  else             console.log('LIVE RUN — DB will be updated\n');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });

  // Load all sites for this company
  const allSites = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.companyId, args.companyId));

  console.log(`Loaded ${allSites.length} sites from DB (company ${args.companyId})\n`);

  if (allSites.length === 0) {
    console.error('No sites found for this company — check --company value');
    process.exit(1);
  }

  // Build lookup structures
  // name+city → sites[]
  const byNameCity = new Map<string, typeof allSites>();
  // name only → sites[]
  const byName     = new Map<string, typeof allSites>();
  // city only → sites[]
  const byCity     = new Map<string, typeof allSites>();

  for (const site of allSites) {
    const sName = norm(site.name);
    const sCity = normCity(site.city ?? '');
    const sAddr = norm(site.address ?? '');

    const ncKey = `${sName}||${sCity}`;
    if (!byNameCity.has(ncKey)) byNameCity.set(ncKey, []);
    byNameCity.get(ncKey)!.push(site);

    if (!byName.has(sName)) byName.set(sName, []);
    byName.get(sName)!.push(site);

    const cKey = sCity;
    if (!byCity.has(cKey)) byCity.set(cKey, []);
    byCity.get(cKey)!.push(site);
  }

  // ── Match and accumulate results ──────────────────────────────────────────
  let nUpdated = 0, nAlreadyCorrect = 0, nConflict = 0;
  let nAmbiguous = 0, nUnmatched = 0, nNoName = 0;

  const conflicts:   string[] = [];
  const ambiguous:   string[] = [];
  const unmatched:   string[] = [];
  const updates:     Array<{ siteId: number; siteName: string; fileNum: string }> = [];

  console.log(`Matching ${wbIndex.size} unique FILE # entries against ${allSites.length} DB sites...\n`);

  for (const [, wb] of wbIndex) {
    // ── Guard: no name available → can't match ──────────────────────────
    if (!wb.normName) {
      nNoName++;
      // We'll try city-based matching only if city is given and is unique
      if (wb.normCity) {
        const cityCandidates = byCity.get(wb.normCity) ?? [];
        if (cityCandidates.length === 1) {
          // Unique site in that city — only accept if no name ambiguity risk
          const site = cityCandidates[0];
          processMatch([site], wb, 'city-unique');
        } else if (cityCandidates.length > 1) {
          nAmbiguous++;
          ambiguous.push(`  FILE# ${wb.fileNum.padEnd(12)} city="${wb.city}" → ${cityCandidates.length} sites in city (ambiguous)`);
        } else {
          nUnmatched++;
          unmatched.push(`  FILE# ${wb.fileNum.padEnd(12)} city="${wb.city}" → no sites in city`);
        }
      } else {
        nUnmatched++;
        unmatched.push(`  FILE# ${wb.fileNum.padEnd(12)} → no name or city to match on`);
      }
      continue;
    }

    // ── Strategy 1: name + city ──────────────────────────────────────────
    const ncKey = `${wb.normName}||${wb.normCity}`;
    const ncCandidates = byNameCity.get(ncKey) ?? [];
    if (ncCandidates.length > 0) {
      processMatch(ncCandidates, wb, 'name+city');
      continue;
    }

    // ── Strategy 2: name alone (if globally unique) ───────────────────────
    const nameCandidates = byName.get(wb.normName) ?? [];
    if (nameCandidates.length === 1) {
      processMatch(nameCandidates, wb, 'name-unique');
      continue;
    }
    if (nameCandidates.length > 1) {
      // Multiple sites share this name — too risky without city discriminator
      nAmbiguous++;
      ambiguous.push(
        `  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}" → ${nameCandidates.length} sites with this name (ambiguous)`
      );
      continue;
    }

    // ── Strategy 3: partial name + city ──────────────────────────────────
    if (wb.normCity) {
      const citySites = byCity.get(wb.normCity) ?? [];
      const partials = citySites.filter(s => {
        const sn = norm(s.name);
        return sn.includes(wb.normName) || wb.normName.includes(sn);
      });
      if (partials.length === 1) {
        processMatch(partials, wb, 'partial-name+city');
        continue;
      }
      if (partials.length > 1) {
        nAmbiguous++;
        ambiguous.push(`  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}" → ${partials.length} partial matches`);
        continue;
      }
    }

    // No match
    nUnmatched++;
    unmatched.push(`  FILE# ${wb.fileNum.padEnd(12)} name="${wb.name}" city="${wb.city}" → no match`);
  }

  function processMatch(
    candidates: typeof allSites,
    wb: WorkbookRow,
    strategy: string,
  ) {
    if (candidates.length > 1) {
      nAmbiguous++;
      ambiguous.push(`  FILE# ${wb.fileNum.padEnd(12)} → ${candidates.length} matches via ${strategy} (ambiguous)`);
      return;
    }
    const site = candidates[0];

    // Already has this buildingId — no-op
    if (site.buildingId && normBldg(site.buildingId) === wb.normFile) {
      nAlreadyCorrect++;
      return;
    }

    // Has a DIFFERENT non-empty buildingId — conflict, don't overwrite
    if (site.buildingId && normBldg(site.buildingId) !== wb.normFile) {
      nConflict++;
      conflicts.push(
        `  FILE# ${wb.fileNum.padEnd(12)} site "${site.name}" (id=${site.id}) already has buildingId="${site.buildingId}" via ${strategy}`
      );
      return;
    }

    // Good to update
    console.log(`  [${strategy}] "${site.name}" (id=${site.id}, city=${site.city ?? ''}) ← buildingId="${wb.fileNum}"`);
    updates.push({ siteId: site.id, siteName: site.name, fileNum: wb.fileNum });
    nUpdated++;
  }

  // ── Apply updates ─────────────────────────────────────────────────────────
  if (!args.dryRun && updates.length > 0) {
    console.log(`\nWriting ${updates.length} updates...`);
    for (const u of updates) {
      await db.update(schema.sites)
        .set({ buildingId: u.fileNum })
        .where(eq(schema.sites.id, u.siteId));
    }
    console.log('Done.');
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(`  Workbook unique FILE# entries : ${wbIndex.size}`);
  console.log(`  DB sites loaded               : ${allSites.length}`);
  console.log(`  Updated (buildingId set)       : ${nUpdated}${args.dryRun ? ' (dry run — not written)' : ''}`);
  console.log(`  Already correct (no-op)        : ${nAlreadyCorrect}`);
  console.log(`  Conflict (different existing)  : ${nConflict}`);
  console.log(`  Ambiguous (multiple matches)   : ${nAmbiguous}`);
  console.log(`  Unmatched                      : ${nUnmatched}`);
  console.log(`  No name/city to match on       : ${nNoName}`);

  if (conflicts.length > 0) {
    console.log('\n── Conflicts (review manually) ───────────────────────────────────');
    conflicts.forEach(l => console.log(l));
  }
  if (ambiguous.length > 0) {
    console.log('\n── Ambiguous (review manually) ───────────────────────────────────');
    ambiguous.forEach(l => console.log(l));
  }
  if (unmatched.length > 0) {
    console.log('\n── Unmatched FILE# values ────────────────────────────────────────');
    unmatched.forEach(l => console.log(l));
  }

  if (args.dryRun) {
    console.log('\nDRY RUN complete — rerun without --dry-run to apply changes.');
  } else if (nUpdated > 0) {
    console.log('\nBackfill complete. Now rerun:');
    console.log('  pnpm exec tsx scripts/seedMonthlyTracking.ts \\');
    console.log(`    --file "${args.file}" --company ${args.companyId} --all-sheets --dry-run`);
  }

  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
