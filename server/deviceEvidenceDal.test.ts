import { beforeEach, describe, expect, it, vi } from "vitest";
import { Param } from "drizzle-orm";
import {
  devices,
  jobs,
  inspectionResults,
  deficiencies,
  type Device,
} from "../drizzle/schema";
import { getDb } from "./db/client";
import * as db from "./db";
import {
  buildCapturedDeviceSnapshot,
  getDeviceRevision,
} from "./canonicalDeviceEvidence";

vi.mock("./db/client", () => ({ getDb: vi.fn(), runWithDb: vi.fn() }));
let master: Device;
let results: any[];
let defects: any[];
let writes: number;
const job = { id: 1, companyId: 10, siteId: 20 };
function parameters(query: any): unknown[] {
  if (query instanceof Param) return [query.value];
  return Array.isArray(query?.queryChunks)
    ? query.queryChunks.flatMap(parameters)
    : [];
}
function selected(table: unknown, filter: unknown) {
  const [first, second] = parameters(filter);
  if (table === jobs) return first === 1 ? [job] : [];
  if (table === devices) return first === master.id ? [master] : [];
  const rows =
    table === inspectionResults
      ? results
      : table === deficiencies
        ? defects
        : [];
  return rows.filter(
    row => row.jobId === first && (second == null || row.deviceId === second)
  );
}
beforeEach(() => {
  master = {
    id: 30,
    companyId: 10,
    siteId: 20,
    category: "FIRE_ALARM_DEVICE",
    deviceType: "Smoke detector",
    location: "Original lobby",
    serialNumber: "ORIGINAL",
    isActive: true,
  } as Device;
  results = [];
  defects = [];
  writes = 0;
  const database = {
    select: () => ({
      from: (table: unknown) => {
        let filter: unknown;
        const query = {
          where: (where: unknown) => {
            filter = where;
            return query;
          },
          leftJoin: () => query,
          orderBy: () => query,
          limit: async () => selected(table, filter),
          for: async () => selected(table, filter),
          then: (resolve: (rows: unknown[]) => void) =>
            resolve(selected(table, filter)),
        };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: async (input: any) => {
        writes++;
        const rows = Array.isArray(input) ? input : [input];
        if (table === inspectionResults)
          for (const row of rows)
            results.push({
              id: results.length + 1,
              walkOrder: null,
              companyId: 10,
              ...row,
            });
        return [{ insertId: 1 }];
      },
    }),
    update: (table: unknown) => ({
      set: (patch: unknown) => ({
        where: async (filter: unknown) => {
          writes++;
          const values = parameters(filter);
          const rows = table === inspectionResults ? results : defects;
          // Primary-key updates use one predicate; job/device refresh uses two.
          for (const row of rows.filter(row =>
            values.length === 1
              ? row.id === values[0]
              : row.jobId === values[0] && row.deviceId === values[1]
          ))
            Object.assign(row, patch);
        },
      }),
    }),
  };
  vi.mocked(getDb).mockResolvedValue(database as any);
});

describe("Inspection device evidence is captured at a verified save", () => {
  it("records the displayed definition and never joins newer equipment metadata into history", async () => {
    await db.upsertInspectionResult({
      jobId: 1,
      deviceId: 30,
      result: "pass",
      technicianId: 7,
      testedAt: new Date(),
      expectedDeviceRevision: getDeviceRevision(master),
    });
    master.location = "Later visit location";
    master.serialNumber = "REPLACED";
    master.deviceType = "Replacement heat detector";
    const [recorded] = await db.getInspectionResultsByJob(1);
    expect(recorded).toMatchObject({
      deviceType: "Smoke detector",
      location: "Original lobby",
      serialNumber: "ORIGINAL",
    });
    expect(results[0].deviceSnapshot).toMatchObject({
      deviceId: 30,
      jobId: 1,
      companyId: 10,
      siteId: 20,
      capturedById: 7,
      captureProvenance: "captured",
    });
  });

  it("rejects an offline definition that changed before its first synchronized answer", async () => {
    const displayed = getDeviceRevision(master);
    master.location = "Changed while the technician was offline";
    await expect(
      db.upsertInspectionResult({
        jobId: 1,
        deviceId: 30,
        result: "pass",
        technicianId: 7,
        testedAt: new Date(),
        expectedDeviceRevision: displayed,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toBe(0);
    expect(results).toEqual([]);
  });

  it("keeps revisionless legacy queued answers unresolved rather than fabricating capture", async () => {
    await expect(
      db.upsertInspectionResult({
        jobId: 1,
        deviceId: 30,
        result: "pass",
        technicianId: 7,
        testedAt: new Date(),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toBe(0);
  });

  it("does not fabricate snapshots for carried-forward rows without an actual capture", async () => {
    await db.createInspectionResult({
      jobId: 1,
      deviceId: 30,
      result: "not_tested",
      technicianId: null,
      testedAt: null,
      carriedForward: 1,
    });
    expect(results[0].deviceSnapshot).toBe(null);
    expect((await db.getInspectionResultsByJob(1))[0]).toMatchObject({
      deviceType: null,
      location: null,
      serialNumber: null,
    });
  });

  it("an acknowledged metadata correction refreshes only the open job's own evidence", async () => {
    const captured = buildCapturedDeviceSnapshot(master, job, 7);
    results = [
      { id: 1, jobId: 1, deviceId: 30, deviceSnapshot: captured },
      {
        id: 2,
        jobId: 2,
        deviceId: 30,
        deviceSnapshot: { location: "Other visit" },
      },
    ];
    defects = [
      { id: 3, jobId: 1, deviceId: 30, deviceSnapshot: captured },
      {
        id: 4,
        jobId: 2,
        deviceId: 30,
        deviceSnapshot: { location: "Other visit" },
      },
    ];
    expect(await db.refreshJobDeviceEvidence(1, 30, 7)).toBe(
      getDeviceRevision(master)
    );
    expect(results[0].deviceSnapshot).toMatchObject({
      location: "Original lobby",
      jobId: 1,
    });
    expect(defects[0].deviceSnapshot).toMatchObject({
      location: "Original lobby",
      jobId: 1,
    });
    expect(results[1].deviceSnapshot).toEqual({ location: "Other visit" });
    expect(defects[1].deviceSnapshot).toEqual({ location: "Other visit" });
  });

  it("a metadata correction cannot reconstruct missing legacy device evidence", async () => {
    results = [{ id: 1, jobId: 1, deviceId: 30, deviceSnapshot: null }];
    defects = [{ id: 2, jobId: 1, deviceId: 30, deviceSnapshot: null }];
    await db.refreshJobDeviceEvidence(1, 30, 7);
    expect(results[0].deviceSnapshot).toBe(null);
    expect(defects[0].deviceSnapshot).toBe(null);
    expect(writes).toBe(0);
  });
});
