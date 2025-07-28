import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Upload, Cloud, ArrowDown, Package } from "lucide-react";

interface SmartFileUploaderProps {
  onUploadComplete: (files: string[]) => void;
  fileType: "merchant" | "transaction" | "terminal" | "tddf" | "merchant-risk";
  disabled?: boolean;
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const SIZE_THRESHOLD = 20 * 1024 * 1024; // 20MB threshold for chunked upload

export default function SmartFileUploader({ onUploadComplete, fileType, disabled }: SmartFileUploaderProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string>("");
  const [uploadMode, setUploadMode] = useState<"regular" | "chunked">("regular");

  // Regular upload for smaller files
  const uploadRegular = useCallback(async (files: FileList) => {
    setUploading(true);
    setUploadMode("regular");
    
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      formData.append("type", fileType);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      const fileIds = result.uploads?.map((upload: any) => upload.id) || [];
      
      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${files.length} file(s)`,
      });

      onUploadComplete(fileIds);
    } catch (error: any) {
      console.error("Regular upload failed:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setProgress(0);
      setFileName("");
    }
  }, [fileType, onUploadComplete, toast]);

  // Chunked upload for larger files
  const uploadChunked = useCallback(async (file: File) => {
    setUploading(true);
    setUploadMode("chunked");
    setFileName(file.name);
    setProgress(0);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = Math.random().toString(36).substr(2, 9);

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", chunkIndex.toString());
        formData.append("totalChunks", totalChunks.toString());
        formData.append("fileName", file.name);
        formData.append("fileType", fileType);

        const response = await fetch("/api/uploads/chunked", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Chunk upload failed: ${response.statusText}`);
        }

        const progress = ((chunkIndex + 1) / totalChunks) * 100;
        setProgress(progress);
      }

