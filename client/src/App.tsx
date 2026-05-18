import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/OfflineBanner";
import NotFound from "@/pages/NotFound";
import Forbidden from "@/pages/Forbidden";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { useEffect } from "react";
import { getRoleBasedPath } from "./lib/roleRedirect";

// Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import TechnicianDashboard from "./pages/technician/Dashboard";
import JobsList from "./pages/technician/JobsList";
import JobDetails from "./pages/technician/JobDetails";
import DeviceTest from "./pages/technician/DeviceTest";
import DeficiencyList from "./pages/technician/DeficiencyList";
import DeficiencyEditor from "./pages/technician/DeficiencyEditor";
import FireAlarmInspection from "./pages/technician/FireAlarmInspection";
import SmokeAlarmInspection from "./pages/technician/SmokeAlarmInspection";
import SprinklerITM from "./pages/technician/SprinklerITM";
import ChecklistCompletion from "./pages/tech/ChecklistCompletion";
import SyncScreen from "./pages/technician/SyncScreen";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminJobs from "./pages/admin/Jobs";
import AdminJobDetails from "./pages/admin/JobDetails";
import AdminUsers from "./pages/admin/Users";
import AdminCustomers from "./pages/admin/Customers";
import AdminSites from "./pages/admin/Sites";
import FireAlarmSetup from "./pages/admin/FireAlarmSetup";
import AdminDevices from "./pages/admin/Devices";
import AdminReports from "./pages/admin/Reports";
import JobAssignments from "./pages/admin/JobAssignments";
import AdminQACheck from "./pages/admin/QACheck";
import SiteFiles from "./pages/admin/SiteFiles";
import AssetImport from "./pages/admin/AssetImport";
import WorkSiteInfo from "./pages/admin/WorkSiteInfo";
import AdminSchedule from "./pages/admin/Schedule";
import CustomerRecordsPage from "./pages/admin/CustomerRecords";
import AdminWorkOrders from "./pages/admin/WorkOrders";
import AdminQuotes from "./pages/admin/AdminQuotes";
import NewBuildingQuote from "./pages/admin/NewBuildingQuote";
import BuildingQuoteDetail from "./pages/admin/BuildingQuoteDetail";
import PartsCatalog from "./pages/admin/PartsCatalog";
import NewRepairQuote from "./pages/admin/NewRepairQuote";
import RepairQuoteDetail from "./pages/admin/RepairQuoteDetail";
import ApprovedWork from "./pages/admin/ApprovedWork";
import ApprovedWorkDetail from "./pages/admin/ApprovedWorkDetail";
import AdminInvoices from "./pages/admin/Invoices";
import InvoiceDetail from "./pages/admin/InvoiceDetail";
import CompanySettings from "./pages/admin/CompanySettings";
import DataQuality from "./pages/admin/DataQuality";
import ImportCenter from "./pages/admin/ImportCenter";
import Notifications from "./pages/admin/Notifications";
import ReportQA from "./pages/admin/ReportQA";
import DocumentCenter from "./pages/admin/DocumentCenter";
import ComplianceDashboard from "./pages/admin/ComplianceDashboard";
import SchedulingAutomation from "./pages/admin/SchedulingAutomation";
import AIAssistant from "./pages/admin/AIAssistant";
import KnowledgeBase from "./pages/admin/KnowledgeBase";
import ServiceAgreements from "./pages/admin/ServiceAgreements";
import ServiceAgreementDetail from "./pages/admin/ServiceAgreementDetail";
import AssetLifecycle from "./pages/admin/AssetLifecycle";
import Inventory from "./pages/admin/Inventory";
import PartsRequests from "./pages/admin/PartsRequests";
import PartsRequestDetail from "./pages/admin/PartsRequestDetail";
import Vendors from "./pages/admin/Vendors";
import PurchaseOrders from "./pages/admin/PurchaseOrders";
import PurchaseOrderDetail from "./pages/admin/PurchaseOrderDetail";
import Timesheets from "./pages/admin/Timesheets";
import AdminPayrollHours from "./pages/admin/PayrollHours";
import PayrollReview from "./pages/admin/PayrollReview";
import AdminAvailability from "./pages/admin/Availability";
import TechPayrollHours from "./pages/technician/PayrollHours";
import TechTimeOff from "./pages/technician/TimeOff";
import AccessControl from "./pages/admin/AccessControl";
import SetupWizard from "./pages/admin/SetupWizard";
import InspectionTemplates from "./pages/admin/InspectionTemplates";
import InspectionTemplateDetail from "./pages/admin/InspectionTemplateDetail";
import TemplateFormRenderer from "./pages/technician/TemplateFormRenderer";
import QuoteAccept from "./pages/QuoteAccept";
// Customer portal imports disabled — customer world not active in this release
// import CustomerPortal from "./pages/customer/Portal";
// import CustomerReports from "./pages/customer/Reports";
// import CustomerDeficiencies from "./pages/customer/Deficiencies";

