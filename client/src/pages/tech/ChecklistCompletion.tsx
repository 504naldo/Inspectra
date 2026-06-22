import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Check,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";

// Define checklist sections based on existing complianceChecklists.ts
interface ChecklistItem {
  id: string;
  description: string;
  status?: 'PASS' | 'DEFICIENT' | 'NA';
  comment?: string;
}

interface ChecklistSection {
  sectionNumber: string;
  sectionTitle: string;
  items: ChecklistItem[];
}

// Core 5 sections from complianceChecklists.ts
const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    sectionNumber: '22.1',
    sectionTitle: 'Control Unit or Transponder Inspection',
    items: [
      { id: 'A', description: 'Input circuit designations correctly identified in relation to connected field devices.' },
      { id: 'B', description: 'Output circuit designations correctly identified in relation to connected field devices.' },
      { id: 'C', description: 'Correct designations for common control functions and indicators.' },
      { id: 'D', description: 'Plug-in components and modules securely in place.' },
      { id: 'E', description: 'Plug-in cables securely in place.' },
      { id: 'F', description: 'Record the date, revision and version of firmware and software program.' },
      { id: 'G', description: 'Clean and free of dust and dirt.' },
      { id: 'H', description: 'Fuses in accordance with manufacturer\'s specification' },
      { id: 'I', description: 'Control unit or transponder lock functional' },
      { id: 'J', description: 'Termination points from wiring to field devices secure' },
    ],
  },
  {
    sectionNumber: '22.2',
    sectionTitle: 'Control Unit or Transponder Test',
    items: [
      { id: 'A', description: 'Power \'ON\' visual indicator operates.' },
      { id: 'B', description: 'Time and date indication corresponds with local time and date.' },
      { id: 'C', description: 'Common visual trouble signal operates.' },
      { id: 'D', description: 'Common audible trouble signal operates.' },
      { id: 'E', description: 'Trouble signal silence switch operates.' },
      { id: 'F', description: 'Main power supply failure trouble signal operates.' },
      { id: 'G', description: 'Trouble signal operates during positive and negative ground fault tests' },
      { id: 'H', description: 'Alert signal operates.' },
      { id: 'I', description: 'Alarm signal operates.' },
      { id: 'J', description: 'Automatic transfer from alert signal to alarm signal operates.' },
      { id: 'K', description: 'Manual transfer from alert signal to alarm signal operates.' },
      { id: 'L', description: 'Automatic transfer from alert signal to alarm signal cancel (acknowledge) feature operates on a two-stage system.' },
      { id: 'M', description: 'Alarm signal silence inhibit function operates.' },
      { id: 'N', description: 'Alarm signal manual silence operates.' },
      { id: 'O', description: 'Alarm signal silence visual indication operates.' },
      { id: 'P', description: 'Alarm signals when silenced, automatically reinitiate only upon subsequent alarm from another NBC required fire alarm zone.' },
      { id: 'Q', description: 'Duration of alarm signal prior to automatic silence.' },
      { id: 'R', description: 'Audible and visual alert signals and alarm signals programmed and operate as per design and specification, or documentation as provided in Section 21.' },
      { id: 'S', description: 'Input circuit, alarm and supervisory operation, including audible and visual indication operates.' },
      { id: 'T', description: 'Input circuit supervision fault causes a trouble indication.' },
      { id: 'U', description: 'Output circuit alarm indicators operate.' },
      { id: 'V', description: 'Output circuit supervision fault causes a trouble indication.' },
      { id: 'W', description: 'Visual indicator test (lamp test) operates.' },
      { id: 'X', description: 'Coded signal sequences operate not less than the required number of times and the correct signal operates thereafter.' },
      { id: 'Y', description: 'Coded signal sequences are not interrupted by subsequent alarms.' },
      { id: 'Z', description: 'Ancillary device by-pass results in a trouble signal.' },
      { id: 'AA', description: 'Input circuit to output circuit operation, including ancillary device circuits, for correct program operation, as per design and specification, or documentation as detailed in D, Description of Fire Alarm System for Inspection and Test Procedures.' },
      { id: 'BB', description: 'System Reset operates.' },
      { id: 'CC', description: 'Main power supply to emergency power supply operates' },
      { id: 'DD', description: 'Smoke detector alarm verification (status change confirmation) verified (Refer to 14.4.3, Smoke Detector Alarm Verification (Status Change Confirmation)' },
    ],
  },
  {
    sectionNumber: '22.4',
    sectionTitle: 'Power Supply Inspection',
    items: [
      { id: 'A', description: 'Fuses in accordance with manufacturer\'s specification' },
      { id: 'B', description: 'Termination points secure' },
      { id: 'C', description: 'Plug-in components and modules securely in place' },
      { id: 'D', description: 'Plug-in cables securely in place' },
      { id: 'E', description: 'Clean and free of dust and dirt' },
      { id: 'F', description: 'Enclosure door lock functional' },
      { id: 'G', description: 'Enclosure door gasket in good condition' },
      { id: 'H', description: 'Enclosure door securely closed' },
    ],
  },
  {
    sectionNumber: '22.5',
    sectionTitle: 'Emergency Power Supply Test and Inspection',
    items: [
      { id: 'A', description: 'Batteries securely mounted' },
      { id: 'B', description: 'Battery terminals clean and free of corrosion' },
      { id: 'C', description: 'Battery connections secure' },
      { id: 'D', description: 'Battery voltage within manufacturer\'s specification' },
      { id: 'E', description: 'Battery charger operates' },
      { id: 'F', description: 'Battery discharge test performed' },
      { id: 'G', description: 'Battery capacity adequate for required duration' },
      { id: 'H', description: 'Automatic transfer to emergency power operates' },
    ],
  },
  {
    sectionNumber: '22.6',
    sectionTitle: 'Annunciator Test and Inspection',
    items: [
      { id: 'A', description: 'Annunciator visual indicators operate' },
      { id: 'B', description: 'Annunciator audible indicators operate' },
      { id: 'C', description: 'Annunciator trouble signals operate' },
      { id: 'D', description: 'Annunciator alarm signals operate' },
      { id: 'E', description: 'Annunciator supervisory signals operate' },
      { id: 'F', description: 'Annunciator silence switch operates' },
      { id: 'G', description: 'Annunciator reset switch operates' },
      { id: 'H', description: 'Annunciator lamp test operates' },
      { id: 'I', description: 'Annunciator zone identification correct' },
      { id: 'J', description: 'Annunciator enclosure secure' },
      { id: 'K', description: 'Annunciator clean and free of dust' },
      { id: 'L', description: 'Annunciator wiring secure' },
      { id: 'M', description: 'Annunciator communication with control unit operates' },
    ],
  },
  {
    sectionNumber: '22.7',
    sectionTitle: 'Circuit Supervision',
    items: [
      { id: 'A', description: 'Alarm initiating circuit supervision operates.' },
      { id: 'B', description: 'Supervisory initiating circuit supervision operates.' },
      { id: 'C', description: 'Trouble initiating circuit supervision operates.' },
      { id: 'D', description: 'Alarm signal circuit supervision operates.' },
      { id: 'E', description: 'Supervisory signal circuit supervision operates.' },
      { id: 'F', description: 'Ancillary device circuit supervision operates.' },
    ],
  },
  {
    sectionNumber: '22.8',
    sectionTitle: 'Smoke Detectors',
    items: [
      { id: 'A', description: 'Detector is clean and free of dust and dirt.' },
      { id: 'B', description: 'Detector is securely mounted.' },
      { id: 'C', description: 'Detector alarm operation confirmed.' },
      { id: 'D', description: 'Detector address/zone indication correct at control unit.' },
      { id: 'E', description: 'Detector sensitivity within manufacturer specification.' },
    ],
  },
  {
    sectionNumber: '22.9',
    sectionTitle: 'Heat Detectors',
    items: [
      { id: 'A', description: 'Detector is clean and free of dust and dirt.' },
      { id: 'B', description: 'Detector is securely mounted.' },
      { id: 'C', description: 'Detector alarm operation confirmed.' },
      { id: 'D', description: 'Detector address/zone indication correct at control unit.' },
    ],
  },
  {
    sectionNumber: '22.10',
    sectionTitle: 'Duct Detectors',
    items: [
      { id: 'A', description: 'Detector is clean and free of dust and dirt.' },
      { id: 'B', description: 'Detector is securely mounted.' },
      { id: 'C', description: 'Detector alarm operation confirmed.' },
      { id: 'D', description: 'Detector address/zone indication correct at control unit.' },
      { id: 'E', description: 'Ancillary device circuit operation confirmed.' },
      { id: 'F', description: 'Sampling tubes clean and unobstructed.' },
    ],
  },
  {
    sectionNumber: '22.11',
    sectionTitle: 'Manual Pull Stations',
    items: [
      { id: 'A', description: 'Station is clean and free of damage.' },
      { id: 'B', description: 'Station is securely mounted.' },
      { id: 'C', description: 'Station alarm operation confirmed.' },
      { id: 'D', description: 'Station address/zone indication correct at control unit.' },
      { id: 'E', description: 'Station operating instructions visible and legible.' },
    ],
  },
  {
    sectionNumber: '22.12',
    sectionTitle: 'Waterflow Devices',
    items: [
      { id: 'A', description: 'Device is clean and free of damage.' },
      { id: 'B', description: 'Device is securely mounted.' },
      { id: 'C', description: 'Device alarm operation confirmed.' },
      { id: 'D', description: 'Device address/zone indication correct at control unit.' },
      { id: 'E', description: 'Time delay setting verified.' },
    ],
  },
  {
    sectionNumber: '22.13',
    sectionTitle: 'Supervisory Devices',
    items: [
      { id: 'A', description: 'Device is clean and free of damage.' },
      { id: 'B', description: 'Device is securely mounted.' },
      { id: 'C', description: 'Device supervisory signal operation confirmed.' },
      { id: 'D', description: 'Device address/zone indication correct at control unit.' },
    ],
  },
  {
    sectionNumber: '22.14',
    sectionTitle: 'Interconnection to Fire Signal Receiving Centre',
    items: [
      { id: 'A', description: 'The fire signal receiving centre transmitter is integral to the fire alarm control unit.' },
      { id: 'B', description: 'Receipt of the alarm transmission to the fire signal receiving centre.' },
      { id: 'C', description: 'Receipt of the supervisory transmission to the fire signal receiving centre.' },
      { id: 'D', description: 'Receipt of the trouble transmission to the fire signal receiving centre.' },
      { id: 'E', description: 'Disabling or disconnecting the fire signal receiving centre transmitter results in a specific trouble signal at the control unit or transmitter and also transmits a trouble signal to the fire signal receiving centre.' },
      { id: 'F', description: 'Disabling or disconnecting the fire signal receiving centre transmitter transmits a trouble signal to the fire signal receiving centre.' },
      { id: 'G', description: 'Record the company name and telephone number of the fire signal receiving centre.' },
      { id: 'H', description: 'Operation of the fire signal receiving centre disconnect means transmits trouble to the fire signal receiving centre.' },
    ],
  },
  {
    sectionNumber: '22.15',
    sectionTitle: 'Audible Signaling Devices',
    items: [
      { id: 'A', description: 'Device is clean and free of damage.' },
      { id: 'B', description: 'Device is securely mounted.' },
      { id: 'C', description: 'Device audible signal operation confirmed.' },
      { id: 'D', description: 'Device sound level adequate for area.' },
      { id: 'E', description: 'Device operates on correct signal circuit.' },
    ],
  },
  {
    sectionNumber: '22.16',
    sectionTitle: 'Visual Signaling Devices',
    items: [
      { id: 'A', description: 'Device is clean and free of damage.' },
      { id: 'B', description: 'Device is securely mounted.' },
      { id: 'C', description: 'Device visual signal operation confirmed.' },
      { id: 'D', description: 'Device flash rate within specification.' },
      { id: 'E', description: 'Device operates on correct signal circuit.' },
    ],
  },
];

