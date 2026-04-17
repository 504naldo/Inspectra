/**
 * scripts/seedSitesFromCustomerRecords.ts
 *
 * Seed the `sites` table from the Google Drive customer-records folder tree
 * (the same tree that powers the Customer Records page at /admin/customer-records).
 *
 * Folder structure expected under GOOGLE_DRIVE_CUSTOMER_ROOT_ID:
 *   <Customer Org Name>/
 *     #0007 - 1407 E. Georgia Street/    ← site folder
 *     #0012 - Some Other Building/
 *   <Another Customer Org>/
 *     ...
 *
 * For each site sub-folder, this script:
 *   1. Parses the fileNumber (#NNNN) and site name from the folder name.
 *   2. Matches the parent folder to a `customerOrgs` row (normalized name).
 *   3. Upserts the site: creates if absent, updates only empty fields if present.
 *
 * Safety rules (idempotent):
 *   - Match existing sites by fileNumber or buildingId (normalized).
 *   - NEVER overwrite a non-null name, address, or customerOrgId.
 *   - Folders that don't match the #NNNN pattern are skipped with a warning.
 *   - Customer org folders that don't match any DB org are listed for review.
 *
 * Authentication:
 *   Provide EITHER --admin-user-id N (looks up stored Google token in DB)
 *   OR --access-token TOKEN (paste directly from browser DevTools).
 *
 * Usage:
 *   # Dry-run report (no DB writes)
 *   pnpm exec tsx scripts/seedSitesFromCustomerRecords.ts \
 *     --company 1 --admin-user-id 1 --dry-run
 *
 *   # Live run with stored token
 *   pnpm exec tsx scripts/seedSitesFromCustomerRecords.ts \
 *     --company 1 --admin-user-id 1
 *
 *   # Live run with explicit token
 *   pnpm exec tsx scripts/seedSitesFromCustomerRecords.ts \
 *     --company 1 --access-token "ya29.xxx..."
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, or } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";

config();

// ─── Drive helpers ─────────────────────────────────────────────────────────────

const DRIVE_API = "https://www.googleapis.com/drive/v3";

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

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

async function driveList(
  accessToken: string,
  params: Record<string, string>
): Promise<DriveFile[]> {
  const base = new URL(`${DRIVE_API}/files`);
  for (const [k, v] of Object.entries(params)) base.searchParams.set(k, v);

  const all: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(base.toString());
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Drive API error (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      files: DriveFile[];
      nextPageToken?: string;
    };
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);

  return all;
}

async function listFolders(
  parentId: string,
  accessToken: string
): Promise<DriveFile[]> {
  return driveList(accessToken, {
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed=false`,
    fields: "nextPageToken,files(id,name,mimeType)",
    orderBy: "name",
    pageSize: "500",
    ...sharedDriveParams(),
  });
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

async function resolveAccessToken(
  args: CliArgs,
  db: ReturnType<typeof drizzle>
): Promise<string> {
  if (args.accessToken) return args.accessToken;

  const userId = args.adminUserId!;
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  if (!rows.length) throw new Error(`User ${userId} not found in DB`);
  const user = rows[0];

  if (!user.googleAccessToken)
    throw new Error(
      `User ${userId} has no stored Google token. ` +
        `Have them log in to the app first, or pass --access-token directly.`
    );

  // Return current token if still valid (with 5-min buffer)
  if (user.googleTokenExpiry) {
    const bufferMs = 5 * 60 * 1000;
    if (new Date(user.googleTokenExpiry).getTime() - bufferMs > Date.now()) {
      return user.googleAccessToken;
    }
  }

  if (!user.googleRefreshToken)
    throw new Error(
      `Token for user ${userId} is expired and no refresh token is stored. ` +
        `Have them re-authenticate in the app.`
    );

  // Refresh
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
    throw new Error(`Failed to refresh Google token: ${body}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };

  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
  if (!args.dryRun) {
    await db
      .update(schema.users)
      .set({
        googleAccessToken: tokenData.access_token,
        googleTokenExpiry: newExpiry,
      })
      .where(eq(schema.users.id, userId));
  }

  console.log(`  Refreshed Google token for user ${userId} (expires ${newExpiry.toISOString()})`);
  return tokenData.access_token;
}

// ─── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parses a Drive folder name like "#0007 - 1407 E. Georgia Street"
 * → { fileNumber: "#0007", siteName: "1407 E. Georgia Street" }
 *
 * Also handles variants like "#0330-1 - Name" or "#007 — Name" (em dash).
 */
