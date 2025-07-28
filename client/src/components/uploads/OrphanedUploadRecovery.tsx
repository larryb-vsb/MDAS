import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { RefreshCw, AlertTriangle, CheckCircle, X, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrphanedUpload {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  processingStatus: string;
  rawLinesCount?: number;
  processingErrors?: string;
}

export default function OrphanedUploadRecovery() {
  const { toast } = useToast();
  const [recoveryMode, setRecoveryMode] = useState(false);

  // Fetch orphaned uploads (files with 0 lines or stuck in uploading status)
  const { data: orphanedUploads = [], isLoading, refetch, error } = useQuery<OrphanedUpload[]>({
    queryKey: ["/api/uploads/orphaned"],
    refetchInterval: recoveryMode ? 5000 : false,
  });

  // Ensure orphanedUploads is always an array
  const safeOrphanedUploads = Array.isArray(orphanedUploads) ? orphanedUploads : [];

  // Recovery mutation to fix orphaned uploads
  const recoveryMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      const response = await fetch("/api/uploads/recover-orphaned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Recovery failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Recovery Complete",
        description: `Successfully recovered ${data.recovered} orphaned upload${data.recovered !== 1 ? 's' : ''}`,
      });
      setRecoveryMode(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads/processing-status"] });
    },
    onError: (error) => {
      toast({
        title: "Recovery Failed",
        description: error instanceof Error ? error.message : "Failed to recover orphaned uploads",
        variant: "destructive",
      });
    },
  });

  // Auto-detect orphaned uploads
  useEffect(() => {
    if (safeOrphanedUploads && safeOrphanedUploads.length > 0 && !recoveryMode) {
      console.log(`[ORPHANED-RECOVERY] Detected ${safeOrphanedUploads.length} orphaned uploads`);
    }
  }, [safeOrphanedUploads, recoveryMode]);

  const handleRecoverAll = () => {
    if (safeOrphanedUploads.length === 0) return;
    
    const fileIds = safeOrphanedUploads.map((upload) => upload.id);
    setRecoveryMode(true);
    recoveryMutation.mutate(fileIds);
  };

  const handleRecoverSingle = (fileId: string) => {
    setRecoveryMode(true);
    recoveryMutation.mutate([fileId]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Checking for Orphaned Uploads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Progress value={undefined} className="w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (safeOrphanedUploads.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-4 w-4" />
            Upload Status Healthy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600">
            No orphaned uploads detected. All files are properly tracked and processing normally.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          Orphaned Upload Recovery ({safeOrphanedUploads.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Found {safeOrphanedUploads.length} orphaned upload{safeOrphanedUploads.length !== 1 ? 's' : ''} with missing lines or stuck status. 
            These files may need recovery to resume processing.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button 
            onClick={handleRecoverAll}
            disabled={recoveryMutation.isPending}
            variant="outline"
            size="sm"
          >
            {recoveryMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Recover All
          </Button>
          <Button 
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {safeOrphanedUploads.map((upload) => (
            <div key={upload.id} className="flex items-center justify-between p-3 bg-white rounded-md border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{upload.fileName}</p>
                  <Badge variant="secondary" className="text-xs">
                    {upload.fileType.toUpperCase()}
                  </Badge>
                  <Badge 
                    variant={upload.processingStatus === 'uploading' ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {upload.processingStatus}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(upload.fileSize)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {upload.rawLinesCount || 0} lines
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(upload.uploadedAt)}
                  </span>
                </div>
                {upload.processingErrors && (
                  <p className="text-xs text-red-600 mt-1">{upload.processingErrors}</p>
                )}
              </div>
              <Button
                onClick={() => handleRecoverSingle(upload.id)}
                disabled={recoveryMutation.isPending}
                variant="ghost"
                size="sm"
              >
                {recoveryMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}