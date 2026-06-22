/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// Custom types for Fire Inspect Pro

export type UserRole = 'admin' | 'office' | 'technician' | 'customer';

export type JobStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type JobType = 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'service_call' | 'repair';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type InspectionResultType = 'pass' | 'fail' | 'na' | 'not_tested';

export type DeficiencyStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'deferred';

export type DeficiencySeverity = 'critical' | 'major' | 'minor' | 'observation';

export type RepairStatus = 'pending' | 'in_progress' | 'completed' | 'parts_ordered';

export type ReportStatus = 'draft' | 'generated' | 'sent' | 'approved';

export type EntityType = 'inspection_result' | 'deficiency' | 'repair' | 'device' | 'job';

// Offline sync types
export interface OfflineInspectionResult {
  localId: string;
  jobId: number;
  deviceId: number;
  result: InspectionResultType;
  notes?: string;
  testedAt: Date;
  synced: boolean;
}

export interface OfflineDeficiency {
  localId: string;
  jobId: number;
  deviceId?: number;
  title: string;
  severity: DeficiencySeverity;
  description?: string;
  observedIssue?: string;
  correctiveAction?: string;
  customerExplanation?: string;
  codeReference?: string;
  systemCategory?: 'FIRE_ALARM' | 'FIRE_EXTINGUISHER' | 'EMERGENCY_LIGHTING' | 'SPRINKLER' | 'SMOKE_ALARM';
  estimatedCost?: number;
  synced: boolean;
}

export interface OfflineChecklistResponse {
  localId: string;
  jobId: number;
  sectionNumber: string;
  itemId: string;
  status: 'PASS' | 'DEFICIENT' | 'NA';
  comment?: string;
  synced: boolean;
}

export interface OfflineTemplateResponse {
  localId: string;
  jobId: number;
  templateId: number;
  sectionId: number;
  itemId: number;
  responseValue?: string | null;
  responseText?: string | null;
  notes?: string | null;
  deficiencyId?: number | null;
  synced: boolean;
}

export interface SyncStatus {
  pendingResults: number;
  pendingDeficiencies: number;
  pendingChecklistResponses: number;
  pendingTemplateResponses: number;
  pendingAttachments: number;
  lastSyncAt?: Date;
  isOnline: boolean;
}

// AI response types
export interface DeficiencyNarrative {
  description: string;
  correctiveAction: string;
  customerExplanation: string;
  isDraft: boolean;
}

export interface RepairRecommendations {
  troubleshootingSteps: string[];
  partsAndTools: string[];
  suggestedPhotos: string[];
  repairChecklist: string[];
}

export interface ReportSummary {
  executiveSummary: string[];
  systemStatus: string;
  priorityItems: string[];
  nextSteps: string[];
  stats: {
    total: number;
    pass: number;
    fail: number;
    na: number;
    notTested: number;
  };
  deficiencyCount: number;
}

export interface QACheckResult {
  jobId: number;
  siteName?: string;
  totalDevices: number;
  testedDevices: number;
  deficienciesCount: number;
  issues: string[];
  passedQA: boolean;
}
