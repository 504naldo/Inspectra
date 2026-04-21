/**
 * scripts/importSitesFromSummarySheets.ts
 *
 * Import customer orgs and sites from a directory of building summary sheet PDFs.
 *
 * Default PDF source: ./client/src/data/Building Summary Sheets
 *
 * Dry run (always safe — no DB writes):
 *   pnpm exec tsx scripts/importSitesFromSummarySheets.ts \
 *     --company 1 --dry-run --create-missing-orgs \
 *     --json-report ./tmp/import-report.json
 *
 * Live (strict mode ON by default — hard-aborts if quality gates fail):
 *   pnpm exec tsx scripts/importSitesFromSummarySheets.ts \
 *     --company 1 --create-missing-orgs --update-existing-sites
 *
 * Quality gates (enforced in strict mode):
 *   orgs-to-create > 25  |  suspicious org names > 5
 *   conflicts > 25       |  unresolved > 10
 *
 * Sidecar files written during every dry run (and on gate failure):
 *   ./tmp/import-summary-suspicious.json
 *   ./tmp/import-summary-review.json
 */

import { config } from 'dotenv';
config();

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
import { buildReport, writeJsonReport } from '../lib/import/report.js';
import type { ImportRecord, ImportReport } from '../lib/import/report.js';
import { parseAddressComponents, normName } from '../lib/import/normalize.js';

// ─── PDF loaders ──────────────────────────────────────────────────────────────

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

// ─── Suspicious org detection ─────────────────────────────────────────────────

const FIELD_LABELS = new Set([
  'name of building or site', 'name of building or site:',
  'client name', 'client name:', 'building name', 'building name:',
  'contact name', 'contact name:', 'site name', 'site name:',
  'customer name', 'customer name:', 'company name', 'company name:',
  'property name', 'property name:', 'account name', 'account name:',
  'owner name', 'owner name:', 'tenant name', 'tenant name:',
]);

const INVOICE_PATTERNS: RegExp[] = [
  /\binvoice\b/i,
  /\bbilling\b/i,
  /\bplease\s+(send|remit|pay)\b/i,
  /\bnet\s*\d+\b/i,
  /\bdue\s+(?:upon\s+receipt|on)\b/i,
  /\bpayable\s+to\b/i,
  /\bpurchase\s+order\b/i,
  /\bp\.?\s*o\.?\s*#/i,
  /\bacct?\s*#/i,
  /\bremit\s+to\b/i,
];

const STREET_SUFFIX_RE =
  /\b(?:st(?:reet)?|ave(?:nue)?|blvd|boulevard|rd|road|dr(?:ive)?|ln|lane|way|ct|court|pl(?:ace)?|cir(?:cle)?|terr(?:ace)?|pkwy|parkway|hwy|highway)\b/i;

function isSuspiciousOrgName(name: string): { suspicious: boolean; reason?: string } {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.length < 3) {
    return { suspicious: true, reason: 'name too short' };
  }

  if (/^[\d\s\-.,#/()\[\]]+$/.test(trimmed)) {
    return { suspicious: true, reason: 'only digits/punctuation — likely noise' };
  }

  if (FIELD_LABELS.has(lower)) {
    return { suspicious: true, reason: 'matches a PDF field label' };
  }

  // House number + street suffix = address, not a company name
  if (/^\d+\s+\w/.test(trimmed) && STREET_SUFFIX_RE.test(trimmed)) {
    return { suspicious: true, reason: 'looks like a street address' };
  }

  // Postal codes don't belong in org names
  if (/\b\d{5}(?:-\d{4})?\b/.test(trimmed) || /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i.test(trimmed)) {
    return { suspicious: true, reason: 'contains postal code — address data in name field' };
  }

  for (const re of INVOICE_PATTERNS) {
    if (re.test(trimmed)) {
      return { suspicious: true, reason: 'contains invoice/billing language' };
    }
  }

  // Duplicated concatenated value: "Acme Corp" → "Acme CorpAcme Corp" or "Acme Corp Acme Corp"
  for (let split = 4; split <= trimmed.length - 4; split++) {
    const a = trimmed.slice(0, split).trim();
    const b = trimmed.slice(split).trim();
    if (a.length >= 4 && a === b) {
      return { suspicious: true, reason: 'duplicated concatenated value' };
    }
  }

  // High noise ratio: few alphabetic characters
  const noSpace = trimmed.replace(/\s+/g, '');
  const alphaCount = (noSpace.match(/[a-zA-Z]/g) ?? []).length;
  if (noSpace.length > 0 && alphaCount / noSpace.length < 0.4) {
    return { suspicious: true, reason: 'too noisy — low alphabetic character ratio' };
  }

  return { suspicious: false };
}

