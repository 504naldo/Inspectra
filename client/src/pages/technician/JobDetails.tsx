import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { InspectionSummary } from "@/components/InspectionSummary";
import { SiteDetails } from "@/components/SiteDetails";
import { FieldCopilotPanel } from "@/components/FieldCopilotPanel";
import { InspectionHeader } from "@/components/inspection/InspectionHeader";
import { IndividualDeviceGrid } from "@/components/inspection/IndividualDeviceGrid";
import { ExtinguisherGrid } from "@/components/inspection/ExtinguisherGrid";
import { EmergencyLightGrid } from "@/components/inspection/EmergencyLightGrid";
import { FireAlarmChecklist } from "@/components/inspection/FireAlarmChecklist";
import { SmokeAlarmGrid } from "@/components/inspection/SmokeAlarmGrid";
import { SignaturePad } from "@/components/SignaturePad";
import { isSmokeAlarm, categorizeDevice } from "@shared/deviceCategories";
import { sortByWalkOrderThenLocation, sortBySuiteNumberDescending } from "@shared/deviceHelpers";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Lock,
  ClipboardList,
  Clock,
  Save,
  Key,
  Radio,
  Send,
  Info,
  ShoppingCart,
  Plus,
  Package,
  Timer,
  StopCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

// ─── Template inspection cards ─────────────────────────────────────────────────

