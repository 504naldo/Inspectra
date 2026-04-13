# AI Executive Summary → PDF Integration Recommendations

## Current state (from code review)

- The UI generates an AI summary via `ai.generateReportSummary` and stores the composed text in local state `executiveSummary` on the Admin Reports page.
- PDF generation (`deficiencyReport.generate`) sends `summary: executiveSummary` into the backend route.
- `reportRouter.generatePDF` forwards that summary to `generateInspectionReportPDF({ summary })`.
- The PDF generator type includes `summary?: string`, but the value is not rendered in the generated PDF pages.
- The current "Executive Summary" PDF page is generated from calculated deficiency counts only (`drawDeficiencySummaryPage`) and does not consume any AI narrative content.

## Why this matters

Today, users can successfully generate AI text, but the generated PDF does not show it. This creates a mismatch between user expectation and document output and can reduce trust in the workflow.

## Recommended architecture

### 1) Treat AI summary as structured content, not one blob

Current UI flattens the AI response into one string. Instead, preserve the AI schema across layers:

```ts
{
  executiveSummary: string[];
  systemStatus: string;
  priorityItems: string[];
  nextSteps: string[];
  model?: string;
  generatedAt?: string;
}
```

Why:
- Cleaner layout in PDF (sections with bullets)
- Better validation and safer truncation
- Easier future edits, regeneration, and audit trail

### 2) Add an explicit PDF section for AI-generated narrative

Keep existing deficiency metrics page, and add a dedicated page/section titled **"AI-Generated Executive Summary"** directly after it.

Section blocks:
- Key Findings (bullets)
- System Status (single paragraph)
- Priority Items (numbered/bulleted)
- Recommended Next Steps (bulleted)
- Footer note: "AI-assisted draft reviewed by [user] on [date]" (optional)

### 3) Add provenance + review state

Store summary provenance with the report record:
- `aiSummaryJson` (JSON payload)
- `aiSummaryModel`
- `aiSummaryGeneratedAt`
- `aiSummaryReviewedById`
- `aiSummaryReviewedAt`

At generation time, mark whether PDF contains:
- AI text as-is
- AI text edited by human
- No AI text

This is important for compliance, customer transparency, and internal QA.

### 4) Add a clear fallback strategy

If AI summary is missing, malformed, or too long:
- Continue PDF generation
- Render fallback deterministic summary from existing stats
- Log warning with report id/job id

Never block report generation solely due to AI content issues.

## Concrete implementation plan

## Phase A — Data contract and storage

1. **Backend schema**
   - Keep existing `aiSummary` text for backward compatibility.
   - Add `aiSummaryJson` (JSON column) and optional provenance metadata columns.
2. **API contract**
   - Update generate endpoints to accept `aiSummary` as structured object.
   - Keep old `summary: string` input temporarily (deprecation path).
3. **UI state**
   - Store raw structured AI response in state.
   - Derive preview text for textarea only when needed.

## Phase B — PDF rendering

1. Add helper in `pdfSharedStyles.ts`:
   - `drawAiExecutiveSummaryPage(doc, aiSummary, startY, opts?)`
2. In `pdfGeneratorFirePro.ts`:
   - Call new renderer after current deficiency summary page.
   - Add simple pagination handling for long bullet lists.
3. Formatting rules:
   - Max bullets per section (e.g., 5)
   - Trim line length and sanitize whitespace
   - Escape/control unsupported characters

## Phase C — UX + governance

1. On Admin Reports screen:
   - Add "Regenerate AI summary" and "Mark as reviewed" controls.
   - Add an explicit preview card matching PDF section layout.
2. Save report:
   - Persist structured payload and reviewed flags.
3. Display indicator:
   - "Included in PDF" / "Not included" badge before generation.

## Suggested code touchpoints

- `client/src/pages/admin/Reports.tsx`
  - Preserve AI summary as object, not only plain text
  - Send structured payload to generation endpoint
- `server/routers/aiRouter.ts`
  - Return typed payload + optional provenance metadata
- `server/routers/reportRouter.ts`
  - Accept structured summary in `generatePDF` input
  - Persist structured payload on report create
- `server/pdfGeneratorFirePro.ts`
  - Thread `aiSummary` payload into render flow
- `server/pdfSharedStyles.ts`
  - New drawing helper for AI summary page
- `drizzle/schema.ts` (+ migration)
  - Add JSON/provenance fields for AI summary

## Backward compatibility strategy

- Continue accepting legacy `summary: string` for at least one release.
- If only legacy summary exists:
  - Convert into `executiveSummary` array with single-item fallback.
- Continue reading `aiSummary` text for older reports.

## Quality and test recommendations

1. **Unit tests (PDF layout):**
   - No AI summary
   - Normal AI summary
   - Very long AI summary (pagination)
   - Special characters and newline-heavy content
2. **Router tests:**
   - Structured payload validation
   - Legacy payload compatibility
3. **Snapshot/assertion tests:**
   - Ensure section header "AI-Generated Executive Summary" appears
4. **Non-functional:**
   - Verify no major PDF size inflation with long summaries

## Rollout plan

1. Ship schema + API compatibility first.
2. Ship PDF section rendering behind feature flag (`pdf.aiExecutiveSummary`).
3. Enable flag for internal users, gather feedback.
4. Enable by default, keep legacy parser for older clients.

## Quick-win version (if you want minimal lift now)

If you want the fastest improvement before full refactor:

1. Keep current string summary path.
2. Add a new PDF block/page that prints `data.summary` with heading and bullets-by-line.
3. Add basic truncation + overflow-to-next-page.

This delivers immediate user-visible value while preserving momentum toward structured + governed AI content.
