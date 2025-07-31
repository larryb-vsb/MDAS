import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Upload, FileText, Search, Database, CheckCircle, AlertCircle, Clock, Play, Settings, Zap, Filter, Eye, EyeOff, MoreVertical, Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Activity, Pause, ZoomIn, Lightbulb, RotateCcw, RefreshCw, X, HardDrive, ExternalLink, Link2, Plus, Edit, Users, Building } from 'lucide-react';
import { UploaderUpload } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import MainLayout from '@/components/layout/MainLayout';
import TddfJsonViewer from '@/components/uploads/TddfJsonViewer';
import StorageObjectProcessor from '@/components/storage/StorageObjectProcessor';
import ObjectStorageFileBrowser from '@/components/storage/ObjectStorageFileBrowser';
import OrphanFileUploader from '@/components/uploads/OrphanFileUploader';
import OrphanFilesDetector from '@/components/uploads/OrphanFilesDetector';
import { formatDistanceToNow } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

// Extended type for UploaderUpload with storage key
interface UploaderUploadWithPresigned extends UploaderUpload {
  storageKey?: string;
}

// 8-State Processing Workflow
const PROCESSING_PHASES = [
  { id: 'started', name: 'Started', icon: Play, color: 'blue', description: 'Upload initialized' },
  { id: 'uploading', name: 'Uploading', icon: Upload, color: 'purple', description: 'File transfer in progress' },
  { id: 'uploaded', name: 'Uploaded', icon: FileText, color: 'cyan', description: 'File stored temporarily' },
  { id: 'identified', name: 'Identified', icon: Search, color: 'orange', description: 'File type detected and analyzed' },
  { id: 'encoding', name: 'Encoding', icon: Settings, color: 'pink', description: 'Data encoding and validation' },
  { id: 'processing', name: 'Processing', icon: Database, color: 'indigo', description: 'Data being processed' },
  { id: 'completed', name: 'Completed', icon: CheckCircle, color: 'green', description: 'Successfully processed' },
  { id: 'warning', name: 'Warning State', icon: AlertCircle, color: 'red', description: 'Processing failed or has errors' }
];

// Supported file types
const FILE_TYPES = [
  { value: 'tddf', label: 'TDDF (.TSYSO)', description: 'TSYS Transaction Daily Detail File .TSYSO file 2400 or 0830 ex VERMNTSB.6759_TDDF_2400_07112025_003301.TSYSO' },
  { value: 'ach_merchant', label: 'ACH Merchant (.csv)', description: 'Custom Merchant Demographics .csv file' },
  { value: 'ach_transactions', label: 'ACH Transactions (.csv)', description: 'Horizon Core ACH Processing Detail File AH0314P1 .csv file' },
  { value: 'mastercard_di', label: 'MasterCard DI Report (.xlms)', description: 'MasterCard Data Integrity Edit Report records .xlms file' }
];

const getPhaseColor = (phase: string) => {
  const phaseInfo = PROCESSING_PHASES.find(p => p.id === phase);
  return phaseInfo?.color || 'gray';
};

const getPhaseIcon = (phase: string) => {
  const phaseInfo = PROCESSING_PHASES.find(p => p.id === phase);
  return phaseInfo?.icon || Clock;
};

const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return 'Unknown';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

const formatDuration = (startTime: string | Date, endTime?: string | Date): string => {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  
  if (diffMin > 0) {
    return `${diffMin}m ${diffSec % 60}s`;
  }
  return `${diffSec}s`;
};

// Storage status bulb color determination
const getBulbColor = (upload: UploaderUpload, storageStatus?: any): string => {
  // Grey (not accessible) for early phases
  if (!['uploaded', 'identified', 'encoding', 'processing', 'completed', 'encoded'].includes(upload.currentPhase || '')) {
    return 'text-gray-400';
  }
  
  // Check storage status if available
  if (storageStatus) {
    if (storageStatus.storageStatus?.exists && storageStatus.storageStatus?.accessible) {
      return 'text-green-500'; // Green - file found and accessible
    } else if (storageStatus.storageStatus?.error) {
      return 'text-orange-500'; // Orange - error/warning
    } else {
      return 'text-gray-400'; // Grey - not found
    }
  }
  
  // Default based on phase if no storage status checked yet
  if (upload.currentPhase === 'completed' || upload.currentPhase === 'encoded') {
    return 'text-green-500'; // Assume accessible for completed/encoded files
  }
  
  return 'text-gray-400'; // Default grey
};



