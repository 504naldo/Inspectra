/**
 * scripts/importSitesFromSummarySheets.ts
 *
 * Import customer orgs and sites from a directory of building summary sheet PDFs.
 *
 * Default PDF source: ./client/src/data/Building Summary Sheets
 *
 * Usage (dry run):
 *   pnpm exec tsx scripts/importSitesFromSummarySheets.ts \
 *     --company 1 --dry-run --create-missing-orgs \
 *     --json-report ./tmp/import-report.json
 *
 * Usage (live):
 *   pnpm exec tsx scripts/importSitesFromSummarySheets.ts \
 *     --company 1 --create-missing-orgs --update-existing-sites
 *
 * Idempotent: matching uses file number → address → name in that order.
 * Conservative: unresolved > wrong; never moves a site between orgs.
 */

import { config } from 'dotenv';
config();

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import AdmZip from 'adm-zip';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import type { SiteSummary } from '../drizzle/schema.js';
import type { PdfEntry } from '../lib/import/buildingSummaryZip.js';
import { parseSummarySheet } from '../lib/import/extractSummarySheet.js';
import type { ParsedSheet } from '../lib/import/extractSummarySheet.js';
import { resolveOrg } from '../lib/import/matchCustomerOrg.js';
import type { OrgRecord } from '../lib/import/matchCustomerOrg.js';
import { resolveSite } from '../lib/import/matchSite.js';
import type { SiteRecord } from '../lib/import/matchSite.js';
import { buildReport, printReport, writeJsonReport } from '../lib/import/report.js';
import type { ImportRecord } from '../lib/import/report.js';
import { parseAddressComponents, normName } from '../lib/import/normalize.js';

// ─── PDF loaders ────────────────────────────────────────────────────────────────

function loadFromDir(dirPath: string): PdfEntry[] {
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch (err: any) {
    throw new Error(`Cannot read directory "${dirPath}": ${err?.message ?? err}`);
  }
  return entries
    .filter(f => f.toLowerCase().endsWith('.pdf') && !f.startsWith('._'))
    .sort()
    .map(f => ({ filename: f, relativePath: f, buffer: readFileSync(join(dirPath, f)) }));
}

function loadFromZip(zipPath: string): PdfEntry[] {
  const zip = new AdmZip(zipPath);
  const results: PdfEntry[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (!name.toLowerCase().endsWith('.pdf')) continue;
    if (name.includes('__MACOSX') || basename(name).startsWith('._')) continue;
    results.push({ filename: basename(name), relativePath: name, buffer: entry.getData() });
  }
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

// ─── CLI ────────────────────────────────────────────────────────────────────────

interface CliArgs {
  companyId: number;
  dirPath: string | null;
  zipPath: string | null;
  dryRun: boolean;
  createMissingOrgs: boolean;
  updateExistingSites: boolean;
  jsonReport?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    companyId: 1,
    dirPath: null,
    zipPath: null,
    dryRun: false,
    createMissingOrgs: false,
    updateExistingSites: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--company':               args.companyId = parseInt(argv[++i], 10); break;
      case '--dir':                   args.dirPath = argv[++i]; break;
      case '--zip':                   args.zipPath = argv[++i]; break;
      case '--dry-run':               args.dryRun = true; break;
      case '--create-missing-orgs':   args.createMissingOrgs = true; break;
      case '--update-existing-sites': args.updateExistingSites = true; break;
      case '--json-report':           args.jsonReport = argv[++i]; break;
    }
  }
  // Default to directory mode if neither flag was given
  if (!args.dirPath && !args.zipPath) {
    args.dirPath = './client/src/data/Building Summary Sheets';
  }
  return args;
}

