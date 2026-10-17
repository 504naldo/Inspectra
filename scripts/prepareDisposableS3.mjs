import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { assertDisposableS3Environment } from "./disposableS3Config.mjs";

assertDisposableS3Environment();
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${process.env.S3_ENDPOINT}/minio/health/ready`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Container startup is bounded below. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Disposable MinIO did not become ready within 30 seconds");
  try {
    await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    await client.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }));
  }
  console.log("PASS: disposable MinIO is ready with a private synthetic acceptance bucket");
} finally {
  client.destroy();
}