export default function MMSUploader() {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>('tddf');
  const [activeTab, setActiveTab] = useState('upload');
  const [sessionId] = useState(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // Review mode state
  const [keep, setKeep] = useState<boolean>(false);
  
  // Auto 4-5 processing toggle state
  const [auto45Enabled, setAuto45Enabled] = useState<boolean>(false);
  
  // Files tab state
  const [statusFilter, setStatusFilter] = useState('all');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [filenameFilter, setFilenameFilter] = useState('');
  const [selectedFileForView, setSelectedFileForView] = useState<UploaderUpload | null>(null);
  
  // Sorting state
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // JSONB viewer state
  const [jsonbViewerOpen, setJsonbViewerOpen] = useState(false);
  const [selectedUploadForJsonb, setSelectedUploadForJsonb] = useState<UploaderUpload | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0); // 0-based for array indexing
  const [itemsPerPage, setItemsPerPage] = useState(100); // Start with larger default
  
  // Selection state for bulk operations
  const [selectedUploads, setSelectedUploads] = useState<string[]>([]);

  // Sub Terminals tab state
  const [editingTerminal, setEditingTerminal] = useState<any>(null);
  const [isCreateMerchantDialogOpen, setIsCreateMerchantDialogOpen] = useState(false);
  const [newMerchant, setNewMerchant] = useState({ name: '', clientMID: '', status: 'Active' });
  const [terminalSearchFilter, setTerminalSearchFilter] = useState('');
  const [merchantSearchFilter, setMerchantSearchFilter] = useState('');
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Storage status for bulb system
  const [storageStatusCache, setStorageStatusCache] = useState<Record<string, any>>({});
  
  // Encoding results and progress tracking
  const [encodingResults, setEncodingResults] = useState<Record<string, any>>({});
  const [encodingProgress, setEncodingProgress] = useState<Record<string, number>>({});

  // Storage status bulb tooltip text (moved inside component)
  const getBulbTooltip = (upload: UploaderUpload, storageStatus?: any): string => {
    const objectName = upload.s3Key || `dev-uploader/${upload.id}/${upload.filename}`;
    
    // Early phases - still connecting/pending
    if (!['uploaded', 'identified', 'encoding', 'processing', 'completed'].includes(upload.currentPhase || '')) {
      return `Object: ${objectName} - Status: Connecting/Pending`;
    }
    
    // Check storage status if available
    if (storageStatus) {
      if (storageStatus.storageStatus?.exists && storageStatus.storageStatus?.accessible) {
        return `Object: ${objectName} - Status: Available`;
      } else if (storageStatus.storageStatus?.error) {
        return `Object: ${objectName} - Warning: ${storageStatus.storageStatus.error}`;
      } else {
        return `Object: ${objectName} - Status: Not Found`;
      }
    }
    
    // Default for completed files
    if (upload.currentPhase === 'completed') {
      return `Object: ${objectName} - Status: Available (assumed)`;
    }
    
    return `Object: ${objectName} - Status: Checking...`;
  };

  // Query for MMS uploads with pagination support
  const { data: uploadsResponse, isLoading } = useQuery<{uploads: UploaderUpload[], totalCount: number}>({
    queryKey: ['/api/uploader', currentPage, itemsPerPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
        offset: (currentPage * itemsPerPage).toString()
      });
      const response = await fetch(`/api/uploader?${params.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch uploads');
      }
      const data = await response.json();
      // If the response is just an array (old format), convert it
      if (Array.isArray(data)) {
        return { uploads: data, totalCount: data.length };
      }
      return data;
    },
    refetchInterval: 1000 // Refresh every 1 second for real-time upload feedback
  });

  const uploads = uploadsResponse?.uploads || [];
  const totalCount = uploadsResponse?.totalCount || uploads.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Get storage configuration
  const { data: storageConfig } = useQuery<{
    available: boolean;
    service: string;
    bucket: string;
    fileCount?: number;
  }>({
    queryKey: ['/api/uploader/storage-config'],
    refetchInterval: 5000 // Check storage status every 5 seconds
  });

  // Get last new data date for Uploader page
  const { data: lastNewDataDate } = useQuery({
    queryKey: ['/api/uploader/last-new-data-date'],
    queryFn: async () => {
      const response = await fetch('/api/uploader/last-new-data-date');
      if (!response.ok) throw new Error('Failed to fetch last new data date');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Get Auto 4-5 processing status
  const { data: auto45Status } = useQuery<{
    success: boolean;
    enabled: boolean;
    status: string;
    message: string;
  }>({
    queryKey: ['/api/mms-watcher/auto45-status'],
    queryFn: async () => {
      const response = await fetch('/api/mms-watcher/auto45-status', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch Auto 4-5 status');
      return response.json();
    },
    refetchInterval: 5000 // Check status every 5 seconds
  });

  // Sync auto45 enabled state when query data changes
  React.useEffect(() => {
    if (auto45Status?.enabled !== undefined) {
      setAuto45Enabled(auto45Status.enabled);
    }
  }, [auto45Status?.enabled]);

  // Queries for Sub Terminals tab
  const { data: terminals = [] } = useQuery({
    queryKey: ['/api/terminals'],
    queryFn: async () => {
      const response = await fetch('/api/terminals', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch terminals');
      return response.json();
    },
    enabled: activeTab === 'sub-terminals'
  });

  const { data: merchantsResponse } = useQuery({
    queryKey: ['/api/merchants'],
    queryFn: async () => {
      const response = await fetch('/api/merchants', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch merchants');
      return response.json();
    },
    enabled: activeTab === 'sub-terminals'
  });

  const merchants = merchantsResponse?.merchants || [];

  // Mutations for Sub Terminals tab
  const createMerchantMutation = useMutation({
    mutationFn: async (merchantData: any) => {
      const response = await apiRequest('/api/merchants', {
        method: 'POST',
        body: merchantData
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merchants'] });
      toast({ title: 'Success', description: 'Merchant created successfully' });
      setIsCreateMerchantDialogOpen(false);
      setNewMerchant({ name: '', clientMID: '', status: 'Active' });
    }
  });

  const updateTerminalMerchantMutation = useMutation({
    mutationFn: async ({ terminalId, merchantId }: { terminalId: string; merchantId: string }) => {
      const response = await apiRequest(`/api/terminals/${terminalId}/merchant`, {
        method: 'PATCH',
        body: { merchantId }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/terminals'] });
      toast({ title: 'Success', description: 'Terminal-merchant relationship updated' });
      setEditingTerminal(null);
    }
  });

  // Start upload mutation
  const startUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await apiRequest<UploaderUploadWithPresigned>('/api/uploader/start', {
        method: 'POST',
        body: {
          filename: file.name,
          fileSize: file.size,
          sessionId,
          finalFileType: selectedFileType,
          userClassifiedType: selectedFileType,
          keep: keep
        }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    }
  });

  // Update phase mutation
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ uploadId, phase, phaseData }: { 
      uploadId: string; 
      phase: string; 
      phaseData?: Record<string, any> 
    }) => {
      const response = await apiRequest<UploaderUpload>(`/api/uploader/${uploadId}/phase/${phase}`, {
        method: 'POST',
        body: phaseData || {}
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    }
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/bulk-delete', {
        method: 'DELETE',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
    }
  });

  // Cancel encoding mutation
  const cancelEncodingMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/cancel-encoding', {
        method: 'POST',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
      console.log(`[CANCEL-ENCODING] Successfully canceled encoding for ${data.canceledCount} files`);
    }
  });

  // Set previous level mutation
  const setPreviousLevelMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/set-previous-level', {
        method: 'POST',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
    },
    onError: (error) => {
      console.error('Error setting previous level:', error);
    }
  });

  // Bulk encode mutation
  const bulkEncodeMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/bulk-encode', {
        method: 'POST',
        body: { 
          uploadIds,
          strategy: 'tddf_json'
        }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
    },
    onError: (error) => {
      console.error('Error with bulk encoding:', error);
    }
  });

  // Auto 4-5 toggle mutation
  const auto45ToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('/api/mms-watcher/auto45-toggle', {
        method: 'POST',
        body: { enabled }
      });
      return response;
    },
    onSuccess: (data: any) => {
      // Update local state
      setAuto45Enabled(data.enabled);
      // Invalidate the status query to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/mms-watcher/auto45-status'] });
      console.log(`[AUTO45-TOGGLE] ${data.message}`);
    },
    onError: (error) => {
      console.error('Error toggling Auto 4-5:', error);
      // Revert the switch state on error
      setAuto45Enabled(!auto45Enabled);
    }
  });

  // Manual identify mutation for progressing uploaded files to identified
  const manualIdentifyMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/manual-identify', {
        method: 'POST',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
      console.log('[MANUAL-IDENTIFY] Files successfully identified');
    },
    onError: (error) => {
      console.error('Error with manual identification:', error);
    }
  });

  // Manual encoding mutation for progressing identified files to encoded
  const manualEncodeMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      console.log('[MANUAL-ENCODE-DEBUG] Calling API with uploadIds:', uploadIds);
      const response = await apiRequest('/api/uploader/manual-encode', {
        method: 'POST',
        body: { uploadIds }
      });
      console.log('[MANUAL-ENCODE-DEBUG] API response:', response);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
      console.log('[MANUAL-ENCODE] Files successfully queued for encoding:', data);
    },
    onError: (error: any) => {
      console.error('Error with manual encoding:', error);
      console.error('Full error details:', {
        message: error?.message,
        status: error?.status,
        stack: error?.stack,
        toString: error?.toString(),
        error
      });
    }
  });

  // Filter and sort uploads based on status, file type, filename, and sorting preferences
  const filteredUploads = uploads
    .filter(upload => {
      const statusMatch = statusFilter === 'all' || upload.currentPhase === statusFilter;
      const typeMatch = fileTypeFilter === 'all' || upload.finalFileType === fileTypeFilter;
      const filenameMatch = filenameFilter === '' || upload.filename.toLowerCase().includes(filenameFilter.toLowerCase());
      return statusMatch && typeMatch && filenameMatch;
    })
    .sort((a, b) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'name':
          compareValue = a.filename.localeCompare(b.filename);
          break;
        case 'date':
          const dateA = new Date(a.uploadedAt || a.createdAt || 0);
          const dateB = new Date(b.uploadedAt || b.createdAt || 0);
          compareValue = dateA.getTime() - dateB.getTime();
          break;
        case 'size':
          const sizeA = a.fileSize || 0;
          const sizeB = b.fileSize || 0;
          compareValue = sizeA - sizeB;
          break;
        default:
          compareValue = 0;
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

  // Pagination calculations
  const filteredTotalPages = Math.ceil(filteredUploads.length / itemsPerPage);
  const startIndex = currentPage * itemsPerPage;
  const paginatedUploads = filteredUploads.slice(startIndex, startIndex + itemsPerPage);

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedUploads.length === 0) return;
    
    try {
      await bulkDeleteMutation.mutateAsync(selectedUploads);
    } catch (error) {
      console.error('Bulk delete error:', error);
    }
  };

  // Cancel encoding handler
  const handleCancelEncoding = async () => {
    // Filter selected uploads to only include those in encoding phase
    const encodingUploads = selectedUploads.filter(id => {
      const upload = uploads.find(u => u.id === id);
      return upload && upload.currentPhase === 'encoding';
    });
    
    if (encodingUploads.length === 0) return;
    
    try {
      await cancelEncodingMutation.mutateAsync(encodingUploads);
    } catch (error) {
      console.error('Cancel encoding error:', error);
    }
  };

  // Manual identify handler for uploaded files
  const handleManualIdentify = async () => {
    // Filter selected uploads to only include those in "uploaded" phase
    const uploadedFiles = selectedUploads.filter(id => {
      const upload = uploads.find(u => u.id === id);
      return upload && upload.currentPhase === 'uploaded';
    });
    
    if (uploadedFiles.length === 0) {
      console.log('[MANUAL-IDENTIFY] No uploaded files selected');
      return;
    }
    
    console.log(`[MANUAL-IDENTIFY] Identifying ${uploadedFiles.length} uploaded files`);
    
    try {
      await manualIdentifyMutation.mutateAsync(uploadedFiles);
    } catch (error) {
      console.error('Manual identify error:', error);
    }
  };

  // Manual encoding handler for identified files
  const handleManualEncode = async () => {
    // Filter selected uploads to only include those in "identified" phase
    const identifiedFiles = selectedUploads.filter(id => {
      const upload = uploads.find(u => u.id === id);
      return upload && upload.currentPhase === 'identified';
    });
    
    if (identifiedFiles.length === 0) {
      console.log('[MANUAL-ENCODE] No identified files selected');
      return;
    }
    
    console.log(`[MANUAL-ENCODE] Encoding ${identifiedFiles.length} identified files`);
    
    try {
      await manualEncodeMutation.mutateAsync(identifiedFiles);
    } catch (error) {
      console.error('Manual encode error:', error);
    }
  };

  // Set previous level handler (using existing bulk selection system)
  const handleSetPreviousLevelSelected = async () => {
    console.log('[SET-PREVIOUS-LEVEL] Button clicked, selectedUploads:', selectedUploads);
    
    // Filter selected uploads to only include those that can be moved back
    const eligibleUploads = selectedUploads.filter(id => {
      const upload = uploads.find(u => u.id === id);
      const isEligible = upload && (upload.currentPhase === 'identified' || upload.currentPhase === 'encoded' || upload.currentPhase === 'failed');
      console.log(`[SET-PREVIOUS-LEVEL] File ${upload?.filename} (${upload?.currentPhase}) eligible: ${isEligible}`);
      return isEligible;
    });
    
    console.log(`[SET-PREVIOUS-LEVEL] Found ${eligibleUploads.length} eligible uploads:`, eligibleUploads);
    
    if (eligibleUploads.length === 0) {
      console.log('[SET-PREVIOUS-LEVEL] No eligible uploads found, returning');
      return;
    }
    
    try {
      console.log('[SET-PREVIOUS-LEVEL] Calling setPreviousLevelMutation with:', eligibleUploads);
      await setPreviousLevelMutation.mutateAsync(eligibleUploads);
      console.log('[SET-PREVIOUS-LEVEL] Mutation completed successfully');
    } catch (error) {
      console.error('[SET-PREVIOUS-LEVEL] Error:', error);
    }
  };

  // Stage 5: Single file encoding handler with progress tracking
  const handleSingleFileEncoding = async (uploadId: string) => {
    try {
      console.log(`[STAGE-5] Starting encoding for upload: ${uploadId}`);
      
      // Set initial progress
      setEncodingProgress(prev => ({ ...prev, [uploadId]: 0 }));
      
      // Simulate progress tracking
      const progressInterval = setInterval(() => {
        setEncodingProgress(prev => {
          const currentProgress = prev[uploadId] || 0;
          if (currentProgress < 90) {
            return { ...prev, [uploadId]: currentProgress + 10 };
          }
          return prev;
        });
      }, 200);
      
      const response = await apiRequest(`/api/uploader/${uploadId}/encode`, {
        method: 'POST',
        body: {
          strategy: 'tddf_json'
        }
      });
      
      // Clear progress interval
      clearInterval(progressInterval);
      
      console.log('[STAGE-5] Encoding response:', response);
      
      // Store encoding results for JSON display
      if ((response as any).jsonSample && (response as any).recordTypeBreakdown) {
        setEncodingResults(prev => ({
          ...prev,
          [uploadId]: {
            jsonSample: (response as any).jsonSample,
            recordTypeBreakdown: (response as any).recordTypeBreakdown,
            message: (response as any).message,
            filename: (response as any).filename,
            encodingTimeMs: (response as any).results?.encodingTimeMs
          }
        }));
      }
      
      // Set final progress to 100%
      setEncodingProgress(prev => ({ ...prev, [uploadId]: 100 }));
      
      // Refresh upload list to show updated status
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      
    } catch (error) {
      console.error('Single file encoding error:', error);
      
      // Clear progress on error
      setEncodingProgress(prev => ({ ...prev, [uploadId]: 0 }));
      
      // Store error result
      setEncodingResults(prev => ({
        ...prev,
        [uploadId]: {
          error: error instanceof Error ? error.message : 'Unknown encoding error',
          jsonSample: [],
          recordTypeBreakdown: {}
        }
      }));
    }
  };

  // Stage 5: Bulk encoding handler
  const handleBulkEncoding = async () => {
    try {
      console.log(`[STAGE-5] Starting bulk encoding for ${selectedUploads.length} files`);
      
      const response = await apiRequest('/api/uploader/bulk-encode', {
        method: 'POST',
        body: {
          uploadIds: selectedUploads,
          strategy: 'tddf_json'
        }
      });
      
      console.log('[STAGE-5] Bulk encoding response:', response);
      
      // Refresh upload list to show updated status
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      
      // Clear selection after bulk operation
      setSelectedUploads([]);
      
    } catch (error) {
      console.error('Bulk encoding error:', error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setSelectedFiles(files);
    
    console.log(`[AUTO-UPLOAD-DEBUG] Files selected: ${files?.length || 0}, File type: ${selectedFileType}`);
    
    // Auto-start upload if files are selected and file type is chosen
    if (files && files.length > 0 && selectedFileType) {
      console.log(`[AUTO-UPLOAD-DEBUG] Triggering auto-upload for ${files.length} files`);
      setTimeout(() => handleStartUpload(files), 100); // Pass files directly to avoid React state timing issues
    } else {
      console.log(`[AUTO-UPLOAD-DEBUG] Auto-upload not triggered - missing files or file type`);
    }
  };

  const handleStartUpload = async (filesToUpload?: FileList | null) => {
    const files = filesToUpload || selectedFiles;
    if (!files || !selectedFileType) {
      console.log(`[SESSION-UPLOAD-DEBUG] handleStartUpload called but missing requirements - Files: ${files?.length || 0}, Type: ${selectedFileType}`);
      return;
    }
    
    console.log(`[SESSION-UPLOAD-DEBUG] Starting session-based upload for ${files.length} files of type ${selectedFileType}`);
    
    // Create upload session ID for this batch
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[SESSION-CONTROL] Created upload session: ${sessionId}`);
    
    for (const file of Array.from(files)) {
      let uploadResponse: any = null;
      try {
        console.log(`[SESSION-PHASE-1] Starting session upload for: ${file.name} (Session: ${sessionId})`);
        
        // Phase 1: Create database record with session control
        uploadResponse = await startUploadMutation.mutateAsync(file);
        console.log(`[SESSION-PHASE-1] Created DB record with session control: ${uploadResponse.id}`);
        
        if (uploadResponse?.id && uploadResponse.storageKey) {
          // Update with session ID for tracking
          await fetch(`/api/uploader/${uploadResponse.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              sessionId: sessionId,
              processingNotes: `Session-controlled upload started (Session: ${sessionId})`
            })
          });
          
          console.log(`[SESSION-PHASE-2] Updating to uploading phase with session control: ${uploadResponse.id}`);
          
          // Set initial uploading phase with progress tracking
          await fetch(`/api/uploader/${uploadResponse.id}/phase/uploading`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              sessionId: sessionId,
              uploadProgress: 0,
              processingNotes: `Upload started - Session: ${sessionId}`
            })
          });
          
          // Phase 2: Session-controlled upload to Replit Object Storage with progress
          const formData = new FormData();
          formData.append('file', file);
          formData.append('sessionId', sessionId);
          
          // Robust upload with background progress tracking (window-close resistant)
          let progressTracker: NodeJS.Timeout | null = null;
          let currentProgress = 0;
          
          try {
            // Start background progress simulation until upload completes
            progressTracker = setInterval(async () => {
              currentProgress = Math.min(currentProgress + Math.random() * 8 + 2, 95);
              
              try {
                await fetch(`/api/uploader/${uploadResponse.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    uploadProgress: Math.round(currentProgress),
                    processingNotes: `Uploading... ${Math.round(currentProgress)}% - Session: ${sessionId}`
                  })
                });
              } catch (error) {
                console.log('Progress update error:', error);
              }
            }, 800);
            
            // Perform actual upload with fetch (more resilient than XMLHttpRequest)
            console.log(`[SESSION-UPLOAD] Starting upload for ${file.name} to /api/uploader/${uploadResponse.id}/upload`);
            const uploadApiResponse = await fetch(`/api/uploader/${uploadResponse.id}/upload`, {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });
            
            // Clear progress tracker
            if (progressTracker) {
              clearInterval(progressTracker);
              progressTracker = null;
            }
            
            console.log(`[SESSION-UPLOAD] Upload response status: ${uploadApiResponse.status} ${uploadApiResponse.statusText}`);
            
            if (!uploadApiResponse.ok) {
              const errorText = await uploadApiResponse.text();
              console.error(`[SESSION-UPLOAD] Upload failed with status ${uploadApiResponse.status}: ${errorText}`);
              throw new Error(`Session upload failed: ${uploadApiResponse.status} ${uploadApiResponse.statusText} - ${errorText}`);
            }
            
            const uploadResult = await uploadApiResponse.json();
            console.log(`[SESSION-UPLOAD] Upload successful:`, uploadResult);
            
            // Set final progress to 100%
            await fetch(`/api/uploader/${uploadResponse.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                uploadProgress: 100,
                processingNotes: `Upload completed - Session: ${sessionId}`
              })
            });
            
          } catch (uploadError) {
            // Clear progress tracker on error
            if (progressTracker) {
              clearInterval(progressTracker);
              progressTracker = null;
            }
            throw uploadError;
          }

          
          console.log(`[SESSION-PHASE-2] Session-controlled upload to Replit Object Storage successful: ${uploadResponse.id}`);
          
          // Add a small delay to ensure progress is visible
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Phase 3: Set to uploaded phase
          await fetch(`/api/uploader/${uploadResponse.id}/phase/uploaded`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              sessionId: sessionId,
              processingNotes: keep 
                ? `Upload to storage completed - HELD FOR REVIEW - Session: ${sessionId}`
                : `Upload to storage completed - Session: ${sessionId}`,
              uploadedAt: new Date().toISOString(),
              keep: keep
            })
          });
          
          // Phase 3 Final: Files stay at 'uploaded' status - no auto-progression to 'completed'
          console.log(`[SESSION-PHASE-3] Session upload completed with 'uploaded' status: ${uploadResponse.id}`);
          if (keep) {
            console.log(`[SESSION-REVIEW] Upload held at 'uploaded' phase for review: ${uploadResponse.id}`);
          } else {
            console.log(`[SESSION-CONTROL] Upload completed and ready at 'uploaded' phase: ${uploadResponse.id}`);
          }
        }
      } catch (error) {
        console.error(`[SESSION-ERROR] Session upload error for ${file.name}:`, error);
        // Mark existing upload as failed with session info
        try {
          if (uploadResponse?.id) {
            await fetch(`/api/uploader/${uploadResponse.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                currentPhase: 'warning',
                sessionId: sessionId,
                processingNotes: `Session upload failed: ${error instanceof Error ? error.message : String(error)} (Session: ${sessionId})`,
                failedAt: new Date().toISOString()
              })
            });
          }
        } catch (cleanupError) {
          console.error('[SESSION-CLEANUP-ERROR] Failed to mark failed upload:', cleanupError);
        }
      }
    }
    
    console.log(`[SESSION-CONTROL] Upload session ${sessionId} completed - files stopped at 'uploaded' phase`);
    
    setSelectedFiles(null);
    // Reset file input
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  // Handle bulb click - check storage status and view file content
  const handleBulbClick = async (upload: UploaderUpload) => {
    try {
      // First check storage status if not already cached
      if (!storageStatusCache[upload.id]) {
        const storageResponse = await fetch(`/api/uploader/${upload.id}/storage-status`, {
          credentials: 'include'
        });
        
        if (storageResponse.ok) {
          const storageStatus = await storageResponse.json();
          setStorageStatusCache(prev => ({
            ...prev,
            [upload.id]: storageStatus
          }));
        }
      }
      
      // If file is accessible, try to get content
      const storageStatus = storageStatusCache[upload.id];
      if (storageStatus?.storageStatus?.accessible) {
        setSelectedFileForView(upload);
        
        // Show a quick content preview
        const contentResponse = await fetch(`/api/uploader/${upload.id}/content`, {
          credentials: 'include'
        });
        
        if (contentResponse.ok) {
          const content = await contentResponse.json();
          // Show first 2 lines as requested
          const lines = content.content?.split('\n') || [];
          const preview = lines.slice(0, 2).join('\n');
          
          alert(`File: ${upload.filename}\nFirst 2 lines:\n\n${preview}`);
        }
      } else {
        alert(`File: ${upload.filename}\nStatus: ${storageStatus?.storageStatus?.error || 'Not accessible'}`);
      }
    } catch (error) {
      console.error('Error handling bulb click:', error);
      alert(`Error accessing file: ${upload.filename}`);
    }
  };



  // Group MMS uploads by phase
  const uploadsByPhase = uploads.reduce((acc, upload) => {
    const phase = upload.currentPhase || 'started';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(upload);
    return acc;
  }, {} as Record<string, UploaderUpload[]>);

  // Calculate overall statistics for MMS uploads only
  const totalUploads = uploads.length;
  const completedUploads = (uploadsByPhase.completed?.length || 0) + (uploadsByPhase.encoded?.length || 0);
  const warningUploads = (uploadsByPhase.warning?.length || 0) + (uploadsByPhase.failed?.length || 0) + (uploadsByPhase.error?.length || 0);
  const activeUploads = (uploadsByPhase.started?.length || 0) + (uploadsByPhase.uploading?.length || 0); // Only truly uploading files
  const processingUploads = (uploadsByPhase.uploaded?.length || 0) + (uploadsByPhase.identified?.length || 0) + (uploadsByPhase.encoding?.length || 0) + (uploadsByPhase.processing?.length || 0); // Files waiting for or undergoing processing

  // Reset page when filters or sorting change
  React.useEffect(() => {
    setCurrentPage(0);
  }, [statusFilter, fileTypeFilter, filenameFilter, sortBy, sortOrder, itemsPerPage]);

  // View file contents query (only fetch when needed)
  const { data: fileContent, isLoading: isLoadingContent } = useQuery({
    queryKey: ['/api/uploader', selectedFileForView?.id, 'content'],
    queryFn: async () => {
      if (!selectedFileForView) return null;
      const response = await apiRequest<{ content: string; preview: string }>(`/api/uploader/${selectedFileForView.id}/content`, {
        method: 'GET'
      });
      return response;
    },
    enabled: !!selectedFileForView && ['uploaded', 'identified', 'encoding', 'encoded', 'processing', 'completed'].includes(selectedFileForView.currentPhase || ''),
    refetchOnWindowFocus: false
  });

  return (
    <MainLayout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <div>
              <h1 className="text-3xl font-bold">MMS Uploader</h1>
              <p className="text-muted-foreground">
                Session-controlled 3-phase upload system (started → uploading → uploaded)
              </p>
            </div>
            <Link href="/storage-management">
              <Button variant="outline" size="sm" className="flex items-center gap-2 text-purple-600 border-purple-200 hover:bg-purple-50">
                <HardDrive className="h-4 w-4" />
                Storage Management
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="flex gap-4">
          {/* Replit Object Storage Status */}
          <Card className="p-4 border-2 border-blue-200 bg-blue-50">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-lg font-bold text-blue-700">
                  {storageConfig?.available ? '✅ Replit Storage' : '❌ Storage Offline'}
                </div>
                <div className="text-sm text-blue-600">
                  Bucket: {storageConfig?.bucket || 'default-replit-bucket'}
                </div>
                <div className="text-xs text-blue-500">
                  Folder: dev-uploader/
                  {storageConfig?.fileCount !== undefined && (
                    <span className="ml-2">({storageConfig.fileCount} files)</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="text-2xl font-bold text-blue-600" title={`API shows ${totalUploads} recent uploads, Storage shows ${storageConfig?.fileCount || 0} total files`}>
              {storageConfig?.fileCount || totalUploads}
            </div>
            <div className="text-sm text-muted-foreground">Total Files</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{completedUploads}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600">{warningUploads}</div>
            <div className="text-sm text-muted-foreground">Warning/Failed</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-purple-600">{activeUploads}</div>
            <div className="text-sm text-muted-foreground">Actively Uploading</div>
          </Card>
          {processingUploads > 0 && (
            <Card className="p-4">
              <div className="text-2xl font-bold text-orange-600">{processingUploads}</div>
              <div className="text-sm text-muted-foreground">Pending Processing</div>
            </Card>
          )}
        </div>
      </div>

      {/* Real-time Upload Progress Banner */}
      {(activeUploads > 0 || processingUploads > 0) && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="font-medium text-blue-800">
                    {activeUploads > 0 && `${activeUploads} files actively uploading`}
                    {activeUploads > 0 && processingUploads > 0 && ', '}
                    {processingUploads > 0 && `${processingUploads} files pending processing`}
                  </span>
                </div>
                <div className="text-sm text-blue-600">
                  Auto-upload system {activeUploads > 0 ? 'uploading' : 'monitoring'} files in background
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress 
                  value={totalUploads > 0 ? Math.round((completedUploads / totalUploads) * 100) : 0} 
                  className="w-32"
                />
                <span className="text-sm text-blue-600 font-medium">
                  {totalUploads > 0 ? Math.round((completedUploads / totalUploads) * 100) : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="sub-terminals">Sub Terminals</TabsTrigger>
          <TabsTrigger value="encoding">Stage 5: Encoding</TabsTrigger>
          <TabsTrigger value="storage-browse">Storage Browse</TabsTrigger>
          <TabsTrigger value="monitor">Processing Monitor</TabsTrigger>
          <TabsTrigger value="phases">Phase Details</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                File Upload
              </CardTitle>
              <CardDescription>
                Session-controlled upload to phases 1-3 (started → uploading → uploaded)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {/* File Type Selection - Light Bulb Buttons */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Quick Select:</label>
                  <div className="flex flex-wrap gap-2">
                    {FILE_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => {
                          console.log(`[AUTO-UPLOAD-DEBUG] File type selected: ${type.value}, Files already selected: ${selectedFiles?.length || 0}`);
                          setSelectedFileType(type.value);
                          // Auto-start upload if files are already selected
                          if (selectedFiles && selectedFiles.length > 0) {
                            console.log(`[AUTO-UPLOAD-DEBUG] Triggering auto-upload for ${selectedFiles.length} files after file type selection`);
                            setTimeout(() => handleStartUpload(selectedFiles), 100); // Pass files directly
                          } else {
                            console.log(`[AUTO-UPLOAD-DEBUG] Auto-upload not triggered - no files selected yet`);
                          }
                        }}
                        className={`
                          relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105
                          ${selectedFileType === type.value 
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }
                        `}
                        title={type.description}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`
                            w-2 h-2 rounded-full transition-all duration-300
                            ${selectedFileType === type.value 
                              ? 'bg-white animate-pulse' 
                              : 'bg-gray-400'
                            }
                          `} />
                          {type.label}
                        </div>
                        
                        {selectedFileType === type.value && (
                          <div className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-20" />
                        )}
                      </button>
                    ))}
                  </div>
                  
                  {selectedFileType && (
                    <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded-md border-l-4 border-blue-500">
                      {FILE_TYPES.find(t => t.value === selectedFileType)?.description}
                    </div>
                  )}
                </div>

                {/* File Upload Zone */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Files</label>
                  
                  {/* Drop Zone */}
                  <div className="relative">
                    <div 
                      className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors duration-300 bg-blue-50/30 hover:bg-blue-50/50 cursor-pointer group"
                      onClick={() => document.getElementById('file-input')?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                        const files = e.dataTransfer?.files;
                        if (files) {
                          console.log(`[AUTO-UPLOAD-DEBUG] Files dropped: ${files.length}, File type: ${selectedFileType}`);
                          setSelectedFiles(files);
                          // Auto-start upload if file type is already selected
                          if (selectedFileType) {
                            console.log(`[AUTO-UPLOAD-DEBUG] Triggering auto-upload for ${files.length} dropped files`);
                            setTimeout(() => handleStartUpload(files), 100); // Pass files directly to avoid React state timing issues
                          } else {
                            console.log(`[AUTO-UPLOAD-DEBUG] Auto-upload not triggered - no file type selected`);
                          }
                        }
                      }}
                    >
                      {/* Animated Bag Icon */}
                      <div className="mb-4">
                        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <svg 
                            className="w-8 h-8 text-blue-500 group-hover:animate-bounce" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={1.5}
                              d="M7 3V1.5C7 1.22 7.22 1 7.5 1h9c.28 0 .5.22.5.5V3M19 5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM12 10v6M9 13l3-3 3 3"
                            />
                          </svg>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-gray-700">File Upload Zone</h3>
                        <p className="text-sm text-gray-500">
                          Drag & drop files here, or click to select
                        </p>
                        
                        {/* Browse Files Button */}
                        <div className="pt-2">
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors duration-200">
                            <Upload className="h-4 w-4" />
                            Browse Files
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Hidden File Input */}
                    <input
                      id="file-input"
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      accept={selectedFileType === 'tddf' ? '.TSYSO,.tsyso' : selectedFileType === 'mastercard_di' ? '.xlms,.xlsx' : '.csv'}
                    />
                  </div>
                  
                  {selectedFiles && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">
                          {selectedFiles.length} file(s) selected
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {Array.from(selectedFiles).map((file, index) => (
                          <div key={index} className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                            {file.name} ({Math.round(file.size / 1024)}KB)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Review Mode Switch */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Pause className="h-5 w-5 text-amber-600" />
                      <div>
                        <div className="font-medium text-amber-800">Keep for Review</div>
                        <div className="text-sm text-amber-600">
                          Hold uploads for manual review instead of auto-processing
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={keep}
                      onCheckedChange={setKeep}
                      className="data-[state=checked]:bg-amber-500"
                    />
                  </div>
                  
                  {keep && (
                    <div className="text-xs text-amber-700 bg-amber-100 p-2 rounded border-l-4 border-amber-500">
                      <strong>Review Mode Active:</strong> Files will be uploaded but held at "uploaded" phase for manual review and approval before processing.
                    </div>
                  )}
                </div>

                {/* Auto 4-5 Toggle Button */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Lightbulb className={`h-5 w-5 ${auto45Enabled ? 'text-green-600' : 'text-gray-400'}`} />
                      <div>
                        <div className="font-medium text-blue-800">Auto 4-5</div>
                        <div className="text-sm text-blue-600">
                          Automatic identification and encoding (steps 4-5)
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={auto45Enabled}
                      onCheckedChange={(enabled) => {
                        // Update local state immediately for responsive UI
                        setAuto45Enabled(enabled);
                        // Make API call to sync with server
                        auto45ToggleMutation.mutate(enabled);
                      }}
                      className="data-[state=checked]:bg-green-500"
                      disabled={auto45ToggleMutation.isPending}
                    />
                  </div>
                  
                  {!auto45Enabled && (
                    <div className="text-xs text-gray-700 bg-gray-100 p-2 rounded border-l-4 border-gray-500">
                      <strong>Manual Processing:</strong> Files will stop at "uploaded" phase and require manual triggering for identification and encoding steps.
                      <br/>
                      <span className="text-blue-600 font-medium">→ Go to Files tab and select uploaded files to see the green "Identify" button, then select identified files to see the blue "Encode" button.</span>
                    </div>
                  )}
                </div>

              </div>
              
              {startUploadMutation.error && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Error starting upload: {(startUploadMutation.error as Error).message}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Live Upload Progress */}
          {uploads && uploads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Live Upload Progress
                </CardTitle>
                <CardDescription>Real-time status of your uploaded files</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {uploads.slice(0, 10).map((upload) => {
                    const Icon = getPhaseIcon(upload.currentPhase || 'started');
                    const phaseColor = getPhaseColor(upload.currentPhase || 'started');
                    
                    return (
                      <div key={upload.id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50/50">
                        <Icon className={`h-5 w-5 text-${phaseColor}-600`} />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{upload.filename}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(upload.fileSize || 0)} • {upload.finalFileType || 'TDDF'}
                            {upload.sessionId && (
                              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                                upload.sessionId === sessionId 
                                  ? 'bg-green-100 text-green-700 border border-green-200' 
                                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}>
                                {upload.sessionId === sessionId ? 'Current Session' : `Session: ${upload.sessionId.split('_')[2]}`}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {/* Upload progress for uploading files */}
                          {upload.currentPhase === 'uploading' && upload.uploadProgress !== null && upload.uploadProgress !== undefined && (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={upload.uploadProgress || 0} className="w-16" />
                              <span className="text-sm">{Math.round(upload.uploadProgress || 0)}%</span>
                            </div>
                          )}

                          <Badge className={`bg-${phaseColor}-100 text-${phaseColor}-800 border-${phaseColor}-200`}>
                            {upload.currentPhase || 'started'}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {uploads.length > 10 && (
                  <div className="text-center pt-3">
                    <p className="text-sm text-muted-foreground">
                      Showing latest 10 uploads. View all in the Files tab below.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Session Control & Monitoring */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Session Control & Monitoring
              </CardTitle>
              <CardDescription>
                Real-time session monitoring with hourly cleanup cycle and upload control
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Session Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-2xl font-bold text-blue-600">{uploads.length}</div>
                  <div className="text-sm text-blue-700">Total Sessions</div>
                </div>
                
                <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-2xl font-bold text-green-600">{uploadsByPhase.uploaded?.length || 0}</div>
                  <div className="text-sm text-green-700">Uploaded Files</div>
                </div>
                
                <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-2xl font-bold text-purple-600">{uploadsByPhase.uploading?.length || 0}</div>
                  <div className="text-sm text-purple-700">Active Uploads</div>
                </div>
                
                <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="text-2xl font-bold text-orange-600">{uploadsByPhase.started?.length || 0}</div>
                  <div className="text-sm text-orange-700">Pending Sessions</div>
                </div>
              </div>

              {/* Last New Data Date Display */}
              <div className="flex justify-center">
                <div className="text-center p-4 bg-teal-50 rounded-lg border border-teal-200 min-w-[250px]">
                  <div className="text-lg font-bold text-teal-600">
                    {lastNewDataDate ? (
                      new Date(lastNewDataDate.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : 'No data'}
                  </div>
                  <div className="text-sm text-teal-700">Last New Data Date</div>
                  {lastNewDataDate?.count && (
                    <div className="text-xs text-teal-600 mt-1">
                      ({lastNewDataDate.count} total uploads)
                    </div>
                  )}
                </div>
              </div>

              {/* Session Control Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-gray-600" />
                    <span className="font-medium text-gray-800">Cleanup Schedule</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>• Orphaned session cleanup: Every hour</p>
                    <p>• Session validation: Automatic</p>
                    <p>• Upload timeout: 10 minutes</p>
                  </div>
                </div>
                
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-gray-600" />
                    <span className="font-medium text-gray-800">System Status</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>• Phase control: Session-based (1-3)</p>
                    <p>• Storage: Replit Object Storage</p>
                    <p>• Environment: Development</p>
                  </div>
                </div>
              </div>

              {/* Active Sessions Display */}
              {(uploadsByPhase.uploading?.length > 0 || uploadsByPhase.started?.length > 0) && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Active Sessions
                  </h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {[...(uploadsByPhase.uploading || []), ...(uploadsByPhase.started || [])].map((upload) => (
                      <div key={upload.id} className="flex items-center justify-between text-sm p-2 bg-white border rounded">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {upload.sessionId || 'No Session'}
                          </Badge>
                          <span className="truncate max-w-[200px]">{upload.filename}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {upload.currentPhase === 'uploading' && upload.uploadProgress !== null && (
                            <div className="flex items-center gap-1">
                              <Progress value={upload.uploadProgress || 0} className="w-12 h-2" />
                              <span className="text-xs">{Math.round(upload.uploadProgress || 0)}%</span>
                            </div>
                          )}
                          <Badge className={`text-xs bg-${getPhaseColor(upload.currentPhase)}-100 text-${getPhaseColor(upload.currentPhase)}-800`}>
                            {upload.currentPhase}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Processing Phases Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Processing Phases</CardTitle>
              <CardDescription>3-phase workflow for file upload and storage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                {PROCESSING_PHASES.slice(0, 3).map((phase, index) => {
                  const Icon = phase.icon;
                  const count = uploadsByPhase[phase.id]?.length || 0;
                  
                  return (
                    <div key={phase.id} className="text-center space-y-2">
                      <div className={`mx-auto w-12 h-12 rounded-full bg-${phase.color}-100 flex items-center justify-center`}>
                        <Icon className={`h-6 w-6 text-${phase.color}-600`} />
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{phase.name}</div>
                        <div className="text-xs text-muted-foreground">{phase.description}</div>
                        <Badge variant="secondary" className="text-xs">
                          {count} files
                        </Badge>
                      </div>
                      {index < 2 && (
                        <div className="hidden lg:block absolute left-full top-1/2 w-4 h-px bg-gray-300" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Orphan File Uploader */}
          <OrphanFileUploader />
        </TabsContent>

        <TabsContent value="sub-terminals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Sub Terminals Management
              </CardTitle>
              <CardDescription>
                Comprehensive terminal-merchant relationship management with fuzzy matching, manual assignment, and merchant creation capabilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Statistics Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-2xl font-bold text-blue-600">{terminals.length}</div>
                  <div className="text-sm text-blue-700">Total Terminals</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-2xl font-bold text-green-600">
                    {terminals.filter(t => t.merchantId && t.merchantId !== 'UNKNOWN').length}
                  </div>
                  <div className="text-sm text-green-700">Matched</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="text-2xl font-bold text-orange-600">
                    {terminals.filter(t => !t.merchantId || t.merchantId === 'UNKNOWN').length}
                  </div>
                  <div className="text-sm text-orange-700">Unmatched</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-2xl font-bold text-purple-600">{merchants.length}</div>
                  <div className="text-sm text-purple-700">Total Merchants</div>
                </div>
              </div>

              {/* Search and Filter Controls */}
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    <Label>Terminal Search:</Label>
                    <Input
                      type="text"
                      placeholder="Search terminals..."
                      value={terminalSearchFilter}
                      onChange={(e) => setTerminalSearchFilter(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label>Merchant Search:</Label>
                    <Input
                      type="text"
                      placeholder="Search merchants..."
                      value={merchantSearchFilter}
                      onChange={(e) => setMerchantSearchFilter(e.target.value)}
                      className="w-48"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={showOnlyUnmatched}
                      onCheckedChange={setShowOnlyUnmatched}
                    />
                    <Label>Show only unmatched terminals</Label>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Dialog open={isCreateMerchantDialogOpen} onOpenChange={setIsCreateMerchantDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Create Merchant
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Merchant</DialogTitle>
                        <DialogDescription>
                          Add a new merchant to enable terminal matching
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="merchant-name">Merchant Name</Label>
                          <Input
                            id="merchant-name"
                            value={newMerchant.name}
                            onChange={(e) => setNewMerchant({ ...newMerchant, name: e.target.value })}
                            placeholder="Enter merchant name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="client-mid">Client MID</Label>
                          <Input
                            id="client-mid"
                            value={newMerchant.clientMID}
                            onChange={(e) => setNewMerchant({ ...newMerchant, clientMID: e.target.value })}
                            placeholder="Enter client MID"
                          />
                        </div>
                        <div>
                          <Label htmlFor="status">Status</Label>
                          <Select value={newMerchant.status} onValueChange={(value) => setNewMerchant({ ...newMerchant, status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Pending">Pending</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setIsCreateMerchantDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button 
                            onClick={() => createMerchantMutation.mutate({
                              id: `merchant_${Date.now()}`,
                              ...newMerchant,
                              createdAt: new Date().toISOString()
                            })}
                            disabled={createMerchantMutation.isPending || !newMerchant.name}
                          >
                            {createMerchantMutation.isPending ? 'Creating...' : 'Create Merchant'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Terminals Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Terminal ID</TableHead>
                      <TableHead>Terminal Name</TableHead>
                      <TableHead>POS Merchant #</TableHead>
                      <TableHead>Current Merchant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {terminals
                      .filter(terminal => {
                        // Apply search filters
                        const matchesTerminalSearch = !terminalSearchFilter || 
                          terminal.terminalId?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                          terminal.terminalName?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                          terminal.posMerchantNumber?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
                        
                        // Apply unmatched filter
                        const matchesUnmatchedFilter = !showOnlyUnmatched || 
                          (!terminal.merchantId || terminal.merchantId === 'UNKNOWN');

                        return matchesTerminalSearch && matchesUnmatchedFilter;
                      })
                      .slice(0, 50) // Limit to 50 for performance
                      .map((terminal) => {
                        const currentMerchant = merchants.find(m => m.id === terminal.merchantId);
                        const isDecommissioned = terminal.terminalName?.toLowerCase().includes('decommission') ||
                                               terminal.terminalName?.toLowerCase().includes('decomm') ||
                                               terminal.terminalName?.toLowerCase().includes('inactive');
                        
                        return (
                          <TableRow key={terminal.id}>
                            <TableCell className="font-mono text-sm">{terminal.terminalId}</TableCell>
                            <TableCell>
                              <div className="max-w-[200px] truncate" title={terminal.terminalName}>
                                {terminal.terminalName}
                                {isDecommissioned && (
                                  <Badge variant="outline" className="ml-2 text-xs text-red-600 border-red-200">
                                    Decommissioned
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{terminal.posMerchantNumber}</TableCell>
                            <TableCell>
                              {currentMerchant ? (
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-green-600 border-green-200">
                                    {currentMerchant.name}
                                  </Badge>
                                  {currentMerchant.clientMID && (
                                    <span className="text-xs text-muted-foreground">
                                      ({currentMerchant.clientMID})
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-orange-600 border-orange-200">
                                  Unmatched
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isDecommissioned ? 'destructive' : 'default'}>
                                {isDecommissioned ? 'Decommissioned' : 'Active'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Dialog open={editingTerminal?.id === terminal.id} onOpenChange={(open) => {
                                  if (!open) setEditingTerminal(null);
                                }}>
                                  <DialogTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => setEditingTerminal(terminal)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Assign Merchant to Terminal</DialogTitle>
                                      <DialogDescription>
                                        Select a merchant for terminal: {terminal.terminalName}
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div>
                                        <Label>Current Assignment</Label>
                                        <div className="p-2 bg-gray-50 border rounded">
                                          {currentMerchant ? currentMerchant.name : 'No merchant assigned'}
                                        </div>
                                      </div>
                                      <div>
                                        <Label>Select New Merchant</Label>
                                        <Select onValueChange={(merchantId) => {
                                          updateTerminalMerchantMutation.mutate({
                                            terminalId: terminal.id,
                                            merchantId
                                          });
                                        }}>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Choose a merchant..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="UNKNOWN">Remove Assignment</SelectItem>
                                            {merchants
                                              .filter(m => merchantSearchFilter === '' || 
                                                m.name.toLowerCase().includes(merchantSearchFilter.toLowerCase()) ||
                                                m.clientMID?.toLowerCase().includes(merchantSearchFilter.toLowerCase())
                                              )
                                              .map(merchant => (
                                                <SelectItem key={merchant.id} value={merchant.id}>
                                                  {merchant.name} {merchant.clientMID && `(${merchant.clientMID})`}
                                                </SelectItem>
                                              ))
                                            }
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        <strong>Terminal Details:</strong><br />
                                        ID: {terminal.terminalId}<br />
                                        POS Merchant #: {terminal.posMerchantNumber}<br />
                                        Status: {isDecommissioned ? 'Decommissioned' : 'Active'}
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                                
                                <Link href={`/merchants/create-from-terminal/${terminal.id}`}>
                                  <Button variant="outline" size="sm" title="Create merchant from this terminal">
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary Information */}
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-800">Quick Stats</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Showing:</span> {Math.min(50, terminals.filter(t => {
                      const matchesTerminalSearch = !terminalSearchFilter || 
                        t.terminalId?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                        t.terminalName?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
                      const matchesUnmatchedFilter = !showOnlyUnmatched || (!t.merchantId || t.merchantId === 'UNKNOWN');
                      return matchesTerminalSearch && matchesUnmatchedFilter;
                    }).length)} terminals
                  </div>
                  <div>
                    <span className="font-medium">Match Rate:</span> {terminals.length > 0 ? 
                      Math.round((terminals.filter(t => t.merchantId && t.merchantId !== 'UNKNOWN').length / terminals.length) * 100)
                    : 0}%
                  </div>
                  <div>
                    <span className="font-medium">Decommissioned:</span> {terminals.filter(t => 
                      t.terminalName?.toLowerCase().includes('decommission') ||
                      t.terminalName?.toLowerCase().includes('decomm') ||
                      t.terminalName?.toLowerCase().includes('inactive')
                    ).length}
                  </div>
                  <div>
                    <span className="font-medium">Available Merchants:</span> {merchants.length}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="encoding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Stage 5: TDDF JSON Encoding
              </CardTitle>
              <CardDescription>
                Convert TDDF files to structured JSON records with field separation and validation. Setup phase only - no actual processing yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* TDDF Files Ready for Encoding */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">TDDF Files Ready for Encoding</h3>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                    {uploads.filter(u => u.currentPhase === 'identified' && u.finalFileType === 'tddf').length} files ready
                  </Badge>
                </div>
                
                {uploads.filter(u => u.currentPhase === 'identified' && u.finalFileType === 'tddf').length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Database className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No TDDF files ready for encoding</p>
                    <p className="text-sm">Upload and identify TDDF files first to see them here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploads
                      .filter(u => u.currentPhase === 'identified' && u.finalFileType === 'tddf')
                      .slice(0, 10)
                      .map((upload) => (
                        <div key={upload.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedUploads.includes(upload.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedUploads([...selectedUploads, upload.id]);
                                } else {
                                  setSelectedUploads(selectedUploads.filter(id => id !== upload.id));
                                }
                              }}
                            />
                            <div>
                              <div className="font-medium text-sm">{upload.filename}</div>
                              <div className="text-xs text-gray-600">
                                {formatFileSize(upload.fileSize)} • {upload.lineCount || 0} lines
                                {upload.identifiedAt && (
                                  <span className="ml-2">• Identified {formatDistanceToNow(new Date(upload.identifiedAt))} ago</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-orange-100 text-orange-800">
                              {upload.currentPhase}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 text-blue-600 border-blue-200 hover:bg-blue-50"
                              onClick={() => handleSingleFileEncoding(upload.id)}
                            >
                              <Database className="h-3 w-3 mr-1" />
                              Test Encode
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Bulk Encoding Controls */}
              {uploads.filter(u => u.currentPhase === 'identified' && u.finalFileType === 'tddf').length > 0 && (
                <div className="border-t pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900">Bulk Encoding Operations</h3>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const tddfFiles = uploads.filter(u => u.currentPhase === 'identified' && u.finalFileType === 'tddf');
                            setSelectedUploads(tddfFiles.map(f => f.id));
                          }}
                          disabled={uploads.filter(u => u.currentPhase === 'identified' && u.finalFileType === 'tddf').length === 0}
                        >
                          Select All TDDF
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUploads([])}
                          disabled={selectedUploads.length === 0}
                        >
                          Clear Selection
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {selectedUploads.length} file(s) selected for bulk encoding
                        </div>
                        <div className="text-xs text-gray-600">
                          Strategy: TDDF JSON with field separation and validation
                        </div>
                      </div>
                      <Button
                        variant="default"
                        onClick={() => handleBulkEncoding()}
                        disabled={selectedUploads.length === 0}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Database className="h-4 w-4 mr-2" />
                        Start Bulk Encoding Setup
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Encoding Status Information */}
              <div className="border-t pt-6">
                <h3 className="font-medium text-gray-900 mb-4">Encoding Status Overview</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="text-2xl font-bold text-orange-600">
                      {uploads.filter(u => u.currentPhase === 'identified' && u.finalFileType === 'tddf').length}
                    </div>
                    <div className="text-sm text-orange-700">Ready to Encode</div>
                  </div>
                  
                  <div className="text-center p-4 bg-pink-50 rounded-lg border border-pink-200">
                    <div className="text-2xl font-bold text-pink-600">
                      {uploads.filter(u => u.currentPhase === 'encoding').length}
                    </div>
                    <div className="text-sm text-pink-700">Currently Encoding</div>
                  </div>
                  
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-600">
                      {uploads.filter(u => u.currentPhase === 'encoded' && u.finalFileType === 'tddf').length}
                    </div>
                    <div className="text-sm text-green-700">Encoding Complete</div>
                  </div>
                  
                  <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="text-2xl font-bold text-red-600">
                      {uploads.filter(u => u.currentPhase === 'failed' && u.finalFileType === 'tddf').length}
                    </div>
                    <div className="text-sm text-red-700">Encoding Failed</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage-browse" className="space-y-4">
          {/* Object Storage File Browser */}
          <ObjectStorageFileBrowser />
          
          {/* Existing Storage Object Processor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Storage Browse & Reprocess
              </CardTitle>
              <CardDescription>
                Browse storage objects and reprocess individual files through steps 4-5 (identification and encoding)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StorageObjectProcessor />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          {/* Orphan Files Detector */}
          <OrphanFilesDetector />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                MMS Uploader Files
              </CardTitle>
              <CardDescription>
                Files stored in Replit Object Storage with automatic upload stream offloading (Started → Uploading → Uploaded)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">


              {/* Filters and Controls */}
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <Label>Status:</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="started">Started</SelectItem>
                        <SelectItem value="uploading">Uploading</SelectItem>
                        <SelectItem value="uploaded">Uploaded</SelectItem>
                        <SelectItem value="identified">Identified</SelectItem>
                        <SelectItem value="encoding">Encoding</SelectItem>
                        <SelectItem value="encoded">Encoded</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label>File Type:</Label>
                    <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="tddf">TDDF</SelectItem>
                        <SelectItem value="ach_merchant">ACH Merchant</SelectItem>
                        <SelectItem value="ach_transactions">ACH Transactions</SelectItem>
                        <SelectItem value="mastercard_di">MasterCard DI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label>Filename:</Label>
                    <Input
                      type="text"
                      placeholder="Search filenames..."
                      value={filenameFilter}
                      onChange={(e) => setFilenameFilter(e.target.value)}
                      className="w-48"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label>Sort by:</Label>
                    <Select value={sortBy} onValueChange={(value: 'name' | 'date' | 'size') => setSortBy(value)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="size">Size</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-2"
                    >
                      {sortOrder === 'asc' ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label>Per Page:</Label>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="500">500</SelectItem>
                        <SelectItem value="1000">1000</SelectItem>
                        <SelectItem value="99999">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    {filteredUploads.length} files
                  </Badge>
                </div>
              </div>

              {/* Bulk Selection Controls */}
              {filteredUploads.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedUploads.length === paginatedUploads.length && paginatedUploads.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedUploads(paginatedUploads.map(u => u.id));
                        } else {
                          setSelectedUploads([]);
                        }
                      }}
                    />
                    <Label className="text-sm">Select all on page</Label>
                  </div>
                  
                  {selectedUploads.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-muted-foreground">
                        {selectedUploads.length} selected
                      </div>
                      
                      {/* Delete Button */}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={bulkDeleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {bulkDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedUploads.length}`}
                      </Button>

                      {/* Identify Button - only show when Auto 4-5 is disabled and uploaded files are selected */}
                      {!auto45Enabled && selectedUploads.some(id => {
                        const upload = uploads.find(u => u.id === id);
                        return upload && upload.currentPhase === 'uploaded';
                      }) && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleManualIdentify}
                          disabled={manualIdentifyMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Search className="h-4 w-4 mr-2" />
                          {manualIdentifyMutation.isPending ? 'Identifying...' : `Identify ${selectedUploads.filter(id => {
                            const upload = uploads.find(u => u.id === id);
                            return upload && upload.currentPhase === 'uploaded';
                          }).length}`}
                        </Button>
                      )}

                      {/* Manual Encode Button - only show when Auto 4-5 is disabled and identified files are selected */}
                      {!auto45Enabled && selectedUploads.some(id => {
                        const upload = uploads.find(u => u.id === id);
                        return upload && upload.currentPhase === 'identified';
                      }) && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleManualEncode}
                          disabled={manualEncodeMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Database className="h-4 w-4 mr-2" />
                          {manualEncodeMutation.isPending ? 'Encoding...' : `Encode ${selectedUploads.filter(id => {
                            const upload = uploads.find(u => u.id === id);
                            return upload && upload.currentPhase === 'identified';
                          }).length}`}
                        </Button>
                      )}

                      {/* Set Previous Level Button - show when eligible files are selected */}
                      {selectedUploads.some(id => {
                        const upload = uploads.find(u => u.id === id);
                        return upload && (upload.currentPhase === 'identified' || upload.currentPhase === 'encoded' || upload.currentPhase === 'failed');
                      }) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const eligibleUploads = selectedUploads.filter(id => {
                              const upload = uploads.find(u => u.id === id);
                              return upload && (upload.currentPhase === 'identified' || upload.currentPhase === 'encoded' || upload.currentPhase === 'failed');
                            });
                            if (eligibleUploads.length > 0) {
                              handleSetPreviousLevelSelected();
                            }
                          }}
                          disabled={setPreviousLevelMutation.isPending}
                          className="text-blue-600 border-blue-300 hover:bg-blue-50"
                        >
                          <ChevronLeft className="h-4 w-4 mr-2" />
                          {setPreviousLevelMutation.isPending ? 'Setting...' : `Set Previous ${selectedUploads.filter(id => {
                            const upload = uploads.find(u => u.id === id);
                            return upload && (upload.currentPhase === 'identified' || upload.currentPhase === 'encoded' || upload.currentPhase === 'failed');
                          }).length}`}
                        </Button>
                      )}

                      {/* Cancel Encoding Button - show when encoding files are selected */}
                      {selectedUploads.some(id => {
                        const upload = uploads.find(u => u.id === id);
                        return upload && upload.currentPhase === 'encoding';
                      }) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEncoding}
                          disabled={cancelEncodingMutation.isPending}
                          className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        >
                          <X className="h-4 w-4 mr-2" />
                          {cancelEncodingMutation.isPending ? 'Canceling...' : `Cancel ${selectedUploads.filter(id => {
                            const upload = uploads.find(u => u.id === id);
                            return upload && upload.currentPhase === 'encoding';
                          }).length}`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Files List */}
              <div className="space-y-3">
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">Loading files...</div>
                  </div>
                ) : filteredUploads.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">
                      {statusFilter === 'all' && fileTypeFilter === 'all' 
                        ? 'No MMS uploads found. Upload files to start the 8-phase workflow.'
                        : 'No files match the selected filters.'
                      }
                    </div>
                  </div>
                ) : (
                  paginatedUploads.map((upload) => {
                    const Icon = getPhaseIcon(upload.currentPhase || 'started');
                    const phaseColor = getPhaseColor(upload.currentPhase || 'started');
                    const canViewContent = ['uploaded', 'identified', 'encoding', 'encoded', 'processing', 'completed'].includes(upload.currentPhase || '');
                    
                    return (
                      <div key={upload.id} className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50">
                        <Checkbox
                          checked={selectedUploads.includes(upload.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedUploads(prev => [...prev, upload.id]);
                            } else {
                              setSelectedUploads(prev => prev.filter(id => id !== upload.id));
                            }
                          }}
                        />
                        
                        <div className="flex items-center gap-3 flex-1">
                          <Icon className={`h-5 w-5 text-${phaseColor}-600`} />
                          <div className="flex-1">
                            <div className="font-medium">{upload.filename}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-4">
                              <span>{formatFileSize(upload.fileSize)} • {upload.finalFileType || upload.detectedFileType || upload.userClassifiedType || 'TDDF'}</span>
                              <span>Started {upload.uploadStartedAt ? new Date(upload.uploadStartedAt).toLocaleDateString() + ' ' + new Date(upload.uploadStartedAt).toLocaleTimeString() : 'recently'}</span>
                              <span>Duration: {upload.uploadStartedAt ? formatDuration(upload.uploadStartedAt, upload.uploadedAt || new Date()) : '0s'}</span>
                              {upload.lineCount && upload.lineCount > 0 && <span>{upload.lineCount.toLocaleString()} lines</span>}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {/* Upload progress for uploading files */}
                          {upload.currentPhase === 'uploading' && upload.uploadProgress !== null && upload.uploadProgress !== undefined && (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={upload.uploadProgress || 0} className="w-16" />
                              <span className="text-sm">{Math.round(upload.uploadProgress || 0)}%</span>
                            </div>
                          )}

                          <Badge className={`${upload.currentPhase === 'encoded' ? 'bg-green-100 text-green-800' : `bg-${phaseColor}-100 text-${phaseColor}-800`}`}>
                            {upload.currentPhase === 'encoded' ? 'Encoded' : upload.currentPhase || 'started'}
                          </Badge>
                          
                          {/* Stage 5: Encoding Button (for identified TDDF files) */}
                          {upload.currentPhase === 'identified' && upload.finalFileType === 'tddf' && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={() => handleSingleFileEncoding(upload.id)}
                                title="Start Stage 5 encoding"
                                disabled={encodingProgress[upload.id] > 0 && encodingProgress[upload.id] < 100}
                              >
                                <Database className="h-3 w-3 mr-1" />
                                {encodingProgress[upload.id] > 0 && encodingProgress[upload.id] < 100 ? 'Encoding...' : 'Encode'}
                              </Button>
                              
                              {/* Progress Display */}
                              {encodingProgress[upload.id] > 0 && encodingProgress[upload.id] < 100 && (
                                <div className="flex items-center gap-2 min-w-[100px]">
                                  <Progress value={encodingProgress[upload.id]} className="w-16" />
                                  <span className="text-sm">{Math.round(encodingProgress[upload.id])}%</span>
                                </div>
                              )}


                            </div>
                          )}
                          
                          {/* Stage 5: Show JSON Sample for encoded files */}
                          {upload.currentPhase === 'encoded' && upload.finalFileType === 'tddf' && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-green-600 hover:bg-green-50"
                                onClick={() => {
                                  setSelectedUploadForJsonb(upload);
                                  setJsonbViewerOpen(true);
                                }}
                                title="View JSONB"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          {/* No JSONB available - show grey closed eye for alignment */}
                          {!(upload.currentPhase === 'encoded' && upload.finalFileType === 'tddf') && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-gray-400 cursor-not-allowed"
                                disabled
                                title="No JSONB data available"
                              >
                                <EyeOff className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          {/* View Contents Button */}
                          {['uploaded', 'identified', 'encoding', 'processing', 'completed', 'encoded'].includes(upload.currentPhase || '') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setSelectedFileForView(upload)}
                              title="View file contents"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination Controls */}
              {filteredUploads.length > itemsPerPage && (
                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {Math.min(currentPage * itemsPerPage + 1, filteredUploads.length)} to {Math.min((currentPage + 1) * itemsPerPage, filteredUploads.length)} of {filteredUploads.length} files
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                      disabled={currentPage === 0}
                    >
                      Previous
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: filteredTotalPages }, (_, i) => (
                        <Button
                          key={i}
                          variant={currentPage === i ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(i)}
                          className="w-8 h-8 p-0"
                        >
                          {i + 1}
                        </Button>
                      ))}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(filteredTotalPages - 1, prev + 1))}
                      disabled={currentPage === filteredTotalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Processing Monitor</CardTitle>
              <CardDescription>Monitor and track file processing status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Processing monitor functionality coming soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Phase Details</CardTitle>
              <CardDescription>Detailed information about each processing phase</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {PROCESSING_PHASES.map((phase) => {
                  const Icon = phase.icon;
                  return (
                    <div key={phase.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Icon className={`h-5 w-5 text-${phase.color}-600`} />
                      <div>
                        <div className="font-medium">{phase.name}</div>
                        <div className="text-sm text-muted-foreground">{phase.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>

      {/* File Content Viewer Dialog */}
      <Dialog open={!!selectedFileForView} onOpenChange={() => setSelectedFileForView(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {(selectedFileForView as any)?.showJsonSample ? 'TDDF JSON Sample' : 'File Contents'}
            </DialogTitle>
            <DialogDescription>
              Viewing: {selectedFileForView?.filename} ({formatFileSize(selectedFileForView?.fileSize)})
              {(selectedFileForView as any)?.showJsonSample && ' - JSON Sample with highlighted Record Identifier fields'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 overflow-auto">
            {(selectedFileForView as any)?.showJsonSample && (selectedFileForView as any)?.encodingResult ? (
              /* JSON Sample Display with TddfJsonViewer */
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-800 mb-2">
                    Encoding Results: {(selectedFileForView as any).encodingResult.message}
                  </div>
                  {(selectedFileForView as any).encodingResult.encodingTimeMs && (
                    <div className="text-xs text-blue-600">
                      Processing time: {(selectedFileForView as any).encodingResult.encodingTimeMs}ms
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="bg-gray-50 border rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">JSON Sample:</div>
                    <pre className="text-xs bg-white border rounded p-3 max-h-96 overflow-auto">
                      {JSON.stringify((selectedFileForView as any).encodingResult.jsonSample, null, 2)}
                    </pre>
                  </div>
                  <div className="bg-gray-50 border rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Record Type Breakdown:</div>
                    <pre className="text-xs bg-white border rounded p-3">
                      {JSON.stringify((selectedFileForView as any).encodingResult.recordTypeBreakdown, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ) : isLoadingContent ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading file contents...</div>
              </div>
            ) : fileContent ? (
              <div className="space-y-4">
                {/* 2-line preview box */}
                <div className="bg-gray-50 border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Preview (First 2 lines):</div>
                  <div className="font-mono text-sm bg-white border rounded p-3 min-h-[4rem] whitespace-pre-wrap">
                    {fileContent.preview || fileContent.content?.split('\n').slice(0, 2).join('\n') || 'No preview available'}
                  </div>
                </div>
                
                {/* Full content */}
                <div className="bg-gray-50 border rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Full Content:</div>
                  <div className="font-mono text-xs bg-white border rounded p-3 max-h-96 overflow-auto whitespace-pre-wrap">
                    {fileContent.content || 'Content not available'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Content not available for this file
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* JSONB Data Viewer Modal */}
      {selectedUploadForJsonb && (
        <TddfJsonViewer
          uploadId={selectedUploadForJsonb.id}
          filename={selectedUploadForJsonb.filename}
          isOpen={jsonbViewerOpen}
          onClose={() => {
            setJsonbViewerOpen(false);
            setSelectedUploadForJsonb(null);
          }}
        />
      )}
    </MainLayout>
  );
}
