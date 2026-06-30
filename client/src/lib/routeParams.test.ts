import { describe, it, expect } from "vitest";
import { parseRequiredRouteId } from "./routeParams";

describe("parseRequiredRouteId", () => {
  it("accepts positive integers", () => {
    expect(parseRequiredRouteId("1")).toBe(1);
    expect(parseRequiredRouteId("42")).toBe(42);
    expect(parseRequiredRouteId("1000000")).toBe(1000000);
  });

  it("rejects empty / whitespace / missing", () => {
    expect(parseRequiredRouteId("")).toBeNull();
    expect(parseRequiredRouteId("   ")).toBeNull();
    expect(parseRequiredRouteId(undefined)).toBeNull();
    expect(parseRequiredRouteId(null)).toBeNull();
  });

  it("rejects partially-numeric strings", () => {
    expect(parseRequiredRouteId("12abc")).toBeNull();
    expect(parseRequiredRouteId("abc")).toBeNull();
    expect(parseRequiredRouteId("1 2")).toBeNull();
    expect(parseRequiredRouteId("0x1f")).toBeNull();
    expect(parseRequiredRouteId("1e3")).toBeNull();
  });

  it("rejects decimals and negatives", () => {
    expect(parseRequiredRouteId("1.5")).toBeNull();
    expect(parseRequiredRouteId("-1")).toBeNull();
    expect(parseRequiredRouteId("-0")).toBeNull();
  });

  it("rejects NaN/Infinity strings", () => {
    expect(parseRequiredRouteId("NaN")).toBeNull();
    expect(parseRequiredRouteId("Infinity")).toBeNull();
  });

  it("rejects zero by default but allows it when opted in", () => {
    expect(parseRequiredRouteId("0")).toBeNull();
    expect(parseRequiredRouteId("0", { allowZero: true })).toBe(0);
  });

  it("rejects unsafe integers", () => {
    expect(parseRequiredRouteId("99999999999999999999")).toBeNull();
  });
});
