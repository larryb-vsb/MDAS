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
import RecordsPerMinuteChart from "./RecordsPerMinuteChart";

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
  tddfFilesProcessed: number;
  tddfFilesQueued: number;
  transactionsPerSecond: number;
  tddfRecordsPerSecond: number;
  timestamp: string;
  tddfOperations: {
    totalTddfRecords: number;
    totalTddfAmount: number;
    tddfRecordsToday: number;
    tddfRecordsLastHour: number;
    totalRawLines: number;
    dtRecordsProcessed: number;
    nonDtRecordsSkipped: number;
    bhRecordsSkipped?: number;
    p1RecordsSkipped?: number;
    otherRecordsSkipped?: number;
    otherSkipped: number;
    pendingRawLines: number;
    rawLineBacklog: number;
    rawProcessingProgress: number;
  };
}

interface ConcurrencyStats {
  totalFiles: number;
  processingByServer: Record<string, number>;
  staleProcessingFiles: number;
  serverId?: string;
  timestamp?: string;
}

// Duration formatting function (always show hours for backlog estimates)
const formatQueueEstimate = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  // Always show hours and minutes format for backlog processing
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    // Convert minutes to decimal hours for better precision
    const decimalHours = (totalSeconds / 3600).toFixed(1);
    return `${decimalHours}h`;
  } else if (totalSeconds > 0) {
    // Show very small times as decimal hours
    const decimalHours = (totalSeconds / 3600).toFixed(2);
    return `${decimalHours}h`;
  } else {
    return '0h';
  }
};

