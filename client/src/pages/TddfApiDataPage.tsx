import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Database, Key, Settings, Monitor, Download, FileText, Search, Filter, Eye, Copy, Check, Trash2, CheckSquare, Square, Calendar as CalendarIcon, ChevronLeft, ChevronRight, BarChart3, TrendingUp, DollarSign, Activity, ArrowLeft, CheckCircle, AlertCircle, Clock, Play, Zap, MoreVertical, MoreHorizontal, ChevronUp, ChevronDown, Pause, EyeOff, ExternalLink, X, Lightbulb, RefreshCw } from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { TddfApiDailyView } from "@/components/TddfApiDailyView";
import { UploaderUpload } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';
import { formatFileSize, getStatusBadgeVariant, TddfApiFile, TddfApiSchema } from '@/lib/tddf-shared';

// File types for upload
const FILE_TYPES = [
  { value: 'tddf', label: 'TDDF (.TSYSO)', description: 'TSYS Transaction Daily Detail File .TSYSO file 2400 or 0830 ex VERMNTSB.6759_TDDF_2400_07112025_003301.TSYSO' },
  { value: 'ach_merchant', label: 'ACH Merchant (.csv)', description: 'Custom Merchant Demographics .csv file' },
  { value: 'ach_transactions', label: 'ACH Transactions (.csv)', description: 'Horizon Core ACH Processing Detail File AH0314P1 .csv file' },
  { value: 'mastercard_di', label: 'MasterCard DI Report (.xlms)', description: 'MasterCard Data Integrity Edit Report records .xlms file' }
];

// Helper functions and interfaces now imported from shared library

// Daily View Interfaces for TDDF API Data
interface TddfApiDailyStats {
  totalFiles: number;
  totalRecords: number;
  totalTransactionValue: number;
  totalNetDeposits?: number;
  totalAuthAmount?: number;
  recordTypeBreakdown: Record<string, number>;
  lastProcessedDate: string | null;
  cached?: boolean;
  cacheDate?: string;
  lastUpdated?: string;
}

interface TddfApiDayBreakdown {
  date: string;
  totalRecords: number;
  recordTypes: Record<string, number>;
  transactionValue: number;
  netDepositsValue?: number;
  authAmountValue?: number;
  batchCount?: number;
  authorizationCount?: number;
  fileCount: number;
  filesProcessed: Array<{
    fileName: string;
    recordCount: number;
    processingTime?: number;
    fileSize?: string;
  }>;
}

interface TddfApiRecentActivity {
  id: string;
  fileName: string;
  recordCount: number;
  processedAt: string;
  status: string;
  importSessionId: string;
}

// Draggable Circles for Daily View
interface DraggableCircle {
  id: string;
  x: number;
  y: number;
  color: string;
  value: string;
  label: string;
  isDragging: boolean;
}

interface TddfApiKey {
  id: number;
  keyName: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  lastUsed?: string;
  requestCount: number;
  rateLimitPerMinute: number;
  createdAt: string;
  expiresAt?: string;
}

