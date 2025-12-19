import { useState } from "react";
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
  Download
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function JobsList() {
  const { isOnline, cacheJobData } = useOfflineStorage();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const { data: jobs, isLoading } = trpc.job.listByTechnician.useQuery({
    status: activeTab === 'all' ? undefined : activeTab
  });

  const filteredJobs = jobs?.filter(job => {
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

  const utils = trpc.useUtils();
  const [downloadingJobId, setDownloadingJobId] = useState<number | null>(null);

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
          <h1 className="font-bold text-lg flex-1">My Jobs</h1>
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
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadgeClass(job.priority)}`}>
                              {job.priority}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(job.status)}`}>
                              {job.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h3 className="font-semibold truncate">{job.title}</h3>
                          <p className="text-sm text-muted-foreground">{job.jobNumber}</p>
                          
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            {job.scheduledDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(job.scheduledDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
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
