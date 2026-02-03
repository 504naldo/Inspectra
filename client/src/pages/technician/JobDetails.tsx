import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useInspectionProgress } from "@/hooks/useInspectionProgress";
import { ExpandableCategoryCard } from "@/components/ExpandableCategoryCard";
import { InspectionSummary } from "@/components/InspectionSummary";
import { SiteDetails } from "@/components/SiteDetails";
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
  Building2,
  Wifi,
  WifiOff,
  Flame,
  FireExtinguisher,
  Lightbulb,
  Droplets
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
  const { getProgress, isProgressRecent } = useInspectionProgress(jobId);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
  // Get category filter from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const categoryFilter = searchParams.get('category');

  const { data, isLoading, refetch } = trpc.job.getWithDetails.useQuery(
    { id: jobId },
    { enabled: isOnline }
  );

  // Try to get cached data if offline
  const cachedData = !isOnline ? getCachedJobData(jobId) : null;
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
  
  const bulkMarkPass = trpc.inspectionResult.bulkMarkPass.useMutation({
    onSuccess: (result) => {
      toast.success(`Marked ${result.count} devices as PASS`);
      refetch();
    },
    onError: () => toast.error('Failed to mark devices as pass')
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

  if (isLoading && isOnline) {
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
  const sortedFireAlarmDevices = sortByWalkOrderThenLocation(fireAlarmDevices).map((d: any) => ({
    ...d,
    result: inspectionResults?.find((r: any) => r.deviceId === d.id)?.result
  }));
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
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  {stats?.pass || 0} Pass
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
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

        {/* Category Cards */}
        {smokeStats.total > 0 && (
          <ExpandableCategoryCard
            title="Smoke Alarms"
            description="Smoke detection devices"
            icon={<Flame className="h-5 w-5" />}
            testedCount={smokeStats.tested}
            totalCount={smokeStats.total}
            deficiencyCount={smokeStats.deficiencies}
            route={`/tech/jobs/${jobId}/smoke-alarms`}
            resumeRoute={getProgress()?.route.includes('smoke-alarm') ? getProgress()?.route : undefined}
            gradientFrom="from-red-50"
            gradientTo="to-orange-50 dark:from-red-950/20 dark:to-orange-950/20"
            borderColor="border-red-200 dark:border-red-800"
            textColor="text-red-900 dark:text-red-100"
            buttonColor="bg-red-600"
            buttonHoverColor="hover:bg-red-700"
            devices={sortedSmokeAlarms}
            isExpanded={expandedCard === 'smoke'}
            onToggle={() => setExpandedCard(expandedCard === 'smoke' ? null : 'smoke')}
            getDeviceRoute={(deviceId) => `/tech/jobs/${jobId}/device/${deviceId}?category=smoke`}
            jobId={jobId}
            onBulkMarkPass={() => bulkMarkPass.mutate({ jobId, deviceIds: sortedSmokeAlarms.filter(d => !d.result || d.result === 'not_tested').map(d => d.id) })}
          />
        )}

        {fireAlarmStats.total > 0 && (
          <ExpandableCategoryCard
            title="Fire Alarm Devices"
            description="Pull stations, heat detectors, horns, strobes"
            icon={<AlertTriangle className="h-5 w-5" />}
            testedCount={fireAlarmStats.tested}
            totalCount={fireAlarmStats.total}
            deficiencyCount={fireAlarmStats.deficiencies}
            route={`/tech/jobs/${jobId}?category=firealarm`}
            resumeRoute={getProgress()?.route.includes('fire-alarm') && !getProgress()?.route.includes('smoke') ? getProgress()?.route : undefined}
            gradientFrom="from-orange-50"
            gradientTo="to-yellow-50 dark:from-orange-950/20 dark:to-yellow-950/20"
            borderColor="border-orange-200 dark:border-orange-800"
            textColor="text-orange-900 dark:text-orange-100"
            buttonColor="bg-orange-600"
            buttonHoverColor="hover:bg-orange-700"
            devices={sortedFireAlarmDevices}
            isExpanded={expandedCard === 'firealarm'}
            onToggle={() => setExpandedCard(expandedCard === 'firealarm' ? null : 'firealarm')}
            getDeviceRoute={(deviceId) => `/tech/jobs/${jobId}/device/${deviceId}?category=firealarm`}
            jobId={jobId}
            onBulkMarkPass={() => bulkMarkPass.mutate({ jobId, deviceIds: sortedFireAlarmDevices.filter(d => !d.result || d.result === 'not_tested').map(d => d.id) })}
          />
        )}

        {extinguisherStats.total > 0 ? (
          <ExpandableCategoryCard
            title="Fire Extinguishers"
            description="Portable fire extinguishing equipment"
            icon={<FireExtinguisher className="h-5 w-5" />}
            testedCount={extinguisherStats.tested}
            totalCount={extinguisherStats.total}
            deficiencyCount={extinguisherStats.deficiencies}
            route={`/tech/jobs/${jobId}?category=extinguisher`}
            resumeRoute={getProgress()?.route.includes('extinguisher') ? getProgress()?.route : undefined}
            gradientFrom="from-rose-50"
            gradientTo="to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20"
            borderColor="border-rose-200 dark:border-rose-800"
            textColor="text-rose-900 dark:text-rose-100"
            buttonColor="bg-rose-600"
            buttonHoverColor="hover:bg-rose-700"
            devices={sortedExtinguishers}
            isExpanded={expandedCard === 'extinguisher'}
            onToggle={() => setExpandedCard(expandedCard === 'extinguisher' ? null : 'extinguisher')}
            getDeviceRoute={(deviceId) => `/tech/jobs/${jobId}/device/${deviceId}?category=extinguisher`}
            jobId={jobId}
            onBulkMarkPass={() => bulkMarkPass.mutate({ jobId, deviceIds: sortedExtinguishers.filter(d => !d.result || d.result === 'not_tested').map(d => d.id) })}
          />
        ) : (
          <Card className="bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20 border-rose-200 dark:border-rose-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                  <FireExtinguisher className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <CardTitle className="text-rose-900 dark:text-rose-100">Fire Extinguishers</CardTitle>
                  <p className="text-sm text-rose-700 dark:text-rose-300">Portable fire extinguishing equipment</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No Fire Extinguishers loaded for this site</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => importAssets.mutate({ jobId })}
                  disabled={importAssets.isPending}
                >
                  {importAssets.isPending ? 'Importing...' : 'Import Assets'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {emergencyLightStats.total > 0 ? (
          <ExpandableCategoryCard
            title="Emergency Lights"
            description="Emergency and exit lighting"
            icon={<Lightbulb className="h-5 w-5" />}
            testedCount={emergencyLightStats.tested}
            totalCount={emergencyLightStats.total}
            deficiencyCount={emergencyLightStats.deficiencies}
            route={`/tech/jobs/${jobId}?category=emergency`}
            resumeRoute={getProgress()?.route.includes('emergency') || getProgress()?.route.includes('exit') ? getProgress()?.route : undefined}
            gradientFrom="from-yellow-50"
            gradientTo="to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20"
            borderColor="border-yellow-200 dark:border-yellow-800"
            textColor="text-yellow-900 dark:text-yellow-100"
            buttonColor="bg-yellow-600"
            buttonHoverColor="hover:bg-yellow-700"
            devices={sortedEmergencyLights}
            jobId={jobId}
            onBulkMarkPass={() => bulkMarkPass.mutate({ jobId, deviceIds: sortedEmergencyLights.filter(d => !d.result || d.result === 'not_tested').map(d => d.id) })}
            isExpanded={expandedCard === 'emergency'}
            onToggle={() => setExpandedCard(expandedCard === 'emergency' ? null : 'emergency')}
            getDeviceRoute={(deviceId) => `/tech/jobs/${jobId}/device/${deviceId}?category=emergency`}
          />
        ) : (
          <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border-yellow-200 dark:border-yellow-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Lightbulb className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <CardTitle className="text-yellow-900 dark:text-yellow-100">Emergency Lights</CardTitle>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">Emergency and exit lighting</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No Emergency Lights loaded for this site</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => importAssets.mutate({ jobId })}
                  disabled={importAssets.isPending}
                >
                  {importAssets.isPending ? 'Importing...' : 'Import Assets'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fire Alarm System Inspection */}
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Fire Alarm System Inspection
                </h3>
                <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                  CAN/ULC-S536 Annual Test & Inspection
                </p>
              </div>
              <Button 
                variant="default" 
                className="bg-purple-600 hover:bg-purple-700"
                onClick={() => setLocation(`/tech/jobs/${jobId}/fire-alarm`, { replace: true })}
              >
                Start
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sprinkler ITM Inspection */}
        <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <Droplets className="h-5 w-5" />
                  Sprinkler ITM Inspection
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  NFPA 25 / Vancouver Fire By-law Compliance
                </p>
              </div>
              <Button 
                variant="default" 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setLocation(`/tech/jobs/${jobId}/sprinkler-itm`, { replace: true })}
              >
                Start
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* CAN/ULC-S536 Checklist */}
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  CAN/ULC-S536 Checklist
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Complete inspection checklist for compliance report
                </p>
              </div>
              <Link href={`/tech/jobs/${jobId}/checklist`}>
                <Button variant="default" className="bg-blue-600 hover:bg-blue-700">
                  Open
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
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
          {job.status === 'pending' || job.status === 'scheduled' ? (
            <Button 
              className="w-full action-btn"
              onClick={() => startJob.mutate({ id: jobId })}
              disabled={startJob.isPending || !isOnline}
            >
              <Play className="h-5 w-5 mr-2" />
              Start Inspection
            </Button>
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
