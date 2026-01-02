import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Save, CheckCircle, FileText, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface SprinklerITMProps {
  jobId: number;
}

export default function SprinklerITM({ jobId }: SprinklerITMProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("systems");
  const [inspectionId, setInspectionId] = useState<number | null>(null);
  
  // Get or create inspection
  const { data: existingInspection, isLoading: loadingInspection } = trpc.sprinkler.getInspectionByJobId.useQuery(
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
          <Link href={`/tech/jobs/${jobId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
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
          <Button>
            <CheckCircle className="h-4 w-4 mr-2" />
            Finalize
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
          <SystemsTab inspectionId={inspectionId} />
        </TabsContent>
        
        <TabsContent value="checklist">
          <ChecklistTab inspectionId={inspectionId} />
        </TabsContent>
        
        <TabsContent value="devices">
          <DevicesTab inspectionId={inspectionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// SYSTEMS TAB
// ============================================

function SystemsTab({ inspectionId }: { inspectionId: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sprinkler Systems Summary</CardTitle>
        <p className="text-sm text-muted-foreground">
          System details for up to 6 sprinkler systems
        </p>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-muted-foreground">
          Systems grid interface - Coming soon
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// CHECKLIST TAB
// ============================================

function ChecklistTab({ inspectionId }: { inspectionId: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inspection Checklist</CardTitle>
        <p className="text-sm text-muted-foreground">
          NFPA 25 compliance checklist with YES/NO/NA responses
        </p>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-muted-foreground">
          Checklist interface - Coming soon
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// DEVICES TAB
// ============================================

function DevicesTab({ inspectionId }: { inspectionId: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sprinkler Devices</CardTitle>
        <p className="text-sm text-muted-foreground">
          Device list with location (required), checks A-F, and remarks
        </p>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-muted-foreground">
          Devices table - Coming soon
        </div>
      </CardContent>
    </Card>
  );
}
