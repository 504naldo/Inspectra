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

describe("Fire Alarm Auto-Save Functionality", () => {
  it("should save inspection result with text value", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create or get fire alarm system
    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
      operationType: "single_stage",
    });
    
    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    expect(system).toBeDefined();

    // Get checklist sections
    const sections = await caller.fireAlarm.getChecklistSections();
    const section4 = sections.find((s: any) => s.sectionName === "Emergency Power Supply Test");
    expect(section4).toBeDefined();

    // Find Battery Manufacturer item
    const batteryManufacturerItem = section4.items.find((i: any) => 
      i.itemDescription.includes("Battery Manufacturer")
    );
    expect(batteryManufacturerItem).toBeDefined();

    // Save result with text value (simulating auto-save)
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

    // Create or get fire alarm system
    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });
    
    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const section4 = sections.find((s: any) => s.sectionName === "Emergency Power Supply Test");
    const batteryManufacturerItem = section4.items.find((i: any) => 
      i.itemDescription.includes("Battery Manufacturer")
    );

    // First save
    const firstSave = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: batteryManufacturerItem.id,
      result: "not_tested",
      textValue: "Yuasa",
      notes: "",
    });

    expect(firstSave.success).toBe(true);

    // Second save (should update, not insert)
    const secondSave = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: batteryManufacturerItem.id,
      result: "not_tested",
      textValue: "Panasonic",
      notes: "Changed manufacturer",
    });

    expect(secondSave.success).toBe(true);
    expect(secondSave.id).toBe(firstSave.id); // Should be the same ID (update)

    // Verify the updated value
    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === batteryManufacturerItem.id);
    
    expect(savedResult).toBeDefined();
    expect(savedResult.textValue).toBe("Panasonic");
    expect(savedResult.notes).toBe("Changed manufacturer");
  });

  it("should save numeric values for voltage fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create or get fire alarm system
    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });
    
    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const section4 = sections.find((s: any) => s.sectionName === "Emergency Power Supply Test");
    
    const batteryVoltageItem = section4.items.find((i: any) => 
      i.itemDescription.includes("Battery Rated Voltage")
    );
    expect(batteryVoltageItem).toBeDefined();
    expect(batteryVoltageItem.inputType).toBe("voltage");

    // Save voltage value
    const saveResult = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: batteryVoltageItem.id,
      result: "not_tested",
      numericValue: "12.6",
      notes: "",
    });

    expect(saveResult.success).toBe(true);

    // Verify saved value
    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === batteryVoltageItem.id);
    
    expect(savedResult).toBeDefined();
    expect(savedResult.numericValue).toBe("12.6");
  });

  it("should save checkbox results (YES/NO/NA)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create or get fire alarm system
    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });
    
    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const section4 = sections.find((s: any) => s.sectionName === "Emergency Power Supply Test");
    
    const verifyConnectionsItem = section4.items.find((i: any) => 
      i.itemDescription.includes("Verify battery connections")
    );
    expect(verifyConnectionsItem).toBeDefined();
    expect(verifyConnectionsItem.inputType).toBe("checkbox");

    // Save PASS result (YES)
    const saveResult = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: verifyConnectionsItem.id,
      result: "pass",
      notes: "Connections are clean and secure",
    });

    expect(saveResult.success).toBe(true);

    // Verify saved value
    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === verifyConnectionsItem.id);
    
    expect(savedResult).toBeDefined();
    expect(savedResult.result).toBe("pass");
    expect(savedResult.notes).toBe("Connections are clean and secure");
  });

  it("should save notes independently", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create or get fire alarm system
    await caller.fireAlarm.upsertSystem({
      siteId: 1,
      manufacturer: "Edwards",
      modelNumber: "EST3",
    });
    
    const system = await caller.fireAlarm.getSystemBySite({ siteId: 1 });
    const sections = await caller.fireAlarm.getChecklistSections();
    const section4 = sections.find((s: any) => s.sectionName === "Emergency Power Supply Test");
    const firstItem = section4.items[0];

    // Save with notes only
    const saveResult = await caller.fireAlarm.saveInspectionResult({
      jobId: 1,
      fireAlarmSystemId: system!.id,
      checklistItemId: firstItem.id,
      result: "not_tested",
      notes: "This is a test note for auto-save",
    });

    expect(saveResult.success).toBe(true);

    // Verify notes were saved
    const results = await caller.fireAlarm.getInspectionResults({ jobId: 1 });
    const savedResult = results.find((r: any) => r.checklistItemId === firstItem.id);
    
    expect(savedResult).toBeDefined();
    expect(savedResult.notes).toBe("This is a test note for auto-save");
  });
});
