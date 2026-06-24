/**
 * driveService.ts
 *
 * Google Drive access layer for the Customer Records feature.
 *
 * All operations are scoped to the folder identified by
 * GOOGLE_DRIVE_CUSTOMER_ROOT_ID.  The service never queries outside that
 * subtree:
 *   - listRootChildren   → `'ROOT_ID' in parents`
 *   - listFolderById     → `'FOLDER_ID' in parents`
 *   - searchInRoot       → `name contains '…' and 'ROOT_ID' in ancestors`
 *
 * Shared Drive support is enabled by setting GOOGLE_DRIVE_USE_SHARED_DRIVE=true
 * (optionally with GOOGLE_DRIVE_SHARED_DRIVE_ID).
 *
 * This module is the only place that calls the Drive API for customer records.
 * The router imports from here; nothing else should.
 */

import { ENV } from "../_core/env.js";
import { escapeDriveQueryValue } from "../_core/driveQuery.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  modifiedTime?: string;
  /** Bytes, as a string (Drive API returns strings for large numbers) */
  size?: string;
  /** Direct link to open in Google Drive — safe to send to the browser */
  webViewLink?: string;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

/** Returns true when a root folder ID has been configured. */
export function isDriveConfigured(): boolean {
  return !!ENV.googleDriveCustomerRootId;
}

/**
 * Extra query-string params required for Shared Drive access.
 * Safe to spread into any files.list call.
 */
function sharedDriveParams(): Record<string, string> {
  if (!ENV.googleDriveUseSharedDrive) return {};
  const extra: Record<string, string> = {
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  };
  if (ENV.googleDriveSharedDriveId) {
    extra.corpora = "drive";
    extra.driveId = ENV.googleDriveSharedDriveId;
  }
  return extra;
}

// ─── Core list helper ─────────────────────────────────────────────────────────

interface ListResult {
  files: DriveEntry[];
  error?: string;
}

/**
 * Paginated files.list call.  Returns all matching files (up to Drive's limit).
 */
async function driveList(
  accessToken: string,
  params: Record<string, string>
): Promise<ListResult> {
  const base = new URL(`${DRIVE_API}/files`);
  for (const [k, v] of Object.entries(params)) base.searchParams.set(k, v);

  const allFiles: DriveEntry[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(base.toString());
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      return { files: [], error: "Network error reaching Google Drive." };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let msg = `Google Drive API error (${res.status})`;
      try {
        const parsed = JSON.parse(body);
        msg = parsed?.error?.message || msg;
      } catch {}
      return { files: [], error: msg };
    }

    const data = (await res.json()) as {
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        modifiedTime?: string;
        size?: string;
        webViewLink?: string;
      }>;
      nextPageToken?: string;
    };

    for (const f of data.files ?? []) {
      allFiles.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
      });
    }
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);

  return { files: allFiles };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List the immediate children of the configured root folder.
 */
export async function listRootChildren(
  accessToken: string
): Promise<{ entries: DriveEntry[]; error?: string }> {
  const rootId = ENV.googleDriveCustomerRootId;
  const { files, error } = await driveList(accessToken, {
    q: `'${escapeDriveQueryValue(rootId)}' in parents and trashed=false`,
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
    orderBy: "folder,name",
    pageSize: "500",
    ...sharedDriveParams(),
  });
  return { entries: files, error };
}

/**
 * List the immediate children of any folder by its Drive ID.
 * The caller (router) is responsible for ensuring folderId was previously
 * returned by this service — it is never constructed from user input directly.
 */
export async function listFolderById(
  folderId: string,
  accessToken: string
): Promise<{ entries: DriveEntry[]; error?: string }> {
  const { files, error } = await driveList(accessToken, {
    q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed=false`,
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
    orderBy: "folder,name",
    pageSize: "500",
    ...sharedDriveParams(),
  });
  return { entries: files, error };
}

/**
 * Full-text search scoped to the customer records root and its entire subtree.
 *
 * Uses `'ROOT_ID' in ancestors` which restricts matches to descendants of root.
 * Returns up to 50 results ordered folder-first.
 */
export async function searchInRoot(
  query: string,
  accessToken: string
): Promise<{ entries: DriveEntry[]; error?: string }> {
  const rootId = ENV.googleDriveCustomerRootId;
  const safeQ = escapeDriveQueryValue(query);
  const { files, error } = await driveList(accessToken, {
    q: `name contains '${safeQ}' and '${escapeDriveQueryValue(rootId)}' in ancestors and trashed=false`,
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
    orderBy: "folder,name",
    pageSize: "50",
    ...sharedDriveParams(),
  });
  return { entries: files, error };
}

/**
 * Download a file by Drive ID.
 * Google Workspace files (Docs, Sheets, etc.) are exported to an appropriate
 * Office format.  Binary files are downloaded as-is.
 * Returns an error string if the file exceeds 50 MB or cannot be fetched.
 */
export async function downloadDriveFile(
  fileId: string,
  accessToken: string
): Promise<
  { data: Buffer; mimeType: string; fileName: string } | { error: string }
> {
  const supportParam = ENV.googleDriveUseSharedDrive
    ? "&supportsAllDrives=true&includeItemsFromAllDrives=true"
    : "";

  // 1. Fetch metadata
  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size${supportParam}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    return { error: "File not found or you do not have access." };
  }
  const meta = (await metaRes.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
  };

  if (meta.size && parseInt(meta.size) > MAX_DOWNLOAD_BYTES) {
    return {
      error: "File exceeds the 50 MB download limit. Open it directly in Google Drive.",
    };
  }

  // 2. Determine download URL
  const isWorkspaceDoc = meta.mimeType.startsWith("application/vnd.google-apps.");
  let downloadUrl: string;
  let fileName = meta.name;
  let mimeType = meta.mimeType;

  if (isWorkspaceDoc) {
    let exportMime: string;
    let ext: string;
    if (meta.mimeType === "application/vnd.google-apps.spreadsheet") {
      exportMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = ".xlsx";
    } else if (meta.mimeType === "application/vnd.google-apps.document") {
      exportMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      ext = ".docx";
    } else {
      exportMime = "application/pdf";
      ext = ".pdf";
    }
    downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}${supportParam}`;
    mimeType = exportMime;
    if (!fileName.toLowerCase().endsWith(ext)) fileName += ext;
  } else {
    downloadUrl = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media${supportParam}`;
  }

  // 3. Download
  const dlRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!dlRes.ok) {
    const body = await dlRes.text().catch(() => "");
    let msg = `Download failed (${dlRes.status})`;
    try {
      msg = JSON.parse(body)?.error?.message || msg;
    } catch {}
    return { error: msg };
  }

  const data = Buffer.from(await dlRes.arrayBuffer());
  return { data, mimeType, fileName };
}
