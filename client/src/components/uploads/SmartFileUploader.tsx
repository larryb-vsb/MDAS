import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Upload } from "lucide-react";

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

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Check if any file is large enough for chunked upload
    const largeFiles = Array.from(files).filter(file => file.size > SIZE_THRESHOLD);
    
    if (largeFiles.length > 0) {
      // Use chunked upload for large files (one at a time)
      for (const file of largeFiles) {
        await uploadChunked(file);
      }
      
      // Handle remaining smaller files with regular upload
      const smallFiles = Array.from(files).filter(file => file.size <= SIZE_THRESHOLD);
      if (smallFiles.length > 0) {
        const fileList = new DataTransfer();
        smallFiles.forEach(file => fileList.items.add(file));
        await uploadRegular(fileList.files);
      }
    } else {
      // All files are small, use regular upload
      await uploadRegular(files);
    }

    // Reset input
    event.target.value = '';
  }, [uploadRegular, uploadChunked]);

  const getUploadDescription = () => {
    if (uploading) {
      if (uploadMode === "chunked") {
        return `Uploading large file: ${fileName} (${Math.round(progress)}%)`;
      } else {
        return "Uploading files...";
      }
    }
    return "Select files to upload. Large files (>20MB) will use chunked upload automatically.";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <input
          type="file"
          accept=".csv,.txt,.TSYSO,.tsyso"
          onChange={handleFileSelect}
          disabled={uploading || disabled}
          className="hidden"
          id="smart-file-input"
          multiple
        />
        <Button
          onClick={() => document.getElementById("smart-file-input")?.click()}
          disabled={uploading || disabled}
          className="flex items-center space-x-2"
        >
          {uploading ? (
            <Upload className="w-4 h-4 animate-spin" />
          ) : (
            <FileUp className="w-4 h-4" />
          )}
          <span>
            {uploading ? "Uploading..." : "Select Files"}
          </span>
        </Button>
      </div>

      {uploading && uploadMode === "chunked" && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Uploading: {fileName}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>
      )}

      <p className="text-xs text-gray-500">
        {getUploadDescription()}
      </p>
    </div>
  );
}