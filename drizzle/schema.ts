import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, date, tinyint, unique, decimal, index } from "drizzle-orm/mysql-core";

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
  // Technician certification fields (ULC S536 compliance)
  certNumber: varchar("certNumber", { length: 64 }),       // e.g. "CFAA-12345"
  certificationLevel: varchar("certificationLevel", { length: 128 }), // e.g. "Level II Fire Alarm Technician"
  certExpiry: date("certExpiry"),                          // Certification expiry date
  // Google Workspace tokens (stored after OAuth login)
  googleAccessToken: text("googleAccessToken"),
  googleRefreshToken: text("googleRefreshToken"),
  googleTokenExpiry: timestamp("googleTokenExpiry"),
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
  // BUG-05 fix: used for domain-based company matching during OAuth sign-in
  emailDomain: varchar("emailDomain", { length: 255 }),
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

// Site Summary type definition
export type SiteSummary = {
  client?: {
    name?: string;
  };
  building?: {
    name?: string;
    year?: string;
    class?: string;
    stories?: string;
  };
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  billing?: {
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  contacts?: Array<{
    name?: string;
    role?: string;
    phone?: string;
    email?: string;
  }>;
  monitoring?: {
    company?: string;
    accountNumber?: string;
    phone?: string;
    password?: string;
  };
  estimates?: {
    servicingHours?: string;
    repairBudget?: string;
  };
  totals?: {
    fireAlarmDevicesCount?: number;
    smokeAlarmsCount?: number;
    emergencyLightsCount?: number;
    fireExtinguishersCount?: number;
    sprinklerDevicesCount?: number;
    backflowsCount?: number;
  };
  notes?: string;
};

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
  summary: json("summary").$type<SiteSummary>(),
  // Key tracking (mirrors AppSheet portal KeyLocation / KeyNumber / KeySignOutDate)
  buildingId: varchar("buildingId", { length: 50 }),
  keyLocation: text("keyLocation"),
  keyNumber: varchar("keyNumber", { length: 50 }),
  keySignOutDate: timestamp("keySignOutDate"),
  keySignedOutBy: varchar("keySignedOutBy", { length: 100 }),
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
  category: mysqlEnum("category", ["FIRE_EXTINGUISHER", "EMERGENCY_LIGHT", "FIRE_ALARM_DEVICE", "SMOKE_ALARM", "SPRINKLER", "BACKFLOW"]), // High-level grouping
  deviceType: varchar("deviceType", { length: 100 }).notNull(), // e.g., "Smoke Detector", "Pull Station", "Horn/Strobe", "ABC Extinguisher", "Exit Sign"
  manufacturer: varchar("manufacturer", { length: 100 }),
  model: varchar("model", { length: 100 }),
  serialNumber: varchar("serialNumber", { length: 100 }),
  installDate: timestamp("installDate"),
  lastInspectionDate: timestamp("lastInspectionDate"),
  location: varchar("location", { length: 255 }), // Specific location description
  label: varchar("label", { length: 50 }), // Device label / tag ID (for fire alarm devices)
  floor: varchar("floor", { length: 50 }), // Floor number or name
  circuitAddress: varchar("circuitAddress", { length: 50 }), // Circuit/loop address (fire alarm devices)
  zone: varchar("zone", { length: 50 }), // Zone designation
  barcode: varchar("barcode", { length: 100 }),
  externalRef: varchar("externalRef", { length: 255 }), // Stable import key (tag number, identifier, or hash)
  notes: text("notes"),
  // Smoke alarm specific fields
  suiteNumber: varchar("suiteNumber", { length: 50 }), // Required for SMOKE_ALARM category
  powerType: mysqlEnum("powerType", ["hardwired", "battery", "sealed", "unknown"]), // Power source type
  testResult: mysqlEnum("testResult", ["pass", "fail", "no_access", "na"]), // Test result
  // Fire extinguisher maintenance dates
  mfgDate: varchar("mfgDate", { length: 20 }), // Manufacture date
  lastHST: varchar("lastHST", { length: 20 }), // Last hydrostatic test date
  last6yr: varchar("last6yr", { length: 20 }), // Last 6-year maintenance date
  // Emergency light specification fields
  ladderHeight: varchar("ladderHeight", { length: 20 }),
  supplyVoltage: varchar("supplyVoltage", { length: 20 }),
  modelWattage: varchar("modelWattage", { length: 20 }),
  batteryYear: varchar("batteryYear", { length: 20 }),
  batterySize: varchar("batterySize", { length: 50 }),
  batteryCount: int("batteryCount"),
  lampCount: int("lampCount"),
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
  assignedTechnicianId: int("assignedTechnicianId"), // DEPRECATED: Use leadTechnicianId + jobAssignments instead
  leadTechnicianId: int("leadTechnicianId"), // Primary technician responsible for the job
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
  // --- Compliance Hardening: Finalization Lock ---
  finalizedAt: timestamp("finalizedAt"),
  finalizedById: int("finalizedById"),
  finalizationHash: varchar("finalizationHash", { length: 64 }),
  syncAssertedAt: timestamp("syncAssertedAt"),
  syncAssertedById: int("syncAssertedById"),
  // Google Calendar integration
  googleCalendarEventId: varchar("googleCalendarEventId", { length: 255 }),
  // Digital signatures — collected at end of inspection before completion
  techSignatureUrl: text("tech_signature_url"),
  contactSignatureUrl: text("contact_signature_url"),
  contactName: varchar("contact_name", { length: 255 }),
  contactSignedAt: timestamp("contact_signed_at"),
  techSignedAt: timestamp("tech_signed_at"),
  // Pre-fill audit: tracks which prior job's inspection_results were copied into this one
  copiedFromJobId: int("copied_from_job_id"),
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
  technicianId: int("technicianId"), // nullable — null for pre-filled rows until technician tests the device
  result: mysqlEnum("result", ["pass", "fail", "na", "not_tested"]).default("not_tested").notNull(),
  notes: text("notes"),
  testedAt: timestamp("testedAt"),
  syncedAt: timestamp("syncedAt"), // When synced from offline
  walkOrder: int("walkOrder"), // Order in which device was tested (auto-assigned on first test)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // --- Compliance Hardening: Technician Credential Snapshot ---
  technicianCertificationSnapshot: json("technicianCertificationSnapshot"),
  // Pre-fill: true when this row was auto-created from a prior job's inspection_results
  carriedForward: tinyint("carried_forward").default(0).notNull(),
}, (table) => ({
  jobIdIdx: index("inspection_results_jobId_idx").on(table.jobId),
}));

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
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed", "deferred", "quoted"]).default("open").notNull(),
  severity: mysqlEnum("severity", ["critical", "major", "minor", "observation"]).default("major").notNull(),
  // BUG-02 fix: added SMOKE_ALARM. BUG-03 fix: EMERGENCY_LIGHTING (was missing SMOKE_ALARM, now consistent with pdfGenerator)
  systemCategory: mysqlEnum("systemCategory", ["FIRE_ALARM", "SMOKE_ALARM", "FIRE_EXTINGUISHER", "EMERGENCY_LIGHTING", "SPRINKLER"]),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  observedIssue: text("observedIssue"),
  correctiveAction: text("correctiveAction"),
  customerExplanation: text("customerExplanation"),
  codeReference: varchar("codeReference", { length: 255 }),
  // BUG-01 fix: estimatedCost was used throughout PDF generator but missing from schema
  estimatedCost: decimal("estimatedCost", { precision: 10, scale: 2 }),
  // --- Compliance Hardening: AI Provenance ---
  aiGeneratedAt: timestamp("aiGeneratedAt"),
  aiModelId: varchar("aiModelId", { length: 64 }),
  aiPromptHash: varchar("aiPromptHash", { length: 64 }),
  aiContext: json("aiContext"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedById: int("resolvedById"),
  resolutionNotes: text("resolutionNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  jobIdIdx: index("deficiencies_jobId_idx").on(table.jobId),
}));

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
}, (table) => ({
  deficiencyIdIdx: index("repairs_deficiencyId_idx").on(table.deficiencyId),
}));

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
  // Google Drive integration
  googleDriveUrl: text("googleDriveUrl"),
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
  // --- CAN/ULC-S536 extended fields ---
  hasSubItems: boolean("hasSubItems").notNull().default(false),
  subItems: json("subItems").$type<string[]>(),
  notApplicableNote: varchar("notApplicableNote", { length: 500 }),
  headerFields: json("headerFields").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // --- Compliance Hardening: Standards Template Versioning ---
  standardId: varchar("standardId", { length: 64 }).notNull().default("ulc_s536"),
  standardVersion: varchar("standardVersion", { length: 32 }).notNull().default("2019"),
  effectiveDate: date("effectiveDate").notNull(),
  supersededAt: date("supersededAt"),
  isActive: boolean("isActive").notNull().default(true),
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
  numericValue: decimal("numericValue", { precision: 10, scale: 3 }), // Changed from VARCHAR to DECIMAL
  numericValueRaw: varchar("numericValueRaw", { length: 100 }), // Preserved original string before conversion
  unit: varchar("unit", { length: 20 }), // Detected unit (V, A, Ω, etc.)
  textValue: text("textValue"),                           // For text inputs (names, descriptions, etc.)
  notes: text("notes"),
  testedById: int("testedById"),                          // user_id of technician
  testedAt: timestamp("testedAt"),
  syncedAt: timestamp("syncedAt"),                        // When synced from offline device
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // --- Compliance Hardening: Item Snapshot + Credential Snapshot ---
  itemSnapshot: json("itemSnapshot"),
  technicianCertificationSnapshot: json("technicianCertificationSnapshot"),
}, (table) => ({
  jobIdIdx: index("fire_alarm_inspection_results_jobId_idx").on(table.jobId),
}));

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

