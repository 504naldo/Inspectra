import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, date, tinyint, unique, uniqueIndex, decimal, index } from "drizzle-orm/mysql-core";

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
  // sessionVersion column is live in the DB after migration 0044; not declared here
  // so Drizzle's explicit SELECT list doesn't break pre-migration deploys.
  // Use (user as any).sessionVersion at runtime.
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
  // File number (matches FILE # column in service tracking spreadsheets, e.g. "#0007")
  fileNumber: varchar("fileNumber", { length: 20 }),
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
  batteryReplaced: varchar("batteryReplaced", { length: 10 }),
  maintenanceRequired: varchar("maintenanceRequired", { length: 20 }),
  lampCount: int("lampCount"),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder"),
  // Asset lifecycle fields
  lifecycleStatus: mysqlEnum("lifecycleStatus", ["active", "needs_service", "repair_required", "replacement_recommended", "replaced", "removed"]),
  assetCondition: mysqlEnum("assetCondition", ["good", "fair", "poor", "failed", "unknown"]),
  replacementRecommended: boolean("replacementRecommended").default(false),
  replacementRecommendedAt: timestamp("replacementRecommendedAt"),
  nextServiceDate: date("nextServiceDate"),
  serviceNotes: text("serviceNotes"),
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
  // Linked work order — set when a repair work order is created for this deficiency
  workOrderId: int("workOrderId"),
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
  status: mysqlEnum("status", ["draft", "generated", "sent", "approved", "corrections_required", "archived"]).default("draft").notNull(),
  approvedAt: timestamp("approvedAt"),
  approvedById: int("approvedById"),
  qaNote: text("qaNote"), // QA reviewer note (corrections request, approval note, etc.)
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
  // varchar instead of enum so new categories can be added without migrations
  category: varchar("category", { length: 50 }).default("other").notNull(),
  content: text("content"),
  fileKey: varchar("fileKey", { length: 500 }),
  fileUrl: text("fileUrl"),
  uploadedById: int("uploadedById").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // v2 fields (added migration 0050)
  systemType: varchar("systemType", { length: 50 }),
  tagsJson: json("tagsJson").$type<string[]>(),
  visibility: mysqlEnum("visibility", ["admin_office", "technician", "ai_only"]).default("admin_office").notNull(),
  siteId: int("siteId"),
  customerOrgId: int("customerOrgId"),
  sourceType: varchar("sourceType", { length: 50 }).default("manual").notNull(),
  sourceFileId: int("sourceFileId"),
  sourceDocumentId: int("sourceDocumentId"),
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
  // Extended for building quotes
  type?: "service" | "labour";
  hours?: number;
  rate?: number;
  lineNotes?: string;
};

export type BuildingQuoteInfo = {
  city?: string;
  backflowFeeCity?: string;
  buildingId?: string;
  buildingName?: string;
  address?: string;
};

