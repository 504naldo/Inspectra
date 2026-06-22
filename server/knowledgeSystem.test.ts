/**
 * knowledgeSystem.test.ts
 *
 * Proves the security and data-integrity guarantees of the Property & Equipment
 * Knowledge System routers, using the same db-mocking + createCaller approach as
 * crossTenantSecurity.test.ts (no live database required):
 *   - Cross-company access to pages / sites / facts is rejected with FORBIDDEN.
 *   - Customers have no access; technicians are read-only and verified-only.
 *   - Ingestion only ever creates DRAFT facts, each with a source citation.
 *   - An AI fact cannot be verified without a citation.
 *   - Editing a fact is append-only (new draft + original marked stale).
 *   - Q&A can only cite facts from the company/page-scoped set it was given.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getSiteById: vi.fn(),
  getKnowledgePageById: vi.fn(),
  getKnowledgeFactById: vi.fn(),
  listKnowledgePagesBySite: vi.fn(),
  createKnowledgePage: vi.fn(),
  touchKnowledgePage: vi.fn(),
  createKnowledgeSourceDocument: vi.fn(),
  updateKnowledgeSourceDocument: vi.fn(),
  listKnowledgeSourceDocumentsBySite: vi.fn(),
  createKnowledgeFact: vi.fn(),
  createKnowledgeFactCitation: vi.fn(),
  listKnowledgeFactsByPage: vi.fn(),
  updateKnowledgeFact: vi.fn(),
  listCitationsByFactIds: vi.fn(async () => []),
  countCitationsForFact: vi.fn(),
  createKnowledgeQuestion: vi.fn(),
  listKnowledgeQuestionsByPage: vi.fn(),
}));

vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn(async () => ({ key: "k", url: "https://example/u" })) }));
vi.mock("./_core/pdfImport", () => ({ extractPdfText: vi.fn(async () => "extracted text") }));
vi.mock("./_core/knowledgeExtraction", () => ({ classifyDocumentText: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

import * as db from "./db";
import * as storage from "./storage";
import { classifyDocumentText } from "./_core/knowledgeExtraction";
import { invokeLLM } from "./_core/llm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(companyId: number, role: AuthenticatedUser["role"] = "office"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1, openId: "u1", email: "u@x.com", name: "U", loginMethod: "manus",
    role, companyId, customerOrgId: role === "customer" ? 9 : null,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    requestId: "t", ipAddress: "127.0.0.1", userAgent: "vitest",
  };
}

// A small valid base64 payload; the .pdf filename satisfies the PDF guard.
const PDF_B64 = Buffer.from("hello").toString("base64");

beforeEach(() => vi.clearAllMocks());

describe("Cross-tenant access", () => {
  it("knowledgePage.get rejects a page from another company", async () => {
    vi.mocked(db.getKnowledgePageById).mockResolvedValue({ id: 7, companyId: 2 } as any);
    const caller = appRouter.createCaller(makeCtx(1));
    await expect(caller.knowledgePage.get({ pageId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("knowledgeIngestion.ingestDocument rejects a site from another company before any storage/LLM work", async () => {
    vi.mocked(db.getSiteById).mockResolvedValue({ id: 5, companyId: 2, name: "S" } as any);
    const caller = appRouter.createCaller(makeCtx(1));
    await expect(
      caller.knowledgeIngestion.ingestDocument({
        siteId: 5, pageId: 7, documentType: "inspection_report",
        fileName: "r.pdf", fileDataBase64: PDF_B64,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storage.storagePut).not.toHaveBeenCalled();
    expect(classifyDocumentText).not.toHaveBeenCalled();
  });

  it("knowledgeFact.approve rejects a fact from another company", async () => {
    vi.mocked(db.getKnowledgeFactById).mockResolvedValue({ id: 3, companyId: 2, status: "draft", generatedByAi: true } as any);
    const caller = appRouter.createCaller(makeCtx(1));
    await expect(caller.knowledgeFact.approve({ factId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateKnowledgeFact).not.toHaveBeenCalled();
  });
});

describe("Role gating", () => {
  it("customers cannot read knowledge facts", async () => {
    const caller = appRouter.createCaller(makeCtx(1, "customer"));
    await expect(caller.knowledgeFact.listForPage({ pageId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("technicians cannot approve facts (office-only)", async () => {
    const caller = appRouter.createCaller(makeCtx(1, "technician"));
    await expect(caller.knowledgeFact.approve({ factId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateKnowledgeFact).not.toHaveBeenCalled();
  });

  it("technicians see verified facts only; office sees all", async () => {
    vi.mocked(db.getKnowledgePageById).mockResolvedValue({ id: 7, companyId: 1 } as any);
    vi.mocked(db.listKnowledgeFactsByPage).mockResolvedValue([]);

    await appRouter.createCaller(makeCtx(1, "technician")).knowledgeFact.listForPage({ pageId: 7 });
    expect(db.listKnowledgeFactsByPage).toHaveBeenCalledWith(7, { statuses: ["verified"] });

    vi.mocked(db.listKnowledgeFactsByPage).mockClear();
    await appRouter.createCaller(makeCtx(1, "office")).knowledgeFact.listForPage({ pageId: 7 });
    expect(db.listKnowledgeFactsByPage).toHaveBeenCalledWith(7, {});
  });
});

describe("Citation guarantee", () => {
  it("cannot verify an AI fact with no citation", async () => {
    vi.mocked(db.getKnowledgeFactById).mockResolvedValue({ id: 3, companyId: 1, status: "draft", generatedByAi: true, pageId: 7 } as any);
    vi.mocked(db.countCitationsForFact).mockResolvedValue(0);
    const caller = appRouter.createCaller(makeCtx(1));
    await expect(caller.knowledgeFact.approve({ factId: 3 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateKnowledgeFact).not.toHaveBeenCalled();
  });

  it("verifies an AI fact that has a citation", async () => {
    vi.mocked(db.getKnowledgeFactById).mockResolvedValue({ id: 3, companyId: 1, status: "reviewed", generatedByAi: true, pageId: 7, sourceType: "manufacturer_doc" } as any);
    vi.mocked(db.countCitationsForFact).mockResolvedValue(1);
    const caller = appRouter.createCaller(makeCtx(1));
    await expect(caller.knowledgeFact.approve({ factId: 3 })).resolves.toEqual({ success: true });
    expect(db.updateKnowledgeFact).toHaveBeenCalledWith(3, expect.objectContaining({ status: "verified" }));
  });
});

describe("Ingestion produces only cited drafts", () => {
  it("creates one DRAFT fact + one citation per candidate, never verified", async () => {
    vi.mocked(db.getSiteById).mockResolvedValue({ id: 5, companyId: 1, name: "Acme Tower", address: "1 St", city: "Town" } as any);
    vi.mocked(db.getKnowledgePageById).mockResolvedValue({ id: 7, companyId: 1, siteId: 5 } as any);
    vi.mocked(db.createKnowledgeSourceDocument).mockResolvedValue({ id: 100 } as any);
    let nextId = 200;
    vi.mocked(db.createKnowledgeFact).mockImplementation(async () => ({ id: ++nextId } as any));
    vi.mocked(db.createKnowledgeFactCitation).mockResolvedValue({ id: 1 } as any);
    vi.mocked(classifyDocumentText).mockResolvedValue({
      modelUsed: "gpt-4o-mini",
      promptHash: "abc",
      facts: [
        { content: "Panel is a Simplex 4100", sourceType: "manufacturer_doc", citationExcerpt: "Model 4100", locationRef: "p.2", confidence: "high" },
        { content: "Annual test due in May", sourceType: "technician_observation", citationExcerpt: "next test May", locationRef: null, confidence: "medium" },
      ],
    });

    const caller = appRouter.createCaller(makeCtx(1));
    const res = await caller.knowledgeIngestion.ingestDocument({
      siteId: 5, pageId: 7, documentType: "inspection_report",
      fileName: "report.pdf", fileDataBase64: PDF_B64,
    });

    expect(res.factsCreated).toBe(2);
    expect(db.createKnowledgeFact).toHaveBeenCalledTimes(2);
    expect(db.createKnowledgeFactCitation).toHaveBeenCalledTimes(2);
    // Every created fact is a draft, AI-flagged, never verified.
    for (const call of vi.mocked(db.createKnowledgeFact).mock.calls) {
      expect(call[0]).toMatchObject({ status: "draft", generatedByAi: true });
      expect(call[0].status).not.toBe("verified");
    }
    // Each citation points at the stored source document.
    for (const call of vi.mocked(db.createKnowledgeFactCitation).mock.calls) {
      expect(call[0]).toMatchObject({ sourceType: "knowledge_source_document", sourceId: 100 });
    }
  });
});

describe("Editing is append-only", () => {
  it("creates a new draft superseding the original and marks the original stale", async () => {
    vi.mocked(db.getKnowledgeFactById).mockResolvedValue({ id: 3, companyId: 1, pageId: 7, sourceType: "ai_inference", confidence: "low", aiContext: null } as any);
    vi.mocked(db.createKnowledgeFact).mockResolvedValue({ id: 99 } as any);
    vi.mocked(db.listCitationsByFactIds).mockResolvedValue([
      { id: 1, factId: 3, companyId: 1, sourceType: "knowledge_source_document", sourceId: 100, excerpt: "x", locationRef: null, createdAt: new Date() } as any,
    ]);

    const caller = appRouter.createCaller(makeCtx(1));
    const res = await caller.knowledgeFact.edit({ factId: 3, content: "Corrected statement" });

    expect(res).toEqual({ newFactId: 99 });
    expect(db.createKnowledgeFact).toHaveBeenCalledWith(expect.objectContaining({
      supersedesFactId: 3, status: "draft", generatedByAi: false, content: "Corrected statement",
    }));
    // Citation carried forward to the new fact.
    expect(db.createKnowledgeFactCitation).toHaveBeenCalledWith(expect.objectContaining({ factId: 99, sourceId: 100 }));
    // Original marked stale, never deleted.
    expect(db.updateKnowledgeFact).toHaveBeenCalledWith(3, { status: "stale" });
  });
});

describe("Q&A grounding", () => {
  it("only cites facts from the scoped set and logs the question", async () => {
    vi.mocked(db.getKnowledgePageById).mockResolvedValue({ id: 7, companyId: 1, title: "Acme Tower" } as any);
    vi.mocked(db.listKnowledgeFactsByPage).mockResolvedValue([
      { id: 10, content: "Fact A", status: "verified", sourceType: "manufacturer_doc" },
      { id: 11, content: "Fact B", status: "verified", sourceType: "technician_observation" },
    ] as any);
    vi.mocked(invokeLLM).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ answer: "It is A.", cited_fact_ids: [10, 999] }) } }],
    } as any);

    const caller = appRouter.createCaller(makeCtx(1, "office"));
    const res = await caller.knowledgeQA.ask({ pageId: 7, question: "Which fact?" });

    // The hallucinated id 999 is dropped; only the in-scope fact 10 remains.
    expect(res.citedFacts.map((f) => f.id)).toEqual([10]);
    expect(db.createKnowledgeQuestion).toHaveBeenCalledWith(expect.objectContaining({ citedFactIds: [10], pageId: 7 }));
  });
});
