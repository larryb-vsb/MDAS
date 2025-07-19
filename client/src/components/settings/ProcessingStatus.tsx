import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Pause, Play, Activity, Clock, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";

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
  transactionsPerSecond: number;
  timestamp: string;
}

// Extracted component to prevent React hooks issues
const TransactionSpeedGauge = ({ currentSpeed, peakSpeed, maxScale = 20 }: { currentSpeed: number, peakSpeed: number, maxScale?: number }) => {
  const currentPercentage = Math.min((currentSpeed / maxScale) * 100, 100);
  const peakPercentage = Math.min((peakSpeed / maxScale) * 100, 100);
  
  return (
    <div className="w-full space-y-1">
      {/* Gauge Bar */}
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
        {/* Background segments for visual reference */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex-1 border-r border-gray-300 last:border-r-0" />
          ))}
        </div>
        
        {/* Current speed bar */}
        <div 
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${currentPercentage}%` }}
        />
        
        {/* Peak indicator */}
        {peakPercentage > 0 && (
          <div 
            className="absolute top-0 w-0.5 h-full bg-red-500 shadow-sm"
            style={{ left: `${peakPercentage}%` }}
          />
        )}
      </div>
      
      {/* Scale labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0</span>
        <span>{maxScale/2}</span>
        <span>{maxScale}</span>
      </div>
    </div>
  );
};

export default function ProcessingStatus() {
  const queryClient = useQueryClient();
  
  // ALL HOOKS MUST BE AT THE TOP LEVEL - NO CONDITIONAL HOOKS
  
  // Peak meter state management
  const [peakTxnSpeed, setPeakTxnSpeed] = useState(0);
  const [speedHistory, setSpeedHistory] = useState<Array<{value: number, timestamp: number}>>([]);
  const [lastPeakTime, setLastPeakTime] = useState<Date | null>(null);

  // Fetch processing status with real-time updates
  const { data: status, isLoading } = useQuery<ProcessingStatus>({
    queryKey: ["/api/file-processor/status"],
    refetchInterval: 2000,
    staleTime: 1000,
  });

  // Fetch real-time database statistics
  const { data: realTimeStats, isLoading: isStatsLoading } = useQuery<RealTimeStats>({
    queryKey: ["/api/processing/real-time-stats"],
    refetchInterval: 2000,
    staleTime: 0,
    gcTime: 0,
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

  // Update peak tracking when real-time stats change
  useEffect(() => {
    if (realTimeStats?.transactionsPerSecond !== undefined) {
      const currentTime = Date.now();
      const tenMinutesAgo = currentTime - (10 * 60 * 1000);
      
      // Store current reading with timestamp
      const currentReading = {
        value: realTimeStats.transactionsPerSecond,
        timestamp: currentTime
      };
      
      // Update speed history - keep readings from last 10 minutes only
      setSpeedHistory(prev => {
        const newHistory = [...prev, currentReading]
          .filter(reading => reading.timestamp > tenMinutesAgo)
          .slice(-100); // Keep max 100 readings for performance
        
        // Calculate peak from the last 10 minutes of data
        const peakValue = Math.max(...newHistory.map(r => r.value), 0);
        
        // Update peak if we found a higher value
        if (peakValue > peakTxnSpeed) {
          setPeakTxnSpeed(peakValue);
          setLastPeakTime(new Date());
        }
        
        // Only reset peak if no readings exist in the last 10 minutes (complete inactivity)
        // This preserves the peak value even when processing batches finish
        if (newHistory.length === 0 && lastPeakTime && (currentTime - lastPeakTime.getTime()) > (10 * 60 * 1000)) {
          setPeakTxnSpeed(0);
        }
        
        return newHistory;
      });
    }
  }, [realTimeStats?.transactionsPerSecond, peakTxnSpeed]);

  // Helper functions
  const getStatusBadge = () => {
    if (isLoading || !status) {
      return <Badge variant="secondary">Loading...</Badge>;
    }
    
    if (status.isPaused) {
      return <Badge variant="secondary" className="flex items-center gap-1"><Pause className="h-3 w-3" />Paused</Badge>;
    }
    if (status.isRunning) {
      return <Badge variant="default" className="flex items-center gap-1 bg-green-600"><Activity className="h-3 w-3" />Processing</Badge>;
    }
    return <Badge variant="outline" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />Idle</Badge>;
  };

  const calculateProgress = () => {
    if (!status?.currentTransactionRange) return 0;
    const currentId = parseInt(status.currentTransactionRange.replace(/\D/g, ''));
    const maxEstimatedId = 71127230050000;
    return Math.min((currentId / maxEstimatedId) * 100, 95);
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  // EARLY RETURNS FOR LOADING STATES MUST COME AFTER ALL HOOKS
  if (isLoading || isStatsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Processing Status
            <Badge variant="secondary">Loading...</Badge>
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

  if (!status || !realTimeStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Processing Status
            <Badge variant="destructive">Offline</Badge>
          </CardTitle>
          <CardDescription>Real-time file processing monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Unable to connect to processing service</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Processing Status
            <Badge 
              variant="outline" 
              className={import.meta.env.MODE === "production" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-blue-50 text-blue-700 border-blue-200"}
            >
              {import.meta.env.MODE === "production" ? "Production" : "Development"}
            </Badge>
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
          {status?.isRunning && status?.currentTransactionRange && (
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

          {/* Enhanced Processing KPIs - Always Visible */}
          <div className="space-y-4">
            <Separator />
            <div className="text-sm font-medium">Processing Performance KPIs</div>
            
            {/* Processing Speed & Efficiency */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-blue-600">
                  {realTimeStats.transactionsPerSecond?.toFixed(1) || '0.0'}
                </div>
                <div className="text-muted-foreground">Txns/sec</div>
                {/* Transaction Speed Gauge */}
                <div className="mt-2 px-2">
                  <TransactionSpeedGauge 
                    currentSpeed={realTimeStats.transactionsPerSecond || 0}
                    peakSpeed={peakTxnSpeed}
                    maxScale={Math.max(peakTxnSpeed * 1.2, 10)}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">(last 10 min)</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-purple-600">
                  {realTimeStats.processedFiles?.toLocaleString() || '0'}
                </div>
                <div className="text-muted-foreground">Processed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-orange-600">
                  {realTimeStats.filesWithErrors || '0'}
                </div>
                <div className="text-muted-foreground">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-600">
                  {realTimeStats.filesWithErrors === 0 && realTimeStats.processedFiles > 0 ? '100.0' : '0.0'}%
                </div>
                <div className="text-muted-foreground">Resolution Rate</div>
              </div>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2">
          {status.isPaused ? (
            <Button 
              onClick={() => resumeMutation.mutate()} 
              disabled={resumeMutation.isPending}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Resume Processing
            </Button>
          ) : (
            <Button 
              onClick={() => pauseMutation.mutate()} 
              disabled={pauseMutation.isPending}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Pause className="h-4 w-4" />
              Pause Processing
            </Button>
          )}
          
          <Button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/file-processor/status"] });
              queryClient.invalidateQueries({ queryKey: ["/api/processing/real-time-stats"] });
            }}
            variant="outline"
            size="sm"
          >
            Refresh
          </Button>
        </div>

        {/* Processing Details */}
        <div className="space-y-4 pt-4 border-t">
          <div className="text-sm font-medium">Processing Details</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Last Run:</span>
              <div className="font-medium">{formatDateTime(status.lastRunTime)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Next Scheduled:</span>
              <div className="font-medium">{formatDateTime(status.nextScheduledRun)}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}