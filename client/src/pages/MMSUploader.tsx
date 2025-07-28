import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Search, Database, CheckCircle, AlertCircle, Clock, Play, Settings, Zap } from 'lucide-react';
import { UploaderUpload } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';

// 8-State Processing Workflow
const PROCESSING_PHASES = [
  { id: 'started', name: 'Started', icon: Play, color: 'blue', description: 'Upload initialized' },
  { id: 'uploading', name: 'Uploading', icon: Upload, color: 'purple', description: 'File transfer in progress' },
  { id: 'uploaded', name: 'Uploaded', icon: FileText, color: 'green', description: 'File stored temporarily' },
  { id: 'identified', name: 'Identified', icon: Search, color: 'orange', description: 'File type detected and analyzed' },
  { id: 'queued', name: 'Queued', icon: Clock, color: 'yellow', description: 'Ready for processing' },
  { id: 'processing', name: 'Processing', icon: Database, color: 'indigo', description: 'Data being processed' },
  { id: 'completed', name: 'Completed', icon: CheckCircle, color: 'green', description: 'Successfully processed' },
  { id: 'failed', name: 'Failed', icon: AlertCircle, color: 'red', description: 'Processing failed' }
];

// Supported file types
const FILE_TYPES = [
  { value: 'merchant', label: 'Merchant Records', description: 'Merchant account data and profiles' },
  { value: 'tddf', label: 'TDDF Records', description: 'Transaction Detail Data Format files' },
  { value: 'terminal', label: 'Terminal Records (.csv)', description: 'Terminal configuration and settings' },
  { value: 'merchant_risk', label: 'Merchant Risk Files', description: 'Risk assessment and compliance data' },
  { value: 'mastercard_integrity', label: 'MasterCard Data Integrity', description: 'MasterCard compliance and integrity records' }
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

const formatDuration = (startTime: string, endTime?: string): string => {
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
  const [selectedFileType, setSelectedFileType] = useState<string>('');
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [sessionId] = useState(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // Query for all uploads
  const { data: uploads = [], isLoading } = useQuery<UploaderUpload[]>({
    queryKey: ['/api/uploader'],
    refetchInterval: 3000 // Refresh every 3 seconds for real-time updates
  });

  // Start upload mutation
  const startUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await apiRequest('POST', '/api/uploader/start', {
        filename: file.name,
        fileSize: file.size,
        sessionId
      });
      return response.json();
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
      const response = await apiRequest('POST', `/api/uploader/${uploadId}/phase/${phase}`, phaseData || {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    }
  });

  // Auto processing mutation
  const autoProcessMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/uploader/auto-process', {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(event.target.files);
  };

  const handleStartUpload = async () => {
    if (!selectedFiles || !selectedFileType) return;
    
    for (const file of Array.from(selectedFiles)) {
      const uploadResponse = await startUploadMutation.mutateAsync(file);
      
      // If auto processing is enabled, automatically progress through phases
      if (autoProcessing && uploadResponse.id) {
        try {
          // Progress through the phases automatically
          await updatePhaseMutation.mutateAsync({ 
            uploadId: uploadResponse.id, 
            phase: 'uploading', 
            phaseData: { fileType: selectedFileType } 
          });
        } catch (error) {
          console.error('Auto processing error:', error);
        }
      }
    }
    
    setSelectedFiles(null);
    setSelectedFileType('');
    // Reset file input
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleAutoProcess = () => {
    autoProcessMutation.mutate();
  };

  // Group uploads by phase
  const uploadsByPhase = uploads.reduce((acc, upload) => {
    const phase = upload.currentPhase || 'started';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(upload);
    return acc;
  }, {} as Record<string, UploaderUpload[]>);

  // Calculate overall statistics
  const totalUploads = uploads.length;
  const completedUploads = uploadsByPhase.completed?.length || 0;
  const failedUploads = uploadsByPhase.failed?.length || 0;
  const activeUploads = totalUploads - completedUploads - failedUploads;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MMS Uploader</h1>
          <p className="text-muted-foreground">
            Parallel file processing system with 8-state workflow tracking
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
            <div className="text-2xl font-bold text-red-600">{failedUploads}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-purple-600">{activeUploads}</div>
            <div className="text-sm text-muted-foreground">Processing</div>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
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
                        onClick={() => setSelectedFileType(type.value)}
                        className={`
                          relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105
                          ${selectedFileType === type.value 
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`
                            w-2 h-2 rounded-full transition-all duration-300
                            ${selectedFileType === type.value 
                              ? 'bg-white animate-pulse' 
                              : 'bg-gray-400'
                            }
                          `} />
                          {type.label.replace(' Records', '').replace(' Files', '')}
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

                {/* File Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Files</label>
                  <Input
                    id="file-input"
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="cursor-pointer"
                  />
                  {selectedFiles && (
                    <div className="text-sm text-muted-foreground">
                      {selectedFiles.length} file(s) selected
                    </div>
                  )}
                </div>

                {/* Auto Processing Toggle */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="auto-processing"
                    checked={autoProcessing}
                    onChange={(e) => setAutoProcessing(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="auto-processing" className="text-sm font-medium">
                    Enable Auto Processing
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Automatically progress through workflow phases
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleStartUpload}
                  disabled={!selectedFiles || !selectedFileType || startUploadMutation.isPending}
                  className="flex-1"
                >
                  {startUploadMutation.isPending ? 'Starting...' : 'Start Upload'}
                </Button>
                
                <Button 
                  onClick={handleAutoProcess}
                  disabled={autoProcessMutation.isPending || uploads.length === 0}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Zap className="h-4 w-4" />
                  {autoProcessMutation.isPending ? 'Processing...' : 'Auto Process'}
                </Button>
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
              <CardDescription>8-state workflow for comprehensive file processing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {PROCESSING_PHASES.map((phase, index) => {
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
                      {index < PROCESSING_PHASES.length - 1 && (
                        <div className="hidden lg:block absolute left-full top-1/2 w-4 h-px bg-gray-300" />
                      )}
                    </div>
                  );
                })}
              </div>
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
                  <div className="text-muted-foreground">No uploads found</div>
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
  );
}