// ─── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  if (args.dryRun) console.log('\nDRY RUN — no DB writes\n');

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });

  // ── 1. Load PDFs ─────────────────────────────────────────────────────────────
  const sourceLabel = args.zipPath ?? args.dirPath!;
  console.log(`Loading PDFs from: ${sourceLabel}`);
  let pdfEntries;
  try {
    pdfEntries = args.zipPath
      ? loadFromZip(args.zipPath)
      : loadFromDir(args.dirPath!);
  } catch (err: any) {
    console.error(`Failed to load source: ${err?.message ?? err}`);
    process.exit(1);
  }
  console.log(`Found ${pdfEntries.length} PDF(s)\n`);

  // ── 2. Parse each PDF ────────────────────────────────────────────────────────
  console.log('Parsing PDFs...');
  const parsedSheets: ParsedSheet[] = [];
  for (const entry of pdfEntries) {
    process.stdout.write(`  ${entry.filename.padEnd(60)} `);
    const sheet = await parseSummarySheet(entry.buffer, entry.filename);
    if (sheet.parseError) {
      process.stdout.write(`FAIL  ${sheet.parseError}\n`);
    } else {
      const fn = (sheet.fileNumber ?? '?').padEnd(6);
      const cl = (sheet.clientName ?? '?').slice(0, 28).padEnd(30);
      const bn = (sheet.buildingName ?? '').slice(0, 20);
      process.stdout.write(`OK    fn=${fn} client=${cl} bldg=${bn}\n`);
    }
    parsedSheets.push(sheet);
  }

  // ── 3. Load existing DB state ────────────────────────────────────────────────
  console.log('\nLoading DB state...');
  const existingOrgs: OrgRecord[] = await (db as any)
    .select({ id: schema.customerOrgs.id, name: schema.customerOrgs.name })
    .from(schema.customerOrgs)
    .where(eq(schema.customerOrgs.companyId, args.companyId));

  const existingSites: SiteRecord[] = await (db as any)
    .select({
      id: schema.sites.id,
      name: schema.sites.name,
      address: schema.sites.address,
      fileNumber: schema.sites.fileNumber,
      buildingId: schema.sites.buildingId,
      customerOrgId: schema.sites.customerOrgId,
    })
    .from(schema.sites)
    .where(eq(schema.sites.companyId, args.companyId));

  console.log(`  ${existingOrgs.length} orgs, ${existingSites.length} sites in DB\n`);

  // ── 4. Resolve each sheet ────────────────────────────────────────────────────
  const orgsInContext: OrgRecord[] = [...existingOrgs];
  let nextPlaceholderId = -1;
  const placeholderByNorm = new Map<string, OrgRecord>();
  const records: ImportRecord[] = [];

  for (const parsed of parsedSheets) {
    if (parsed.parseError) {
      records.push({ filename: parsed.filename, parsed, orgResolution: null, siteResolution: null });
      continue;
    }

    let orgRes = resolveOrg(parsed.clientName, orgsInContext, args.createMissingOrgs);

    if (orgRes.kind === 'create') {
      const key = normName(parsed.clientName!);
      const existing = placeholderByNorm.get(key);
      if (existing) {
        orgRes = { kind: 'matched', org: existing, confidence: 'exact' };
      } else {
        const placeholder: OrgRecord = { id: nextPlaceholderId--, name: parsed.clientName! };
        placeholderByNorm.set(key, placeholder);
        orgsInContext.push(placeholder);
      }
    }

    const orgId =
      orgRes.kind === 'matched' ? orgRes.org.id :
      orgRes.kind === 'create'  ? (placeholderByNorm.get(normName(parsed.clientName!))?.id ?? null) :
      null;

    const siteRes =
      orgId !== null ? resolveSite(parsed, orgId, existingSites) : null;

    records.push({ filename: parsed.filename, parsed, orgResolution: orgRes, siteResolution: siteRes });
  }

  // ── 5. Build & print report ──────────────────────────────────────────────────
  const report = buildReport(records, args.dryRun);
  printReport(report);

  if (args.jsonReport) writeJsonReport(report, args.jsonReport);

  if (args.dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to apply changes.');
    process.exit(0);
  }

  // ── 6. Live writes ───────────────────────────────────────────────────────────
  let orgsCreated = 0, sitesCreated = 0, sitesUpdated = 0, errors = 0;

  const realOrgIdByNorm = new Map<string, number>(
    existingOrgs.map(o => [normName(o.name), o.id])
  );

  for (const rec of records) {
    if (rec.parsed.parseError) continue;
    if (!rec.orgResolution || rec.orgResolution.kind === 'unresolved') continue;
    if (!rec.siteResolution) continue;
    if (rec.siteResolution.kind === 'unresolved' || rec.siteResolution.kind === 'conflict') continue;

    try {
      // ── Ensure org exists ──────────────────────────────────────────────────
      let orgId: number;
      if (rec.orgResolution.kind === 'matched') {
        orgId = rec.orgResolution.org.id;
        if (orgId < 0) {
          // Placeholder — create the org now
          const key = normName(rec.orgResolution.org.name);
          const realId = realOrgIdByNorm.get(key);
          if (!realId) {
            const [res] = await (db as any).insert(schema.customerOrgs).values({
              companyId: args.companyId,
              name: rec.orgResolution.org.name,
            });
            orgId = (res as any).insertId;
            realOrgIdByNorm.set(key, orgId);
            orgsCreated++;
            console.log(`  [ORG CREATED] "${rec.orgResolution.org.name}" (id=${orgId})`);
          } else {
            orgId = realId;
          }
        }
      } else {
        // kind === 'create'
        const key = normName(rec.orgResolution.name);
        const realId = realOrgIdByNorm.get(key);
        if (realId) {
          orgId = realId;
        } else {
          const [res] = await (db as any).insert(schema.customerOrgs).values({
            companyId: args.companyId,
            name: rec.orgResolution.name,
          });
          orgId = (res as any).insertId;
          realOrgIdByNorm.set(key, orgId);
          orgsCreated++;
          console.log(`  [ORG CREATED] "${rec.orgResolution.name}" (id=${orgId})`);
        }
      }

      // ── Create or update site ──────────────────────────────────────────────
      if (rec.siteResolution.kind === 'create') {
        const addrComp = rec.parsed.siteAddress
          ? parseAddressComponents(rec.parsed.siteAddress)
          : {};
        const billingAddrComp = rec.parsed.billingAddress
          ? parseAddressComponents(rec.parsed.billingAddress)
          : {};

        const summary: SiteSummary = {
          client: rec.parsed.clientName ? { name: rec.parsed.clientName } : undefined,
          building: rec.parsed.buildingName ? { name: rec.parsed.buildingName } : undefined,
          address: addrComp.streetAddress
            ? {
                street: addrComp.streetAddress,
                city: addrComp.city,
                state: addrComp.state,
                postalCode: addrComp.postalCode,
              }
            : undefined,
          billing: rec.parsed.billingAddress
            ? {
                address: billingAddrComp.streetAddress ?? rec.parsed.billingAddress,
                city: billingAddrComp.city,
                state: billingAddrComp.state,
                postalCode: billingAddrComp.postalCode,
              }
            : undefined,
          contacts:
            rec.parsed.contactName || rec.parsed.contactPhone
              ? [{ name: rec.parsed.contactName, phone: rec.parsed.contactPhone }]
              : undefined,
        };

        await (db as any).insert(schema.sites).values({
          companyId: args.companyId,
          customerOrgId: orgId,
          name: rec.parsed.buildingName ?? rec.parsed.filename.replace(/\.pdf$/i, '').trim(),
          address: rec.parsed.siteAddress ?? undefined,
          city: addrComp.city ?? undefined,
          state: addrComp.state ?? undefined,
          postalCode: addrComp.postalCode ?? undefined,
          contactName: rec.parsed.contactName ?? undefined,
          contactPhone: rec.parsed.contactPhone ?? undefined,
          fileNumber: rec.parsed.fileNumber ?? undefined,
          buildingId: rec.parsed.fileNumber ?? undefined,
          summary,
        });
        sitesCreated++;
        process.stdout.write('.');

      } else if (rec.siteResolution.kind === 'matched' && args.updateExistingSites) {
        const site = rec.siteResolution.site;
        const updates: Record<string, any> = {};

        if (!site.fileNumber && rec.parsed.fileNumber) updates.fileNumber = rec.parsed.fileNumber;
        if (!site.buildingId && rec.parsed.fileNumber) updates.buildingId = rec.parsed.fileNumber;
        if (!site.address && rec.parsed.siteAddress) {
          updates.address = rec.parsed.siteAddress;
          const c = parseAddressComponents(rec.parsed.siteAddress);
          if (c.city)       updates.city = c.city;
          if (c.state)      updates.state = c.state;
          if (c.postalCode) updates.postalCode = c.postalCode;
        }

        if (Object.keys(updates).length > 0) {
          await (db as any)
            .update(schema.sites)
            .set(updates)
            .where(eq(schema.sites.id, site.id));
          sitesUpdated++;
          process.stdout.write('u');
        }
      }
    } catch (err: any) {
      errors++;
      console.error(`\n  ERROR: ${rec.filename}: ${err?.message ?? err}`);
    }
  }

  if (sitesCreated > 0 || sitesUpdated > 0) console.log('');
  console.log(
    `\nDone: ${orgsCreated} orgs created, ${sitesCreated} sites created, ${sitesUpdated} sites updated, ${errors} errors`
  );
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
