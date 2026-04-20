/**
 * lib/import/extractSummarySheet.ts
 *
 * Parse a building summary sheet PDF into structured fields.
 *
 * Two document formats:
 *   Format 2 (structured)  — contains "Spec Sheet Creation Date:"
 *     • Columns rendered on single header lines:
 *       "Name of Client: Name of Building or Site:"
 *       "Billing Address: Site Address:"
 *       "Contact Name(s): Contact Phone:"
 *     • Address block splits at the first Canadian postal code line.
 *
 *   Format 1 (legacy) — TrueType font warnings, no creation-date marker
 *     • Values appear BEFORE their labels (right-column reads before label row).
 *     • Client + building concatenated on one line after "Name of Client:".
 *     • Billing after "Billing Address:"; site address extracted from the
 *       address block that precedes the "Email:" label.
 */

export interface ParsedSheet {
  filename: string;
  /** BLDG ID from PDF content — the canonical building reference number */
  fileNumber?: string;
  clientName?: string;
  buildingName?: string;
  siteAddress?: string;
  billingAddress?: string;
  contactName?: string;
  contactPhone?: string;
  rawText: string;
  parseError?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CA_POSTAL_RE = /\b([A-Z]\d[A-Z]\s*\d[A-Z]\d)\b/;

const STRONG_SUFFIX_RE =
  /\b(limited\s*partnership|l\.p\.|ltd\.?|inc\.?|corp\.?|llc\.?|l\.l\.c\.?|limited)\s*/gi;
const WEAK_SUFFIX_RE =
  /\b(properties|holdings|management|services|realty|group|association|strata|club|ventures|enterprises)\s*/gi;

// These patterns indicate a false split: the matched suffix is just the start of a longer word
// (e.g., "Corp" inside "Corporation" → remainder "oration"; "Inc" inside "Incorporated" → "orporated")
const SUFFIX_CONTINUATION_RE = /^(oration|orporation|orporated|imited|ncorporated)\b/i;

const LABEL_RE =
  /^(billing address|site address|contact name|email|fax|position|for office use|service schedule|service items|items|locations|estimate|building year|technician|scheduling|keys|credit status|special requests|agreement expires|acquired date|fire safety plan|monitoring|elevator|booster|repair budget|relay disconnect|signal disconnect|standpipe|quantity of low points|dry sprinkler|wet sprinkler|fire hydrant|kitchen systems|fire extinguishers|fire alarm|fire panel|number of in-suites|cross connections)\b/i;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function parseSummarySheet(
  buffer: Buffer,
  filename: string
): Promise<ParsedSheet> {
  let rawText = '';
  try {
    const mod = await import('pdf-parse');
    const pdfParse = (mod as any).default ?? mod;
    const result = await pdfParse(buffer);
    rawText = (result.text as string) ?? '';
  } catch (err: any) {
    return { filename, rawText: '', parseError: `pdf-parse: ${err?.message ?? err}` };
  }

  if (!rawText.trim()) {
    return { filename, rawText, parseError: 'No text extracted — possibly scanned/image PDF' };
  }

  const fileNumber = extractBldgId(rawText);
  const isStructured = rawText.includes('Spec Sheet Creation Date:');

  const partial = isStructured
    ? parseStructured(rawText, filename)
    : parseLegacy(rawText, filename);

  return { filename, rawText, fileNumber, ...partial };
}

// ─── BLDG ID ──────────────────────────────────────────────────────────────────

function extractBldgId(text: string): string | undefined {
  const m = /BLDG\s+ID\s+#?\s*(\w+)/i.exec(text);
  if (m) return m[1].replace(/^0+(?=\d)/, '') || m[1];
  const f = /\bFile\s+#\s*:?\s*(\d+)/i.exec(text);
  if (f) return f[1].replace(/^0+(?=\d)/, '') || f[1];
  return undefined;
}

// ─── Client / building split ──────────────────────────────────────────────────

/**
 * Split a potentially concatenated "ClientNameBuildingName" string.
 * Returns [clientName, buildingName | undefined].
 */
function splitClientBuilding(raw: string): [string, string | undefined] {
  const s = raw.trim();
  if (!s) return [s, undefined];

  // Deduplication: "FOO BAR FOO BAR" (two-column PDF reads same value twice)
  const cl = s.toLowerCase().replace(/\s+/g, ' ');
  for (let delta = -3; delta <= 3; delta++) {
    const cut = Math.floor(cl.length / 2) + delta;
    if (cut <= 4 || cut >= cl.length - 1) continue;
    const a = cl.slice(0, cut).trim();
    const b = cl.slice(cut).trim();
    if (a.length >= 5 && a === b) {
      return [s.slice(0, cut).trim(), undefined];
    }
  }

  // Strong corporate suffixes — find last occurrence not at end of string
  let best: number | null = null;
  STRONG_SUFFIX_RE.lastIndex = 0;
  for (const m of s.matchAll(STRONG_SUFFIX_RE)) {
    const end = m.index! + m[0].length;
    if (end >= s.length - 2) continue;
    const remainder = s.slice(end).trim();
    // Skip if remainder looks like a suffix word-continuation (e.g. "oration" in "Corporation")
    if (SUFFIX_CONTINUATION_RE.test(remainder)) continue;
    best = end;
  }
  if (best !== null) {
    return [s.slice(0, best).trim(), s.slice(best).trim() || undefined];
  }

  // Weak suffixes — find first occurrence not at end of string
  WEAK_SUFFIX_RE.lastIndex = 0;
  for (const m of s.matchAll(WEAK_SUFFIX_RE)) {
    const end = m.index! + m[0].length;
    if (end < s.length - 2) {
      const remainder = s.slice(end).trim();
      // Don't split if remainder is just another company suffix (e.g. "Holdings Ltd.")
      if (/^(ltd|inc|corp|llc|limited)\.?\s*$/i.test(remainder)) continue;
      return [s.slice(0, end).trim(), remainder || undefined];
    }
  }

  return [s, undefined];
}

// ─── Address helpers ──────────────────────────────────────────────────────────

/**
 * Join address lines into a single string.
 * Ordinal suffixes split onto their own line (e.g. "2\nnd") are appended
 * directly to the previous token; all other lines are joined with spaces.
 */
function joinAddrLines(lines: string[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^(st|nd|rd|th)$/i.test(line) && parts.length > 0) {
      parts[parts.length - 1] += line;
    } else {
      parts.push(line);
    }
  }
  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

/** @deprecated use joinAddrLines */
const mergeLines = joinAddrLines;

/** Return the index of the first line containing a Canadian postal code. */
function firstPostalIndex(lines: string[]): number {
  return lines.findIndex(l => CA_POSTAL_RE.test(l));
}

// ─── Phone / contact helpers ──────────────────────────────────────────────────

const PHONE_RE = /\b(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}(?:\s*(?:x|ext)\.?\s*\d+)?)/;

