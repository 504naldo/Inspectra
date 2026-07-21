import { describe, it, expect, vi } from "vitest";
import { resolveAttachmentImageForPdf } from "./pdfImageResolver";

// These tests exercise the resolution/precedence/failure logic with injected
// deps, so they need no network and no live storage credentials.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("resolveAttachmentImageForPdf", () => {
  it("prefers a FRESH signed URL minted from fileKey over the stored fileUrl", async () => {
    const signKey = vi.fn(async () => "https://s3.example.com/fresh?sig=new");
    const fetchBuffer = vi.fn(async (url: string) => (url.includes("fresh") ? PNG : undefined));

    const res = await resolveAttachmentImageForPdf(
      { id: 1, fileKey: "reports/1/photo.jpg", fileUrl: "https://s3.example.com/stored?sig=EXPIRED" },
      { signKey, fetchBuffer },
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.source).toBe("fresh-key");
    expect(signKey).toHaveBeenCalledWith("reports/1/photo.jpg");
    // The expired stored URL must never be fetched when a key is available.
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
    expect(fetchBuffer).toHaveBeenCalledWith("https://s3.example.com/fresh?sig=new");
  });

  it("falls back to the stored fileUrl when signing fails (e.g. no storage creds)", async () => {
    const signKey = vi.fn(async () => { throw new Error("CredentialsProviderError"); });
    const fetchBuffer = vi.fn(async () => PNG);

    const res = await resolveAttachmentImageForPdf(
      { id: 2, fileKey: "reports/1/photo.jpg", fileUrl: "https://s3.example.com/stored" },
      { signKey, fetchBuffer },
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.source).toBe("stored-url");
    expect(fetchBuffer).toHaveBeenCalledWith("https://s3.example.com/stored");
  });

  it("uses the stored fileUrl directly when no fileKey is present", async () => {
    const signKey = vi.fn(async () => "should-not-be-called");
    const fetchBuffer = vi.fn(async () => PNG);

    const res = await resolveAttachmentImageForPdf(
      { id: 3, fileUrl: "https://s3.example.com/only" },
      { signKey, fetchBuffer },
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.source).toBe("stored-url");
    expect(signKey).not.toHaveBeenCalled();
  });

  it("returns { ok:false, no-source } when neither key nor url is present", async () => {
    const res = await resolveAttachmentImageForPdf(
      { id: 4 },
      { signKey: vi.fn(), fetchBuffer: vi.fn() },
    );
    expect(res).toEqual({ ok: false, reason: "no-source" });
  });

  it("returns { ok:false, fetch-failed } when the image cannot be fetched (expired/missing)", async () => {
    // Both a fresh sign and the fetch are attempted; fetch yields nothing.
    const res = await resolveAttachmentImageForPdf(
      { id: 5, fileKey: "k", fileUrl: "https://s3.example.com/x" },
      { signKey: async () => "https://s3.example.com/fresh", fetchBuffer: async () => undefined },
    );
    expect(res).toEqual({ ok: false, reason: "fetch-failed" });
  });

  it("never throws — a failure degrades to a structured result, not an exception", async () => {
    await expect(
      resolveAttachmentImageForPdf(
        { id: 6, fileKey: "k" },
        { signKey: async () => { throw new Error("boom"); }, fetchBuffer: async () => undefined },
      ),
    ).resolves.toEqual({ ok: false, reason: "no-source" });
  });
});
