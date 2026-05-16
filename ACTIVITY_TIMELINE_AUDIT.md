# Activity Timeline — Audit Report

**Date:** 2026-05-16  
**Branch:** claude/continue-work-vt04A

---

## Infrastructure Found (all pre-existing)

| Component | Location | Status |
|---|---|---|
| Logger | `server/activityLogger.ts` | ✓ complete — fire-and-forget, never throws |
| Schema table | `drizzle/schema.ts` — `activityEvents` | ✓ exists in DB |
| Backend router | `server/routers/activityRouter.ts` | ✓ `listForEntity` + `listRecentByCompany` |
| Frontend component | `client/src/components/ActivityTimeline.tsx` | ✓ full implementation |

### Schema fields available for display
`id`, `companyId`, `actorUserId`, `actorName`, `actorRole`, `entityType`, `entityId`, `relatedEntityType`, `relatedEntityId`, `eventType`, `title`, `description`, `oldValue`, `newValue`, `metadata`, `createdAt`

---

## UI Coverage Found (all pre-existing)

| Page | ActivityTimeline added | Lock banner |
|---|---|---|
| `InvoiceDetail.tsx` | ✓ line 751 | ✓ amber banner (void/paid/sage-exported) |
| `ApprovedWorkDetail.tsx` | ✓ line 879 | n/a |
| `RepairQuoteDetail.tsx` | ✓ line 631 | n/a |
| `WorkOrders.tsx` | — list page only, no detail page | n/a |

---

## Logging Coverage Before This Session

### invoice (invoiceRouter.ts)
| Event | Logged? |
|---|---|
| created | ✓ |
| status_changed | ✓ |
| paid | ✓ |
| voided | ✓ |
| exported (Sage CSV) | ✓ (two code paths) |
| line item added | ✗ missing |
| line item updated | ✗ missing |
| line item removed | ✗ missing |

### approved_work (approvedWorkRouter.ts)
| Event | Logged? |
|---|---|
| created (manual) | ✓ |
| created (from quote) | ✓ |
| status_changed | ✓ |
| linked to work order | ✓ |
| converted | ✓ |
| closed | ✓ |

### repair_quote (repairQuoteRouter.ts)
| Event | Logged? |
|---|---|
| created | ✓ |
| status_changed (sent) | ✓ |
| status_changed (other) | ✓ |

### work_order (workOrderRouter.ts / approvedWorkRouter.ts)
| Event | Logged? |
|---|---|
| created | ✗ missing — only logged as `linked` on approved_work |
| scheduled | ✓ |
| completed | ✓ |

---

## Gaps Fixed in This Session

| Gap | Fix | File |
|---|---|---|
| invoice `addLineItem` — no activity logged | Added `logActivity` after `recalculateInvoiceTotals` | `invoiceRouter.ts` |
| invoice `updateLineItem` — no activity logged | Added `logActivity` after `recalculateInvoiceTotals` | `invoiceRouter.ts` |
| invoice `removeLineItem` — no activity logged | Added `logActivity` after `deleteInvoiceLineItem` | `invoiceRouter.ts` |
| work_order `created` — only logged on approved_work | Added `logActivity` on work_order entity too | `approvedWorkRouter.ts` |

---

## Remaining Gaps (out of scope for this pass)

| Gap | Notes |
|---|---|
| invoice `update` (header fields) | Logged as a noisy event; could add with field diffing |
| work_order `techUpdate` (tech notes/hours) | Low admin value; tech-facing mutation |
| repair_quote line item changes | Would require full line item audit trail |
| User login / session events | Auth-layer concern, not application concern |

---

## Manual Test Checklist

- [ ] Create an invoice — "Invoice created: INV-…" appears in timeline
- [ ] Change invoice status — status change appears with old → new values
- [ ] Add a line item — "Line item added: …" with dollar amount appears
- [ ] Update a line item — "Line item updated" appears
- [ ] Remove a line item — "Line item removed" appears
- [ ] Mark invoice paid — "Invoice paid" appears in timeline
- [ ] Void an invoice — lock banner appears, "Invoice voided" in timeline
- [ ] Export to Sage — "Sage Exported" appears in timeline, all edits locked
- [ ] Create work order from Approved Work — "Work order created" appears in **both** the approved_work and work_order timelines
- [ ] Approved Work status change — appears in its timeline
- [ ] RepairQuote created — appears in its timeline
- [ ] Empty state — "No activity recorded yet." shown for new records
