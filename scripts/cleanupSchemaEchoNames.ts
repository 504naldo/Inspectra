/**
 * scripts/cleanupSchemaEchoNames.ts
 *
 * One-off cleanup for rows created before the PDF-import schema-echo guard
 * existed (server/_core/pdfImport.ts → sanitizeExtractedSiteData). Those
 * imports could copy the AI prompt's placeholder description into the value,
 * producing sites / customer orgs literally named
 * "string or null - the building/site name" (and echoed junk in the sibling
 * text columns).
 *
 * This script FINDS those rows (name matches isSchemaEcho) and, with --fix,
 * repairs them:
 *   - Site name  → the earliest imported PDF attachment's file name (matches
 *     the importer's own fallback), else summary.building.name, else the file
 *     number ("Site #0420"), else buildingId. If none is available the row is
 *     REPORTED but NOT renamed (never invent a name).
 *   - Customer org name → a linked site's clean name, else that site's PDF
 *     file name. Otherwise reported, not renamed.
 *   - Any sibling free-text column on a flagged row that is itself a schema
 *     echo (address, city, state, postalCode, contactName, contactPhone,
 *     notes, and the summary's client/building name) is nulled/cleared.
 *
 * It only ever touches rows whose NAME is an echo — a normal record with clean
 * data is never modified. Genuine names like "String Lighting Co" are not
 * matched (see server/_core/schemaEcho.ts).
 *
 * Usage:
 *   pnpm cleanup:schema-echo-names:dry     # default — report only, no writes
 *   pnpm cleanup:schema-echo-names         # apply fixes (--fix)
 *   tsx scripts/cleanupSchemaEchoNames.ts --company 1 [--fix]
 *
 * Runs against whatever DATABASE_URL points at — preview with the dry run first.
 */

import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, or, sql } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { isSchemaEcho } from "../server/_core/schemaEcho.js";
import { config } from "dotenv";

config();

interface CleanupArgs {
  companyId: number;
  fix: boolean;
}

export function parseArgs(argv = process.argv.slice(2)): CleanupArgs {
  const args: CleanupArgs = { companyId: 1, fix: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company": args.companyId = parseInt(argv[++i], 10); break;
      case "--fix": args.fix = true; break;
      case "--dry-run": args.fix = false; break; // explicit alias; dry is the default
      case "--": break;
      default:
        if (argv[i].startsWith("--")) {
          console.error(`Unknown option: ${argv[i]}`);
          process.exit(1);
        }
    }
  }
  return args;
}

/**
 * Turn a Drive file name into a human site name: drop the extension, swap
 * underscores for spaces, collapse whitespace. Exported for testing.
 */
export function fileNameToSiteName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pick a replacement name for a junk-named site, in confidence order. Returns
 * null when nothing trustworthy is available (caller then reports, not renames).
 * Exported + pure for testing.
 */
export function pickSiteName(opts: {
  pdfFileName: string | null;
  summaryBuildingName: string | null;
  fileNumber: string | null;
  buildingId: string | null;
}): string | null {
  const fromPdf = opts.pdfFileName ? fileNameToSiteName(opts.pdfFileName) : "";
  if (fromPdf && !isSchemaEcho(fromPdf)) return fromPdf;
  if (opts.summaryBuildingName && !isSchemaEcho(opts.summaryBuildingName)) {
    return opts.summaryBuildingName.trim();
  }
  if (opts.fileNumber && opts.fileNumber.trim()) {
    return `Site #${opts.fileNumber.trim().replace(/^#/, "")}`;
  }
  if (opts.buildingId && !isSchemaEcho(opts.buildingId)) return opts.buildingId.trim();
  return null;
}

// Free-text site columns that carry the same echoed junk and should be cleared.
const SITE_TEXT_COLUMNS = [
  "address", "city", "state", "postalCode", "contactName", "contactPhone", "notes",
] as const;

interface SiteFixReport {
  id: number;
  oldName: string;
  newName: string | null; // null = could not derive, reported only
  clearedColumns: string[];
  summaryScrubbed: boolean;
}

interface OrgFixReport {
  id: number;
  oldName: string;
  newName: string | null;
}

