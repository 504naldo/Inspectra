import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Copy, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SystemsTabProps {
  inspectionId: number;
  isFinalized: boolean;
}

interface SystemData {
  id?: number;
  systemNumber: number;
  isWet: boolean | null;
  isDryPipePartialTest: boolean | null;
  isDryPipeFullFlowTest: boolean | null;
  isDeluge: boolean | null;
  isPreaction: boolean | null;
  isOther: boolean | null;
  otherDescription: string | null;
  dateOfLastFullFlowTest: Date | null;
  dateOfLast5YearInternal: Date | null;
  areaOfCoverage: string | null;
  size: string | null;
  manufacturer: string | null;
  model: string | null;
  systemWaterPressure: number | null;
  supplyWaterPressure: number | null;
  residualPressure: number | null;
  waterPressureAtBaseOfRiser: number | null;
  systemAirPressure: number | null;
  lowAirSwitchCutIn: number | null;
  tripPressure: number | null;
  tripTime: number | null;
  waterDeliveryTime: number | null;
  gaugeYear: number | null;
  gaugeCondition: string | null;
  compressorMakeModel: string | null;
  compressorCutInPressure: number | null;
  compressorCutOutPressure: number | null;
  notes: string | null;
}

const emptySystem = (systemNumber: number): SystemData => ({
  systemNumber,
  isWet: false,
  isDryPipePartialTest: false,
  isDryPipeFullFlowTest: false,
  isDeluge: false,
  isPreaction: false,
  isOther: false,
  otherDescription: null,
  dateOfLastFullFlowTest: null,
  dateOfLast5YearInternal: null,
  areaOfCoverage: null,
  size: null,
  manufacturer: null,
  model: null,
  systemWaterPressure: null,
  supplyWaterPressure: null,
  residualPressure: null,
  waterPressureAtBaseOfRiser: null,
  systemAirPressure: null,
  lowAirSwitchCutIn: null,
  tripPressure: null,
  tripTime: null,
  waterDeliveryTime: null,
  gaugeYear: null,
  gaugeCondition: null,
  compressorMakeModel: null,
  compressorCutInPressure: null,
  compressorCutOutPressure: null,
  notes: null,
});