export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  siteId: int("siteId").notNull(),
  customerOrgId: int("customerOrgId").notNull(),
  companyId: int("companyId").notNull(),
  lineItems: json("lineItems").$type<QuoteLineItem[]>().notNull(),
  status: mysqlEnum("status", ["draft", "ready_to_send", "sent", "viewed", "partially_approved", "approved", "accepted", "declined", "expired", "converted_to_approved_work", "cancelled"]).default("draft").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  // S3 URL for the generated PDF (set when the quote is sent)
  pdfUrl: text("pdfUrl"),
  // Opaque token for the customer accept link (set when the quote is sent)
  acceptToken: varchar("acceptToken", { length: 64 }),
  // Token validity window — null means no expiry (legacy rows); new sends always set this.
  acceptTokenExpiresAt: timestamp("acceptTokenExpiresAt"),
  sentAt: timestamp("sentAt"),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // Building quote extensions
  quoteType: varchar("quoteType", { length: 20 }).default("deficiency"),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  discountReason: varchar("discountReason", { length: 500 }),
  buildingInfo: json("buildingInfo").$type<BuildingQuoteInfo>(),
  // Repair quote extensions
  quoteNumber: varchar("quoteNumber", { length: 50 }),
  techLabourRate: decimal("techLabourRate", { precision: 8, scale: 2 }),
  fitterLabourRate: decimal("fitterLabourRate", { precision: 8, scale: 2 }),
  fuelCharge: decimal("fuelCharge", { precision: 8, scale: 2 }),
  backflowReportFee: decimal("backflowReportFee", { precision: 8, scale: 2 }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  gst: decimal("gst", { precision: 10, scale: 2 }),
  pst: decimal("pst", { precision: 10, scale: 2 }),
  validUntil: date("validUntil"),
  approvedAt: timestamp("approvedAt"),
  declinedAt: timestamp("declinedAt"),
  viewedAt: timestamp("viewedAt"),
  approvedByName: varchar("approvedByName", { length: 255 }),
  approvedByEmail: varchar("approvedByEmail", { length: 320 }),
  approvalSource: mysqlEnum("approvalSource", ["email", "phone", "signed_pdf", "in_person", "portal_later", "internal_entry"]),
  createdById: int("createdById"),
  finalizedAt: timestamp("finalizedAt"),
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
  // Fields seeded from service tracking spreadsheet (FILE_MONTHLY_SERVICE_LIST.xlsx)
  hoursRequired: decimal("hoursRequired", { precision: 5, scale: 2 }),
  techsRequired: int("techsRequired"),
  stampsRequired: varchar("stampsRequired", { length: 100 }),
  hasContractor: boolean("hasContractor"),
  hasKeys: boolean("hasKeys"),
  lastCompleted: varchar("lastCompleted", { length: 50 }),
  agreementSigned: boolean("agreementSigned"),
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

// v2 structured finding (used by runReportQAReview)
export type AiReviewFinding = {
  severity: "info" | "warning" | "blocker";
  category: "completion" | "deficiency" | "report" | "compliance" | "other";
  issue: string;
};

export const aiReviews = mysqlTable("ai_reviews", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  issues: json("issues").$type<AiReviewIssue[]>().notNull(),
  modelUsed: varchar("modelUsed", { length: 64 }).notNull(),
  reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
  overrides: json("overrides").$type<AiReviewOverride[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // v2 fields (migration 0051)
  companyId: int("companyId"),
  reviewType: varchar("reviewType", { length: 50 }).default("pre_publish").notNull(),
  status: varchar("status", { length: 50 }).default("completed").notNull(),
  summary: text("summary"),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).default("low"),
  suggestedQaNote: text("suggestedQaNote"),
  findingsJson: json("findingsJson").$type<AiReviewFinding[]>(),
  suggestedActions: json("suggestedActions").$type<string[]>(),
  createdById: int("createdById"),
}, (table) => ({
  jobIdIdx: index("ai_reviews_jobId_idx").on(table.jobId),
}));

export type AiReview = typeof aiReviews.$inferSelect;

// ============================================
// PARTS CATALOG
// Pricing catalog for fire protection parts / products.
// ============================================

export const partsCatalog = mysqlTable("parts_catalog", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull().default("0"),
  defaultLabourHours: decimal("defaultLabourHours", { precision: 5, scale: 2 }).default("0"),
  taxableGst: tinyint("taxableGst").default(1).notNull(),
  taxablePst: tinyint("taxablePst").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  description: text("description"),
  sourceWorkbook: varchar("sourceWorkbook", { length: 255 }),
  sourceSheet: varchar("sourceSheet", { length: 100 }),
  sourceRow: int("sourceRow"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("parts_catalog_companyId_idx").on(table.companyId),
  uniqueCatProduct: uniqueIndex("parts_catalog_unique_cat_product").on(table.companyId, table.category, table.productName),
}));

export type PartsCatalogItem = typeof partsCatalog.$inferSelect;
export type InsertPartsCatalogItem = typeof partsCatalog.$inferInsert;

// ============================================
// REPAIR QUOTE ITEMS
// Normalized line items for repair quotes (quoteType='repair').
// Each row represents one deficiency repair with parts + labour breakdown.
// ============================================

