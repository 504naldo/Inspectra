import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Minus, AlertCircle, Cloud, CloudOff, Loader2, WifiOff, Wifi } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { offlineStorage } from "@/lib/offlineStorage";
import { useTrackInspectionProgress } from "@/hooks/useInspectionProgress";

type ChecklistItem = {
  id: number;
  sectionName: string;
  sectionOrder: number;
  itemLetter: string | null;
  itemDescription: string;
  inputType: string;
  numericLabel: string | null;
  numericUnit: string | null;
  isRequired: boolean;
};

type InspectionResult = {
  result: string;
  notes: string;
  numericValue?: string;
  textValue?: string;
};

export default function FireAlarmInspection() {
  const { jobId } = useParams();
  const [location, setLocation] = useLocation();
  
  // Track inspection progress for resume functionality
  useTrackInspectionProgress(
    jobId!,
    location,
    'fire-alarm',
    'Fire Alarm Inspection'
  );
  const [results, setResults] = useState<Record<number, InspectionResult>>({});
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isOnline = useOnlineStatus();

  // Fetch job details
  const { data: job, isLoading: loadingJob } = trpc.job.get.useQuery(
    { id: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  // Fetch fire alarm system for the site
  const { data: fireAlarmSystem } = trpc.fireAlarm.getSystemBySite.useQuery(
    { siteId: job?.siteId! },
    { enabled: !!job?.siteId }
  );

  // Fetch checklist templates
  const { data: checklistSections, isLoading: loadingChecklist } = trpc.fireAlarm.getChecklistSections.useQuery();

  // Fetch existing results
  const { data: existingResults } = trpc.fireAlarm.getInspectionResults.useQuery(
    { jobId: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  // Save result mutation
  const saveResult = trpc.fireAlarm.saveInspectionResult.useMutation({
    onSuccess: () => {
      setAutoSaveStatus('saved');
      // Reset to idle after 2 seconds
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    },
    onError: (error: any) => {
      setAutoSaveStatus('error');
      toast.error(`Auto-save failed: ${error.message}`);
      // Reset to idle after 3 seconds
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    },
  });

  // Load existing results into state
  useEffect(() => {
    if (existingResults) {
      const resultsMap: Record<number, InspectionResult> = {};
      existingResults.forEach((r: any) => {
        resultsMap[r.checklistItemId] = {
          result: r.result as string,
          notes: r.notes || "",
          numericValue: r.numericValue || "",
          textValue: r.textValue || "",
        };
      });
      setResults(resultsMap);
    }
  }, [existingResults]);

  const handleResultChange = async (itemId: number, result: "pass" | "fail" | "na" | "not_tested") => {
    const currentResult = results[itemId] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    const newResults = { ...results, [itemId]: { ...currentResult, result } };
    setResults(newResults);

    // Save immediately
    await saveResult.mutateAsync({
      jobId: parseInt(jobId!),
      fireAlarmSystemId: fireAlarmSystem?.id!,
      checklistItemId: itemId,
      result,
      notes: newResults[itemId].notes,
      numericValue: newResults[itemId].numericValue,
      textValue: newResults[itemId].textValue,
    });
  };

  const handleNumericChange = (itemId: number, value: string) => {
    const currentResult = results[itemId] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    setResults({ ...results, [itemId]: { ...currentResult, numericValue: value } });
    
    // Trigger auto-save with debouncing
    triggerAutoSave(itemId);
  };

  const handleTextChange = (itemId: number, value: string) => {
    const currentResult = results[itemId] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    setResults({ ...results, [itemId]: { ...currentResult, textValue: value } });
    
    // Trigger auto-save with debouncing
    triggerAutoSave(itemId);
  };

  const handleNotesChange = (itemId: number, notes: string) => {
    const currentResult = results[itemId] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    setResults({ ...results, [itemId]: { ...currentResult, notes } });
    
    // Trigger auto-save with debouncing
    triggerAutoSave(itemId);
  };

  // Auto-save with debouncing
  const triggerAutoSave = (itemId: number) => {
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // Set status to saving
    setAutoSaveStatus('saving');
    
    // Set new timer for 2 seconds
    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveValue(itemId);
    }, 2000);
  };

  const handleSaveValue = async (itemId: number) => {
    const currentResult = results[itemId];
    if (!currentResult) return;

    const data = {
      jobId: parseInt(jobId!),
      fireAlarmSystemId: fireAlarmSystem?.id!,
      checklistItemId: itemId,
      result: (currentResult.result as "pass" | "fail" | "na" | "not_tested") || "not_tested",
      notes: currentResult.notes || "",
      numericValue: currentResult.numericValue,
      textValue: currentResult.textValue,
    };

    // If offline, save to IndexedDB
    if (!isOnline) {
      try {
        await offlineStorage.savePendingResult(data);
        setAutoSaveStatus('saved');
        toast.info("Saved offline. Will sync when online.");
        // Update pending count
        const count = await offlineStorage.getPendingCount();
        setPendingCount(count);
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch (error) {
        console.error("Failed to save offline:", error);
        setAutoSaveStatus('error');
        toast.error("Failed to save offline");
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      }
      return;
    }

    // If online, save to server
    try {
      await saveResult.mutateAsync(data);
    } catch (error) {
      // If server save fails, fall back to offline storage
      console.error("Server save failed, falling back to offline:", error);
      try {
        await offlineStorage.savePendingResult(data);
        setAutoSaveStatus('saved');
        toast.info("Saved offline. Will sync when connection improves.");
        const count = await offlineStorage.getPendingCount();
        setPendingCount(count);
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch (offlineError) {
        console.error("Offline save also failed:", offlineError);
        setAutoSaveStatus('error');
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      }
    }
  };
  
  // Sync pending results when connection returns
  useEffect(() => {
    const syncPendingResults = async () => {      
      if (!isOnline) return;
      
      try {
        const pending = await offlineStorage.getPendingResults();
        if (pending.length === 0) return;
        
        console.log(`Syncing ${pending.length} pending results...`);
        toast.info(`Syncing ${pending.length} offline changes...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const item of pending) {
          try {
            await saveResult.mutateAsync({
              jobId: item.jobId,
              fireAlarmSystemId: item.fireAlarmSystemId,
              checklistItemId: item.checklistItemId,
              result: item.result,
              notes: item.notes,
              numericValue: item.numericValue,
              textValue: item.textValue,
            });
            
            // Mark as synced and delete from local storage
            await offlineStorage.markAsSynced(item.id);
            await offlineStorage.deleteSyncedResult(item.id);
            successCount++;
          } catch (error) {
            console.error(`Failed to sync item ${item.id}:`, error);
            failCount++;
          }
        }
        
        // Update pending count
        const remainingCount = await offlineStorage.getPendingCount();
        setPendingCount(remainingCount);
        
        if (successCount > 0) {
          toast.success(`Synced ${successCount} offline changes`);
        }
        if (failCount > 0) {
          toast.error(`Failed to sync ${failCount} changes`);
        }
      } catch (error) {
        console.error("Sync failed:", error);
      }
    };
    
    // Sync when coming online
    if (isOnline) {
      syncPendingResults();
    }
  }, [isOnline]);
  
  // Load pending count on mount
  useEffect(() => {
    const loadPendingCount = async () => {
      const count = await offlineStorage.getPendingCount();
      setPendingCount(count);
    };
    loadPendingCount();
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  if (loadingJob || loadingChecklist) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading fire alarm inspection...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Job Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">The requested job could not be found.</p>
            <Button onClick={() => setLocation("/tech/jobs")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Process checklist sections (API returns array of sections with nested items)
  const sections: Record<string, ChecklistItem[]> = {};
  checklistSections?.forEach((section: any) => {
    sections[section.sectionName] = section.items || [];
  });

  const sectionNames = Object.keys(sections).sort((a, b) => {
    const orderA = sections[a]?.[0]?.sectionOrder || 0;
    const orderB = sections[b]?.[0]?.sectionOrder || 0;
    return orderA - orderB;
  });

  // Calculate progress
  const totalItems = Object.values(sections).flat().length;
  const completedItems = Object.values(results).filter(r => r.result !== "not_tested").length;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const renderInputField = (item: ChecklistItem) => {
    const currentResult = results[item.id] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };

    // For checkbox type (default), show YES/NO/N/A buttons
    if (item.inputType === "checkbox") {
      return (
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant={currentResult.result === "pass" ? "default" : "outline"}
            className={currentResult.result === "pass" ? "bg-green-600 hover:bg-green-700" : ""}
            onClick={() => handleResultChange(item.id, "pass")}
          >
            <Check className="h-4 w-4 mr-1" />
            YES
          </Button>
          <Button
            size="sm"
            variant={currentResult.result === "fail" ? "default" : "outline"}
            className={currentResult.result === "fail" ? "bg-red-600 hover:bg-red-700" : ""}
            onClick={() => handleResultChange(item.id, "fail")}
          >
            <X className="h-4 w-4 mr-1" />
            NO
          </Button>
          <Button
            size="sm"
            variant={currentResult.result === "na" ? "default" : "outline"}
            className={currentResult.result === "na" ? "bg-gray-600 hover:bg-gray-700" : ""}
            onClick={() => handleResultChange(item.id, "na")}
          >
            <Minus className="h-4 w-4 mr-1" />
            N/A
          </Button>
        </div>
      );
    }

    // For numeric types (voltage, current, numeric, year)
    if (["voltage", "current", "numeric", "year"].includes(item.inputType)) {
      return (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium min-w-[80px]">
              {item.numericLabel || "Value:"}
            </Label>
            <Input
              type="text"
              value={currentResult.numericValue || ""}
              onChange={(e) => handleNumericChange(item.id, e.target.value)}
              onBlur={() => handleSaveValue(item.id)}
              placeholder={item.inputType === "year" ? "YYYY" : "Enter value"}
              className="max-w-[200px]"
            />
            {item.numericUnit && (
              <span className="text-sm text-muted-foreground">{item.numericUnit}</span>
            )}
          </div>
        </div>
      );
    }

    // For text, date, time types
    if (["text", "date", "time"].includes(item.inputType)) {
      return (
        <div className="mt-2 space-y-2">
          <Label className="text-sm font-medium">
            {item.numericLabel || "Value:"}
          </Label>
          <Input
            type={item.inputType === "date" ? "date" : item.inputType === "time" ? "time" : "text"}
            value={currentResult.textValue || ""}
            onChange={(e) => handleTextChange(item.id, e.target.value)}
            onBlur={() => handleSaveValue(item.id)}
            placeholder="Enter value"
            className="max-w-[300px]"
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="container py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/tech/jobs')}
            className="mb-2 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            My Jobs
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Fire Alarm System Inspection</h1>
              <p className="text-sm text-muted-foreground">CAN/ULC-S536:2019 Annual Test</p>
            </div>
            {/* Status indicators */}
            <div className="flex items-center gap-4">
              {/* Online/Offline indicator */}
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Wifi className="h-4 w-4" />
                    <span>Online</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-orange-600">
                    <WifiOff className="h-4 w-4" />
                    <span>Offline</span>
                  </div>
                )}
              </div>
              
              {/* Pending sync count */}
              {pendingCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-orange-600">
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                    {pendingCount} pending
                  </Badge>
                </div>
              )}
              
              {/* Auto-save status indicator */}
              <div className="flex items-center gap-2">
                {autoSaveStatus === 'saving' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </div>
                )}
                {autoSaveStatus === 'saved' && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Cloud className="h-4 w-4" />
                    <span>Saved</span>
                  </div>
                )}
                {autoSaveStatus === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <CloudOff className="h-4 w-4" />
                    <span>Save failed</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* Fire Alarm System Info */}
        {fireAlarmSystem && (
          <Card>
            <CardHeader>
              <CardTitle>Fire Alarm System Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Manufacturer</p>
                  <p className="font-medium">{fireAlarmSystem.manufacturer || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Model</p>
                  <p className="font-medium">{fireAlarmSystem.modelNumber || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Operation Type</p>
                  <Badge variant="secondary">
                    {fireAlarmSystem.operationType === "single_stage" ? "Single Stage" : 
                     fireAlarmSystem.operationType === "two_stage" ? "Two Stage" : "Other"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monitoring Centre</p>
                  <p className="font-medium">
                    {fireAlarmSystem.connectedToMonitoring ? 
                      fireAlarmSystem.monitoringCentreName || "Yes" : "No"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress Card */}
        <Card>
          <CardHeader>
            <CardTitle>Inspection Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Completed</span>
                <span className="font-medium">{completedItems} / {totalItems}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">{progressPercent}% Complete</p>
            </div>
          </CardContent>
        </Card>

        {/* Checklist Sections */}
        <Card>
          <CardHeader>
            <CardTitle>Inspection Checklist</CardTitle>
            <p className="text-sm text-muted-foreground">
              Complete all required tests and inspections
            </p>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {sectionNames.map((sectionName, idx) => {
                const items = sections[sectionName] || [];
                const sectionCompleted = items.filter((item: ChecklistItem) => 
                  results[item.id]?.result && results[item.id].result !== "not_tested"
                ).length;
                const sectionTotal = items.length;

                return (
                  <AccordionItem key={idx} value={`section-${idx}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <span className="font-medium text-left">{sectionName}</span>
                        <Badge variant="secondary" className="ml-2">
                          {sectionCompleted}/{sectionTotal}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        {items.map((item: ChecklistItem) => {
                          const currentResult = results[item.id] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
                          
                          return (
                            <div key={item.id} className="border-l-4 border-l-muted pl-4 py-2">
                              <div className="flex items-start gap-2">
                                {item.itemLetter && (
                                  <span className="font-bold text-sm min-w-[24px]">{item.itemLetter}.</span>
                                )}
                                <div className="flex-1">
                                  <p className="text-sm">{item.itemDescription}</p>
                                  
                                  {renderInputField(item)}

                                  {/* Notes textarea */}
                                  <div className="mt-3">
                                    <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                                    <Textarea
                                      value={currentResult.notes}
                                      onChange={(e) => handleNotesChange(item.id, e.target.value)}
                                      onBlur={() => handleSaveValue(item.id)}
                                      placeholder="Add notes..."
                                      className="mt-1 min-h-[60px]"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
