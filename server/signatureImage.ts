import { TRPCError } from "@trpc/server";
import { storageGet } from "./storage";
import { fetchImageBuffer } from "./pdfSharedStyles";

/** Resolve captured signature evidence without changing stored URLs or seal data.
 * URL-only historical captures retain their unknown key; no key is inferred.
 * A recorded signature must be retrievable before a report can be published.
 */
export async function resolveSignatureImageForPdf(signature: {
  fileKey?: string | null;
  fileUrl?: string | null;
}): Promise<Buffer | undefined> {
  if (!signature.fileKey && !signature.fileUrl) return undefined;
  try {
    // A known key is authoritative: signing failures must not use an old URL.
    const url = signature.fileKey
      ? (await storageGet(signature.fileKey)).url
      : signature.fileUrl!;
    // This retains the normal public-URL/redirect SSRF protection for images.
    const buffer = await fetchImageBuffer(url);
    if (buffer?.length) return buffer;
  } catch {
    // Do not expose signed URLs, object names, or storage credentials in errors.
  }
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "The captured signature could not be retrieved. The report was not generated; review the signature record before retrying.",
  });
}
