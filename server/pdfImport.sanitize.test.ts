import { describe, it, expect } from "vitest";
import { sanitizeExtractedSiteData } from "./_core/pdfImport";
import type { ExtractedSiteData } from "./_core/pdfImport";

// Pure — no DB. Locks the guard that keeps leaked AI schema placeholders
// (e.g. a site literally named "string or null - the building/site name")
// from ever being persisted as real extracted data.

function baseSite(overrides: Partial<ExtractedSiteData["site"]>): ExtractedSiteData {
  return {
    site: {
      name: null, address: null, city: null, state: null, postalCode: null,
      contactName: null, contactPhone: null, contactEmail: null,
      customerOrgName: null, monitoringCompany: null, monitoringAccount: null,
      buildingId: null, buildingYear: null, buildingClass: null,
      stories: null, notes: null,
      ...overrides,
    },
    devices: [],
    summary: { totalDevices: 0, categories: {}, confidence: "low", warnings: [] },
  };
}

describe("sanitizeExtractedSiteData", () => {
  it("nulls out the exact schema-echo that shipped to production", () => {
    const out = sanitizeExtractedSiteData(
      baseSite({ name: "string or null - the building/site name" })
    );
    expect(out.site.name).toBeNull();
  });

  it("strips shorter placeholder variants across fields", () => {
    const out = sanitizeExtractedSiteData(
      baseSite({
        name: "string",
        address: "string - street address",
        state: "string or null",
        notes: "  null  ",
      })
    );
    expect(out.site.name).toBeNull();
    expect(out.site.address).toBeNull();
    expect(out.site.state).toBeNull();
    expect(out.site.notes).toBeNull();
  });

  it("preserves genuine values, including names that merely start with 'String'", () => {
    const out = sanitizeExtractedSiteData(
      baseSite({
        name: "String Lighting Co",
        address: "400-11950 80th Ave.",
        city: "Delta",
        contactName: "Jane Doe",
      })
    );
    expect(out.site.name).toBe("String Lighting Co");
    expect(out.site.address).toBe("400-11950 80th Ave.");
    expect(out.site.city).toBe("Delta");
    expect(out.site.contactName).toBe("Jane Doe");
  });

  it("trims whitespace and drops empty strings to null", () => {
    const out = sanitizeExtractedSiteData(baseSite({ name: "  Acme Tower  ", city: "   " }));
    expect(out.site.name).toBe("Acme Tower");
    expect(out.site.city).toBeNull();
  });

  it("drops device rows whose type is a placeholder echo, keeps real ones", () => {
    const data = baseSite({});
    data.devices = [
      { deviceType: "string - e.g. 'Smoke Detector'", category: "FIRE_ALARM_DEVICE", location: null, floor: null, manufacturer: null, model: null, serialNumber: null, notes: null },
      { deviceType: "Smoke Detector", category: "FIRE_ALARM_DEVICE", location: "string or null - where in the building", floor: "2", manufacturer: null, model: null, serialNumber: null, notes: null },
    ];
    const out = sanitizeExtractedSiteData(data);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].deviceType).toBe("Smoke Detector");
    // placeholder inside a kept device is also scrubbed
    expect(out.devices[0].location).toBeNull();
    expect(out.devices[0].floor).toBe("2");
  });
});
