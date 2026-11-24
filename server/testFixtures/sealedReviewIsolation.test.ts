import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../routers";
import { requireSealedQuoteFixture } from "../issuedQuoteService";
import { sealedReviewFixtureRouter } from "./sealedReviewRouter";

afterEach(() => vi.unstubAllEnvs());

describe("sealed review draft publication boundary", () => {
  it("leaves the ordinary application router without any sealed review routes", () => {
    const names = Object.keys(appRouter._def.procedures);
    expect(names.some(name => /^(sealedQuote|sealedDraftFixture)\./.test(name))).toBe(false);
    expect(Object.keys(sealedReviewFixtureRouter._def.procedures).sort()).toEqual([
      "sealedDraftFixture.create", "sealedDraftFixture.detail", "sealedDraftFixture.pdf",
      "sealedQuote.accept", "sealedQuote.list", "sealedQuote.mode", "sealedQuote.preview",
    ]);
  });

  it("refuses production even with an explicitly armed fixture flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INSPECTRA_ISOLATED_ISSUED_QUOTE", "1");
    vi.stubEnv("DATABASE_URL", "mysql://127.0.0.1:3999/synthetic_issued");
    expect(requireSealedQuoteFixture).toThrow(/disabled/);
  });

  it("requires deliberately armed test mode and the dedicated loopback namespace", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("INSPECTRA_ISOLATED_ISSUED_QUOTE", "");
    expect(requireSealedQuoteFixture).toThrow(/disabled/);
    vi.stubEnv("INSPECTRA_ISOLATED_ISSUED_QUOTE", "1");
    for (const url of ["mysql://127.0.0.1:3999/ordinary", "mysql://example.invalid/synthetic_issued"]) {
      vi.stubEnv("DATABASE_URL", url);
      expect(requireSealedQuoteFixture).toThrow(/dedicated loopback/);
    }
  });
});
