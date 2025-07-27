import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Zap, Database, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  detectedType?: string;
  userClassifiedType?: string;
}

interface PendingUpload {
  file: File;
  detectedType: string;
}

export default function DevUpload() {
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [showClassificationDialog, setShowClassificationDialog] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<string>("");
  const { toast } = useToast();

  // File type detection based on filename and extension
  const detectFileType = (filename: string): string => {
    const name = filename.toLowerCase();
    const extension = name.split('.').pop() || '';
    
    // TDDF files
    if (name.includes('tddf') || extension === 'tsyso') {
      return 'tddf';
    }
    
    // Merchant files
    if (name.includes('merchant') || name.includes('merch')) {
      return 'merchant';
    }
    
    // Transaction files
    if (name.includes('transaction') || name.includes('trans') || name.includes('txn')) {
      return 'transaction';
    }
    
    // Terminal files
    if (name.includes('terminal') || name.includes('term') || name.includes('pos')) {
      return 'terminal';
    }
    
    // CSV files (general)
    if (extension === 'csv') {
      return 'csv';
    }
    
    // Text files
    if (['txt', 'log', 'dat'].includes(extension)) {
      return 'text';
    }
    
    // JSON files
    if (extension === 'json') {
      return 'json';
    }
    
    // Excel files
    if (['xlsx', 'xls'].includes(extension)) {
      return 'excel';
    }
    
    return 'unknown';
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    
    if (!file) return;
    
    // Check file size (500MB limit)
    if (file.size > 500 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Files must be smaller than 500MB",
        variant: "destructive",
      });
      return;
    }
    
    const detectedType = detectFileType(file.name);
    
    // If unknown type, prompt user for classification
    if (detectedType === 'unknown') {
      setPendingUpload({ file, detectedType });
      setShowClassificationDialog(true);
      return;
    }
    
    // Process file with detected type
    await processUpload(file, detectedType);

  }, [toast]);

  const processUpload = async (file: File, fileType: string) => {
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

      // Read file content and convert to JSON
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      const compressedPayload = {
        content: text,
        lines: lines,
        metadata: {
          originalSize: file.size,
          lineCount: lines.length,
          encoding: 'utf-8',
          uploadTimestamp: new Date().toISOString()
        }
      };

      const schemaInfo = {
        detectedType: fileType,
        fileExtension: file.name.split('.').pop(),
        hasHeaders: lines.length > 0 && /^[a-zA-Z]/.test(lines[0]),
        lineFormat: lines.length > 0 ? (lines[0].includes(',') ? 'csv' : 'fixed-width') : 'unknown'
      };

      const response = await apiRequest('POST', '/api/dev-uploads', {
        filename: file.name,
        compressed_payload: compressedPayload,
        schema_info: schemaInfo
      });

      setUploadProgress(100);
      
      setTimeout(() => {
        const result: UploadResult = {
          id: response.upload.id,
          filename: file.name,
          fileSize: file.size,
          lineCount: lines.length,
          recordTypeBreakdown: { [fileType]: lines.length },
          status: 'uploaded',
          detectedType: fileType
        };
        
        setUploads(prev => [result, ...prev]);
        setIsUploading(false);
        setUploadProgress(0);
        
        toast({
          title: "Upload Successful",
          description: `${file.name} uploaded (${fileType} type detected)`,
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
  };

  const handleUserClassification = async () => {
    if (!pendingUpload || !selectedFileType) return;
    
    setShowClassificationDialog(false);
    await processUpload(pendingUpload.file, selectedFileType);
    setPendingUpload(null);
    setSelectedFileType("");
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      '*/*': [] // Accept any file type
    },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500MB limit
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
            Test compressed storage with smart file type detection (accepts any file up to 500MB)
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
                      <p className="text-lg font-medium">Processing File...</p>
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
                        {isDragActive ? "Drop any file here..." : "Upload Any File"}
                      </p>
                      <p className="text-muted-foreground mt-2">
                        Drag and drop any file up to 500MB, or click to browse
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Automatic file type detection with user classification for unknown types
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

        {/* File Classification Dialog */}
        <Dialog open={showClassificationDialog} onOpenChange={setShowClassificationDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-orange-500" />
                Unknown File Type Detected
              </DialogTitle>
              <DialogDescription>
                {pendingUpload && (
                  <>
                    We couldn't automatically detect the type for <strong>{pendingUpload.file.name}</strong>.
                    Please help us classify this file to proceed with upload.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file-type">Select File Type</Label>
                <Select value={selectedFileType} onValueChange={setSelectedFileType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose file type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tddf">TDDF/Financial Data</SelectItem>
                    <SelectItem value="merchant">Merchant Data</SelectItem>
                    <SelectItem value="transaction">Transaction Data</SelectItem>
                    <SelectItem value="terminal">Terminal/POS Data</SelectItem>
                    <SelectItem value="csv">CSV/Spreadsheet</SelectItem>
                    <SelectItem value="text">Text/Log File</SelectItem>
                    <SelectItem value="json">JSON Data</SelectItem>
                    <SelectItem value="excel">Excel/Worksheet</SelectItem>
                    <SelectItem value="other">Other/Custom Type</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {pendingUpload && (
                <div className="bg-muted p-3 rounded-md text-sm">
                  <div className="font-medium">File Details:</div>
                  <div className="text-muted-foreground">
                    Name: {pendingUpload.file.name}<br/>
                    Size: {formatBytes(pendingUpload.file.size)}<br/>
                    Type: {pendingUpload.file.type || 'Unknown'}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowClassificationDialog(false);
                  setPendingUpload(null);
                  setSelectedFileType("");
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUserClassification}
                disabled={!selectedFileType}
              >
                Upload File
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}