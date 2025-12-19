import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database functions
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  getJobById: vi.fn(),
  getJobsByTechnician: vi.fn(),
  getDevicesBySite: vi.fn(),
  getInspectionResultsByJob: vi.fn(),
  getInspectionResultByJobAndDevice: vi.fn(),
  upsertInspectionResult: vi.fn(),
  getInspectionStats: vi.fn(),
  getDeficienciesByJob: vi.fn(),
  createDeficiency: vi.fn(),
}));

// Import mocked db
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTechnicianContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "tech-user-123",
    email: "tech@example.com",
    name: "Test Technician",
    loginMethod: "manus",
    role: "technician",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    companyId: 1,
    customerOrgId: null,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "admin-user-456",
    email: "admin@example.com",
    name: "Test Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    companyId: 1,
    customerOrgId: null,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Job Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("technician can list their assigned jobs", async () => {
    const mockJobs = [
      { id: 1, title: "Annual Inspection", status: "scheduled", jobNumber: "JOB-123" },
      { id: 2, title: "Service Call", status: "in_progress", jobNumber: "JOB-456" },
    ];
    
    vi.mocked(db.getJobsByTechnician).mockResolvedValue(mockJobs as any);
    
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.job.listByTechnician({});
    
    expect(result).toEqual(mockJobs);
    expect(db.getJobsByTechnician).toHaveBeenCalledWith(1, undefined);
  });

  it("technician can get job details", async () => {
    const mockJob = { 
      id: 1, 
      title: "Annual Inspection", 
      status: "scheduled", 
      jobNumber: "JOB-123",
      siteId: 1,
      customerOrgId: 1,
    };
    
    vi.mocked(db.getJobById).mockResolvedValue(mockJob as any);
    
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.job.get({ id: 1 });
    
    expect(result).toEqual(mockJob);
    expect(db.getJobById).toHaveBeenCalledWith(1);
  });
});

describe("Inspection Result Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("technician can upsert inspection result", async () => {
    const mockResult = {
      id: 1,
      jobId: 1,
      deviceId: 1,
      result: "pass",
      notes: "Device functioning properly",
      technicianId: 1,
      testedAt: new Date(),
    };
    
    vi.mocked(db.upsertInspectionResult).mockResolvedValue(mockResult as any);
    
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.inspectionResult.upsert({
      jobId: 1,
      deviceId: 1,
      result: "pass",
      notes: "Device functioning properly",
    });
    
    expect(result).toEqual(mockResult);
    expect(db.upsertInspectionResult).toHaveBeenCalled();
  });

  it("technician can get inspection stats", async () => {
    const mockStats = {
      total: 10,
      pass: 8,
      fail: 1,
      na: 1,
      notTested: 0,
    };
    
    vi.mocked(db.getInspectionStats).mockResolvedValue(mockStats);
    
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.inspectionResult.getStats({ jobId: 1 });
    
    expect(result).toEqual(mockStats);
    expect(db.getInspectionStats).toHaveBeenCalledWith(1);
  });
});

describe("Deficiency Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("technician can create deficiency", async () => {
    const mockDeficiency = {
      id: 1,
      jobId: 1,
      deviceId: 1,
      title: "Smoke detector not responding",
      severity: "major",
      status: "open",
      createdById: 1,
    };
    
    vi.mocked(db.createDeficiency).mockResolvedValue(mockDeficiency as any);
    
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.deficiency.create({
      jobId: 1,
      deviceId: 1,
      title: "Smoke detector not responding",
      severity: "major",
    });
    
    expect(result).toEqual(mockDeficiency);
    expect(db.createDeficiency).toHaveBeenCalled();
  });

  it("technician can list deficiencies by job", async () => {
    const mockDeficiencies = [
      { id: 1, title: "Issue 1", severity: "major", status: "open" },
      { id: 2, title: "Issue 2", severity: "minor", status: "open" },
    ];
    
    vi.mocked(db.getDeficienciesByJob).mockResolvedValue(mockDeficiencies as any);
    
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.deficiency.listByJob({ jobId: 1 });
    
    expect(result).toEqual(mockDeficiencies);
    expect(db.getDeficienciesByJob).toHaveBeenCalledWith(1);
  });
});

describe("Auth Router", () => {
  it("returns current user for authenticated request", async () => {
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.auth.me();
    
    expect(result).toEqual(ctx.user);
    expect(result?.role).toBe("technician");
  });

  it("logout clears session cookie", async () => {
    const ctx = createTechnicianContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.auth.logout();
    
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});
