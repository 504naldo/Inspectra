/**
 * scripts/seedMonthlyTracking.ts
 *
 * Bulk seed monthly_service_tracking from the monthly service list workbook.
 *
 * Prerequisites:
 *   1. Run scripts/backfillSiteBuildingIds.ts first to populate sites.buildingId.
 *   2. Then run this script to seed tracking rows.
 *
 * Site matching: FILE # column → sites.buildingId  (normalized, e.g. "#0007" → "7")
 * This uses the same normBldg() logic as serviceScheduleRouter.ts.
 *
 * Usage:
 *   # Dry run all monthly sheets
 *   pnpm exec tsx scripts/seedMonthlyTracking.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" \
 *     --company 1 --all-sheets --dry-run
 *
 *   # Live run
 *   pnpm exec tsx scripts/seedMonthlyTracking.ts \
 *     --file "./client/src/data/FILE MONTHLY SERVICE LIST (1).xlsx" \
 *     --company 1 --all-sheets
 *
 *   # Single month
 *   pnpm exec tsx scripts/seedMonthlyTracking.ts \
 *     --file "..." --company 1 --month 2026-04
 *
 *   # Override seeding year (default 2026)
 *   pnpm exec tsx scripts/seedMonthlyTracking.ts \
 *     --file "..." --company 1 --all-sheets --year 2026
 *
 * Sheet → month mapping (for --year 2026):
 *   JAN→2026-01, FEB→2026-02, ..., DEC→2026-12
 *   SPRING → skipped (seasonal, not a fixed calendar month)
 *   WINTER → skipped (empty in workbook)
 *
 * Duplicate prevention:
 *   Skips any row where (siteId, serviceType, trackingMonth) already exists.
 *   Safe to rerun.
 *
 * Each sheet is processed in its own try/catch — one bad sheet does not abort others.
 * All unmatched FILE # values are logged at the end.
 */

import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';
import path from 'path';

config();

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize a building/file ID — mirrors serviceScheduleRouter.normBldg().
 * "#0007" → "7", "#0330-1" → "3301" ... no: keep as-is after stripping non-alnum.
 * Actually: strip non-alnum, lowercase; if purely numeric strip leading zeros.
 */
function normBldg(s: string): string {
  const a = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^\d+$/.test(a) ? String(parseInt(a, 10)) : a;
}

/** Normalize a header string for column detection */
function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// ─── Column detection ─────────────────────────────────────────────────────────

function findCol(headers: string[], ...keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => normHeader(h).includes(normHeader(k))));
}

// ─── Sheet/month config ───────────────────────────────────────────────────────

const SKIP_SHEETS = new Set(['SPRING', 'WINTER']);

function buildSheetMonthMap(year: number): Record<string, string> {
  return {
    JAN: `${year}-01`, FEB: `${year}-02`, MAR: `${year}-03`, APR: `${year}-04`,
    MAY: `${year}-05`, JUN: `${year}-06`, JUL: `${year}-07`, AUG: `${year}-08`,
    SEP: `${year}-09`, OCT: `${year}-10`, NOV: `${year}-11`, DEC: `${year}-12`,
  };
}

// ─── Value helpers ────────────────────────────────────────────────────────────

function toBoolean(val: unknown): boolean | null {
  if (val == null || val === '') return null;
  const s = String(val).trim().toLowerCase();
  if (s === 'yes' || s === 'y' || s === '1' || s === 'true') return true;
  if (s === 'no'  || s === 'n' || s === '0' || s === 'false') return false;
  return null;
}

function toDecimal(val: unknown): string | null {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : String(n);
}

