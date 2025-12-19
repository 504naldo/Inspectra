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
  ChevronRight
} from "lucide-react";
import { useState, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { toast } from "sonner";

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'results';

interface ColumnMapping {
  [targetField: string]: string;
}

interface ValidationResult {
  rowNumber: number;
  status: 'valid' | 'error' | 'duplicate';
  errors: string[];
  data: Record<string, any>;
}

// Target fields for device import
const DEVICE_FIELDS = [
  { key: 'deviceType', label: 'Device Type', required: true },
  { key: 'manufacturer', label: 'Manufacturer', required: false },
  { key: 'model', label: 'Model', required: false },
  { key: 'serialNumber', label: 'Serial Number', required: false },
  { key: 'location', label: 'Location', required: false },
  { key: 'barcode', label: 'Barcode', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

export default function AssetImport() {
  const { user } = useAuth();
  const params = useParams<{ siteId: string }>();
  const [, navigate] = useLocation();
  const siteId = parseInt(params.siteId || "0");
  const companyId = user?.companyId || 1;
  
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>('');
  const [parsedData, setParsedData] = useState<{
    headers: string[];
    previewRows: any[][];
    totalRows: number;
    sheetName: string;
  } | null>(null);
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
  
  // Queries
  const { data: site } = trpc.site.get.useQuery({ id: siteId }, { enabled: siteId > 0 });
  const { data: importHistory } = trpc.import.listBySite.useQuery({ siteId }, { enabled: siteId > 0 });
  
  // Mutations
  const parseFileMutation = trpc.import.parseFile.useMutation({
    onSuccess: (data) => {
      setParsedData(data);
      // Auto-map columns based on header names
      const autoMapping: ColumnMapping = {};
      DEVICE_FIELDS.forEach(field => {
        const matchingHeader = data.headers.find(h => 
          h.toLowerCase().replace(/[_\s-]/g, '') === field.key.toLowerCase() ||
          h.toLowerCase().includes(field.label.toLowerCase())
        );
        if (matchingHeader) {
          autoMapping[field.key] = matchingHeader;
        }
      });
      setColumnMapping(autoMapping);
      setStep('mapping');
    },
    onError: (error) => {
      toast.error(`Failed to parse file: ${error.message}`);
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
      toast.error(`Validation failed: ${error.message}`);
    },
  });
  
  const executeMutation = trpc.import.execute.useMutation({
    onSuccess: (data) => {
      setImportResults(data);
      setStep('results');
      toast.success(`Import completed: ${data.successCount} devices imported`);
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });
  
  // Handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error('Please select a CSV or Excel file');
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
      });
    };
    reader.readAsArrayBuffer(file);
  };
  
  const handleValidate = () => {
    if (!fileData || !selectedFile) return;
    
    validateMutation.mutate({
      companyId,
      siteId,
      importType: 'devices',
      fileName: selectedFile.name,
      fileData,
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
      importType: 'devices',
      fileName: selectedFile.name,
      fileData,
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
    return DEVICE_FIELDS.filter(f => f.required).every(f => columnMapping[f.key]);
  };
  
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/admin/sites/${siteId}/devices`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Import Assets</h1>
            <p className="text-muted-foreground">{site?.name || 'Loading...'}</p>
          </div>
        </div>
        
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
                        ? 'bg-green-500 text-white' 
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
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload File</CardTitle>
              <CardDescription>
                Upload a CSV or Excel file containing your device data
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
                  Supports CSV, XLS, and XLSX files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileSelect}
                />
              </div>
              
              {parseFileMutation.isPending && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing file...
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
                <CardTitle>Map Columns</CardTitle>
                <CardDescription>
                  Match your file columns to device fields ({getMappedFieldCount()}/{DEVICE_FIELDS.length} mapped)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {DEVICE_FIELDS.map((field) => (
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
                        {parsedData.headers.map((header) => (
                          <SelectItem key={header} value={header}>
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
                  <div className="text-2xl font-bold text-green-500">{validationSummary.validCount}</div>
                  <p className="text-sm text-muted-foreground">Valid</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-yellow-500">{validationSummary.duplicateCount}</div>
                  <p className="text-sm text-muted-foreground">Duplicates</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-500">{validationSummary.errorCount}</div>
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
                              <Badge variant="default" className="bg-green-500">Valid</Badge>
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
                    <AlertCircle className="h-4 w-4 inline mr-1 text-yellow-500" />
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
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-500" />
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
                    <div className="text-2xl font-bold text-green-500">{importResults.successCount}</div>
                    <p className="text-sm text-muted-foreground">Imported</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-500">{importResults.skippedCount}</div>
                    <p className="text-sm text-muted-foreground">Skipped</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-500">{importResults.errorCount}</div>
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
              <Link href={`/admin/sites/${siteId}/devices`}>
                <Button>
                  View Devices
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
