import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  AlertCircle,
  AlertTriangle,
  Calendar,
  Play,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Link } from "wouter";
import { FeedbackButton } from "@/components/FeedbackButton";
import { PageHelpButton } from "@/components/help/PageHelpButton";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isToday(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const date = new Date(d);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isPast(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  return new Date(d) < new Date();
}

function formatScheduledDate(d: Date | string | null | undefined): string {
  if (!d) return "Not scheduled";
  const date = new Date(d);
  if (isToday(date)) {
    return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "",
  low: "",
};

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: any }) {
  const priority = PRIORITY_COLORS[job.priority as string] ?? "";
  const status = STATUS_COLORS[job.status as string] ?? "bg-gray-100 text-gray-600";

  return (
    <Link href={`/tech/jobs/${job.id}`}>
      <Card className="active:scale-[0.98] transition-transform cursor-pointer hover:bg-accent/30">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={`text-[10px] px-1.5 py-0 ${status}`}>
                {(job.status as string).replace(/_/g, " ")}
              </Badge>
              {priority && (
                <Badge className={`text-[10px] px-1.5 py-0 ${priority}`}>
                  {job.priority}
                </Badge>
              )}
            </div>
            <p className="font-semibold text-sm leading-tight truncate">{job.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{job.jobNumber}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {formatScheduledDate((job as any).scheduledDate)}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count }: { icon: React.ComponentType<{ className?: string }>; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="font-semibold text-sm">{title}</h2>
      {count > 0 && (
        <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">{count}</Badge>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TechnicianDashboard() {
  const { user, logout } = useAuth();
  const { isOnline, syncStatus } = useOfflineStorage();

  const { data: jobs, isLoading } = trpc.job.listByTechnician.useQuery({});

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  // Partition jobs by urgency / timing
  const inProgressJobs = jobs?.filter(j => j.status === "in_progress") ?? [];
  const todayJobs = jobs?.filter(j =>
    (j.status === "pending" || j.status === "scheduled") &&
    isToday((j as any).scheduledDate)
  ) ?? [];
  const overdueJobs = jobs?.filter(j =>
    (j.status === "pending" || j.status === "scheduled") &&
    (j as any).scheduledDate &&
    isPast((j as any).scheduledDate) &&
    !isToday((j as any).scheduledDate)
  ) ?? [];
  const urgentJobs = jobs?.filter(j =>
    j.priority === "urgent" &&
    j.status !== "completed" &&
    j.status !== "cancelled" &&
    !inProgressJobs.includes(j) &&
    !overdueJobs.includes(j) &&
    !todayJobs.includes(j)
  ) ?? [];
  const upcomingJobs = jobs?.filter(j =>
    (j.status === "pending" || j.status === "scheduled") &&
    !(j as any).scheduledDate === false &&
    !isToday((j as any).scheduledDate) &&
    !isPast((j as any).scheduledDate) &&
    !urgentJobs.includes(j)
  ).slice(0, 4) ?? [];

  const completedToday = jobs?.filter(j => {
    if (j.status !== "completed" || !(j as any).completedAt) return false;
    return isToday((j as any).completedAt);
  }) ?? [];

  const hasPendingSync = syncStatus.pendingResults > 0 || syncStatus.pendingDeficiencies > 0;

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
            <Link href="/tech/sync">
              <span
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                  isOnline
                    ? "text-green-700 border-green-200 bg-green-50"
                    : "text-amber-700 border-amber-200 bg-amber-50"
                }`}
              >
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isOnline ? "Online" : "Offline"}
                {hasPendingSync && <span className="font-semibold">&nbsp;·&nbsp;{syncStatus.pendingResults + syncStatus.pendingDeficiencies} pending</span>}
              </span>
            </Link>
            <PageHelpButton size="icon" routeKey="tech_dashboard" />
            <FeedbackButton variant="ghost" size="icon" className="text-muted-foreground" />
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Log out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (
        <main className="container py-5 space-y-6">
          {/* Greeting + stats row */}
          <div>
            <h1 className="text-xl font-bold">
              {user?.name ? `Hi, ${user.name.split(" ")[0]}` : "My Jobs"}
            </h1>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{inProgressJobs.length}</strong> in progress</span>
              <span><strong className="text-foreground">{todayJobs.length}</strong> today</span>
              <span><strong className="text-foreground">{completedToday.length}</strong> done today</span>
            </div>
          </div>

          {/* Pending sync banner */}
          {hasPendingSync && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800 font-medium">
                  {syncStatus.pendingResults + syncStatus.pendingDeficiencies} items waiting to sync
                </p>
              </div>
              <Link href="/tech/sync">
                <Button variant="outline" size="sm" className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100">
                  Sync now
                </Button>
              </Link>
            </div>
          )}

          {/* In progress — highest priority */}
          {inProgressJobs.length > 0 && (
            <div className="space-y-2">
              <SectionHeader icon={Play} title="Continue Inspection" count={inProgressJobs.length} />
              {inProgressJobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}

          {/* Overdue */}
          {overdueJobs.length > 0 && (
            <div className="space-y-2">
              <SectionHeader icon={AlertTriangle} title="Overdue" count={overdueJobs.length} />
              {overdueJobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}

          {/* Today's jobs */}
          {todayJobs.length > 0 && (
            <div className="space-y-2">
              <SectionHeader icon={Calendar} title="Today" count={todayJobs.length} />
              {todayJobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}

          {/* Urgent (not already in overdue/today) */}
          {urgentJobs.length > 0 && (
            <div className="space-y-2">
              <SectionHeader icon={AlertCircle} title="Urgent" count={urgentJobs.length} />
              {urgentJobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}

          {/* Upcoming */}
          {upcomingJobs.length > 0 && (
            <div className="space-y-2">
              <SectionHeader icon={Clock} title="Upcoming" count={upcomingJobs.length} />
              {upcomingJobs.map(job => <JobCard key={job.id} job={job} />)}
            </div>
          )}

          {/* All jobs empty state */}
          {(!jobs || jobs.length === 0) && (
            <div className="rounded-lg border bg-muted/30 p-10 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" />
              <p className="font-medium">No jobs assigned</p>
              <p className="text-sm text-muted-foreground">Your schedule is clear — check back later.</p>
            </div>
          )}

          {/* Quick nav */}
          <div className="space-y-2">
            <h2 className="font-semibold text-sm">Quick access</h2>
            <Link href="/tech/jobs">
              <Card className="active:scale-[0.98] transition-transform cursor-pointer hover:bg-accent/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-lg">
                      <ClipboardList className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">All My Jobs</p>
                      <p className="text-xs text-muted-foreground">View full job list</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/tech/payroll-hours">
              <Card className="active:scale-[0.98] transition-transform cursor-pointer hover:bg-accent/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-green-50 rounded-lg">
                      <Clock className="h-5 w-5 text-green-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">My Payroll Hours</p>
                      <p className="text-xs text-muted-foreground">Log and submit hours</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/tech/time-off">
              <Card className="active:scale-[0.98] transition-transform cursor-pointer hover:bg-accent/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">My Time Off</p>
                      <p className="text-xs text-muted-foreground">Request and track time off</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/tech/sync">
              <Card className="active:scale-[0.98] transition-transform cursor-pointer hover:bg-accent/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-muted rounded-lg">
                      <RefreshCw className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Sync Data</p>
                      <p className="text-xs text-muted-foreground">Upload offline results</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </main>
      )}
    </div>
  );
}
