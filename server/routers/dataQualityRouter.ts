/**
 * dataQualityRouter.ts
 *
 * Read-only admin tool for finding and fixing bad or incomplete operational data.
 * All queries are scoped to ctx.user.companyId — never trusts client input for companyId.
 */

import { z } from "zod";
import { router, officeProcedure } from "../_core/trpc.js";
import { getDb } from "../db.js";
import {
  eq, and, or, isNull, sql, inArray, lt,
} from "drizzle-orm";
import {
  sites, customerOrgs, siteWorkSiteInfo,
  monthlyServiceTracking, serviceSchedules,
  devices, deficiencies, jobs,
  approvedWork, invoices, invoiceLineItems,
  customerContacts,
} from "../../drizzle/schema.js";

const ISSUE_LIMIT = 50; // max rows per issue category

// ── Return types ──────────────────────────────────────────────────────────────

type SiteRow    = { id: number; name: string };
type OrgRow     = { id: number; name: string };
type WsiRow     = { id: number; siteId: number; siteName: string };
type TrackRow   = { id: number; trackingMonth: string; serviceType: string; buildingId: string | null };
type DeviceRow  = { id: number; deviceType: string; siteId: number };
type DefRow     = { id: number; title: string; severity: string; jobId: number; daysOpen: number };
type AwRow      = { id: number; approvedScope: string | null };
type InvRow     = { id: number; invoiceNumber: string; total: string | null };
type ContactRow = { id: number; name: string; role: string };
type DupEmailRow = { email: string; count: number; names: string };

export type DataQualitySummary = {
  counts: { critical: number; warning: number; info: number; total: number };
  sites: {
    missingBuildingId:   SiteRow[];
    missingFileNumber:   SiteRow[];
    missingAddress:      SiteRow[];
    missingCity:         SiteRow[];
    missingContactInfo:  SiteRow[];
    duplicateBuildingIds: { buildingId: string; count: number; names: string }[];
    duplicateFileNumbers: { fileNumber: string; count: number; names: string }[];
  };
  customerOrgs: {
    missingContactEmail: OrgRow[];
    missingContactPhone: OrgRow[];
  };
  workSiteInfo: {
    sitesMissingWsi:       SiteRow[];
    missingAccessNotes:    WsiRow[];
    missingPanelLocation:  WsiRow[];
    missingMonitoring:     WsiRow[];
  };
  contacts: {
    orgsMissingPrimaryContact:       OrgRow[];
    sitesMissingSiteAccessContact:   SiteRow[];
    inactiveButFlagged:              ContactRow[];
    orgsMissingReportRecipient:      OrgRow[];
    orgsMissingBillingContact:       OrgRow[];
    orgsMissingQuoteApprover:        OrgRow[];
    duplicateContactEmails:          DupEmailRow[];
  };
  schedule: {
    overdueWithoutTech: TrackRow[];
  };
  devicesAndDeficiencies: {
    devicesWithoutLocation: DeviceRow[];
    openDefs30:  number;
    openDefs60:  number;
    openDefs90:  number;
    oldestOpenDefs: DefRow[];
  };
  approvedWorkIssues: {
    missingSite:          AwRow[];
    missingCustomer:      AwRow[];
    completedNotInvoiced: AwRow[];
  };
  invoiceIssues: {
    missingCustomer:  InvRow[];
    missingLineItems: InvRow[];
    readyForSage:     InvRow[];
    sageErrors:       InvRow[];
  };
};

// ── Router ────────────────────────────────────────────────────────────────────