// ============================================
// AUDIT LOG (Compliance Hardening)
// ============================================
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  tableName: varchar("tableName", { length: 64 }).notNull(),
  recordId: int("recordId").notNull(),
  action: mysqlEnum("action", ["insert", "update", "delete", "hash_mismatch_detected"]).notNull(),
  changedById: int("changedById"),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
  previousValues: json("previousValues"),
  newValues: json("newValues"),
  reason: text("reason"),
  procedureName: varchar("procedureName", { length: 128 }),
  requestId: varchar("requestId", { length: 64 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// ============================================
// MIGRATION LOG (Backfill issue tracking)
// ============================================
export const migrationLog = mysqlTable("migration_log", {
  id: int("id").autoincrement().primaryKey(),
  migrationName: varchar("migrationName", { length: 128 }).notNull(),
  tableName: varchar("tableName", { length: 64 }).notNull(),
  rowId: int("rowId").notNull(),
  jobId: int("jobId"),
  originalValue: text("originalValue"),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MigrationLog = typeof migrationLog.$inferSelect;
export type InsertMigrationLog = typeof migrationLog.$inferInsert;

// ============================================
// FIRE ALARM FORM HEADER (per-job cover page data)
// ============================================
export const fireAlarmFormHeader = mysqlTable("fire_alarm_form_header", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().unique(),
  // Inspection details
  inspectionDate: date("inspectionDate"),
  // System info
  systemManufacturer: varchar("systemManufacturer", { length: 255 }),
  systemModel: varchar("systemModel", { length: 255 }),
  systemSerialNo: varchar("systemSerialNo", { length: 100 }),
  systemInstallYear: varchar("systemInstallYear", { length: 10 }),
  operationType: varchar("operationType", { length: 100 }),
  // FSRC
  connectedToFSRC: boolean("connectedToFSRC").default(false),
  fsrcName: varchar("fsrcName", { length: 255 }),
  fsrcPhone: varchar("fsrcPhone", { length: 50 }),
  fsrcAccountNo: varchar("fsrcAccountNo", { length: 100 }),
  // Technician info
  techName: varchar("techName", { length: 255 }),
  techCertNo: varchar("techCertNo", { length: 100 }),
  techCertLevel: varchar("techCertLevel", { length: 255 }),
  techCompany: varchar("techCompany", { length: 255 }),
  // Recommendations & notes
  recommendations: text("recommendations"),
  // Per-section header field values stored as JSON: { sectionOrder: { fieldLabel: value } }
  sectionHeaderValues: json("sectionHeaderValues").$type<Record<string, Record<string, string>>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FireAlarmFormHeader = typeof fireAlarmFormHeader.$inferSelect;
export type InsertFireAlarmFormHeader = typeof fireAlarmFormHeader.$inferInsert;

// ============================================
// FIRE ALARM ATTENDANCE LOG (per-job technician attendance)
// ============================================
export const fireAlarmAttendanceLog = mysqlTable("fire_alarm_attendance_log", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  rowOrder: int("rowOrder").notNull().default(0),
  techName: varchar("techName", { length: 255 }),
  certNo: varchar("certNo", { length: 100 }),
  attendanceDate: date("attendanceDate"),
  timeIn: varchar("timeIn", { length: 20 }),
  timeOut: varchar("timeOut", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FireAlarmAttendanceLog = typeof fireAlarmAttendanceLog.$inferSelect;
export type InsertFireAlarmAttendanceLog = typeof fireAlarmAttendanceLog.$inferInsert;

// ============================================
// FIRE ALARM ANCILLARY CIRCUITS (Section 12)
// ============================================
export const fireAlarmAncillaryCircuits = mysqlTable("fire_alarm_ancillary_circuits", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  rowOrder: int("rowOrder").notNull().default(0),
  circuitDescription: varchar("circuitDescription", { length: 500 }),
  circuitType: varchar("circuitType", { length: 100 }),
  poweredBy: varchar("poweredBy", { length: 255 }),
  operationConfirmed: mysqlEnum("operationConfirmed", ["yes", "no", "na"]).default("na"),
  confirmationMethod: varchar("confirmationMethod", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FireAlarmAncillaryCircuit = typeof fireAlarmAncillaryCircuits.$inferSelect;
export type InsertFireAlarmAncillaryCircuit = typeof fireAlarmAncillaryCircuits.$inferInsert;

// ============================================
// QUOTES (deficiency → repair quote sent to customer)
// ============================================

export type QuoteLineItem = {
  deficiencyId: number | null;
  description: string;
  unitPrice: number;
  qty: number;
};

export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  siteId: int("siteId").notNull(),
  customerOrgId: int("customerOrgId").notNull(),
  companyId: int("companyId").notNull(),
  lineItems: json("lineItems").$type<QuoteLineItem[]>().notNull(),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "declined"]).default("draft").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  // S3 URL for the generated PDF (set when the quote is sent)
  pdfUrl: text("pdfUrl"),
  // Opaque token for the customer accept link (set when the quote is sent)
  acceptToken: varchar("acceptToken", { length: 64 }),
  sentAt: timestamp("sentAt"),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  jobIdIdx: index("quotes_jobId_idx").on(table.jobId),
}));

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;


// ============================================
// SERVICE SCHEDULES
// Long-term recurring service definition per site/service type.
// ============================================

export const serviceSchedules = mysqlTable("service_schedules", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  buildingId: varchar("buildingId", { length: 50 }),
  customerOrgId: int("customerOrgId").notNull(),
  companyId: int("companyId").notNull(),
  serviceType: varchar("serviceType", { length: 100 }).notNull(),
  frequency: mysqlEnum("frequency", ["monthly", "quarterly", "semi_annual", "annual", "other"]).notNull().default("annual"),
  estimatedHours: decimal("estimatedHours", { precision: 5, scale: 2 }),
  requiredTechCount: int("requiredTechCount").default(1),
  requiredSystems: json("requiredSystems").$type<string[]>(),
  active: boolean("active").default(true).notNull(),
  lastCompletedAt: timestamp("lastCompletedAt"),
  nextDueAt: timestamp("nextDueAt"),
  sourceImportId: int("sourceImportId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  siteIdIdx: index("service_schedules_siteId_idx").on(table.siteId),
  companyIdIdx: index("service_schedules_companyId_idx").on(table.companyId),
}));

export type ServiceSchedule = typeof serviceSchedules.$inferSelect;
export type InsertServiceSchedule = typeof serviceSchedules.$inferInsert;

// ============================================
// MONTHLY SERVICE TRACKING
// Admin tracking sheet layer — one row per site/service/month.
// ============================================

export const monthlyServiceTracking = mysqlTable("monthly_service_tracking", {
  id: int("id").autoincrement().primaryKey(),
  serviceScheduleId: int("serviceScheduleId"),
  siteId: int("siteId").notNull(),
  buildingId: varchar("buildingId", { length: 50 }),
  customerOrgId: int("customerOrgId").notNull(),
  companyId: int("companyId").notNull(),
  // YYYY-MM — the month this row belongs to
  trackingMonth: varchar("trackingMonth", { length: 7 }).notNull(),
  serviceType: varchar("serviceType", { length: 100 }).notNull(),
  targetDate: date("targetDate"),
  scheduledDate: date("scheduledDate"),
  // Array of user IDs assigned
  assignedTechnicianIds: json("assignedTechnicianIds").$type<number[]>(),
  plannedHours: decimal("plannedHours", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", [
    "not_scheduled",
    "scheduled",
    "in_progress",
    "completed",
    "report_pending",
    "rescheduled",
    "overdue",
  ]).default("not_scheduled").notNull(),
  linkedJobId: int("linkedJobId"),
  linkedCalendarEventId: varchar("linkedCalendarEventId", { length: 255 }),
  reportStatus: mysqlEnum("reportStatus", ["none", "pending", "generated", "sent"]).default("none").notNull(),
  deficiencyCount: int("deficiencyCount").default(0),
  rescheduleReason: text("rescheduleReason"),
  notes: text("notes"),
  sourceImportId: int("sourceImportId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  siteIdIdx: index("monthly_tracking_siteId_idx").on(table.siteId),
  companyIdIdx: index("monthly_tracking_companyId_idx").on(table.companyId),
  monthIdx: index("monthly_tracking_month_idx").on(table.trackingMonth),
}));

export type MonthlyServiceTracking = typeof monthlyServiceTracking.$inferSelect;
export type InsertMonthlyServiceTracking = typeof monthlyServiceTracking.$inferInsert;

// ============================================
// REPAIR LETTER TRACKING
// Admin tracking sheet for repair-letter follow-up per site/period.
// ============================================

export const repairLetterTracking = mysqlTable("repair_letter_tracking", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  buildingId: varchar("buildingId", { length: 50 }),
  customerOrgId: int("customerOrgId").notNull(),
  companyId: int("companyId").notNull(),
  trackingPeriod: varchar("trackingPeriod", { length: 7 }).notNull(), // YYYY-MM
  linkedJobId: int("linkedJobId"),
  linkedReportId: int("linkedReportId"),
  deficiencyCount: int("deficiencyCount").default(0),
  linkedDeficiencyIds: json("linkedDeficiencyIds").$type<number[]>(),
  repairLetterStatus: mysqlEnum("repairLetterStatus", [
    "not_started",
    "draft_needed",
    "drafted",
    "sent",
    "follow_up_needed",
    "completed",
    "closed",
  ]).default("not_started").notNull(),
  letterSentDate: date("letterSentDate"),
  followUpDate: date("followUpDate"),
  assignedToUserId: int("assignedToUserId"),
  notes: text("notes"),
  sourceImportId: int("sourceImportId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  siteIdIdx: index("repair_letter_siteId_idx").on(table.siteId),
  companyIdIdx: index("repair_letter_companyId_idx").on(table.companyId),
  periodIdx: index("repair_letter_period_idx").on(table.trackingPeriod),
}));

export type RepairLetterTracking = typeof repairLetterTracking.$inferSelect;
export type InsertRepairLetterTracking = typeof repairLetterTracking.$inferInsert;

// ============================================
// AI REVIEWS
// Pre-publish inspection quality checks.
// ============================================

export type AiReviewIssue = {
  device_id: number | null;
  device_type: string;
  field: string;
  issue: string;
  severity: "warning" | "blocker";
};

export type AiReviewOverride = {
  issueIndex: number;
  dismissedAt: string; // ISO timestamp
};

export const aiReviews = mysqlTable("ai_reviews", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  issues: json("issues").$type<AiReviewIssue[]>().notNull(),
  modelUsed: varchar("modelUsed", { length: 64 }).notNull(),
  reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
  overrides: json("overrides").$type<AiReviewOverride[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  jobIdIdx: index("ai_reviews_jobId_idx").on(table.jobId),
}));

export type AiReview = typeof aiReviews.$inferSelect;
export type InsertAiReview = typeof aiReviews.$inferInsert;
