/**
 * lib/import/normalize.ts
 * Shared string normalization helpers for the building summary import pipeline.
 */

/** Lowercase, strip common punctuation, collapse whitespace */
export function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,;:'"!?()\[\]{}\/\\@#%&*+=<>|~`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a building/file ID.
 * "#0007" → "7", "#0330-1" → "03301", "ABC" → "abc"
 */
export function normBldg(s: string): string {
  const stripped = s.replace(/^\s*#\s*/, '').trim();
  const a = stripped.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^\d+$/.test(a) ? String(parseInt(a, 10)) : a;
}

/** Lowercase, strip punctuation noise, collapse whitespace */
export function normAddress(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,#]+/g, ' ')
    .replace(/\b(?:suite|ste|unit|apt)\b\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-overlap score between two normalized names (0–1).
 * Ignores common corporate stop-words and tokens ≤ 2 chars.
 */
export function tokenOverlap(a: string, b: string): number {
  const stop = new Set(['inc', 'ltd', 'llc', 'corp', 'co', 'the', 'and', 'of', 'for', 'de', 'la']);
  const tokenize = (s: string) =>
    new Set(s.split(' ').filter(t => t.length > 2 && !stop.has(t)));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.max(ta.size, tb.size);
}

export interface AddressComponents {
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

/** Parse a free-form address string into components. */
export function parseAddressComponents(address: string): AddressComponents {
  const canadianPC = /\b([A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d)\b/;
  const usZip = /\b(\d{5}(?:-\d{4})?)\b/;

  let remainder = address.trim().replace(/\s+/g, ' ');
  let postalCode: string | undefined;

  const caMatch = canadianPC.exec(remainder);
  if (caMatch) {
    postalCode = caMatch[1].toUpperCase().replace(/\s+/, ' ');
    remainder = remainder.replace(caMatch[0], '').trim().replace(/,\s*$/, '');
  } else {
    const usMatch = usZip.exec(remainder);
    if (usMatch) {
      postalCode = usMatch[1];
      remainder = remainder.replace(usMatch[0], '').trim().replace(/,\s*$/, '');
    }
  }

  const parts = remainder.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return { postalCode };

  const streetAddress = parts[0] || undefined;
  if (parts.length === 1) return { streetAddress, postalCode };

  const tail = parts.slice(1).join(', ');
  const stateMatch = /\b([A-Za-z]{2})\s*$/.exec(tail);
  if (stateMatch) {
    const state = stateMatch[1].toUpperCase();
    const city = tail.slice(0, stateMatch.index).replace(/[,\s]+$/, '').trim() || undefined;
    return { streetAddress, city, state, postalCode };
  }

  return { streetAddress, city: tail || undefined, postalCode };
}
