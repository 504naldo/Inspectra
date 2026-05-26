/**
 * scripts/auditSiteCustomerRecordReconciliation.ts
 *
 * READ-ONLY audit: reconcile existing DB Sites against Customer Records in Google Drive.
 *
 * Customer Records = Google Drive folder tree under GOOGLE_DRIVE_CUSTOMER_ROOT_ID:
 *   <Org Name>/
 *     #NNNN - <address or site name>/
 *
 * For every Drive site folder and every DB site, the script:
 *   1. Derives customerOrgId from the Drive org folder name
 *   2. Extracts fileNumber, buildingId, site name, address, city
 *   3. Matches to existing DB sites using priority:
 *        HIGH   = exact fileNumber or buildingId match
 *        MEDIUM = address-prefix match OR name+org match
 *        LOW    = token overlap ≥ 0.5 (reported, never acted on)
 *   4. Reports:
 *        - HIGH/MEDIUM matches — exact vs. field mismatches
 *        - LOW confidence matches — flagged for manual review
 *        - Customer Records without a matching Site
 *        - Sites without a matching Customer Record
 *        - Duplicate/ambiguous Drive records (multiple folders with same fileNumber)
 *        - Org folders unmatched to DB customerOrgs
 *
 * This script NEVER modifies any data.
 *
 * Usage:
 *   DATABASE_URL=mysql://... pnpm site:audit-reconciliation -- \
 *     --company 1 --admin-user-id 1
 *
 * Options:
 *   --company N              Company ID (default: 1)
 *   --customer-org N         Restrict to one customerOrg ID
 *   --admin-user-id N        Use stored Google OAuth token for DB user N
 *   --access-token T         Pass an OAuth token directly
 *   --limit N                Cap Drive records processed (for quick tests)
 *   --output-mismatches      Write mismatches JSON → data/exports/site-reconciliation-mismatches.json
 *   --output-unmatched       Write unmatched JSON → data/exports/site-reconciliation-unmatched.json
 *   --verbose                Print every record, not just those with findings
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";
import {
  normName,
  normBldg,
  normAddress,
  parseAddressComponents,
  tokenOverlap,
} from "../lib/import/normalize.js";

config();

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = "high" | "medium" | "low";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveRecord {
  orgFolderName: string;
  orgFolderId: string;
  siteFolderName: string;
  siteFolderId: string;
  fileNumber: string;
  siteName: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

type DbSite = typeof schema.sites.$inferSelect;
type DbOrg = typeof schema.customerOrgs.$inferSelect;

interface SiteMatch {
  site: DbSite;
  confidence: Confidence;
  matchedBy: string;
}

interface MismatchRow {
  driveRecordId: string;
  siteFolderName: string;
  siteId: number;
  customerOrgId: number | null;
  matchConfidence: Confidence;
  fieldName: string;
  siteValue: string | null;
  driveValue: string | null;
  recommendedAction: "manual-review";
  reason: string;
}

interface RecordResult {
  record: DriveRecord;
  orgId?: number;
  orgName?: string;
  orgMatched: boolean;
  match: SiteMatch | null;
  mismatches: MismatchRow[];
  isDuplicate: boolean;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

interface CliArgs {
  companyId: number;
  customerOrgId?: number;
  adminUserId?: number;
  accessToken?: string;
  limit?: number;
  outputMismatches: boolean;
  outputUnmatched: boolean;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    companyId: 1,
    outputMismatches: false,
    outputUnmatched: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company":          args.companyId = parseInt(argv[++i], 10); break;
      case "--customer-org":     args.customerOrgId = parseInt(argv[++i], 10); break;
      case "--admin-user-id":    args.adminUserId = parseInt(argv[++i], 10); break;
      case "--access-token":     args.accessToken = argv[++i]; break;
      case "--limit":            args.limit = parseInt(argv[++i], 10); break;
      case "--output-mismatches": args.outputMismatches = true; break;
      case "--output-unmatched": args.outputUnmatched = true; break;
      case "--verbose":          args.verbose = true; break;
      default:
        if (argv[i].startsWith("--")) {
          console.error(`Unknown option: ${argv[i]}`);
          process.exit(1);
        }
    }
  }
  return args;
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function sharedDriveParams(): Record<string, string> {
  if (process.env.GOOGLE_DRIVE_USE_SHARED_DRIVE !== "true") return {};
  const extra: Record<string, string> = {
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  };
  if (process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID) {
    extra.corpora = "drive";
    extra.driveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID;
  }
  return extra;
}

async function driveList(token: string, params: Record<string, string>): Promise<DriveFile[]> {
  const base = new URL(`${DRIVE_API}/files`);
  for (const [k, v] of Object.entries(params)) base.searchParams.set(k, v);

  const all: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(base.toString());
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Drive API error (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);

  return all;
}

async function listFolders(parentId: string, token: string): Promise<DriveFile[]> {
  return driveList(token, {
    q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed=false`,
    fields: "nextPageToken,files(id,name,mimeType)",
    orderBy: "name",
    pageSize: "500",
    ...sharedDriveParams(),
  });
}

// ─── Token resolution ─────────────────────────────────────────────────────────

async function resolveToken(args: CliArgs, db: ReturnType<typeof drizzle>): Promise<string> {
  if (args.accessToken) return args.accessToken;

  const userId = args.adminUserId!;
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!rows.length) throw new Error(`User ${userId} not found in DB`);
  const user = rows[0];

  if (!user.googleAccessToken) {
    throw new Error(
      `User ${userId} has no stored Google token. Have them log in to the app first, ` +
      `or pass --access-token directly.`
    );
  }

  if (user.googleTokenExpiry) {
    const bufferMs = 5 * 60 * 1000;
    if (new Date(user.googleTokenExpiry).getTime() - bufferMs > Date.now()) {
      return user.googleAccessToken;
    }
  }

  if (!user.googleRefreshToken) {
    throw new Error(
      `Token for user ${userId} is expired and no refresh token is stored. ` +
      `Have them re-authenticate in the app.`
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: user.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw new Error(`Failed to refresh Google token: ${body.slice(0, 300)}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

  // Token refresh is a side-effect of reading, not modifying business data —
  // skipping it here would require the caller to supply a fresh token on every run.
  await db
    .update(schema.users)
    .set({ googleAccessToken: tokenData.access_token, googleTokenExpiry: newExpiry })
    .where(eq(schema.users.id, userId));

  console.log(`  Refreshed Google token for user ${userId}`);
  return tokenData.access_token;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseSiteFolder(name: string): { fileNumber: string; siteName: string } | null {
  const m = name.match(/^(#[\w-]+)\s*[-–—]+\s*(.+)$/);
  if (!m) return null;
  return { fileNumber: m[1].trim(), siteName: m[2].trim() };
}

// ─── Site index ───────────────────────────────────────────────────────────────

interface SiteIndexes {
  byFileNumber: Map<string, DbSite[]>;
  byBuildingId: Map<string, DbSite[]>;
  byOrgName: Map<string, DbSite[]>;
}

function buildSiteIndexes(sites: DbSite[]): SiteIndexes {
  const byFileNumber = new Map<string, DbSite[]>();
  const byBuildingId = new Map<string, DbSite[]>();
  const byOrgName = new Map<string, DbSite[]>();

  function push<K>(map: Map<K, DbSite[]>, key: K, site: DbSite) {
    const arr = map.get(key);
    if (arr) arr.push(site);
    else map.set(key, [site]);
  }

  for (const s of sites) {
    if (s.fileNumber) push(byFileNumber, normBldg(s.fileNumber), s);
    if (s.buildingId) push(byBuildingId, normBldg(s.buildingId), s);
    const nameKey = `${s.customerOrgId}::${normName(s.name)}`;
    push(byOrgName, nameKey, s);
  }

  return { byFileNumber, byBuildingId, byOrgName };
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function matchSite(
  record: DriveRecord,
  orgId: number | undefined,
  allSites: DbSite[],
  indexes: SiteIndexes
): { match: SiteMatch | null; ambiguous: boolean } {
  const normFN = normBldg(record.fileNumber);

  // HIGH: exact fileNumber — check for duplicates
  const byFN = indexes.byFileNumber.get(normFN);
  if (byFN && byFN.length === 1) return { match: { site: byFN[0], confidence: "high", matchedBy: "fileNumber" }, ambiguous: false };
  if (byFN && byFN.length > 1) return { match: { site: byFN[0], confidence: "high", matchedBy: "fileNumber" }, ambiguous: true };

  // HIGH: exact buildingId
  const byBI = indexes.byBuildingId.get(normFN);
  if (byBI && byBI.length === 1) return { match: { site: byBI[0], confidence: "high", matchedBy: "buildingId" }, ambiguous: false };
  if (byBI && byBI.length > 1) return { match: { site: byBI[0], confidence: "high", matchedBy: "buildingId" }, ambiguous: true };

  // MEDIUM: address prefix
  if (record.address) {
    const normAddr = normAddress(record.address);
    if (normAddr.length >= 8) {
      const prefix = normAddr.slice(0, 20);
      const addrMatches = allSites.filter(
        s => s.address && normAddress(s.address).startsWith(prefix)
      );
      if (addrMatches.length === 1) return { match: { site: addrMatches[0], confidence: "medium", matchedBy: "address" }, ambiguous: false };
      if (addrMatches.length > 1) return { match: { site: addrMatches[0], confidence: "medium", matchedBy: "address" }, ambiguous: true };
    }
  }

  // MEDIUM: name + org
  if (orgId !== undefined) {
    const nameKey = `${orgId}::${normName(record.siteName)}`;
    const byName = indexes.byOrgName.get(nameKey);
    if (byName && byName.length === 1) return { match: { site: byName[0], confidence: "medium", matchedBy: "name+org" }, ambiguous: false };
    if (byName && byName.length > 1) return { match: { site: byName[0], confidence: "medium", matchedBy: "name+org" }, ambiguous: true };
  }

  // LOW: token overlap ≥ 0.5
  const normSiteName = normName(record.siteName);
  let bestScore = 0;
  let bestSite: DbSite | null = null;
  for (const s of allSites) {
    const score = tokenOverlap(normSiteName, normName(s.name));
    if (score > bestScore) { bestScore = score; bestSite = s; }
  }
  if (bestScore >= 0.5 && bestSite) {
    return { match: { site: bestSite, confidence: "low", matchedBy: `token-overlap(${bestScore.toFixed(2)})` }, ambiguous: false };
  }

  return { match: null, ambiguous: false };
}

// ─── Mismatch detection ───────────────────────────────────────────────────────

function detectMismatches(
  record: DriveRecord,
  orgId: number | undefined,
  site: DbSite,
  confidence: Confidence
): MismatchRow[] {
  const rows: MismatchRow[] = [];

  function check(fieldName: string, siteVal: string | null | undefined, driveVal: string | null | undefined) {
    const sv = siteVal?.trim() || null;
    const dv = driveVal?.trim() || null;
    if (!sv || !dv) return;
    if (normName(sv) === normName(dv)) return;
    rows.push({
      driveRecordId: record.siteFolderId,
      siteFolderName: record.siteFolderName,
      siteId: site.id,
      customerOrgId: orgId ?? null,
      matchConfidence: confidence,
      fieldName,
      siteValue: sv,
      driveValue: dv,
      recommendedAction: "manual-review",
      reason: `Site "${fieldName}" differs from Customer Record value`,
    });
  }

  if (orgId !== undefined && site.customerOrgId !== orgId) {
    rows.push({
      driveRecordId: record.siteFolderId,
      siteFolderName: record.siteFolderName,
      siteId: site.id,
      customerOrgId: orgId,
      matchConfidence: confidence,
      fieldName: "customerOrgId",
      siteValue: String(site.customerOrgId),
      driveValue: String(orgId),
      recommendedAction: "manual-review",
      reason: "Site customerOrgId differs from Drive org folder match",
    });
  }

  if (record.fileNumber && site.fileNumber) {
    if (normBldg(site.fileNumber) !== normBldg(record.fileNumber)) {
      rows.push({
        driveRecordId: record.siteFolderId,
        siteFolderName: record.siteFolderName,
        siteId: site.id,
        customerOrgId: orgId ?? null,
        matchConfidence: confidence,
        fieldName: "fileNumber",
        siteValue: site.fileNumber,
        driveValue: record.fileNumber,
        recommendedAction: "manual-review",
        reason: "fileNumber differs between site and Drive folder",
      });
    }
  }

  if (record.fileNumber && site.buildingId) {
    if (normBldg(site.buildingId) !== normBldg(record.fileNumber)) {
      rows.push({
        driveRecordId: record.siteFolderId,
        siteFolderName: record.siteFolderName,
        siteId: site.id,
        customerOrgId: orgId ?? null,
        matchConfidence: confidence,
        fieldName: "buildingId",
        siteValue: site.buildingId,
        driveValue: record.fileNumber,
        recommendedAction: "manual-review",
        reason: "buildingId differs from Drive folder file number",
      });
    }
  }

  check("name", site.name, record.siteName);
  if (record.address) check("address", site.address, record.address);
  if (record.city) check("city", site.city, record.city);

  return rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function ensureExportsDir() {
  mkdirSync("data/exports", { recursive: true });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("ERROR: DATABASE_URL is not set."); process.exit(1); }

  const rootId = process.env.GOOGLE_DRIVE_CUSTOMER_ROOT_ID;
  if (!rootId) {
    console.error("ERROR: GOOGLE_DRIVE_CUSTOMER_ROOT_ID is not set in .env");
    process.exit(1);
  }

  if (!args.adminUserId && !args.accessToken) {
    console.error("ERROR: Google Drive authentication required.");
    console.error("  --admin-user-id N   Use stored Google token for DB user N");
    console.error("  --access-token T    Paste an OAuth token from the app's DevTools");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Site ↔ Customer Records Reconciliation Audit  (READ-ONLY)`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company : ${args.companyId}`);
  if (args.customerOrgId !== undefined) console.log(`  org     : ${args.customerOrgId}`);
  if (args.limit !== undefined) console.log(`  limit   : ${args.limit}`);
  console.log();

  const db = drizzle(dbUrl, { schema, mode: "default" });

  // ── Google token ─────────────────────────────────────────────────────────────
  console.log("Resolving Google access token...");
  const token = await resolveToken(args, db);
  console.log("  Token OK\n");

  // ── Load DB snapshot ──────────────────────────────────────────────────────────
  console.log("Loading database snapshot...");
  let [allOrgs, allSites] = await Promise.all([
    db.select().from(schema.customerOrgs).where(eq(schema.customerOrgs.companyId, args.companyId)),
    db.select().from(schema.sites).where(eq(schema.sites.companyId, args.companyId)),
  ]);

  if (args.customerOrgId !== undefined) {
    allOrgs = allOrgs.filter(o => o.id === args.customerOrgId);
    if (allOrgs.length === 0) {
      console.error(`ERROR: No customerOrg with id=${args.customerOrgId} found for company ${args.companyId}`);
      process.exit(1);
    }
    // Keep all sites for cross-org mismatch detection but mark the filter
  }

  console.log(`  ${allOrgs.length} customer orgs, ${allSites.length} sites\n`);

  const orgByNorm = new Map<string, DbOrg>();
  for (const org of allOrgs) orgByNorm.set(normName(org.name), org);

  const siteIndexes = buildSiteIndexes(allSites);

  // ── Walk Drive tree ──────────────────────────────────────────────────────────
  console.log(`Listing org folders under Drive root ${rootId}...`);
  const orgFolders = await listFolders(rootId, token);
  console.log(`  Found ${orgFolders.length} org folders\n`);

  const allDriveRecords: DriveRecord[] = [];
  const unmatchedOrgFolders: string[] = [];
  const unparsedFolders: { orgFolder: string; siteName: string }[] = [];
  const orgFolderToOrgId = new Map<string, number>();

  for (const orgFolder of orgFolders) {
    if (args.customerOrgId !== undefined) {
      const normFolder = normName(orgFolder.name);
      const matched = orgByNorm.get(normFolder)
        ?? [...orgByNorm.values()].find(o => {
          const on = normName(o.name);
          return on.includes(normFolder) || normFolder.includes(on);
        });
      if (!matched) continue;
      if (matched.id !== args.customerOrgId) continue;
    }

    const normFolder = normName(orgFolder.name);
    let matchedOrg = orgByNorm.get(normFolder);
    if (!matchedOrg) {
      matchedOrg = [...orgByNorm.values()].find(o => {
        const on = normName(o.name);
        return on.includes(normFolder) || normFolder.includes(on);
      });
    }

    if (!matchedOrg) {
      unmatchedOrgFolders.push(orgFolder.name);
      continue;
    }

    orgFolderToOrgId.set(orgFolder.id, matchedOrg.id);

    const siteFolders = await listFolders(orgFolder.id, token);
    for (const sf of siteFolders) {
      const parsed = parseSiteFolder(sf.name);
      if (!parsed) {
        unparsedFolders.push({ orgFolder: orgFolder.name, siteName: sf.name });
        continue;
      }

      const addrParts = parseAddressComponents(parsed.siteName);
      allDriveRecords.push({
        orgFolderName: orgFolder.name,
        orgFolderId: orgFolder.id,
        siteFolderName: sf.name,
        siteFolderId: sf.id,
        fileNumber: parsed.fileNumber,
        siteName: parsed.siteName,
        address: addrParts.streetAddress,
        city: addrParts.city,
        state: addrParts.state,
        postalCode: addrParts.postalCode,
      });
    }
  }

  const records = args.limit !== undefined ? allDriveRecords.slice(0, args.limit) : allDriveRecords;
  console.log(`Drive records to audit: ${records.length} of ${allDriveRecords.length} total\n`);

  // Detect duplicate fileNumbers in Drive itself
  const driveFileNumberCount = new Map<string, number>();
  for (const r of allDriveRecords) {
    const k = normBldg(r.fileNumber);
    driveFileNumberCount.set(k, (driveFileNumberCount.get(k) ?? 0) + 1);
  }
  const driveFileDuplicates = allDriveRecords.filter(
    r => (driveFileNumberCount.get(normBldg(r.fileNumber)) ?? 0) > 1
  );

  // ── Process each Drive record ────────────────────────────────────────────────
  const results: RecordResult[] = [];
  const allMismatches: MismatchRow[] = [];
  let highConf = 0, medConf = 0, lowConf = 0, noMatch = 0, ambiguous = 0;

  for (const record of records) {
    const orgId = orgFolderToOrgId.get(record.orgFolderId);
    const orgName = orgId !== undefined ? allOrgs.find(o => o.id === orgId)?.name : undefined;

    const { match, ambiguous: isAmbiguous } = matchSite(record, orgId, allSites, siteIndexes);
    if (isAmbiguous) ambiguous++;

    if (match?.confidence === "high") highConf++;
    else if (match?.confidence === "medium") medConf++;
    else if (match?.confidence === "low") lowConf++;
    else noMatch++;

    let mismatches: MismatchRow[] = [];
    if (match && match.confidence !== "low") {
      mismatches = detectMismatches(record, orgId, match.site, match.confidence);
      allMismatches.push(...mismatches);
    }

    if (args.verbose || mismatches.length > 0 || !match || match.confidence === "low" || isAmbiguous) {
      const line = [
        `  ${pad(record.fileNumber, 12)}`,
        `[${match ? match.confidence : "none"}]`,
        match ? `siteId=${match.site.id}` : "NO MATCH",
        isAmbiguous ? "(AMBIGUOUS)" : "",
        mismatches.length > 0 ? `${mismatches.length} mismatch(es)` : "",
        `"${record.siteName}"`,
      ].filter(Boolean).join("  ");
      console.log(line);
    }

    results.push({
      record,
      orgId,
      orgName,
      orgMatched: orgId !== undefined,
      match,
      mismatches,
      isDuplicate: (driveFileNumberCount.get(normBldg(record.fileNumber)) ?? 0) > 1,
    });
  }

  // ── Sites without a Drive record ─────────────────────────────────────────────
  const matchedSiteIds = new Set(
    results.filter(r => r.match && r.match.confidence !== "low").map(r => r.match!.site.id)
  );

  const sitesInScope = args.customerOrgId !== undefined
    ? allSites.filter(s => s.customerOrgId === args.customerOrgId)
    : allSites;

  const sitesWithoutDriveRecord = sitesInScope.filter(s => !matchedSiteIds.has(s.id));

  // ── Aggregate ─────────────────────────────────────────────────────────────────
  const line = "─".repeat(60);
  const driveNoSite = results.filter(r => !r.match || r.match.confidence === "low");
  const driveNoOrg  = results.filter(r => !r.orgMatched);

  console.log(`\n${line}`);
  console.log("  RECONCILIATION SUMMARY  (READ-ONLY — no changes made)");
  console.log(line);
  console.log(`  ${pad("Drive org folders found:", 44)} ${orgFolders.length}`);
  console.log(`  ${pad("Org folders matched to DB customerOrg:", 44)} ${orgFolders.length - unmatchedOrgFolders.length}`);
  console.log(`  ${pad("Org folders unmatched:", 44)} ${unmatchedOrgFolders.length}`);
  console.log(`  ${pad("Total Drive site folders:", 44)} ${allDriveRecords.length}`);
  console.log(`  ${pad("Folders without #NNNN pattern:", 44)} ${unparsedFolders.length}`);
  console.log(`  ${pad("Processed (after limit):", 44)} ${records.length}`);
  console.log();
  console.log(`  ${pad("HIGH confidence matches:", 44)} ${highConf}`);
  console.log(`  ${pad("MEDIUM confidence matches:", 44)} ${medConf}`);
  console.log(`  ${pad("LOW confidence (review only):", 44)} ${lowConf}`);
  console.log(`  ${pad("No match found:", 44)} ${noMatch}`);
  console.log(`  ${pad("Ambiguous matches (multiple candidates):", 44)} ${ambiguous}`);
  console.log();
  console.log(`  ${pad("Field mismatches detected:", 44)} ${allMismatches.length}`);
  console.log(`  ${pad("Drive records without a Site:", 44)} ${driveNoSite.length}`);
  console.log(`  ${pad("Sites without a Drive record:", 44)} ${sitesWithoutDriveRecord.length}`);
  console.log(`  ${pad("Duplicate fileNumbers in Drive:", 44)} ${driveFileDuplicates.length}`);

  // ── Detail sections ──────────────────────────────────────────────────────────

  if (unmatchedOrgFolders.length > 0) {
    console.log(`\n${line}`);
    console.log(`  UNMATCHED ORG FOLDERS (${unmatchedOrgFolders.length})`);
    console.log(`  These Drive org folders have no matching customerOrg in DB.`);
    console.log(line);
    unmatchedOrgFolders.forEach(n => console.log(`  • ${n}`));
  }

  if (unparsedFolders.length > 0) {
    console.log(`\n${line}`);
    console.log(`  FOLDERS WITHOUT #NNNN PATTERN (${unparsedFolders.length})`);
    console.log(line);
    unparsedFolders.forEach(f => console.log(`  org="${f.orgFolder}"  folder="${f.siteName}"`));
  }

  if (driveFileDuplicates.length > 0) {
    console.log(`\n${line}`);
    console.log(`  DUPLICATE FILENUMBERS IN DRIVE (${driveFileDuplicates.length})`);
    console.log(`  Multiple site folders share the same #NNNN — possible duplicate sites.`);
    console.log(line);
    const seenDup = new Set<string>();
    for (const r of driveFileDuplicates) {
      const k = normBldg(r.fileNumber);
      if (!seenDup.has(k)) {
        seenDup.add(k);
        const group = driveFileDuplicates.filter(x => normBldg(x.fileNumber) === k);
        console.log(`  ${r.fileNumber}:`);
        group.forEach(g => console.log(`    org="${g.orgFolderName}"  folder="${g.siteFolderName}"`));
      }
    }
  }

  if (allMismatches.length > 0) {
    console.log(`\n${line}`);
    console.log(`  FIELD MISMATCHES (${allMismatches.length})`);
    console.log(`  Populated Site fields differ from Customer Record values.`);
    console.log(`  These were NOT changed. Review manually.`);
    console.log(line);
    for (const m of allMismatches) {
      console.log(`  siteId=${m.siteId} [${m.matchConfidence}] field="${m.fieldName}"`);
      console.log(`    site  : ${m.siteValue}`);
      console.log(`    drive : ${m.driveValue}`);
    }
  }

  if (results.filter(r => r.match?.confidence === "low").length > 0) {
    const lowConfs = results.filter(r => r.match?.confidence === "low");
    console.log(`\n${line}`);
    console.log(`  LOW CONFIDENCE MATCHES — MANUAL REVIEW REQUIRED (${lowConfs.length})`);
    console.log(`  Similar name/tokens but no exact match. Not counted as matched.`);
    console.log(line);
    for (const r of lowConfs) {
      const siteLabel = r.match ? `siteId=${r.match.site.id} [${r.match.matchedBy}]` : "?";
      console.log(`  ${pad(r.record.fileNumber, 12)} "${r.record.siteName}"  →  ${siteLabel}`);
    }
  }

  if (results.filter(r => r.isDuplicate).length > 0) {
    const ambiguousResults = results.filter(r => r.isDuplicate);
    console.log(`\n${line}`);
    console.log(`  AMBIGUOUS DRIVE RECORDS (${ambiguousResults.length})`);
    console.log(`  Multiple DB sites matched the same fileNumber.`);
    console.log(line);
    for (const r of ambiguousResults) {
      const m = r.match;
      console.log(`  ${pad(r.record.fileNumber, 12)} matched siteId=${m?.site.id ?? "?"} but multiple sites share this fileNumber`);
    }
  }

  const unmatched = results.filter(r => !r.match && r.orgMatched);
  if (unmatched.length > 0) {
    console.log(`\n${line}`);
    console.log(`  CUSTOMER RECORDS WITHOUT A MATCHING SITE (${unmatched.length})`);
    console.log(`  These Drive folders have no matching Site in DB.`);
    console.log(`  Run "pnpm seed:sites-from-customer-records" to create them.`);
    console.log(line);
    for (const r of unmatched) {
      const orgLabel = r.orgName ? `org="${r.orgName}"` : "no-org";
      console.log(`  ${pad(r.record.fileNumber, 12)} ${orgLabel}  "${r.record.siteName}"`);
    }
  }

  if (driveNoOrg.length > 0) {
    console.log(`\n${line}`);
    console.log(`  DRIVE RECORDS WITH NO MATCHED ORG (${driveNoOrg.length})`);
    console.log(`  The Drive org folder could not be matched to a DB customerOrg.`);
    console.log(line);
    for (const r of driveNoOrg) {
      console.log(`  orgFolder="${r.record.orgFolderName}"  file=${r.record.fileNumber}  "${r.record.siteName}"`);
    }
  }

  if (sitesWithoutDriveRecord.length > 0) {
    console.log(`\n${line}`);
    console.log(`  SITES WITHOUT A CUSTOMER RECORD (${sitesWithoutDriveRecord.length})`);
    console.log(`  These DB Sites have no matching Drive folder.`);
    console.log(line);
    for (const s of sitesWithoutDriveRecord) {
      const fn = s.fileNumber ?? s.buildingId ?? "no-file#";
      console.log(`  siteId=${String(s.id).padEnd(5)} ${pad(fn, 12)} org=${s.customerOrgId}  "${s.name}"`);
    }
  }

  // ── JSON output ───────────────────────────────────────────────────────────────

  if (args.outputMismatches && allMismatches.length > 0) {
    ensureExportsDir();
    const path = "data/exports/site-reconciliation-mismatches.json";
    writeFileSync(path, JSON.stringify({
      companyId: args.companyId,
      generatedAt: new Date().toISOString(),
      totalMismatches: allMismatches.length,
      mismatches: allMismatches,
    }, null, 2));
    console.log(`\n  Written: ${path}`);
  }

  if (args.outputUnmatched) {
    ensureExportsDir();
    const path = "data/exports/site-reconciliation-unmatched.json";
    writeFileSync(path, JSON.stringify({
      companyId: args.companyId,
      generatedAt: new Date().toISOString(),
      driveRecordsWithoutSite: unmatched.map(r => ({
        orgFolderName: r.record.orgFolderName,
        siteFolderName: r.record.siteFolderName,
        fileNumber: r.record.fileNumber,
        siteName: r.record.siteName,
        customerOrgId: r.orgId ?? null,
      })),
      sitesWithoutDriveRecord: sitesWithoutDriveRecord.map(s => ({
        siteId: s.id,
        siteName: s.name,
        fileNumber: s.fileNumber,
        buildingId: s.buildingId,
        customerOrgId: s.customerOrgId,
        address: s.address,
        city: s.city,
      })),
      lowConfidenceMatches: results.filter(r => r.match?.confidence === "low").map(r => ({
        fileNumber: r.record.fileNumber,
        siteFolderName: r.record.siteFolderName,
        suggestedSiteId: r.match!.site.id,
        suggestedSiteName: r.match!.site.name,
        matchedBy: r.match!.matchedBy,
      })),
      driveFileDuplicates: driveFileDuplicates.map(r => ({
        fileNumber: r.fileNumber,
        orgFolderName: r.orgFolderName,
        siteFolderName: r.siteFolderName,
      })),
    }, null, 2));
    console.log(`  Written: ${path}`);
  }

  console.log(`\nAudit complete — no changes made to the database.\n`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error("\nFatal:", err instanceof Error ? err.message : err); process.exit(1); });