export default function SystemsTab({ inspectionId, isFinalized }: SystemsTabProps) {
  const [systems, setSystems] = useState<SystemData[]>([emptySystem(1)]);
  const [expandedSystems, setExpandedSystems] = useState<Set<number>>(new Set([1]));

  // Load existing systems
  const { data: existingSystems, isLoading } = trpc.sprinkler.getSystems.useQuery(
    { inspectionId },
    { enabled: !!inspectionId }
  );

  useEffect(() => {
    if (existingSystems && existingSystems.length > 0) {
      const sorted = [...existingSystems].sort((a: any, b: any) => a.systemNumber - b.systemNumber);
      setSystems(sorted.map((s: any, i: number) => ({ ...emptySystem(i + 1), ...s, systemNumber: i + 1 })));
    }
  }, [existingSystems]);

  const saveSystems = trpc.sprinkler.upsertSystems.useMutation({
    onSuccess: () => {
      toast.success("Systems saved successfully");
    },
    onError: () => {
      toast.error("Failed to save systems");
    }
  });

  const handleSave = () => {
    saveSystems.mutate({
      inspectionId,
      systems: systems.map(s => ({
        ...s,
        isWet: s.isWet ?? undefined,
        isDryPipePartialTest: s.isDryPipePartialTest ?? undefined,
        isDryPipeFullFlowTest: s.isDryPipeFullFlowTest ?? undefined,
        isDeluge: s.isDeluge ?? undefined,
        isPreaction: s.isPreaction ?? undefined,
        isOther: s.isOther ?? undefined,
        dateOfLastFullFlowTest: s.dateOfLastFullFlowTest || undefined,
        dateOfLast5YearInternal: s.dateOfLast5YearInternal || undefined,
        systemWaterPressure: s.systemWaterPressure ?? undefined,
        supplyWaterPressure: s.supplyWaterPressure ?? undefined,
        residualPressure: s.residualPressure ?? undefined,
        waterPressureAtBaseOfRiser: s.waterPressureAtBaseOfRiser ?? undefined,
        systemAirPressure: s.systemAirPressure ?? undefined,
        lowAirSwitchCutIn: s.lowAirSwitchCutIn ?? undefined,
        tripPressure: s.tripPressure ?? undefined,
        tripTime: s.tripTime ?? undefined,
        waterDeliveryTime: s.waterDeliveryTime ?? undefined,
        gaugeYear: s.gaugeYear ?? undefined,
        compressorCutInPressure: s.compressorCutInPressure ?? undefined,
        compressorCutOutPressure: s.compressorCutOutPressure ?? undefined,
        otherDescription: s.otherDescription || undefined,
        areaOfCoverage: s.areaOfCoverage || undefined,
        size: s.size || undefined,
        manufacturer: s.manufacturer || undefined,
        model: s.model || undefined,
        gaugeCondition: s.gaugeCondition || undefined,
        compressorMakeModel: s.compressorMakeModel || undefined,
        notes: s.notes || undefined,
      })),
    });
  };

  const updateSystem = (index: number, field: keyof SystemData, value: any) => {
    setSystems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const copyFromPrevious = (index: number) => {
    if (index === 0) {
      toast.error("No previous system to copy from");
      return;
    }
    setSystems(prev => {
      const updated = [...prev];
      updated[index] = { ...prev[index - 1], systemNumber: index + 1, id: prev[index].id };
      return updated;
    });
    toast.success(`Copied values from System #${index}`);
  };

  const addSystem = () => {
    const nextNumber = systems.length + 1;
    setSystems(prev => [...prev, emptySystem(nextNumber)]);
    setExpandedSystems(prev => new Set([...prev, nextNumber]));
  };

  const removeSystem = (index: number) => {
    setSystems(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Re-number remaining systems sequentially
      return updated.map((s, i) => ({ ...s, systemNumber: i + 1 }));
    });
    setExpandedSystems(prev => {
      // Rebuild expanded set with renumbered system numbers
      const asList = [...prev].filter(n => n !== index + 1).map(n => n > index + 1 ? n - 1 : n);
      return new Set(asList);
    });
  };

  const toggleExpanded = (systemNumber: number) => {
    setExpandedSystems(prev => {
      const next = new Set(prev);
      if (next.has(systemNumber)) {
        next.delete(systemNumber);
      } else {
        next.add(systemNumber);
      }
      return next;
    });
  };

  const isDrySystem = (system: SystemData) =>
    system.isDryPipePartialTest || system.isDryPipeFullFlowTest || system.isPreaction;

  if (isLoading) {
    return <div className="text-center py-8">Loading systems...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {systems.length} sprinkler system{systems.length !== 1 ? "s" : ""} — NFPA 25 measurements
        </p>
        <Button onClick={handleSave} disabled={isFinalized || saveSystems.isPending}>
          <Save className="h-4 w-4 mr-2" />
          Save All Systems
        </Button>
      </div>

      {systems.map((system, index) => (
        <Card key={index}>
          <Collapsible
            open={expandedSystems.has(system.systemNumber)}
            onOpenChange={() => toggleExpanded(system.systemNumber)}
          >
            <CardHeader className="cursor-pointer">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">System #{system.systemNumber}</CardTitle>
                <div className="flex items-center gap-2">
                  {index > 0 && !isFinalized && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyFromPrevious(index);
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy Previous
                    </Button>
                  )}
                  {systems.length > 1 && !isFinalized && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSystem(index);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {expandedSystems.has(system.systemNumber) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="space-y-6">
                {/* System Type */}
                <div>
                  <Label className="text-base font-semibold mb-3 block">System Type</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { key: 'isWet', label: 'Wet' },
                      { key: 'isDryPipePartialTest', label: 'Dry Pipe (Partial Test)' },
                      { key: 'isDryPipeFullFlowTest', label: 'Dry Pipe (Full Flow Test)' },
                      { key: 'isDeluge', label: 'Deluge' },
                      { key: 'isPreaction', label: 'Preaction' },
                      { key: 'isOther', label: 'Other' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${index}-${key}`}
                          checked={system[key as keyof SystemData] as boolean}
                          onCheckedChange={(checked) => updateSystem(index, key as keyof SystemData, checked)}
                          disabled={isFinalized}
                        />
                        <Label htmlFor={`${index}-${key}`} className="cursor-pointer">
                          {label}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {system.isOther && (
                    <Input
                      className="mt-2"
                      placeholder="Describe other system type"
                      value={system.otherDescription || ''}
                      onChange={(e) => updateSystem(index, 'otherDescription', e.target.value)}
                      disabled={isFinalized}
                    />
                  )}
                </div>

                {/* General Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`${index}-area`}>Area of Coverage</Label>
                    <Input
                      id={`${index}-area`}
                      value={system.areaOfCoverage || ''}
                      onChange={(e) => updateSystem(index, 'areaOfCoverage', e.target.value)}
                      disabled={isFinalized}
                      placeholder="e.g., Parkade, Main Floor"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${index}-size`}>System Size</Label>
                    <Input
                      id={`${index}-size`}
                      value={system.size || ''}
                      onChange={(e) => updateSystem(index, 'size', e.target.value)}
                      disabled={isFinalized}
                      placeholder="e.g., 4 inch"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${index}-manufacturer`}>Manufacturer</Label>
                    <Input
                      id={`${index}-manufacturer`}
                      value={system.manufacturer || ''}
                      onChange={(e) => updateSystem(index, 'manufacturer', e.target.value)}
                      disabled={isFinalized}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${index}-model`}>Model</Label>
                    <Input
                      id={`${index}-model`}
                      value={system.model || ''}
                      onChange={(e) => updateSystem(index, 'model', e.target.value)}
                      disabled={isFinalized}
                    />
                  </div>
                </div>

                {/* Water Pressures */}
                <div>
                  <Label className="text-base font-semibold mb-3 block">Water Supply & Hydraulic Measurements</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`${index}-supplyPressure`}>Supply Water Pressure (psi)</Label>
                      <Input
                        id={`${index}-supplyPressure`}
                        type="number"
                        inputMode="numeric"
                        value={system.supplyWaterPressure ?? ''}
                        onChange={(e) => updateSystem(index, 'supplyWaterPressure', e.target.value ? parseInt(e.target.value) : null)}
                        disabled={isFinalized}
                        placeholder="psi"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${index}-systemPressure`}>System Water Pressure (psi)</Label>
                      <Input
                        id={`${index}-systemPressure`}
                        type="number"
                        inputMode="numeric"
                        value={system.systemWaterPressure ?? ''}
                        onChange={(e) => updateSystem(index, 'systemWaterPressure', e.target.value ? parseInt(e.target.value) : null)}
                        disabled={isFinalized}
                        placeholder="psi"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${index}-residualPressure`}>Residual Pressure (psi)</Label>
                      <Input
                        id={`${index}-residualPressure`}
                        type="number"
                        inputMode="numeric"
                        value={system.residualPressure ?? ''}
                        onChange={(e) => updateSystem(index, 'residualPressure', e.target.value ? parseInt(e.target.value) : null)}
                        disabled={isFinalized}
                        placeholder="psi"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${index}-riserPressure`}>Water Pressure at Base of Riser (psi)</Label>
                      <Input
                        id={`${index}-riserPressure`}
                        type="number"
                        inputMode="numeric"
                        value={system.waterPressureAtBaseOfRiser ?? ''}
                        onChange={(e) => updateSystem(index, 'waterPressureAtBaseOfRiser', e.target.value ? parseInt(e.target.value) : null)}
                        disabled={isFinalized}
                        placeholder="psi"
                      />
                    </div>
                  </div>
                </div>

                {/* Dry System Fields */}
                {isDrySystem(system) && (
                  <>
                    <div>
                      <Label className="text-base font-semibold mb-3 block">Air & Dry System Measurements</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`${index}-airPressure`}>System Air Pressure (psi)</Label>
                          <Input
                            id={`${index}-airPressure`}
                            type="number"
                            inputMode="numeric"
                            value={system.systemAirPressure ?? ''}
                            onChange={(e) => updateSystem(index, 'systemAirPressure', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isFinalized}
                            placeholder="psi"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${index}-lowAirCutIn`}>Low Air Switch Cut-In (psi)</Label>
                          <Input
                            id={`${index}-lowAirCutIn`}
                            type="number"
                            inputMode="numeric"
                            value={system.lowAirSwitchCutIn ?? ''}
                            onChange={(e) => updateSystem(index, 'lowAirSwitchCutIn', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isFinalized}
                            placeholder="psi"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${index}-tripPressure`}>Trip Pressure (psi)</Label>
                          <Input
                            id={`${index}-tripPressure`}
                            type="number"
                            inputMode="numeric"
                            value={system.tripPressure ?? ''}
                            onChange={(e) => updateSystem(index, 'tripPressure', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isFinalized}
                            placeholder="psi"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${index}-tripTime`}>Trip Time (seconds)</Label>
                          <Input
                            id={`${index}-tripTime`}
                            type="number"
                            inputMode="numeric"
                            value={system.tripTime ?? ''}
                            onChange={(e) => updateSystem(index, 'tripTime', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isFinalized}
                            placeholder="seconds"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${index}-waterDelivery`}>Water Delivery to End Device (seconds)</Label>
                          <Input
                            id={`${index}-waterDelivery`}
                            type="number"
                            inputMode="numeric"
                            value={system.waterDeliveryTime ?? ''}
                            onChange={(e) => updateSystem(index, 'waterDeliveryTime', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isFinalized}
                            placeholder="seconds"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold mb-3 block">Compressor Information</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <Label htmlFor={`${index}-compressorMake`}>Compressor Make/Model</Label>
                          <Input
                            id={`${index}-compressorMake`}
                            value={system.compressorMakeModel || ''}
                            onChange={(e) => updateSystem(index, 'compressorMakeModel', e.target.value)}
                            disabled={isFinalized}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${index}-compressorCutIn`}>Cut-In Pressure (psi)</Label>
                          <Input
                            id={`${index}-compressorCutIn`}
                            type="number"
                            inputMode="numeric"
                            value={system.compressorCutInPressure ?? ''}
                            onChange={(e) => updateSystem(index, 'compressorCutInPressure', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isFinalized}
                            placeholder="psi"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${index}-compressorCutOut`}>Cut-Out Pressure (psi)</Label>
                          <Input
                            id={`${index}-compressorCutOut`}
                            type="number"
                            inputMode="numeric"
                            value={system.compressorCutOutPressure ?? ''}
                            onChange={(e) => updateSystem(index, 'compressorCutOutPressure', e.target.value ? parseInt(e.target.value) : null)}
                            disabled={isFinalized}
                            placeholder="psi"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Gauge Information */}
                <div>
                  <Label className="text-base font-semibold mb-3 block">Gauge Information</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`${index}-gaugeYear`}>Year of Gauge Manufacture/Installation</Label>
                      <Input
                        id={`${index}-gaugeYear`}
                        type="number"
                        inputMode="numeric"
                        value={system.gaugeYear ?? ''}
                        onChange={(e) => updateSystem(index, 'gaugeYear', e.target.value ? parseInt(e.target.value) : null)}
                        disabled={isFinalized}
                        placeholder="YYYY"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${index}-gaugeCondition`}>Gauge Condition</Label>
                      <Input
                        id={`${index}-gaugeCondition`}
                        value={system.gaugeCondition || ''}
                        onChange={(e) => updateSystem(index, 'gaugeCondition', e.target.value)}
                        disabled={isFinalized}
                        placeholder="e.g., Good, Fair, Needs Replacement"
                      />
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <Label className="text-base font-semibold mb-3 block">Test Dates</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`${index}-lastFullFlow`}>Date of Last Full Flow Test</Label>
                      <Input
                        id={`${index}-lastFullFlow`}
                        type="date"
                        value={system.dateOfLastFullFlowTest ? new Date(system.dateOfLastFullFlowTest).toISOString().split('T')[0] : ''}
                        onChange={(e) => updateSystem(index, 'dateOfLastFullFlowTest', e.target.value ? new Date(e.target.value) : null)}
                        disabled={isFinalized}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${index}-last5Year`}>Date of Last 5 Year Internal</Label>
                      <Input
                        id={`${index}-last5Year`}
                        type="date"
                        value={system.dateOfLast5YearInternal ? new Date(system.dateOfLast5YearInternal).toISOString().split('T')[0] : ''}
                        onChange={(e) => updateSystem(index, 'dateOfLast5YearInternal', e.target.value ? new Date(e.target.value) : null)}
                        disabled={isFinalized}
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor={`${index}-notes`}>Notes</Label>
                  <Textarea
                    id={`${index}-notes`}
                    value={system.notes || ''}
                    onChange={(e) => updateSystem(index, 'notes', e.target.value)}
                    disabled={isFinalized}
                    rows={3}
                    placeholder="Additional notes about this system"
                  />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}

      {!isFinalized && (
        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={addSystem}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add System
        </Button>
      )}
    </div>
  );
}
