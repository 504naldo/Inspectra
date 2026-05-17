import { eq, and, desc, asc, sql, inArray, like, or, isNull, isNotNull, lt, lte, ne, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { JOB_FINALIZED_IMMUTABLE } from "../shared/_core/errors";
import type { TrpcContext } from "./_core/context";
import {
  vendors, InsertVendor, Vendor,
  purchaseOrders, InsertPurchaseOrder, PurchaseOrder,
  purchaseOrderItems, InsertPurchaseOrderItem, PurchaseOrderItem,
  PURCHASE_ORDER_STATUSES, PURCHASE_ORDER_PRIORITIES,
} from "../drizzle/schema";
import {
  InsertUser, users, User,
  companies, InsertCompany, Company,
  customerOrgs, InsertCustomerOrg, CustomerOrg,
  sites, InsertSite, Site,
  areas, InsertArea, Area,
  devices, InsertDevice, Device,
  jobs, InsertJob, Job,
  jobAssignments, InsertJobAssignment, JobAssignment,
  inspectionResults, InsertInspectionResult, InspectionResult,
  deficiencies, InsertDeficiency, Deficiency,
  repairs, InsertRepair, Repair,
  attachments, InsertAttachment, Attachment,
  reports, InsertReport, Report,
  knowledgeBase, InsertKnowledgeBase, KnowledgeBase,
  syncLogs, InsertSyncLog, SyncLog,
  inspectionChecklistResponses, InsertInspectionChecklistResponse, InspectionChecklistResponse,
  quotes, InsertQuote, Quote,
  serviceSchedules, InsertServiceSchedule, ServiceSchedule,
  monthlyServiceTracking, InsertMonthlyServiceTracking, MonthlyServiceTracking,
  repairLetterTracking, InsertRepairLetterTracking, RepairLetterTracking,
  aiReviews, InsertAiReview, AiReview,
  approvedWork, InsertApprovedWork, ApprovedWork,
  invoices, InsertInvoice, Invoice,
  invoiceLineItems, InsertInvoiceLineItem, InvoiceLineItem,
  siteWorkSiteInfo, InsertSiteWorkSiteInfo, SiteWorkSiteInfo,
  companySettings, InsertCompanySettings, CompanySettings,
  activityEvents, ActivityEvent,
  notifications, InsertNotification, Notification,
  serviceAgreements, InsertServiceAgreement, ServiceAgreement,
  agreementSites, InsertAgreementSite, AgreementSite,
  assetLifecycleEvents, InsertAssetLifecycleEvent, AssetLifecycleEvent,
  inventoryItems, InsertInventoryItem, InventoryItem,
  partsRequests, InsertPartsRequest, PartsRequest,
  partsRequestItems, InsertPartsRequestItem, PartsRequestItem,
  inventoryTransactions, InsertInventoryTransaction, InventoryTransaction,
  PARTS_REQUEST_STATUSES, PARTS_REQUEST_PRIORITIES,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================
// USER QUERIES
// ============================================
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    // Check if user exists by openId
    let existing = await getUserByOpenId(user.openId);

    // If no match by openId, check if admin pre-registered this email (pending_ openId)
    // If found, claim that record by updating its openId to the real Google openId
    if (!existing && user.email) {
      const pendingByEmail = await getUserByEmail(user.email);
      if (pendingByEmail && pendingByEmail.openId.startsWith('pending_')) {
        await db!.update(users)
          .set({ openId: user.openId, name: user.name ?? pendingByEmail.name, lastSignedIn: new Date() })
          .where(eq(users.id, pendingByEmail.id));
        return; // Record claimed — don't create a new one
      }
    }
    
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    
    // Handle companyId
    if (user.companyId !== undefined) {
      values.companyId = user.companyId;
      updateSet.companyId = user.companyId;
    }
    
    // Handle role assignment.
    // The owner always stays admin (even if manually demoted).
    // For all other users, only set the role on initial insert — never overwrite
    // on subsequent logins so that admin-assigned roles are preserved.
    if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else if (!existing) {
      // New user: assign the role from the caller (OAuth-computed or explicit)
      values.role = user.role ?? 'technician';
    }
    // Existing users: role is intentionally omitted from updateSet
    
    // Handle isActive — only set on initial insert.
    // Preserves activation state managed by admins; prevents login from
    // re-locking a user an admin has already activated.
    if (!existing) {
      values.isActive = user.isActive ?? 1;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db.select().from(users).where(eq(users.companyId, companyId)).orderBy(desc(users.createdAt));
  }
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "admin" | "office" | "technician" | "customer", companyId?: number, customerOrgId?: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role, companyId, customerOrgId }).where(eq(users.id, userId));
}

export async function updateUserByOpenId(openId: string, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.openId, openId));
}

export async function updateUser(userId: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}

export async function incrementUserSessionVersion(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ sessionVersion: sql`sessionVersion + 1` }).where(eq(users.id, userId));
}

// ============================================
// COMPANY QUERIES
// ============================================
export async function createCompany(data: InsertCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(companies).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0];
}

export async function getAllCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).orderBy(desc(companies.createdAt));
}

export async function updateCompany(id: number, data: Partial<InsertCompany>) {
  const db = await getDb();
  if (!db) return;
  await db.update(companies).set(data).where(eq(companies.id, id));
}

// ============================================
// CUSTOMER ORG QUERIES
// ============================================
export async function createCustomerOrg(data: InsertCustomerOrg) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(customerOrgs).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getCustomerOrgsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerOrgs).where(eq(customerOrgs.companyId, companyId)).orderBy(asc(customerOrgs.name));
}

export async function getCustomerOrgById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customerOrgs).where(eq(customerOrgs.id, id)).limit(1);
  return result[0];
}

export async function updateCustomerOrg(id: number, data: Partial<InsertCustomerOrg>) {
  const db = await getDb();
  if (!db) return;
  await db.update(customerOrgs).set(data).where(eq(customerOrgs.id, id));
}

// ============================================
// SITE QUERIES
// ============================================
export async function createSite(data: InsertSite) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sites).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getSitesByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sites).where(eq(sites.companyId, companyId)).orderBy(asc(sites.name));
}

export async function getSitesByCustomerOrg(customerOrgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sites).where(eq(sites.customerOrgId, customerOrgId)).orderBy(asc(sites.name));
}

export async function getSiteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  const site = result[0];
  
  // Add summary fallback for old sites without summary data
  if (site && !site.summary) {
    site.summary = {
      client: {
        name: site.name || '',
      },
      building: {
        name: site.name || '',
      },
      address: {
        street: site.address || '',
        city: site.city || '',
        state: site.state || '',
        postalCode: site.postalCode || '',
      },
      contacts: [{
        name: site.contactName || '',
        phone: site.contactPhone || '',
        email: '',
        role: 'Primary Contact',
      }],
      monitoring: {
        company: '',
        accountNumber: '',
        phone: '',
        password: '',
      },
      notes: site.notes || '',
    };
  }
  
  return site;
}

export async function updateSite(id: number, data: Partial<InsertSite>) {
  const db = await getDb();
  if (!db) return;
  await db.update(sites).set(data).where(eq(sites.id, id));
}

// ============================================
// AREA QUERIES
// ============================================
export async function createArea(data: InsertArea) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(areas).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getAreasBySite(siteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(areas).where(eq(areas.siteId, siteId)).orderBy(asc(areas.name));
}

export async function getAreaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(areas).where(eq(areas.id, id)).limit(1);
  return result[0];
}

export async function updateArea(id: number, data: Partial<InsertArea>) {
  const db = await getDb();
  if (!db) return;
  await db.update(areas).set(data).where(eq(areas.id, id));
}

// ============================================
// DEVICE QUERIES
// ============================================
export async function createDevice(data: InsertDevice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devices).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getDevicesBySite(siteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(devices).where(and(eq(devices.siteId, siteId), eq(devices.isActive, true))).orderBy(asc(devices.sortOrder), asc(devices.id));
}

export async function reorderDevices(orderedIds: number[]) {
  const db = await getDb();
  if (!db) return;
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(devices).set({ sortOrder: i } as any).where(eq(devices.id, orderedIds[i]));
  }
}

export async function clearDeviceSortOrder(siteId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ sortOrder: null } as any).where(eq(devices.siteId, siteId));
}

export async function getDevicesByArea(areaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(devices).where(and(eq(devices.areaId, areaId), eq(devices.isActive, true))).orderBy(asc(devices.deviceType));
}

export async function getDeviceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  return result[0];
}

export async function updateDevice(id: number, data: Partial<InsertDevice>) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set(data).where(eq(devices.id, id));
}

export async function getDeviceCountBySite(siteId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(devices).where(and(eq(devices.siteId, siteId), eq(devices.isActive, true)));
  return result[0]?.count ?? 0;
}

// ============================================
// SMOKE ALARM QUERIES
// ============================================
export async function getSmokeAlarmsBySite(siteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(devices).where(
    and(
      eq(devices.siteId, siteId),
      eq(devices.category, 'SMOKE_ALARM'),
      eq(devices.isActive, true)
    )
  ).orderBy(asc(devices.suiteNumber), asc(devices.location));
}

export async function getSmokeAlarmsByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Get job to find siteId
  const job = await getJobById(jobId);
  if (!job) return [];
  
  return getSmokeAlarmsBySite(job.siteId);
}

export async function getSmokeAlarmCountBySite(siteId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(devices).where(
    and(
      eq(devices.siteId, siteId),
      eq(devices.category, 'SMOKE_ALARM'),
      eq(devices.isActive, true)
    )
  );
  return result[0]?.count ?? 0;
}

export async function updateSmokeAlarmTestResult(
  deviceId: number,
  testResult: 'pass' | 'fail' | 'no_access' | 'na',
  notes?: string
) {
  const db = await getDb();
  if (!db) return;
  
  const updateData: Partial<InsertDevice> = {
    testResult,
    lastInspectionDate: new Date(),
  };
  
  if (notes !== undefined) {
    updateData.notes = notes;
  }
  
  await db.update(devices).set(updateData).where(eq(devices.id, deviceId));
}

// ============================================
// JOB QUERIES
// ============================================
export async function createJob(data: InsertJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(jobs).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getJobsByCompany(companyId: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(jobs.companyId, companyId)];
  if (status) {
    conditions.push(eq(jobs.status, status as any));
  }
  return db.select().from(jobs).where(and(...conditions)).orderBy(desc(jobs.scheduledDate));
}

export async function getJobsByTechnician(technicianId: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(jobs.assignedTechnicianId, technicianId)];
  if (status) {
    conditions.push(eq(jobs.status, status as any));
  }
  return db.select().from(jobs).where(and(...conditions)).orderBy(desc(jobs.scheduledDate));
}