function extractContact(block: string): { name?: string; phone?: string } {
  const firstLine = block
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0 && !LABEL_RE.test(l));
  if (!firstLine) return {};

  const pm = PHONE_RE.exec(firstLine);
  if (pm) {
    const name = firstLine.slice(0, pm.index).trim().replace(/\s+$/, '').replace(/[,\-]\s*$/, '') || undefined;
    return { name, phone: pm[1] };
  }

  // Name on this line, phone may follow on next line
  const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const phoneIdx = lines.findIndex(l => PHONE_RE.test(l));
  const name = firstLine || undefined;
  const phone = phoneIdx >= 0 ? PHONE_RE.exec(lines[phoneIdx])![1] : undefined;
  return { name, phone };
}

// ─── Format 2 (Structured) ────────────────────────────────────────────────────

function parseStructured(text: string, _filename: string): Partial<ParsedSheet> {
  const result: Partial<ParsedSheet> = {};

  // ── Client + Building ─────────────────────────────────────────────────────
  const clientHeader = 'Name of Client: Name of Building or Site:';
  const billingHeader = 'Billing Address: Site Address:';
  const ciStart = text.indexOf(clientHeader);
  const ciEnd = text.indexOf(billingHeader);

  if (ciStart >= 0 && ciEnd > ciStart) {
    const block = text.slice(ciStart + clientHeader.length, ciEnd);
    const blockLines = block
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.includes('@') && !/^Invoice:/i.test(l) && !LABEL_RE.test(l));

    if (blockLines.length === 1) {
      const [client, building] = splitClientBuilding(blockLines[0]);
      result.clientName = client || undefined;
      result.buildingName = building;
    } else if (blockLines.length >= 2) {
      result.clientName = blockLines[0];
      result.buildingName = blockLines.slice(1).join(' ') || undefined;
    } else if (blockLines.length === 0 && block.trim()) {
      result.clientName = block.trim().replace(/\n/g, ' ').slice(0, 120);
    }
  }

  // ── Billing + Site address ────────────────────────────────────────────────
  const addrStart = text.indexOf(billingHeader);
  const addrEnd = text.search(/\bContact\s+Name/i);

  if (addrStart >= 0) {
    const end = addrEnd > addrStart ? addrEnd : addrStart + 600;
    const block = text.slice(addrStart + billingHeader.length, end);
    const blockLines = block
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const pcIdx = firstPostalIndex(blockLines);

    if (pcIdx >= 0) {
      const billingLines = blockLines.slice(0, pcIdx + 1);
      const siteLines = blockLines.slice(pcIdx + 1);
      result.billingAddress = joinAddrLines(billingLines) || undefined;
      if (siteLines.length > 0) result.siteAddress = joinAddrLines(siteLines) || undefined;
    } else {
      result.billingAddress = joinAddrLines(blockLines) || undefined;
    }
  }

  // ── File # override from FOR OFFICE USE section ───────────────────────────
  const foIdx = text.search(/FOR\s+OFFICE\s+USE/i);
  if (foIdx >= 0) {
    const foBlock = text.slice(foIdx, foIdx + 300);
    const fm = /File\s+#\s*:?\s*(\d+)/i.exec(foBlock);
    if (fm) result.fileNumber = fm[1].replace(/^0+(?=\d)/, '') || fm[1];
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  const contactHeader = text.search(/Contact\s+Name\(s\)\s*:\s*Contact\s+Phone\s*:/i);
  if (contactHeader >= 0) {
    const contactBlock = text.slice(
      contactHeader,
      text.indexOf('\n\n', contactHeader + 1) < 0
        ? contactHeader + 400
        : text.indexOf('\n\n', contactHeader + 1)
    );
    const { name, phone } = extractContact(contactBlock.replace(/Contact\s+Name.*?Contact\s+Phone\s*:/i, ''));
    result.contactName = name;
    result.contactPhone = phone;
  }

  return result;
}

