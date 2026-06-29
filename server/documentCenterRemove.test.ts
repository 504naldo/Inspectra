import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function octx(companyId: number): TrpcContext {
  return { user: { id: 1, openId: "o", email: "o@e.com", name: "O", role: "office", companyId, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} }, requestId: "t", ip: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}

describe("Document Center remove", () => {
  let companyId: number, siteId: number, attId: number, kbId: number;
  let caller: ReturnType<typeof appRouter.createCaller>;
  beforeAll(async () => {
    const c = await db.createCompany({ name: "Doc Co", email: "d@e.com" });
    companyId = c.id;
    const org = await db.createCustomerOrg({ companyId, name: "Doc Customer" });
    const site = await db.createSite({ companyId, customerOrgId: org.id, name: "Doc Site" });
    siteId = site.id;
    const att = await db.createAttachment({
      entityType: "site", entityId: siteId, siteId, uploadedById: 1,
      fileName: "junk.pdf", fileKey: `k/${companyId}/junk.pdf`, fileUrl: "https://x/junk.pdf", mimeType: "application/pdf",
    } as any);
    attId = att.id;
    const kb = await db.createKnowledgeBaseEntry({
      companyId, title: "Old Manual", category: "general", fileUrl: "https://x/manual.pdf", uploadedById: 1, isActive: true,
    } as any);
    kbId = kb.id;
    caller = appRouter.createCaller(octx(companyId));
  });

  it("hard-deletes an attachment", async () => {
    const res = await caller.documentCenter.remove({ id: `attachment_${attId}` });
    expect(res.removed).toBe("attachment");
    expect(await db.getAttachmentById(attId)).toBeFalsy();
  });

  it("deactivates a knowledge-base doc and drops it from the list", async () => {
    const before = await caller.documentCenter.list({ search: "", docType: "knowledge_base", limit: 50 });
    expect(before.items.some((i) => i.id === `kb_${kbId}`)).toBe(true);

    const res = await caller.documentCenter.remove({ id: `kb_${kbId}` });
    expect(res.removed).toBe("knowledge_base");

    const kb = await db.getKnowledgeBaseById(kbId);
    expect(kb?.isActive).toBeFalsy();
    const after = await caller.documentCenter.list({ search: "", docType: "knowledge_base", limit: 50 });
    expect(after.items.some((i) => i.id === `kb_${kbId}`)).toBe(false);
  });

  it("rejects removing reports and quotes here", async () => {
    await expect(caller.documentCenter.remove({ id: "report_1" })).rejects.toThrow();
    await expect(caller.documentCenter.remove({ id: "quote_1" })).rejects.toThrow();
    await expect(caller.documentCenter.remove({ id: "garbage" })).rejects.toThrow();
  });
});
