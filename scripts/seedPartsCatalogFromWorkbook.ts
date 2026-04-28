/**
 * scripts/seedPartsCatalogFromWorkbook.ts
 *
 * Seed parts_catalog from the "Parts List" sheet of a fire-protection workbook.
 *
 * Column mapping (1-indexed Excel columns):
 *   A (0) = category
 *   B (1) = productName
 *   E (4) = unitPrice
 *   H (7) = defaultLabourHours
 *   I (8) = description
 *
 * Data rows: 5–284 (1-indexed), i.e. array indices 4–283.
 *
 * Usage:
 *   # Dry run — preview without writing
 *   pnpm exec tsx scripts/seedPartsCatalogFromWorkbook.ts \
 *     --file "./data/imports/parts_workbook.xlsm" \
 *     --company 1 --dry-run
 *
 *   # Live import
 *   pnpm exec tsx scripts/seedPartsCatalogFromWorkbook.ts \
 *     --file "./data/imports/parts_workbook.xlsm" \
 *     --company 1
 *
 *   # Update price/labour/description on changed rows
 *   pnpm exec tsx scripts/seedPartsCatalogFromWorkbook.ts \
 *     --file "./data/imports/parts_workbook.xlsm" \
 *     --company 1 --update-existing
 *
 * Duplicate prevention:
 *   Normalizes (category + productName) → lowercase, alphanumeric only.
 *   Skips any row where (companyId, normalized_category, normalized_productName) already exists.
 *   Safe to rerun. With --update-existing, re-runs update price/labour/description instead of skipping.
 */

import XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { config } from 'dotenv';
import path from 'path';

config();

// ─── Column indices (0-based) ─────────────────────────────────────────────────

const COL_CATEGORY        = 0;  // A
const COL_PRODUCT_NAME    = 1;  // B
const COL_UNIT_PRICE      = 4;  // E
const COL_LABOUR_HOURS    = 7;  // H
const COL_DESCRIPTION     = 8;  // I

const SHEET_NAME          = 'Parts List';
const DATA_ROW_START      = 4;  // 0-indexed (row 5 in Excel)
const DATA_ROW_END        = 283; // 0-indexed (row 284 in Excel, inclusive)

// ─── Normalization ────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toDecimal(val: unknown): string | null {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : String(n);
}

function cellStr(val: unknown): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  return s || null;
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