      // Finalize the upload
      const finalizeResponse = await fetch("/api/uploads/chunked/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, fileName: file.name, fileType }),
        credentials: "include",
      });

      if (!finalizeResponse.ok) {
        throw new Error(`Upload finalization failed: ${finalizeResponse.statusText}`);
      }

      const result = await finalizeResponse.json();
      
      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      });

      onUploadComplete([result.fileId]);
    } catch (error: any) {
      console.error("Chunked upload failed:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setProgress(0);
      setFileName("");
    }
  }, [fileType, onUploadComplete, toast]);

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // Check if any file is large enough for chunked upload
    const largeFiles = files.filter(file => file.size > SIZE_THRESHOLD);
    
    if (largeFiles.length > 0) {
      // Use chunked upload for large files (one at a time)
      for (const file of largeFiles) {
        await uploadChunked(file);
      }
      
      // Handle remaining smaller files with regular upload
      const smallFiles = files.filter(file => file.size <= SIZE_THRESHOLD);
      if (smallFiles.length > 0) {
        const fileList = new DataTransfer();
        smallFiles.forEach(file => fileList.items.add(file));
        await uploadRegular(fileList.files);
      }
    } else {
      // All files are small, use regular upload
      const fileList = new DataTransfer();
      files.forEach(file => fileList.items.add(file));
      await uploadRegular(fileList.files);
    }
  }, [uploadRegular, uploadChunked]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await processFiles(Array.from(files));
    // Reset input
    event.target.value = '';
  }, [processFiles]);

  const { getRootProps, getInputProps, isDragActive, isDragAccept } = useDropzone({
    onDrop: processFiles,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
      'application/octet-stream': ['.TSYSO', '.tsyso']
    },
    disabled: uploading || disabled,
    multiple: true
  });

  const getUploadDescription = () => {
    if (uploading) {
      if (uploadMode === "chunked") {
        return `Uploading large file: ${fileName} (${Math.round(progress)}%)`;
      } else {
        return "Uploading files...";
      }
    }
    if (isDragActive) {
      return isDragAccept ? "Drop files here to upload!" : "Some files are not supported";
    }
    return "Drag & drop files here, or click to select. Large files (>20MB) use chunked upload.";
  };

  return (
    <div className="space-y-4">
      {/* Visual Drop Zone - Bucket/Tube Design */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300
          ${isDragActive 
            ? (isDragAccept 
              ? 'border-green-400 bg-green-50 shadow-lg scale-105' 
              : 'border-red-400 bg-red-50')
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }
          ${uploading ? 'opacity-60 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {/* Bucket/Tube Visual */}
        <div className="flex flex-col items-center space-y-4">
          {/* Cloud Tube Design */}
          <div className={`
            relative transition-all duration-300
            ${isDragActive ? 'animate-bounce' : 'hover:scale-110'}
          `}>
            {/* Main Container/Bucket */}
            <div className={`
              w-20 h-16 rounded-b-2xl border-4 transition-colors duration-300
              ${isDragActive && isDragAccept
                ? 'border-green-500 bg-green-100'
                : isDragActive
                ? 'border-red-500 bg-red-100'
                : 'border-blue-500 bg-blue-100'
              }
            `}>
              {/* Bucket Handle */}
              <div className={`
                absolute -top-2 left-1/2 transform -translate-x-1/2 w-8 h-4 rounded-t-lg border-4 border-b-0 transition-colors duration-300
                ${isDragActive && isDragAccept
                  ? 'border-green-500'
                  : isDragActive
                  ? 'border-red-500'
                  : 'border-blue-500'
                }
              `} />
              
              {/* Files Icon Inside Bucket */}
              <div className="flex items-center justify-center h-full">
                <Package className={`
                  w-6 h-6 transition-colors duration-300
                  ${isDragActive && isDragAccept
                    ? 'text-green-600'
                    : isDragActive
                    ? 'text-red-600'
                    : 'text-blue-600'
                  }
                `} />
              </div>
            </div>
            
            {/* Cloud Above Bucket */}
            <div className={`
              absolute -top-8 left-1/2 transform -translate-x-1/2 transition-colors duration-300
              ${isDragActive ? 'animate-pulse' : ''}
            `}>
              <Cloud className={`
                w-12 h-8 transition-colors duration-300
                ${isDragActive && isDragAccept
                  ? 'text-green-400'
                  : isDragActive
                  ? 'text-red-400'
                  : 'text-gray-400'
                }
              `} />
            </div>
            
            {/* Arrow from Cloud to Bucket */}
            <ArrowDown className={`
              absolute -top-1 left-1/2 transform -translate-x-1/2 w-4 h-4 transition-all duration-300
              ${isDragActive && isDragAccept
                ? 'text-green-500 animate-bounce'
                : isDragActive
                ? 'text-red-500'
                : 'text-gray-500'
              }
            `} />
          </div>

          {/* Upload Status or Instructions */}
          <div className="space-y-2">
            <h3 className={`
              text-lg font-semibold transition-colors duration-300
              ${isDragActive && isDragAccept
                ? 'text-green-600'
                : isDragActive
                ? 'text-red-600'
                : uploading
                ? 'text-blue-600'
                : 'text-gray-700'
              }
            `}>
              {uploading ? "Processing Files..." : 
               isDragActive && isDragAccept ? "Drop Files Here!" :
               isDragActive ? "Unsupported Files" :
               "File Upload Zone"}
            </h3>
            
            <p className={`
              text-sm transition-colors duration-300
              ${isDragActive && isDragAccept
                ? 'text-green-600'
                : isDragActive
                ? 'text-red-600'
                : 'text-gray-500'
              }
            `}>
              {getUploadDescription()}
            </p>
          </div>

          {/* Upload Button */}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              document.querySelector('input[type="file"]')?.click();
            }}
            disabled={uploading || disabled}
            className={`
              transition-all duration-300
              ${isDragActive && isDragAccept
                ? 'bg-green-600 hover:bg-green-700'
                : uploading
                ? 'bg-blue-600'
                : 'bg-blue-600 hover:bg-blue-700'
              }
            `}
          >
            {uploading ? (
              <>
                <Upload className="w-4 h-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <FileUp className="w-4 h-4 mr-2" />
                Browse Files
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Progress Bar for Chunked Uploads */}
      {uploading && uploadMode === "chunked" && (
        <div className="space-y-2 bg-blue-50 p-4 rounded-lg">
          <div className="flex justify-between text-sm font-medium text-blue-700">
            <span>Uploading: {fileName}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full h-2" />
          <p className="text-xs text-blue-600 text-center">
            Large file detected - using chunked upload for reliability
          </p>
        </div>
      )}

      {/* File Type Indicator */}
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          <span>Supports: CSV, TXT, TSYSO files</span>
        </div>
      </div>
    </div>
  );
}