export const repairQuoteItems = mysqlTable("repair_quote_items", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  deficiencyId: int("deficiencyId"),
  description: varchar("description", { length: 500 }).notNull(),
  repairNotes: text("repairNotes"),
  systemType: mysqlEnum("systemType", ["FIRE_ALARM", "SMOKE_ALARM", "FIRE_EXTINGUISHER", "EMERGENCY_LIGHTING", "SPRINKLER", "BACKFLOW", "OTHER"]),
  location: varchar("location", { length: 255 }),
  quantity: int("quantity").notNull().default(1),
  // Part snapshot — copied from parts_catalog at quote time; price never recalculates from live catalog
  partId: int("partId"),
  partDescription: varchar("partDescription", { length: 255 }),
  partUnitPrice: decimal("partUnitPrice", { precision: 10, scale: 2 }).default("0"),
  partTotal: decimal("partTotal", { precision: 10, scale: 2 }).default("0"),
  // Labour
  techHours: decimal("techHours", { precision: 6, scale: 2 }).default("0"),
  fitterHours: decimal("fitterHours", { precision: 6, scale: 2 }).default("0"),
  techLabourRate: decimal("techLabourRate", { precision: 8, scale: 2 }).default("0"),
  fitterLabourRate: decimal("fitterLabourRate", { precision: 8, scale: 2 }).default("0"),
  labourTotal: decimal("labourTotal", { precision: 10, scale: 2 }).default("0"),
  // Fees
  fuelCharge: decimal("fuelCharge", { precision: 8, scale: 2 }).default("0"),
  backflowReportFee: decimal("backflowReportFee", { precision: 8, scale: 2 }).default("0"),
  // Tax (computed at save time, GST 5% / PST 7%)
  gst: decimal("gst", { precision: 10, scale: 2 }).default("0"),
  pst: decimal("pst", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  sortOrder: int("sortOrder").default(0),
  approvalStatus: mysqlEnum("approvalStatus", ["pending", "approved", "declined", "needs_review", "converted_to_approved_work"]).default("pending").notNull(),
  customerNotes: text("customerNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  quoteIdIdx: index("repair_quote_items_quoteId_idx").on(table.quoteId),
}));

export type RepairQuoteItem = typeof repairQuoteItems.$inferSelect;
export type InsertRepairQuoteItem = typeof repairQuoteItems.$inferInsert;

// ============================================
// WORK ORDERS
// Field-execution record tied 1-to-1 with a job.
// Created automatically when a job is created.
// ============================================

export type WorkOrderMaterial = {
  description: string;
  qty: number;
  unitCost: number;
};