export const dataQualityRouter = router({
  getSummary: officeProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }): Promise<DataQualitySummary> => {
      const companyId = ctx.user.companyId!;
      const db = await getDb();

      if (!db) {
        return emptyResult();
      }

      // ── 1. Sites ──────────────────────────────────────────────────────────

      const allSites = await db
        .select({ id: sites.id, name: sites.name, buildingId: sites.buildingId,
                  fileNumber: sites.fileNumber, address: sites.address,
                  city: sites.city, contactName: sites.contactName, contactPhone: sites.contactPhone })
        .from(sites)
        .where(eq(sites.companyId, companyId));

      const missingBuildingId = allSites
        .filter(s => !s.buildingId?.trim())
        .slice(0, ISSUE_LIMIT)
        .map(s => ({ id: s.id, name: s.name }));

      const missingFileNumber = allSites
        .filter(s => !s.fileNumber?.trim())
        .slice(0, ISSUE_LIMIT)
        .map(s => ({ id: s.id, name: s.name }));

      const missingAddress = allSites
        .filter(s => !s.address?.trim())
        .slice(0, ISSUE_LIMIT)
        .map(s => ({ id: s.id, name: s.name }));

      const missingCity = allSites
        .filter(s => !s.city?.trim())
        .slice(0, ISSUE_LIMIT)
        .map(s => ({ id: s.id, name: s.name }));

      const missingContactInfo = allSites
        .filter(s => !s.contactName?.trim() && !s.contactPhone?.trim())
        .slice(0, ISSUE_LIMIT)
        .map(s => ({ id: s.id, name: s.name }));

      // Duplicate buildingId
      const bldgMap = new Map<string, { count: number; names: string[] }>();
      for (const s of allSites) {
        const bld = s.buildingId?.trim();
        if (!bld) continue;
        const entry = bldgMap.get(bld) ?? { count: 0, names: [] };
        entry.count++;
        entry.names.push(s.name);
        bldgMap.set(bld, entry);
      }
      const duplicateBuildingIds = Array.from(bldgMap.entries())
        .filter(([, v]) => v.count > 1)
        .map(([buildingId, v]) => ({ buildingId, count: v.count, names: v.names.join(", ") }))
        .slice(0, ISSUE_LIMIT);

      // Duplicate fileNumber
      const fileMap = new Map<string, { count: number; names: string[] }>();
      for (const s of allSites) {
        const fn = s.fileNumber?.trim();
        if (!fn) continue;
        const entry = fileMap.get(fn) ?? { count: 0, names: [] };
        entry.count++;
        entry.names.push(s.name);
        fileMap.set(fn, entry);
      }
      const duplicateFileNumbers = Array.from(fileMap.entries())
        .filter(([, v]) => v.count > 1)
        .map(([fileNumber, v]) => ({ fileNumber, count: v.count, names: v.names.join(", ") }))
        .slice(0, ISSUE_LIMIT);

      // ── 2. Customer Orgs ──────────────────────────────────────────────────

      const allOrgs = await db
        .select({ id: customerOrgs.id, name: customerOrgs.name,
                  contactEmail: customerOrgs.contactEmail, contactPhone: customerOrgs.contactPhone })
        .from(customerOrgs)
        .where(eq(customerOrgs.companyId, companyId));

      const missingContactEmail = allOrgs
        .filter(o => !o.contactEmail?.trim())
        .slice(0, ISSUE_LIMIT)
        .map(o => ({ id: o.id, name: o.name }));

      const missingContactPhone = allOrgs
        .filter(o => !o.contactPhone?.trim())
        .slice(0, ISSUE_LIMIT)
        .map(o => ({ id: o.id, name: o.name }));

      // ── 3. Work Site Info ─────────────────────────────────────────────────

      const siteIds = allSites.map(s => s.id);
      const siteNameMap = new Map(allSites.map(s => [s.id, s.name]));

      let sitesMissingWsi: SiteRow[] = [];
      let missingAccessNotes: WsiRow[] = [];
      let missingPanelLocation: WsiRow[] = [];
      let missingMonitoring: WsiRow[] = [];

      if (siteIds.length > 0) {
        const allWsi = await db
          .select({ id: siteWorkSiteInfo.id, siteId: siteWorkSiteInfo.siteId,
                    accessNotes: siteWorkSiteInfo.accessNotes,
                    fireAlarmPanelLocation: siteWorkSiteInfo.fireAlarmPanelLocation,
                    monitoringCompany: siteWorkSiteInfo.monitoringCompany })
          .from(siteWorkSiteInfo)
          .where(eq(siteWorkSiteInfo.companyId, companyId));

        const wsiSiteIds = new Set(allWsi.map(w => w.siteId));
        sitesMissingWsi = allSites
          .filter(s => !wsiSiteIds.has(s.id))
          .slice(0, ISSUE_LIMIT)
          .map(s => ({ id: s.id, name: s.name }));

        missingAccessNotes = allWsi
          .filter(w => !w.accessNotes?.trim())
          .slice(0, ISSUE_LIMIT)
          .map(w => ({ id: w.id, siteId: w.siteId, siteName: siteNameMap.get(w.siteId) ?? `Site ${w.siteId}` }));

        missingPanelLocation = allWsi
          .filter(w => !w.fireAlarmPanelLocation?.trim())
          .slice(0, ISSUE_LIMIT)
          .map(w => ({ id: w.id, siteId: w.siteId, siteName: siteNameMap.get(w.siteId) ?? `Site ${w.siteId}` }));

        missingMonitoring = allWsi
          .filter(w => !w.monitoringCompany?.trim())
          .slice(0, ISSUE_LIMIT)
          .map(w => ({ id: w.id, siteId: w.siteId, siteName: siteNameMap.get(w.siteId) ?? `Site ${w.siteId}` }));
      }

      // ── 4. Contacts ───────────────────────────────────────────────────────

      const allActiveContacts = await db
        .select({
          id: customerContacts.id,
          name: customerContacts.name,
          role: customerContacts.role,
          email: customerContacts.email,
          customerOrgId: customerContacts.customerOrgId,
          siteId: customerContacts.siteId,
          isPrimary: customerContacts.isPrimary,
          isSiteAccessContact: customerContacts.isSiteAccessContact,
          isActive: customerContacts.isActive,
          receivesReports: customerContacts.receivesReports,
          receivesQuotes: customerContacts.receivesQuotes,
          receivesInvoices: customerContacts.receivesInvoices,
          receivesServiceUpdates: customerContacts.receivesServiceUpdates,
          receivesComplianceNotices: customerContacts.receivesComplianceNotices,
        })
        .from(customerContacts)
        .where(eq(customerContacts.companyId, companyId));

      // Orgs with no active primary contact
      const orgsWithPrimary = new Set(
        allActiveContacts
          .filter(c => c.isPrimary === 1 && c.isActive === 1 && c.customerOrgId !== null)
          .map(c => c.customerOrgId!)
      );
      const orgsMissingPrimaryContact = allOrgs
        .filter(o => !orgsWithPrimary.has(o.id))
        .slice(0, ISSUE_LIMIT)
        .map(o => ({ id: o.id, name: o.name }));

      // Sites with no active site-access contact
      const sitesWithAccess = new Set(
        allActiveContacts
          .filter(c => c.isSiteAccessContact === 1 && c.isActive === 1 && c.siteId !== null)
          .map(c => c.siteId!)
      );
      const sitesMissingSiteAccessContact = allSites
        .filter(s => !sitesWithAccess.has(s.id))
        .slice(0, ISSUE_LIMIT)
        .map(s => ({ id: s.id, name: s.name }));

      // Inactive contacts still flagged as recipients
      const inactiveButFlagged = allActiveContacts
        .filter(c =>
          c.isActive === 0 && (
            c.receivesReports === 1 ||
            c.receivesQuotes === 1 ||
            c.receivesInvoices === 1 ||
            c.receivesServiceUpdates === 1 ||
            c.receivesComplianceNotices === 1
          )
        )
        .slice(0, ISSUE_LIMIT)
        .map(c => ({ id: c.id, name: c.name, role: c.role }));

      // Orgs missing a report recipient
      const orgsWithReportRecipient = new Set(
        allActiveContacts
          .filter(c => c.receivesReports === 1 && c.isActive === 1 && c.customerOrgId !== null)
          .map(c => c.customerOrgId!)
      );
      const orgsMissingReportRecipient = allOrgs
        .filter(o => !orgsWithReportRecipient.has(o.id))
        .slice(0, ISSUE_LIMIT)
        .map(o => ({ id: o.id, name: o.name }));

      // Orgs missing a billing contact
      const orgsWithBillingContact = new Set(
        allActiveContacts
          .filter(c =>
            c.isActive === 1 && c.customerOrgId !== null &&
            (c.receivesInvoices === 1 || c.role === "billing_contact")
          )
          .map(c => c.customerOrgId!)
      );
      const orgsMissingBillingContact = allOrgs
        .filter(o => !orgsWithBillingContact.has(o.id))
        .slice(0, ISSUE_LIMIT)
        .map(o => ({ id: o.id, name: o.name }));

      // Orgs missing a quote approver
      const orgsWithQuoteApprover = new Set(
        allActiveContacts
          .filter(c =>
            c.isActive === 1 && c.customerOrgId !== null &&
            (c.receivesQuotes === 1 || c.role === "quote_approver")
          )
          .map(c => c.customerOrgId!)
      );
      const orgsMissingQuoteApprover = allOrgs
        .filter(o => !orgsWithQuoteApprover.has(o.id))
        .slice(0, ISSUE_LIMIT)
        .map(o => ({ id: o.id, name: o.name }));

      // Duplicate contact emails within company
      const dupEmailMap = new Map<string, { count: number; names: string[] }>();
      for (const c of allActiveContacts) {
        if (c.isActive !== 1) continue;
        const em = c.email?.toLowerCase().trim();
        if (!em) continue;
        const entry = dupEmailMap.get(em) ?? { count: 0, names: [] };
        entry.count++;
        entry.names.push(c.name);
        dupEmailMap.set(em, entry);
      }
      const duplicateContactEmails: DupEmailRow[] = Array.from(dupEmailMap.entries())
        .filter(([, v]) => v.count > 1)
        .map(([email, v]) => ({ email, count: v.count, names: v.names.join(", ") }))
        .slice(0, ISSUE_LIMIT);

      // ── 5. Monthly Tracking / Schedule ────────────────────────────────────

      const overdueRows = await db
        .select({ id: monthlyServiceTracking.id, trackingMonth: monthlyServiceTracking.trackingMonth,
                  serviceType: monthlyServiceTracking.serviceType,
                  buildingId: monthlyServiceTracking.buildingId,
                  assignedTechnicianIds: monthlyServiceTracking.assignedTechnicianIds })
        .from(monthlyServiceTracking)
        .where(and(
          eq(monthlyServiceTracking.companyId, companyId),
          eq(monthlyServiceTracking.status, "overdue"),
        ))
        .limit(ISSUE_LIMIT);

      const overdueWithoutTech: TrackRow[] = overdueRows
        .filter(r => {
          const ids = r.assignedTechnicianIds as number[] | null;
          return !ids || ids.length === 0;
        })
        .map(r => ({ id: r.id, trackingMonth: r.trackingMonth,
                     serviceType: r.serviceType, buildingId: r.buildingId }));

      // ── 5. Devices & Deficiencies ─────────────────────────────────────────

      const devicesWithoutLocation = (await db
        .select({ id: devices.id, deviceType: devices.deviceType, siteId: devices.siteId })
        .from(devices)
        .where(and(
          eq(devices.companyId, companyId),
          eq(devices.isActive, true),
          or(isNull(devices.location), sql`${devices.location} = ''`),
        ))
        .limit(ISSUE_LIMIT));

      // Open deficiencies: join through jobs for companyId scoping
      const now = new Date();
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const openDefRows = await db
        .select({ id: deficiencies.id, title: deficiencies.title,
                  severity: deficiencies.severity, jobId: deficiencies.jobId,
                  createdAt: deficiencies.createdAt })
        .from(deficiencies)
        .innerJoin(jobs, eq(deficiencies.jobId, jobs.id))
        .where(and(
          eq(jobs.companyId, companyId),
          inArray(deficiencies.status, ["open", "in_progress"]),
          lt(deficiencies.createdAt, d30),
        ))
        .orderBy(deficiencies.createdAt)
        .limit(ISSUE_LIMIT);

      const openDefs30  = openDefRows.length;
      const openDefs60  = openDefRows.filter(d => new Date(d.createdAt) < d60).length;
      const openDefs90  = openDefRows.filter(d => new Date(d.createdAt) < d90).length;
      const oldestOpenDefs = openDefRows.slice(0, 20).map(d => ({
        id: d.id, title: d.title, severity: d.severity ?? "major", jobId: d.jobId,
        daysOpen: Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / 86_400_000),
      }));

      // ── 6. Approved Work ──────────────────────────────────────────────────

      const awMissingSite = (await db
        .select({ id: approvedWork.id, approvedScope: approvedWork.approvedScope })
        .from(approvedWork)
        .where(and(
          eq(approvedWork.companyId, companyId),
          isNull(approvedWork.siteId),
          sql`${approvedWork.status} NOT IN ('cancelled', 'closed')`,
        ))
        .limit(ISSUE_LIMIT));

      const awMissingCustomer = (await db
        .select({ id: approvedWork.id, approvedScope: approvedWork.approvedScope })
        .from(approvedWork)
        .where(and(
          eq(approvedWork.companyId, companyId),
          isNull(approvedWork.customerOrgId),
          sql`${approvedWork.status} NOT IN ('cancelled', 'closed')`,
        ))
        .limit(ISSUE_LIMIT));

      const awCompletedNotInvoiced = (await db
        .select({ id: approvedWork.id, approvedScope: approvedWork.approvedScope })
        .from(approvedWork)
        .where(and(
          eq(approvedWork.companyId, companyId),
          inArray(approvedWork.status, ["completed", "report_pending"]),
          isNull(approvedWork.invoiceNumber),
        ))
        .limit(ISSUE_LIMIT));

      // ── 7. Invoices ───────────────────────────────────────────────────────

      const allInvoices = await db
        .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber,
                  total: invoices.total, status: invoices.status,
                  customerOrgId: invoices.customerOrgId,
                  sageExportStatus: invoices.sageExportStatus })
        .from(invoices)
        .where(eq(invoices.companyId, companyId));

      const invMissingCustomer = allInvoices
        .filter(i => !i.customerOrgId && i.status !== "void")
        .slice(0, ISSUE_LIMIT)
        .map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, total: i.total }));

      // Invoices missing line items: get invoices with total = 0 and not void
      const invNoLineItems = allInvoices.filter(
        i => parseFloat(String(i.total ?? "0")) === 0 && i.status !== "void"
      );
      const invMissingLineItems = invNoLineItems
        .slice(0, ISSUE_LIMIT)
        .map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, total: i.total }));

      const invReadyForSage = allInvoices
        .filter(i => i.sageExportStatus === "pending" && !["draft", "void"].includes(i.status))
        .slice(0, ISSUE_LIMIT)
        .map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, total: i.total }));

      const invSageErrors = allInvoices
        .filter(i => i.sageExportStatus === "error")
        .slice(0, ISSUE_LIMIT)
        .map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, total: i.total }));

      // ── Severity counts ───────────────────────────────────────────────────

      const critical =
        duplicateBuildingIds.length +
        duplicateFileNumbers.length +
        awMissingSite.length +
        awMissingCustomer.length +
        invSageErrors.length +
        openDefs90;

      const warning =
        missingBuildingId.length +
        missingFileNumber.length +
        missingContactEmail.length +
        sitesMissingWsi.length +
        overdueWithoutTech.length +
        awCompletedNotInvoiced.length +
        invMissingCustomer.length +
        invReadyForSage.length +
        orgsMissingPrimaryContact.length +
        inactiveButFlagged.length +
        orgsMissingReportRecipient.length +
        orgsMissingBillingContact.length +
        duplicateContactEmails.length +
        (openDefs60 - openDefs90);

      const info =
        missingAddress.length +
        missingCity.length +
        missingContactInfo.length +
        missingContactPhone.length +
        missingAccessNotes.length +
        missingPanelLocation.length +
        missingMonitoring.length +
        devicesWithoutLocation.length +
        invMissingLineItems.length +
        sitesMissingSiteAccessContact.length +
        orgsMissingQuoteApprover.length +
        (openDefs30 - openDefs60);

      return {
        counts: { critical, warning, info, total: critical + warning + info },
        sites: {
          missingBuildingId, missingFileNumber, missingAddress, missingCity,
          missingContactInfo, duplicateBuildingIds, duplicateFileNumbers,
        },
        customerOrgs: { missingContactEmail, missingContactPhone },
        workSiteInfo: { sitesMissingWsi, missingAccessNotes, missingPanelLocation, missingMonitoring },
        contacts: {
          orgsMissingPrimaryContact, sitesMissingSiteAccessContact, inactiveButFlagged,
          orgsMissingReportRecipient, orgsMissingBillingContact, orgsMissingQuoteApprover,
          duplicateContactEmails,
        },
        schedule: { overdueWithoutTech },
        devicesAndDeficiencies: {
          devicesWithoutLocation,
          openDefs30, openDefs60, openDefs90,
          oldestOpenDefs,
        },
        approvedWorkIssues: {
          missingSite: awMissingSite,
          missingCustomer: awMissingCustomer,
          completedNotInvoiced: awCompletedNotInvoiced,
        },
        invoiceIssues: {
          missingCustomer: invMissingCustomer,
          missingLineItems: invMissingLineItems,
          readyForSage: invReadyForSage,
          sageErrors: invSageErrors,
        },
      };
    }),
});

