import { resolveDocumentUrl } from "../documentUrl";
import { assertJobAccess } from "../tenantGuards";
import { requireCompanyPermission } from "../permissions";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, asc } from "drizzle-orm";
import { router, officeProcedure, customerProcedure, protectedProcedure, technicianProcedure, } from "../_core/trpc";
import * as db from "../db";
import { getDb } from "../db";
import { assertJobNotFinalized } from "../db";
import { storagePut, storageGetDownload } from "../storage";
import { generateInspectionReportPDF } from "../pdfGeneratorFirePro";
import { buildCustomerSafeReportData, buildCustomerSafeComplianceData, } from "../customerSafeReport";
import { generateComplianceReportPDF } from "../pdfGeneratorCompliance";
import { fetchImageBuffer } from "../pdfSharedStyles";
import { resolveAttachmentImageForPdf } from "../pdfImageResolver";
import { getCanonicalFireAlarmChecklist } from "../canonicalFireAlarmReport";
import { getCapturedTemplateReportData } from "../canonicalTemplateReport";
import { withMutableJob, withReportJob } from "../jobWriteTransaction";
import { assertDeviceEvidenceForReport, requireCapturedDevice } from "../canonicalDeviceEvidence";
import { filterAuthorizedAttachments } from "../attachmentAccess";
import { randomUUID } from "node:crypto";
import { getRecordedReportFacts, recordedDeviceOutcome, recordedInspectionFrequency } from "../recordedReportFacts";
import { sendReportEmail, sendReportReadyEmail, sendReportApprovedNotification, } from "../emailService";
import { ENV } from "../_core/env";
import { toCustomerSafeReport } from "../customerDto";
import { assertCustomerOrgCompany } from "../tenantGuards";
import {
  users,
  jobs as jobsTable,
  attachments,
} from "../../drizzle/schema";

// ─── Template data helper ─────────────────────────────────────────────────────
// Fetches and structures template response data for PDF inclusion.
// Returns empty array when no template responses exist — PDF skips the section.

async function fetchTemplateReportData(jobId: number, companyId: number) {
  return getCapturedTemplateReportData(jobId, companyId);
}

