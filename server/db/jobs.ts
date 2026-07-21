// Job and job-assignment data access.
//
// Extracted verbatim from server/db.ts as the first step of an incremental
// maintainability refactor — no behavior change. server/db.ts re-exports
// everything here (`export * from "./db/jobs"`), so existing
// `import { ... } from "../db"` / `import * as db from "../db"` call sites are
// unchanged. New code may import directly from "../db/jobs".

import { eq, and, desc, sql, or, like } from "drizzle-orm";
import { getDb } from "./client";
import {
  jobs, InsertJob,
  jobAssignments, InsertJobAssignment,
  users,
  inspectionResults,
} from "../../drizzle/schema";

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
  // Defense-in-depth: populate companyId from the parent job when not already supplied.
  let insertData = data;
  if (insertData.companyId == null) {
    const job = await getJobById(insertData.jobId);
    if (job) insertData = { ...insertData, companyId: job.companyId };
  }
  const result = await db.insert(jobAssignments).values(insertData);
  return { id: Number(result[0].insertId), ...insertData };
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
    // Inlined getUserById (server/db.ts) to keep this module free of a back-edge
    // to db.ts — same query, same shape.
    const leadRows = await db.select().from(users).where(eq(users.id, job[0].leadTechnicianId)).limit(1);
    const leadUser = leadRows.length > 0 ? leadRows[0] : undefined;
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
