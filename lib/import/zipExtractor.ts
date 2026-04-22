/**
 * lib/import/zipExtractor.ts
 * Extract all PDF entries from a ZIP archive.
 */

import AdmZip from 'adm-zip';
import path from 'node:path';

export interface ZipEntry {
  /** Basename of the PDF file */
  filename: string;
  /** Original path within the zip */
  relativePath: string;
  buffer: Buffer;
}

/** Open a ZIP file and return all PDF entries sorted by path. */
export function extractPdfsFromZip(zipPath: string): ZipEntry[] {
  const zip = new AdmZip(zipPath);
  const results: ZipEntry[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (!name.toLowerCase().endsWith('.pdf')) continue;
    // Skip macOS __MACOSX metadata entries
    if (name.includes('__MACOSX') || path.basename(name).startsWith('._')) continue;

    results.push({
      filename: path.basename(name),
      relativePath: name,
      buffer: entry.getData(),
    });
  }

  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
