import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

// ============================================
// CORE USER TABLE (Extended from template)
// ============================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "office", "technician", "customer"]).default("technician").notNull(),
  companyId: int("companyId"),
  customerOrgId: int("customerOrgId"), // For customer role users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================
// COMPANY (Tenant for multi-tenancy)
// ============================================
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  logo: text("logo"),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ============================================
// CUSTOMER ORGANIZATION
// ============================================
export const customerOrgs = mysqlTable("customer_orgs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(), // Belongs to which service company
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  address: text("address"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerOrg = typeof customerOrgs.$inferSelect;
export type InsertCustomerOrg = typeof customerOrgs.$inferInsert;

// ============================================
// SITE (Inspection Location)
// ============================================
export const sites = mysqlTable("sites", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  customerOrgId: int("customerOrgId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  postalCode: varchar("postalCode", { length: 20 }),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Site = typeof sites.$inferSelect;
export type InsertSite = typeof sites.$inferInsert;

// ============================================
// AREA (Zone within a Site)
// ============================================
export const areas = mysqlTable("areas", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  floor: varchar("floor", { length: 50 }),
  building: varchar("building", { length: 100 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Area = typeof areas.$inferSelect;
export type InsertArea = typeof areas.$inferInsert;

// ============================================
// ASSET/DEVICE (Fire Alarm Device)
// ============================================
export const devices = mysqlTable("devices", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  areaId: int("areaId"),
  deviceType: varchar("deviceType", { length: 100 }).notNull(), // e.g., "Smoke Detector", "Pull Station", "Horn/Strobe"
  manufacturer: varchar("manufacturer", { length: 100 }),
  model: varchar("model", { length: 100 }),
  serialNumber: varchar("serialNumber", { length: 100 }),
  installDate: timestamp("installDate"),
  lastInspectionDate: timestamp("lastInspectionDate"),
  location: varchar("location", { length: 255 }), // Specific location description
  barcode: varchar("barcode", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

// ============================================
// JOB/INSPECTION
// ============================================
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  siteId: int("siteId").notNull(),
  customerOrgId: int("customerOrgId").notNull(),
  assignedTechnicianId: int("assignedTechnicianId"),
  jobNumber: varchar("jobNumber", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  jobType: mysqlEnum("jobType", ["annual", "semi_annual", "quarterly", "monthly", "service_call", "repair"]).default("annual").notNull(),
  status: mysqlEnum("status", ["pending", "scheduled", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  scheduledDate: timestamp("scheduledDate"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// ============================================
// INSPECTION RESULT (Device Test Result)
// ============================================
export const inspectionResults = mysqlTable("inspection_results", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  deviceId: int("deviceId").notNull(),
  technicianId: int("technicianId").notNull(),
  result: mysqlEnum("result", ["pass", "fail", "na", "not_tested"]).default("not_tested").notNull(),
  notes: text("notes"),
  testedAt: timestamp("testedAt"),
  syncedAt: timestamp("syncedAt"), // When synced from offline
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InspectionResult = typeof inspectionResults.$inferSelect;
export type InsertInspectionResult = typeof inspectionResults.$inferInsert;

// ============================================
// DEFICIENCY
// ============================================
export const deficiencies = mysqlTable("deficiencies", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  deviceId: int("deviceId"),
  inspectionResultId: int("inspectionResultId"),
  reportedById: int("reportedById").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed", "deferred"]).default("open").notNull(),
  severity: mysqlEnum("severity", ["critical", "major", "minor", "observation"]).default("major").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  observedIssue: text("observedIssue"),
  correctiveAction: text("correctiveAction"),
  customerExplanation: text("customerExplanation"),
  codeReference: varchar("codeReference", { length: 255 }),
  aiGenerated: boolean("aiGenerated").default(false),
  resolvedAt: timestamp("resolvedAt"),
  resolvedById: int("resolvedById"),
  resolutionNotes: text("resolutionNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Deficiency = typeof deficiencies.$inferSelect;
export type InsertDeficiency = typeof deficiencies.$inferInsert;

// ============================================
// REPAIR
// ============================================
export const repairs = mysqlTable("repairs", {
  id: int("id").autoincrement().primaryKey(),
  deficiencyId: int("deficiencyId").notNull(),
  technicianId: int("technicianId").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "parts_ordered"]).default("pending").notNull(),
  description: text("description"),
  partsUsed: text("partsUsed"),
  laborHours: int("laborHours"),
  completedAt: timestamp("completedAt"),
  aiRecommendations: json("aiRecommendations"), // Store AI-generated repair recommendations
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Repair = typeof repairs.$inferSelect;
export type InsertRepair = typeof repairs.$inferInsert;

// ============================================
// ATTACHMENT (Photos)
// ============================================
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  entityType: mysqlEnum("entityType", ["inspection_result", "deficiency", "repair", "device", "job"]).notNull(),
  entityId: int("entityId").notNull(),
  uploadedById: int("uploadedById").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(), // S3 key
  fileUrl: text("fileUrl").notNull(), // S3 URL
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  caption: text("caption"),
  aiCaption: text("aiCaption"), // AI-generated caption
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// ============================================
// REPORT (Generated PDFs)
// ============================================
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  generatedById: int("generatedById").notNull(),
  reportNumber: varchar("reportNumber", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }), // S3 key
  fileUrl: text("fileUrl"), // S3 URL
  executiveSummary: text("executiveSummary"),
  deviceCount: int("deviceCount"),
  passCount: int("passCount"),
  failCount: int("failCount"),
  deficiencyCount: int("deficiencyCount"),
  aiSummary: text("aiSummary"), // AI-generated summary
  status: mysqlEnum("status", ["draft", "generated", "sent", "approved"]).default("draft").notNull(),
  approvedAt: timestamp("approvedAt"),
  approvedById: int("approvedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

// ============================================
// KNOWLEDGE BASE (For RAG)
// ============================================
export const knowledgeBase = mysqlTable("knowledge_base", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["sop", "code", "manual", "template", "other"]).default("other").notNull(),
  content: text("content"),
  fileKey: varchar("fileKey", { length: 500 }),
  fileUrl: text("fileUrl"),
  uploadedById: int("uploadedById").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeBase = typeof knowledgeBase.$inferInsert;

// ============================================
// OFFLINE SYNC LOG
// ============================================
export const syncLogs = mysqlTable("sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(),
  entityId: int("entityId").notNull(),
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
  payload: json("payload"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  deviceInfo: text("deviceInfo"),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;
