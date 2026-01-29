import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, date, tinyint, unique } from "drizzle-orm/mysql-core";

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
  isActive: tinyint("isActive").default(1).notNull(), // 1=active, 0=pending approval
  companyId: int("companyId"),
  customerOrgId: int("customerOrgId"), // For customer role users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  seenAssignmentsAt: timestamp("seenAssignmentsAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================
// INSPECTION CHECKLIST RESPONSES
// ============================================
export const inspectionChecklistResponses = mysqlTable("inspection_checklist_responses", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  sectionNumber: varchar("sectionNumber", { length: 10 }).notNull(), // e.g., "22.1", "22.2"
  itemId: varchar("itemId", { length: 10 }).notNull(), // e.g., "A", "B", "AA"
  status: mysqlEnum("status", ["PASS", "DEFICIENT", "NA"]).notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InspectionChecklistResponse = typeof inspectionChecklistResponses.$inferSelect;
export type InsertInspectionChecklistResponse = typeof inspectionChecklistResponses.$inferInsert;

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
  companyId: int("companyId").notNull(), // For multi-tenancy
  areaId: int("areaId"),
  category: mysqlEnum("category", ["FIRE_EXTINGUISHER", "EMERGENCY_LIGHT", "FIRE_ALARM_DEVICE", "SMOKE_ALARM", "SPRINKLER"]), // High-level grouping
  deviceType: varchar("deviceType", { length: 100 }).notNull(), // e.g., "Smoke Detector", "Pull Station", "Horn/Strobe", "ABC Extinguisher", "Exit Sign"
  manufacturer: varchar("manufacturer", { length: 100 }),
  model: varchar("model", { length: 100 }),
  serialNumber: varchar("serialNumber", { length: 100 }),
  installDate: timestamp("installDate"),
  lastInspectionDate: timestamp("lastInspectionDate"),
  location: varchar("location", { length: 255 }), // Specific location description
  barcode: varchar("barcode", { length: 100 }),
  externalRef: varchar("externalRef", { length: 255 }), // Stable import key (tag number, identifier, or hash)
  notes: text("notes"),
  // Smoke alarm specific fields
  suiteNumber: varchar("suiteNumber", { length: 50 }), // Required for SMOKE_ALARM category
  powerType: mysqlEnum("powerType", ["hardwired", "battery", "sealed", "unknown"]), // Power source type
  testResult: mysqlEnum("testResult", ["pass", "fail", "no_access", "na"]), // Test result
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
  assignedAt: timestamp("assignedAt"),
  assignedByUserId: int("assignedByUserId"),
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
  technicianNotes: text("technicianNotes"), // Editable by technician role
  officeNotes: text("officeNotes"), // Editable by admin/office only
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// ============================================
// JOB ASSIGNMENTS (Many-to-Many: Jobs <-> Technicians)
// ============================================
export const jobAssignments = mysqlTable("job_assignments", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  userId: int("userId").notNull(), // technician user id
  role: mysqlEnum("role", ["LEAD", "ASSIST"]).default("ASSIST").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  assignedByUserId: int("assignedByUserId"), // who assigned this technician
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Prevent duplicate assignments
  uniqueJobUser: unique().on(table.jobId, table.userId),
}));

export type JobAssignment = typeof jobAssignments.$inferSelect;
export type InsertJobAssignment = typeof jobAssignments.$inferInsert;

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
  walkOrder: int("walkOrder"), // Order in which device was tested (auto-assigned on first test)
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
  systemCategory: mysqlEnum("systemCategory", ["FIRE_ALARM", "FIRE_EXTINGUISHER", "EMERGENCY_LIGHTING", "SPRINKLER"]),
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
// ATTACHMENT (Photos & Files) - Enhanced
// ============================================
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  // Entity linking - can link to multiple entity types
  entityType: mysqlEnum("entityType", ["inspection_result", "deficiency", "repair", "device", "job", "site", "customer_org"]).notNull(),
  entityId: int("entityId").notNull(),
  // Additional optional links for cross-referencing
  siteId: int("siteId"),
  jobId: int("jobId"),
  deviceId: int("deviceId"),
  // File info
  uploadedById: int("uploadedById").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(), // S3 key
  fileUrl: text("fileUrl").notNull(), // S3 URL
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  // Metadata
  caption: text("caption"),
  aiCaption: text("aiCaption"), // AI-generated caption
  tags: json("tags"), // Array of tag strings
  // Upload tracking
  uploadStatus: mysqlEnum("uploadStatus", ["pending", "uploading", "completed", "failed"]).default("completed").notNull(),
  uploadProgress: int("uploadProgress").default(100),
  retryCount: int("retryCount").default(0),
  // Excel import tracking
  importStatus: mysqlEnum("importStatus", ["none", "previewed", "imported", "failed"]).default("none").notNull(),
  importSummary: json("importSummary"), // { imported: {}, updated: {}, excluded: [] }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// ============================================