export async function getJobsByCustomerOrg(customerOrgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).where(eq(jobs.customerOrgId, customerOrgId)).orderBy(desc(jobs.scheduledDate));
}

export async function getJobsBySite(siteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).where(eq(jobs.siteId, siteId)).orderBy(desc(jobs.scheduledDate));
}

export async function getLastCompletedJobForSite(siteId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.siteId, siteId), sql`${jobs.finalizedAt} IS NOT NULL`))
    .orderBy(desc(jobs.finalizedAt))
    .limit(1);
  return result[0];
}

export async function getLastInspectionSummaryForSite(siteId: number): Promise<{
  found: boolean;
  jobId?: number;
  completedAt?: Date;
  deviceCount?: number;
  jobType?: string;
}> {
  const db = await getDb();
  if (!db) return { found: false };
  const lastJob = await getLastCompletedJobForSite(siteId);
  if (!lastJob) return { found: false };
  const rows = await db
    .select({ id: inspectionResults.id })
    .from(inspectionResults)
    .where(eq(inspectionResults.jobId, lastJob.id));
  return {
    found: true,
    jobId: lastJob.id,
    completedAt: lastJob.finalizedAt ?? undefined,
    deviceCount: rows.length,
    jobType: lastJob.jobType,
  };
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return result[0];
}

export async function updateJob(id: number, data: Partial<InsertJob>) {
  const db = await getDb();
  if (!db) return;
  await db.update(jobs).set(data).where(eq(jobs.id, id));
}

export async function searchJobs(companyId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).where(
    and(
      eq(jobs.companyId, companyId),
      or(
        like(jobs.jobNumber, `%${query}%`),
        like(jobs.title, `%${query}%`)
      )
    )
  ).orderBy(desc(jobs.scheduledDate));
}

// ============================================
// JOB ASSIGNMENT QUERIES
// ============================================
export async function addJobAssignment(data: InsertJobAssignment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(jobAssignments).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function removeJobAssignment(jobId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(jobAssignments).where(
    and(
      eq(jobAssignments.jobId, jobId),
      eq(jobAssignments.userId, userId)
    )
  );
}

export async function clearJobAssignments(jobId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
}

export async function isUserAssignedToJob(jobId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const job = await db.select({ leadTechnicianId: jobs.leadTechnicianId })
    .from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (job[0]?.leadTechnicianId === userId) return true;
  const assignment = await db.select({ id: jobAssignments.id })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, userId)))
    .limit(1);
  return assignment.length > 0;
}

export async function getJobTechnicians(jobId: number) {
  const db = await getDb();
  if (!db) return { lead: null, additional: [] };
  
  // Get the job to find lead technician
  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.length === 0) return { lead: null, additional: [] };
  
  let lead = null;
  if (job[0].leadTechnicianId) {
    const leadUser = await getUserById(job[0].leadTechnicianId);
    if (leadUser) {
      lead = { id: leadUser.id, name: leadUser.name || '', email: leadUser.email || '' };
    }
  }
  
  // Get additional technicians from jobAssignments
  const assignments = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: jobAssignments.role
    })
    .from(jobAssignments)
    .innerJoin(users, eq(jobAssignments.userId, users.id))
    .where(eq(jobAssignments.jobId, jobId));
  
  const additional = assignments
    .filter(a => a.role === 'ASSIST')
    .map(a => ({ id: a.id, name: a.name || '', email: a.email || '' }));
  
  return { lead, additional };
}

// ============================================
// INSPECTION RESULT QUERIES
// ============================================
export async function createInspectionResult(data: InsertInspectionResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inspectionResults).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getInspectionResultsByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Join with devices to get device info
  const results = await db
    .select({
      id: inspectionResults.id,
      jobId: inspectionResults.jobId,
      deviceId: inspectionResults.deviceId,
      technicianId: inspectionResults.technicianId,
      result: inspectionResults.result,
      notes: inspectionResults.notes,
      testedAt: inspectionResults.testedAt,
      syncedAt: inspectionResults.syncedAt,
      walkOrder: inspectionResults.walkOrder,
      carriedForward: inspectionResults.carriedForward,
      createdAt: inspectionResults.createdAt,
      updatedAt: inspectionResults.updatedAt,
      deviceType: devices.deviceType,
      location: devices.location,
      serialNumber: devices.serialNumber,
    })
    .from(inspectionResults)
    .leftJoin(devices, eq(inspectionResults.deviceId, devices.id))
    .where(eq(inspectionResults.jobId, jobId))
    .orderBy(desc(inspectionResults.testedAt));
  
  return results;
}

export async function getInspectionResultByJobAndDevice(jobId: number, deviceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inspectionResults).where(
    and(eq(inspectionResults.jobId, jobId), eq(inspectionResults.deviceId, deviceId))
  ).limit(1);
  return result[0];
}

export async function updateInspectionResult(id: number, data: Partial<InsertInspectionResult>) {
  const db = await getDb();
  if (!db) return;
  await db.update(inspectionResults).set(data).where(eq(inspectionResults.id, id));
}

export async function getNextWalkOrder(jobId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  
  const results = await db
    .select({ walkOrder: inspectionResults.walkOrder })
    .from(inspectionResults)
    .where(eq(inspectionResults.jobId, jobId))
    .orderBy(desc(inspectionResults.walkOrder))
    .limit(1);
  
  if (results.length === 0 || results[0].walkOrder === null) {
    return 1;
  }
  
  return results[0].walkOrder + 1;
}

/**
 * Bulk upsert inspection results for a single job.
 * Pre-fetches all existing results for the job in one query to avoid N+1.
 */
export async function bulkUpsertInspectionResults(
  jobId: number,
  deviceIds: number[],
  shared: { result: 'pass' | 'fail' | 'na' | 'not_tested'; notes?: string; technicianId: number }
): Promise<{ count: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (deviceIds.length === 0) return { count: 0 };

  const now = new Date();

  // 1. Fetch ALL existing results for this job's devices in one query
  const existing = await db
    .select()
    .from(inspectionResults)
    .where(
      and(
        eq(inspectionResults.jobId, jobId),
        inArray(inspectionResults.deviceId, deviceIds)
      )
    );

  const existingByDevice = new Map(existing.map((r) => [r.deviceId, r]));

  // 2. Get current max walkOrder once (not per-device)
  let nextWalkOrder = await getNextWalkOrder(jobId);

  // 3. Separate into updates vs inserts
  const toInsert: InsertInspectionResult[] = [];
  const toUpdate: { id: number; data: Partial<InsertInspectionResult> }[] = [];

  for (const deviceId of deviceIds) {
    const row = existingByDevice.get(deviceId);
    const common = {
      jobId,
      deviceId,
      result: shared.result,
      notes: shared.notes,
      technicianId: shared.technicianId,
      testedAt: now,
      syncedAt: now,
    };

    if (row) {
      // Preserve existing walkOrder
      toUpdate.push({ id: row.id, data: { ...common, walkOrder: row.walkOrder ?? undefined } });
    } else {
      const walkOrder = shared.result !== 'not_tested' ? nextWalkOrder++ : undefined;
      toInsert.push({ ...common, walkOrder });
    }
  }

  // 4. Execute batched writes
  for (const { id, data } of toUpdate) {
    await db.update(inspectionResults).set(data).where(eq(inspectionResults.id, id));
  }

  if (toInsert.length > 0) {
    await db.insert(inspectionResults).values(toInsert);
  }

  return { count: toUpdate.length + toInsert.length };
}

export async function upsertInspectionResult(data: InsertInspectionResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getInspectionResultByJobAndDevice(data.jobId, data.deviceId);
  if (existing) {
    // Update existing result, preserve walkOrder if already set
    const updateData = { ...data };
    if (existing.walkOrder !== null && !data.walkOrder) {
      updateData.walkOrder = existing.walkOrder;
    }
    await updateInspectionResult(existing.id, updateData);
    return { ...existing, ...updateData };
  } else {
    // New result - assign walkOrder if not provided and result is being tested
    const insertData = { ...data };
    if (!insertData.walkOrder && insertData.result !== 'not_tested') {
      insertData.walkOrder = await getNextWalkOrder(data.jobId);
    }
    return createInspectionResult(insertData);
  }
}

export async function getInspectionStats(jobId: number) {
  const db = await getDb();
  if (!db) return { total: 0, pass: 0, fail: 0, na: 0, notTested: 0 };
  
  const results = await db.select({
    result: inspectionResults.result,
    count: sql<number>`count(*)`
  }).from(inspectionResults).where(eq(inspectionResults.jobId, jobId)).groupBy(inspectionResults.result);
  
  const stats = { total: 0, pass: 0, fail: 0, na: 0, notTested: 0 };
  for (const r of results) {
    stats.total += r.count;
    if (r.result === 'pass') stats.pass = r.count;
    else if (r.result === 'fail') stats.fail = r.count;
    else if (r.result === 'na') stats.na = r.count;
    else if (r.result === 'not_tested') stats.notTested = r.count;
  }
  return stats;
}

// ============================================
// DEFICIENCY QUERIES
// ============================================
export async function createDeficiency(data: InsertDeficiency) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(deficiencies).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getDeficienciesByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deficiencies).where(eq(deficiencies.jobId, jobId)).orderBy(desc(deficiencies.createdAt));
}

export async function getDeficienciesByCustomerOrg(customerOrgId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get jobs for this customer org, then get deficiencies
  const customerJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.customerOrgId, customerOrgId));
  if (customerJobs.length === 0) return [];
  const jobIds = customerJobs.map(j => j.id);
  return db.select().from(deficiencies).where(inArray(deficiencies.jobId, jobIds)).orderBy(desc(deficiencies.createdAt));
}

export async function getDeficiencyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(deficiencies).where(eq(deficiencies.id, id)).limit(1);
  return result[0];
}

export async function updateDeficiency(id: number, data: Partial<InsertDeficiency>) {
  const db = await getDb();
  if (!db) return;
  await db.update(deficiencies).set(data).where(eq(deficiencies.id, id));
}

export async function getOpenDeficienciesCount(companyId: number) {
  const db = await getDb();
  if (!db) return 0;
  const companyJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.companyId, companyId));
  if (companyJobs.length === 0) return 0;
  const jobIds = companyJobs.map(j => j.id);
  const result = await db.select({ count: sql<number>`count(*)` }).from(deficiencies).where(
    and(inArray(deficiencies.jobId, jobIds), eq(deficiencies.status, 'open'))
  );
  return Number(result[0]?.count ?? 0);
}