// ─── Record bucketing ─────────────────────────────────────────────────────────

type RecordBucket = 'safe' | 'review' | 'blocked';

interface ClassifiedRecord {
  rec: ImportRecord;
  bucket: RecordBucket;
  blockReason?: string;
}

function classifyRecord(rec: ImportRecord): ClassifiedRecord {
  if (rec.parsed.parseError) {
    return { rec, bucket: 'blocked', blockReason: `parse error: ${rec.parsed.parseError}` };
  }

  const org = rec.orgResolution;
  const site = rec.siteResolution;

  if (org?.kind === 'unresolved') {
    return { rec, bucket: 'blocked', blockReason: org.reason };
  }

  if (site?.kind === 'conflict') {
    return {
      rec,
      bucket: 'blocked',
      blockReason: `file# matches site id=${site.existingSite.id} ("${site.existingSite.name}") under org ${site.conflictOrgId}`,
    };
  }

  if (site?.kind === 'unresolved') {
    return { rec, bucket: 'blocked', blockReason: site.reason };
  }

  // Fuzzy org match or new org creation — human should verify before live run
  if (org?.kind === 'create' || (org?.kind === 'matched' && org.confidence === 'fuzzy')) {
    return { rec, bucket: 'review' };
  }

  return { rec, bucket: 'safe' };
}

// ─── Quality gates ─────────────────────────────────────────────────────────────

interface QualityGateResult {
  pass: boolean;
  violations: string[];
}

const GATE_LIMITS = {
  orgsToCreate: 25,
  suspicious: 5,
  conflicts: 25,
  unresolved: 10,
} as const;

function checkQualityGates(report: ImportReport, suspiciousCount: number): QualityGateResult {
  const violations: string[] = [];

  if (report.orgsToCreate.length > GATE_LIMITS.orgsToCreate) {
    violations.push(
      `orgs-to-create = ${report.orgsToCreate.length} (limit ${GATE_LIMITS.orgsToCreate}) — inspect org list before proceeding`
    );
  }
  if (suspiciousCount > GATE_LIMITS.suspicious) {
    violations.push(
      `suspicious org names = ${suspiciousCount} (limit ${GATE_LIMITS.suspicious}) — clean the dataset first`
    );
  }
  if (report.conflicts.length > GATE_LIMITS.conflicts) {
    violations.push(
      `conflicts = ${report.conflicts.length} (limit ${GATE_LIMITS.conflicts}) — too many cross-org file-number conflicts`
    );
  }
  if (report.unresolved.length > GATE_LIMITS.unresolved) {
    violations.push(
      `unresolved = ${report.unresolved.length} (limit ${GATE_LIMITS.unresolved}) — too many rows without a valid org`
    );
  }

  return { pass: violations.length === 0, violations };
}

// ─── Bucketed report ──────────────────────────────────────────────────────────

const SEP = '─'.repeat(66);

