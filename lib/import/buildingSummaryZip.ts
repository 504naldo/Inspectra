/**
 * lib/import/buildingSummaryZip.ts
 *
 * Load PDF buffers from either a ZIP archive or a directory of loose PDFs.
 */

import AdmZip from 'adm-zip';
import { statSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface PdfEntry {
  filename: string;
  relativePath: string;
  buffer: Buffer;
}

/**
 * Load PDFs from a ZIP file or a directory.
 * Returns entries sorted by relativePath.
 */
export function loadSummaryPdfs(source: string): PdfEntry[] {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(source);
  } catch {
    throw new Error(`Source not found: ${source}`);
  }

  if (stat.isDirectory()) {
    return readdirSync(source)
      .filter(f => f.toLowerCase().endsWith('.pdf') && !f.startsWith('._'))
      .sort()
      .map(f => ({
        filename: f,
        relativePath: f,
        buffer: readFileSync(join(source, f)),
      }));
  }

  // ZIP file
  const zip = new AdmZip(source);
  const results: PdfEntry[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (!name.toLowerCase().endsWith('.pdf')) continue;
    if (name.includes('__MACOSX') || basename(name).startsWith('._')) continue;

    results.push({
      filename: basename(name),
      relativePath: name,
      buffer: entry.getData(),
    });
  }

  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
