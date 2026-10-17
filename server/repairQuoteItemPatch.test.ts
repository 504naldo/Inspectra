import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { repairQuoteRouter } from "./routers/repairQuoteRouter";
import type { Quote, RepairQuoteItem } from "../drizzle/schema";
import type { Db } from "./db/client";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  quote: {} as Quote,
  item: {} as RepairQuoteItem,
  patch: {} as Record<string, unknown>,
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("./db", () => ({
  getRepairQuoteItemById: vi.fn(),
  getRepairQuoteItemsByQuote: vi.fn(),
  updateQuote: vi.fn(),
}));
vi.mock("./repairQuoteIntegrity", async importOriginal => ({
  ...await importOriginal<typeof import("./repairQuoteIntegrity")>(),
  withLockedRepairQuote: vi.fn(async (
    _ctx: unknown, _procedure: string, _quoteId: number, _companyId: number,
    callback: (quote: Quote, tx: Db) => Promise<unknown>,
  ) => callback(state.quote, { update: state.update } as unknown as Db)),
}));

function caller() {
  return repairQuoteRouter.createCaller({
    user: { id: 1, role: "office", companyId: 10 }, req: { headers: {} }, res: {},
  } as unknown as TrpcContext);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.quote = { id: 25, companyId: 10, quoteType: "repair", status: "draft", jobId: 1, finalizedAt: null } as Quote;
  state.item = {
    id: 30, quoteId: 25, description: "Original scope", deficiencyId: null,
    quantity: 3, partUnitPrice: "120.00", partTotal: "360.00",
    techHours: "2.00", fitterHours: "1.00", techLabourRate: "75.00", fitterLabourRate: "65.00",
    labourTotal: "215.00", fuelCharge: "15.00", backflowReportFee: "40.00",
    gst: "30.75", pst: "25.20", total: "685.95", sortOrder: 7,
  } as RepairQuoteItem;
  state.patch = {};
  state.update.mockReturnValue({ set: state.set });
  state.set.mockImplementation(patch => {
    state.patch = patch;
    return { where: state.where };
  });
  state.where.mockImplementation(async () => { Object.assign(state.item, state.patch); });
  vi.mocked(db.getRepairQuoteItemById).mockImplementation(async () => ({ ...state.item }));
  vi.mocked(db.getRepairQuoteItemsByQuote).mockImplementation(async () => [{ ...state.item }]);
});

function expectPreservedPricing() {
  expect(state.item).toMatchObject({ quantity: 3, sortOrder: 7 });
  expect(state.patch).not.toHaveProperty("quantity");
  expect(state.patch).not.toHaveProperty("sortOrder");
  for (const [field, value] of Object.entries({
    partUnitPrice: 120, partTotal: 360, techHours: 2, fitterHours: 1,
    techLabourRate: 75, fitterLabourRate: 65, labourTotal: 215, backflowReportFee: 40,
    gst: 30.75, pst: 25.2,
  })) expect(Number(state.item[field as keyof RepairQuoteItem])).toBeCloseTo(value, 2);
}

function expectQuoteTotals(subtotal: number, total: number) {
  expect(db.updateQuote).toHaveBeenCalledTimes(1);
  const [quoteId, totals] = vi.mocked(db.updateQuote).mock.calls[0];
  expect(quoteId).toBe(25);
  for (const [field, expected] of Object.entries({ subtotal, gst: 30.75, pst: 25.2, total })) {
    expect(Number(totals[field as keyof typeof totals])).toBeCloseTo(expected, 2);
  }
}

describe("Repair item patches preserve omitted pricing through router input validation", () => {
  it("updates only the description without applying create-time defaults", async () => {
    await expect(caller().updateItem({ quoteId: 25, id: 30, description: "Reworded scope" }))
      .resolves.toEqual({ success: true });

    expectPreservedPricing();
    expect(state.item).toMatchObject({ description: "Reworded scope", fuelCharge: "15", total: "685.95" });
    expectQuoteTotals(630, 685.95);
  });

  it("persists an explicit zero fee while preserving omitted pricing and order", async () => {
    await caller().updateItem({ quoteId: 25, id: 30, fuelCharge: 0 });

    expectPreservedPricing();
    expect(state.item).toMatchObject({ description: "Original scope", fuelCharge: "0", total: "670.95" });
    expectQuoteTotals(615, 670.95);
  });
});
