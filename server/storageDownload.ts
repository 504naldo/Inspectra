import { storageGet } from "./storage";
import { assertPublicHttpUrl } from "./_core/ssrfGuard";

/** Call only after authorizing the stored document's canonical parent. A fresh
 * SDK signature may use the administrator-configured private storage endpoint;
 * stored/keyless URLs still receive the normal SSRF check.
 */
export async function resolveAuthorizedStorageDownload(document: { fileKey?: string | null; fileUrl?: string | null }): Promise<string | null> {
  if (!document.fileKey) {
    if (!document.fileUrl) return null;
    await assertPublicHttpUrl(document.fileUrl);
    return document.fileUrl;
  }
  const { url } = await storageGet(document.fileKey);
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) {
    await assertPublicHttpUrl(url);
    return url;
  }
  const configured = new URL(endpoint);
  const generated = new URL(url);
  const prefix = decodeURIComponent(configured.pathname).replace(/\/$/, "");
  const key = document.fileKey.replace(/^\/+/, "");
  const path = `${prefix}/${process.env.S3_BUCKET}/${key}`;
  if (!["http:", "https:"].includes(configured.protocol) || configured.username || configured.password
    || generated.origin !== configured.origin || generated.username || generated.password
    || decodeURIComponent(generated.pathname) !== path
    || generated.searchParams.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256"
    || !/^[a-f0-9]{64}$/.test(generated.searchParams.get("X-Amz-Signature") ?? "")) {
    throw new Error("Generated storage URL does not match the configured bucket and object");
  }
  return url;
}
