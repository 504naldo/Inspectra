/**
 * scheduler.ts
 *
 * Server-side background jobs. Called once on startup and then on a 24-hour interval.
 * Each task is fully idempotent — safe to run any number of times.
 */

import * as db from "./db.js";

const LEAD_DAYS = 14; // Create pending jobs this many days before nextDueAt

function toYYYYMM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function jobTypeFor(frequency: string): "annual" | "semi_annual" | "quarterly" | "monthly" {
  const map: Record<string, "annual" | "semi_annual" | "quarterly" | "monthly"> = {
    annual: "annual",
    semi_annual: "semi_annual",
    quarterly: "quarterly",
    monthly: "monthly",
  };
  return map[frequency] ?? "annual";
}

/**
 * Auto-schedule recurring inspections.
 * For each active service schedule whose nextDueAt falls within the next LEAD_DAYS,
 * create a pending job (unassigned) if none already exists for that period.
 * Also creates an in-app notification targeted at office/admin users.
 */
export async function runAutoScheduler(): Promise<void> {
  try {
    const allCompanies = await db.getAllCompanies();
    for (const company of allCompanies) {
      await processCompany(company.id);
    }
  } catch (err) {
    console.error("[scheduler] Auto-scheduler error:", err);
  }
}

async function processCompany(companyId: number): Promise<void> {
  const dueSoon = await db.getServiceSchedulesDueSoon(companyId, LEAD_DAYS);

  for (const sched of dueSoon) {
    try {
      const targetDate = sched.nextDueAt ? new Date(sched.nextDueAt) : new Date();
      const trackingMonth = toYYYYMM(targetDate);

      // Deduplicate: skip if a tracking row already exists for this schedule+month
      const existing = await db.getMonthlyTrackingByScheduleAndMonth(sched.id, trackingMonth);
      if (existing) continue;

      const site = await db.getSiteById(sched.siteId);
      if (!site) continue;

      const jobNumber = `JOB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      const jobTitle = `${sched.serviceType} — ${site.name}`;

      // Create the tracking row first
      const trackingRow = await db.createMonthlyTracking({
        serviceScheduleId: sched.id,
        siteId: sched.siteId,
        buildingId: sched.buildingId ?? site.buildingId ?? undefined,
        customerOrgId: sched.customerOrgId,
        companyId: sched.companyId,
        trackingMonth,
        serviceType: sched.serviceType,
        status: "not_scheduled",
        reportStatus: "none",
        notes: "Auto-created by scheduler — assign a technician to confirm.",
      });

      // Create the pending job
      const job = await db.createJob({
        companyId: sched.companyId,
        siteId: sched.siteId,
        customerOrgId: sched.customerOrgId,
        jobNumber,
        title: jobTitle,
        jobType: jobTypeFor(sched.frequency),
        status: "pending",
        priority: "medium",
        scheduledDate: targetDate,
      });

      // Link job to tracking row
      await db.updateMonthlyTracking(trackingRow.id, {
        linkedJobId: job.id,
        scheduledDate: targetDate,
        status: "scheduled",
      });

      // In-app notification for office users
      const dedupeKey = `auto-schedule-${sched.id}-${trackingMonth}`;
      const alreadyNotified = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!alreadyNotified) {
        await db.createNotification({
          companyId,
          roleTarget: "office",
          type: "auto_scheduled_job",
          severity: "info",
          title: `Inspection auto-scheduled: ${site.name}`,
          message: `${sched.serviceType} is due ${targetDate.toLocaleDateString("en-CA")}. Job ${jobNumber} created — assign a technician.`,
          href: `/admin/dispatch`,
          dedupeKey,
        });
      }

      console.log(`[scheduler] Auto-created job ${jobNumber} for schedule ${sched.id} (${site.name})`);
    } catch (err) {
      console.warn(`[scheduler] Failed to process schedule ${sched.id}:`, err);
    }
  }
}
