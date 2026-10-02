import { storageGet } from "./storage";
/** Resolve at point of use: only keyless legacy records may use a stored URL. */
export async function resolveDocumentUrl(document: {
  fileKey?: string | null;
  fileUrl?: string | null;
}) {
  return document.fileKey
    ? (await storageGet(document.fileKey)).url
    : (document.fileUrl ?? null);
}
