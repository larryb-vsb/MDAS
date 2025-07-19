import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Pause, Play, Activity, Clock, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ProcessingStatus {
  isRunning: boolean;
  isPaused: boolean;
  nextScheduledRun: string | null;
  lastRunTime: string | null;
  queuedFiles: any[];
  processingErrors: Record<string, string>;
  processedFileCount: number;
  currentTransactionRange?: string;
  duplicateResolutionStats?: {
    totalDuplicates: number;
    averageIncrements: number;
    skipCount: number;
  };
  processingStats?: {
    transactionsProcessed: number;
    processingSpeed: number;
    estimatedCompletion: string | null;
    startTime: string | null;
    duplicateResolutionRate: number;
  };
}

interface RealTimeStats {
  totalFiles: number;
  queuedFiles: number;
  processedFiles: number;
  filesWithErrors: number;
  recentFiles: number;
  timestamp: string;
}

export default function ProcessingStatus() {
  const queryClient = useQueryClient();

  // Fetch processing status with real-time updates
  const { data: status, isLoading } = useQuery<ProcessingStatus>({
    queryKey: ["/api/file-processor/status"],
    refetchInterval: 2000, // Update every 2 seconds
    staleTime: 1000, // Consider data stale after 1 second
  });

  // Fetch real-time database statistics
  const { data: realTimeStats, isLoading: isStatsLoading } = useQuery<RealTimeStats>({
    queryKey: ["/api/processing/real-time-stats"],
    refetchInterval: 2000, // Update every 2 seconds
    staleTime: 1000, // Consider data stale after 1 second
  });

  // Pause processing mutation
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/file-processor/pause");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/file-processor/status"] });
      toast({
        title: "Processing paused",
        description: "File processing has been paused successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to pause processing",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Resume processing mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/file-processor/resume");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/file-processor/status"] });
      toast({
        title: "Processing resumed",
        description: "File processing has been resumed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to resume processing",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading || !status || isStatsLoading || !realTimeStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Processing Status
          </CardTitle>
          <CardDescription>Real-time file processing monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = () => {
    if (status.isPaused) {
      return <Badge variant="secondary" className="flex items-center gap-1"><Pause className="h-3 w-3" />Paused</Badge>;
    }
    if (status.isRunning) {
      return <Badge variant="default" className="flex items-center gap-1 bg-green-600"><Activity className="h-3 w-3" />Processing</Badge>;
    }
    return <Badge variant="outline" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />Idle</Badge>;
  };

  const calculateProgress = () => {
    if (!status.currentTransactionRange) return 0;
    // Simple progress calculation based on transaction ID progression
    const currentId = parseInt(status.currentTransactionRange.replace(/\D/g, ''));
    const maxEstimatedId = 71127230050000; // Rough estimate of max transaction IDs
    return Math.min((currentId / maxEstimatedId) * 100, 95); // Cap at 95% to show ongoing work
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Processing Status
          </div>
          {getStatusBadge()}
        </CardTitle>
        <CardDescription>Real-time file processing monitoring and controls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status Section */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Queue Status</div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-lg font-semibold">{realTimeStats.queuedFiles}</span>
                <span className="text-sm text-muted-foreground">files queued</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Files Processed</div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-lg font-semibold">{realTimeStats.processedFiles}</span>
                <span className="text-sm text-muted-foreground">completed</span>
              </div>
            </div>
          </div>

          {/* Processing Progress */}
          {status.isRunning && status.currentTransactionRange && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Processing Progress</span>
                <span className="font-medium">Transaction Range: {status.currentTransactionRange}</span>
              </div>
              <Progress value={calculateProgress()} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Estimated {Math.round(calculateProgress())}% complete
              </div>
            </div>
          )}

          {/* Enhanced Processing KPIs */}
          {status.isRunning && (
            <div className="space-y-4">
              <Separator />
              <div className="text-sm font-medium">Processing Performance KPIs</div>
              
              {/* Processing Speed & Efficiency */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-600">
                    {status.processingStats?.processingSpeed?.toFixed(1) || 'N/A'}
                  </div>
                  <div className="text-muted-foreground">Txns/sec</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-purple-600">
                    {status.processingStats?.transactionsProcessed?.toLocaleString() || '0'}
                  </div>
                  <div className="text-muted-foreground">Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-orange-600">
                    {realTimeStats.filesWithErrors}
                  </div>
                  <div className="text-muted-foreground">Errors</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600">
                    {status.processingStats?.duplicateResolutionRate?.toFixed(1) || 'N/A'}%
                  </div>
                  <div className="text-muted-foreground">Resolution Rate</div>
                </div>
              </div>

              {/* Estimated Completion */}
              {status.processingStats?.estimatedCompletion && (
                <div className="text-center text-sm">
                  <div className="text-muted-foreground">Estimated Completion</div>
                  <div className="font-medium">
                    {new Date(status.processingStats.estimatedCompletion).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Duplicate Resolution Stats (when not processing) */}
          {!status.isRunning && status.duplicateResolutionStats && status.duplicateResolutionStats.totalDuplicates > 0 && (
            <div className="space-y-3">
              <Separator />
              <div className="text-sm font-medium">Last Session Performance</div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-orange-600">
                    {status.duplicateResolutionStats.totalDuplicates}
                  </div>
                  <div className="text-muted-foreground">Total Duplicates</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-600">
                    {status.duplicateResolutionStats.averageIncrements.toFixed(1)}
                  </div>
                  <div className="text-muted-foreground">Avg Increments</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600">
                    {status.duplicateResolutionStats.skipCount}
                  </div>
                  <div className="text-muted-foreground">Skipped</div>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {Object.keys(status.processingErrors).length > 0 && (
            <div className="space-y-2">
              <Separator />
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Processing Errors ({Object.keys(status.processingErrors).length})</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Recent errors detected - check logs for details
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Control Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">Processing Controls</div>
              <div className="text-xs text-muted-foreground">
                Manage file processing operations
              </div>
            </div>
            <div className="flex gap-2">
              {status.isPaused ? (
                <Button
                  size="sm"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending || !status.isRunning}
                  className="flex items-center gap-2"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              )}
            </div>
          </div>

          {/* Schedule Information */}
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span>Last Run: {formatDateTime(status.lastRunTime)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span>Next Run: {formatDateTime(status.nextScheduledRun)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}