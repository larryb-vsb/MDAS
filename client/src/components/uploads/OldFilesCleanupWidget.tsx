import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, HardDrive, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface OldFilesStatus {
  totalFiles: number;
  totalSize: string;
  breakdown: {
    tsysoFiles: number;
    otherFiles: number;
  };
  olderThan: string;
  hasFilesToClean: boolean;
}

export default function OldFilesCleanupWidget() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for old files status
  const { data: oldFilesStatus, isLoading, error } = useQuery<OldFilesStatus>({
    queryKey: ['/api/cleanup/old-files-status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/cleanup/old-files', {
        method: 'POST',
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Cleanup Complete',
        description: `Successfully cleaned up ${data.filesDeleted} files, freed ${data.spaceFreed}`,
      });
      // Refresh the status
      queryClient.invalidateQueries({ queryKey: ['/api/cleanup/old-files-status'] });
    },
    onError: (error: any) => {
      console.error('Cleanup error:', error);
      toast({
        title: 'Cleanup Failed',
        description: 'Failed to clean up old files. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const handleCleanup = () => {
    if (window.confirm(`Are you sure you want to delete ${oldFilesStatus?.totalFiles} old files (${oldFilesStatus?.totalSize})? This cannot be undone.`)) {
      cleanupMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
            <div>
              <div className="font-medium text-gray-800">Old Files Cleanup</div>
              <div className="text-sm text-gray-600">Checking for old files...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !oldFilesStatus) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div>
              <div className="font-medium text-red-800">Old Files Cleanup</div>
              <div className="text-sm text-red-600">Failed to check old files status</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!oldFilesStatus.hasFilesToClean) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium text-green-800">Old Files Cleanup</div>
              <div className="text-sm text-green-600">No old files to clean up</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-orange-600" />
          <div>
            <div className="font-medium text-orange-800">Old Files Cleanup</div>
            <div className="text-sm text-orange-600">
              {oldFilesStatus.totalFiles} files ({oldFilesStatus.totalSize}) older than today
            </div>
            <div className="text-xs text-orange-500 mt-1">
              TDDF: {oldFilesStatus.breakdown.tsysoFiles} • Other: {oldFilesStatus.breakdown.otherFiles}
            </div>
          </div>
        </div>
        <Button
          onClick={handleCleanup}
          disabled={cleanupMutation.isPending}
          size="sm"
          variant="outline"
          className="border-orange-300 text-orange-700 hover:bg-orange-100 hover:border-orange-400"
        >
          {cleanupMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Cleaning...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Clean Up
            </>
          )}
        </Button>
      </div>
      
      <div className="text-xs text-orange-700 bg-orange-100 p-2 rounded border-l-4 border-orange-500">
        <strong>Space Recovery:</strong> This will permanently delete files in tmp_uploads/ older than today ({oldFilesStatus.olderThan}). 
        Active database tables and current processing files will not be affected.
      </div>
    </div>
  );
}