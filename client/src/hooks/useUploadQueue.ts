import { useState, useEffect, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface QueuedFile {
  id: string;
  file: File;
  entityType: 'inspection_result' | 'deficiency' | 'repair' | 'device' | 'job' | 'site' | 'customer_org';
  entityId: number;
  tags?: string[];
  caption?: string;
  status: 'queued' | 'uploading' | 'completed' | 'failed' | 'paused';
  progress: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
  fileUrl?: string;
  fileKey?: string;
}

interface UseUploadQueueOptions {
  maxConcurrent?: number;
  maxRetries?: number;
  autoRetry?: boolean;
  onUploadComplete?: (file: QueuedFile) => void;
  onUploadError?: (file: QueuedFile, error: string) => void;
  onQueueComplete?: () => void;
}

export function useUploadQueue(options: UseUploadQueueOptions = {}) {
  const {
    maxConcurrent = 2,
    maxRetries = 3,
    autoRetry = true,
    onUploadComplete,
    onUploadError,
    onQueueComplete,
  } = options;

  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // tRPC mutations
  const uploadMutation = trpc.attachment.upload.useMutation();
  const addToQueueMutation = trpc.uploadQueue.add.useMutation();
  const updateStatusMutation = trpc.uploadQueue.updateStatus.useMutation();
  const completeMutation = trpc.uploadQueue.complete.useMutation();

  // Generate unique ID for queued files
  const generateId = () => `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add files to queue
  const addToQueue = useCallback((
    files: File[],
    entityType: QueuedFile['entityType'],
    entityId: number,
    options?: { tags?: string[]; caption?: string }
  ) => {
    const newFiles: QueuedFile[] = files.map(file => ({
      id: generateId(),
      file,
      entityType,
      entityId,
      tags: options?.tags,
      caption: options?.caption,
      status: 'queued',
      progress: 0,
      retryCount: 0,
      maxRetries,
    }));

    setQueue(prev => [...prev, ...newFiles]);
    
    // Also add to server queue for persistence
    newFiles.forEach(qf => {
      addToQueueMutation.mutate({
        localFileId: qf.id,
        fileName: qf.file.name,
        mimeType: qf.file.type,
        fileSize: qf.file.size,
        entityType: qf.entityType,
        entityId: qf.entityId,
        tags: qf.tags,
        caption: qf.caption,
      });
    });

    return newFiles.map(f => f.id);
  }, [maxRetries, addToQueueMutation]);

  // Add single file from camera/file picker
  const addFile = useCallback((
    file: File,
    entityType: QueuedFile['entityType'],
    entityId: number,
    options?: { tags?: string[]; caption?: string }
  ) => {
    return addToQueue([file], entityType, entityId, options)[0];
  }, [addToQueue]);

  // Remove file from queue
  const removeFromQueue = useCallback((id: string) => {
    // Abort if currently uploading
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    activeUploadsRef.current.delete(id);
    
    setQueue(prev => prev.filter(f => f.id !== id));
  }, []);

  // Clear completed uploads
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(f => f.status !== 'completed'));
  }, []);

  // Retry failed upload
  const retryUpload = useCallback((id: string) => {
    setQueue(prev => prev.map(f => 
      f.id === id ? { ...f, status: 'queued' as const, error: undefined } : f
    ));
  }, []);

  // Retry all failed uploads
  const retryAllFailed = useCallback(() => {
    setQueue(prev => prev.map(f => 
      f.status === 'failed' ? { ...f, status: 'queued' as const, error: undefined } : f
    ));
  }, []);

  // Pause/resume queue
  const pauseQueue = useCallback(() => {
    setIsPaused(true);
    // Abort all active uploads
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();
    activeUploadsRef.current.clear();
    
    setQueue(prev => prev.map(f => 
      f.status === 'uploading' ? { ...f, status: 'paused' as const } : f
    ));
  }, []);

  const resumeQueue = useCallback(() => {
    setIsPaused(false);
    setQueue(prev => prev.map(f => 
      f.status === 'paused' ? { ...f, status: 'queued' as const } : f
    ));
  }, []);

  // Upload a single file
  const uploadFile = useCallback(async (queuedFile: QueuedFile) => {
    const { id, file, entityType, entityId, tags, caption } = queuedFile;
    
    // Mark as uploading
    setQueue(prev => prev.map(f => 
      f.id === id ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));
    activeUploadsRef.current.add(id);

    // Create abort controller
    const abortController = new AbortController();
    abortControllersRef.current.set(id, abortController);

    try {
      // Read file as base64
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setQueue(prev => prev.map(f => {
          if (f.id === id && f.status === 'uploading' && f.progress < 90) {
            return { ...f, progress: f.progress + 10 };
          }
          return f;
        }));
      }, 200);

      // Upload via tRPC
      const result = await uploadMutation.mutateAsync({
        entityType,
        entityId,
        fileName: file.name,
        fileData: base64,
        mimeType: file.type || 'application/octet-stream',
        caption,
        tags,
      });

      clearInterval(progressInterval);

      // Mark as completed
      setQueue(prev => prev.map(f => 
        f.id === id ? { 
          ...f, 
          status: 'completed' as const, 
          progress: 100,
          fileUrl: result.fileUrl,
          fileKey: result.fileKey,
        } : f
      ));

      // Update server queue status
      updateStatusMutation.mutate({
        id: result.id,
        status: 'completed',
        fileKey: result.fileKey,
        fileUrl: result.fileUrl,
      });

      onUploadComplete?.(queuedFile);
      toast.success(`Uploaded ${file.name}`);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Upload was cancelled
        return;
      }

      const errorMessage = error.message || 'Upload failed';
      
      setQueue(prev => prev.map(f => {
        if (f.id === id) {
          const newRetryCount = f.retryCount + 1;
          const shouldRetry = autoRetry && newRetryCount < f.maxRetries;
          
          return {
            ...f,
            status: shouldRetry ? 'queued' as const : 'failed' as const,
            error: errorMessage,
            retryCount: newRetryCount,
            progress: 0,
          };
        }
        return f;
      }));

      if (!autoRetry || queuedFile.retryCount >= maxRetries - 1) {
        onUploadError?.(queuedFile, errorMessage);
        toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
      }

    } finally {
      activeUploadsRef.current.delete(id);
      abortControllersRef.current.delete(id);
    }
  }, [uploadMutation, updateStatusMutation, autoRetry, maxRetries, onUploadComplete, onUploadError]);

  // Process queue
  useEffect(() => {
    if (isPaused) return;

    const processQueue = async () => {
      const queuedFiles = queue.filter(f => f.status === 'queued');
      const activeCount = activeUploadsRef.current.size;
      const availableSlots = maxConcurrent - activeCount;

      if (queuedFiles.length === 0) {
        if (activeCount === 0 && isProcessing) {
          setIsProcessing(false);
          const hasCompleted = queue.some(f => f.status === 'completed');
          if (hasCompleted) {
            onQueueComplete?.();
          }
        }
        return;
      }

      if (availableSlots <= 0) return;

      setIsProcessing(true);

      // Start uploads for available slots
      const filesToUpload = queuedFiles.slice(0, availableSlots);
      filesToUpload.forEach(file => {
        if (!activeUploadsRef.current.has(file.id)) {
          uploadFile(file);
        }
      });
    };

    processQueue();
  }, [queue, isPaused, maxConcurrent, isProcessing, uploadFile, onQueueComplete]);

  // Stats
  const stats = {
    total: queue.length,
    queued: queue.filter(f => f.status === 'queued').length,
    uploading: queue.filter(f => f.status === 'uploading').length,
    completed: queue.filter(f => f.status === 'completed').length,
    failed: queue.filter(f => f.status === 'failed').length,
    paused: queue.filter(f => f.status === 'paused').length,
  };

  return {
    queue,
    stats,
    isProcessing,
    isPaused,
    addToQueue,
    addFile,
    removeFromQueue,
    clearCompleted,
    retryUpload,
    retryAllFailed,
    pauseQueue,
    resumeQueue,
  };
}

// Camera/File picker component hook
export function useFilePicker() {
  const [isCapturing, setIsCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = useCallback((options?: {
    accept?: string;
    multiple?: boolean;
    capture?: 'user' | 'environment';
  }) => {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = options?.accept || 'image/*,application/pdf,.doc,.docx';
      input.multiple = options?.multiple ?? true;
      
      if (options?.capture) {
        input.capture = options.capture;
      }

      input.onchange = (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        resolve(files);
      };

      input.click();
      inputRef.current = input;
    });
  }, []);

  const openCamera = useCallback((facingMode: 'user' | 'environment' = 'environment') => {
    return openFilePicker({
      accept: 'image/*',
      capture: facingMode,
      multiple: false,
    });
  }, [openFilePicker]);

  const capturePhoto = useCallback(async () => {
    setIsCapturing(true);
    try {
      const files = await openCamera('environment');
      return files[0] || null;
    } finally {
      setIsCapturing(false);
    }
  }, [openCamera]);

  const selectFiles = useCallback(async (options?: {
    accept?: string;
    multiple?: boolean;
  }) => {
    return openFilePicker(options);
  }, [openFilePicker]);

  return {
    isCapturing,
    openFilePicker,
    openCamera,
    capturePhoto,
    selectFiles,
  };
}
