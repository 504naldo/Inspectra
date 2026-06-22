import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the DB so tests don't need a real database connection
vi.mock("./db", () => ({
  getDb: vi.fn(),
  assertJobCompany: vi.fn().mockResolvedValue(undefined),
  assertJobNotFinalized: vi.fn().mockResolvedValue(undefined),
}));
import * as db from "./db";
import { createMockDb } from "./fireAlarmTestFixture";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    companyId: 1,
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

const BATTERY_SECTION = "Emergency Power Supply Test and Inspection";

describe("Fire Alarm Auto-Save Functionality", () => {
  it("should save inspection result with text value", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
      operationType: "single_stage",
    });

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    expect(system).toBeDefined();

    const sections = await caller.fireAlarm.getChecklistSections();
    const batterySection = sections.find((s: any) => s.sectionName === BATTERY_SECTION);
    expect(batterySection).toBeDefined();

    // Item M: "Battery manufacturer's date code." — inputType text
    const batteryManufacturerItem = batterySection.items.find((i: any) =>
      i.itemDescription.includes("Battery manufacturer")
    );
    expect(batteryManufacturerItem).toBeDefined();

    const saveResult = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: batteryManufacturerItem.id,
      result: "not_tested",
      textValue: "Yuasa",
      notes: "",
    });

    expect(saveResult.success).toBe(true);
    expect(saveResult.id).toBeDefined();
  });

  it("should update existing result on subsequent saves", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const batterySection = sections.find((s: any) => s.sectionName === BATTERY_SECTION);
    const batteryManufacturerItem = batterySection.items.find((i: any) =>
      i.itemDescription.includes("Battery manufacturer")
    );

    const firstSave = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: batteryManufacturerItem.id,
      result: "not_tested",
      textValue: "Yuasa",
      notes: "",
    });
    expect(firstSave.success).toBe(true);

    const secondSave = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: batteryManufacturerItem.id,
      result: "not_tested",
      textValue: "Panasonic",
      notes: "Changed manufacturer",
    });
    expect(secondSave.success).toBe(true);
    expect(secondSave.id).toBe(firstSave.id); // same ID → update, not insert

    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === batteryManufacturerItem.id);

    expect(savedResult).toBeDefined();
    expect(savedResult.textValue).toBe("Panasonic");
    expect(savedResult.notes).toBe("Changed manufacturer");
  });

  it("should save numeric values for voltage fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const batterySection = sections.find((s: any) => s.sectionName === BATTERY_SECTION);

    // Item C: "Battery voltage with main power supply 'ON'." — inputType text
    const batteryVoltageItem = batterySection.items.find((i: any) =>
      i.itemDescription.includes("Battery voltage with main power supply")
    );
    expect(batteryVoltageItem).toBeDefined();
    expect(batteryVoltageItem.inputType).toBe("text");

    const saveResult = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: batteryVoltageItem.id,
      result: "not_tested",
      numericValue: "12.6",
      notes: "",
    });
    expect(saveResult.success).toBe(true);

    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === batteryVoltageItem.id);

    expect(savedResult).toBeDefined();
    expect(savedResult.numericValueRaw).toBe("12.6");
  });

  it("should save checkbox results (YES/NO/NA)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const batterySection = sections.find((s: any) => s.sectionName === BATTERY_SECTION);

    // Item H: "Battery terminals clamped tightly." — inputType checkbox
    const clampedItem = batterySection.items.find((i: any) =>
      i.itemDescription.includes("Battery terminals clamped")
    );
    expect(clampedItem).toBeDefined();
    expect(clampedItem.inputType).toBe("checkbox");

    const saveResult = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: clampedItem.id,
      result: "pass",
      notes: "Connections are clean and secure",
    });
    expect(saveResult.success).toBe(true);

    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === clampedItem.id);

    expect(savedResult).toBeDefined();
    expect(savedResult.result).toBe("pass");
    expect(savedResult.notes).toBe("Connections are clean and secure");
  });

  it("should save notes independently", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });

    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const batterySection = sections.find((s: any) => s.sectionName === BATTERY_SECTION);
    const firstItem = batterySection.items[0];

    const saveResult = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: firstItem.id,
      result: "not_tested",
      notes: "This is a test note for auto-save",
    });
    expect(saveResult.success).toBe(true);

    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === firstItem.id);

    expect(savedResult).toBeDefined();
    expect(savedResult.notes).toBe("This is a test note for auto-save");
  });
});