export const workOrders = mysqlTable("work_orders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  siteId: int("siteId").notNull(),
  customerOrgId: int("customerOrgId").notNull(),
  jobId: int("jobId").notNull(),
  quoteId: int("quoteId"),
  assignedTechnicianIds: json("assignedTechnicianIds").$type<number[]>().notNull().default([]),
  workOrderNumber: varchar("workOrderNumber", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  workType: mysqlEnum("workType", ["inspection", "repair", "service_call", "maintenance", "emergency"]).notNull().default("inspection"),
  status: mysqlEnum("status", ["pending", "scheduled", "in_progress", "completed", "cancelled"]).notNull().default("pending"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).notNull().default("medium"),
  scheduledDate: timestamp("scheduledDate"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  estimatedHours: decimal("estimatedHours", { precision: 5, scale: 2 }),
  actualHours: decimal("actualHours", { precision: 5, scale: 2 }),
  materialsUsed: json("materialsUsed").$type<WorkOrderMaterial[]>(),
  techNotes: text("techNotes"),
  officeNotes: text("officeNotes"),
  completionSummary: text("completionSummary"),
  lineItems: json("lineItems").$type<QuoteLineItem[]>(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  finalizedAt: timestamp("finalizedAt"),
  finalizedById: int("finalizedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  jobIdIdx: index("work_orders_jobId_idx").on(table.jobId),
  companyIdIdx: index("work_orders_companyId_idx").on(table.companyId),
}));

export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = typeof workOrders.$inferInsert;
export type InsertAiReview = typeof aiReviews.$inferInsert;

// ============================================
// APPROVED WORK
// Tracks authorized work from approval through scheduling, completion,
// and close-out. Independent of the Work Orders module — can link to
// work orders, jobs, quotes, deficiencies, sites, and customers, but
// is not derived from or dependent on them.
// ============================================

export const APPROVED_WORK_STATUSES = [
  "approved",
  "ready_to_schedule",
  "scheduled",
  "assigned",
  "in_progress",
  "parts_required",
  "awaiting_parts",
  "parts_ordered",
  "parts_received",
  "completed",
  "report_pending",
  "invoiced",
  "closed",
  "cancelled",
] as const;

export type ApprovedWorkStatus = (typeof APPROVED_WORK_STATUSES)[number];

export const approvedWork = mysqlTable("approved_work", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  customerOrgId: int("customerOrgId"),
  siteId: int("siteId"),
  jobId: int("jobId"),
  deficiencyId: int("deficiencyId"),
  quoteId: int("quoteId"),
  quoteItemId: int("quoteItemId"),
  workOrderId: int("workOrderId"),
  type: mysqlEnum("type", ["job_order", "repair_order"]).notNull(),
  status: mysqlEnum("status", [
    "approved", "ready_to_schedule", "scheduled", "assigned", "in_progress",
    "parts_required", "awaiting_parts", "parts_ordered", "parts_received",
    "completed", "report_pending", "invoiced", "closed", "cancelled",
  ]).notNull().default("approved"),
  approvedScope: text("approvedScope"),
  approvedAmount: decimal("approvedAmount", { precision: 10, scale: 2 }),
  approvedAt: timestamp("approvedAt"),
  approvedByName: varchar("approvedByName", { length: 255 }),
  approvedByEmail: varchar("approvedByEmail", { length: 320 }),
  approvalSource: mysqlEnum("approvalSource", [
    "email", "phone", "signed_pdf", "in_person", "portal", "internal",
  ]),
  assignedTechnicianIds: json("assignedTechnicianIds").$type<number[]>().default([]),
  scheduledDate: timestamp("scheduledDate"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  closedAt: timestamp("closedAt"),
  partsStatus: varchar("partsStatus", { length: 100 }),
  invoiceNumber: varchar("invoiceNumber", { length: 100 }),
  invoicedAt: timestamp("invoicedAt"),
  invoiceStatus: varchar("invoiceStatus", { length: 100 }),
  officeNotes: text("officeNotes"),
  technicianNotes: text("technicianNotes"),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("approved_work_companyId_idx").on(table.companyId),
  siteIdIdx: index("approved_work_siteId_idx").on(table.siteId),
  statusIdx: index("approved_work_status_idx").on(table.status),
}));

export type ApprovedWork = typeof approvedWork.$inferSelect;
export type InsertApprovedWork = typeof approvedWork.$inferInsert;

// ============================================
// INVOICES
// ============================================
export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "approved",
  "paid",
  "partial",
  "overdue",
  "void",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull(),
  customerOrgId: int("customerOrgId"),
  siteId: int("siteId"),
  jobId: int("jobId"),
  approvedWorkId: int("approvedWorkId"),
  workOrderId: int("workOrderId"),
  quoteId: int("quoteId"),
  status: mysqlEnum("status", [...INVOICE_STATUSES]).notNull().default("draft"),
  billToName: varchar("billToName", { length: 255 }),
  billToAddress: text("billToAddress"),
  billToCity: varchar("billToCity", { length: 100 }),
  billToState: varchar("billToState", { length: 100 }),
  billToPostalCode: varchar("billToPostalCode", { length: 20 }),
  billToEmail: varchar("billToEmail", { length: 320 }),
  invoiceDate: timestamp("invoiceDate"),
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  sentAt: timestamp("sentAt"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  taxRate: decimal("taxRate", { precision: 5, scale: 4 }).default("0"),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  amountPaid: decimal("amountPaid", { precision: 10, scale: 2 }).default("0"),
  balanceDue: decimal("balanceDue", { precision: 10, scale: 2 }).default("0"),
  sageCustomerCode: varchar("sageCustomerCode", { length: 50 }),
  sageGlCode: varchar("sageGlCode", { length: 50 }),
  sageDepartment: varchar("sageDepartment", { length: 50 }),
  sageExportedAt: timestamp("sageExportedAt"),
  sageExportStatus: mysqlEnum("sageExportStatus", ["pending", "exported", "error"]).default("pending"),
  internalNotes: text("internalNotes"),
  clientNotes: text("clientNotes"),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("invoices_companyId_idx").on(table.companyId),
  statusIdx: index("invoices_status_idx").on(table.status),
  customerOrgIdIdx: index("invoices_customerOrgId_idx").on(table.customerOrgId),
}));

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

export const invoiceLineItems = mysqlTable("invoice_line_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  sortOrder: int("sortOrder").default(0),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1"),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  taxable: boolean("taxable").default(true),
  sageGlCode: varchar("sageGlCode", { length: 50 }),
  sageDepartment: varchar("sageDepartment", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  invoiceIdIdx: index("invoice_line_items_invoiceId_idx").on(table.invoiceId),
}));

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

