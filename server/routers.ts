import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      opts.ctx.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      opts.ctx.res.setHeader('Pragma', 'no-cache');
      opts.ctx.res.setHeader('Expires', '0');
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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
});

export type AppRouter = typeof appRouter;
