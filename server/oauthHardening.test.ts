/**
 * oauthHardening.test.ts
 *
 * Regression coverage for the P2 OAuth findings:
 *   H2 — login CSRF: the `state` param now carries a nonce that must match a
 *        cookie set by getLoginUrl() in the same browser, or the callback
 *        must reject the request outright (not silently fall back).
 *   H3 — Google's `email_verified` claim must gate trust in the email used
 *        for role assignment; an unverified email must never be trusted.
 *
 * These exercise the pure functions extracted from server/_core/oauth.ts
 * rather than the Express route itself (no supertest in this repo — see
 * oauth-redirect.test.ts / oauth-permissions.test.ts for the existing
 * precedent of testing extracted logic directly, here against the real
 * exported functions instead of a re-implemented copy).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({}));

import {
  decodeOAuthState,
  hasUnverifiedEmail,
  isOAuthNonceValid,
  isSafeReturnRoute,
} from "./_core/oauth";

function encodeState(route: string, nonce: string): string {
  return Buffer.from(JSON.stringify({ route, nonce })).toString("base64");
}

describe("decodeOAuthState", () => {
  it("round-trips a state encoded the same way getLoginUrl() encodes it", () => {
    const state = encodeState("/tech/jobs/123", "abc123nonce");
    expect(decodeOAuthState(state)).toEqual({ route: "/tech/jobs/123", nonce: "abc123nonce" });
  });

  it("rejects the legacy pre-CSRF-fix format (plain base64 route, no nonce)", () => {
    const legacyState = Buffer.from("/tech/jobs").toString("base64");
    expect(decodeOAuthState(legacyState)).toBeNull();
  });

  it("rejects garbage state", () => {
    expect(decodeOAuthState("not-valid-base64-json")).toBeNull();
  });

  it("rejects an empty state", () => {
    expect(decodeOAuthState("")).toBeNull();
  });

  it("rejects JSON missing the nonce field", () => {
    const state = Buffer.from(JSON.stringify({ route: "/admin" })).toString("base64");
    expect(decodeOAuthState(state)).toBeNull();
  });
});

describe("isSafeReturnRoute", () => {
  it("allows a same-origin path", () => {
    expect(isSafeReturnRoute("/tech/jobs")).toBe(true);
  });

  it("rejects an empty route", () => {
    expect(isSafeReturnRoute("")).toBe(false);
  });

  it("rejects protocol-relative URLs (open redirect)", () => {
    expect(isSafeReturnRoute("//evil.com")).toBe(false);
  });

  it("rejects absolute URLs (open redirect)", () => {
    expect(isSafeReturnRoute("https://evil.com")).toBe(false);
  });

  it("rejects backslash protocol-relative URLs (FAB-05)", () => {
    // Browsers normalize "/\" and "\/" to "//" → off-site redirect.
    expect(isSafeReturnRoute("/\\evil.com")).toBe(false);
    expect(isSafeReturnRoute("/\\/evil.com")).toBe(false);
    expect(isSafeReturnRoute("\\\\evil.com")).toBe(false);
  });

  it("rejects routes containing control characters (CRLF/tab)", () => {
    expect(isSafeReturnRoute("/ok\r\nSet-Cookie: x")).toBe(false);
    expect(isSafeReturnRoute("/ok\tx")).toBe(false);
  });

  it("still allows normal paths with hyphens and query strings", () => {
    expect(isSafeReturnRoute("/admin/work-orders?id=5")).toBe(true);
    expect(isSafeReturnRoute("/tech/jobs/12-a")).toBe(true);
  });
});

describe("isOAuthNonceValid — CSRF guard", () => {
  it("accepts when the cookie nonce matches the state nonce", () => {
    expect(isOAuthNonceValid("abc123", "abc123")).toBe(true);
  });

  it("rejects a forged callback with no matching cookie (login CSRF)", () => {
    expect(isOAuthNonceValid(undefined, "attacker-controlled-nonce")).toBe(false);
  });

  it("rejects a mismatched nonce", () => {
    expect(isOAuthNonceValid("victim-cookie-nonce", "attacker-controlled-nonce")).toBe(false);
  });

  it("rejects when the state has no nonce at all", () => {
    expect(isOAuthNonceValid("some-cookie-nonce", undefined)).toBe(false);
  });
});

describe("hasUnverifiedEmail — H3 guard", () => {
  it("allows a verified email through", () => {
    expect(hasUnverifiedEmail({ email: "tech@example.com", emailVerified: true })).toBe(false);
  });

  it("rejects an explicitly unverified email", () => {
    expect(hasUnverifiedEmail({ email: "tech@example.com", emailVerified: false })).toBe(true);
  });

  it("rejects when emailVerified is missing entirely (defensive default)", () => {
    expect(hasUnverifiedEmail({ email: "tech@example.com", emailVerified: undefined as any })).toBe(true);
  });

  it("does not flag a missing email — the existing inactive-technician fallback already handles it", () => {
    expect(hasUnverifiedEmail({ email: null, emailVerified: false })).toBe(false);
  });
});
