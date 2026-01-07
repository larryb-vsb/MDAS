import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, CheckSquare, Square, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Clock, StopCircle } from "lucide-react";
import { format } from "date-fns";

interface ProcessingQueueProps {
  refetchInterval?: number;
}

export function EnhancedProcessingQueue({ refetchInterval = 5000 }: ProcessingQueueProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Selection state - supports both queued and processing files
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedProcessingFiles, setSelectedProcessingFiles] = useState<Set<string>>(new Set());
  
  // Fetch Step 6 queue status using standard apiRequest
  const { data: step6Data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/step6-status"],
    refetchInterval: autoRefresh ? refetchInterval : false,
    staleTime: 3000
  });
  
  const step6Queue = step6Data?.queue?.files || [];
  const step6ActiveSlots = step6Data?.activeSlots?.uploadIds || [];
  const step6Progress = step6Data?.activeSlots?.progress || [];
  
  // Clean up selection by removing files that no longer exist in the queue
  // This prevents stale selections without clearing all selections on every refresh
  useEffect(() => {
    if (step6Queue.length > 0) {
      const currentUploadIds = new Set(step6Queue.map((f: any) => f.uploadId));
      setSelectedFiles(prev => {
        const filtered = new Set(Array.from(prev).filter(id => currentUploadIds.has(id)));
        // Only update if there's a difference to prevent unnecessary re-renders
        if (filtered.size !== prev.size) {
          return filtered;
        }
        return prev;
      });
    }
  }, [step6Queue]);
  
  // Deduplicate step6Progress to prevent duplicate keys from API data
  const uniqueProgress = step6Progress.reduce((acc: any[], p: any) => {
    if (!acc.some((item: any) => item.uploadId === p.uploadId)) {
      acc.push(p);
    }
    return acc;
  }, []);
  
  // Get set of actively processing upload IDs to exclude from queue list (prevents duplicate keys)
  const activeUploadIds = new Set(uniqueProgress.map((p: any) => p.uploadId));
  
  // Clean up selected processing files when they are no longer in progress
  useEffect(() => {
    if (selectedProcessingFiles.size > 0) {
      setSelectedProcessingFiles(prev => {
        const filtered = new Set(Array.from(prev).filter(id => activeUploadIds.has(id)));
        if (filtered.size !== prev.size) {
          return filtered;
        }
        return prev;
      });
    }
  }, [uniqueProgress.length, activeUploadIds.size]);
  
  // Deduplicate step6Queue and filter by status
  const seenUploadIds = new Set<string>();
  const filteredFiles = step6Queue.filter((file: any) => {
    if (seenUploadIds.has(file.uploadId)) return false;
    seenUploadIds.add(file.uploadId);
    if (statusFilter === 'all') return true;
    return file.status === statusFilter;
  });
  
  // Filter out actively processing files from the queue list
  const queuedOnlyFiles = filteredFiles.filter((file: any) => !activeUploadIds.has(file.uploadId));
  
  // Pagination (exclude active files from pagination)
  const totalPages = Math.ceil(queuedOnlyFiles.length / itemsPerPage);
  const paginatedFiles = queuedOnlyFiles.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  // Reset page when filter changes
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
    setSelectedFiles(new Set());
  };
  
  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedFiles.size === paginatedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(paginatedFiles.map((f: any) => f.uploadId)));
    }
  };
  
  const toggleFileSelection = (uploadId: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(uploadId)) {
      newSelection.delete(uploadId);
    } else {
      newSelection.add(uploadId);
    }
    setSelectedFiles(newSelection);
  };
  
  // Toggle selection for actively processing files
  const toggleProcessingFileSelection = (uploadId: string) => {
    const newSelection = new Set(selectedProcessingFiles);
    if (newSelection.has(uploadId)) {
      newSelection.delete(uploadId);
    } else {
      newSelection.add(uploadId);
    }
    setSelectedProcessingFiles(newSelection);
  };
  
  // Bulk delete mutation using apiRequest
  const bulkDeleteMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      return apiRequest("/api/uploader/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ uploadIds })
      }) as Promise<{ 
        success: boolean; 
        deletedCount: number; 
        message: string;
        reason?: string;
        skipped?: { notFound: number; alreadyDeleted: number };
      }>;
    },
    onSuccess: (data) => {
      if (data.success === false && data.deletedCount === 0) {
        // Files were already deleted - still clear selection and refresh to remove stale entries
        toast({
          title: "Files Already Removed",
          description: "Selected files were already deleted. Refreshing queue...",
          variant: "default"
        });
      } else {
        const skippedMsg = data.skipped && (data.skipped.alreadyDeleted > 0 || data.skipped.notFound > 0)
          ? ` (${data.skipped.alreadyDeleted + data.skipped.notFound} already removed)`
          : '';
        toast({
          title: "Files Deleted Successfully",
          description: `Deleted ${data.deletedCount} file(s) from the queue${skippedMsg}`,
        });
      }
      setSelectedFiles(new Set());
      // Force immediate refetch to remove stale entries from UI
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive"
      });
      refetch();
    }
  });
  
  // Kill processing mutation - stops active processing and deletes
  const killProcessingMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      return apiRequest("/api/uploader/kill-processing", {
        method: "POST",
        body: JSON.stringify({ uploadIds, action: 'delete' })
      }) as Promise<{ 
        success: boolean; 
        killedCount: number; 
        message: string;
        slotsCleared?: number;
        cleanedObjects?: number;
      }>;
    },
    onSuccess: (data) => {
      if (data.killedCount === 0 && data.slotsCleared === 0) {
        toast({
          title: "Files Already Removed",
          description: "Selected files were already stopped or deleted. Refreshing...",
          variant: "default"
        });
      } else {
        toast({
          title: "Processing Killed",
          description: `${data.slotsCleared || 0} process(es) stopped, ${data.killedCount} file(s) deleted`,
        });
      }
      setSelectedProcessingFiles(new Set());
      // Force immediate refetch to update UI
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Kill Failed",
        description: error.message,
        variant: "destructive"
      });
      refetch();
    }
  });
  
  const handleBulkDelete = () => {
    if (selectedFiles.size > 0) {
      bulkDeleteMutation.mutate(Array.from(selectedFiles));
    }
  };
  
  const formatWaitingTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  const allSelected = paginatedFiles.length > 0 && selectedFiles.size === paginatedFiles.length;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Queue Status</CardTitle>
            <CardDescription>
              Real-time Step 6 processing queue monitoring 
              ({step6ActiveSlots.length}/{step6Data?.activeSlots?.max || 3} active slots, {step6Queue.length} queued)
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              data-testid="button-toggle-autorefresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto' : 'Manual'}
            </Button>
            
            {/* Manual refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              data-testid="button-refresh-queue"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Filters and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active (Processing)</SelectItem>
                  <SelectItem value="validating">Validating</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="encoded">Encoded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Items per page */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Show:</label>
              <Select 
                value={itemsPerPage.toString()} 
                onValueChange={(value) => {
                  setItemsPerPage(parseInt(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-24" data-testid="select-items-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            {/* Kill Processing Files Button */}
            {selectedProcessingFiles.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    data-testid="button-kill-processing"
                  >
                    <StopCircle className="h-4 w-4 mr-2" />
                    Kill {selectedProcessingFiles.size} Processing
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Kill {selectedProcessingFiles.size} Processing File(s)?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will immediately stop processing and delete the selected files.
                      Any partial data will be cleaned up and orphaned objects removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => killProcessingMutation.mutate(Array.from(selectedProcessingFiles))}
                      disabled={killProcessingMutation.isPending}
                      className="bg-destructive text-destructive-foreground"
                    >
                      {killProcessingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Kill & Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            
            {/* Delete Queued Files Button */}
            {selectedFiles.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    data-testid="button-bulk-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete {selectedFiles.size} Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedFiles.size} Files?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will soft-delete the selected files from the processing queue.
                      They will be marked as deleted and can be restored later if needed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteMutation.isPending}
                      className="bg-destructive text-destructive-foreground"
                    >
                      {bulkDeleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Delete Files
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        
        {/* Queue Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={paginatedFiles.length === 0}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Upload ID</TableHead>
                <TableHead>Queued At</TableHead>
                <TableHead>Waiting Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : (uniqueProgress.length === 0 && paginatedFiles.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No items in processing queue
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {/* Active Processing Files */}
                  {uniqueProgress.map((progress: any) => {
                    const elapsedSeconds = Math.round(progress.elapsedMs / 1000);
                    const recordsPerSecond = elapsedSeconds > 0 
                      ? Math.round(progress.processedRecords / elapsedSeconds) 
                      : 0;
                    const isValidating = progress.percentComplete >= 100;
                    const isSelected = selectedProcessingFiles.has(progress.uploadId);
                    
                    return (
                      <TableRow 
                        key={`active-${progress.uploadId}`} 
                        className={`${isValidating ? "bg-amber-50 dark:bg-amber-950" : "bg-blue-50 dark:bg-blue-950"} ${isSelected ? "ring-2 ring-destructive" : ""}`}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={isSelected}
                            onCheckedChange={() => toggleProcessingFileSelection(progress.uploadId)}
                            data-testid={`checkbox-processing-${progress.uploadId}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Loader2 className={`h-3 w-3 animate-spin ${isValidating ? 'text-amber-600' : 'text-blue-600'}`} />
                              <span className={`text-sm font-medium ${isValidating ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200'}`}>
                                {progress.filename || 'Processing...'}
                              </span>
                            </div>
                            <div className="w-full bg-white dark:bg-gray-800 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full transition-all duration-300 ${isValidating ? 'bg-amber-500' : 'bg-blue-600'}`}
                                style={{ width: `${progress.percentComplete}%` }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {progress.processedRecords.toLocaleString()} / {progress.totalLines.toLocaleString()} records ({progress.percentComplete}%)
                              {recordsPerSecond > 0 && ` • ${recordsPerSecond.toLocaleString()} rec/sec`}
                              {isValidating && ' • Removing duplicates...'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className={isValidating ? "bg-amber-500" : "bg-blue-600"}>
                            {isValidating ? 'Validating' : 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {progress.uploadId}
                          </code>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatWaitingTime(progress.elapsedMs)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatWaitingTime(progress.elapsedMs)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {/* Queued Files (Paginated) */}
                  {paginatedFiles.map((item: any) => (
                    <TableRow 
                      key={`queued-${item.uploadId}`}
                      className={selectedFiles.has(item.uploadId) ? 'bg-muted' : ''}
                      data-testid={`row-queue-${item.uploadId}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedFiles.has(item.uploadId)}
                          onCheckedChange={() => toggleFileSelection(item.uploadId)}
                          data-testid={`checkbox-file-${item.uploadId}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate">
                        {item.filename || 'Unknown file'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'validating' ? 'secondary' : 'outline'}>
                          {item.status === 'validating' ? 'Validating' : item.status || 'Queued'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          {item.uploadId}
                        </code>
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.queuedAt ? format(new Date(item.queuedAt), "MMM d, HH:mm:ss") : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.waitingMs ? formatWaitingTime(item.waitingMs) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, queuedOnlyFiles.length)} to {Math.min(currentPage * itemsPerPage, queuedOnlyFiles.length)} of {queuedOnlyFiles.length} queued files
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              
              <div className="text-sm">
                Page {currentPage} of {totalPages}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