// ============================================
// SITE WORK SITE INFO
// Detailed operational info per site — sourced from the
// "Work Site Info" tab of the inspection workbook.
// One row per site (upserted).
// ============================================
export const siteWorkSiteInfo = mysqlTable("site_work_site_info", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  siteId: int("siteId").notNull(),
  customerOrgId: int("customerOrgId"),
  // Contacts
  siteContactName: varchar("siteContactName", { length: 255 }),
  siteContactPhone: varchar("siteContactPhone", { length: 50 }),
  siteContactEmail: varchar("siteContactEmail", { length: 320 }),
  propertyManagerName: varchar("propertyManagerName", { length: 255 }),
  propertyManagerPhone: varchar("propertyManagerPhone", { length: 50 }),
  propertyManagerEmail: varchar("propertyManagerEmail", { length: 320 }),
  // Access
  accessNotes: text("accessNotes"),
  keyLocation: text("keyLocation"),
  keyNumber: varchar("keyNumber", { length: 50 }),
  lockboxCode: varchar("lockboxCode", { length: 50 }),
  parkingNotes: text("parkingNotes"),
  serviceEntranceNotes: text("serviceEntranceNotes"),
  // Fire alarm panel
  fireAlarmPanelMake: varchar("fireAlarmPanelMake", { length: 100 }),
  fireAlarmPanelModel: varchar("fireAlarmPanelModel", { length: 100 }),
  fireAlarmPanelLocation: text("fireAlarmPanelLocation"),
  annunciatorLocation: text("annunciatorLocation"),
  // Monitoring
  monitoringCompany: varchar("monitoringCompany", { length: 255 }),
  monitoringPhone: varchar("monitoringPhone", { length: 50 }),
  monitoringAccount: varchar("monitoringAccount", { length: 100 }),
  // Other systems
  sprinklerNotes: text("sprinklerNotes"),
  backflowNotes: text("backflowNotes"),
  emergencyLightingNotes: text("emergencyLightingNotes"),
  fireExtinguisherNotes: text("fireExtinguisherNotes"),
  // Notes and workbook provenance
  generalNotes: text("generalNotes"),
  lastImportedFromWorkbook: timestamp("lastImportedFromWorkbook"),
  sourceWorkbookName: varchar("sourceWorkbookName", { length: 255 }),
  sourceSheetName: varchar("sourceSheetName", { length: 100 }),
  sourceUpdatedAt: timestamp("sourceUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  siteIdUnique: unique("site_work_site_info_siteId_unique").on(table.siteId),
  companyIdIdx: index("site_work_site_info_companyId_idx").on(table.companyId),
}));

export type SiteWorkSiteInfo = typeof siteWorkSiteInfo.$inferSelect;
export type InsertSiteWorkSiteInfo = typeof siteWorkSiteInfo.$inferInsert;

// ============================================
// COMPANY SETTINGS (Business rules / defaults per company)
// ============================================
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  // Company profile / branding
  companyDisplayName: varchar("companyDisplayName", { length: 255 }),
  logoUrl: varchar("logoUrl", { length: 500 }),
  // Tax rates
  gstRate: decimal("gstRate", { precision: 5, scale: 4 }).notNull().default("0.0500"),
  pstRate: decimal("pstRate", { precision: 5, scale: 4 }).notNull().default("0.0700"),
  // Labour defaults
  technicianLabourRate: decimal("technicianLabourRate", { precision: 8, scale: 2 }).notNull().default("75.00"),
  fitterLabourRate: decimal("fitterLabourRate", { precision: 8, scale: 2 }).notNull().default("65.00"),
  defaultFuelCharge: decimal("defaultFuelCharge", { precision: 8, scale: 2 }).notNull().default("0.00"),
  quoteValidityDays: int("quoteValidityDays").notNull().default(30),
  defaultQuoteTerms: text("defaultQuoteTerms"),
  // Invoice defaults
  invoiceDueDays: int("invoiceDueDays").notNull().default(30),
  defaultInvoiceTerms: text("defaultInvoiceTerms"),
  invoiceNumberPrefix: varchar("invoiceNumberPrefix", { length: 20 }).notNull().default("INV"),
  // Sage defaults
  repairQuoteNumberPrefix: varchar("repairQuoteNumberPrefix", { length: 20 }).notNull().default("RQ"),
  sageDefaultGlCode: varchar("sageDefaultGlCode", { length: 50 }),
  sageDefaultDepartment: varchar("sageDefaultDepartment", { length: 50 }),
  sageCustomerCodeDefault: varchar("sageCustomerCodeDefault", { length: 50 }),
  sageTaxCodeDefault: varchar("sageTaxCodeDefault", { length: 50 }),
  // Reports
  reportFooterText: text("reportFooterText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdUnique: unique("company_settings_companyId_unique").on(table.companyId),
}));

export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = typeof companySettings.$inferInsert;

// ============================================
// ACTIVITY EVENTS (Lightweight audit trail)
// ============================================
export const activityEvents = mysqlTable("activity_events", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  actorUserId: int("actorUserId"),
  actorName: varchar("actorName", { length: 255 }),
  actorRole: varchar("actorRole", { length: 64 }),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: int("entityId").notNull(),
  relatedEntityType: varchar("relatedEntityType", { length: 64 }),
  relatedEntityId: int("relatedEntityId"),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  companyIdIdx: index("activity_events_companyId_idx").on(table.companyId),
  entityIdx: index("activity_events_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("activity_events_createdAt_idx").on(table.createdAt),
}));

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = typeof activityEvents.$inferInsert;

