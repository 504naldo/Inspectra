import { beforeEach, describe, expect, it, vi } from "vitest";
import { Param } from "drizzle-orm";
import { devices, jobs, inspectionResults } from "../drizzle/schema";
import { getDb } from "./db/client";
import { getSmokeAlarmsByJob } from "./db";

vi.mock("./db/client", () => ({ getDb: vi.fn(), runWithDb: vi.fn() }));
let deviceRows: any[];
let resultRows: any[];
beforeEach(() => {
  deviceRows = [
    {
      id: 8,
      siteId: 10,
      category: "SMOKE_ALARM",
      testResult: "fail",
      lastInspectionDate: new Date("2026-10-10"),
      notes: "Latest visit",
    },
  ];
  resultRows = [
    {
      jobId: 1,
      deviceId: 8,
      result: "pass",
      testedAt: new Date("2026-09-10"),
      notes: "Original visit",
    },
    {
      jobId: 2,
      deviceId: 8,
      result: "fail",
      testedAt: new Date("2026-10-10"),
      notes: "Latest visit",
    },
  ];
  vi.mocked(getDb).mockResolvedValue({
    select: () => ({
      from: (table: unknown) => {
        let id: number;
        const rows = () =>
          table === jobs
            ? [{ id, siteId: 10 }]
            : table === devices
              ? deviceRows
              : table === inspectionResults
                ? resultRows.filter(row => row.jobId === id)
                : [];
        const query = {
          where: (filter: any) => {
            id = filter.queryChunks.find(
              (part: unknown) =>
                part instanceof Param && typeof part.value === "number"
            )?.value;
            return query;
          },
          leftJoin: () => query,
          limit: async () => rows(),
          orderBy: async () => rows(),
        };
        return query;
      },
    }),
  } as any);
});

describe("Smoke alarm results belong to the captured inspection job", () => {
  it("keeps earlier visit results even when the current device state changes", async () => {
    const [earlier] = await getSmokeAlarmsByJob(1);
    const [latest] = await getSmokeAlarmsByJob(2);
    expect(earlier).toMatchObject({
      testResult: "pass",
      lastInspectionDate: new Date("2026-09-10"),
      notes: "Original visit",
    });
    expect(latest).toMatchObject({
      testResult: "fail",
      lastInspectionDate: new Date("2026-10-10"),
      notes: "Latest visit",
    });
  });

  it("does not prefill a new job with another visit's device result", async () => {
    expect((await getSmokeAlarmsByJob(3))[0]).toMatchObject({
      testResult: null,
      lastInspectionDate: null,
    });
  });

  it("distinguishes a recorded no-access visit from an untouched result row", async () => {
    resultRows = [
      {
        jobId: 1,
        deviceId: 8,
        result: "not_tested",
        testedAt: new Date("2026-09-10"),
        notes: "No access",
      },
    ];
    expect((await getSmokeAlarmsByJob(1))[0].testResult).toBe("no_access");
    resultRows[0].testedAt = null;
    expect((await getSmokeAlarmsByJob(1))[0].testResult).toBe(null);
  });
});
