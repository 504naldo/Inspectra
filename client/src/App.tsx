import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";

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
import SyncScreen from "./pages/technician/SyncScreen";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminJobs from "./pages/admin/Jobs";
import AdminUsers from "./pages/admin/Users";
import AdminCustomers from "./pages/admin/Customers";
import AdminSites from "./pages/admin/Sites";
import FireAlarmSetup from "./pages/admin/FireAlarmSetup";
import AdminDevices from "./pages/admin/Devices";
import AdminReports from "./pages/admin/Reports";
import AdminQACheck from "./pages/admin/QACheck";
import SiteFiles from "./pages/admin/SiteFiles";
import AssetImport from "./pages/admin/AssetImport";
import CustomerPortal from "./pages/customer/Portal";
import CustomerReports from "./pages/customer/Reports";
import CustomerDeficiencies from "./pages/customer/Deficiencies";

// Protected route wrapper
function ProtectedRoute({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode; 
  allowedRoles?: string[];
}) {
  const { user, loading, isAuthenticated } = useAuth();

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
    return <Redirect to="/login" />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard based on role
    if (user.role === 'customer') {
      return <Redirect to="/customer" />;
    } else if (user.role === 'technician') {
      return <Redirect to="/tech" />;
    } else {
      return <Redirect to="/admin" />;
    }
  }

  return <>{children}</>;
}

function Router() {
  const { user, isAuthenticated } = useAuth();

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />

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

      {/* Customer routes */}
      <Route path="/customer">
        <ProtectedRoute allowedRoles={['customer']}>
          <CustomerPortal />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/reports">
        <ProtectedRoute allowedRoles={['customer']}>
          <CustomerReports />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/deficiencies">
        <ProtectedRoute allowedRoles={['customer']}>
          <CustomerDeficiencies />
        </ProtectedRoute>
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
