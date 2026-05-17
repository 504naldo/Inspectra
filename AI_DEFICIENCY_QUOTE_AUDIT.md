# AI Deficiency + Quote Assistant — Pre-Build Audit

## Existing AI Assistant Capabilities

**aiAssistantRouter.ts** — All `officeProcedure` (admin + office only):

| Procedure | Input | Output | Notes |
|---|---|---|---|
| `ask` | message, mode, contextType?, contextId?, useKnowledgeBase | answer, knowledgeUsed | General chat with optional record context + KB |
| `getContextSummary` | contextType, contextId | summary text | Builds context text for any record type |
| `draftCustomerMessage` | type, entityId, tone | subject, body, isDraft | Customer email drafts — never sends |
| `draftDeficiencyText` | title, notes?, systemCategory?, severity?, deviceType?, location? | description, customerExplanation, correctiveAction, severitySuggestion, severityRationale | JSON schema output — office only |
| `runReportQAReview` | jobId, reportId? | reviewId, riskLevel, summary, findings, suggestedQaNote, suggestedActions, missingDataWarnings | Structured QA review stored in ai_reviews |
| `getReviewsForEntity` | jobId | AiReview[] | Scoped by companyId |
| `dismissReview` | reviewId | success | Marks review dismissed |

**aiRouter.ts** — Has `ai.generateDeficiencyNarrative` used by DeficiencyEditor:
- Procedure: `adminProcedure` (actually accessible to admin+office; DeficiencyEditor.tsx calls it from technician context which may be a gap)
- Input: deviceType, location, observedIssue, testOutcome, codeReference?
- Output: description, correctiveAction, customerExplanation
- Used by DeficiencyEditor.tsx — requires deviceType and location (fails without linked device)

**Existing context builders** (all in aiAssistantRouter.ts):
- `buildJobContext(jobId, companyId)` — compact job summary
- `buildSiteContext(siteId, companyId)` — site + customer + WSI
- `buildDeficiencyContext(defId, companyId)` — deficiency + device + job
- `buildInvoiceContext(invoiceId, companyId)` — invoice + line items
- `buildRepairQuoteContext(quoteId, companyId)` — quote + items + site + customer
- `buildApprovedWorkContext(awId, companyId)` — approved work record

---

## Existing Deficiency Fields

**Schema** (`deficiencies` table):
- `id`, `jobId`, `deviceId` (optional), `inspectionResultId` (optional), `reportedById`
- `status`: `open` | `in_progress` | `resolved` | `closed` | `deferred` | `quoted`
- `severity`: `critical` | `major` | `minor` | `observation`
- `systemCategory`: `FIRE_ALARM` | `SMOKE_ALARM` | `FIRE_EXTINGUISHER` | `EMERGENCY_LIGHTING` | `SPRINKLER`
- `title`, `description`, `observedIssue`, `correctiveAction`, `customerExplanation`
- `codeReference`, `estimatedCost` (decimal)
- AI fields: `aiGeneratedAt`, `aiModelId`, `aiPromptHash`, `aiContext` (JSON)
- `resolvedAt`, `resolvedById`, `resolutionNotes`, `workOrderId`
- `createdAt`, `updatedAt`

**Deficiency router procedures** (technicianProcedure):
- `listByJob(jobId)` — list for job
- `get(id)` — fetch with attachments + repairs
- `create(...)` — create with all fields, sets aiGeneratedAt if AI-generated
- `update(...)` — update most fields, handles resolved/closed transitions

**DeficiencyEditor.tsx** (technician UI):
- Form fields: title, severity (4-button grid), status (edit only), systemCategory, observedIssue, description, correctiveAction, customerExplanation, codeReference, estimatedCost
- Existing AI: "AI Narrative Generator" card — calls `trpc.ai.generateDeficiencyNarrative` (requires deviceType + location + observedIssue). Populates description, correctiveAction, customerExplanation.
- Shows AI draft notice when `aiDraft=true`

---

## Existing Repair Quote Fields

**Schema** (`quotes` table):
- `id`, `jobId`, `siteId`, `customerOrgId`, `companyId`
- `status`: `draft` | `sent` | `accepted` | `declined`
- `quoteType`, `quoteNumber`, `techLabourRate`, `fitterLabourRate`
- `subtotal`, `gst` (5%), `pst` (7% on parts), `total`
- `fuelCharge`, `backflowReportFee`, `validUntil`, `sentAt`, `approvedAt`, `declinedAt`
- `notes`, `pdfUrl`, `finalizedAt`, `createdById`

