import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileType, AlertCircle, Loader2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface FileUploadModalProps {
  onClose: () => void;
}

export function FileUploadModal({ onClose }: FileUploadModalProps) {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [fileType, setFileType] = useState<string>("merchant");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Only accept CSV files
    const csvFiles = acceptedFiles.filter(
      file => file.type === 'text/csv' || file.name.endsWith('.csv')
    );
    
    if (csvFiles.length === 0) {
      toast({
        title: "Invalid file format",
        description: "Please upload CSV files only",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedFiles(csvFiles);
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(false);

    // Create FormData
    const formData = new FormData();
    formData.append('file', selectedFiles[0]);
    formData.append('type', fileType);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const next = prev + Math.random() * 20;
          return next > 90 ? 90 : next;
        });
      }, 300);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

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

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error("Invalid response from server");
      }
      
      if (result.success) {
        setUploadSuccess(true);
        toast({
          title: "Upload successful",
          description: result.recordsProcessed 
            ? `${result.recordsProcessed} records were processed.`
            : "File was uploaded successfully.",
        });
        
        // Refresh related data
        queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      } else {
        throw new Error(result.error || "Failed to process file");
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "An unknown error occurred");
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Upload merchant demographics, transaction data, or payment terminal files in CSV format.
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
                value={fileType}
                onValueChange={setFileType}
                disabled={isUploading}
              >
                <SelectTrigger id="fileType">
                  <SelectValue placeholder="Select file type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merchant">Merchant Demographics</SelectItem>
                  <SelectItem value="transaction">Transaction Data</SelectItem>
                  <SelectItem value="terminal">Payment Terminals</SelectItem>
                  <SelectItem value="tddf">TDDF Files</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                isDragActive 
                  ? 'border-primary bg-primary/5'
                  : selectedFiles.length > 0
                    ? 'border-green-500 bg-green-50/50' 
                    : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              
              {selectedFiles.length > 0 ? (
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between bg-muted/50 rounded p-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileType size={16} />
                        <span className="truncate text-sm">{file.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                        disabled={isUploading}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p>Drag and drop a CSV file here, or click to select file</p>
                  <p className="text-xs text-muted-foreground">
                    Only CSV files are supported
                  </p>
                </div>
              )}
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {uploadError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}

            {uploadSuccess && (
              <Alert variant="default" className="bg-green-50 border-green-500 text-green-700">
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>
                  File was uploaded and processed successfully.
                </AlertDescription>
              </Alert>
            )}
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
              
              <div>
                <h3 className="font-medium mb-1">TDDF Format:</h3>
                <p className="text-muted-foreground">
                  Fixed-width TDDF files containing DT records in positions 18-19:
                </p>
                <pre className="bg-muted/50 p-2 rounded text-xs mt-1">
                  Fixed-width format with DT identifiers for transaction records
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
            onClick={onClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || selectedFiles.length === 0}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}