// ============================================
// NOTIFICATIONS (In-app operational alerts)
// ============================================

export const NOTIFICATION_SEVERITIES = ["info", "warning", "urgent", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_TYPES = [
  "job_overdue",
  "job_today",
  "report_pending_review",
  "deficiency_critical",
  "approved_work_ready",
  "approved_work_awaiting_parts",
  "invoice_overdue",
  "invoice_ready_for_sage",
  "sage_export_error",
  "import_issue",
  "data_quality_issue",
  "technician_completed_job",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  userId: int("userId"),
  roleTarget: varchar("roleTarget", { length: 20 }),
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  type: varchar("type", { length: 64 }).notNull(),
  severity: mysqlEnum("severity", NOTIFICATION_SEVERITIES).notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  href: varchar("href", { length: 500 }),
  isRead: tinyint("isRead").notNull().default(0),
  readAt: timestamp("readAt"),
  isDismissed: tinyint("isDismissed").notNull().default(0),
  dismissedAt: timestamp("dismissedAt"),
  dedupeKey: varchar("dedupeKey", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  metadataJson: json("metadataJson"),
}, (table) => ({
  companyIdIdx: index("notifications_companyId_idx").on(table.companyId),
  dedupeIdx: index("notifications_dedupe_idx").on(table.companyId, table.dedupeKey),
  unreadIdx: index("notifications_unread_idx").on(table.companyId, table.isRead, table.isDismissed),
}));

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ============================================
// SERVICE AGREEMENTS
// Internal tracking of customer service contracts.
// ============================================

export const SERVICE_AGREEMENT_STATUSES = ["draft", "active", "expiring_soon", "expired", "cancelled"] as const;
export type ServiceAgreementStatus = (typeof SERVICE_AGREEMENT_STATUSES)[number];

export const SERVICE_AGREEMENT_BILLING_CYCLES = ["monthly", "quarterly", "semi_annual", "annual", "per_service", "custom"] as const;
export type ServiceAgreementBillingCycle = (typeof SERVICE_AGREEMENT_BILLING_CYCLES)[number];

export const serviceAgreements = mysqlTable("service_agreements", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  customerOrgId: int("customerOrgId").notNull(),
  agreementNumber: varchar("agreementNumber", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", SERVICE_AGREEMENT_STATUSES).default("draft").notNull(),
  startDate: date("startDate"),
  endDate: date("endDate"),
  renewalDate: date("renewalDate"),
  billingCycle: mysqlEnum("billingCycle", SERVICE_AGREEMENT_BILLING_CYCLES).default("annual"),
  billingNotes: text("billingNotes"),
  internalNotes: text("internalNotes"),
  includedServicesJson: json("includedServicesJson").$type<string[]>(),
  excludedServicesJson: json("excludedServicesJson").$type<string[]>(),
  documentUrl: varchar("documentUrl", { length: 500 }),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("service_agreements_companyId_idx").on(table.companyId),
  customerOrgIdIdx: index("service_agreements_customerOrgId_idx").on(table.customerOrgId),
  statusIdx: index("service_agreements_status_idx").on(table.status),
}));

export type ServiceAgreement = typeof serviceAgreements.$inferSelect;
export type InsertServiceAgreement = typeof serviceAgreements.$inferInsert;

export const agreementSites = mysqlTable("agreement_sites", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  agreementId: int("agreementId").notNull(),
  siteId: int("siteId").notNull(),
  includedServicesJson: json("includedServicesJson").$type<string[]>(),
  siteSpecificNotes: text("siteSpecificNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  agreementIdIdx: index("agreement_sites_agreementId_idx").on(table.agreementId),
  companyIdIdx: index("agreement_sites_companyId_idx").on(table.companyId),
  uniqueSiteAgreement: unique("agreement_sites_unique").on(table.agreementId, table.siteId),
}));

export type AgreementSite = typeof agreementSites.$inferSelect;
export type InsertAgreementSite = typeof agreementSites.$inferInsert;

// ============================================
// ASSET LIFECYCLE
// Adds lifecycle fields to devices and a standalone
// event log for manual and system lifecycle entries.
// ============================================

