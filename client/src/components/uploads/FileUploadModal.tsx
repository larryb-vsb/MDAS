import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "./FileUploader";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "uploaded" | "error";
  type: "merchant" | "transaction";
}

interface FileUploadModalProps {
  onClose: () => void;
}

export default function FileUploadModal({ onClose }: FileUploadModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"merchant" | "transaction">("merchant");
  const [files, setFiles] = useState<UploadedFile[]>([]);

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
    formData.append("file", fileData.file);
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
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        let errorMessage = "Failed to upload file";
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

      // Try to parse the response as JSON
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        throw new Error("Invalid response from server");
      }

      // Get the file ID from the response
      const fileId = responseData.fileId;
      if (!fileId) {
        throw new Error("No file ID returned from server");
      }

      // Update file status to uploaded and store the server file ID
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id === fileData.id) {
            return { ...f, progress: 100, status: "uploaded", id: fileId };
          }
          return f;
        })
      );

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
      
      try {
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
    onSuccess: () => {
      toast({
        title: "Processing Complete",
        description: "All files have been processed successfully.",
      });
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
            Select the files you want to upload. You can upload Merchant Demographics or Transaction files.
          </DialogDescription>
        </DialogHeader>
        
        <FileUploader onFilesSelected={handleFilesSelected} />
        
        <Tabs defaultValue="merchant" value={activeTab} onValueChange={(value) => setActiveTab(value as "merchant" | "transaction")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="merchant">Merchant Demographics</TabsTrigger>
            <TabsTrigger value="transaction">Transactions</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-gray-700">Selected Files</h4>
          
          {files.length === 0 ? (
            <div className="p-4 text-center border rounded-md border-gray-200">
              <p className="text-sm text-gray-500">No files selected</p>
            </div>
          ) : (
            <div className="space-y-2">
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
                    <Progress value={file.progress} className="h-1.5" />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-500">
                        {file.status === "uploading"
                          ? "Uploading..."
                          : file.status === "uploaded"
                          ? "Uploaded"
                          : "Failed"}
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
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending || files.length === 0 || files.some(f => f.status === "uploading")}
          >
            {uploadMutation.isPending ? "Processing..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
