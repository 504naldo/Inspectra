import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { incrementUserSessionVersion } from "./db";

// Domain routers
import { companyRouter, customerOrgRouter } from "./routers/entityRouters";
import { siteRouter } from "./routers/siteRouter";
import { areaRouter, deviceRouter, smokeAlarmRouter } from "./routers/deviceRouters";
import { jobRouter } from "./routers/jobRouter";
import { inspectionResultRouter, checklistRouter } from "./routers/inspectionRouter";
import { deficiencyRouter, repairRouter } from "./routers/deficiencyRouter";
import { attachmentRouter, fileTagRouter, uploadQueueRouter } from "./routers/attachmentRouters";
import { reportRouter, annualReportRouter, deficiencyReportRouter } from "./routers/reportRouter";
import { aiRouter } from "./routers/aiRouter";
import { importRouter } from "./routers/importRouter";
import { complianceRouter } from "./routers/complianceRouter";
import { dashboardRouter, syncRouter, userRouter } from "./routers/dashboardRouter";

// Already extracted routers
import { fireAlarmRouter } from "./fireAlarmRouter";
import { sprinklerRouter } from "./sprinklerRouter";
import { jobAssignmentRouter } from "./jobAssignmentRouter";
import { userRouter as userManagementRouter } from "./userRouter";
import { assetImportRouter } from "./routers/assetImportRouter";
import { filesRouter } from "./routers/filesRouter";
import { gmailRouter } from "./routers/gmailRouter";
import { calendarRouter } from "./routers/calendarRouter";
import { driveRouter } from "./routers/driveRouter";
import { fireAlarmFormRouter } from "./routers/fireAlarmFormRouter";
import { customerRecordsRouter } from "./routers/customerRecordsRouter";
import { quoteRouter } from "./routers/quoteRouter";
import { repairQuoteRouter } from "./routers/repairQuoteRouter";
import { serviceScheduleRouter } from "./routers/serviceScheduleRouter";
import { repairLetterRouter } from "./routers/repairLetterRouter";
import { workOrderRouter } from "./routers/workOrderRouter";
import { approvedWorkRouter } from "./routers/approvedWorkRouter";
import { invoiceRouter } from "./routers/invoiceRouter";
import { workSiteInfoRouter } from "./routers/workSiteInfoRouter";
import { partsCatalogRouter } from "./routers/partsCatalogRouter";
import { companySettingsRouter } from "./routers/companySettingsRouter";
import { activityRouter } from "./routers/activityRouter";
import { dataQualityRouter } from "./routers/dataQualityRouter";
import { importCenterRouter } from "./routers/importCenterRouter";
import { notificationRouter } from "./routers/notificationRouter";
import { reportQaRouter } from "./routers/reportQaRouter";
import { documentCenterRouter } from "./routers/documentCenterRouter";
import { schedulingAutomationRouter } from "./routers/schedulingAutomationRouter";
import { technicianRouter } from "./routers/technicianRouter";
import { aiAssistantRouter } from "./routers/aiAssistantRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      opts.ctx.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      opts.ctx.res.setHeader('Pragma', 'no-cache');
      opts.ctx.res.setHeader('Expires', '0');
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      // Invalidate the session server-side so the old JWT can't be reused even if
      // someone retained the cookie value.
      if (ctx.user) {
        await incrementUserSessionVersion(ctx.user.id);
      }
      return { success: true } as const;
    }),
  }),

  company: companyRouter,
  customerOrg: customerOrgRouter,
  site: siteRouter,
  area: areaRouter,
  device: deviceRouter,
  smokeAlarm: smokeAlarmRouter,
  job: jobRouter,
  inspectionResult: inspectionResultRouter,
  deficiency: deficiencyRouter,
  repair: repairRouter,
  attachment: attachmentRouter,
  report: reportRouter,
  annualReport: annualReportRouter,
  deficiencyReport: deficiencyReportRouter,
  checklist: checklistRouter,
  ai: aiRouter,
  user: router({
    ...userRouter._def.procedures,
    ...userManagementRouter._def.procedures,
  }),
  dashboard: dashboardRouter,
  sync: syncRouter,
  fileTag: fileTagRouter,
  uploadQueue: uploadQueueRouter,
  import: importRouter,
  fireAlarm: fireAlarmRouter,
  fireAlarmForm: fireAlarmFormRouter,
  sprinkler: sprinklerRouter,
  jobAssignment: jobAssignmentRouter,
  assetImport: assetImportRouter,
  files: filesRouter,
  compliance: complianceRouter,
  gmail: gmailRouter,
  calendar: calendarRouter,
  drive: driveRouter,
  customerRecords: customerRecordsRouter,
  quote: quoteRouter,
  repairQuote: repairQuoteRouter,
  serviceSchedule: serviceScheduleRouter,
  repairLetter: repairLetterRouter,
  workOrder: workOrderRouter,
  approvedWork: approvedWorkRouter,
  invoice: invoiceRouter,
  workSiteInfo: workSiteInfoRouter,
  partsCatalog: partsCatalogRouter,
  companySettings: companySettingsRouter,
  activity: activityRouter,
  dataQuality: dataQualityRouter,
  importCenter: importCenterRouter,
  notifications: notificationRouter,
  reportQa: reportQaRouter,
  documentCenter: documentCenterRouter,
  schedulingAutomation: schedulingAutomationRouter,
  technician: technicianRouter,
  aiAssistant: aiAssistantRouter,
});

export type AppRouter = typeof appRouter;
