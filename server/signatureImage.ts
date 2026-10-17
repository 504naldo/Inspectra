import { TRPCError } from "@trpc/server";
import { fetchAuthorizedStorageImage } from "./pdfSharedStyles";

/** Resolve captured signature evidence without changing stored URLs or seal data.
 * Call only for a canonical stored job signature after authorizing its parent.
 * URL-only historical captures retain their unknown key; no key is inferred.
 * A recorded signature must be retrievable before a report can be published.
 */
export async function resolveSignatureImageForPdf(signature: {
  fileKey?: string | null;
  fileUrl?: string | null;
}): Promise<Buffer | undefined> {
  if (!signature.fileKey && !signature.fileUrl) return undefined;
  try {
    // The wrapper validates fresh signer output before allowing configured
    // private storage. Known-key failures never fall back to an old stored URL.
    const buffer = await fetchAuthorizedStorageImage(signature);
    if (buffer?.length) return buffer;
  } catch {
    // Do not expose signed URLs, object names, or storage credentials in errors.
  }
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "The captured signature could not be retrieved. The report was not generated; review the signature record before retrying.",
  });
}
