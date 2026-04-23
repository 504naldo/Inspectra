import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, CheckSquare, Calendar } from 'lucide-react';

export default function JobAssignments() {
  // Using sonner toast for notifications
  const [selectedJobs, setSelectedJobs] = useState<number[]>([]);
  const [bulkTechnicianId, setBulkTechnicianId] = useState<string>('');
  const [filterTechnicianId, setFilterTechnicianId] = useState<string>('all');

  const companyId = 1; // TODO: Get from user context
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = trpc.jobAssignment.listJobsWithAssignees.useQuery({ companyId, status: undefined });
  const { data: technicians, isLoading: techniciansLoading } = trpc.jobAssignment.listTechnicians.useQuery({ companyId });
  const assignJobMutation = trpc.jobAssignment.setJobAssignments.useMutation();
  const bulkAssignMutation = trpc.jobAssignment.bulkAssignJobs.useMutation();
  const createCalendarEventMutation = trpc.calendar.createEvent.useMutation();

  const handleAssignJob = async (jobId: number, technicianId: string | null) => {
    try {
      const techId = Number(technicianId);
      await assignJobMutation.mutateAsync({
        jobId,
        technicianIds: technicianId === 'unassigned' ? [] : [techId],
        leadId: techId, // First assigned technician becomes Lead
      });
      toast.success('Technician assignment updated successfully');
      refetchJobs();

      // After assigning a technician, prompt to add to calendar if job has a date but no event
      const job = jobs?.find((j: any) => j.id === jobId);
      if (job?.scheduledDate && !(job as any)?.googleCalendarEventId && technicianId !== 'unassigned') {
        toast('Add to Google Calendar?', {
          action: {
            label: 'Add',
            onClick: () => {
              createCalendarEventMutation.mutate(
                { jobId },
                {
                  onSuccess: () => toast.success('Calendar event created'),
                  onError: (err) => toast.error(err.message),
                }
              );
            },
          },
          icon: <Calendar className="h-4 w-4" />,
          duration: 8000,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign job');
    }
  };

  const handleBulkAssign = async () => {
    if (selectedJobs.length === 0) {
      toast.error('Please select at least one job to assign');
      return;
    }

    if (!bulkTechnicianId) {
      toast.error('Please select a technician for bulk assignment');
      return;
    }

    try {
      const techId = Number(bulkTechnicianId);
      const result = await bulkAssignMutation.mutateAsync({
        jobIds: selectedJobs,
        technicianIds: bulkTechnicianId === 'unassigned' ? [] : [techId],
        leadId: techId, // Assigned technician becomes Lead
        mode: 'replace',
      });
      toast.success(`${result.added || result.total} jobs assigned successfully`);
      setSelectedJobs([]);
      setBulkTechnicianId('');
      refetchJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign jobs');
    }
  };

  const toggleJobSelection = (jobId: number) => {
    setSelectedJobs(prev =>
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
  };

  const toggleSelectAll = () => {
    if (!filteredJobs) return;
    if (selectedJobs.length === filteredJobs.length) {
      setSelectedJobs([]);
    } else {
      setSelectedJobs(filteredJobs.map((j: any) => j.id));
    }
  };

  const filteredJobs = jobs?.filter((job: any) => {
    if (filterTechnicianId === 'all') return true;
    if (filterTechnicianId === 'unassigned') return job.assignedTechnicians?.length === 0;
    return job.assignedTechnicians?.some((t: any) => t.id === Number(filterTechnicianId));
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      pending: 'secondary',
      scheduled: 'default',
      in_progress: 'secondary',
      completed: 'default',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status.replace('_', ' ')}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      low: 'secondary',
      medium: 'default',
      high: 'secondary',
      urgent: 'destructive',
    };
    return <Badge variant={variants[priority] || 'default'}>{priority}</Badge>;
  };

  if (jobsLoading || techniciansLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Job Assignments
          </CardTitle>
          <CardDescription>
            Assign jobs to technicians or manage existing assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters and Bulk Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Filter by Technician</label>
              <Select value={filterTechnicianId} onValueChange={setFilterTechnicianId}>
                <SelectTrigger>
                  <SelectValue placeholder="All jobs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jobs</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {technicians?.map(tech => (
                    <SelectItem key={tech.id} value={String(tech.id)}>
                      {tech.name || tech.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Bulk Assign To</label>
              <div className="flex gap-2">
                <Select value={bulkTechnicianId} onValueChange={setBulkTechnicianId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {technicians?.map(tech => (
                      <SelectItem key={tech.id} value={String(tech.id)}>
                        {tech.name || tech.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleBulkAssign}
                  disabled={selectedJobs.length === 0 || !bulkTechnicianId || bulkAssignMutation.isPending}
                >
                  {bulkAssignMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckSquare className="w-4 h-4" />
                  )}
                  Assign {selectedJobs.length > 0 && `(${selectedJobs.length})`}
                </Button>
              </div>
            </div>
          </div>

          {/* Jobs Table */}
          {filteredJobs && filteredJobs.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3 text-left">
                        <Checkbox
                          checked={selectedJobs.length === filteredJobs.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left text-sm font-medium">Job #</th>
                      <th className="p-3 text-left text-sm font-medium">Title</th>
                      <th className="p-3 text-left text-sm font-medium">Type</th>
                      <th className="p-3 text-left text-sm font-medium">Status</th>
                      <th className="p-3 text-left text-sm font-medium">Priority</th>
                      <th className="p-3 text-left text-sm font-medium">Scheduled</th>
                      <th className="p-3 text-left text-sm font-medium">Assigned To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map(job => (
                      <tr key={job.id} className="border-t hover:bg-muted/50">
                        <td className="p-3">
                          <Checkbox
                            checked={selectedJobs.includes(job.id)}
                            onCheckedChange={() => toggleJobSelection(job.id)}
                          />
                        </td>
                        <td className="p-3 text-sm font-mono">{job.jobNumber}</td>
                        <td className="p-3 text-sm">{job.title}</td>
                        <td className="p-3 text-sm">{job.jobType.replace('_', ' ')}</td>
                        <td className="p-3">{getStatusBadge(job.status)}</td>
                        <td className="p-3">{getPriorityBadge(job.priority)}</td>
                        <td className="p-3 text-sm">
                          {job.scheduledDate
                            ? formatDate(job.scheduledDate)
                            : 'Not scheduled'}
                        </td>
                        <td className="p-3">
                          {job.assignedTechnicians.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {job.assignedTechnicians.map((tech: any) => (
                                <Badge key={tech.id} variant="secondary">
                                  {tech.name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <Select
                              value="unassigned"
                              onValueChange={value => handleAssignJob(job.id, value)}
                              disabled={assignJobMutation.isPending}
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Unassigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">
                                <span className="text-muted-foreground">Unassigned</span>
                              </SelectItem>
                              {technicians?.map(tech => (
                                <SelectItem key={tech.id} value={String(tech.id)}>
                                  {tech.name || tech.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No jobs found matching the selected filter</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
