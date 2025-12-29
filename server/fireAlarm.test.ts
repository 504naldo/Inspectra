import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("Fire Alarm Checklist API", () => {
  it("should return checklist sections with nested items structure", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Call the fire alarm checklist endpoint
    const sections = await caller.fireAlarm.getChecklistSections();

    // Verify structure
    expect(sections).toBeInstanceOf(Array);
    expect(sections.length).toBeGreaterThan(0);

    // Each section should have sectionName and items array
    sections.forEach((section: any) => {
      expect(section).toHaveProperty("sectionName");
      expect(section).toHaveProperty("items");
      expect(section.items).toBeInstanceOf(Array);
    });
  });

  it("should return Section 4 with 18 battery testing items", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();

    // Find Section 4
    const section4 = sections.find((s: any) => s.sectionName === "Emergency Power Supply Test");

    expect(section4).toBeDefined();
    expect(section4.items.length).toBe(18);
  });

  it("should have correct input types for battery testing fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();
    const section4 = sections.find((s: any) => s.sectionName === "Emergency Power Supply Test");

    expect(section4).toBeDefined();

    const items = section4.items;

    // Verify specific items with their input types
    const batteryManufacturer = items.find((i: any) => i.itemDescription.includes("Battery Manufacturer"));
    expect(batteryManufacturer).toBeDefined();
    expect(batteryManufacturer?.inputType).toBe("text");

    const batteryVoltage = items.find((i: any) => i.itemDescription.includes("Battery Rated Voltage"));
    expect(batteryVoltage).toBeDefined();
    expect(batteryVoltage?.inputType).toBe("voltage");

    const installationYear = items.find((i: any) => i.itemDescription.includes("Battery Installation Year"));
    expect(installationYear).toBeDefined();
    expect(installationYear?.inputType).toBe("year");

    const transferTime = items.find((i: any) => i.itemDescription.includes("Time for automatic transfer"));
    expect(transferTime).toBeDefined();
    expect(transferTime?.inputType).toBe("time");

    const verifyConnections = items.find((i: any) => i.itemDescription.includes("Verify battery connections"));
    expect(verifyConnections).toBeDefined();
    expect(verifyConnections?.inputType).toBe("checkbox");
  });

  it("should have all 20 sections in correct order", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();

    expect(sections.length).toBe(20);

    // Verify section order
    const sectionNames = sections.map((s: any) => s.sectionName);
    expect(sectionNames[0]).toBe("Documentation");
    expect(sectionNames[3]).toBe("Emergency Power Supply Test");
    expect(sectionNames[19]).toBe("System Restoration");
  });

  it("should have total of 96 checklist items across all sections", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const sections = await caller.fireAlarm.getChecklistSections();

    const totalItems = sections.reduce((sum: number, section: any) => sum + section.items.length, 0);

    expect(totalItems).toBe(96);
  });
});
