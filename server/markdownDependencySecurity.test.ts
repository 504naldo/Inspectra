import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Exercise the actual KaTeX dependency used by chat Markdown, not a mock.
const require = createRequire(import.meta.url);
const requireFromChat = createRequire(require.resolve("streamdown"));
const katex = requireFromChat("katex");

describe("chat mathematics dependency compatibility and safety", () => {
  it("renders the eight total labour-hours expression", () => {
    const html = katex.renderToString("2 \\times 4 = 8", {
      throwOnError: true,
    });
    expect(html).toContain("katex");
    expect(html).toContain("<math");
    expect(html).toContain("<mn>8</mn>");
  });

  it("does not enable untrusted HTML or executable hyperlinks", () => {
    for (const source of [
      "\\href{javascript:alert(1)}{unsafe}",
      "\\htmlClass{untrusted}{unsafe}",
    ]) {
      const html = katex.renderToString(source, {
        trust: false,
        throwOnError: false,
      });
      expect(html).not.toMatch(/href="javascript:|class="untrusted"/i);
      expect(html).toContain("katex");
    }
  });
});