function toInt(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function cellToString(val: unknown): string | null {
  if (val == null || val === '') return null;
  if (val instanceof Date) {
    const mon = val.toLocaleString('en-US', { month: 'short' });
    const day = String(val.getDate()).padStart(2, '0');
    const yr  = String(val.getFullYear()).slice(-2);
    return `${mon}.${day}/${yr}`;
  }
  const s = String(val).trim();
  return s || null;
}

/**
 * Detect the header row index within the first 5 rows.
 * Returns the first row that contains "file" in any cell.
 * Defaults to index 1 (second row) — the "title + header" pattern.
 */
function detectHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cells = (rows[i] as unknown[]).map(c => String(c ?? '').toLowerCase());
    if (cells.some(c => c.includes('file'))) return i;
  }
  return 1;
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

interface CliArgs {
  file: string;
  companyId: number;
  year: number;
  month: string;
  allSheets: boolean;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { file: '', companyId: 1, year: 2026, month: '', allSheets: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':      args.file      = argv[++i]; break;
      case '--company':   args.companyId = parseInt(argv[++i], 10); break;
      case '--year':      args.year      = parseInt(argv[++i], 10); break;
      case '--month':     args.month     = argv[++i]; break;
      case '--all-sheets': args.allSheets = true; break;
      case '--dry-run':   args.dryRun    = true; break;
    }
  }
  return args;
}

// ─── Per-sheet processing ─────────────────────────────────────────────────────

interface SheetResult {
  sheetName: string;
  month: string;
  totalRows: number;
  created: number;
  skipped: number;
  unmatched: number;
  errors: number;
  unmatchedValues: string[];
}

