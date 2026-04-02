import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { CheckToggle, type InspectionResult } from "./CheckToggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Info, CheckCheck } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";

// ─── Legend data ────────────────────────────────────────────────────────────

const DEVICE_TYPE_OPTIONS = [
  "SA-I", "SA-P", "SA/CO-I", "SA/CO-P",
  "SA/CO/V-I", "SA/CO/V-P", "CO",
  "SA/HD-I", "SA/HD-P", "SA/HD/V-P", "SA/HD/V-I",
  "V-Slave", "10IB", "BA", "DU",
] as const;

const DEVICE_TYPE_LABELS: Record<string, string> = {
  "SA-I":       "Smoke alarm ionization",
  "SA-P":       "Smoke alarm photo electric",
  "SA/CO-I":    "Smoke alarm / CO ionization",
  "SA/CO-P":    "Smoke alarm / CO photo electric",
  "SA/CO/V-I":  "Smoke alarm/CO/Strobe Ionization",
  "SA/CO/V-P":  "Smoke alarm/CO/Strobe photo electric",
  "CO":         "Carbon monoxide",
  "SA/HD-I":    "Smoke alarm / Heat ionization",
  "SA/HD-P":    "Smoke alarm / Heat photo electric",
  "SA/HD/V-P":  "Smoke alarm / Heat / Strobe photo electric",
  "SA/HD/V-I":  "Smoke alarm / Heat / Strobe ionization",
  "V-Slave":    "Strobe interconnected to local device",
  "10IB":       "10 Year integrated battery",
  "BA":         "Battery only",
  "DU":         "Dual battery / AC powered",
};

const POWER_SOURCE_OPTIONS = ["DU", "BA", "AC"] as const;

const BATTERY_TYPE_OPTIONS = ["9L", "9A", "A2L", "A2A", "A3L", "A3A", "AC", "10IB"] as const;

const BATTERY_TYPE_LABELS: Record<string, string> = {
  "9L":   "9 Volt lithium battery",
  "9A":   "9 Volt Alkaline battery",
  "A2L":  "AA lithium battery",
  "A2A":  "AA alkaline battery",
  "A3L":  "AAA lithium",
  "A3A":  "AAA alkaline",
  "AC":   "Powered by AC",
  "10IB": "10 Year integrated battery",
};

const MAINTENANCE_OPTIONS = ["", "NO", "YES", "REPAIRED"] as const;
type MaintenanceValue = typeof MAINTENANCE_OPTIONS[number];

