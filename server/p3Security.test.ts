import { describe, it, expect } from "vitest";
import { escapeDriveQueryValue } from "./_core/driveQuery";
import { sanitizeHeaderValue, buildMimeMessage } from "./routers/gmailRouter";
import { safeXlsxRead } from "./_core/safeXlsxRead";
import * as XLSX from "xlsx";

describe("escapeDriveQueryValue (Drive query injection)", () => {
  it("escapes every quote in a multi-quote injection attempt", () => {
    const malicious = "x' or '1'='1";
    const escaped = escapeDriveQueryValue(malicious);
    expect(escaped).toBe("x\\' or \\'1\\'=\\'1");
  });

  it("escapes backslashes before quotes so a trailing backslash can't swallow the closing escape", () => {
    // A backslash immediately before a quote must end up with an ODD number of
    // backslashes ahead of that quote (so the quote is escaped). If backslashes
    // were escaped *after* quotes instead of before, the count would come out
    // EVEN — meaning the backslashes all pair off and the quote is left as a
    // raw, unescaped string terminator (the injection).
    const escaped = escapeDriveQueryValue("evil\\'");
    const match = escaped.match(/^evil(\\+)'$/);
    expect(match).not.toBeNull();
    expect(match![1].length % 2).toBe(1);
  });

  it("round-trips an ordinary folder/file name unchanged", () => {
    expect(escapeDriveQueryValue("Inspection Report 2024.pdf")).toBe("Inspection Report 2024.pdf");
  });
});

describe("sanitizeHeaderValue (Gmail MIME header injection)", () => {
  it("strips CRLF that would otherwise terminate a header line early", () => {
    const malicious = "Report\r\nBcc: attacker@evil.com";
    expect(sanitizeHeaderValue(malicious)).toBe("Report Bcc: attacker@evil.com");
  });

  it("strips bare LF and CR", () => {
    expect(sanitizeHeaderValue("a\nb\rc")).toBe("a b c");
  });

  it("trims surrounding whitespace left after stripping", () => {
    expect(sanitizeHeaderValue("  hello  ")).toBe("hello");
  });
});

describe("buildMimeMessage (Gmail header injection, end to end)", () => {
  it("does not allow a forged header to appear as its own header line", () => {
    const mime = buildMimeMessage({
      from: "office@inspectra.test",
      to: "customer@example.com",
      subject: "Report\r\nBcc: attacker@evil.com",
      bodyText: "See attached.",
      attachmentName: "report.pdf",
      attachmentBase64: "AAAA",
    });

    const headerLines = mime.split("\r\n");
    // The injected "Bcc:" must not exist as its own header line — only as
    // trailing text appended to the (legitimate) Subject line.
    expect(headerLines.find((l) => l === "Bcc: attacker@evil.com")).toBeUndefined();
    const subjectLine = headerLines.find((l) => l.startsWith("Subject:"));
    expect(subjectLine).toBe("Subject: Report Bcc: attacker@evil.com");
  });

  it("sanitizes the attachment filename used in Content-Disposition", () => {
    const mime = buildMimeMessage({
      from: "office@inspectra.test",
      to: "customer@example.com",
      subject: "Report",
      bodyText: "See attached.",
      attachmentName: "report.pdf\r\nX-Injected: true",
      attachmentBase64: "AAAA",
    });
    expect(mime).not.toContain("X-Injected: true\r\n");
    expect(mime).toContain('filename="report.pdf X-Injected: true"');
  });
});

describe("safeXlsxRead (xlsx CVE-2023-30533 / CVE-2024-22363 mitigation)", () => {
  it("parses a well-formed workbook and returns data usable by XLSX.utils", async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["Location", "Status"], ["Lobby", "Pass"]]);
    XLSX.utils.book_append_sheet(wb, sheet, "Devices");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = await safeXlsxRead(buffer, { type: "buffer" });
    expect(result.SheetNames).toEqual(["Devices"]);
    const rows = XLSX.utils.sheet_to_json<string[]>(result.Sheets["Devices"], { header: 1 });
    expect(rows[0]).toEqual(["Location", "Status"]);
    expect(rows[1]).toEqual(["Lobby", "Pass"]);
  }, 10_000);

  it("rejects input that isn't a parseable workbook instead of hanging or crashing the process", async () => {
    // A ZIP local-file-header signature with garbage flags/data after it —
    // XLSX.read recognizes the container format but fails to parse it.
    const garbage = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00]);
    await expect(safeXlsxRead(garbage, { type: "buffer" })).rejects.toThrow();
  }, 10_000);

  it("parses in an isolated worker, so a crafted prototype-pollution payload can't reach the main thread's Object.prototype", async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["__proto__", "polluted"]]);
    XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await safeXlsxRead(buffer, { type: "buffer" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  }, 10_000);
});
