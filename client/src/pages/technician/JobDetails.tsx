import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { InspectionSummary } from "@/components/InspectionSummary";
import { SiteDetails } from "@/components/SiteDetails";
import { InspectionHeader } from "@/components/inspection/InspectionHeader";
import { IndividualDeviceGrid } from "@/components/inspection/IndividualDeviceGrid";
import { ExtinguisherGrid } from "@/components/inspection/ExtinguisherGrid";
import { EmergencyLightGrid } from "@/components/inspection/EmergencyLightGrid";
import { FireAlarmChecklist } from "@/components/inspection/FireAlarmChecklist";
import { SmokeAlarmGrid } from "@/components/inspection/SmokeAlarmGrid";
import { isSmokeAlarm, categorizeDevice } from "@shared/deviceCategories";
import { sortByWalkOrderThenLocation, sortBySuiteNumberDescending } from "@shared/deviceHelpers";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Play,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Building2,
  Wifi,
  WifiOff,
  Flame,
  FireExtinguisher,
  Lightbulb,
  Droplets,
  Lock
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

interface JobDetailsProps {
  jobId: number;
}

export default function JobDetails({ jobId }: JobDetailsProps) {
  const [location, setLocation] = useLocation();
  const { isOnline, getCachedJobData } = useOfflineStorage();
  const [activeTab, setActiveTab] = useState("devices");
  const [openGridSection, setOpenGridSection] = useState<string | null>(null);

  const toggleGridSection = (section: string) => {
    setOpenGridSection((prev) => (prev === section ? null : section));
  };

  // Get category filter from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const categoryFilter = searchParams.get('category');

  const { data, isLoading, error, refetch } = trpc.job.getWithDetails.useQuery(
    { id: jobId },
    { 
      // Always try to fetch - navigator.onLine is unreliable on mobile networks
      // and can cause false "offline" detection, blocking the query entirely
      enabled: true,
      retry: isOnline ? 2 : 0,
      retryDelay: 1500,
    }
  );

  // Fall back to cached data only when the query actually errors (not just when browser thinks offline)
  const cachedData = (error && !data) ? getCachedJobData(jobId) : null;
  const jobData = data || cachedData;

  const startJob = trpc.job.start.useMutation({
    onSuccess: () => {
      toast.success('Job started');
      refetch();
    },
    onError: () => toast.error('Failed to start job')
  });

  const completeJob = trpc.job.complete.useMutation({
    onSuccess: () => {
      toast.success('Job completed');
      refetch();
    },
    onError: () => toast.error('Failed to complete job')
  });
  
  const importAssets = trpc.assetImport.importAssetsFromExcel.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to import assets');
    }
  });

  if (isLoading && !cachedData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!jobData) {
    return (
      <div className="min-h-screen bg-background safe-top safe-bottom">
        <header className="sticky top-0 z-50 bg-card border-b">
          <div className="container flex h-16 items-center gap-4">
            <Link href="/tech/jobs">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-lg">Job Details</h1>
          </div>
        </header>
        <main className="container py-8 text-center">
          <p className="text-muted-foreground">
            {isOnline ? 'Job not found' : 'Job not cached for offline use'}
          </p>
          <Link href="/tech/jobs">
            <Button className="mt-4">Back to Jobs</Button>
          </Link>
        </main>
      </div>
    );
  }

  const { job, site, devices, inspectionResults, deficiencies, stats } = jobData;
  const isFinalized = !!(job as any).finalizedAt;
  const siteNotes = (() => {
    const raw = (site as any)?.notes as unknown;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && "date" in raw) {
      const dateValue = (raw as { date?: unknown }).date;
      return typeof dateValue === "string" || typeof dateValue === "number"
        ? String(dateValue)
        : null;
    }
    return null;
  })();
  
  const testedCount = inspectionResults?.length || 0;
  const totalDevices = devices?.length || 0;
  const progress = totalDevices > 0 ? (testedCount / totalDevices) * 100 : 0;

  const getResultForDevice = (deviceId: number) => {
    return inspectionResults?.find((r: any) => r.deviceId === deviceId);
  };

  const getResultBadgeClass = (result?: string) => {
    switch (result) {
      case 'pass': return 'status-pass';
      case 'fail': return 'status-fail';
      case 'na': return 'status-na';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Calculate progress for each category using centralized helpers
  const smokeAlarms = devices?.filter((d: any) => isSmokeAlarm(d)) || [];
  const fireAlarmDevices = devices?.filter((d: any) => {
    const category = categorizeDevice(d);
    return category === 'fire_alarm';
  }) || [];
  const extinguishers = devices?.filter((d: any) => categorizeDevice(d) === 'extinguisher') || [];
  const emergencyLights = devices?.filter((d: any) => categorizeDevice(d) === 'emergency') || [];

  // Sort devices by walk order and add inspection results
  // Smoke alarms are sorted by suite number descending (highest to lowest)
  const sortedSmokeAlarms = sortBySuiteNumberDescending(smokeAlarms).map((d: any) => ({
    ...d,
    result: inspectionResults?.find((r: any) => r.deviceId === d.id)?.result
  }));
  const sortedFireAlarmDevices = sortByWalkOrderThenLocation(fireAlarmDevices).map((d: any) => {
    const ir = inspectionResults?.find((r: any) => r.deviceId === d.id);
    return { ...d, result: ir?.result, inspectionNotes: ir?.notes ?? null };
  });
  const sortedExtinguishers = sortByWalkOrderThenLocation(extinguishers).map((d: any) => ({
    ...d,
    result: inspectionResults?.find((r: any) => r.deviceId === d.id)?.result
  }));
  const sortedEmergencyLights = sortByWalkOrderThenLocation(emergencyLights).map((d: any) => ({
    ...d,
    result: inspectionResults?.find((r: any) => r.deviceId === d.id)?.result
  }));

  const getSmokeAlarmStats = () => {
    const tested = inspectionResults?.filter((r: any) => {
      const device = devices?.find((d: any) => d.id === r.deviceId);
      return device && isSmokeAlarm(device);
    }) || [];
    const defCount = deficiencies?.filter((d: any) => {
      const device = devices?.find((dev: any) => dev.id === d.deviceId);
      return device && isSmokeAlarm(device);
    }).length || 0;
    return { tested: tested.length, total: smokeAlarms.length, deficiencies: defCount };
  };

  const getFireAlarmStats = () => {
    const tested = inspectionResults?.filter((r: any) => {
      const device = devices?.find((d: any) => d.id === r.deviceId);
      return device && categorizeDevice(device) === 'fire_alarm';
    }) || [];
    const defCount = deficiencies?.filter((d: any) => {
      const device = devices?.find((dev: any) => dev.id === d.deviceId);
      return device && categorizeDevice(device) === 'fire_alarm';
    }).length || 0;
    return { tested: tested.length, total: fireAlarmDevices.length, deficiencies: defCount };
  };

  const getExtinguisherStats = () => {
    const tested = inspectionResults?.filter((r: any) => {
      const device = devices?.find((d: any) => d.id === r.deviceId);
      return device && categorizeDevice(device) === 'extinguisher';
    }) || [];
    const defCount = deficiencies?.filter((d: any) => {
      const device = devices?.find((dev: any) => dev.id === d.deviceId);
      return device && categorizeDevice(device) === 'extinguisher';
    }).length || 0;
    return { tested: tested.length, total: extinguishers.length, deficiencies: defCount };
  };

  const getEmergencyLightStats = () => {
    const tested = inspectionResults?.filter((r: any) => {
      const device = devices?.find((d: any) => d.id === r.deviceId);
      return device && categorizeDevice(device) === 'emergency';
    }) || [];
    const defCount = deficiencies?.filter((d: any) => {
      const device = devices?.find((dev: any) => dev.id === d.deviceId);
      return device && categorizeDevice(device) === 'emergency';
    }).length || 0;
    return { tested: tested.length, total: emergencyLights.length, deficiencies: defCount };
  };

  const smokeStats = getSmokeAlarmStats();
  const fireAlarmStats = getFireAlarmStats();
  const extinguisherStats = getExtinguisherStats();
  const emergencyLightStats = getEmergencyLightStats();

  // Debug counts (dev-only)
  console.log('[DEBUG] JobDetails device counts:', {
    totalDevices: devices?.length || 0,
    extinguishers: extinguisherStats.total,
    emergencyLights: emergencyLightStats.total,
    fireAlarms: fireAlarmStats.total,
    smokeAlarms: smokeStats.total
  });

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-2 sm:gap-4">
          <Link href="/tech/jobs">
            <Button variant="ghost" size="icon" className="flex-shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base sm:text-lg safe-text">{job.title}</h1>
            <p className="text-xs text-muted-foreground safe-text">{job.jobNumber}</p>
          </div>
          {isOnline ? (
            <span className="online-badge flex items-center gap-1 text-xs flex-shrink-0">
              <Wifi className="h-3 w-3" />
            </span>
          ) : (
            <span className="offline-badge flex items-center gap-1 text-xs flex-shrink-0">
              <WifiOff className="h-3 w-3" />
            </span>
          )}
        </div>
      </header>

      <main className="container py-4 space-y-4">
        {/* Site Info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{site?.name || 'Unknown Site'}</h3>
                {site?.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />
                    {site.address}
                  </p>
                )}
                {site?.contactPhone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="h-3 w-3" />
                    {site.contactPhone}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Site Details */}
        <SiteDetails 
          summary={site.summary}
          siteName={site.name}
          siteAddress={site.address}
          siteCity={site.city}
        />

        {/* Inspection Summary */}
        <InspectionSummary jobId={jobId} />

        {/* Progress */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Inspection Progress</span>
              <span className="text-sm text-muted-foreground">
                {testedCount} / {totalDevices} devices
              </span>
            </div>
            <Progress value={progress} className="h-3" />
            <div className="flex items-center justify-between mt-3 text-sm">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-[var(--success)]" />
                  {stats?.pass || 0} Pass
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-destructive" />
                  {stats?.fail || 0} Fail
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-gray-400" />
                  {stats?.na || 0} N/A
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inspection Header */}
        <InspectionHeader
          jobNumber={job.jobNumber}
          siteName={site?.name || ''}
          scheduledDate={(job as any).scheduledDate}
        />

        {/* Smoke Alarms — inline spreadsheet grid (CAN/ULC-S552) */}
        <Card className="border-destructive/20">
          <CardHeader
            className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => toggleGridSection('smokealarm')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <Flame className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-base">Smoke Alarms</CardTitle>
                  <p className="text-sm text-muted-foreground">CAN/ULC-S552 Inspection &amp; Testing</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {smokeStats.tested}/{smokeStats.total}
                </span>
                {openGridSection === 'smokealarm' ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
          {openGridSection === 'smokealarm' && (
            <CardContent className="p-3 pt-0">
              {smokeStats.total > 0 ? (
                <SmokeAlarmGrid
                  jobId={jobId}
                  devices={sortedSmokeAlarms}
                  isFinalized={isFinalized}
                  onResultChange={() => refetch()}
                />
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No smoke alarms loaded for this site.
                  <Button variant="link" size="sm" onClick={() => importAssets.mutate({ jobId })} disabled={importAssets.isPending}>
                    Import Assets
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Fire Alarm Devices — inline spreadsheet grid */}
        <Card className="border-[var(--warning)]/20">
          <CardHeader
            className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => toggleGridSection('firealarm')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[var(--warning)]/10 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
                </div>
                <div>
                  <CardTitle className="text-base">Fire Alarm Devices</CardTitle>
                  <p className="text-sm text-muted-foreground">Pull stations, heat detectors, horns, strobes</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {fireAlarmStats.tested}/{fireAlarmStats.total}
                </span>
                {openGridSection === 'firealarm' ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
          {openGridSection === 'firealarm' && (
            <CardContent className="p-3 pt-0">
              {fireAlarmStats.total > 0 ? (
                <IndividualDeviceGrid
                  jobId={jobId}
                  devices={sortedFireAlarmDevices}
                  isFinalized={isFinalized}
                  onResultChange={() => refetch()}
                />
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No fire alarm devices loaded for this site.
                  <Button variant="link" size="sm" onClick={() => importAssets.mutate({ jobId })} disabled={importAssets.isPending}>
                    Import Assets
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Fire Extinguishers — inline spreadsheet grid */}
        <Card className="border-destructive/20">
          <CardHeader
            className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => toggleGridSection('extinguisher')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <FireExtinguisher className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-base">Fire Extinguishers</CardTitle>
                  <p className="text-sm text-muted-foreground">Portable fire extinguishing equipment</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {extinguisherStats.tested}/{extinguisherStats.total}
                </span>
                {openGridSection === 'extinguisher' ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
          {openGridSection === 'extinguisher' && (
            <CardContent className="p-3 pt-0">
              {extinguisherStats.total > 0 ? (
                <ExtinguisherGrid
                  jobId={jobId}
                  devices={sortedExtinguishers}
                  isFinalized={isFinalized}
                  onResultChange={() => refetch()}
                />
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No fire extinguishers loaded for this site.
                  <Button variant="link" size="sm" onClick={() => importAssets.mutate({ jobId })} disabled={importAssets.isPending}>
                    Import Assets
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Emergency Lights — inline spreadsheet grid */}
        <Card className="border-[var(--warning)]/20">
          <CardHeader
            className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => toggleGridSection('emergency')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[var(--warning)]/10 rounded-lg">
                  <Lightbulb className="h-5 w-5 text-[var(--warning)]" />
                </div>
                <div>
                  <CardTitle className="text-base">Emergency Lights</CardTitle>
                  <p className="text-sm text-muted-foreground">Emergency and exit lighting</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {emergencyLightStats.tested}/{emergencyLightStats.total}
                </span>
                {openGridSection === 'emergency' ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
          {openGridSection === 'emergency' && (
            <CardContent className="p-3 pt-0">
              {emergencyLightStats.total > 0 ? (
                <EmergencyLightGrid
                  jobId={jobId}
                  devices={sortedEmergencyLights}
                  isFinalized={isFinalized}
                  onResultChange={() => refetch()}
                />
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No emergency lights loaded for this site.
                  <Button variant="link" size="sm" onClick={() => importAssets.mutate({ jobId })} disabled={importAssets.isPending}>
                    Import Assets
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* CAN/ULC-S536 Fire Alarm System Checklist — inline collapsible */}
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-800">
          <CardHeader
            className="p-4 cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors"
            onClick={() => toggleGridSection('checklist')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-purple-700 dark:text-purple-300" />
                </div>
                <div>
                  <CardTitle className="text-base text-purple-900 dark:text-purple-100">
                    Fire Alarm System Checklist
                  </CardTitle>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mt-0.5">
                    CAN/ULC-S536 Annual Test & Inspection
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-purple-700 dark:text-purple-300 h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocation(`/tech/jobs/${jobId}/fire-alarm`);
                  }}
                >
                  Full view
                </Button>
                {openGridSection === 'checklist' ? (
                  <ChevronDown className="h-4 w-4 text-purple-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-purple-600" />
                )}
              </div>
            </div>
          </CardHeader>
          {openGridSection === 'checklist' && (
            <CardContent className="p-4 pt-0">
              <FireAlarmChecklist
                jobId={jobId}
                siteId={site.id}
                isFinalized={isFinalized}
              />
            </CardContent>
          )}
        </Card>

        {/* Sprinkler ITM Inspection — navigate to dedicated page */}
        <Card className="bg-accent/5 border-accent/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold flex items-center gap-2">
                  <Droplets className="h-5 w-5" />
                  Sprinkler ITM Inspection
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  NFPA 25 / Vancouver Fire By-law Compliance
                </p>
              </div>
              <Button
                variant="default"
                className="bg-accent hover:bg-accent/90"
                onClick={() => setLocation(`/tech/jobs/${jobId}/sprinkler-itm`)}
              >
                Start
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Deficiencies Section - Only show deficiencies, devices are in category cards above */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Deficiencies ({deficiencies?.length || 0})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/tech/deficiency/new/${jobId}`}>
              <Button className="w-full mb-4" variant="outline">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Add Deficiency
              </Button>
            </Link>
            {deficiencies?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No deficiencies recorded
              </p>
            ) : (
              <div className="space-y-2">
                {deficiencies?.map((def: any) => (
                <Link key={def.id} href={`/tech/deficiency/${def.id}`}>
                  <Card className="inspection-card">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            def.severity === 'critical' ? 'bg-destructive text-destructive-foreground' :
                            def.severity === 'major' ? 'bg-warning text-warning-foreground' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {def.severity}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                            def.status === 'open' ? 'status-fail' :
                            def.status === 'resolved' || def.status === 'closed' ? 'status-pass' :
                            'status-pending'
                          }`}>
                            {def.status}
                          </span>
                        </div>
                        <p className="font-medium truncate">{def.title}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 safe-bottom">
        <div className="container">
          {isFinalized ? (
            <Button className="w-full action-btn" variant="secondary" disabled>
              <Lock className="h-5 w-5 mr-2" />
              Job Finalized — Record Sealed
            </Button>
          ) : job.status === 'pending' || job.status === 'scheduled' ? (
            <div className="space-y-2">
              {/* Site Notes Banner */}
              {siteNotes && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide mb-1">Site Notes</p>
                  <p className="text-sm text-amber-900 dark:text-amber-200">{siteNotes}</p>
                </div>
              )}
              {/* Key Info Banner */}
              {((site as any)?.keyNumber || (site as any)?.keyLocation) && (
                <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3">
                  <p className="text-xs font-semibold text-[var(--warning)] uppercase tracking-wide mb-1">Key Information</p>
                  {(site as any).keyNumber && <p className="text-sm text-foreground"><span className="font-medium">Key #:</span> {(site as any).keyNumber}</p>}
                  {(site as any).keyLocation && <p className="text-sm text-foreground"><span className="font-medium">Location:</span> {(site as any).keyLocation}</p>}
                  {(site as any).keySignedOutBy && <p className="text-sm text-[var(--warning)] font-medium">Currently signed out by: {(site as any).keySignedOutBy}</p>}
                </div>
              )}
              <Button 
                className="w-full action-btn"
                onClick={() => startJob.mutate({ id: jobId })}
                disabled={startJob.isPending || !isOnline}
              >
                <Play className="h-5 w-5 mr-2" />
                {(((site as any)?.notes) || (site as any)?.keyNumber || (site as any)?.keyLocation) ? 'Acknowledged — Start Inspection' : 'Start Inspection'}
              </Button>
            </div>
          ) : job.status === 'in_progress' ? (
            <Button 
              className="w-full action-btn"
              onClick={() => completeJob.mutate({ id: jobId })}
              disabled={completeJob.isPending || !isOnline}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Complete Job
            </Button>
          ) : (
            <Button className="w-full action-btn" variant="secondary" disabled>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Job Completed
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}