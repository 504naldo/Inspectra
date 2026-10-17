import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storageGet } from "./storage";
import { resolveAuthorizedStorageDownload } from "./storageDownload";
import { assertPublicHttpUrl } from "./_core/ssrfGuard";
vi.mock("./storage", () => ({ storageGet: vi.fn() }));
vi.mock("./_core/ssrfGuard", () => ({ assertPublicHttpUrl: vi.fn() }));
const key = "reports/exact file.pdf";
const signed = (path = "/inspectra-ci-acceptance/reports/exact%20file.pdf") => `http://127.0.0.1:9000${path}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${"a".repeat(64)}`;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
  vi.stubEnv("S3_BUCKET", "inspectra-ci-acceptance");
  vi.mocked(storageGet).mockResolvedValue({ key, url: signed() });
});
afterEach(() => vi.unstubAllEnvs());

describe("authorized generated storage download boundary", () => {
  it("accepts only the fresh signed exact object at the configured private endpoint", async () => {
    expect(await resolveAuthorizedStorageDownload({ fileKey: key, fileUrl: "http://169.254.169.254/latest" })).toBe(signed());
    expect(storageGet).toHaveBeenCalledWith(key);
    expect(assertPublicHttpUrl).not.toHaveBeenCalled();
  });
  it.each([
    "http://169.254.169.254/latest", signed("/another-bucket/reports/exact%20file.pdf"),
    signed("/inspectra-ci-acceptance/reports/other.pdf"), signed().replace("127.0.0.1:9000", "127.0.0.1:9001"),
    signed().replace("X-Amz-Signature", "missing-signature"), signed().replace("http://", "http://user:pass@"),
  ])("refuses a signer result outside its exact configured origin/bucket/key: %s", async url => {
    vi.mocked(storageGet).mockResolvedValue({ key, url });
    await expect(resolveAuthorizedStorageDownload({ fileKey: key })).rejects.toThrow("Generated storage URL");
  });
  it("never exempts a stored/keyless private URL, including the configured storage hostname", async () => {
    vi.mocked(assertPublicHttpUrl).mockRejectedValue(new Error("private address"));
    await expect(resolveAuthorizedStorageDownload({ fileUrl: signed() })).rejects.toThrow("private address");
    expect(assertPublicHttpUrl).toHaveBeenCalledWith(signed());
    expect(storageGet).not.toHaveBeenCalled();
  });
  it("compares encoded endpoint prefixes and object paths with the same decoding", async () => {
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000/prefix%20space");
    const url = signed("/prefix%20space/inspectra-ci-acceptance/reports/exact%20file.pdf");
    vi.mocked(storageGet).mockResolvedValue({ key, url });
    expect(await resolveAuthorizedStorageDownload({ fileKey: key })).toBe(url);
  });
  it("checks normal public S3 URLs and never falls back to a stale stored URL on signer failure", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    await resolveAuthorizedStorageDownload({ fileKey: key });
    expect(assertPublicHttpUrl).toHaveBeenCalledWith(signed());
    vi.mocked(storageGet).mockRejectedValue(new Error("signing failed"));
    await expect(resolveAuthorizedStorageDownload({ fileKey: key, fileUrl: "https://stale.example/file" })).rejects.toThrow("signing failed");
    expect(assertPublicHttpUrl).toHaveBeenCalledTimes(1);
  });
});
