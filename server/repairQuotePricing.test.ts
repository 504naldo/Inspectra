import { describe, expect, it } from "vitest";
import { assertRecordedRepairTotal, calculateRepairItem, calculateRepairQuoteTotals } from "./repairQuotePricing";

const base = { quantity: 1, partUnitPrice: 0, techHours: 0, fitterHours: 0, techLabourRate: 0, fitterLabourRate: 0, fuelCharge: 0, backflowReportFee: 0 };
const recorded = (input: Partial<typeof base>) => {
  const pricing = { ...base, ...input };
  return { ...pricing, ...calculateRepairItem(pricing) };
};

describe("Repair quote prices use the same exact cents at each layer", () => {
  it("rounds fractional labour before adding the stored subtotal and tax components", () => {
    const item = recorded({ partUnitPrice: 0.05, techHours: 0.01, techLabourRate: 0.05 });
    expect(item).toMatchObject({ partTotal: 0.05, labourTotal: 0, gst: 0, pst: 0, total: 0.05 });
    expect(calculateRepairQuoteTotals([item])).toEqual({ subtotal: 0.05, gst: 0, pst: 0, total: 0.05 });
  });

  it("rounds half-cent taxes once from the recorded component cents", () => {
    const item = recorded({ partUnitPrice: 0.1 });
    expect(item).toMatchObject({ partTotal: 0.1, gst: 0.01, pst: 0.01, total: 0.12 });
    expect(calculateRepairQuoteTotals([item, item])).toEqual({ subtotal: 0.2, gst: 0.02, pst: 0.02, total: 0.24 });
  });

  it("rounds the combined labour component half up before applying GST", () => {
    expect(recorded({ techHours: 0.01, techLabourRate: 0.5 })).toMatchObject({ labourTotal: 0.01, gst: 0, total: 0.01 });
  });

  it("preserves the recorded fuel and backflow tax treatment", () => {
    expect(recorded({ fuelCharge: 15, backflowReportFee: 10 })).toMatchObject({ lineSubtotal: 25, gst: 0.5, pst: 0, total: 25.5 });
  });

  it("does not silently accept a legacy item total inconsistent with its stored cents", () => {
    const item = { ...recorded({ partUnitPrice: 0.05 }), total: 0.06 };
    expect(() => calculateRepairQuoteTotals([item])).toThrow(/inconsistent/);
  });

  it("checks every header amount rather than only the overall total before issue/conversion", () => {
    const item = recorded({ partUnitPrice: 100 });
    expect(() => assertRecordedRepairTotal({ subtotal: "100.00", gst: "7.00", pst: "5.00", total: "112.00" }, [item])).toThrow(/do not match/);
    expect(() => assertRecordedRepairTotal({ subtotal: "100.00", gst: "5.00", pst: "7.00", total: "112.00" }, [item])).not.toThrow();
  });

  it("rejects unsupported input precision and values exceeding stored monetary limits", () => {
    expect(() => recorded({ partUnitPrice: 1.005 })).toThrow(/two decimal/);
    expect(() => recorded({ partUnitPrice: 99999999.99, quantity: 2 })).toThrow(/limit/);
  });
});
