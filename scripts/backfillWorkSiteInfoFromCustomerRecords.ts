/**
 * scripts/backfillWorkSiteInfoFromCustomerRecords.ts
 *
 * Backfill Work Site Info (WSI) records for sites that have Customer Records in Drive.
 *
 * Customer Records = Google Drive folder tree under GOOGLE_DRIVE_CUSTOMER_ROOT_ID.
 * Folder structure:
 *   <Org Name>/
 *     #NNNN - <address>/
 *
 * For each Drive site folder:
 *   1. Match to a DB Site (HIGH = fileNumber/buildingId, MEDIUM = address/name+org)
 *   2. HIGH/MEDIUM match + no existing WSI → create a WSI record
 *   3. HIGH/MEDIUM match + WSI exists → fill any blank fields only
 *   4. LOW confidence / unmatched → report only, never write
 *
 * Safety guarantees:
 *   - Never creates Sites
 *   - Never overwrites populated WSI fields
 *   - Never assigns fallback/default orgs
 *   - Only acts on high/medium-confidence site matches
 *   - Conflicts (existing value differs from computed value) are reported, not overwritten
 *
 * Usage (dry run — no DB writes):
 *   DATABASE_URL=mysql://... pnpm backfill:work-site-info:dry \
 *     --admin-user-id 1
 *
 * Usage (apply):
 *   DATABASE_URL=mysql://... pnpm backfill:work-site-info \
 *     --admin-user-id 1
 *
 * Optional flags:
 *   --company N          Company ID (default: 1)
 *   --customer-org N     Restrict to one customerOrg ID
 *   --limit N            Cap the number of Drive records processed
 *   --output-unmatched   Write unmatched records to data/exports/wsi-backfill-unmatched.json
 *   --output-conflicts   Write conflict rows to data/exports/wsi-backfill-conflicts.json
 *   --verbose            Print every record, not just changes
 *
 * Google Drive authentication (one required):
 *   --admin-user-id N    Use stored Google token for DB user N
 *   --access-token T     Paste an OAuth token from the app's DevTools
 *
 * Do NOT pass --default-org. customerOrgId must always be derived from the Drive folder name.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray } from "drizzle-orm";
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
type DbWsi = typeof schema.siteWorkSiteInfo.$inferSelect;

interface SiteMatch {
  site: DbSite;
  confidence: Confidence;
  matchedBy: string;
}

interface ConflictRow {
  driveRecordId: string;
  siteId: number;
  customerOrgId: number | null;
  matchConfidence: Confidence;
  fieldName: string;
  existingValue: string | null;
  computedValue: string | null;
  reason: string;
}

type ActionType =
  | "create"
  | "update"
  | "skip-exists"
  | "skip-no-org"
  | "skip-no-site"
  | "skip-low-confidence"
  | "dry-run-create"
  | "dry-run-update";

interface ProcessResult {
  record: DriveRecord;
  orgId?: number;
  orgName?: string;
  orgMatched: boolean;
  matchedSiteId?: number;
  confidence: Confidence | "none";
  action: ActionType;
  fieldsSet?: string[];
  conflicts: ConflictRow[];
}

interface SiteIndexes {
  byFileNumber: Map<string, DbSite>;
  byBuildingId: Map<string, DbSite>;
  byOrgName: Map<string, DbSite>;
}

interface CliArgs {
  companyId: number;
  apply: boolean;
  customerOrgId?: number;
  limit?: number;
  outputUnmatched: boolean;
  outputConflicts: boolean;
  verbose: boolean;
  adminUserId?: number;
  accessToken?: string;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    companyId: 1,
    apply: false,
    outputUnmatched: false,
    outputConflicts: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--apply":           args.apply = true; break;
      case "--company":         args.companyId = parseInt(argv[++i], 10); break;
      case "--customer-org":    args.customerOrgId = parseInt(argv[++i], 10); break;
      case "--limit":           args.limit = parseInt(argv[++i], 10); break;
      case "--output-unmatched": args.outputUnmatched = true; break;
      case "--output-conflicts": args.outputConflicts = true; break;
      case "--verbose":         args.verbose = true; break;
      case "--admin-user-id":   args.adminUserId = parseInt(argv[++i], 10); break;
      case "--access-token":    args.accessToken = argv[++i]; break;
      case "--default-org":
        console.error("ERROR: --default-org is not supported.");
        console.error("       customerOrgId must come from the Drive folder name matched to a real org row.");
        process.exit(1);
        break;
      default:
        if (argv[i].startsWith("--")) {
          console.error(`Unknown option: ${argv[i]}`);
          process.exit(1);
        }
    }
  }

  return args;
}

// ─── Drive API ────────────────────────────────────────────────────────────────

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

  if (args.apply) {
    await db
      .update(schema.users)
      .set({ googleAccessToken: tokenData.access_token, googleTokenExpiry: newExpiry })
      .where(eq(schema.users.id, userId));
  }

  console.log(`  Refreshed Google token for user ${userId}`);
  return tokenData.access_token;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseSiteFolder(name: string): { fileNumber: string; siteName: string } | null {
  const m = name.match(/^(#[\w-]+)\s*[-–—]+\s*(.+)$/);
  if (!m) return null;
  return { fileNumber: m[1].trim(), siteName: m[2].trim() };
}

// ─── Site indexes ─────────────────────────────────────────────────────────────

function buildSiteIndexes(sites: DbSite[]): SiteIndexes {
  const byFileNumber = new Map<string, DbSite>();
  const byBuildingId = new Map<string, DbSite>();
  const byOrgName = new Map<string, DbSite>();
  for (const s of sites) {
    if (s.fileNumber && !byFileNumber.has(normBldg(s.fileNumber))) {
      byFileNumber.set(normBldg(s.fileNumber), s);
    }
    if (s.buildingId && !byBuildingId.has(normBldg(s.buildingId))) {
      byBuildingId.set(normBldg(s.buildingId), s);
    }
    const nameKey = `${s.customerOrgId}::${normName(s.name)}`;
    if (!byOrgName.has(nameKey)) byOrgName.set(nameKey, s);
  }
  return { byFileNumber, byBuildingId, byOrgName };
}

// ─── Site matching ────────────────────────────────────────────────────────────

function matchSite(
  record: DriveRecord,
  orgId: number | undefined,
  allSites: DbSite[],
  indexes: SiteIndexes
): SiteMatch | null {
  const normFN = normBldg(record.fileNumber);

  const byFN = indexes.byFileNumber.get(normFN);
  if (byFN) return { site: byFN, confidence: "high", matchedBy: "fileNumber" };

  const byBI = indexes.byBuildingId.get(normFN);
  if (byBI) return { site: byBI, confidence: "high", matchedBy: "buildingId" };

  if (record.address) {
    const normAddr = normAddress(record.address);
    if (normAddr.length >= 8) {
      const prefix = normAddr.slice(0, 20);
      for (const s of allSites) {
        if (s.address && normAddress(s.address).startsWith(prefix)) {
          return { site: s, confidence: "medium", matchedBy: "address" };
        }
      }
    }
  }

  if (orgId !== undefined) {
    const nameKey = `${orgId}::${normName(record.siteName)}`;
    const byName = indexes.byOrgName.get(nameKey);
    if (byName) return { site: byName, confidence: "medium", matchedBy: "name+org" };
  }

  let bestOverlap = 0;
  let bestSite: DbSite | null = null;
  for (const s of allSites) {
    const score = tokenOverlap(normName(record.siteName), normName(s.name));
    if (score > bestOverlap) { bestOverlap = score; bestSite = s; }
  }
  if (bestOverlap >= 0.5 && bestSite) {
    return { site: bestSite, confidence: "low", matchedBy: `token-overlap(${bestOverlap.toFixed(2)})` };
  }

  return null;
}

// ─── WSI field patch ──────────────────────────────────────────────────────────

/**
 * Build a patch object containing only the fields that the Drive record provides
 * and that are currently blank/null in the existing WSI.
 *
 * Fields we CAN set from the folder hierarchy:
 *   - customerOrgId (from the matched org folder)
 *   - sourceWorkbookName (provenance marker)
 *
 * Fields we CANNOT set (not available from folder names):
 *   - All operational fields (access, panel, monitoring, notes, contacts)
 *
 * A ConflictRow is emitted when the existing value differs from what we would set.
 */