export default function ChecklistCompletion() {
  const params = useParams();
  const jobId = parseInt(params.id || '0');
  const [, setLocation] = useLocation();
  const isOnline = useOnlineStatus();
  
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['22.1']));
  const [responses, setResponses] = useState<Map<string, { status: 'PASS' | 'DEFICIENT' | 'NA'; comment?: string }>>(new Map());
  const [activeCommentItem, setActiveCommentItem] = useState<string | null>(null);
  const {
    getChecklistResponsesForJob,
    saveOfflineChecklistResponse,
    markChecklistResponsesSynced,
    clearSyncedChecklistResponses,
  } = useOfflineStorage();

  const { data: job } = trpc.job.get.useQuery({ id: jobId });
  const { data: savedResponses, refetch } = trpc.checklist.getByJob.useQuery({ jobId });
  
  const saveResponse = trpc.checklist.saveResponse.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    }
  });
  
  const bulkSave = trpc.checklist.bulkSaveResponses.useMutation({
    onSuccess: () => {
      toast.success('Checklist saved successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to save checklist: ${error.message}`);
    }
  });
  
  // Load saved responses into state, then overlay any unsynced offline edits for
  // this job — those haven't reached the server yet, so they take precedence.
  useEffect(() => {
    const newResponses = new Map<string, { status: 'PASS' | 'DEFICIENT' | 'NA'; comment?: string }>();
    savedResponses?.forEach((resp) => {
      const key = `${resp.sectionNumber}-${resp.itemId}`;
      newResponses.set(key, {
        status: resp.status,
        comment: resp.comment || undefined,
      });
    });
    getChecklistResponsesForJob(jobId)
      .filter((r) => !r.synced)
      .forEach((r) => {
        newResponses.set(`${r.sectionNumber}-${r.itemId}`, { status: r.status, comment: r.comment });
      });
    setResponses(newResponses);
  }, [savedResponses, jobId, getChecklistResponsesForJob]);
  
  const toggleSection = (sectionNumber: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionNumber)) {
      newExpanded.delete(sectionNumber);
    } else {
      newExpanded.add(sectionNumber);
    }
    setExpandedSections(newExpanded);
  };
  
  const saveItem = (sectionNumber: string, itemId: string, status: 'PASS' | 'DEFICIENT' | 'NA', comment?: string) => {
    const key = `${sectionNumber}-${itemId}`;
    const localId = `${jobId}-${key}`;
    if (isOnline) {
      saveResponse.mutate(
        { jobId, sectionNumber, itemId, status, comment },
        // Clears any stale offline copy of this item so a later sync can't overwrite
        // this fresher, already-saved value.
        { onSuccess: () => markChecklistResponsesSynced([localId]) }
      );
    } else {
      saveOfflineChecklistResponse({ localId, jobId, sectionNumber, itemId, status, comment, synced: false });
    }
  };

  const handleStatusChange = (sectionNumber: string, itemId: string, status: 'PASS' | 'DEFICIENT' | 'NA') => {
    const key = `${sectionNumber}-${itemId}`;
    const current = responses.get(key);
    const newResponse = { status, comment: current?.comment };
    setResponses(new Map(responses.set(key, newResponse)));

    saveItem(sectionNumber, itemId, status, current?.comment);

    // Show comment box if DEFICIENT or NA
    if (status === 'DEFICIENT' || status === 'NA') {
      setActiveCommentItem(key);
    }
  };

  const handleCommentChange = (sectionNumber: string, itemId: string, comment: string) => {
    const key = `${sectionNumber}-${itemId}`;
    const current = responses.get(key);
    if (current) {
      const newResponse = { ...current, comment };
      setResponses(new Map(responses.set(key, newResponse)));
    }
  };

  const handleCommentBlur = (sectionNumber: string, itemId: string) => {
    const key = `${sectionNumber}-${itemId}`;
    const current = responses.get(key);
    if (current) {
      saveItem(sectionNumber, itemId, current.status, current.comment);
    }
    setActiveCommentItem(null);
  };

  const handleSaveAll = () => {
    const responsesArray = Array.from(responses.entries()).map(([key, value]) => {
      const [sectionNumber, itemId] = key.split('-');
      return {
        jobId,
        sectionNumber,
        itemId,
        status: value.status,
        comment: value.comment,
      };
    });

    bulkSave.mutate({ responses: responsesArray }, {
      // The bulk save just pushed the canonical current state for every item in
      // `responses` (which already incorporates any offline edits) — clear them
      // all so a later sync doesn't replay stale local copies over this.
      onSuccess: () => {
        const localIds = getChecklistResponsesForJob(jobId).map((r) => r.localId);
        if (localIds.length > 0) {
          markChecklistResponsesSynced(localIds);
          clearSyncedChecklistResponses();
        }
      },
    });
  };
  
  const getTotalItems = () => {
    return CHECKLIST_SECTIONS.reduce((sum, section) => sum + section.items.length, 0);
  };
  
  const getCompletedItems = () => {
    return responses.size;
  };
  
  const getSectionCompletedItems = (section: ChecklistSection) => {
    return section.items.filter(item => {
      const key = `${section.sectionNumber}-${item.id}`;
      return responses.has(key);
    }).length;
  };
  
  const isSectionComplete = (section: ChecklistSection) => {
    return getSectionCompletedItems(section) === section.items.length;
  };
  
  const isChecklistComplete = () => {
    return getCompletedItems() === getTotalItems();
  };
  
  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  const completionPercentage = Math.round((getCompletedItems() / getTotalItems()) * 100);
  
  return (
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Offline warning */}
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          You are offline. Selections are saved locally but will not be uploaded until you reconnect and use Save All.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CAN/ULC-S536 Checklist</h1>
          <p className="text-muted-foreground mt-1">
            {job.title} - {job.jobNumber}
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation(`/tech/jobs/${jobId}`)}>
          Back to Job
        </Button>
      </div>
      
      {/* Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle>Checklist Progress</CardTitle>
          <CardDescription>
            Complete all {getTotalItems()} checklist items before generating the Annual Inspection Report
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isChecklistComplete() ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              <span className="font-medium">
                {getCompletedItems()} of {getTotalItems()} items completed ({completionPercentage}%)
              </span>
            </div>
            <Button
              onClick={handleSaveAll}
              disabled={bulkSave.isPending || responses.size === 0 || !isOnline}
              title={!isOnline ? "Connect to the internet to save" : undefined}
            >
              {bulkSave.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save All'
              )}
            </Button>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          
          {!isChecklistComplete() && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Checklist Incomplete</p>
                <p>Complete all checklist items to generate the Annual Inspection Report.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Checklist Sections */}
      <div className="space-y-4">
        {CHECKLIST_SECTIONS.map((section) => {
          const isExpanded = expandedSections.has(section.sectionNumber);
          const sectionComplete = isSectionComplete(section);
          const sectionProgress = getSectionCompletedItems(section);
          
          return (
            <Card key={section.sectionNumber}>
              <CardHeader 
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSection(section.sectionNumber)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="text-lg">
                        Section {section.sectionNumber}: {section.sectionTitle}
                      </CardTitle>
                      <CardDescription>
                        {sectionProgress} of {section.items.length} items completed
                      </CardDescription>
                    </div>
                  </div>
                  {sectionComplete && (
                    <div className="flex items-center gap-2 text-green-600">
                      <Check className="h-5 w-5" />
                      <span className="text-sm font-medium">Complete</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="space-y-4 pt-0">
                  {section.items.map((item) => {
                    const key = `${section.sectionNumber}-${item.id}`;
                    const response = responses.get(key);
                    const showComment = activeCommentItem === key || (response && (response.status === 'DEFICIENT' || response.status === 'NA'));
                    
                    return (
                      <div key={item.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <span className="font-mono text-sm text-muted-foreground mt-1 min-w-[2rem]">
                            {item.id}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm">{item.description}</p>
                          </div>
                        </div>
                        
                        {/* Status Buttons */}
                        <div className="flex items-center gap-2 ml-11">
                          <Button
                            size="sm"
                            variant={response?.status === 'PASS' ? 'default' : 'outline'}
                            className={response?.status === 'PASS' ? 'bg-green-600 hover:bg-green-700' : ''}
                            onClick={() => handleStatusChange(section.sectionNumber, item.id, 'PASS')}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Pass
                          </Button>
                          <Button
                            size="sm"
                            variant={response?.status === 'DEFICIENT' ? 'default' : 'outline'}
                            className={response?.status === 'DEFICIENT' ? 'bg-red-600 hover:bg-red-700' : ''}
                            onClick={() => handleStatusChange(section.sectionNumber, item.id, 'DEFICIENT')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Deficient
                          </Button>
                          <Button
                            size="sm"
                            variant={response?.status === 'NA' ? 'default' : 'outline'}
                            className={response?.status === 'NA' ? 'bg-gray-600 hover:bg-gray-700' : ''}
                            onClick={() => handleStatusChange(section.sectionNumber, item.id, 'NA')}
                          >
                            <MinusCircle className="h-4 w-4 mr-1" />
                            N/A
                          </Button>
                        </div>
                        
                        {/* Comment Box */}
                        {showComment && (
                          <div className="ml-11">
                            <Textarea
                              placeholder="Add comment (required for Deficient or N/A)"
                              value={response?.comment || ''}
                              onChange={(e) => handleCommentChange(section.sectionNumber, item.id, e.target.value)}
                              onBlur={() => handleCommentBlur(section.sectionNumber, item.id)}
                              className="min-h-[80px]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
