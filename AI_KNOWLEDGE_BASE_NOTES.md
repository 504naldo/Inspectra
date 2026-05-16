# AI Knowledge Base v1 — Implementation Notes

## Route / Nav Added

- Route: `/admin/knowledge-base` (admin + office only)
- Nav item: "AI Knowledge" in AdminLayout secondary nav (BookOpen icon)

---

## Backend Router Added

**`server/routers/knowledgeBaseRouter.ts`** — registered at `knowledgeBase` in appRouter

| Procedure | Type | Access | Description |
|---|---|---|---|
| `knowledgeBase.list` | query | officeProcedure | Filtered list with search, category, systemType, visibility, includeInactive |
| `knowledgeBase.get` | query | officeProcedure | Single item by ID (companyId-gated) |
| `knowledgeBase.create` | mutation | officeProcedure | Create new knowledge item |
| `knowledgeBase.update` | mutation | officeProcedure | Update existing item (companyId-gated) |
| `knowledgeBase.deactivate` | mutation | officeProcedure | Soft-delete or reactivate (companyId-gated) |
| `knowledgeBase.search` | query | officeProcedure | Keyword search returning compact snippets |
| `knowledgeBase.getRelevantContext` | query | officeProcedure | Returns snippets for AI (used internally) |

---

## Schema / Table Changes

**Migration: `drizzle/migrations/0050_knowledge_base_extended.sql`**

The existing `knowledge_base` table was extended:

| Change | Details |
|---|---|
| `category` type | Changed from ENUM(5 values) to VARCHAR(50) — allows new categories without migrations |
| `systemType` | New VARCHAR(50) nullable — fire_alarm, sprinkler, etc. |
| `tagsJson` | New JSON nullable — array of strings for keyword matching |
| `visibility` | New ENUM('admin_office','technician','ai_only') DEFAULT 'admin_office' |
| `siteId` | New INT nullable — site-scoped items |
| `customerOrgId` | New INT nullable — customer-scoped items |
| `sourceType` | New VARCHAR(50) DEFAULT 'manual' — manual, file, or document |
| `sourceFileId` | New INT nullable — link to attachment |
| `sourceDocumentId` | New INT nullable — link to document center |

**New DB Functions (`server/db.ts`):**
- `getKnowledgeBaseById(id)` — single item lookup
- `listKnowledgeBase(companyId, opts)` — filtered list for admin UI
- `updateKnowledgeBaseEntry(id, data)` — update
- `getRelevantKnowledgeContext(companyId, query, opts)` — retrieval for AI integration

---

## Retrieval Method

**Type:** Keyword-based (SQL LIKE) — no vector database, no embeddings.

**Function:** `getRelevantKnowledgeContext(companyId, query, { mode?, systemType?, limit? })`

**Matching logic:**
1. Filter by `companyId` (strict)
2. Filter `isActive = true`
3. Filter `visibility IN ('admin_office', 'ai_only')` — never serves technician-only items to AI
4. If `query` present: `title LIKE %query%` OR `content LIKE %query%`
5. If `systemType` present: exact match OR NULL (general items apply to all systems)
6. Order by `updatedAt DESC` (most recently updated first)
7. Limit (default 3 snippets per AI call)

**Output:** Compact snippets — `{ id, title, category, systemType, excerpt (first 250 chars of content) }`

**Why keyword search is sufficient for v1:** The knowledge base is curated by admins, small in size, and queries are short AI assistant messages. Full-text search or vector similarity would add infrastructure complexity (embeddings API, pgvector) without meaningful benefit at this scale.

---

## AI Assistant Integration

**Updated procedure:** `aiAssistant.ask`

**New input field:** `useKnowledgeBase: boolean` (default: `true`)

**Behavior:**
1. If `useKnowledgeBase = true` AND mode is eligible (all except `summarize`)
2. Call `getRelevantKnowledgeContext(companyId, message, { mode, limit: 3 })`
3. Format snippets as labeled `INTERNAL KNOWLEDGE BASE REFERENCE` block
4. Inject into user message before user question
5. Return `knowledgeUsed: { id, title, category, systemType }[]` in response

**System prompt addition:**
> "Use knowledge base content as internal reference material. If it is missing or unclear, say so instead of inventing."

**Frontend changes (AIAssistant.tsx):**
- "Use Knowledge Base" toggle in sidebar (default ON)
- After each assistant message: "N knowledge items used" collapsible link
- Expanded view shows item title, category, systemType + link to Knowledge Base page
- "Knowledge Base" added to Suggested Actions list

---

## Permissions / Scoping Rules

| Role | Access |
|---|---|
| Admin | Full CRUD on knowledgeBase procedures, can see all visibility levels |
| Office | Full CRUD on knowledgeBase procedures, can see all visibility levels |
| Technician | Cannot access knowledgeBaseRouter procedures (officeProcedure guard) |
| Customer | No access in v1 |
| AI (via `ask`) | Only served `admin_office` + `ai_only` visibility items |

**companyId enforcement:**
- Every write procedure verifies `existing.companyId === ctx.user.companyId!`
- Every read procedure filters by `eq(knowledgeBase.companyId, companyId)` where `companyId = ctx.user.companyId!`
- `getRelevantKnowledgeContext()` in db.ts enforces companyId at query level

---

## Limitations (v1)

1. **Keyword search only** — no semantic/vector similarity. Works best when users write content that matches the terms they'll ask about.
2. **No file content extraction** — KB items with `fileUrl` are visible in Document Center but their file content is NOT indexed for AI. Only text in the `content` column is used for retrieval.
3. **No OCR / PDF parsing** — not implemented. AI can only reference manually typed or pasted content.
4. **No auto-ingestion** — admins must manually create KB items. Documents are not automatically imported.
5. **No technician-facing UI** — technicians cannot view or search the knowledge base (planned for v2).
6. **No site/customer scoping in retrieval** — `siteId`/`customerOrgId` columns are stored but not used in `getRelevantKnowledgeContext` yet (v2 enhancement).
7. **Snippet length** — only first 250 chars of content are sent to AI per item. Longer documents should be summarized when entered.
8. **Migration must be run manually** — `0050_knowledge_base_extended.sql` must be run on Railway before deploying the updated code.

---

## Manual Test Checklist

- [ ] Run migration `0050_knowledge_base_extended.sql` on the database before testing
- [ ] Navigate to `/admin/knowledge-base` — page loads with empty state and quick-start guide
- [ ] Click "New Item" — dialog opens with all fields
- [ ] Create a knowledge item with title, category (e.g. inspection_guidance), content, and tags — item appears in list
- [ ] Filter by category — only matching items shown
- [ ] Filter by system type — only matching items shown
- [ ] Search by keyword — items with keyword in title or content returned
- [ ] Edit an item — changes saved
- [ ] Deactivate an item — item disappears from active list (toggle "Show Inactive" to see it)
- [ ] Reactivate — item returns to active list
- [ ] Navigate to `/admin/ai-assistant` — "Use Knowledge Base" toggle visible (default ON)
- [ ] Ask a question related to a knowledge item — response shows "1 knowledge item used" link
- [ ] Click the knowledge item link — expands showing item title, category, systemType
- [ ] Toggle "Use Knowledge Base" OFF — ask same question — no knowledge items shown
- [ ] "Knowledge Base" link in AI Assistant suggested actions — navigates to /admin/knowledge-base
- [ ] Verify: tech role cannot access knowledgeBase procedures (403 on direct API call)
- [ ] Verify: knowledge items from other companies are never returned
