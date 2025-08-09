import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Trash2, RefreshCw, AlertTriangle, CheckCircle, Database, Cloud } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface StorageAnalysis {
  totalStorageFiles: number;
  linkedDatabaseFiles: number;
  orphanedFiles: number;
  stuckUploads: number;
  totalStorageSize: number;
  potentialSavings: number;
  filesByStatus: Record<string, number>;
  sampleOrphanedFiles: string[];
}

interface CleanupResult {
  success: boolean;
  deletedCount: number;
  errorCount: number;
  freedSpace: number;
  errors?: string[];
}

export default function ObjectStorageCleanup() {
  const [analysisMode, setAnalysisMode] = useState<'overview' | 'detailed'>('overview');
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch storage analysis
  const { data: analysis, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery<StorageAnalysis>({
    queryKey: ['/api/storage/analysis'],
    staleTime: 30000, // 30 seconds
  });

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }): Promise<CleanupResult> => {
      const response = await apiRequest('/api/storage/cleanup', {
        method: 'POST',
        body: JSON.stringify({ dryRun }),
        headers: { 'Content-Type': 'application/json' }
      });
      return response as CleanupResult;
    },
    onSuccess: (data: CleanupResult) => {
      if (data.success) {
        toast({
          title: "Cleanup Complete",
          description: `Deleted ${data.deletedCount} files, freed ${(data.freedSpace / 1024 / 1024).toFixed(2)} MB`,
        });
        refetchAnalysis();
        queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      } else {
        toast({
          title: "Cleanup Failed",
          description: "Some files could not be deleted",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Cleanup Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Database cleanup mutation
  const dbCleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/storage/cleanup-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Database Cleanup Complete",
        description: "Removed stuck and orphaned database entries",
      });
      refetchAnalysis();
    },
  });

  const handleCleanup = (dryRun: boolean) => {
    if (!dryRun && !cleanupConfirmed) {
      setCleanupConfirmed(true);
      return;
    }
    cleanupMutation.mutate({ dryRun });
    if (!dryRun) setCleanupConfirmed(false);
  };

  const handleDatabaseCleanup = () => {
    dbCleanupMutation.mutate();
  };

  if (analysisLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Cloud className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Object Storage Cleanup</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyzing object storage...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Cloud className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Object Storage Cleanup</h1>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetchAnalysis()}
          disabled={analysisLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${analysisLoading ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>

      {analysis && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Storage Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analysis.totalStorageFiles.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {(analysis.totalStorageSize / 1024 / 1024).toFixed(2)} MB total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Linked Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{analysis.linkedDatabaseFiles}</div>
                <p className="text-xs text-muted-foreground">
                  Active database references
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Orphaned Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{analysis.orphanedFiles}</div>
                <p className="text-xs text-muted-foreground">
                  Can be safely deleted
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Potential Savings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {(analysis.potentialSavings / 1024 / 1024).toFixed(2)} MB
                </div>
                <p className="text-xs text-muted-foreground">
                  Storage space to recover
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Analysis Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(analysis.filesByStatus).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <Badge variant={status === 'started' ? 'destructive' : status === 'completed' ? 'default' : 'secondary'}>
                      {status}
                    </Badge>
                    <div className="text-lg font-semibold mt-1">{count}</div>
                  </div>
                ))}
              </div>

              {analysis.stuckUploads > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Stuck Uploads Detected</AlertTitle>
                  <AlertDescription>
                    Found {analysis.stuckUploads} uploads stuck in "started" status. 
                    These may be consuming storage space without being properly processed.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Sample Orphaned Files */}
          {analysis.sampleOrphanedFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sample Orphaned Files</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.sampleOrphanedFiles.slice(0, 10).map((file: string, index: number) => (
                    <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                      {file}
                    </div>
                  ))}
                  {analysis.sampleOrphanedFiles.length > 10 && (
                    <p className="text-sm text-muted-foreground">
                      ... and {analysis.sampleOrphanedFiles.length - 10} more files
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cleanup Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Cleanup Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleCleanup(true)}
                  disabled={cleanupMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {cleanupMutation.isPending ? 'Analyzing...' : 'Preview Cleanup (Dry Run)'}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleDatabaseCleanup}
                  disabled={dbCleanupMutation.isPending || analysis.stuckUploads === 0}
                >
                  <Database className="h-4 w-4 mr-2" />
                  {dbCleanupMutation.isPending ? 'Cleaning...' : 'Clean Database Records'}
                </Button>

                <Separator orientation="vertical" className="hidden sm:block h-8" />

                {!cleanupConfirmed ? (
                  <Button
                    variant="destructive"
                    onClick={() => handleCleanup(false)}
                    disabled={cleanupMutation.isPending || analysis.orphanedFiles === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Execute Cleanup
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => handleCleanup(false)}
                      disabled={cleanupMutation.isPending}
                    >
                      {cleanupMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setCleanupConfirmed(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {analysis.orphanedFiles > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Ready for Cleanup</AlertTitle>
                  <AlertDescription>
                    {analysis.orphanedFiles} orphaned files can be safely deleted to recover {(analysis.potentialSavings / 1024 / 1024).toFixed(2)} MB of storage space.
                    This will not affect any active uploads or processed files.
                  </AlertDescription>
                </Alert>
              )}

              {analysis.orphanedFiles === 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Storage Clean</AlertTitle>
                  <AlertDescription>
                    No orphaned files detected. Your object storage is clean and optimized.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}