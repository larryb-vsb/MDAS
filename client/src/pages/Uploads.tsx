import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { 
  AlertCircle, 
  Check, 
  AlertTriangle,
  FileText, 
  DownloadCloud, 
  RefreshCw, 
  Trash2, 
  Eye,
  Upload
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { FileUploadModal } from "@/components/uploads";

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
  const [fileContent, setFileContent] = useState<FileContentResponse | null>(null);
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };
  
  const toggleUploadModal = () => {
    setIsUploadModalOpen(prev => !prev);
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
    mutationFn: (fileId: string) => {
      return apiRequest(`/api/uploads/${fileId}/content`);
    },
    onSuccess: (data) => {
      setFileContent(data);
      setIsViewDialogOpen(true);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to fetch file content",
        variant: "destructive",
      });
    }
  });

  // Re-process file
  const reprocessFile = useMutation({
    mutationFn: (fileId: string) => {
      return apiRequest(`/api/uploads/${fileId}/reprocess`, {
        method: "POST"
      });
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
        description: "Failed to reprocess file",
        variant: "destructive",
      });
    }
  });

  // Soft delete file
  const deleteFile = useMutation({
    mutationFn: (fileId: string) => {
      return apiRequest(`/api/uploads/${fileId}`, {
        method: "DELETE"
      });
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
        description: "Failed to delete file",
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

  // Handle deleting file
  function handleDeleteFile(file: UploadedFile) {
    if (confirm(`Are you sure you want to delete the file "${file.originalFilename}"?`)) {
      deleteFile.mutate(file.id);
    }
  }

  // Handle downloading file
  function handleDownloadFile(file: UploadedFile) {
    window.location.href = `/api/uploads/${file.id}/download`;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar isVisible={!isMobileMenuOpen} />
      
      <div className="flex-1 flex flex-col h-full overflow-auto">
        <Header toggleMobileMenu={toggleMobileMenu} toggleUploadModal={toggleUploadModal} />
        
        <div className="flex-1 p-6 space-y-6">
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
    </div>
  );

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
            <Button 
              className="mt-4" 
              variant="outline" 
              size="sm"
              onClick={toggleUploadModal}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="bg-white rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filesData.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText size={16} />
                    <span className="truncate max-w-[200px]" title={file.originalFilename}>
                      {file.originalFilename}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{formatFileType(file.fileType)}</TableCell>
                <TableCell title={formatFullDate(file.uploadedAt)}>
                  {formatFileDate(file.uploadedAt)}
                </TableCell>
                <TableCell>
                  {file.processed ? (
                    file.processingErrors ? (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertCircle size={12} />
                        Error
                      </Badge>
                    ) : (
                      <Badge variant="default" className="flex items-center gap-1 bg-green-500">
                        <Check size={12} />
                        Processed
                      </Badge>
                    )
                  ) : (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>File Options</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleViewContent(file)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Content
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadFile(file)}>
                        <DownloadCloud className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleReprocessFile(file)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reprocess
                      </DropdownMenuItem>
                      {file.processingErrors && (
                        <DropdownMenuItem onClick={() => handleViewError(file)}>
                          <AlertCircle className="mr-2 h-4 w-4" />
                          View Error
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
      </div>
    );
  }
}