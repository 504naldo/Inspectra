/**
 * Seed script: monthly_service_tracking from FILE_MONTHLY_SERVICE_LIST.xlsx
 *
 * Usage:
 *   # Single sheet (existing behaviour)
 *   tsx scripts/seedMonthlyTracking.ts --file FILE_MONTHLY_SERVICE_LIST.xlsx --company 1 --month 2026-04
 *
 *   # All standard monthly sheets at once
 *   tsx scripts/seedMonthlyTracking.ts --file FILE_MONTHLY_SERVICE_LIST.xlsx --company 1 --all-sheets
 *   tsx scripts/seedMonthlyTracking.ts --file FILE_MONTHLY_SERVICE_LIST.xlsx --company 1 --all-sheets --dry-run
 *
 * Sheet layout (standard monthly sheets JAN–DEC):
 *   Row 1 — title row (skipped)
 *   Row 2 — header row
 *   Row 3+ — data rows
 *
 * Site matching: FILE # column → sites.fileNumber  (e.g. "#0007")
 *
 * Duplicate prevention: skips rows where (siteId, serviceType, trackingMonth) already exists.
 * Each sheet is processed in its own transaction; a failure on one sheet does not abort others.
 */

import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

config(); // load .env if present

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Sheet → YYYY-MM mapping ──────────────────────────────────────────────────
const SHEET_MONTH_MAP: Record<string, string> = {
  JAN: '2026-01', FEB: '2026-02', MAR: '2026-03', APR: '2026-04',
  MAY: '2026-05', JUN: '2026-06', JUL: '2026-07', AUG: '2026-08',
  SEP: '2026-09', OCT: '2026-10', NOV: '2026-11', DEC: '2026-12',
};

// Sheets that are non-calendar and should always be skipped
const SKIP_SHEETS = new Set(['SPRING', 'WINTER']);

// ─── CLI arg parsing ──────────────────────────────────────────────────────────
interface CliArgs {
  file: string;
  companyId: number;
  month: string;       // single-month mode (YYYY-MM)
  allSheets: boolean;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { file: '', companyId: 1, month: '', allSheets: false, dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':    args.file      = argv[++i]; break;
      case '--company': args.companyId = parseInt(argv[++i], 10); break;
      case '--month':   args.month     = argv[++i]; break;
      case '--all-sheets': args.allSheets = true; break;
      case '--dry-run': args.dryRun    = true; break;
    }
  }

  return args;
}

// ─── Value helpers ────────────────────────────────────────────────────────────

/** Normalise a Yes/No/empty cell to boolean | null */
function toBoolean(val: unknown): boolean | null {
  if (val == null || val === '') return null;
  const s = String(val).trim().toLowerCase();
  if (s === 'yes' || s === 'y' || s === '1' || s === 'true') return true;
  if (s === 'no'  || s === 'n' || s === '0' || s === 'false') return false;
  return null;
}

/** Convert a cell value (string, number, or Date) to a displayable string */
function cellToString(val: unknown): string | null {
  if (val == null || val === '') return null;
  if (val instanceof Date) {
    // Format as "Jan.06/26" style for consistency with existing values
    const mon = val.toLocaleString('en-US', { month: 'short' });
    const day = String(val.getDate()).padStart(2, '0');
    const yr  = String(val.getFullYear()).slice(-2);
    return `${mon}.${day}/${yr}`;
  }
  return String(val).trim() || null;
}

/** Convert a cell to a decimal string (null if not numeric) */
function toDecimal(val: unknown): string | null {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : String(n);
}