// powerType → Power Source code mapping
function powerTypeToCode(powerType?: string | null): string {
  switch (powerType) {
    case "hardwired": return "AC";
    case "battery":   return "BA";
    case "sealed":
    case "unknown":   return "DU";
    default:          return "";
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SmokeAlarmRow {
  id: number;
  suiteNumber?: string | null;
  location?: string | null;
  deviceType?: string | null;
  powerType?: string | null;
  batterySize?: string | null;   // Battery Type (col D)
  batteryCount?: number | null;  // # Batts (col F)
  batteryYear?: string | null;   // In Service Date (col H)
  notes?: string | null;         // Remarks (col J)
  result?: InspectionResult;
}

interface LocalMeta {
  batteryReplaced?: string;   // "Y" | "N" | ""
  maintenanceRequired?: MaintenanceValue;
}

interface SmokeAlarmGridProps {
  jobId: number;
  devices: SmokeAlarmRow[];
  isFinalized?: boolean;
  onResultChange?: (deviceId: number, result: InspectionResult) => void;
}

interface EditState {
  deviceId: number;
  field: string;
  value: string;
}

// ─── Column config ───────────────────────────────────────────────────────────

const COL_HEADERS = [
  { key: "suite",     label: "Suite / Location",      width: "w-24 min-w-[6rem]",  sticky: true },
  { key: "type",      label: "Type",                  width: "w-24 min-w-[6rem]" },
  { key: "power",     label: "Power",                 width: "w-16 min-w-[4rem]" },
  { key: "battType",  label: "Batt Type",             width: "w-20 min-w-[5rem]" },
  { key: "battRepl",  label: "Batt Repl",             width: "w-16 min-w-[4rem]" },
  { key: "battQty",   label: "# Batts",               width: "w-14 min-w-[3.5rem]" },
  { key: "cleaned",   label: "Cleaned & Tested",      width: "w-20 min-w-[5rem]" },
  { key: "inService", label: "In Service",            width: "w-20 min-w-[5rem]" },
  { key: "maint",     label: "Maint. Required",       width: "w-20 min-w-[5rem]" },
  { key: "remarks",   label: "Remarks",               width: "w-40 min-w-[10rem]" },
];

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="border rounded-lg text-xs">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-medium text-muted-foreground flex-1">Legend — Device & Battery Type Codes</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 border-t pt-2">
          <div>
            <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Device Types</p>
            {DEVICE_TYPE_OPTIONS.map((code) => (
              <p key={code} className="text-muted-foreground leading-5">
                <span className="font-mono font-medium text-foreground">({code})</span>{" "}
                {DEVICE_TYPE_LABELS[code]}
              </p>
            ))}
          </div>
          <div className="mt-3 sm:mt-0">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Battery Types</p>
            {BATTERY_TYPE_OPTIONS.map((code) => (
              <p key={code} className="text-muted-foreground leading-5">
                <span className="font-mono font-medium text-foreground">({code})</span>{" "}
                {BATTERY_TYPE_LABELS[code]}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Y/N cycle button ────────────────────────────────────────────────────────

function YNButton({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const cycle = () => {
    if (disabled) return;
    onChange(value === "Y" ? "N" : value === "N" ? "" : "Y");
  };

  return (
    <button
      onClick={cycle}
      disabled={disabled}
      className={cn(
        "h-7 w-9 rounded text-xs font-bold transition-colors",
        value === "Y" && "bg-green-500 text-white hover:bg-green-600",
        value === "N" && "bg-red-400 text-white hover:bg-red-500",
        !value && "border-2 border-dashed border-gray-300 text-gray-300 hover:border-gray-400",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {value || "—"}
    </button>
  );
}

// ─── Maintenance Required cycle button ───────────────────────────────────────

function MaintenanceButton({
  value,
  onChange,
  disabled,
}: {
  value: MaintenanceValue;
  onChange: (v: MaintenanceValue) => void;
  disabled?: boolean;
}) {
  const cycle = () => {
    if (disabled) return;
    const idx = MAINTENANCE_OPTIONS.indexOf(value);
    onChange(MAINTENANCE_OPTIONS[(idx + 1) % MAINTENANCE_OPTIONS.length]);
  };

  return (
    <button
      onClick={cycle}
      disabled={disabled}
      className={cn(
        "h-7 min-w-[3.5rem] px-1.5 rounded text-xs font-bold transition-colors",
        value === "YES"      && "bg-red-500 text-white hover:bg-red-600",
        value === "REPAIRED" && "bg-blue-500 text-white hover:bg-blue-600",
        value === "NO"       && "bg-green-500 text-white hover:bg-green-600",
        !value               && "border-2 border-dashed border-gray-300 text-gray-300 hover:border-gray-400",
        disabled             && "opacity-50 cursor-not-allowed"
      )}
    >
      {value || "—"}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SmokeAlarmGrid({
  jobId,
  devices,
  isFinalized,
  onResultChange,
}: SmokeAlarmGridProps) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [localResults, setLocalResults] = useState<Record<number, InspectionResult>>({});
  const [localMeta, setLocalMeta] = useState<Record<number, LocalMeta>>({});
  const [legendOpen, setLegendOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const upsertResult = trpc.inspectionResult.upsert.useMutation({
    onError: () => toast.error("Failed to save result"),
  });

  const updateDevice = trpc.device.technicianUpdate.useMutation({
    onError: () => toast.error("Failed to save field"),
  });

  const handleResultChange = useCallback(
    (deviceId: number, result: InspectionResult) => {
      setLocalResults((prev) => ({ ...prev, [deviceId]: result }));
      upsertResult.mutate({ jobId, deviceId, result });
      onResultChange?.(deviceId, result);
    },
    [jobId, upsertResult, onResultChange]
  );

  const handleCellClick = (deviceId: number, field: string, currentValue: string) => {
    if (isFinalized) return;
    setEditing({ deviceId, field, value: currentValue });
  };

  const handleEditBlur = () => {
    if (!editing) return;
    const { deviceId, field, value } = editing;
    const payload: Record<string, any> = { id: deviceId };
    if (field === "battType")  payload.batterySize  = value || undefined;
    if (field === "battQty")   payload.batteryCount = value ? Number(value) || undefined : undefined;
    if (field === "inService") payload.batteryYear  = value || undefined;
    if (field === "remarks")   payload.notes        = value || undefined;
    updateDevice.mutate(payload as Parameters<typeof updateDevice.mutate>[0]);
    setEditing(null);
  };

  const handleBatteryReplacedToggle = (device: SmokeAlarmRow) => {
    if (isFinalized) return;
    const current = localMeta[device.id]?.batteryReplaced ?? "";
    const next = current === "Y" ? "N" : current === "N" ? "" : "Y";
    setLocalMeta((prev) => ({ ...prev, [device.id]: { ...prev[device.id], batteryReplaced: next } }));
  };

  const handleMaintenanceToggle = (device: SmokeAlarmRow) => {
    if (isFinalized) return;
    const current = localMeta[device.id]?.maintenanceRequired ?? "";
    const idx = MAINTENANCE_OPTIONS.indexOf(current as MaintenanceValue);
    const next = MAINTENANCE_OPTIONS[(idx + 1) % MAINTENANCE_OPTIONS.length];
    setLocalMeta((prev) => ({ ...prev, [device.id]: { ...prev[device.id], maintenanceRequired: next } }));
  };

  const getEffectiveResult = (device: SmokeAlarmRow): InspectionResult =>
    localResults[device.id] ?? device.result ?? "not_tested";

  const getRowBg = (device: SmokeAlarmRow) => {
    const maint = localMeta[device.id]?.maintenanceRequired;
    if (maint === "YES") return "bg-red-50 dark:bg-red-950/20";
    const result = getEffectiveResult(device);
    if (result === "pass") return "bg-green-50 dark:bg-green-950/20";
    if (result === "fail") return "bg-red-50 dark:bg-red-950/20";
    return "";
  };

  const completed = devices.filter((d) => getEffectiveResult(d) !== "not_tested").length;

  const handleAllPass = useCallback(() => {
    if (isFinalized) return;
    const updates: Record<number, InspectionResult> = {};
    devices.forEach((d) => { updates[d.id] = "pass"; });
    setLocalResults((prev) => ({ ...prev, ...updates }));
    devices.forEach((d) => {
      upsertResult.mutate({ jobId, deviceId: d.id, result: "pass" });
      onResultChange?.(d.id, "pass");
    });
    toast.success(`Marked ${devices.length} smoke alarm${devices.length !== 1 ? "s" : ""} as pass`);
  }, [devices, isFinalized, jobId, upsertResult, onResultChange]);

  // ── Header bar ─────────────────────────────────────────────────────────────
  const header = (
    <div className="space-y-2 mb-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          CAN/ULC-S552 · Smoke Alarm Inspection &amp; Testing
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {completed} / {devices.length} tested
          </span>
          {!isFinalized && devices.length > 0 && (
            <button
              onClick={handleAllPass}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" /> All Pass
            </button>
          )}
        </div>
      </div>
      <Legend open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
    </div>
  );

  // ── Mobile card layout ─────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="space-y-3">
        {header}
        {devices.length === 0 && (
          <p className="text-center py-6 text-sm text-muted-foreground">No smoke alarms for this site</p>
        )}
        {devices.map((device) => {
          const result = getEffectiveResult(device);
          const meta = localMeta[device.id] ?? {};
          const isExpanded = expandedRow === device.id;
          const battTypeVal = editing?.deviceId === device.id && editing.field === "battType"
            ? editing.value
            : device.batterySize ?? "";
          const inServiceVal = editing?.deviceId === device.id && editing.field === "inService"
            ? editing.value
            : device.batteryYear ?? "";
          const remarksVal = editing?.deviceId === device.id && editing.field === "remarks"
            ? editing.value
            : device.notes ?? "";

          return (
            <div
              key={device.id}
              className={cn(
                "rounded-lg border overflow-hidden",
                getRowBg(device)
              )}
            >
              {/* Primary row — always visible */}
              <button
                className="w-full flex items-center gap-2 px-3 py-3 text-left"
                onClick={() => setExpandedRow(isExpanded ? null : device.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{device.suiteNumber || device.location || "—"}</span>
                    {device.deviceType && (
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#16324F]/10 text-[#16324F] dark:bg-[#2E5B7A]/20 dark:text-blue-200">
                        {device.deviceType}
                      </span>
                    )}
                    {device.powerType && (
                      <span className="text-xs text-muted-foreground">{powerTypeToCode(device.powerType)}</span>
                    )}
                  </div>
                </div>
                <CheckToggle
                  value={result}
                  onChange={(r) => handleResultChange(device.id, r)}
                  disabled={isFinalized}
                  size="sm"
                />
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>

              {/* Expanded fields */}
              {isExpanded && (
                <div className="border-t px-3 py-3 space-y-3 bg-background/60">
                  {/* Row 1: Battery Type + # Batts */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        Battery Type
                      </label>
                      <select
                        className="w-full text-sm rounded border px-2 py-2 bg-background min-h-[44px]"
                        value={battTypeVal}
                        disabled={isFinalized}
                        onChange={(e) => {
                          updateDevice.mutate({ id: device.id, batterySize: e.target.value || undefined });
                        }}
                      >
                        <option value="">—</option>
                        {BATTERY_TYPE_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        # Batts
                      </label>
                      <input
                        type="number"
                        className="w-full text-sm rounded border px-2 py-2 bg-background min-h-[44px]"
                        defaultValue={device.batteryCount ?? ""}
                        disabled={isFinalized}
                        onBlur={(e) => updateDevice.mutate({ id: device.id, batteryCount: e.target.value ? Number(e.target.value) : undefined })}
                      />
                    </div>
                  </div>

                  {/* Row 2: Battery Replaced + In Service Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        Batt Replaced
                      </label>
                      <YNButton
                        value={meta.batteryReplaced ?? ""}
                        onChange={() => handleBatteryReplacedToggle(device)}
                        disabled={isFinalized}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        In Service Date
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 2025"
                        className="w-full text-sm rounded border px-2 py-2 bg-background min-h-[44px]"
                        defaultValue={inServiceVal}
                        disabled={isFinalized}
                        onBlur={(e) => updateDevice.mutate({ id: device.id, batteryYear: e.target.value || undefined })}
                      />
                    </div>
                  </div>

                  {/* Row 3: Cleaned & Tested + Maintenance Required */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        Cleaned &amp; Tested
                      </label>
                      <CheckToggle
                        value={result}
                        onChange={(r) => handleResultChange(device.id, r)}
                        disabled={isFinalized}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                        Maint. Required
                      </label>
                      <MaintenanceButton
                        value={meta.maintenanceRequired ?? ""}
                        onChange={() => handleMaintenanceToggle(device)}
                        disabled={isFinalized}
                      />
                    </div>
                  </div>

                  {/* Row 4: Remarks */}
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
                      Remarks
                    </label>
                    <input
                      type="text"
                      className="w-full text-sm rounded border px-2 py-2 bg-background min-h-[44px]"
                      defaultValue={remarksVal}
                      disabled={isFinalized}
                      onBlur={(e) => updateDevice.mutate({ id: device.id, notes: e.target.value || undefined })}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Desktop table layout ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {header}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#16324F] text-white border-b">
              {COL_HEADERS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-2 py-2 text-left font-semibold border-r last:border-r-0 whitespace-nowrap border-white/20",
                    col.width,
                    col.sticky && "sticky left-0 bg-[#16324F]"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((device, idx) => {
              const result = getEffectiveResult(device);
              const meta = localMeta[device.id] ?? {};
              const rowBg = getRowBg(device);

              const cellValue = (field: string): string => {
                if (editing?.deviceId === device.id && editing.field === field) return editing.value;
                if (field === "battType")  return device.batterySize ?? "";
                if (field === "battQty")   return device.batteryCount != null ? String(device.batteryCount) : "";
                if (field === "inService") return device.batteryYear ?? "";
                if (field === "remarks")   return device.notes ?? "";
                return "";
              };

              return (
                <tr
                  key={device.id}
                  className={cn("border-b hover:bg-muted/30 transition-colors", rowBg)}
                >
                  {/* A — Suite / Location (sticky) */}
                  <td className="sticky left-0 bg-inherit px-2 py-1.5 border-r font-mono font-medium whitespace-nowrap">
                    {device.suiteNumber || device.location || (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* B — Type */}
                  <td className="px-2 py-1.5 border-r">
                    {device.deviceType ? (
                      <span className="font-mono px-1 py-0.5 rounded bg-[#16324F]/8 text-[#16324F] dark:text-blue-300">
                        {device.deviceType}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* C — Power Source (derived, read-only) */}
                  <td className="px-2 py-1.5 border-r text-muted-foreground">
                    {powerTypeToCode(device.powerType) || <span className="text-muted-foreground/40">—</span>}
                  </td>

                  {/* D — Battery Type */}
                  <td
                    className={cn("px-2 py-1.5 border-r", !isFinalized && "cursor-pointer hover:bg-primary/5")}
                    onClick={() => handleCellClick(device.id, "battType", cellValue("battType"))}
                  >
                    {editing?.deviceId === device.id && editing.field === "battType" ? (
                      <select
                        autoFocus
                        className="w-full bg-transparent outline-none border-b border-primary text-xs"
                        value={editing.value}
                        onChange={(e) => setEditing((p) => p && { ...p, value: e.target.value })}
                        onBlur={handleEditBlur}
                      >
                        <option value="">—</option>
                        {BATTERY_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <span className="font-mono">{cellValue("battType") || <span className="text-muted-foreground/40">—</span>}</span>
                    )}
                  </td>

                  {/* E — Battery Replaced */}
                  <td className="px-2 py-1.5 border-r text-center">
                    <YNButton
                      value={meta.batteryReplaced ?? ""}
                      onChange={() => handleBatteryReplacedToggle(device)}
                      disabled={isFinalized}
                    />
                  </td>

                  {/* F — # Batts */}
                  <td
                    className={cn("px-2 py-1.5 border-r", !isFinalized && "cursor-pointer hover:bg-primary/5")}
                    onClick={() => handleCellClick(device.id, "battQty", cellValue("battQty"))}
                  >
                    {editing?.deviceId === device.id && editing.field === "battQty" ? (
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        max={10}
                        className="w-12 bg-transparent outline-none border-b border-primary text-xs"
                        value={editing.value}
                        onChange={(e) => setEditing((p) => p && { ...p, value: e.target.value })}
                        onBlur={handleEditBlur}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); handleEditBlur(); }
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span>{cellValue("battQty") || <span className="text-muted-foreground/40">—</span>}</span>
                    )}
                  </td>

                  {/* G — Cleaned & Tested (= result) */}
                  <td className="px-2 py-1.5 border-r text-center">
                    <CheckToggle
                      value={result}
                      onChange={(r) => handleResultChange(device.id, r)}
                      disabled={isFinalized}
                      size="sm"
                    />
                  </td>

                  {/* H — In Service Date */}
                  <td
                    className={cn("px-2 py-1.5 border-r", !isFinalized && "cursor-pointer hover:bg-primary/5")}
                    onClick={() => handleCellClick(device.id, "inService", cellValue("inService"))}
                  >
                    {editing?.deviceId === device.id && editing.field === "inService" ? (
                      <input
                        autoFocus
                        type="text"
                        placeholder="YYYY"
                        className="w-16 bg-transparent outline-none border-b border-primary text-xs"
                        value={editing.value}
                        onChange={(e) => setEditing((p) => p && { ...p, value: e.target.value })}
                        onBlur={handleEditBlur}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); handleEditBlur(); }
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span>{cellValue("inService") || <span className="text-muted-foreground/40">—</span>}</span>
                    )}
                  </td>

                  {/* I — Maintenance Required */}
                  <td className="px-2 py-1.5 border-r text-center">
                    <MaintenanceButton
                      value={meta.maintenanceRequired ?? ""}
                      onChange={() => handleMaintenanceToggle(device)}
                      disabled={isFinalized}
                    />
                  </td>

                  {/* J — Remarks */}
                  <td
                    className={cn("px-2 py-1.5", !isFinalized && "cursor-pointer hover:bg-primary/5")}
                    onClick={() => handleCellClick(device.id, "remarks", cellValue("remarks"))}
                  >
                    {editing?.deviceId === device.id && editing.field === "remarks" ? (
                      <input
                        autoFocus
                        className="w-full bg-transparent outline-none border-b border-primary text-xs"
                        value={editing.value}
                        onChange={(e) => setEditing((p) => p && { ...p, value: e.target.value })}
                        onBlur={handleEditBlur}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); handleEditBlur(); }
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <span className="truncate block max-w-[10rem]">
                        {cellValue("remarks") || <span className="text-muted-foreground/40">—</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={COL_HEADERS.length} className="text-center py-8 text-muted-foreground">
                  No smoke alarms for this site
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
