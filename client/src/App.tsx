import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/OfflineBanner";
import NotFound from "@/pages/NotFound";
import Forbidden from "@/pages/Forbidden";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  PortalPreviewProvider,
  usePortalPreview,
} from "./contexts/PortalPreviewContext";
import { useAuth } from "./_core/hooks/useAuth";
import { lazy, Suspense, useEffect } from "react";
import { getRoleBasedPath } from "./lib/roleRedirect";
import { useNativeInit } from "./hooks/useNativeInit";

// Pages on the public/critical path stay eager so first paint doesn't wait on an extra chunk fetch.
import Home from "./pages/Home";
import Login from "./pages/Login";
import QuoteAccept from "./pages/QuoteAccept";

// Everything else loads on demand, so a single page visit only ships the JS it needs.
const TechnicianDashboard = lazy(() => import("./pages/technician/Dashboard"));
const JobsList = lazy(() => import("./pages/technician/JobsList"));
const JobDetails = lazy(() => import("./pages/technician/JobDetails"));
const DeviceTest = lazy(() => import("./pages/technician/DeviceTest"));
const DeficiencyList = lazy(() => import("./pages/technician/DeficiencyList"));
const DeficiencyEditor = lazy(
  () => import("./pages/technician/DeficiencyEditor")
);
const FireAlarmInspection = lazy(
  () => import("./pages/technician/FireAlarmInspection")
);
const SmokeAlarmInspection = lazy(
  () => import("./pages/technician/SmokeAlarmInspection")
);
const SprinklerITM = lazy(() => import("./pages/technician/SprinklerITM"));
const ChecklistCompletion = lazy(
  () => import("./pages/tech/ChecklistCompletion")
);
const SyncScreen = lazy(() => import("./pages/technician/SyncScreen"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminJobs = lazy(() => import("./pages/admin/Jobs"));
const AdminJobDetails = lazy(() => import("./pages/admin/JobDetails"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers"));
const AdminSites = lazy(() => import("./pages/admin/Sites"));
const FireAlarmSetup = lazy(() => import("./pages/admin/FireAlarmSetup"));
const AdminDevices = lazy(() => import("./pages/admin/Devices"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const JobAssignments = lazy(() => import("./pages/admin/JobAssignments"));
const AdminQACheck = lazy(() => import("./pages/admin/QACheck"));
const SiteFiles = lazy(() => import("./pages/admin/SiteFiles"));
const SiteKnowledge = lazy(() => import("./pages/admin/SiteKnowledge"));
const EquipmentKnowledgeList = lazy(
  () => import("./pages/admin/EquipmentKnowledgeList")
);
const EquipmentKnowledgeDetail = lazy(
  () => import("./pages/admin/EquipmentKnowledgeDetail")
);
const KnowledgeReviewQueue = lazy(
  () => import("./pages/admin/KnowledgeReviewQueue")
);
const AssetImport = lazy(() => import("./pages/admin/AssetImport"));
const WorkSiteInfo = lazy(() => import("./pages/admin/WorkSiteInfo"));
const AdminSchedule = lazy(() => import("./pages/admin/Schedule"));
const CustomerRecordsPage = lazy(() => import("./pages/admin/CustomerRecords"));
const AdminWorkOrders = lazy(() => import("./pages/admin/WorkOrders"));
const AdminQuotes = lazy(() => import("./pages/admin/AdminQuotes"));
const NewBuildingQuote = lazy(() => import("./pages/admin/NewBuildingQuote"));
const BuildingQuoteDetail = lazy(
  () => import("./pages/admin/BuildingQuoteDetail")
);
const PartsCatalog = lazy(() => import("./pages/admin/PartsCatalog"));
const NewRepairQuote = lazy(() => import("./pages/admin/NewRepairQuote"));
const RepairQuoteDetail = lazy(() => import("./pages/admin/RepairQuoteDetail"));
const ApprovedWork = lazy(() => import("./pages/admin/ApprovedWork"));
const ApprovedWorkDetail = lazy(
  () => import("./pages/admin/ApprovedWorkDetail")
);
const AdminInvoices = lazy(() => import("./pages/admin/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/admin/InvoiceDetail"));
const FinancialReports = lazy(() => import("./pages/admin/FinancialReports"));
const CompanySettings = lazy(() => import("./pages/admin/CompanySettings"));
const DataQuality = lazy(() => import("./pages/admin/DataQuality"));
const ImportCenter = lazy(() => import("./pages/admin/ImportCenter"));
const Notifications = lazy(() => import("./pages/admin/Notifications"));
const ReportQA = lazy(() => import("./pages/admin/ReportQA"));
const DocumentCenter = lazy(() => import("./pages/admin/DocumentCenter"));
const ComplianceDashboard = lazy(
  () => import("./pages/admin/ComplianceDashboard")
);
const SchedulingAutomation = lazy(
  () => import("./pages/admin/SchedulingAutomation")
);
const WorkflowHealth = lazy(() => import("./pages/admin/WorkflowHealth"));
const AIAssistant = lazy(() => import("./pages/admin/AIAssistant"));
const KnowledgeBase = lazy(() => import("./pages/admin/KnowledgeBase"));
const ServiceAgreements = lazy(() => import("./pages/admin/ServiceAgreements"));
const ServiceAgreementDetail = lazy(
  () => import("./pages/admin/ServiceAgreementDetail")
);
const AssetLifecycle = lazy(() => import("./pages/admin/AssetLifecycle"));
const Inventory = lazy(() => import("./pages/admin/Inventory"));
const PartsRequests = lazy(() => import("./pages/admin/PartsRequests"));
const PartsRequestDetail = lazy(
  () => import("./pages/admin/PartsRequestDetail")
);
const Vendors = lazy(() => import("./pages/admin/Vendors"));
const PurchaseOrders = lazy(() => import("./pages/admin/PurchaseOrders"));
const PurchaseOrderDetail = lazy(
  () => import("./pages/admin/PurchaseOrderDetail")
);
const Timesheets = lazy(() => import("./pages/admin/Timesheets"));
const AdminPayrollHours = lazy(() => import("./pages/admin/PayrollHours"));
const PayrollReview = lazy(() => import("./pages/admin/PayrollReview"));
const AdminAvailability = lazy(() => import("./pages/admin/Availability"));
const TechPayrollHours = lazy(() => import("./pages/technician/PayrollHours"));
const TechTimeOff = lazy(() => import("./pages/technician/TimeOff"));
const AccessControl = lazy(() => import("./pages/admin/AccessControl"));
const SetupWizard = lazy(() => import("./pages/admin/SetupWizard"));
const TemplateFormRenderer = lazy(
  () => import("./pages/technician/TemplateFormRenderer")
);
const FeedbackCenter = lazy(() => import("./pages/admin/FeedbackCenter"));
const ContactsPage = lazy(() => import("./pages/admin/Contacts"));
const CustomerPortal = lazy(() => import("./pages/customer/Portal"));
const CustomerReports = lazy(() => import("./pages/customer/Reports"));
const CustomerDeficiencies = lazy(
  () => import("./pages/customer/Deficiencies")
);
const CustomerSites = lazy(() => import("./pages/customer/Sites"));
const CustomerQuotes = lazy(() => import("./pages/customer/Quotes"));
const CustomerInvoices = lazy(() => import("./pages/customer/Invoices"));
const CustomerServiceAgreements = lazy(
  () => import("./pages/customer/ServiceAgreements")
);
const CustomerSettings = lazy(() => import("./pages/customer/Settings"));

function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({
  children,
  allowedRoles,
  allowPreview = false,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowPreview?: boolean;
}) {
  const { user, loading, isAuthenticated } = useAuth();
  const { previewOrg } = usePortalPreview();
  const [location] = useLocation();

  if (loading) {
    return <PageLoadingFallback />;
  }

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location);
    return <Redirect to={`/login?returnTo=${returnTo}`} />;
  }

  // Admin/office users can enter customer portal when they have an active preview org
  const isAdminPreview =
    allowPreview &&
    !!previewOrg &&
    (user?.role === "admin" || user?.role === "office");

  if (
    allowedRoles &&
    user &&
    !allowedRoles.includes(user.role) &&
    !isAdminPreview
  ) {
    const targetPath = getRoleBasedPath(user.role);
    return <Redirect to={targetPath} />;
  }

  return <>{children}</>;
}

function Router() {
  const { user, loading, isAuthenticated } = useAuth();
  const [location] = useLocation();

  // Global auth guard: redirect authenticated users from home to dashboard
  useEffect(() => {
    if (loading) return;
    if (isAuthenticated && user && location === "/") {
      // Use window.location.href for hard redirect (more reliable on mobile Chrome)
      window.location.href = getRoleBasedPath(user.role);
    }
  }, [loading, isAuthenticated, user, location]);

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Switch>
        {/* Public routes */}
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/quote/accept" component={QuoteAccept} />

        {/* Technician routes */}
        <Route path="/tech">
          <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
            <TechnicianDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/tech/jobs">
          <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
            <JobsList />
          </ProtectedRoute>
        </Route>
        <Route path="/tech/jobs/:id">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <JobDetails jobId={parseInt(params.id)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/jobs/:jobId/device/:deviceId">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <DeviceTest
                jobId={parseInt(params.jobId)}
                deviceId={parseInt(params.deviceId)}
              />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/jobs/:jobId/deficiencies">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <DeficiencyList jobId={parseInt(params.jobId)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/deficiency/:id">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <DeficiencyEditor deficiencyId={parseInt(params.id)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/deficiency/new/:jobId">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <DeficiencyEditor jobId={parseInt(params.jobId)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/jobs/:jobId/fire-alarm">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <FireAlarmInspection />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/jobs/:jobId/smoke-alarms">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <SmokeAlarmInspection jobId={parseInt(params.jobId)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/jobs/:jobId/sprinkler-itm">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <SprinklerITM jobId={parseInt(params.jobId)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/jobs/:id/checklist">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
              <ChecklistCompletion />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/tech/sync">
          <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
            <SyncScreen />
          </ProtectedRoute>
        </Route>
        <Route path="/tech/payroll-hours">
          <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
            <TechPayrollHours />
          </ProtectedRoute>
        </Route>
        <Route path="/tech/time-off">
          <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
            <TechTimeOff />
          </ProtectedRoute>
        </Route>

        {/* Admin routes */}
        <Route path="/admin">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/jobs">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminJobs />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/jobs/:jobId">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminJobDetails />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/job-assignments">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <JobAssignments />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/users">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminUsers />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/customers">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminCustomers />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/sites">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminSites />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/sites/:siteId/fire-alarm">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office"]}>
              <FireAlarmSetup />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/devices">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminDevices />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/reports">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminReports />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/qa/:jobId">
          {params => (
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminQACheck jobId={parseInt(params.jobId)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/sites/:siteId/files">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <SiteFiles />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/sites/:siteId/knowledge">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <SiteKnowledge />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/equipment-knowledge/:modelId">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <EquipmentKnowledgeDetail />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/equipment-knowledge">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <EquipmentKnowledgeList />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/knowledge-review">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <KnowledgeReviewQueue />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/sites/:siteId/import">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AssetImport />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/sites/:siteId/work-site-info">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office"]}>
              <WorkSiteInfo siteId={parseInt(params.siteId)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/schedule">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminSchedule />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/customer-records">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <CustomerRecordsPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/work-orders">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminWorkOrders />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/quotes/new">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <NewBuildingQuote />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/quotes/:id">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <BuildingQuoteDetail />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/quotes">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminQuotes />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/parts-catalog">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <PartsCatalog />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/repair-quotes/new">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <NewRepairQuote />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/repair-quotes/:id">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <RepairQuoteDetail />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/approved-work">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <ApprovedWork />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/approved-work/:id">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office"]}>
              <ApprovedWorkDetail id={parseInt(params.id)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/financial-reports">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <FinancialReports />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/invoices">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminInvoices />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/invoices/:id">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office"]}>
              <InvoiceDetail id={parseInt(params.id)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/settings">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <CompanySettings />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/data-quality">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <DataQuality />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/imports">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <ImportCenter />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/notifications">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <Notifications />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/report-qa">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <ReportQA />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/documents">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <DocumentCenter />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/compliance">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <ComplianceDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/scheduling-automation">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <SchedulingAutomation />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/workflow-health">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <WorkflowHealth />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/ai-assistant">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AIAssistant />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/knowledge-base">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <KnowledgeBase />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/service-agreements/:id">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office"]}>
              <ServiceAgreementDetail id={parseInt(params.id)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/service-agreements">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <ServiceAgreements />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/asset-lifecycle">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AssetLifecycle />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/inventory">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <Inventory />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/parts-requests/:id">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office"]}>
              <PartsRequestDetail id={parseInt(params.id)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/parts-requests">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <PartsRequests />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/vendors">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <Vendors />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/purchase-orders/:id">
          {params => (
            <ProtectedRoute allowedRoles={["admin", "office"]}>
              <PurchaseOrderDetail id={parseInt(params.id)} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/admin/purchase-orders">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <PurchaseOrders />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/timesheets">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <Timesheets />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/payroll-hours">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminPayrollHours />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/payroll-review">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <PayrollReview />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/availability">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AdminAvailability />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/access-control">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <AccessControl />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/setup">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <SetupWizard />
          </ProtectedRoute>
        </Route>
        <Route path="/tech/jobs/:jobId/template/:templateId">
          <ProtectedRoute allowedRoles={["admin", "office", "technician"]}>
            <TemplateFormRenderer />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/feedback">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <FeedbackCenter />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/contacts">
          <ProtectedRoute allowedRoles={["admin", "office"]}>
            <ContactsPage />
          </ProtectedRoute>
        </Route>

        {/* Customer portal */}
        <Route path="/customer">
          <ProtectedRoute allowedRoles={["customer"]} allowPreview>
            <CustomerPortal />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/sites">
          <ProtectedRoute allowedRoles={["customer"]} allowPreview>
            <CustomerSites />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/reports">
          <ProtectedRoute allowedRoles={["customer"]} allowPreview>
            <CustomerReports />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/deficiencies">
          <ProtectedRoute allowedRoles={["customer"]} allowPreview>
            <CustomerDeficiencies />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/quotes">
          <ProtectedRoute allowedRoles={["customer"]} allowPreview>
            <CustomerQuotes />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/invoices">
          <ProtectedRoute allowedRoles={["customer"]} allowPreview>
            <CustomerInvoices />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/agreements">
          <ProtectedRoute allowedRoles={["customer"]} allowPreview>
            <CustomerServiceAgreements />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/settings">
          <ProtectedRoute allowedRoles={["customer"]}>
            <CustomerSettings />
          </ProtectedRoute>
        </Route>

        {/* 403 Forbidden */}
        <Route path="/forbidden">
          <Forbidden />
        </Route>

        {/* 404 - Explicit route for intentional 404 pages */}
        <Route path="/404" component={NotFound} />

        {/* Catch-all: redirect unknown routes to home instead of showing 404 */}
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  useNativeInit();
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <PortalPreviewProvider>
          <TooltipProvider>
            <Toaster />
            <OfflineBanner />
            <Router />
          </TooltipProvider>
        </PortalPreviewProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
