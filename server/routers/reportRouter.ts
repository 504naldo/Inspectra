import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, asc } from "drizzle-orm";
import { router, officeProcedure, customerProcedure, protectedProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { getDb } from "../db";
import { assertJobNotFinalized } from "../db";
import { storagePut } from "../storage";
import { generateInspectionReportPDF } from "../pdfGeneratorFirePro";
import { generateComplianceReportPDF } from "../pdfGeneratorCompliance";
import { fetchImageBuffer } from "../pdfSharedStyles";
import * as checklists from "../complianceChecklists";
import { sendReportEmail, sendReportReadyEmail, sendReportApprovedNotification } from "../emailService";
import { ENV } from "../_core/env";
import {
  inspectionTemplates,
  inspectionTemplateSections,
  inspectionTemplateItems,
  inspectionTemplateResponses,
  deficiencies,
  users,
  jobs as jobsTable,
  attachments,
} from "../../drizzle/schema";

// ─── Template data helper ─────────────────────────────────────────────────────
// Fetches and structures template response data for PDF inclusion.
// Returns empty array when no template responses exist — PDF skips the section.

async function fetchTemplateReportData(jobId: number, companyId: number) {
  const drizzle = await getDb();

  const responses = await drizzle
    .select()
    .from(inspectionTemplateResponses)
    .where(eq(inspectionTemplateResponses.jobId, jobId));

  if (responses.length === 0) return [];

  const templateIds = [...new Set(responses.map((r) => r.templateId))];

  const [allTemplates, allSections, allItems, allDeficiencies] = await Promise.all([
    drizzle.select().from(inspectionTemplates)
      .where(eq(inspectionTemplates.companyId, companyId)),
    drizzle.select().from(inspectionTemplateSections)
      .where(eq(inspectionTemplateSections.companyId, companyId))
      .orderBy(asc(inspectionTemplateSections.sortOrder)),
    drizzle.select().from(inspectionTemplateItems)
      .where(eq(inspectionTemplateItems.companyId, companyId))
      .orderBy(asc(inspectionTemplateItems.sectionId), asc(inspectionTemplateItems.sortOrder)),
    drizzle.select({ id: deficiencies.id, title: deficiencies.title })
      .from(deficiencies)
      .where(eq(deficiencies.jobId, jobId)),
  ]);

  const defMap = new Map(allDeficiencies.map((d) => [d.id, d.title]));
  const responseMap = new Map(responses.map((r) => [r.itemId, r]));

  return templateIds.map((templateId) => {
    const template = allTemplates.find((t) => t.id === templateId);
    if (!template) return null;

    const templateSections = allSections.filter((s) => s.templateId === templateId);
    const templateItems = allItems.filter((i) => i.templateId === templateId);
    const templateResponses = responses.filter((r) => r.templateId === templateId);

    const totalItems = templateItems.length;
    const answeredItems = templateItems.filter((i) => {
      const r = responseMap.get(i.id);
      return r && (r.responseValue || r.responseText);
    }).length;
    const unansweredRequiredItems = templateItems.filter((i) => {
      if (i.isRequired !== 1) return false;
      const r = responseMap.get(i.id);
      return !r || (!r.responseValue && !r.responseText);
    }).length;

    let passCount = 0;
    let failCount = 0;
    let naCount = 0;
    for (const r of templateResponses) {
      const v = (r.responseValue ?? "").toLowerCase();
      if (v === "pass" || v === "yes" || v === "checked") passCount++;
      else if (v === "fail" || v === "no") failCount++;
      else if (v === "na") naCount++;
    }

    const sections = templateSections.map((section) => ({
      sectionTitle: section.title,
      items: templateItems
        .filter((i) => i.sectionId === section.id)
        .map((item) => {
          const resp = responseMap.get(item.id);
          return {
            itemCode: item.itemCode,
            questionText: item.questionText,
            responseValue: resp?.responseValue ?? null,
            responseText: resp?.responseText ?? null,
            notes: resp?.notes ?? null,
            codeReference: item.codeReference,
            isRequired: item.isRequired === 1,
            deficiencyId: resp?.deficiencyId ?? null,
          };
        }),
    }));

    return {
      templateName: template.name,
      systemType: template.systemType,
      completionPercent: totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0,
      totalItems,
      answeredItems,
      passCount,
      failCount,
      naCount,
      unansweredRequiredItems,
      sections,
    };
  }).filter((t): t is NonNullable<typeof t> => t !== null);
}

const reportRouter = router({
  listByCompany: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input, ctx }) => {
    if (input.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
    return db.getReportsByCompany(input.companyId);
  }),

  listByJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ input, ctx }) => {
    const job = await db.getJobById(input.jobId);
    if (job) {
      if (ctx.user.role === 'customer') {
        if (ctx.user.customerOrgId !== job.customerOrgId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      } else if (ctx.user.companyId !== job.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
    }
    return db.getReportsByJob(input.jobId);
  }),
  
  listByCustomerOrg: protectedProcedure.input(z.object({ customerOrgId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role === 'customer' && ctx.user.customerOrgId !== input.customerOrgId) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.getReportsByCustomerOrg(input.customerOrgId);
  }),
  
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const report = await db.getReportById(input.id);
    if (!report) return undefined;
    // Scope via parent job
    const job = await db.getJobById(report.jobId);
    if (job) {
      if (ctx.user.role === 'customer') {
        if (ctx.user.customerOrgId !== job.customerOrgId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      } else if (ctx.user.companyId !== job.companyId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
    }
    return report;
  }),
  
  create: officeProcedure.input(z.object({
    jobId: z.number(),
    title: z.string(),
    executiveSummary: z.string().optional(),
    aiSummary: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
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
  }),
  
  update: officeProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    executiveSummary: z.string().optional(),
    aiSummary: z.string().optional(),
    status: z.enum(['draft', 'generated', 'sent', 'approved']).optional(),
    fileKey: z.string().optional(),
    fileUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const report = await db.getReportById(input.id);
    if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
    // Prevent editing reports whose parent job is finalized
    await assertJobNotFinalized(report.jobId);
    const { id, status, ...data } = input;
    const updateData: any = { ...data };
    if (status) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approvedAt = new Date();
        updateData.approvedById = ctx.user.id;
      }
    }
    await db.updateReport(id, updateData);
    return { success: true };
  }),
  
  approve: customerProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    await db.updateReport(input.id, {
      status: 'approved',
      approvedAt: new Date(),
      approvedById: ctx.user.id,
    });

    const approverName = ctx.user.name;
    const approverEmail = ctx.user.email;
    void (async () => {
      try {
        const report = await db.getReportById(input.id);
        if (!report) return;
        const job = await db.getJobById(report.jobId);
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
        console.warn("[email] Failed to send report approved notification:", err);
      }
    })();

    return { success: true };
  }),
  
  generatePDF: officeProcedure.input(z.object({
    jobId: z.number(),
    summary: z.string().optional(),
    allowMissingLocations: z.boolean().optional(), // Admin override for test mode
  })).mutation(async ({ input, ctx }) => {
    // DEPRECATED: Use deficiencyReport.generate instead
    console.warn('[DEPRECATED] report.generatePDF is deprecated. Use deficiencyReport.generate instead.');
    
    // Get job details
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    
    // Get site details
    const site = await db.getSiteById(job.siteId);
    if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    
    // Get customer org
    const customerOrg = await db.getCustomerOrgById(job.customerOrgId);
    
    // Get company
    const company = await db.getCompanyById(job.companyId);
    
    // Get inspection results with device info
    const inspectionResults = await db.getInspectionResultsByJob(input.jobId);
    
    // Get deficiencies
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    // Validate deficiency locations before generating Deficiency report
    // Fetch device locations for deficiencies
    const deficienciesWithLocations = await Promise.all(deficiencies.map(async (d) => {
      let location: string | null = null;
      if (d.deviceId) {
        const device = await db.getDeviceById(d.deviceId);
        location = device?.location || null;
      }
      return {
        id: d.id,
        description: d.description || 'No description',
        severity: d.severity,
        location,
      };
    }));
    
    const { validateDeficiencyReportLocations } = await import('../locationValidation');
    
    // Check if admin override is enabled (only admins can use this)
    const allowOverride = input.allowMissingLocations === true && ctx.user.role === 'admin';
    
    const locationValidation = validateDeficiencyReportLocations(deficienciesWithLocations, allowOverride);
    
    if (!locationValidation.isValid) {
      const missingList = locationValidation.missingDeficiencies
        .map(d => `  - Deficiency #${d.id}: ${d.description.substring(0, 60)}${d.description.length > 60 ? '...' : ''} (${d.severity})`)
        .join('\n');
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot generate Deficiency report: ${locationValidation.totalMissing} deficiency/deficiencies missing location information.\n\nMissing locations for:\n${missingList}\n\nPlease add locations to all deficiencies before generating the Deficiency Report.`,
      });
    }
    
    // Calculate device summaries by type
    const deviceTypeMap: Record<string, { total: number; passed: number; failed: number; na: number }> = {};
    
    for (const result of inspectionResults) {
      const deviceType = result.deviceType || 'Unknown';
      if (!deviceTypeMap[deviceType]) {
        deviceTypeMap[deviceType] = { total: 0, passed: 0, failed: 0, na: 0 };
      }
      deviceTypeMap[deviceType].total++;
      if (result.result === 'pass') deviceTypeMap[deviceType].passed++;
      else if (result.result === 'fail') deviceTypeMap[deviceType].failed++;
      else deviceTypeMap[deviceType].na++;
    }
    
    const deviceSummaries = Object.entries(deviceTypeMap).map(([deviceType, stats]) => ({
      deviceType,
      ...stats
    }));
    
    // Get technician details + template checklist responses + company settings (parallel)
    const [technician, rawTemplateData, companySettings] = await Promise.all([
      db.getUserById(job.assignedTechnicianId || ctx.user.id),
      fetchTemplateReportData(input.jobId, job.companyId),
      db.getCompanySettings(job.companyId),
    ]);

    // Pre-fetch company logo buffer before entering the synchronous PDF callback
    const companyLogoBuffer = companySettings.logoUrl
      ? await fetchImageBuffer(companySettings.logoUrl)
      : undefined;

    const companyDisplayName = companySettings.companyDisplayName || company?.name || 'Earth Wind & Fire Protection';


    // Generate PDF with Fire-Pro style
    const pdfBuffer = await generateInspectionReportPDF({
      jobNumber: job.jobNumber,
      jobTitle: job.title,
      siteName: site.name,
      siteAddress: site.address || '',
      siteCity: site.city || '',
      siteState: site.state || '',
      customerName: customerOrg?.name || 'Unknown Customer',
      customerAddress: customerOrg?.address || '',
      customerCity: '',
      customerState: '',
      customerPostalCode: '',
      attentionTo: customerOrg?.contactName || '',
      attentionEmail: customerOrg?.contactEmail || '',
      inspectionDate: job.scheduledDate || new Date(),
      completedDate: job.completedAt,
      technicianName: technician?.name || ctx.user.name || undefined,
      technicianTitle: (technician as any)?.certificationLevel || 'Fire Alarm Technician',
      technicianCertNumber: (technician as any)?.certNumber || '',
      technicianEmail: technician?.email || ctx.user.email || undefined,
      companyName: companyDisplayName,
      companyAddress: company?.address || '',
      companyPhone: company?.phone || undefined,
      companyEmail: company?.email || undefined,
      companyLogoBuffer,
      reportFooterText: companySettings.reportFooterText || undefined,
      summary: input.summary,
      deviceSummaries,
      deficiencies: await Promise.all(deficiencies.map(async (d) => {
        // Get device info if deviceId exists
        let deviceType: string | undefined = undefined;
        let location: string | undefined = undefined;
        if (d.deviceId) {
          const device = await db.getDeviceById(d.deviceId);
          if (device) {
            deviceType = device.deviceType;
            location = device.location || undefined;
          }
        }

        // Pre-fetch customer-facing photo buffers for this deficiency
        let photos: Array<{ buffer: Buffer; caption?: string | null; locationNote?: string | null }> = [];
        try {
          const drizzle = await getDb();
          if (drizzle) {
            const mediaRows = await drizzle
              .select()
              .from(attachments)
              .where(
                and(
                  eq(attachments.entityType, "deficiency"),
                  eq(attachments.entityId, d.id),
                  eq(attachments.uploadStatus, "completed"),
                  eq(attachments.isCustomerFacing, 1),
                )
              )
              .orderBy(attachments.sortOrder, attachments.createdAt);

            const buffers = await Promise.all(
              mediaRows.map(async (row) => {
                const buf = await fetchImageBuffer(row.fileUrl);
                if (!buf) return null;
                return { buffer: buf, caption: row.caption, locationNote: row.locationNote };
              })
            );
            photos = buffers.filter((b): b is NonNullable<typeof b> => b !== null);
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
      })),
      inspectionResults: inspectionResults.map(r => ({
        deviceId: r.deviceId,
        deviceType: r.deviceType || 'Unknown',
        location: r.location,
        serialNumber: r.serialNumber,
        result: r.result,
        notes: r.notes,
      })),
      // Include missing location info if override mode is enabled
      missingLocationDeficiencies: allowOverride && locationValidation.missingDeficiencies.length > 0
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
      templateChecklistSections: rawTemplateData.length > 0 ? rawTemplateData : undefined,
    });

    // Upload to S3
    const fileKey = `reports/${job.companyId}/Inspectra-${job.jobNumber.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
    
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
      status: 'generated',
    });
    
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
      const { uploadReportToDrive } = await import('../_core/driveUpload');
      const driveFileName = `${new Date().toISOString().split("T")[0]} Deficiency Report - ${reportNumber}.pdf`;
      const driveResult = await uploadReportToDrive({
        userId: ctx.user.id,
        pdfBuffer,
        fileName: driveFileName,
        customerOrgName: customerOrg?.name || "Unknown Customer",
        siteName: site.name,
      });
      if (driveResult) {
        await db.updateReport(report.id, { googleDriveUrl: driveResult.webViewLink });
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

  generateCompliancePDF: officeProcedure.input(z.object({
    jobId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    // DEPRECATED: Use annualReport.generate instead
    console.warn('[DEPRECATED] report.generateCompliancePDF is deprecated. Use annualReport.generate instead.');
    
    // Get job details
    const job = await db.getJobById(input.jobId);
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    
    // Get site details
    const site = await db.getSiteById(job.siteId);
    if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
    
    // Get customer org
    const customerOrg = await db.getCustomerOrgById(job.customerOrgId);
    
    // Get company
    const company = await db.getCompanyById(job.companyId);
    
    // Get inspection results with device info
    const inspectionResults = await db.getInspectionResultsByJob(input.jobId);
    
    // Get deficiencies
    const deficiencies = await db.getDeficienciesByJob(input.jobId);
    
    // Get technician details
    const technician = await db.getUserById(job.assignedTechnicianId || ctx.user.id);
    
    // Validate device locations before generating Annual report
    const { validateAnnualReportLocations } = await import('../locationValidation');
    const locationValidation = validateAnnualReportLocations({
      fireAlarmDevices: inspectionResults
        .filter(r => r.deviceType?.toLowerCase().includes('smoke') || 
                     r.deviceType?.toLowerCase().includes('heat') || 
                     r.deviceType?.toLowerCase().includes('pull') ||
                     r.deviceType?.toLowerCase().includes('horn') ||
                     r.deviceType?.toLowerCase().includes('strobe'))
        .map(r => ({
          id: r.id,
          deviceType: r.deviceType || 'Unknown',
          location: r.location,
          identification: r.serialNumber,
        })),
      fireExtinguishers: inspectionResults
        .filter(r => r.deviceType?.toLowerCase().includes('extinguisher'))
        .map(r => ({
          id: r.id,
          location: r.location,
          serialNumber: r.serialNumber,
        })),
      emergencyLights: inspectionResults
        .filter(r => r.deviceType?.toLowerCase().includes('emergency') || 
                     r.deviceType?.toLowerCase().includes('exit'))
        .map(r => ({
          id: r.id,
          location: r.location,
          identification: r.serialNumber,
        })),
    });
    
    if (!locationValidation.isValid) {
      const missingList = locationValidation.missingDevices
        .map(d => `  - ${d.type} (ID: ${d.id}${d.identification ? `, ${d.identification}` : ''}${d.deviceType ? `, Type: ${d.deviceType}` : ''})`)
        .join('\n');
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot generate Annual report: ${locationValidation.totalMissing} device(s) missing location information.\n\nMissing locations for:\n${missingList}\n\nPlease add locations to all devices before generating the Annual Inspection Report.`,
      });
    }
    
    // Fetch saved checklist responses
    const savedResponses = await db.getChecklistResponsesByJob(input.jobId);

    // Build a map of responses for quick lookup
    const responseMap = new Map<string, { status: 'PASS' | 'DEFICIENT' | 'NA'; comment?: string }>();
    savedResponses.forEach(r => {
      const key = `${r.sectionNumber}-${r.itemId}`;
      responseMap.set(key, {
        status: r.status,
        comment: r.comment || undefined,
      });
    });
    
    // Helper to convert saved responses to checklist format
    const buildOverrides = (sectionNumber: string) => {
      const overrides: Record<string, 'YES' | 'NO' | 'N/A'> = {};
      savedResponses
        .filter(r => r.sectionNumber === sectionNumber)
        .forEach(r => {
          overrides[r.itemId] = r.status === 'PASS' ? 'YES' : r.status === 'DEFICIENT' ? 'NO' : 'N/A';
        });
      return Object.keys(overrides).length > 0 ? overrides : undefined;
    };
    
    // Build checklist sections using saved responses
    const checklistSections = [
      checklists.getControlUnitInspectionChecklist(
        'LOBBY',
        'EDWARDS EST 3X',
        buildOverrides('22.1')
      ),
      checklists.getControlUnitTestChecklist(
        'LOBBY',
        'EDWARDS EST 3X',
        buildOverrides('22.2'),
        deficiencies.length > 0 ? 'See deficiencies summary for details' : undefined
      ),
      checklists.getPowerSupplyInspectionChecklist(
        'LOBBY',
        'EDWARDS EST 3X',
        'P1 ELECTRICAL RM',
        '#24',
        buildOverrides('22.4')
      ),
      checklists.getEmergencyPowerSupplyChecklist(
        'LOBBY',
        'EDWARDS',
        27.33,
        0.15,
        25.62,
        0.39,
        24.775,
        4.71,
        buildOverrides('22.5')
      ),
      checklists.getAnnunciatorTestChecklist(
        'LOBBY',
        'EDWARDS',
        buildOverrides('22.6'),
        deficiencies.length > 0 ? 'See deficiencies summary for details' : undefined
      ),
      checklists.getCircuitSupervisionChecklist(
        buildOverrides('22.7')
      ),
      checklists.getSmokeDetectorsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('smoke')).length,
        buildOverrides('22.8')
      ),
      checklists.getHeatDetectorsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('heat')).length,
        buildOverrides('22.9')
      ),
      checklists.getDuctDetectorsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('duct')).length,
        buildOverrides('22.10')
      ),
      checklists.getManualPullStationsChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('pull')).length,
        buildOverrides('22.11')
      ),
      checklists.getWaterflowDevicesChecklist(
        buildOverrides('22.12')
      ),
      checklists.getSupervisoryDevicesChecklist(
        buildOverrides('22.13')
      ),
      checklists.getFireSignalReceivingCentreChecklist(
        'BARTEC',
        undefined,
        buildOverrides('22.14')
      ),
      checklists.getAudibleSignalingDevicesChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('horn') || r.deviceType?.toLowerCase().includes('bell')).length,
        buildOverrides('22.15')
      ),
      checklists.getVisualSignalingDevicesChecklist(
        inspectionResults.filter(r => r.deviceType?.toLowerCase().includes('strobe')).length,
        buildOverrides('22.16')
      ),
    ]; // Build device records
    const fireAlarmDevices = inspectionResults
      .filter(r => r.deviceType?.toLowerCase().includes('smoke') || 
                   r.deviceType?.toLowerCase().includes('heat') || 
                   r.deviceType?.toLowerCase().includes('pull') ||
                   r.deviceType?.toLowerCase().includes('horn') ||
                   r.deviceType?.toLowerCase().includes('strobe'))
      .sort((a, b) => {
        // Sort by walkOrder (nulls last), then by location as fallback
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      })
      .map(r => ({
        deviceType: r.deviceType || 'Unknown',
        location: r.location || 'Unknown',
        result: r.result === 'pass' ? 'PASS' as const : r.result === 'fail' ? 'DEFICIENT' as const : 'NO ACCESS' as const,
        notes: r.notes || undefined,
      }));
    
    const fireExtinguishers = inspectionResults
      .filter(r => r.deviceType?.toLowerCase().includes('extinguisher'))
      .sort((a, b) => {
        // Sort by walkOrder (nulls last), then by location as fallback
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      })
      .map(r => ({
        location: r.location || 'Unknown',
        type: r.deviceType || 'Unknown',
        serialNumber: r.serialNumber || undefined,
        result: r.result === 'pass' ? 'PASS' as const : 'DEFICIENT' as const,
      }));
    
    const emergencyLights = inspectionResults
      .filter(r => r.deviceType?.toLowerCase().includes('emergency') || 
                   r.deviceType?.toLowerCase().includes('exit'))
      .sort((a, b) => {
        // Sort by walkOrder (nulls last), then by location as fallback
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      })
      .map(r => ({
        location: r.location || 'Unknown',
        functionalTest: r.result === 'pass' ? 'PASS' as const : 'FAIL' as const,
        durationTest: 'N/A' as const,
        comments: r.notes || undefined,
      }));
    
    // Build deficiencies summary
    const deficienciesSummary = await Promise.all(deficiencies.map(async (d) => {
      let deviceType: string | undefined = undefined;
      let location: string | undefined = undefined;
      if (d.deviceId) {
        const device = await db.getDeviceById(d.deviceId);
        if (device) {
          deviceType = device.deviceType;
          location = device.location || undefined;
        }
      }
      return {
        system: deviceType || 'Fire Alarm System',
        location: location || 'Various',
        description: d.description || 'No description provided',
      };
    }));
    
    // Generate compliance PDF
    const pdfBuffer = await generateComplianceReportPDF({
      workOrderNumber: job.jobNumber,
      dateOfService: job.scheduledDate || new Date(),
      inspectionFrequency: 'Annual',
      contactPerson: customerOrg?.contactName || 'N/A',
      contactPhone: customerOrg?.contactPhone || 'N/A',
      buildingName: site.name,
      buildingAddress: site.address || '',
      city: site.city || '',
      postalCode: site.postalCode || undefined,
      pmOrOwner: customerOrg?.name,
      ownerPhone: customerOrg?.contactPhone || undefined,
      
      systemsInspected: {
        fireAlarmSystem: true,
        commonAreaDevices: true,
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
      
      systemModel: 'EDWARDS EST 3X',
      systemOperation: 'Single Stage',
      fireSignalReceivingCentre: 'BARTEC',
      connectedToFireSignalReceivingCentre: true,
      systemFullyFunctional: deficiencies.length === 0,
      deficienciesIdentified: deficiencies.length > 0,
      deficienciesCorrectedDate: undefined,
      recommendationsIdentified: false,
      
      technicianName: technician?.name || ctx.user.name || 'Unknown',
      technicianCertificateNumber: (technician as any)?.certNumber || '',
      secondaryTechnicianName: undefined,
      secondaryTechnicianCertificateNumber: undefined,
      companyName: company?.name || 'Earth Wind & Fire Protection',
      companyPhone: company?.phone || '604-299-1030',
      
      checklists: checklistSections,
      fireAlarmDevices,
      fireExtinguishers,
      emergencyLights,
      deficiencies: deficienciesSummary,
      // Signature captured during job completion
      techSignatureUrl: (job as any).techSignatureUrl || undefined,
    });

    // Upload to S3
    const fileKey = `reports/${job.companyId}/Inspectra-${job.jobNumber.replace(/[^a-zA-Z0-9]/g, '-')}-compliance-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
    
    // Create report record
    const reportNumber = `CMP-${Date.now().toString(36).toUpperCase()}`;
    const stats = await db.getInspectionStats(input.jobId);
    
    const report = await db.createReport({
      jobId: input.jobId,
      title: `CAN/ULC-S536 Compliance Report - ${job.title}`,
      executiveSummary: 'Annual fire alarm system inspection per CAN/ULC-S536:2019',
      aiSummary: 'Annual fire alarm system inspection per CAN/ULC-S536:2019',
      generatedById: ctx.user.id,
      reportNumber,
      deviceCount: stats.total,
      passCount: stats.pass,
      failCount: stats.fail,
      deficiencyCount: deficiencies.length,
      fileKey,
      fileUrl: url,
      status: 'generated',
    });

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
      const { uploadReportToDrive } = await import('../_core/driveUpload');
      const driveFileName = `${new Date().toISOString().split("T")[0]} Annual Report - ${reportNumber}.pdf`;
      const driveResult = await uploadReportToDrive({
        userId: ctx.user.id,
        pdfBuffer,
        fileName: driveFileName,
        customerOrgName: customerOrg?.name || "Unknown Customer",
        siteName: site.name,
      });
      if (driveResult) {
        await db.updateReport(report.id, { googleDriveUrl: driveResult.webViewLink });
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
