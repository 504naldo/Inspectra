import { eq, and, desc, asc, sql, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, User,
  companies, InsertCompany, Company,
  customerOrgs, InsertCustomerOrg, CustomerOrg,
  sites, InsertSite, Site,
  areas, InsertArea, Area,
  devices, InsertDevice, Device,
  jobs, InsertJob, Job,
  inspectionResults, InsertInspectionResult, InspectionResult,
  deficiencies, InsertDeficiency, Deficiency,
  repairs, InsertRepair, Repair,
  attachments, InsertAttachment, Attachment,
  reports, InsertReport, Report,
  knowledgeBase, InsertKnowledgeBase, KnowledgeBase,
  syncLogs, InsertSyncLog, SyncLog,
  inspectionChecklistResponses, InsertInspectionChecklistResponse, InspectionChecklistResponse,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
    // Check if user exists
    const existing = await getUserByOpenId(user.openId);
    
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
    
    // Handle role assignment
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else if (!existing) {
      // New user: default to technician role
      values.role = 'technician';
    }
    
    // Handle isActive for new users
    if (!existing) {
      // New users start as inactive (pending approval)
      values.isActive = 0;
    }
    // For existing users, don't change isActive unless explicitly provided
    if (user.isActive !== undefined) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
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
  return result[0];
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
  return db.select().from(devices).where(and(eq(devices.siteId, siteId), eq(devices.isActive, true))).orderBy(asc(devices.deviceType), asc(devices.location));
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
  return result[0]?.count ?? 0;
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

export async function getKnowledgeBaseByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(knowledgeBase).where(
    and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.isActive, true))
  ).orderBy(desc(knowledgeBase.createdAt));
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
  if (!db) return { totalJobs: 0, activeJobs: 0, completedJobs: 0, openDeficiencies: 0, totalDevices: 0, totalSites: 0 };
  
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
  
  return {
    totalJobs: jobStats?.total ?? 0,
    activeJobs: jobStats?.active ?? 0,
    completedJobs: jobStats?.completed ?? 0,
    openDeficiencies: openDef,
    totalDevices: deviceCount,
    totalSites: siteCount?.count ?? 0
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
