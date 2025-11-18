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
import { Loader2, Trash2, CheckSquare, Square, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Clock } from "lucide-react";
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
  
  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  // Fetch Step 6 queue status using standard apiRequest
  const { data: step6Data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/step6-status"],
    refetchInterval: autoRefresh ? refetchInterval : false,
    staleTime: 3000
  });
  
  const step6Queue = step6Data?.queue?.files || [];
  const step6ActiveSlots = step6Data?.activeSlots?.uploadIds || [];
  const step6Progress = step6Data?.activeSlots?.progress || [];
  
  // Reset selections when queue data changes to prevent stale selections
  useEffect(() => {
    setSelectedFiles(new Set());
  }, [step6Data]);
  
  // Filter files based on status
  const filteredFiles = step6Queue.filter((file: any) => {
    if (statusFilter === 'all') return true;
    return file.status === statusFilter;
  });
  
  // Pagination
  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);
  const paginatedFiles = filteredFiles.slice(
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
        // No files were deleted - show warning instead of error
        const skippedMsg = data.skipped 
          ? ` (${data.skipped.alreadyDeleted} already deleted, ${data.skipped.notFound} not found)`
          : '';
        toast({
          title: "No Files Deleted",
          description: `${data.reason || data.message}${skippedMsg}`,
          variant: "default"
        });
      } else {
        // Some or all files deleted successfully
        const skippedMsg = data.skipped && (data.skipped.alreadyDeleted > 0 || data.skipped.notFound > 0)
          ? ` (skipped ${data.skipped.alreadyDeleted + data.skipped.notFound} invalid file(s))`
          : '';
        toast({
          title: "Files Deleted Successfully",
          description: `Deleted ${data.deletedCount} file(s) from the queue${skippedMsg}`,
        });
      }
      setSelectedFiles(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/step6-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive"
      });
      // Auto-refresh on error to show current queue state
      queryClient.invalidateQueries({ queryKey: ["/api/admin/step6-status"] });
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
              ) : filteredFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No items in processing queue
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {/* Active Processing Files */}
                  {step6Progress.map((progress: any) => {
                    const elapsedSeconds = Math.round(progress.elapsedMs / 1000);
                    const recordsPerSecond = elapsedSeconds > 0 
                      ? Math.round(progress.processedRecords / elapsedSeconds) 
                      : 0;
                    
                    return (
                      <TableRow key={progress.uploadId} className="bg-blue-50 dark:bg-blue-950">
                        <TableCell>
                          <Checkbox disabled />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                              <span className="text-blue-800 dark:text-blue-200 text-sm font-medium">
                                {progress.filename || 'Processing...'}
                              </span>
                            </div>
                            <div className="w-full bg-white dark:bg-gray-800 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress.percentComplete}%` }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {progress.processedRecords.toLocaleString()} / {progress.totalLines.toLocaleString()} records ({progress.percentComplete}%)
                              {recordsPerSecond > 0 && ` • ${recordsPerSecond.toLocaleString()} rec/sec`}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className="bg-blue-600">
                            Active
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
                      key={item.uploadId}
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
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredFiles.length)} to {Math.min(currentPage * itemsPerPage, filteredFiles.length)} of {filteredFiles.length} files
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