/** Convert a cell to an integer (null if not numeric) */
function toInt(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

// ─── Header normalisation ─────────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// ─── Per-sheet processing ─────────────────────────────────────────────────────

interface SheetResult {
  sheetName: string;
  month: string;
  totalRows: number;
  created: number;
  skipped: number;   // duplicate
  unmatched: number; // FILE # not found in sites
  unmatchedValues: string[];
}

async function processSheet(
  db: ReturnType<typeof drizzle>,
  workbook: XLSX.WorkBook,
  sheetName: string,
  trackingMonth: string,
  companyId: number,
  dryRun: boolean,
): Promise<SheetResult> {
  const result: SheetResult = {
    sheetName, month: trackingMonth,
    totalRows: 0, created: 0, skipped: 0, unmatched: 0, unmatchedValues: [],
  };

  const ws = workbook.Sheets[sheetName];
  if (!ws) return result;

  // Read all rows as arrays (preserves exact cell positions)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rows.length < 2) return result; // nothing useful

  // ── Detect header row (row 2 = index 1) ───────────────────────────────────
  // Standard layout: row 0 = title, row 1 = headers, row 2+ = data.
  // Verify by checking whether FILE # appears in row 1; if not try row 0.
  let headerRowIdx = 1;
  const row1Keys = (rows[1] ?? []).map(c => normalizeKey(String(c ?? '')));
  const row0Keys = (rows[0] ?? []).map(c => normalizeKey(String(c ?? '')));
  if (!row1Keys.includes('file_') && !row1Keys.some(k => k.startsWith('file_'))) {
    // Check row 0 as fallback
    if (row0Keys.some(k => k.startsWith('file_'))) {
      headerRowIdx = 0;
    }
  }

  const headerRow = rows[headerRowIdx] as unknown[];
  const headers   = headerRow.map(c => normalizeKey(String(c ?? '')));

  // Column index lookups
  const col = (name: string): number => headers.indexOf(name);

  // Try variations of FILE # normalised
  const fileColIdx = (() => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h === 'file_' || h === 'file_number' || h === 'file' || h.startsWith('file_')) return i;
    }
    return -1;
  })();

  const serviceTypeIdx    = col('service_type');
  const hoursReqIdx       = col('_of_hrs_req');       // # OF HRS REQ
  const techsReqIdx       = col('_of_techs');         // # OF TECHS
  const stampsReqIdx      = col('stamp_s_req');       // STAMP/S REQ
  const contractorIdx     = col('contractor');
  const keysIdx           = col('keys');
  const lastCompletedIdx  = col('last_completed');
  const agreementIdx      = col('annual_agreement_signed_'); // ANNUAL AGREEMENT SIGNED?

  if (fileColIdx === -1) {
    console.warn(`  [${sheetName}] Could not find FILE # column in headers: ${JSON.stringify(headers)}`);
    return result;
  }

  // ── Pre-load site map for this company: fileNumber → {siteId, customerOrgId} ──
  const siteRows = await db
    .select({ id: schema.sites.id, fileNumber: schema.sites.fileNumber, customerOrgId: schema.sites.customerOrgId })
    .from(schema.sites)
    .where(eq(schema.sites.companyId, companyId));

  const siteByFile = new Map<string, { id: number; customerOrgId: number }>();
  for (const s of siteRows) {
    if (s.fileNumber) {
      siteByFile.set(s.fileNumber.trim().toUpperCase(), { id: s.id, customerOrgId: s.customerOrgId });
    }
  }

  // ── Pre-load existing tracking rows for this company+month to detect dupes ──
  const existingRows = await db
    .select({
      siteId: schema.monthlyServiceTracking.siteId,
      serviceType: schema.monthlyServiceTracking.serviceType,
      trackingMonth: schema.monthlyServiceTracking.trackingMonth,
    })
    .from(schema.monthlyServiceTracking)
    .where(
      and(
        eq(schema.monthlyServiceTracking.companyId, companyId),
        eq(schema.monthlyServiceTracking.trackingMonth, trackingMonth),
      ),
    );

  const existingSet = new Set(existingRows.map(r => `${r.siteId}|${r.serviceType}|${r.trackingMonth}`));

  // ── Process data rows ─────────────────────────────────────────────────────
  const dataRows = rows.slice(headerRowIdx + 1);
  const inserts: schema.InsertMonthlyServiceTracking[] = [];

  for (const row of dataRows) {
    const r = row as unknown[];

    // Skip completely blank rows
    if (r.every(c => c == null || c === '')) continue;

    const rawFileNum = cellToString(r[fileColIdx]);
    if (!rawFileNum) continue;   // no FILE # → skip

    const fileNum = rawFileNum.trim().toUpperCase();
    const serviceType = cellToString(r[serviceTypeIdx] ?? null) ?? 'Unknown';

    result.totalRows++;

    // ── Site match ───────────────────────────────────────────────────────────
    const site = siteByFile.get(fileNum);
    if (!site) {
      result.unmatched++;
      result.unmatchedValues.push(rawFileNum);
      continue;
    }

    // ── Duplicate check ──────────────────────────────────────────────────────
    const dupeKey = `${site.id}|${serviceType}|${trackingMonth}`;
    if (existingSet.has(dupeKey)) {
      result.skipped++;
      continue;
    }

    inserts.push({
      siteId:          site.id,
      customerOrgId:   site.customerOrgId,
      companyId,
      trackingMonth,
      serviceType,
      status:          'not_scheduled',
      reportStatus:    'none',
      hoursRequired:   hoursReqIdx  >= 0 ? toDecimal(r[hoursReqIdx])  : undefined,
      techsRequired:   techsReqIdx  >= 0 ? toInt(r[techsReqIdx])      : undefined,
      stampsRequired:  stampsReqIdx >= 0 ? (cellToString(r[stampsReqIdx]) ?? undefined) : undefined,
      hasContractor:   contractorIdx >= 0 ? (toBoolean(r[contractorIdx]) ?? undefined) : undefined,
      hasKeys:         keysIdx >= 0       ? (toBoolean(r[keysIdx]) ?? undefined) : undefined,
      lastCompleted:   lastCompletedIdx >= 0 ? (cellToString(r[lastCompletedIdx]) ?? undefined) : undefined,
      agreementSigned: agreementIdx >= 0  ? (toBoolean(r[agreementIdx]) ?? undefined) : undefined,
    } as schema.InsertMonthlyServiceTracking);

    // Mark as seen so we don't double-insert within this batch
    existingSet.add(dupeKey);
  }

  if (dryRun) {
    result.created = inserts.length;
    return result;
  }

  // ── Insert in a transaction ───────────────────────────────────────────────
  if (inserts.length > 0) {
    // @ts-ignore — drizzle transaction type varies by driver
    await (db as any).transaction(async (tx: any) => {
      for (const row of inserts) {
        await tx.insert(schema.monthlyServiceTracking).values(row);
      }
    });
    result.created = inserts.length;
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error('Usage: tsx scripts/seedMonthlyTracking.ts --file <path> --company <id> [--month YYYY-MM | --all-sheets] [--dry-run]');
    process.exit(1);
  }

  if (!args.allSheets && !args.month) {
    console.error('Specify either --month YYYY-MM (single sheet) or --all-sheets');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Resolve file path relative to project root (cwd) or as absolute
  const filePath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(process.cwd(), args.file);

  console.log(`\nLoading workbook: ${filePath}`);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (err: any) {
    console.error(`Failed to read file: ${err.message}`);
    process.exit(1);
  }

  console.log(`Sheets found: ${workbook.SheetNames.join(', ')}`);
  if (args.dryRun) console.log('DRY RUN — no rows will be written\n');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });

  // ── Build list of sheets to process ─────────────────────────────────────
  let sheetsToProcess: Array<{ sheetName: string; month: string }> = [];

  if (args.allSheets) {
    for (const sheetName of workbook.SheetNames) {
      const upper = sheetName.toUpperCase();
      if (SKIP_SHEETS.has(upper)) {
        console.log(`  Skipping sheet: ${sheetName} (seasonal/empty)`);
        continue;
      }
      const month = SHEET_MONTH_MAP[upper];
      if (!month) {
        console.log(`  Skipping sheet: ${sheetName} (no month mapping)`);
        continue;
      }
      sheetsToProcess.push({ sheetName, month });
    }
  } else {
    // Single-month mode: find which sheet corresponds to the given month
    const targetMonth = args.month;
    const matchingSheet = Object.entries(SHEET_MONTH_MAP).find(([, m]) => m === targetMonth);
    if (!matchingSheet) {
      console.error(`No sheet mapping found for month ${targetMonth}`);
      process.exit(1);
    }
    const [sheetKey] = matchingSheet;
    // The workbook may use different casing — find case-insensitively
    const sheetName = workbook.SheetNames.find(s => s.toUpperCase() === sheetKey);
    if (!sheetName) {
      console.error(`Sheet "${sheetKey}" not found in workbook. Available: ${workbook.SheetNames.join(', ')}`);
      process.exit(1);
    }
    sheetsToProcess = [{ sheetName, month: targetMonth }];
  }

  // ── Process each sheet ────────────────────────────────────────────────────
  const results: SheetResult[] = [];
  let totalCreated = 0, totalSkipped = 0, totalUnmatched = 0, grandTotal = 0;

  for (const { sheetName, month } of sheetsToProcess) {
    process.stdout.write(`Processing ${sheetName} (${month})...`);
    try {
      const r = await processSheet(db, workbook, sheetName, month, args.companyId, args.dryRun);
      results.push(r);
      process.stdout.write(` ${r.totalRows} rows — ${r.created} created, ${r.skipped} skipped (dup), ${r.unmatched} unmatched\n`);
      if (r.unmatchedValues.length > 0) {
        console.log(`  Unmatched FILE # values: ${[...new Set(r.unmatchedValues)].join(', ')}`);
      }
      totalCreated   += r.created;
      totalSkipped   += r.skipped;
      totalUnmatched += r.unmatched;
      grandTotal     += r.totalRows;
    } catch (err: any) {
      process.stdout.write(` ERROR\n`);
      console.error(`  [${sheetName}] Failed:`, err?.message ?? err);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────────────────');
  for (const r of results) {
    console.log(`  ${r.sheetName.padEnd(6)} (${r.month}): ${r.totalRows} rows — ${r.created} created, ${r.skipped} skipped, ${r.unmatched} unmatched`);
  }
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Total: ${grandTotal} rows processed — ${totalCreated} created, ${totalSkipped} skipped, ${totalUnmatched} unmatched`);
  if (args.dryRun) console.log('\n  DRY RUN complete — no rows were written.');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
