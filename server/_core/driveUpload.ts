import { getValidGoogleToken } from "./googleAuth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/**
 * Find a folder by name under a parent folder. Returns the folder ID or null.
 */
async function findFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string | null> {
  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const response = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as { files: { id: string; name: string }[] };
  return data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Create a folder in Google Drive. Returns the folder ID.
 */
async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Failed to create Drive folder: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Find or create a nested folder path: Root / level1 / level2
 * Returns the innermost folder ID.
 */
async function ensureFolderPath(
  accessToken: string,
  pathSegments: string[]
): Promise<string> {
  let parentId: string | undefined;

  for (const segment of pathSegments) {
    // Clean the segment name (Drive doesn't allow certain characters)
    const cleanName = segment.replace(/[/\\]/g, "-").trim() || "Unnamed";

    const existingId = await findFolder(accessToken, cleanName, parentId);
    if (existingId) {
      parentId = existingId;
    } else {
      parentId = await createFolder(accessToken, cleanName, parentId);
    }
  }

  return parentId!;
}

/**
 * Upload a PDF file to Google Drive in a structured folder hierarchy.
 *
 * Folder structure:
 *   Inspectra Reports / {Customer Org Name} / {Site Name} / filename.pdf
 *
 * Returns the file's web view link.
 */
export async function uploadReportToDrive(opts: {
  userId: number;
  pdfBuffer: Buffer;
  fileName: string;
  customerOrgName: string;
  siteName: string;
}): Promise<{ fileId: string; webViewLink: string } | null> {
  const accessToken = await getValidGoogleToken(opts.userId);
  if (!accessToken) {
    console.warn("[Drive] No valid Google token for user", opts.userId);
    return null;
  }

  try {
    // Ensure folder hierarchy exists
    const folderId = await ensureFolderPath(accessToken, [
      "Inspectra Reports",
      opts.customerOrgName || "Unknown Customer",
      opts.siteName || "Unknown Site",
    ]);

    // Upload the PDF using multipart upload
    const metadata = {
      name: opts.fileName,
      parents: [folderId],
      mimeType: "application/pdf",
    };

    const boundary = "inspectra_drive_boundary_" + Date.now();
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/pdf",
      "Content-Transfer-Encoding: base64",
      "",
      opts.pdfBuffer.toString("base64"),
      `--${boundary}--`,
    ].join("\r\n");

    const response = await fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error("[Drive] Upload failed:", response.status, errorBody);

      if (response.status === 401 || response.status === 403) {
        console.warn(
          "[Drive] Permission denied — ensure the Google Drive API is enabled in Google Cloud Console:\n" +
          "  APIs & Services → Library → Search 'Google Drive API' → Enable\n" +
          "  User may also need to re-login to grant the drive.file scope."
        );
      }
      return null;
    }

    const data = (await response.json()) as {
      id: string;
      webViewLink: string;
    };

    return {
      fileId: data.id,
      webViewLink: data.webViewLink,
    };
  } catch (error) {
    console.error("[Drive] Upload error:", error);
    return null;
  }
}
