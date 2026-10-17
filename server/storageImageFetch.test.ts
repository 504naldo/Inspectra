import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storageGet } from "./storage";
import { fetchAuthorizedStorageImage, fetchImageBuffer } from "./pdfSharedStyles";

vi.mock("./storage", () => ({ storageGet: vi.fn() }));
// Use the real public-address guard. Literal IPs avoid DNS and network access.
const fetchMock = vi.fn();
const key = "signatures/field # %+.png";
const png = Buffer.from("recorded-image");
const signed = (path = `/inspectra-images/${encodeURIComponent(key).replace(/%2F/g, "/")}`) =>
  `http://127.0.0.1:9000${path}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${"a".repeat(64)}`;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
  vi.stubEnv("S3_BUCKET", "inspectra-images");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(storageGet).mockResolvedValue({ key, url: signed() });
  fetchMock.mockImplementation(async () => new Response(png));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("authorized storage image fetching", () => {
  it("fetches the exact freshly signed private object without using or mutating its stored URL", async () => {
    const image = { fileKey: key, fileUrl: "http://169.254.169.254/latest" };
    const before = structuredClone(image);
    expect(await fetchAuthorizedStorageImage(image)).toEqual(png);
    expect(storageGet).toHaveBeenCalledWith(key);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(signed(), { redirect: "error" });
    expect(image).toEqual(before);
  });

  it("retains encoded endpoint-prefix and exact object-path validation before fetching", async () => {
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000/prefix%20space");
    const url = signed(`/prefix%20space/inspectra-images/${encodeURIComponent(key).replace(/%2F/g, "/")}`);
    vi.mocked(storageGet).mockResolvedValue({ key, url });
    expect(await fetchAuthorizedStorageImage({ fileKey: key })).toEqual(png);
    expect(fetchMock).toHaveBeenCalledWith(url, { redirect: "error" });
  });

  it.each([
    signed().replace("127.0.0.1:9000", "127.0.0.1:9001"),
    signed().replace("127.0.0.1", "169.254.169.254"),
    signed("/another-bucket/signatures/field.png"),
    signed("/inspectra-images/signatures/another.png"),
    signed().replace("X-Amz-Signature=", "missing-signature="),
    signed().replace("http://", "http://user:password@"),
  ])("does not fetch rejected signer output or its stale fallback: %s", async url => {
    vi.mocked(storageGet).mockResolvedValue({ key, url });
    expect(await fetchAuthorizedStorageImage({ fileKey: key, fileUrl: "https://198.51.100.23/stale.png" })).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use a stale URL when signing a known key fails", async () => {
    vi.mocked(storageGet).mockRejectedValue(new Error("secret storage error"));
    expect(await fetchAuthorizedStorageImage({ fileKey: key, fileUrl: "https://198.51.100.23/stale.png" })).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([signed(), "http://localhost:9000/image.png", "http://169.254.169.254/latest"])(
    "keeps the real public-address guard on a keyless stored URL: %s", async fileUrl => {
      expect(await fetchAuthorizedStorageImage({ fileUrl })).toBeUndefined();
      expect(storageGet).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("permits public legacy image URLs without signing or inferring a key", async () => {
    const fileUrl = "https://198.51.100.23/legacy.png";
    expect(await fetchAuthorizedStorageImage({ fileUrl })).toEqual(png);
    expect(storageGet).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(fileUrl, { redirect: "error" });
  });

  it("requires a public SDK URL when no custom storage endpoint is configured", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    expect(await fetchAuthorizedStorageImage({ fileKey: key })).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not grant ordinary image URLs the configured endpoint exemption", async () => {
    expect(await fetchImageBuffer(signed())).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fetchImageBuffer("https://198.51.100.23/public.png")).toEqual(png);
    expect(fetchMock).toHaveBeenCalledWith("https://198.51.100.23/public.png", { redirect: "error" });
  });

  it.each([302, 403, 404, 500])("does not return an image for HTTP %i", async status => {
    fetchMock.mockResolvedValue(new Response("failed", { status, headers: { Location: "http://169.254.169.254/latest" } }));
    expect(await fetchAuthorizedStorageImage({ fileKey: key })).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(signed(), { redirect: "error" });
  });

  it("contains redirect/network failures without falling back or fetching another URL", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: unexpected redirect"));
    expect(await fetchAuthorizedStorageImage({ fileKey: key, fileUrl: "https://198.51.100.23/stale.png" })).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(signed(), { redirect: "error" });
  });
});