// ─── Format 1 (Legacy) ────────────────────────────────────────────────────────

function parseLegacy(text: string, _filename: string): Partial<ParsedSheet> {
  const result: Partial<ParsedSheet> = {};

  // ── Client + Building ─────────────────────────────────────────────────────
  const clientLabelIdx = text.indexOf('Name of Client:');
  if (clientLabelIdx >= 0) {
    const after = text.slice(clientLabelIdx + 'Name of Client:'.length);
    const valueLine = after
      .split('\n')
      .map(l => l.trim())
      .find(l => l.length > 0 && !LABEL_RE.test(l));

    if (valueLine) {
      const [client, building] = splitClientBuilding(valueLine);
      result.clientName = client || undefined;
      result.buildingName = building;
    }
  }

  // ── Billing address ───────────────────────────────────────────────────────
  const billingIdx = text.indexOf('Billing Address:');
  if (billingIdx >= 0) {
    const afterBilling = text.slice(billingIdx + 'Billing Address:'.length);
    const billingLines: string[] = [];
    for (const line of afterBilling.split('\n').map(l => l.trim())) {
      if (!line) continue;
      if (LABEL_RE.test(line) || /^Position\b/i.test(line)) break;
      billingLines.push(line);
      if (CA_POSTAL_RE.test(line)) break; // stop at postal code
    }
    result.billingAddress = mergeLines(billingLines) || undefined;
  }

  // ── Site address ──────────────────────────────────────────────────────────
  result.siteAddress = extractLegacySiteAddress(text, result.billingAddress);

  // ── Contacts ──────────────────────────────────────────────────────────────
  const contactNamesIdx = text.search(/\bContact\s+Names?\s*:/i);
  if (contactNamesIdx >= 0) {
    const contactBlock = text.slice(contactNamesIdx, contactNamesIdx + 400);
    const { name, phone } = extractContact(contactBlock.replace(/\bContact\s+Names?\s*:/i, ''));
    result.contactName = name;
    result.contactPhone = phone;
  }

  return result;
}

