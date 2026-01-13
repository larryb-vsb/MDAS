import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  FileText, 
  AlertCircle, 
  Loader2, 
  CheckCircle, 
  Database,
  RefreshCw,
  Eye,
  EyeOff,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface OrphanFile {
  key: string;
  name: string;
  isOrphanUpload: boolean;
  type: string;
  canIdentify: boolean;
}

interface OrphanResponse {
  orphans: OrphanFile[];
  count: number;
  totalStorage: number;
  registered: number;
  error?: string;
}

export default function OrphanFilesDetector() {
  const [showOrphans, setShowOrphans] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for orphan files
  const { data: orphanData, isLoading, error, refetch } = useQuery<OrphanResponse>({
    queryKey: ['/api/uploader/orphan-files'],
    queryFn: async () => {
      const response = await fetch('/api/uploader/orphan-files');
      if (!response.ok) {
        throw new Error('Failed to fetch orphan files');
      }
      return response.json();
    },
    enabled: showOrphans, // Only fetch when expanded
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Identify orphan mutation
  const identifyOrphanMutation = useMutation({
    mutationFn: async ({ storageKey, filename }: { storageKey: string; filename: string }) => {
      const response = await apiRequest('/api/uploader/identify-orphan', {
        method: 'POST',
        body: JSON.stringify({ storageKey, filename }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Orphan Identified",
        description: data.message || "File has been registered and is ready for processing.",
      });
      refetch(); // Refresh orphan list
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] }); // Refresh main files list
    },
    onError: (error: any) => {
      toast({
        title: "Identification Failed",
        description: error.message || "Failed to identify orphan file",
        variant: "destructive",
      });
    }
  });

  const handleToggleView = () => {
    setShowOrphans(!showOrphans);
    if (!showOrphans) {
      // Trigger fetch when expanding
      refetch();
    }
  };

  const handleIdentifyOrphan = (orphan: OrphanFile) => {
    identifyOrphanMutation.mutate({
      storageKey: orphan.key,
      filename: orphan.name
    });
  };

  const handleRefresh = () => {
    refetch();
  };

  const orphanCount = orphanData?.count || 0;

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            <CardTitle>Orphan File Detector</CardTitle>
            {orphanCount > 0 && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                {orphanCount} orphans found
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showOrphans && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleView}
              className="flex items-center gap-2"
            >
              {showOrphans ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showOrphans ? 'Hide' : 'Scan'} Orphans
            </Button>
          </div>
        </div>
        <CardDescription>
          Scan object storage for files that aren't registered in the database yet. These can be identified and brought into the system.
        </CardDescription>
      </CardHeader>
      
      {showOrphans && (
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Scanning for orphan files...
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to scan for orphan files: {error.message}
              </AlertDescription>
            </Alert>
          ) : orphanData?.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {orphanData.error}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{orphanData?.totalStorage || 0}</div>
                  <div className="text-sm text-blue-700">Total in Storage</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{orphanData?.registered || 0}</div>
                  <div className="text-sm text-green-700">Registered</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{orphanData?.count || 0}</div>
                  <div className="text-sm text-orange-700">Orphans</div>
                </div>
              </div>

              {orphanCount === 0 ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    No orphan files found! All files in object storage are properly registered in the system.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Orphan Files Found</h4>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700">
                      {orphanCount} files need identification
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {orphanData?.orphans.map((orphan) => (
                      <div
                        key={orphan.key}
                        className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-orange-600" />
                          <div>
                            <div className="font-medium text-sm">{orphan.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {orphan.key}
                              {orphan.isOrphanUpload && (
                                <span className="ml-2 text-orange-600">(Orphan Upload)</span>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs mt-1">
                              {orphan.type.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        
                        <Button
                          size="sm"
                          onClick={() => handleIdentifyOrphan(orphan)}
                          disabled={identifyOrphanMutation.isPending || !orphan.canIdentify}
                          className="flex items-center gap-2"
                        >
                          {identifyOrphanMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                          Identify
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}