import { describe, it, expect } from "vitest";
import { buildHealthPayload } from "./_core/health";

describe("buildHealthPayload", () => {
  it("reports ok status", () => {
    expect(buildHealthPayload().status).toBe("ok");
  });

  it("includes a non-negative numeric uptime", () => {
    const payload = buildHealthPayload();
    expect(typeof payload.uptime).toBe("number");
    expect(payload.uptime).toBeGreaterThanOrEqual(0);
  });

  it("serializes the timestamp as an ISO 8601 string from the given clock", () => {
    const fixed = new Date("2026-06-27T12:34:56.000Z");
    expect(buildHealthPayload(fixed).timestamp).toBe("2026-06-27T12:34:56.000Z");
  });

  it("is JSON-serializable (no circular refs / undefined fields)", () => {
    const payload = buildHealthPayload();
    const roundTripped = JSON.parse(JSON.stringify(payload));
    expect(roundTripped).toEqual(payload);
  });
});
