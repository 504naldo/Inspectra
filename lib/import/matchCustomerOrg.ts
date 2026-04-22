/**
 * lib/import/matchCustomerOrg.ts
 *
 * Resolve a parsed client name to an existing customerOrg row,
 * or decide to create a new org, or mark as unresolved.
 *
 * Confidence tiers:
 *   exact  — normalized names match exactly
 *   fuzzy  — token overlap ≥ 0.75, exactly one candidate
 *   create — no match found, --create-missing-orgs is set
 *   unresolved — ambiguous (multiple fuzzy candidates) or no match without create flag
 */

import { normName, tokenOverlap } from './normalize.js';

export interface OrgRecord {
  id: number;
  name: string;
}

export type OrgResolution =
  | { kind: 'matched'; org: OrgRecord; confidence: 'exact' | 'fuzzy'; score?: number }
  | { kind: 'create'; name: string }
  | { kind: 'unresolved'; reason: string };

const FUZZY_THRESHOLD = 0.75;

export function resolveOrg(
  clientName: string | undefined,
  existingOrgs: OrgRecord[],
  createMissing: boolean
): OrgResolution {
  if (!clientName?.trim()) {
    return { kind: 'unresolved', reason: 'missing client name' };
  }

  const input = clientName.trim();
  const norm = normName(input);

  // Exact normalized match
  const exact = existingOrgs.find(o => normName(o.name) === norm);
  if (exact) {
    return { kind: 'matched', org: exact, confidence: 'exact' };
  }

  // Fuzzy: token overlap
  const candidates = existingOrgs
    .map(o => ({ org: o, score: tokenOverlap(norm, normName(o.name)) }))
    .filter(c => c.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 1) {
    return { kind: 'matched', org: candidates[0].org, confidence: 'fuzzy', score: candidates[0].score };
  }

  if (candidates.length > 1) {
    const top = candidates
      .slice(0, 3)
      .map(c => `"${c.org.name}" (${Math.round(c.score * 100)}%)`)
      .join(', ');
    return {
      kind: 'unresolved',
      reason: `ambiguous org match for "${input}" — ${candidates.length} candidates: ${top}`,
    };
  }

  if (createMissing) {
    return { kind: 'create', name: input };
  }

  return {
    kind: 'unresolved',
    reason: `no matching org for "${input}" — use --create-missing-orgs to create it`,
  };
}
