import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, CheckCircle2, XCircle, Ban, Minus, AlertTriangle, WifiOff } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingSmokeAlarmTests } from "@/hooks/usePendingSmokeAlarmTests";
import { offlineStorage } from "@/lib/offlineStorage";

interface SmokeAlarmInspectionProps {
  jobId: number;
}

export default function SmokeAlarmInspection({ jobId }: SmokeAlarmInspectionProps) {
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expired' | 'expiring_soon'>('all');
  const [newAlarm, setNewAlarm] = useState({
    suiteNumber: "",
    location: "",
    powerType: "unknown" as "hardwired" | "battery" | "sealed" | "unknown",
    installDate: "",
    notes: "",
  });

  const isOnline = useOnlineStatus();
  const pendingSmokeTests = usePendingSmokeAlarmTests();

  const { data: job } = trpc.job.getWithDetails.useQuery({ id: jobId });
  const { data: smokeAlarms = [], refetch } = trpc.smokeAlarm.listByJob.useQuery({ jobId });

  // Overlay test results recorded offline (queued in IndexedDB) on top of the
  // server data, so the UI reflects them immediately even before they sync.
  const offlineResultByAlarm = new Map(
    pendingSmokeTests.filter((t) => t.jobId === jobId).map((t) => [t.alarmId, t.testResult] as const)
  );
  const getEffectiveResult = (alarm: { id: number; testResult: string | null }) =>
    alarm.testResult ?? offlineResultByAlarm.get(alarm.id) ?? null;
  const pendingThisJob = offlineResultByAlarm.size;

  const createAlarm = trpc.smokeAlarm.create.useMutation({
    onSuccess: () => {
      toast.success("Smoke alarm added");
      setIsAddDialogOpen(false);
      setNewAlarm({
        suiteNumber: "",
        location: "",
        powerType: "unknown",
        installDate: "",
        notes: "",
      });
      refetch();
    },
    onError: (error) => toast.error(error.message || "Failed to add smoke alarm"),
  });

  const recordTest = trpc.smokeAlarm.recordTest.useMutation({
    onSuccess: (result) => {
      if (result.requiresDeficiency) {
        toast.warning("Test failed - please add deficiency");
      } else {
        toast.success("Test result recorded");
      }
      refetch();
    },
    // Errors are handled in handleRecordTest, which falls back to offline storage
  });

  // Separate, callback-free mutation used by the reconnect auto-sync loop so it
  // doesn't fire a per-item success toast/refetch for every queued result.
  const syncSmokeTest = trpc.smokeAlarm.recordTest.useMutation();

  // Flush any queued offline smoke-alarm tests when the connection returns.
  // Redundant with SyncScreen, but lets a tech who stays on this page recover
  // without navigating away. deleteSmokeTest is a safe no-op if SyncScreen got
  // there first, so the two paths can't double-error.
  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;

    const syncPending = async () => {
      try {
        const pending = await offlineStorage.getPendingSmokeTests();
        if (pending.length === 0 || cancelled) return;

        let success = 0;
        for (const test of pending) {
          try {
            await syncSmokeTest.mutateAsync({ id: test.alarmId, testResult: test.testResult, notes: test.notes });
            await offlineStorage.deleteSmokeTest(test.id);
            success++;
          } catch (error) {
            console.error(`Failed to sync smoke-alarm test ${test.id}:`, error);
          }
        }

        if (success > 0 && !cancelled) {
          toast.success(`Synced ${success} offline smoke-alarm test${success !== 1 ? "s" : ""}`);
          refetch();
        }
      } catch (error) {
        console.error("Smoke-alarm sync failed:", error);
      }
    };

    syncPending();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const handleAddAlarm = () => {
    if (!newAlarm.suiteNumber.trim()) {
      toast.error("Suite number is required");
      return;
    }

    if (!job?.site?.companyId || !job?.job?.siteId) {
      toast.error("Invalid job data");
      return;
    }

    createAlarm.mutate({
      companyId: job.site.companyId,
      siteId: job.job.siteId,
      suiteNumber: newAlarm.suiteNumber,
      location: newAlarm.location || undefined,
      powerType: newAlarm.powerType,
      installDate: newAlarm.installDate || undefined,
      notes: newAlarm.notes || undefined,
    });
  };

  const handleRecordTest = async (alarmId: number, testResult: "pass" | "fail" | "no_access" | "na") => {
    // If offline, queue to IndexedDB; the pub/sub overlay reflects it instantly
    // and SyncScreen / the reconnect effect will push it to the server later.
    if (!isOnline) {
      try {
        await offlineStorage.savePendingSmokeTest({ jobId, alarmId, testResult });
        toast.info("Saved offline. Will sync when online.");
      } catch (error) {
        console.error("Failed to save smoke-alarm test offline:", error);
        toast.error("Failed to save offline");
      }
      return;
    }

    try {
      await recordTest.mutateAsync({ id: alarmId, testResult });
    } catch (error) {
      // Server save failed — fall back to the offline queue instead of losing it
      console.error("Server save failed, falling back to offline:", error);
      try {
        await offlineStorage.savePendingSmokeTest({ jobId, alarmId, testResult });
        toast.info("Saved offline. Will sync when connection improves.");
      } catch (offlineError) {
        console.error("Offline save also failed:", offlineError);
        toast.error("Failed to record test");
      }
    }
  };

  const getTestResultBadge = (testResult: string | null) => {
    if (!testResult) return null;
    
    const badges = {
      pass: { label: "PASS", icon: CheckCircle2, color: "text-[var(--success)] bg-[var(--success)]/10" },
      fail: { label: "FAIL", icon: XCircle, color: "text-destructive bg-destructive/10" },
      no_access: { label: "NO ACCESS", icon: Ban, color: "text-[var(--warning)] bg-[var(--warning)]/10" },
      na: { label: "N/A", icon: Minus, color: "text-gray-600 bg-gray-50 dark:bg-gray-950/20" },
    };

    const badge = badges[testResult as keyof typeof badges];
    if (!badge) return null;

    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Unknown";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString();
  };

  const getExpiryBadge = (expiryInfo: any) => {
    if (!expiryInfo || expiryInfo.status === 'ok') return null;
    
    const badges = {
      expired: { color: "text-destructive bg-destructive/10 border-destructive/20", label: "Expired" },
      expiring_soon: { color: "text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20", label: "Expiring Soon" },
      unknown: { color: "text-gray-600 bg-gray-50 dark:bg-gray-950/20 border-gray-200", label: "Install Date Required" },
    };

    const badge = badges[expiryInfo.status as keyof typeof badges];
    if (!badge) return null;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${badge.color}`}>
        <AlertTriangle className="h-3 w-3" />
        {expiryInfo.warningMessage || badge.label}
      </span>
    );
  };

  // Filter and sort smoke alarms
  const filteredAndSortedAlarms = smokeAlarms
    .filter(alarm => {
      if (expiryFilter === 'all') return true;
      return alarm.expiryInfo?.status === expiryFilter;
    })
    .sort((a, b) => {
      // Sort by expiry status: expired first, then expiring soon, then by days remaining
      const statusPriority = { expired: 0, expiring_soon: 1, unknown: 2, ok: 3 };
      const aPriority = statusPriority[a.expiryInfo?.status || 'ok'];
      const bPriority = statusPriority[b.expiryInfo?.status || 'ok'];
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Within same status, sort by days remaining (ascending)
      const aDays = a.expiryInfo?.daysRemaining ?? Infinity;
      const bDays = b.expiryInfo?.daysRemaining ?? Infinity;
      return aDays - bDays;
    });

  const testedCount = smokeAlarms.filter(a => getEffectiveResult(a)).length;
  const passedCount = smokeAlarms.filter(a => getEffectiveResult(a) === "pass").length;
  const failedCount = smokeAlarms.filter(a => getEffectiveResult(a) === "fail" || getEffectiveResult(a) === "no_access").length;
  const expiredCount = smokeAlarms.filter(a => a.expiryInfo?.status === 'expired').length;
  const expiringSoonCount = smokeAlarms.filter(a => a.expiryInfo?.status === 'expiring_soon').length;

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex items-center gap-4 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(`/tech/jobs/${jobId}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Smoke Alarms</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              {job?.site?.name}
              {!isOnline && (
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <WifiOff className="h-3 w-3" /> Offline
                </span>
              )}
              {pendingThisJob > 0 && (
                <span className="text-amber-600">· {pendingThisJob} unsynced</span>
              )}
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Smoke Alarm</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="suiteNumber">Suite Number *</Label>
                  <Input
                    id="suiteNumber"
                    value={newAlarm.suiteNumber}
                    onChange={(e) => setNewAlarm({ ...newAlarm, suiteNumber: e.target.value })}
                    placeholder="e.g., 101, 2A, PH1"
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={newAlarm.location}
                    onChange={(e) => setNewAlarm({ ...newAlarm, location: e.target.value })}
                    placeholder="e.g., Hallway, Bedroom, Kitchen"
                  />
                </div>
                <div>
                  <Label htmlFor="powerType">Power Type</Label>
                  <Select
                    value={newAlarm.powerType}
                    onValueChange={(value: "hardwired" | "battery" | "sealed" | "unknown") =>
                      setNewAlarm({ ...newAlarm, powerType: value })
                    }
                  >
                    <SelectTrigger id="powerType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hardwired">Hardwired</SelectItem>
                      <SelectItem value="battery">Battery</SelectItem>
                      <SelectItem value="sealed">Sealed (10-year)</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="installDate">Install Date</Label>
                  <Input
                    id="installDate"
                    type="date"
                    value={newAlarm.installDate}
                    onChange={(e) => setNewAlarm({ ...newAlarm, installDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={newAlarm.notes}
                    onChange={(e) => setNewAlarm({ ...newAlarm, notes: e.target.value })}
                    placeholder="Additional information..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddAlarm} disabled={createAlarm.isPending} className="flex-1">
                    {createAlarm.isPending ? "Adding..." : "Add Smoke Alarm"}
                  </Button>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Stats */}
      <div className="container py-4 space-y-3">
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{smokeAlarms.length}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-accent">{testedCount}</div>
                <div className="text-xs text-muted-foreground">Tested</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--success)]">{passedCount}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-destructive">{failedCount}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Expiry Filter */}
        {(expiredCount > 0 || expiringSoonCount > 0) && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={expiryFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setExpiryFilter('all')}
            >
              All ({smokeAlarms.length})
            </Button>
            {expiredCount > 0 && (
              <Button
                size="sm"
                variant={expiryFilter === 'expired' ? 'default' : 'outline'}
                className={expiryFilter === 'expired' ? '' : 'text-destructive hover:bg-destructive/5'}
                onClick={() => setExpiryFilter('expired')}
              >
                Expired ({expiredCount})
              </Button>
            )}
            {expiringSoonCount > 0 && (
              <Button
                size="sm"
                variant={expiryFilter === 'expiring_soon' ? 'default' : 'outline'}
                className={expiryFilter === 'expiring_soon' ? '' : 'text-[var(--warning)] hover:bg-[var(--warning)]/5'}
                onClick={() => setExpiryFilter('expiring_soon')}
              >
                Expiring Soon ({expiringSoonCount})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Smoke Alarm List */}
      <div className="container pb-6 space-y-3">
        {filteredAndSortedAlarms.length === 0 && smokeAlarms.length > 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>No smoke alarms match the selected filter</p>
            </CardContent>
          </Card>
        ) : smokeAlarms.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>No smoke alarms added yet</p>
              <p className="text-sm mt-2">Click "Add" to create a smoke alarm entry</p>
            </CardContent>
          </Card>
        ) : (
          filteredAndSortedAlarms.map((alarm) => (
            <Card key={alarm.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">Suite {alarm.suiteNumber}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {alarm.location || "No location specified"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getTestResultBadge(getEffectiveResult(alarm))}
                    {getExpiryBadge(alarm.expiryInfo)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Power:</span>{" "}
                    <span className="capitalize">{alarm.powerType || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Installed:</span>{" "}
                    {formatDate(alarm.installDate)}
                  </div>
                </div>
                {alarm.notes && (
                  <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">
                    {alarm.notes}
                  </p>
                )}
                {!getEffectiveResult(alarm) && (
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[var(--success)] hover:bg-[var(--success)]/5"
                      onClick={() => handleRecordTest(alarm.id, "pass")}
                      disabled={recordTest.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Pass
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/5"
                      onClick={() => handleRecordTest(alarm.id, "fail")}
                      disabled={recordTest.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Fail
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[var(--warning)] hover:bg-[var(--warning)]/5"
                      onClick={() => handleRecordTest(alarm.id, "no_access")}
                      disabled={recordTest.isPending}
                    >
                      <Ban className="h-4 w-4 mr-1" />
                      No Access
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-950/20"
                      onClick={() => handleRecordTest(alarm.id, "na")}
                      disabled={recordTest.isPending}
                    >
                      <Minus className="h-4 w-4 mr-1" />
                      N/A
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
