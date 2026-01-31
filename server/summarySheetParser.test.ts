import { describe, it, expect } from "vitest";
import { parseSummarySheet } from "./summarySheetParser";

describe("Summary Sheet Parser", () => {
  it("should parse client name from label-value pattern", () => {
    const sheet = [
      ["Name of Client:", "ABC Corporation"],
      ["", ""],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.client?.name).toBe("ABC Corporation");
  });
  
  it("should parse building information", () => {
    const sheet = [
      ["Name of Building or Site:", "Main Office Tower"],
      ["Building Year:", "2015"],
      ["Building Class:", "Commercial"],
      ["Stories:", "12"],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.building?.name).toBe("Main Office Tower");
    expect(result.building?.year).toBe("2015");
    expect(result.building?.class).toBe("Commercial");
    expect(result.building?.stories).toBe("12");
  });
  
  it("should parse site and billing addresses", () => {
    const sheet = [
      ["Site Address:", "123 Main St"],
      ["Billing Address:", "456 Billing Ave"],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.address?.street).toBe("123 Main St");
    expect(result.billing?.address).toBe("456 Billing Ave");
  });
  
  it("should parse monitoring company information", () => {
    const sheet = [
      ["Monitoring Company:", "SecureWatch Inc"],
      ["Account #:", "ACC-12345"],
      ["Monitoring Phone:", "555-1234"],
      ["Password:", "secure123"],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.monitoring?.company).toBe("SecureWatch Inc");
    expect(result.monitoring?.accountNumber).toBe("ACC-12345");
    expect(result.monitoring?.phone).toBe("555-1234");
    expect(result.monitoring?.password).toBe("secure123");
  });
  
  it("should parse estimates", () => {
    const sheet = [
      ["Estimated Servicing Hours:", "8"],
      ["Repair Budget:", "$5000"],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.estimates?.servicingHours).toBe("8");
    expect(result.estimates?.repairBudget).toBe("$5000");
  });
  
  it("should parse contact list", () => {
    const sheet = [
      ["Contact Name:", "Position:", "Phone:", "Email:"],
      ["John Doe", "Manager", "555-1111", "john@example.com"],
      ["Jane Smith", "Supervisor", "555-2222", "jane@example.com"],
      ["", "", "", ""], // Empty row should stop parsing
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts?.[0]).toEqual({
      name: "John Doe",
      role: "Manager",
      phone: "555-1111",
      email: "john@example.com",
    });
    expect(result.contacts?.[1]).toEqual({
      name: "Jane Smith",
      role: "Supervisor",
      phone: "555-2222",
      email: "jane@example.com",
    });
  });
  
  it("should handle missing fields gracefully", () => {
    const sheet = [
      ["Name of Client:", "ABC Corp"],
      ["Some Other Field:", "Value"],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.client?.name).toBe("ABC Corp");
    expect(result.building?.name).toBeUndefined();
    expect(result.monitoring?.company).toBeUndefined();
  });
  
  it("should be case-insensitive for labels", () => {
    const sheet = [
      ["NAME OF CLIENT:", "ABC Corp"],
      ["building year:", "2020"],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.client?.name).toBe("ABC Corp");
    expect(result.building?.year).toBe("2020");
  });
  
  it("should extract value from cell below if right cell is empty", () => {
    const sheet = [
      ["Name of Client:", ""],
      ["", "ABC Corporation"],
    ];
    
    const result = parseSummarySheet(sheet);
    expect(result.client?.name).toBe("ABC Corporation");
  });
});
