import { useAuth } from "@/_core/hooks/useAuth";
import { usePortalPreview } from "@/contexts/PortalPreviewContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CustomerLayout from "@/components/CustomerLayout";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { Link } from "wouter";

export default function CustomerPortal() {
  const { user } = useAuth();
  const { previewOrg } = usePortalPreview();
  const customerOrgId = previewOrg?.id ?? user?.customerOrgId!;

  const { data: org } = trpc.customerOrg.get.useQuery(
    { id: customerOrgId },
    { enabled: !!customerOrgId }
  );

  const { data: jobs } = trpc.job.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const { data: reports } = trpc.report.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const { data: deficiencies } = trpc.deficiency.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const completedJobs = jobs?.filter((j: any) => j.status === "completed").length ?? 0;
  const pendingReports = reports?.filter((r: any) => r.status === "sent").length ?? 0;
  const approvedReports = reports?.filter((r: any) => r.status === "approved").length ?? 0;
  const openDeficiencies =
    deficiencies?.filter((d: any) => d.status === "open" || d.status === "in_progress").length ?? 0;

  const now = new Date();
  const upcomingJobs =
    jobs
      ?.filter(
        (j: any) =>
          (j.status === "scheduled" || j.status === "pending") &&
          j.scheduledDate &&
          new Date(j.scheduledDate) >= now
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
      )
      .slice(0, 3) ?? [];

  const recentJobs = jobs?.slice(0, 5) ?? [];

  return (
    <CustomerLayout>
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">
            {org?.name ?? user?.name ?? "Customer"} Portal
          </h1>
          <p className="text-muted-foreground">
            Fire & life safety inspection records for your properties
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Inspections</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedJobs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reports Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingReports}</div>
              {pendingReports > 0 && (
                <p className="text-xs text-amber-600 mt-1">Awaiting your approval</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved Reports</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvedReports}</div>
            </CardContent>
          </Card>

          <Card className={openDeficiencies > 0 ? "border-amber-300" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Deficiencies</CardTitle>
              <AlertTriangle
                className={`h-4 w-4 ${openDeficiencies > 0 ? "text-amber-500" : "text-muted-foreground"}`}
              />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${openDeficiencies > 0 ? "text-amber-600" : ""}`}>
                {openDeficiencies}
              </div>
              {openDeficiencies > 0 && (
                <p className="text-xs text-amber-600 mt-1">Requires attention</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming inspections */}
        {upcomingJobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Upcoming Inspections
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingJobs.map((job: any) => (
                <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.jobNumber} · {job.jobType?.replace(/_/g, " ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {new Date(job.scheduledDate).toLocaleDateString("en-CA", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <Badge variant="outline" className="text-xs">Scheduled</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick links */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/customer/sites">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Your Sites</h3>
                    <p className="text-sm text-muted-foreground">View your properties</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/customer/reports">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Inspection Reports</h3>
                    <p className="text-sm text-muted-foreground">View and approve reports</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/customer/deficiencies">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-100 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Deficiencies</h3>
                    <p className="text-sm text-muted-foreground">Track open issues</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent inspections */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Inspections</CardTitle>
            <CardDescription>Your latest inspection jobs</CardDescription>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No inspections found</p>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{job.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {job.jobNumber} · {job.jobType?.replace(/_/g, " ")}
                        {job.scheduledDate && (
                          <> · {new Date(job.scheduledDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "default"
                          : job.status === "in_progress"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {job.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
