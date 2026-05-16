# AI Knowledge Base — Pre-Build Audit

## Existing Knowledge Base Infrastructure

### Schema (`drizzle/schema.ts`, lines 561-579)
A `knowledge_base` table already existed with:
- `id`, `companyId`, `title`
- `category` — mysqlEnum with 5 values: `sop | code | manual | template | other`
- `content` — text (nullable)
- `fileKey`, `fileUrl` — for file-based items
- `uploadedById` — creator reference
- `isActive` — soft-delete
- `createdAt`, `updatedAt`

**Missing from original schema:**
- `systemType` (fire_alarm, sprinkler, etc.)
- `visibility` (admin_office, technician, ai_only)
- `tagsJson` (array of tags for keyword matching)
- `siteId`, `customerOrgId` (scoped items)
- `sourceType` (manual | file | document)
- `sourceFileId`, `sourceDocumentId` (provenance tracking)
- More granular categories (only 5 existed vs. 11 needed)

### Existing DB Functions (`server/db.ts`)
Three functions existed:
- `createKnowledgeBaseEntry(data)` — insert
- `getKnowledgeBaseByCompany(companyId)` — list active items
- `searchKnowledgeBase(companyId, query)` — title + content LIKE search

**Missing:**
- `getKnowledgeBaseById(id)` — single item fetch
- `updateKnowledgeBaseEntry(id, data)` — update
- `listKnowledgeBase(companyId, opts)` — filtered list for admin UI
- `getRelevantKnowledgeContext(companyId, query, opts)` — retrieval for AI

### Existing AI Infrastructure
- `server/routers/aiAssistantRouter.ts` — 4 procedures (ask, getContextSummary, draftCustomerMessage, draftDeficiencyText)
- `server/_core/llm.ts` — `invokeLLM()` using OpenAI Chat Completions
- No knowledge base integration in AI procedures (raw LLM calls with record context only)
- No system prompt instruction to use KB content

### Document Center Integration (`server/routers/documentCenterRouter.ts`)
- Knowledge base items with `fileUrl IS NOT NULL` already surfaced in Document Center
- Shown with `docType: "knowledge_base"` and BookOpen icon
- href links to `/admin/documents` (generic fallback)
- **Only file-based items were shown** — text-only knowledge items were excluded

### Existing Upload Support
- `server/routers/filesRouter.ts` — S3 file upload, XLSX import
- File upload to S3 works (companyId-scoped), returns `fileUrl`
- No direct KB file upload UI existed

### Router Registration
- No `knowledgeBaseRouter` existed in `server/routers.ts`

---

## What Was Reused

| Component | Reused | Notes |
|---|---|---|
| `knowledge_base` DB table | Yes | Extended with 9 new columns via migration 0050 |
| `createKnowledgeBaseEntry()` | Yes | Used by new router |
| `getKnowledgeBaseByCompany()` | Yes (kept) | Kept for backward compat |
| `searchKnowledgeBase()` | Yes (kept) | Kept for backward compat |
| `invokeLLM()` | Yes | Used for all AI calls |
| `officeProcedure`, `protectedProcedure` | Yes | Role-based access |
| `logActivity()` | Yes | Audit logging |
| shadcn/ui components | Yes | Card, Dialog, Select, Badge, etc. |
| AdminLayout | Yes | Page wrapper |

---

## What Was Missing (Now Added)

| Gap | Resolution |
|---|---|
| No `knowledgeBaseRouter` | Created `server/routers/knowledgeBaseRouter.ts` |
| No getById / update / filtered list | Added 4 new db functions |
| No `getRelevantKnowledgeContext()` | Added keyword-based retrieval function |
| No AI integration | Updated `ask` procedure to include KB snippets |
| No admin UI | Created `client/src/pages/admin/KnowledgeBase.tsx` |
| No route | Added `/admin/knowledge-base` to App.tsx |
| No nav item | Added "AI Knowledge" to AdminLayout secondary nav |
| No "Use KB" toggle in AI chat | Added toggle + "Knowledge used" collapsible section |
| Extended categories | 5 → 11 categories, category changed to varchar(50) |
| No systemType / visibility / tags | Added via schema extension + migration 0050 |

---

## No Vector Database

The repo uses no vector database (no pgvector, pinecone, chroma, etc.). Retrieval is keyword-based (SQL LIKE) which matches the existing `searchKnowledgeBase()` pattern. This is appropriate for v1 where the knowledge base is small and content is curated by admins.

---

## Security Summary

- All KB procedures gated by `officeProcedure` (admin + office only) — technicians cannot manage items
- `companyId` always from `ctx.user.companyId!` — never from client
- `getRelevantKnowledgeContext()` filters by `companyId` AND `isActive = true` AND `visibility IN ('admin_office', 'ai_only')` — never serves technician-only items to AI without authorization
- No customer-facing access in v1
- KB content included in AI prompt as labeled "INTERNAL KNOWLEDGE BASE REFERENCE" — AI instructed not to invent if missing
