import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function OrphanFileUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload to orphan endpoint (no database registration)
      const response = await fetch('/api/uploader/upload-orphan', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "File Uploaded",
        description: `${selectedFile?.name} uploaded successfully. Check the Files tab to identify and process it.`,
      });
      setSelectedFile(null);
      setUploadProgress(0);
      // Refresh the files list to show the new orphan
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(selectedFile);
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Orphan File Upload
        </CardTitle>
        <CardDescription>
          Upload files directly to storage without database registration. Files will appear as orphans in the Files tab for manual identification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Files uploaded here will NOT be automatically processed. Use the Files tab to identify and process uploaded files.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="file-input">Select File</Label>
          <Input
            id="file-input"
            type="file"
            onChange={handleFileSelect}
            accept=".tsyso,.csv,.json,.txt"
            disabled={uploadMutation.isPending}
          />
          {selectedFile && (
            <div className="text-sm text-muted-foreground">
              Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </div>
          )}
        </div>

        {uploadMutation.isPending && (
          <div className="space-y-2">
            <Progress value={uploadProgress} className="w-full" />
            <div className="text-sm text-muted-foreground">
              Uploading to object storage...
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploadMutation.isPending}
            className="flex items-center gap-2"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload as Orphan
          </Button>
          
          {selectedFile && (
            <Button
              variant="outline"
              onClick={() => setSelectedFile(null)}
              disabled={uploadMutation.isPending}
            >
              Clear
            </Button>
          )}
        </div>

        {uploadMutation.isSuccess && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              File uploaded successfully! Go to the Files tab to identify and process it.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}