// Protected route wrapper
function ProtectedRoute({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode; 
  allowedRoles?: string[];
}) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Pass current location as returnTo parameter
    const returnTo = encodeURIComponent(location);
    return <Redirect to={`/login?returnTo=${returnTo}`} />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard based on role
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
    if (isAuthenticated && user && location === '/') {
      // Use window.location.href for hard redirect (more reliable on mobile Chrome)
      window.location.href = getRoleBasedPath(user.role);
    }
  }, [loading, isAuthenticated, user, location]);

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/quote/accept" component={QuoteAccept} />

      {/* Technician routes */}
      <Route path="/tech">
        <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
          <TechnicianDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/tech/jobs">
        <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
          <JobsList />
        </ProtectedRoute>
      </Route>
      <Route path="/tech/jobs/:id">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <JobDetails jobId={parseInt(params.id)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/jobs/:jobId/device/:deviceId">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <DeviceTest jobId={parseInt(params.jobId)} deviceId={parseInt(params.deviceId)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/jobs/:jobId/deficiencies">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <DeficiencyList jobId={parseInt(params.jobId)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/deficiency/:id">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <DeficiencyEditor deficiencyId={parseInt(params.id)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/deficiency/new/:jobId">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <DeficiencyEditor jobId={parseInt(params.jobId)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/jobs/:jobId/fire-alarm">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <FireAlarmInspection />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/jobs/:jobId/smoke-alarms">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <SmokeAlarmInspection jobId={parseInt(params.jobId)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/jobs/:jobId/sprinkler-itm">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <SprinklerITM jobId={parseInt(params.jobId)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/jobs/:id/checklist">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
            <ChecklistCompletion />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tech/sync">
        <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
          <SyncScreen />
        </ProtectedRoute>
      </Route>
      <Route path="/tech/payroll-hours">
        <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
          <TechPayrollHours />
        </ProtectedRoute>
      </Route>
      <Route path="/tech/time-off">
        <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
          <TechTimeOff />
        </ProtectedRoute>
      </Route>

      {/* Admin routes */}
      <Route path="/admin">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
          <Route path="/admin/jobs">
            <ProtectedRoute allowedRoles={['admin', 'office']}>
              <AdminJobs />
            </ProtectedRoute>
          </Route>
          <Route path="/admin/jobs/:jobId">
            <ProtectedRoute allowedRoles={['admin', 'office']}>
              <AdminJobDetails />
            </ProtectedRoute>
          </Route>
      <Route path="/admin/job-assignments">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <JobAssignments />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminUsers />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customers">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminCustomers />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/sites">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminSites />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/sites/:siteId/fire-alarm">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office']}>
            <FireAlarmSetup />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/devices">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminDevices />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/reports">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminReports />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/qa/:jobId">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminQACheck jobId={parseInt(params.jobId)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/sites/:siteId/files">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <SiteFiles />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/sites/:siteId/import">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AssetImport />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/sites/:siteId/work-site-info">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office']}>
            <WorkSiteInfo siteId={parseInt(params.siteId)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/schedule">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminSchedule />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer-records">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <CustomerRecordsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/work-orders">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminWorkOrders />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/quotes/new">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <NewBuildingQuote />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/quotes/:id">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <BuildingQuoteDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/quotes">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminQuotes />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/parts-catalog">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <PartsCatalog />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/repair-quotes/new">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <NewRepairQuote />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/repair-quotes/:id">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <RepairQuoteDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/approved-work">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <ApprovedWork />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/approved-work/:id">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office']}>
            <ApprovedWorkDetail id={parseInt(params.id)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/invoices">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminInvoices />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/invoices/:id">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office']}>
            <InvoiceDetail id={parseInt(params.id)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <CompanySettings />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/data-quality">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <DataQuality />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/imports">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <ImportCenter />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/notifications">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <Notifications />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/report-qa">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <ReportQA />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/documents">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <DocumentCenter />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/compliance">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <ComplianceDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/scheduling-automation">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <SchedulingAutomation />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/ai-assistant">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AIAssistant />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/knowledge-base">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <KnowledgeBase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/service-agreements/:id">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office']}>
            <ServiceAgreementDetail id={parseInt(params.id)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/service-agreements">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <ServiceAgreements />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/asset-lifecycle">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AssetLifecycle />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/inventory">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <Inventory />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/parts-requests/:id">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office']}>
            <PartsRequestDetail id={parseInt(params.id)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/parts-requests">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <PartsRequests />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/vendors">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <Vendors />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/purchase-orders/:id">
        {(params) => (
          <ProtectedRoute allowedRoles={['admin', 'office']}>
            <PurchaseOrderDetail id={parseInt(params.id)} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/purchase-orders">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <PurchaseOrders />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/timesheets">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <Timesheets />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/payroll-hours">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminPayrollHours />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/payroll-review">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <PayrollReview />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/availability">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AdminAvailability />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/access-control">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <AccessControl />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/setup">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <SetupWizard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/inspection-templates/:id">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <InspectionTemplateDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/inspection-templates">
        <ProtectedRoute allowedRoles={['admin', 'office']}>
          <InspectionTemplates />
        </ProtectedRoute>
      </Route>
      <Route path="/tech/jobs/:jobId/template/:templateId">
        <ProtectedRoute allowedRoles={['admin', 'office', 'technician']}>
          <TemplateFormRenderer />
        </ProtectedRoute>
      </Route>

      {/* Customer routes — disabled, customer portal not active in this release */}
      <Route path="/customer">
        <Redirect to="/forbidden" />
      </Route>
      <Route path="/customer/reports">
        <Redirect to="/forbidden" />
      </Route>
      <Route path="/customer/deficiencies">
        <Redirect to="/forbidden" />
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
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <OfflineBanner />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