const reportRouter = router({
  listByCompany: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
    return Promise.all(
        (await db.getReportsByCompany(input.companyId)).map(async report => ({
          ...report,
          fileUrl: await resolveDocumentUrl(report),
        })));
  }),

  listByJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => { await assertJobAccess(input.jobId,ctx.user);
    const reports = await Promise.all(
        ( await db.getReportsByJob(input.jobId)).map(async report => ({
          ...report,
          fileUrl: await resolveDocumentUrl(report),
        })));
    return ctx.user.role === 'customer' ? reports.map(toCustomerSafeReport) : reports;
  }),

  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer') {
      if (ctx.user.customerOrgId !== input.customerOrgId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
    } else {
      await assertCustomerOrgCompany(input.customerOrgId, ctx.user.companyId!);
    }
    const reports = await Promise.all(
        (await db.getReportsByCustomerOrg(input.customerOrgId)).map(
          async report => ({
            ...report,
            fileUrl: await resolveDocumentUrl(report),
          })
        ));
    return ctx.user.role === 'customer' ? reports.map(toCustomerSafeReport) : reports;
  }),

  getDownloadUrl: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const report = await db.getReportById(input.id);
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });
    if (!report.fileKey) throw new TRPCError({ code: "NOT_FOUND", message: "No PDF on file" });

    const job = await db.getJobById(report.jobId);
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (ctx.user.role === "customer") {
      if (ctx.user.customerOrgId !== job.customerOrgId) throw new TRPCError({ code: "FORBIDDEN" });
    } else if (ctx.user.companyId !== job.companyId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const filename = `${report.reportNumber ?? `report-${report.id}`}.pdf`;
    return storageGetDownload(report.fileKey, filename);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const report = await db.getReportById(input.id);
    if (!report) return undefined; await assertJobAccess(report.jobId,ctx.user);
      report.fileUrl = await resolveDocumentUrl (report);
    return ctx.user.role === 'customer' ? toCustomerSafeReport(report) : report;
  }),
  
  create: officeProcedure.input(z.object({
    jobId: z.number(),
    title: z.string(),
    executiveSummary: z.string().optional(),
    aiSummary: z.string().optional(),
  })).mutation(async ({ input, ctx }) => withMutableJob(ctx, "report.create", input.jobId, async () => {
    const stats = await db.getInspectionStats(input.jobId);
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    const reportNumber = `RPT-${Date.now().toString(36).toUpperCase()}`;

      return db.createReport({
        ...input,
        generatedById: ctx.user.id,
        reportNumber,
        deviceCount: stats.total,
        passCount: stats.pass,
        failCount: stats.fail,
        deficiencyCount: deficiencies.length,
      });
    })),

  update: officeProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        executiveSummary: z.string().optional(),
        aiSummary: z.string().optional(),
        status: z.enum(["draft", "generated", "sent", "approved"]).optional(),
      }).strict()
    )
    .mutation(async ({ input, ctx }) => {
      const report = await db.getReportById(input.id);
      if (!report)
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      return withMutableJob(ctx, "report.update", report.jobId, async () => {
      const current = await db.getReportById(input.id);
      if (!current || current.jobId !== report.jobId)
        throw new TRPCError({ code: "CONFLICT", message: "Report parent changed; reload before editing" });
      const { id, status, ...data } = input;
      const updateData: any = { ...data };
      if (status) {
        updateData.status = status;
        if (status === "approved") {
          await requireCompanyPermission(ctx, "reports.approve");
          updateData.approvedAt = new Date();
          updateData.approvedById = ctx.user.id;
        }
      }
      await db.updateReport(id, updateData);
      return { success: true };
      });
    }),

  approve: customerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // A customer may only approve reports for jobs belonging to their own org.
      const report = await db.getReportById(input.id);
      if (!report)
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      const parentJob = await db.getJobById(report.jobId);
      if (!parentJob || parentJob.customerOrgId !== ctx.user.customerOrgId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      await db.updateReport(input.id, {
        status: "approved",
        approvedAt: new Date(),
        approvedById: ctx.user.id,
      });

      const approverName = ctx.user.name;
      const approverEmail = ctx.user.email;
      void (async () => {
        try {
          const job = parentJob;
          const site = job ? await db.getSiteById(job.siteId) : undefined;
          await sendReportApprovedNotification({
            reportNumber: report.reportNumber ?? "",
            reportTitle: report.title ?? "",
            siteName: site?.name ?? job?.title ?? "",
            jobNumber: job?.jobNumber ?? "",
            approvedByName: approverName ?? "",
            approvedByEmail: approverEmail ?? "",
          });
        } catch (err) {
          console.warn(
            "[email] Failed to send report approved notification:",
            err
          );
        }
      })();

      return { success: true };
    }),

  generatePDF: officeProcedure
    .input(
      z.object({
        jobId: z.number(),
        summary: z.string().optional(),
        allowMissingLocations: z.boolean().optional(), // Admin override for test mode
      })
    )
    .mutation(async ({ input, ctx }) => {
      // DEPRECATED: Use deficiencyReport.generate instead
      console.warn(
        "[DEPRECATED] report.generatePDF is deprecated. Use deficiencyReport.generate instead."
      );

      // Get job details (scoped to the caller's company)
      const generated = await withReportJob(ctx, "report.generatePDF", input.jobId, async job => {

      // Get site details
      const site = await db.getSiteById(job.siteId);
      if (!site)
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      // Get customer org
      const customerOrg = await db.getCustomerOrgById(job.customerOrgId);

      // Get company
      const company = await db.getCompanyById(job.companyId);

      // Get inspection results with device info
      const inspectionResults = await db.getInspectionResultsByJob(input.jobId);

      // Get deficiencies
      const deficiencies = await db.getDeficienciesByJob(input.jobId);
      assertDeviceEvidenceForReport(job, inspectionResults, deficiencies);

      // Validate deficiency locations before generating Deficiency report
      // Fetch device locations for deficiencies
      const deficienciesWithLocations = await Promise.all(
        deficiencies.map(async d => {
          let location: string | null = null;
          if (d.deviceId) {
            location = requireCapturedDevice(d, job).location;
          }
          return {
            id: d.id,
            description: d.description || "No description",
            severity: d.severity,
            location,
          };
        })
      );

      const { validateDeficiencyReportLocations } = await import(
        "../locationValidation"
      );

      // Check if admin override is enabled (only admins can use this)
      const allowOverride =
        input.allowMissingLocations === true && ctx.user.role === "admin";

      const locationValidation = validateDeficiencyReportLocations(
        deficienciesWithLocations,
        allowOverride
      );

      if (!locationValidation.isValid) {
        const missingList = locationValidation.missingDeficiencies
          .map(
            d =>
              `  - Deficiency #${d.id}: ${d.description.substring(0, 60)}${d.description.length > 60 ? '...' : ''} (${d.severity})`
          )
          .join("\n");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot generate Deficiency report: ${locationValidation.totalMissing} deficiency/deficiencies missing location information.\n\nMissing locations for:\n${missingList}\n\nPlease add locations to all deficiencies before generating the Deficiency Report.`,
        });
      }

      // Calculate device summaries by type
      const deviceTypeMap: Record<
        string,
        { total: number; passed: number; failed: number; na: number }
      > = {};

      for (const result of inspectionResults) {
        const deviceType = result.deviceType || "Unknown";
        if (!deviceTypeMap[deviceType]) {
          deviceTypeMap[deviceType] = { total: 0, passed: 0, failed: 0, na: 0 };
        }
        deviceTypeMap[deviceType].total++;
        if (result.result === "pass") deviceTypeMap[deviceType].passed++;
        else if (result.result === "fail") deviceTypeMap[deviceType].failed++;
        else if (result.result === "na") deviceTypeMap[deviceType].na++;
      }

      const deviceSummaries = Object.entries(deviceTypeMap).map(
        ([deviceType, stats]) => ({
          deviceType,
          ...stats,
        })
      );

      // Get technician details + template checklist responses + company settings (parallel)
      const [recordedFacts, rawTemplateData, companySettings] = await Promise.all([
        getRecordedReportFacts(input.jobId, job.leadTechnicianId ?? job.assignedTechnicianId),
        fetchTemplateReportData(input.jobId, job.companyId),
        db.getCompanySettings(job.companyId),
      ]);

      // Pre-fetch company logo buffer before entering the synchronous PDF callback
      const companyLogoBuffer = companySettings.logoUrl
        ? await fetchImageBuffer(companySettings.logoUrl)
        : undefined;

      const companyDisplayName =
        companySettings.companyDisplayName ||
        company?.name ||
        "Company not recorded";

      // Generate PDF with Fire-Pro style
      const pdfBuffer = await generateInspectionReportPDF(
        buildCustomerSafeReportData({
          jobNumber: job.jobNumber,
          jobTitle: job.title,
          siteName: site.name,
          siteAddress: site.address || "",
          siteCity: site.city || "",
          siteState: site.state || "",
          customerName: customerOrg?.name || "Unknown Customer",
          customerAddress: customerOrg?.address || "",
          customerCity: "",
          customerState: "",
          customerPostalCode: "",
          attentionTo: customerOrg?.contactName || "",
          attentionEmail: customerOrg?.contactEmail || "",
          inspectionDate: recordedFacts.inspectionDate,
          completedDate: job.completedAt,
          technicianName: recordedFacts.technicianName,
          technicianTitle: recordedFacts.technicianTitle,
          technicianCertNumber: recordedFacts.technicianCertificateNumber,
          technicianEmail: undefined, // No captured contact address; never substitute the current viewer.
          companyName: companyDisplayName,
          companyAddress: company?.address || "",
          companyPhone: company?.phone || undefined,
          companyEmail: company?.email || undefined,
          companyLogoBuffer,
          reportFooterText: companySettings.reportFooterText || undefined,
          gstRate: companySettings.gstRate,
          pstRate: companySettings.pstRate,
          summary: input.summary,
          deviceSummaries,
          deficiencies: await Promise.all(
            deficiencies.map(async d => {
              // Get device info if deviceId exists
              let deviceType: string | undefined = undefined;
              let location: string | undefined = undefined;
              if (d.deviceId) {
                const device = requireCapturedDevice(d, job);
                if (device) {
                  deviceType = device.deviceType;
                  location = device.location || undefined;
                }
              }

              // Pre-fetch customer-facing photo buffers for this deficiency
              let photos: Array<{
                buffer: Buffer;
                caption?: string | null;
                locationNote?: string | null;
              }> = [];
              try {
                const drizzle = (await getDb())!;
                if (drizzle) {
                  const queriedMediaRows = await drizzle
                    .select()
                    .from(attachments)
                    .where(
                      and(
                        eq(attachments.entityType, "deficiency"),
                        eq(attachments.entityId, d.id),
                        eq(attachments.uploadStatus, "completed"),
                        eq(attachments.isCustomerFacing, 1)
                      )
                    )
                    .orderBy(attachments.sortOrder, attachments.createdAt);
                  const mediaRows = await filterAuthorizedAttachments(queriedMediaRows, ctx.user);

                  // Re-sign each photo from its durable fileKey at generation time —
                  // the stored fileUrl is a presigned URL that expires (7 days), so a
                  // report regenerated later would otherwise drop every photo.
                  const resolved = await Promise.all(
                    mediaRows.map(row =>
                      resolveAttachmentImageForPdf(row, {
                        reportRef: `job ${job.jobNumber} def#${d.id}`,
                      })
                    )
                  );
                  photos = resolved.flatMap((res, i) =>
                    res.ok
                      ? [
                          {
                            buffer: res.buffer,
                            caption: mediaRows[i].caption,
                            locationNote: mediaRows[i].locationNote,
                          },
                        ]
                      : []
                  );
                  // Never silently treat an expected photo as embedded when it failed:
                  // record how many customer-facing photos could not be loaded.
                  const failed = mediaRows.length - photos.length;
                  if (failed > 0) {
                    console.warn(
                      `[pdf-image] job ${job.jobNumber} def#${d.id}: ${failed}/${mediaRows.length} customer-facing photo(s) could not be embedded`
                    );
                  }
                }
              } catch {
                // Non-fatal: photos are best-effort in PDF
              }

              return {
                id: d.id,
                title: d.title,
                severity: d.severity,
                status: d.status,
                description: d.description,
                correctiveAction: d.correctiveAction,
                deviceType,
                location,
                estimatedCost: d.estimatedCost, // Keep as string (MySQL decimal), PDF generator will convert when needed
                systemCategory: d.systemCategory,
                photos,
              };
            })
          ),
          inspectionResults: inspectionResults.map(r => ({
            deviceId: r.deviceId,
            deviceType: r.deviceType || "Unknown",
            location: r.location,
            serialNumber: r.serialNumber,
            result: r.result,
            notes: r.notes,
          })),
          // Include missing location info if override mode is enabled
          missingLocationDeficiencies:
            allowOverride && locationValidation.missingDeficiencies.length > 0
              ? locationValidation.missingDeficiencies
              : undefined,
          // Signature captured during job completion
          techSignatureUrl: (job as any).techSignatureUrl || undefined,
          // Deficiency reports do NOT include the fire alarm checklist section.
          // The checklist belongs only in annual/compliance reports.
          includeFireAlarmChecklist: false,
          fireAlarmChecklist: undefined,
          fireAlarmSystem: undefined,
          // Inspection template checklist — included when technician completed template forms
          templateChecklistSections:
            rawTemplateData.length > 0 ? rawTemplateData : undefined,
        })
      );

      // Upload to S3
      const fileKey = `reports/${job.companyId}/Inspectra-${job.jobNumber.replace(/[^a-zA-Z0-9]/g, '-')}-${randomUUID()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      // Create or update report record
      const reportNumber = `RPT-${Date.now().toString(36).toUpperCase()}`;
      const stats = await db.getInspectionStats(input.jobId);

      const report = await db.createReport({
        jobId: input.jobId,
        title: `Inspection Report - ${job.title}`,
        executiveSummary: input.summary,
        aiSummary: input.summary,
        generatedById: ctx.user.id,
        reportNumber,
        deviceCount: stats.total,
        passCount: stats.pass,
        failCount: stats.fail,
        deficiencyCount: deficiencies.length,
        fileKey,
        fileUrl: url,
        status: "generated",
      });

      return { report, job, site, customerOrg, pdfBuffer, url, reportNumber };
      });
      const { report, job, site, customerOrg, pdfBuffer, url, reportNumber } = generated;

      // Send notification email to reports@ewandf.ca
      await sendReportEmail({
        siteName: site?.name ?? job.title,
        jobNumber: job.jobNumber,
        reportType: "compliance",
        pdfUrl: url,
      });

      // Notify customer org contact that report is ready (respects org preferences)
      if (customerOrg?.contactEmail && customerOrg.notifyReportReady !== 0) {
        void sendReportReadyEmail({
          to: customerOrg.contactEmail,
          customerName: customerOrg.contactName || customerOrg.name,
          siteName: site?.name ?? job.title,
          jobNumber: job.jobNumber,
          reportType: "compliance",
          portalUrl: ENV.appUrl,
        });
      }

      // Auto-save to Google Drive (best-effort — don't fail report generation)
      let driveUrl: string | null = null;
      try {
        const { uploadReportToDrive } = await import("../_core/driveUpload");
        const driveFileName = `${new Date().toISOString().split("T")[0]} Deficiency Report - ${reportNumber}.pdf`;
        const driveResult = await uploadReportToDrive({
          userId: ctx.user.id,
          pdfBuffer,
          fileName: driveFileName,
          customerOrgName: customerOrg?.name || "Unknown Customer",
          siteName: site.name,
        });
        if (driveResult) {
          await db.updateReport(report.id, {
            googleDriveUrl: driveResult.webViewLink,
          });
          driveUrl = driveResult.webViewLink;
        }
      } catch (driveError) {
        console.warn("[Drive] Auto-save failed (non-blocking):", driveError);
      }

      return {
        success: true,
        reportId: report.id,
        fileUrl: url,
        reportNumber,
        driveUrl,
      };
    }),

  generateCompliancePDF: officeProcedure
    .input(
      z.object({
        jobId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // DEPRECATED: Use annualReport.generate instead
      console.warn(
        "[DEPRECATED] report.generateCompliancePDF is deprecated. Use annualReport.generate instead."
      );

      // Get job details (scoped to the caller's company)
      const generated = await withReportJob(ctx, "report.generateCompliancePDF", input.jobId, async job => {

      // Get site details
      const site = await db.getSiteById(job.siteId);
      if (!site)
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      // Get customer org
      const customerOrg = await db.getCustomerOrgById(job.customerOrgId);

      // Get company
      const company = await db.getCompanyById(job.companyId);

      // Get inspection results with device info
      const inspectionResults = await db.getInspectionResultsByJob(input.jobId);

      // Get deficiencies
      const deficiencies = await db.getDeficienciesByJob(input.jobId);
      assertDeviceEvidenceForReport(job, inspectionResults, deficiencies);

      // Get technician details
      const recordedFacts = await getRecordedReportFacts(input.jobId, job.leadTechnicianId ?? job.assignedTechnicianId);

      // Validate device locations before generating Annual report
      const {
        validateAnnualReportLocations,
        isFireAlarmDeviceType,
        isFireExtinguisherType,
        isEmergencyLightType,
      } = await import("../locationValidation");
      const locationValidation = validateAnnualReportLocations({
        fireAlarmDevices: inspectionResults
          .filter(r => isFireAlarmDeviceType(r.deviceType))
          .map(r => ({
            id: r.id,
            deviceType: r.deviceType || "Unknown",
            location: r.location,
            identification: r.serialNumber,
          })),
        fireExtinguishers: inspectionResults
          .filter(r => isFireExtinguisherType(r.deviceType))
          .map(r => ({
            id: r.id,
            location: r.location,
            serialNumber: r.serialNumber,
          })),
        emergencyLights: inspectionResults
          .filter(r => isEmergencyLightType(r.deviceType))
          .map(r => ({
            id: r.id,
            location: r.location,
            identification: r.serialNumber,
          })),
      });

      if (!locationValidation.isValid) {
        const missingList = locationValidation.missingDevices
          .map(
            d =>
              `  - ${d.type} (ID: ${d.id}${d.identification ? `, ${d.identification}` : ""}${d.deviceType ? `, Type: ${d.deviceType}` : ""})`)
        .join('\n');
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot generate Annual report: ${locationValidation.totalMissing} device(s) missing location information.\n\nMissing locations for:\n${missingList}\n\nPlease add locations to all devices before generating the Annual Inspection Report.`,
        });
      }

      // The same captured questions and immutable snapshots used in the field.
      // Do not translate legacy question letters or invent panel/battery facts.
      const checklistSections = await getCanonicalFireAlarmChecklist(
        input.jobId
      );
      // Build device records
      const fireAlarmDevices = inspectionResults
        .filter(r => isFireAlarmDeviceType(r.deviceType))
        .sort((a, b) => {
          // Sort by walkOrder (nulls last), then by location as fallback
          if (a.walkOrder === null && b.walkOrder === null)
            return (a.location || "").localeCompare(b.location || "");
          if (a.walkOrder === null) return 1;
          if (b.walkOrder === null) return -1;
          return a.walkOrder - b.walkOrder;
        })
        .map(r => ({
          deviceType: r.deviceType || "Unknown",
          location: r.location || "Unknown",
          result: recordedDeviceOutcome(r.result),
          notes: r.notes || undefined,
        }));

      const fireExtinguishers = inspectionResults
        .filter(r => isFireExtinguisherType(r.deviceType))
        .sort((a, b) => {
          // Sort by walkOrder (nulls last), then by location as fallback
          if (a.walkOrder === null && b.walkOrder === null)
            return (a.location || "").localeCompare(b.location || "");
          if (a.walkOrder === null) return 1;
          if (b.walkOrder === null) return -1;
          return a.walkOrder - b.walkOrder;
        })
        .map(r => ({
          location: r.location || "Unknown",
          type: r.deviceType || "Unknown",
          serialNumber: r.serialNumber || undefined,
          result: recordedDeviceOutcome(r.result),
        }));

      const emergencyLights = inspectionResults
        .filter(r => isEmergencyLightType(r.deviceType))
        .sort((a, b) => {
          // Sort by walkOrder (nulls last), then by location as fallback
          if (a.walkOrder === null && b.walkOrder === null)
            return (a.location || "").localeCompare(b.location || "");
          if (a.walkOrder === null) return 1;
          if (b.walkOrder === null) return -1;
          return a.walkOrder - b.walkOrder;
        })
        .map(r => ({
          location: r.location || "Unknown",
          functionalTest: r.result === "fail" ? "FAIL" as const : recordedDeviceOutcome(r.result) as "PASS" | "N/A" | "NOT TESTED",
          durationTest: "NOT RECORDED" as const,
          comments: r.notes || undefined,
        }));

      // Build deficiencies summary
      const deficienciesSummary = await Promise.all(
        deficiencies.map(async d => {
          let deviceType: string | undefined = undefined;
          let location: string | undefined = undefined;
          if (d.deviceId) {
            const device = requireCapturedDevice(d, job);
            if (device) {
              deviceType = device.deviceType;
              location = device.location || undefined;
            }
          }
          return {
            system: deviceType || "Fire Alarm System",
            location: location || "Various",
            description: d.description || "No description provided",
          };
        })
      );

      // Generate compliance PDF
      const pdfBuffer = await generateComplianceReportPDF(
        buildCustomerSafeComplianceData({
          workOrderNumber: job.jobNumber,
          dateOfService: recordedFacts.inspectionDate,
          inspectionFrequency: recordedInspectionFrequency(job.jobType),
          contactPerson: customerOrg?.contactName || "N/A",
          contactPhone: customerOrg?.contactPhone || "N/A",
          buildingName: site.name,
          buildingAddress: site.address || "",
          city: site.city || "",
          postalCode: site.postalCode || undefined,
          pmOrOwner: customerOrg?.name,
          ownerPhone: customerOrg?.contactPhone || undefined,

          systemsInspected: {
            fireAlarmSystem: true,
            commonAreaDevices: fireAlarmDevices.length > 0,
            inSuiteDevices: false,
            sprinklerSystem: false,
            fireExtinguishers: fireExtinguishers.length > 0,
            emergencyLighting: emergencyLights.length > 0,
            hydrant: false,
            winterization: false,
            generator: false,
            backflow: false,
            monitoring: false,
            smokeControl: false,
            suppressionSystems: false,
            standpipe: false,
            kitchen: false,
          },

          systemModel: recordedFacts.systemModel,
          systemOperation: recordedFacts.systemOperation,
          fireSignalReceivingCentre: recordedFacts.fireSignalReceivingCentre,
          connectedToFireSignalReceivingCentre: recordedFacts.connectedToFireSignalReceivingCentre,
          systemFullyFunctional: recordedFacts.systemFullyFunctional,
          deficienciesIdentified: deficiencies.length > 0,
          deficienciesCorrectedDate: undefined,
          recommendationsIdentified: recordedFacts.recommendationsIdentified,

          technicianName: recordedFacts.technicianName,
          technicianCertificateNumber: recordedFacts.technicianCertificateNumber,
          secondaryTechnicianName: undefined,
          secondaryTechnicianCertificateNumber: undefined,
          companyName: company?.name || "",
          companyPhone: company?.phone || "",

          checklists: checklistSections,
          fireAlarmDevices,
          fireExtinguishers,
          emergencyLights,
          deficiencies: deficienciesSummary,
          // Signature captured during job completion
          techSignatureUrl: (job as any).techSignatureUrl || undefined,
        })
      );

      // Upload to S3
      const fileKey = `reports/${job.companyId}/Inspectra-${job.jobNumber.replace(/[^a-zA-Z0-9]/g, '-')}-compliance-${randomUUID()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      // Create report record
      const reportNumber = `CMP-${Date.now().toString(36).toUpperCase()}`;
      const stats = await db.getInspectionStats(input.jobId);

      const report = await db.createReport({
        jobId: input.jobId,
        title: `CAN/ULC-S536 Compliance Report - ${job.title}`,
        executiveSummary:
          "Fire alarm inspection using captured checklist questions and recorded results",
        aiSummary: "Fire alarm inspection using captured checklist questions and recorded results",
        generatedById: ctx.user.id,
        reportNumber,
        deviceCount: stats.total,
        passCount: stats.pass,
        failCount: stats.fail,
        deficiencyCount: deficiencies.length,
        fileKey,
        fileUrl: url,
        status: "generated",
      });

      return { report, job, site, customerOrg, pdfBuffer, url, reportNumber };
      });
      const { report, job, site, customerOrg, pdfBuffer, url, reportNumber } = generated;

      // Send notification email to reports@ewandf.ca
      await sendReportEmail({
        siteName: site.name ?? job.title,
        jobNumber: job.jobNumber,
        reportType: "annual",
        pdfUrl: url,
      });

      // Notify customer org contact that report is ready (respects org preferences)
      if (customerOrg?.contactEmail && customerOrg.notifyReportReady !== 0) {
        void sendReportReadyEmail({
          to: customerOrg.contactEmail,
          customerName: customerOrg.contactName || customerOrg.name,
          siteName: site.name ?? job.title,
          jobNumber: job.jobNumber,
          reportType: "annual",
          portalUrl: ENV.appUrl,
        });
      }

      // Auto-save to Google Drive (best-effort — don't fail report generation)
      let driveUrl: string | null = null;
      try {
        const { uploadReportToDrive } = await import("../_core/driveUpload");
        const driveFileName = `${new Date().toISOString().split("T")[0]} Annual Report - ${reportNumber}.pdf`;
        const driveResult = await uploadReportToDrive({
          userId: ctx.user.id,
          pdfBuffer,
          fileName: driveFileName,
          customerOrgName: customerOrg?.name || "Unknown Customer",
          siteName: site.name,
        });
        if (driveResult) {
          await db.updateReport(report.id, {
            googleDriveUrl: driveResult.webViewLink,
          });
          driveUrl = driveResult.webViewLink;
        }
      } catch (driveError) {
        console.warn("[Drive] Auto-save failed (non-blocking):", driveError);
      }

      return {
        success: true,
        reportId: report.id,
        fileUrl: url,
        reportNumber,
        driveUrl,
      };
    }),
});
// Checklist router

const annualReportRouter = router({
  // DEFINITIVE Annual Inspection Report endpoint
  // Routes to: generateCompliancePDF (CAN/ULC-S536 compliance report)
  // Enforces: Checklist completeness (122 items) + Device locations
  generate: reportRouter._def.procedures.generateCompliancePDF,
});

const deficiencyReportRouter = router({
  // DEFINITIVE Deficiency Report endpoint
  // Routes to: generatePDF (Fire-Pro style with pricing)
  // Enforces: Deficiency locations
  generate: reportRouter._def.procedures.generatePDF,
});

export { reportRouter, annualReportRouter, deficiencyReportRouter };
