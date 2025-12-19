import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  Camera, 
  File, 
  FileImage, 
  X, 
  RefreshCw, 
  Pause, 
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { useState } from "react";
import { useUploadQueue, useFilePicker } from "@/hooks/useUploadQueue";

interface UploadQueuePanelProps {
  entityType: 'inspection_result' | 'deficiency' | 'repair' | 'device' | 'job' | 'site' | 'customer_org';
  entityId: number;
  tags?: string[];
  onUploadComplete?: () => void;
}

export function UploadQueuePanel({ 
  entityType, 
  entityId, 
  tags,
  onUploadComplete 
}: UploadQueuePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const {
    queue,
    stats,
    isProcessing,
    isPaused,
    addFile,
    addToQueue,
    removeFromQueue,
    clearCompleted,
    retryUpload,
    retryAllFailed,
    pauseQueue,
    resumeQueue,
  } = useUploadQueue({
    onUploadComplete: () => {
      onUploadComplete?.();
    },
  });

  const { capturePhoto, selectFiles, isCapturing } = useFilePicker();

  const handleCameraCapture = async () => {
    const file = await capturePhoto();
    if (file) {
      addFile(file, entityType, entityId, { tags });
    }
  };

  const handleFileSelect = async () => {
    const files = await selectFiles({
      accept: 'image/*,application/pdf,.doc,.docx',
      multiple: true,
    });
    if (files.length > 0) {
      addToQueue(files, entityType, entityId, { tags });
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <FileImage className="h-4 w-4 text-blue-500" />;
    }
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      default:
        return <Upload className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg z-50 md:relative md:bottom-auto md:right-auto md:w-full">
      <CardHeader className="py-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Queue
            {stats.total > 0 && (
              <Badge variant="secondary" className="ml-1">
                {stats.completed}/{stats.total}
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleCameraCapture}
              disabled={isCapturing}
            >
              <Camera className="h-4 w-4 mr-1" />
              Camera
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleFileSelect}
            >
              <File className="h-4 w-4 mr-1" />
              Files
            </Button>
          </div>

          {/* Queue Controls */}
          {queue.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex gap-2">
                {isPaused ? (
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={resumeQueue}>
                    <Play className="h-3 w-3 mr-1" />
                    Resume
                  </Button>
                ) : isProcessing ? (
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={pauseQueue}>
                    <Pause className="h-3 w-3 mr-1" />
                    Pause
                  </Button>
                ) : null}
                
                {stats.failed > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={retryAllFailed}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry All
                  </Button>
                )}
              </div>
              
              {stats.completed > 0 && (
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={clearCompleted}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear Done
                </Button>
              )}
            </div>
          )}

          {/* Queue List */}
          {queue.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className={`
                    flex items-center gap-2 p-2 rounded-lg text-sm
                    ${item.status === 'completed' ? 'bg-green-50 dark:bg-green-950' : 
                      item.status === 'failed' ? 'bg-red-50 dark:bg-red-950' : 
                      'bg-muted/50'}
                  `}
                >
                  {getFileIcon(item.file)}
                  
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-xs">{item.file.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(item.file.size)}
                      </span>
                      {item.status === 'uploading' && (
                        <Progress value={item.progress} className="h-1 flex-1" />
                      )}
                      {item.error && (
                        <span className="text-xs text-red-500 truncate">{item.error}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {getStatusIcon(item.status)}
                    
                    {item.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => retryUpload(item.id)}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                    
                    {item.status !== 'uploading' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFromQueue(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No files in queue</p>
              <p className="text-xs">Tap Camera or Files to add</p>
            </div>
          )}

          {/* Stats Summary */}
          {stats.total > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
              <span>{stats.queued} queued</span>
              <span>{stats.uploading} uploading</span>
              <span className="text-green-500">{stats.completed} done</span>
              {stats.failed > 0 && <span className="text-red-500">{stats.failed} failed</span>}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Floating upload button for mobile
export function FloatingUploadButton({
  entityType,
  entityId,
  tags,
  onUploadComplete,
}: UploadQueuePanelProps) {
  const [showPanel, setShowPanel] = useState(false);
  
  const { stats } = useUploadQueue();
  const { capturePhoto } = useFilePicker();

  const handleQuickCapture = async () => {
    const file = await capturePhoto();
    if (file) {
      // This would need access to addFile from the queue
      setShowPanel(true);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-20 right-4 z-40 md:hidden">
        <Button
          size="lg"
          className="rounded-full h-14 w-14 shadow-lg"
          onClick={() => setShowPanel(true)}
        >
          <Camera className="h-6 w-6" />
          {stats.total > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {stats.total - stats.completed}
            </Badge>
          )}
        </Button>
      </div>

      {/* Panel */}
      {showPanel && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={() => setShowPanel(false)}>
          <div className="absolute bottom-0 left-0 right-0" onClick={e => e.stopPropagation()}>
            <UploadQueuePanel
              entityType={entityType}
              entityId={entityId}
              tags={tags}
              onUploadComplete={onUploadComplete}
            />
          </div>
        </div>
      )}
    </>
  );
}
