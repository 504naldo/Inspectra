import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useState, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { toast } from "sonner";
import { isSpreadsheetFile, getSpreadsheetErrorMessage, getSpreadsheetAcceptAttribute } from "@/_core/utils/fileTypes";
import { autoMapColumns } from "@/_core/utils/autoMapping";
import { friendlyErrorMessage } from "@/lib/utils";
import { DriveFilePicker } from "@/components/DriveFilePicker";
import { HardDrive } from "lucide-react";

type ImportStep = 'selectType' | 'upload' | 'mapping' | 'preview' | 'importing' | 'results';

type ImportType = 'site' | 'fireAlarmDevices' | 'fireExtinguishers' | 'emergencyLights' | 'sprinklerDevices' | 'smokeAlarms';

interface ColumnMapping {
  [targetField: string]: string;
}

interface ValidationResult {
  rowNumber: number;
  status: 'valid' | 'error' | 'duplicate' | 'skipped';
  errors: string[];
  warnings?: string[];
  data: Record<string, any>;
}

// Target fields for device import
const getFieldsForImportType = (importType: ImportType) => {
  if (importType === 'smokeAlarms') {
    return [
      { key: 'suiteNumber', label: 'Suite Number', required: true },
      { key: 'location', label: 'Location', required: false },
      { key: 'powerType', label: 'Power Type', required: false },
      { key: 'installDate', label: 'Install Date', required: false },
      { key: 'manufacturer', label: 'Manufacturer', required: false },
      { key: 'model', label: 'Model', required: false },
      { key: 'notes', label: 'Notes', required: false },
    ];
  }
  
  return [
    { key: 'deviceType', label: 'Device Type', required: true },
    { key: 'manufacturer', label: 'Manufacturer', required: false },
    { key: 'model', label: 'Model', required: false },
    { key: 'serialNumber', label: 'Serial Number', required: false },
    { key: 'location', label: 'Location', required: false },
    { key: 'barcode', label: 'Barcode', required: false },
    { key: 'notes', label: 'Notes', required: false },
  ];
};

