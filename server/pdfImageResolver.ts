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
// resolveAttachmentImageForPdf() fixes this by fetching a FRESH signed URL from
// the durable fileKey at generation time. Only keyless records use fileUrl.
// The shared storage image helper binds fresh URLs to the configured storage
// endpoint and keeps the public-URL guard for keyless records. Failures are
// reported via a structured result plus a log line that identifies the
// attachment/report internally WITHOUT leaking the fileKey, signed URL,
// bucket, or any storage credential.

import { fetchAuthorizedStorageImage } from "./pdfSharedStyles";

/** Minimal shape needed to resolve an attachment's image — a subset of the row. */
export interface PdfAttachmentInput {
  id?: number | null;
  /** Durable S3/R2 object key. Preferred source: re-signed at generation time. */
  fileKey?: string | null;
  /** Presigned URL stored at upload time; used only when no durable key exists. */
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
 * Emit a safe warning without error details, which can embed the bucket or
 * signed URL for storage/SDK errors.
 */
function warnImage(
  stage: string,
  a: PdfAttachmentInput,
  reportRef: string | undefined,
): void {
  const ref = reportRef ? `${reportRef} ` : "";
  console.warn(`[pdf-image] ${ref}${attachmentLabel(a)}: ${stage}`);
}

/**
 * Resolve an attachment to an image Buffer after authorizing its canonical
 * parent. The helper permits private storage only for fresh SDK-signed URLs.
 *
 * Order of preference:
 *   1. fileKey present → mint a FRESH signed URL and fetch it.
 *   2. otherwise → fetch the stored fileUrl with the public-URL guard.
 * A known key remains authoritative when signing or fetching fails.
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
  const reportRef = options.reportRef;
  if (!attachment.fileKey && !attachment.fileUrl) {
    warnImage("no-source", attachment, reportRef);
    return { ok: false, reason: "no-source" };
  }

  try {
    const buffer = await fetchAuthorizedStorageImage({
      fileKey: attachment.fileKey,
      fileUrl: attachment.fileUrl,
    });
    if (buffer?.length) {
      return { ok: true, buffer, source: attachment.fileKey ? "fresh-key" : "stored-url" };
    }
  } catch {
    // Keep this boundary non-throwing even if the shared helper later changes.
  }

  warnImage("fetch-failed", attachment, reportRef);
  return { ok: false, reason: "fetch-failed" };
}