// Enhanced multi-colored gauge for different record types
const MultiColorGauge = ({ 
  currentSpeed, 
  maxScale = 20, 
  recordTypes = { dt: 0, bh: 0, p1: 0, other: 0 },
  showRecordTypes = false 
}: { 
  currentSpeed: number;
  maxScale?: number;
  recordTypes?: { dt: number; bh: number; p1: number; other: number };
  showRecordTypes?: boolean;
}) => {
  const currentPercentage = Math.min((currentSpeed / maxScale) * 100, 100);
  
  // Calculate percentages for each record type when showing types
  const totalRecords = recordTypes.dt + recordTypes.bh + recordTypes.p1 + recordTypes.other;
  const dtPercentage = totalRecords > 0 ? (recordTypes.dt / totalRecords) * currentPercentage : currentPercentage;
  const bhPercentage = totalRecords > 0 ? (recordTypes.bh / totalRecords) * currentPercentage : 0;
  const p1Percentage = totalRecords > 0 ? (recordTypes.p1 / totalRecords) * currentPercentage : 0;
  const otherPercentage = totalRecords > 0 ? (recordTypes.other / totalRecords) * currentPercentage : 0;
  
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
        
        {/* Multi-colored bars for record types or single blue bar */}
        {showRecordTypes && totalRecords > 0 ? (
          <>
            {/* DT Records - Blue */}
            {dtPercentage > 0 && (
              <div 
                className="absolute left-0 top-0 h-full transition-all duration-300 ease-out"
                style={{ width: `${dtPercentage}%`, backgroundColor: '#3b82f6' }}
              />
            )}
            {/* BH Records - Green */}
            {bhPercentage > 0 && (
              <div 
                className="absolute top-0 h-full transition-all duration-300 ease-out"
                style={{ left: `${dtPercentage}%`, width: `${bhPercentage}%`, backgroundColor: '#10b981' }}
              />
            )}
            {/* P1 Records - Amber */}
            {p1Percentage > 0 && (
              <div 
                className="absolute top-0 h-full transition-all duration-300 ease-out"
                style={{ left: `${dtPercentage + bhPercentage}%`, width: `${p1Percentage}%`, backgroundColor: '#f59e0b' }}
              />
            )}
            {/* Other Records - Red */}
            {otherPercentage > 0 && (
              <div 
                className="absolute top-0 h-full rounded-r-full transition-all duration-300 ease-out"
                style={{ left: `${dtPercentage + bhPercentage + p1Percentage}%`, width: `${otherPercentage}%`, backgroundColor: '#ef4444' }}
              />
            )}
          </>
        ) : (
          /* Single blue bar for non-TDDF gauges */
          <div 
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${currentPercentage}%` }}
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

// Keep original gauge for backward compatibility
const TransactionSpeedGauge = ({ currentSpeed, maxScale = 20 }: { currentSpeed: number, maxScale?: number }) => {
  return (
    <MultiColorGauge 
      currentSpeed={currentSpeed}
      maxScale={maxScale}
      showRecordTypes={false}
    />
  );
};

export default function ProcessingStatus() {
  const queryClient = useQueryClient();
  
  // ALL HOOKS MUST BE AT THE TOP LEVEL - NO CONDITIONAL HOOKS
  
  // Peak meter state management
  const [peakTxnSpeed, setPeakTxnSpeed] = useState(0);
  const [peakTddfSpeed, setPeakTddfSpeed] = useState(0);
  const [speedHistory, setSpeedHistory] = useState<Array<{value: number, timestamp: number}>>([]);
  const [tddfSpeedHistory, setTddfSpeedHistory] = useState<Array<{value: number, timestamp: number}>>([]);
  const [lastPeakTime, setLastPeakTime] = useState<Date | null>(null);
  const [lastTddfPeakTime, setLastTddfPeakTime] = useState<Date | null>(null);

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

  // Fetch concurrency control statistics
  const { data: concurrencyStats, isLoading: isConcurrencyLoading } = useQuery<ConcurrencyStats>({
    queryKey: ["/api/processing/concurrency-stats"],
    refetchInterval: 3000,
    staleTime: 1000,
  });

  // Fetch recent chart data for TDDF gauge (same data source as chart)
  const { data: chartData } = useQuery({
    queryKey: ['/api/processing/records-per-minute-history', 1, 0], // Last 1 hour, no offset
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  });

  // Fetch TDDF raw processing status for accurate hierarchical counts
  const { data: tddfRawStatus } = useQuery({
    queryKey: ['/api/tddf/raw-status'],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time monitoring  
    staleTime: 2000,
    retry: 1, // Retry only once on failure
    onError: (error) => {
      console.log('TDDF raw status query failed:', error);
    }
  });

  // Pause processing mutation
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/file-processor/pause", {
        method: "POST"
      });
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
      const res = await apiRequest("/api/file-processor/resume", {
        method: "POST"
      });
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

  // Manual processing trigger mutation
  const triggerProcessingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/process-uploads", {
        method: "POST",
        body: {
          fileIds: []  // Empty array triggers processing of queued files
        }
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/file-processor/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/processing/concurrency-stats"] });
      toast({
        title: "Processing triggered",
        description: data.message || "File processing has been triggered manually.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to trigger processing",
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
        if (newHistory.length === 0 && lastPeakTime && (currentTime - lastPeakTime.getTime()) > (10 * 60 * 1000)) {
          setPeakTxnSpeed(0);
        }
        
        return newHistory;
      });
    }
  }, [realTimeStats?.transactionsPerSecond, peakTxnSpeed]);

  // Update TDDF peak tracking when real-time stats change
  useEffect(() => {
    if (realTimeStats?.tddfRecordsPerSecond !== undefined) {
      const currentTime = Date.now();
      const tenMinutesAgo = currentTime - (10 * 60 * 1000);
      
      // Store current TDDF reading with timestamp
      const currentTddfReading = {
        value: realTimeStats.tddfRecordsPerSecond,
        timestamp: currentTime
      };
      
      // Update TDDF speed history - keep readings from last 10 minutes only
      setTddfSpeedHistory(prev => {
        const newHistory = [...prev, currentTddfReading]
          .filter(reading => reading.timestamp > tenMinutesAgo)
          .slice(-100); // Keep max 100 readings for performance
        
        // Calculate peak from the last 10 minutes of data
        const peakValue = Math.max(...newHistory.map(r => r.value), 0);
        
        // Update peak if we found a higher value
        if (peakValue > peakTddfSpeed) {
          setPeakTddfSpeed(peakValue);
          setLastTddfPeakTime(new Date());
        }
        
        // Only reset peak if no readings exist in the last 10 minutes (complete inactivity)
        if (newHistory.length === 0 && lastTddfPeakTime && (currentTime - lastTddfPeakTime.getTime()) > (10 * 60 * 1000)) {
          setPeakTddfSpeed(0);
        }
        
        return newHistory;
      });
    }
  }, [realTimeStats?.tddfRecordsPerSecond, peakTddfSpeed]);

  // Helper functions
  const getStatusBadge = () => {
    if (isLoading || !status) {
      return <Badge variant="secondary">Loading...</Badge>;
    }
    
    // Check if any server is currently processing files
    const isGloballyProcessing = concurrencyStats && Object.keys(concurrencyStats.processingByServer).length > 0;
    
    if (status.isPaused) {
      return <Badge variant="secondary" className="flex items-center gap-1"><Pause className="h-3 w-3" />Paused</Badge>;
    }
    if (isGloballyProcessing) {
      return <Badge variant="default" className="flex items-center gap-1 bg-green-600"><Activity className="h-3 w-3" />Processing</Badge>;
    }
    if (status.isRunning) {
      return <Badge variant="default" className="flex items-center gap-1 bg-blue-600"><Activity className="h-3 w-3" />Active</Badge>;
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
  if (isLoading || isStatsLoading || isConcurrencyLoading) {
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-blue-600">
                  {((realTimeStats.transactionsPerSecond || 0) * 60).toFixed(0)}
                </div>
                <div className="text-muted-foreground">Txns/min</div>
                {/* Transaction Speed Gauge */}
                <div className="mt-2 px-2">
                  <TransactionSpeedGauge 
                    currentSpeed={(realTimeStats.transactionsPerSecond || 0) * 60}
                    maxScale={Math.max((realTimeStats.transactionsPerSecond || 0) * 60 * 1.2, 600)}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">(last 10 min)</div>
              </div>
              <div className="text-center space-y-2">
                {(() => {
                  // Calculate current TDDF rate from chart data (same as chart)
                  const recentChartData = chartData?.data || [];
                  const latestDataPoint = recentChartData[recentChartData.length - 1];
                  const currentTddfRate = latestDataPoint ? 
                    (latestDataPoint.bhRecords + latestDataPoint.p1Records + latestDataPoint.otherRecords) : 0;
                  const currentDtRate = latestDataPoint ? latestDataPoint.dtRecords : 0;
                  const totalTddfRate = currentTddfRate + currentDtRate;

                  return (
                    <>
                      <div className="text-lg font-semibold text-indigo-600">
                        {totalTddfRate.toFixed(0)}
                      </div>
                      <div className="text-muted-foreground">TDDF/min</div>
                      {/* TDDF Speed Gauge with Record Type Colors */}
                      <div className="mt-2 px-2">
                        <MultiColorGauge 
                          currentSpeed={totalTddfRate}
                          maxScale={125}
                          recordTypes={{
                            dt: currentDtRate,
                            bh: latestDataPoint?.bhRecords || 0,
                            p1: latestDataPoint?.p1Records || 0,
                            other: latestDataPoint?.otherRecords || 0
                          }}
                          showRecordTypes={true}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">(last hour)</div>
                    </>
                  );
                })()}
                {/* Record Type Legend for TDDF */}
                <div className="flex items-center justify-center gap-2 text-xs mt-1">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                    DT
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
                    BH
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                    P1
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    Other
                  </span>
                </div>
              </div>
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-orange-600">
                  {((realTimeStats.transactionsPerSecond || 0) * 60).toFixed(0)}
                </div>
                <div className="text-muted-foreground">Records/min</div>
                {/* Records per Minute Gauge */}
                <div className="mt-2 px-2">
                  <TransactionSpeedGauge 
                    currentSpeed={(realTimeStats.transactionsPerSecond || 0) * 60}
                    maxScale={Math.max((realTimeStats.transactionsPerSecond || 0) * 60 * 1.2, 600)}
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
                <div className="text-lg font-semibold text-green-600">
                  {realTimeStats.filesWithErrors === 0 && realTimeStats.processedFiles > 0 ? '100.0' : '0.0'}%
                </div>
                <div className="text-muted-foreground">Resolution Rate</div>
              </div>
            </div>
            
            {/* Records Per Minute Historical Chart */}
            <div className="mt-6">
              <RecordsPerMinuteChart hours={1} className="w-full" />
            </div>
            
            {/* TDDF Operations Section */}
            {realTimeStats.tddfOperations && (realTimeStats.tddfOperations.totalTddfRecords > 0 || realTimeStats.tddfFilesProcessed > 0) && (
              <div className="space-y-3">
                <div className="text-sm font-medium text-muted-foreground border-t pt-3">TDDF File Operations</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-emerald-600">
                      {realTimeStats.tddfFilesProcessed?.toLocaleString() || '0'}
                    </div>
                    <div className="text-muted-foreground">TDDF Files</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-cyan-600">
                      {realTimeStats.tddfOperations.totalTddfRecords?.toLocaleString() || '0'}
                    </div>
                    <div className="text-muted-foreground">DT Records</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-600">
                      {realTimeStats.tddfOperations.totalRawLines?.toLocaleString() || '0'}
                    </div>
                    <div className="text-muted-foreground">Raw Lines</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-amber-600">
                      ${(realTimeStats.tddfOperations.totalTddfAmount / 100)?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </div>
                    <div className="text-muted-foreground">Total Value</div>
                  </div>
                </div>
                
                {/* TDDF Processing Breakdown */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-xs">
                  <div className="text-center p-2 bg-gray-50 rounded border">
                    <div className="font-semibold text-gray-700">
                      {(() => {
                        // Calculate total processed: DT + BH + P1 + Other (ALL hierarchical records, not just DT)
                        const dtProcessed = realTimeStats.tddfOperations.dtRecordsProcessed || 0;
                        
                        // BH, P1, Other are currently showing "skipped" counts but these should be "processed" counts
                        // For hierarchical processing, these records are processed (not skipped) into their respective tables
                        const bhProcessed = realTimeStats.tddfOperations.bhRecordsSkipped || 0; // Actually processed BH records
                        const p1Processed = realTimeStats.tddfOperations.p1RecordsSkipped || 0; // Actually processed P1 records
                        const otherProcessed = realTimeStats.tddfOperations.otherRecordsSkipped || 0; // Actually processed Other records
                        
                        const totalProcessed = dtProcessed + bhProcessed + p1Processed + otherProcessed;
                        
                        // Use raw status if available, otherwise calculate from hierarchical totals
                        return (tddfRawStatus?.processed || totalProcessed).toLocaleString();
                      })()}
                    </div>
                    <div className="text-gray-600">Total Processed</div>
                  </div>
                  <div className="text-center p-2 bg-blue-50 rounded border">
                    <div className="font-semibold text-blue-700">
                      {realTimeStats.tddfOperations.dtRecordsProcessed?.toLocaleString() || '0'}
                    </div>
                    <div className="text-blue-600">DT</div>
                  </div>
                  <div className="text-center p-2 bg-emerald-50 rounded border">
                    <div className="font-semibold text-emerald-700">
                      {/* BH records are "processed" into hierarchical tables, not skipped */}
                      {realTimeStats.tddfOperations.bhRecordsSkipped?.toLocaleString() || '0'}
                    </div>
                    <div className="text-emerald-600">BH</div>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded border">
                    <div className="font-semibold text-amber-700">
                      {/* P1 records are "processed" into hierarchical tables, not skipped */}
                      {realTimeStats.tddfOperations.p1RecordsSkipped?.toLocaleString() || '0'}
                    </div>
                    <div className="text-amber-600">P1</div>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded border">
                    <div className="font-semibold text-red-700">
                      {/* Other records are "processed" into hierarchical tables, not skipped */}
                      {realTimeStats.tddfOperations.otherRecordsSkipped?.toLocaleString() || '0'}
                    </div>
                    <div className="text-red-600">Other</div>
                  </div>
                  <div className="text-center p-2 bg-orange-50 rounded border">
                    <div className="font-semibold text-orange-700">
                      {realTimeStats.tddfOperations.tddfRecordsToday?.toLocaleString() || '0'}
                    </div>
                    <div className="text-orange-600">Today</div>
                  </div>
                </div>

                {/* Raw Line Processing Backlog Section */}
                {realTimeStats.tddfOperations.totalRawLines > 0 && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="text-sm font-medium text-muted-foreground">Raw Line Processing Backlog</div>
                    
                    {/* Backlog Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Processing Progress</span>
                        <span className="font-medium">
                          {((realTimeStats.tddfOperations.dtRecordsProcessed + realTimeStats.tddfOperations.nonDtRecordsSkipped + (realTimeStats.tddfOperations.otherSkipped || 0)) / realTimeStats.tddfOperations.totalRawLines * 100).toFixed(1)}% Complete
                        </span>
                      </div>
                      <Progress 
                        value={(realTimeStats.tddfOperations.dtRecordsProcessed + realTimeStats.tddfOperations.nonDtRecordsSkipped + (realTimeStats.tddfOperations.otherSkipped || 0)) / realTimeStats.tddfOperations.totalRawLines * 100} 
                        className="h-2"
                      />
                    </div>
                    
                    {/* Raw Line Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="text-center p-2 bg-slate-50 rounded border">
                        <div className="font-semibold text-slate-700">
                          {realTimeStats.tddfOperations.totalRawLines?.toLocaleString() || '0'}
                        </div>
                        <div className="text-slate-600">Total Lines</div>
                      </div>
                      <div className="text-center p-2 bg-green-50 rounded border">
                        <div className="font-semibold text-green-700">
                          {(realTimeStats.tddfOperations.dtRecordsProcessed + realTimeStats.tddfOperations.nonDtRecordsSkipped + (realTimeStats.tddfOperations.otherSkipped || 0))?.toLocaleString() || '0'}
                        </div>
                        <div className="text-green-600">Completed</div>
                      </div>
                      <div className="text-center p-2 bg-amber-50 rounded border">
                        <div className="font-semibold text-amber-700">
                          {(realTimeStats.tddfOperations.totalRawLines - (realTimeStats.tddfOperations.dtRecordsProcessed + realTimeStats.tddfOperations.nonDtRecordsSkipped + (realTimeStats.tddfOperations.otherSkipped || 0)))?.toLocaleString() || '0'}
                        </div>
                        <div className="text-amber-600">Backlog</div>
                      </div>
                      <div className="text-center p-2 bg-blue-50 rounded border">
                        <div className="font-semibold text-blue-700">
                          {(() => {
                            const backlog = realTimeStats.tddfOperations.totalRawLines - (realTimeStats.tddfOperations.dtRecordsProcessed + realTimeStats.tddfOperations.nonDtRecordsSkipped + (realTimeStats.tddfOperations.otherSkipped || 0));
                            if (realTimeStats.tddfRecordsPerSecond <= 0 || backlog <= 0) return '< 1m';
                            const estimatedSeconds = backlog / realTimeStats.tddfRecordsPerSecond;
                            return formatQueueEstimate(estimatedSeconds);
                          })()}
                        </div>
                        <div className="text-blue-600">Est. Time</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Multi-Node Concurrency Status */}
        {concurrencyStats && (
          <div className="space-y-4">
            <Separator />
            <div className="text-sm font-medium">Multi-Node Concurrency Control</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Active Servers:</span>
                <div className="font-medium">
                  {Object.keys(concurrencyStats.processingByServer).length > 0 
                    ? `${Object.keys(concurrencyStats.processingByServer).length} processing`
                    : "No active processing"}
                </div>
                {Object.entries(concurrencyStats.processingByServer).map(([serverId, fileCount]) => (
                  <div key={serverId} className="text-xs text-muted-foreground mt-1">
                    Server {serverId.split('-').slice(-1)[0]}: {fileCount} file{fileCount !== 1 ? 's' : ''}
                  </div>
                ))}
              </div>
              <div>
                <span className="text-muted-foreground">Stale Files:</span>
                <div className="font-medium">
                  {concurrencyStats.staleProcessingFiles || 0}
                  {concurrencyStats.staleProcessingFiles > 0 && (
                    <Badge variant="destructive" className="ml-2 text-xs">Needs Cleanup</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
            onClick={() => triggerProcessingMutation.mutate()} 
            disabled={triggerProcessingMutation.isPending}
            variant="default"
            className="flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            {triggerProcessingMutation.isPending ? "Triggering..." : "Process Now"}
          </Button>
          
          <Button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/file-processor/status"] });
              queryClient.invalidateQueries({ queryKey: ["/api/processing/real-time-stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/processing/concurrency-stats"] });
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