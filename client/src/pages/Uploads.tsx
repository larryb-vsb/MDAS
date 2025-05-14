import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import MainLayout from "@/components/layout/MainLayout";
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
  Play
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
  deleted?: boolean;
}

interface FileContentResponse {
  headers: string[];
  rows: Record<string, any>[];
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
  const [fileContent, setFileContent] = useState<FileContentResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  
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
        title: "Success",
        description: "File has been reprocessed successfully",
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
    return formatDistanceToNow(date, { addSuffix: true });
  }

  function formatFullDate(dateString: string) {
    const date = new Date(dateString);
    return format(date, "PPpp"); // Example: "Apr 29, 2021, 2:00 PM"
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
            <Button
              variant="destructive"
              size="sm"
              className="text-xs"
              onClick={handleMultiDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete {selectedFiles.length} Selected
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {selectMode && <TableHead className="w-12"></TableHead>}
                  <TableHead>File Name</TableHead>
                  <TableHead>File Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filesData.map((file) => (
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
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Unprocessed
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
          
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All Files</TabsTrigger>
              <TabsTrigger value="merchant">Merchant Files</TabsTrigger>
              <TabsTrigger value="transaction">Transaction Files</TabsTrigger>
              <TabsTrigger value="errors">Files with Errors</TabsTrigger>
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
            <TabsContent value="errors" className="mt-4">
              {renderFileTable(files?.filter(file => file.processingErrors))}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <Dialog open onOpenChange={(open) => !open && toggleUploadModal()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload File</DialogTitle>
              <DialogDescription>
                Upload merchant demographics or transaction data files in CSV format.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="upload" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="instructions">Instructions</TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="fileType">File Type</Label>
                  <Select
                    defaultValue="merchant"
                    onValueChange={(val: string) => {}}
                  >
                    <SelectTrigger id="fileType">
                      <SelectValue placeholder="Select file type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merchant">Merchant Demographics</SelectItem>
                      <SelectItem value="transaction">Transaction Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div
                  className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50`}
                >
                  <div className="space-y-2">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p>Drag and drop a CSV file here, or click to select file</p>
                    <p className="text-xs text-muted-foreground">
                      Only CSV files are supported
                    </p>
                  </div>
                </div>

                <Alert variant="default" className="bg-muted">
                  <AlertTitle>Note</AlertTitle>
                  <AlertDescription>
                    The file upload functionality is simplified for this demo. Click the button below to simulate an upload.
                  </AlertDescription>
                </Alert>
              </TabsContent>
              
              <TabsContent value="instructions" className="mt-4">
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-medium mb-1">Merchant Demographics Format:</h3>
                    <p className="text-muted-foreground">
                      CSV file with the following headers:
                    </p>
                    <pre className="bg-muted/50 p-2 rounded text-xs mt-1">
                      Merchant_ID, Name, Status, Address, City, State, Zip, Category
                    </pre>
                  </div>
                  
                  <div>
                    <h3 className="font-medium mb-1">Transaction Data Format:</h3>
                    <p className="text-muted-foreground">
                      CSV file with the following headers:
                    </p>
                    <pre className="bg-muted/50 p-2 rounded text-xs mt-1">
                      Transaction_ID, Merchant_ID, Amount, Date, Type
                    </pre>
                  </div>
                  
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Important</AlertTitle>
                    <AlertDescription>
                      Make sure your CSV files have a header row that matches the formats above.
                      The Date field should be in YYYY-MM-DD format.
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={toggleUploadModal}
              >
                Cancel
              </Button>
              <Button onClick={toggleUploadModal}>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
    </MainLayout>
  );
}