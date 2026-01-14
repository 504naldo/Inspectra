import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { 
  ArrowLeft, 
  Search, 
  MapPin, 
  Calendar,
  ChevronRight,
  Wifi,
  WifiOff,
  Download,
  User
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { toast } from "sonner";

export default function JobsList() {
  const { user } = useAuth();
  const { isOnline, cacheJobData } = useOfflineStorage();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");

  // Role-based data fetching
  const isAdmin = user?.role === 'admin' || user?.role === 'office';
  
  // Fetch jobs based on role
  const { data: assignedJobs, isLoading: techJobsLoading } = trpc.jobAssignment.listMyJobs.useQuery(
    undefined,
    { enabled: !isAdmin }
  );
  const companyId = user?.companyId || 1;
  const { data: allJobsData, isLoading: adminJobsLoading } = trpc.jobAssignment.listJobsWithAssignees.useQuery(
    { companyId, status: undefined },
    { enabled: isAdmin }
  );
  const { data: technicians } = trpc.jobAssignment.listTechnicians.useQuery(
    { companyId },
    { enabled: isAdmin }
  );
  
  const isLoading = isAdmin ? adminJobsLoading : techJobsLoading;
  const jobsData = isAdmin ? allJobsData : assignedJobs;
  
  // Assignment mutation
  const utils = trpc.useUtils();
  const assignMutation = trpc.jobAssignment.setJobAssignments.useMutation({
    onSuccess: () => {
      utils.jobAssignment.listJobsWithAssignees.invalidate();
      toast.success('Job assignments updated');
    },
    onError: () => {
      toast.error('Failed to update assignments');
    }
  });
  const markSeenMutation = trpc.jobAssignment.markAssignmentsSeen.useMutation();

  // Check for new assignments (assigned after last seen timestamp)
  const newAssignmentsCount = assignedJobs?.filter((job: any) => {
    if (!job.assignedAt || !user?.seenAssignmentsAt) return true;
    return new Date(job.assignedAt) > new Date(user.seenAssignmentsAt);
  }).length || 0;

  // Mark assignments as seen when page loads
  useEffect(() => {
    if (newAssignmentsCount > 0 && user?.role === 'technician') {
      const timer = setTimeout(() => {
        markSeenMutation.mutate();
      }, 2000); // Wait 2 seconds before marking as seen
      return () => clearTimeout(timer);
    }
  }, [newAssignmentsCount, user?.role]);

  // Filter by status tab and technician (for admin)
  const jobs = jobsData?.filter((job: any) => {
    // Status filter
    if (activeTab !== 'all' && job.status !== activeTab) return false;
    
    // Technician filter (admin only)
    if (isAdmin && technicianFilter !== 'all') {
      if (technicianFilter === 'unassigned') {
        return job.assignedTechnicians?.length === 0;
      }
      return job.assignedTechnicians?.some((t: any) => t.id.toString() === technicianFilter);
    }
    
    return true;
  });

  const filteredJobs = jobs?.filter((job: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.title.toLowerCase().includes(query) ||
      job.jobNumber.toLowerCase().includes(query)
    );
  }) || [];

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed': return 'status-pass';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20';
      case 'pending':
      case 'scheduled': return 'status-pending';
      case 'cancelled': return 'status-fail';
      default: return 'status-na';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-warning text-warning-foreground';
      case 'medium': return 'bg-primary text-primary-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const [downloadingJobId, setDownloadingJobId] = useState<number | null>(null);
  
  // Assignment handled in Admin Jobs page with multi-select

  const handleDownload = async (jobId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDownloadingJobId(jobId);
    try {
      const data = await utils.sync.getJobDataForOffline.fetch({ jobId });
      if (data) {
        cacheJobData(jobId, data);
        toast.success('Job data cached for offline use');
      }
    } catch {
      toast.error('Failed to download job data');
    } finally {
      setDownloadingJobId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/tech">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-bold text-lg flex-1">
            My Jobs
            {newAssignmentsCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                {newAssignmentsCount} new
              </span>
            )}
          </h1>
          {isOnline ? (
            <span className="online-badge flex items-center gap-1 text-xs">
              <Wifi className="h-3 w-3" />
            </span>
          ) : (
            <span className="offline-badge flex items-center gap-1 text-xs">
              <WifiOff className="h-3 w-3" />
            </span>
          )}
        </div>
      </header>

      <main className="container py-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
        
        {/* Technician Filter (Admin/Office only) */}
        {isAdmin && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Filter by Technician</label>
            <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="All jobs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {technicians?.map(tech => (
                  <SelectItem key={tech.id} value={tech.id.toString()}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="in_progress">Active</TabsTrigger>
            <TabsTrigger value="completed">Done</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No jobs found</p>
              </div>
            ) : (
              filteredJobs.map(job => (
                <Link key={job.id} href={`/tech/jobs/${job.id}`}>
                  <Card className="inspection-card">
                    <CardContent className="p-4">
                      <div className="responsive-card-row">
                        <div className="card-content">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadgeClass(job.priority)}`}>
                              {job.priority}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(job.status)}`}>
                              {job.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h3 className="font-semibold safe-text">{job.title}</h3>
                          <p className="text-sm text-muted-foreground safe-text">{job.jobNumber}</p>
                          
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                            {job.scheduledDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(job.scheduledDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          
                          {/* Assignment shown in Admin Jobs page */}
                          {isAdmin && (job as any).assignedTechnicians && (job as any).assignedTechnicians.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(job as any).assignedTechnicians.map((tech: any) => (
                                <span key={tech.id} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                                  {tech.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="card-actions">
                          {isOnline && job.status !== 'completed' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => handleDownload(job.id, e)}
                              disabled={downloadingJobId === job.id}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
