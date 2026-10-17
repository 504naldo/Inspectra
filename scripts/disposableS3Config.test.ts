import { describe, expect, it } from "vitest";
import { assertDisposableS3Environment, disposableS3Environment } from "./disposableS3Config.mjs";

describe("disposable storage acceptance configuration", () => {
  it("accepts only the synthetic local emulator and database", () => {
    expect(() => assertDisposableS3Environment(disposableS3Environment)).not.toThrow();
    expect(() => assertDisposableS3Environment({ ...disposableS3Environment, DATABASE_URL: "mysql://root@127.0.0.1:3306/inspectra_ci" })).not.toThrow();
  });
  it.each([
    { DISPOSABLE_S3_ACCEPTANCE: undefined }, { S3_ENDPOINT: "https://storage.example.com" },
    { S3_BUCKET: "production" }, { S3_ACCESS_KEY_ID: "real-key" }, { S3_SECRET_ACCESS_KEY: "real-secret" },
    { DATABASE_URL: "mysql://root@database.example.com/inspectra_ci" }, { DATABASE_URL: "mysql://root@127.0.0.1/production" },
  ])("rejects configuration that could leave the disposable environment: %o", changed => {
    expect(() => assertDisposableS3Environment({ ...disposableS3Environment, ...changed })).toThrow("Disposable S3 acceptance requires");
  });
});
