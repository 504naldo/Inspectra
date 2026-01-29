import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface InspectionSummaryProps {
  jobId: number;
}

export function InspectionSummary({ jobId }: InspectionSummaryProps) {
  const { data: summary, isLoading } = trpc.job.getSummary.useQuery({ id: jobId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inspection Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading summary...</div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const { systemCoverage, inspectionTotals, deficiencyBreakdown, costSummary } = summary.summary;
  const { completionStatus } = summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Inspection Summary</span>
          <span className="text-sm font-normal text-muted-foreground">
            {completionStatus.percentComplete}% Complete
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* System Coverage */}
        <div>
          <h3 className="text-sm font-semibold mb-3">System Coverage</h3>
          <div className="space-y-2">
            <SystemCoverageItem 
              label="Fire Alarm System (CAN/ULC-S536)" 
              checked={systemCoverage.fireAlarmSystem} 
            />
            <SystemCoverageItem 
              label="Sprinkler ITM (NFPA 25 / Vancouver Fire By-law)" 
              checked={systemCoverage.sprinklerITM} 
            />
            <SystemCoverageItem 
              label="Fire Extinguishers" 
              checked={systemCoverage.fireExtinguishers} 
            />
            <SystemCoverageItem 
              label="Emergency Lighting" 
              checked={systemCoverage.emergencyLighting} 
            />
            <SystemCoverageItem 
              label="Smoke Alarms (in-suite)" 
              checked={systemCoverage.smokeAlarms} 
            />
          </div>
        </div>

        {/* Inspection Totals */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Inspection Totals</h3>
          <div className="grid grid-cols-2 gap-3">
            <TotalItem label="Fire Alarm Devices" count={inspectionTotals.fireAlarmDevices} />
            <TotalItem label="Sprinkler Components" count={inspectionTotals.sprinklerComponents} />
            <TotalItem label="Smoke Alarms" count={inspectionTotals.smokeAlarms} />
            <TotalItem label="Fire Extinguishers" count={inspectionTotals.fireExtinguishers} />
            <TotalItem label="Emergency Lights" count={inspectionTotals.emergencyLights} />
          </div>
        </div>

        {/* Deficiency Breakdown */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Deficiencies</h3>
          <div className="space-y-2">
            <DeficiencyItem label="Total" count={deficiencyBreakdown.total} />
            <DeficiencyItem label="Critical" count={deficiencyBreakdown.critical} severity="critical" />
            <DeficiencyItem label="Major" count={deficiencyBreakdown.major} severity="major" />
            <DeficiencyItem label="Minor" count={deficiencyBreakdown.minor} severity="minor" />
          </div>
        </div>

        {/* Cost Summary (Office Only) */}
        {costSummary.grandTotal > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Deficiency Cost Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Labour</span>
                <span>${costSummary.labourSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Materials</span>
                <span>${costSummary.materialsSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${costSummary.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({(costSummary.taxRate * 100).toFixed(0)}%)</span>
                <span>${costSummary.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-2 border-t">
                <span>Grand Total</span>
                <span>${costSummary.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SystemCoverageItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {checked ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <Circle className="h-4 w-4 text-gray-300" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}

function TotalItem({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function DeficiencyItem({ 
  label, 
  count, 
  severity 
}: { 
  label: string; 
  count: number; 
  severity?: 'critical' | 'major' | 'minor';
}) {
  const getSeverityColor = () => {
    if (!severity) return 'text-foreground';
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'major': return 'text-orange-600';
      case 'minor': return 'text-yellow-600';
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {severity && <AlertCircle className={`h-4 w-4 ${getSeverityColor()}`} />}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${getSeverityColor()}`}>{count}</span>
    </div>
  );
}
