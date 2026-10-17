import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storageGet } from "./storage";
import { assertPublicHttpUrl } from "./_core/ssrfGuard";
import { resolveSignatureImageForPdf } from "./signatureImage";

vi.mock("./storage", () => ({ storageGet: vi.fn() }));
vi.mock("./_core/ssrfGuard", () => ({ assertPublicHttpUrl: vi.fn() }));
const fetchMock = vi.fn();
const png = Buffer.from("recorded-signature");
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storageGet).mockResolvedValue({ key: "signatures/permanent.png", url: "https://storage.example/fresh?signature=new" });
  vi.stubEnv("S3_ENDPOINT", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => new Response(png));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("signature image evidence", () => {
  it.each([null, "https://storage.example/old?signature=expired"])("fresh-signs the durable key and leaves capture metadata unchanged: %s", async fileUrl => {
    const signature = { fileKey: "signatures/permanent.png", fileUrl };
    const before = structuredClone(signature);
    expect(await resolveSignatureImageForPdf(signature)).toEqual(png);
    expect(storageGet).toHaveBeenCalledWith("signatures/permanent.png");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(assertPublicHttpUrl).toHaveBeenCalledWith("https://storage.example/fresh?signature=new");
    expect(fetchMock).toHaveBeenCalledWith("https://storage.example/fresh?signature=new", { redirect: "error" });
    expect(signature).toEqual(before);
  });
  it("retains a keyless historical URL without inventing an object key", async () => {
    const signature = { fileKey: null, fileUrl: "https://legacy.example/signature.png" };
    expect(await resolveSignatureImageForPdf(signature)).toEqual(png);
    expect(storageGet).not.toHaveBeenCalled();
    expect(assertPublicHttpUrl).toHaveBeenCalledWith(signature.fileUrl);
    expect(fetchMock).toHaveBeenCalledWith(signature.fileUrl, { redirect: "error" });
    expect(signature.fileKey).toBeNull();
  });
  it("does not use the stored URL when signing the known key fails", async () => {
    vi.mocked(storageGet).mockRejectedValue(new Error("credential-in-signed-url"));
    await expect(resolveSignatureImageForPdf({ fileKey: "signatures/permanent.png", fileUrl: "https://storage.example/old" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.not.stringContaining("credential") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("blocks generation when a historical signature URL is expired or rejected by the guarded fetch", async () => {
    fetchMock.mockResolvedValue(new Response("Expired", { status: 403 }));
    await expect(resolveSignatureImageForPdf({ fileUrl: "https://legacy.example/expired" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(storageGet).not.toHaveBeenCalled();
  });
  it("permits an unsigned draft with no captured signature", async () => {
    expect(await resolveSignatureImageForPdf({})).toBeUndefined();
    expect(storageGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
