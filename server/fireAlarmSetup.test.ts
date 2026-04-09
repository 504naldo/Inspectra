import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the DB so tests don't need a real database connection
vi.mock("./db", () => ({ getDb: vi.fn() }));
import * as db from "./db";
import { createMockDb } from "./fireAlarmTestFixture";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(companyId: number = 2): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    companyId,
    customerOrgId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

// Each test gets a fresh in-memory DB (no cross-test state)
beforeEach(() => {
  vi.mocked(db.getDb).mockResolvedValue(createMockDb() as any);
});

describe("fireAlarm.upsertSystem", () => {
  it("creates a new fire alarm system for a site", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fireAlarm.upsertSystem({
      siteId: 2,
      manufacturer: "Simplex",
      modelNumber: "4100ES",
      operationType: "single_stage",
      connectedToMonitoring: true,
      monitoringCentreName: "ADT",
      monitoringCentrePhone: "1-800-555-0123",
    });

    expect(result.success).toBe(true);
  });

  it("updates an existing fire alarm system", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.fireAlarm.upsertSystem({
      siteId: 2,
      manufacturer: "Notifier",
      modelNumber: "NFS-320",
      operationType: "two_stage",
      connectedToMonitoring: false,
    });

    const result = await caller.fireAlarm.upsertSystem({
      siteId: 2,
      manufacturer: "Notifier Updated",
      modelNumber: "NFS-320",
      operationType: "two_stage",
      connectedToMonitoring: true,
      monitoringCentreName: "Chubb",
      monitoringCentrePhone: "1-800-555-9999",
    });

    expect(result.success).toBe(true);

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 2 });
    expect(system?.connectedToMonitoring).toBe(true);
    expect(system?.monitoringCentreName).toBe("Chubb");
  });
});

describe("fireAlarm.getSystemBySite", () => {
  it("retrieves fire alarm system by site ID", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.fireAlarm.upsertSystem({
      siteId: 2,
      manufacturer: "Edwards",
      modelNumber: "EST3",
      operationType: "single_stage",
      connectedToMonitoring: false,
    });

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 2 });

    expect(system).toBeDefined();
    expect(system?.manufacturer).toBe("Edwards");
    expect(system?.modelNumber).toBe("EST3");
    expect(system?.operationType).toBe("single_stage");
  });

  it("returns null for site without fire alarm system", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 9999 });

    expect(system).toBeNull();
  });
});
