import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  ChevronRight
} from "lucide-react";
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

  // Get category from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const category = searchParams.get('category');

  const { data: device, isLoading: deviceLoading } = trpc.device.get.useQuery(
    { id: deviceId },
    { enabled: isOnline }
  );

  const { data: existingResult } = trpc.inspectionResult.getByJobAndDevice.useQuery(
    { jobId, deviceId },
    { enabled: isOnline }
  );

  // Get job details for category navigation
  const { data: jobData } = trpc.job.getWithDetails.useQuery(
    { id: jobId },
    { enabled: isOnline }
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

  if (deviceLoading && isOnline) {
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
              className={`action-btn ${result === 'pass' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
              onClick={() => setResult('pass')}
            >
              <Check className="h-6 w-6 mr-2" />
              PASS
            </Button>
            <Button
              className={`action-btn ${result === 'fail' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
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
            {result === 'fail' && (
              <Button 
                variant="outline" 
                className="h-14 border-destructive text-destructive hover:bg-destructive/10"
                onClick={handleCreateDeficiency}
              >
                <AlertTriangle className="h-5 w-5 mr-2" />
                Create Deficiency
              </Button>
            )}
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
    </div>
  );
}
