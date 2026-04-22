# Inspectra Security + Debugging Audit (2026-04-13)

## Executive take

Yes — additional debugging is recommended, and there are several security issues that should be prioritized before broader rollout.

---

## Debugging status: where to focus first

### 1) End-to-end summary visibility checks (high priority)
- Verify that reports generated from all entry points (deficiency, annual/compliance, and any legacy route callers) include AI summary content when expected.
- Add telemetry at PDF generation boundaries:
  - `jobId`, `reportId`, `hasSummary`, `summaryLength`, `reportType`, and generated page count.
- Add explicit logs when AI summary is omitted because it is empty/undefined.

### 2) PDF overflow and rendering behavior (medium priority)
- Long lines and section headers in summary text should be tested against page boundaries.
- Add fixture tests for:
  - Very large summary input
  - Unexpected unicode/control characters
  - Summary with no newline delimiters

### 3) Route-level consistency validation (medium priority)
- Ensure report metadata (type/title/email labels) stays consistent after generation.
- Deficiency route currently sends a compliance report notification type string (see finding #5).

---

## Security findings

## 1) Broken tenant authorization / IDOR on report operations (**Critical**)

Several report operations accept IDs but do not validate that the target report/job belongs to the caller's company before mutating data or sending artifacts.

Affected examples:
- `report.update` updates arbitrary report records by id without company ownership verification.
- `report.generatePDF` loads a job by id and proceeds without checking `job.companyId === ctx.user.companyId`.
- `drive.saveReport` and `gmail.sendReport` fetch report by id and continue without tenant ownership checks.

Impact:
- Cross-tenant data access and actions by authorized office/admin users from other tenants.
- Potential unauthorized emailing/export of another company’s reports.

Recommendation:
- Add mandatory ownership guard in each mutation/query path:
  - Fetch parent job/report and compare tenant scope to `ctx.user.companyId` (or customer org scope where applicable).
  - Return `FORBIDDEN` on mismatch.

---

## 2) SSRF risk via `fileUrl` + downstream `fetch(...)` (**High**)

Report update allows setting arbitrary `fileUrl` values, and multiple flows later do server-side `fetch(report.fileUrl)`.

Affected path:
- `report.update` accepts `fileUrl` as free-form string.
- `drive.saveReport` and `gmail.sendReport` resolve `pdfUrl = report.fileUrl || storageGet(...).url` and fetch it server-side.

Impact:
- A malicious internal actor could store an internal-network URL and trigger server-side requests.

Recommendation:
- Do not trust persisted `fileUrl` for server-to-server fetch.
- Prefer `fileKey` + signed storage URL only.
- If `fileUrl` must be retained, enforce allowlist validation (expected storage domain(s), https only) before fetching.

---

## 3) HTML injection risk in outbound email body (**Medium**)

`gmail.sendReport` builds HTML with user-provided body text converted only by newline replacement, without escaping HTML entities.

Impact:
- Content injection in email HTML body (dependent on mail client sanitization).

Recommendation:
- HTML-escape user input before interpolation.
- Prefer plain text body by default, or use a safe HTML template engine with escaping.

---

## 4) Unbounded summary payload can cause memory/processing pressure (**Medium**)

`report.generatePDF` accepts `summary: z.string().optional()` with no size limit and feeds it into PDF rendering.

Impact:
- Very large payloads can increase memory usage and generation time.

Recommendation:
- Add server-side max length (for example 8k–16k chars).
- Truncate for rendering with explicit note in PDF when truncated.

---

## 5) Wrong report type label in deficiency notification (**Low functional bug**)

Deficiency generation path sends report email with `reportType: "compliance"`.

Impact:
- Incorrect downstream labeling/notification semantics.

Recommendation:
- Set to `"deficiency"` in the deficiency route.

---

## 6) MIME header injection hardening for email metadata (**Low**)

MIME headers are assembled from dynamic values (`subject`, attachment filename).

Recommendation:
- Reject CR/LF in header fields or sanitize to prevent header splitting issues.

---

## Suggested immediate remediation order

1. **Critical auth/tenant checks** (finding #1)
2. **SSRF hardening around `fileUrl` fetch** (finding #2)
3. **Input hardening for HTML body + summary length** (findings #3 and #4)
4. **Functional correctness fixes** (finding #5)
5. **Header sanitization hardening** (finding #6)

---

## Quick test plan after fixes

- Authorization tests: cross-company access attempts for report update/generate/send/save should return FORBIDDEN.
- SSRF tests: reject non-storage domains in report URLs.
- PDF stress tests: huge summary should be bounded and generation should succeed.
- Email rendering tests: injected HTML tags should be escaped in final HTML body.
- Regression tests: deficiency notification type should be correct.
