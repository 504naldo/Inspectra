// Centralized image resolution for server-side PDF generation.
//
// Attachment rows carry two locations for their file:
//   • fileKey — the permanent S3/R2 object key (NOT NULL on attachments)
//   • fileUrl — a PRESIGNED download URL captured at upload time
//
// The presigned fileUrl expires (see PRESIGN_EXPIRES_SECONDS in storage.ts —
// 7 days). Reports are frequently regenerated long after a photo was uploaded
// (a customer re-downloads an annual report months later), at which point the
// stored fileUrl is dead and the photo silently vanishes from the PDF.
//
// resolveAttachmentImageForPdf() fixes this by minting a FRESH signed URL from
// the durable fileKey at generation time, and only falling back to the stored
// fileUrl when no key is available. Fetching still goes through the SSRF-guarded
// fetchImageBuffer, so protection is preserved. Failures are reported (never
// silently treated as an embedded image) via a structured result plus a log
// line that identifies the attachment/report internally WITHOUT leaking the
// fileKey, signed URL, bucket, or any storage credential.

import { storageGet } from "./storage";
import { fetchImageBuffer } from "./pdfSharedStyles";

/** Minimal shape needed to resolve an attachment's image — a subset of the row. */
export interface PdfAttachmentInput {
  id?: number | null;
  /** Durable S3/R2 object key. Preferred source: re-signed at generation time. */
  fileKey?: string | null;
  /** Presigned URL stored at upload time; may be expired. Fallback only. */
  fileUrl?: string | null;
  entityType?: string | null;
  entityId?: number | null;
}

export type ResolveImageResult =
  | { ok: true; buffer: Buffer; source: "fresh-key" | "stored-url" }
  | { ok: false; reason: "no-source" | "fetch-failed" };

export interface ResolveImageOptions {
  /**
   * Opaque internal reference for log correlation (e.g. "job EWF-123 def#45").
   * MUST NOT contain secrets — it is only written to server logs.
   */
  reportRef?: string;
  /** Injectable for testing. Defaults to a fresh presigned GET URL from storage. */
  signKey?: (key: string) => Promise<string>;
  /** Injectable for testing. Defaults to the SSRF-guarded image fetch. */
  fetchBuffer?: (url: string) => Promise<Buffer | undefined>;
}

/**
 * Build a short, secret-free label identifying which attachment failed. Prefers
 * the attachment id, then the entity it hangs off. Never includes fileKey,
 * fileUrl, bucket, or paths.
 */
function attachmentLabel(a: PdfAttachmentInput): string {
  if (a.id != null) return `attachment#${a.id}`;
  if (a.entityType && a.entityId != null) return `${a.entityType}#${a.entityId}`;
  return "attachment(unidentified)";
}

/**
 * Emit a safe warning. Only the error's constructor name is logged (e.g.
 * "CredentialsProviderError") — never its message, which can embed the bucket
 * or signed URL for storage/SDK errors.
 */
function warnImage(
  stage: string,
  a: PdfAttachmentInput,
  reportRef: string | undefined,
  err?: unknown,
): void {
  const ref = reportRef ? `${reportRef} ` : "";
  const errName = err instanceof Error ? ` (${err.name})` : "";
  console.warn(`[pdf-image] ${ref}${attachmentLabel(a)}: ${stage}${errName}`);
}

const defaultSignKey = async (key: string): Promise<string> => (await storageGet(key)).url;

/**
 * Resolve an attachment to an image Buffer for embedding in a PDF.
 *
 * Order of preference:
 *   1. fileKey present → mint a FRESH signed URL and fetch it.
 *   2. otherwise / if signing fails → fall back to the stored fileUrl.
 *
 * Returns a discriminated result so callers can distinguish "embedded" from
 * "failed" and record the failure — a failed image is NEVER returned as a
 * successful buffer. Never throws: storage/network problems degrade to
 * { ok: false }, so a missing photo can't abort report generation and no live
 * storage credentials are required for the failure path.
 */
export async function resolveAttachmentImageForPdf(
  attachment: PdfAttachmentInput,
  options: ResolveImageOptions = {},
): Promise<ResolveImageResult> {
  const signKey = options.signKey ?? defaultSignKey;
  const fetchBuffer = options.fetchBuffer ?? fetchImageBuffer;
  const reportRef = options.reportRef;

  // 1. Prefer a fresh signed URL derived from the durable key.
  let url: string | undefined;
  let source: "fresh-key" | "stored-url" = "fresh-key";
  const key = attachment.fileKey?.trim();
  if (key) {
    try {
      url = await signKey(key);
    } catch (err) {
      // Signing unavailable (e.g. storage creds absent) — try the stored URL.
      warnImage("sign-failed", attachment, reportRef, err);
    }
  }

  // 2. Fall back to the stored (possibly expired) presigned URL.
  if (!url) {
    const stored = attachment.fileUrl?.trim();
    if (stored) {
      url = stored;
      source = "stored-url";
    }
  }

  if (!url) {
    warnImage("no-source", attachment, reportRef);
    return { ok: false, reason: "no-source" };
  }

  const buffer = await fetchBuffer(url); // SSRF-guarded, returns undefined on failure
  if (!buffer) {
    warnImage("fetch-failed", attachment, reportRef);
    return { ok: false, reason: "fetch-failed" };
  }

  return { ok: true, buffer, source };
}
