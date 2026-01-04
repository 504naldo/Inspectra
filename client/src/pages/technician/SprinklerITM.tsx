import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Save, CheckCircle, FileText, Loader2 } from "lucide-react";
import { Link } from "wouter";
import SystemsTab from "@/components/sprinkler/SystemsTab";
import ChecklistTab from "@/components/sprinkler/ChecklistTab";
import DevicesTab from "@/components/sprinkler/DevicesTab";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";

interface SprinklerITMProps {
  jobId: number;
}

export default function SprinklerITM({ jobId }: SprinklerITMProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("systems");
  const [inspectionId, setInspectionId] = useState<number | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const { hasUnsavedChanges, markAsChanged, markAsSaved } = useUnsavedChanges();
  
  // Get or create inspection
  const { data: existingInspection, isLoading: loadingInspection, refetch } = trpc.sprinkler.getInspectionByJobId.useQuery(
    { jobId },
    { enabled: !!jobId }
  );
  
  const createInspection = trpc.sprinkler.createInspection.useMutation({
    onSuccess: (data) => {
      setInspectionId(data.insertId);
      toast.success("Sprinkler ITM inspection created");
    },
    onError: () => {
      toast.error("Failed to create inspection");
    }
  });

  const finalizeInspection = trpc.sprinkler.finalizeInspection.useMutation({
    onSuccess: () => {
      toast.success("Inspection finalized successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Validation failed. Please check all required fields.");
    }
  });

  const handleFinalize = () => {
    if (!inspectionId) return;
    if (window.confirm("Are you sure you want to finalize this inspection? This will lock all data and cannot be undone.")) {
      finalizeInspection.mutate({ id: inspectionId });
    }
  };
  
  useEffect(() => {
    if (existingInspection) {
      setInspectionId(existingInspection.id);
    } else if (!loadingInspection && !existingInspection && !inspectionId) {
      // Create new inspection
      createInspection.mutate({
        jobId,
        inspectionDate: new Date(),
      });
    }
  }, [existingInspection, loadingInspection, jobId, inspectionId]);
  
  if (loadingInspection || !inspectionId) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="container py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => {
              if (hasUnsavedChanges && existingInspection?.status !== 'finalized') {
                setPendingNavigation('/tech/jobs');
                setShowUnsavedDialog(true);
              } else {
                setLocation('/tech/jobs');
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            My Jobs
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Sprinkler ITM Inspection</h1>
            <p className="text-muted-foreground">NFPA 25 / Vancouver Fire By-law Compliance</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={existingInspection?.status === 'finalized' || finalizeInspection.isPending}
            variant={existingInspection?.status === 'finalized' ? 'outline' : 'default'}
          >
            {finalizeInspection.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            {existingInspection?.status === 'finalized' ? 'Finalized' : 'Finalize Inspection'}
          </Button>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="systems">Systems</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
        </TabsList>
        
        <TabsContent value="systems">
          <SystemsTab inspectionId={inspectionId} isFinalized={existingInspection?.status === 'finalized'} />
        </TabsContent>
        
        <TabsContent value="checklist">
          <ChecklistTab inspectionId={inspectionId} isFinalized={existingInspection?.status === 'finalized'} />
        </TabsContent>
        
        <TabsContent value="devices">
          <DevicesTab inspectionId={inspectionId} isFinalized={existingInspection?.status === 'finalized'} />
        </TabsContent>
      </Tabs>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onSaveAndExit={() => {
          // Save logic would go here
          markAsSaved();
          if (pendingNavigation) {
            setLocation(pendingNavigation);
          }
        }}
        onExitWithoutSaving={() => {
          markAsSaved();
          if (pendingNavigation) {
            setLocation(pendingNavigation);
          }
        }}
      />
    </div>
  );
}

// ============================================
// SYSTEMS TAB
// ============================================



// ============================================
// CHECKLIST TAB
// ============================================



// ============================================
// DEVICES TAB
// ============================================


