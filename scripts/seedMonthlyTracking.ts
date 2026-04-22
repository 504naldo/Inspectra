#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import * as db from "../server/db.js";

const SUPPORTED_EXTS = new Set([".xlsx", ".xls", ".xlsm", ".csv"]);

type CliArgs = {
  file?: string;
  dir?: string;
  month?: string;
  company?: number;
  dryRun: boolean;
  headerRow: number;
};

type SeedSummary = {
  created: number;
  skippedDuplicates: number;
  unmatched: number;
  errors: number;
  processedRows: number;
};

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
const normBldg = (s: string): string => {
  const cleaned = norm(s);
  return /^\d+$/.test(cleaned) ? String(parseInt(cleaned, 10)) : cleaned;
};

function usageAndExit(message?: string): never {
  if (message) console.error(`\nError: ${message}\n`);
  console.log(`Usage:
  tsx scripts/seedMonthlyTracking.ts --file path/to/file.xlsx --month 2026-04 --company 1 --dry-run
  tsx scripts/seedMonthlyTracking.ts --file path/to/file.xlsx --month 2026-04 --company 1
  tsx scripts/seedMonthlyTracking.ts --dir path/to/folder --month 2026-04 --company 1

Options:
  --file <path>       Single source file (.xlsx/.xls/.xlsm/.csv)
  --dir <path>        Folder containing source files
  --month <YYYY-MM>   Target tracking month
  --company <id>      Company ID
  --dry-run           Parse + match + duplicate-check without inserts
  --header-row <n>    Header row index (0-based, default: 0)
`);
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, headerRow: 0 };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--file") out.file = argv[++i];
    else if (a === "--dir") out.dir = argv[++i];
    else if (a === "--month") out.month = argv[++i];
    else if (a === "--company") out.company = Number(argv[++i]);
    else if (a === "--header-row") out.headerRow = Number(argv[++i]);
    else usageAndExit(`Unknown argument: ${a}`);
  }

  if (!out.file && !out.dir) usageAndExit("Provide either --file or --dir");
  if (out.file && out.dir) usageAndExit("Use either --file or --dir, not both");
  if (!out.month || !/^\d{4}-\d{2}$/.test(out.month)) usageAndExit("--month must be YYYY-MM");
  if (!out.company || !Number.isInteger(out.company) || out.company <= 0) usageAndExit("--company must be a positive integer");
  if (!Number.isInteger(out.headerRow) || out.headerRow < 0) usageAndExit("--header-row must be a non-negative integer");

  return out;
}

function resolveFiles(args: CliArgs): string[] {
  if (args.file) {
    const full = path.resolve(args.file);
    if (!fs.existsSync(full)) usageAndExit(`File not found: ${full}`);
    const ext = path.extname(full).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) usageAndExit(`Unsupported file extension: ${ext}`);
    return [full];
  }

  const dir = path.resolve(args.dir!);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) usageAndExit(`Directory not found: ${dir}`);

  const files = fs
    .readdirSync(dir)
    .map((n) => path.join(dir, n))
    .filter((p) => fs.statSync(p).isFile())
    .filter((p) => SUPPORTED_EXTS.has(path.extname(p).toLowerCase()));

  if (files.length === 0) usageAndExit(`No supported files found in ${dir}`);
  return files.sort((a, b) => a.localeCompare(b));
}

function findCol(headers: string[], ...keywords: string[]): number {
  const normalizedHeaders = headers.map((h) => norm(h));
  const normalizedKeywords = keywords.map((k) => norm(k));
  return normalizedHeaders.findIndex((h) => normalizedKeywords.some((k) => h.includes(k)));
}

function parseCellDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;

  if (value instanceof Date && !isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }

  const str = String(value).trim();
  if (!str) return undefined;

  // Try common date-like strings first
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) return dt;

  // Fallback for YYYY-MM-DD specifically
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const fallback = new Date(Date.UTC(y, mo - 1, d));
    if (!isNaN(fallback.getTime())) return fallback;
  }

  return undefined;
}

