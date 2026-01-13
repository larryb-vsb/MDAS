import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface ChunkedFileUploaderProps {
  onUploadComplete: (fileId: string) => void;
  fileType: "merchant" | "transaction" | "terminal" | "tddf" | "merchant-risk";
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

export default function ChunkedFileUploader({ onUploadComplete, fileType }: ChunkedFileUploaderProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string>("");

  const uploadFileInChunks = useCallback(async (file: File) => {
    if (!file) return;

    setUploading(true);
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

      onUploadComplete(result.fileId);
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadFileInChunks(file);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <input
          type="file"
          accept=".csv,.txt,.TSYSO,.tsyso"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="chunked-file-input"
        />
        <Button
          onClick={() => document.getElementById("chunked-file-input")?.click()}
          disabled={uploading}
          variant="outline"
        >
          {uploading ? "Uploading..." : "Select Large File (>100MB)"}
        </Button>
      </div>

      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Uploading: {fileName}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>
      )}

      <p className="text-xs text-gray-500">
        For files larger than 100MB, use chunked upload for reliable transfer
      </p>
    </div>
  );
}