import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import AdminSchedule from "./pages/admin/Schedule";
import CustomerRecordsPage from "./pages/admin/CustomerRecords";
import AdminWorkOrders from "./pages/admin/WorkOrders";
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
  const [location, setLocation] = useLocation();

  // Global auth guard: redirect authenticated users from home to dashboard
  useEffect(() => {
    console.log('[App] Auth guard check:', {
      loading,
      isAuthenticated,
      userRole: user?.role,
      location,
    });
    
    // Only run after auth state is loaded
    if (loading) {
      console.log('[App] Still loading auth state, skipping redirect');
      return;
    }
    
    // If user is authenticated and on home page, redirect to role-based dashboard
    if (isAuthenticated && user && location === '/') {
      const targetPath = getRoleBasedPath(user.role);
      console.log('[App] Redirecting from home to:', targetPath);
      // Use window.location.href for hard redirect (more reliable on mobile Chrome)
      window.location.href = targetPath;
    } else if (location === '/') {
      console.log('[App] On home page but not redirecting:', {
        isAuthenticated,
        hasUser: !!user,
      });
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
