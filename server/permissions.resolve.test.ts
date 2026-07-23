import { describe, it, expect } from "vitest";
import { resolvePermission, hasPermission, type PermissionOverride } from "@shared/permissions";

// Pure — no DB. Locks the effective-permission resolver (baseline ⊕ overrides).
describe("resolvePermission (per-role overrides)", () => {
  it("no overrides → identical to the baseline role map", () => {
    expect(resolvePermission("office", "reports.approve", [])).toBe(hasPermission({ role: "office" }, "reports.approve"));
    expect(resolvePermission("technician", "invoices.export", undefined)).toBe(false);
    expect(resolvePermission("technician", "jobs.view", [])).toBe(true);
  });

  it("an override can DENY a baseline-allowed permission", () => {
    const ov: PermissionOverride[] = [{ role: "office", permission: "reports.approve", allowed: false }];
    expect(hasPermission({ role: "office" }, "reports.approve")).toBe(true); // baseline allows
    expect(resolvePermission("office", "reports.approve", ov)).toBe(false);   // override denies
  });

  it("an override can GRANT a baseline-denied permission", () => {
    const ov: PermissionOverride[] = [{ role: "technician", permission: "reports.approve", allowed: true }];
    expect(hasPermission({ role: "technician" }, "reports.approve")).toBe(false);
    expect(resolvePermission("technician", "reports.approve", ov)).toBe(true);
  });

  it("admin is never overridden — always keeps the baseline (full) permission", () => {
    const ov: PermissionOverride[] = [{ role: "admin", permission: "reports.approve", allowed: false }];
    expect(resolvePermission("admin", "reports.approve", ov)).toBe(true);
    expect(resolvePermission("admin", "accessControl.manage", ov)).toBe(true);
  });

  it("an override for one role does not affect another role", () => {
    const ov: PermissionOverride[] = [{ role: "office", permission: "reports.approve", allowed: false }];
    expect(resolvePermission("office", "reports.approve", ov)).toBe(false);
    expect(resolvePermission("technician", "reports.approve", ov)).toBe(hasPermission({ role: "technician" }, "reports.approve"));
  });
});
