import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { UploadedFile } from "@shared/schema";
import MainLayout from "@/components/layout/MainLayout";
import { 
  Card,
  CardContent, 
  CardHeader, 
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Alert,
  AlertDescription, 
  AlertTitle,
} from "@/components/ui/alert";
import { 
  Table,
  TableBody, 
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  BarChart3,
  RefreshCw,
  FileText,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatUploadTime, formatRelativeTime, formatDetailedDate } from "@/lib/date-utils";
import FileUploadModal from "@/components/uploads/FileUploadModal";
import ProcessingFilters from "@/components/uploads/ProcessingFilters";
import MappingSettings from "@/components/uploads/MappingSettings";

export default function Uploads() {
  // State management
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [metadataFile, setMetadataFile] = useState<UploadedFile | null>(null);
  const [fileContent, setFileContent] = useState<{ headers: string[], rows: any[] } | null>(null);

  
  const { toast } = useToast();

  // API queries
  const { data: apiResponse, isLoading, refetch } = useQuery<{uploads: UploadedFile[], pagination: any}>({
    queryKey: ["/api/uploads/history"],
    refetchInterval: 5000,
  });
  
  // Get complete statistics from larger dataset for accurate overview
  const { data: statsResponse, isLoading: statsLoading } = useQuery<{uploads: UploadedFile[], pagination: any}>({
    queryKey: ["/api/uploads/history", { limit: 1000 }],
    queryFn: () => fetch("/api/uploads/history?limit=1000", { credentials: "include" }).then(res => res.json()),
    refetchInterval: 5000,
  });
  
  const files = apiResponse?.uploads || [];
  const allFiles = statsResponse?.uploads || [];
  const totalItems = statsResponse?.pagination?.totalItems || 0;

  // File content fetching
  const fetchFileContent = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/uploads/${fileId}/content`);
      if (!response.ok) throw new Error('Failed to fetch file content');
      return await response.json();
    },
    onSuccess: (data) => {
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

  // File reprocessing
  const reprocessFile = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/uploads/${fileId}/reprocess`, { 
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error('Failed to reprocess file');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File has been queued for reprocessing",
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

  // File deletion
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
            // Read the response text once
            const responseText = await response.text();
            
            // Try to parse as JSON first
            try {
              const errorData = JSON.parse(responseText);
              errorMessage = errorData.error || errorMessage;
            } catch (jsonParseError) {
              // If JSON parsing fails, use the text response
              if (responseText) {
                // Check if the error is an HTML response
                if (responseText.includes('<!DOCTYPE html>')) {
                  errorMessage = "Server error - received HTML instead of JSON";
                } else {
                  errorMessage = responseText;
                }
              }
            }
          } catch (readError) {
            errorMessage = "Failed to read error response";
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
  function toggleUploadModal() {
    setIsUploadModalOpen(!isUploadModalOpen);
  }

  function handleViewError(file: UploadedFile) {
    setSelectedFile(file);
    setIsErrorDialogOpen(true);
  }

  function handleViewContent(file: UploadedFile) {
    setSelectedFile(file);
    fetchFileContent.mutate(file.id);
  }

  function handleViewMetadata(file: UploadedFile) {
    setMetadataFile(file);
  }

  function handleReprocessFile(file: UploadedFile) {
    reprocessFile.mutate(file.id);
  }

  function confirmDelete() {
    if (selectedFile) {
      deleteFile.mutate(selectedFile.id);
      setIsDeleteDialogOpen(false);
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">File Management</h1>
            <p className="text-muted-foreground">
              Upload and manage your merchant, transaction, terminal, and TDDF files
            </p>
          </div>
          
          <Button 
            onClick={toggleUploadModal} 
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Files
          </Button>
        </div>

        {/* File Statistics Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              File Statistics Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || statsLoading ? (
              <div className="flex justify-center items-center py-8">
                <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mr-2" />
                <span className="text-muted-foreground">Loading statistics...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Total Files</div>
                  <div className="text-2xl font-bold">{totalItems}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Processing</div>
                  <div className="text-2xl font-bold text-blue-600">1</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Completed</div>
                  <div className="text-2xl font-bold text-green-600">{Array.isArray(allFiles) ? allFiles.filter(f => f.processed && !f.processingErrors).length : 0}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">With Errors</div>
                  <div className="text-2xl font-bold text-red-600">{Array.isArray(allFiles) ? allFiles.filter(f => f.processingErrors).length : 0}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Merchant Files</div>
                  <div className="text-2xl font-bold">{Array.isArray(allFiles) ? allFiles.filter(f => f.fileType === 'merchant').length : 0}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Transaction Files</div>
                  <div className="text-2xl font-bold">{Array.isArray(allFiles) ? allFiles.filter(f => f.fileType === 'transaction').length : 0}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Terminal Files</div>
                  <div className="text-2xl font-bold">{Array.isArray(allFiles) ? allFiles.filter(f => f.fileType === 'terminal').length : 0}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">TDDF Files</div>
                  <div className="text-2xl font-bold text-purple-600">{Array.isArray(allFiles) ? allFiles.filter(f => f.fileType === 'tddf').length : 0}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Top-level tabs for File Management and Settings */}
        <Tabs defaultValue="processing" className="mt-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="processing">Processing Monitor</TabsTrigger>
            <TabsTrigger value="settings">Field Mappings</TabsTrigger>
          </TabsList>
          
          {/* Processing Monitor Tab Content (consolidated file management) */}
          <TabsContent value="processing" className="mt-6">
            <ProcessingFilters />
          </TabsContent>
          

          
          {/* Settings Tab Content */}
          <TabsContent value="settings" className="mt-6">
            <MappingSettings />
          </TabsContent>
        </Tabs>
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
                    <div>{formatDetailedDate(metadataFile.uploadedAt instanceof Date ? metadataFile.uploadedAt.toISOString() : metadataFile.uploadedAt)}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Status:</span>
                    <div>{metadataFile.processed ? "Processed" : "Queued"}</div>
                  </div>
                </div>
              </div>

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
                    <div>
                      <span className="font-medium text-muted-foreground">Records Processed:</span>
                      <div>{metadataFile.recordsProcessed || 0}</div>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Records Skipped:</span>
                      <div>{metadataFile.recordsSkipped || 0}</div>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Records with Errors:</span>
                      <div>{metadataFile.recordsWithErrors || 0}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setMetadataFile(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}