import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import MainLayout from "@/components/layout/MainLayout";
import FileProcessorStatus from "@/components/uploads/FileProcessorStatus";
import MappingSettings from "@/components/uploads/MappingSettings";
import FileUploadModal from "@/components/uploads/FileUploadModal";
import ProcessingFilters from "@/components/uploads/ProcessingFilters";
import { 
  AlertCircle, 
  Check, 
  AlertTriangle,
  FileText, 
  DownloadCloud, 
  RefreshCw, 
  Trash2, 
  Eye,
  Upload,
  Loader2,
  X,
  CheckSquare,
  Play,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  BarChart3
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UploadedFile {
  id: string;
  originalFilename: string;
  fileType: string;
  uploadedAt: string;
  processed: boolean;
  processingErrors: string | null;
  processedAt: string | null;
  deleted?: boolean;
  processingStartedAt?: string | null;
  processingCompletedAt?: string | null;
  processingTimeMs?: number | null;
  recordsProcessed?: number;
  recordsSkipped?: number;
  recordsWithErrors?: number;
  processingDetails?: string | null;
}

interface FileContentResponse {
  headers: string[];
  rows: Record<string, any>[];
}

interface PaginationState {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
}

export default function Uploads() {
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isMultiDeleteDialogOpen, setIsMultiDeleteDialogOpen] = useState(false);
  const [isMultiReprocessDialogOpen, setIsMultiReprocessDialogOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10
  });
  const [fileContent, setFileContent] = useState<FileContentResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [metadataFile, setMetadataFile] = useState<UploadedFile | null>(null);
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };
  
  const toggleUploadModal = () => {
    setIsUploadModalOpen(prev => !prev);
  };
  
  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    if (selectMode) {
      // If turning off select mode, clear the selected files
      setSelectedFiles([]);
    }
  };

  // Process all unprocessed files
  const processMutation = useMutation({
    mutationFn: async () => {
      const unprocessedFiles = files?.filter(file => !file.processed) || [];
      if (unprocessedFiles.length === 0) {
        return { message: "No files to process" };
      }
      
      const unprocessedFileIds = unprocessedFiles.map(file => file.id);
      return await apiRequest("/api/process-uploads", {
        method: "POST",
        body: { fileIds: unprocessedFileIds }
      });
    },
    onSuccess: () => {
      toast({
        title: "Processing started",
        description: "Files are being processed in the background. Refresh in a moment to see results.",
        variant: "default",
      });
      
      // Refresh the file list after a short delay to show updated status
      setTimeout(() => {
        refetch();
      }, 2000);
    },
    onError: (error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Helper function to check if there are unprocessed files
  const hasUnprocessedFiles = () => {
    return files?.some(file => !file.processed) ?? false;
  };

  // Function to trigger processing of all unprocessed files
  const processAllUnprocessedFiles = () => {
    processMutation.mutate();
  };

  // Fetch uploaded files
  const { 
    data: files, 
    isLoading,
    refetch
  } = useQuery<UploadedFile[]>({
    queryKey: ["/api/uploads/history"],
    refetchInterval: false,
  });

  // Fetch file content
  const fetchFileContent = useMutation({
    mutationFn: async (fileId: string) => {
      try {
        const response = await fetch(`/api/uploads/${fileId}/content`, {
          method: "GET",
          headers: {
            'Accept': 'application/json',
          },
          credentials: "include",
        });
        
        if (!response.ok) {
          let errorMessage = "Failed to fetch file content";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (parseError) {
            // If we can't parse the response as JSON, use the text
            const errorText = await response.text();
            if (errorText) {
              // Check if the error is an HTML response
              if (errorText.includes('<!DOCTYPE html>')) {
                errorMessage = "Server error - received HTML instead of JSON";
              } else {
                errorMessage = errorText;
              }
            }
          }
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data as FileContentResponse;
      } catch (error) {
        console.error('Error in fetchFileContent:', error);
        throw error;
      }
    },
    onSuccess: (data: FileContentResponse) => {
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

  // Re-process file
  const reprocessFile = useMutation({
    mutationFn: async (fileId: string) => {
      try {
        const response = await fetch(`/api/uploads/${fileId}/reprocess`, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: "include",
        });
        
        if (!response.ok) {
          let errorMessage = "Failed to reprocess file";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (parseError) {
            // If we can't parse the response as JSON, use the text
            const errorText = await response.text();
            if (errorText) {
              // Check if the error is an HTML response
              if (errorText.includes('<!DOCTYPE html>')) {
                errorMessage = "Server error - received HTML instead of JSON";
              } else {
                errorMessage = errorText;
              }
            }
          }
          throw new Error(errorMessage);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Error in reprocessFile:', error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "File Queued",
        description: "File has been queued for reprocessing and will be processed in the background",
      });
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

  // Soft delete file
  const deleteFile = useMutation({
    mutationFn: async (fileId: string) => {
      try {
        const response = await fetch(`/api/uploads/${fileId}`, {
          method: "DELETE",
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: "include",
        });
        
        if (!response.ok) {
          let errorMessage = "Failed to delete file";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (parseError) {
            // If we can't parse the response as JSON, use the text
            const errorText = await response.text();
            if (errorText) {
              // Check if the error is an HTML response
              if (errorText.includes('<!DOCTYPE html>')) {
                errorMessage = "Server error - received HTML instead of JSON";
              } else {
                errorMessage = errorText;
              }
            }
          }
          throw new Error(errorMessage);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Error in deleteFile:', error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File has been deleted",
      });
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

  // Helper functions
  function formatFileType(type: string) {
    switch (type) {
      case "merchant":
        return "Merchant Demographics";
      case "transaction":
        return "Transaction Data";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  function formatFileDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
    const diffInHours = diffInMinutes / 60;
    
    // For very recent uploads (less than 2 minutes)
    if (diffInMinutes < 2 && diffInMinutes >= 0) {
      return "Just now";
    }
    // For recent uploads (less than 1 hour)
    else if (diffInHours < 1 && diffInHours >= 0) {
      const minutes = Math.floor(diffInMinutes);
      return `${minutes} min ago`;
    }
    // For uploads today (less than 24 hours)
    else if (diffInHours < 24 && diffInHours >= 0) {
      const hours = Math.floor(diffInHours);
      return `${hours}h ago`;
    }
    // For older uploads, show local date/time
    else {
      return format(date, "MMM d, h:mm a");
    }
  }

  function formatFullDate(dateString: string) {
    const date = new Date(dateString);
    // Show full local date and time with timezone
    return format(date, "MMM d, yyyy 'at' h:mm:ss a"); 
  }

  // Handle viewing file error
  function handleViewError(file: UploadedFile) {
    setSelectedFile(file);
    setIsErrorDialogOpen(true);
  }

  // Handle viewing file content
  function handleViewContent(file: UploadedFile) {
    setSelectedFile(file);
    fetchFileContent.mutate(file.id);
  }

  // Handle viewing file metadata
  function handleViewMetadata(file: UploadedFile) {
    setMetadataFile(file);
  }

  // Handle reprocessing file
  function handleReprocessFile(file: UploadedFile) {
    reprocessFile.mutate(file.id);
  }

  // Handle file selection for bulk operations
  function toggleFileSelection(file: UploadedFile) {
    if (selectedFiles.some(f => f.id === file.id)) {
      setSelectedFiles(selectedFiles.filter(f => f.id !== file.id));
    } else {
      setSelectedFiles([...selectedFiles, file]);
    }
  }

  // Handle select all files functionality
  function toggleSelectAll(filesData?: UploadedFile[]) {
    if (!filesData) return;
    
    // If all files are selected, deselect all
    const currentTabFiles = filesData;
    const allSelected = currentTabFiles.every(file => 
      selectedFiles.some(f => f.id === file.id)
    );
    
    if (allSelected) {
      // Deselect all files in the current view
      setSelectedFiles(selectedFiles.filter(f => 
        !currentTabFiles.some(cf => cf.id === f.id)
      ));
    } else {
      // Select all files in the current view
      const filesNotYetSelected = currentTabFiles.filter(file => 
        !selectedFiles.some(f => f.id === file.id)
      );
      setSelectedFiles([...selectedFiles, ...filesNotYetSelected]);
    }
  }
  
  // Handle deleting file
  function handleDeleteFile(file: UploadedFile) {
    setSelectedFile(file);
    setIsDeleteDialogOpen(true);
  }
  
  // Handle deleting multiple files
  function handleMultiDelete() {
    if (selectedFiles.length === 0) return;
    setIsMultiDeleteDialogOpen(true);
  }
  
  // Confirm single file deletion
  function confirmDelete() {
    if (selectedFile) {
      deleteFile.mutate(selectedFile.id);
      setIsDeleteDialogOpen(false);
    }
  }
  
  // Handle reprocessing multiple files
  function handleMultiReprocess() {
    if (selectedFiles.length === 0) return;
    setIsMultiReprocessDialogOpen(true);
  }
  
  // Confirm multi-file reprocessing
  function confirmMultiReprocess() {
    // Sequential reprocessing of multiple files
    const reprocessFiles = async () => {
      let successCount = 0;
      let errorCount = 0;
      
      for (const file of selectedFiles) {
        try {
          await new Promise<void>((resolve, reject) => {
            reprocessFile.mutate(file.id, {
              onSuccess: () => {
                successCount++;
                resolve();
              },
              onError: (error) => {
                errorCount++;
                console.error(`Error reprocessing file ${file.id}:`, error);
                resolve(); // Still resolve to continue with other files
              }
            });
          });
        } catch (error) {
          errorCount++;
          console.error(`Error in reprocessFiles for ${file.id}:`, error);
        }
      }
      
      // Show result toast
      toast({
        title: "Files Queued for Reprocessing",
        description: `Successfully queued ${successCount} files for background processing. ${errorCount > 0 ? `Failed to queue ${errorCount} files.` : ''}`,
        variant: successCount > 0 ? "default" : "destructive"
      });
      
      // Clear selection and close dialog
      setSelectedFiles([]);
      setSelectMode(false);
      setIsMultiReprocessDialogOpen(false);
      
      // Refresh the file list
      refetch();
    };
    
    reprocessFiles();
  }

  // Confirm multi-file deletion
  function confirmMultiDelete() {
    // Sequential deletion of multiple files
    const deleteFiles = async () => {
      let successCount = 0;
      let errorCount = 0;
      
      for (const file of selectedFiles) {
        try {
          await new Promise<void>((resolve, reject) => {
            deleteFile.mutate(file.id, {
              onSuccess: () => {
                successCount++;
                resolve();
              },
              onError: (error) => {
                errorCount++;
                console.error(`Error deleting file ${file.id}:`, error);
                resolve(); // Still resolve to continue with other files
              }
            });
          });
        } catch (error) {
          errorCount++;
          console.error(`Error in deleteFiles for ${file.id}:`, error);
        }
      }
      
      // Show result toast
      toast({
        title: "Bulk Delete Complete",
        description: `Successfully deleted ${successCount} files. ${errorCount > 0 ? `Failed to delete ${errorCount} files.` : ''}`,
        variant: errorCount > 0 ? "destructive" : "default",
      });
      
      // Exit select mode
      setSelectMode(false);
      setSelectedFiles([]);
      setIsMultiDeleteDialogOpen(false);
      refetch();
    };
    
    deleteFiles();
  }

  // Handle downloading file
  function handleDownloadFile(file: UploadedFile) {
    window.location.href = `/api/uploads/${file.id}/download`;
  }

  // Function to handle pagination
  function handlePageChange(newPage: number) {
    setPagination(prev => ({
      ...prev,
      currentPage: newPage
    }));
  }

  // Function to handle records per page change
  function handleItemsPerPageChange(newItemsPerPage: number) {
    setPagination(prev => ({
      ...prev,
      itemsPerPage: newItemsPerPage,
      currentPage: 1 // Reset to first page when changing items per page
    }));
  }

  // Reset pagination to page 1 when files data changes
  useEffect(() => {
    setPagination(prev => ({
      ...prev,
      currentPage: 1
    }));
  }, [files]);

  // Helper function to render the file table
  function renderFileTable(filesData?: UploadedFile[]) {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Loading file history...</p>
        </div>
      );
    }

    if (!filesData || filesData.length === 0) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-gray-500">
            <FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p>No files have been uploaded yet</p>
          </CardContent>
        </Card>
      );
    }
    
    // Create a copy to sort by date descending (newest first)
    const sortedFiles = [...filesData].sort((a, b) => {
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    });
    
    // Calculate pagination based on filtered data
    const totalItems = sortedFiles.length;
    const totalPages = Math.ceil(totalItems / pagination.itemsPerPage);
    const currentPage = Math.min(pagination.currentPage, Math.max(1, totalPages));
    
    // Apply pagination
    const startIndex = (currentPage - 1) * pagination.itemsPerPage;
    const endIndex = startIndex + pagination.itemsPerPage;
    const paginatedFiles = sortedFiles.slice(startIndex, endIndex);

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
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
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleMultiReprocess}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Reprocess {selectedFiles.length} Selected
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs"
                onClick={handleMultiDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete {selectedFiles.length} Selected
              </Button>
            </>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {selectMode && (
                    <TableHead className="w-12">
                      <Checkbox 
                        checked={
                          paginatedFiles.length > 0 && 
                          paginatedFiles.every(file => 
                            selectedFiles.some(f => f.id === file.id)
                          )
                        }
                        onCheckedChange={() => toggleSelectAll(paginatedFiles)}
                        aria-label="Select all files"
                      />
                    </TableHead>
                  )}
                  <TableHead>File Name</TableHead>
                  <TableHead>File Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Processed Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFiles.map((file) => (
                  <TableRow key={file.id}>
                    {selectMode && (
                      <TableCell className="w-12">
                        <Checkbox
                          checked={selectedFiles.some(f => f.id === file.id)}
                          onCheckedChange={() => toggleFileSelection(file)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="font-medium">{file.originalFilename}</div>
                      <div className="text-sm text-muted-foreground">
                        ID: {file.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {formatFileType(file.fileType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {file.processed ? (
                        file.processingErrors ? (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Error
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-200">
                            <Check className="h-3 w-3" />
                            Processed
                          </Badge>
                        )
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1 bg-blue-100 text-blue-800 hover:bg-blue-200">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Queued
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatFileDate(file.uploadedAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatFullDate(file.uploadedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {file.processedAt ? (
                        <div>
                          <div className="font-medium">
                            {formatFileDate(file.processedAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatFullDate(file.processedAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <span className="sr-only">Open menu</span>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-4 w-4"
                            >
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleViewContent(file)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Content
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewMetadata(file)}>
                            <BarChart3 className="mr-2 h-4 w-4" />
                            View Metadata
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadFile(file)}>
                            <DownloadCloud className="mr-2 h-4 w-4" />
                            Download
                          </DropdownMenuItem>
                          {file.processingErrors && (
                            <DropdownMenuItem onClick={() => handleViewError(file)}>
                              <AlertCircle className="mr-2 h-4 w-4" />
                              View Error
                            </DropdownMenuItem>
                          )}
                          {(file.processingErrors || !file.processed) && (
                            <DropdownMenuItem onClick={() => handleReprocessFile(file)}>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Reprocess
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteFile(file)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {totalItems > 0 && (
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center pt-2 pb-4 gap-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="items-per-page" className="text-sm">Show:</Label>
                <Select 
                  value={pagination.itemsPerPage.toString()} 
                  onValueChange={(value) => handleItemsPerPageChange(Number(value))}
                >
                  <SelectTrigger id="items-per-page" className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  per page
                </span>
              </div>
              
              {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <span className="text-sm px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} files
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">File Uploads</h1>
              <p className="text-muted-foreground">
                Manage your uploaded merchant and transaction files
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button 
                variant="outline"
                size="sm" 
                onClick={processAllUnprocessedFiles}
                disabled={processMutation.isPending || !hasUnprocessedFiles()}
              >
                {processMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Process Files
                  </>
                )}
              </Button>
              <Button size="sm" onClick={toggleUploadModal}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </div>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6">
            <div className="col-span-1">
              <FileProcessorStatus />
            </div>
            <div className="col-span-1 md:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-md font-medium">File Upload Statistics</CardTitle>
                  <CardDescription>Overview of your file uploads and processing history</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Total Files</div>
                      <div className="text-2xl font-bold">{files?.length || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Unprocessed</div>
                      <div className="text-2xl font-bold">{files?.filter(f => !f.processed).length || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Transaction Files</div>
                      <div className="text-2xl font-bold">{files?.filter(f => f.fileType === 'transaction').length || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Merchant Files</div>
                      <div className="text-2xl font-bold">{files?.filter(f => f.fileType === 'merchant').length || 0}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          {/* Top-level tabs for File Management, Processing Monitor, and Settings */}
          <Tabs defaultValue="files" className="mt-6">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="files">File History</TabsTrigger>
              <TabsTrigger value="processing">Processing Monitor</TabsTrigger>
              <TabsTrigger value="settings">Field Mappings</TabsTrigger>
            </TabsList>
            
            {/* Files Tab Content */}
            <TabsContent value="files" className="mt-6">
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">
                    All Files ({files?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="merchant">
                    Merchant Files ({files?.filter(file => file.fileType === 'merchant').length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="transaction">
                    Transaction Files ({files?.filter(file => file.fileType === 'transaction').length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="queued">
                    Queued ({files?.filter(file => !file.processed && !file.processingErrors).length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="errors">
                    Files with Errors ({files?.filter(file => file.processingErrors).length || 0})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="all" className="mt-4">
                  {renderFileTable(files)}
                </TabsContent>
                <TabsContent value="merchant" className="mt-4">
                  {renderFileTable(files?.filter(file => file.fileType === 'merchant'))}
                </TabsContent>
                <TabsContent value="transaction" className="mt-4">
                  {renderFileTable(files?.filter(file => file.fileType === 'transaction'))}
                </TabsContent>
                <TabsContent value="queued" className="mt-4">
                  {renderFileTable(files?.filter(file => !file.processed && !file.processingErrors))}
                </TabsContent>
                <TabsContent value="errors" className="mt-4">
                  {renderFileTable(files?.filter(file => file.processingErrors))}
                </TabsContent>
              </Tabs>
            </TabsContent>
            
            {/* Processing Monitor Tab Content */}
            <TabsContent value="processing" className="mt-6">
              <ProcessingFilters />
            </TabsContent>
            
            {/* Settings Tab Content */}
            <TabsContent value="settings" className="mt-6">
              <MappingSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <FileUploadModal onClose={toggleUploadModal} />
      )}

      {/* Error Dialog */}
      <Dialog
        open={isErrorDialogOpen}
        onOpenChange={(open) => setIsErrorDialogOpen(open)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Processing Error
            </DialogTitle>
            <DialogDescription>
              {selectedFile?.originalFilename}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-4 rounded-md">
            <pre className="whitespace-pre-wrap text-sm">
              {selectedFile?.processingErrors}
            </pre>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsErrorDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                setIsErrorDialogOpen(false);
                if (selectedFile) {
                  handleReprocessFile(selectedFile);
                }
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reprocess File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Content Dialog */}
      <Dialog
        open={isViewDialogOpen}
        onOpenChange={(open) => setIsViewDialogOpen(open)}
      >
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              File Content
            </DialogTitle>
            <DialogDescription>
              {selectedFile?.originalFilename}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            {fetchFileContent.isPending ? (
              <div className="flex justify-center items-center py-8">
                <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground" />
              </div>
            ) : fileContent ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    {fileContent.headers.map((header, index) => (
                      <TableHead key={index}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fileContent.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {fileContent.headers.map((header, cellIndex) => (
                        <TableCell key={cellIndex}>
                          {row[header] != null ? String(row[header]) : ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No content available</AlertTitle>
                <AlertDescription>
                  The file content could not be retrieved or displayed.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsViewDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => setIsDeleteDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the file:
              <div className="font-medium mt-1">{selectedFile?.originalFilename}</div>
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The file will be permanently removed from the system.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteFile.isPending}
            >
              {deleteFile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete File
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Multi-Delete Confirmation Dialog */}
      <Dialog
        open={isMultiDeleteDialogOpen}
        onOpenChange={(open) => setIsMultiDeleteDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Confirm Bulk Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedFiles.length} file(s)?
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The files will be permanently removed from the system.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsMultiDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmMultiDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete {selectedFiles.length} Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Multi-Reprocess Confirmation Dialog */}
      <Dialog
        open={isMultiReprocessDialogOpen}
        onOpenChange={(open) => setIsMultiReprocessDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <RefreshCw className="h-5 w-5" />
              Confirm Reprocessing
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to reprocess {selectedFiles.length} selected file{selectedFiles.length === 1 ? '' : 's'}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground">
              This will re-run the processing pipeline for the selected files. Any previous processing results will be updated.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsMultiReprocessDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmMultiReprocess}
              disabled={reprocessFile.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {reprocessFile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reprocessing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reprocess Files
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Processing Metadata Dialog */}
      <Dialog
        open={!!metadataFile}
        onOpenChange={(open) => !open && setMetadataFile(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Processing Metadata
            </DialogTitle>
            <DialogDescription>
              Detailed processing information for {metadataFile?.originalFilename}
            </DialogDescription>
          </DialogHeader>
          
          {metadataFile && (
            <div className="space-y-6">
              {/* File Information */}
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  File Information
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">File ID:</span>
                    <div className="font-mono">{metadataFile.id}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">File Type:</span>
                    <div>{metadataFile.fileType}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Upload Time:</span>
                    <div>{formatFullDate(metadataFile.uploadedAt)}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Status:</span>
                    <div>{metadataFile.processed ? "Processed" : "Queued"}</div>
                  </div>
                </div>
              </div>

              {/* Processing Timeline */}
              {(metadataFile.processingStartedAt || metadataFile.processingCompletedAt) && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Loader2 className="h-4 w-4" />
                    Processing Timeline
                  </h4>
                  <div className="grid grid-cols-1 gap-4 text-sm">
                    {metadataFile.processingStartedAt && (
                      <div>
                        <span className="font-medium text-muted-foreground">Started:</span>
                        <div>{formatFullDate(metadataFile.processingStartedAt)}</div>
                      </div>
                    )}
                    {metadataFile.processingCompletedAt && (
                      <div>
                        <span className="font-medium text-muted-foreground">Completed:</span>
                        <div>{formatFullDate(metadataFile.processingCompletedAt)}</div>
                      </div>
                    )}
                    {metadataFile.processingTimeMs && (
                      <div>
                        <span className="font-medium text-muted-foreground">Duration:</span>
                        <div>{(metadataFile.processingTimeMs / 1000).toFixed(2)} seconds</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Processing Statistics */}
              {(metadataFile.recordsProcessed !== undefined || 
                metadataFile.recordsSkipped !== undefined || 
                metadataFile.recordsWithErrors !== undefined) && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Processing Statistics
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {metadataFile.recordsProcessed !== undefined && (
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {metadataFile.recordsProcessed}
                        </div>
                        <div className="text-green-700">Records Processed</div>
                      </div>
                    )}
                    {metadataFile.recordsSkipped !== undefined && (
                      <div className="text-center p-3 bg-yellow-50 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600">
                          {metadataFile.recordsSkipped}
                        </div>
                        <div className="text-yellow-700">Records Skipped</div>
                      </div>
                    )}
                    {metadataFile.recordsWithErrors !== undefined && (
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">
                          {metadataFile.recordsWithErrors}
                        </div>
                        <div className="text-red-700">Records with Errors</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Processing Details */}
              {metadataFile.processingDetails && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Processing Details
                  </h4>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <pre className="text-xs whitespace-pre-wrap text-gray-700">
                      {JSON.stringify(JSON.parse(metadataFile.processingDetails), null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Processing Errors */}
              {metadataFile.processingErrors && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    Processing Errors
                  </h4>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-red-800 text-sm">{metadataFile.processingErrors}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetadataFile(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}