function TemplateInspectionCards({
  jobId,
  setLocation,
}: {
  jobId: number;
  setLocation: (path: string) => void;
}) {
  const { data: templates = [], isLoading } = trpc.inspectionTemplate.getTemplatesForJob.useQuery(
    { jobId },
    { enabled: !!jobId }
  );

  if (isLoading || templates.length === 0) return null;

  return (
    <>
      {templates.map((t) => (
        <Card key={t.id} className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-teal-600" />
                  {t.name}
                </h3>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>
                )}
              </div>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
                onClick={() => setLocation(`/tech/jobs/${jobId}/template/${t.id}`)}
              >
                Start
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

interface JobDetailsProps {
  jobId: number;
}

export default function JobDetails({ jobId }: JobDetailsProps) {
  const [location, setLocation] = useLocation();
  const { isOnline, getCachedJobData } = useOfflineStorage();
  const [openGridSection, setOpenGridSection] = useState<string | null>(null);
  const [woTechNotes, setWoTechNotes] = useState("");
  const [woActualHours, setWoActualHours] = useState("");
  const [woCompletionSummary, setWoCompletionSummary] = useState("");
  const [woEditMode, setWoEditMode] = useState(false);

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
    onError: (err) => toast.error(err.message || 'Failed to complete job')
  });

  // Signature capture state
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [techSigUrl, setTechSigUrl] = useState<string | null>(null);

  const saveSignatures = trpc.job.saveSignatures.useMutation({
    onSuccess: () => {
      completeJob.mutate({ id: jobId });
      setSigDialogOpen(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to save signatures'),
  });

  function openSignatureDialog() {
    setTechSigUrl(null);
    setSigDialogOpen(true);
  }

  function handleSignaturesSubmit() {
    if (!techSigUrl) return;
    saveSignatures.mutate({
      jobId,
      techSignatureBase64: techSigUrl.split(",")[1],
    });
  }
  
  const { data: workOrder, refetch: refetchWorkOrder } = trpc.workOrder.listByJob.useQuery(
    { jobId },
    { enabled: true }
  );

  const woTechUpdateMutation = trpc.workOrder.techUpdate.useMutation({
    onSuccess: () => {
      toast.success("Work order updated");
      setWoEditMode(false);
      refetchWorkOrder();
    },
    onError: (err) => toast.error(err.message || "Failed to update work order"),
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

  // Work Site Info — for field access details
  const { data: wsi } = trpc.workSiteInfo.getForJob.useQuery(
    { jobId },
    { enabled: true, retry: 1 }
  );

  // Parts requests
  const [showPartsForm, setShowPartsForm] = useState(false);
  const [partsDesc, setPartsDesc] = useState("");
  const [partsQty, setPartsQty] = useState("1");
  const [partsPriority, setPartsPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [partsNotes, setPartsNotes] = useState("");
  const [partsNeededBy, setPartsNeededBy] = useState("");

  const { data: jobPartsRequests = [], refetch: refetchPartsRequests } = trpc.inventory.getRequestsForJob.useQuery(
    { jobId },
    { enabled: true, retry: 1 },
  );

  const createPartsRequestMut = trpc.inventory.createPartsRequest.useMutation({
    onSuccess: () => {
      toast.success("Parts request submitted.");
      refetchPartsRequests();
      setShowPartsForm(false);
      setPartsDesc("");
      setPartsQty("1");
      setPartsPriority("medium");
      setPartsNotes("");
      setPartsNeededBy("");
    },
    onError: (e) => toast.error(e.message || "Failed to submit parts request"),
  });

  // Time tracking
  const TIMER_KEY = `inspectra_timer_${jobId}`;
  const [timerRunning, setTimerRunning] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TIMER_KEY + "_running") ?? "false"); } catch { return false; }
  });
  const [timerStart, setTimerStart] = useState<number | null>(() => {
    try { const v = localStorage.getItem(TIMER_KEY + "_start"); return v ? parseInt(v) : null; } catch { return null; }
  });
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeLabourType, setTimeLabourType] = useState("inspection");
  const [timeDurationMinutes, setTimeDurationMinutes] = useState("");
  const [timeDescription, setTimeDescription] = useState("");
  const [timeDate, setTimeDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: myTimeEntries = [], refetch: refetchTimeEntries } = trpc.timeTracking.listMine.useQuery(
    { jobId },
    { enabled: true, retry: 1 },
  );

  const createTimeMut = trpc.timeTracking.create.useMutation({
    onSuccess: () => {
      toast.success("Time entry saved.");
      refetchTimeEntries();
      setShowTimeForm(false);
      setTimeDurationMinutes("");
      setTimeDescription("");
      setTimeDate(new Date().toISOString().slice(0, 10));
    },
    onError: (e) => toast.error(e.message || "Failed to save time entry"),
  });

  const submitTimeMut = trpc.timeTracking.submit.useMutation({
    onSuccess: () => { toast.success("Time entry submitted for approval."); refetchTimeEntries(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (timerRunning && timerStart) {
      timerRef.current = setInterval(() => {
        setTimerElapsed(Math.floor((Date.now() - timerStart) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timerStart]);

  function startTimer() {
    const now = Date.now();
    localStorage.setItem(TIMER_KEY + "_running", "true");
    localStorage.setItem(TIMER_KEY + "_start", String(now));
    setTimerStart(now);
    setTimerElapsed(0);
    setTimerRunning(true);
  }

  function stopTimer() {
    if (!timerStart) return;
    const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
    localStorage.removeItem(TIMER_KEY + "_running");
    localStorage.removeItem(TIMER_KEY + "_start");
    setTimerRunning(false);
    setTimerStart(null);
    setTimerElapsed(0);
    setTimeDurationMinutes(String(mins));
    setShowTimeForm(true);
  }

  function fmtTimer(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function fmtEntryDuration(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
  }

  // Submit for QA
  const [qaDialogOpen, setQaDialogOpen] = useState(false);
  const submitForQA = trpc.technician.submitForQA.useMutation({
    onSuccess: () => {
      toast.success('Submitted for QA — office has been notified');
      setQaDialogOpen(false);
      refetch();
    },
    onError: (err) => toast.error(err.message || 'Failed to submit for QA'),
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
  const siteId: number = (job as any).siteId;
  const companyId: number = (job as any).companyId;
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

  // Calculate progress for each category using centralized helpers
  const smokeAlarms = devices?.filter((d: any) => isSmokeAlarm(d)) || [];
  const fireAlarmDevices = devices?.filter((d: any) => {
    const category = categorizeDevice(d);
    return category === 'fire_alarm';
  }) || [];
  const extinguishers = devices?.filter((d: any) => categorizeDevice(d) === 'extinguisher') || [];
  const emergencyLights = devices?.filter((d: any) => categorizeDevice(d) === 'emergency') || [];

  // Set of deviceIds whose inspection_result row was auto-carried forward from a prior job
  const carriedForwardDeviceIds = new Set<number>(
    (inspectionResults as any[])?.filter((r: any) => r.carriedForward).map((r: any) => r.deviceId) ?? []
  );

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
          <FieldCopilotPanel jobId={jobId} isOnline={isOnline} jobStatus={job.status} />
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

        {/* Work Site Info — field access details */}
        {wsi && (wsi.accessNotes || wsi.keyLocation || wsi.keyNumber || wsi.lockboxCode || wsi.fireAlarmPanelLocation || wsi.monitoringCompany || wsi.sprinklerNotes || wsi.emergencyLightingNotes) && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <Info className="h-4 w-4" /> Site Field Info
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2 text-sm">
              {wsi.accessNotes && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Access Notes</p>
                  <p className="text-foreground whitespace-pre-line">{wsi.accessNotes}</p>
                </div>
              )}
              {(wsi.keyLocation || wsi.keyNumber || wsi.lockboxCode) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                    <Key className="h-3 w-3" /> Key / Access
                  </p>
                  {wsi.keyNumber && <p className="text-amber-900 dark:text-amber-200"><span className="font-medium">Key #:</span> {wsi.keyNumber}</p>}
                  {wsi.keyLocation && <p className="text-amber-900 dark:text-amber-200"><span className="font-medium">Location:</span> {wsi.keyLocation}</p>}
                  {wsi.lockboxCode && <p className="text-amber-900 dark:text-amber-200"><span className="font-medium">Lockbox:</span> {wsi.lockboxCode}</p>}
                </div>
              )}
              {wsi.fireAlarmPanelLocation && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Fire Alarm Panel</p>
                  <p className="text-foreground">{wsi.fireAlarmPanelLocation}
                    {wsi.annunciatorLocation && <span className="text-muted-foreground"> · Annunciator: {wsi.annunciatorLocation}</span>}
                  </p>
                </div>
              )}
              {wsi.monitoringCompany && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                    <Radio className="h-3 w-3" /> Monitoring
                  </p>
                  <p className="text-foreground">{wsi.monitoringCompany}
                    {wsi.monitoringPhone && <span className="text-muted-foreground"> · {wsi.monitoringPhone}</span>}
                    {wsi.monitoringAccount && <span className="text-muted-foreground"> · Acct: {wsi.monitoringAccount}</span>}
                  </p>
                </div>
              )}
              {wsi.sprinklerNotes && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Sprinkler Notes</p>
                  <p className="text-foreground">{wsi.sprinklerNotes}</p>
                </div>
              )}
              {wsi.emergencyLightingNotes && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Emergency Lighting Notes</p>
                  <p className="text-foreground">{wsi.emergencyLightingNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
              <SmokeAlarmGrid
                jobId={jobId}
                siteId={siteId}
                companyId={companyId}
                devices={sortedSmokeAlarms}
                isFinalized={isFinalized}
                onResultChange={() => refetch()}
                carriedForwardDeviceIds={carriedForwardDeviceIds}
                onRefresh={refetch}
              />
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
              <IndividualDeviceGrid
                jobId={jobId}
                siteId={siteId}
                companyId={companyId}
                devices={sortedFireAlarmDevices}
                isFinalized={isFinalized}
                onResultChange={() => refetch()}
                carriedForwardDeviceIds={carriedForwardDeviceIds}
                onRefresh={refetch}
              />
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
              <ExtinguisherGrid
                jobId={jobId}
                siteId={siteId}
                companyId={companyId}
                devices={sortedExtinguishers}
                isFinalized={isFinalized}
                onResultChange={() => refetch()}
                carriedForwardDeviceIds={carriedForwardDeviceIds}
                onRefresh={refetch}
              />
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
              <EmergencyLightGrid
                jobId={jobId}
                siteId={siteId}
                companyId={companyId}
                devices={sortedEmergencyLights}
                isFinalized={isFinalized}
                onResultChange={() => refetch()}
                carriedForwardDeviceIds={carriedForwardDeviceIds}
                onRefresh={refetch}
              />
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

        {/* Inspection Templates — dynamic templates assigned to this job */}
        <TemplateInspectionCards jobId={parseInt(jobId!)} setLocation={setLocation} />

        {/* Work Order */}
        {workOrder && (
          <Card className="border-primary/20">
            <CardHeader
              className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleGridSection("workorder")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Work Order</CardTitle>
                    <p className="text-sm text-muted-foreground">{workOrder.workOrderNumber} · {workOrder.status.replace(/_/g, " ")}</p>
                  </div>
                </div>
                {openGridSection === "workorder" ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {openGridSection === "workorder" && (
              <CardContent className="p-4 pt-0 space-y-4">
                {/* Read-only info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Work Type</p>
                    <p className="mt-0.5 capitalize">{workOrder.workType.replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority</p>
                    <p className="mt-0.5 capitalize">{workOrder.priority}</p>
                  </div>
                  {workOrder.estimatedHours && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Est. Hours</p>
                      <p className="mt-0.5 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {parseFloat(workOrder.estimatedHours).toFixed(1)} h
                      </p>
                    </div>
                  )}
                  {workOrder.officeNotes && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Office Notes</p>
                      <p className="mt-0.5 text-sm whitespace-pre-line">{workOrder.officeNotes}</p>
                    </div>
                  )}
                </div>

                {/* Tech editable section */}
                {!workOrder.finalizedAt && (
                  <>
                    {woEditMode ? (
                      <div className="space-y-3 border-t pt-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tech Notes</label>
                          <Textarea
                            value={woTechNotes}
                            onChange={(e) => setWoTechNotes(e.target.value)}
                            placeholder="Notes from the field..."
                            rows={3}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actual Hours</label>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={woActualHours}
                            onChange={(e) => setWoActualHours(e.target.value)}
                            placeholder="e.g. 2.5"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completion Summary</label>
                          <Textarea
                            value={woCompletionSummary}
                            onChange={(e) => setWoCompletionSummary(e.target.value)}
                            placeholder="Summary of work completed..."
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={woTechUpdateMutation.isPending}
                            onClick={() =>
                              woTechUpdateMutation.mutate({
                                id: workOrder.id,
                                techNotes: woTechNotes || undefined,
                                actualHours: woActualHours ? parseFloat(woActualHours) : undefined,
                                completionSummary: woCompletionSummary || undefined,
                              })
                            }
                          >
                            {woTechUpdateMutation.isPending ? (
                              <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />Saving…</>
                            ) : (
                              <><Save className="h-4 w-4 mr-1.5" />Save</>
                            )}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setWoEditMode(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t pt-3 space-y-2">
                        {workOrder.techNotes && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tech Notes</p>
                            <p className="mt-0.5 text-sm whitespace-pre-line">{workOrder.techNotes}</p>
                          </div>
                        )}
                        {workOrder.actualHours && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actual Hours</p>
                            <p className="mt-0.5 flex items-center gap-1 text-sm">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {parseFloat(workOrder.actualHours).toFixed(1)} h
                            </p>
                          </div>
                        )}
                        {workOrder.completionSummary && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completion Summary</p>
                            <p className="mt-0.5 text-sm whitespace-pre-line">{workOrder.completionSummary}</p>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-1"
                          onClick={() => {
                            setWoTechNotes(workOrder.techNotes ?? "");
                            setWoActualHours(workOrder.actualHours ?? "");
                            setWoCompletionSummary(workOrder.completionSummary ?? "");
                            setWoEditMode(true);
                          }}
                        >
                          Update Work Order
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* Parts Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Parts Requests ({(jobPartsRequests as any[]).length})
              </span>
              {!showPartsForm && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowPartsForm(true)}>
                  <Plus className="h-3.5 w-3.5" /> Request Parts
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showPartsForm && (
              <div className="border rounded-lg p-3 mb-4 space-y-3 bg-muted/20">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Part description *</label>
                  <input
                    className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-background"
                    placeholder="e.g. Smoke detector replacement unit"
                    value={partsDesc}
                    onChange={(e) => setPartsDesc(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-background"
                      value={partsQty}
                      onChange={(e) => setPartsQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Priority</label>
                    <select
                      className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-background"
                      value={partsPriority}
                      onChange={(e) => setPartsPriority(e.target.value as any)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Needed by (optional)</label>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-background"
                    value={partsNeededBy}
                    onChange={(e) => setPartsNeededBy(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                  <textarea
                    className="mt-1 w-full border rounded px-2 py-1.5 text-sm bg-background resize-none"
                    rows={2}
                    placeholder="Any additional details"
                    value={partsNotes}
                    onChange={(e) => setPartsNotes(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!partsDesc.trim() || createPartsRequestMut.isPending}
                    onClick={() =>
                      createPartsRequestMut.mutate({
                        jobId,
                        priority: partsPriority,
                        notes: partsNotes.trim() || undefined,
                        neededByDate: partsNeededBy || undefined,
                        items: [{ description: partsDesc.trim(), quantityRequested: parseInt(partsQty) || 1 }],
                      })
                    }
                  >
                    Submit Request
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowPartsForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {(jobPartsRequests as any[]).length === 0 && !showPartsForm && (
              <p className="text-center text-muted-foreground py-6 text-sm">No parts requests for this job.</p>
            )}

            <div className="space-y-2">
              {(jobPartsRequests as any[]).map((req: any) => (
                <div key={req.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-semibold">{req.requestNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      req.status === "issued" || req.status === "received" ? "bg-green-100 text-green-700" :
                      req.status === "approved" || req.status === "ordered" ? "bg-blue-100 text-blue-700" :
                      req.status === "cancelled" ? "bg-red-100 text-red-600" :
                      req.status === "submitted" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {req.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {req.priority === "urgent" && (
                    <span className="text-xs text-red-600 font-medium flex items-center gap-1 mb-1">
                      <AlertTriangle className="h-3 w-3" /> Urgent
                    </span>
                  )}
                  {req.notes && <p className="text-xs text-muted-foreground">{req.notes}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{String(req.createdAt).slice(0, 10)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Time Tracking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time Tracking
              </span>
              {!showTimeForm && !timerRunning && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowTimeForm(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Time
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Timer */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              {timerRunning ? (
                <>
                  <div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-primary">
                      {fmtTimer(timerElapsed)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Timer running…</div>
                  </div>
                  <Button size="sm" variant="destructive" className="h-9" onClick={stopTimer}>
                    <StopCircle className="h-4 w-4 mr-1.5" /> Stop
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-sm text-muted-foreground">Track time automatically</div>
                  <Button size="sm" variant="outline" className="h-9" onClick={startTimer}>
                    <Timer className="h-4 w-4 mr-1.5" /> Start Timer
                  </Button>
                </>
              )}
            </div>

            {/* Manual entry form */}
            {showTimeForm && (
              <div className="border rounded-lg p-3 space-y-3 bg-card">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Log Time Entry</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Duration (minutes)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="1440"
                      className="mt-1 h-8 text-sm"
                      placeholder="e.g. 90"
                      value={timeDurationMinutes}
                      onChange={(e) => setTimeDurationMinutes(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input
                      type="date"
                      className="mt-1 h-8 text-sm"
                      value={timeDate}
                      onChange={(e) => setTimeDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Labour Type</Label>
                  <Select value={timeLabourType} onValueChange={setTimeLabourType}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="repair">Repair</SelectItem>
                      <SelectItem value="service_call">Service Call</SelectItem>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="parts_run">Parts Run</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Description (optional)</Label>
                  <Textarea
                    className="mt-1 text-sm"
                    rows={2}
                    placeholder="What did you work on?"
                    value={timeDescription}
                    onChange={(e) => setTimeDescription(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    disabled={createTimeMut.isPending || !timeDurationMinutes}
                    onClick={() => createTimeMut.mutate({
                      jobId,
                      entryDate: timeDate,
                      durationMinutes: parseInt(timeDurationMinutes),
                      labourType: timeLabourType as any,
                      description: timeDescription.trim(),
                    })}
                  >
                    Save as Draft
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => { setShowTimeForm(false); setTimeDurationMinutes(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Today's entries */}
            {(myTimeEntries as any[]).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">My Entries — This Job</p>
                {(myTimeEntries as any[]).map((entry: any) => (
                  <div key={entry.id} className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold tabular-nums">{fmtEntryDuration(entry.durationMinutes)}</span>
                        <span className="text-muted-foreground">{entry.labourType.replace("_", " ")}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                          entry.status === "approved" ? "bg-green-100 text-green-700" :
                          entry.status === "submitted" ? "bg-yellow-100 text-yellow-700" :
                          entry.status === "rejected" ? "bg-red-100 text-red-600" :
                          "bg-gray-100 text-gray-600"
                        }`}>{entry.status}</span>
                      </div>
                      {entry.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.description}</p>
                      )}
                    </div>
                    {entry.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs ml-2 shrink-0"
                        disabled={submitTimeMut.isPending}
                        onClick={() => submitTimeMut.mutate({ id: entry.id })}
                      >
                        Submit
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(myTimeEntries as any[]).length === 0 && !showTimeForm && !timerRunning && (
              <p className="text-center text-xs text-muted-foreground py-2">No time entries for this job yet.</p>
            )}
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
            <div className="space-y-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setQaDialogOpen(true)}
                disabled={!isOnline}
              >
                <Send className="h-4 w-4 mr-2" />
                Submit for QA
              </Button>
              <Button
                className="w-full action-btn"
                onClick={openSignatureDialog}
                disabled={completeJob.isPending || saveSignatures.isPending || !isOnline}
              >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Complete Job
              </Button>
            </div>
          ) : (
            <Button className="w-full action-btn" variant="secondary" disabled>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Job Completed
            </Button>
          )}
        </div>
      </div>

      {/* Submit for QA dialog */}
      <Dialog open={qaDialogOpen} onOpenChange={(open) => { if (!submitForQA.isPending) setQaDialogOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> Submit for QA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>This will notify the office that <strong>{job?.title}</strong> is ready for report generation and QA review.</p>
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Devices tested</span>
                <span className="font-medium">{testedCount} / {totalDevices}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deficiencies</span>
                <span className="font-medium">{deficiencies?.length ?? 0}</span>
              </div>
              {testedCount < totalDevices && (
                <p className="text-amber-600 text-xs pt-1">
                  ⚠ {totalDevices - testedCount} device{totalDevices - testedCount !== 1 ? "s" : ""} not yet tested.
                </p>
              )}
            </div>
            <p className="text-muted-foreground text-xs">The job will remain in progress. You can still make changes after submitting.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQaDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submitForQA.mutate({ jobId })}
              disabled={submitForQA.isPending}
            >
              {submitForQA.isPending ? "Submitting…" : "Submit for QA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature capture dialog */}
      <Dialog open={sigDialogOpen} onOpenChange={(open) => { if (!saveSignatures.isPending) setSigDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Technician Signature</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Sign below to confirm completion of this inspection.
            </p>
            <SignaturePad
              label="Your signature"
              height={200}
              onConfirm={(dataUrl) => setTechSigUrl(dataUrl)}
              onClear={() => setTechSigUrl(null)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSigDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSignaturesSubmit}
              disabled={!techSigUrl || saveSignatures.isPending}
            >
              {saveSignatures.isPending ? "Saving…" : "Complete Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}