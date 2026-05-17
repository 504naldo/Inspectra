# AI Deficiency + Quote Assistant — Implementation Notes

## Backend Methods Added

All new procedures are in `server/routers/aiAssistantRouter.ts`.

### `aiAssistant.draftDeficiencyFromNotes` (`technicianProcedure`)
- **Purpose**: Draft full deficiency fields from raw technician field notes (no device required)
- **Input**: `rawTechnicianNotes` (required), `jobId`, `deviceId`, `siteId`, `systemCategory`, `severity`, `observedIssue`, `location` (all optional)
- **Output**: `suggestedTitle`, `suggestedSeverity`, `systemCategory`, `professionalDescription`, `customerExplanation`, `correctiveAction`, `internalNotes`, `confidence`, `warnings[]`, `isDraft`, `disclaimer`
- **Context**: Fetches device/job/site in parallel when provided; verifies companyId on each; KB lookup (mode `deficiency`)
- **Difference from existing `ai.generateDeficiencyNarrative`**: Works without a linked device; includes title and severity suggestions

### `aiAssistant.improveDeficiencyText` (`technicianProcedure`)
- **Purpose**: Rewrite/improve existing deficiency text fields for clarity and professionalism
- **Input**: `deficiencyId` (required), `currentTitle`, `currentDescription`, `currentObservedIssue`, `currentCorrectiveAction`, `currentCustomerExplanation`
- **Output**: `improvedTitle`, `improvedDescription`, `improvedObservedIssue`, `improvedCorrectiveAction`, `improvedCustomerExplanation`, `warnings[]`, `isDraft`, `disclaimer`
- **Context**: Fetches deficiency + job + device; verifies companyId via `job.companyId`

### `aiAssistant.suggestRepairScope` (`officeProcedure`)
- **Purpose**: Suggest scope of work for a deficiency when building a repair quote
- **Input**: `deficiencyId` (required), `siteId`, `systemCategory`, `severity` (optional)
- **Output**: `scopeSummary`, `recommendedWork[]`, `recommendedPartsSearchTerms[]`, `estimatedLabourNotes`, `customerFacingExplanation`, `internalPricingNotes`, `warnings[]`, `isDraft`, `disclaimer`
- **Context**: Uses `buildDeficiencyContext`; KB lookup (mode `repair_quote`)

### `aiAssistant.draftRepairQuoteSummary` (`officeProcedure`)
- **Purpose**: Draft executive summary, scope of work, and customer approval note for a repair quote
- **Input**: `repairQuoteId` (optional), `deficiencyIds[]` (optional), `customerOrgId` (optional), `siteId` (optional)
- **Output**: `quoteTitle`, `executiveSummary`, `scopeOfWork`, `customerApprovalNote`, `exclusionsOrAssumptions`, `recommendedNextStep`, `warnings[]`, `isDraft`, `disclaimer`
- **Context**: Uses `buildRepairQuoteContext` + `buildDeficiencyContext` for each deficiency; KB lookup (mode `repair_quote`)

### `aiAssistant.suggestPartsFromDeficiency` (`officeProcedure`)
- **Purpose**: Search the company's parts catalog for items relevant to a deficiency
- **Input**: `deficiencyId` (required), `searchText` (optional), `systemCategory` (optional)
- **Output**: `suggestedPartsSearchTerms[]`, `matchingParts[]` (id, productName, category, description, unitPrice, defaultLabourHours, sku), `notes`, `disclaimer`
- **Context**: Uses `buildDeficiencyContext`; LLM generates 3–6 search terms; results from `searchPartsCatalogByKeywords`

---

## Database Function Added

### `searchPartsCatalogByKeywords(companyId, keywords, limit)` — `server/db.ts`
- SQL `LIKE` keyword match across `productName`, `category`, `description`
- Filters by `companyId` and `isActive = true`
- Returns up to `limit` results ordered by category then productName
- Keywords shorter than 2 characters are ignored

---

## Frontend AI Buttons Added

### `DeficiencyEditor.tsx` — "AI Helpers" card
Replaces the former "AI Narrative Generator" card with three buttons:

1. **Generate Narrative** — existing behaviour (requires `observedIssue`)
2. **Draft from Notes** — opens modal; technician types raw field notes → AI returns all fields → "Apply All Fields" copies to form (no auto-save)
3. **Improve Wording** (edit mode only) — fires immediately; shows improved versions of all text fields → "Apply Improvements" copies to form

Both new buttons set `aiDraft = true` and display the existing yellow "AI Draft" notice banner. Nothing is saved until the technician submits the form.

### `RepairQuoteDetail.tsx` — office AI tools
Two new AI actions:

1. **Draft Summary** button (quote header area) — calls `draftRepairQuoteSummary`; opens dialog showing quoteTitle, executiveSummary, scopeOfWork, customerApprovalNote, exclusionsOrAssumptions each with a copy-to-clipboard button
2. **Suggest Parts** button (per item row, shown only when item has a linked deficiency) — calls `suggestPartsFromDeficiency`; opens dialog showing AI-generated search terms (as chips) and matching catalog items with name, category, SKU, description, price, and default labour hours

No parts are added automatically. The office user must manually add parts through the existing Add Item form after reviewing suggestions.

---

## Context Used