function buildWsiPatch(
  record: DriveRecord,
  orgId: number | undefined,
  existing: DbWsi | undefined,
  confidence: Confidence,
  siteId: number,
): {
  patch: Partial<typeof schema.siteWorkSiteInfo.$inferInsert>;
  conflicts: ConflictRow[];
} {
  const patch: Partial<typeof schema.siteWorkSiteInfo.$inferInsert> = {};
  const conflicts: ConflictRow[] = [];

  function trySet<K extends keyof typeof schema.siteWorkSiteInfo.$inferInsert>(
    field: K,
    computed: (typeof schema.siteWorkSiteInfo.$inferInsert)[K] | null | undefined
  ) {
    if (computed == null) return;
    const existing_val = existing?.[field as keyof DbWsi];
    if (existing_val == null || existing_val === "") {
      patch[field] = computed;
    } else if (String(existing_val) !== String(computed)) {
      conflicts.push({
        driveRecordId: record.siteFolderId,
        siteId,
        customerOrgId: orgId ?? null,
        matchConfidence: confidence,
        fieldName: field as string,
        existingValue: String(existing_val),
        computedValue: String(computed),
        reason: `Existing WSI ${field as string} differs from Customer Records value`,
      });
    }
  }

  if (orgId !== undefined) trySet("customerOrgId", orgId);
  trySet("sourceWorkbookName", "Customer Records (Google Drive)");

  return { patch, conflicts };
}