function emptyResult(): DataQualitySummary {
  return {
    counts: { critical: 0, warning: 0, info: 0, total: 0 },
    sites: { missingBuildingId: [], missingFileNumber: [], missingAddress: [],
             missingCity: [], missingContactInfo: [], duplicateBuildingIds: [], duplicateFileNumbers: [] },
    customerOrgs: { missingContactEmail: [], missingContactPhone: [] },
    workSiteInfo: { sitesMissingWsi: [], missingAccessNotes: [], missingPanelLocation: [], missingMonitoring: [] },
    contacts: {
      orgsMissingPrimaryContact: [], sitesMissingSiteAccessContact: [], inactiveButFlagged: [],
      orgsMissingReportRecipient: [], orgsMissingBillingContact: [], orgsMissingQuoteApprover: [],
      duplicateContactEmails: [],
    },
    schedule: { overdueWithoutTech: [] },
    devicesAndDeficiencies: { devicesWithoutLocation: [], openDefs30: 0, openDefs60: 0, openDefs90: 0, oldestOpenDefs: [] },
    approvedWorkIssues: { missingSite: [], missingCustomer: [], completedNotInvoiced: [] },
    invoiceIssues: { missingCustomer: [], missingLineItems: [], readyForSage: [], sageErrors: [] },
  };
}