// ============================================
// REPAIR QUERIES
// ============================================
export async function createRepair(data: InsertRepair) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(repairs).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getRepairsByDeficiency(deficiencyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(repairs).where(eq(repairs.deficiencyId, deficiencyId)).orderBy(desc(repairs.createdAt));
}

export async function getRepairById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(repairs).where(eq(repairs.id, id)).limit(1);
  return result[0];
}

export async function updateRepair(id: number, data: Partial<InsertRepair>) {
  const db = await getDb();
  if (!db) return;
  await db.update(repairs).set(data).where(eq(repairs.id, id));
}

// ============================================
// ATTACHMENT QUERIES
// ============================================
export async function createAttachment(data: InsertAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(attachments).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getAttachmentsByEntity(entityType: string, entityId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attachments).where(
    and(eq(attachments.entityType, entityType as any), eq(attachments.entityId, entityId))
  ).orderBy(desc(attachments.createdAt));
}

export async function deleteAttachment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(attachments).where(eq(attachments.id, id));
}

// ============================================
// REPORT QUERIES
// ============================================
export async function createReport(data: InsertReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reports).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getReportsByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reports).where(eq(reports.jobId, jobId)).orderBy(desc(reports.createdAt));
}

export async function getReportsByCustomerOrg(customerOrgId: number) {
  const db = await getDb();
  if (!db) return [];
  const customerJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.customerOrgId, customerOrgId));
  if (customerJobs.length === 0) return [];
  const jobIds = customerJobs.map(j => j.id);
  return db.select().from(reports).where(inArray(reports.jobId, jobIds)).orderBy(desc(reports.createdAt));
}

export async function getReportsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: reports.id,
      jobId: reports.jobId,
      reportNumber: reports.reportNumber,
      title: reports.title,
      status: reports.status,
      fileUrl: reports.fileUrl,
      fileKey: reports.fileKey,
      createdAt: reports.createdAt,
      jobNumber: jobs.jobNumber,
      jobTitle: jobs.title,
      siteName: sites.name,
      contactEmail: customerOrgs.contactEmail,
    })
    .from(reports)
    .innerJoin(jobs, eq(reports.jobId, jobs.id))
    .leftJoin(customerOrgs, eq(jobs.customerOrgId, customerOrgs.id))
    .leftJoin(sites, eq(jobs.siteId, sites.id))
    .where(eq(jobs.companyId, companyId))
    .orderBy(desc(reports.createdAt));
}

export async function getReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return result[0];
}

export async function updateReport(id: number, data: Partial<InsertReport>) {
  const db = await getDb();
  if (!db) return;
  await db.update(reports).set(data).where(eq(reports.id, id));
}

// ============================================
// KNOWLEDGE BASE QUERIES
// ============================================
export async function createKnowledgeBaseEntry(data: InsertKnowledgeBase) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(knowledgeBase).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getKnowledgeBaseById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getKnowledgeBaseByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(knowledgeBase).where(
    and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.isActive, true))
  ).orderBy(desc(knowledgeBase.createdAt));
}

export async function listKnowledgeBase(companyId: number, opts: {
  category?: string;
  systemType?: string;
  visibility?: string;
  includeInactive?: boolean;
  search?: string;
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(knowledgeBase.companyId, companyId)];
  if (!opts.includeInactive) conditions.push(eq(knowledgeBase.isActive, true));
  if (opts.category) conditions.push(eq(knowledgeBase.category, opts.category));
  if (opts.systemType) conditions.push(eq(knowledgeBase.systemType as any, opts.systemType));
  if (opts.visibility) conditions.push(eq(knowledgeBase.visibility, opts.visibility as any));
  if (opts.search) {
    conditions.push(or(
      like(knowledgeBase.title, `%${opts.search}%`),
      like(knowledgeBase.content, `%${opts.search}%`)
    ));
  }

  return db.select().from(knowledgeBase)
    .where(and(...conditions))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(opts.limit ?? 200);
}

export async function updateKnowledgeBaseEntry(id: number, data: Partial<InsertKnowledgeBase>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(knowledgeBase).set(data).where(eq(knowledgeBase.id, id));
}

export async function searchKnowledgeBase(companyId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(knowledgeBase).where(
    and(
      eq(knowledgeBase.companyId, companyId),
      eq(knowledgeBase.isActive, true),
      or(
        like(knowledgeBase.title, `%${query}%`),
        like(knowledgeBase.content, `%${query}%`)
      )
    )
  ).orderBy(desc(knowledgeBase.createdAt));
}

export async function getRelevantKnowledgeContext(
  companyId: number,
  query: string,
  opts: { mode?: string; systemType?: string; limit?: number } = {}
): Promise<Array<{ id: number; title: string; category: string; systemType: string | null; excerpt: string }>> {
  const db = await getDb();
  if (!db) return [];

  const limit = opts.limit ?? 3;
  const visibilities = (opts as any).visibilities ?? ["admin_office", "ai_only"];

  const conditions = [
    eq(knowledgeBase.companyId, companyId),
    eq(knowledgeBase.isActive, true),
    inArray(knowledgeBase.visibility, visibilities),
    isNotNull(knowledgeBase.content),
  ];

  if (query) {
    conditions.push(or(
      like(knowledgeBase.title, `%${query}%`),
      like(knowledgeBase.content, `%${query}%`)
    ) as any);
  }

  if (opts.systemType) {
    conditions.push(or(
      eq(knowledgeBase.systemType as any, opts.systemType),
      isNull(knowledgeBase.systemType)
    ) as any);
  }

  const rows = await db.select({
    id: knowledgeBase.id,
    title: knowledgeBase.title,
    category: knowledgeBase.category,
    systemType: knowledgeBase.systemType,
    content: knowledgeBase.content,
  }).from(knowledgeBase)
    .where(and(...conditions))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(limit);

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    systemType: r.systemType ?? null,
    excerpt: r.content ? r.content.slice(0, 250) : "(no content)",
  }));
}

// ============================================
// SYNC LOG QUERIES
// ============================================
export async function createSyncLog(data: InsertSyncLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(syncLogs).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getSyncLogsByUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(syncLogs).where(eq(syncLogs.userId, userId)).orderBy(desc(syncLogs.syncedAt)).limit(limit);
}

// ============================================
// DASHBOARD STATS
// ============================================
export async function getDashboardStats(companyId: number) {
  const db = await getDb();
  if (!db) return { totalJobs: 0, activeJobs: 0, completedJobs: 0, openDeficiencies: 0, totalDevices: 0, totalSites: 0, openApprovedWork: 0, approvedWorkAwaitingSchedule: 0 };

  const [jobStats] = await db.select({
    total: sql<number>`count(*)`,
    active: sql<number>`sum(case when status in ('pending', 'scheduled', 'in_progress') then 1 else 0 end)`,
    completed: sql<number>`sum(case when status = 'completed' then 1 else 0 end)`
  }).from(jobs).where(eq(jobs.companyId, companyId));

  const [siteCount] = await db.select({ count: sql<number>`count(*)` }).from(sites).where(eq(sites.companyId, companyId));

  const companySites = await db.select({ id: sites.id }).from(sites).where(eq(sites.companyId, companyId));
  let deviceCount = 0;
  if (companySites.length > 0) {
    const siteIds = companySites.map(s => s.id);
    const [dc] = await db.select({ count: sql<number>`count(*)` }).from(devices).where(inArray(devices.siteId, siteIds));
    deviceCount = dc?.count ?? 0;
  }

  const openDef = await getOpenDeficienciesCount(companyId);

  const [awStats] = await db.select({
    open: sql<number>`sum(case when status not in ('closed', 'cancelled') then 1 else 0 end)`,
    awaitingSchedule: sql<number>`sum(case when status in ('approved', 'ready_to_schedule') then 1 else 0 end)`,
  }).from(approvedWork).where(eq(approvedWork.companyId, companyId));

  return {
    totalJobs: Number(jobStats?.total ?? 0),
    activeJobs: Number(jobStats?.active ?? 0),
    completedJobs: Number(jobStats?.completed ?? 0),
    openDeficiencies: Number(openDef),
    totalDevices: Number(deviceCount),
    totalSites: Number(siteCount?.count ?? 0),
    openApprovedWork: Number(awStats?.open ?? 0),
    approvedWorkAwaitingSchedule: Number(awStats?.awaitingSchedule ?? 0),
  };
}

// ============================================
// ENHANCED ATTACHMENT QUERIES
// ============================================
export async function getAttachmentsBySite(siteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attachments).where(eq(attachments.siteId, siteId)).orderBy(desc(attachments.createdAt));
}

export async function getAttachmentsByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attachments).where(eq(attachments.jobId, jobId)).orderBy(desc(attachments.createdAt));
}

export async function getAttachmentsByDevice(deviceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attachments).where(eq(attachments.deviceId, deviceId)).orderBy(desc(attachments.createdAt));
}

export async function updateAttachment(id: number, data: Partial<InsertAttachment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(attachments).set(data).where(eq(attachments.id, id));
}

export async function updateAttachmentTags(id: number, tags: string[]) {
  const db = await getDb();
  if (!db) return;
  await db.update(attachments).set({ tags: tags as any }).where(eq(attachments.id, id));
}

export async function getAttachmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  return result[0];
}

export async function createBulkAttachments(dataList: InsertAttachment[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (dataList.length === 0) return [];
  const result = await db.insert(attachments).values(dataList);
  return dataList.map((data, index) => ({ id: Number(result[0].insertId) + index, ...data }));
}

// ============================================
// FILE TAG QUERIES
// ============================================
import { fileTags, InsertFileTag, FileTag, importLogs, InsertImportLog, ImportLog, importRowResults, InsertImportRowResult, ImportRowResult, uploadQueue, InsertUploadQueueItem, UploadQueueItem } from "../drizzle/schema";

export async function createFileTag(data: InsertFileTag) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(fileTags).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getFileTagsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fileTags).where(eq(fileTags.companyId, companyId)).orderBy(fileTags.name);
}

export async function deleteFileTag(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(fileTags).where(eq(fileTags.id, id));
}

// ============================================
// IMPORT LOG QUERIES
// ============================================
export async function createImportLog(data: InsertImportLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(importLogs).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getImportLogsByCompany(companyId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importLogs).where(eq(importLogs.companyId, companyId)).orderBy(desc(importLogs.createdAt)).limit(limit);
}

export async function getImportLogsBySite(siteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importLogs).where(eq(importLogs.siteId, siteId)).orderBy(desc(importLogs.createdAt));
}

export async function getImportLogById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(importLogs).where(eq(importLogs.id, id)).limit(1);
  return result[0];
}

