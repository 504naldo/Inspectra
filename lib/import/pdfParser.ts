/**
 * lib/import/pdfParser.ts
 *
 * Extract structured fields from a building summary sheet PDF buffer.
 * Uses pdf-parse for text extraction then regex-based field matching.
 *
 * The parser tries multiple patterns per field and accepts the first match
 * that produces a non-empty, plausible-length value. It never throws on
 * partial data — missing fields are just undefined.
 */

export interface ParsedSheet {
  filename: string;
  /** FILE # / BLDG ID, e.g. "#0007" */
  fileNumber?: string;
  /** Name of Client / Account */
  clientName?: string;
  /** Name of Building or Site */
  buildingName?: string;
  /** Site / service address */
  siteAddress?: string;
  /** Billing / mailing address */
  billingAddress?: string;
  /** On-site contact name */
  contactName?: string;
  /** Contact phone number */
  contactPhone?: string;
  /** Raw extracted text (for debugging) */
  rawText: string;
  /** Set when text extraction or parsing failed */
  parseError?: string;
}

type FieldKey = Exclude<keyof ParsedSheet, 'filename' | 'rawText' | 'parseError'>;

const FIELD_RULES: Array<{ field: FieldKey; patterns: RegExp[] }> = [
  {
    field: 'fileNumber',
    patterns: [
      /(?:file\s*(?:number|#|no\.?)|bldg\.?\s*(?:id|#|no\.?)|building\s*(?:id|#))\s*[:\-]?\s*([#\w][\w\-\.]*)/i,
      /\bfile\s*#\s*[:\-]?\s*([#\w][\w\-\.]*)/i,
      // Stand-alone #NNNN on its own line
      /(?:^|\n)\s*(#\d[\w\-\.]*)\s*(?:\n|$)/m,
    ],
  },
  {
    field: 'clientName',
    patterns: [
      /name\s+of\s+client\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /client(?:\s+name)?\s*[:\-]\s*(.+?)(?:\r?\n|$)/i,
      /account(?:\s+name)?\s*[:\-]\s*(.+?)(?:\r?\n|$)/i,
      /customer(?:\s+name)?\s*[:\-]\s*(.+?)(?:\r?\n|$)/i,
      /owner(?:\s+name)?\s*[:\-]\s*(.+?)(?:\r?\n|$)/i,
    ],
  },
  {
    field: 'buildingName',
    patterns: [
      /name\s+of\s+(?:building|site|building\s+or\s+site|building\s*\/\s*site)\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /(?:building|site|property)\s+name\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /building\s*[:\-]\s*(.+?)(?:\r?\n|$)/i,
    ],
  },
  {
    field: 'siteAddress',
    patterns: [
      /site\s+address\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /service\s+address\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /property\s+address\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /location\s+address\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
    ],
  },
  {
    field: 'billingAddress',
    patterns: [
      /billing\s+address\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /mailing\s+address\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
      /invoice\s+(?:to\s+)?address\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i,
    ],
  },
  {
    field: 'contactName',
    patterns: [
      /(?:on[-\s]?site\s+)?contact(?:\s+(?:name|person))?\s*[:\-]\s*(.+?)(?:\r?\n|$)/i,
      /(?:property\s+)?manager(?:\s+name)?\s*[:\-]\s*(.+?)(?:\r?\n|$)/i,
    ],
  },
  {
    field: 'contactPhone',
    patterns: [
      /(?:contact\s+)?(?:phone|tel\.?|telephone)\s*(?:number|#)?\s*[:\-]\s*([\d\s()\-\.+ext]+?)(?:\r?\n|$)/i,
    ],
  },
];

function extractField(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const val = m[1].trim().replace(/\s+/g, ' ').replace(/[:\-]\s*$/, '');
      if (val.length > 0 && val.length < 300) return val;
    }
  }
  return undefined;
}

export async function parseSummarySheet(
  buffer: Buffer,
  filename: string
): Promise<ParsedSheet> {
  let rawText = '';

  try {
    // pdf-parse is CommonJS; dynamic import handles the boundary cleanly
    const mod = await import('pdf-parse');
    const pdfParse = (mod as any).default ?? mod;
    const result = await pdfParse(buffer);
    rawText = (result.text as string) ?? '';
  } catch (err: any) {
    return {
      filename,
      rawText: '',
      parseError: `pdf-parse error: ${err?.message ?? String(err)}`,
    };
  }

  if (!rawText.trim()) {
    return {
      filename,
      rawText,
      parseError: 'No text extracted — PDF may be image-only/scanned',
    };
  }

  const sheet: ParsedSheet = { filename, rawText };
  for (const rule of FIELD_RULES) {
    const val = extractField(rawText, rule.patterns);
    if (val) (sheet as any)[rule.field] = val;
  }

  return sheet;
}
