import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Zap, Database, FileText } from "lucide-react";
import FileUploader from "./FileUploader";
import SmartFileUploader from "./SmartFileUploader";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "uploaded" | "queued" | "processing" | "completed" | "error";
  type: "merchant" | "transaction" | "terminal" | "tddf" | "merchant-risk";
  rawLinesCount?: number;
}

interface FileUploadModalProps {
  onClose: () => void;
}

export default function FileUploadModal({ onClose }: FileUploadModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"merchant" | "transaction" | "terminal" | "tddf" | "merchant-risk">("tddf");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);

  // Monitor upload progress for uploaded files
  const { data: uploadStatusData } = useQuery({
    queryKey: ["/api/uploads/history"],
    enabled: uploadedFileIds.length > 0,
    refetchInterval: 2000, // Poll every 2 seconds
    refetchIntervalInBackground: true,
  });

  // Update file statuses based on server data
  useEffect(() => {
    if (uploadStatusData && (uploadStatusData as any)?.uploads && uploadedFileIds.length > 0) {
      setFiles((prevFiles) => 
        prevFiles.map((file) => {
          const serverFile = (uploadStatusData as any).uploads.find((upload: any) => upload.id === file.id);
          if (serverFile) {
            const newStatus = serverFile.processing_status === "uploading" ? "uploading" :
                            serverFile.processing_status === "queued" ? "queued" :
                            serverFile.processing_status === "processing" ? "processing" :
                            serverFile.processing_status === "completed" ? "completed" :
                            serverFile.processing_status === "failed" ? "error" : file.status;
            
            return {
              ...file,
              status: newStatus,
              rawLinesCount: serverFile.raw_lines_count || file.rawLinesCount,
              progress: newStatus === "completed" ? 100 :
                       newStatus === "processing" ? 75 :
                       newStatus === "queued" ? 50 :
                       file.progress
            };
          }
          return file;
        })
      );
    }
  }, [uploadStatusData, uploadedFileIds]);

  const handleFilesSelected = (acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      progress: 0,
      status: "uploading" as const,
      type: activeTab,
      file: file,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
    
    // Start uploading files
    newFiles.forEach((fileData) => {
      uploadFile(fileData);
    });
  };

  const uploadFile = async (fileData: UploadedFile & { file: File }) => {
    const formData = new FormData();
    formData.append("files", fileData.file);
    formData.append("type", fileData.type);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === fileData.id && f.progress < 95) {
              return { ...f, progress: f.progress + 5 };
            }
            return f;
          })
        );
      }, 100);

      // Upload file
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        let errorMessage = "Failed to upload file";
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

      // Try to parse the response as JSON
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        throw new Error("Invalid response from server");
      }

      // Get the file ID from the response (uploads API returns array)
      const uploadResults = responseData.uploads || responseData;
      const firstUpload = Array.isArray(uploadResults) ? uploadResults[0] : uploadResults;
      const fileId = firstUpload?.id || firstUpload?.fileId;
      
      if (!fileId) {
        throw new Error("No file ID returned from server");
      }

      // Update file status to uploaded and store the server file ID
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id === fileData.id) {
            return { ...f, progress: 50, status: "uploaded", id: fileId };
          }
          return f;
        })
      );

      // Add to monitoring list
      setUploadedFileIds((prev) => [...prev, fileId]);

      // Start monitoring this file immediately by refreshing the history
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
      }, 1000);

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });

      toast({
        title: "File Uploaded",
        description: `${fileData.name} has been uploaded successfully.`,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id === fileData.id) {
            return { ...f, status: "error" };
          }
          return f;
        })
      );

      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : `Failed to upload ${fileData.name}.`,
        variant: "destructive",
      });
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      // Process all uploaded files
      if (files.some((f) => f.status === "uploading")) {
        // Wait for all files to complete
        return Promise.resolve();
      }
      
      const fileIds = files.filter(f => f.status === "uploaded").map(f => f.id);
      console.log("Files to process:", fileIds);
      
      if (fileIds.length === 0) {
        console.error("No files to process. All files:", files);
        throw new Error("No files to process");
      }
      
      try {
        console.log("Sending process-uploads request with fileIds:", fileIds);
        const response = await fetch("/api/process-uploads", {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileIds }),
          credentials: "include",
        });
        
        if (!response.ok) {
          let errorMessage = "Failed to process files";
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
        console.error('Error in uploadMutation:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Process-uploads response:", data);
      
      const isBackground = data?.message?.includes("background");
      
      toast({
        title: isBackground ? "Processing Started" : "Processing Complete",
        description: isBackground 
          ? "Files are being processed in the background. Check the Uploads page for status."
          : "All files have been processed successfully.",
      });
      
      // Set up periodic refresh of data 
      const refreshIntervalId = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
      }, 3000); // Refresh every 3 seconds
      
      // Clear interval after 30 seconds (after 10 refreshes)
      setTimeout(() => {
        clearInterval(refreshIntervalId);
      }, 30000);
      
      // Initial refresh
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
      
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "An error occurred during processing.",
        variant: "destructive",
      });
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <DialogTitle className="text-center mt-4">Upload Merchant Data</DialogTitle>
          <DialogDescription className="text-center">
            Select the files you want to upload. Advanced file processing with smart file type detection.
          </DialogDescription>
          <div className="flex justify-center gap-4 text-sm text-muted-foreground mt-2">
            <div className="flex items-center gap-1">
              <Zap className="h-4 w-4" />
              {activeTab === 'tddf' ? 'TDDF' :
               activeTab === 'merchant' ? 'Demographics' :
               activeTab === 'transaction' ? 'ACH Processing' :
               activeTab === 'terminal' ? 'Terminal Risk' :
               activeTab === 'merchant-risk' ? 'Merchant Risk' :
               'Unknown'}
            </div>
            <div className="flex items-center gap-1">
              <Database className="h-4 w-4" />
              500MB Limit
            </div>
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              All File Types
            </div>
          </div>
        </DialogHeader>
        
        {/* File Type Selection - MMS Uploader Style */}
        <Card className="mb-4">
          <CardContent className="p-4">
            {/* Quick File Type Selection Buttons */}
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-3">
                Quick Select:
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button 
                  variant={activeTab === 'tddf' ? 'default' : 'outline'}
                  size="sm"
                  className={activeTab === 'tddf' ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-gray-50'}
                  onClick={() => setActiveTab('tddf')}
                  title="TSYS Transaction Daily Detail"
                >
                  {activeTab === 'tddf' ? '🟢' : '⚫'} TDDF
                </Button>
                <Button 
                  variant={activeTab === 'merchant' ? 'default' : 'outline'}
                  size="sm"
                  className={activeTab === 'merchant' ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-gray-50'}
                  onClick={() => setActiveTab('merchant')}
                  title="Merchant Demographics"
                >
                  {activeTab === 'merchant' ? '🟢' : '⚫'} Dem
                </Button>
                <Button 
                  variant={activeTab === 'transaction' ? 'default' : 'outline'}
                  size="sm"
                  className={activeTab === 'transaction' ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-gray-50'}
                  onClick={() => setActiveTab('transaction')}
                  title="ACH Processing Logs"
                >
                  {activeTab === 'transaction' ? '🟢' : '⚫'} ACH
                </Button>
                <Button 
                  variant={activeTab === 'terminal' ? 'default' : 'outline'}
                  size="sm"
                  className={activeTab === 'terminal' ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-gray-50'}
                  onClick={() => setActiveTab('terminal')}
                  title="TSYS Terminal Risk Report"
                >
                  {activeTab === 'terminal' ? '🟢' : '⚫'} Terminals
                </Button>
                <Button 
                  variant={activeTab === 'merchant-risk' ? 'default' : 'outline'}
                  size="sm"
                  className={activeTab === 'merchant-risk' ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-gray-50'}
                  onClick={() => setActiveTab('merchant-risk')}
                  title="TSYS Merchant Risk File"
                >
                  {activeTab === 'merchant-risk' ? '🟢' : '⚫'} TMerch
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <SmartFileUploader 
          fileType={activeTab} 
          onUploadComplete={(fileIds) => {
            // Refresh both upload list and processing status
            queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
            queryClient.invalidateQueries({ queryKey: ["/api/uploads/processing-status"] });
            toast({
              title: "Upload Complete",
              description: `Successfully uploaded ${fileIds.length} file(s)`,
            });
            // Close modal after successful upload
            setTimeout(() => {
              onClose();
            }, 1500);
          }}
        />
        
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">
              Uploading {files.length} files
            </h4>
            <span className="text-sm text-gray-500">
              {files.filter(f => f.status === "completed").length} / {files.length} completed
            </span>
          </div>
          
          {files.length === 0 ? (
            <div className="p-4 text-center border rounded-md border-gray-200">
              <p className="text-sm text-gray-500">No files selected</p>
            </div>
          ) : (
            <div 
              className={`space-y-2 ${files.length > 5 ? 'max-h-60 overflow-y-auto pr-2' : ''}`}
              style={files.length > 5 ? { 
                scrollbarWidth: 'thin',
                scrollbarColor: '#d1d5db #f3f4f6'
              } : undefined}
            >
              {files.map((file) => (
                <div key={file.id} className="p-3 border rounded-md border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">{file.name}</span>
                      <span className="ml-2 text-xs text-gray-500">({formatFileSize(file.size)})</span>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-2">
                    <Progress 
                      value={file.progress} 
                      className={`h-1.5 ${
                        file.status === "completed" ? "bg-green-100" :
                        file.status === "processing" ? "bg-blue-100" :
                        file.status === "error" ? "bg-red-100" : ""
                      }`} 
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-xs ${
                        file.status === "completed" ? "text-green-600 font-medium" :
                        file.status === "processing" ? "text-blue-600 font-medium" :
                        file.status === "queued" ? "text-yellow-600" :
                        file.status === "error" ? "text-red-600" : "text-gray-500"
                      }`}>
                        {file.status === "uploading" ? "Uploading..." :
                         file.status === "uploaded" ? "Uploaded - Ready to Process" :
                         file.status === "queued" ? `Queued (${file.rawLinesCount || 0} lines)` :
                         file.status === "processing" ? "Processing..." :
                         file.status === "completed" ? `✅ Completed (${file.rawLinesCount || 0} lines)` :
                         file.status === "error" ? "❌ Failed" : "Unknown"}
                      </span>
                      <span className="text-xs font-medium text-gray-700">{file.progress}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <DialogFooter className="sm:justify-end">
          <Button 
            variant="outline" 
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (files.every(f => f.status === "completed")) {
                onClose();
              } else {
                uploadMutation.mutate();
              }
            }}
            disabled={uploadMutation.isPending || files.length === 0 || files.some(f => f.status === "uploading")}
            className={files.length > 0 && files.every(f => f.status !== "uploading") && !uploadMutation.isPending ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {uploadMutation.isPending ? "Processing..." : 
             files.every(f => f.status === "completed") ? "Close" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
