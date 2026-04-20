/**
 * lib/import/report.ts
 * Build, print, and optionally serialize the import report.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ParsedSheet } from './pdfParser.js';
import type { OrgResolution } from './matchCustomerOrg.js';
import type { SiteResolution } from './matchSite.js';

export interface ImportRecord {
  filename: string;
  parsed: ParsedSheet;
  orgResolution: OrgResolution | null;
  siteResolution: SiteResolution | null;
}

export interface ImportReport {
  dryRun: boolean;
  totalPdfs: number;
  parsedOk: number;
  parseFailures: Array<{ filename: string; reason: string }>;
  orgsMatchedExact: number;
  orgsMatchedFuzzy: number;
  orgsToCreate: string[];
  sitesMatched: number;
  sitesToCreate: number;
  sitesToUpdate: number;
  conflicts: Array<{ filename: string; reason: string }>;
  unresolved: Array<{ filename: string; reason: string }>;
  records: ImportRecord[];
}

export function buildReport(records: ImportRecord[], dryRun: boolean): ImportReport {
  const report: ImportReport = {
    dryRun,
    totalPdfs: records.length,
    parsedOk: records.filter(r => !r.parsed.parseError).length,
    parseFailures: records
      .filter(r => r.parsed.parseError)
      .map(r => ({ filename: r.filename, reason: r.parsed.parseError! })),
    orgsMatchedExact: 0,
    orgsMatchedFuzzy: 0,
    orgsToCreate: [],
    sitesMatched: 0,
    sitesToCreate: 0,
    sitesToUpdate: 0,
    conflicts: [],
    unresolved: [],
    records,
  };

  for (const rec of records) {
    if (rec.parsed.parseError) continue;

    const org = rec.orgResolution;
    if (org?.kind === 'matched') {
      if (org.confidence === 'exact') report.orgsMatchedExact++;
      else report.orgsMatchedFuzzy++;
    } else if (org?.kind === 'create') {
      if (!report.orgsToCreate.includes(org.name)) report.orgsToCreate.push(org.name);
    } else if (org?.kind === 'unresolved') {
      report.unresolved.push({ filename: rec.filename, reason: org.reason });
      continue;
    }

    const site = rec.siteResolution;
    if (site?.kind === 'matched') report.sitesMatched++;
    else if (site?.kind === 'create') report.sitesToCreate++;
    else if (site?.kind === 'conflict') {
      report.conflicts.push({
        filename: rec.filename,
        reason: `file # matches site id=${site.existingSite.id} ("${site.existingSite.name}") under org ${site.conflictOrgId}`,
      });
    } else if (site?.kind === 'unresolved') {
      report.unresolved.push({ filename: rec.filename, reason: site.reason });
    }
  }

  return report;
}

const SEP = '─'.repeat(62);

export function printReport(report: ImportReport): void {
  const mode = report.dryRun ? 'DRY RUN' : 'LIVE RUN';
  console.log(`\n${SEP}`);
  console.log(`  Building Summary Import  [${mode}]`);
  console.log(SEP);
  console.log(`  PDFs found            : ${report.totalPdfs}`);
  console.log(`  PDFs parsed OK        : ${report.parsedOk}`);
  console.log(`  Parse failures        : ${report.parseFailures.length}`);
  console.log(SEP);
  console.log(`  Orgs matched (exact)  : ${report.orgsMatchedExact}`);
  console.log(`  Orgs matched (fuzzy)  : ${report.orgsMatchedFuzzy}`);
  console.log(`  Orgs to create        : ${report.orgsToCreate.length}`);
  console.log(SEP);
  console.log(`  Sites matched         : ${report.sitesMatched}`);
  console.log(`  Sites to create       : ${report.sitesToCreate}`);
  console.log(`  Sites to update       : ${report.sitesToUpdate}`);
  console.log(`  Conflicts (cross-org) : ${report.conflicts.length}`);
  console.log(`  Unresolved            : ${report.unresolved.length}`);
  console.log(SEP);

  if (report.parseFailures.length > 0) {
    console.log('\nParse failures:');
    for (const f of report.parseFailures)
      console.log(`  [PARSE-FAIL]  ${f.filename}: ${f.reason}`);
  }

  if (report.orgsToCreate.length > 0) {
    console.log('\nOrgs to create:');
    for (const name of report.orgsToCreate)
      console.log(`  [CREATE-ORG]  "${name}"`);
  }

  if (report.conflicts.length > 0) {
    console.log('\nConflicts:');
    for (const c of report.conflicts)
      console.log(`  [CONFLICT]    ${c.filename}: ${c.reason}`);
  }

  if (report.unresolved.length > 0) {
    console.log('\nUnresolved:');
    for (const u of report.unresolved)
      console.log(`  [UNRESOLVED]  ${u.filename}: ${u.reason}`);
  }

  // List sites to create (capped at 50)
  const toCreate = report.records.filter(
    r => r.siteResolution?.kind === 'create' && r.orgResolution?.kind !== 'unresolved'
  );
  if (toCreate.length > 0) {
    console.log(`\nSites to create (${toCreate.length} total${toCreate.length > 50 ? ', first 50 shown' : ''}):`);
    for (const rec of toCreate.slice(0, 50)) {
      const fn = rec.parsed.fileNumber ?? '?';
      const name = rec.parsed.buildingName ?? rec.parsed.filename.replace(/\.pdf$/i, '');
      const org =
        rec.orgResolution?.kind === 'matched'
          ? `"${rec.orgResolution.org.name}"`
          : rec.orgResolution?.kind === 'create'
          ? `[NEW] "${rec.orgResolution.name}"`
          : '?';
      console.log(`  [CREATE-SITE] ${fn.padEnd(8)} "${name}" → org ${org}`);
    }
    if (toCreate.length > 50) console.log(`  ... and ${toCreate.length - 50} more`);
  }

  console.log('');
}

/** Write a JSON report to disk, omitting raw PDF text to keep file size small. */
export function writeJsonReport(report: ImportReport, outPath: string): void {
  const dir = dirname(outPath);
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
  const slim = {
    ...report,
    records: report.records.map(r => ({
      ...r,
      parsed: { ...r.parsed, rawText: '[omitted]' },
    })),
  };
  writeFileSync(outPath, JSON.stringify(slim, null, 2), 'utf8');
  console.log(`JSON report → ${outPath}`);
}
