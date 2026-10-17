// Fixed synthetic credentials. This acceptance harness must never use a real bucket.
export const disposableS3Environment = Object.freeze({
  DISPOSABLE_S3_ACCEPTANCE: "true",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_BUCKET: "inspectra-ci-acceptance",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "inspectra-ci-access",
  S3_SECRET_ACCESS_KEY: "inspectra-ci-secret-not-production",
});

export function assertDisposableS3Environment(environment = process.env) {
  for (const [key, expected] of Object.entries(disposableS3Environment)) {
    if (environment[key] !== expected) throw new Error(`Disposable S3 acceptance requires its fixed local ${key} setting`);
  }
  if (environment.DATABASE_URL) {
    const database = new URL(environment.DATABASE_URL);
    if (database.protocol !== "mysql:" || !["localhost", "127.0.0.1"].includes(database.hostname)
      || database.pathname !== "/inspectra_ci") {
      throw new Error("Disposable S3 acceptance requires the local inspectra_ci MySQL database");
    }
  }
}
