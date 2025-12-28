import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Minus, AlertCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function FireAlarmInspection() {
  const { jobId } = useParams();
  const [, setLocation] = useLocation();
  const [results, setResults] = useState<Record<number, { result: string; notes: string }>>({});

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
      toast.success("Result saved");
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Load existing results into state
  useEffect(() => {
    if (existingResults) {
      const resultsMap: Record<number, { result: string; notes: string }> = {};
      existingResults.forEach((r: any) => {
        resultsMap[r.checklistItemId] = {
          result: r.result as "pass" | "fail" | "na" | "not_tested",
          notes: r.notes || "",
        };
      });
      setResults(resultsMap);
    }
  }, [existingResults]);

  const handleResultChange = async (itemId: number, result: "pass" | "fail" | "na" | "not_tested") => {
    const newResults = { ...results, [itemId]: { result, notes: results[itemId]?.notes || "" } };
    setResults(newResults);

    // Save immediately
    await saveResult.mutateAsync({
      jobId: parseInt(jobId!),
      fireAlarmSystemId: fireAlarmSystem?.id!,
      checklistItemId: itemId,
      result,
      notes: newResults[itemId].notes,
    });
  };

  const handleNotesChange = (itemId: number, notes: string) => {
    setResults({ ...results, [itemId]: { ...results[itemId], notes } });
  };

  const handleNotesSave = async (itemId: number) => {
    if (!results[itemId]) return;

    await saveResult.mutateAsync({
      jobId: parseInt(jobId!),
      fireAlarmSystemId: fireAlarmSystem?.id!,
      checklistItemId: itemId,
      result: (results[itemId].result as "pass" | "fail" | "na" | "not_tested") || "not_tested",
      notes: results[itemId].notes,
    });
  };

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
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Job not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate progress
  const totalItems = checklistSections?.reduce((sum: number, section: any) => sum + section.items.length, 0) || 0;
  const completedItems = Object.values(results).filter((r) => r.result !== "not_tested").length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const getResultIcon = (result: string) => {
    switch (result) {
      case "pass":
        return <Check className="h-5 w-5 text-green-600" />;
      case "fail":
        return <X className="h-5 w-5 text-red-600" />;
      case "na":
        return <Minus className="h-5 w-5 text-gray-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getResultBadgeVariant = (result: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (result) {
      case "pass":
        return "default";
      case "fail":
        return "destructive";
      case "na":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container py-4">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation(`/tech/jobs/${jobId}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Fire Alarm Inspection</h1>
              <p className="text-sm text-muted-foreground">{job.jobNumber} - CAN/ULC-S536</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {completedItems} / {totalItems} items
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* System Info */}
      {fireAlarmSystem && (
        <div className="container mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Manufacturer:</span>
                <span className="font-medium">{fireAlarmSystem.manufacturer || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model:</span>
                <span className="font-medium">{fireAlarmSystem.modelNumber || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operation:</span>
                <span className="font-medium capitalize">{fireAlarmSystem.operationType?.replace("_", " ") || "N/A"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Checklist Sections */}
      <div className="container mt-4 space-y-4">
        {checklistSections?.map((section: any) => (
          <Card key={section.id}>
            <Accordion type="single" collapsible>
              <AccordionItem value={`section-${section.id}`} className="border-none">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="text-left">
                      <h3 className="font-semibold">{section.sectionName}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {section.items.filter((item: any) => results[item.id]?.result !== "not_tested").length} / {section.items.length} completed
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4">
                  <div className="space-y-4">
                    {section.items.map((item: any) => (
                      <div key={item.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          {item.itemLetter && (
                            <Badge variant="outline" className="shrink-0">
                              {item.itemLetter}
                            </Badge>
                          )}
                          <p className="text-sm flex-1">{item.itemDescription}</p>
                        </div>

                        {/* Result Buttons */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={results[item.id]?.result === "pass" ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => handleResultChange(item.id, "pass")}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Pass
                          </Button>
                          <Button
                            size="sm"
                            variant={results[item.id]?.result === "fail" ? "destructive" : "outline"}
                            className="flex-1"
                            onClick={() => handleResultChange(item.id, "fail")}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Fail
                          </Button>
                          <Button
                            size="sm"
                            variant={results[item.id]?.result === "na" ? "secondary" : "outline"}
                            className="flex-1"
                            onClick={() => handleResultChange(item.id, "na")}
                          >
                            <Minus className="h-4 w-4 mr-1" />
                            N/A
                          </Button>
                        </div>

                        {/* Notes */}
                        {results[item.id]?.result && results[item.id]?.result !== "not_tested" && (
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Add notes (optional)..."
                              value={results[item.id]?.notes || ""}
                              onChange={(e) => handleNotesChange(item.id, e.target.value)}
                              onBlur={() => handleNotesSave(item.id)}
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        ))}
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="container flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setLocation(`/tech/jobs/${jobId}`)}>
            Save & Exit
          </Button>
          <Button
            className="flex-1"
            disabled={progress < 100}
            onClick={() => {
              toast.success("Fire alarm inspection completed");
              setLocation(`/tech/jobs/${jobId}`);
            }}
          >
            Complete Inspection
          </Button>
        </div>
      </div>
    </div>
  );
}
