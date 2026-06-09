// Direct S3/R2 storage — replaces Manus forge storage proxy
//
// Env vars (renamed to avoid Railway's AWS_ prefix interception):
//   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
//   Optional: S3_ENDPOINT (set for Cloudflare R2)

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

// ── S3 client (lazy singleton) ──

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || "us-east-1";
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 credentials missing: set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY"
      );
    }

    _s3 = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return _s3;
}

function getBucket(): string {
  const bucket = ENV.s3Bucket;
  if (!bucket) {
    throw new Error("S3_BUCKET is not configured");
  }
  return bucket;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// Presigned URL validity (7 days)
const PRESIGN_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

/**
 * Upload a file to S3 and return a presigned download URL.
 *
 * Drop-in replacement for the Manus storagePut — same signature, same return shape.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const s3 = getS3();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
    })
  );

  // Generate a presigned GET URL so the client can download without auth
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS }
  );

  return { key, url };
}

/**
 * Generate a presigned download URL for an existing file.
 *
 * Drop-in replacement for the Manus storageGet — same signature, same return shape.
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const s3 = getS3();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS }
  );

  return { key, url };
}

/**
 * Generate a presigned URL that triggers a browser download with the given filename.
 * Uses ResponseContentDisposition so the browser receives Content-Disposition: attachment
 * even for cross-origin S3/R2 URLs where the HTML download attribute has no effect.
 */
export async function storageGetDownload(
  relKey: string,
  filename: string
): Promise<string> {
  const s3 = getS3();
  const bucket = getBucket();
  const key = normalizeKey(relKey);
  const safe = filename.replace(/[^\w.\-() ]/g, "_");

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safe}"`,
      ResponseContentType: "application/pdf",
    }),
    { expiresIn: 60 * 15 }
  );
}
