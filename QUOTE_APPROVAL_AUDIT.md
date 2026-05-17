# Quote Approval Workflow — Pre-Build Audit

## Existing Repair Quote Statuses

`quotes.status` enum: `["draft", "sent", "accepted", "declined"]`

| Status | Set By |
|---|---|
| `draft` | createRepairQuote (default) |
| `sent` | updateStatus("sent") — sets sentAt if not already set |
| `accepted` | updateStatus("accepted") — sets approvedAt, triggers _createWorkOrderFromQuote + _createApprovedWorkFromQuote |
| `declined` | updateStatus("declined") — sets declinedAt |

**Missing**: `ready_to_send`, `viewed`, `partially_approved`, `approved`, `expired`, `converted_to_approved_work`, `cancelled`

---

## Existing Quote Item Statuses

**None.** `repair_quote_items` has no approval tracking fields. Items cannot be individually approved or declined.

---

## Existing Approval Fields on quotes Table

| Field | Type | Notes |
|---|---|---|
| `sentAt` | timestamp | Set by updateStatus("sent") |
| `acceptedAt` | timestamp | Set by updateStatus("accepted") — but currently named `acceptedAt`, not `approvedAt` in updateStatus logic |
| `approvedAt` | timestamp | Set when status = accepted |
| `declinedAt` | timestamp | Set when status = declined |
| `validUntil` | date | Quote expiry date (set at creation) |
| `finalizedAt` | timestamp | Lock for editing (not approval) |

**Missing**: `viewedAt`, `approvedByName`, `approvedByEmail`, `approvalSource`

---

## Existing Approval Fields on repair_quote_items Table

**None.** No approval tracking on items.

---

## Existing Convert-to-Approved-Work Behavior

### Whole-quote path (`repairQuoteRouter.updateStatus("accepted")`)
- Calls `_createApprovedWorkFromQuote(quoteId, "internal")`
- Dedup check: `db.getApprovedWorkByQuote(quoteId)` — if exists, skips
- Creates ONE approved_work for the entire quote (not per-item)
- Snapshots: `approvedAmount = quote.total`, `approvedScope = "Quote {quoteNumber}"`
- `approvalSource` hardcoded to `"email"` or `"internal"` — no user selection

### Per-item path (`approvedWorkRouter.createFromQuoteItem`)
- Creates one approved_work per `quoteItemId`
- Dedup check: `db.getApprovedWorkByQuoteItem(quoteItemId)` — throws CONFLICT if exists
- Validates: quote status must be `"accepted"` (not `"approved"`, `"partially_approved"`, etc.)
- Snapshots: `approvedAmount = item.total`, `approvedScope = item.description`, `approvedAt = quote.approvedAt`
- Accessible from approvedWorkRouter, not directly from RepairQuoteDetail UI

---

## Existing Activity Logging

| Event | eventType |
|---|---|
| createRepairQuote | `created` |
| finalizeQuote | `status_changed` "Repair quote finalized" |
| updateStatus | `status_changed` with old/new values |

No specific log entries for: `quote_viewed`, `approval_recorded`, `item_approved`, `item_declined`, `converted`.

---

## Missing Approval Workflow Pieces

1. **Status granularity**: Only 4 statuses vs. 11 needed. No partial approval state.
2. **Item-level approval**: No per-item approve/decline/needs_review tracking.
3. **Approval metadata on quote**: No `approvedByName`, `approvedByEmail`, `approvalSource`, `viewedAt`.
4. **Partial approval UI**: No way to mark some items approved and others declined.
5. **Controlled conversion**: No "convert only approved items" flow — existing whole-quote flow creates one record for the whole amount.
6. **Duplicate prevention for per-item**: `approvedWorkRouter.createFromQuoteItem` has dedup, but it's not wired to RepairQuoteDetail.
7. **Status auto-recalculation**: No helper to compute `partially_approved` vs `approved` vs `declined` based on item statuses.
8. **Notifications**: No quote approval/decline/partial notification types.
9. **Expiry/cancellation**: No `expireQuote` or `cancelQuote` procedures.
10. **Quote status after conversion**: No `converted_to_approved_work` status.

---

## What Can Be Reused

| Existing | Reused For |
|---|---|
| `db.getApprovedWorkByQuoteItem(id)` | Dedup check per-item conversion |
| `db.getApprovedWorkByQuote(id)` | Dedup check whole-quote path |
| `db.createApprovedWork(data)` | Creating approved work records |
| `db.updateRepairQuoteItem(id, data)` | Setting item approvalStatus + customerNotes |
| `db.updateQuote(id, data)` | Setting approval metadata + status |
| `logActivity` | All new approval event logs |
| `db.createNotification + hasUndismissedNotification` | Quote approval/decline notifications |
| `APPROVED_WORK_STATUSES` | ApprovedWork statuses remain unchanged |

---

## Send Center Status

No Send Center module found. `gmailRouter.ts` handles Gmail OAuth but is not directly connected to quote sending workflow. Send Center integration is deferred.