export const LIFECYCLE_STATUSES = [
  "active",
  "needs_service",
  "repair_required",
  "replacement_recommended",
  "replaced",
  "removed",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const ASSET_CONDITIONS = ["good", "fair", "poor", "failed", "unknown"] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const LIFECYCLE_EVENT_TYPES = [
  "installed",
  "inspected",
  "passed",
  "failed",
  "deficiency_created",
  "repaired",
  "replaced",
  "removed_from_service",
  "maintenance_completed",
  "parts_replaced",
  "recommended_replacement",
  "warranty_expired",
  "other",
] as const;
export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

export const LIFECYCLE_SOURCE_TYPES = [
  "job",
  "inspection_result",
  "deficiency",
  "repair_quote",
  "approved_work",
  "work_order",
  "manual",
] as const;
export type LifecycleSourceType = (typeof LIFECYCLE_SOURCE_TYPES)[number];

export const assetLifecycleEvents = mysqlTable("asset_lifecycle_events", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  siteId: int("siteId").notNull(),
  deviceId: int("deviceId").notNull(),
  eventType: mysqlEnum("eventType", LIFECYCLE_EVENT_TYPES).notNull(),
  eventDate: date("eventDate").notNull(),
  sourceType: mysqlEnum("sourceType", LIFECYCLE_SOURCE_TYPES).default("manual"),
  sourceId: int("sourceId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  performedById: int("performedById"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  deviceIdIdx: index("asset_lifecycle_events_deviceId_idx").on(table.deviceId),
  companyIdIdx: index("asset_lifecycle_events_companyId_idx").on(table.companyId),
  siteIdIdx: index("asset_lifecycle_events_siteId_idx").on(table.siteId),
}));

export type AssetLifecycleEvent = typeof assetLifecycleEvents.$inferSelect;
export type InsertAssetLifecycleEvent = typeof assetLifecycleEvents.$inferInsert;

// ============================================
// INVENTORY / PARTS ORDERING
// Stock tracking, parts requests, and usage
// linked to Parts Catalog, Approved Work, Work Orders, and Jobs.
// ============================================

export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  partsCatalogId: int("partsCatalogId"),
  sku: varchar("sku", { length: 100 }),
  category: varchar("category", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }).default("0"),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).default("0"),
  quantityOnHand: int("quantityOnHand").notNull().default(0),
  quantityReserved: int("quantityReserved").notNull().default(0),
  reorderPoint: int("reorderPoint").notNull().default(0),
  reorderQuantity: int("reorderQuantity").notNull().default(0),
  storageLocation: varchar("storageLocation", { length: 255 }),
  supplierName: varchar("supplierName", { length: 255 }),
  supplierPartNumber: varchar("supplierPartNumber", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("inventory_items_companyId_idx").on(table.companyId),
  categoryIdx: index("inventory_items_category_idx").on(table.companyId, table.category),
}));

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

export const PARTS_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "ordered",
  "partially_received",
  "received",
  "issued",
  "used",
  "cancelled",
] as const;
export type PartsRequestStatus = (typeof PARTS_REQUEST_STATUSES)[number];

export const PARTS_REQUEST_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type PartsRequestPriority = (typeof PARTS_REQUEST_PRIORITIES)[number];

export const partsRequests = mysqlTable("parts_requests", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  requestNumber: varchar("requestNumber", { length: 50 }).notNull(),
  status: mysqlEnum("status", PARTS_REQUEST_STATUSES).notNull().default("draft"),
  priority: mysqlEnum("priority", PARTS_REQUEST_PRIORITIES).notNull().default("medium"),
  requestedById: int("requestedById").notNull(),
  assignedToId: int("assignedToId"),
  customerOrgId: int("customerOrgId"),
  siteId: int("siteId"),
  jobId: int("jobId"),
  workOrderId: int("workOrderId"),
  approvedWorkId: int("approvedWorkId"),
  deficiencyId: int("deficiencyId"),
  notes: text("notes"),
  neededByDate: date("neededByDate"),
  submittedAt: timestamp("submittedAt"),
  approvedAt: timestamp("approvedAt"),
  approvedById: int("approvedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("parts_requests_companyId_idx").on(table.companyId),
  statusIdx: index("parts_requests_status_idx").on(table.companyId, table.status),
  approvedWorkIdIdx: index("parts_requests_approvedWorkId_idx").on(table.approvedWorkId),
  workOrderIdIdx: index("parts_requests_workOrderId_idx").on(table.workOrderId),
  jobIdIdx: index("parts_requests_jobId_idx").on(table.jobId),
}));

export type PartsRequest = typeof partsRequests.$inferSelect;
export type InsertPartsRequest = typeof partsRequests.$inferInsert;