export async function updateImportLog(id: number, data: Partial<InsertImportLog>) {
  const db = await getDb();
  if (!db) return;
  await db.update(importLogs).set(data).where(eq(importLogs.id, id));
}

// ============================================
// IMPORT ROW RESULT QUERIES
// ============================================
export async function createImportRowResult(data: InsertImportRowResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(importRowResults).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function createBulkImportRowResults(dataList: InsertImportRowResult[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (dataList.length === 0) return [];
  await db.insert(importRowResults).values(dataList);
  return dataList;
}

export async function getImportRowResultsByLog(importLogId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importRowResults).where(eq(importRowResults.importLogId, importLogId)).orderBy(importRowResults.rowNumber);
}

export async function getImportErrorsByLog(importLogId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importRowResults).where(
    and(eq(importRowResults.importLogId, importLogId), eq(importRowResults.status, 'error'))
  ).orderBy(importRowResults.rowNumber);
}

// ============================================
// UPLOAD QUEUE QUERIES
// ============================================
export async function createUploadQueueItem(data: InsertUploadQueueItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(uploadQueue).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getUploadQueueByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploadQueue).where(eq(uploadQueue.userId, userId)).orderBy(desc(uploadQueue.queuedAt));
}

export async function getPendingUploads(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploadQueue).where(
    and(
      eq(uploadQueue.userId, userId),
      inArray(uploadQueue.status, ['queued', 'uploading', 'paused'])
    )
  ).orderBy(uploadQueue.queuedAt);
}

export async function getUploadQueueItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(uploadQueue).where(eq(uploadQueue.id, id)).limit(1);
  return result[0];
}

export async function getUploadQueueItemByLocalId(userId: number, localFileId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(uploadQueue).where(
    and(eq(uploadQueue.userId, userId), eq(uploadQueue.localFileId, localFileId))
  ).limit(1);
  return result[0];
}

export async function updateUploadQueueItem(id: number, data: Partial<InsertUploadQueueItem>) {
  const db = await getDb();
  if (!db) return;
  await db.update(uploadQueue).set(data).where(eq(uploadQueue.id, id));
}

export async function deleteUploadQueueItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(uploadQueue).where(eq(uploadQueue.id, id));
}

export async function clearCompletedUploads(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(uploadQueue).where(
    and(eq(uploadQueue.userId, userId), eq(uploadQueue.status, 'completed'))
  );
}

// ============================================
// BULK DEVICE IMPORT HELPERS
// ============================================
export async function findDuplicateDevice(siteId: number, serialNumber: string | null, barcode: string | null) {
  const db = await getDb();
  if (!db) return undefined;
  
  // Check by serial number or barcode
  if (serialNumber) {
    const result = await db.select().from(devices).where(
      and(eq(devices.siteId, siteId), eq(devices.serialNumber, serialNumber))
    ).limit(1);
    if (result[0]) return result[0];
  }
  
  if (barcode) {
    const result = await db.select().from(devices).where(
      and(eq(devices.siteId, siteId), eq(devices.barcode, barcode))
    ).limit(1);
    if (result[0]) return result[0];
  }
  
  return undefined;
}

export async function bulkCreateDevices(dataList: InsertDevice[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (dataList.length === 0) return [];
  
  const results: Device[] = [];
  for (const data of dataList) {
    const result = await db.insert(devices).values(data);
    results.push({ id: Number(result[0].insertId), ...data } as Device);
  }
  return results;
}

export async function bulkUpdateDevices(updates: Array<{ id: number; data: Partial<InsertDevice> }>) {
  const db = await getDb();
  if (!db) return;
  
  for (const { id, data } of updates) {
    await db.update(devices).set(data).where(eq(devices.id, id));
  }
}

// ============================================
// INSPECTION CHECKLIST RESPONSES
// ============================================
export async function saveChecklistResponse(data: InsertInspectionChecklistResponse) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Upsert: if response exists for this job+section+item, update it; otherwise insert
  const existing = await db
    .select()
    .from(inspectionChecklistResponses)
    .where(
      and(
        eq(inspectionChecklistResponses.jobId, data.jobId),
        eq(inspectionChecklistResponses.sectionNumber, data.sectionNumber),
        eq(inspectionChecklistResponses.itemId, data.itemId)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(inspectionChecklistResponses)
      .set({
        status: data.status,
        comment: data.comment,
        updatedAt: new Date(),
      })
      .where(eq(inspectionChecklistResponses.id, existing[0].id));
  } else {
    await db.insert(inspectionChecklistResponses).values(data);
  }
}

export async function bulkSaveChecklistResponses(dataList: InsertInspectionChecklistResponse[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  for (const data of dataList) {
    await saveChecklistResponse(data);
  }
}

export async function getChecklistResponsesByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(inspectionChecklistResponses)
    .where(eq(inspectionChecklistResponses.jobId, jobId))
    .orderBy(asc(inspectionChecklistResponses.sectionNumber), asc(inspectionChecklistResponses.itemId));
}

export async function getChecklistResponseByJobAndItem(jobId: number, sectionNumber: string, itemId: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const results = await db
    .select()
    .from(inspectionChecklistResponses)
    .where(
      and(
        eq(inspectionChecklistResponses.jobId, jobId),
        eq(inspectionChecklistResponses.sectionNumber, sectionNumber),
        eq(inspectionChecklistResponses.itemId, itemId)
      )
    )
    .limit(1);
  
  return results[0];
}

export async function deleteChecklistResponsesByJob(jobId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db
    .delete(inspectionChecklistResponses)
    .where(eq(inspectionChecklistResponses.jobId, jobId));
}

// ============================================
// JOB SUMMARY HELPERS
// ============================================

/**
 * Get device summaries grouped by type for a job
 */
export async function getDeviceSummariesByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select()
    .from(inspectionResults)
    .leftJoin(devices, eq(inspectionResults.deviceId, devices.id))
    .where(eq(inspectionResults.jobId, jobId));
  
  // Group by device type
  const summaryMap = new Map<string, { total: number; passed: number; failed: number; na: number }>();
  
  results.forEach(row => {
    const deviceType = row.devices?.deviceType || 'Unknown';
    const result = row.inspection_results.result;
    
    if (!summaryMap.has(deviceType)) {
      summaryMap.set(deviceType, { total: 0, passed: 0, failed: 0, na: 0 });
    }
    
    const summary = summaryMap.get(deviceType)!;
    summary.total++;
    
    if (result === 'pass') summary.passed++;
    else if (result === 'fail') summary.failed++;
    else if (result === 'na') summary.na++;
  });
  
  return Array.from(summaryMap.entries()).map(([deviceType, stats]) => ({
    deviceType,
    ...stats,
  }));
}



// ============================================================
// COMPLIANCE: Audit Transaction Wrapper
// ============================================================

/**
 * assertJobNotFinalized
 *
 * Guards audited mutations against finalized jobs.
 * Must be called within a withAudit transaction before any DML.
 * Throws TRPCError with code JOB_FINALIZED_IMMUTABLE if the job is sealed.
 */
