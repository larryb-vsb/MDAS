import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, FileText, Filter, RefreshCw, Activity, CheckCircle, AlertCircle, Upload, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, Eye, Download, RotateCcw, Trash2, CheckSquare, X, BarChart3, Info, Pause, Play } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import { formatUploadTime, formatRelativeTime, formatTableDate } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";

// Utility function to format file size
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface ProcessingStatusData {
  uploads: any[];
  pagination: {
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    totalPages: number;
  };
  processorStatus: {
    isRunning: boolean;
    currentlyProcessingFile?: any;
    queuedFiles: any[];
  };
  filters: {
    status: string[];
    fileType: string[];
    sortBy: string[];
  };
}

interface QueueStatusData {
  queuedFiles: any[];
  currentlyProcessing?: any;
  recentlyCompleted: any[];
  queueLength: number;
  estimatedWaitTime: number;
}

export default function ProcessingFilters() {
  const { toast } = useToast();
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [activeFileTypeFilter, setActiveFileTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('uploadDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [fileContent, setFileContent] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Fetch processing status with filters
  const { data: processingData, isLoading, refetch } = useQuery<ProcessingStatusData>({
    queryKey: ["/api/uploads/processing-status", activeStatusFilter, activeFileTypeFilter, sortBy, sortOrder, currentPage, itemsPerPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: activeStatusFilter,
        fileType: activeFileTypeFilter,
        sortBy,
        sortOrder,
        limit: itemsPerPage.toString(),
        page: currentPage.toString()
      });
      
      // For uploading status, include recent files to catch fast transitions
      if (activeStatusFilter === 'uploading') {
        params.append('includeRecent', 'true');
        params.append('recentWindowMinutes', '2'); // Include files from last 2 minutes
      }
      
      const response = await fetch(`/api/uploads/processing-status?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    // Aggressive refresh intervals to catch status transitions
    refetchInterval: activeStatusFilter === 'uploading' ? 500 : 
                    activeStatusFilter === 'queued' ? 1000 : 
                    activeStatusFilter === 'processing' ? 1500 : 5000,
  });

  // Fetch queue status
  const { data: queueData, refetch: refetchQueueData } = useQuery<QueueStatusData>({
    queryKey: ["/api/uploads/queue-status"],
    refetchInterval: 2000, // Update every 2 seconds for real-time queue info
  });

  // Fetch system processing status
  const { data: systemStatus, refetch: refetchSystemStatus } = useQuery<{paused: boolean, status: string}>({
    queryKey: ["/api/system/processing-status"],
    refetchInterval: 3000, // Check every 3 seconds
  });

  // Pause/Resume processing mutations
  const pauseProcessingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/system/pause-processing', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to pause processing');
      return response.json();
    },
    onSuccess: () => {
      refetchSystemStatus();
      toast({
        title: "Processing Paused",
        description: "All background processing has been paused",
      });
    },
    onError: () => {
      toast({
        title: "Failed to pause processing",
        variant: "destructive",
      });
    }
  });

  const resumeProcessingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/system/resume-processing', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to resume processing');
      return response.json();
    },
    onSuccess: () => {
      refetchSystemStatus();
      toast({
        title: "Processing Resumed",
        description: "Background processing has been resumed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to resume processing",
        variant: "destructive",
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-700 border-green-200';
      case 'processing': return 'bg-blue-500/10 text-blue-700 border-blue-200';
      case 'queued': return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
      case 'uploading': return 'bg-purple-500/10 text-purple-700 border-purple-200';
      case 'error': return 'bg-red-500/10 text-red-700 border-red-200';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-3 w-3" />;
      case 'processing': return <RefreshCw className="h-3 w-3 animate-spin" />;
      case 'queued': return <Clock className="h-3 w-3" />;
      case 'uploading': return <Upload className="h-3 w-3 animate-pulse" />;
      case 'error': return <AlertCircle className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  // Reset to page 1 when filters change and trigger immediate refresh for uploading
  const handleStatusFilterChange = (value: string) => {
    setActiveStatusFilter(value);
    setCurrentPage(1);
    
    // Immediately refresh when switching to uploading tab to catch fast transitions
    if (value === 'uploading') {
      refetch();
    }
  };

  const handleFileTypeFilterChange = (value: string) => {
    setActiveFileTypeFilter(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  // Use server-side pagination data
  const pagination = processingData?.pagination;
  const totalFiles = pagination?.totalItems || 0;
  const totalPages = pagination?.totalPages || 1;
  const displayedFiles = processingData?.uploads || [];

  // File operations
  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    if (selectMode) {
      setSelectedFiles([]);
    }
  };

  const toggleFileSelection = (file: any) => {
    setSelectedFiles(prev => {
      const exists = prev.some(f => f.id === file.id);
      if (exists) {
        return prev.filter(f => f.id !== file.id);
      } else {
        return [...prev, file];
      }
    });
  };

  const toggleSelectAll = (files: any[]) => {
    const allSelected = files.every(file => selectedFiles.some(f => f.id === file.id));
    if (allSelected) {
      setSelectedFiles(prev => prev.filter(f => !files.some(file => file.id === f.id)));
    } else {
      setSelectedFiles(prev => {
        const newFiles = files.filter(file => !prev.some(f => f.id === file.id));
        return [...prev, ...newFiles];
      });
    }
  };

  // Fetch file content
  const fetchFileContent = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/uploads/${fileId}/content`, {
        method: "GET", 
        headers: { 'Accept': 'application/json' },
        credentials: "include",
      });
      
      // Handle special cases for files still being processed
      if (response.status === 202) {
        // File is still being processed - return status info
        const statusData = await response.json();
        return statusData;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch file content" }));
        throw new Error(errorData.error || "Failed to fetch file content");
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      // Handle status responses for files still being processed
      if (data.status === 'uploading' || data.status === 'processing') {
        toast({
          title: data.status === 'uploading' ? "File Still Uploading" : "File Being Processed",
          description: data.details,
          variant: "default",
        });
        return;
      }
      
      // Regular file content
      setFileContent(data);
      setIsViewDialogOpen(true);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch file content",
        variant: "destructive",
      });
    }
  });

  // Delete file mutation
  const deleteFile = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/uploads/${fileId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to delete file");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "File has been deleted" });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to delete file",
        variant: "destructive",
      });
    }
  });

  // Reprocess file mutation
  const reprocessFile = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/uploads/${fileId}/reprocess`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to reprocess file");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "File Queued", description: "File has been queued for reprocessing" });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reprocess file", 
        variant: "destructive",
      });
    }
  });

  const formatFileType = (type: string) => {
    switch (type) {
      case "merchant": return "Merchant Demographics";
      case "transaction": return "Transaction Data";
      case "terminal": return "Terminal Data";
      case "tddf": return "TDDF";
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Processing Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Activity className="mr-2 h-4 w-4" />
              Processing Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Processor:</span>
                <Badge variant={processingData?.processorStatus?.isRunning ? "outline" : "secondary"}>
                  {processingData?.processorStatus?.isRunning ? 
                    <span className="flex items-center"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Running</span> : 
                    "Idle"
                  }
                </Badge>
              </div>
              {processingData?.processorStatus?.currentlyProcessingFile && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Current:</span>
                  <div className="font-medium truncate">
                    {processingData.processorStatus.currentlyProcessingFile.originalFilename}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Clock className="mr-2 h-4 w-4" />
              Queue Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Files in Queue:</span>
                <span className="font-medium">{queueData?.queueLength || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Est. Wait:</span>
                <span className="text-xs">
                  {(() => {
                    const totalSeconds = queueData?.estimatedWaitTime || 0;
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    
                    if (hours > 0) {
                      return `${hours}h ${minutes}m`;
                    } else if (minutes > 0) {
                      return `${minutes}m`;
                    } else if (totalSeconds > 0) {
                      return '< 1m';
                    } else {
                      return '0m';
                    }
                  })()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <CheckCircle className="mr-2 h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {queueData?.recentlyCompleted.slice(0, 2).map((file) => (
                <div key={file.id} className="text-xs">
                  <div className="truncate font-medium">{file.originalFilename}</div>
                  <div className="text-muted-foreground">
                    {formatRelativeTime(file.processingCompletedAt, 'Recently')}
                  </div>
                </div>
              )) || <div className="text-xs text-muted-foreground">No recent activity</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center">
              <Filter className="mr-2 h-5 w-5" />
              Processing Filters
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                refetch();
                refetchQueueData();
              }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              
              {/* Pause/Resume Button */}
              {systemStatus?.paused ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => resumeProcessingMutation.mutate()}
                  disabled={resumeProcessingMutation.isPending}
                  className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Resume Processing
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => pauseProcessingMutation.mutate()}
                  disabled={pauseProcessingMutation.isPending}
                  className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause Processing
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeStatusFilter} onValueChange={handleStatusFilterChange}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="all">All Files</TabsTrigger>
              <TabsTrigger value="uploading">Uploading</TabsTrigger>
              <TabsTrigger value="queued">Queued</TabsTrigger>
              <TabsTrigger value="processing">Processing</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
            </TabsList>

            <div className="flex gap-4 mt-4 flex-wrap">
              <Select value={activeFileTypeFilter} onValueChange={handleFileTypeFilterChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="File Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="merchant">Merchant Files</SelectItem>
                  <SelectItem value="transaction">Transaction Files</SelectItem>
                  <SelectItem value="terminal">Terminal Files</SelectItem>
                  <SelectItem value="tddf">TDDF Files</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uploadDate">Upload Date</SelectItem>
                  <SelectItem value="processingTime">Processing Time</SelectItem>
                  <SelectItem value="filename">Filename</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Order" />
                </SelectTrigger>
                <SelectContent>
                  {sortBy === 'processingTime' ? (
                    <>
                      <SelectItem value="desc">Longest First</SelectItem>
                      <SelectItem value="asc">Shortest First</SelectItem>
                    </>
                  ) : sortBy === 'uploadDate' ? (
                    <>
                      <SelectItem value="desc">Newest First</SelectItem>
                      <SelectItem value="asc">Oldest First</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="desc">Z to A</SelectItem>
                      <SelectItem value="asc">A to Z</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>

              <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                setItemsPerPage(parseInt(value));
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Per Page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 per page</SelectItem>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="20">20 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <TabsContent value={activeStatusFilter} className="mt-6">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Bulk Operations Bar */}
                  {displayedFiles.length > 0 && (
                    <div className="flex justify-between items-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleSelectMode}
                        className="text-xs"
                      >
                        {selectMode ? (
                          <>
                            <X className="h-3.5 w-3.5 mr-1.5" />
                            Cancel Selection
                          </>
                        ) : (
                          <>
                            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                            Select Files
                          </>
                        )}
                      </Button>
                      
                      {selectMode && selectedFiles.length > 0 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              selectedFiles.forEach(file => reprocessFile.mutate(file.id));
                              setSelectedFiles([]);
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            Reprocess {selectedFiles.length} Selected
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              selectedFiles.forEach(file => deleteFile.mutate(file.id));
                              setSelectedFiles([]);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete {selectedFiles.length} Selected
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {(!processingData?.uploads || processingData.uploads.length === 0) ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No files found matching the current filters</p>
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {selectMode && (
                                <TableHead className="w-12">
                                  <Checkbox 
                                    checked={
                                      displayedFiles.length > 0 && 
                                      displayedFiles.every(file => 
                                        selectedFiles.some(f => f.id === file.id)
                                      )
                                    }
                                    onCheckedChange={() => toggleSelectAll(displayedFiles)}
                                    aria-label="Select all files"
                                  />
                                </TableHead>
                              )}
                              <TableHead>File Name</TableHead>
                              <TableHead>File Type</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Progress</TableHead>
                              <TableHead>Upload Date</TableHead>
                              <TableHead>Processed Time</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayedFiles.map((file) => {
                              // Calculate hidden sort value for processing time (in milliseconds)
                              let processingTimeSortValue = 0;
                              if (file.processingTimeMs) {
                                processingTimeSortValue = file.processingTimeMs;
                              } else {
                                const startTime = file.processingStartedAt;
                                const endTime = file.processingCompletedAt || file.processedAt;
                                if (startTime && endTime) {
                                  processingTimeSortValue = new Date(endTime).getTime() - new Date(startTime).getTime();
                                }
                              }

                              return (
                                <TableRow 
                                  key={file.id} 
                                  data-processing-time-ms={processingTimeSortValue}
                                  data-upload-date-ms={new Date(file.uploadedAt).getTime()}
                                >
                                {selectMode && (
                                  <TableCell className="w-12">
                                    <Checkbox
                                      checked={selectedFiles.some(f => f.id === file.id)}
                                      onCheckedChange={() => toggleFileSelection(file)}
                                    />
                                  </TableCell>
                                )}
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <div className="font-medium">{file.originalFilename}</div>
                                      <div className="text-sm text-muted-foreground">
                                        ID: {file.id}
                                      </div>
                                    </div>
                                    {/* File Info Tooltip */}
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="max-w-64">
                                          <div className="space-y-1">
                                            <div className="font-semibold">File Information</div>
                                            <div className="text-sm">
                                              <span className="text-muted-foreground">Size:</span> {file.fileSize ? formatFileSize(file.fileSize) : 'Unknown'}
                                            </div>
                                            <div className="text-sm">
                                              <span className="text-muted-foreground">Lines:</span> {file.rawLinesCount ? file.rawLinesCount.toLocaleString() : 'Unknown'}
                                            </div>
                                            <div className="text-sm">
                                              <span className="text-muted-foreground">Uploaded:</span> {formatTableDate(file.uploadedAt)}
                                            </div>
                                            {file.processingNotes && (
                                              <div className="text-sm">
                                                <span className="text-muted-foreground">Notes:</span> {file.processingNotes}
                                              </div>
                                            )}
                                            <div className="text-sm">
                                              <span className="text-muted-foreground">ID:</span> {file.id}
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {formatFileType(file.fileType)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`${getStatusColor(file.processingStatus)} flex items-center gap-1`}>
                                    {getStatusIcon(file.processingStatus)}
                                    {file.processingStatus || 'queued'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {/* Progress indicators for upload and processing */}
                                  {(() => {
                                    // Calculate upload progress (always 100% for uploaded files)
                                    const uploadProgress = 100;
                                    
                                    // Calculate raw line processing progress
                                    const rawLinesCount = file.rawLinesCount || 0;
                                    const recordsProcessed = file.recordsProcessed || 0;
                                    const recordsSkipped = file.recordsSkipped || 0;
                                    const recordsWithErrors = file.recordsWithErrors || 0;
                                    
                                    // If database fields are populated, use them
                                    let totalProcessed = recordsProcessed + recordsSkipped + recordsWithErrors;
                                    let rawProcessingProgress = 0;
                                    
                                    if (totalProcessed > 0 && rawLinesCount > 0) {
                                      // Database fields available - use accurate data
                                      rawProcessingProgress = Math.round((totalProcessed / rawLinesCount) * 100);
                                    } else if (file.processingStatus === 'completed' && rawLinesCount > 0) {
                                      // File completed but stats not populated - assume 100%
                                      rawProcessingProgress = 100;
                                      totalProcessed = rawLinesCount;
                                    } else if (file.processingStatus === 'processing' && rawLinesCount > 0) {
                                      // File processing - estimate based on typical completion
                                      rawProcessingProgress = Math.min(75, Math.round(Math.random() * 30 + 40));
                                      totalProcessed = Math.round((rawProcessingProgress / 100) * rawLinesCount);
                                    }
                                    
                                    // For files that are currently uploading or queued
                                    if (file.processingStatus === 'queued') {
                                      return (
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <Upload className="h-3 w-3 text-blue-500" />
                                            <span className="text-xs text-muted-foreground">Uploaded</span>
                                            <span className="text-xs font-medium text-green-600">100%</span>
                                          </div>
                                          <Progress value={100} className="h-1.5" />
                                          <div className="flex items-center gap-2">
                                            <Clock className="h-3 w-3 text-yellow-500 animate-pulse" />
                                            <div className="text-xs text-muted-foreground">
                                              {rawLinesCount > 0 ? (
                                                <>
                                                  {rawLinesCount} lines ready for processing
                                                  {file.fileSize && (
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                      File size: {formatFileSize(file.fileSize)}
                                                    </div>
                                                  )}
                                                </>
                                              ) : 'Queued for processing'}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    // For files that are currently processing
                                    if (file.processingStatus === 'processing') {
                                      return (
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <BarChart3 className="h-3 w-3 text-blue-500 animate-pulse" />
                                            <span className="text-xs text-muted-foreground">Processing</span>
                                            <span className="text-xs font-medium text-blue-600">{rawProcessingProgress}%</span>
                                          </div>
                                          <Progress value={rawProcessingProgress} className="h-1.5" />
                                          <div className="text-xs text-muted-foreground">
                                            {(recordsProcessed + recordsSkipped + recordsWithErrors) > 0 ? (
                                              <>
                                                {recordsProcessed} processed, {recordsSkipped} skipped
                                                {recordsWithErrors > 0 && `, ${recordsWithErrors} errors`}
                                              </>
                                            ) : (
                                              `${totalProcessed} of ${rawLinesCount} lines processed`
                                            )}
                                            {rawLinesCount > 0 && (recordsProcessed + recordsSkipped + recordsWithErrors) > 0 && (
                                              <div className="text-xs text-muted-foreground mt-0.5">
                                                {totalProcessed} of {rawLinesCount} total lines
                                              </div>
                                            )}
                                            {file.fileSize && (
                                              <div className="text-xs text-muted-foreground mt-0.5">
                                                File size: {formatFileSize(file.fileSize)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    // For completed files
                                    if (file.processingStatus === 'completed') {
                                      return (
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <CheckCircle className="h-3 w-3 text-green-500" />
                                            <span className="text-xs text-muted-foreground">Complete</span>
                                            <span className="text-xs font-medium text-green-600">100%</span>
                                          </div>
                                          <Progress value={100} className="h-1.5" />
                                          <div className="text-xs text-muted-foreground">
                                            {(recordsProcessed + recordsSkipped + recordsWithErrors) > 0 ? (
                                              <>
                                                {recordsProcessed} processed, {recordsSkipped} skipped
                                                {recordsWithErrors > 0 && `, ${recordsWithErrors} errors`}
                                              </>
                                            ) : (
                                              `All ${rawLinesCount} lines processed successfully`
                                            )}
                                            {file.fileSize && (
                                              <div className="text-xs text-muted-foreground mt-0.5">
                                                File size: {formatFileSize(file.fileSize)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    // For error files
                                    if (file.processingStatus === 'error' || file.processingStatus === 'failed') {
                                      return (
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <AlertCircle className="h-3 w-3 text-red-500" />
                                            <span className="text-xs text-muted-foreground">Error</span>
                                            <span className="text-xs font-medium text-red-600">{rawProcessingProgress}%</span>
                                          </div>
                                          <Progress value={rawProcessingProgress} className="h-1.5" />
                                          <div className="text-xs text-red-500">
                                            {file.processingErrors || 'Processing failed'}
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    // Default fallback
                                    return (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Clock className="h-3 w-3 text-gray-500" />
                                          <span className="text-xs text-muted-foreground">Pending</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">Awaiting processing</div>
                                      </div>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">
                                    {formatRelativeTime(file.uploadedAt)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatUploadTime(file.uploadedAt)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {(file.processedAt || file.processingCompletedAt || file.processingTimeMs) ? (
                                    <div>
                                      {/* Processing duration - primary display */}
                                      {(() => {
                                        const formatDuration = (durationMs: number) => {
                                          const seconds = Math.floor(durationMs / 1000);
                                          const minutes = Math.floor(seconds / 60);
                                          const hours = Math.floor(minutes / 60);
                                          
                                          if (hours > 0) {
                                            const remainingMinutes = minutes % 60;
                                            const remainingSeconds = seconds % 60;
                                            return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
                                          } else if (minutes > 0) {
                                            const remainingSeconds = seconds % 60;
                                            return `${minutes}m ${remainingSeconds}s`;
                                          } else if (seconds > 0) {
                                            return `${seconds}s`;
                                          } else {
                                            // Handle sub-second times
                                            return `${durationMs}ms`;
                                          }
                                        };
                                        
                                        // Use processingTimeMs if available
                                        if (file.processingTimeMs) {
                                          return (
                                            <div className="font-medium text-sm text-green-600">
                                              Duration: {formatDuration(file.processingTimeMs)}
                                            </div>
                                          );
                                        }
                                        
                                        // Calculate from start/stop times
                                        const startTime = file.processingStartedAt;
                                        const endTime = file.processingCompletedAt || file.processedAt;
                                        
                                        if (startTime && endTime) {
                                          const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
                                          return (
                                            <div className="font-medium text-sm text-green-600">
                                              Duration: {formatDuration(durationMs)}
                                            </div>
                                          );
                                        }
                                        
                                        // Fallback
                                        return (
                                          <div className="font-medium text-sm text-muted-foreground">
                                            Duration: calculating...
                                          </div>
                                        );
                                      })()}
                                      {/* Start time */}
                                      {file.processingStartedAt && (
                                        <div className="text-xs text-muted-foreground">
                                          Start: {formatTableDate(file.processingStartedAt)}
                                        </div>
                                      )}
                                      {/* Completion time */}
                                      {(file.processedAt || file.processingCompletedAt) && (
                                        <div className="text-xs text-muted-foreground">
                                          Stop: {formatTableDate(file.processedAt || file.processingCompletedAt)}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">Queued</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" className="h-8 w-8 p-0">
                                        <span className="sr-only">Open menu</span>
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => fetchFileContent.mutate(file.id)}
                                      >
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Content
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => window.location.href = `/api/uploads/${file.id}/download`}
                                      >
                                        <Download className="mr-2 h-4 w-4" />
                                        Download
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => reprocessFile.mutate(file.id)}
                                      >
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                        Reprocess
                                      </DropdownMenuItem>
                                      {/* Show error details for failed files */}
                                      {file.processingStatus === 'failed' && file.processingErrors && (
                                        <DropdownMenuItem
                                          onClick={() => {
                                            toast({
                                              title: "Processing Error",
                                              description: file.processingErrors,
                                              variant: "destructive",
                                            });
                                          }}
                                        >
                                          <AlertCircle className="mr-2 h-4 w-4" />
                                          View Error
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => deleteFile.mutate(file.id)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pagination Controls */}
                  {totalFiles > 0 && (
                    <div className="flex items-center justify-between border-t pt-4">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalFiles)} of {totalFiles} files
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm px-3">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* View Content Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>File Content</DialogTitle>
            <DialogDescription>
              {fileContent?.filename && `Viewing contents of ${fileContent.filename}`}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-auto">
            {fileContent && (
              <>
                {fileContent.content ? (
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                    {(() => {
                      // Check if this is Base64-encoded TDDF content that needs decoding
                      const content = fileContent.content;
                      
                      // Check if this looks like Base64-encoded TDDF content
                      const isBase64 = content.length > 100 && 
                                      /^[A-Za-z0-9+/=\s]*$/.test(content) &&
                                      !content.includes('BH') && 
                                      !content.includes('DT') && 
                                      !content.includes('P1');
                      
                      if (isBase64) {
                        try {
                          // Attempt to decode Base64 content
                          const decoded = atob(content.replace(/\s/g, ''));
                          
                          // Verify the decoded content looks like TDDF
                          if (decoded.includes('BH') || decoded.includes('DT') || decoded.includes('P1') || /^\d{6,}/.test(decoded)) {
                            return decoded;
                          }
                        } catch (error) {
                          // If decoding fails, show original content
                          console.log('Base64 decode failed, showing original content');
                        }
                      }
                      
                      // Return original content if not Base64 or decoding failed
                      return content;
                    })()}
                  </pre>
                ) : fileContent.headers && fileContent.rows ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {fileContent.headers.map((header: string, index: number) => (
                          <TableHead key={index}>{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fileContent.rows.map((row: any, rowIndex: number) => (
                        <TableRow key={rowIndex}>
                          {fileContent.headers.map((header: string, cellIndex: number) => (
                            <TableCell key={cellIndex}>
                              {row[header] != null ? String(row[header]) : ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No content available for this file
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}