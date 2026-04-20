/**
 * lib/import/matchSite.ts
 *
 * Resolve a parsed building summary to an existing site row under the given org,
 * or decide to create a new site, or flag a conflict / unresolved case.
 *
 * Matching strategies (in priority order, scoped to org):
 *   1. File number / buildingId  — most reliable identifier
 *   2. Address prefix            — normalized address prefix match
 *   3. Exact building name       — normalized name equality
 *
 * Cross-org conflict: if the file number exists under a DIFFERENT org,
 * we flag it instead of silently attaching to the wrong org.
 */

import { normBldg, normAddress, normName } from './normalize.js';
import type { ParsedSheet } from './pdfParser.js';

export interface SiteRecord {
  id: number;
  name: string;
  address: string | null;
  fileNumber: string | null;
  buildingId: string | null;
  customerOrgId: number;
}

export type SiteResolution =
  | { kind: 'matched'; site: SiteRecord; confidence: 'file-number' | 'address' | 'name' }
  | { kind: 'create' }
  | { kind: 'conflict'; existingSite: SiteRecord; conflictOrgId: number }
  | { kind: 'unresolved'; reason: string };

export function resolveSite(
  parsed: ParsedSheet,
  orgId: number,
  allSites: SiteRecord[]
): SiteResolution {
  const hasBuildingName = !!parsed.buildingName?.trim();
  const hasAddress = !!parsed.siteAddress?.trim();
  const hasFileNumber = !!parsed.fileNumber?.trim();

  if (!hasBuildingName && !hasAddress && !hasFileNumber) {
    return { kind: 'unresolved', reason: 'missing building name, site address, and file number' };
  }

  const normFN = parsed.fileNumber ? normBldg(parsed.fileNumber) : null;
  const normAddr = parsed.siteAddress ? normAddress(parsed.siteAddress) : null;
  const normBN = parsed.buildingName ? normName(parsed.buildingName) : null;

  const orgSites = allSites.filter(s => s.customerOrgId === orgId);

  // Strategy 1: file number match within org
  if (normFN) {
    const byFN = orgSites.filter(
      s =>
        (s.fileNumber && normBldg(s.fileNumber) === normFN) ||
        (s.buildingId && normBldg(s.buildingId) === normFN)
    );
    if (byFN.length === 1) return { kind: 'matched', site: byFN[0], confidence: 'file-number' };
    if (byFN.length > 1) {
      return {
        kind: 'unresolved',
        reason: `ambiguous — ${byFN.length} sites share file # "${parsed.fileNumber}" under this org`,
      };
    }
  }

  // Strategy 2: address prefix match within org (first 20 chars of normalized address)
  if (normAddr && normAddr.length >= 8) {
    const prefix = normAddr.slice(0, 20);
    const byAddr = orgSites.filter(s => s.address && normAddress(s.address).startsWith(prefix));
    if (byAddr.length === 1) return { kind: 'matched', site: byAddr[0], confidence: 'address' };
  }

  // Strategy 3: exact building name match within org
  if (normBN) {
    const byName = orgSites.filter(s => normName(s.name) === normBN);
    if (byName.length === 1) return { kind: 'matched', site: byName[0], confidence: 'name' };
  }

  // Cross-org conflict check — file number exists under a different org
  if (normFN) {
    const crossOrg = allSites.filter(
      s =>
        s.customerOrgId !== orgId &&
        ((s.fileNumber && normBldg(s.fileNumber) === normFN) ||
          (s.buildingId && normBldg(s.buildingId) === normFN))
    );
    if (crossOrg.length > 0) {
      return { kind: 'conflict', existingSite: crossOrg[0], conflictOrgId: crossOrg[0].customerOrgId };
    }
  }

  return { kind: 'create' };
}
