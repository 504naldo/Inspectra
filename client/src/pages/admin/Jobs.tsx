import React, { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SiteCombobox } from "@/components/SiteCombobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDate, parseDateInput, combineDateTimeInput, formatScheduleRange } from "@/lib/utils";
import {
  Plus,
  Search,
  ChevronRight,
  Calendar,
  Clock,
  ClipboardList,
  CheckCircle2,
  X,
  Star,
  UserPlus,
  Info,
  Trash2,
  Siren
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { getJobStatusLabel, getJobStatusBadgeClass } from "@/lib/statusLabels";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);

  // Emergency call form state
  const [emergencyForm, setEmergencyForm] = useState({
    siteId: "",
    description: "",
    callerName: "",
    callerPhone: "",
  });

  // Form state
  const [newJob, setNewJob] = useState({
    title: "",
    description: "",
    siteId: "",
    customerOrgId: "",
    jobType: "annual",
    priority: "medium",
    scheduledDate: "",
    startTime: "",
    endTime: "",
    scopeOfWork: "",
  });

  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  
  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<number[]>([]);

  // Delete confirmation state
  const [deleteJobId, setDeleteJobId] = useState<number | null>(null);
  
  const { data: jobs, isLoading, refetch } = trpc.jobAssignment.listJobsWithAssignees.useQuery({
    companyId,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const { data: sites, isLoading: sitesLoading } = trpc.site.listByCompany.useQuery({ companyId });
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

  const deleteJob = trpc.job.delete.useMutation({
    onSuccess: () => {
      toast.success('Job deleted');
      setDeleteJobId(null);
      refetch();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to delete job'),
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
        startTime: "",
        endTime: "",
        scopeOfWork: "",
      });
      refetch();
    },
    onError: () => toast.error('Failed to create job')
  });

  const createEmergencyCall = trpc.job.createEmergencyCall.useMutation({
    onSuccess: (data: any) => {
      toast.success(
        data.notifiedCount > 0
          ? `Emergency job created — ${data.notifiedCount} on-call technician${data.notifiedCount === 1 ? '' : 's'} notified`
          : 'Emergency job created — no on-call technicians to notify'
      );
      setIsEmergencyOpen(false);
      setEmergencyForm({ siteId: "", description: "", callerName: "", callerPhone: "" });
      refetch();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to create emergency job'),
  });

  const handleCreateEmergencyCall = () => {
    if (!emergencyForm.siteId || !emergencyForm.description) {
      toast.error('Please select a site and describe the issue');
      return;
    }
    createEmergencyCall.mutate({
      siteId: parseInt(emergencyForm.siteId),
      description: emergencyForm.description,
      callerName: emergencyForm.callerName || undefined,
      callerPhone: emergencyForm.callerPhone || undefined,
    });
  };

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
    // Start/end times only apply when a date is chosen; they require a date.
    if ((newJob.startTime || newJob.endTime) && !newJob.scheduledDate) {
      toast.error('Pick a scheduled date before setting a start or end time');
      return;
    }
    if (newJob.startTime && newJob.endTime && newJob.endTime <= newJob.startTime) {
      toast.error('End time must be after the start time');
      return;
    }
    const date = newJob.scheduledDate;
    createJob.mutate({
      companyId,
      siteId: parseInt(newJob.siteId),
      customerOrgId: parseInt(newJob.customerOrgId),
      title: newJob.title,
      description: newJob.description || undefined,
      jobType: newJob.jobType as any,
      priority: newJob.priority as any,
      scheduledDate: date ? parseDateInput(date) : undefined,
      scheduledStartAt: date && newJob.startTime ? combineDateTimeInput(date, newJob.startTime) : undefined,
      scheduledEndAt: date && newJob.endTime ? combineDateTimeInput(date, newJob.endTime) : undefined,
      scopeOfWork: newJob.scopeOfWork.trim() || undefined,
    });
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
          
          <Dialog open={isEmergencyOpen} onOpenChange={setIsEmergencyOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Siren className="h-4 w-4 mr-2" />
                Report Emergency
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Siren className="h-5 w-5 text-destructive" />
                  Report Emergency Call
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Site *</Label>
                  <Select
                    value={emergencyForm.siteId}
                    onValueChange={(v) => setEmergencyForm({ ...emergencyForm, siteId: v })}
                    disabled={sitesLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={sitesLoading ? "Loading sites…" : "Select site"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.length === 0 ? (
                        <SelectItem value="__none" disabled>No sites found</SelectItem>
                      ) : (
                        (sites ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Textarea
                    value={emergencyForm.description}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, description: e.target.value })}
                    placeholder="Describe the emergency..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Caller Name</Label>
                    <Input
                      value={emergencyForm.callerName}
                      onChange={(e) => setEmergencyForm({ ...emergencyForm, callerName: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Caller Phone</Label>
                    <Input
                      value={emergencyForm.callerPhone}
                      onChange={(e) => setEmergencyForm({ ...emergencyForm, callerPhone: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={handleCreateEmergencyCall}
                  disabled={createEmergencyCall.isPending}
                >
                  {createEmergencyCall.isPending ? 'Creating...' : 'Create Emergency Job & Notify On-Call'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

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
                    <SiteCombobox
                      sites={sites}
                      value={newJob.siteId}
                      onChange={(v) => setNewJob({ ...newJob, siteId: v })}
                      loading={sitesLoading}
                    />
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={newJob.startTime}
                      disabled={!newJob.scheduledDate}
                      onChange={(e) => setNewJob({ ...newJob, startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={newJob.endTime}
                      disabled={!newJob.scheduledDate}
                      onChange={(e) => setNewJob({ ...newJob, endTime: e.target.value })}
                    />
                  </div>
                </div>
                {!newJob.scheduledDate && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    Pick a scheduled date to set start and end times.
                  </p>
                )}

                <div className="space-y-2">
                  <Label>Scope of Work</Label>
                  <Textarea
                    value={newJob.scopeOfWork}
                    onChange={(e) => setNewJob({ ...newJob, scopeOfWork: e.target.value })}
                    placeholder="What the technician will do on site (shown on their schedule + dashboard)…"
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
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
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
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getJobStatusBadgeClass(job.status)}`}>
                            {getJobStatusLabel(job.status)}
                          </span>
                          <span className="text-xs text-muted-foreground">{job.jobNumber}</span>
                        </div>
                        <h3 className="font-semibold safe-text">{job.title}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                          {job.scheduledDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(job.scheduledDate)}
                            </span>
                          )}
                          {(job as any).scheduledStartAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatScheduleRange((job as any).scheduledStartAt, (job as any).scheduledEndAt)}
                            </span>
                          )}
                          <span>{job.jobType}</span>
                        </div>
                        {(job as any).scopeOfWork && (
                          <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1.5">
                            <ClipboardList className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                            <span className="line-clamp-2 safe-text">{(job as any).scopeOfWork}</span>
                          </p>
                        )}
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
                          onClick={() => setDeleteJobId(job.id)}
                          className="p-2 hover:bg-destructive/10 rounded-full transition-colors text-muted-foreground hover:text-destructive"
                          aria-label="Delete job"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

      <AlertDialog open={deleteJobId !== null} onOpenChange={open => { if (!open) setDeleteJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the job and all its inspection data, deficiencies, and reports. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteJobId !== null && deleteJob.mutate({ id: deleteJobId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