export async function assertJobNotFinalized(
  jobId: number,
  db?: ReturnType<typeof drizzle>
): Promise<void> {
  const resolvedDb = db ?? await getDb();
  if (!resolvedDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const rows = await resolvedDb
    .select({ finalizedAt: schema.jobs.finalizedAt })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));

  if (rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Job ${jobId} not found` });
  }

  if (rows[0].finalizedAt !== null) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: JOB_FINALIZED_IMMUTABLE,
    });
  }
}

/**
 * withAudit
 *
 * Executes a database mutation inside a single MySQL connection with:
 *   1. A transaction (BEGIN / COMMIT / ROLLBACK)
 *   2. Session variables set for audit triggers:
 *      @audit_actor, @audit_procedure, @audit_request_id, @audit_ip, @audit_user_agent
 *
 * Usage:
 *   await withAudit(ctx, "procedure.name", async (tx) => {
 *     await assertJobNotFinalized(jobId, tx);
 *     await tx.update(schema.inspectionResults).set({...}).where(...);
 *   });
 *
 * If ctx.user is null, the mutation is rejected — unattributed compliance writes
 * must not succeed silently.
 */
export async function withAudit<T>(
  ctx: TrpcContext,
  procedureName: string,
  fn: (tx: ReturnType<typeof drizzle>) => Promise<T>
): Promise<T> {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authenticated user required for audited mutations",
    });
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  // Create a dedicated connection for this transaction so session variables
  // are scoped to this connection only.
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    // Set audit session variables
    await connection.execute("SET @audit_actor = ?", [ctx.user.id]);
    await connection.execute("SET @audit_procedure = ?", [procedureName]);
    await connection.execute("SET @audit_request_id = ?", [ctx.requestId]);
    await connection.execute("SET @audit_ip = ?", [ctx.ipAddress]);
    await connection.execute("SET @audit_user_agent = ?", [ctx.userAgent]);

    // Begin transaction
    await connection.beginTransaction();

    const txDb = drizzle(connection as unknown as string, {
      schema,
      mode: "default",
    });

    let result: T;
    try {
      result = await fn(txDb);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    // Warn if changedById would be null (defensive check)
    if (!ctx.user.id) {
      console.warn(
        `[withAudit] Warning: audit row for procedure "${procedureName}" ` +
          `has no changedById. Request: ${ctx.requestId}`
      );
    }

    return result;
  } finally {
    await connection.end();
  }
}

// ============================================
// QUOTE QUERIES
// ============================================

export async function createQuote(data: InsertQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(quotes).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getQuoteById(id: number): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return result[0];
}

export async function getQuoteByToken(token: string): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(quotes).where(eq(quotes.acceptToken, token)).limit(1);
  return result[0];
}

export async function getQuotesByJob(jobId: number): Promise<Quote[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(quotes).where(eq(quotes.jobId, jobId)).orderBy(desc(quotes.createdAt));
}

export async function getQuotesByCompany(companyId: number): Promise<Quote[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(quotes).where(eq(quotes.companyId, companyId)).orderBy(desc(quotes.createdAt));
}

export async function updateQuote(id: number, data: Partial<InsertQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(quotes).set(data).where(eq(quotes.id, id));
}

// ============================================
// PARTS CATALOG QUERIES
// ============================================
import { partsCatalog, InsertPartsCatalogItem, PartsCatalogItem, repairQuoteItems, InsertRepairQuoteItem, RepairQuoteItem } from "../drizzle/schema";

export async function createPartsCatalogItem(data: InsertPartsCatalogItem): Promise<PartsCatalogItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(partsCatalog).values(data);
  return { ...data, id: Number(result[0].insertId) } as PartsCatalogItem;
}

export async function getPartsCatalogItemById(id: number): Promise<PartsCatalogItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(partsCatalog).where(eq(partsCatalog.id, id)).limit(1);
  return result[0];
}

export async function getPartsCatalogByCompany(companyId: number, includeInactive = false): Promise<PartsCatalogItem[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(partsCatalog.companyId, companyId)];
  if (!includeInactive) conditions.push(eq(partsCatalog.isActive, true));
  return db.select().from(partsCatalog).where(and(...conditions)).orderBy(asc(partsCatalog.category), asc(partsCatalog.productName));
}

export async function updatePartsCatalogItem(id: number, data: Partial<InsertPartsCatalogItem>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(partsCatalog).set(data).where(eq(partsCatalog.id, id));
}

export async function searchPartsCatalogByKeywords(
  companyId: number,
  keywords: string[],
  limit = 10,
): Promise<PartsCatalogItem[]> {
  const db = await getDb();
  if (!db || !keywords.length) return [];
  const terms = keywords.map(k => k.trim()).filter(k => k.length >= 2);
  if (!terms.length) return [];
  const conditions = terms.map(kw =>
    or(
      like(partsCatalog.productName, `%${kw}%`),
      like(partsCatalog.category, `%${kw}%`),
      like(partsCatalog.description, `%${kw}%`),
    )
  );
  return db.select().from(partsCatalog)
    .where(and(
      eq(partsCatalog.companyId, companyId),
      eq(partsCatalog.isActive, true),
      or(...conditions),
    ))
    .orderBy(asc(partsCatalog.category), asc(partsCatalog.productName))
    .limit(limit);
}

// ============================================
// REPAIR QUOTE ITEMS QUERIES
// ============================================

export async function createRepairQuoteItem(data: InsertRepairQuoteItem): Promise<RepairQuoteItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(repairQuoteItems).values(data);
  return { ...data, id: Number(result[0].insertId) } as RepairQuoteItem;
}

export async function getRepairQuoteItemsByQuote(quoteId: number): Promise<RepairQuoteItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(repairQuoteItems).where(eq(repairQuoteItems.quoteId, quoteId)).orderBy(asc(repairQuoteItems.sortOrder), asc(repairQuoteItems.id));
}

export async function getRepairQuoteItemById(id: number): Promise<RepairQuoteItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(repairQuoteItems).where(eq(repairQuoteItems.id, id)).limit(1);
  return result[0];
}

export async function updateRepairQuoteItem(id: number, data: Partial<InsertRepairQuoteItem>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairQuoteItems).set(data).where(eq(repairQuoteItems.id, id));
}

export async function deleteRepairQuoteItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(repairQuoteItems).where(eq(repairQuoteItems.id, id));
}

export async function deleteRepairQuoteItemsByQuote(quoteId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(repairQuoteItems).where(eq(repairQuoteItems.quoteId, quoteId));
}

// ============================================
// SERVICE SCHEDULE QUERIES
// ============================================

export async function createServiceSchedule(data: InsertServiceSchedule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(serviceSchedules).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getServiceScheduleById(id: number): Promise<ServiceSchedule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(serviceSchedules).where(eq(serviceSchedules.id, id)).limit(1);
  return result[0];
}

export async function getServiceSchedulesByCompany(companyId: number): Promise<ServiceSchedule[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(serviceSchedules)
    .where(and(eq(serviceSchedules.companyId, companyId), eq(serviceSchedules.active, true)))
    .orderBy(asc(serviceSchedules.createdAt));
}

export async function getServiceSchedulesBySite(siteId: number): Promise<ServiceSchedule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serviceSchedules).where(eq(serviceSchedules.siteId, siteId));
}

export async function updateServiceSchedule(id: number, data: Partial<InsertServiceSchedule>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(serviceSchedules).set(data).where(eq(serviceSchedules.id, id));
}

// ============================================
// MONTHLY SERVICE TRACKING QUERIES
// ============================================

export async function createMonthlyTracking(data: InsertMonthlyServiceTracking) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(monthlyServiceTracking).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getMonthlyTrackingById(id: number): Promise<MonthlyServiceTracking | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(monthlyServiceTracking).where(eq(monthlyServiceTracking.id, id)).limit(1);
  return result[0];
}

export async function getMonthlyTrackingByCompany(
  companyId: number,
  trackingMonth?: string
): Promise<MonthlyServiceTracking[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(monthlyServiceTracking.companyId, companyId)];
  if (trackingMonth) conditions.push(eq(monthlyServiceTracking.trackingMonth, trackingMonth));
  return db
    .select()
    .from(monthlyServiceTracking)
    .where(and(...conditions))
    .orderBy(asc(monthlyServiceTracking.targetDate), asc(monthlyServiceTracking.buildingId));
}

export async function getMonthlyTrackingBySite(siteId: number, trackingMonth?: string): Promise<MonthlyServiceTracking[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(monthlyServiceTracking.siteId, siteId)];
  if (trackingMonth) conditions.push(eq(monthlyServiceTracking.trackingMonth, trackingMonth));
  return db.select().from(monthlyServiceTracking).where(and(...conditions));
}

export async function getMonthlyTrackingByLinkedJobId(jobId: number): Promise<MonthlyServiceTracking | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(monthlyServiceTracking)
    .where(eq(monthlyServiceTracking.linkedJobId, jobId))
    .limit(1);
  return result[0];
}

export async function updateMonthlyTracking(id: number, data: Partial<InsertMonthlyServiceTracking>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(monthlyServiceTracking).set(data).where(eq(monthlyServiceTracking.id, id));
}

export async function updateMonthlyTrackingByLinkedJobId(
  jobId: number,
  data: Partial<InsertMonthlyServiceTracking>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(monthlyServiceTracking)
    .set(data)
    .where(eq(monthlyServiceTracking.linkedJobId, jobId));
}

// ── Repair Letter Tracking ────────────────────────────────────────────────────

export async function createRepairLetterTracking(data: InsertRepairLetterTracking) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(repairLetterTracking).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getRepairLetterTrackingById(id: number): Promise<RepairLetterTracking | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(repairLetterTracking).where(eq(repairLetterTracking.id, id)).limit(1);
  return result[0];
}

export async function getRepairLetterTrackingByCompany(
  companyId: number,
  trackingPeriod?: string
): Promise<RepairLetterTracking[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(repairLetterTracking.companyId, companyId)];
  if (trackingPeriod) conditions.push(eq(repairLetterTracking.trackingPeriod, trackingPeriod));
  return db
    .select()
    .from(repairLetterTracking)
    .where(and(...conditions))
    .orderBy(asc(repairLetterTracking.buildingId), asc(repairLetterTracking.trackingPeriod));
}

export async function updateRepairLetterTracking(id: number, data: Partial<InsertRepairLetterTracking>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(repairLetterTracking).set(data).where(eq(repairLetterTracking.id, id));
}

export async function findSiteByBuildingId(companyId: number, buildingId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(sites)
    .where(and(eq(sites.companyId, companyId), eq(sites.buildingId, buildingId)))
    .limit(1);
  return result[0];
}

export async function findSiteByNameFuzzy(companyId: number, name: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(sites)
    .where(and(eq(sites.companyId, companyId), like(sites.name, `%${name}%`)))
    .limit(1);
  return result[0];
}

// ── AI Reviews ────────────────────────────────────────────────────────────────

export async function createAiReview(data: InsertAiReview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiReviews).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getAiReviewsByJob(jobId: number): Promise<AiReview[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiReviews).where(eq(aiReviews.jobId, jobId)).orderBy(desc(aiReviews.createdAt));
}

export async function updateAiReview(id: number, data: Partial<InsertAiReview>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(aiReviews).set(data).where(eq(aiReviews.id, id));
}

export async function getAiReviewById(id: number): Promise<AiReview | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(aiReviews).where(eq(aiReviews.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getAiReviewsByJobScoped(jobId: number, companyId: number, reviewType?: string): Promise<AiReview[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiReviews)
    .where(and(
      eq(aiReviews.jobId, jobId),
      eq(aiReviews.companyId as any, companyId),
      reviewType ? eq(aiReviews.reviewType as any, reviewType) : undefined,
    ))
    .orderBy(desc(aiReviews.createdAt))
    .limit(10);
}

// ============================================
// WORK ORDER QUERIES
// ============================================

import { workOrders, InsertWorkOrder, WorkOrder } from "../drizzle/schema";

export async function createWorkOrder(data: InsertWorkOrder): Promise<WorkOrder> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workOrders).values(data);
  const id = Number(result[0].insertId);
  return { ...data, id } as WorkOrder;
}

export async function getWorkOrderById(id: number): Promise<WorkOrder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
  return result[0];
}

export async function getWorkOrdersByCompany(companyId: number, status?: string): Promise<WorkOrder[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(workOrders.companyId, companyId)];
  if (status) conditions.push(eq(workOrders.status, status as WorkOrder["status"]));
  return db.select().from(workOrders).where(and(...conditions)).orderBy(desc(workOrders.createdAt));
}

export async function getWorkOrdersBySite(siteId: number): Promise<WorkOrder[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workOrders).where(eq(workOrders.siteId, siteId)).orderBy(desc(workOrders.createdAt));
}

export async function getWorkOrderByJob(jobId: number): Promise<WorkOrder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workOrders).where(eq(workOrders.jobId, jobId)).limit(1);
  return result[0];
}

export async function updateWorkOrder(id: number, data: Partial<InsertWorkOrder>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workOrders).set(data).where(eq(workOrders.id, id));
}

export async function deleteJobCascade(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(schema.inspectionChecklistResponses).where(eq(schema.inspectionChecklistResponses.jobId, jobId));
  await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
  await db.delete(inspectionResults).where(eq(inspectionResults.jobId, jobId));
  await db.delete(deficiencies).where(eq(deficiencies.jobId, jobId));
  await db.delete(schema.fireAlarmInspectionResults).where(eq(schema.fireAlarmInspectionResults.jobId, jobId));
  await db.delete(schema.fireAlarmFormHeader).where(eq(schema.fireAlarmFormHeader.jobId, jobId));
  await db.delete(workOrders).where(eq(workOrders.jobId, jobId));
  await db.delete(reports).where(eq(reports.jobId, jobId));
  await db.delete(jobs).where(eq(jobs.id, jobId));
}

// ============================================
// APPROVED WORK QUERIES
// ============================================

export async function createApprovedWork(data: InsertApprovedWork): Promise<ApprovedWork> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(approvedWork).values(data);
  const id = (result as any)[0]?.insertId;
  return { ...data, id } as ApprovedWork;
}

export async function getApprovedWorkById(id: number): Promise<ApprovedWork | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(approvedWork).where(eq(approvedWork.id, id)).limit(1);
  return result[0];
}

export async function getApprovedWorkByCompany(companyId: number, status?: string): Promise<ApprovedWork[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(approvedWork.companyId, companyId)];
  if (status) conditions.push(eq(approvedWork.status, status as ApprovedWork["status"]));
  return db.select().from(approvedWork).where(and(...conditions)).orderBy(desc(approvedWork.createdAt));
}

export async function getApprovedWorkByQuoteItem(quoteItemId: number): Promise<ApprovedWork | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(approvedWork).where(eq(approvedWork.quoteItemId, quoteItemId)).limit(1);
  return result[0];
}

export async function getApprovedWorkByQuote(quoteId: number): Promise<ApprovedWork | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(approvedWork).where(eq(approvedWork.quoteId, quoteId)).limit(1);
  return result[0];
}

export async function getApprovedWorkByWorkOrder(workOrderId: number): Promise<ApprovedWork | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(approvedWork).where(eq(approvedWork.workOrderId, workOrderId)).limit(1);
  return result[0];
}

export async function updateApprovedWork(id: number, data: Partial<InsertApprovedWork>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvedWork).set(data).where(eq(approvedWork.id, id));
}

// ============================================
// INVOICE QUERIES
// ============================================
export async function createInvoice(data: InsertInvoice): Promise<Invoice> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoices).values(data);
  const id = Number(result[0].insertId);
  const row = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return row[0];
}

export async function getInvoiceById(id: number): Promise<Invoice | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result[0];
}

export async function getInvoicesByCompany(companyId: number, status?: string): Promise<Invoice[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(invoices.companyId, companyId)];
  if (status) conditions.push(eq(invoices.status, status as Invoice["status"]));
  return db.select().from(invoices).where(and(...conditions)).orderBy(desc(invoices.createdAt));
}

export async function getInvoiceByApprovedWork(approvedWorkId: number): Promise<Invoice | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.approvedWorkId, approvedWorkId)).limit(1);
  return result[0];
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

export async function getLineItemsByInvoice(invoiceId: number): Promise<InvoiceLineItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceLineItems.sortOrder), asc(invoiceLineItems.id));
}

export async function createInvoiceLineItem(data: InsertInvoiceLineItem): Promise<InvoiceLineItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoiceLineItems).values(data);
  const id = Number(result[0].insertId);
  const row = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.id, id)).limit(1);
  return row[0];
}

export async function updateInvoiceLineItem(id: number, data: Partial<InsertInvoiceLineItem>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoiceLineItems).set(data).where(eq(invoiceLineItems.id, id));
}

export async function deleteInvoiceLineItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, id));
}

export async function recalculateInvoiceTotals(invoiceId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const items = await getLineItemsByInvoice(invoiceId);
  const inv = await getInvoiceById(invoiceId);
  if (!inv) return;
  const subtotal = items.reduce((sum, item) => sum + parseFloat(String(item.total ?? "0")), 0);
  const taxRate = parseFloat(String(inv.taxRate ?? "0"));
  const taxableSubtotal = items
    .filter((i) => i.taxable)
    .reduce((sum, i) => sum + parseFloat(String(i.total ?? "0")), 0);
  const taxAmount = taxableSubtotal * taxRate;
  const total = subtotal + taxAmount;
  const amountPaid = parseFloat(String(inv.amountPaid ?? "0"));
  const balanceDue = total - amountPaid;
  await db.update(invoices).set({
    subtotal: subtotal.toFixed(2) as any,
    taxAmount: taxAmount.toFixed(2) as any,
    total: total.toFixed(2) as any,
    balanceDue: balanceDue.toFixed(2) as any,
  }).where(eq(invoices.id, invoiceId));
}

// ============================================
// SITE WORK SITE INFO QUERIES
// ============================================
export async function getWorkSiteInfoBySiteId(siteId: number): Promise<SiteWorkSiteInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(siteWorkSiteInfo)
    .where(eq(siteWorkSiteInfo.siteId, siteId))
    .limit(1);
  return result[0];
}

export async function upsertWorkSiteInfo(data: InsertSiteWorkSiteInfo): Promise<SiteWorkSiteInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getWorkSiteInfoBySiteId(data.siteId);
  if (existing) {
    await db.update(siteWorkSiteInfo)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(siteWorkSiteInfo.siteId, data.siteId));
    const updated = await getWorkSiteInfoBySiteId(data.siteId);
    return updated!;
  }
  const result = await db.insert(siteWorkSiteInfo).values(data);
  const id = Number(result[0].insertId);
  const row = await db.select().from(siteWorkSiteInfo)
    .where(eq(siteWorkSiteInfo.id, id))
    .limit(1);
  return row[0];
}

// ============================================
// OPERATIONS SUMMARY (Admin Dashboard 2.0)
// ============================================

export type AttentionQueueItem = {
  type: 'overdue_job' | 'deficiency' | 'approved_work' | 'repair_quote';
  id: number;
  title: string;
  siteName: string | null;
  ageInDays: number;
  dueDate: string | null;
  severity: string | null;
  priority: string | null;
  status: string;
  link: string;
};

export type TodayScheduleItem = {
  id: number;
  title: string;
  jobNumber: string;
  siteName: string | null;
  status: string;
  priority: string;
  scheduledDate: Date | null;
  link: string;
};

export async function getOperationsSummary(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── Sites ─────────────────────────────────────────────────────────────────
  const allSites = await db
    .select({ id: sites.id, name: sites.name, buildingId: sites.buildingId, fileNumber: sites.fileNumber, customerOrgId: sites.customerOrgId })
    .from(sites)
    .where(eq(sites.companyId, companyId));
  const siteMap = new Map(allSites.map(s => [s.id, s]));

  // ── Jobs ──────────────────────────────────────────────────────────────────
  const allJobs = await db
    .select({ id: jobs.id, title: jobs.title, jobNumber: jobs.jobNumber, siteId: jobs.siteId, status: jobs.status, priority: jobs.priority, scheduledDate: jobs.scheduledDate, completedAt: jobs.completedAt })
    .from(jobs)
    .where(eq(jobs.companyId, companyId));

  const companyJobIds = allJobs.map(j => j.id);

  const overdueJobsList = allJobs.filter(j => {
    if (!j.scheduledDate) return false;
    if (['completed', 'cancelled'].includes(j.status)) return false;
    return new Date(j.scheduledDate) < todayStart;
  });

  const todaySchedule: TodayScheduleItem[] = allJobs
    .filter(j => {
      if (!j.scheduledDate) return false;
      const d = new Date(j.scheduledDate);
      return d >= todayStart && d <= todayEnd;
    })
    .map(j => ({
      id: j.id,
      title: j.title,
      jobNumber: j.jobNumber,
      siteName: siteMap.get(j.siteId)?.name ?? null,
      status: j.status,
      priority: j.priority,
      scheduledDate: j.scheduledDate,
      link: `/admin/jobs/${j.id}`,
    }))
    .sort((a, b) => (a.scheduledDate?.getTime() ?? 0) - (b.scheduledDate?.getTime() ?? 0));

  const completedThisWeek = allJobs.filter(j => j.completedAt && new Date(j.completedAt) >= weekAgo).length;

  // ── Reports ───────────────────────────────────────────────────────────────
  let reportsPendingReview = 0;
  if (companyJobIds.length > 0) {
    const [rc] = await db
      .select({ count: sql<number>`count(*)` })
      .from(reports)
      .where(and(inArray(reports.jobId, companyJobIds), inArray(reports.status, ['generated', 'corrections_required'])));
    reportsPendingReview = Number(rc?.count ?? 0);
  }

  // ── Deficiencies ──────────────────────────────────────────────────────────
  let openDefCount = 0;
  let topDeficiencies: { id: number; title: string; severity: string; status: string; jobId: number; createdAt: Date }[] = [];
  if (companyJobIds.length > 0) {
    const [dc] = await db
      .select({ count: sql<number>`count(*)` })
      .from(deficiencies)
      .where(and(inArray(deficiencies.jobId, companyJobIds), inArray(deficiencies.status, ['open', 'in_progress'])));
    openDefCount = Number(dc?.count ?? 0);

    topDeficiencies = await db
      .select({ id: deficiencies.id, title: deficiencies.title, severity: deficiencies.severity, status: deficiencies.status, jobId: deficiencies.jobId, createdAt: deficiencies.createdAt })
      .from(deficiencies)
      .where(and(inArray(deficiencies.jobId, companyJobIds), inArray(deficiencies.status, ['open', 'in_progress'])))
      .orderBy(desc(deficiencies.createdAt))
      .limit(8);
  }

  // ── Approved Work ─────────────────────────────────────────────────────────
  const awRecords = await db
    .select({ id: approvedWork.id, status: approvedWork.status, approvedScope: approvedWork.approvedScope, siteId: approvedWork.siteId, createdAt: approvedWork.createdAt })
    .from(approvedWork)
    .where(eq(approvedWork.companyId, companyId));

  const awByStatus: Record<string, number> = {};
  for (const r of awRecords) awByStatus[r.status] = (awByStatus[r.status] ?? 0) + 1;

  const awReadyList = awRecords
    .filter(r => ['approved', 'ready_to_schedule'].includes(r.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 6);

  // ── Repair Quotes ─────────────────────────────────────────────────────────
  const repairQuotesList = await db
    .select({ id: quotes.id, quoteNumber: quotes.quoteNumber, siteId: quotes.siteId, status: quotes.status, total: quotes.total, createdAt: quotes.createdAt })
    .from(quotes)
    .where(and(eq(quotes.companyId, companyId), eq(quotes.quoteType, 'repair'), inArray(quotes.status, ['draft', 'sent'])))
    .limit(8);

  // ── Invoices ──────────────────────────────────────────────────────────────
  const invoiceRecords = await db
    .select({ status: invoices.status, sageExportStatus: invoices.sageExportStatus })
    .from(invoices)
    .where(eq(invoices.companyId, companyId));

  const invoiceSummary = { draft: 0, sent: 0, approved: 0, paid: 0, partial: 0, overdue: 0, void: 0 };
  let invoicesReadyForExport = 0;
  for (const inv of invoiceRecords) {
    const k = inv.status as keyof typeof invoiceSummary;
    if (k in invoiceSummary) invoiceSummary[k]++;
    if (!['draft', 'void'].includes(inv.status) && inv.sageExportStatus === 'pending') invoicesReadyForExport++;
  }

  // ── Data Quality ──────────────────────────────────────────────────────────
  const sitesMissingBuildingId = allSites.filter(s => !s.buildingId?.trim()).length;
  const sitesMissingFileNumber = allSites.filter(s => !s.fileNumber?.trim()).length;
  const sitesMissingCustomerOrg = allSites.filter(s => !s.customerOrgId).length;

  // ── Attention Queue ───────────────────────────────────────────────────────
  const attentionQueue: AttentionQueueItem[] = [];

  const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2, observation: 3 };

  for (const j of overdueJobsList.slice(0, 6)) {
    const sched = j.scheduledDate ? new Date(j.scheduledDate) : null;
    const ageInDays = sched ? Math.floor((now.getTime() - sched.getTime()) / 86_400_000) : 0;
    attentionQueue.push({ type: 'overdue_job', id: j.id, title: j.title, siteName: siteMap.get(j.siteId)?.name ?? null, ageInDays, dueDate: sched?.toISOString() ?? null, severity: null, priority: j.priority, status: j.status, link: `/admin/jobs/${j.id}` });
  }

  const sortedDefs = [...topDeficiencies].sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
  for (const d of sortedDefs) {
    const jobInfo = allJobs.find(j => j.id === d.jobId);
    const site = jobInfo ? siteMap.get(jobInfo.siteId) : undefined;
    const ageInDays = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / 86_400_000);
    attentionQueue.push({ type: 'deficiency', id: d.id, title: d.title, siteName: site?.name ?? null, ageInDays, dueDate: null, severity: d.severity, priority: null, status: d.status, link: `/admin/jobs/${d.jobId}` });
  }

  for (const aw of awReadyList) {
    const site = aw.siteId ? siteMap.get(aw.siteId) : undefined;
    const ageInDays = Math.floor((now.getTime() - new Date(aw.createdAt).getTime()) / 86_400_000);
    const title = aw.approvedScope ? aw.approvedScope.slice(0, 60) : `Approved Work #${aw.id}`;
    attentionQueue.push({ type: 'approved_work', id: aw.id, title, siteName: site?.name ?? null, ageInDays, dueDate: null, severity: null, priority: null, status: aw.status, link: `/admin/approved-work/${aw.id}` });
  }

  for (const q of repairQuotesList) {
    const site = q.siteId ? siteMap.get(q.siteId) : undefined;
    const ageInDays = Math.floor((now.getTime() - new Date(q.createdAt).getTime()) / 86_400_000);
    const title = q.quoteNumber ? `Quote ${q.quoteNumber}` : `Repair Quote #${q.id}`;
    attentionQueue.push({ type: 'repair_quote', id: q.id, title, siteName: site?.name ?? null, ageInDays, dueDate: null, severity: null, priority: null, status: q.status, link: `/admin/repair-quotes/${q.id}` });
  }

  return {
    fetchedAt: now,
    snapshot: {
      jobsToday: todaySchedule.length,
      overdueJobs: overdueJobsList.length,
      openDeficiencies: openDefCount,
      reportsPendingReview,
      approvedWorkReadyToSchedule: (awByStatus['approved'] ?? 0) + (awByStatus['ready_to_schedule'] ?? 0),
      repairQuotesPending: repairQuotesList.length,
      invoicesReadyForExport,
      completedThisWeek,
    },
    attentionQueue,
    todaySchedule,
    approvedWorkByStatus: awByStatus,
    invoiceSummary,
    dataQuality: { sitesMissingBuildingId, sitesMissingFileNumber, sitesMissingCustomerOrg },
    totalSites: allSites.length,
    totalJobs: allJobs.length,
  };
}

