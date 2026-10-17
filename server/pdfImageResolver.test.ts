import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fetchAuthorizedStorageImage } from "./pdfSharedStyles";
import { resolveAttachmentImageForPdf } from "./pdfImageResolver";

vi.mock("./pdfSharedStyles", () => ({ fetchAuthorizedStorageImage: vi.fn() }));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(fetchAuthorizedStorageImage).mockResolvedValue(PNG);
});
afterEach(() => vi.restoreAllMocks());

describe("resolveAttachmentImageForPdf", () => {
  it.each([null, "https://s3.example.com/stored?sig=EXPIRED"])(
    "uses the authorized storage helper for a durable key with stored URL %s", async fileUrl => {
      const attachment = { id: 1, fileKey: "reports/1/photo.jpg", fileUrl };
      const before = structuredClone(attachment);

      expect(await resolveAttachmentImageForPdf(attachment)).toEqual({
        ok: true, buffer: PNG, source: "fresh-key",
      });
      expect(fetchAuthorizedStorageImage).toHaveBeenCalledOnce();
      expect(fetchAuthorizedStorageImage).toHaveBeenCalledWith({ fileKey: attachment.fileKey, fileUrl });
      expect(attachment).toEqual(before);
    },
  );

  it("uses the stored URL only for a keyless historical attachment", async () => {
    const attachment = { id: 3, fileKey: null, fileUrl: "https://s3.example.com/only" };
    const before = structuredClone(attachment);

    expect(await resolveAttachmentImageForPdf(attachment)).toEqual({
      ok: true, buffer: PNG, source: "stored-url",
    });
    expect(fetchAuthorizedStorageImage).toHaveBeenCalledWith({ fileKey: null, fileUrl: attachment.fileUrl });
    expect(attachment).toEqual(before);
  });

  it.each([{}, { fileKey: null, fileUrl: null }, { fileKey: "", fileUrl: "" }])(
    "returns no-source only when neither key nor URL exists: %j", async source => {
      expect(await resolveAttachmentImageForPdf({ id: 4, ...source })).toEqual({ ok: false, reason: "no-source" });
      expect(fetchAuthorizedStorageImage).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, Buffer.alloc(0)])(
    "returns fetch-failed without retrying a known key's stored URL when the helper returns %j", async buffer => {
      vi.mocked(fetchAuthorizedStorageImage).mockResolvedValue(buffer);
      const attachment = { id: 5, fileKey: "reports/1/photo.jpg", fileUrl: "https://s3.example.com/stored" };

      expect(await resolveAttachmentImageForPdf(attachment)).toEqual({ ok: false, reason: "fetch-failed" });
      expect(fetchAuthorizedStorageImage).toHaveBeenCalledOnce();
      expect(fetchAuthorizedStorageImage).toHaveBeenCalledWith({ fileKey: attachment.fileKey, fileUrl: attachment.fileUrl });
    },
  );

  it("returns fetch-failed for an unavailable keyless URL", async () => {
    vi.mocked(fetchAuthorizedStorageImage).mockResolvedValue(undefined);

    expect(await resolveAttachmentImageForPdf({ fileUrl: "https://s3.example.com/expired" })).toEqual({
      ok: false, reason: "fetch-failed",
    });
  });

  it("contains a throwing helper and logs only attachment/report references", async () => {
    const fileKey = "private-bucket/secret-object.png";
    const fileUrl = "https://s3.example.com/stored?signature=secret-token";
    vi.mocked(fetchAuthorizedStorageImage).mockRejectedValue(new Error(`${fileKey} ${fileUrl}`));
    const attachment = { id: 6, fileKey, fileUrl };
    const before = structuredClone(attachment);

    await expect(resolveAttachmentImageForPdf(attachment, { reportRef: "job#20" })).resolves.toEqual({
      ok: false, reason: "fetch-failed",
    });
    expect(fetchAuthorizedStorageImage).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith("[pdf-image] job#20 attachment#6: fetch-failed");
    expect(attachment).toEqual(before);
  });
});