| Procedure | Context Built |
|---|---|
| `draftDeficiencyFromNotes` | Device (if provided), job summary, site summary, KB snippets |
| `improveDeficiencyText` | `buildDeficiencyContext` (deficiency + device + job) |
| `suggestRepairScope` | `buildDeficiencyContext` + KB snippets (repair_quote mode) |
| `draftRepairQuoteSummary` | `buildRepairQuoteContext` + `buildDeficiencyContext` per linked deficiency + KB snippets |
| `suggestPartsFromDeficiency` | `buildDeficiencyContext` + LLM-generated search terms → catalog LIKE search |

---

## Parts Matching Behavior

1. `suggestPartsFromDeficiency` builds deficiency context and sends it to the LLM
2. LLM returns 3–6 specific search terms (e.g., "smoke detector", "ionization", "24V")
3. `searchPartsCatalogByKeywords` runs SQL `LIKE '%term%'` on `productName`, `category`, `description` for each term
4. Results are unioned (Drizzle `or(...conditions)`) — a part matches if any term matches any field
5. Filtered to `companyId` and `isActive = true`; ordered by category + name; capped at 8 results
6. Results are displayed read-only in the dialog; the office user decides whether to add them

---

## Activity Logging

All 5 new procedures call `logActivity` (fire-and-forget) with:
- `entityType`: `"deficiency"` or `"quote"`
- `entityId`: the primary record ID
- `action`: one of `"ai_draft_deficiency"`, `"ai_improve_deficiency"`, `"ai_suggest_repair_scope"`, `"ai_draft_quote_summary"`, `"ai_suggest_parts"`
- `userId` and `companyId` from `ctx.user`

---

## Safety Protections

| Rule | How enforced |
|---|---|
| admin + office can use all quote/deficiency AI methods | `draftRepairQuoteSummary`, `suggestRepairScope`, `suggestPartsFromDeficiency` are `officeProcedure` (admin + office roles only) |
| Technicians can use deficiency drafting for assigned jobs only | `draftDeficiencyFromNotes` and `improveDeficiencyText` are `technicianProcedure`; job/device companyId verified against `ctx.user.companyId` |
| No customer-facing AI in v1 | All procedures require authenticated session; no public endpoint |
| CompanyId always from server context | `companyId = ctx.user.companyId!` — never trusted from client input |
| No cross-company data exposure | Every fetched record's `companyId` is verified before use |
| No auto-save | AI output shown in dialog only; user must click "Apply" then save the form |
| No auto-pricing | AI does not set `estimatedCost` or any price field |
| No auto-approvals | AI does not change quote or deficiency status |
| No auto-close | AI does not close deficiencies |
| No quote line items created automatically | Suggest Parts dialog is read-only; parts are added via existing Add Item form |
| No email sending | AI drafts text only; sending is a separate manual action |
| No legal/code compliance certainty | All outputs include `disclaimer` field; LLM prompt instructs AI not to claim compliance certainty |
| Missing AI key handled gracefully | `invokeLLM` throws; tRPC returns error; frontend shows error toast |
| No new dependencies | Pure SQL keyword search; no new npm packages |

---

## Known Limitations

- `searchPartsCatalogByKeywords` uses SQL `LIKE` — no semantic/vector search. Results depend on keyword quality and catalog naming conventions.
- `draftDeficiencyFromNotes` severity suggestion is advisory only; it reflects the AI's interpretation of the notes.
- Quote summary does not include real-time pricing — it summarises what is already in the quote.
- Suggest Parts does not cross-reference existing quote items to avoid duplicates.
- `improveDeficiencyText` and `draftDeficiencyFromNotes` have no rate limiting beyond the existing tRPC session auth.

---

## Manual Test Checklist

### DeficiencyEditor — Draft from Notes
- [ ] Open DeficiencyEditor in create mode (no device linked)
- [ ] Click "Draft from Notes" — dialog opens
- [ ] Enter raw notes (e.g., "smoke detector in room 203 chirping, low battery, 10 years old") → click Generate
- [ ] Confirm AI returns title, severity, description, correctiveAction, customerExplanation
- [ ] Click "Apply All Fields" — form fields populate, "AI Draft" banner appears
- [ ] Save deficiency — confirm fields saved correctly

### DeficiencyEditor — Improve Wording
- [ ] Open an existing deficiency in edit mode (must have a title)
- [ ] Click "Improve Wording" — loading state shown in dialog
- [ ] Confirm improved versions of all text fields appear
- [ ] Click "Apply Improvements" — form fields update, "AI Draft" banner appears
- [ ] Confirm nothing saved until user clicks Save

### RepairQuoteDetail — Draft Summary
- [ ] Open a repair quote with at least one item
- [ ] Click "Draft Summary"
- [ ] Confirm dialog shows quoteTitle, executiveSummary, scopeOfWork, customerApprovalNote, exclusionsOrAssumptions
- [ ] Click copy button on each field — confirm clipboard populated
- [ ] Close dialog — confirm quote is unchanged

### RepairQuoteDetail — Suggest Parts
- [ ] Open a repair quote where at least one item has a linked deficiency
- [ ] Click "Suggest Parts" on that item row
- [ ] Confirm dialog shows search terms as chips and matching catalog items (or "no parts found" message)
- [ ] Confirm no parts are added to the quote automatically
- [ ] Close dialog — confirm quote is unchanged

### Safety
- [ ] Log in as technician — confirm "Draft Summary" and "Suggest Parts" buttons in RepairQuoteDetail are not accessible (office-only route)
- [ ] Log in as technician — confirm "Draft from Notes" and "Improve Wording" work on own-company jobs
- [ ] Confirm AI output is never saved without explicit user action