// ============================================
// COMPANY SETTINGS
// ============================================

const DEFAULT_COMPANY_SETTINGS = {
  companyDisplayName: null as string | null,
  logoUrl: null as string | null,
  gstRate: "0.0500",
  pstRate: "0.0700",
  technicianLabourRate: "75.00",
  fitterLabourRate: "65.00",
  defaultFuelCharge: "0.00",
  quoteValidityDays: 30,
  defaultQuoteTerms: null as string | null,
  invoiceDueDays: 30,
  defaultInvoiceTerms: null as string | null,
  invoiceNumberPrefix: "INV",
  repairQuoteNumberPrefix: "RQ",
  sageDefaultGlCode: null as string | null,
  sageDefaultDepartment: null as string | null,
  sageCustomerCodeDefault: null as string | null,
  sageTaxCodeDefault: null as string | null,
  reportFooterText: null as string | null,
};

export async function getCompanySettings(companyId: number): Promise<CompanySettings & { _isDefault?: boolean }> {
  const db = await getDb();
  if (!db) return { id: 0, companyId, ...DEFAULT_COMPANY_SETTINGS, createdAt: new Date(), updatedAt: new Date(), _isDefault: true };

  const [row] = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
  if (row) return row;
  return { id: 0, companyId, ...DEFAULT_COMPANY_SETTINGS, createdAt: new Date(), updatedAt: new Date(), _isDefault: true };
}

