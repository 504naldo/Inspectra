import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, X, Minus, Loader2, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type ChecklistRow = {
  id: number;
  sectionName: string;
  sectionOrder: number;
  itemLetter: string | null;
  itemDescription: string;
  inputType: string;
  numericLabel: string | null;
  numericUnit: string | null;
  isRequired: boolean;
  hasSubItems: boolean;
  subItems: string[] | null;
  notApplicableNote: string | null;
  headerFields: string[] | null;
  resultId: number | null;
  result: "pass" | "fail" | "na" | "not_tested";
  numericValue: string | null;
  textValue: string | null;
  notes: string | null;
  fireAlarmSystemId: number | null;
};

type ItemResult = {
  result: "pass" | "fail" | "na" | "not_tested";
  notes: string;
  numericValue: string;
  textValue: string;
};

interface FireAlarmChecklistProps {
  jobId: number;
  siteId: number;
  isFinalized?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FireAlarmChecklist({ jobId, siteId, isFinalized }: FireAlarmChecklistProps) {
  const [, setLocation] = useLocation();
  const [results, setResults] = useState<Record<number, ItemResult>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: fireAlarmSystem } = trpc.fireAlarm.getSystemBySite.useQuery(
    { siteId },
    { enabled: !!siteId }
  );

  // Primary query: job-specific checklist (template items merged with saved results)
  const { data: jobChecklist, isLoading } = trpc.fireAlarm.getJobChecklist.useQuery(
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

  // Seed local state from loaded job checklist
  useEffect(() => {
    if (!jobChecklist) return;
    const map: Record<number, ItemResult> = {};
    jobChecklist.forEach((row: ChecklistRow) => {
      if (row.result !== "not_tested" || row.numericValue || row.textValue) {
        map[row.id] = {
          result: row.result,
          notes: row.notes || "",
          numericValue: row.numericValue ?? "",
          textValue: row.textValue ?? "",
        };
      }
    });
    setResults(map);
  }, [jobChecklist]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Resolve fireAlarmSystemId from pre-populated row or fallback to system query
  const resolveSystemId = (row: ChecklistRow): number | null => {
    if (row.fireAlarmSystemId) return row.fireAlarmSystemId;
    return fireAlarmSystem?.id ?? null;
  };

  const doSave = (itemId: number, updatedResults: Record<number, ItemResult>, row: ChecklistRow) => {
    const r = updatedResults[itemId];
    if (!r) return;
    const systemId = resolveSystemId(row);
    if (!systemId) return;
    saveResult.mutate({
      jobId,
      fireAlarmSystemId: systemId,
      checklistItemId: itemId,
      result: r.result,
      notes: r.notes,
      numericValue: r.numericValue || undefined,
      textValue: r.textValue || undefined,
    });
  };

  const handleResultClick = (item: ChecklistRow, result: ItemResult["result"]) => {
    if (isFinalized) return;
    const base = results[item.id] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    const updated = { ...results, [item.id]: { ...base, result } };
    setResults(updated);
    doSave(item.id, updated, item);
  };

  const handleValueChange = (item: ChecklistRow, field: "numericValue" | "textValue", value: string) => {
    if (isFinalized) return;
    const base = results[item.id] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    const updated = { ...results, [item.id]: { ...base, [field]: value } };
    setResults(updated);
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSave(item.id, updated, item), 1500);
  };

  // Mark all items in a section as N/A
  const handleSectionNA = (sectionItems: ChecklistRow[]) => {
    if (isFinalized) return;
    const updated = { ...results };
    sectionItems.forEach((item) => {
      updated[item.id] = {
        result: "na",
        notes: "",
        numericValue: "",
        textValue: "",
      };
      doSave(item.id, updated, item);
    });
    setResults(updated);
  };

  // Check if all items in a section are N/A
  const isSectionNA = (sectionItems: ChecklistRow[]) =>
    sectionItems.length > 0 && sectionItems.every((item) => results[item.id]?.result === "na");

  // Group rows into sections
  const sections = new Map<string, { meta: ChecklistRow; items: ChecklistRow[] }>();
  (jobChecklist || []).forEach((row: ChecklistRow) => {
    const key = `${row.sectionOrder}:${row.sectionName}`;
    if (!sections.has(key)) {
      sections.set(key, { meta: row, items: [] });
    }
    sections.get(key)!.items.push(row);
  });
  const sortedSections = [...sections.values()].sort(
    (a, b) => a.meta.sectionOrder - b.meta.sectionOrder
  );

  const totalItems = (jobChecklist || []).length;
  const completedItems = (jobChecklist || []).filter(
    (row: ChecklistRow) => (results[row.id]?.result ?? row.result) !== "not_tested"
  ).length;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const renderInput = (item: ChecklistRow) => {
    const r = results[item.id] || {
      result: item.result,
      notes: item.notes || "",
      numericValue: item.numericValue ?? "",
      textValue: item.textValue ?? "",
    };

    if (item.inputType === "checkbox") {
      return (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <Button size="sm" variant={r.result === "pass" ? "default" : "outline"}
            className={cn("h-7 text-xs", r.result === "pass" && "bg-green-600 hover:bg-green-700")}
            onClick={() => handleResultClick(item, "pass")} disabled={isFinalized}>
            <Check className="h-3 w-3 mr-1" /> YES
          </Button>
          <Button size="sm" variant={r.result === "fail" ? "default" : "outline"}
            className={cn("h-7 text-xs", r.result === "fail" && "bg-red-600 hover:bg-red-700")}
            onClick={() => handleResultClick(item, "fail")} disabled={isFinalized}>
            <X className="h-3 w-3 mr-1" /> NO
          </Button>
          <Button size="sm" variant={r.result === "na" ? "default" : "outline"}
            className={cn("h-7 text-xs", r.result === "na" && "bg-gray-500 hover:bg-gray-600")}
            onClick={() => handleResultClick(item, "na")} disabled={isFinalized}>
            <Minus className="h-3 w-3 mr-1" /> N/A
          </Button>
        </div>
      );
    }

    if (["voltage", "current", "numeric", "year", "text"].includes(item.inputType)) {
      return (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Label className="text-xs text-muted-foreground min-w-[80px]">
            {item.numericLabel || "Value:"}
          </Label>
          <Input
            type="text"
            value={r.numericValue || ""}
            onChange={(e) => handleValueChange(item, "numericValue", e.target.value)}
            placeholder={item.inputType === "year" ? "YYYY" : "Enter value"}
            className="h-7 text-xs max-w-[160px]"
            disabled={isFinalized}
          />
          {item.numericUnit && (
            <span className="text-xs text-muted-foreground">{item.numericUnit}</span>
          )}
        </div>
      );
    }

    if (["date", "time"].includes(item.inputType)) {
      return (
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs text-muted-foreground min-w-[80px]">
            {item.numericLabel || "Value:"}
          </Label>
          <Input
            type={item.inputType}
            value={r.textValue || ""}
            onChange={(e) => handleValueChange(item, "textValue", e.target.value)}
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
      {/* Progress bar */}
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
              <Badge variant="outline" className="text-xs">{progressPct}%</Badge>
            </div>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
        <Button variant="ghost" size="sm" className="text-xs flex-shrink-0"
          onClick={() => setLocation(`/tech/jobs/${jobId}/fire-alarm`)}>
          <ExternalLink className="h-3 w-3 mr-1" />
          Full view
        </Button>
      </div>

      {/* Sections accordion */}
      <Accordion type="multiple" className="space-y-1">
        {sortedSections.map(({ meta, items: sectionItems }) => {
          const effectiveResults = sectionItems.map((i) => results[i.id]?.result ?? i.result);
          const sectionCompleted = effectiveResults.filter((r) => r !== "not_tested").length;
          const allDone = sectionCompleted === sectionItems.length && sectionItems.length > 0;
          const sectionNAActive = isSectionNA(sectionItems);

          return (
            <AccordionItem
              key={`${meta.sectionOrder}:${meta.sectionName}`}
              value={`${meta.sectionOrder}:${meta.sectionName}`}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="text-sm font-medium text-left">{meta.sectionName}</span>
                  <Badge
                    variant={allDone ? "default" : "secondary"}
                    className={cn("ml-2 text-xs flex-shrink-0", allDone && "bg-green-600")}
                  >
                    {sectionCompleted}/{sectionItems.length}
                  </Badge>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-3 pb-3">
                <div className="space-y-3 pt-2">
                  {/* Header fields (e.g. "Control Unit Location: ____") */}
                  {meta.headerFields && meta.headerFields.length > 0 && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1 px-2 py-1.5 bg-muted/30 rounded text-xs text-muted-foreground border">
                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                      {meta.headerFields.map((field) => (
                        <span key={field} className="italic">{field}</span>
                      ))}
                    </div>
                  )}

                  {/* N/A section toggle for optional sections */}
                  {meta.notApplicableNote && (
                    <div className="flex items-center gap-2 px-1">
                      <Button
                        size="sm"
                        variant={sectionNAActive ? "default" : "outline"}
                        className={cn(
                          "h-7 text-xs",
                          sectionNAActive && "bg-gray-500 hover:bg-gray-600"
                        )}
                        onClick={() => handleSectionNA(sectionItems)}
                        disabled={isFinalized}
                      >
                        <Minus className="h-3 w-3 mr-1" />
                        N/A — Not present on this system
                      </Button>
                      <span className="text-xs text-muted-foreground italic">
                        {meta.notApplicableNote}
                      </span>
                    </div>
                  )}

                  {/* Checklist items */}
                  {sectionItems.map((item) => {
                    const r = results[item.id];
                    const effectiveResult = r?.result ?? item.result;
                    const isDone = effectiveResult !== "not_tested";

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-md p-2 border",
                          isDone && effectiveResult === "pass" && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20",
                          isDone && effectiveResult === "fail" && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20",
                          isDone && effectiveResult === "na" && "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/20",
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

                        {/* Sub-items */}
                        {item.hasSubItems && item.subItems && item.subItems.length > 0 && (
                          <ul className="mt-1.5 ml-4 space-y-0.5">
                            {item.subItems.map((sub, i) => (
                              <li key={i} className="text-xs text-muted-foreground list-disc list-outside">
                                {sub}
                              </li>
                            ))}
                          </ul>
                        )}

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
