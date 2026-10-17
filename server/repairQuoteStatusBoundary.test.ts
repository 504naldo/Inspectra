import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { repairQuoteRouter } from "./routers/repairQuoteRouter";
import { logActivity } from "./activityLogger";
import { jobs, quotes, type Quote } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getQuoteById: vi.fn(), updateQuote: vi.fn(),
  getRepairQuoteItemById: vi.fn(), getRepairQuoteItemsByQuote: vi.fn(),
  updateRepairQuoteItem: vi.fn(), createWorkOrder: vi.fn(),
  createApprovedWork: vi.fn(), createNotification: vi.fn(),
  getDb: vi.fn(), withAudit: vi.fn(),
}));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));

function caller() {
  return repairQuoteRouter.createCaller({
    user: { id: 1, role: "office", companyId: 10 }, req: { headers: {} }, res: {},
  } as unknown as TrpcContext);
}
type Caller = ReturnType<typeof caller>;

const actions: { name: string; run: (c: Caller) => Promise<unknown> }[] = [
  { name: "updateStatus", run: c => c.updateStatus({ id: 25, status: "accepted" }) },
  { name: "markSent", run: c => c.markSent({ id: 25 }) },
  { name: "markViewed", run: c => c.markViewed({ id: 25 }) },
  { name: "recordApproval", run: c => c.recordApproval({ id: 25, approvalSource: "internal_entry" }) },
  { name: "approveAllItems", run: c => c.approveAllItems({ id: 25 }) },
  { name: "declineAllItems", run: c => c.declineAllItems({ id: 25 }) },
  { name: "approveSelectedItems", run: c => c.approveSelectedItems({ id: 25, itemIds: [30] }) },
  { name: "declineSelectedItems", run: c => c.declineSelectedItems({ id: 25, itemIds: [30] }) },
  { name: "updateItemApprovalStatus", run: c => c.updateItemApprovalStatus({ quoteId: 25, itemId: 30, approvalStatus: "approved" }) },
  { name: "convertToWorkOrder", run: c => c.convertToWorkOrder({ id: 25 }) },
  { name: "convertApprovedItemsToApprovedWork", run: c => c.convertApprovedItemsToApprovedWork({ id: 25 }) },
];

beforeEach(() => vi.resetAllMocks());

describe.each([
  { label: "unfinalized repair quote", quoteType: "repair", finalizedAt: null },
  { label: "non-repair quote", quoteType: "building", finalizedAt: new Date("2026-01-01") },
])("Repair quote workflow rejects $label", ({ quoteType, finalizedAt }) => {
  it.each(actions)("$name rejects before child access or status side effects", async ({ run }) => {
    vi.mocked(db.getQuoteById).mockResolvedValue({
      id: 25, companyId: 10, jobId: 1, quoteType, finalizedAt, status: "accepted",
    } as Quote);

    await expect(run(caller())).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.getQuoteById).toHaveBeenCalledWith(25);
    for (const [name, operation] of Object.entries(db)) {
      if (name !== "getQuoteById") expect(operation).not.toHaveBeenCalled();
    }
    expect(logActivity).not.toHaveBeenCalled();
  });
});

it("allows a finalized repair quote to advance its delivery status", async () => {
  const quote = {
    id: 25, companyId: 10, jobId: 1, quoteType: "repair", status: "draft",
    siteId: 2, customerOrgId: 3,
    finalizedAt: new Date("2026-01-01"), sentAt: null,
  } as Quote;
  vi.mocked(db.getQuoteById).mockResolvedValue(quote);
  const transaction = {
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const rows = table === quotes ? [quote] : table === jobs ? [{ id: 1, companyId: 10, siteId: 2, customerOrgId: 3 }] : [];
      return {
        for: async () => rows,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
      };
    } }) }),
  };
  vi.mocked(db.getDb).mockResolvedValue(transaction as any);
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _procedure, fn) => fn(transaction as any));

  await expect(caller().markSent({ id: 25 })).resolves.toEqual({ success: true });

  expect(db.updateQuote).toHaveBeenCalledWith(25, { status: "sent", sentAt: expect.any(Date) });
  expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
    entityType: "repair_quote", entityId: 25, eventType: "quote.sent", newValue: "sent",
  }));
});