function serviceKey(siteId: number, serviceType: string, trackingMonth: string): string {
  return `${siteId}::${serviceType.trim().toLowerCase()}::${trackingMonth}`;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const files = resolveFiles(args);

  const allSites = await db.getSitesByCompany(args.company!);
  if (allSites.length === 0) {
    console.error(`No sites found for company ${args.company}`);
    process.exit(1);
  }

  const buildingMap = new Map<string, (typeof allSites)[number]>();
  for (const site of allSites) {
    if (!site.buildingId) continue;
    buildingMap.set(normBldg(site.buildingId), site);
  }

  // Site name fallback is strict-only: exact normalized match and unique.
  const siteNameBuckets = new Map<string, (typeof allSites)>();
  for (const site of allSites) {
    const key = norm(site.name);
    const arr = siteNameBuckets.get(key) ?? [];
    arr.push(site);
    siteNameBuckets.set(key, arr);
  }

  const existingForMonth = await db.getMonthlyTrackingByCompany(args.company!, args.month);
  const existingKeys = new Set(existingForMonth.map((r) => serviceKey(r.siteId, r.serviceType, r.trackingMonth)));

  const summary: SeedSummary = {
    created: 0,
    skippedDuplicates: 0,
    unmatched: 0,
    errors: 0,
    processedRows: 0,
  };

  const unmatchedRows: Array<{ file: string; row: number; buildingId: string; siteName: string; serviceType: string }> = [];

  console.log(`\n[seedMonthlyTracking] Starting ${args.dryRun ? "DRY RUN" : "SEED"}`);
  console.log(`[seedMonthlyTracking] Company: ${args.company} | Month: ${args.month}`);
  console.log(`[seedMonthlyTracking] Files: ${files.length}`);

  for (const filePath of files) {
    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as unknown[][];

    if (rows.length <= args.headerRow + 1) {
      console.warn(`[seedMonthlyTracking] Skipping ${filePath}: no data rows found`);
      continue;
    }

    const headers = rows[args.headerRow].map((c) => String(c ?? "").trim());

    const colBuildingId = findCol(headers, "file#", "file #", "buildingid", "building id", "accountno", "account", "fileno", "file no", "file number", "bldg", "building", "acct", "file", "id");
    const colSiteName = findCol(headers, "sitename", "site name", "building name", "location", "address", "property", "site", "building", "name");
    const colServiceType = findCol(headers, "service type", "servicetype", "service", "type", "inspection");
    const colTargetDate = findCol(headers, "targetdate", "target date", "due date", "scheduled", "date");
    const colNotes = findCol(headers, "notes", "comments", "remarks");

    console.log(`\n[seedMonthlyTracking] Processing ${filePath}`);
    console.log(`[seedMonthlyTracking] Columns: buildingId=${colBuildingId}, siteName=${colSiteName}, serviceType=${colServiceType}, targetDate=${colTargetDate}, notes=${colNotes}`);

    for (let i = args.headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const rawBuildingId = colBuildingId >= 0 ? String(row[colBuildingId] ?? "").trim() : "";
      const rawSiteName = colSiteName >= 0 ? String(row[colSiteName] ?? "").trim() : "";
      const serviceType = colServiceType >= 0 ? String(row[colServiceType] ?? "").trim() : "Annual Inspection";
      const notes = colNotes >= 0 ? String(row[colNotes] ?? "").trim() : "";
      const targetDate = colTargetDate >= 0 ? parseCellDate(row[colTargetDate]) : undefined;

      if (!rawBuildingId && !rawSiteName && !serviceType) continue;
      summary.processedRows++;

      let matchedSite: (typeof allSites)[number] | undefined;

      if (rawBuildingId) {
        matchedSite = buildingMap.get(normBldg(rawBuildingId));
      }

      if (!matchedSite && rawSiteName) {
        const exactNameMatches = siteNameBuckets.get(norm(rawSiteName)) ?? [];
        if (exactNameMatches.length === 1) {
          matchedSite = exactNameMatches[0];
        }
      }

      if (!matchedSite) {
        summary.unmatched++;
        unmatchedRows.push({
          file: path.basename(filePath),
          row: i + 1,
          buildingId: rawBuildingId,
          siteName: rawSiteName,
          serviceType,
        });
        continue;
      }

      const key = serviceKey(matchedSite.id, serviceType, args.month!);
      if (existingKeys.has(key)) {
        summary.skippedDuplicates++;
        continue;
      }

      const rowToInsert: Parameters<typeof db.createMonthlyTracking>[0] = {
        siteId: matchedSite.id,
        customerOrgId: matchedSite.customerOrgId,
        companyId: matchedSite.companyId,
        buildingId: rawBuildingId || matchedSite.buildingId || undefined,
        trackingMonth: args.month!,
        serviceType,
        ...(targetDate ? { targetDate } : {}),
        notes: notes || undefined,
        status: "not_scheduled",
        reportStatus: "none",
        linkedJobId: null,
        deficiencyCount: 0,
      };

      if (args.dryRun) {
        summary.created++;
        existingKeys.add(key);
        continue;
      }

      try {
        await db.createMonthlyTracking(rowToInsert);
        summary.created++;
        existingKeys.add(key);
      } catch (err) {
        summary.errors++;
        console.error(`[seedMonthlyTracking] Insert failed: ${path.basename(filePath)} row ${i + 1} ->`, err);
      }
    }
  }

  console.log("\n[seedMonthlyTracking] Summary");
  console.log(`  processed rows      : ${summary.processedRows}`);
  console.log(`  ${args.dryRun ? "would create" : "created"}         : ${summary.created}`);
  console.log(`  skipped duplicates  : ${summary.skippedDuplicates}`);
  console.log(`  unmatched           : ${summary.unmatched}`);
  console.log(`  errors              : ${summary.errors}`);

  if (unmatchedRows.length > 0) {
    console.log("\n[seedMonthlyTracking] Unmatched rows:");
    for (const r of unmatchedRows.slice(0, 200)) {
      console.log(
        `  - file=${r.file} row=${r.row} buildingId="${r.buildingId}" siteName="${r.siteName}" serviceType="${r.serviceType}"`
      );
    }
    if (unmatchedRows.length > 200) {
      console.log(`  ... and ${unmatchedRows.length - 200} more`);
    }
  }

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("[seedMonthlyTracking] Fatal error:", err);
  process.exit(1);
});
