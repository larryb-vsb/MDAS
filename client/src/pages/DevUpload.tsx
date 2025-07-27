import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Zap, Database, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import MainLayout from "@/components/layout/MainLayout";

interface UploadResult {
  id: string;
  filename: string;
  fileSize: number;
  lineCount: number;
  recordTypeBreakdown: Record<string, number>;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  processingTime?: number;
  error?: string;
}

export default function DevUpload() {
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    
    if (!file) return;
    
    // Only accept TDDF files
    if (!file.name.toLowerCase().includes('tddf') && !file.name.endsWith('.TSYSO')) {
      toast({
        title: "Invalid File Type",
        description: "Only TDDF files (.TSYSO) are accepted for testing",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Simulate cool upload progress animation
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 200);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', 'tddf');

      const response = await fetch('/api/dev-upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      setUploadProgress(100);
      
      setTimeout(() => {
        setUploads(prev => [result, ...prev]);
        setIsUploading(false);
        setUploadProgress(0);
        
        toast({
          title: "Upload Successful",
          description: `${file.name} uploaded with compressed storage architecture`,
        });
      }, 500);

    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);
      
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/octet-stream': ['.TSYSO'],
      'text/plain': ['.TSYSO']
    },
    maxFiles: 1,
    disabled: isUploading
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Dev Upload Testing</h1>
          <p className="text-muted-foreground">
            Test new compressed storage architecture with dynamic JSON schema detection
          </p>
          <div className="flex justify-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Zap className="h-4 w-4" />
              12-25x Performance
            </div>
            <div className="flex items-center gap-1">
              <Database className="h-4 w-4" />
              Compressed Storage
            </div>
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Dynamic Schema
            </div>
          </div>
        </div>

        {/* Upload Drop Zone */}
        <Card className="border-2 border-dashed">
          <CardContent className="p-8">
            <div
              {...getRootProps()}
              className={`
                relative overflow-hidden rounded-lg border-2 border-dashed transition-all duration-300 cursor-pointer
                ${isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                ${isUploading ? 'pointer-events-none' : ''}
              `}
            >
              <input {...getInputProps()} />
              
              {/* Upload Animation Background */}
              {isUploading && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-purple-50 animate-pulse" />
              )}
              
              <div className="relative p-12 text-center">
                {isUploading ? (
                  <div className="space-y-4">
                    <div className="animate-bounce">
                      <Upload className="h-12 w-12 mx-auto text-blue-500" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-medium">Processing TDDF File...</p>
                      <Progress value={uploadProgress} className="w-64 mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        Compressing and analyzing content
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="h-12 w-12 mx-auto text-gray-400" />
                    <div>
                      <p className="text-xl font-medium">
                        {isDragActive ? "Drop TDDF file here..." : "Upload TDDF File"}
                      </p>
                      <p className="text-muted-foreground mt-2">
                        Drag and drop a .TSYSO file, or click to browse
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Only TDDF files accepted for architecture testing
                      </p>
                    </div>
                    <Button variant="outline" className="mt-4">
                      Choose File
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Results */}
        {uploads.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Upload Results</h2>
              <Badge variant="outline">
                {uploads.length} file{uploads.length !== 1 ? 's' : ''} processed
              </Badge>
            </div>
            
            <div className="grid gap-4">
              {uploads.map((upload) => (
                <Card key={upload.id} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {upload.filename}
                          {upload.status === 'completed' && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          {upload.status === 'failed' && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </CardTitle>
                        <CardDescription>
                          {formatBytes(upload.fileSize)} • {formatNumber(upload.lineCount)} lines
                          {upload.processingTime && (
                            <> • Processed in {upload.processingTime}ms</>
                          )}
                        </CardDescription>
                      </div>
                      <Badge variant={
                        upload.status === 'completed' ? 'default' :
                        upload.status === 'failed' ? 'destructive' :
                        upload.status === 'processing' ? 'secondary' : 'outline'
                      }>
                        {upload.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  {upload.recordTypeBreakdown && (
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        <Separator />
                        <div>
                          <h4 className="text-sm font-medium mb-2">Record Type Breakdown</h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(upload.recordTypeBreakdown).map(([type, count]) => (
                              <Badge key={type} variant="outline" className="text-xs">
                                {type}: {formatNumber(count)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        {upload.error && (
                          <div className="bg-red-50 border border-red-200 rounded-md p-3">
                            <p className="text-sm text-red-800">{upload.error}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Architecture Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Architecture Comparison
            </CardTitle>
            <CardDescription>
              New compressed storage vs current position-based system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-medium text-green-600">New JSON Architecture</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• GZIP compressed payload storage</li>
                  <li>• Dynamic field detection</li>
                  <li>• 12-25x performance improvement</li>
                  <li>• 60-70% storage reduction</li>
                  <li>• Single-pass processing</li>
                  <li>• Bulk insert operations</li>
                </ul>
              </div>
              <div className="space-y-3">
                <h4 className="font-medium text-orange-600">Current System</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• 127-column table inserts</li>
                  <li>• Two-phase processing</li>
                  <li>• White space data storage</li>
                  <li>• ~400 records/minute</li>
                  <li>• Raw import + processing tables</li>
                  <li>• Row-by-row processing</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}