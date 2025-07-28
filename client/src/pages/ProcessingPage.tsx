import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Activity, Database, Zap, TrendingUp, Clock, FileText, Server, Gauge, BarChart3, MonitorSpeaker } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import RecordsPerMinuteChart from "@/components/settings/RecordsPerMinuteChart";
import ProcessingStatus from "@/components/settings/ProcessingStatus";

// Processing Status Widget
function ProcessingStatusWidget() {
  const { data: processingStatus, isLoading } = useQuery({
    queryKey: ['/api/system/processing-status'],
    refetchInterval: 2000
  });

  const { data: queueStatus } = useQuery({
    queryKey: ['/api/uploads/queue-status'],
    refetchInterval: 3000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Processing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const isPaused = (processingStatus as any)?.paused;
  const status = (processingStatus as any)?.status || 'unknown';
  const queueLength = (queueStatus as any)?.queueLength || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Processing Status
        </CardTitle>
        <CardDescription>Real-time system processing status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">System Status:</span>
          <Badge variant={isPaused ? "destructive" : "default"}>
            {isPaused ? "Paused" : status}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Queue Length:</span>
          <Badge variant="outline">{queueLength} files</Badge>
        </div>

        {(queueStatus as any)?.currentlyProcessing && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Currently Processing:</div>
            <div className="text-sm text-muted-foreground">
              {(queueStatus as any).currentlyProcessing.originalFilename}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Performance KPIs Widget
function PerformanceKPIsWidget() {
  const { data: performanceData, isLoading } = useQuery({
    queryKey: ['/api/processing/performance-kpis'],
    refetchInterval: 3000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance KPIs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Performance KPIs
        </CardTitle>
        <CardDescription>Key processing performance indicators</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">TDDF Processing</div>
            <div className="text-2xl font-bold">{(performanceData as any)?.tddfPerMinute || 0}/min</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Records/Min</div>
            <div className="text-2xl font-bold">{(performanceData as any)?.recordsPerMinute || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">DT Records</div>
            <div className="text-lg font-semibold text-blue-600">{(performanceData as any)?.dtRecordsProcessed || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">BH Records</div>
            <div className="text-lg font-semibold text-green-600">{(performanceData as any)?.bhRecordsProcessed || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">P1 Records</div>
            <div className="text-lg font-semibold text-orange-600">{(performanceData as any)?.p1RecordsProcessed || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Other Records</div>
            <div className="text-lg font-semibold text-red-600">{(performanceData as any)?.otherRecordsProcessed || 0}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Scanly-Watcher Status Widget
function ScanlyWatcherWidget() {
  const { data: watcherStatus, isLoading } = useQuery({
    queryKey: ['/api/scanly-watcher/processing-status'],
    refetchInterval: 5000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Scanly-Watcher
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const data = (watcherStatus as any)?.data || {};
  const isActive = (watcherStatus as any)?.success && data.isActive;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Scanly-Watcher
        </CardTitle>
        <CardDescription>Automated system monitoring service</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge variant={isActive ? "default" : "destructive"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        
        {data.lastCheck && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Last Check:</span>
            <span className="text-sm text-muted-foreground">
              {new Date(data.lastCheck).toLocaleTimeString()}
            </span>
          </div>
        )}

        {data.alertsCount !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Active Alerts:</span>
            <Badge variant={data.alertsCount > 0 ? "destructive" : "secondary"}>
              {data.alertsCount}
            </Badge>
          </div>
        )}

        {data.tddfBacklog !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">TDDF Backlog:</span>
            <Badge variant={data.tddfBacklog > 0 ? "destructive" : "secondary"}>
              {data.tddfBacklog} records
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Real-time Stats Widget
function RealTimeStatsWidget() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/processing/real-time-stats'],
    refetchInterval: 3000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Real-time Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Real-time Statistics
        </CardTitle>
        <CardDescription>Current processing metrics and throughput</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Total Files</div>
            <div className="text-2xl font-bold">{(stats as any)?.totalFiles || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Queued Files</div>
            <div className="text-2xl font-bold text-yellow-600">{(stats as any)?.queuedFiles || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Processing</div>
            <div className="text-2xl font-bold text-blue-600">{(stats as any)?.processingFiles || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Completed</div>
            <div className="text-2xl font-bold text-green-600">{(stats as any)?.completedFiles || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Error Files</div>
            <div className="text-2xl font-bold text-red-600">{(stats as any)?.errorFiles || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Success Rate</div>
            <div className="text-2xl font-bold">{(stats as any)?.successRate ? `${(stats as any).successRate.toFixed(1)}%` : '0%'}</div>
          </div>
        </div>

        {(stats as any)?.averageProcessingTime && (
          <div className="pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Avg Processing Time:</span>
              <span className="text-sm text-muted-foreground">
                {((stats as any).averageProcessingTime / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Raw TDDF Status Widget
function RawTddfStatusWidget() {
  const { data: rawStatus, isLoading } = useQuery({
    queryKey: ['/api/tddf/raw-status'],
    refetchInterval: 3000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            TDDF Raw Processing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const total = (rawStatus as any)?.total || 0;
  const processed = (rawStatus as any)?.processed || 0;
  const pending = (rawStatus as any)?.pending || 0;
  const progressPercent = total > 0 ? (processed / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          TDDF Raw Processing
        </CardTitle>
        <CardDescription>Raw TDDF record processing status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-muted-foreground">{progressPercent.toFixed(1)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{total.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{processed.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Processed</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{pending.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// File Processor Status Widget
function FileProcessorStatusWidget() {
  const { data: processorStatus, isLoading } = useQuery({
    queryKey: ['/api/file-processor/status'],
    refetchInterval: 2000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            File Processor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const isRunning = (processorStatus as any)?.isRunning;
  const nextScheduled = (processorStatus as any)?.nextScheduled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          File Processor
        </CardTitle>
        <CardDescription>Background file processing service</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge variant={isRunning ? "default" : "secondary"}>
            {isRunning ? "Running" : "Idle"}
          </Badge>
        </div>

        {nextScheduled && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Next Run:</span>
            <span className="text-sm text-muted-foreground">
              {new Date(nextScheduled).toLocaleTimeString()}
            </span>
          </div>
        )}

        {(processorStatus as any)?.lastProcessed && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Last Processed:</span>
            <span className="text-sm text-muted-foreground">
              {new Date((processorStatus as any).lastProcessed).toLocaleTimeString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProcessingPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Processing Center</h1>
          <p className="text-muted-foreground">
            Monitor and manage system processing performance and status
          </p>
        </div>
      </div>

      <Separator />

      {/* Main Processing Status Component - This includes the gauges and KPIs */}
      <ProcessingStatus />

      <Separator />

      {/* Records Per Minute Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Records Processed per Minute
          </CardTitle>
          <CardDescription>Real-time processing performance over time</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordsPerMinuteChart hours={0.08333} className="h-64" />
        </CardContent>
      </Card>

      {/* Additional Processing Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ScanlyWatcherWidget />
        <RealTimeStatsWidget />
        <FileProcessorStatusWidget />
      </div>
    </div>
  );
}