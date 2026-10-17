import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const png = Buffer.from("recorded-image");
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("S3_BUCKET", "inspectra-ci-acceptance");
  vi.stubEnv("S3_REGION", "us-east-1");
  vi.stubEnv("S3_ACCESS_KEY_ID", "inspectra-ci-access");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "inspectra-ci-secret-not-production");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockImplementation(async () => new Response(png));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("private storage images with real SDK signing and no network", () => {
  it.each(["http://127.0.0.1:9000", "http://127.0.0.1:9000/prefix%20space"])(
    "fetches signature and photo bytes only from freshly SDK-signed exact objects at %s", async endpoint => {
      vi.stubEnv("S3_ENDPOINT", endpoint);
      const { resolveSignatureImageForPdf } = await import("./signatureImage");
      const { resolveAttachmentImageForPdf } = await import("./pdfImageResolver");
      const key = "signatures/field # %+.png";
      const image = { fileKey: key, fileUrl: "http://169.254.169.254/latest" };
      const before = structuredClone(image);
      expect(await resolveSignatureImageForPdf(image)).toEqual(png);
      expect(await resolveAttachmentImageForPdf(image)).toMatchObject({ ok: true, buffer: png, source: "fresh-key" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const [rawUrl, options] of fetchMock.mock.calls) {
        const url = new URL(rawUrl);
        expect(url.origin).toBe("http://127.0.0.1:9000");
        expect(decodeURIComponent(url.pathname)).toBe(`${decodeURIComponent(new URL(endpoint).pathname).replace(/\/$/, "")}/inspectra-ci-acceptance/${key}`);
        expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
        expect(url.searchParams.get("X-Amz-Expires")).toBe("604800");
        expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
        expect(options).toEqual({ redirect: "error" });
      }
      expect(image).toEqual(before);
    },
  );

  it("never exempts private legacy URLs without a durable key", async () => {
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
    const { resolveSignatureImageForPdf } = await import("./signatureImage");
    await expect(resolveSignatureImageForPdf({ fileUrl: "http://127.0.0.1:9000/inspectra-ci-acceptance/signatures/legacy.png" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