export async function upsertCompanySettings(companyId: number, data: Partial<Omit<InsertCompanySettings, "id" | "companyId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(companySettings).values({ companyId, ...data } as InsertCompanySettings).onDuplicateKeyUpdate({ set: { ...data, updatedAt: new Date() } });
}

// ============================================
// ACTIVITY EVENTS
// ============================================

export async function getActivityEventsForEntity(
  companyId: number,
  entityType: string,
  entityId: number,
  limit: number,
): Promise<ActivityEvent[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(activityEvents)
    .where(and(
      eq(activityEvents.companyId, companyId),
      eq(activityEvents.entityType, entityType),
      eq(activityEvents.entityId, entityId),
    ))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);
}

export async function getRecentActivityByCompany(
  companyId: number,
  limit: number,
  entityType?: string,
): Promise<ActivityEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [eq(activityEvents.companyId, companyId)];
  if (entityType) conditions.push(eq(activityEvents.entityType, entityType));
  return db
    .select()
    .from(activityEvents)
    .where(and(...conditions))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);
}

// ============================================
// NOTIFICATIONS
// ============================================

export async function getNotificationsForCompany(
  companyId: number,
  options: {
    unreadOnly?: boolean;
    limit?: number;
    severity?: string;
  } = {}
): Promise<Notification[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(notifications.companyId, companyId),
    eq(notifications.isDismissed, 0),
  ];
  if (options.unreadOnly) conditions.push(eq(notifications.isRead, 0));
  if (options.severity) conditions.push(eq(notifications.severity, options.severity as any));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit ?? 200);
}

export async function getUnreadNotificationCount(companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(
      eq(notifications.companyId, companyId),
      eq(notifications.isRead, 0),
      eq(notifications.isDismissed, 0),
    ));
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(id: number, companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: 1, readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.companyId, companyId)));
}

export async function markAllNotificationsRead(companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: 1, readAt: new Date() })
    .where(and(eq(notifications.companyId, companyId), eq(notifications.isRead, 0)));
}

export async function dismissNotification(id: number, companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isDismissed: 1, dismissedAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.companyId, companyId)));
}

export async function createNotification(data: InsertNotification): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function hasUndismissedNotification(companyId: number, dedupeKey: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(
      eq(notifications.companyId, companyId),
      eq(notifications.dedupeKey, dedupeKey),
      eq(notifications.isDismissed, 0),
    ))
    .limit(1);
  return !!row;
}

// ============================================
// SERVICE AGREEMENTS
// ============================================

export async function getServiceAgreementsByCompany(
  companyId: number,
  status?: string,
): Promise<ServiceAgreement[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [eq(serviceAgreements.companyId, companyId)];
  if (status) conditions.push(eq(serviceAgreements.status, status as any));
  return db
    .select()
    .from(serviceAgreements)
    .where(and(...conditions))
    .orderBy(desc(serviceAgreements.createdAt));
}

export async function getServiceAgreementById(id: number): Promise<ServiceAgreement | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.id, id))
    .limit(1);
  return row;
}

export async function createServiceAgreement(data: InsertServiceAgreement): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(serviceAgreements).values(data);
  return Number((result as any).insertId);
}

export async function updateServiceAgreement(
  id: number,
  data: Partial<InsertServiceAgreement>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(serviceAgreements).set(data).where(eq(serviceAgreements.id, id));
}

export async function getAgreementSitesByAgreement(agreementId: number): Promise<AgreementSite[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(agreementSites)
    .where(eq(agreementSites.agreementId, agreementId))
    .orderBy(asc(agreementSites.createdAt));
}

export async function getAgreementSiteById(id: number): Promise<AgreementSite | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(agreementSites)
    .where(eq(agreementSites.id, id))
    .limit(1);
  return row;
}

export async function createAgreementSite(data: InsertAgreementSite): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(agreementSites).values(data);
  return Number((result as any).insertId);
}

export async function updateAgreementSite(
  id: number,
  data: Partial<InsertAgreementSite>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(agreementSites).set(data).where(eq(agreementSites.id, id));
}

export async function deleteAgreementSite(id: number, companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(agreementSites)
    .where(and(eq(agreementSites.id, id), eq(agreementSites.companyId, companyId)));
}

export async function getExpiringSoonAgreements(
  companyId: number,
  daysAhead: number,
): Promise<ServiceAgreement[]> {
  const db = await getDb();
  if (!db) return [];
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);
  const futureStr = future.toISOString().slice(0, 10);
  return db
    .select()
    .from(serviceAgreements)
    .where(and(
      eq(serviceAgreements.companyId, companyId),
      inArray(serviceAgreements.status, ["active", "expiring_soon"]),
      lte(serviceAgreements.endDate as any, futureStr),
    ))
    .orderBy(asc(serviceAgreements.endDate));
}

export async function getActiveAgreementForSite(
  siteId: number,
  companyId: number,
): Promise<{ agreement: ServiceAgreement; agreementSite: AgreementSite } | null> {
  const db = await getDb();
  if (!db) return null;
  const siteRows = await db
    .select()
    .from(agreementSites)
    .where(and(
      eq(agreementSites.siteId, siteId),
      eq(agreementSites.companyId, companyId),
    ));
  if (!siteRows.length) return null;
  const agreementIds = siteRows.map((s) => s.agreementId);
  const [agreement] = await db
    .select()
    .from(serviceAgreements)
    .where(and(
      inArray(serviceAgreements.id, agreementIds),
      inArray(serviceAgreements.status, ["active", "expiring_soon"]),
    ))
    .orderBy(desc(serviceAgreements.createdAt))
    .limit(1);
  if (!agreement) return null;
  const agreementSite = siteRows.find((s) => s.agreementId === agreement.id)!;
  return { agreement, agreementSite };
}

// ============================================
// ASSET LIFECYCLE
// ============================================