function printBucketedReport(
  classified: ClassifiedRecord[],
  suspiciousCount: number,
  gates: QualityGateResult,
  strict: boolean,
  dryRun: boolean,
): void {
  const safe    = classified.filter(c => c.bucket === 'safe');
  const review  = classified.filter(c => c.bucket === 'review');
  const blocked = classified.filter(c => c.bucket === 'blocked');
  const mode    = dryRun ? 'DRY RUN' : 'LIVE RUN';

  console.log(`\n${SEP}`);
  console.log(`  Building Summary Import  [${mode}]`);
  console.log(SEP);
  console.log(`  Total records          : ${classified.length}`);
  console.log(`  Suspicious org names   : ${suspiciousCount}`);
  console.log(SEP);

  console.log(`\n  [SAFE] ${safe.length} records — exact match, ready to apply`);
  for (const c of safe.slice(0, 30)) {
    const fn   = (c.rec.parsed.fileNumber ?? '?').padEnd(7);
    const bldg = (c.rec.parsed.buildingName ?? c.rec.filename.replace(/\.pdf$/i, '')).slice(0, 30).padEnd(32);
    const org  = c.rec.orgResolution?.kind === 'matched' ? `"${c.rec.orgResolution.org.name}"` : '?';
    const site = c.rec.siteResolution?.kind === 'matched' ? 'match'
      : c.rec.siteResolution?.kind === 'create' ? 'create' : '?';
    console.log(`    ${fn} ${bldg} org=${org}  site=${site}`);
  }
  if (safe.length > 30) console.log(`    ... and ${safe.length - 30} more`);

  console.log(`\n  [REVIEW] ${review.length} records — fuzzy org match or new org (verify before live run)`);
  for (const c of review.slice(0, 50)) {
    const fn   = (c.rec.parsed.fileNumber ?? '?').padEnd(7);
    const bldg = (c.rec.parsed.buildingName ?? c.rec.filename.replace(/\.pdf$/i, '')).slice(0, 30).padEnd(32);
    const orgLabel =
      c.rec.orgResolution?.kind === 'create'
        ? `[NEW] "${c.rec.orgResolution.name}"`
        : c.rec.orgResolution?.kind === 'matched'
        ? `[FUZZY] "${c.rec.orgResolution.org.name}"`
        : '?';
    console.log(`    ${fn} ${bldg} ${orgLabel}`);
  }
  if (review.length > 50) console.log(`    ... and ${review.length - 50} more`);

  console.log(`\n  [BLOCKED] ${blocked.length} records — will not be imported`);
  for (const c of blocked.slice(0, 50)) {
    console.log(`    ${c.rec.filename}: ${c.blockReason}`);
  }
  if (blocked.length > 50) console.log(`    ... and ${blocked.length - 50} more`);

  console.log(`\n${SEP}`);
  if (gates.pass) {
    console.log(`  Quality gates: PASS${strict ? ' (strict)' : ''}`);
  } else {
    const liveNote = dryRun
      ? (strict ? ' — live run would be BLOCKED' : ' — live run would proceed (not strict)')
      : (strict ? ' — ABORTING' : ' — proceeding (strict disabled)');
    console.log(`  Quality gates: FAIL${liveNote}`);
    for (const v of gates.violations) console.log(`    x ${v}`);
  }
  console.log(SEP);
}

// ─── Sidecar JSON exports ─────────────────────────────────────────────────────