async function processSheet(
  db: ReturnType<typeof drizzle>,
  workbook: XLSX.WorkBook,
  sheetName: string,
  trackingMonth: string,
  companyId: number,
  siteByBuildingId: Map<string, { id: number; customerOrgId: number }>,
  dryRun: boolean,
): Promise<SheetResult> {
  const result: SheetResult = {
    sheetName, month: trackingMonth,
    totalRows: 0, created: 0, skipped: 0, unmatched: 0, errors: 0,
    unmatchedValues: [],
  };

  const ws = workbook.Sheets[sheetName];
  if (!ws) return result;

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return result;

  const hi = detectHeaderRow(rows);
  const headers = (rows[hi] as unknown[]).map(c => String(c ?? '').trim());

  // Column detection — must find FILE # and SERVICE TYPE at minimum
  const fileColIdx        = findCol(headers, 'file #', 'file#', 'file number', 'file no', 'file');
  const serviceTypeColIdx = findCol(headers, 'service type', 'servicetype', 'service', 'type');
  const hoursColIdx       = findCol(headers, '# of hrs', 'hrs req', 'hours req', 'hours');
  const techsColIdx       = findCol(headers, '# of techs', 'techs', 'technicians');
  const stampsColIdx      = findCol(headers, 'stamp/s', 'stamps', 'stamp');
  const contractorColIdx  = findCol(headers, 'contractor');
  const keysColIdx        = findCol(headers, 'keys');
  const lastCompletedIdx  = findCol(headers, 'last completed', 'last comp');
  const agreementColIdx   = findCol(headers, 'annual agreement', 'agreement', 'signed');

  if (fileColIdx === -1) {
    console.warn(`  [${sheetName}] Cannot find FILE # column — headers: ${JSON.stringify(headers)}`);
    return result;
  }

  // Pre-load existing rows for this month to detect duplicates
  const existingRows = await db
    .select({
      siteId: schema.monthlyServiceTracking.siteId,
      serviceType: schema.monthlyServiceTracking.serviceType,
    })
    .from(schema.monthlyServiceTracking)
    .where(
      and(
        eq(schema.monthlyServiceTracking.companyId, companyId),
        eq(schema.monthlyServiceTracking.trackingMonth, trackingMonth),
      ),
    );

  const existingSet = new Set(existingRows.map(r => `${r.siteId}|${r.serviceType}`));

  const inserts: schema.InsertMonthlyServiceTracking[] = [];

  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (row.every(c => c == null || c === '')) continue;

    const rawFile = String(row[fileColIdx] ?? '').trim();
    if (!rawFile) continue;

    const serviceType = serviceTypeColIdx >= 0
      ? (cellToString(row[serviceTypeColIdx]) ?? 'Annual Inspection')
      : 'Annual Inspection';

    result.totalRows++;

    // Match site by normalized buildingId
    const nFile = normBldg(rawFile);
    const site  = siteByBuildingId.get(nFile);

    if (!site) {
      result.unmatched++;
      result.unmatchedValues.push(rawFile);
      continue;
    }

    // Duplicate check
    const dupeKey = `${site.id}|${serviceType}`;
    if (existingSet.has(dupeKey)) {
      result.skipped++;
      continue;
    }

    const row_: schema.InsertMonthlyServiceTracking = {
      siteId:          site.id,
      buildingId:      rawFile,
      customerOrgId:   site.customerOrgId,
      companyId,
      trackingMonth,
      serviceType,
      status:          'not_scheduled',
      reportStatus:    'none',
      hoursRequired:   hoursColIdx >= 0      ? (toDecimal(row[hoursColIdx]) ?? undefined) : undefined,
      techsRequired:   techsColIdx >= 0      ? (toInt(row[techsColIdx]) ?? undefined) : undefined,
      stampsRequired:  stampsColIdx >= 0     ? (cellToString(row[stampsColIdx]) ?? undefined) : undefined,
      hasContractor:   contractorColIdx >= 0 ? (toBoolean(row[contractorColIdx]) ?? undefined) : undefined,
      hasKeys:         keysColIdx >= 0       ? (toBoolean(row[keysColIdx]) ?? undefined) : undefined,
      lastCompleted:   lastCompletedIdx >= 0 ? (cellToString(row[lastCompletedIdx]) ?? undefined) : undefined,
      agreementSigned: agreementColIdx >= 0  ? (toBoolean(row[agreementColIdx]) ?? undefined) : undefined,
    } as schema.InsertMonthlyServiceTracking;

    inserts.push(row_);
    existingSet.add(dupeKey); // prevent intra-batch duplicates
  }

  if (!dryRun && inserts.length > 0) {
    try {
      // @ts-ignore — drizzle transaction typing varies by driver
      await (db as any).transaction(async (tx: any) => {
        for (const ins of inserts) {
          await tx.insert(schema.monthlyServiceTracking).values(ins);
        }
      });
      result.created = inserts.length;
    } catch (err: any) {
      result.errors = inserts.length;
      console.error(`  [${sheetName}] Transaction failed: ${err?.message ?? err}`);
    }
  } else {
    result.created = inserts.length; // dry run: report what would be created
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error('Usage: tsx scripts/seedMonthlyTracking.ts --file <path> --company <id> [--all-sheets | --month YYYY-MM] [--year YYYY] [--dry-run]');
    process.exit(1);
  }
  if (!args.allSheets && !args.month) {
    console.error('Specify either --all-sheets or --month YYYY-MM');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const filePath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(process.cwd(), args.file);

  console.log(`\nLoading workbook: ${filePath}`);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (err: any) {
    console.error(`Cannot open file: ${err.message}`);
    process.exit(1);
  }

  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);
  if (args.dryRun) console.log('DRY RUN — nothing will be written\n');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });
  const SHEET_MONTH_MAP = buildSheetMonthMap(args.year);

  // Build site lookup: normBldg(buildingId) → {id, customerOrgId}
  const allSites = await db
    .select({ id: schema.sites.id, buildingId: schema.sites.buildingId, customerOrgId: schema.sites.customerOrgId })
    .from(schema.sites)
    .where(eq(schema.sites.companyId, args.companyId));

  const siteByBuildingId = new Map<string, { id: number; customerOrgId: number }>();
  for (const s of allSites) {
    if (s.buildingId) {
      siteByBuildingId.set(normBldg(s.buildingId), { id: s.id, customerOrgId: s.customerOrgId });
    }
  }

  const populated = allSites.filter(s => s.buildingId).length;
  console.log(`Sites loaded: ${allSites.length} total, ${populated} with buildingId set`);
  if (populated === 0) {
    console.error('\nNo sites have buildingId set. Run backfillSiteBuildingIds.ts first.');
    process.exit(1);
  }
  console.log('');

  // Build list of sheets to process
  let sheetsToProcess: Array<{ sheetName: string; month: string }> = [];

  if (args.allSheets) {
    for (const sheetName of workbook.SheetNames) {
      const upper = sheetName.toUpperCase();
      if (SKIP_SHEETS.has(upper)) {
        console.log(`  Skipping ${sheetName} (seasonal/empty)`);
        continue;
      }
      const month = SHEET_MONTH_MAP[upper];
      if (!month) {
        console.log(`  Skipping ${sheetName} (no month mapping)`);
        continue;
      }
      sheetsToProcess.push({ sheetName, month });
    }
  } else {
    const targetMonth = args.month;
    const entry = Object.entries(SHEET_MONTH_MAP).find(([, m]) => m === targetMonth);
    if (!entry) {
      console.error(`No sheet mapping for month ${targetMonth}`);
      process.exit(1);
    }
    const sheetName = workbook.SheetNames.find(s => s.toUpperCase() === entry[0]);
    if (!sheetName) {
      console.error(`Sheet "${entry[0]}" not found. Available: ${workbook.SheetNames.join(', ')}`);
      process.exit(1);
    }
    sheetsToProcess = [{ sheetName, month: targetMonth }];
  }

  // Process
  const results: SheetResult[] = [];
  let totalCreated = 0, totalSkipped = 0, totalUnmatched = 0, totalErrors = 0, grandTotal = 0;
  const allUnmatched: string[] = [];

  for (const { sheetName, month } of sheetsToProcess) {
    process.stdout.write(`Processing ${sheetName.padEnd(4)} (${month}) ... `);
    try {
      const r = await processSheet(db, workbook, sheetName, month, args.companyId, siteByBuildingId, args.dryRun);
      results.push(r);
      process.stdout.write(`${r.totalRows} rows → ${r.created} created, ${r.skipped} skipped (dup), ${r.unmatched} unmatched${r.errors ? `, ${r.errors} errors` : ''}\n`);
      totalCreated   += r.created;
      totalSkipped   += r.skipped;
      totalUnmatched += r.unmatched;
      totalErrors    += r.errors;
      grandTotal     += r.totalRows;
      allUnmatched.push(...r.unmatchedValues);
    } catch (err: any) {
      process.stdout.write(`ERROR: ${err?.message ?? err}\n`);
    }
  }

  // Summary
  console.log('\n── Summary ───────────────────────────────────────────────────────');
  for (const r of results) {
    const line = `  ${r.sheetName.padEnd(4)} (${r.month}): ${String(r.totalRows).padStart(3)} rows → ${r.created} created, ${r.skipped} skipped, ${r.unmatched} unmatched`;
    console.log(r.errors ? `${line}, ${r.errors} errors` : line);
  }
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`  Total: ${grandTotal} rows — ${totalCreated} created, ${totalSkipped} skipped, ${totalUnmatched} unmatched${totalErrors ? `, ${totalErrors} errors` : ''}`);

  if (allUnmatched.length > 0) {
    const unique = [...new Set(allUnmatched)].sort();
    console.log(`\n── Unmatched FILE # values (${unique.length} unique) ──────────────────`);
    unique.forEach(v => console.log(`  ${v}`));
    console.log('\nThese FILE# values have no matching site in the DB.');
    console.log('The site records do not exist yet — backfill cannot help here.');
    console.log('\nRun createMissingSitesFromWorkbook.ts to create stub sites for all of them:');
    console.log('  pnpm sites:create-missing:dry   # preview');
    console.log('  pnpm sites:create-missing       # create');
    console.log('\nThen re-run this seed:');
    console.log('  pnpm seed:monthly-tracking:dry');
    console.log('  pnpm seed:monthly-tracking:all');
  }

  if (args.dryRun) console.log('\nDRY RUN — rerun without --dry-run to write rows.');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
