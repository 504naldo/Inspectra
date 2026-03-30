/**
 * Customer Records — Shared Drive Access Layer
 *
 * Provides safe, path-traversal-proof access to a configured root directory
 * that is expected to be the company's customer records share.
 *
 * DEPLOYMENT NOTE:
 * ───────────────
 * Set CUSTOMER_SHARE_ROOT to the local path where the network share is mounted.
 *
 * On-premises Windows server:
 *   CUSTOMER_SHARE_ROOT=\\SERVER\CustomerRecords
 *   (Requires the process user to have read access to the UNC path)
 *
 * Linux / Railway / Docker:
 *   Mount the SMB share with mount.cifs before starting the app:
 *     mount.cifs //SERVER/CustomerRecords /mnt/customer-records \
 *       -o username=$CUSTOMER_SHARE_USERNAME,password=$CUSTOMER_SHARE_PASSWORD,domain=$CUSTOMER_SHARE_DOMAIN
 *   Then set:
 *     CUSTOMER_SHARE_ROOT=/mnt/customer-records
 *
 * If the share is unavailable, all functions return a { error } object and
 * the UI surfaces a clear "Share unavailable" message instead of crashing.
 */

import fs from 'fs/promises';
import path from 'path';
import { ENV } from '../_core/env.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FileEntry {
  /** Display name */
  name: string;
  /** 'file' or 'directory' */
  type: 'file' | 'directory';
  /** Relative path from share root — safe to pass back to backend procedures */
  relativePath: string;
  /** File size in bytes (files only) */
  size?: number;
  /** ISO-8601 last-modified timestamp */
  modifiedAt?: string;
  /** Lower-case extension without dot, e.g. "pdf" */
  extension?: string;
}

export interface ListResult {
  entries: FileEntry[];
  error?: string;
}

export interface ReadResult {
  data: Buffer;
  mimeType: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls':  'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt':  'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.txt':  'text/plain',
  '.csv':  'text/csv',
  '.zip':  'application/zip',
};

function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Returns the canonical, absolute path for `subPath` within the share root,
 * or `null` if the path would escape the root (traversal attempt).
 */
function safePath(subPath: string): string | null {
  const root = ENV.customerShareRoot;
  if (!root) return null;

  // Normalise separators and collapse ".." segments
  const rel   = subPath.replace(/\\/g, '/').replace(/\.\.+/g, '');
  const abs   = path.resolve(root, rel);
  const rootN = path.resolve(root);

  // Must remain strictly within root
  if (!abs.startsWith(rootN + path.sep) && abs !== rootN) return null;
  return abs;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Whether CUSTOMER_SHARE_ROOT is configured at all. */
export function isShareConfigured(): boolean {
  return !!ENV.customerShareRoot;
}

/**
 * List the top-level folders at the share root.
 * Returns folder names only — no full paths.
 */
export async function listRootFolders(): Promise<{ folders: string[]; error?: string }> {
  const root = ENV.customerShareRoot;
  if (!root) return { folders: [], error: 'Customer share is not configured on this server.' };

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return {
      folders: entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b)),
    };
  } catch (err: any) {
    return { folders: [], error: shareErrorMessage(err) };
  }
}

/**
 * Recursively list the contents of a folder.
 * `subPath` is relative to the share root; it is sanitised internally.
 */
export async function listDirectory(subPath: string): Promise<ListResult> {
  const abs = safePath(subPath);
  if (!abs) return { entries: [], error: 'Invalid or unsafe path.' };

  try {
    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const root    = path.resolve(ENV.customerShareRoot!);
    const entries: FileEntry[] = [];

    for (const d of dirents) {
      const fullChild = path.join(abs, d.name);
      const relChild  = path.relative(root, fullChild);
      const entry: FileEntry = {
        name:         d.name,
        type:         d.isDirectory() ? 'directory' : 'file',
        relativePath: relChild.replace(/\\/g, '/'),
      };

      if (!d.isDirectory()) {
        try {
          const stat      = await fs.stat(fullChild);
          entry.size       = stat.size;
          entry.modifiedAt = stat.mtime.toISOString();
          entry.extension  = path.extname(d.name).toLowerCase().replace('.', '');
        } catch {
          // stat failed — skip metadata, still include entry
        }
      }

      entries.push(entry);
    }

    // Directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { entries };
  } catch (err: any) {
    return { entries: [], error: shareErrorMessage(err) };
  }
}

/**
 * Search the root-level folders for names matching `query` (case-insensitive).
 * Useful for finding a customer's folder quickly.
 */
export async function searchFolders(query: string): Promise<{ folders: string[]; error?: string }> {
  const result = await listRootFolders();
  if (result.error) return result;
  const q = query.toLowerCase();
  return {
    folders: result.folders.filter(f => f.toLowerCase().includes(q)),
  };
}

/**
 * Read a file from the share and return its raw Buffer + MIME type.
 * Enforces a 50 MB size cap to protect memory.
 *
 * `subPath` is relative to the share root; it is sanitised internally.
 */
export async function readFile(subPath: string): Promise<ReadResult | { error: string }> {
  const abs = safePath(subPath);
  if (!abs) return { error: 'Invalid or unsafe path.' };

  try {
    const stat = await fs.stat(abs);

    if (stat.isDirectory()) return { error: 'Path is a directory, not a file.' };
    if (stat.size > 50 * 1024 * 1024) {
      return { error: 'File exceeds the 50 MB download limit. Please access it directly on the network share.' };
    }

    const data = await fs.readFile(abs);
    return { data, mimeType: mimeForPath(abs) };
  } catch (err: any) {
    return { error: shareErrorMessage(err) };
  }
}

// ─── Error helpers ────────────────────────────────────────────────────────────

function shareErrorMessage(err: any): string {
  switch (err.code) {
    case 'ENOENT':   return 'Path not found on the network share.';
    case 'EACCES':   return 'Permission denied. Verify the server has read access to the share.';
    case 'ENOTDIR':  return 'Expected a directory but found a file.';
    case 'ETIMEDOUT':
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
      return 'Network share is unreachable. Please check the VPN / network connection.';
    default:
      return `Share access error: ${err.message ?? String(err)}`;
  }
}