function parseSiteFolder(
  folderName: string
): { fileNumber: string; siteName: string } | null {
  const match = folderName.match(/^(#[\w-]+)\s*[-–—]+\s*(.+)$/);
  if (!match) return null;
  return { fileNumber: match[1].trim(), siteName: match[2].trim() };
}

/** Normalize for fuzzy matching: lowercase, collapse non-alphanumeric to spaces */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a buildingId/fileNumber: strip leading #, leading zeros, dashes */
function normBldg(s: string): string {
  const a = s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return /^\d+$/.test(a) ? String(parseInt(a, 10)) : a;
}

// ─── CLI args ──────────────────────────────────────────────────────────────────

interface CliArgs {
  companyId: number;
  dryRun: boolean;
  adminUserId?: number;
  accessToken?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = { companyId: 1, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company":
        a.companyId = parseInt(argv[++i], 10);
        break;
      case "--dry-run":
        a.dryRun = true;
        break;
      case "--admin-user-id":
        a.adminUserId = parseInt(argv[++i], 10);
        break;
      case "--access-token":
        a.accessToken = argv[++i];
        break;
    }
  }
  return a;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

interface SiteResult {
  orgName: string;
  folderName: string;
  fileNumber: string;
  siteName: string;
  action: "created" | "updated" | "skipped-exists" | "dry-run-create" | "dry-run-update";
  siteId?: number;
  note?: string;
}

async function main() {
  const args = parseArgs();

  if (!args.adminUserId && !args.accessToken) {
    console.error(
      [
        "Usage: pnpm exec tsx scripts/seedSitesFromCustomerRecords.ts",
        "  --company <id>",
        "  (--admin-user-id <id> | --access-token <token>)",
        "  [--dry-run]",
        "",
        "Authentication:",
        "  --admin-user-id N   Looks up user N in the DB and uses their stored Google token.",
        "  --access-token T    Use an OAuth token you obtained manually (paste from app).",
      ].join("\n")
    );
    process.exit(1);
  }

  const rootId = process.env.GOOGLE_DRIVE_CUSTOMER_ROOT_ID;
  if (!rootId) {
    console.error("GOOGLE_DRIVE_CUSTOMER_ROOT_ID is not set in .env");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env");
    process.exit(1);
  }

  if (args.dryRun) console.log("\nDRY RUN — no DB writes\n");

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });

  // ── Resolve access token ────────────────────────────────────────────────────
  console.log("Resolving Google access token...");
  const accessToken = await resolveAccessToken(args, db);
  console.log("  Token OK\n");

  // ── Load DB snapshot ────────────────────────────────────────────────────────
  const [allOrgs, allSites] = await Promise.all([
    db
      .select()
      .from(schema.customerOrgs)
      .where(eq(schema.customerOrgs.companyId, args.companyId)),
    db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.companyId, args.companyId)),
  ]);

  console.log(
    `DB snapshot: ${allOrgs.length} customer orgs, ${allSites.length} sites for company ${args.companyId}`
  );

  // Build lookup maps
  const orgByNormName = new Map<string, (typeof allOrgs)[0]>();
  for (const org of allOrgs) orgByNormName.set(normName(org.name), org);

  // Index existing sites by normalized fileNumber / buildingId
  const siteByNormFile = new Map<string, (typeof allSites)[0]>();
  for (const s of allSites) {
    if (s.fileNumber) siteByNormFile.set(normBldg(s.fileNumber), s);
    if (s.buildingId && !siteByNormFile.has(normBldg(s.buildingId))) {
      siteByNormFile.set(normBldg(s.buildingId), s);
    }
  }

  // ── Walk the Drive tree ─────────────────────────────────────────────────────
  console.log(`\nListing root folders under ${rootId}...`);
  const orgFolders = await listFolders(rootId, accessToken);
  console.log(`  Found ${orgFolders.length} customer org folders\n`);

  const results: SiteResult[] = [];
  const unmatchedOrgs: string[] = [];
  const unparsedFolders: { orgName: string; folderName: string }[] = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const orgFolder of orgFolders) {
    const normOrgFolder = normName(orgFolder.name);

    // Try exact normalized match first, then partial
    let matchedOrg = orgByNormName.get(normOrgFolder);
    if (!matchedOrg) {
      // Partial match: DB org name contains or is contained by folder name
      for (const [normDbName, org] of orgByNormName) {
        if (
          normDbName.includes(normOrgFolder) ||
          normOrgFolder.includes(normDbName)
        ) {
          matchedOrg = org;
          break;
        }
      }
    }

    if (!matchedOrg) {
      unmatchedOrgs.push(orgFolder.name);
      console.log(`  [ORG UNMATCHED] "${orgFolder.name}" — skipping all sites under this folder`);
      continue;
    }

    console.log(`  Processing: "${orgFolder.name}" → org "${matchedOrg.name}" (id=${matchedOrg.id})`);

    const siteFolders = await listFolders(orgFolder.id, accessToken);

    for (const siteFolder of siteFolders) {
      const parsed = parseSiteFolder(siteFolder.name);
      if (!parsed) {
        unparsedFolders.push({ orgName: orgFolder.name, folderName: siteFolder.name });
        continue;
      }

      const { fileNumber, siteName } = parsed;
      const normFile = normBldg(fileNumber);

      const existingSite = siteByNormFile.get(normFile);

      if (existingSite) {
        // Site already exists — update only empty fields
        const patch: Partial<schema.InsertSite> = {};
        if (!existingSite.fileNumber) patch.fileNumber = fileNumber;
        if (!existingSite.buildingId) patch.buildingId = fileNumber;

        if (Object.keys(patch).length === 0) {
          results.push({
            orgName: matchedOrg.name,
            folderName: siteFolder.name,
            fileNumber,
            siteName,
            action: "skipped-exists",
            siteId: existingSite.id,
          });
          skipped++;
          continue;
        }

        if (!args.dryRun) {
          await db
            .update(schema.sites)
            .set(patch)
            .where(eq(schema.sites.id, existingSite.id));
        }

        results.push({
          orgName: matchedOrg.name,
          folderName: siteFolder.name,
          fileNumber,
          siteName,
          action: args.dryRun ? "dry-run-update" : "updated",
          siteId: existingSite.id,
          note: `set: ${Object.keys(patch).join(", ")}`,
        });
        updated++;
      } else {
        // Create new site
        if (!args.dryRun) {
          const [inserted] = await db.insert(schema.sites).values({
            companyId: args.companyId,
            customerOrgId: matchedOrg.id,
            name: siteName,
            address: siteName,
            fileNumber,
            buildingId: fileNumber,
          });

          const newSiteId = (inserted as { insertId: number }).insertId;
          // Add to local index so later duplicate folders don't re-create
          const newSite = {
            id: newSiteId,
            fileNumber,
            buildingId: fileNumber,
            name: siteName,
            companyId: args.companyId,
            customerOrgId: matchedOrg.id,
          } as (typeof allSites)[0];
          siteByNormFile.set(normFile, newSite);

          results.push({
            orgName: matchedOrg.name,
            folderName: siteFolder.name,
            fileNumber,
            siteName,
            action: "created",
            siteId: newSiteId,
          });
        } else {
          results.push({
            orgName: matchedOrg.name,
            folderName: siteFolder.name,
            fileNumber,
            siteName,
            action: "dry-run-create",
          });
        }
        created++;
      }
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("\n── Summary ──────────────────────────────────────────────────────");
  console.log(`  Customer org folders in Drive : ${orgFolders.length}`);
  console.log(`  Matched to DB orgs            : ${orgFolders.length - unmatchedOrgs.length}`);
  console.log(`  Unmatched org folders         : ${unmatchedOrgs.length}`);
  console.log(`  Site folders processed        : ${results.length + unparsedFolders.length}`);
  console.log(`  Folders with no #NNNN pattern : ${unparsedFolders.length}`);
  if (args.dryRun) {
    console.log(`  Would create                  : ${created}`);
    console.log(`  Would update                  : ${updated}`);
  } else {
    console.log(`  Created                       : ${created}`);
    console.log(`  Updated (empty fields only)   : ${updated}`);
  }
  console.log(`  Skipped (already complete)    : ${skipped}`);

  if (unmatchedOrgs.length > 0) {
    console.log(`\n── Unmatched customer org folders (${unmatchedOrgs.length}) ──────────────────`);
    console.log(
      "   These Drive folders had no matching customerOrg in the DB.\n" +
        "   Create the missing orgs first, then re-run this script."
    );
    unmatchedOrgs.forEach((n) => console.log(`  "${n}"`));
  }

  if (unparsedFolders.length > 0) {
    console.log(`\n── Folders without #NNNN pattern (${unparsedFolders.length}) ──────────────────`);
    console.log(
      "   These site-level folders were skipped (no file number to parse).\n" +
        "   Review manually."
    );
    unparsedFolders.forEach((f) =>
      console.log(`  org="${f.orgName}"  folder="${f.folderName}"`)
    );
  }

  const createdList = results.filter((r) =>
    r.action === "created" || r.action === "dry-run-create"
  );
  if (createdList.length > 0) {
    const label = args.dryRun ? "Would create" : "Created";
    console.log(`\n── ${label} (${createdList.length}) ──────────────────────────────────────────`);
    createdList.forEach((r) =>
      console.log(
        `  ${r.fileNumber.padEnd(10)}  org="${r.orgName}"` +
          (r.siteId ? `  siteId=${r.siteId}` : "") +
          `  name="${r.siteName}"`
      )
    );
  }

  const updatedList = results.filter((r) =>
    r.action === "updated" || r.action === "dry-run-update"
  );
  if (updatedList.length > 0) {
    const label = args.dryRun ? "Would update" : "Updated";
    console.log(`\n── ${label} (${updatedList.length}) ──────────────────────────────────────────`);
    updatedList.forEach((r) =>
      console.log(
        `  ${r.fileNumber.padEnd(10)}  siteId=${r.siteId}  (${r.note})`
      )
    );
  }

  if (args.dryRun) {
    console.log("\nDRY RUN complete — no changes were written to the DB.");
    console.log(
      "Re-run without --dry-run to apply.\n"
    );
  } else if (created + updated > 0) {
    console.log(
      "\nNext steps:"
    );
    console.log(
      "  1. Run backfillSiteBuildingIds.ts to link workbook FILE#s to sites:"
    );
    console.log(
      `     pnpm exec tsx scripts/backfillSiteBuildingIds.ts --file "..." --company ${args.companyId}`
    );
    console.log(
      "  2. Then run seedMonthlyTracking.ts to create serviceSchedule rows."
    );
  }

  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
