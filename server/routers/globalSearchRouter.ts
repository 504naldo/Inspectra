import { z } from "zod";
import { router, officeProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, like, or, and } from "drizzle-orm";
import {
  customerOrgs,
  sites,
  jobs,
  workOrders,
  approvedWork,
  invoices,
  serviceAgreements,
  inventoryItems,
  devices,
  reports,
  deficiencies,
} from "../../drizzle/schema";

const PER_GROUP = 5;

export const globalSearchRouter = router({
  search: officeProcedure
    .input(z.object({ q: z.string().min(2).max(100) }))
    .query(async ({ ctx, input }) => {
      const { q } = input;
      const companyId = ctx.user.companyId;
      const db = await getDb();
      const pat = `%${q}%`;

      const [
        customerResults,
        siteResults,
        jobResults,
        workOrderResults,
        approvedWorkResults,
        invoiceResults,
        agreementResults,
        inventoryResults,
        deviceResults,
        reportResults,
        deficiencyResults,
      ] = await Promise.all([
        db
          .select({
            id: customerOrgs.id,
            name: customerOrgs.name,
            contactName: customerOrgs.contactName,
            contactEmail: customerOrgs.contactEmail,
          })
          .from(customerOrgs)
          .where(
            and(
              eq(customerOrgs.companyId, companyId),
              or(
                like(customerOrgs.name, pat),
                like(customerOrgs.contactName, pat),
                like(customerOrgs.contactEmail, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: sites.id,
            name: sites.name,
            address: sites.address,
            city: sites.city,
            fileNumber: sites.fileNumber,
          })
          .from(sites)
          .where(
            and(
              eq(sites.companyId, companyId),
              or(
                like(sites.name, pat),
                like(sites.address, pat),
                like(sites.city, pat),
                like(sites.fileNumber, pat),
                like(sites.contactName, pat),
                like(sites.buildingId, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: jobs.id,
            jobNumber: jobs.jobNumber,
            title: jobs.title,
            status: jobs.status,
          })
          .from(jobs)
          .where(
            and(
              eq(jobs.companyId, companyId),
              or(
                like(jobs.jobNumber, pat),
                like(jobs.title, pat),
                like(jobs.description, pat),
                like(jobs.notes, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: workOrders.id,
            workOrderNumber: workOrders.workOrderNumber,
            title: workOrders.title,
            status: workOrders.status,
          })
          .from(workOrders)
          .where(
            and(
              eq(workOrders.companyId, companyId),
              or(
                like(workOrders.workOrderNumber, pat),
                like(workOrders.title, pat),
                like(workOrders.officeNotes, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: approvedWork.id,
            approvedScope: approvedWork.approvedScope,
            approvedByName: approvedWork.approvedByName,
            status: approvedWork.status,
          })
          .from(approvedWork)
          .where(
            and(
              eq(approvedWork.companyId, companyId),
              or(
                like(approvedWork.approvedScope, pat),
                like(approvedWork.approvedByName, pat),
                like(approvedWork.officeNotes, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            billToName: invoices.billToName,
            billToEmail: invoices.billToEmail,
            status: invoices.status,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, companyId),
              or(
                like(invoices.invoiceNumber, pat),
                like(invoices.billToName, pat),
                like(invoices.billToEmail, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: serviceAgreements.id,
            agreementNumber: serviceAgreements.agreementNumber,
            name: serviceAgreements.name,
            status: serviceAgreements.status,
          })
          .from(serviceAgreements)
          .where(
            and(
              eq(serviceAgreements.companyId, companyId),
              or(
                like(serviceAgreements.agreementNumber, pat),
                like(serviceAgreements.name, pat),
                like(serviceAgreements.internalNotes, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: inventoryItems.id,
            sku: inventoryItems.sku,
            name: inventoryItems.name,
            category: inventoryItems.category,
          })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.companyId, companyId),
              eq(inventoryItems.isActive, true),
              or(
                like(inventoryItems.sku, pat),
                like(inventoryItems.name, pat),
                like(inventoryItems.description, pat),
                like(inventoryItems.supplierPartNumber, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: devices.id,
            label: devices.label,
            deviceType: devices.deviceType,
            model: devices.model,
            serialNumber: devices.serialNumber,
            barcode: devices.barcode,
          })
          .from(devices)
          .where(
            and(
              eq(devices.companyId, companyId),
              eq(devices.isActive, true),
              or(
                like(devices.label, pat),
                like(devices.barcode, pat),
                like(devices.serialNumber, pat),
                like(devices.deviceType, pat),
                like(devices.model, pat),
                like(devices.location, pat),
              ),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: reports.id,
            reportNumber: reports.reportNumber,
            title: reports.title,
            jobId: reports.jobId,
          })
          .from(reports)
          .innerJoin(jobs, eq(reports.jobId, jobs.id))
          .where(
            and(
              eq(jobs.companyId, companyId),
              or(like(reports.reportNumber, pat), like(reports.title, pat)),
            ),
          )
          .limit(PER_GROUP),

        db
          .select({
            id: deficiencies.id,
            title: deficiencies.title,
            status: deficiencies.status,
            jobId: deficiencies.jobId,
          })
          .from(deficiencies)
          .innerJoin(jobs, eq(deficiencies.jobId, jobs.id))
          .where(
            and(
              eq(jobs.companyId, companyId),
              or(
                like(deficiencies.title, pat),
                like(deficiencies.description, pat),
                like(deficiencies.observedIssue, pat),
                like(deficiencies.correctiveAction, pat),
              ),
            ),
          )
          .limit(PER_GROUP),
      ]);

      return {
        customers: customerResults,
        sites: siteResults,
        jobs: jobResults,
        workOrders: workOrderResults,
        approvedWork: approvedWorkResults,
        invoices: invoiceResults,
        agreements: agreementResults,
        inventory: inventoryResults,
        devices: deviceResults,
        reports: reportResults,
        deficiencies: deficiencyResults,
      };
    }),
});