**Schema** (`repairQuoteItems` table):
- `id`, `quoteId`, `deficiencyId` (optional)
- `description`, `repairNotes`, `location`
- `systemType`: `FIRE_ALARM` | `SMOKE_ALARM` | `FIRE_EXTINGUISHER` | `EMERGENCY_LIGHTING` | `SPRINKLER` | `BACKFLOW` | `OTHER`
- `quantity`, `partId`, `partDescription`, `partUnitPrice`, `partTotal`
- `techHours`, `fitterHours`, `techLabourRate`, `fitterLabourRate`, `labourTotal`
- `fuelCharge`, `backflowReportFee`, `gst`, `pst`, `total`
- `sortOrder`

**Repair quote router procedures** (officeProcedure):
- `listByJob`, `listByCompany`, `createRepairQuote`, `getRepairQuote`, `updateRepairQuote`
- `addItem`, `updateItem`, `removeItem` — with price snapshotting + auto-recalc
- `finalizeQuote`, `updateStatus` — on accepted, auto-creates work order + approved work
- `generatePDF`, `convertToWorkOrder`
- `listParts` — list parts catalog for company

**RepairQuoteDetail.tsx** (office UI):
- Shows quote header, items list (expandable), summary (subtotal/GST/PST/total), notes, activity
- Has "Draft with AI" button → calls `aiAssistant.ask` (generic), shows in dialog
- Add Item form with full pricing fields + catalog part selection
- Finalize, Mark Sent, Accept/Decline, Create Work Order actions

---

## Existing Parts Catalog Fields

**Schema** (`partsCatalog` table):
- `id`, `companyId`, `category`, `productName`, `sku`
- `unitPrice`, `defaultLabourHours`
- `taxableGst` (bool), `taxablePst` (bool), `isActive` (bool)
- `description`, `sourceWorkbook`, `sourceSheet`, `sourceRow`
- `createdAt`, `updatedAt`

**Parts catalog router procedures** (all officeProcedure):
- `list(includeInactive)` — list all for company
- `getById(id)`, `create(...)`, `update(...)`, `deactivate(...)`, `reactivate(...)`
- `importPreview(rows, updateExisting)`, `importExecute(rows, updateExisting)` — bulk import with duplicate detection

**db.ts functions**:
- `createPartsCatalogItem`, `getPartsCatalogItemById`, `getPartsCatalogByCompany`, `updatePartsCatalogItem`
- No keyword search function exists

---

## Current Deficiency-to-Quote Workflow

1. **Technician** observes issue → opens DeficiencyEditor.tsx → fills observedIssue → clicks AI Narrative Generator → reviews/edits → saves deficiency
2. **Office** opens NewRepairQuote.tsx → selects job → selects deficiencies → sets labour rates → creates quote (pre-populates items from deficiency title + correctiveAction)
3. **Office** opens RepairQuoteDetail.tsx → adds/edits items → selects parts from catalog → enters labour hours → "Draft with AI" for generic text → Finalize → Mark Sent

**Linkage**: `repairQuoteItems.deficiencyId → deficiencies.id`, `quotes.jobId → jobs.id`

---

## Missing AI Integration Points

### DeficiencyEditor.tsx
- No "Draft from Notes" path — existing AI requires deviceType + location (fails if no device linked)
- No severity suggestion displayed (draftDeficiencyText returns severitySuggestion but nothing calls it here)
- No "Improve Wording" for existing deficiencies
- No title suggestion

### RepairQuoteDetail.tsx
- "Draft with AI" only calls generic `ask` — no structured output
- No deficiency-aware scope drafting
- No parts catalog search from AI suggestions
- No customer-facing approval note drafting
- No per-item scope suggestion

### Missing db functions
- No `searchPartsCatalogByKeywords` for AI-suggested parts matching

---

## Recommended Implementation

### Backend (aiAssistantRouter.ts)
Add 5 new procedures:
1. `draftDeficiencyFromNotes` — technicianProcedure; builds context from whatever's available; JSON schema output with title, severity, systemCategory, description, correctiveAction, customerExplanation
2. `improveDeficiencyText` — technicianProcedure; takes deficiencyId + current text; returns improved versions
3. `suggestRepairScope` — officeProcedure; takes deficiencyId; returns scope + parts search terms
4. `draftRepairQuoteSummary` — officeProcedure; takes repairQuoteId; returns executive summary + scope of work + customer approval note
5. `suggestPartsFromDeficiency` — officeProcedure; takes deficiencyId; generates search terms via AI; searches catalog; returns matches

### db.ts
Add: `searchPartsCatalogByKeywords(companyId, keywords, limit)` — keyword match on productName, category, description

### DeficiencyEditor.tsx
- Add "Draft from Notes" modal: rawNotes textarea → AI preview → apply selected fields
- Add "Improve Wording" button (edit mode) → shows improved fields → apply

### RepairQuoteDetail.tsx
- Replace "Draft with AI" with structured `draftRepairQuoteSummary` output (executive summary + scope + approval note)
- Add "Suggest Parts" button → calls `suggestPartsFromDeficiency` → shows matching catalog items with description + price

### No DB schema changes required
All AI provenance fields already exist on deficiencies. No new columns needed.
