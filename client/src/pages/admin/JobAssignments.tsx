import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, CheckSquare } from 'lucide-react';

export default function JobAssignments() {
  // Using sonner toast for notifications
  const [selectedJobs, setSelectedJobs] = useState<number[]>([]);
  const [bulkTechnicianId, setBulkTechnicianId] = useState<string>('');
  const [filterTechnicianId, setFilterTechnicianId] = useState<string>('all');

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = trpc.jobAssignment.listJobsWithAssignee.useQuery();
  const { data: technicians, isLoading: techniciansLoading } = trpc.jobAssignment.listTechnicians.useQuery();
  const assignJobMutation = trpc.jobAssignment.assignJob.useMutation();
  const bulkAssignMutation = trpc.jobAssignment.bulkAssignJobs.useMutation();

  const handleAssignJob = async (jobId: number, technicianId: string | null) => {
    try {
      await assignJobMutation.mutateAsync({
        jobId,
        technicianId: technicianId === 'unassigned' ? null : Number(technicianId),
      });
      toast.success('Technician assignment updated successfully');
      refetchJobs();
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
      const result = await bulkAssignMutation.mutateAsync({
        jobIds: selectedJobs,
        technicianId: bulkTechnicianId === 'unassigned' ? null : Number(bulkTechnicianId),
      });
      toast.success(`${result.count} jobs assigned successfully`);
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
      setSelectedJobs(filteredJobs.map(j => j.id));
    }
  };

  const filteredJobs = jobs?.filter(job => {
    if (filterTechnicianId === 'all') return true;
    if (filterTechnicianId === 'unassigned') return !job.assignedTechnicianId;
    return job.assignedTechnicianId === Number(filterTechnicianId);
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
                            ? new Date(job.scheduledDate).toLocaleDateString()
                            : 'Not scheduled'}
                        </td>
                        <td className="p-3">
                          <Select
                            value={job.assignedTechnicianId ? String(job.assignedTechnicianId) : 'unassigned'}
                            onValueChange={value => handleAssignJob(job.id, value)}
                            disabled={assignJobMutation.isPending}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue />
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