export default function AssetImport() {
  const { user } = useAuth();
  const params = useParams<{ siteId: string }>();
  const [, navigate] = useLocation();
  const siteId = parseInt(params.siteId || "0");
  const companyId = user?.companyId || 1;
  
  const [step, setStep] = useState<ImportStep>('selectType');
  const [importType, setImportType] = useState<ImportType>('fireAlarmDevices');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>('');
  const [parsedData, setParsedData] = useState<{
    headers: string[];
    previewRows: any[][];
    totalRows: number;
    sheetName: string;
    sheetNames?: string[];
    suggestedSheetName?: string;
    autoMapping?: Record<string, string>;
    mappingStats?: { mapped: number; total: number };
  } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [duplicateHandling, setDuplicateHandling] = useState<'skip' | 'update' | 'create_new'>('skip');
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [validationSummary, setValidationSummary] = useState<{
    totalRows: number;
    validCount: number;
    errorCount: number;
    duplicateCount: number;
  } | null>(null);
  const [importResults, setImportResults] = useState<{
    importLogId: number;
    totalRows: number;
    successCount: number;
    errorCount: number;
    duplicateCount: number;
    skippedCount: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  // Mode toggle: 'quick' = one-shot all-categories, 'advanced' = per-category wizard
  const [mode, setMode] = useState<'quick' | 'advanced'>('quick');

  // Quick Import state
  const [quickSiteId, setQuickSiteId] = useState<string>(siteId > 0 ? siteId.toString() : '');
  const [quickFile, setQuickFile] = useState<File | null>(null);
  const [quickFileData, setQuickFileData] = useState<string>('');
  const [quickStep, setQuickStep] = useState<'upload' | 'importing' | 'results'>('upload');
  const [quickResults, setQuickResults] = useState<{
    success: boolean;
    siteFieldsUpdated: number;
    deviceCounts: { fireAlarm: number; extinguishers: number; emergencyLights: number; smokeAlarms: number; backflows: number; sprinklerSystems: number; sprinklerDevices: number; total: number };
    excludedRowsCount: number;
    message: string;
  } | null>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: site } = trpc.site.get.useQuery({ id: siteId }, { enabled: siteId > 0 });
  const { data: importHistory } = trpc.import.listBySite.useQuery({ siteId }, { enabled: siteId > 0 });
  const { data: allSites } = trpc.site.listByCompany.useQuery({ companyId }, { enabled: companyId > 0 });

  // File number — defaults from the site's buildingId once loaded
  const [fileNumber, setFileNumber] = useState("");
  // Keep in sync with site.buildingId when it first loads (only if user hasn't overridden it)
  const [fileNumberInitialised, setFileNumberInitialised] = useState(false);
  if (site?.buildingId && !fileNumberInitialised) {
    setFileNumber(site.buildingId);
    setFileNumberInitialised(true);
  }
  
  // Mutations
  const [parseError, setParseError] = useState<{
    message: string;
    fileName?: string;
    fileSize?: number;
    first16Bytes?: string;
    errorType?: string;
  } | null>(null);
  
  const parseFileMutation = trpc.import.parseFile.useMutation({
    onSuccess: (data) => {
      setParsedData(data);
      setSelectedSheet(data.sheetName); // Set to smart default
      
      // Use auto-mapping from backend
      if (data.autoMapping) {
        setColumnMapping(data.autoMapping);
      }
      
      setParseError(null);
      setStep('mapping');
    },
    onError: (error: any) => {
      // Extract error details from cause if available
      const details = error.data?.cause?.details || {};
      const errorMessage = friendlyErrorMessage(error, 'Failed to parse file');

      setParseError({
        message: errorMessage,
        fileName: details.fileName || selectedFile?.name,
        fileSize: details.byteSize || selectedFile?.size,
        first16Bytes: details.first16Bytes,
        errorType: details.errorType
      });
      
      toast.error(errorMessage, { duration: 5000 });
    },
  });
  
  const validateMutation = trpc.import.validate.useMutation({
    onSuccess: (data) => {
      setValidationResults(data.results);
      setValidationSummary({
        totalRows: data.totalRows,
        validCount: data.validCount,
        errorCount: data.errorCount,
        duplicateCount: data.duplicateCount,
      });
      setStep('preview');
    },
    onError: (error) => {
      toast.error(`Validation failed: ${friendlyErrorMessage(error, 'please contact support')}`);
    },
  });
  
  const executeMutation = trpc.import.execute.useMutation({
    onSuccess: (data) => {
      setImportResults(data);
      setStep('results');
      toast.success(`Import completed: ${data.successCount} devices imported`);
    },
    onError: (error) => {
      toast.error(`Import failed: ${friendlyErrorMessage(error, 'please contact support')}`);
    },
  });
  
  const importAllMutation = trpc.assetImport.importAllFromFile.useMutation({
    onSuccess: (data) => {
      setQuickResults(data);
      setQuickStep('results');
    },
    onError: (err) => {
      toast.error(friendlyErrorMessage(err, 'Import failed'));
      setQuickStep('upload');
    },
  });

  const handleQuickFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSpreadsheetFile(file)) { toast.error(getSpreadsheetErrorMessage()); return; }
    setQuickFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = btoa(
        new Uint8Array(event.target?.result as ArrayBuffer)
          .reduce((d, b) => d + String.fromCharCode(b), '')
      );
      setQuickFileData(base64);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleQuickImport = () => {
    if (!quickSiteId || !quickFileData || !quickFile) return;
    setQuickStep('importing');
    importAllMutation.mutate({ siteId: parseInt(quickSiteId), fileData: quickFileData, fileName: quickFile.name });
  };

  const resetQuickImport = () => {
    setQuickStep('upload');
    setQuickFile(null);
    setQuickFileData('');
    setQuickResults(null);
    if (quickFileInputRef.current) quickFileInputRef.current.value = '';
  };

  // Handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type using shared utility
    if (!isSpreadsheetFile(file)) {
      toast.error(getSpreadsheetErrorMessage());
      return;
    }
    
    setSelectedFile(file);
    
    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = btoa(
        new Uint8Array(event.target?.result as ArrayBuffer)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      setFileData(base64);
      
      // Parse the file
      parseFileMutation.mutate({
        fileName: file.name,
        fileData: base64,
        importType,
      });
    };
    reader.readAsArrayBuffer(file);
  };
  
  const handleValidate = () => {
    if (!fileData || !selectedFile) return;
    
    validateMutation.mutate({
      companyId,
      siteId,
      importType,
      fileName: selectedFile.name,
      fileData,
      sheetName: selectedSheet,
      columnMapping,
      duplicateHandling,
    });
  };
  
  const handleExecuteImport = () => {
    if (!fileData || !selectedFile) return;
    
    setStep('importing');
    
    executeMutation.mutate({
      companyId,
      siteId,
      importType,
      fileName: selectedFile.name,
      fileData,
      sheetName: selectedSheet,
      columnMapping,
      duplicateHandling,
    });
  };
  
  const resetImport = () => {
    setStep('upload');
    setSelectedFile(null);
    setFileData('');
    setParsedData(null);
    setColumnMapping({});
    setValidationResults([]);
    setValidationSummary(null);
    setImportResults(null);
  };
  
  const getMappedFieldCount = () => {
    return Object.values(columnMapping).filter(v => v).length;
  };
  
  const getRequiredFieldsMapped = () => {
    const fields = getFieldsForImportType(importType);
    return fields.filter(f => f.required).every(f => columnMapping[f.key]);
  };
  
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/admin/devices`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Import Assets</h1>
            <p className="text-muted-foreground">{site?.name || 'Loading...'}</p>
          </div>
          {/* File number — pre-filled from site's Building ID */}
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">File No.</Label>
            <Input
              value={fileNumber}
              onChange={(e) => setFileNumber(e.target.value)}
              placeholder="—"
              className="w-32 h-8 text-sm font-mono"
            />
          </div>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 rounded-lg bg-muted w-fit">
          <button
            onClick={() => setMode('quick')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'quick' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Zap className="h-4 w-4" />
            Quick Import
          </button>
          <button
            onClick={() => setMode('advanced')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'advanced' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Advanced
          </button>
        </div>

        {/* Quick Import Mode */}
        {mode === 'quick' && (
          <>
            {quickStep === 'upload' && (
              <Card>
                <CardHeader>
                  <CardTitle>Quick Import — All Device Types</CardTitle>
                  <CardDescription>
                    Select a site and drop your Excel workbook. All sheets are detected automatically — fire alarm devices (including sprinklers), extinguishers, emergency lights, smoke alarms, and backflows in one shot.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Site selector */}
                  <div className="space-y-2">
                    <Label>Site</Label>
                    <Select value={quickSiteId} onValueChange={setQuickSiteId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a site…" />
                      </SelectTrigger>
                      <SelectContent>
                        {allSites?.map((s: any) => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* File drop zone */}
                  <div
                    className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => quickFileInputRef.current?.click()}
                  >
                    {quickFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileSpreadsheet className="h-10 w-10 text-[var(--success)]" />
                        <p className="text-sm font-medium text-[var(--success)]">{quickFile.name}</p>
                        <p className="text-xs text-muted-foreground">Click to change file</p>
                      </div>
                    ) : (
                      <>
                        <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-base font-medium mb-1">Drop your Excel file here or click to browse</p>
                        <p className="text-sm text-muted-foreground">Supports CSV, XLS, XLSX, XLSM</p>
                      </>
                    )}
                    <input
                      ref={quickFileInputRef}
                      type="file"
                      className="hidden"
                      accept={getSpreadsheetAcceptAttribute()}
                      onChange={handleQuickFileSelect}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleQuickImport}
                      disabled={!quickSiteId || !quickFile || !quickFileData}
                      size="lg"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Import All Device Types
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {quickStep === 'importing' && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
                  <h3 className="text-lg font-medium mb-2">Importing…</h3>
                  <p className="text-muted-foreground">Detecting sheets and importing all device categories</p>
                </CardContent>
              </Card>
            )}

            {quickStep === 'results' && quickResults && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="py-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
                      <Check className="h-8 w-8 text-[var(--success)]" />
                    </div>
                    <h3 className="text-xl font-bold mb-1">Import Complete!</h3>
                    <p className="text-muted-foreground mb-6">{quickResults.message}</p>

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 max-w-2xl mx-auto mb-2">
                      {([
                        ['Fire Alarm', quickResults.deviceCounts.fireAlarm],
                        ['Extinguishers', quickResults.deviceCounts.extinguishers],
                        ['Emerg. Lights', quickResults.deviceCounts.emergencyLights],
                        ['Smoke Alarms', quickResults.deviceCounts.smokeAlarms],
                        ['Backflows', quickResults.deviceCounts.backflows],
                      ] as [string, number][]).map(([label, count]) => (
                        <div key={label} className="text-center">
                          <div className={`text-2xl font-bold ${count > 0 ? 'text-[var(--success)]' : 'text-muted-foreground'}`}>{count}</div>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm font-semibold mt-2">Total: {quickResults.deviceCounts.total} devices</p>
                    {quickResults.excludedRowsCount > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">{quickResults.excludedRowsCount} rows skipped (missing location)</p>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={resetQuickImport}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Import Another File
                  </Button>
                  <Link href={`/admin/devices${quickSiteId ? `?siteId=${quickSiteId}` : ''}`}>
                    <Button>
                      View Devices
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}

        {/* Advanced Mode — existing per-category wizard */}
        {mode === 'advanced' && (
        <>
        {/* Progress Steps */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              {['upload', 'mapping', 'preview', 'results'].map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`
                    flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                    ${step === s ? 'bg-primary text-primary-foreground' : 
                      ['upload', 'mapping', 'preview', 'importing', 'results'].indexOf(step) > i 
                        ? 'bg-[var(--success)] text-white'
                        : 'bg-muted text-muted-foreground'}
                  `}>
                    {['upload', 'mapping', 'preview', 'importing', 'results'].indexOf(step) > i ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`ml-2 text-sm ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
                    {s === 'upload' ? 'Upload File' : 
                     s === 'mapping' ? 'Map Columns' : 
                     s === 'preview' ? 'Preview & Validate' : 
                     'Results'}
                  </span>
                  {i < 3 && <ChevronRight className="h-4 w-4 mx-4 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Step Content */}
        {step === 'selectType' && (
          <Card>
            <CardHeader>
              <CardTitle>Select Import Type</CardTitle>
              <CardDescription>
                Choose what type of data you want to import from your Excel file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={importType} onValueChange={(value) => setImportType(value as ImportType)}>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="site" id="type-site" />
                    <div className="flex-1">
                      <Label htmlFor="type-site" className="font-medium cursor-pointer">
                        Import Site Info
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Update site name, address, city, and client information
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="fireAlarmDevices" id="type-fire-alarm" />
                    <div className="flex-1">
                      <Label htmlFor="type-fire-alarm" className="font-medium cursor-pointer">
                        Import Devices → Fire Alarm Devices
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Smoke detectors, heat detectors, pull stations, horns, strobes
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="fireExtinguishers" id="type-extinguishers" />
                    <div className="flex-1">
                      <Label htmlFor="type-extinguishers" className="font-medium cursor-pointer">
                        Import Devices → Fire Extinguishers
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        ABC, CO2, K-class, and other fire extinguishers
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="emergencyLights" id="type-emergency" />
                    <div className="flex-1">
                      <Label htmlFor="type-emergency" className="font-medium cursor-pointer">
                        Import Devices → Emergency Lights
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Battery units, exit signs, combo units
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="smokeAlarms" id="type-smoke-alarms" />
                    <div className="flex-1">
                      <Label htmlFor="type-smoke-alarms" className="font-medium cursor-pointer">
                        Import Devices → Smoke Alarms
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        In-suite smoke alarms with suite number, location, power type, and install date
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem value="sprinklerDevices" id="type-sprinkler" />
                    <div className="flex-1">
                      <Label htmlFor="type-sprinkler" className="font-medium cursor-pointer">
                        Import Devices → Sprinkler Devices
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Valves, switches, gauges, test connections
                      </p>
                    </div>
                  </div>
                </div>
              </RadioGroup>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => setStep('upload')}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload File</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file (.csv, .xls, .xlsx, .xlsm) containing your device data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Drop Zone */}
              <div
                className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-1">Drop your file here or click to browse</p>
                <p className="text-sm text-muted-foreground">
                  Supports CSV, XLS, XLSX, and XLSM files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={getSpreadsheetAcceptAttribute()}
                  onChange={handleFileSelect}
                />
              </div>

              {/* Drive import */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t" />
                <span className="text-sm text-muted-foreground">or</span>
                <div className="flex-1 border-t" />
              </div>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setShowDrivePicker(true)}
                  disabled={parseFileMutation.isPending}
                >
                  <HardDrive className="h-4 w-4 mr-2" />
                  Import from Google Drive
                </Button>
              </div>
              
              {parseFileMutation.isPending && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing file...
                </div>
              )}
              
              {parseError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-destructive mb-1">Parse Failed</h4>
                      <p className="text-sm text-muted-foreground mb-2">{parseError.message}</p>
                      
                      <div className="text-xs space-y-1 text-muted-foreground">
                        {parseError.fileName && (
                          <div><span className="font-medium">File:</span> {parseError.fileName}</div>
                        )}
                        {parseError.fileSize && (
                          <div><span className="font-medium">Size:</span> {(parseError.fileSize / 1024).toFixed(2)} KB</div>
                        )}
                        {parseError.errorType && (
                          <div><span className="font-medium">Error Type:</span> {parseError.errorType}</div>
                        )}
                      </div>
                      
                      <p className="text-xs text-muted-foreground mt-3">
                        💡 This usually happens if the upload is incomplete or the workbook is protected/corrupted.
                        Try re-uploading the file or saving it as a new Excel file.
                      </p>
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const debugInfo = [
                        `Error: ${parseError.message}`,
                        `File: ${parseError.fileName || 'unknown'}`,
                        `Size: ${parseError.fileSize ? (parseError.fileSize / 1024).toFixed(2) + ' KB' : 'unknown'}`,
                        parseError.first16Bytes ? `First 16 bytes: ${parseError.first16Bytes}` : '',
                        parseError.errorType ? `Error Type: ${parseError.errorType}` : ''
                      ].filter(Boolean).join('\n');
                      
                      navigator.clipboard.writeText(debugInfo);
                      toast.success('Debug info copied to clipboard');
                    }}
                  >
                    Copy Debug Info
                  </Button>
                </div>
              )}
              
              {/* Template Download */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Need a template?</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Download our template file with the correct column headers
                </p>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
              
              {/* Import History */}
              {importHistory && importHistory.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Recent Imports</h4>
                  <div className="space-y-2">
                    {importHistory.slice(0, 3).map((log) => (
                      <div key={log.id} className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                        <div>
                          <p className="font-medium text-sm">{log.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.createdAt).toLocaleDateString()} • {log.successCount} imported
                          </p>
                        </div>
                        <Badge variant={log.status === 'completed' ? 'default' : log.status === 'partial' ? 'secondary' : 'destructive'}>
                          {log.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {step === 'mapping' && parsedData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column Mapping */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Map Columns</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      Match your file columns to device fields
                      {parsedData.mappingStats && (
                        <Badge variant="secondary" className="ml-2">
                          Auto-mapped {parsedData.mappingStats.mapped}/{parsedData.mappingStats.total}
                        </Badge>
                      )}
                    </CardDescription>
                  </div>
                  {getMappedFieldCount() > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setColumnMapping({})}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Worksheet Selection */}
                {parsedData.sheetNames && parsedData.sheetNames.length > 1 && (
                  <div className="border-b pb-4 mb-4">
                    <Label htmlFor="worksheet-select" className="mb-2 block">
                      Worksheet
                    </Label>
                    <Select
                      value={selectedSheet}
                      onValueChange={(value) => {
                        setSelectedSheet(value);
                        // Re-parse with new sheet
                        parseFileMutation.mutate({
                          fileName: selectedFile?.name || '',
                          fileData,
                          importType,
                          sheetName: value,
                        });
                      }}
                    >
                      <SelectTrigger id="worksheet-select">
                        <SelectValue placeholder="Select worksheet..." />
                      </SelectTrigger>
                      <SelectContent>
                        {parsedData.sheetNames
                          .filter((sheet) => sheet.trim().length > 0)
                          .map((sheet, index) => (
                            <SelectItem key={`${sheet}-${index}`} value={sheet}>
                              {sheet}
                              {sheet === parsedData.suggestedSheetName && " (recommended)"}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {parsedData.suggestedSheetName && selectedSheet === parsedData.suggestedSheetName && (
                      <p className="text-sm text-[var(--success)] mt-2 flex items-center gap-1">
                        <Check className="h-4 w-4" />
                        Recommended sheet for {importType}
                      </p>
                    )}
                  </div>
                )}
                
                {getFieldsForImportType(importType).map((field) => (
                  <div key={field.key} className="flex items-center gap-4">
                    <div className="w-1/3">
                      <Label className="flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-destructive">*</span>}
                      </Label>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={columnMapping[field.key] || ''}
                      onValueChange={(value) => setColumnMapping({
                        ...columnMapping,
                        [field.key]: value === 'none' ? '' : value,
                      })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- Not mapped --</SelectItem>
                        {parsedData.headers
                          .filter((header) => header.trim().length > 0)
                          .map((header, index) => (
                            <SelectItem key={`${header}-${index}`} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                
                {/* Duplicate Handling */}
                <div className="pt-4 border-t">
                  <Label className="mb-3 block">Duplicate Handling</Label>
                  <RadioGroup
                    value={duplicateHandling}
                    onValueChange={(v) => setDuplicateHandling(v as typeof duplicateHandling)}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="skip" id="skip" />
                      <Label htmlFor="skip" className="font-normal">Skip duplicates</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="update" id="update" />
                      <Label htmlFor="update" className="font-normal">Update existing records</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="create_new" id="create_new" />
                      <Label htmlFor="create_new" className="font-normal">Create new records anyway</Label>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>
            
            {/* Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Data Preview</CardTitle>
                <CardDescription>
                  First {parsedData.previewRows.length} of {parsedData.totalRows} rows from "{parsedData.sheetName}"
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {parsedData.headers.map((header, i) => (
                          <th key={i} className="text-left p-2 font-medium whitespace-nowrap">
                            {header}
                            {Object.values(columnMapping).includes(header) && (
                              <Badge variant="secondary" className="ml-1 text-xs">mapped</Badge>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.previewRows.map((row, i) => (
                        <tr key={i} className="border-b">
                          {row.map((cell, j) => (
                            <td key={j} className="p-2 whitespace-nowrap max-w-[200px] truncate">
                              {cell ?? '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            
            {/* Actions */}
            <div className="lg:col-span-2 flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={handleValidate}
                disabled={!getRequiredFieldsMapped() || validateMutation.isPending}
              >
                {validateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    Validate & Preview
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
        
        {step === 'preview' && validationSummary && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{validationSummary.totalRows}</div>
                  <p className="text-sm text-muted-foreground">Total Rows</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-[var(--success)]">{validationSummary.validCount}</div>
                  <p className="text-sm text-muted-foreground">Valid</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-[var(--warning)]">{validationSummary.duplicateCount}</div>
                  <p className="text-sm text-muted-foreground">Duplicates</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-destructive">{validationSummary.errorCount}</div>
                  <p className="text-sm text-muted-foreground">Errors</p>
                </CardContent>
              </Card>
            </div>
            
            {/* Validation Results Table */}
            <Card>
              <CardHeader>
                <CardTitle>Validation Results</CardTitle>
                <CardDescription>
                  Review the validation results before importing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Row</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">Device Type</th>
                        <th className="text-left p-2 font-medium">Serial #</th>
                        <th className="text-left p-2 font-medium">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResults.map((result) => (
                        <tr key={result.rowNumber} className="border-b">
                          <td className="p-2">{result.rowNumber}</td>
                          <td className="p-2">
                            {result.status === 'valid' && (
                              <Badge variant="default" className="bg-[var(--success)]">Valid</Badge>
                            )}
                            {result.status === 'duplicate' && (
                              <Badge variant="secondary">Duplicate</Badge>
                            )}
                            {result.status === 'error' && (
                              <Badge variant="destructive">Error</Badge>
                            )}
                          </td>
                          <td className="p-2">{result.data.deviceType || '-'}</td>
                          <td className="p-2">{result.data.serialNumber || '-'}</td>
                          <td className="p-2">
                            {result.errors.length > 0 && (
                              <span className="text-destructive text-xs">
                                {result.errors.join(', ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            
            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Mapping
              </Button>
              <div className="flex gap-2">
                {validationSummary.errorCount > 0 && (
                  <p className="text-sm text-muted-foreground self-center mr-4">
                    <AlertCircle className="h-4 w-4 inline mr-1 text-[var(--warning)]" />
                    Rows with errors will be skipped
                  </p>
                )}
                <Button 
                  onClick={handleExecuteImport}
                  disabled={validationSummary.validCount === 0}
                >
                  Import {validationSummary.validCount + (duplicateHandling !== 'skip' ? validationSummary.duplicateCount : 0)} Devices
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {step === 'importing' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium mb-2">Importing Devices...</h3>
              <p className="text-muted-foreground">Please wait while we process your data</p>
            </CardContent>
          </Card>
        )}
        
        {step === 'results' && importResults && (
          <div className="space-y-6">
            {/* Results Summary */}
            <Card>
              <CardContent className="py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-[var(--success)]" />
                </div>
                <h3 className="text-xl font-bold mb-2">Import Complete!</h3>
                <p className="text-muted-foreground mb-6">
                  Successfully imported {importResults.successCount} devices
                </p>
                
                <div className="grid grid-cols-4 gap-4 max-w-2xl mx-auto">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{importResults.totalRows}</div>
                    <p className="text-sm text-muted-foreground">Total Rows</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[var(--success)]">{importResults.successCount}</div>
                    <p className="text-sm text-muted-foreground">Imported</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[var(--warning)]">{importResults.skippedCount}</div>
                    <p className="text-sm text-muted-foreground">Skipped</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">{importResults.errorCount}</div>
                    <p className="text-sm text-muted-foreground">Errors</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Actions */}
            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={resetImport}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Import More
              </Button>
              <Link href={`/admin/devices`}>
                <Button>
                  View Devices
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        )}
        </>
        )} {/* end mode === 'advanced' */}
      </div>
      {/* Google Drive File Picker */}
      <DriveFilePicker
        open={showDrivePicker}
        onClose={() => setShowDrivePicker(false)}
        siteId={siteId}
        companyId={companyId}
        onFileSelected={(result) => {
          setSelectedFile(new File([], result.fileName));
          setFileData(result.fileData);
          setParseError(null);
          parseFileMutation.mutate({
            fileName: result.fileName,
            fileData: result.fileData,
            importType,
          });
        }}
      />
    </AdminLayout>
  );
}