async function main() {
  const args = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL is not set in .env");
    process.exit(1);
  }
  if (!dbUrl.startsWith("mysql://") && !dbUrl.startsWith("mysql2://")) {
    console.error("ERROR: DATABASE_URL must be a mysql:// or mysql2:// connection string");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Cleanup schema-echo names`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company : ${args.companyId}`);
  console.log(`  mode    : ${args.fix ? "FIX (writing changes)" : "DRY RUN (no writes)"}`);
  console.log();

  const db = drizzle(dbUrl, { schema, mode: "default" });

  // Prefilter with SQL (cheap), then confirm with isSchemaEcho in JS so we never
  // touch a legitimate "String …" name that merely shares the prefix.
  const echoPrefilter = (col: any) =>
    or(sql`${col} LIKE 'string%'`, sql`LOWER(${col}) = 'null'`);

  // ── Sites ─────────────────────────────────────────────────────────────────
  const candidateSites = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.companyId, args.companyId), echoPrefilter(schema.sites.name)));
  const junkSites = candidateSites.filter((s) => isSchemaEcho(s.name));

  const siteReports: SiteFixReport[] = [];
  for (const site of junkSites) {
    // Earliest imported PDF attachment for this site (matches importer fallback).
    const pdfAttachments = await db
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.entityType, "site"),
          eq(schema.attachments.entityId, site.id),
          eq(schema.attachments.mimeType, "application/pdf"),
        ),
      )
      .orderBy(schema.attachments.createdAt);
    const pdfFileName = pdfAttachments[0]?.fileName ?? null;

    const summary = (site.summary ?? null) as schema.SiteSummary | null;
    const newName = pickSiteName({
      pdfFileName,
      summaryBuildingName: summary?.building?.name ?? null,
      fileNumber: site.fileNumber ?? null,
      buildingId: site.buildingId ?? null,
    });

    const clearedColumns = SITE_TEXT_COLUMNS.filter((c) => isSchemaEcho((site as any)[c]));

    // Scrub echoed names inside the summary JSON too.
    let summaryScrubbed = false;
    let nextSummary = summary;
    if (summary) {
      nextSummary = JSON.parse(JSON.stringify(summary)) as schema.SiteSummary;
      if (nextSummary.building && isSchemaEcho(nextSummary.building.name)) {
        nextSummary.building.name = newName ?? "";
        summaryScrubbed = true;
      }
      if (nextSummary.client && isSchemaEcho(nextSummary.client.name)) {
        nextSummary.client.name = "";
        summaryScrubbed = true;
      }
    }

    siteReports.push({ id: site.id, oldName: site.name, newName, clearedColumns, summaryScrubbed });

    if (args.fix) {
      const patch: Record<string, unknown> = {};
      if (newName) patch.name = newName;
      for (const c of clearedColumns) patch[c] = null;
      if (summaryScrubbed) patch.summary = nextSummary;
      if (Object.keys(patch).length > 0) {
        await db.update(schema.sites).set(patch).where(eq(schema.sites.id, site.id));
      }
    }
  }

  // ── Customer orgs ───────────────────────────────────────────────────────────
  const candidateOrgs = await db
    .select()
    .from(schema.customerOrgs)
    .where(and(eq(schema.customerOrgs.companyId, args.companyId), echoPrefilter(schema.customerOrgs.name)));
  const junkOrgs = candidateOrgs.filter((o) => isSchemaEcho(o.name));

  const orgReports: OrgFixReport[] = [];
  for (const org of junkOrgs) {
    const orgSites = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.customerOrgId, org.id));

    // Prefer a linked site that already has a clean name.
    let newName: string | null =
      orgSites.map((s) => s.name).find((n) => !isSchemaEcho(n))?.trim() ?? null;

    // Otherwise derive from a linked site's PDF attachment.
    if (!newName) {
      for (const s of orgSites) {
        const pdf = await db
          .select()
          .from(schema.attachments)
          .where(
            and(
              eq(schema.attachments.entityType, "site"),
              eq(schema.attachments.entityId, s.id),
              eq(schema.attachments.mimeType, "application/pdf"),
            ),
          )
          .orderBy(schema.attachments.createdAt);
        const candidate = pdf[0]?.fileName ? fileNameToSiteName(pdf[0].fileName) : "";
        if (candidate && !isSchemaEcho(candidate)) {
          newName = candidate;
          break;
        }
      }
    }

    orgReports.push({ id: org.id, oldName: org.name, newName });

    if (args.fix && newName) {
      await db.update(schema.customerOrgs).set({ name: newName }).where(eq(schema.customerOrgs.id, org.id));
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  const line = "─".repeat(60);
  console.log(`Sites flagged: ${siteReports.length}`);
  console.log(line);
  for (const r of siteReports) {
    const rename = r.newName ? `→ "${r.newName}"` : "→ (no confident name — NOT renamed, needs manual fix)";
    console.log(`  site #${r.id}: "${r.oldName}" ${rename}`);
    if (r.clearedColumns.length) console.log(`      cleared columns: ${r.clearedColumns.join(", ")}`);
    if (r.summaryScrubbed) console.log(`      summary JSON scrubbed`);
  }
  if (siteReports.length === 0) console.log("  none");

  console.log();
  console.log(`Customer orgs flagged: ${orgReports.length}`);
  console.log(line);
  for (const r of orgReports) {
    const rename = r.newName ? `→ "${r.newName}"` : "→ (no confident name — NOT renamed, needs manual fix)";
    console.log(`  org  #${r.id}: "${r.oldName}" ${rename}`);
  }
  if (orgReports.length === 0) console.log("  none");

  const unresolved =
    siteReports.filter((r) => !r.newName).length + orgReports.filter((r) => !r.newName).length;
  console.log();
  console.log(line);
  if (args.fix) {
    console.log(`Applied fixes to ${siteReports.length} site(s) and ${orgReports.filter((r) => r.newName).length} org(s).`);
  } else {
    console.log(`DRY RUN — no changes written. Re-run with --fix to apply.`);
  }
  if (unresolved > 0) {
    console.log(`⚠ ${unresolved} row(s) had no confident replacement name — rename those by hand in the UI.`);
  }
  console.log();

  process.exit(0);
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
