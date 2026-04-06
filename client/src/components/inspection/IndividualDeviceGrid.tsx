import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, CheckCheck } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckState = true | false | null; // true=✓ pass, false=✗ fail, null=not tested

interface CheckData {
  a: CheckState;
  b: CheckState;
  c: CheckState;
  d: CheckState;
  e: CheckState;
  f: string; // Measurements text
  g: CheckState;
  remarks: string;
}

const DEFAULT_CHECKS: CheckData = { a: null, b: null, c: null, d: null, e: null, f: "", g: null, remarks: "" };

const LEGEND_ITEMS = [
  { letter: "A", desc: "Correctly installed" },
  { letter: "B", desc: "Alarm/Activation confirmed" },
  { letter: "C", desc: "Annunciator indication" },
  { letter: "D", desc: "Supervised circuit trouble signal" },
  { letter: "E", desc: "Requires service/missing" },
  { letter: "F", desc: "Measurements" },
  { letter: "G", desc: "G.A. circuit" },
];

interface DeviceRow {
  id: number;
  deviceType: string;
  location?: string | null;
  label?: string | null;
  floor?: string | null;
  circuitAddress?: string | null;
  zone?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  notes?: string | null;
  result?: string;
  inspectionNotes?: string | null;
}

interface IndividualDeviceGridProps {
  jobId: number;
  devices: DeviceRow[];
  isFinalized?: boolean;
  onResultChange?: (deviceId: number, result: string) => void;
  carriedForwardDeviceIds?: Set<number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseChecks(json: string | null | undefined): CheckData {
  if (!json) return { ...DEFAULT_CHECKS };
  try {
    return { ...DEFAULT_CHECKS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_CHECKS };
  }
}

function serializeChecks(data: CheckData): string {
  return JSON.stringify(data);
}

function computeResult(data: CheckData): "pass" | "fail" | "not_tested" {
  const vals: CheckState[] = [data.a, data.b, data.c, data.d, data.e, data.g];
  if (vals.every((v) => v === null)) return "not_tested";
  if (vals.some((v) => v === false)) return "fail";
  return "pass";
}

function nextCheck(v: CheckState): CheckState {
  if (v === null) return true;
  if (v === true) return false;
  return null;
}

// ─── CheckButton ─────────────────────────────────────────────────────────────

function CheckButton({
  value,
  onChange,
  disabled,
}: {
  value: CheckState;
  onChange: (v: CheckState) => void;
  disabled?: boolean;
}) {
  const base = "h-7 w-10 rounded text-xs font-bold transition-colors";
  if (value === true) {
    return (
      <button
        onClick={() => !disabled && onChange(nextCheck(value))}
        className={cn(base, "bg-green-500 text-white hover:bg-green-600", disabled && "opacity-50 cursor-not-allowed")}
        title="PASS — click to change"
      >
        ✓
      </button>
    );
  }
  if (value === false) {
    return (
      <button
        onClick={() => !disabled && onChange(nextCheck(value))}
        className={cn(base, "bg-red-500 text-white hover:bg-red-600", disabled && "opacity-50 cursor-not-allowed")}
        title="FAIL — click to change"
      >
        ✗
      </button>
    );
  }
  return (
    <button
      onClick={() => !disabled && onChange(nextCheck(value))}
      className={cn(
        base,
        "border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title="Not tested — click to mark PASS"
    >
      —
    </button>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span className="font-medium">Legend</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 px-2 py-1 bg-muted/40 rounded text-xs text-muted-foreground border mb-1">
          {LEGEND_ITEMS.map(({ letter, desc }) => (
            <span key={letter}>
              <span className="font-bold text-foreground">{letter}</span> = {desc}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile Card ─────────────────────────────────────────────────────────────

function MobileCard({
  device,
  idx,
  checks,
  onCheckChange,
  onFChange,
  onRemarksChange,
  onRemarksBlur,
  onFBlur,
  isFinalized,
  isCarriedForward,
}: {
  device: DeviceRow;
  idx: number;
  checks: CheckData;
  onCheckChange: (key: keyof CheckData, value: CheckState) => void;
  onFChange: (val: string) => void;
  onRemarksChange: (val: string) => void;
  onRemarksBlur: () => void;
  onFBlur: () => void;
  isFinalized?: boolean;
  isCarriedForward?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg mb-2 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground font-mono shrink-0">{idx + 1}</span>
          {isCarriedForward && (
            <span className="text-[9px] font-semibold uppercase tracking-wide text-blue-600 border border-blue-300 rounded px-1 shrink-0">carried</span>
          )}
          <span className="text-sm font-medium truncate">{device.location || "—"}</span>
          {device.label && <span className="text-xs text-muted-foreground shrink-0">[{device.label}]</span>}
          <span className="text-xs text-muted-foreground shrink-0">{device.deviceType}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {(() => {
            const r = computeResult(checks);
            if (r === "pass") return <span className="h-5 w-5 rounded bg-green-500 text-white text-xs flex items-center justify-center">✓</span>;
            if (r === "fail") return <span className="h-5 w-5 rounded bg-red-500 text-white text-xs flex items-center justify-center">✗</span>;
            return <span className="h-5 w-5 rounded border-2 border-dashed border-gray-300 text-gray-400 text-xs flex items-center justify-center">—</span>;
          })()}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {/* Device info */}
          <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
            {device.circuitAddress && <span><span className="font-medium">Address:</span> {device.circuitAddress}</span>}
            {device.zone && <span><span className="font-medium">Zone:</span> {device.zone}</span>}
            {device.floor && <span><span className="font-medium">Floor:</span> {device.floor}</span>}
          </div>

          {/* Checks A–E, G */}
          <div className="space-y-1.5">
            {(["a", "b", "c", "d", "e", "g"] as const).map((key) => {
              const legend = LEGEND_ITEMS.find((l) => l.letter === key.toUpperCase())!;
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs">
                    <span className="font-bold">{legend.letter}.</span> {legend.desc}
                  </span>
                  <CheckButton
                    value={checks[key] as CheckState}
                    onChange={(v) => onCheckChange(key, v)}
                    disabled={isFinalized}
                  />
                </div>
              );
            })}
          </div>

          {/* F: Measurements */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold w-4 shrink-0">F.</span>
            <span className="text-xs text-muted-foreground shrink-0">Measurements:</span>
            <input
              className="flex-1 text-xs border rounded px-2 py-1 bg-background"
              value={checks.f}
              onChange={(e) => onFChange(e.target.value)}
              onBlur={onFBlur}
              disabled={isFinalized}
              placeholder="e.g. 2.1kΩ"
            />
          </div>

          {/* Remarks */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold shrink-0">Remarks:</span>
            <input
              className="flex-1 text-xs border rounded px-2 py-1 bg-background"
              value={checks.remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              onBlur={onRemarksBlur}
              disabled={isFinalized}
              placeholder="Additional notes…"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function IndividualDeviceGrid({
  jobId,
  devices,
  isFinalized,
  onResultChange,
  carriedForwardDeviceIds,
}: IndividualDeviceGridProps) {
  const [legendOpen, setLegendOpen] = useState(false);
  const [localChecks, setLocalChecks] = useState<Record<number, CheckData>>({});
  const pendingSave = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const isMobile = useIsMobile();

  const upsertResult = trpc.inspectionResult.upsert.useMutation({
    onError: () => toast.error("Failed to save"),
  });

  const getChecks = useCallback(
    (device: DeviceRow): CheckData => {
      return localChecks[device.id] ?? parseChecks(device.inspectionNotes);
    },
    [localChecks]
  );

  const saveChecks = useCallback(
    (deviceId: number, data: CheckData) => {
      // Debounce saves by 400ms to avoid thrashing on rapid text input
      if (pendingSave.current[deviceId]) clearTimeout(pendingSave.current[deviceId]);
      pendingSave.current[deviceId] = setTimeout(() => {
        const result = computeResult(data);
        const notes = serializeChecks(data);
        upsertResult.mutate({ jobId, deviceId, result, notes });
        onResultChange?.(deviceId, result);
        delete pendingSave.current[deviceId];
      }, 400);
    },
    [jobId, upsertResult, onResultChange]
  );

  const handleCheckChange = useCallback(
    (deviceId: number, key: keyof CheckData, value: CheckState | string) => {
      setLocalChecks((prev) => {
        const current = prev[deviceId] ?? parseChecks(devices.find((d) => d.id === deviceId)?.inspectionNotes);
        const updated = { ...current, [key]: value };
        saveChecks(deviceId, updated);
        return { ...prev, [deviceId]: updated };
      });
    },
    [devices, saveChecks]
  );

  const handleTextBlur = useCallback(
    (deviceId: number) => {
      setLocalChecks((prev) => {
        const current = prev[deviceId];
        if (!current) return prev;
        // Flush the debounced save immediately
        if (pendingSave.current[deviceId]) {
          clearTimeout(pendingSave.current[deviceId]);
          delete pendingSave.current[deviceId];
        }
        const result = computeResult(current);
        upsertResult.mutate({ jobId, deviceId, result, notes: serializeChecks(current) });
        onResultChange?.(deviceId, result);
        return prev;
      });
    },
    [jobId, upsertResult, onResultChange]
  );

  const handleAllPass = useCallback(() => {
    if (isFinalized) return;
    const allPass: CheckData = { a: true, b: true, c: true, d: true, e: true, f: "", g: true, remarks: "" };
    const updates: Record<number, CheckData> = {};
    devices.forEach((device) => { updates[device.id] = allPass; });
    setLocalChecks((prev) => ({ ...prev, ...updates }));
    devices.forEach((device) => {
      upsertResult.mutate({ jobId, deviceId: device.id, result: "pass", notes: serializeChecks(allPass) });
      onResultChange?.(device.id, "pass");
    });
    toast.success(`Marked ${devices.length} device${devices.length !== 1 ? "s" : ""} as all pass`);
  }, [devices, isFinalized, jobId, upsertResult, onResultChange]);

  if (devices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">No devices in this category</div>
    );
  }

  if (isMobile) {
    return (
      <div>
        <Legend open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
        {!isFinalized && (
          <button
            onClick={handleAllPass}
            className="mb-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" /> All Pass
          </button>
        )}
        {devices.map((device, idx) => {
          const checks = getChecks(device);
          return (
            <MobileCard
              key={device.id}
              device={device}
              idx={idx}
              checks={checks}
              onCheckChange={(key, val) => handleCheckChange(device.id, key, val)}
              onFChange={(val) => handleCheckChange(device.id, "f", val)}
              onRemarksChange={(val) => handleCheckChange(device.id, "remarks", val)}
              onFBlur={() => handleTextBlur(device.id)}
              onRemarksBlur={() => handleTextBlur(device.id)}
              isFinalized={isFinalized}
              isCarriedForward={carriedForwardDeviceIds?.has(device.id)}
            />
          );
        })}
      </div>
    );
  }

  // ── Desktop table ─────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Legend open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
        {!isFinalized && (
          <button
            onClick={handleAllPass}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" /> All Pass
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#16324F] text-white">
              <th className="px-2 py-2 text-center font-semibold border-r border-white/20 w-8 min-w-[2rem]">#</th>
              <th className="px-2 py-2 text-left font-semibold border-r border-white/20 w-32 min-w-[8rem]">Location</th>
              <th className="px-2 py-2 text-left font-semibold border-r border-white/20 w-24 min-w-[6rem]">Label/LCD</th>
              <th className="px-2 py-2 text-left font-semibold border-r border-white/20 w-20 min-w-[5rem]">Device</th>
              <th className="px-2 py-2 text-left font-semibold border-r border-white/20 w-16 min-w-[4rem]">Address</th>
              <th className="px-2 py-2 text-left font-semibold border-r border-white/20 w-14 min-w-[3.5rem]">Zone</th>
              {["A", "B", "C", "D", "E"].map((l) => (
                <th key={l} className="px-1 py-2 text-center font-semibold border-r border-white/20 w-12 min-w-[3rem]">
                  {l}
                </th>
              ))}
              <th className="px-2 py-2 text-left font-semibold border-r border-white/20 w-24 min-w-[6rem]">F</th>
              <th className="px-1 py-2 text-center font-semibold border-r border-white/20 w-12 min-w-[3rem]">G</th>
              <th className="px-2 py-2 text-left font-semibold w-32 min-w-[8rem]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device, idx) => {
              const checks = getChecks(device);
              const result = computeResult(checks);
              const rowBg =
                result === "pass"
                  ? "bg-green-50 dark:bg-green-950/20"
                  : result === "fail"
                  ? "bg-red-50 dark:bg-red-950/20"
                  : "";

              return (
                <tr key={device.id} className={cn("border-b hover:bg-muted/30 transition-colors", rowBg)}>
                  {/* # */}
                  <td className="px-2 py-1.5 text-center text-muted-foreground border-r font-mono">
                    {idx + 1}
                    {carriedForwardDeviceIds?.has(device.id) && (
                      <span className="block text-[9px] font-semibold uppercase tracking-wide text-blue-600 leading-none mt-0.5">carried</span>
                    )}
                  </td>

                  {/* Read-only device fields */}
                  <td className="px-2 py-1.5 border-r max-w-[8rem]">
                    <span className="truncate block">{device.location || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-2 py-1.5 border-r max-w-[6rem]">
                    <span className="truncate block">{device.label || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-2 py-1.5 border-r max-w-[5rem]">
                    <span className="truncate block">{device.deviceType || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-2 py-1.5 border-r max-w-[4rem]">
                    <span className="truncate block">{device.circuitAddress || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-2 py-1.5 border-r max-w-[3.5rem]">
                    <span className="truncate block">{device.zone || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>

                  {/* Checks A–E */}
                  {(["a", "b", "c", "d", "e"] as const).map((key) => (
                    <td key={key} className="px-1 py-1 text-center border-r">
                      <CheckButton
                        value={checks[key] as CheckState}
                        onChange={(v) => handleCheckChange(device.id, key, v)}
                        disabled={isFinalized}
                      />
                    </td>
                  ))}

                  {/* F: Measurements text */}
                  <td className="px-1 py-1 border-r">
                    <input
                      className="w-full bg-transparent outline-none border-b border-transparent focus:border-primary text-xs px-1"
                      value={checks.f}
                      onChange={(e) => handleCheckChange(device.id, "f", e.target.value)}
                      onBlur={() => handleTextBlur(device.id)}
                      disabled={isFinalized}
                      placeholder="—"
                    />
                  </td>

                  {/* Check G */}
                  <td className="px-1 py-1 text-center border-r">
                    <CheckButton
                      value={checks.g}
                      onChange={(v) => handleCheckChange(device.id, "g", v)}
                      disabled={isFinalized}
                    />
                  </td>

                  {/* Remarks */}
                  <td className="px-1 py-1">
                    <input
                      className="w-full bg-transparent outline-none border-b border-transparent focus:border-primary text-xs px-1"
                      value={checks.remarks}
                      onChange={(e) => handleCheckChange(device.id, "remarks", e.target.value)}
                      onBlur={() => handleTextBlur(device.id)}
                      disabled={isFinalized}
                      placeholder="—"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
