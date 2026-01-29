/**
 * Job Summary Data Fetcher
 * 
 * Fetches all data needed to calculate inspection summary
 * Shared between UI and PDF generation
 */

import * as db from './db';
import { calculatePDFSummary, type PDFSummary } from './pdfSummaryCalculator';

export interface JobSummaryData {
  jobId: number;
  siteId: number;
  siteName: string;
  siteAddress: string;
  jobNumber: string;
  inspectionDate: Date | null;
  technicianName: string | null;
  summary: PDFSummary;
  completionStatus: {
    sectionsCompleted: number;
    totalSections: number;
    percentComplete: number;
  };
}

/**
 * Get comprehensive job summary data for UI and PDF
 */
export async function getJobSummary(jobId: number): Promise<JobSummaryData> {
  // Fetch job details
  const job = await db.getJobById(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Fetch site details
  const site = await db.getSiteById(job.siteId);
  if (!site) {
    throw new Error(`Site ${job.siteId} not found`);
  }

  // Fetch technician
  const technician = job.assignedTechnicianId 
    ? await db.getUserById(job.assignedTechnicianId)
    : null;

  // Fetch device summaries
  const deviceSummaries = await db.getDeviceSummariesByJob(jobId);

  // Fetch inspection results
  const rawResults = await db.getInspectionResultsByJob(jobId);
  const inspectionResults = rawResults.map(r => ({
    ...r,
    deviceType: r.deviceType || 'Unknown',
  }));

  // Fetch deficiencies
  const deficiencies = await db.getDeficienciesByJob(jobId);

  // Calculate PDF summary (system coverage, totals, deficiency breakdown, cost)
  const summary = calculatePDFSummary(deviceSummaries, inspectionResults, deficiencies);

  // Calculate completion status
  const totalSections = 5; // Fire Alarm, Sprinkler, Devices, Smoke Alarms, Emergency Lights
  let sectionsCompleted = 0;

  if (summary.systemCoverage.fireAlarmSystem && summary.inspectionTotals.fireAlarmDevices > 0) {
    sectionsCompleted++;
  }
  if (summary.systemCoverage.sprinklerITM && summary.inspectionTotals.sprinklerComponents > 0) {
    sectionsCompleted++;
  }
  if (summary.systemCoverage.smokeAlarms && summary.inspectionTotals.smokeAlarms > 0) {
    sectionsCompleted++;
  }
  if (summary.systemCoverage.fireExtinguishers && summary.inspectionTotals.fireExtinguishers > 0) {
    sectionsCompleted++;
  }
  if (summary.systemCoverage.emergencyLighting && summary.inspectionTotals.emergencyLights > 0) {
    sectionsCompleted++;
  }

  const percentComplete = totalSections > 0 ? Math.round((sectionsCompleted / totalSections) * 100) : 0;

  return {
    jobId: job.id,
    siteId: job.siteId,
    siteName: site.name,
    siteAddress: site.address || '',
    jobNumber: job.jobNumber,
    inspectionDate: job.scheduledDate,
    technicianName: technician?.name || null,
    summary,
    completionStatus: {
      sectionsCompleted,
      totalSections,
      percentComplete,
    },
  };
}
