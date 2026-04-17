import React, { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Plus,
  Search,
  ChevronRight,
  Calendar,
  CheckCircle2,
  X,
  Star,
  UserPlus,
  Info
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AdminJobs() {
  const { user } = useAuth();
  
  // Block rendering if user or companyId not available
  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Jobs">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground">Loading session...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }
  
  const companyId = user.companyId;
  
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

  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  
  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<number[]>([]);
  
  const { data: jobs, isLoading, refetch } = trpc.jobAssignment.listJobsWithAssignees.useQuery({
    companyId,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const { data: sites } = trpc.site.listByCompany.useQuery({ companyId });
  const { data: customers } = trpc.customerOrg.list.useQuery({ companyId });
  const { data: technicians, isLoading: techsLoading, error: techsError } = trpc.jobAssignment.listTechnicians.useQuery({ companyId });

  // Last inspection summary — fetched whenever the site selector changes in the create dialog
  const selectedSiteIdNum = newJob.siteId ? parseInt(newJob.siteId) : undefined;
  const { data: lastInspectionSummary } = trpc.site.getLastInspectionSummary.useQuery(
    { siteId: selectedSiteIdNum! },
    { enabled: !!selectedSiteIdNum }
  );
  
  // Deduplicate technicians as a guardrail (backend should already handle this)
  const uniqueTechnicians = React.useMemo(() => {
    if (!technicians) return [];
    const seen = new Set<string>();
    const seenIds = new Set<number>();
    return technicians.filter(tech => {
      // Normalize email: trim and lowercase
      const emailKey = (tech.email ?? '').trim().toLowerCase();
      
      // Dedupe by email if available, otherwise by userId
      if (emailKey) {
        if (seen.has(emailKey)) return false;
        seen.add(emailKey);
      } else {
        if (seenIds.has(tech.id)) return false;
        seenIds.add(tech.id);
      }
      return true;
    });
  }, [technicians]);
  
  const setAssignments = trpc.jobAssignment.setJobAssignments.useMutation({
    onSuccess: () => {
      toast.success('Job assignments updated');
      refetch();
    },
    onError: () => toast.error('Failed to update assignments')
  });

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
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = job.title.toLowerCase().includes(query) || job.jobNumber.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    // Assignment filter
    if (assignmentFilter === 'unassigned') {
      return job.assignedTechnicians.length === 0;
    } else if (assignmentFilter !== 'all') {
      return job.assignedTechnicians.some((t: any) => t.id === parseInt(assignmentFilter));
    }
    
    return true;
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
          
          <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by assignment" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={5}>
              <SelectItem value="all">All Jobs</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {uniqueTechnicians?.map((tech: any) => (
                <SelectItem key={tech.id} value={tech.id.toString()}>
                  Assigned to {tech.name}
                </SelectItem>
              ))}
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
                    {lastInspectionSummary?.found && (
                      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Prior inspection found ({lastInspectionSummary.deviceCount} device{lastInspectionSummary.deviceCount !== 1 ? 's' : ''}, {lastInspectionSummary.jobType?.replace('_', ' ')}
                          {lastInspectionSummary.completedAt ? `, ${new Date(lastInspectionSummary.completedAt).toLocaleDateString()}` : ''}).
                          {' '}Device list will be pre-filled for the technician.
                        </span>
                      </div>
                    )}
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
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="responsive-card-row">
                      <div className="card-content">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(job.status)}`}>
                            {job.status.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-muted-foreground">{job.jobNumber}</span>
                        </div>
                        <h3 className="font-semibold safe-text">{job.title}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                          {job.scheduledDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(job.scheduledDate).toLocaleDateString()}
                            </span>
                          )}
                          <span>{job.jobType}</span>
                        </div>
                      </div>
                      <div className="card-actions">
                        <div className="flex-1 min-w-0">
                          {job.assignedTechnicians.length === 0 ? (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full sm:w-auto"
                              onClick={() => {
                                setSelectedJobId(job.id);
                                setSelectedLeadId(null);
                                setSelectedAssistantIds([]);
                                setAssignModalOpen(true);
                              }}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Assign Technicians
                            </Button>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {job.assignedTechnicians.map((tech: any) => (
                                <div key={tech.id} className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded text-xs">
                                  {tech.role === 'LEAD' && <Star className="h-3 w-3 fill-current" />}
                                  <span>{tech.name}</span>
                                  <button
                                    onClick={() => {
                                      const remaining = job.assignedTechnicians.filter((t: any) => t.id !== tech.id);
                                      const remainingIds = remaining.map((t: any) => t.id);
                                      
                                      if (remainingIds.length === 0) {
                                        // Removing last technician - no Lead needed
                                        setAssignments.mutate({
                                          jobId: job.id,
                                          technicianIds: [],
                                          leadId: 0, // Dummy value, will be ignored when empty
                                        });
                                      } else {
                                        // Find current or new Lead
                                        const currentLead = job.assignedTechnicians.find((t: any) => t.role === 'LEAD');
                                        const isRemovingLead = tech.id === currentLead?.id;
                                        const newLeadId = isRemovingLead ? remainingIds[0] : currentLead?.id;
                                        
                                        setAssignments.mutate({
                                          jobId: job.id,
                                          technicianIds: remainingIds,
                                          leadId: newLeadId,
                                        });
                                      }
                                    }}
                                    className="hover:bg-primary/20 rounded-full p-0.5"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2"
                                onClick={() => {
                                  setSelectedJobId(job.id);
                                  setSelectedLeadId(job.assignedTechnicians.find((t: any) => t.role === 'LEAD')?.id || null);
                                  setSelectedAssistantIds(job.assignedTechnicians.filter((t: any) => t.role === 'ASSIST').map((t: any) => t.id));
                                  setAssignModalOpen(true);
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
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
                        <button
                          onClick={() => window.location.href = `/tech/jobs/${job.id}`}
                          className="p-2 hover:bg-accent rounded-full transition-colors"
                          aria-label="View job details"
                        >
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
            ))}
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Technicians</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {techsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading technicians...
              </div>
            ) : techsError ? (
              <div className="text-center py-8 text-destructive">
                Unable to load technicians. Please try again.
              </div>
            ) : !uniqueTechnicians || uniqueTechnicians.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No technicians found. Add technicians in Admin.
              </div>
            ) : (
              <>
                {/* Lead Technician Section */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Lead Technician (Required)</Label>
                  <RadioGroup value={selectedLeadId?.toString() || ""} onValueChange={(value) => setSelectedLeadId(Number(value))}>
                    {uniqueTechnicians.map((tech: any) => (
                  <div key={tech.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={tech.id.toString()} id={`lead-${tech.id}`} />
                    <Label htmlFor={`lead-${tech.id}`} className="font-normal cursor-pointer">
                      {tech.name}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Additional Technicians Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Additional Technicians (Optional)</Label>
              <div className="space-y-2">
                {technicians
                  ?.filter((tech: any) => tech.id !== selectedLeadId)
                  .map((tech: any) => (
                    <div key={tech.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`assist-${tech.id}`}
                        checked={selectedAssistantIds.includes(tech.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAssistantIds([...selectedAssistantIds, tech.id]);
                          } else {
                            setSelectedAssistantIds(selectedAssistantIds.filter(id => id !== tech.id));
                          }
                        }}
                      />
                      <Label htmlFor={`assist-${tech.id}`} className="font-normal cursor-pointer">
                        {tech.name}
                      </Label>
                    </div>
                    ))}
                </div>
              </div>
            </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={techsLoading || !!techsError || !uniqueTechnicians || uniqueTechnicians.length === 0}
              onClick={() => {
                if (!selectedLeadId) {
                  toast.error('Please select a Lead technician');
                  return;
                }
                if (selectedJobId) {
                  const allTechnicianIds = [selectedLeadId, ...selectedAssistantIds];
                  setAssignments.mutate({
                    jobId: selectedJobId,
                    technicianIds: allTechnicianIds,
                    leadId: selectedLeadId,
                  });
                  setAssignModalOpen(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