// FILE TAGS (Predefined tags for organization)
// ============================================
export const fileTags = mysqlTable("file_tags", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#3b82f6"), // Hex color
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileTag = typeof fileTags.$inferSelect;
export type InsertFileTag = typeof fileTags.$inferInsert;

// ============================================
// IMPORT LOG (Track CSV/XLSX imports)
// ============================================
export const importLogs = mysqlTable("import_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  siteId: int("siteId"),
  importedById: int("importedById").notNull(),
  importType: mysqlEnum("importType", ["devices", "sites", "areas", "customers"]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 500 }), // S3 key for original file
  status: mysqlEnum("status", ["pending", "validating", "importing", "completed", "failed", "partial"]).default("pending").notNull(),
  // Column mapping stored as JSON
  columnMapping: json("columnMapping"),
  // Results
  totalRows: int("totalRows").default(0),
  successCount: int("successCount").default(0),
  errorCount: int("errorCount").default(0),
  duplicateCount: int("duplicateCount").default(0),
  skippedCount: int("skippedCount").default(0),
  // Error details
  errors: json("errors"), // Array of { row, column, message }
  duplicateHandling: mysqlEnum("duplicateHandling", ["skip", "update", "create_new"]).default("skip"),
  // Timing
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportLog = typeof importLogs.$inferSelect;
export type InsertImportLog = typeof importLogs.$inferInsert;

// ============================================
// IMPORT ROW RESULT (Individual row results)
// ============================================
export const importRowResults = mysqlTable("import_row_results", {
  id: int("id").autoincrement().primaryKey(),
  importLogId: int("importLogId").notNull(),
  rowNumber: int("rowNumber").notNull(),
  status: mysqlEnum("status", ["success", "error", "duplicate", "skipped"]).notNull(),
  entityId: int("entityId"), // ID of created/updated entity
  originalData: json("originalData"), // Original row data
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportRowResult = typeof importRowResults.$inferSelect;
export type InsertImportRowResult = typeof importRowResults.$inferInsert;

// ============================================
// UPLOAD QUEUE (For mobile background uploads)
// ============================================
export const uploadQueue = mysqlTable("upload_queue", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // File info
  localFileId: varchar("localFileId", { length: 100 }).notNull(), // Client-side ID
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  // Target entity
  entityType: mysqlEnum("entityType", ["inspection_result", "deficiency", "repair", "device", "job", "site", "customer_org"]).notNull(),
  entityId: int("entityId").notNull(),
  // Upload status
  status: mysqlEnum("status", ["queued", "uploading", "paused", "completed", "failed"]).default("queued").notNull(),
  progress: int("progress").default(0), // 0-100
  retryCount: int("retryCount").default(0),
  maxRetries: int("maxRetries").default(3),
  lastError: text("lastError"),
  // S3 info (populated after upload)
  fileKey: varchar("fileKey", { length: 500 }),
  fileUrl: text("fileUrl"),
  // Metadata
  tags: json("tags"),
  caption: text("caption"),
  // Timing
  queuedAt: timestamp("queuedAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UploadQueueItem = typeof uploadQueue.$inferSelect;
export type InsertUploadQueueItem = typeof uploadQueue.$inferInsert;

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

// ============================================
// FIRE ALARM SYSTEM (CAN/ULC-S536 Compliance)
// ============================================
export const fireAlarmSystems = mysqlTable("fire_alarm_systems", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  modelNumber: varchar("modelNumber", { length: 255 }),
  operationType: mysqlEnum("operationType", ["single_stage", "two_stage", "other"]).default("single_stage"),
  operationDescription: text("operationDescription"),
  connectedToMonitoring: boolean("connectedToMonitoring").default(false),
  monitoringCentreName: varchar("monitoringCentreName", { length: 255 }),
  monitoringCentrePhone: varchar("monitoringCentrePhone", { length: 50 }),
  systemFullyFunctional: boolean("systemFullyFunctional").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FireAlarmSystem = typeof fireAlarmSystems.$inferSelect;
export type InsertFireAlarmSystem = typeof fireAlarmSystems.$inferInsert;

// ============================================
// FIRE ALARM CHECKLIST TEMPLATE (CAN/ULC-S536)
// ============================================
export const fireAlarmChecklistTemplates = mysqlTable("fire_alarm_checklist_templates", {
  id: int("id").autoincrement().primaryKey(),
  sectionName: varchar("sectionName", { length: 255 }).notNull(),
  sectionOrder: int("sectionOrder").notNull(),
  itemLetter: varchar("itemLetter", { length: 10 }), // A, B, C, etc.
  itemDescription: text("itemDescription").notNull(),
  requirementType: mysqlEnum("requirementType", ["inspection", "test", "both"]).default("both"),
  inputType: mysqlEnum("inputType", ["checkbox", "numeric", "text", "voltage", "current", "date", "time", "year"]).default("checkbox"),
  numericLabel: varchar("numericLabel", { length: 100 }), // e.g., "Voltage:", "Current:", "Date:"
  numericUnit: varchar("numericUnit", { length: 50 }), // e.g., "V", "A", "A•h"
  isRequired: boolean("isRequired").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FireAlarmChecklistTemplate = typeof fireAlarmChecklistTemplates.$inferSelect;
export type InsertFireAlarmChecklistTemplate = typeof fireAlarmChecklistTemplates.$inferInsert;

// ============================================
// FIRE ALARM INSPECTION RESULTS
// ============================================
export const fireAlarmInspectionResults = mysqlTable("fire_alarm_inspection_results", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  fireAlarmSystemId: int("fireAlarmSystemId").notNull(),
  checklistItemId: int("checklistItemId").notNull(),
  result: mysqlEnum("result", ["pass", "fail", "na", "not_tested"]).default("not_tested"),
  numericValue: varchar("numericValue", { length: 100 }), // For numeric inputs (voltage, current, etc.)
  textValue: text("textValue"), // For text inputs (names, descriptions, etc.)
  notes: text("notes"),
  testedById: int("testedById"), // user_id of technician
  testedAt: timestamp("testedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FireAlarmInspectionResult = typeof fireAlarmInspectionResults.$inferSelect;
export type InsertFireAlarmInspectionResult = typeof fireAlarmInspectionResults.$inferInsert;

// ============================================
// FIRE ALARM CONTROL UNITS
// ============================================
export const fireAlarmControlUnits = mysqlTable("fire_alarm_control_units", {
  id: int("id").autoincrement().primaryKey(),
  fireAlarmSystemId: int("fireAlarmSystemId").notNull(),
  location: varchar("location", { length: 255 }),
  identification: varchar("identification", { length: 255 }),
  unitType: mysqlEnum("unitType", ["control_unit", "transponder"]).default("control_unit"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FireAlarmControlUnit = typeof fireAlarmControlUnits.$inferSelect;
export type InsertFireAlarmControlUnit = typeof fireAlarmControlUnits.$inferInsert;

// ============================================
// FIRE ALARM ANNUNCIATORS
// ============================================
export const fireAlarmAnnunciators = mysqlTable("fire_alarm_annunciators", {
  id: int("id").autoincrement().primaryKey(),
  fireAlarmSystemId: int("fireAlarmSystemId").notNull(),
  location: varchar("location", { length: 255 }),
  identification: varchar("identification", { length: 255 }),
  annunciatorType: mysqlEnum("annunciatorType", ["standard", "sequential_display", "remote_trouble"]).default("standard"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FireAlarmAnnunciator = typeof fireAlarmAnnunciators.$inferSelect;
export type InsertFireAlarmAnnunciator = typeof fireAlarmAnnunciators.$inferInsert;


// ============================================
// SPRINKLER ITM INSPECTION MODULE (NFPA 25 / Vancouver Fire By-law)
// ============================================

// Main sprinkler inspection record
export const sprinklerInspections = mysqlTable("sprinkler_inspections", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  inspectionDate: timestamp("inspectionDate").notNull(),
  buildingId: varchar("buildingId", { length: 50 }),
  status: mysqlEnum("status", ["draft", "finalized"]).default("draft").notNull(),
  finalizedAt: timestamp("finalizedAt"),
  finalizedById: int("finalizedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SprinklerInspection = typeof sprinklerInspections.$inferSelect;
export type InsertSprinklerInspection = typeof sprinklerInspections.$inferInsert;

// Sprinkler systems summary (up to 6 systems per inspection)
export const sprinklerSystems = mysqlTable("sprinkler_systems", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: int("inspectionId").notNull(),
  systemNumber: int("systemNumber").notNull(), // 1-6
  
  // System type flags
  isWet: boolean("isWet").default(false),
  isDryPipePartialTest: boolean("isDryPipePartialTest").default(false),
  isDryPipeFullFlowTest: boolean("isDryPipeFullFlowTest").default(false),
  isDeluge: boolean("isDeluge").default(false),
  isPreaction: boolean("isPreaction").default(false),
  isOther: boolean("isOther").default(false),
  otherDescription: text("otherDescription"),
  
  // Dates
  dateOfLastFullFlowTest: date("dateOfLastFullFlowTest"),
  dateOfLast5YearInternal: date("dateOfLast5YearInternal"),
  
  // System details
  areaOfCoverage: varchar("areaOfCoverage", { length: 255 }),
  size: varchar("size", { length: 100 }),
  manufacturer: varchar("manufacturer", { length: 255 }),
  model: varchar("model", { length: 255 }),
  
  // Pressures (stored as decimals for numeric validation)
  systemWaterPressure: int("systemWaterPressure"), // psi
  supplyWaterPressure: int("supplyWaterPressure"), // psi
  residualPressure: int("residualPressure"), // psi
  waterPressureAtBaseOfRiser: int("waterPressureAtBaseOfRiser"), // psi
  systemAirPressure: int("systemAirPressure"), // psi
  lowAirSwitchCutIn: int("lowAirSwitchCutIn"), // psi
  tripPressure: int("tripPressure"), // psi
  
  // Timing measurements (stored as decimals for seconds)
  tripTime: int("tripTime"), // seconds
  waterDeliveryTime: int("waterDeliveryTime"), // seconds
  
  // Gauge information
  gaugeYear: int("gaugeYear"), // year of manufacture/installation
  gaugeCondition: text("gaugeCondition"),
  
  // Compressor information (for dry/preaction systems)
  compressorMakeModel: varchar("compressorMakeModel", { length: 255 }),
  compressorCutInPressure: int("compressorCutInPressure"), // psi
  compressorCutOutPressure: int("compressorCutOutPressure"), // psi
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SprinklerSystem = typeof sprinklerSystems.$inferSelect;
export type InsertSprinklerSystem = typeof sprinklerSystems.$inferInsert;

// Sprinkler checklist items
export const sprinklerChecklistItems = mysqlTable("sprinkler_checklist_items", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: int("inspectionId").notNull(),
  section: varchar("section", { length: 100 }).notNull(), // 'General', 'Dry Systems', etc.
  questionText: text("questionText").notNull(),
  questionOrder: int("questionOrder").notNull(),
  
  // Response
  response: mysqlEnum("response", ["YES", "NO", "NA"]),
  comment: text("comment"),
  
  // Deficiency trigger configuration
  createsDeficiencyWhen: mysqlEnum("createsDeficiencyWhen", ["NO", "YES", "NEVER"]).default("NEVER"),
  
  // Special fields for specific questions
  numberValue: int("numberValue"), // For "Number of systems", etc.
  dateValue: date("dateValue"), // For date fields
  tempValue: varchar("tempValue", { length: 50 }), // For antifreeze temps
  textValue: text("textValue"), // For text fields like "System pressure"
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SprinklerChecklistItem = typeof sprinklerChecklistItems.$inferSelect;
export type InsertSprinklerChecklistItem = typeof sprinklerChecklistItems.$inferInsert;

// Sprinkler devices table
export const sprinklerDevices = mysqlTable("sprinkler_devices", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: int("inspectionId").notNull(),
  deviceOrder: int("deviceOrder").notNull(),
  
  // Required field
  location: varchar("location", { length: 255 }).notNull(), // REQUIRED
  
  // Device details
  labelText: varchar("labelText", { length: 255 }),
  deviceType: varchar("deviceType", { length: 50 }), // TS, FS, FPS, LA, etc.
  address: varchar("address", { length: 100 }),
  zone: varchar("zone", { length: 100 }),
  
  // Checks (A-F) - null means not checked, true = pass, false = fail
  checkA: boolean("checkA"), // Correctly installed
  checkB: boolean("checkB"), // Alarm/Activation confirmed
  checkC: boolean("checkC"), // Annunciator indication
  checkD: boolean("checkD"), // Supervised circuit trouble signal
  checkE: boolean("checkE"), // Requires service/missing
  checkF: boolean("checkF"), // Measurements
  
  remarks: text("remarks"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SprinklerDevice = typeof sprinklerDevices.$inferSelect;
export type InsertSprinklerDevice = typeof sprinklerDevices.$inferInsert;
