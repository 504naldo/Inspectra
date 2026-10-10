import { describe, it, expect } from "vitest";
import { estimateUnits } from "./estimateUnits";
describe("exact fitter estimate units", () => {
  it("keeps total person-hours and fractional parts exact", () => {
    expect(estimateUnits("8", 2)).toBe(800);
    expect(estimateUnits("1.25", 2)).toBe(125);
    expect(estimateUnits("2.501", 3)).toBe(2501);
  });
  it("rejects excess precision, negative/invalid amounts and overflow instead of rounding", () => {
    for (const value of [
      "8.001",
      "-1",
      "NaN",
      "1e3",
      "Infinity",
      "9007199254740991",
    ])
      expect(() => estimateUnits(value, 2)).toThrow();
  });
});
