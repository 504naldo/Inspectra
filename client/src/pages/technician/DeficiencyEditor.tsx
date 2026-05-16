import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft, 
  Sparkles,
  Save,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useTrackInspectionProgress } from "@/hooks/useInspectionProgress";

interface DeficiencyEditorProps {
  deficiencyId?: number;
  jobId?: number;
}

export default function DeficiencyEditor({ deficiencyId, jobId }: DeficiencyEditorProps) {
  const [location, setLocation] = useLocation();
  const isEditing = !!deficiencyId;
  
  // Track inspection progress for resume functionality
  useTrackInspectionProgress(
    jobId || 0,
    location,
    'deficiency',
    isEditing ? 'Edit Deficiency' : 'Create Deficiency'
  );

  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<string>("major");
  const [status, setStatus] = useState<string>("open");
  const [systemCategory, setSystemCategory] = useState<string | undefined>();
  const [observedIssue, setObservedIssue] = useState("");
  const [description, setDescription] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [customerExplanation, setCustomerExplanation] = useState("");
  const [codeReference, setCodeReference] = useState("");
  const [deviceId, setDeviceId] = useState<number | undefined>();
  const [deviceType, setDeviceType] = useState("");
  const [deviceLocation, setDeviceLocation] = useState("");
  const [aiDraft, setAiDraft] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<string>("");  // stored as string for input, converted to number on save

  // Get device ID from URL params if creating new
  useEffect(() => {
    if (!isEditing) {
      const params = new URLSearchParams(window.location.search);
      const dId = params.get('deviceId');
      if (dId) setDeviceId(parseInt(dId));
    }
  }, [isEditing]);

  // Load existing deficiency
  const { data: existingDef } = trpc.deficiency.get.useQuery(
    { id: deficiencyId! },
    { enabled: isEditing }
  );

  // Load device info
  const { data: device } = trpc.device.get.useQuery(
    { id: deviceId! },
    { enabled: !!deviceId }
  );

  useEffect(() => {
    if (existingDef?.deficiency) {
      const def = existingDef.deficiency;
      setTitle(def.title);
      setSeverity(def.severity);
      setStatus(def.status);
      setObservedIssue(def.observedIssue || "");
      setDescription(def.description || "");
      setCorrectiveAction(def.correctiveAction || "");
      setCustomerExplanation(def.customerExplanation || "");
      setCodeReference(def.codeReference || "");
      setDeviceId(def.deviceId || undefined);
      setAiDraft(!!def.aiGeneratedAt);
      setSystemCategory(def.systemCategory || undefined);
      setEstimatedCost(def.estimatedCost != null ? String(def.estimatedCost) : "");
    }
  }, [existingDef]);

  useEffect(() => {
    if (device) {
      setDeviceType(device.deviceType);
      setDeviceLocation(device.location || "");
    }
  }, [device]);

  // AI narrative generator
  const generateNarrative = trpc.ai.generateDeficiencyNarrative.useMutation({
    onSuccess: (data) => {
      setDescription(data.description);
      setCorrectiveAction(data.correctiveAction);
      setCustomerExplanation(data.customerExplanation);
      setAiDraft(true);
      toast.success('AI narrative generated - review and edit as needed');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate narrative');
    }
  });

  const handleGenerateNarrative = () => {
    // Validate required fields
    const missingFields: string[] = [];
    
    if (!observedIssue || observedIssue.trim() === '') {
      missingFields.push('observed issue');
    }
    
    if (!deviceLocation || deviceLocation.trim() === '' || deviceLocation === 'Unknown location') {
      missingFields.push('location');
    }
    
    if (!deviceType || deviceType.trim() === '') {
      missingFields.push('device type');
    }
    
    if (missingFields.length > 0) {
      toast.error(`Please provide: ${missingFields.join(', ')}`);
      return;
    }
    
    generateNarrative.mutate({
      deviceType,
      location: deviceLocation,
      observedIssue,
      testOutcome: 'FAIL',
      codeReference: codeReference || undefined,
    });
  };

  // Save & Add Another mode
  const [addAnother, setAddAnother] = useState(false);

  const resetForm = () => {
    setTitle("");
    setSeverity("major");
    setStatus("open");
    setSystemCategory(undefined);
    setObservedIssue("");
    setDescription("");
    setCorrectiveAction("");
    setCustomerExplanation("");
    setCodeReference("");
    setEstimatedCost("");
    setAiDraft(false);
  };

  // Create deficiency
  const createDeficiency = trpc.deficiency.create.useMutation({
    onSuccess: () => {
      if (addAnother) {
        toast.success('Deficiency saved — add another');
        resetForm();
        setAddAnother(false);
      } else {
        toast.success('Deficiency created');
        setLocation(`/tech/jobs/${jobId}`);
      }
    },
    onError: () => {
      toast.error('Failed to create deficiency');
    }
  });

  // Update deficiency
  const updateDeficiency = trpc.deficiency.update.useMutation({
    onSuccess: () => {
      toast.success('Deficiency updated');
      if (existingDef?.deficiency?.jobId) {
        setLocation(`/tech/jobs/${existingDef.deficiency.jobId}`);
      }
    },
    onError: () => {
      toast.error('Failed to update deficiency');
    }
  });

  const doSave = (andAnother = false) => {
    if (!title) {
      toast.error('Please enter a title');
      return;
    }
    setAddAnother(andAnother);

    if (isEditing) {
      updateDeficiency.mutate({
        id: deficiencyId!,
        title,
        severity: severity as any,
        status: status as any,
        observedIssue,
        description,
        correctiveAction,
        customerExplanation,
        codeReference,
        systemCategory: systemCategory as any,
        estimatedCost: estimatedCost !== "" ? parseFloat(estimatedCost) : undefined,
      });
    } else {
      createDeficiency.mutate({
        jobId: jobId!,
        deviceId,
        title,
        severity: severity as any,
        observedIssue,
        description,
        correctiveAction,
        customerExplanation,
        codeReference,
        aiGeneratedAt: aiDraft ? new Date() : undefined,
        systemCategory: systemCategory as any,
        estimatedCost: estimatedCost !== "" ? parseFloat(estimatedCost) : undefined,
      });
    }
  };

  const handleSave = () => doSave(false);

  const isSaving = createDeficiency.isPending || updateDeficiency.isPending;

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href={jobId ? `/tech/jobs/${jobId}` : isEditing && existingDef?.deficiency?.jobId ? `/tech/jobs/${existingDef.deficiency.jobId}` : "/tech/jobs"}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-bold text-lg">
            {isEditing ? 'Edit Deficiency' : 'New Deficiency'}
          </h1>
        </div>
      </header>

      <main className="container py-4 space-y-6">
        {/* Device Info */}
        {device && (
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <p className="text-sm">
                <span className="font-medium">{device.deviceType}</span>
                {device.location && <span className="text-muted-foreground"> - {device.location}</span>}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Basic Info */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Brief description of the issue"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Quick severity buttons — large tap targets */}
          <div className="space-y-2">
            <Label>Severity</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["critical", "major", "minor", "observation"] as const).map(level => {
                const colors: Record<string, string> = {
                  critical: "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
                  major: "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
                  minor: "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
                  observation: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
                };
                const selected = severity === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSeverity(level)}
                    className={`h-12 rounded-lg border-2 font-semibold text-sm capitalize transition-all ${
                      selected
                        ? `${colors[level]} ring-2 ring-offset-1 ring-current`
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="deferred">Deferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* System Category */}
          <div className="space-y-2">
            <Label>System Category</Label>
            <Select value={systemCategory || "auto"} onValueChange={(val) => setSystemCategory(val === "auto" ? undefined : val)}>
              <SelectTrigger>
                <SelectValue placeholder="Auto-detect from title/description" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect (recommended)</SelectItem>
                <SelectItem value="FIRE_ALARM">Fire Alarm</SelectItem>
                <SelectItem value="SMOKE_ALARM">Smoke Alarm</SelectItem>
                <SelectItem value="FIRE_EXTINGUISHER">Fire Extinguisher</SelectItem>
                <SelectItem value="EMERGENCY_LIGHTING">Emergency Lighting</SelectItem>
                <SelectItem value="SPRINKLER">Sprinkler</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leave as "Auto-detect" to categorize based on keywords in title and description. Manual selection overrides auto-detection.
            </p>
          </div>
        </div>

        {/* Observed Issue */}
        <div className="space-y-2">
          <Label htmlFor="observedIssue">Observed Issue</Label>
          <Textarea
            id="observedIssue"
            placeholder="What did you observe during the test?"
            value={observedIssue}
            onChange={(e) => setObservedIssue(e.target.value)}
            className="min-h-[100px]"
          />
        </div>

        {/* AI Generate Button */}
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">AI Narrative Generator</p>
                  <p className="text-sm text-muted-foreground">
                    Generate description, corrective action & customer explanation
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleGenerateNarrative}
                disabled={generateNarrative.isPending || !observedIssue}
                size="sm"
              >
                {generateNarrative.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Generate'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Draft Notice */}
        {aiDraft && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
            <Sparkles className="h-4 w-4" />
            <span>AI-generated draft - please review and edit as needed</span>
          </div>
        )}

        {/* Generated Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Technical Description</Label>
            <Textarea
              id="description"
              placeholder="Detailed technical description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="correctiveAction">Corrective Action</Label>
            <Textarea
              id="correctiveAction"
              placeholder="Recommended corrective action..."
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerExplanation">Customer Explanation</Label>
            <Textarea
              id="customerExplanation"
              placeholder="Non-technical explanation for customer..."
              value={customerExplanation}
              onChange={(e) => setCustomerExplanation(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codeReference">Code Reference (Optional)</Label>
            <Input
              id="codeReference"
              placeholder="e.g., NFPA 72 Section 14.4.5"
              value={codeReference}
              onChange={(e) => setCodeReference(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedCost">Estimated Repair Cost (Optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="estimatedCost"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">Estimated cost to repair this deficiency (appears on reports).</p>
          </div>
        </div>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 safe-bottom">
        <div className="container space-y-2">
          {!isEditing && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => doSave(true)}
              disabled={isSaving || !title}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save &amp; Add Another
            </Button>
          )}
          <Button
            className="w-full action-btn"
            onClick={handleSave}
            disabled={isSaving || !title}
          >
            {isSaving ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Save className="h-5 w-5 mr-2" />
            )}
            {isSaving ? 'Saving...' : (isEditing ? 'Update Deficiency' : 'Save Deficiency')}
          </Button>
        </div>
      </div>
    </div>
  );
}
