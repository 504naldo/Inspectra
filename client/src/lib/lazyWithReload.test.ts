import { describe, it, expect } from "vitest";
import { isChunkLoadError } from "./lazyWithReload";

// Pure — locks which errors are treated as "stale chunk after deploy" so the
// one-time auto-reload triggers for them and nothing else.
describe("isChunkLoadError", () => {
  it("matches the real production message (Chromium/Firefox variants)", () => {
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://app.example/assets/Jobs-d5WTG6bQ.js",
        ),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(new TypeError("error loading dynamically imported module")),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("Importing a module script failed.")),
    ).toBe(true);
  });

  it("matches the SPA-fallback MIME variant (server served index.html for a missing .js)", () => {
    expect(
      isChunkLoadError(
        new TypeError(
          'Failed to load module script: Expected a JavaScript module but the server responded with a MIME type of "text/html".',
        ),
      ),
    ).toBe(true);
  });

  it("does not match unrelated runtime errors", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError("some string")).toBe(false);
  });
});