// ─── Address component helpers ────────────────────────────────────────────────

function isAddrComponent(l: string): boolean {
  return (
    CA_POSTAL_RE.test(l) ||
    /\b(BC|AB|ON|QC|SK|MB|NS|NB|YT|NT|NU|PE|NL)\b/.test(l) ||
    /^\d{2,}\s+[A-Za-z]/.test(l) ||  // "1045 HARO STREET"
    /^#\s*\d/.test(l)                 // "#130 – 12011 ..."
    // Intentionally no STREET/AVE keyword — too many false positives from company names
  );
}

function isNonAddrLine(l: string): boolean {
  return (
    LABEL_RE.test(l) ||
    /^(SPECIAL|SCHEDULE|ANNUAL|WINTER|SUMMER|SPRING|FALL|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|MAY|JUNE|JULY|AUG|SEP|OCT|NOV|DEC|JAN|FEB|MAR|APR)\b/i.test(l) ||
    l.includes('@') ||
    /\bHRS?\b|\bTECHS?\b|\bMINUTES?\b/i.test(l)
  );
}

/**
 * Extract site address from legacy PDFs.
 *
 * Strategy:
 *   1. Find up to 12 non-empty lines immediately before the first "Email:"
 *      (or "Name of Client:" as fallback) anchor.
 *   2. Scan that window for a Canadian postal code, then collect address-like
 *      lines both backward AND forward from it.
 *   3. If no postal code found in the window, fall back to a full-text scan
 *      that looks for any Canadian address block not matching the billing addr.
 */
function extractLegacySiteAddress(text: string, billingAddress?: string): string | undefined {
  const billingNorm = billingAddress ? normalizeForCompare(billingAddress) : '';

  // ── Primary: window before Email: / Name of Client: anchor ───────────────
  let anchorIdx = text.search(/\nEmail\s*:/i);
  if (anchorIdx < 0) anchorIdx = text.search(/\nName\s+of\s+Client\s*:/i);

  if (anchorIdx >= 0) {
    const beforeLines = text
      .slice(0, anchorIdx)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const window = beforeLines.slice(-12);

    const postalPositions: number[] = [];
    window.forEach((l, i) => { if (CA_POSTAL_RE.test(l)) postalPositions.push(i); });

    if (postalPositions.length > 0) {
      const lastPCIdx = postalPositions[postalPositions.length - 1];
      const candidate = buildAddrBlock(window, lastPCIdx);
      if (candidate && (!billingNorm || !normalizeForCompare(candidate).includes(billingNorm.slice(0, 20)))) {
        return candidate;
      }
    } else {
      // No postal code in window — look for address lines (street + province)
      const candidate = extractNoPostalAddr(window, billingNorm);
      if (candidate) return candidate;
    }
  }

  // ── Fallback: full-text postal code scan ──────────────────────────────────
  return extractAddressBlockFromText(text, billingNorm);
}

