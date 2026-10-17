import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { quoteRouter } from "./routers/quoteRouter";
import { generateBuildingQuotePDF, generateQuotePDF } from "./quotePdfGenerator";
import { storagePut } from "./storage";
import type { Quote } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getQuoteById: vi.fn(), getJobById: vi.fn(), getSiteById: vi.fn(),
  getCustomerOrgById: vi.fn(), getCompanyById: vi.fn(), getDeficiencyById: vi.fn(),
  updateQuote: vi.fn(),
}));
vi.mock("./quotePdfGenerator", () => ({
  generateQuotePDF: vi.fn(), generateBuildingQuotePDF: vi.fn(), generateRepairQuotePDF: vi.fn(),
}));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));

function caller(role: string) {
  return quoteRouter.createCaller({
    user: { id: 1, role, companyId: 10 }, req: { headers: {} }, res: {},
  } as unknown as TrpcContext);
}

function repairQuote(finalized: boolean): Quote {
  return {
    id: 25, companyId: 10, quoteType: "repair", status: "draft",
    jobId: 1, siteId: 2, customerOrgId: 3, lineItems: [], total: "112.00",
    finalizedAt: finalized ? new Date() : null,
  } as Quote;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

function expectNoDeliverySideEffects() {
  expect(generateQuotePDF).not.toHaveBeenCalled();
  expect(generateBuildingQuotePDF).not.toHaveBeenCalled();
  expect(storagePut).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(db.updateQuote).not.toHaveBeenCalled();
}

describe("Repair quote workflow boundaries", () => {
  it.each(["office", "admin"])("%s cannot send draft or finalized repair quotes through legacy delivery", async role => {
    for (const finalized of [false, true]) {
      vi.mocked(db.getQuoteById).mockResolvedValue(repairQuote(finalized));
      await expect(caller(role).send({ id: 25, customerEmail: "customer@example.test", requestId: crypto.randomUUID() }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expectNoDeliverySideEffects();
  });

  it.each(["office", "admin"])("%s cannot replace a repair PDF using the building workflow", async role => {
    for (const finalized of [false, true]) {
      vi.mocked(db.getQuoteById).mockResolvedValue(repairQuote(finalized));
      await expect(caller(role).downloadBuildingPDF({ id: 25 }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expectNoDeliverySideEffects();
  });
});