export async function getDevicesByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(devices)
    .where(and(eq(devices.companyId, companyId), eq(devices.isActive, true)))
    .orderBy(asc(devices.siteId), asc(devices.deviceType));
}

export async function getOpenDeficienciesByDeviceIds(deviceIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (!deviceIds.length) return [];
  return db
    .select()
    .from(deficiencies)
    .where(and(
      inArray(deficiencies.deviceId, deviceIds),
      inArray(deficiencies.status, ["open", "in_progress"]),
    ));
}

export async function getAllDeficienciesByDeviceIds(deviceIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (!deviceIds.length) return [];
  return db
    .select()
    .from(deficiencies)
    .where(inArray(deficiencies.deviceId, deviceIds));
}

export async function getDeficienciesByDevice(deviceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(deficiencies)
    .where(eq(deficiencies.deviceId, deviceId))
    .orderBy(desc(deficiencies.createdAt));
}

export async function getInspectionResultsByDevice(deviceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: inspectionResults.id,
      jobId: inspectionResults.jobId,
      result: inspectionResults.result,
      notes: inspectionResults.notes,
      testedAt: inspectionResults.testedAt,
      createdAt: inspectionResults.createdAt,
      jobNumber: jobs.jobNumber,
      jobTitle: jobs.title,
      jobType: jobs.jobType,
      scheduledDate: jobs.scheduledDate,
      completedAt: jobs.completedAt,
    })
    .from(inspectionResults)
    .innerJoin(jobs, eq(inspectionResults.jobId, jobs.id))
    .where(and(
      eq(inspectionResults.deviceId, deviceId),
      ne(inspectionResults.result, "not_tested"),
    ))
    .orderBy(desc(inspectionResults.testedAt));
}

export async function getLifecycleEventsByDevice(deviceId: number): Promise<AssetLifecycleEvent[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(assetLifecycleEvents)
    .where(eq(assetLifecycleEvents.deviceId, deviceId))
    .orderBy(desc(assetLifecycleEvents.eventDate), desc(assetLifecycleEvents.createdAt));
}

export async function createLifecycleEvent(data: InsertAssetLifecycleEvent): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(assetLifecycleEvents).values(data);
  return Number((result as any).insertId);
}

export async function getRecentLifecycleEventsByCompany(
  companyId: number,
  limit = 50,
): Promise<AssetLifecycleEvent[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(assetLifecycleEvents)
    .where(eq(assetLifecycleEvents.companyId, companyId))
    .orderBy(desc(assetLifecycleEvents.createdAt))
    .limit(limit);
}

// ============================================
// INVENTORY ITEMS
// ============================================

export async function getInventoryItemsByCompany(
  companyId: number,
  includeInactive = false,
): Promise<InventoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = includeInactive
    ? [eq(inventoryItems.companyId, companyId)]
    : [eq(inventoryItems.companyId, companyId), eq(inventoryItems.isActive, true)];
  return db
    .select()
    .from(inventoryItems)
    .where(and(...conditions))
    .orderBy(asc(inventoryItems.category), asc(inventoryItems.name));
}

export async function getInventoryItemById(id: number): Promise<InventoryItem | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  return rows[0] ?? null;
}

export async function createInventoryItem(data: InsertInventoryItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(inventoryItems).values(data);
  return Number((result as any).insertId);
}

export async function updateInventoryItem(
  id: number,
  data: Partial<InsertInventoryItem>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(inventoryItems).set(data).where(eq(inventoryItems.id, id));
}

export async function getLowStockInventoryItems(companyId: number): Promise<InventoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(
      eq(inventoryItems.companyId, companyId),
      eq(inventoryItems.isActive, true),
    ));
  return rows.filter((item) => item.quantityOnHand <= item.reorderPoint);
}

// ============================================
// INVENTORY TRANSACTIONS
// ============================================

export async function createInventoryTransaction(
  data: InsertInventoryTransaction,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(inventoryTransactions).values(data);
  return Number((result as any).insertId);
}

export async function getInventoryTransactionsByItem(
  inventoryItemId: number,
): Promise<InventoryTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.inventoryItemId, inventoryItemId))
    .orderBy(desc(inventoryTransactions.createdAt));
}

// ============================================
// PARTS REQUESTS
// ============================================

export async function generateRequestNumber(companyId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const year = new Date().getFullYear();
  const rows = await db
    .select({ id: partsRequests.id })
    .from(partsRequests)
    .where(and(
      eq(partsRequests.companyId, companyId),
      like(partsRequests.requestNumber, `PR-${year}-%`),
    ))
    .orderBy(desc(partsRequests.id))
    .limit(1);
  const seq = rows.length > 0 ? parseInt(String((rows[0] as any).id ?? "0")) + 1 : 1;
  const counter = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(partsRequests)
    .where(and(
      eq(partsRequests.companyId, companyId),
      like(partsRequests.requestNumber, `PR-${year}-%`),
    ));
  const count = Number(counter[0]?.cnt ?? 0) + 1;
  return `PR-${year}-${String(count).padStart(4, "0")}`;
}

export async function getPartsRequestsByCompany(
  companyId: number,
  status?: PartsRequest["status"],
): Promise<PartsRequest[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = status
    ? [eq(partsRequests.companyId, companyId), eq(partsRequests.status, status)]
    : [eq(partsRequests.companyId, companyId)];
  return db
    .select()
    .from(partsRequests)
    .where(and(...conditions))
    .orderBy(desc(partsRequests.createdAt));
}

export async function getPartsRequestById(id: number): Promise<PartsRequest | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(partsRequests).where(eq(partsRequests.id, id));
  return rows[0] ?? null;
}

export async function createPartsRequest(data: InsertPartsRequest): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(partsRequests).values(data);
  return Number((result as any).insertId);
}

export async function updatePartsRequest(
  id: number,
  data: Partial<InsertPartsRequest>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(partsRequests).set(data).where(eq(partsRequests.id, id));
}

export async function getPartsRequestsByApprovedWork(
  approvedWorkId: number,
): Promise<PartsRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partsRequests)
    .where(eq(partsRequests.approvedWorkId, approvedWorkId))
    .orderBy(desc(partsRequests.createdAt));
}

export async function getPartsRequestsByWorkOrder(
  workOrderId: number,
): Promise<PartsRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partsRequests)
    .where(eq(partsRequests.workOrderId, workOrderId))
    .orderBy(desc(partsRequests.createdAt));
}

export async function getPartsRequestsByJob(jobId: number): Promise<PartsRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partsRequests)
    .where(eq(partsRequests.jobId, jobId))
    .orderBy(desc(partsRequests.createdAt));
}

// ============================================
// PARTS REQUEST ITEMS
// ============================================

export async function getPartsRequestItemsByRequest(
  partsRequestId: number,
): Promise<PartsRequestItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partsRequestItems)
    .where(eq(partsRequestItems.partsRequestId, partsRequestId))
    .orderBy(asc(partsRequestItems.createdAt));
}

export async function getPartsRequestItemById(id: number): Promise<PartsRequestItem | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(partsRequestItems)
    .where(eq(partsRequestItems.id, id));
  return rows[0] ?? null;
}

export async function createPartsRequestItem(
  data: InsertPartsRequestItem,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(partsRequestItems).values(data);
  return Number((result as any).insertId);
}

export async function updatePartsRequestItem(
  id: number,
  data: Partial<InsertPartsRequestItem>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(partsRequestItems).set(data).where(eq(partsRequestItems.id, id));
}

export async function deletePartsRequestItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(partsRequestItems).where(eq(partsRequestItems.id, id));
}

// ============================================
// VENDORS
// ============================================

export async function getVendorsByCompany(
  companyId: number,
  includeInactive = false,
): Promise<Vendor[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = includeInactive
    ? [eq(vendors.companyId, companyId)]
    : [eq(vendors.companyId, companyId), eq(vendors.isActive, true)];
  return db.select().from(vendors).where(and(...conditions)).orderBy(asc(vendors.name));
}

export async function getVendorById(id: number): Promise<Vendor | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(vendors).where(eq(vendors.id, id));
  return rows[0] ?? null;
}

export async function createVendor(data: InsertVendor): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(vendors).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateVendor(id: number, data: Partial<InsertVendor>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(vendors).set(data).where(eq(vendors.id, id));
}

// ============================================
// PURCHASE ORDERS
// ============================================

export async function generatePONumber(companyId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.companyId, companyId),
        like(purchaseOrders.poNumber, `${prefix}%`),
      ),
    );
  const count = Number(rows[0]?.count ?? 0) + 1;
  return `${prefix}${String(count).padStart(4, "0")}`;
}

export async function getPurchaseOrdersByCompany(
  companyId: number,
  status?: PurchaseOrder["status"],
): Promise<PurchaseOrder[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = status
    ? [eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.status, status)]
    : [eq(purchaseOrders.companyId, companyId)];
  return db
    .select()
    .from(purchaseOrders)
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function getPurchaseOrderById(id: number): Promise<PurchaseOrder | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  return rows[0] ?? null;
}

export async function getPurchaseOrderByPartsRequest(
  partsRequestId: number,
): Promise<PurchaseOrder | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.partsRequestId, partsRequestId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPurchaseOrder(data: InsertPurchaseOrder): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(purchaseOrders).values(data);
  return (result[0] as any).insertId as number;
}

export async function updatePurchaseOrder(
  id: number,
  data: Partial<InsertPurchaseOrder>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, id));
}

export async function getPurchaseOrderItemsByPO(
  purchaseOrderId: number,
): Promise<PurchaseOrderItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
    .orderBy(asc(purchaseOrderItems.createdAt));
}

export async function getPurchaseOrderItemById(id: number): Promise<PurchaseOrderItem | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.id, id));
  return rows[0] ?? null;
}

export async function createPurchaseOrderItem(data: InsertPurchaseOrderItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(purchaseOrderItems).values(data);
  return (result[0] as any).insertId as number;
}

export async function updatePurchaseOrderItem(
  id: number,
  data: Partial<InsertPurchaseOrderItem>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(purchaseOrderItems).set(data).where(eq(purchaseOrderItems.id, id));
}

export async function deletePurchaseOrderItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.id, id));
}

export async function recalculatePOTotals(
  poId: number,
  tax: number,
  shipping: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const items = await getPurchaseOrderItemsByPO(poId);
  const subtotal = items.reduce((sum, i) => sum + Number(i.lineTotal ?? 0), 0);
  const total = subtotal + tax + shipping;
  await updatePurchaseOrder(poId, {
    subtotal: subtotal.toFixed(2) as any,
    total: total.toFixed(2) as any,
  });
}
