import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Upload, FileText, Search, Database, CheckCircle, AlertCircle, Clock, Play, Settings, Zap, Filter, Eye, MoreVertical, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { UploaderUpload } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import MainLayout from '@/components/layout/MainLayout';

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

export default function MMSUploader() {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>('tddf');
  const [activeTab, setActiveTab] = useState('upload');
  const [sessionId] = useState(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // Files tab state
  const [statusFilter, setStatusFilter] = useState('all');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [selectedFileForView, setSelectedFileForView] = useState<UploaderUpload | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0); // 0-based for array indexing
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Bulk delete state
  const [selectedUploads, setSelectedUploads] = useState<string[]>([]);

  // Query for MMS uploads only (separate system from /uploads)
  const { data: uploads = [], isLoading } = useQuery<UploaderUpload[]>({
    queryKey: ['/api/uploader'],
    refetchInterval: 3000 // Refresh every 3 seconds for real-time updates
  });

  // Start upload mutation
  const startUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await apiRequest<UploaderUploadWithPresigned>('/api/uploader/start', {
        method: 'POST',
        body: {
          filename: file.name,
          fileSize: file.size,
          sessionId
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

  // Filter uploads based on status and file type
  const filteredUploads = uploads.filter(upload => {
    const statusMatch = statusFilter === 'all' || upload.currentPhase === statusFilter;
    const typeMatch = fileTypeFilter === 'all' || upload.finalFileType === fileTypeFilter;
    return statusMatch && typeMatch;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredUploads.length / itemsPerPage);
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setSelectedFiles(files);
    
    console.log(`[AUTO-UPLOAD-DEBUG] Files selected: ${files?.length || 0}, File type: ${selectedFileType}`);
    
    // Auto-start upload if files are selected and file type is chosen
    if (files && files.length > 0 && selectedFileType) {
      console.log(`[AUTO-UPLOAD-DEBUG] Triggering auto-upload for ${files.length} files`);
      setTimeout(() => handleStartUpload(files), 100); // Pass files directly to avoid React state timing issues
      
      // Backup trigger in case the first one doesn't work
      setTimeout(() => {
        console.log(`[AUTO-UPLOAD-DEBUG] Backup trigger: Starting upload for ${files.length} files`);
        handleStartUpload(files);
      }, 500);
    } else {
      console.log(`[AUTO-UPLOAD-DEBUG] Auto-upload not triggered - missing files or file type`);
    }
  };

  const handleStartUpload = async (filesToUpload?: FileList | null) => {
    const files = filesToUpload || selectedFiles;
    if (!files || !selectedFileType) {
      console.log(`[AUTO-UPLOAD-DEBUG] handleStartUpload called but missing requirements - Files: ${files?.length || 0}, Type: ${selectedFileType}`);
      return;
    }
    
    console.log(`[AUTO-UPLOAD-DEBUG] handleStartUpload starting for ${files.length} files of type ${selectedFileType}`);
    
    for (const file of Array.from(files)) {
      try {
        console.log(`[REPLIT-UPLOAD-PHASE-1] Starting Replit Object Storage upload for: ${file.name}`);
        
        // Phase 1: Create database record with storage key
        const uploadResponse = await startUploadMutation.mutateAsync(file);
        console.log(`[REPLIT-UPLOAD-PHASE-1] Created DB record with storage key: ${uploadResponse.id}`);
        
        if (uploadResponse?.id && uploadResponse.storageKey) {
          // Phase 2: Server-side upload to Replit Object Storage
          const formData = new FormData();
          formData.append('file', file);
          
          const uploadApiResponse = await fetch(`/api/uploader/${uploadResponse.id}/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });
          
          if (!uploadApiResponse.ok) {
            throw new Error(`Replit storage upload failed: ${uploadApiResponse.statusText}`);
          }
          
          console.log(`[REPLIT-UPLOAD-PHASE-2] Server-side upload to Replit Object Storage successful: ${uploadResponse.id}`);
          
          // Phase 3: Finalize Replit Object Storage upload
          const finalizeResponse = await fetch(`/api/uploader/${uploadResponse.id}/finalize`, {
            method: 'POST',
            credentials: 'include'
          });
          
          if (!finalizeResponse.ok) {
            throw new Error(`Phase 3 failed: ${finalizeResponse.statusText}`);
          }
          
          console.log(`[REPLIT-UPLOAD-PHASE-3] Finalized Replit Object Storage upload: ${uploadResponse.id}`);
        }
      } catch (error) {
        console.error('Replit Object Storage upload error:', error);
      }
    }
    
    setSelectedFiles(null);
    // Reset file input
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
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
  const completedUploads = uploadsByPhase.completed?.length || 0;
  const warningUploads = uploadsByPhase.warning?.length || 0;
  const activeUploads = totalUploads - completedUploads - warningUploads;

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(0);
  }, [statusFilter, fileTypeFilter, itemsPerPage]);

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
    enabled: !!selectedFileForView && ['uploaded', 'identified', 'encoding', 'processing', 'completed'].includes(selectedFileForView.currentPhase || ''),
    refetchOnWindowFocus: false
  });

  return (
    <MainLayout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MMS Uploader</h1>
          <p className="text-muted-foreground">
            Advanced 8-phase file processing system (separate from main /uploads page)
          </p>
        </div>
        
        <div className="flex gap-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-blue-600">{totalUploads}</div>
            <div className="text-sm text-muted-foreground">Total Uploads</div>
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
            <div className="text-sm text-muted-foreground">Processing</div>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
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
                Select files to start the 8-phase processing workflow
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
                            
                            // Backup trigger in case the first one doesn't work
                            setTimeout(() => {
                              console.log(`[AUTO-UPLOAD-DEBUG] Backup trigger: Starting upload for ${files.length} dropped files`);
                              handleStartUpload(files);
                            }, 500);
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
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                MMS Uploader Files
              </CardTitle>
              <CardDescription>
                View and manage files in the 3-phase upload system (Started → Uploading → Uploaded)
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
                    <Label>Per Page:</Label>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {selectedUploads.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleBulkDelete()}
                      disabled={bulkDeleteMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {bulkDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedUploads.length} files`}
                    </Button>
                  )}
                  
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
                    <div className="text-sm text-muted-foreground">
                      {selectedUploads.length} selected
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
                    const canViewContent = upload.currentPhase === 'uploaded';
                    
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
                              <span>{formatFileSize(upload.fileSize)} • {upload.finalFileType || 'Unknown type'}</span>
                              <span>Started {formatDuration(upload.startTime)}</span>
                              {upload.lineCount && <span>{upload.lineCount.toLocaleString()} lines</span>}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {/* Upload progress for uploading files */}
                          {upload.currentPhase === 'uploading' && upload.uploadProgress && (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={upload.uploadProgress} className="w-16" />
                              <span className="text-sm">{upload.uploadProgress}%</span>
                            </div>
                          )}

                          <Badge className={`bg-${phaseColor}-100 text-${phaseColor}-800`}>
                            {upload.currentPhase || 'started'}
                          </Badge>
                          
                          {/* View Content Button for uploaded files */}
                          {canViewContent && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setSelectedFileForView(upload)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[80vh]">
                                <DialogHeader>
                                  <DialogTitle>File Contents: {upload.filename}</DialogTitle>
                                  <DialogDescription>
                                    Phase: {upload.currentPhase} • {formatFileSize(upload.fileSize)} • {upload.lineCount || 0} lines
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="mt-4">
                                  {isLoadingContent ? (
                                    <div className="text-center py-8">
                                      <div className="text-muted-foreground">Loading file contents...</div>
                                    </div>
                                  ) : fileContent ? (
                                    <div className="space-y-4">
                                      {fileContent.preview && (
                                        <div>
                                          <h4 className="font-medium mb-2">File Preview (first 50 lines):</h4>
                                          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96 font-mono">
                                            {fileContent.preview}
                                          </pre>
                                        </div>
                                      )}
                                      
                                      <div className="flex gap-2">
                                        <Button 
                                          variant="outline" 
                                          onClick={() => {
                                            const blob = new Blob([fileContent.content], { type: 'text/plain' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = upload.filename;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                          }}
                                        >
                                          Download Full File
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-center py-8">
                                      <div className="text-muted-foreground">File content not available</div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
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
                      {Array.from({ length: totalPages }, (_, i) => (
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
                      onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                      disabled={currentPage === totalPages - 1}
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
              <CardTitle>Active Processing Monitor</CardTitle>
              <CardDescription>Real-time view of file processing status</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="text-muted-foreground">Loading uploads...</div>
                </div>
              ) : uploads.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-muted-foreground">No MMS uploads found. Use the upload form above to start processing files through the 8-phase workflow.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {uploads.slice(0, 20).map((upload) => {
                    const Icon = getPhaseIcon(upload.currentPhase || 'started');
                    const phaseColor = getPhaseColor(upload.currentPhase || 'started');
                    
                    return (
                      <div key={upload.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Icon className={`h-5 w-5 text-${phaseColor}-600`} />
                          <div>
                            <div className="font-medium">{upload.filename}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatFileSize(upload.fileSize)} • Started {formatDuration(upload.startTime)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Badge className={`bg-${phaseColor}-100 text-${phaseColor}-800`}>
                            {upload.currentPhase || 'started'}
                          </Badge>
                          
                          {upload.uploadProgress && upload.uploadProgress > 0 && (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={upload.uploadProgress} className="w-16" />
                              <span className="text-sm">{upload.uploadProgress}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {PROCESSING_PHASES.map((phase) => {
              const phaseUploads = uploadsByPhase[phase.id] || [];
              const Icon = phase.icon;
              
              return (
                <Card key={phase.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 text-${phase.color}-600`} />
                      {phase.name}
                      <Badge variant="secondary">{phaseUploads.length}</Badge>
                    </CardTitle>
                    <CardDescription>{phase.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {phaseUploads.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No files in this phase</div>
                    ) : (
                      <div className="space-y-2">
                        {phaseUploads.slice(0, 5).map((upload) => (
                          <div key={upload.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="text-sm font-medium truncate">
                              {upload.filename}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDuration(upload.startTime)}
                            </div>
                          </div>
                        ))}
                        {phaseUploads.length > 5 && (
                          <div className="text-xs text-muted-foreground text-center">
                            ...and {phaseUploads.length - 5} more
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </MainLayout>
  );
}