function exportSidecars(classified: ClassifiedRecord[]): void {
  mkdirSync('./tmp', { recursive: true });

  const suspicious = classified
    .filter(c => c.bucket === 'blocked' && c.blockReason?.toLowerCase().includes('suspicious'))
    .map(c => ({
      filename:     c.rec.filename,
      clientName:   c.rec.parsed.clientName,
      fileNumber:   c.rec.parsed.fileNumber,
      buildingName: c.rec.parsed.buildingName,
      reason:       c.blockReason,
    }));

  const reviewNeeded = classified
    .filter(c => c.bucket === 'review')
    .map(c => ({
      filename:          c.rec.filename,
      clientName:        c.rec.parsed.clientName,
      fileNumber:        c.rec.parsed.fileNumber,
      buildingName:      c.rec.parsed.buildingName,
      orgResolutionKind: c.rec.orgResolution?.kind,
      orgDetail:
        c.rec.orgResolution?.kind === 'create'
          ? c.rec.orgResolution.name
          : c.rec.orgResolution?.kind === 'matched'
          ? `${c.rec.orgResolution.org.name} (${c.rec.orgResolution.confidence})`
          : 'unknown',
    }));

  writeFileSync(
    './tmp/import-summary-suspicious.json',
    JSON.stringify(suspicious, null, 2),
    'utf8',
  );
  writeFileSync(
    './tmp/import-summary-review.json',
    JSON.stringify(reviewNeeded, null, 2),
    'utf8',
  );

  console.log(`\nSidecar exports:`);
  console.log(`  suspicious (${suspicious.length})  -> ./tmp/import-summary-suspicious.json`);
  console.log(`  review     (${reviewNeeded.length})  -> ./tmp/import-summary-review.json`);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

interface CliArgs {
  companyId: number;
  dirPath: string | null;
  zipPath: string | null;
  dryRun: boolean;
  createMissingOrgs: boolean;
  updateExistingSites: boolean;
  jsonReport?: string;
  /** null = auto: true for live runs, false for dry runs */
  strict: boolean | null;
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
    strict: null,
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
      case '--strict':                args.strict = true; break;
      case '--no-strict':             args.strict = false; break;
    }
  }
  if (!args.dirPath && !args.zipPath) {
    args.dirPath = './client/src/data/Building Summary Sheets';
  }
  return args;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  // Strict defaults ON for live runs, OFF for dry runs
  const strict = args.strict !== null ? args.strict : !args.dryRun;

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`\nDRY RUN — no DB writes${strict ? '  [--strict preview]' : ''}\n`);
  } else {
    console.log(
      `\nLIVE RUN${strict
        ? '  [strict — quality gates enforced]'
        : '  [--no-strict — quality gates bypassed]'
      }\n`
    );
  }

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });

  // ── 1. Load PDFs ──────────────────────────────────────────────────────────────
  const sourceLabel = args.zipPath ?? args.dirPath!;
  console.log(`Loading PDFs from: ${sourceLabel}`);
  let pdfEntries: PdfEntry[];
  try {
    pdfEntries = args.zipPath ? loadFromZip(args.zipPath) : loadFromDir(args.dirPath!);
  } catch (err: any) {
    console.error(`Failed to load source: ${err?.message ?? err}`);
    process.exit(1);
  }
  console.log(`Found ${pdfEntries.length} PDF(s)\n`);

  // ── 2. Parse each PDF ─────────────────────────────────────────────────────────
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

  // ── 3. Load existing DB state ─────────────────────────────────────────────────
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

  // ── 4. Resolve each sheet ─────────────────────────────────────────────────────
  const orgsInContext: OrgRecord[] = [...existingOrgs];
  let nextPlaceholderId = -1;
  const placeholderByNorm = new Map<string, OrgRecord>();
  const records: ImportRecord[] = [];
  const suspiciousOrgNames: Array<{ name: string; reason: string }> = [];

  for (const parsed of parsedSheets) {
    if (parsed.parseError) {
      records.push({ filename: parsed.filename, parsed, orgResolution: null, siteResolution: null });
      continue;
    }

    let orgRes = resolveOrg(parsed.clientName, orgsInContext, args.createMissingOrgs);

    if (orgRes.kind === 'create') {
      const nameToCreate = orgRes.name;
      const suspCheck = isSuspiciousOrgName(nameToCreate);

      if (suspCheck.suspicious) {
        // Reject: don't add to context, don't create in live mode
        suspiciousOrgNames.push({ name: nameToCreate, reason: suspCheck.reason! });
        orgRes = {
          kind: 'unresolved',
          reason: `suspicious org name ("${nameToCreate}"): ${suspCheck.reason}`,
        };
      } else {
        const key = normName(nameToCreate);
        const existing = placeholderByNorm.get(key);
        if (existing) {
          orgRes = { kind: 'matched', org: existing, confidence: 'exact' };
        } else {
          const placeholder: OrgRecord = { id: nextPlaceholderId--, name: nameToCreate };
          placeholderByNorm.set(key, placeholder);
          orgsInContext.push(placeholder);
        }
      }
    }

    const orgId =
      orgRes.kind === 'matched' ? orgRes.org.id :
      orgRes.kind === 'create'  ? (placeholderByNorm.get(normName(parsed.clientName!))?.id ?? null) :
      null;

    const siteRes = orgId !== null ? resolveSite(parsed, orgId, existingSites) : null;

    records.push({ filename: parsed.filename, parsed, orgResolution: orgRes, siteResolution: siteRes });
  }

  // ── 5. Build report, classify records, check quality gates ────────────────────
  const report     = buildReport(records, args.dryRun);
  const classified = records.map(rec => classifyRecord(rec));
  const gates      = checkQualityGates(report, suspiciousOrgNames.length);

  // ── 6. Print bucketed report ──────────────────────────────────────────────────
  printBucketedReport(classified, suspiciousOrgNames.length, gates, strict, args.dryRun);

  if (args.jsonReport) writeJsonReport(report, args.jsonReport);

  // ── 7. Export sidecars in dry run, or whenever gates fail ─────────────────────
  if (args.dryRun || !gates.pass) {
    exportSidecars(classified);
  }

  if (args.dryRun) {
    console.log('\nDry run complete.');
    if (!gates.pass) {
      console.log('  Quality gates FAILED — fix the issues above before running live.');
    }
    process.exit(0);
  }

  // ── 8. Hard-abort on quality gate failure (strict mode) ───────────────────────
  if (strict && !gates.pass) {
    console.error('\nABORTED — quality gates failed. Fix the issues or re-run with --no-strict.');
    process.exit(1);
  }

  if (!gates.pass) {
    console.warn('\nWARNING — quality gates failed but strict mode is off. Proceeding anyway.\n');
  }

  // ── 9. Live writes ─────────────────────────────────────────────────────────────
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
      // Ensure org exists (create placeholder orgs that passed suspicion checks)
      let orgId: number;
      if (rec.orgResolution.kind === 'matched') {
        orgId = rec.orgResolution.org.id;
        if (orgId < 0) {
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

      // Create or update site
      if (rec.siteResolution.kind === 'create') {
        const addrComp        = rec.parsed.siteAddress    ? parseAddressComponents(rec.parsed.siteAddress)    : {};
        const billingAddrComp = rec.parsed.billingAddress ? parseAddressComponents(rec.parsed.billingAddress) : {};

        const summary: SiteSummary = {
          client:   rec.parsed.clientName   ? { name: rec.parsed.clientName }   : undefined,
          building: rec.parsed.buildingName ? { name: rec.parsed.buildingName } : undefined,
          address:  addrComp.streetAddress
            ? {
                street:     addrComp.streetAddress,
                city:       addrComp.city,
                state:      addrComp.state,
                postalCode: addrComp.postalCode,
              }
            : undefined,
          billing: rec.parsed.billingAddress
            ? {
                address:    billingAddrComp.streetAddress ?? rec.parsed.billingAddress,
                city:       billingAddrComp.city,
                state:      billingAddrComp.state,
                postalCode: billingAddrComp.postalCode,
              }
            : undefined,
          contacts:
            rec.parsed.contactName || rec.parsed.contactPhone
              ? [{ name: rec.parsed.contactName, phone: rec.parsed.contactPhone }]
              : undefined,
        };

        await (db as any).insert(schema.sites).values({
          companyId:    args.companyId,
          customerOrgId: orgId,
          name:         rec.parsed.buildingName ?? rec.parsed.filename.replace(/\.pdf$/i, '').trim(),
          address:      rec.parsed.siteAddress  ?? undefined,
          city:         addrComp.city           ?? undefined,
          state:        addrComp.state          ?? undefined,
          postalCode:   addrComp.postalCode      ?? undefined,
          contactName:  rec.parsed.contactName   ?? undefined,
          contactPhone: rec.parsed.contactPhone  ?? undefined,
          fileNumber:   rec.parsed.fileNumber    ?? undefined,
          buildingId:   rec.parsed.fileNumber    ?? undefined,
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
          if (c.city)       updates.city       = c.city;
          if (c.state)      updates.state      = c.state;
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
    `\nDone: ${orgsCreated} orgs created, ${sitesCreated} sites created, ` +
    `${sitesUpdated} sites updated, ${errors} errors`
  );
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
