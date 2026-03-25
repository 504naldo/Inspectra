import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, X, Minus, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

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

type ItemResult = {
  result: "pass" | "fail" | "na" | "not_tested";
  notes: string;
  numericValue?: string;
  textValue?: string;
};

interface FireAlarmChecklistProps {
  jobId: number;
  siteId: number;
  isFinalized?: boolean;
}

export function FireAlarmChecklist({ jobId, siteId, isFinalized }: FireAlarmChecklistProps) {
  const [, setLocation] = useLocation();
  const [results, setResults] = useState<Record<number, ItemResult>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: fireAlarmSystem } = trpc.fireAlarm.getSystemBySite.useQuery(
    { siteId },
    { enabled: !!siteId }
  );

  const { data: checklistSections, isLoading } = trpc.fireAlarm.getChecklistSections.useQuery();

  const { data: existingResults } = trpc.fireAlarm.getInspectionResults.useQuery(
    { jobId },
    { enabled: !!jobId }
  );

  const saveResult = trpc.fireAlarm.saveInspectionResult.useMutation({
    onSuccess: () => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (err: any) => {
      setSaveStatus("error");
      toast.error(`Save failed: ${err.message}`);
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  useEffect(() => {
    if (existingResults) {
      const map: Record<number, ItemResult> = {};
      existingResults.forEach((r: any) => {
        map[r.checklistItemId] = {
          result: r.result as ItemResult["result"],
          notes: r.notes || "",
          numericValue: r.numericValue != null ? String(r.numericValue) : "",
          textValue: r.textValue || "",
        };
      });
      setResults(map);
    }
  }, [existingResults]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const doSave = (itemId: number, updatedResults: Record<number, ItemResult>) => {
    const r = updatedResults[itemId];
    if (!r || !fireAlarmSystem?.id) return;
    saveResult.mutate({
      jobId,
      fireAlarmSystemId: fireAlarmSystem.id,
      checklistItemId: itemId,
      result: r.result,
      notes: r.notes,
      numericValue: r.numericValue,
      textValue: r.textValue,
    });
  };

  const handleResultClick = (itemId: number, result: ItemResult["result"]) => {
    if (isFinalized) return;
    const base = results[itemId] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    const updated = { ...results, [itemId]: { ...base, result } };
    setResults(updated);
    doSave(itemId, updated);
  };

  const handleValueChange = (itemId: number, field: "numericValue" | "textValue", value: string) => {
    if (isFinalized) return;
    const base = results[itemId] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    const updated = { ...results, [itemId]: { ...base, [field]: value } };
    setResults(updated);
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSave(itemId, updated), 1500);
  };

  // Build sections map
  const sections: Record<string, ChecklistItem[]> = {};
  checklistSections?.forEach((section: any) => {
    sections[section.sectionName] = section.items || [];
  });
  const sectionNames = Object.keys(sections).sort((a, b) => {
    return (sections[a]?.[0]?.sectionOrder || 0) - (sections[b]?.[0]?.sectionOrder || 0);
  });

  const totalItems = Object.values(sections).flat().length;
  const completedItems = Object.values(results).filter((r) => r.result !== "not_tested").length;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const renderInput = (item: ChecklistItem) => {
    const r = results[item.id] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };

    if (item.inputType === "checkbox") {
      return (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <Button
            size="sm"
            variant={r.result === "pass" ? "default" : "outline"}
            className={cn("h-7 text-xs", r.result === "pass" && "bg-green-600 hover:bg-green-700")}
            onClick={() => handleResultClick(item.id, "pass")}
            disabled={isFinalized}
          >
            <Check className="h-3 w-3 mr-1" /> YES
          </Button>
          <Button
            size="sm"
            variant={r.result === "fail" ? "default" : "outline"}
            className={cn("h-7 text-xs", r.result === "fail" && "bg-red-600 hover:bg-red-700")}
            onClick={() => handleResultClick(item.id, "fail")}
            disabled={isFinalized}
          >
            <X className="h-3 w-3 mr-1" /> NO
          </Button>
          <Button
            size="sm"
            variant={r.result === "na" ? "default" : "outline"}
            className={cn("h-7 text-xs", r.result === "na" && "bg-gray-500 hover:bg-gray-600")}
            onClick={() => handleResultClick(item.id, "na")}
            disabled={isFinalized}
          >
            <Minus className="h-3 w-3 mr-1" /> N/A
          </Button>
        </div>
      );
    }

    if (["voltage", "current", "numeric", "year"].includes(item.inputType)) {
      return (
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs text-muted-foreground min-w-[80px]">
            {item.numericLabel || "Value:"}
          </Label>
          <Input
            type="text"
            value={r.numericValue || ""}
            onChange={(e) => handleValueChange(item.id, "numericValue", e.target.value)}
            placeholder={item.inputType === "year" ? "YYYY" : "Enter value"}
            className="h-7 text-xs max-w-[120px]"
            disabled={isFinalized}
          />
          {item.numericUnit && (
            <span className="text-xs text-muted-foreground">{item.numericUnit}</span>
          )}
        </div>
      );
    }

    if (["text", "date", "time"].includes(item.inputType)) {
      return (
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs text-muted-foreground min-w-[80px]">
            {item.numericLabel || "Value:"}
          </Label>
          <Input
            type={item.inputType === "date" ? "date" : item.inputType === "time" ? "time" : "text"}
            value={r.textValue || ""}
            onChange={(e) => handleValueChange(item.id, "textValue", e.target.value)}
            placeholder="Enter value"
            className="h-7 text-xs max-w-[200px]"
            disabled={isFinalized}
          />
        </div>
      );
    }

    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading checklist…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progress bar + status + link */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {completedItems} / {totalItems} items
            </span>
            <div className="flex items-center gap-2">
              {saveStatus === "saving" && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
              <Badge variant="outline" className="text-xs">
                {progressPct}%
              </Badge>
            </div>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs flex-shrink-0"
          onClick={() => setLocation(`/tech/jobs/${jobId}/fire-alarm`)}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Full view
        </Button>
      </div>

      {/* Sections accordion */}
      <Accordion type="multiple" className="space-y-1">
        {sectionNames.map((sectionName) => {
          const items = sections[sectionName] || [];
          const sectionCompleted = items.filter((i) => {
            const r = results[i.id];
            return r && r.result !== "not_tested";
          }).length;
          const allDone = sectionCompleted === items.length && items.length > 0;

          return (
            <AccordionItem
              key={sectionName}
              value={sectionName}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="text-sm font-medium text-left">{sectionName}</span>
                  <Badge
                    variant={allDone ? "default" : "secondary"}
                    className={cn("ml-2 text-xs flex-shrink-0", allDone && "bg-green-600")}
                  >
                    {sectionCompleted}/{items.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="space-y-4 pt-2">
                  {items.map((item) => {
                    const r = results[item.id];
                    const isDone = r && r.result !== "not_tested";
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-md p-2 border",
                          isDone && r.result === "pass" && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20",
                          isDone && r.result === "fail" && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20",
                          isDone && r.result === "na" && "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/20",
                          !isDone && "border-border"
                        )}
                      >
                        <p className="text-xs leading-snug">
                          {item.itemLetter && (
                            <span className="font-semibold mr-1">{item.itemLetter}.</span>
                          )}
                          {item.itemDescription}
                          {item.isRequired && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </p>
                        {renderInput(item)}
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
