import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { 
  ClipboardList, 
  RefreshCw, 
  LogOut, 
  Shield,
  Wifi,
  WifiOff,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Link } from "wouter";

export default function TechnicianDashboard() {
  const { user, logout } = useAuth();
  const { isOnline, syncStatus } = useOfflineStorage();
  
  const { data: jobs, isLoading } = trpc.job.listByTechnician.useQuery({});

  const pendingJobs = jobs?.filter(j => j.status === 'pending' || j.status === 'scheduled') || [];
  const inProgressJobs = jobs?.filter(j => j.status === 'in_progress') || [];
  const completedToday = jobs?.filter(j => {
    if (j.status !== 'completed' || !j.completedAt) return false;
    const today = new Date();
    const completed = new Date(j.completedAt);
    return completed.toDateString() === today.toDateString();
  }) || [];

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            <span className="font-bold">Inspectra</span>
          </div>
          <div className="flex items-center gap-3">
            {isOnline ? (
              <span className="online-badge flex items-center gap-1">
                <Wifi className="h-3 w-3" /> Online
              </span>
            ) : (
              <span className="offline-badge flex items-center gap-1">
                <WifiOff className="h-3 w-3" /> Offline
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {user?.name || 'Technician'}</h1>
          <p className="text-muted-foreground">Here's your inspection overview</p>
        </div>

        {/* Sync Status */}
        {(syncStatus.pendingResults > 0 || syncStatus.pendingDeficiencies > 0) && (
          <Card className="border-warning bg-warning/5">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-warning" />
                <div>
                  <p className="font-medium">Pending Sync</p>
                  <p className="text-sm text-muted-foreground">
                    {syncStatus.pendingResults} results, {syncStatus.pendingDeficiencies} deficiencies
                  </p>
                </div>
              </div>
              <Link href="/tech/sync">
                <Button variant="outline" size="sm">Sync Now</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-8 w-8 mx-auto text-warning mb-2" />
              <p className="text-2xl font-bold">{pendingJobs.length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{inProgressJobs.length}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
              <p className="text-2xl font-bold">{completedToday.length}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="font-semibold">Quick Actions</h2>
          <div className="grid gap-3">
            <Link href="/tech/jobs">
              <Card className="inspection-card">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <ClipboardList className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">My Jobs</p>
                      <p className="text-sm text-muted-foreground">View assigned inspections</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/tech/sync">
              <Card className="inspection-card">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent/10 rounded-lg">
                      <RefreshCw className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold">Sync Data</p>
                      <p className="text-sm text-muted-foreground">Upload offline results</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* In Progress Jobs */}
        {inProgressJobs.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold">Continue Working</h2>
            <div className="space-y-2">
              {inProgressJobs.slice(0, 3).map(job => (
                <Link key={job.id} href={`/tech/jobs/${job.id}`}>
                  <Card className="inspection-card">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{job.title}</p>
                        <p className="text-sm text-muted-foreground">{job.jobNumber}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Jobs */}
        {pendingJobs.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold">Upcoming Jobs</h2>
            <div className="space-y-2">
              {pendingJobs.slice(0, 3).map(job => (
                <Link key={job.id} href={`/tech/jobs/${job.id}`}>
                  <Card className="inspection-card">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{job.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {job.scheduledDate 
                            ? new Date(job.scheduledDate).toLocaleDateString()
                            : 'Not scheduled'}
                        </p>
                      </div>
                      <span className="status-pending px-2 py-1 rounded text-xs font-medium border">
                        {job.status}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </main>
    </div>
  );
}