// ─── Output helpers ───────────────────────────────────────────────────────────

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
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const rootId = process.env.GOOGLE_DRIVE_CUSTOMER_ROOT_ID;
  if (!rootId) {
    console.error("ERROR: GOOGLE_DRIVE_CUSTOMER_ROOT_ID is not set.");
    console.error("       Set this to the root Google Drive folder ID for Customer Records.");
    process.exit(1);
  }

  if (!args.adminUserId && !args.accessToken) {
    console.error("ERROR: Google Drive authentication required.");
    console.error("  --admin-user-id N   Use stored Google token for DB user N");
    console.error("  --access-token T    Paste an OAuth token from the app's DevTools");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Customer Records → Work Site Info Backfill`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company      : ${args.companyId}`);
  console.log(`  mode         : ${args.apply ? "APPLY (live writes)" : "DRY RUN (no DB changes)"}`);
  if (args.customerOrgId !== undefined) console.log(`  customer-org : ${args.customerOrgId}`);
  if (args.limit !== undefined) console.log(`  limit        : ${args.limit}`);
  console.log();

  // ── Connect ─────────────────────────────────────────────────────────────────
  const db = drizzle(dbUrl, { schema, mode: "default" });

  // ── Google token ────────────────────────────────────────────────────────────
  console.log("Resolving Google access token...");
  const token = await resolveToken(args, db);
  console.log("  Token OK\n");

  // ── Load DB snapshot ────────────────────────────────────────────────────────
  console.log("Loading database snapshot...");
  let allOrgs: DbOrg[] = await db
    .select()
    .from(schema.customerOrgs)
    .where(eq(schema.customerOrgs.companyId, args.companyId));

  let allSites: DbSite[] = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.companyId, args.companyId));

  if (args.customerOrgId !== undefined) {
    allOrgs = allOrgs.filter((o) => o.id === args.customerOrgId);
    if (allOrgs.length === 0) {
      console.error(`ERROR: No customerOrg id=${args.customerOrgId} for company ${args.companyId}`);
      process.exit(1);
    }
  }

  // Load all existing WSI records keyed by siteId
  const allSiteIds = allSites.map((s) => s.id);
  const existingWsiRows: DbWsi[] = allSiteIds.length
    ? await db
        .select()
        .from(schema.siteWorkSiteInfo)
        .where(
          and(
            eq(schema.siteWorkSiteInfo.companyId, args.companyId),
            inArray(schema.siteWorkSiteInfo.siteId, allSiteIds)
          )
        )
    : [];

  const wsiByeSiteId = new Map<number, DbWsi>();
  for (const w of existingWsiRows) wsiByeSiteId.set(w.siteId, w);

  console.log(
    `  ${allOrgs.length} orgs, ${allSites.length} sites, ${existingWsiRows.length} existing WSI records\n`
  );

  const orgByNorm = new Map<string, DbOrg>();
  for (const org of allOrgs) orgByNorm.set(normName(org.name), org);

  // ── Walk Drive tree ─────────────────────────────────────────────────────────
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
      const matchedOrg = orgByNorm.get(normFolder)
        ?? [...orgByNorm.values()].find((o) => {
          const on = normName(o.name);
          return on.includes(normFolder) || normFolder.includes(on);
        });
      if (!matchedOrg || matchedOrg.id !== args.customerOrgId) continue;
    }

    const normFolder = normName(orgFolder.name);
    let matchedOrg: DbOrg | undefined = orgByNorm.get(normFolder);
    if (!matchedOrg) {
      matchedOrg = [...orgByNorm.values()].find((o) => {
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
  console.log(`Drive records to process: ${records.length} of ${allDriveRecords.length} found\n`);

  // ── Process ──────────────────────────────────────────────────────────────────
  const results: ProcessResult[] = [];
  const allConflicts: ConflictRow[] = [];
  let created = 0, updated = 0, skipped = 0, skippedNoOrg = 0, skippedNoSite = 0;
  let highConf = 0, medConf = 0, lowConf = 0;

  const siteIndexes = buildSiteIndexes(allSites);

  for (const record of records) {
    const orgId = orgFolderToOrgId.get(record.orgFolderId);
    const orgName = orgId !== undefined
      ? allOrgs.find((o) => o.id === orgId)?.name
      : undefined;

    if (orgId === undefined) {
      results.push({
        record, orgMatched: false, confidence: "none",
        action: "skip-no-org", conflicts: [],
      });
      skippedNoOrg++;
      continue;
    }

    const match = matchSite(record, orgId, allSites, siteIndexes);
    const confidence: Confidence | "none" = match?.confidence ?? "none";

    if (match?.confidence === "high") highConf++;
    else if (match?.confidence === "medium") medConf++;
    else if (match?.confidence === "low") lowConf++;

    if (match?.confidence === "low") {
      results.push({
        record, orgId, orgName, orgMatched: true,
        matchedSiteId: match.site.id, confidence: "low",
        action: "skip-low-confidence", conflicts: [],
      });
      skipped++;
      continue;
    }

    if (!match) {
      results.push({
        record, orgId, orgName, orgMatched: true,
        confidence: "none", action: "skip-no-site", conflicts: [],
      });
      skippedNoSite++;
      continue;
    }

    // HIGH or MEDIUM match
    const site = match.site;
    const existing = wsiByeSiteId.get(site.id);
    const { patch, conflicts } = buildWsiPatch(record, orgId, existing, match.confidence, site.id);
    allConflicts.push(...conflicts);

    if (args.verbose) {
      console.log(
        `  [${match.confidence.toUpperCase()}] siteId=${site.id}  ${record.fileNumber}  ` +
        `${existing ? "WSI exists" : "NO WSI"}  patch=${JSON.stringify(patch)}`
      );
    }

    if (!existing) {
      // Create a new WSI record
      const action: ActionType = args.apply ? "create" : "dry-run-create";

      if (args.apply) {
        await db.insert(schema.siteWorkSiteInfo).values({
          companyId: args.companyId,
          siteId: site.id,
          customerOrgId: orgId,
          sourceWorkbookName: "Customer Records (Google Drive)",
          ...patch,
        });
        // Cache so duplicate Drive records for the same site don't try to insert again
        wsiByeSiteId.set(site.id, {
          id: 0, // placeholder; we don't need the real id in this cache
          companyId: args.companyId,
          siteId: site.id,
          customerOrgId: orgId,
          sourceWorkbookName: "Customer Records (Google Drive)",
          siteContactName: null, siteContactPhone: null, siteContactEmail: null,
          propertyManagerName: null, propertyManagerPhone: null, propertyManagerEmail: null,
          accessNotes: null, keyLocation: null, keyNumber: null, lockboxCode: null,
          parkingNotes: null, serviceEntranceNotes: null,
          fireAlarmPanelMake: null, fireAlarmPanelModel: null,
          fireAlarmPanelLocation: null, annunciatorLocation: null,
          monitoringCompany: null, monitoringPhone: null, monitoringAccount: null,
          sprinklerNotes: null, backflowNotes: null,
          emergencyLightingNotes: null, fireExtinguisherNotes: null,
          generalNotes: null,
          lastImportedFromWorkbook: null, sourceSheetName: null, sourceUpdatedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        });
        created++;
      } else {
        created++; // count planned creates in dry-run too
      }

      results.push({
        record, orgId, orgName, orgMatched: true,
        matchedSiteId: site.id, confidence: match.confidence,
        action, fieldsSet: ["companyId", "siteId", "customerOrgId", "sourceWorkbookName"],
        conflicts,
      });

    } else if (Object.keys(patch).length > 0) {
      // Update existing WSI — blank fields only
      const action: ActionType = args.apply ? "update" : "dry-run-update";

      if (args.apply) {
        await db
          .update(schema.siteWorkSiteInfo)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(schema.siteWorkSiteInfo.siteId, site.id));
        updated++;
      } else {
        updated++;
      }

      results.push({
        record, orgId, orgName, orgMatched: true,
        matchedSiteId: site.id, confidence: match.confidence,
        action, fieldsSet: Object.keys(patch),
        conflicts,
      });

    } else {
      // WSI exists and nothing new to fill
      skipped++;
      results.push({
        record, orgId, orgName, orgMatched: true,
        matchedSiteId: site.id, confidence: match.confidence,
        action: "skip-exists", conflicts,
      });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log("  SUMMARY");
  console.log(line);
  console.log(`  ${pad("Drive org folders found:", 42)} ${orgFolders.length}`);
  console.log(`  ${pad("Org folders matched to DB customerOrg:", 42)} ${orgFolders.length - unmatchedOrgFolders.length}`);
  console.log(`  ${pad("Org folders unmatched:", 42)} ${unmatchedOrgFolders.length}`);
  console.log(`  ${pad("Total site folders found:", 42)} ${allDriveRecords.length}`);
  console.log(`  ${pad("Folders without #NNNN pattern:", 42)} ${unparsedFolders.length}`);
  console.log(`  ${pad("Records processed:", 42)} ${records.length}`);
  console.log();
  console.log(`  ${pad("HIGH confidence matches:", 42)} ${highConf}`);
  console.log(`  ${pad("MEDIUM confidence matches:", 42)} ${medConf}`);
  console.log(`  ${pad("LOW confidence (review only):", 42)} ${lowConf}`);
  console.log();

  const createLabel = args.apply ? "WSI records created:" : "Would create (dry-run):";
  const updateLabel = args.apply ? "WSI records updated (blank fields):" : "Would update (dry-run):";
  console.log(`  ${pad(createLabel, 42)} ${created}`);
  console.log(`  ${pad(updateLabel, 42)} ${updated}`);
  console.log(`  ${pad("Skipped (WSI already complete):", 42)} ${skipped}`);
  console.log(`  ${pad("Skipped (no site match):", 42)} ${skippedNoSite}`);
  console.log(`  ${pad("Skipped (org not matched):", 42)} ${skippedNoOrg}`);
  console.log(`  ${pad("Conflicts (not overwritten):", 42)} ${allConflicts.length}`);

  // ── Detail sections ──────────────────────────────────────────────────────────

  if (unmatchedOrgFolders.length > 0) {
    console.log(`\n${line}`);
    console.log(`  UNMATCHED ORG FOLDERS (${unmatchedOrgFolders.length})`);
    console.log(`  These Drive folders have no matching customerOrg in the DB.`);
    console.log(line);
    unmatchedOrgFolders.forEach((n) => console.log(`  • ${n}`));
  }

  if (unparsedFolders.length > 0) {
    console.log(`\n${line}`);
    console.log(`  FOLDERS WITHOUT #NNNN PATTERN (${unparsedFolders.length})`);
    console.log(line);
    unparsedFolders.forEach((f) =>
      console.log(`  org="${f.orgFolder}"  folder="${f.siteName}"`)
    );
  }

  const creates = results.filter((r) => r.action === "create" || r.action === "dry-run-create");
  if (creates.length > 0) {
    const label = args.apply ? "WSI RECORDS CREATED" : "WOULD CREATE (DRY RUN)";
    console.log(`\n${line}`);
    console.log(`  ${label} (${creates.length})`);
    console.log(line);
    for (const r of creates) {
      console.log(
        `  ${pad(r.record.fileNumber, 12)} [${r.confidence}] siteId=${r.matchedSiteId}  ` +
        `org="${r.orgName}"  "${r.record.siteName}"`
      );
    }
  }

  const updates = results.filter((r) => r.action === "update" || r.action === "dry-run-update");
  if (updates.length > 0) {
    const label = args.apply ? "WSI RECORDS UPDATED" : "WOULD UPDATE (DRY RUN)";
    console.log(`\n${line}`);
    console.log(`  ${label} (blank fields filled) (${updates.length})`);
    console.log(line);
    for (const r of updates) {
      console.log(
        `  siteId=${r.matchedSiteId}  ${r.record.fileNumber}  fields: ${r.fieldsSet?.join(", ")}`
      );
    }
  }

  const lowConfs = results.filter((r) => r.action === "skip-low-confidence");
  if (lowConfs.length > 0) {
    console.log(`\n${line}`);
    console.log(`  LOW CONFIDENCE — MANUAL REVIEW REQUIRED (${lowConfs.length})`);
    console.log(`  These site folders are similar to existing sites but not certain enough.`);
    console.log(`  No WSI records were created. Review and fix fileNumbers or org mapping.`);
    console.log(line);
    for (const r of lowConfs) {
      console.log(`  ${pad(r.record.fileNumber, 12)} "${r.record.siteName}"  → siteId=${r.matchedSiteId}`);
    }
  }

  if (allConflicts.length > 0) {
    console.log(`\n${line}`);
    console.log(`  CONFLICTS — NOT OVERWRITTEN (${allConflicts.length})`);
    console.log(`  Existing WSI values differ from what the script would set.`);
    console.log(`  These were NOT changed. Review manually.`);
    console.log(line);
    for (const c of allConflicts) {
      console.log(`  siteId=${c.siteId}  [${c.matchConfidence}]  field="${c.fieldName}"`);
      console.log(`    existing : ${c.existingValue}`);
      console.log(`    computed : ${c.computedValue}`);
    }
  }

  const unmatched = results.filter((r) => r.action === "skip-no-site" || r.action === "skip-no-org");
  if (unmatched.length > 0 && args.verbose) {
    console.log(`\n${line}`);
    console.log(`  UNMATCHED DRIVE RECORDS (${unmatched.length})`);
    console.log(`  No DB site found for these Customer Record folders.`);
    console.log(line);
    for (const r of unmatched) {
      const reason = r.action === "skip-no-org" ? "org not matched" : "no site match";
      console.log(`  ${pad(r.record.fileNumber, 12)} "${r.record.siteName}"  (${reason})`);
    }
  }

  // ── Write output files ───────────────────────────────────────────────────────

  if (args.outputUnmatched) {
    ensureExportsDir();
    const path = "data/exports/wsi-backfill-unmatched.json";
    const out = unmatched.map((r) => ({
      orgFolderName: r.record.orgFolderName,
      siteFolderName: r.record.siteFolderName,
      fileNumber: r.record.fileNumber,
      siteName: r.record.siteName,
      customerOrgId: r.orgId ?? null,
      skipReason: r.action,
    }));
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log(`\n  Written: ${path}`);
  }

  if (args.outputConflicts && allConflicts.length > 0) {
    ensureExportsDir();
    const path = "data/exports/wsi-backfill-conflicts.json";
    writeFileSync(path, JSON.stringify(allConflicts, null, 2));
    console.log(`  Written: ${path}`);
  }

  // ── Final message ────────────────────────────────────────────────────────────
  console.log();
  if (!args.apply) {
    console.log("DRY RUN complete — no changes were written to the database.");
    console.log("Review the output above, then re-run with --apply to apply.");
  } else if (created + updated > 0) {
    console.log(`Done. ${created} WSI records created, ${updated} updated.`);
    if (allConflicts.length > 0)
      console.log(`${allConflicts.length} conflict(s) were NOT overwritten — review manually.`);
  } else {
    console.log("Done. No changes needed.");
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
