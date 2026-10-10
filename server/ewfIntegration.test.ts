import { beforeEach, describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import { ewfBinding } from "./ewfIntegration";
vi.mock("./tenantGuards", async importOriginal => ({
  ...(await importOriginal<typeof import("./tenantGuards")>()),
  assertSiteCompany: vi.fn(),
  getDeficiencyForCompany: vi.fn(),
  getJobForCompany: vi.fn(),
}));
vi.mock("./ewfIntegration", async importOriginal => ({
  ...(await importOriginal<typeof import("./ewfIntegration")>()),
  ewfCommand: vi.fn(async () => ({ quoteId: "fictional" })),
}));
import {
  assertSiteCompany,
  getDeficiencyForCompany,
  getJobForCompany,
} from "./tenantGuards";
import { ewfCommand } from "./ewfIntegration";
const site = {
  id: 10,
  companyId: 7,
  customerOrgId: 30,
  name: "Fictional property",
  address: "Fictional address",
  city: "Example",
  updatedAt: new Date("2026-01-01"),
};
const def = {
  id: 20,
  jobId: 40,
  title: "Fictional leak",
  description: "Reviewed source",
  systemCategory: "SPRINKLER",
  severity: "major",
  status: "open",
  updatedAt: new Date("2026-01-01"),
};
const caller = (role = "office", companyId: number | null = 7) =>
  appRouter.createCaller({
    user: { id: 1, role, companyId, customerOrgId: 30 } as any,
    req: {} as any,
    res: {} as any,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EWF_INTEGRATION_ENABLED", "true");
  vi.stubEnv(
    "EWF_INTEGRATION_BINDINGS",
    JSON.stringify([
      {
        companyId: 7,
        clientId: "fictional",
        url: "https://fictional.invalid",
        key: "x".repeat(32),
      },
    ])
  );
  vi.mocked(assertSiteCompany).mockResolvedValue(site as any);
  vi.mocked(getDeficiencyForCompany).mockResolvedValue(def as any);
  vi.mocked(getJobForCompany).mockResolvedValue({
    id: 40,
    siteId: 10,
    companyId: 7,
    customerOrgId: 30,
  } as any);
});
describe("Sprinkler Desk integration boundary", () => {
  it("guards parents and derives company/user/context; source changes reject reviewed hash without network writes", async () => {
    const c = caller();
    const source = await c.ewf.source({
      accountScope: "1:7",
      siteId: 10,
      deficiencyId: 20,
    });
    await c.ewf.open({
      accountScope: "1:7",
      siteId: 10,
      deficiencyId: 20,
      reviewedSourceHash: source.hash,
    });
    expect(assertSiteCompany).toHaveBeenCalledWith(10, 7);
    expect(getDeficiencyForCompany).toHaveBeenCalledWith(20, 7);
    expect(ewfCommand).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 7 }),
      1,
      source.source,
      "open",
      expect.objectContaining({ reviewedSourceHash: source.hash })
    );
    vi.mocked(ewfCommand).mockClear();
    vi.mocked(assertSiteCompany).mockResolvedValue({
      ...site,
      name: "Changed property",
    } as any);
    await expect(
      c.ewf.open({
        accountScope: "1:7",
        siteId: 10,
        deficiencyId: 20,
        reviewedSourceHash: source.hash,
      })
    ).rejects.toThrow("Source changed");
    expect(ewfCommand).not.toHaveBeenCalled();
  });
  it("customer and technician cannot create links; parent denial, missing parents, mismatched property/org prevent integration calls", async () => {
    await expect(
      caller("customer", null).ewf.read({
        accountScope: "1:7",
        siteId: 10,
        deficiencyId: 20,
      })
    ).rejects.toThrow();
    await expect(
      caller("technician").ewf.source({
        accountScope: "1:7",
        siteId: 10,
        deficiencyId: 20,
      })
    ).rejects.toThrow();
    vi.mocked(assertSiteCompany).mockRejectedValueOnce(
      new Error("Cross company denied")
    );
    await expect(
      caller().ewf.read({ accountScope: "1:7", siteId: 10, deficiencyId: 20 })
    ).rejects.toThrow("Cross company");
    vi.mocked(getDeficiencyForCompany).mockRejectedValueOnce(
      new Error("Missing deficiency")
    );
    await expect(
      caller().ewf.read({ accountScope: "1:7", siteId: 10, deficiencyId: 20 })
    ).rejects.toThrow("Missing deficiency");
    vi.mocked(getJobForCompany).mockResolvedValue({
      id: 40,
      siteId: 99,
      companyId: 7,
      customerOrgId: 30,
    } as any);
    await expect(
      caller().ewf.read({ accountScope: "1:7", siteId: 10, deficiencyId: 20 })
    ).rejects.toThrow("does not belong");
    expect(ewfCommand).not.toHaveBeenCalled();
  });
  it("technician commands use their mapped identity and platform admin still needs an explicit target-company binding", async () => {
    await caller("technician").ewf.read({
      accountScope: "1:7",
      siteId: 10,
      deficiencyId: 20,
    });
    expect(ewfCommand).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ companyId: 7 }),
      "read",
      {}
    );
    vi.stubEnv("EWF_INTEGRATION_BINDINGS", "[]");
    await expect(
      caller("admin", null).ewf.read({
        accountScope: "1:null",
        siteId: 10,
        deficiencyId: 20,
      })
    ).rejects.toThrow("No reviewed company");
  });
  it("default-off and unsafe endpoint configuration fail closed", () => {
    vi.stubEnv("EWF_INTEGRATION_ENABLED", "false");
    expect(() => ewfBinding(7)).toThrow("not enabled");
    vi.stubEnv("EWF_INTEGRATION_ENABLED", "true");
    vi.stubEnv(
      "EWF_INTEGRATION_BINDINGS",
      JSON.stringify([
        { companyId: 7, url: "http://production.invalid", key: "x".repeat(32) },
      ])
    );
    expect(() => ewfBinding(7)).toThrow("HTTPS");
  });
});