/** Extract an address from a window that has no postal code (street + city only). */
function extractNoPostalAddr(window: string[], billingNorm: string): string | undefined {
  const addrLines: string[] = [];
  for (let i = window.length - 1; i >= 0; i--) {
    const l = window[i];
    if (isNonAddrLine(l)) break;
    if (isAddrComponent(l)) addrLines.unshift(l);
    else if (addrLines.length > 0) break; // stop at non-addr gap
  }
  if (addrLines.length === 0) return undefined;
  const candidate = joinAddrLines(addrLines);
  if (candidate.length < 8) return undefined;
  if (billingNorm && normalizeForCompare(candidate) === billingNorm) return undefined;
  return candidate;
}

/**
 * Given a window of lines, build an address string centered on the line at
 * `pcIdx` (which contains a Canadian postal code).  Scans both backward
 * (stopping at labels/non-address content) and forward (up to 3 lines).
 */
function buildAddrBlock(window: string[], pcIdx: number): string | undefined {
  const collected: string[] = [window[pcIdx]]; // include postal code line

  // Scan BACKWARD
  for (let i = pcIdx - 1; i >= 0; i--) {
    const line = window[i];
    if (isNonAddrLine(line)) break;
    if (!isAddrComponent(line)) {
      // Stop if we already have a street address line (starts with digits + word)
      if (collected.some(l => /^\d{2,}\s+[A-Za-z]/.test(l))) break;
      continue;
    }
    collected.unshift(line);
    // Once we have a street-address line, stop going further back
    if (/^\d{2,}\s+[A-Za-z]/.test(line)) break;
  }

  // Scan FORWARD (picks up street/city when postal appears first)
  for (let i = pcIdx + 1; i < Math.min(window.length, pcIdx + 4); i++) {
    const line = window[i];
    if (isNonAddrLine(line)) break;
    if (isAddrComponent(line)) collected.push(line);
  }

  const addrLines = collected.filter(l =>
    CA_POSTAL_RE.test(l) ||
    /\b(BC|AB|ON|QC|SK|MB|NS|NB)\b/.test(l) ||
    /^\d{2,}\s+[A-Za-z]/.test(l) ||
    /^#\s*\d/.test(l) ||
    /\b(STREET|AVENUE|AVE|ROAD|DRIVE|WAY|BOULEVARD|BLVD|LANE|PLACE|CRESCENT|BROADWAY|HWY)\b/i.test(l)
  );

  if (addrLines.length === 0) return undefined;
  const result = joinAddrLines(addrLines);
  return result.length >= 8 ? result : undefined;
}

/**
 * Full-text scan: find any Canadian address block (postal + surrounding lines)
 * that doesn't match the billing address.
 */
function extractAddressBlockFromText(text: string, billingNorm: string): string | undefined {
  const allLines = text.split('\n').map(l => l.trim());

  for (let i = 0; i < allLines.length; i++) {
    if (!CA_POSTAL_RE.test(allLines[i])) continue;

    const block: string[] = [];

    // Look back up to 4 lines
    for (let j = Math.max(0, i - 4); j < i; j++) {
      const l = allLines[j];
      if (!l || LABEL_RE.test(l)) continue;
      if (isAddrComponent(l)) block.push(l);
    }
    block.push(allLines[i]); // postal code line

    // Look forward up to 3 lines
    for (let j = i + 1; j <= Math.min(allLines.length - 1, i + 3); j++) {
      const l = allLines[j];
      if (!l || LABEL_RE.test(l)) break;
      if (isAddrComponent(l)) block.push(l);
    }

    if (block.length < 1) continue;
    const candidate = joinAddrLines(block);
    if (candidate.length < 8) continue;

    const candidateNorm = normalizeForCompare(candidate);
    if (billingNorm && (candidateNorm === billingNorm || billingNorm.includes(candidateNorm.slice(0, 15)))) continue;

    return candidate;
  }

  return undefined;
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}
