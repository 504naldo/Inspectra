/**
 * scripts/seedSitesFromCustomerRecords.ts
 *
 * Seed and reconcile Sites from Customer Records (Google Drive folder tree).
 *
 * Customer Records = the Google Drive folder tree under GOOGLE_DRIVE_CUSTOMER_ROOT_ID
 * (or --root-id). Two supported layouts:
 *
 *   NESTED (default):                 FLAT (--flat):
 *     <Customer Org Name>/              #0001 - 230 West 10th Ave/
 *       #0007 - 1407 E. Georgia St/     #0007 - 1407 E. Georgia Street/
 *       #0012 - 123 Main St, …/         #0012 - 123 Main St, …/
 *
 * In --flat mode the root is a single flat list of `#NNNN - <address>` building
 * folders (no org layer). Each top-level folder IS a site; matched sites keep
 * their existing customer org, and unmatched folders are reported (never created
 * under a guessed org). Flat matching also recovers sites whose `#NNNN` code was
 * imported into the NAME with a wrong fileNumber field (via byNameFileNumber).
 *
 * Workflow:
 *   Drive org folder → match customerOrg in DB by normalized name  (nested only)
 *   Drive site folder → parse fileNumber + siteName
 *   Match to existing Site by buildingId > fileNumber > name-embedded #NNNN > address > name
 *   Detect mismatches, plan creates/updates, apply or report in dry-run
 *
 * Matching confidence:
 *   HIGH   — normBldg(fileNumber) matches site.fileNumber or site.buildingId
 *   MEDIUM — normAddress prefix match OR normName match within same org
 *   LOW    — token overlap ≥ 0.5 (reported for manual review only, never acted on)
 *
 * Safe update rules:
 *   - Default: fill blank/null Site fields only
 *   - --update-existing: same (no overwrite of populated conflicting fields)
 *   - --clean-names: the ONE intentional overwrite — replace a JUNK site name
 *       (summary-sheet-filename fingerprint: "Summary Sheet"/"SUMMARY"/"ver9.x"/
 *       leading "#NNNN -"/"string or null") with the clean Drive folder header,
 *       HIGH-confidence matches only. Real business names never match. Always
 *       preview under --dry-run (prints every before → after) before applying.
 *   - --fix-suspects: an EXPLICIT, human-verified `siteId=#NNNN` map that
 *       re-points a mislabeled site at the correct Drive folder. The --clean-*
 *       passes skip sites whose name #NNNN points at a different building (the
 *       code is wrong at the source and can't be auto-corrected); this applies
 *       the folder header for the code the operator supplies, bypassing the
 *       sharesBuildingNumber guard on purpose. Always preview under --dry-run.
 *   - Mismatches between Drive and populated Site fields are always reported
 *
 * Usage:
 *   # Dry-run
 *   pnpm seed:sites-from-customer-records:dry -- \
 *     --company 1 --reconcile-existing --output-mismatches
 *
 *   # Live seed + reconcile
 *   pnpm seed:sites-from-customer-records -- \
 *     --company 1 --update-existing --reconcile-existing --output-mismatches
 *
 *   # Fix mislabeled "suspect" sites from a verified map (preview first!)
 *   pnpm seed:sites-from-customer-records:dry -- \
 *     --company 1 --flat --fix-suspects "475=#0148,571=#0479" --dry-run
 *   #   …or from a file: --fix-suspects-file data/suspect-fixes.json
 *   #   ({ "475": "#0148", "571": "#0479" })
 *
 * Authentication (Google Drive):
 *   --admin-user-id N   Use stored Google token for DB user N
 *   --access-token T    Use an OAuth token obtained manually
 *
 * Do NOT pass --default-org. customerOrgId must always be derived from the
 * Drive org folder name matched to a real customerOrgs row in the DB.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";
import { normName, normBldg, normAddress, parseAddressComponents, tokenOverlap } from "../lib/import/normalize.js";

config();

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = "high" | "medium" | "low";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveCustomerRecord {
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
  customerRecordId: string;
  siteId?: number;
  customerOrgId?: number;
  matchConfidence: Confidence | "none";
  fieldName: string;
  siteValue: string | null;
  customerRecordValue: string | null;
  recommendedAction: string;
  reason: string;
}

type ActionType =
  | "create"
  | "update"
  | "skip-exists"
  | "skip-no-org"
  | "skip-no-name"
  | "skip-low-confidence"
  | "mismatch-only"
  | "dry-run-create"
  | "dry-run-update";

interface ProcessResult {
  record: DriveCustomerRecord;
  orgId?: number;
  orgName?: string;
  orgMatched: boolean;
  matchedSiteId?: number;
  confidence: Confidence | "none";
  action: ActionType;
  fieldsSet?: string[];
  mismatches: MismatchRow[];
}

interface CliArgs {
  companyId: number;
  dryRun: boolean;
  updateExisting: boolean;
  reconcileExisting: boolean;
  limit?: number;
  customerOrgId?: number;
  outputUnmatched: boolean;
  outputMismatches: boolean;
  adminUserId?: number;
  accessToken?: string;
  rootId?: string;
  flat: boolean;
  cleanNames: boolean;
  cleanFields: boolean;
  /** Explicit, human-verified `siteId → #NNNN` overrides for mislabeled sites. */
  fixSuspects: Record<number, string>;
  orgMap: Record<string, string>;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    companyId: 1,
    dryRun: false,
    updateExisting: false,
    reconcileExisting: false,
    outputUnmatched: false,
    outputMismatches: false,
    flat: false,
    cleanNames: false,
    cleanFields: false,
    fixSuspects: {},
    orgMap: {},
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company":         args.companyId = parseInt(argv[++i], 10); break;
      case "--dry-run":         args.dryRun = true; break;
      case "--update-existing": args.updateExisting = true; break;
      case "--reconcile-existing": args.reconcileExisting = true; break;
      case "--limit":           args.limit = parseInt(argv[++i], 10); break;
      case "--customer-org":    args.customerOrgId = parseInt(argv[++i], 10); break;
      case "--output-unmatched": args.outputUnmatched = true; break;
      case "--output-mismatches": args.outputMismatches = true; break;
      case "--admin-user-id":   args.adminUserId = parseInt(argv[++i], 10); break;
      case "--access-token":    args.accessToken = argv[++i]; break;
      case "--root-id":         args.rootId = argv[++i]; break;
      case "--flat":            args.flat = true; break;
      case "--clean-names":     args.cleanNames = true; break;
      case "--clean-fields":    args.cleanFields = true; break;
      case "--fix-suspects": {
        // Inline map: "475=#0148,571=#0479 610=#0575" (comma and/or whitespace).
        const raw = argv[++i];
        for (const entry of (raw ?? "").split(/[,\s]+/).filter(Boolean)) {
          const eqIdx = entry.indexOf("=");
          if (eqIdx < 1) {
            console.error(`--fix-suspects entries must be "siteId=#NNNN", got: ${entry}`);
            process.exit(1);
          }
          const id = parseInt(entry.slice(0, eqIdx), 10);
          const code = entry.slice(eqIdx + 1).trim();
          if (!Number.isInteger(id) || !code) {
            console.error(`--fix-suspects entry has a bad siteId or code: ${entry}`);
            process.exit(1);
          }
          args.fixSuspects[id] = code;
        }
        break;
      }
      case "--fix-suspects-file": {
        const filePath = argv[++i];
        try {
          const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
          for (const [k, v] of Object.entries(raw)) {
            const id = parseInt(k, 10);
            if (Number.isInteger(id) && v) args.fixSuspects[id] = String(v).trim();
          }
        } catch (e) {
          console.error(`Failed to read --fix-suspects-file "${filePath}": ${e}`);
          process.exit(1);
        }
        break;
      }
      case "--org-map": {
        const raw = argv[++i];
        const eqIdx = raw.indexOf("=");
        if (eqIdx < 1) {
          console.error(`--org-map must be "Drive Folder Name=DB Org Name", got: ${raw}`);
          process.exit(1);
        }
        args.orgMap[normName(raw.slice(0, eqIdx))] = raw.slice(eqIdx + 1).trim();
        break;
      }
      case "--org-map-file": {
        const filePath = argv[++i];
        try {
          const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
          for (const [k, v] of Object.entries(raw)) args.orgMap[normName(k)] = v;
        } catch (e) {
          console.error(`Failed to read --org-map-file "${filePath}": ${e}`);
          process.exit(1);
        }
        break;
      }
      case "--default-org":
        console.error("ERROR: --default-org is not supported. customerOrgId must be derived from the");
        console.error("       Drive folder name matched to a real customerOrgs row. See the audit doc.");
        process.exit(1);
      default:
        // A bare "--" is the argument separator that npm/pnpm inject between the
        // script name and its flags (e.g. `pnpm seed:… -- --company 1`). It is not
        // an option — skip it rather than erroring "Unknown option: --".
        if (argv[i] === "--") break;
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

  if (!args.dryRun) {
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
  // Handles: "#0007 - Name", "#0330-1 - Name", "#007 — Name" (em dash)
  const m = name.match(/^(#[\w-]+)\s*[-–—]+\s*(.+)$/);
  if (!m) return null;
  return { fileNumber: m[1].trim(), siteName: m[2].trim() };
}

// ─── Site indexes ─────────────────────────────────────────────────────────────

interface SiteIndexes {
  byFileNumber: Map<string, DbSite>;
  byBuildingId: Map<string, DbSite>;
  /** Existing sites keyed by a `#NNNN` code found *inside their name* (normBldg). */
  byNameFileNumber: Map<string, DbSite>;
  /** Existing sites keyed by their fully-normalized NAME (identity match). Used
   *  as a flat-mode fallback once names have already been cleaned to the folder
   *  header and no longer carry a `#NNNN` to match on. */
  byExactName: Map<string, DbSite>;
  /** key: `${orgId}::${normName(site.name)}` */
  byOrgName: Map<string, DbSite>;
}

/**
 * Pull a `#NNNN` (optionally `#NNNN-N`) code out of a free-text string. Older
 * imports dumped the building code into the site NAME (e.g. "#0538 - 1130 Jervis
 * St - Summary Sheet") while leaving the fileNumber field wrong, so flat-mode
 * matching needs to recover it from the name.
 */
export function extractFileNumberFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/#\s*\d{1,5}(?:-\d+)?/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

/**
 * Precise file-code key that keeps sub-numbers distinct. normBldg() strips the
 * dash and leading zeros, so "#0070-1" and "#0701" both collapse to "701" — a
 * collision that mis-matches sub-numbered files (#NNNN-N) to a different
 * building. This preserves the dash: "#0070-1" → "70-1", "#0701" → "701".
 */
export function normFileCode(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/^\s*#\s*/, "")
    .trim()
    .toLowerCase()
    .split("-")
    .map((part) => {
      const a = part.replace(/[^a-z0-9]+/g, "");
      return /^\d+$/.test(a) ? String(parseInt(a, 10)) : a;
    })
    .filter((p) => p !== "")
    .join("-");
}

/**
 * True when a site NAME is import junk rather than a real name — i.e. it carries
 * a summary-sheet-filename fingerprint that a genuine name ("P.S. MOTORS LTD")
 * never has. Used by --clean-names to decide which names are safe to overwrite
 * from the Drive folder header. Conservative on purpose: business names must NOT
 * match. Every replacement is still shown in a dry-run for review before writes.
 */
export function isJunkSiteName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes("summary") ||                 // "… - Summary Sheet", "- SUMMARY -"
    /\bver\s?\d/.test(n) ||                   // "ver9.1", "ver 8"
    n.includes("string or null") ||          // leaked AI-extraction placeholder
    /^#\s*\d{2,5}(?:-\d+)?\s*-/.test(name.trim()) // leads with a "#NNNN -" file code
  );
}

