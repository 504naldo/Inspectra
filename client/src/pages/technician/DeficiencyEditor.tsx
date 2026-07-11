import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Sparkles,
  Save,
  Loader2,
  CheckCircle2,
  Wand2,
  AlertTriangle,
  WifiOff,
  Camera,
  ImagePlus,
  X,
  Eye,
  EyeOff,
  ScanEye,
} from "lucide-react";
import { PageHelpButton } from "@/components/help/PageHelpButton";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
// Two distinct offline stores by design: useOfflineStorage (localStorage) holds the
// small structured deficiency record; offlineStorage (IndexedDB) holds photo blobs,
// which are too large for localStorage's quota.
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { offlineStorage } from "@/lib/offlineStorage";
import { useTrackInspectionProgress } from "@/hooks/useInspectionProgress";
import { ImageLightbox } from "@/components/ImageLightbox";

type PendingPhoto = {
  file: File;
  localUrl: string;
  caption: string;
  locationNote: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Shared by the online (immediate upload) and offline (IndexedDB queue) save paths —
// both need to base64-encode each pending photo and hand it off, tolerating per-photo failures
async function processPendingPhotos(
  photos: PendingPhoto[],
  handOff: (base64: string, photo: PendingPhoto) => Promise<unknown>,
  failureMessage: (fileName: string) => string,
) {
  for (const p of photos) {
    try {
      const base64 = await readFileAsBase64(p.file);
      await handOff(base64, p);
    } catch {
      toast.error(failureMessage(p.file.name));
    }
  }
}

type DraftResult = {
  suggestedTitle: string;
  suggestedSeverity: string;
  systemCategory: string;
  professionalDescription: string;
  customerExplanation: string;
  correctiveAction: string;
  internalNotes: string;
  confidence: string;
  warnings: string[];
};

type ImproveResult = {
  improvedTitle: string;
  improvedDescription: string;
  improvedObservedIssue: string;
  improvedCorrectiveAction: string;
  improvedCustomerExplanation: string;
  warnings: string[];
};

type PhotoAnalysisResult = {
  visualFindings: string[];
  suggestedObservedIssue: string;
  suggestedTitle: string;
  suggestedSeverity: string;
  confidence: string;
  warnings: string[];
};

interface DeficiencyEditorProps {
  deficiencyId?: number;
  jobId?: number;
}

export default function DeficiencyEditor({ deficiencyId, jobId }: DeficiencyEditorProps) {
  const [location, setLocation] = useLocation();
  const isOnline = useOnlineStatus();
  const { saveOfflineDeficiency } = useOfflineStorage();
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

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
  const [improveOpen, setImproveOpen] = useState(false);
  const [improveResult, setImproveResult] = useState<ImproveResult | null>(null);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<PhotoAnalysisResult | null>(null);

  // Existing AI narrative generator (requires device)
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

  // Draft from raw field notes (no device required)
  const draftFromNotes = trpc.aiAssistant.draftDeficiencyFromNotes.useMutation({
    onSuccess: (d) => { setDraftResult(d as DraftResult); },
    onError: (e) => toast.error(e.message || "Draft failed"),
  });

  // Improve existing deficiency wording
  const improveText = trpc.aiAssistant.improveDeficiencyText.useMutation({
    onSuccess: (d) => { setImproveResult(d as ImproveResult); },
    onError: (e) => toast.error(e.message || "Improve failed"),
  });

  // Vision-based photo analysis
  const analyzePhoto = trpc.aiAssistant.analyzeDeficiencyPhoto.useMutation({
    onSuccess: (d) => { setAnalyzeResult(d as PhotoAnalysisResult); },
    onError: (e) => toast.error(e.message || "Photo analysis failed"),
  });

  function handleAnalyzePhoto(photoUrl: string) {
    setAnalyzeResult(null);
    setAnalyzeOpen(true);
    analyzePhoto.mutate({
      photoUrl,
      deviceType: deviceType || undefined,
      location: deviceLocation || undefined,
      systemCategory: systemCategory || undefined,
    });
  }

  function applyPhotoAnalysis(d: PhotoAnalysisResult) {
    if (d.suggestedObservedIssue) setObservedIssue(d.suggestedObservedIssue);
    if (d.suggestedTitle && !title.trim()) setTitle(d.suggestedTitle);
    if (d.suggestedSeverity && d.suggestedSeverity !== "unclear") setSeverity(d.suggestedSeverity);
    setAiDraft(true);
    setAnalyzeOpen(false);
    toast.success("AI photo analysis applied — review before saving");
  }

  function applyDraft(d: DraftResult) {
    if (d.suggestedTitle) setTitle(d.suggestedTitle);
    if (d.suggestedSeverity) setSeverity(d.suggestedSeverity);
    if (d.systemCategory && d.systemCategory !== "OTHER") setSystemCategory(d.systemCategory);
    if (d.professionalDescription) setDescription(d.professionalDescription);
    if (d.correctiveAction) setCorrectiveAction(d.correctiveAction);
    if (d.customerExplanation) setCustomerExplanation(d.customerExplanation);
    setAiDraft(true);
    setDraftOpen(false);
    toast.success("AI draft applied — review before saving");
  }

  function applyImprove(d: ImproveResult) {
    if (d.improvedTitle) setTitle(d.improvedTitle);
    if (d.improvedDescription) setDescription(d.improvedDescription);
    if (d.improvedObservedIssue) setObservedIssue(d.improvedObservedIssue);
    if (d.improvedCorrectiveAction) setCorrectiveAction(d.improvedCorrectiveAction);
    if (d.improvedCustomerExplanation) setCustomerExplanation(d.improvedCustomerExplanation);
    setAiDraft(true);
    setImproveOpen(false);
    toast.success("AI improvements applied — review before saving");
  }

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

  // Photo capture
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: existingPhotos = [], refetch: refetchPhotos } = trpc.media.listDeficiencyMedia.useQuery(
    { deficiencyId: deficiencyId! },
    { enabled: isEditing }
  );

  const uploadMediaMut = trpc.media.uploadDeficiencyMedia.useMutation({
    onSuccess: () => { refetchPhotos(); },
    onError: (e) => toast.error(e.message || "Photo upload failed"),
  });

  const deleteMediaMut = trpc.media.deleteDeficiencyMedia.useMutation({
    onSuccess: () => { refetchPhotos(); toast.success("Photo removed"); },
    onError: (e) => toast.error(e.message || "Failed to remove photo"),
  });

  const updateMediaMut = trpc.media.updateDeficiencyMedia.useMutation({
    onSuccess: () => refetchPhotos(),
    onError: (e) => toast.error(e.message || "Failed to update photo"),
  });

  function handlePhotoFiles(files: FileList | null) {
    if (!files) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    Array.from(files).forEach((file) => {
      if (!allowed.includes(file.type)) {
        toast.error(`${file.name}: only JPEG, PNG, and WebP photos are supported`);
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`${file.name}: file exceeds 15 MB limit`);
        return;
      }
      if (isEditing) {
        // Edit mode: upload immediately
        uploadPhotoNow(file);
      } else {
        // Create mode: queue for upload after save
        const localUrl = URL.createObjectURL(file);
        setPendingPhotos((prev) => [...prev, { file, localUrl, caption: "", locationNote: "" }]);
      }
    });
  }

  async function uploadPhotoNow(file: File, defId?: number) {
    const targetId = defId ?? deficiencyId!;
    try {
      const base64 = await readFileAsBase64(file);
      await uploadMediaMut.mutateAsync({
        deficiencyId: targetId,
        fileName: file.name,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        fileSize: file.size,
        fileData: base64,
      });
    } catch {
      // error handled by mutation onError
    }
  }

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
    onSuccess: async (newDef) => {
      // Upload any pending photos after the deficiency is created
      if (pendingPhotos.length > 0 && isOnline) {
        setIsUploadingPhotos(true);
        await processPendingPhotos(
          pendingPhotos,
          (base64, p) => uploadMediaMut.mutateAsync({
            deficiencyId: newDef.id,
            fileName: p.file.name,
            mimeType: p.file.type as "image/jpeg" | "image/png" | "image/webp",
            fileSize: p.file.size,
            fileData: base64,
            caption: p.caption || undefined,
            locationNote: p.locationNote || undefined,
          }),
          (fileName) => `Photo "${fileName}" failed to upload`,
        );
        setIsUploadingPhotos(false);
        setPendingPhotos([]);
      }
      if (addAnother) {
        toast.success('Deficiency saved — add another');
        resetForm();
        setPendingPhotos([]);
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

  const [isSavingOffline, setIsSavingOffline] = useState(false);

  // Queue a brand-new deficiency (and any attached photos) for sync once back online
  const saveDeficiencyOffline = async (andAnother: boolean) => {
    setIsSavingOffline(true);
    try {
      const localId = `def-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      saveOfflineDeficiency({
        localId,
        jobId: jobId!,
        deviceId,
        title,
        severity: severity as any,
        description: description || undefined,
        observedIssue: observedIssue || undefined,
        correctiveAction: correctiveAction || undefined,
        customerExplanation: customerExplanation || undefined,
        codeReference: codeReference || undefined,
        systemCategory: systemCategory as any,
        estimatedCost: estimatedCost !== "" ? parseFloat(estimatedCost) : undefined,
        synced: false,
      });

      await processPendingPhotos(
        pendingPhotos,
        (base64, p) => offlineStorage.savePendingPhoto({
          deficiencyLocalId: localId,
          fileName: p.file.name,
          mimeType: p.file.type as "image/jpeg" | "image/png" | "image/webp",
          fileSize: p.file.size,
          fileData: base64,
          caption: p.caption || undefined,
          locationNote: p.locationNote || undefined,
        }),
        (fileName) => `Photo "${fileName}" could not be queued for upload`,
      );
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.localUrl));
      setPendingPhotos([]);

      if (andAnother) {
        toast.success('Deficiency saved offline — add another');
        resetForm();
        setAddAnother(false);
      } else {
        toast.success('Deficiency saved offline — will sync when you\'re back online');
        setLocation(`/tech/jobs/${jobId}`);
      }
    } finally {
      setIsSavingOffline(false);
    }
  };

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
    } else if (!isOnline) {
      void saveDeficiencyOffline(andAnother);
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

  const isSaving = createDeficiency.isPending || updateDeficiency.isPending || isSavingOffline;

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href={jobId ? `/tech/jobs/${jobId}` : isEditing && existingDef?.deficiency?.jobId ? `/tech/jobs/${existingDef.deficiency.jobId}` : "/tech/jobs"}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-bold text-lg flex-1">
            {isEditing ? 'Edit Deficiency' : 'New Deficiency'}
          </h1>
          <PageHelpButton size="icon" routeKey="tech_deficiency_editor" />
        </div>
      </header>

      <main className="container py-4 space-y-6">
        {/* Offline warning */}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0" />
            {isEditing
              ? "You are offline. Connect to the internet to update this deficiency."
              : "You are offline. This deficiency (and any photos) will be saved on this device and synced automatically when you're back online."}
          </div>
        )}

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

        {/* AI helpers */}
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="font-medium text-sm">AI Helpers</p>
            </div>
            <p className="text-xs text-muted-foreground">AI suggestions are drafts. Review before saving.</p>
            <div className="flex flex-col gap-2">
              {/* Existing: narrative from observed issue + device */}
              <Button
                variant="outline"
                className="justify-start gap-2 h-10"
                onClick={handleGenerateNarrative}
                disabled={generateNarrative.isPending || !observedIssue}
              >
                {generateNarrative.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Narrative
                <span className="text-xs text-muted-foreground ml-auto">(needs observed issue + device)</span>
              </Button>
              {/* New: draft from raw notes */}
              <Button
                variant="outline"
                className="justify-start gap-2 h-10"
                onClick={() => { setDraftNotes(observedIssue); setDraftResult(null); setDraftOpen(true); }}
                disabled={draftFromNotes.isPending}
              >
                <Wand2 className="h-4 w-4" />
                Draft from Notes
                <span className="text-xs text-muted-foreground ml-auto">(works without device)</span>
              </Button>
              {/* Edit mode: improve wording */}
              {isEditing && deficiencyId && (
                <Button
                  variant="outline"
                  className="justify-start gap-2 h-10"
                  onClick={() => { setImproveResult(null); setImproveOpen(true); improveText.mutate({ deficiencyId: deficiencyId!, currentTitle: title, currentDescription: description || undefined, currentObservedIssue: observedIssue || undefined, currentCorrectiveAction: correctiveAction || undefined, currentCustomerExplanation: customerExplanation || undefined }); }}
                  disabled={improveText.isPending || !title}
                >
                  {improveText.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Improve Wording
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {aiDraft && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
            <Sparkles className="h-4 w-4" />
            <span>AI-generated draft — review and edit as needed</span>
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

        {/* Photos */}
        <div className="space-y-3">
          <Label>Photos</Label>

          {!isOnline && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
              <WifiOff className="h-4 w-4 shrink-0" />
              {isEditing
                ? "Photo upload requires a connection. Photos will not be saved while offline."
                : "You're offline — photos will be queued on this device and uploaded automatically once you're back online."}
            </div>
          )}

          {/* Existing photos — edit mode */}
          {isEditing && existingPhotos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {existingPhotos.map((photo) => (
                <div key={photo.id} className="rounded-lg border overflow-hidden bg-muted/30">
                  <div className="relative">
                    <img
                      src={photo.fileUrl}
                      alt={photo.caption || photo.fileName}
                      className="w-full h-32 object-cover cursor-pointer"
                      onClick={() => setLightboxUrl(photo.fileUrl)}
                    />
                    <div className="absolute top-1 right-1 flex gap-1">
                      {photo.isCustomerFacing ? (
                        <span className="bg-green-600 text-white text-[10px] rounded px-1 py-0.5">Customer</span>
                      ) : (
                        <span className="bg-gray-600 text-white text-[10px] rounded px-1 py-0.5">Internal</span>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteMediaMut.mutate({ id: photo.id })}
                        className="bg-black/60 rounded p-0.5"
                        disabled={deleteMediaMut.isPending}
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  </div>
                  <div className="px-1.5 pt-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-full text-xs gap-1.5"
                      disabled={!isOnline}
                      title={!isOnline ? "AI requires an internet connection" : undefined}
                      onClick={() => handleAnalyzePhoto(photo.fileUrl)}
                    >
                      <ScanEye className="h-3.5 w-3.5" /> Analyze with AI
                    </Button>
                  </div>
                  <div className="p-1.5 space-y-1">
                    <Input
                      placeholder="Caption (optional)"
                      className="h-7 text-xs"
                      defaultValue={photo.caption ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (photo.caption ?? "")) {
                          updateMediaMut.mutate({ id: photo.id, caption: e.target.value || null });
                        }
                      }}
                    />
                    <Input
                      placeholder="Location note (optional)"
                      className="h-7 text-xs"
                      defaultValue={photo.locationNote ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (photo.locationNote ?? "")) {
                          updateMediaMut.mutate({ id: photo.id, locationNote: e.target.value || null });
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending photos — create mode */}
          {pendingPhotos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {pendingPhotos.map((p, i) => (
                <div key={i} className="rounded-lg border overflow-hidden bg-muted/30">
                  <div className="relative">
                    <img src={p.localUrl} alt="Pending" className="w-full h-32 object-cover" />
                    <div className="absolute top-1 right-1">
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(p.localUrl);
                          setPendingPhotos((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="bg-black/60 rounded p-0.5"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                    <div className="absolute bottom-1 left-1">
                      <span className="bg-amber-500 text-white text-[10px] rounded px-1 py-0.5">Queued</span>
                    </div>
                  </div>
                  <div className="p-1.5 space-y-1">
                    <Input
                      placeholder="Caption (optional)"
                      className="h-7 text-xs"
                      value={p.caption}
                      onChange={(e) => setPendingPhotos((prev) => prev.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))}
                    />
                    <Input
                      placeholder="Location note (optional)"
                      className="h-7 text-xs"
                      value={p.locationNote}
                      onChange={(e) => setPendingPhotos((prev) => prev.map((x, j) => j === i ? { ...x, locationNote: e.target.value } : x))}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isEditing && pendingPhotos.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {isOnline
                ? "Photos will upload automatically when you save this deficiency."
                : "Photos will be queued on this device and uploaded once you're back online."}
            </p>
          )}

          {/* Upload buttons — capture works offline in create mode (queued for later upload) */}
          {(isOnline || !isEditing) && (
            <div className="grid grid-cols-2 gap-2">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(e) => handlePhotoFiles(e.target.files)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handlePhotoFiles(e.target.files)}
              />
              <Button
                variant="outline"
                className="h-12 gap-2"
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isUploadingPhotos || uploadMediaMut.isPending}
              >
                {(isUploadingPhotos || uploadMediaMut.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Camera
              </Button>
              <Button
                variant="outline"
                className="h-12 gap-2"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhotos || uploadMediaMut.isPending}
              >
                <ImagePlus className="h-4 w-4" />
                Gallery
              </Button>
            </div>
          )}
        </div>
      </main>

      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* Draft from Notes dialog */}
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" /> Draft from Field Notes
            </DialogTitle>
            <DialogDescription>AI suggestions are drafts. Review before saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="draftNotes">Field notes / raw observations</Label>
            <Textarea
              id="draftNotes"
              placeholder="Describe what you observed in your own words..."
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              className="min-h-[100px]"
            />
            <Button
              className="w-full"
              disabled={draftFromNotes.isPending || !draftNotes.trim()}
              onClick={() => draftFromNotes.mutate({
                rawTechnicianNotes: draftNotes,
                observedIssue: observedIssue || undefined,
                location: deviceLocation || undefined,
                systemCategory: systemCategory || undefined,
                severity: severity || undefined,
                jobId: jobId || undefined,
                deviceId: deviceId || undefined,
              })}
            >
              {draftFromNotes.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Generate Draft
            </Button>

            {draftResult && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Review AI output carefully before applying.
                </p>
                {draftResult.warnings.length > 0 && (
                  <div className="space-y-1">
                    {draftResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-muted-foreground">• {w}</p>
                    ))}
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Title:</span> {draftResult.suggestedTitle}</div>
                  <div><span className="font-medium">Severity:</span> {draftResult.suggestedSeverity} (confidence: {draftResult.confidence})</div>
                  <div><span className="font-medium">System:</span> {draftResult.systemCategory}</div>
                  <div className="border rounded p-2 bg-muted/30 text-xs">
                    <p className="font-medium mb-1">Description:</p>
                    <p>{draftResult.professionalDescription}</p>
                  </div>
                  <div className="border rounded p-2 bg-muted/30 text-xs">
                    <p className="font-medium mb-1">Corrective Action:</p>
                    <p>{draftResult.correctiveAction}</p>
                  </div>
                  <div className="border rounded p-2 bg-muted/30 text-xs">
                    <p className="font-medium mb-1">Customer Explanation:</p>
                    <p>{draftResult.customerExplanation}</p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => applyDraft(draftResult!)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Apply All Fields
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDraftOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Improve Wording dialog */}
      <Dialog open={improveOpen} onOpenChange={setImproveOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Improve Wording
            </DialogTitle>
            <DialogDescription>AI suggestions are drafts. Review before saving.</DialogDescription>
          </DialogHeader>
          {improveText.isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {improveResult && (
            <div className="space-y-3">
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Review AI output carefully before applying.
              </p>
              {improveResult.warnings.length > 0 && (
                <div className="space-y-1">
                  {improveResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-muted-foreground">• {w}</p>
                  ))}
                </div>
              )}
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Title:</span> {improveResult.improvedTitle}</div>
                <div className="border rounded p-2 bg-muted/30 text-xs">
                  <p className="font-medium mb-1">Description:</p>
                  <p>{improveResult.improvedDescription}</p>
                </div>
                <div className="border rounded p-2 bg-muted/30 text-xs">
                  <p className="font-medium mb-1">Corrective Action:</p>
                  <p>{improveResult.improvedCorrectiveAction}</p>
                </div>
                <div className="border rounded p-2 bg-muted/30 text-xs">
                  <p className="font-medium mb-1">Customer Explanation:</p>
                  <p>{improveResult.improvedCustomerExplanation}</p>
                </div>
              </div>
              <Button className="w-full" onClick={() => applyImprove(improveResult!)}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Apply Improvements
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setImproveOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analyze Photo dialog */}
      <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanEye className="h-4 w-4 text-primary" /> AI Photo Analysis
            </DialogTitle>
            <DialogDescription>The AI looks only at this photo. Verify against what you observed in person.</DialogDescription>
          </DialogHeader>
          {analyzePhoto.isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {analyzeResult && (
            <div className="space-y-3">
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Review AI output carefully before applying.
              </p>
              {analyzeResult.warnings.length > 0 && (
                <div className="space-y-1">
                  {analyzeResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-muted-foreground">• {w}</p>
                  ))}
                </div>
              )}
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Suggested title:</span> {analyzeResult.suggestedTitle}</div>
                <div><span className="font-medium">Suggested severity:</span> {analyzeResult.suggestedSeverity} (confidence: {analyzeResult.confidence})</div>
                {analyzeResult.visualFindings.length > 0 && (
                  <div className="border rounded p-2 bg-muted/30 text-xs">
                    <p className="font-medium mb-1">What the AI sees in the photo:</p>
                    <ul className="space-y-0.5">
                      {analyzeResult.visualFindings.map((f, i) => <li key={i}>• {f}</li>)}
                    </ul>
                  </div>
                )}
                <div className="border rounded p-2 bg-muted/30 text-xs">
                  <p className="font-medium mb-1">Suggested observed issue:</p>
                  <p>{analyzeResult.suggestedObservedIssue}</p>
                </div>
              </div>
              <Button className="w-full" onClick={() => applyPhotoAnalysis(analyzeResult!)}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Apply to Draft
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAnalyzeOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 safe-bottom z-40">
        <div className="container space-y-2">
          {!isEditing && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => doSave(true)}
              disabled={isSaving || !title || (isEditing && !isOnline)}
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
            disabled={isSaving || !title || (isEditing && !isOnline)}
          >
            {isSaving ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Save className="h-5 w-5 mr-2" />
            )}
            {isSaving
              ? 'Saving...'
              : isEditing
                ? 'Update Deficiency'
                : isOnline
                  ? 'Save Deficiency'
                  : 'Save Offline'}
          </Button>
        </div>
      </div>
    </div>
  );
}
