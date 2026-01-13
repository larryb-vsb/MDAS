import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, Database, Cloud, FileText, AlertCircle, CheckCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface StorageFile {
  key: string;
  name: string;
  size?: number;
  type: string;
  lastModified?: string;
}

export default function CrossEnvironmentTransfer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [targetEnvironment, setTargetEnvironment] = useState<'production' | 'development'>('production');

  // Get list of files from dev storage
  const { data: storageFiles, isLoading: isLoadingStorage, refetch: refetchStorage } = useQuery({
    queryKey: ['/api/uploader/storage-files'],
    queryFn: async () => {
      const response = await apiRequest('/api/uploader/storage-files');
      return response;
    }
  });

  // Cross-environment transfer mutation
  const transferMutation = useMutation({
    mutationFn: async ({ fileKeys, targetEnv }: { fileKeys: string[]; targetEnv: string }) => {
      const response = await apiRequest('/api/uploader/cross-env-transfer', {
        method: 'POST',
        body: {
          fileKeys,
          targetEnvironment: targetEnv
        }
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Transfer Complete',
        description: `Successfully transferred ${data.transferredCount} files to ${data.targetEnvironment}`,
      });
      setSelectedFiles([]);
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Transfer Failed',
        description: error.message || 'Failed to transfer files',
        variant: 'destructive',
      });
    }
  });

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleFileToggle = (fileKey: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileKey) 
        ? prev.filter(key => key !== fileKey)
        : [...prev, fileKey]
    );
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === (storageFiles?.files?.length || 0)) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(storageFiles?.files?.map((f: StorageFile) => f.key) || []);
    }
  };

  const handleTransfer = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: 'No Files Selected',
        description: 'Please select files to transfer',
        variant: 'destructive',
      });
      return;
    }

    transferMutation.mutate({ 
      fileKeys: selectedFiles, 
      targetEnv: targetEnvironment 
    });
  };

  // Filter for large TDDF files that match your uploaded files
  const largeFiles = storageFiles?.files?.filter((file: StorageFile) => 
    file.name.includes('VERMNTSB') && 
    file.name.includes('TDDF_2400') && 
    file.name.includes('2025')
  ) || [];

  const selectedTotalSize = selectedFiles.reduce((total, fileKey) => {
    const file = storageFiles?.files?.find((f: StorageFile) => f.key === fileKey);
    return total + (file?.size || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Cross-Environment File Transfer
          </CardTitle>
          <CardDescription>
            Transfer large TDDF files from development storage to production for encoding (bypasses 40MB+ infrastructure limits)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Transfer Configuration */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-800">Development Storage</span>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-600" />
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-green-600" />
                <Select value={targetEnvironment} onValueChange={(value: 'production' | 'development') => setTargetEnvironment(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={handleTransfer}
              disabled={selectedFiles.length === 0 || transferMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {transferMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                <>
                  Transfer {selectedFiles.length} Files
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>

          {/* Transfer Progress */}
          {transferMutation.isPending && (
            <Alert>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Transferring {selectedFiles.length} files to {targetEnvironment} environment...
                <Progress className="mt-2 w-full" value={50} />
              </AlertDescription>
            </Alert>
          )}

          {/* File Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-medium">Available Files</h3>
                <Badge variant="outline">
                  {storageFiles?.fileCount || 0} total files
                </Badge>
                <Badge variant="outline">
                  {largeFiles.length} large TDDF files
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchStorage()}
                  disabled={isLoadingStorage}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingStorage ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedFiles.length === largeFiles.length ? 'Deselect All' : 'Select All Large Files'}
                </Button>
              </div>
            </div>

            {/* Selected Files Summary */}
            {selectedFiles.length > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{selectedFiles.length} files selected</strong> 
                  {selectedTotalSize > 0 && ` (${formatFileSize(selectedTotalSize)} total)`}
                  <div className="mt-1 text-xs">
                    Ready to transfer to {targetEnvironment} environment for processing
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Files List */}
            <div className="border rounded-lg">
              <div className="p-4 bg-gray-50 border-b">
                <div className="flex items-center gap-4 text-sm font-medium text-gray-700">
                  <div className="w-8">Select</div>
                  <div className="flex-1">File Name</div>
                  <div className="w-20">Size</div>
                  <div className="w-20">Type</div>
                </div>
              </div>
              
              <div className="max-h-96 overflow-auto">
                {isLoadingStorage ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading storage files...
                  </div>
                ) : largeFiles.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <FileText className="h-6 w-6 mx-auto mb-2" />
                    No large TDDF files found in storage
                  </div>
                ) : (
                  largeFiles.map((file: StorageFile) => (
                    <div
                      key={file.key}
                      className={`p-4 border-b last:border-b-0 hover:bg-gray-50 ${
                        selectedFiles.includes(file.key) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8">
                          <Checkbox
                            checked={selectedFiles.includes(file.key)}
                            onCheckedChange={() => handleFileToggle(file.key)}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{file.name}</div>
                          <div className="text-xs text-gray-500 truncate">{file.key}</div>
                        </div>
                        <div className="w-20 text-sm text-right">
                          {formatFileSize(file.size)}
                        </div>
                        <div className="w-20">
                          <Badge variant={file.type === 'tddf' ? 'default' : 'secondary'} className="text-xs">
                            {file.type.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Transfer Instructions */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>How Cross-Environment Transfer Works:</strong>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• Files are copied from development storage to {targetEnvironment} processing pipeline</li>
                <li>• Large files (40MB+) bypass production infrastructure limits using direct storage transfer</li>
                <li>• Files appear in {targetEnvironment} uploader with "uploaded" status, ready for encoding</li>
                <li>• Original files remain in development storage (copy operation, not move)</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}