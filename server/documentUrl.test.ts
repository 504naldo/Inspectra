import { expect, it, vi } from "vitest";
import { resolveDocumentUrl } from "./documentUrl";
import { storageGet } from "./storage";
vi.mock("./storage", () => ({
  storageGet: vi.fn(async key => ({ url: `https://fresh.test/${key}` })),
}));
it("resigns the durable key even when an expired stored URL is present", async () => {
  expect(
    await resolveDocumentUrl({
      fileKey: "reports/old.pdf",
      fileUrl: "https://expired.test/report",
    })
  ).toBe("https://fresh.test/reports/old.pdf");
  expect(storageGet).toHaveBeenCalledWith("reports/old.pdf");
});
it("only keyless legacy records use their saved URL", async () => {
  expect(
    await resolveDocumentUrl({ fileUrl: "https://legacy.test/report" })
  ).toBe("https://legacy.test/report");
  expect(await resolveDocumentUrl({})).toBeNull();
});
it("storage failure never silently falls back to the expired URL", async () => {
  vi.mocked(storageGet).mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(
    resolveDocumentUrl({
      fileKey: "reports/key.pdf",
      fileUrl: "https://expired.test/report",
    })
  ).rejects.toThrow("storage unavailable");
});
