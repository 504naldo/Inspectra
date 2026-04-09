import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the DB so tests don't need a real database connection
vi.mock("./db", () => ({ getDb: vi.fn() }));
import * as db from "./db";
import { createMockDb, TEMPLATE_FIXTURE } from "./fireAlarmTestFixture";

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

beforeEach(() => {
  vi.mocked(db.getDb).mockResolvedValue(createMockDb() as any);
});

describe("Fire Alarm Checklist API", () => {
  it("should return checklist sections with nested items structure", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();

    expect(sections).toBeInstanceOf(Array);
    expect(sections.length).toBeGreaterThan(0);

    sections.forEach((section: any) => {
      expect(section).toHaveProperty("sectionName");
      expect(section).toHaveProperty("items");
      expect(section.items).toBeInstanceOf(Array);
    });
  });

  it("should return Emergency Power Supply Test and Inspection section with 19 items", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();

    const section = sections.find(
      (s: any) => s.sectionName === "Emergency Power Supply Test and Inspection"
    );

    expect(section).toBeDefined();
    expect(section.items.length).toBe(19);
  });

  it("should have correct input types for battery section fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();
    const section = sections.find(
      (s: any) => s.sectionName === "Emergency Power Supply Test and Inspection"
    );

    expect(section).toBeDefined();
    const items = section.items;

    // Item M: "Battery manufacturer's date code." — inputType text
    const batteryManufacturer = items.find((i: any) =>
      i.itemDescription.includes("Battery manufacturer")
    );
    expect(batteryManufacturer).toBeDefined();
    expect(batteryManufacturer?.inputType).toBe("text");

    // Item C: "Battery voltage with main power supply 'ON'." — inputType text
    const batteryVoltage = items.find((i: any) =>
      i.itemDescription.includes("Battery voltage with main power supply")
    );
    expect(batteryVoltage).toBeDefined();
    expect(batteryVoltage?.inputType).toBe("text");

    // Item H: "Battery terminals clamped tightly." — inputType checkbox
    const terminalsClamped = items.find((i: any) =>
      i.itemDescription.includes("Battery terminals clamped")
    );
    expect(terminalsClamped).toBeDefined();
    expect(terminalsClamped?.inputType).toBe("checkbox");
  });

  it("should have all 11 sections in correct order", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();

    expect(sections.length).toBe(11);

    const sectionNames = sections.map((s: any) => s.sectionName);
    expect(sectionNames[0]).toBe("Documentation");
    expect(sectionNames[5]).toBe("Emergency Power Supply Test and Inspection");
    expect(sectionNames[10]).toBe("Printer Test");
  });

  it("should have total of 128 checklist items across all sections", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();

    // Verify fixture matches expected total
    expect(TEMPLATE_FIXTURE.length).toBe(128);

    const totalItems = sections.reduce(
      (sum: number, section: any) => sum + section.items.length,
      0
    );
    expect(totalItems).toBe(128);
  });
});
