# Report QA Queue — Implementation Notes

## Current Report QA Behavior (Before This Change)

- `/admin/qa/:jobId` runs an AI check on the job and appends "QA Approved / Rejected" to the job's notes field
- No report-level QA status tracking existed
- Reports page at `/admin/reports` shows reports but has no queue workflow

## Routes / Nav Added

| Route | Component | Description |
|---|---|---|
| `/admin/report-qa` | `ReportQA.tsx` | Full QA queue page |

Nav item added to AdminLayout "More" dropdown: **Report QA** (icon: ClipboardCheck)

Dashboard link for "Reports Pending Review" snapshot card updated to point to `/admin/report-qa`

## Statuses Supported

Extended `reports.status` enum (migration `0049_report_qa_queue.sql`):

| Status | Description |
|---|---|
| `draft` | Report record created, no PDF (pre-existing) |
| `generated` | PDF generated — appears in "Needs Review" queue |
| `corrections_required` | Office reviewer flagged corrections needed |
| `approved` | Office reviewer approved — ready to send |
| `sent` | Sent to customer |
| `archived` | Removed from active queue |
| `field_complete` | Virtual — completed job with no report yet (not stored in DB) |

Added `qaNote TEXT DEFAULT NULL` column to `reports` table.

## Queue Logic

### `reportQa.listQueue`
- Filter values: `generated`, `corrections_required`, `approved`, `sent`, `archived`, `all`, `field_complete`
- Returns: `{ items[], counts{} }` where counts has per-status badge numbers
- Open deficiency count per job fetched in a single GROUP BY query (not N+1)
- Technician names fetched per unique tech ID (small number per company)
- `field_complete` items are completed jobs with zero reports — not stored as a DB status

### Status count for dashboard
`getOperationsSummary()` `reportsPendingReview` now counts `generated + corrections_required` (previously counted `draft + generated`)

## Dashboard / Notification Integration

- Dashboard "Reports Pending Review" card → `/admin/report-qa` (updated)
- Notification center `report_pending_review` alert type still queries `draft + generated` (not modified — task says don't overbuild if not wired)

## Limitations

- `field_complete` count may lag if the 50-row limit on completedJobs is hit (unlikely in practice)
- Technician name resolved via `leadTechnicianId` — if a job used the deprecated `assignedTechnicianId` only, the name shows blank
- QA notes are single-field (append requires overwrite) — no per-reviewer comment history
- No email/SMS notification when corrections are requested (in-app notification center not wired for this event)
- Existing `/admin/qa/:jobId` page approves the JOB (updates job notes), not the REPORT status — both mechanisms coexist

## Activity Events Added

| Event Type | Trigger |
|---|---|
| `report.submitted_for_review` | `markNeedsReview` called |
| `report.approved` | `approveReport` called |
| `report.corrections_requested` | `requestCorrections` called |
| `report.marked_sent` | `markSent` called |
| `report.archived` | `archiveReport` called |
| `report.qa_note_added` | `addQaNote` called |

All logged via existing `logActivity()` infrastructure (fire-and-forget, no new tables).

## Manual Test Checklist

- [ ] `/admin/report-qa` loads without error
- [ ] "Report QA" appears in the "More" nav dropdown
- [ ] Dashboard "Reports Pending Review" card links to `/admin/report-qa`
- [ ] Generate a PDF on `/admin/reports` → it appears in "Needs Review" tab
- [ ] Click "Approve" → report moves to "Approved" tab, approvedAt is set
- [ ] Click "Request Corrections" with no note → shows validation error
- [ ] Click "Request Corrections" with note → report moves to "Corrections Required" tab, qaNote saved
- [ ] On approved report, click "Mark Sent" → report moves to "Sent" tab
- [ ] Click "Archive" → report disappears from active tabs, appears in "Archived"
- [ ] "Add Note" updates qaNote and shows it on the card
- [ ] "Field Complete" tab shows completed jobs with no PDF
- [ ] Click "QA Check" button → opens existing `/admin/qa/:jobId` page
- [ ] Click "PDF" button → opens report PDF in new tab
- [ ] Click "Job" button → opens job detail page
- [ ] Status counts in tab badges match actual item counts
- [ ] Run migration `0049_report_qa_queue.sql` on Railway before testing status mutations
