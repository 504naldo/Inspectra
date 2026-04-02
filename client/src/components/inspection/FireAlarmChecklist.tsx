import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, X, Minus, Loader2, Info, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistRow = {
  id: number;
  sectionName: string;
  sectionOrder: number;
  itemLetter: string | null;
  itemDescription: string;
  inputType: string;
  numericLabel: string | null;
  numericUnit: string | null;
  isRequired: boolean | null;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function FireAlarmChecklist({ jobId, siteId, isFinalized }: FireAlarmChecklistProps) {
  const { user } = useAuth();

  // ── Queries ──
  const { data: jobDetails } = trpc.job.getWithDetails.useQuery({ id: jobId }, { enabled: !!jobId });
  const { data: fireAlarmSystem } = trpc.fireAlarm.getSystemBySite.useQuery({ siteId }, { enabled: !!siteId });
  const { data: jobChecklist, isLoading } = trpc.fireAlarm.getJobChecklist.useQuery({ jobId }, { enabled: !!jobId });
  const { data: savedHeader } = trpc.fireAlarmForm.getHeader.useQuery({ jobId }, { enabled: !!jobId });
  const { data: attendanceData, refetch: refetchAttendance } = trpc.fireAlarmForm.getAttendanceLog.useQuery({ jobId }, { enabled: !!jobId });
  const { data: ancillaryData, refetch: refetchAncillary } = trpc.fireAlarmForm.getAncillaryCircuits.useQuery({ jobId }, { enabled: !!jobId });
  const { data: company } = trpc.company.get.useQuery(
    { id: user?.companyId ?? 0 },
    { enabled: !!user?.companyId }
  );

  // ── Local state ──
  const [header, setHeader] = useState<Record<string, any>>({
    inspectionDate: new Date().toISOString().split("T")[0],
    systemManufacturer: "",
    systemModel: "",
    systemSerialNo: "",
    systemInstallYear: "",
    operationType: "",
    connectedToFSRC: false,
    fsrcName: "",
    fsrcPhone: "",
    fsrcAccountNo: "",
    techName: "",
    techCertNo: "",
    techCertLevel: "",
    techCompany: "",
    recommendations: "",
    sectionHeaderValues: {} as Record<string, Record<string, string>>,
  });
  const [results, setResults] = useState<Record<number, ItemResult>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Debounce refs
  const headerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checklistTimerRef = useRef<NodeJS.Timeout | null>(null);
  const attendanceDraftRef = useRef<Record<number, Record<string, any>>>({});
  const attendanceTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const ancillaryDraftRef = useRef<Record<number, Record<string, any>>>({});
  const ancillaryTimers = useRef<Record<number, NodeJS.Timeout>>({});

  // ── Mutations ──
  const upsertHeader = trpc.fireAlarmForm.upsertHeader.useMutation({
    onSuccess: () => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000); },
    onError: (err: any) => { setSaveStatus("error"); toast.error(`Save failed: ${err.message}`); },
  });
  const upsertAttendanceRow = trpc.fireAlarmForm.upsertAttendanceRow.useMutation({
    onSuccess: () => refetchAttendance(),
  });
  const deleteAttendanceRowMutation = trpc.fireAlarmForm.deleteAttendanceRow.useMutation({
    onSuccess: () => refetchAttendance(),
  });
  const upsertAncillaryCircuit = trpc.fireAlarmForm.upsertAncillaryCircuit.useMutation({
    onSuccess: () => refetchAncillary(),
  });
  const deleteAncillaryCircuitMutation = trpc.fireAlarmForm.deleteAncillaryCircuit.useMutation({
    onSuccess: () => refetchAncillary(),
  });
  const saveResult = trpc.fireAlarm.saveInspectionResult.useMutation({
    onSuccess: () => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000); },
    onError: (err: any) => { setSaveStatus("error"); toast.error(`Save failed: ${err.message}`); },
  });

  // ── Seed header from server data ──
  useEffect(() => {
    if (savedHeader) {
      setHeader((prev) => ({
        ...prev,
        inspectionDate: savedHeader.inspectionDate ?? prev.inspectionDate,
        systemManufacturer: savedHeader.systemManufacturer ?? prev.systemManufacturer,
        systemModel: savedHeader.systemModel ?? prev.systemModel,
        systemSerialNo: savedHeader.systemSerialNo ?? prev.systemSerialNo,
        systemInstallYear: savedHeader.systemInstallYear ?? prev.systemInstallYear,
        operationType: savedHeader.operationType ?? prev.operationType,
        connectedToFSRC: savedHeader.connectedToFSRC ?? prev.connectedToFSRC,
        fsrcName: savedHeader.fsrcName ?? prev.fsrcName,
        fsrcPhone: savedHeader.fsrcPhone ?? prev.fsrcPhone,
        fsrcAccountNo: savedHeader.fsrcAccountNo ?? prev.fsrcAccountNo,
        techName: savedHeader.techName ?? prev.techName,
        techCertNo: savedHeader.techCertNo ?? prev.techCertNo,
        techCertLevel: savedHeader.techCertLevel ?? prev.techCertLevel,
        techCompany: savedHeader.techCompany ?? prev.techCompany,
        recommendations: savedHeader.recommendations ?? prev.recommendations,
        sectionHeaderValues: (savedHeader.sectionHeaderValues as any) ?? prev.sectionHeaderValues,
      }));
    }
  }, [savedHeader]);

  // Auto-fill blanks from job/system/user if no saved header yet
  useEffect(() => {
    if (savedHeader !== null) return;
    setHeader((prev) => ({
      ...prev,
      systemManufacturer: prev.systemManufacturer || fireAlarmSystem?.manufacturer || "",
      systemModel: prev.systemModel || fireAlarmSystem?.modelNumber || "",
      operationType: prev.operationType || fireAlarmSystem?.operationType || "",
      fsrcName: prev.fsrcName || fireAlarmSystem?.monitoringCentreName || "",
      fsrcPhone: prev.fsrcPhone || fireAlarmSystem?.monitoringCentrePhone || "",
      techName: prev.techName || user?.name || "",
      techCertNo: prev.techCertNo || (user as any)?.certNumber || "",
      techCertLevel: prev.techCertLevel || (user as any)?.certificationLevel || "",
      techCompany: prev.techCompany || company?.name || "",
    }));
  }, [savedHeader, fireAlarmSystem, user, company]);

  // Seed checklist results
  useEffect(() => {
    if (!jobChecklist) return;
    const map: Record<number, ItemResult> = {};
    (jobChecklist as ChecklistRow[]).forEach((row) => {
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

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
      if (checklistTimerRef.current) clearTimeout(checklistTimerRef.current);
      Object.values(attendanceTimers.current).forEach(clearTimeout);
      Object.values(ancillaryTimers.current).forEach(clearTimeout);
    };
  }, []);

  // ── Header save (debounced) ──
  const updateHeader = (key: string, value: any) => {
    if (isFinalized) return;
    const updated = { ...header, [key]: value };
    setHeader(updated);
    setSaveStatus("saving");
    if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
    headerTimerRef.current = setTimeout(() => {
      upsertHeader.mutate({ jobId, ...updated });
    }, 1500);
  };

  const updateSectionHeaderField = (sectionOrder: number, field: string, value: string) => {
    if (isFinalized) return;
    const existing = header.sectionHeaderValues ?? {};
    const secKey = String(sectionOrder);
    const updated = {
      ...header,
      sectionHeaderValues: {
        ...existing,
        [secKey]: { ...(existing[secKey] ?? {}), [field]: value },
      },
    };
    setHeader(updated);
    setSaveStatus("saving");
    if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
    headerTimerRef.current = setTimeout(() => {
      upsertHeader.mutate({ jobId, ...updated });
    }, 1500);
  };

  // ── Checklist result handlers ──
  const resolveSystemId = (row: ChecklistRow) =>
    row.fireAlarmSystemId ?? fireAlarmSystem?.id ?? null;

  const doSaveResult = (itemId: number, updated: Record<number, ItemResult>, row: ChecklistRow) => {
    const r = updated[itemId];
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
    setSaveStatus("saving");
    doSaveResult(item.id, updated, item);
  };

  const handleValueChange = (item: ChecklistRow, field: "numericValue" | "textValue", value: string) => {
    if (isFinalized) return;
    const base = results[item.id] || { result: "not_tested", notes: "", numericValue: "", textValue: "" };
    const updated = { ...results, [item.id]: { ...base, [field]: value } };
    setResults(updated);
    setSaveStatus("saving");
    if (checklistTimerRef.current) clearTimeout(checklistTimerRef.current);
    checklistTimerRef.current = setTimeout(() => doSaveResult(item.id, updated, item), 1500);
  };

  const handleSectionNA = (sectionItems: ChecklistRow[]) => {
    if (isFinalized) return;
    const updated = { ...results };
    sectionItems.forEach((item) => {
      updated[item.id] = { result: "na", notes: "", numericValue: "", textValue: "" };
      doSaveResult(item.id, updated, item);
    });
    setResults(updated);
  };

  const isSectionNA = (sectionItems: ChecklistRow[]) =>
    sectionItems.length > 0 && sectionItems.every((item) => results[item.id]?.result === "na");

  // ── Attendance handlers ──
  const handleAttendanceField = (rowId: number, field: string, value: string) => {
    if (isFinalized) return;
    if (!attendanceDraftRef.current[rowId]) attendanceDraftRef.current[rowId] = {};
    attendanceDraftRef.current[rowId][field] = value;
    if (attendanceTimers.current[rowId]) clearTimeout(attendanceTimers.current[rowId]);
    attendanceTimers.current[rowId] = setTimeout(() => {
      const draft = attendanceDraftRef.current[rowId] ?? {};
      upsertAttendanceRow.mutate({ id: rowId, jobId, ...draft });
      delete attendanceDraftRef.current[rowId];
    }, 1000);
  };

  const addAttendanceRow = () => {
    if (isFinalized) return;
    upsertAttendanceRow.mutate({ jobId, rowOrder: attendanceData?.length ?? 0 });
  };

  // ── Ancillary circuit handlers ──
  const handleAncillaryField = (rowId: number, field: string, value: string) => {
    if (isFinalized) return;
    if (!ancillaryDraftRef.current[rowId]) ancillaryDraftRef.current[rowId] = {};
    ancillaryDraftRef.current[rowId][field] = value;
    if (ancillaryTimers.current[rowId]) clearTimeout(ancillaryTimers.current[rowId]);
    ancillaryTimers.current[rowId] = setTimeout(() => {
      const draft = ancillaryDraftRef.current[rowId] ?? {};
      upsertAncillaryCircuit.mutate({ id: rowId, jobId, ...draft } as any);
      delete ancillaryDraftRef.current[rowId];
    }, 1000);
  };

  const addAncillaryRow = () => {
    if (isFinalized) return;
    upsertAncillaryCircuit.mutate({ jobId, rowOrder: ancillaryData?.length ?? 0 });
  };

  // ── Group checklist into sections ──
  const sections = new Map<string, { meta: ChecklistRow; items: ChecklistRow[] }>();
  ((jobChecklist || []) as ChecklistRow[]).forEach((row) => {
    const key = `${row.sectionOrder}:${row.sectionName}`;
    if (!sections.has(key)) sections.set(key, { meta: row, items: [] });
    sections.get(key)!.items.push(row);
  });
  const sortedSections = Array.from(sections.values()).sort((a, b) => a.meta.sectionOrder - b.meta.sectionOrder);

  // Split: sections 1-11 vs section 13+
  const checklistSections = sortedSections.filter((s) => s.meta.sectionOrder <= 11);
  const fsrcSections = sortedSections.filter((s) => s.meta.sectionOrder >= 13);

  // Progress
  const totalItems = (jobChecklist || []).length;
  const completedItems = (jobChecklist || []).filter(
    (row: ChecklistRow) => (results[row.id]?.result ?? row.result) !== "not_tested"
  ).length;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // ── Render helpers ──
  const renderItemInput = (item: ChecklistRow) => {
    const r = results[item.id] || {
      result: item.result,
      notes: item.notes || "",
      numericValue: item.numericValue ?? "",
      textValue: item.textValue ?? "",
    };

    if (item.inputType === "checkbox") {
      return (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {(["pass", "fail", "na"] as const).map((val) => (
            <Button
              key={val}
              size="sm"
              variant={r.result === val ? "default" : "outline"}
              className={cn(
                "h-7 text-xs",
                r.result === val && val === "pass" && "bg-green-600 hover:bg-green-700",
                r.result === val && val === "fail" && "bg-red-600 hover:bg-red-700",
                r.result === val && val === "na" && "bg-gray-500 hover:bg-gray-600"
              )}
              onClick={() => handleResultClick(item, val)}
              disabled={isFinalized}
            >
              {val === "pass" && <Check className="h-3 w-3 mr-1" />}
              {val === "fail" && <X className="h-3 w-3 mr-1" />}
              {val === "na" && <Minus className="h-3 w-3 mr-1" />}
              {val === "pass" ? "YES" : val === "fail" ? "NO" : "N/A"}
            </Button>
          ))}
        </div>
      );
    }

    const isText = ["text"].includes(item.inputType);
    const isNumeric = ["numeric", "voltage", "current", "year"].includes(item.inputType);
    const isDt = ["date", "time"].includes(item.inputType);

    if (isNumeric || isText) {
      return (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {item.numericLabel && (
            <Label className="text-xs text-muted-foreground min-w-[80px]">{item.numericLabel}</Label>
          )}
          <Input
            type="text"
            value={r.numericValue || ""}
            onChange={(e) => handleValueChange(item, "numericValue", e.target.value)}
            placeholder={item.inputType === "year" ? "YYYY" : "Enter value"}
            className="h-7 text-xs max-w-[160px]"
            disabled={isFinalized}
          />
          {item.numericUnit && <span className="text-xs text-muted-foreground">{item.numericUnit}</span>}
        </div>
      );
    }

    if (isDt) {
      return (
        <div className="flex items-center gap-2 mt-2">
          {item.numericLabel && (
            <Label className="text-xs text-muted-foreground min-w-[80px]">{item.numericLabel}</Label>
          )}
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

  const renderChecklistSection = ({ meta, items: sectionItems }: { meta: ChecklistRow; items: ChecklistRow[] }) => {
    const effectiveResults = sectionItems.map((i) => results[i.id]?.result ?? i.result);
    const sectionCompleted = effectiveResults.filter((r) => r !== "not_tested").length;
    const allDone = sectionCompleted === sectionItems.length && sectionItems.length > 0;
    const sectionNAActive = isSectionNA(sectionItems);
    const secVals = header.sectionHeaderValues?.[String(meta.sectionOrder)] ?? {};

    return (
      <AccordionItem
        key={`${meta.sectionOrder}:${meta.sectionName}`}
        value={`${meta.sectionOrder}:${meta.sectionName}`}
        className="border rounded-lg overflow-hidden"
      >
        <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/50">
          <div className="flex items-center justify-between w-full pr-2">
            <span className="text-sm font-medium text-left">
              <span className="text-muted-foreground mr-1.5">{meta.sectionOrder}.</span>
              {meta.sectionName}
            </span>
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
            {/* Section header fields */}
            {meta.headerFields && meta.headerFields.length > 0 && (
              <div className="p-2 bg-muted/30 rounded border space-y-1.5">
                {meta.headerFields.map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground min-w-[140px] shrink-0">{field}</Label>
                    <Input
                      className="h-6 text-xs"
                      value={secVals[field] ?? ""}
                      onChange={(e) => updateSectionHeaderField(meta.sectionOrder, field, e.target.value)}
                      disabled={isFinalized}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Section N/A toggle */}
            {meta.notApplicableNote && (
              <div className="flex items-center gap-2 px-1">
                <Button
                  size="sm"
                  variant={sectionNAActive ? "default" : "outline"}
                  className={cn("h-7 text-xs", sectionNAActive && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => handleSectionNA(sectionItems)}
                  disabled={isFinalized}
                >
                  <Minus className="h-3 w-3 mr-1" />
                  Mark entire section N/A
                </Button>
                <span className="text-xs text-muted-foreground italic">{meta.notApplicableNote}</span>
              </div>
            )}

            {/* Checklist items */}
            {sectionItems.map((item) => {
              const effectiveResult = results[item.id]?.result ?? item.result;
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
                    {item.itemLetter && <span className="font-semibold mr-1">{item.itemLetter}.</span>}
                    {item.itemDescription}
                    {item.isRequired && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  {item.hasSubItems && item.subItems && item.subItems.length > 0 && (
                    <ul className="mt-1.5 ml-4 space-y-0.5">
                      {item.subItems.map((sub, i) => (
                        <li key={i} className="text-xs text-muted-foreground list-disc list-outside">{sub}</li>
                      ))}
                    </ul>
                  )}
                  {renderItemInput(item)}
                </div>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading checklist…
      </div>
    );
  }

  const site = jobDetails?.site;
  const customerOrg = jobDetails?.customerOrg;
  const deficiencies = jobDetails?.deficiencies ?? [];

  // ── Render ──
  return (
    <div className="space-y-4">

      {/* Save status + progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">{completedItems} / {totalItems} items completed</span>
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
          <Progress value={progressPct} className="h-1.5" />
        </div>
      </div>

      {/* ── SECTION 0: Cover Page ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#16324F] text-white">
          <h3 className="text-sm font-semibold">Fire Alarm System Verification — Cover Page</h3>
          <p className="text-xs opacity-75">CAN/ULC-S536:2019-REV1</p>
        </div>
        <div className="p-4 space-y-4">

          {/* Inspection & Building Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Inspection Date</Label>
              <Input
                type="date"
                value={header.inspectionDate ?? ""}
                onChange={(e) => updateHeader("inspectionDate", e.target.value)}
                className="h-8 text-xs"
                disabled={isFinalized}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Building / Customer</Label>
              <Input
                value={customerOrg?.name ?? ""}
                readOnly
                className="h-8 text-xs bg-muted/30"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Building Address</Label>
              <Input
                value={[site?.address, site?.city].filter(Boolean).join(", ") ?? ""}
                readOnly
                className="h-8 text-xs bg-muted/30"
              />
            </div>
          </div>

          {/* System Info */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">System Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "systemManufacturer", label: "Manufacturer" },
                { key: "systemModel", label: "Model" },
                { key: "systemSerialNo", label: "Serial No." },
                { key: "systemInstallYear", label: "Year Installed" },
                { key: "operationType", label: "Operation Type" },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    value={header[key] ?? ""}
                    onChange={(e) => updateHeader(key, e.target.value)}
                    className="h-8 text-xs"
                    disabled={isFinalized}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* FSRC Info */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">FSRC Connection</p>
              <Button
                size="sm"
                variant={header.connectedToFSRC ? "default" : "outline"}
                className={cn("h-6 text-xs px-2", header.connectedToFSRC && "bg-green-600 hover:bg-green-700")}
                onClick={() => updateHeader("connectedToFSRC", !header.connectedToFSRC)}
                disabled={isFinalized}
              >
                {header.connectedToFSRC ? "Connected" : "Not Connected"}
              </Button>
            </div>
            {header.connectedToFSRC && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: "fsrcName", label: "FSRC Name" },
                  { key: "fsrcPhone", label: "FSRC Phone" },
                  { key: "fsrcAccountNo", label: "Account No." },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      value={header[key] ?? ""}
                      onChange={(e) => updateHeader(key, e.target.value)}
                      className="h-8 text-xs"
                      disabled={isFinalized}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Technician Info */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Technician</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "techName", label: "Name" },
                { key: "techCertNo", label: "Cert. No." },
                { key: "techCertLevel", label: "Cert. Level" },
                { key: "techCompany", label: "Company" },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    value={header[key] ?? ""}
                    onChange={(e) => updateHeader(key, e.target.value)}
                    className="h-8 text-xs"
                    disabled={isFinalized}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 0B: Deficiencies ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#16324F] text-white flex items-center justify-between">
          <h3 className="text-sm font-semibold">Deficiency Summary</h3>
          <Badge variant="secondary" className="bg-white/20 text-white text-xs">{deficiencies.length}</Badge>
        </div>
        {deficiencies.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4">No deficiencies recorded for this job.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Description</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Severity</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {deficiencies.map((def: any, i: number) => (
                  <tr key={def.id} className="border-t">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5">{def.title}</td>
                    <td className="px-3 py-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          def.severity === "critical" && "border-red-500 text-red-600",
                          def.severity === "major" && "border-orange-500 text-orange-600",
                          def.severity === "minor" && "border-yellow-500 text-yellow-600"
                        )}
                      >
                        {def.severity}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 capitalize text-muted-foreground">{def.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SECTION 0C: Recommendations ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#16324F] text-white">
          <h3 className="text-sm font-semibold">Recommendations</h3>
        </div>
        <div className="p-3">
          <Textarea
            placeholder="Enter any recommendations for this system…"
            value={header.recommendations ?? ""}
            onChange={(e) => updateHeader("recommendations", e.target.value)}
            className="text-xs min-h-[80px] resize-none"
            disabled={isFinalized}
          />
        </div>
      </div>

      {/* ── SECTION 0D: Attendance Log ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#16324F] text-white flex items-center justify-between">
          <h3 className="text-sm font-semibold">Technician Attendance Log</h3>
          {!isFinalized && (
            <Button size="sm" variant="ghost" className="h-6 text-xs text-white hover:bg-white/20"
              onClick={addAttendanceRow}>
              <Plus className="h-3 w-3 mr-1" /> Add Row
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Technician</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Cert. No.</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Time In</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Time Out</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Notes</th>
                {!isFinalized && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {(attendanceData ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-center text-muted-foreground">
                    No attendance rows. Click "Add Row" to begin.
                  </td>
                </tr>
              ) : (
                (attendanceData ?? []).map((row: any) => (
                  <tr key={row.id} className="border-t">
                    {["attendanceDate", "techName", "certNo", "timeIn", "timeOut", "notes"].map((field) => (
                      <td key={field} className="px-1 py-1">
                        <Input
                          type={field === "attendanceDate" ? "date" : "text"}
                          defaultValue={row[field] ?? ""}
                          onChange={(e) => handleAttendanceField(row.id, field, e.target.value)}
                          className="h-6 text-xs border-0 bg-transparent focus:bg-background"
                          disabled={isFinalized}
                        />
                      </td>
                    ))}
                    {!isFinalized && (
                      <td className="px-1 py-1">
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() => deleteAttendanceRowMutation.mutate({ id: row.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTIONS 1–11: Checklist ── */}
      {checklistSections.length > 0 && (
        <Accordion type="multiple" className="space-y-1">
          {checklistSections.map(renderChecklistSection)}
        </Accordion>
      )}

      {/* ── SECTION 12: Ancillary Device Circuit Test ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#16324F] text-white flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">12. Ancillary Device Circuit Test</h3>
            <p className="text-xs opacity-75">Record all ancillary device circuits tested</p>
          </div>
          {!isFinalized && (
            <Button size="sm" variant="ghost" className="h-6 text-xs text-white hover:bg-white/20"
              onClick={addAncillaryRow}>
              <Plus className="h-3 w-3 mr-1" /> Add Row
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Circuit Description</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Powered By</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Confirmed</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Method</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Notes</th>
                {!isFinalized && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {(ancillaryData ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-center text-muted-foreground">
                    No ancillary circuits. Click "Add Row" to begin.
                  </td>
                </tr>
              ) : (
                (ancillaryData ?? []).map((row: any) => (
                  <tr key={row.id} className="border-t">
                    {["circuitDescription", "circuitType", "poweredBy"].map((field) => (
                      <td key={field} className="px-1 py-1">
                        <Input
                          defaultValue={row[field] ?? ""}
                          onChange={(e) => handleAncillaryField(row.id, field, e.target.value)}
                          className="h-6 text-xs border-0 bg-transparent focus:bg-background min-w-[80px]"
                          disabled={isFinalized}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <div className="flex gap-0.5">
                        {(["yes", "no", "na"] as const).map((v) => (
                          <Button
                            key={v}
                            size="sm"
                            variant={row.operationConfirmed === v ? "default" : "outline"}
                            className={cn(
                              "h-6 px-1.5 text-xs",
                              row.operationConfirmed === v && v === "yes" && "bg-green-600 hover:bg-green-700",
                              row.operationConfirmed === v && v === "no" && "bg-red-600 hover:bg-red-700",
                              row.operationConfirmed === v && v === "na" && "bg-gray-500 hover:bg-gray-600"
                            )}
                            onClick={() => upsertAncillaryCircuit.mutate({ id: row.id, jobId, operationConfirmed: v })}
                            disabled={isFinalized}
                          >
                            {v.toUpperCase()}
                          </Button>
                        ))}
                      </div>
                    </td>
                    {["confirmationMethod", "notes"].map((field) => (
                      <td key={field} className="px-1 py-1">
                        <Input
                          defaultValue={row[field] ?? ""}
                          onChange={(e) => handleAncillaryField(row.id, field, e.target.value)}
                          className="h-6 text-xs border-0 bg-transparent focus:bg-background min-w-[80px]"
                          disabled={isFinalized}
                        />
                      </td>
                    ))}
                    {!isFinalized && (
                      <td className="px-1 py-1">
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() => deleteAncillaryCircuitMutation.mutate({ id: row.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 13: FSRC Interconnection ── */}
      {fsrcSections.length > 0 && (
        <Accordion type="multiple" className="space-y-1">
          {fsrcSections.map(renderChecklistSection)}
        </Accordion>
      )}
    </div>
  );
}
