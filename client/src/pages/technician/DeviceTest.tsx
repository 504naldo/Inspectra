import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import {
  ArrowLeft,
  Check,
  X,
  Minus,
  Camera,
  Sparkles,
  Wifi,
  WifiOff,
  AlertTriangle,
  Save,
  ChevronLeft,
  ChevronRight,
  Flag,
  Image,
} from "lucide-react";
import { PageHelpButton } from "@/components/help/PageHelpButton";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { isSmokeAlarm, categorizeDevice } from "@shared/deviceCategories";
import { sortByWalkOrderThenLocation } from "@shared/deviceHelpers";

interface DeviceTestProps {
  jobId: number;
  deviceId: number;
}

export default function DeviceTest({ jobId, deviceId }: DeviceTestProps) {
  const [location, setLocation] = useLocation();
  const { isOnline, saveOfflineResult, getResultsForJob } = useOfflineStorage();
  
  const [result, setResult] = useState<'pass' | 'fail' | 'na' | 'not_tested'>('not_tested');
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Inline "Flag Deficiency" panel
  const [showFlagPanel, setShowFlagPanel] = useState(false);
  const [flagTitle, setFlagTitle] = useState("");
  const [flagSeverity, setFlagSeverity] = useState<"critical" | "major" | "minor" | "observation">("major");
  const [flagDescription, setFlagDescription] = useState("");
  const [flagPhotoFile, setFlagPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Get category from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const category = searchParams.get('category');

  const { data: device, isLoading: deviceLoading } = trpc.device.get.useQuery(
    { id: deviceId },
    { enabled: true, retry: isOnline ? 2 : 0 }
  );

  const { data: existingResult } = trpc.inspectionResult.getByJobAndDevice.useQuery(
    { jobId, deviceId },
    { enabled: true, retry: isOnline ? 2 : 0 }
  );

  // Get job details for category navigation
  const { data: jobData } = trpc.job.getWithDetails.useQuery(
    { id: jobId },
    { enabled: true, retry: isOnline ? 2 : 0 }
  );

  // Calculate category devices for navigation
  const categoryDevices = useMemo(() => {
    if (!jobData?.devices) return [];
    
    let filtered = jobData.devices;
    if (category === 'smoke') {
      filtered = jobData.devices.filter((d: any) => isSmokeAlarm(d));
    } else if (category === 'firealarm') {
      filtered = jobData.devices.filter((d: any) => categorizeDevice(d) === 'fire_alarm');
    } else if (category === 'extinguisher') {
      filtered = jobData.devices.filter((d: any) => categorizeDevice(d) === 'extinguisher');
    } else if (category === 'emergency') {
      filtered = jobData.devices.filter((d: any) => categorizeDevice(d) === 'emergency');
    }
    
    return sortByWalkOrderThenLocation(filtered);
  }, [jobData?.devices, category]);

  // Find current device index and navigation
  const currentIndex = categoryDevices.findIndex((d: any) => d.id === deviceId);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < categoryDevices.length - 1;
  const previousDevice = hasPrevious ? categoryDevices[currentIndex - 1] : null;
  const nextDevice = hasNext ? categoryDevices[currentIndex + 1] : null;

  const navigateToDevice = (targetDeviceId: number) => {
    const categoryParam = category ? `?category=${category}` : '';
    setLocation(`/tech/jobs/${jobId}/device/${targetDeviceId}${categoryParam}`, { replace: true });
  };

  // Load existing result
  useEffect(() => {
    if (existingResult) {
      setResult(existingResult.result as any);
      setNotes(existingResult.notes || "");
    } else {
      // Check offline storage
      const offlineResults = getResultsForJob(jobId);
      const offlineResult = offlineResults.find(r => r.deviceId === deviceId);
      if (offlineResult) {
        setResult(offlineResult.result);
        setNotes(offlineResult.notes || "");
      }
    }
  }, [existingResult, jobId, deviceId, getResultsForJob]);

  const upsertResult = trpc.inspectionResult.upsert.useMutation({
    onSuccess: () => {
      toast.success('Result saved');
      setLocation(`/tech/jobs/${jobId}`);
    },
    onError: () => {
      // Save offline if online save fails
      saveOfflineResult({
        localId: nanoid(),
        jobId,
        deviceId,
        result,
        notes,
        testedAt: new Date(),
        synced: false
      });
      toast.success('Saved offline - will sync when online');
      setLocation(`/tech/jobs/${jobId}`);
    }
  });

  const handleSave = async () => {
    setIsSaving(true);
    
    if (isOnline) {
      upsertResult.mutate({ jobId, deviceId, result, notes });
    } else {
      // Save offline
      saveOfflineResult({
        localId: nanoid(),
        jobId,
        deviceId,
        result,
        notes,
        testedAt: new Date(),
        synced: false
      });
      toast.success('Saved offline - will sync when online');
      setLocation(`/tech/jobs/${jobId}`);
    }
    
    setIsSaving(false);
  };

  const createDeficiencyMutation = trpc.deficiency.create.useMutation({
    onSuccess: (def) => {
      toast.success("Deficiency flagged");
      // Upload photo if provided
      if (flagPhotoFile && def?.id) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          uploadPhotoMutation.mutate({
            entityType: "deficiency",
            entityId: def.id,
            fileName: flagPhotoFile.name,
            fileData: base64,
            mimeType: flagPhotoFile.type,
            jobId,
            deviceId,
          });
        };
        reader.readAsDataURL(flagPhotoFile);
      }
      setShowFlagPanel(false);
      setFlagTitle("");
      setFlagDescription("");
      setFlagPhotoFile(null);
    },
    onError: () => toast.error("Failed to create deficiency"),
  });

  const uploadPhotoMutation = trpc.attachment.upload.useMutation();

  const handleCreateDeficiency = () => {
    // Save current result first
    if (result === 'fail') {
      saveOfflineResult({
        localId: nanoid(),
        jobId,
        deviceId,
        result,
        notes,
        testedAt: new Date(),
        synced: false
      });
    }
    setLocation(`/tech/deficiency/new/${jobId}?deviceId=${deviceId}`);
  };

  const handleFlagDeficiency = () => {
    if (!flagTitle.trim()) {
      toast.error("Please enter a title for the deficiency");
      return;
    }
    createDeficiencyMutation.mutate({
      jobId,
      deviceId,
      title: flagTitle.trim(),
      severity: flagSeverity,
      observedIssue: flagDescription.trim() || undefined,
      systemCategory: device?.category === "FIRE_EXTINGUISHER"
        ? "FIRE_EXTINGUISHER"
        : device?.category === "EMERGENCY_LIGHT"
        ? "EMERGENCY_LIGHTING"
        : device?.category === "SPRINKLER"
        ? "SPRINKLER"
        : device?.category === "SMOKE_ALARM"
        ? "SMOKE_ALARM"
        : "FIRE_ALARM",
    });
  };

  if (deviceLoading && !device) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href={`/tech/jobs/${jobId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg truncate">Device Test</h1>
            <p className="text-xs text-muted-foreground">{device?.deviceType || 'Device'}</p>
          </div>
          <PageHelpButton size="icon" routeKey="tech_device_test" />
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

      <main className="container py-4 space-y-6">
        {/* Device Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{device?.deviceType || 'Unknown Device'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {device?.location && (
              <p><span className="text-muted-foreground">Location:</span> {device.location}</p>
            )}
            {device?.manufacturer && (
              <p><span className="text-muted-foreground">Manufacturer:</span> {device.manufacturer}</p>
            )}
            {device?.model && (
              <p><span className="text-muted-foreground">Model:</span> {device.model}</p>
            )}
            {device?.serialNumber && (
              <p><span className="text-muted-foreground">Serial:</span> {device.serialNumber}</p>
            )}
          </CardContent>
        </Card>

        {/* Test Result Buttons */}
        <div className="space-y-3">
          <h2 className="font-semibold">Test Result</h2>
          <div className="grid grid-cols-3 gap-3">
            <Button
              className={`action-btn ${result === 'pass' ? 'bg-[var(--success)] hover:bg-[var(--success)]/90 text-white' : 'bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/20'}`}
              onClick={() => setResult('pass')}
            >
              <Check className="h-6 w-6 mr-2" />
              PASS
            </Button>
            <Button
              className={`action-btn ${result === 'fail' ? 'bg-destructive hover:bg-destructive/90 text-white' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'}`}
              onClick={() => setResult('fail')}
            >
              <X className="h-6 w-6 mr-2" />
              FAIL
            </Button>
            <Button
              className={`action-btn ${result === 'na' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              onClick={() => setResult('na')}
            >
              <Minus className="h-6 w-6 mr-2" />
              N/A
            </Button>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-3">
          <h2 className="font-semibold">Notes</h2>
          <Textarea
            placeholder="Add inspection notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[120px] text-base"
          />
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="font-semibold">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-14" disabled>
              <Camera className="h-5 w-5 mr-2" />
              Add Photo
            </Button>
            <Button
              variant="outline"
              className="h-14 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setShowFlagPanel(true)}
            >
              <Flag className="h-5 w-5 mr-2" />
              Flag Deficiency
            </Button>
          </div>
        </div>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 safe-bottom z-40">
        <div className="container space-y-3 max-w-2xl mx-auto">
          {/* Navigation Buttons */}
          {category && categoryDevices.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => previousDevice && navigateToDevice(previousDevice.id)}
                disabled={!hasPrevious}
                className="h-12 text-sm sm:text-base"
              >
                <ChevronLeft className="h-5 w-5 mr-1" />
                <span className="safe-text">Previous</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => nextDevice && navigateToDevice(nextDevice.id)}
                disabled={!hasNext}
                className="h-12 text-sm sm:text-base"
              >
                <span className="safe-text">Next</span>
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            </div>
          )}
          
          {/* Position indicator */}
          {category && categoryDevices.length > 1 && (
            <p className="text-center text-xs sm:text-sm text-muted-foreground safe-text">
              Device {currentIndex + 1} of {categoryDevices.length}
              {!hasPrevious && <span className="ml-2 hidden sm:inline">(Start of list)</span>}
              {!hasNext && <span className="ml-2 hidden sm:inline">(End of list)</span>}
            </p>
          )}
          
          <Button
            className="w-full action-btn h-12"
            onClick={handleSave}
            disabled={isSaving || result === 'not_tested'}
          >
            <Save className="h-5 w-5 mr-2" />
            <span className="safe-text">{isSaving ? 'Saving...' : 'Save Result'}</span>
          </Button>
        </div>
      </div>

      {/* ── Inline Flag Deficiency Sheet ──────────────────────────────────── */}
      <Sheet open={showFlagPanel} onOpenChange={setShowFlagPanel}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Flag Deficiency
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={flagTitle}
                onChange={(e) => setFlagTitle(e.target.value)}
                placeholder="e.g. Detector missing cover plate"
              />
            </div>

            {/* Severity */}
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={flagSeverity} onValueChange={(v) => setFlagSeverity(v as typeof flagSeverity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={flagDescription}
                onChange={(e) => setFlagDescription(e.target.value)}
                placeholder="Describe the issue observed..."
                rows={3}
              />
            </div>

            {/* Photo upload */}
            <div className="space-y-1.5">
              <Label>Photo (optional)</Label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setFlagPhotoFile(e.target.files?.[0] ?? null)}
              />
              {flagPhotoFile ? (
                <div className="flex items-center gap-2 p-2 border rounded-md text-sm">
                  <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{flagPhotoFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setFlagPhotoFile(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => photoInputRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" />
                  Take / Choose Photo
                </Button>
              )}
            </div>

            {/* Submit */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowFlagPanel(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleFlagDeficiency}
                disabled={createDeficiencyMutation.isPending}
              >
                {createDeficiencyMutation.isPending ? "Saving..." : "Flag Deficiency"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
