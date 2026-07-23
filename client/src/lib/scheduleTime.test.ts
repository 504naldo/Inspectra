import { describe, it, expect } from "vitest";
import {
  combineDateTimeInput,
  formatScheduleTime,
  formatScheduleRange,
  scheduleTimeInputValue,
} from "./utils";

// Pure — locks the UTC-wall-clock round-trip for scheduled start/end times so
// the entered time displays identically regardless of the viewer's timezone.
describe("schedule time helpers", () => {
  it("combineDateTimeInput stores the entered time as UTC wall-clock", () => {
    const d = combineDateTimeInput("2026-07-23", "09:30");
    expect(d.toISOString()).toBe("2026-07-23T09:30:00.000Z");
  });

  it("formatScheduleTime reads back the same wall-clock (UTC)", () => {
    const d = combineDateTimeInput("2026-07-23", "13:00");
    expect(formatScheduleTime(d)).toBe("1:00 PM");
    expect(formatScheduleTime(null)).toBe("");
    expect(formatScheduleTime(undefined)).toBe("");
  });

  it("formatScheduleRange shows start–end, or just start, or empty", () => {
    const s = combineDateTimeInput("2026-07-23", "09:00");
    const e = combineDateTimeInput("2026-07-23", "13:00");
    expect(formatScheduleRange(s, e)).toBe("9:00 AM – 1:00 PM");
    expect(formatScheduleRange(s, null)).toBe("9:00 AM");
    expect(formatScheduleRange(null, e)).toBe("");
  });

  it("scheduleTimeInputValue yields the HH:mm for <input type=time>", () => {
    const d = combineDateTimeInput("2026-07-23", "08:05");
    expect(scheduleTimeInputValue(d)).toBe("08:05");
    expect(scheduleTimeInputValue(null)).toBe("");
  });

  it("round-trips input → stored → input value", () => {
    const stored = combineDateTimeInput("2026-01-02", "16:45");
    expect(scheduleTimeInputValue(stored)).toBe("16:45");
  });
});
