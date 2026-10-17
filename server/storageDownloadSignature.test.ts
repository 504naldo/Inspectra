import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("real SDK signing at the configured storage boundary (no HTTP)", () => {
  async function load(endpoint: string) {
    vi.resetModules();
    vi.stubEnv("S3_ENDPOINT", endpoint);
    vi.stubEnv("S3_BUCKET", "inspectra-ci-acceptance");
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("S3_ACCESS_KEY_ID", "inspectra-ci-access");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "inspectra-ci-secret-not-production");
    return (await import("./storageDownload")).resolveAuthorizedStorageDownload;
  }
  it.each(["http://127.0.0.1:9000", "http://127.0.0.1:9000/prefix%20space"])(
    "accepts real SDK-encoded exact keys at %s without following the stored URL", async endpoint => {
      const resolve = await load(endpoint);
      const key = "reports/field # %+.pdf";
      const url = new URL((await resolve({ fileKey: key, fileUrl: "http://169.254.169.254/latest" }))!);
      expect(url.origin).toBe("http://127.0.0.1:9000");
      expect(decodeURIComponent(url.pathname)).toBe(`${decodeURIComponent(new URL(endpoint).pathname).replace(/\/$/, "")}/inspectra-ci-acceptance/${key}`);
      expect(url.searchParams.get("X-Amz-Expires")).toBe("604800");
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    },
  );
  it("keeps the real private-address guard for a keyless URL even at that configured endpoint", async () => {
    const resolve = await load("http://127.0.0.1:9000");
    await expect(resolve({ fileUrl: "http://127.0.0.1:9000/inspectra-ci-acceptance/object" })).rejects.toThrow("private or internal address");
  });
});
