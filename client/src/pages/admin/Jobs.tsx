import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { 
  Plus, 
  Search, 
  ChevronRight,
  Calendar,
  CheckCircle2
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AdminJobs() {
  const { user } = useAuth();
  const companyId = user?.companyId || 1;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  // Form state
  const [newJob, setNewJob] = useState({
    title: "",
    description: "",
    siteId: "",
    customerOrgId: "",
    jobType: "annual",
    priority: "medium",
    scheduledDate: "",
  });

  const { data: jobs, isLoading, refetch } = trpc.job.listByCompany.useQuery({
    companyId,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const { data: sites } = trpc.site.listByCompany.useQuery({ companyId });
  const { data: customers } = trpc.customerOrg.list.useQuery({ companyId });

  const createJob = trpc.job.create.useMutation({
    onSuccess: () => {
      toast.success('Job created');
      setIsCreateOpen(false);
      setNewJob({
        title: "",
        description: "",
        siteId: "",
        customerOrgId: "",
        jobType: "annual",
        priority: "medium",
        scheduledDate: "",
      });
      refetch();
    },
    onError: () => toast.error('Failed to create job')
  });

  const filteredJobs = jobs?.filter((job: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.title.toLowerCase().includes(query) ||
      job.jobNumber.toLowerCase().includes(query)
    );
  }) || [];

  const handleCreateJob = () => {
    if (!newJob.title || !newJob.siteId || !newJob.customerOrgId) {
      toast.error('Please fill in required fields');
      return;
    }
    createJob.mutate({
      companyId,
      siteId: parseInt(newJob.siteId),
      customerOrgId: parseInt(newJob.customerOrgId),
      title: newJob.title,
      description: newJob.description || undefined,
      jobType: newJob.jobType as any,
      priority: newJob.priority as any,
      scheduledDate: newJob.scheduledDate ? new Date(newJob.scheduledDate) : undefined,
    });
  };

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

  return (
    <AdminLayout title="Jobs">
      <div className="space-y-6">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Job</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    value={newJob.title}
                    onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                    placeholder="Job title"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <Select 
                      value={newJob.customerOrgId} 
                      onValueChange={(v) => setNewJob({ ...newJob, customerOrgId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Site *</Label>
                    <Select 
                      value={newJob.siteId} 
                      onValueChange={(v) => setNewJob({ ...newJob, siteId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites?.map((s: any) => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Job Type</Label>
                    <Select 
                      value={newJob.jobType} 
                      onValueChange={(v) => setNewJob({ ...newJob, jobType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="service_call">Service Call</SelectItem>
                        <SelectItem value="repair">Repair</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select 
                      value={newJob.priority} 
                      onValueChange={(v) => setNewJob({ ...newJob, priority: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Scheduled Date</Label>
                  <Input
                    type="date"
                    value={newJob.scheduledDate}
                    onChange={(e) => setNewJob({ ...newJob, scheduledDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newJob.description}
                    onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
                    placeholder="Job description..."
                  />
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleCreateJob}
                  disabled={createJob.isPending}
                >
                  {createJob.isPending ? 'Creating...' : 'Create Job'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Jobs List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No jobs found</p>
              <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Job
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job: any) => (
              <Link key={job.id} href={`/tech/jobs/${job.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(job.status)}`}>
                            {job.status.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-muted-foreground">{job.jobNumber}</span>
                        </div>
                        <h3 className="font-semibold truncate">{job.title}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          {job.scheduledDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(job.scheduledDate).toLocaleDateString()}
                            </span>
                          )}
                          <span>{job.jobType}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.status === 'completed' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.location.href = `/admin/qa/${job.id}`;
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            QA
                          </Button>
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