interface CliArgs {
  file: string;
  companyId: number;
  dryRun: boolean;
  updateExisting: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { file: '', companyId: 1, dryRun: false, updateExisting: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--file':             args.file           = argv[++i]; break;
      case '--company':          args.companyId      = parseInt(argv[++i], 10); break;
      case '--dry-run':          args.dryRun         = true; break;
      case '--update-existing':  args.updateExisting = true; break;
    }
  }
  return args;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error('Usage: tsx scripts/seedPartsCatalogFromWorkbook.ts --file <path> --company <id> [--dry-run] [--update-existing]');
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
    workbook = XLSX.readFile(filePath, { cellDates: false });
  } catch (err: any) {
    console.error(`Cannot open file: ${err.message}`);
    process.exit(1);
  }

  const sheetName = workbook.SheetNames.find(s => s.trim() === SHEET_NAME);
  if (!sheetName) {
    console.log(`Available sheets: ${workbook.SheetNames.join(', ')}`);
    console.error(`Sheet "${SHEET_NAME}" not found in workbook.`);
    process.exit(1);
  }

  const ws = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const sourceWorkbook = path.basename(filePath);

  if (args.dryRun) console.log('DRY RUN — nothing will be written\n');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });

  // Pre-load existing catalog for this company
  const existing = await db
    .select({
      id: schema.partsCatalog.id,
      category: schema.partsCatalog.category,
      productName: schema.partsCatalog.productName,
      unitPrice: schema.partsCatalog.unitPrice,
      defaultLabourHours: schema.partsCatalog.defaultLabourHours,
      description: schema.partsCatalog.description,
    })
    .from(schema.partsCatalog)
    .where(eq(schema.partsCatalog.companyId, args.companyId));

  // Map: normKey → existing row
  const existingMap = new Map<string, typeof existing[0]>();
  for (const row of existing) {
    existingMap.set(`${norm(row.category)}|${norm(row.productName)}`, row);
  }

  // Counters
  let scanned = 0, valid = 0, wouldCreate = 0, wouldUpdate = 0;
  let skippedDup = 0, skippedInvalid = 0;
  const categoryCount = new Map<string, number>();

  type InsertRow = schema.InsertPartsCatalogItem;
  const toInsert: InsertRow[] = [];
  const toUpdate: Array<{ id: number; data: Partial<InsertRow> }> = [];

  const endRow = Math.min(DATA_ROW_END, rows.length - 1);

  for (let r = DATA_ROW_START; r <= endRow; r++) {
    const row = rows[r] as unknown[];
    // Skip blank rows
    if (row.every(c => c == null || c === '')) continue;

    scanned++;

    const category    = cellStr(row[COL_CATEGORY])    ?? '';
    const productName = cellStr(row[COL_PRODUCT_NAME]) ?? '';

    if (!category || !productName) {
      skippedInvalid++;
      continue;
    }

    const unitPrice        = toDecimal(row[COL_UNIT_PRICE]);
    const defaultLabourHours = toDecimal(row[COL_LABOUR_HOURS]);
    const description      = cellStr(row[COL_DESCRIPTION]);

    if (unitPrice === null) {
      skippedInvalid++;
      continue;
    }

    valid++;
    categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);

    const key = `${norm(category)}|${norm(productName)}`;
    const existingRow = existingMap.get(key);

    if (existingRow) {
      const priceChanged   = existingRow.unitPrice !== unitPrice;
      const labourChanged  = (existingRow.defaultLabourHours ?? null) !== (defaultLabourHours ?? null);
      const descChanged    = (existingRow.description ?? null) !== (description ?? null);
      const hasChanges     = priceChanged || labourChanged || descChanged;

      if (args.updateExisting && hasChanges) {
        wouldUpdate++;
        toUpdate.push({
          id: existingRow.id,
          data: { unitPrice, defaultLabourHours: defaultLabourHours ?? undefined, description: description ?? undefined },
        });
      } else {
        skippedDup++;
      }
      continue;
    }

    wouldCreate++;
    toInsert.push({
      companyId: args.companyId,
      category,
      productName,
      unitPrice,
      defaultLabourHours: defaultLabourHours ?? undefined,
      description: description ?? undefined,
      sourceWorkbook,
      sourceSheet: sheetName,
      sourceRow: r + 1, // 1-indexed Excel row number
    });

    // Track in-memory to prevent intra-batch duplicates
    existingMap.set(key, { id: -1, category, productName, unitPrice, defaultLabourHours, description });
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n── Scan Results ─────────────────────────────────────────────────`);
  console.log(`  Rows scanned:       ${scanned}`);
  console.log(`  Valid rows:         ${valid}`);
  console.log(`  Would create:       ${wouldCreate}`);
  console.log(`  Would update:       ${wouldUpdate}${args.updateExisting ? '' : '  (use --update-existing to enable)'}`);
  console.log(`  Skipped (dup):      ${skippedDup}`);
  console.log(`  Skipped (invalid):  ${skippedInvalid}`);

  if (categoryCount.size > 0) {
    console.log(`\n── Category Breakdown ────────────────────────────────────────────`);
    const sorted = [...categoryCount.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted) {
      console.log(`  ${cat.padEnd(40)} ${String(count).padStart(4)} items`);
    }
  }

  if (args.dryRun) {
    console.log('\nDRY RUN — rerun without --dry-run to write rows.\n');
    return;
  }

  // ─── Live write ────────────────────────────────────────────────────────────

  let created = 0, updated = 0, errors = 0;

  if (toInsert.length > 0) {
    try {
      // @ts-ignore — drizzle transaction typing varies by driver
      await (db as any).transaction(async (tx: any) => {
        for (const ins of toInsert) {
          await tx.insert(schema.partsCatalog).values(ins);
        }
      });
      created = toInsert.length;
    } catch (err: any) {
      errors++;
      console.error(`Insert transaction failed: ${err?.message ?? err}`);
    }
  }

  if (toUpdate.length > 0) {
    for (const { id, data } of toUpdate) {
      try {
        await db
          .update(schema.partsCatalog)
          .set(data)
          .where(eq(schema.partsCatalog.id, id));
        updated++;
      } catch (err: any) {
        errors++;
        console.error(`Update failed for id=${id}: ${err?.message ?? err}`);
      }
    }
  }

  console.log(`\n── Write Results ─────────────────────────────────────────────────`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  if (errors) console.log(`  Errors:  ${errors}`);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