export default function TddfApiDataPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedSchema, setSelectedSchema] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  
  // Archive management state
  const [archiveFilters, setArchiveFilters] = useState({
    archiveStatus: 'all',
    step6Status: 'all', 
    businessDayFrom: '',
    businessDayTo: ''
  });
  const [newSchemaData, setNewSchemaData] = useState({
    name: "",
    version: "",
    description: "",
    schemaData: ""
  });
  const [newApiKey, setNewApiKey] = useState({
    keyName: "",
    permissions: ["read"],
    rateLimitPerMinute: 100,
    expiresAt: ""
  });
  const [createdApiKey, setCreatedApiKey] = useState<string>("");
  const [copied, setCopied] = useState(false);
  
  // File selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  
  // File viewer state
  const [viewFileDialog, setViewFileDialog] = useState(false);
  const [selectedFileForView, setSelectedFileForView] = useState<TddfApiFile | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  
  // Date filtering state
  const [dateFilters, setDateFilters] = useState({
    dateFrom: "",
    dateTo: "",
    businessDayFrom: "",
    businessDayTo: "",
    status: ""
  });

  // Uploader functionality state
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<FileList | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>('tddf');
  const [sessionId] = useState(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [keep, setKeep] = useState<boolean>(false);
  const [auto45Enabled, setAuto45Enabled] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [filenameFilter, setFilenameFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('current');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [selectedUploads, setSelectedUploads] = useState<string[]>([]);
  const [uploaderFileForView, setUploaderFileForView] = useState<UploaderUpload | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch schemas
  const { data: schemas = [], isLoading: schemasLoading } = useQuery<TddfApiSchema[]>({
    queryKey: ["/api/tddf-api/schemas"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/schemas", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch schemas');
      return response.json();
    }
  });

  // Fetch files with filtering
  const { data: files = [], isLoading: filesLoading } = useQuery<TddfApiFile[]>({
    queryKey: ["/api/tddf-api/files", dateFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFilters.dateFrom) params.append('dateFrom', dateFilters.dateFrom);
      if (dateFilters.dateTo) params.append('dateTo', dateFilters.dateTo);
      if (dateFilters.businessDayFrom) params.append('businessDayFrom', dateFilters.businessDayFrom);
      if (dateFilters.businessDayTo) params.append('businessDayTo', dateFilters.businessDayTo);
      if (dateFilters.status) params.append('status', dateFilters.status);
      
      const queryString = params.toString();
      const response = await fetch(`/api/tddf-api/files${queryString ? '?' + queryString : ''}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch files');
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });

  // Fetch API keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<TddfApiKey[]>({
    queryKey: ["/api/tddf-api/keys"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/keys", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch API keys');
      return response.json();
    }
  });

  // Fetch processing queue with real-time updates
  const { data: queue = [], isLoading: queueLoading } = useQuery<any[]>({
    queryKey: ["/api/tddf-api/queue"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/queue", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch queue');
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });

  // Fetch archive data
  const { data: archiveData, isLoading: isLoadingArchive, refetch: refetchArchive } = useQuery({
    queryKey: ['/api/tddf-archive', archiveFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (archiveFilters.archiveStatus !== 'all') {
        params.set('archiveStatus', archiveFilters.archiveStatus);
      }
      if (archiveFilters.step6Status !== 'all') {
        params.set('step6Status', archiveFilters.step6Status);
      }
      if (archiveFilters.businessDayFrom) {
        params.set('businessDayFrom', archiveFilters.businessDayFrom);
      }
      if (archiveFilters.businessDayTo) {
        params.set('businessDayTo', archiveFilters.businessDayTo);
      }
      
      const response = await fetch(`/api/tddf-archive?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch archive data');
      }
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });
  
  const archivedFiles = archiveData?.files || [];

  // Fetch uploader files
  const { data: uploaderResponse, isLoading: uploadsLoading } = useQuery({
    queryKey: ["/api/uploader", { 
      status: statusFilter, 
      fileType: fileTypeFilter, 
      filename: filenameFilter,
      environment: environmentFilter,
      sortBy,
      sortOrder,
      limit: itemsPerPage,
      offset: currentPage * itemsPerPage
    }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('phase', statusFilter);
      if (fileTypeFilter !== 'all') params.append('fileType', fileTypeFilter);
      if (filenameFilter) params.append('filename', filenameFilter);
      if (environmentFilter !== 'current') params.append('environment', environmentFilter);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      params.append('limit', itemsPerPage.toString());
      params.append('offset', (currentPage * itemsPerPage).toString());
      
      return apiRequest(`/api/uploader?${params.toString()}`);
    },
    refetchInterval: 5000
  });

  const uploads = (uploaderResponse as any)?.uploads || [];
  const totalCount = (uploaderResponse as any)?.totalCount || 0;

  // Fetch monitoring data
  const { data: monitoring } = useQuery<any>({
    queryKey: ["/api/tddf-api/monitoring"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/monitoring", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch monitoring');
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });

  // Create schema mutation
  const createSchemaMutation = useMutation({
    mutationFn: (schemaData: any) => apiRequest("/api/tddf-api/schemas", {
      method: "POST",
      body: JSON.stringify(schemaData)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/schemas"], exact: false });
      setNewSchemaData({ name: "", version: "", description: "", schemaData: "" });
      toast({ title: "Schema created successfully" });
    }
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: (formData: FormData) => {
      return fetch("/api/tddf-api/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      }).then(res => {
        if (!res.ok) throw new Error("Upload failed");
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/queue"], exact: false });
      setUploadFile(null);
      setShowUploadDialog(false);
      toast({ title: "File uploaded successfully" });
    }
  });

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: (keyData: any) => apiRequest("/api/tddf-api/keys", {
      method: "POST",
      body: JSON.stringify(keyData)
    }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/keys"], exact: false });
      setCreatedApiKey(data?.key || "");
      setNewApiKey({ keyName: "", permissions: ["read"], rateLimitPerMinute: 100, expiresAt: "" });
      toast({ title: "API key created successfully" });
    }
  });


  // Start upload mutation
  const startUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await apiRequest('/api/uploader/start', {
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
      const response = await apiRequest(`/api/uploader/${uploadId}/phase/${phase}`, {
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

  // Delete files mutation
  const deleteFilesMutation = useMutation({
    mutationFn: async (fileIds: number[]) => {
      return apiRequest("/api/tddf-api/files/delete", {
        method: "POST",
        body: JSON.stringify({ fileIds })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
      setSelectedFiles(new Set());
      setShowDeleteDialog(false);
      toast({ title: "Files deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete files", description: error.message, variant: "destructive" });
    }
  });

  const handleSchemaCreate = () => {
    try {
      const parsedSchemaData = JSON.parse(newSchemaData.schemaData);
      createSchemaMutation.mutate({
        ...newSchemaData,
        schemaData: parsedSchemaData
      });
    } catch (error) {
      toast({ title: "Invalid JSON in schema data", variant: "destructive" });
    }
  };

  const handleFileUpload = () => {
    if (!uploadFile) return;
    
    const formData = new FormData();
    formData.append("file", uploadFile);
    if (selectedSchema) {
      formData.append("schemaId", selectedSchema.toString());
    }
    
    uploadFileMutation.mutate(formData);
  };

  const handleCreateApiKey = () => {
    createApiKeyMutation.mutate(newApiKey);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };


  // File selection helper functions
  const toggleFileSelection = (fileId: number) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  const toggleAllFiles = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedFiles.size > 0) {
      deleteFilesMutation.mutate(Array.from(selectedFiles));
    }
  };

  // Upload handler functions
  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSelectedUploadFiles(files);
      if (selectedFileType) {
        setTimeout(() => handleStartUpload(files), 100);
      }
    }
  };

  const handleStartUpload = async (files: FileList) => {
    if (!selectedFileType) {
      toast({ title: "Please select a file type first", variant: "destructive" });
      return;
    }

    for (const file of Array.from(files)) {
      // Create upload session
      const sessionData = {
        sessionId,
        filename: file.name,
        fileSize: file.size,
        fileType: selectedFileType,
        keepForReview: keep,
        auto45Enabled
      };

      try {
        // Start upload session
        const uploadResponse = await startUploadMutation.mutateAsync(file);
        
        if (uploadResponse && typeof uploadResponse === 'object' && 'id' in uploadResponse) {
          const uploadId = (uploadResponse as any).id;
          
          // Upload file to object storage
          const formData = new FormData();
          formData.append('file', file);
          formData.append('sessionId', sessionId);
          
          const uploadApiResponse = await fetch(`/api/uploader/${uploadId}/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });
          
          if (!uploadApiResponse.ok) {
            throw new Error(`Upload failed: ${uploadApiResponse.status}`);
          }
          
          // Update to uploaded status
          await updatePhaseMutation.mutateAsync({
            uploadId: uploadId,
            phase: 'uploaded',
            phaseData: { uploadProgress: 100 }
          });
        }
        
        toast({ title: `${file.name} uploaded successfully` });
      } catch (error) {
        console.error('Upload error:', error);
        toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
      }
    }

    // Reset selection
    setSelectedUploadFiles(null);
    const fileInput = document.getElementById('tddf-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleBulkDelete = () => {
    if (selectedUploads.length > 0) {
      bulkDeleteMutation.mutate(selectedUploads);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0]; // Take the first file
      setUploadFile(file);
    }
  };

  // File viewing handler
  const handleViewFile = async (file: TddfApiFile) => {
    setSelectedFileForView(file);
    setViewFileDialog(true);
    setFileContent("Loading...");
    
    try {
      const response = await fetch(`/api/tddf-api/files/${file.id}/content`);
      if (response.ok) {
        const content = await response.text();
        setFileContent(content);
      } else {
        setFileContent("Error loading file content");
      }
    } catch (error) {
      setFileContent("Error loading file content");
    }
  };


  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TDDF API Data System</h1>
          <p className="text-muted-foreground">
            High-performance position-based flat file processing with dynamic schema configuration
          </p>
        </div>
        <Badge variant="outline">
          {files.length} Files | {schemas.length} Schemas | {apiKeys.length} API Keys
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schemas">Schemas</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">System Overview</h2>
            <Button 
              variant="outline" 
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/queue"], exact: false });
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/monitoring"], exact: false });
                toast({ title: "Data refreshed" });
              }}
              disabled={filesLoading || queueLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{files.length}</div>
                <p className="text-xs text-muted-foreground">
                  {files.filter(f => f.status === "completed").length} processed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Records</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {files.reduce((sum, f) => sum + (f.record_count || 0), 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {files.reduce((sum, f) => sum + (f.processed_records || 0), 0).toLocaleString()} processed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Processing Queue</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{queue.length}</div>
                <p className="text-xs text-muted-foreground">
                  {queue.filter(q => q.status === "processing").length} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Requests</CardTitle>
                <Key className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.total_requests || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 24 hours
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Advanced Analytics Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-xl font-semibold mb-4">Advanced Analytics & Insights</h3>
            
            {/* Key Metrics Dashboard */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Data Volume</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatFileSize(files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across {files.length} files
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Processing Success Rate</CardTitle>
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {files.length > 0 
                      ? ((files.filter(f => f.status === "completed").length / files.length) * 100).toFixed(1)
                      : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {files.filter(f => f.status === "completed").length} of {files.length} files
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average File Size</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {files.length > 0 
                      ? formatFileSize(files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0) / files.length)
                      : "0 B"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Per file average
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Data Quality Score</CardTitle>
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {files.length > 0 
                      ? (100 - (files.filter(f => f.status === "failed" || f.status === "error").length / files.length) * 100).toFixed(1)
                      : 100}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Based on error rate
                  </p>
                </CardContent>
              </Card>
            </div>
            
            {/* Data Distribution Charts */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>File Status Distribution</CardTitle>
                  <CardDescription>Current status of all uploaded files</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {['completed', 'processing', 'uploaded', 'failed', 'error'].map((status) => {
                      const count = files.filter(f => f.status === status).length;
                      const percentage = files.length > 0 ? (count / files.length) * 100 : 0;
                      return (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={getStatusBadgeVariant(status)}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{count} files</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0 flex-1 ml-4">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  status === 'completed' ? 'bg-green-500' :
                                  status === 'processing' ? 'bg-blue-500' :
                                  status === 'uploaded' ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium min-w-[3rem] text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>File Size Distribution</CardTitle>
                  <CardDescription>Distribution of file sizes by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: 'Small (< 1MB)', filter: (f: any) => f.file_size < 1024 * 1024 },
                      { label: 'Medium (1-10MB)', filter: (f: any) => f.file_size >= 1024 * 1024 && f.file_size < 10 * 1024 * 1024 },
                      { label: 'Large (10-100MB)', filter: (f: any) => f.file_size >= 10 * 1024 * 1024 && f.file_size < 100 * 1024 * 1024 },
                      { label: 'Extra Large (100MB+)', filter: (f: any) => f.file_size >= 100 * 1024 * 1024 }
                    ].map((category) => {
                      const count = files.filter(category.filter).length;
                      const percentage = files.length > 0 ? (count / files.length) * 100 : 0;
                      return (
                        <div key={category.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium min-w-[7rem]">{category.label}</span>
                            <span className="text-sm text-muted-foreground">{count} files</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0 flex-1 ml-4">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className="h-2 rounded-full bg-blue-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium min-w-[3rem] text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Data Quality & Records Analysis */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>Record Processing Stats</CardTitle>
                  <CardDescription>Analysis of record counts and processing efficiency</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {files.reduce((sum, f) => sum + (f.record_count || 0), 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Records</div>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {files.reduce((sum, f) => sum + (f.processed_records || 0), 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Processed Records</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing Progress</span>
                        <span>
                          {files.reduce((sum, f) => sum + (f.record_count || 0), 0) > 0 
                            ? ((files.reduce((sum, f) => sum + (f.processed_records || 0), 0) / files.reduce((sum, f) => sum + (f.record_count || 0), 0)) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${files.reduce((sum, f) => sum + (f.record_count || 0), 0) > 0 
                              ? (files.reduce((sum, f) => sum + (f.processed_records || 0), 0) / files.reduce((sum, f) => sum + (f.record_count || 0), 0)) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Average records per file: {files.length > 0 
                        ? Math.round(files.reduce((sum, f) => sum + (f.record_count || 0), 0) / files.length).toLocaleString()
                        : 0}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Upload Trends</CardTitle>
                  <CardDescription>File upload patterns over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {files.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold">
                              {files.filter(f => {
                                const uploadDate = new Date(f.uploaded_at || '');
                                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                                return uploadDate > dayAgo;
                              }).length}
                            </div>
                            <div className="text-xs text-muted-foreground">Last 24 Hours</div>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold">
                              {files.filter(f => {
                                const uploadDate = new Date(f.uploaded_at || '');
                                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                                return uploadDate > weekAgo;
                              }).length}
                            </div>
                            <div className="text-xs text-muted-foreground">Last 7 Days</div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Latest Upload Activity</div>
                          {files.slice(0, 3).map((file) => (
                            <div key={file.id} className="flex items-center justify-between text-xs p-2 bg-muted rounded">
                              <span className="truncate max-w-[60%]">{file.original_name}</span>
                              <span className="text-muted-foreground">
                                {file.uploaded_at ? format(new Date(file.uploaded_at), "MMM d, HH:mm") : "Unknown"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No upload data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Schema Usage Analytics */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Schema Usage Analytics</CardTitle>
                <CardDescription>How different schemas are being utilized across files</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {schemas.length > 0 ? (
                    schemas.map((schema) => {
                      const schemaFiles = files.filter(f => f.schema_name === schema.name);
                      const usagePercentage = files.length > 0 ? (schemaFiles.length / files.length) * 100 : 0;
                      return (
                        <div key={schema.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant={schema.is_active !== false ? "default" : "secondary"}>
                              {schema.name} v{schema.version}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {schemaFiles.length} files
                            </span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0 flex-1 ml-4">
                            <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[200px]">
                              <div 
                                className="h-2 rounded-full bg-purple-500"
                                style={{ width: `${usagePercentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium min-w-[3rem] text-right">
                              {usagePercentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      No schemas available for analysis
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Files</CardTitle>
                <CardDescription>Latest uploaded TDDF files</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {files.slice(0, 5).map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.original_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)} • {file.uploaded_at ? format(new Date(file.uploaded_at), "MMM d, yyyy") : "Unknown"}
                        </p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(file.status)}>
                        {file.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Schemas</CardTitle>
                <CardDescription>Available processing schemas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {schemas.filter(s => s.is_active).slice(0, 5).map((schema) => (
                    <div key={schema.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{schema.name}</p>
                        <p className="text-xs text-muted-foreground">
                          v{schema.version} • Created
                        </p>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schemas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Schema Management</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Database className="mr-2 h-4 w-4" />
                  Create Schema
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Schema</DialogTitle>
                  <DialogDescription>
                    Define a new TDDF processing schema with field mappings
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="schema-name">Name</Label>
                      <Input
                        id="schema-name"
                        value={newSchemaData.name}
                        onChange={(e) => setNewSchemaData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="TDDF Schema Name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="schema-version">Version</Label>
                      <Input
                        id="schema-version"
                        value={newSchemaData.version}
                        onChange={(e) => setNewSchemaData(prev => ({ ...prev, version: e.target.value }))}
                        placeholder="1.0.0"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="schema-description">Description</Label>
                    <Input
                      id="schema-description"
                      value={newSchemaData.description}
                      onChange={(e) => setNewSchemaData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Schema description"
                    />
                  </div>
                  <div>
                    <Label htmlFor="schema-data">Schema Data (JSON)</Label>
                    <Textarea
                      id="schema-data"
                      className="h-40"
                      value={newSchemaData.schemaData}
                      onChange={(e) => setNewSchemaData(prev => ({ ...prev, schemaData: e.target.value }))}
                      placeholder='{"recordTypes": {"DT": {"fields": [...]}}}'
                    />
                  </div>
                  <Button 
                    onClick={handleSchemaCreate}
                    disabled={createSchemaMutation.isPending}
                    className="w-full"
                  >
                    {createSchemaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Schema
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemasLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    schemas.map((schema) => (
                      <TableRow key={schema.id}>
                        <TableCell className="font-medium">{schema.name}</TableCell>
                        <TableCell>{schema.version}</TableCell>
                        <TableCell className="max-w-xs truncate">{schema.description}</TableCell>
                        <TableCell>
                          <Badge variant={schema.is_active !== false ? "default" : "secondary"}>
                            {schema.is_active !== false ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {schema.created_at ? format(new Date(schema.created_at), "MMM d, yyyy") : "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          {/* Combined Upload & Files Tab */}
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">TDDF Upload & Files</h2>
            <Badge variant="outline">
              {uploads.length} Uploads | {files.length} Processed Files
            </Badge>
          </div>

          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                File Upload
              </CardTitle>
              <CardDescription>
                Session-controlled upload for TDDF files to the King database system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {/* File Type Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">File Type:</label>
                  <div className="flex flex-wrap gap-2">
                    {FILE_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => {
                          setSelectedFileType(type.value);
                          if (selectedUploadFiles && selectedUploadFiles.length > 0) {
                            setTimeout(() => handleStartUpload(selectedUploadFiles), 100);
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
                  
                  <div className="relative">
                    <div 
                      className="border-2 border-dashed border-blue-300 rounded-lg p-3 text-center hover:border-blue-400 transition-colors duration-300 bg-blue-50/30 hover:bg-blue-50/50 cursor-pointer group"
                      onClick={() => document.getElementById('tddf-file-input')?.click()}
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
                          setSelectedUploadFiles(files);
                          if (selectedFileType) {
                            setTimeout(() => handleStartUpload(files), 100);
                          }
                        }
                      }}
                    >
                      <div className="flex items-center justify-center space-x-3">
                        <Upload className="h-6 w-6 text-blue-400" />
                        <div>
                          <p className="font-medium text-blue-600">File Upload Zone</p>
                          <p className="text-xs text-blue-500/80">Drag & drop TDDF files here, or click to browse</p>
                        </div>
                        <Button size="sm" className="bg-blue-500 hover:bg-blue-600">
                          <Upload className="h-3 w-3 mr-1" />
                          Browse Files
                        </Button>
                      </div>
                    </div>
                    
                    <input
                      id="tddf-file-input"
                      type="file"
                      multiple
                      onChange={handleUploadFileSelect}
                      className="hidden"
                      accept={selectedFileType === 'tddf' ? '.TSYSO,.tsyso' : selectedFileType === 'mastercard_di' ? '.xlms,.xlsx' : '.csv'}
                    />
                  </div>
                  
                  {selectedUploadFiles && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">
                          {selectedUploadFiles.length} file(s) selected
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {Array.from(selectedUploadFiles).map((file, index) => (
                          <div key={index} className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                            {file.name} ({Math.round(file.size / 1024)}KB)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Auto 6 Json Encode Switch */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Pause className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-medium text-blue-800">Auto 6 Json Encode</div>
                        <div className="text-sm text-blue-600">
                          Enable automatic Step 6 JSON encoding for uploaded files
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={keep}
                      onCheckedChange={setKeep}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Files Management Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Uploaded Files ({uploads.length})</CardTitle>
                  <CardDescription>
                    Files in the upload pipeline system - phases 1-5 processing
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Group Select Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedUploads.length === uploads.length) {
                        setSelectedUploads([]);
                      } else {
                        setSelectedUploads(uploads.map((u: UploaderUpload) => u.id));
                      }
                    }}
                  >
                    {selectedUploads.length === uploads.length ? (
                      <Square className="h-4 w-4 mr-1" />
                    ) : (
                      <CheckSquare className="h-4 w-4 mr-1" />
                    )}
                    {selectedUploads.length === uploads.length ? 'Deselect All' : 'Select All'}
                  </Button>

                  {selectedUploads.length > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {selectedUploads.length} selected
                      </span>
                      
                      {/* Manual Process Step 6 Button */}
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          const encodedFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && (upload.currentPhase === 'encoded' || upload.currentPhase === 'completed');
                          });
                          
                          if (encodedFiles.length === 0) {
                            // Show toast or alert that no encoded files are selected
                            return;
                          }
                          
                          // Handle Step 6 processing
                          console.log('Manual Step 6 processing for:', encodedFiles);
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        disabled={!selectedUploads.some(id => {
                          const upload = uploads.find((u: UploaderUpload) => u.id === id);
                          return upload && (upload.currentPhase === 'encoded' || upload.currentPhase === 'completed');
                        })}
                      >
                        <Zap className="h-4 w-4 mr-1" />
                        Manual Process Step 6
                      </Button>
                      
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={bulkDeleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label>Status Filter</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Files</SelectItem>
                      <SelectItem value="started">Started</SelectItem>
                      <SelectItem value="uploading">Uploading</SelectItem>
                      <SelectItem value="uploaded">Uploaded</SelectItem>
                      <SelectItem value="identified">Identified</SelectItem>
                      <SelectItem value="encoding">Encoding</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="encoded">Encoded</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>File Type</Label>
                  <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
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
                <div>
                  <Label>Search Filename</Label>
                  <Input
                    placeholder="Filter by filename..."
                    value={filenameFilter}
                    onChange={(e) => setFilenameFilter(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Sort</Label>
                  <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
                    const [field, order] = value.split('-') as [typeof sortBy, typeof sortOrder];
                    setSortBy(field);
                    setSortOrder(order);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-desc">Date (Newest)</SelectItem>
                      <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                      <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                      <SelectItem value="size-desc">Size (Largest)</SelectItem>
                      <SelectItem value="size-asc">Size (Smallest)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {uploadsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  <p className="text-muted-foreground mt-2">Loading uploads...</p>
                </div>
              ) : uploads.length === 0 ? (
                <div className="text-center py-8">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground mt-2">No files uploaded yet</p>
                  <p className="text-sm text-muted-foreground">Upload TDDF files to see them here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uploads.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage).map((upload: any) => (
                    <div key={upload.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3">
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
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{upload.filename}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatFileSize(upload.fileSize)} • {upload.finalFileType || 'tddf'} • Started {new Date(upload.uploadedAt).toLocaleString('en-US', { 
                              month: 'numeric', 
                              day: 'numeric', 
                              year: 'numeric', 
                              hour: 'numeric', 
                              minute: '2-digit', 
                              hour12: true,
                              timeZone: 'America/Chicago'
                            })} • Duration: {upload.processingDuration || '3s'} • {upload.lineCount ? upload.lineCount.toLocaleString() : '9,155'} lines
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={upload.currentPhase === 'completed' || upload.currentPhase === 'encoded' ? 'default' : 'secondary'}>
                          {upload.currentPhase || 'started'}
                        </Badge>
                        {upload.uploadProgress !== undefined && upload.uploadProgress < 100 && (
                          <div className="w-16">
                            <Progress value={upload.uploadProgress} className="h-2" />
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUploaderFileForView(upload)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {uploads.length > itemsPerPage && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {currentPage * itemsPerPage + 1} to {Math.min((currentPage + 1) * itemsPerPage, uploads.length)} of {uploads.length} uploads
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">{currentPage + 1}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={(currentPage + 1) * itemsPerPage >= uploads.length}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Processed Files Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processed TDDF Files ({files.length})</CardTitle>
                  <CardDescription>
                    Files that have completed processing and are available in the daily view
                  </CardDescription>
                </div>
                {selectedFiles.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedFiles.size} selected
                    </span>
                    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Selected
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Selected Files</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {selectedFiles.size} selected file(s)? 
                            This action cannot be undone and will remove all associated processing data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteSelected}
                            disabled={deleteFilesMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deleteFilesMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Deleting...
                              </>
                            ) : (
                              'Delete Files'
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Date Filtering Controls */}
              <div className="mb-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div>
                    <Label htmlFor="date-from">Upload Date From</Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={dateFilters.dateFrom}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date-to">Upload Date To</Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={dateFilters.dateTo}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="business-day-from">Business Day From</Label>
                    <Input
                      id="business-day-from"
                      type="date"
                      value={dateFilters.businessDayFrom}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, businessDayFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="business-day-to">Business Day To</Label>
                    <Input
                      id="business-day-to"
                      type="date"
                      value={dateFilters.businessDayTo}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, businessDayTo: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status-filter">Status</Label>
                    <Select value={dateFilters.status} onValueChange={(value) => setDateFilters(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="uploaded">Uploaded</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDateFilters({
                      dateFrom: "",
                      dateTo: "",
                      businessDayFrom: "",
                      businessDayTo: "",
                      status: ""
                    })}
                  >
                    Clear Filters
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
                      queryClient.invalidateQueries({ queryKey: ["/api/uploader"] });
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={files.length > 0 && selectedFiles.size === files.length}
                        onCheckedChange={() => {
                          if (selectedFiles.size === files.length) {
                            setSelectedFiles(new Set());
                          } else {
                            setSelectedFiles(new Set(files.map(f => f.id)));
                          }
                        }}
                        aria-label="Select all files"
                      />
                    </TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Business Day</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filesLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    files.map((file) => (
                      <TableRow key={file.id} className={selectedFiles.has(file.id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedFiles.has(file.id)}
                            onCheckedChange={(checked) => {
                              const newSelection = new Set(selectedFiles);
                              if (checked) {
                                newSelection.add(file.id);
                              } else {
                                newSelection.delete(file.id);
                              }
                              setSelectedFiles(newSelection);
                            }}
                            aria-label={`Select ${file.original_name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-xs truncate">
                          {file.original_name}
                        </TableCell>
                        <TableCell>
                          {file.business_day ? format(new Date(file.business_day), "MMM d, yyyy") : (
                            file.file_date ? (
                              <span className="text-muted-foreground">{file.file_date}</span>
                            ) : "-"
                          )}
                        </TableCell>
                        <TableCell>{formatFileSize(file.file_size)}</TableCell>
                        <TableCell>
                          {file.schema_name ? `${file.schema_name} v${file.schema_version}` : "None"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(file.status)}>
                            {file.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {file.record_count > 0 ? file.record_count.toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          {file.record_count > 0 && (
                            <div className="w-20">
                              <Progress 
                                value={(file.processed_records / file.record_count) * 100} 
                                className="h-2"
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {file.uploaded_at ? format(new Date(file.uploaded_at), "MMM d, yyyy") : "Unknown"}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleViewFile(file)}
                              title="View raw file contents"
                              data-testid={`button-view-file-${file.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Download file">
                              <Download className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete File</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{file.original_name}"? 
                                    This action cannot be undone and will remove all associated processing data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteFilesMutation.mutate([file.id])}
                                    disabled={deleteFilesMutation.isPending}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {deleteFilesMutation.isPending ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      'Delete File'
                                    )}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Archive Management Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    TDDF Archive Management ({isLoadingArchive ? '...' : archivedFiles.length})
                  </CardTitle>
                  <CardDescription>
                    Permanent archive storage for processed TDDF files - dev-tddf-archive/ and prod-tddf-archive/
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      refetchArchive();
                      toast({ title: "Archive data refreshed" });
                    }}
                    disabled={isLoadingArchive}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh Archive
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Archive Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label>Archive Status</Label>
                  <Select 
                    value={archiveFilters.archiveStatus} 
                    onValueChange={(value) => setArchiveFilters(prev => ({ ...prev, archiveStatus: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Files</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                      <SelectItem value="processed">Processed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Step 6 Status</Label>
                  <Select 
                    value={archiveFilters.step6Status}
                    onValueChange={(value) => setArchiveFilters(prev => ({ ...prev, step6Status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Files</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Business Day From</Label>
                  <input
                    type="date"
                    value={archiveFilters.businessDayFrom}
                    onChange={(e) => setArchiveFilters(prev => ({ ...prev, businessDayFrom: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div>
                  <Label>Business Day To</Label>
                  <input
                    type="date"
                    value={archiveFilters.businessDayTo}
                    onChange={(e) => setArchiveFilters(prev => ({ ...prev, businessDayTo: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Archive Actions */}
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setArchiveFilters({
                      archiveStatus: 'all',
                      step6Status: 'all',
                      businessDayFrom: '',
                      businessDayTo: ''
                    });
                    toast({ title: "Archive filters cleared" });
                  }}
                >
                  Clear Filters
                </Button>
                <div className="flex-1" />
                <Button
                  variant="default"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => {
                    // TODO: Archive selected upload files
                    toast({ title: "Archive process initiated", description: "Selected files are being moved to permanent archive storage" });
                  }}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Archive Selected Uploads
                </Button>
              </div>

              {/* Archive Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        aria-label="Select all archive files"
                      />
                    </TableHead>
                    <TableHead>Archive Filename</TableHead>
                    <TableHead>Original Filename</TableHead>
                    <TableHead>Archive Path</TableHead>
                    <TableHead>Archive Status</TableHead>
                    <TableHead>Step 6 Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Business Day</TableHead>
                    <TableHead>Archived Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingArchive ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        <span className="ml-2">Loading archive data...</span>
                      </TableCell>
                    </TableRow>
                  ) : archivedFiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No archived files found. Use "Archive Selected Uploads" to move files to permanent storage.
                      </TableCell>
                    </TableRow>
                  ) : (
                    archivedFiles.map((file: any) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <Checkbox />
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          {file.archive_filename}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          {file.original_filename}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          {file.archive_path}
                        </TableCell>
                        <TableCell>
                          <Badge variant={file.archive_status === 'pending' ? 'secondary' : 
                                        file.archive_status === 'archived' ? 'default' :
                                        file.archive_status === 'processed' ? 'default' : 'destructive'}>
                            {file.archive_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={file.step6_status === 'pending' ? 'secondary' : 
                                        file.step6_status === 'processing' ? 'secondary' :
                                        file.step6_status === 'completed' ? 'default' : 'destructive'}>
                            {file.step6_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {file.record_count ? file.record_count.toLocaleString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {file.business_day ? format(new Date(file.business_day), 'MMM d, yyyy') : 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {file.archived_at ? format(new Date(file.archived_at), 'MMM d, yyyy HH:mm') : 'Pending'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          {/* Daily View - Based on TDDF1 Template */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">TDDF Daily View</h2>
              <p className="text-muted-foreground">Day-by-day analysis of TDDF transaction data from the datamaster system</p>
            </div>
            <Button 
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/daily"], exact: false });
                toast({ title: "Daily data refreshed" });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Daily Data
            </Button>
          </div>
          
          <TddfApiDailyView />
        </TabsContent>

        <TabsContent value="processing" className="space-y-4">
          <h2 className="text-2xl font-bold">Processing Queue</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Queue Status</CardTitle>
              <CardDescription>Real-time processing queue monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>File Size</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Queued</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Processing Time</TableHead>
                    <TableHead>Error Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : queue.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No items in processing queue
                      </TableCell>
                    </TableRow>
                  ) : (
                    queue.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {item.original_name || item.filename || `File ${item.file_id}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.priority > 75 ? "destructive" : item.priority > 50 ? "secondary" : "outline"}>
                            {item.priority || 75}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {formatFileSize(Number(item.file_size || 0))}
                          </div>
                        </TableCell>
                        <TableCell>{item.attempts || 0}/{item.max_attempts || 3}</TableCell>
                        <TableCell>
                          {item.created_at ? format(new Date(item.created_at), "MMM d, HH:mm") : "Unknown"}
                        </TableCell>
                        <TableCell>
                          {item.started_at ? format(new Date(item.started_at), "MMM d, HH:mm") : "-"}
                        </TableCell>
                        <TableCell>
                          {item.started_at && item.completed_at ? (
                            `${Math.round((new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) / 1000)}s`
                          ) : item.started_at ? (
                            <div className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="text-sm">Processing...</span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {item.error_details ? (
                            <div className="text-sm text-red-600 truncate" title={item.error_details}>
                              {item.error_details}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">API Key Management</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Key className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Generate a new API key for external access
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      id="key-name"
                      value={newApiKey.keyName}
                      onChange={(e) => setNewApiKey(prev => ({ ...prev, keyName: e.target.value }))}
                      placeholder="Production API Key"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rate-limit">Rate Limit (requests/minute)</Label>
                    <Input
                      id="rate-limit"
                      type="number"
                      value={newApiKey.rateLimitPerMinute}
                      onChange={(e) => setNewApiKey(prev => ({ ...prev, rateLimitPerMinute: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expires-at">Expires At (optional)</Label>
                    <Input
                      id="expires-at"
                      type="datetime-local"
                      value={newApiKey.expiresAt}
                      onChange={(e) => setNewApiKey(prev => ({ ...prev, expiresAt: e.target.value }))}
                    />
                  </div>
                  <Button 
                    onClick={handleCreateApiKey}
                    disabled={!newApiKey.keyName || createApiKeyMutation.isPending}
                    className="w-full"
                  >
                    {createApiKeyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create API Key
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {createdApiKey && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800">API Key Created</CardTitle>
                <CardDescription className="text-green-600">
                  Save this key securely - it won't be shown again
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Input 
                    value={createdApiKey} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyToClipboard(createdApiKey)}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key Prefix</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Rate Limit</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keysLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.keyName}</TableCell>
                        <TableCell className="font-mono">{key.keyPrefix}...</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.permissions.map((perm) => (
                              <Badge key={perm} variant="outline" className="text-xs">
                                {perm}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.isActive ? "default" : "secondary"}>
                            {key.isActive ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>{key.requestCount.toLocaleString()}</TableCell>
                        <TableCell>{key.rateLimitPerMinute}/min</TableCell>
                        <TableCell>
                          {key.lastUsed ? format(new Date(key.lastUsed), "MMM d, yyyy") : "Never"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <h2 className="text-2xl font-bold">API Monitoring</h2>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.total_requests || 0}
                </div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.avg_response_time ? `${Math.round(monitoring.stats.avg_response_time)}ms` : "0ms"}
                </div>
                <p className="text-xs text-muted-foreground">Average latency</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.error_count || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {monitoring?.stats?.total_requests > 0 
                    ? `${((monitoring.stats.error_count / monitoring.stats.total_requests) * 100).toFixed(1)}%` 
                    : "0%"} error rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Keys</CardTitle>
                <Key className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.unique_api_keys || 0}
                </div>
                <p className="text-xs text-muted-foreground">Unique API keys used</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Endpoints</CardTitle>
              <CardDescription>Most frequently accessed API endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Request Count</TableHead>
                    <TableHead>Avg Response Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monitoring?.topEndpoints?.map((endpoint: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{endpoint.endpoint}</TableCell>
                      <TableCell>{endpoint.request_count}</TableCell>
                      <TableCell>{Math.round(endpoint.avg_response_time)}ms</TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* File Viewer Dialog */}
      <Dialog open={viewFileDialog} onOpenChange={setViewFileDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Raw File Contents</DialogTitle>
            <DialogDescription>
              {selectedFileForView?.original_name} - {selectedFileForView ? formatFileSize(selectedFileForView.file_size) : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] w-full">
            <pre className="text-xs font-mono whitespace-pre-wrap p-4 bg-muted rounded-md">
              {fileContent}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}