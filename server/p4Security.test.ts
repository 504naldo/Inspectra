import { describe, it, expect, afterEach, vi } from "vitest";
import { ENV, validateJwtSecret } from "./_core/env";

describe("validateJwtSecret (JWT_SECRET misconfiguration)", () => {
  const originalSecret = ENV.cookieSecret;

  afterEach(() => {
    ENV.cookieSecret = originalSecret;
  });

  it("throws when JWT_SECRET is unset", () => {
    ENV.cookieSecret = "";
    expect(() => validateJwtSecret()).toThrow(/not set/i);
  });

  it("throws when JWT_SECRET is still the public .env.example placeholder", () => {
    ENV.cookieSecret = "change-me-to-a-long-random-string";
    expect(() => validateJwtSecret()).toThrow(/placeholder/i);
  });

  it("warns but does not throw on a merely-short secret", () => {
    ENV.cookieSecret = "short-secret";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validateJwtSecret()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("neither throws nor warns on a sufficiently long, non-placeholder secret", () => {
    ENV.cookieSecret = "a".repeat(32);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validateJwtSecret()).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