export const PARTS_REQUEST_ITEM_STATUSES = [
  "requested",
  "approved",
  "ordered",
  "received",
  "issued",
  "used",
  "unavailable",
  "cancelled",
] as const;
export type PartsRequestItemStatus = (typeof PARTS_REQUEST_ITEM_STATUSES)[number];

export const partsRequestItems = mysqlTable("parts_request_items", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  partsRequestId: int("partsRequestId").notNull(),
  inventoryItemId: int("inventoryItemId"),
  partsCatalogId: int("partsCatalogId"),
  description: varchar("description", { length: 500 }).notNull(),
  quantityRequested: int("quantityRequested").notNull().default(1),
  quantityApproved: int("quantityApproved").notNull().default(0),
  quantityOrdered: int("quantityOrdered").notNull().default(0),
  quantityReceived: int("quantityReceived").notNull().default(0),
  quantityUsed: int("quantityUsed").notNull().default(0),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }),
  status: mysqlEnum("status", PARTS_REQUEST_ITEM_STATUSES).notNull().default("requested"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  partsRequestIdIdx: index("parts_request_items_requestId_idx").on(table.partsRequestId),
  companyIdIdx: index("parts_request_items_companyId_idx").on(table.companyId),
}));

export type PartsRequestItem = typeof partsRequestItems.$inferSelect;
export type InsertPartsRequestItem = typeof partsRequestItems.$inferInsert;

export const INVENTORY_TRANSACTION_TYPES = [
  "initial_count",
  "adjustment",
  "reserved",
  "unreserved",
  "ordered",
  "received",
  "issued",
  "used",
  "returned",
  "removed",
] as const;
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

export const inventoryTransactions = mysqlTable("inventory_transactions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  inventoryItemId: int("inventoryItemId").notNull(),
  transactionType: mysqlEnum("transactionType", INVENTORY_TRANSACTION_TYPES).notNull(),
  quantity: int("quantity").notNull(),
  sourceType: varchar("sourceType", { length: 64 }),
  sourceId: int("sourceId"),
  notes: text("notes"),
  performedById: int("performedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  inventoryItemIdIdx: index("inventory_transactions_itemId_idx").on(table.inventoryItemId),
  companyIdIdx: index("inventory_transactions_companyId_idx").on(table.companyId),
}));

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = typeof inventoryTransactions.$inferInsert;

// ─── Vendors ──────────────────────────────────────────────────────────────────

export const vendors = mysqlTable("vendors", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  website: varchar("website", { length: 500 }),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("vendors_companyId_idx").on(table.companyId),
}));

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "ready_to_order",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type PurchaseOrderPriority = (typeof PURCHASE_ORDER_PRIORITIES)[number];

export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  poNumber: varchar("poNumber", { length: 50 }).notNull(),
  vendorId: int("vendorId"),
  status: mysqlEnum("status", PURCHASE_ORDER_STATUSES).notNull().default("draft"),
  priority: mysqlEnum("priority", PURCHASE_ORDER_PRIORITIES).notNull().default("medium"),
  partsRequestId: int("partsRequestId"),
  orderDate: date("orderDate"),
  expectedDate: date("expectedDate"),
  receivedDate: date("receivedDate"),
  requestedById: int("requestedById"),
  createdById: int("createdById").notNull(),
  notes: text("notes"),
  internalNotes: text("internalNotes"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  shipping: decimal("shipping", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyIdIdx: index("purchase_orders_companyId_idx").on(table.companyId),
  statusIdx: index("purchase_orders_status_idx").on(table.companyId, table.status),
  vendorIdIdx: index("purchase_orders_vendorId_idx").on(table.vendorId),
  partsRequestIdIdx: index("purchase_orders_partsRequestId_idx").on(table.partsRequestId),
}));

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  inventoryItemId: int("inventoryItemId"),
  partsCatalogId: int("partsCatalogId"),
  partsRequestItemId: int("partsRequestItemId"),
  description: varchar("description", { length: 500 }).notNull(),
  quantityOrdered: int("quantityOrdered").notNull().default(1),
  quantityReceived: int("quantityReceived").notNull().default(0),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }).default("0"),
  lineTotal: decimal("lineTotal", { precision: 10, scale: 2 }).default("0"),
  supplierPartNumber: varchar("supplierPartNumber", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  purchaseOrderIdIdx: index("po_items_purchaseOrderId_idx").on(table.purchaseOrderId),
  companyIdIdx: index("po_items_companyId_idx").on(table.companyId),
}));

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;
