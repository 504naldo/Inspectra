import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList,
  Building2,
  AlertTriangle,
  FileText,
  TrendingUp,
  Plus,
} from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { user } = useAuth();

  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  const companyId = user.companyId;

  const { data: stats } = trpc.dashboard.getStats.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: recentJobs } = trpc.dashboard.getRecentJobs.useQuery(
    { companyId, limit: 5 },
    { enabled: !!companyId }
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {user?.name || 'Admin'}</h1>
          <p className="text-muted-foreground">Here's an overview of your operations</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalJobs || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.activeJobs || 0} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Deficiencies</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.openDeficiencies || 0}</div>
              <p className="text-xs text-muted-foreground">
                Requiring attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalSites || 0}</div>
              <p className="text-xs text-muted-foreground">
                Managed locations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalDevices || 0}</div>
              <p className="text-xs text-muted-foreground">
                Tracked assets
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/admin/jobs">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Job
                </Button>
              </Link>
              <Link href="/admin/customers">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              </Link>
              <Link href="/admin/reports">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Jobs</CardTitle>
              <CardDescription>Latest inspection jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {recentJobs?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs yet</p>
              ) : (
                <div className="space-y-2">
                  {recentJobs?.map((job: any) => (
                    <Link key={job.id} href={`/tech/jobs/${job.id}`}>
                      <div className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer">
                        <div>
                          <p className="font-medium text-sm">{job.title}</p>
                          <p className="text-xs text-muted-foreground">{job.jobNumber}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          job.status === 'completed' ? 'status-pass' :
                          job.status === 'in_progress' ? 'bg-primary/10 text-primary' :
                          'status-pending'
                        }`}>
                          {job.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