/**
 * Safety net for --clean-names: do the OLD name and the NEW folder header refer
 * to the same building? Some site names carry the WRONG file code (mislabeled at
 * the source), so their `#NNNN` matches a folder for a different address. We can't
 * detect a bad code, but we CAN refuse to rename to a clearly different building:
 * require that the two strings share a ≥3-digit street number (the most reliable
 * address token). "2374 W 5th Ave" vs "8580 Cumberland Pl" share none → refuse.
 */
export function sharesBuildingNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  // Strip "#NNNN"/"#NNNN-N" file codes first so a code can't masquerade as a
  // street number, then collect the remaining ≥3-digit numbers.
  const nums = (s: string | null | undefined) =>
    new Set((s ?? "").replace(/#\s*\d+(?:-\d+)?/g, " ").match(/\d{3,}/g) ?? []);
  const A = nums(a);
  if (A.size === 0) return true; // no street number to compare — don't block on this signal
  for (const n of nums(b)) if (A.has(n)) return true;
  return false;
}

export function buildSiteIndexes(sites: DbSite[]): SiteIndexes {
  const byFileNumber = new Map<string, DbSite>();
  const byBuildingId = new Map<string, DbSite>();
  const byNameFileNumber = new Map<string, DbSite>();
  const byExactName = new Map<string, DbSite>();
  const byOrgName = new Map<string, DbSite>();
  // Names that are NOT unique across the DB can't safely identity-match; drop
  // them from byExactName so an ambiguous name never matches a folder.
  const nameCounts = new Map<string, number>();
  for (const s of sites) {
    const nn = normName(s.name);
    if (nn) nameCounts.set(nn, (nameCounts.get(nn) ?? 0) + 1);
  }
  for (const s of sites) {
    if (s.fileNumber && !byFileNumber.has(normBldg(s.fileNumber))) {
      byFileNumber.set(normBldg(s.fileNumber), s);
    }
    if (s.buildingId && !byBuildingId.has(normBldg(s.buildingId))) {
      byBuildingId.set(normBldg(s.buildingId), s);
    }
    const nameCode = extractFileNumberFromText(s.name);
    if (nameCode && !byNameFileNumber.has(normFileCode(nameCode))) {
      byNameFileNumber.set(normFileCode(nameCode), s);
    }
    const nn = normName(s.name);
    if (nn && nameCounts.get(nn) === 1) byExactName.set(nn, s);
    const nameKey = `${s.customerOrgId}::${normName(s.name)}`;
    if (!byOrgName.has(nameKey)) byOrgName.set(nameKey, s);
  }
  return { byFileNumber, byBuildingId, byNameFileNumber, byExactName, byOrgName };
}

// ─── Site matching ────────────────────────────────────────────────────────────

export function matchSite(
  record: DriveCustomerRecord,
  orgId: number | undefined,
  allSites: DbSite[],
  indexes: SiteIndexes,
  flatMode = false
): SiteMatch | null {
  const normFN = normBldg(record.fileNumber);

  // FLAT-MODE MATCHING: in a flat Customer Records tree the site fileNumber /
  // buildingId FIELDS and the address are frequently corrupt — they point at a
  // *different* building than the site's own name (a summary-sheet import left
  // the correct `#NNNN` only in the NAME). Matching on those fields produces
  // confident-but-wrong matches, so flat mode trusts the name-embedded `#NNNN`
  // ALONE. No match is safe (site is left untouched); a wrong match renames a
  // site to another building's address, which is not.
  if (flatMode) {
    const byNameFN = indexes.byNameFileNumber.get(normFileCode(record.fileNumber));
    if (byNameFN) return { site: byNameFN, confidence: "high", matchedBy: "name-fileNumber" };
    // Fallback: once names have been cleaned to the folder header they no longer
    // carry a `#NNNN`, so match on the folder header == the (unique) site name.
    const byName = indexes.byExactName.get(normName(record.siteName));
    if (byName) return { site: byName, confidence: "high", matchedBy: "exact-name" };
    return null;
  }

  // HIGH: exact fileNumber match (O(1))
  const byFN = indexes.byFileNumber.get(normFN);
  if (byFN) return { site: byFN, confidence: "high", matchedBy: "fileNumber" };

  // HIGH: exact buildingId match (O(1))
  const byBI = indexes.byBuildingId.get(normFN);
  if (byBI) return { site: byBI, confidence: "high", matchedBy: "buildingId" };

  // HIGH: the Drive `#NNNN` appears inside an existing site's NAME (O(1)).
  const byNameFN = indexes.byNameFileNumber.get(normFileCode(record.fileNumber));
  if (byNameFN) return { site: byNameFN, confidence: "high", matchedBy: "name-fileNumber" };

  // MEDIUM: normalized address prefix match (linear — no practical index for prefix queries)
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

  // MEDIUM: normalized name + org match (O(1))
  if (orgId !== undefined) {
    const nameKey = `${orgId}::${normName(record.siteName)}`;
    const byName = indexes.byOrgName.get(nameKey);
    if (byName) return { site: byName, confidence: "medium", matchedBy: "name+org" };
  }

  // LOW: token overlap ≥ 0.5 (report only, never act on)
  const normSiteName = normName(record.siteName);
  let bestOverlap = 0;
  let bestSite: DbSite | null = null;
  for (const s of allSites) {
    const score = tokenOverlap(normSiteName, normName(s.name));
    if (score > bestOverlap) { bestOverlap = score; bestSite = s; }
  }
  if (bestOverlap >= 0.5 && bestSite) {
    return { site: bestSite, confidence: "low", matchedBy: `token-overlap(${bestOverlap.toFixed(2)})` };
  }

  return null;
}

// ─── Mismatch detection ───────────────────────────────────────────────────────

function detectMismatches(
  record: DriveCustomerRecord,
  orgId: number | undefined,
  site: DbSite,
  confidence: Confidence
): MismatchRow[] {
  const rows: MismatchRow[] = [];

  function check(fieldName: string, siteVal: string | null | undefined, crVal: string | null | undefined) {
    const sv = siteVal?.trim() || null;
    const cv = crVal?.trim() || null;
    if (!sv || !cv) return; // one side blank — not a mismatch, just a gap
    const normSv = normName(sv);
    const normCv = normName(cv);
    if (normSv === normCv) return; // match after normalization
    rows.push({
      customerRecordId: record.siteFolderId,
      siteId: site.id,
      customerOrgId: orgId,
      matchConfidence: confidence,
      fieldName,
      siteValue: sv,
      customerRecordValue: cv,
      recommendedAction: "manual-review",
      reason: `Site ${fieldName} differs from Customer Record value`,
    });
  }

  // customerOrgId
  if (orgId !== undefined && site.customerOrgId !== orgId) {
    rows.push({
      customerRecordId: record.siteFolderId,
      siteId: site.id,
      customerOrgId: orgId,
      matchConfidence: confidence,
      fieldName: "customerOrgId",
      siteValue: String(site.customerOrgId),
      customerRecordValue: String(orgId),
      recommendedAction: "manual-review",
      reason: "Site customerOrgId differs from Drive org folder match",
    });
  }

  // fileNumber
  if (record.fileNumber && site.fileNumber) {
    if (normBldg(site.fileNumber) !== normBldg(record.fileNumber)) {
      rows.push({
        customerRecordId: record.siteFolderId,
        siteId: site.id,
        customerOrgId: orgId,
        matchConfidence: confidence,
        fieldName: "fileNumber",
        siteValue: site.fileNumber,
        customerRecordValue: record.fileNumber,
        recommendedAction: "manual-review",
        reason: "Site fileNumber differs from Drive folder file number",
      });
    }
  }

  // buildingId vs fileNumber
  if (record.fileNumber && site.buildingId && site.fileNumber !== record.fileNumber) {
    if (normBldg(site.buildingId) !== normBldg(record.fileNumber)) {
      rows.push({
        customerRecordId: record.siteFolderId,
        siteId: site.id,
        customerOrgId: orgId,
        matchConfidence: confidence,
        fieldName: "buildingId",
        siteValue: site.buildingId,
        customerRecordValue: record.fileNumber,
        recommendedAction: "manual-review",
        reason: "Site buildingId differs from Drive folder file number",
      });
    }
  }

  // name
  check("name", site.name, record.siteName);

  // address
  if (record.address) check("address", site.address, record.address);

  // city
  if (record.city) check("city", site.city, record.city);

  return rows;
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

  // Validate DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL is not set in .env");
    process.exit(1);
  }
  if (!dbUrl.startsWith("mysql://") && !dbUrl.startsWith("mysql2://")) {
    console.error("ERROR: DATABASE_URL must be a mysql:// or mysql2:// connection string");
    process.exit(1);
  }

  // The --root-id flag overrides the env var, so the Drive folder can be passed
  // inline (handy in the Railway console) without editing service variables.
  const rootId = args.rootId ?? process.env.GOOGLE_DRIVE_CUSTOMER_ROOT_ID;
  if (!rootId) {
    console.error("ERROR: no Customer Records Drive folder specified.");
    console.error("       Pass --root-id <folderId> or set GOOGLE_DRIVE_CUSTOMER_ROOT_ID.");
    console.error("       This is the root Drive folder ID containing the customer org folders.");
    process.exit(1);
  }

  if (!args.adminUserId && !args.accessToken) {
    console.error("ERROR: Google Drive authentication required.");
    console.error("  --admin-user-id N   Use stored Google token for DB user N");
    console.error("  --access-token T    Paste an OAuth token from the app's DevTools");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Customer Records → Site Seed + Reconcile`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company      : ${args.companyId}`);
  console.log(`  dry-run      : ${args.dryRun}`);
  console.log(`  update-existing : ${args.updateExisting}`);
  console.log(`  reconcile-existing : ${args.reconcileExisting}`);
  if (args.customerOrgId) console.log(`  customer-org : ${args.customerOrgId}`);
  if (args.limit) console.log(`  limit        : ${args.limit}`);
  console.log();

  if (args.dryRun) console.log("  DRY RUN — no DB writes\n");

  // ── DB connection ───────────────────────────────────────────────────────────
  const db = drizzle(dbUrl, { schema, mode: "default" });

  // ── Google token ────────────────────────────────────────────────────────────
  console.log("Resolving Google access token...");
  const token = await resolveToken(args, db);
  console.log("  Token OK\n");

  // ── Load DB snapshot ────────────────────────────────────────────────────────
  console.log("Loading database snapshot...");
  let [allOrgs, allSites] = await Promise.all([
    db.select().from(schema.customerOrgs).where(eq(schema.customerOrgs.companyId, args.companyId)),
    db.select().from(schema.sites).where(eq(schema.sites.companyId, args.companyId)),
  ]);

  // If --customer-org is given, restrict orgs (but keep all sites for cross-org mismatch detection)
  if (args.customerOrgId !== undefined) {
    allOrgs = allOrgs.filter((o) => o.id === args.customerOrgId);
    if (allOrgs.length === 0) {
      console.error(`ERROR: No customerOrg with id=${args.customerOrgId} found for company ${args.companyId}`);
      process.exit(1);
    }
  }

  console.log(`  ${allOrgs.length} customer orgs, ${allSites.length} sites\n`);

  // Build org lookup by normalized name
  const orgByNorm = new Map<string, DbOrg>();
  for (const org of allOrgs) orgByNorm.set(normName(org.name), org);

  // ── Walk Drive tree ─────────────────────────────────────────────────────────
  // Collect all Drive records
  const allDriveRecords: DriveCustomerRecord[] = [];
  const unmatchedOrgFolders: string[] = [];
  const unparsedFolders: { orgFolder: string; siteName: string }[] = [];
  const orgFolderToOrgId = new Map<string, number>();
  // Count of top-level Drive folders — building folders in flat mode, org
  // folders in nested mode. Hoisted so the SUMMARY can reference it in both.
  let topLevelFolderCount = 0;

  if (args.flat) {
    // FLAT mode: the Customer Records root is a single flat list of
    // `#NNNN - <address>` building folders (no <Org>/<#NNNN-Site> nesting).
    // Each top-level folder IS a site. Org is not derived from the tree here —
    // matched sites keep their existing org; unmatched folders are reported,
    // never blindly created under a guessed org.
    console.log(`Listing site (building) folders under Drive root ${rootId} [FLAT mode]...`);
    const siteFolders = await listFolders(rootId, token);
    topLevelFolderCount = siteFolders.length;
    console.log(`  Found ${siteFolders.length} folders\n`);
    for (const sf of siteFolders) {
      const parsed = parseSiteFolder(sf.name);
      if (!parsed) {
        unparsedFolders.push({ orgFolder: "(root)", siteName: sf.name });
        continue;
      }
      const addrParts = parseAddressComponents(parsed.siteName);
      allDriveRecords.push({
        orgFolderName: "(root)",
        orgFolderId: sf.id, // no org layer — key won't resolve, so orgId stays undefined
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
  } else {
  console.log(`Listing customer org folders under Drive root ${rootId}...`);
  const orgFolders = await listFolders(rootId, token);
  topLevelFolderCount = orgFolders.length;
  console.log(`  Found ${orgFolders.length} org folders\n`);

  for (const orgFolder of orgFolders) {
    // Restrict to specific org if --customer-org
    if (args.customerOrgId !== undefined) {
      const matchedOrgInScope = allOrgs[0]; // already filtered
      if (!matchedOrgInScope) continue;
      // Only walk this folder if it matches the restricted org
      const normFolderName = normName(orgFolder.name);
      const orgMapTarget = args.orgMap[normFolderName];
      let matched: DbOrg | undefined;
      if (orgMapTarget) {
        matched = [...orgByNorm.values()].find((o) => normName(o.name) === normName(orgMapTarget));
      } else {
        matched = orgByNorm.get(normFolderName)
          ?? [...orgByNorm.values()].find((o) => {
            const on = normName(o.name);
            return on.includes(normFolderName) || normFolderName.includes(on);
          });
      }
      if (!matched || matched.id !== args.customerOrgId) continue;
    }

    const normFolder = normName(orgFolder.name);
    const orgMapTarget = args.orgMap[normFolder];

    let matchedOrg: DbOrg | undefined;
    if (orgMapTarget) {
      matchedOrg = [...orgByNorm.values()].find((o) => normName(o.name) === normName(orgMapTarget));
      if (!matchedOrg) {
        unmatchedOrgFolders.push(`${orgFolder.name} (--org-map target "${orgMapTarget}" not found in DB)`);
        continue;
      }
    } else {
      matchedOrg = orgByNorm.get(normFolder);
      if (!matchedOrg) {
        // Partial match fallback
        matchedOrg = [...orgByNorm.values()].find((o) => {
          const on = normName(o.name);
          return on.includes(normFolder) || normFolder.includes(on);
        });
      }
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
  } // end non-flat org walk

  // Apply --limit
  const records = args.limit !== undefined ? allDriveRecords.slice(0, args.limit) : allDriveRecords;
  console.log(`Drive records to process: ${records.length} of ${allDriveRecords.length} found\n`);

  // ── Process each Drive record ───────────────────────────────────────────────
  const results: ProcessResult[] = [];
  const allMismatches: MismatchRow[] = [];
  const nameCleans: { siteId: number; before: string; after: string }[] = [];
  const suspiciousNameCleans: { siteId: number; before: string; after: string }[] = [];
  const fieldCleans: { siteId: number; changed: string[]; fromFile: string; toFile: string; fromAddr: string; toAddr: string }[] = [];
  const suspectFixes: { siteId: number; code: string; changed: string[]; beforeName: string; afterName: string; beforeFile: string; afterFile: string; beforeAddr: string; afterAddr: string }[] = [];
  const suspectFixErrors: { siteId: number; code: string; reason: string }[] = [];
  const fixedSuspectIds = new Set<number>();
  let created = 0, updated = 0, skipped = 0, skippedNoOrg = 0, skippedNoName = 0;
  let highConf = 0, medConf = 0, lowConf = 0;
  let dupFileConflicts = 0, dupBldgConflicts = 0;

  // Build O(1) lookup indexes from the current site list
  let siteIndexes = buildSiteIndexes(allSites);

  // Track normalized file numbers seen this run to guard against duplicate creates
  const seenNormFile = new Set<string>();
  for (const s of allSites) {
    if (s.fileNumber) seenNormFile.add(normBldg(s.fileNumber));
    if (s.buildingId) seenNormFile.add(normBldg(s.buildingId));
  }

  for (const record of records) {
    const orgId = orgFolderToOrgId.get(record.orgFolderId);
    const orgName = orgId !== undefined
      ? allOrgs.find((o) => o.id === orgId)?.name
      : undefined;

    const match = matchSite(record, orgId, allSites, siteIndexes, args.flat);
    const confidence: Confidence | "none" = match?.confidence ?? "none";

    if (match) {
      if (match.confidence === "high") highConf++;
      else if (match.confidence === "medium") medConf++;
      else lowConf++;
    }

    // LOW confidence: report only, never create or update
    if (match?.confidence === "low") {
      const result: ProcessResult = {
        record,
        orgId,
        orgName,
        orgMatched: orgId !== undefined,
        matchedSiteId: match.site.id,
        confidence: "low",
        action: "skip-low-confidence",
        mismatches: [],
      };
      results.push(result);
      skipped++;
      continue;
    }

    // HIGH/MEDIUM match: detect mismatches, plan update
    if (match && (match.confidence === "high" || match.confidence === "medium")) {
      const mismatches = detectMismatches(record, orgId, match.site, match.confidence);
      allMismatches.push(...mismatches);

      // Plan fields to update (blank/null only)
      const patch: Partial<schema.InsertSite> = {};
      if (!match.site.fileNumber && record.fileNumber) patch.fileNumber = record.fileNumber;
      if (!match.site.buildingId && record.fileNumber) patch.buildingId = record.fileNumber;
      if (!match.site.address && record.address) patch.address = record.address;
      if (!match.site.city && record.city) patch.city = record.city;
      if (!match.site.state && record.state) patch.state = record.state;
      if (!match.site.postalCode && record.postalCode) patch.postalCode = record.postalCode;

      // --clean-names: overwrite a JUNK name (summary-sheet fingerprint) with the
      // clean Drive folder header. HIGH-confidence matches only, and only when the
      // existing name is provably junk — real business names are never touched.
      if (
        args.cleanNames &&
        match.confidence === "high" &&
        record.siteName &&
        isJunkSiteName(match.site.name) &&
        normName(record.siteName) !== normName(match.site.name)
      ) {
        if (sharesBuildingNumber(record.siteName, match.site.name)) {
          patch.name = record.siteName;
          nameCleans.push({ siteId: match.site.id, before: match.site.name, after: record.siteName });
        } else {
          // The folder header is a DIFFERENT building than the current name —
          // the site's `#NNNN` is likely mislabeled. Never rename; flag it.
          suspiciousNameCleans.push({ siteId: match.site.id, before: match.site.name, after: record.siteName });
        }
      }

      // --clean-fields: overwrite the scrambled address + file-number fields from
      // the authoritative folder header, for a verified same-building match only
      // (HIGH confidence + shares a street number with the current name). This is
      // the pass that corrects addresses left pointing at another building.
      if (
        args.cleanFields &&
        match.confidence === "high" &&
        sharesBuildingNumber(record.siteName, match.site.name)
      ) {
        const before = {
          fileNumber: match.site.fileNumber, address: match.site.address, city: match.site.city,
        };
        const changed: string[] = [];
        if (record.fileNumber && normFileCode(match.site.fileNumber) !== normFileCode(record.fileNumber)) {
          patch.fileNumber = record.fileNumber; patch.buildingId = record.fileNumber; changed.push("fileNumber");
        }
        if (record.address && normAddress(match.site.address ?? "") !== normAddress(record.address)) {
          patch.address = record.address; changed.push("address");
        }
        if (record.city && normName(match.site.city ?? "") !== normName(record.city)) {
          patch.city = record.city; changed.push("city");
        }
        if (record.state && normName(match.site.state ?? "") !== normName(record.state)) {
          patch.state = record.state; changed.push("state");
        }
        if (record.postalCode && (match.site.postalCode ?? "") !== record.postalCode) {
          patch.postalCode = record.postalCode; changed.push("postalCode");
        }
        if (changed.length) {
          fieldCleans.push({
            siteId: match.site.id, changed,
            fromFile: before.fileNumber ?? "", toFile: record.fileNumber,
            fromAddr: before.address ?? "", toAddr: record.address ?? "",
          });
        }
      }

      const hasUpdate = Object.keys(patch).length > 0;
      const shouldUpdate = hasUpdate && (args.updateExisting || args.cleanNames || args.cleanFields);

      let action: ActionType;
      if (!hasUpdate) {
        action = "skip-exists";
        skipped++;
      } else if (shouldUpdate) {
        action = args.dryRun ? "dry-run-update" : "update";
        if (!args.dryRun) {
          await db.update(schema.sites).set(patch).where(eq(schema.sites.id, match.site.id));
          // Refresh in-memory site
          const idx = allSites.findIndex((s) => s.id === match.site.id);
          if (idx !== -1) allSites[idx] = { ...allSites[idx], ...patch };
        }
        updated++;
      } else {
        action = mismatches.length > 0 ? "mismatch-only" : "skip-exists";
        skipped++;
      }

      results.push({
        record,
        orgId,
        orgName,
        orgMatched: orgId !== undefined,
        matchedSiteId: match.site.id,
        confidence: match.confidence,
        action,
        fieldsSet: Object.keys(patch),
        mismatches,
      });
      continue;
    }

    // No match — plan to create
    if (orgId === undefined) {
      results.push({
        record,
        orgMatched: false,
        confidence: "none",
        action: "skip-no-org",
        mismatches: [],
      });
      skippedNoOrg++;
      continue;
    }

    const siteName = record.address || record.siteName;
    if (!siteName) {
      results.push({
        record,
        orgId,
        orgName,
        orgMatched: true,
        confidence: "none",
        action: "skip-no-name",
        mismatches: [],
      });
      skippedNoName++;
      continue;
    }

    // Duplicate guard
    const normFN = normBldg(record.fileNumber);
    if (seenNormFile.has(normFN)) {
      dupFileConflicts++;
      results.push({
        record,
        orgId,
        orgName,
        orgMatched: true,
        confidence: "none",
        action: "skip-exists",
        mismatches: [],
      });
      skipped++;
      continue;
    }

    // Create
    const action: ActionType = args.dryRun ? "dry-run-create" : "create";
    let newSiteId: number | undefined;

    if (!args.dryRun) {
      const [res] = await db.insert(schema.sites).values({
        companyId: args.companyId,
        customerOrgId: orgId,
        name: siteName,
        address: record.address ?? null,
        city: record.city ?? null,
        state: record.state ?? null,
        postalCode: record.postalCode ?? null,
        fileNumber: record.fileNumber,
        buildingId: record.fileNumber,
      });
      newSiteId = (res as { insertId: number }).insertId;

      // Add to in-memory structures so later records don't re-create
      const newSite: DbSite = {
        id: newSiteId,
        companyId: args.companyId,
        customerOrgId: orgId,
        name: siteName,
        address: record.address ?? null,
        city: record.city ?? null,
        state: record.state ?? null,
        postalCode: record.postalCode ?? null,
        fileNumber: record.fileNumber,
        buildingId: record.fileNumber,
        contactName: null,
        contactPhone: null,
        notes: null,
        summary: null,
        keyLocation: null,
        keyNumber: null,
        keySignOutDate: null,
        keySignedOutBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      allSites.push(newSite);
      siteIndexes = buildSiteIndexes(allSites);
    }

    seenNormFile.add(normFN);
    created++;
    results.push({
      record,
      orgId,
      orgName,
      orgMatched: true,
      matchedSiteId: newSiteId,
      confidence: "none",
      action,
      fieldsSet: ["name", "address", "city", "state", "postalCode", "fileNumber", "buildingId"],
      mismatches: [],
    });
  }

  // ── Fix suspect sites (explicit siteId → #NNNN overrides) ───────────────────
  // The --clean-* passes deliberately skip sites whose name #NNNN points at a
  // different building — the code is mislabeled at the source and can't be
  // auto-corrected. Only a human who knows the real building number can fix
  // those. --fix-suspects takes that verified map and re-points each site at the
  // CORRECT Drive folder, overwriting its address/file-number (and junk name)
  // from that folder header. This intentionally bypasses the sharesBuildingNumber
  // guard: that guard is exactly what flagged these, and the operator is
  // overriding it on purpose. Missing sites or codes are reported, never guessed.
  if (Object.keys(args.fixSuspects).length > 0) {
    console.log("\nApplying --fix-suspects overrides...");

    // Index every Drive folder by its canonical file code so a supplied #NNNN
    // resolves to its folder header in either layout (flat or nested).
    const driveByCode = new Map<string, DriveCustomerRecord>();
    for (const r of allDriveRecords) {
      const key = normFileCode(r.fileNumber);
      if (key && !driveByCode.has(key)) driveByCode.set(key, r);
    }

    for (const [idStr, code] of Object.entries(args.fixSuspects)) {
      const siteId = Number(idStr);
      const site = allSites.find((s) => s.id === siteId);
      if (!site) {
        suspectFixErrors.push({ siteId, code, reason: `no site ${siteId} in company ${args.companyId}` });
        continue;
      }
      const rec = driveByCode.get(normFileCode(code));
      if (!rec) {
        suspectFixErrors.push({ siteId, code, reason: `no Drive folder matches code ${code}` });
        continue;
      }

      // Re-point from the authoritative folder header. fileNumber/buildingId take
      // the folder's canonical `#NNNN` (not the operator's typed form).
      const patch: Partial<schema.InsertSite> = { fileNumber: rec.fileNumber, buildingId: rec.fileNumber };
      const changed: string[] = ["fileNumber", "buildingId"];
      if (rec.address) { patch.address = rec.address; changed.push("address"); }
      if (rec.city) { patch.city = rec.city; changed.push("city"); }
      if (rec.state) { patch.state = rec.state; changed.push("state"); }
      if (rec.postalCode) { patch.postalCode = rec.postalCode; changed.push("postalCode"); }
      // Replace the name only when it's import junk — never clobber a real name.
      if (isJunkSiteName(site.name) && rec.siteName && normName(rec.siteName) !== normName(site.name)) {
        patch.name = rec.siteName; changed.push("name");
      }

      suspectFixes.push({
        siteId, code: rec.fileNumber, changed,
        beforeName: site.name, afterName: patch.name ?? site.name,
        beforeFile: site.fileNumber ?? "", afterFile: rec.fileNumber,
        beforeAddr: site.address ?? "", afterAddr: rec.address ?? "",
      });

      if (!args.dryRun) {
        await db.update(schema.sites).set(patch).where(eq(schema.sites.id, siteId));
        const idx = allSites.findIndex((s) => s.id === siteId);
        if (idx !== -1) allSites[idx] = { ...allSites[idx], ...patch };
      }
      fixedSuspectIds.add(siteId);
    }

    console.log(`  Suspect sites ${args.dryRun ? "to fix" : "fixed"}: ${suspectFixes.length}` +
      (suspectFixErrors.length ? `, skipped (bad input): ${suspectFixErrors.length}` : ""));
  }

  // ── Reconcile existing sites ────────────────────────────────────────────────
  const orphanedSites: DbSite[] = [];
  const reconciledSiteMismatches: MismatchRow[] = [];

  if (args.reconcileExisting) {
    console.log("\nReconciling existing sites against Customer Records...");

    // Build a set of Drive site folder IDs that were matched to a DB site
    const matchedSiteIds = new Set(results.filter((r) => r.matchedSiteId).map((r) => r.matchedSiteId!));

    // For each existing site, find matching Drive record
    const sitesInScope = args.customerOrgId !== undefined
      ? allSites.filter((s) => s.customerOrgId === args.customerOrgId)
      : allSites;

    for (const site of sitesInScope) {
      if (matchedSiteIds.has(site.id) || fixedSuspectIds.has(site.id)) continue; // already matched/fixed above

      // Try to find a Drive record for this site
      let driveMatch: DriveCustomerRecord | null = null;
      let driveConf: Confidence | null = null;

      // HIGH: fileNumber match
      if (site.fileNumber) {
        const fn = normBldg(site.fileNumber);
        driveMatch = allDriveRecords.find((r) => normBldg(r.fileNumber) === fn) ?? null;
        if (driveMatch) driveConf = "high";
      }

      // HIGH: buildingId match
      if (!driveMatch && site.buildingId) {
        const bi = normBldg(site.buildingId);
        driveMatch = allDriveRecords.find((r) => normBldg(r.fileNumber) === bi) ?? null;
        if (driveMatch) driveConf = "high";
      }

      // MEDIUM: address prefix
      if (!driveMatch && site.address) {
        const normSiteAddr = normAddress(site.address);
        if (normSiteAddr.length >= 8) {
          const prefix = normSiteAddr.slice(0, 20);
          driveMatch = allDriveRecords.find((r) => r.address && normAddress(r.address).startsWith(prefix)) ?? null;
          if (driveMatch) driveConf = "medium";
        }
      }

      // MEDIUM: name + org
      if (!driveMatch) {
        const normSiteName = normName(site.name);
        const orgId = site.customerOrgId;
        driveMatch = allDriveRecords.find((r) => {
          const rOrgId = orgFolderToOrgId.get(r.orgFolderId);
          return rOrgId === orgId && normName(r.siteName) === normSiteName;
        }) ?? null;
        if (driveMatch) driveConf = "medium";
      }

      if (!driveMatch) {
        orphanedSites.push(site);
        continue;
      }

      // Found a Drive match — detect mismatches
      const orgId = orgFolderToOrgId.get(driveMatch.orgFolderId);
      const mismatches = detectMismatches(driveMatch, orgId, site, driveConf!);
      reconciledSiteMismatches.push(...mismatches);
      allMismatches.push(...mismatches);
    }

    console.log(`  Orphaned sites (no Drive match): ${orphanedSites.length}`);
    console.log(`  Reconciled mismatches found: ${reconciledSiteMismatches.length}`);
  }

  // ── Print summary ───────────────────────────────────────────────────────────
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log("  SUMMARY");
  console.log(line);

  const total = allDriveRecords.length;
  const orgFoldersTotal = topLevelFolderCount;
  if (args.flat) {
    console.log(`  ${pad("Drive building folders found:", 40)} ${orgFoldersTotal}`);
  } else {
    console.log(`  ${pad("Drive org folders found:", 40)} ${orgFoldersTotal}`);
    console.log(`  ${pad("Org folders matched to DB customerOrg:", 40)} ${orgFoldersTotal - unmatchedOrgFolders.length}`);
    console.log(`  ${pad("Org folders unmatched:", 40)} ${unmatchedOrgFolders.length}`);
  }
  console.log(`  ${pad("Site (building) folders parsed:", 40)} ${total}`);
  console.log(`  ${pad("Folders with no #NNNN pattern:", 40)} ${unparsedFolders.length}`);
  console.log(`  ${pad("Processed (after limit):", 40)} ${records.length}`);
  console.log();
  console.log(`  ${pad("HIGH confidence matches:", 40)} ${highConf}`);
  console.log(`  ${pad("MEDIUM confidence matches:", 40)} ${medConf}`);
  console.log(`  ${pad("LOW confidence (review only):", 40)} ${lowConf}`);
  console.log();

  const createLabel = args.dryRun ? "Would create (dry-run):" : "Sites created:";
  const updateLabel = args.dryRun ? "Would update (dry-run):" : "Sites updated (blank fields):";
  console.log(`  ${pad(createLabel, 40)} ${created}`);
  console.log(`  ${pad(updateLabel, 40)} ${updated}`);
  if (args.cleanNames) {
    const cleanLabel = args.dryRun ? "Would clean junk names (dry-run):" : "Junk names cleaned:";
    console.log(`  ${pad(cleanLabel, 40)} ${nameCleans.length}`);
  }
  if (args.cleanFields) {
    const fLabel = args.dryRun ? "Would fix address/file# (dry-run):" : "Address/file# fixed:";
    console.log(`  ${pad(fLabel, 40)} ${fieldCleans.length}`);
  }
  if (Object.keys(args.fixSuspects).length > 0) {
    const sLabel = args.dryRun ? "Would fix suspect sites (dry-run):" : "Suspect sites fixed:";
    console.log(`  ${pad(sLabel, 40)} ${suspectFixes.length}`);
    if (suspectFixErrors.length > 0) {
      console.log(`  ${pad("Suspect fixes skipped (bad input):", 40)} ${suspectFixErrors.length}`);
    }
  }
  console.log(`  ${pad("Skipped (already complete):", 40)} ${skipped}`);
  console.log(`  ${pad("Skipped (no org matched):", 40)} ${skippedNoOrg}`);
  console.log(`  ${pad("Skipped (no name/address):", 40)} ${skippedNoName}`);
  console.log(`  ${pad("Duplicate fileNumber conflicts:", 40)} ${dupFileConflicts}`);
  console.log(`  ${pad("Mismatches detected:", 40)} ${allMismatches.length}`);

  if (args.reconcileExisting) {
    console.log();
    console.log(`  ${pad("Existing sites reconciled:", 40)} ${args.customerOrgId !== undefined
      ? allSites.filter((s) => s.customerOrgId === args.customerOrgId).length
      : allSites.length}`);
    console.log(`  ${pad("Orphaned sites (no Drive record):", 40)} ${orphanedSites.length}`);
    console.log(`  ${pad("Reconcile mismatches:", 40)} ${reconciledSiteMismatches.length}`);
  }

  // ── Detail sections ─────────────────────────────────────────────────────────

  if (unmatchedOrgFolders.length > 0) {
    console.log(`\n${line}`);
    console.log(`  UNMATCHED ORG FOLDERS (${unmatchedOrgFolders.length})`);
    console.log(`  Create these in customerOrgs first, then re-run.`);
    console.log(line);
    unmatchedOrgFolders.forEach((n) => console.log(`  • ${n}`));
  }

  if (unparsedFolders.length > 0) {
    console.log(`\n${line}`);
    console.log(`  FOLDERS WITHOUT #NNNN PATTERN (${unparsedFolders.length})`);
    console.log(line);
    unparsedFolders.forEach((f) => console.log(`  org="${f.orgFolder}"  folder="${f.siteName}"`));
  }

  if (args.cleanNames && nameCleans.length > 0) {
    const label = args.dryRun ? "WOULD CLEAN NAMES" : "CLEANED NAMES";
    console.log(`\n${line}`);
    console.log(`  ${label} (${nameCleans.length}) — junk name → Drive folder header`);
    console.log(line);
    for (const c of nameCleans) {
      console.log(`  siteId=${c.siteId}`);
      console.log(`     from: "${c.before}"`);
      console.log(`     to:   "${c.after}"`);
    }
  }

  if (args.cleanFields && fieldCleans.length > 0) {
    const label = args.dryRun ? "WOULD FIX FIELDS" : "FIXED FIELDS";
    console.log(`\n${line}`);
    console.log(`  ${label} (${fieldCleans.length}) — address / file-number from Drive folder`);
    console.log(line);
    for (const c of fieldCleans) {
      console.log(`  siteId=${c.siteId}  [${c.changed.join(", ")}]`);
      if (c.changed.includes("fileNumber")) console.log(`     file#:   "${c.fromFile}" → "${c.toFile}"`);
      if (c.changed.includes("address"))    console.log(`     address: "${c.fromAddr}" → "${c.toAddr}"`);
    }
  }

  if (suspectFixes.length > 0) {
    const label = args.dryRun ? "WOULD FIX SUSPECTS" : "FIXED SUSPECTS";
    console.log(`\n${line}`);
    console.log(`  ${label} (${suspectFixes.length}) — explicit siteId → #NNNN re-point`);
    console.log(line);
    for (const c of suspectFixes) {
      console.log(`  siteId=${c.siteId} → ${c.code}  [${c.changed.join(", ")}]`);
      if (c.changed.includes("name"))    console.log(`     name:    "${c.beforeName}" → "${c.afterName}"`);
      console.log(`     file#:   "${c.beforeFile}" → "${c.afterFile}"`);
      if (c.changed.includes("address")) console.log(`     address: "${c.beforeAddr}" → "${c.afterAddr}"`);
    }
  }

  if (suspectFixErrors.length > 0) {
    console.log(`\n${line}`);
    console.log(`  SUSPECT FIXES SKIPPED — bad input (${suspectFixErrors.length})`);
    console.log(`  Nothing was written for these. Correct the siteId/code and re-run.`);
    console.log(line);
    for (const e of suspectFixErrors) {
      console.log(`  siteId=${e.siteId} code="${e.code}": ${e.reason}`);
    }
  }

  if (args.cleanNames && suspiciousNameCleans.length > 0) {
    console.log(`\n${line}`);
    console.log(`  SKIPPED — SUSPECT WRONG BUILDING (${suspiciousNameCleans.length}) — NOT renamed; review by hand`);
    console.log(`  The site's #NNNN matched a folder for a different address (no shared street number).`);
    console.log(line);
    for (const c of suspiciousNameCleans) {
      console.log(`  siteId=${c.siteId}`);
      console.log(`     name:   "${c.before}"`);
      console.log(`     folder: "${c.after}"`);
    }
  }

  const creates = results.filter((r) => r.action === "create" || r.action === "dry-run-create");
  if (creates.length > 0) {
    const label = args.dryRun ? "WOULD CREATE" : "CREATED";
    console.log(`\n${line}`);
    console.log(`  ${label} (${creates.length})`);
    console.log(line);
    for (const r of creates) {
      const orgLabel = r.orgName ? `org="${r.orgName}"` : "no-org";
      const siteLabel = r.matchedSiteId ? ` siteId=${r.matchedSiteId}` : "";
      console.log(`  ${pad(r.record.fileNumber, 12)} ${orgLabel}${siteLabel}  "${r.record.siteName}"`);
    }
  }

  const updates = results.filter((r) => r.action === "update" || r.action === "dry-run-update");
  if (updates.length > 0) {
    const label = args.dryRun ? "WOULD UPDATE (blank fields)" : "UPDATED (blank fields)";
    console.log(`\n${line}`);
    console.log(`  ${label} (${updates.length})`);
    console.log(line);
    for (const r of updates) {
      const fields = r.fieldsSet?.join(", ") ?? "";
      console.log(`  siteId=${r.matchedSiteId}  ${r.record.fileNumber}  set: ${fields}`);
    }
  }

  const lowConfs = results.filter((r) => r.action === "skip-low-confidence");
  if (lowConfs.length > 0) {
    console.log(`\n${line}`);
    console.log(`  LOW CONFIDENCE — MANUAL REVIEW REQUIRED (${lowConfs.length})`);
    console.log(`  These Drive records are similar to existing sites but not certain.`);
    console.log(`  No action was taken. Review and use --org-map if needed.`);
    console.log(line);
    for (const r of lowConfs) {
      console.log(`  ${pad(r.record.fileNumber, 12)} "${r.record.siteName}"  → siteId=${r.matchedSiteId}`);
    }
  }

  if (allMismatches.length > 0) {
    console.log(`\n${line}`);
    console.log(`  MISMATCHES DETECTED (${allMismatches.length})`);
    console.log(`  Populated Site fields differ from Customer Record values.`);
    console.log(`  These were NOT overwritten. Review manually.`);
    console.log(line);
    for (const m of allMismatches) {
      console.log(`  siteId=${m.siteId ?? "?"} [${m.matchConfidence}] field="${m.fieldName}"`);
      console.log(`    site  : ${m.siteValue}`);
      console.log(`    drive : ${m.customerRecordValue}`);
    }
  }

  if (args.reconcileExisting && orphanedSites.length > 0) {
    console.log(`\n${line}`);
    console.log(`  ORPHANED SITES — No matching Customer Record (${orphanedSites.length})`);
    console.log(`  These sites exist in DB but have no matching Drive folder.`);
    console.log(line);
    for (const s of orphanedSites) {
      const fn = s.fileNumber ?? s.buildingId ?? "no-file#";
      console.log(`  siteId=${s.id}  ${pad(fn, 12)} "${s.name}"`);
    }
  }

  // ── Write output files ──────────────────────────────────────────────────────

  if (args.outputUnmatched) {
    ensureExportsDir();
    const path = "data/exports/customer-records-site-seed-unmatched.json";
    const unmatchedRecords = results
      .filter((r) => r.action === "skip-no-org" || r.action === "skip-no-name")
      .map((r) => ({
        orgFolderName: r.record.orgFolderName,
        siteFolderName: r.record.siteFolderName,
        fileNumber: r.record.fileNumber,
        siteName: r.record.siteName,
        orgMatched: r.orgMatched,
        skipReason: r.action,
        customerOrgId: r.orgId ?? null,
      }));
    const unmatchedOrphans = orphanedSites.map((s) => ({
      type: "orphaned-site",
      siteId: s.id,
      fileNumber: s.fileNumber ?? null,
      buildingId: s.buildingId ?? null,
      name: s.name,
      customerOrgId: s.customerOrgId,
    }));
    writeFileSync(path, JSON.stringify({ unmatchedDriveRecords: unmatchedRecords, orphanedSites: unmatchedOrphans }, null, 2));
    console.log(`\n  Written: ${path}`);
  }

  if (args.outputMismatches && allMismatches.length > 0) {
    ensureExportsDir();
    const path = "data/exports/customer-records-site-mismatches.json";
    writeFileSync(path, JSON.stringify(allMismatches, null, 2));
    console.log(`  Written: ${path}`);
  }

  // ── Final message ───────────────────────────────────────────────────────────
  console.log();
  if (args.dryRun) {
    console.log("DRY RUN complete — no changes written to the database.");
    console.log("Review the output above, then re-run without --dry-run to apply.");
  } else if (created + updated + suspectFixes.length > 0) {
    console.log("Done. Review any mismatches above manually.");
  } else {
    console.log("Done. No changes applied.");
  }
  console.log();
}

// Only run when executed directly (`tsx seedSitesFromCustomerRecords.ts`), not
// when imported for its exported helpers (e.g. from a test).
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\nFatal:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
