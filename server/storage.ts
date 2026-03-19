// Direct S3/R2 storage — replaces Manus forge storage proxy
//
// Supports:
//   - AWS S3: set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET
//   - Cloudflare R2: set S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET
//     (R2 endpoint format: https://<account-id>.r2.cloudflarestorage.com)

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
    const endpoint = process.env.S3_ENDPOINT; // Set for R2, leave empty for AWS S3

    _s3 = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      // AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are read from env automatically
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
