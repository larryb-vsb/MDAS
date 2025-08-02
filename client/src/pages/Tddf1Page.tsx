import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight, BarChart3, Database, FileText, TrendingUp, DollarSign, Activity, ArrowLeft, RefreshCw } from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";


interface Tddf1Stats {
  totalFiles: number;
  totalRecords: number;
  totalTransactionValue: number;
  recordTypeBreakdown: Record<string, number>;
  activeTables: string[];
  lastProcessedDate: string | null;
  // Enhanced breakdown fields
  fileName?: string;
  processingDurationMs?: number;
  totalTddfLines?: number;
  totalJsonLinesInserted?: number;
  processingStartTime?: string;
  processingEndTime?: string;
  validationSummary?: Record<string, any>;
  performanceMetrics?: Record<string, any>;
  cached?: boolean;
  cacheDate?: string;
  lastUpdated?: string;
}

interface Tddf1DayBreakdown {
  date: string;
  totalRecords: number;
  recordTypes: Record<string, number>;
  transactionValue: number;
  totalNetDepositBH?: number;
  fileCount: number;
  tables: string[];
  filesProcessed: Array<{
    fileName: string;
    tableName: string;
    recordCount: number;
    processingTime?: number;
    fileSize?: string;
  }>;
}

interface Tddf1RecentActivity {
  id: string;
  fileName: string;
  recordCount: number;
  processedAt: string;
  status: string;
  tableName: string;
}

interface Tddf1EncodingProgress {
  uploadId: string;
  filename: string;
  status: 'not_started' | 'started' | 'encoding' | 'completed';
  progress: number;
  currentRecords: number;
  estimatedTotal: number;
  actualFileSize?: number;
  recordBreakdown: Record<string, number>;
  tableName: string;
  phase: string;
  lastUpdated: string;
}

function Tddf1Page() {
  // Default to August 2nd, 2025 where our TDDF1 data exists
  const [selectedDate, setSelectedDate] = useState<Date>(new Date('2025-08-02'));
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showProgressTracking, setShowProgressTracking] = useState(false);
  const [trackingUploadId, setTrackingUploadId] = useState<string | null>(null);

  // Format dates for API calls
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  // API Queries with enhanced refresh options
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<Tddf1Stats>({
    queryKey: ['/api/tddf1/stats'],
    refetchInterval: 10000, // Refetch every 10 seconds
    refetchOnWindowFocus: true,
    staleTime: 5000, // Consider data fresh for 5 seconds
  });

  const { data: dayBreakdown, isLoading: dayLoading, refetch: refetchDayBreakdown } = useQuery<Tddf1DayBreakdown>({
    queryKey: ['/api/tddf1/day-breakdown', selectedDateStr],
    enabled: !!selectedDateStr,
  });

  const { data: recentActivity, isLoading: activityLoading, refetch: refetchActivity } = useQuery<Tddf1RecentActivity[]>({
    queryKey: ['/api/tddf1/recent-activity'],
  });

  // Progress tracking query (only when tracking is enabled)
  const { data: encodingProgress, isLoading: progressLoading } = useQuery<Tddf1EncodingProgress>({
    queryKey: ['/api/tddf1/encoding-progress', trackingUploadId],
    queryFn: () => fetch(`/api/tddf1/encoding-progress/${trackingUploadId}`).then(res => res.json()),
    enabled: !!trackingUploadId && showProgressTracking,
    refetchInterval: trackingUploadId ? 2000 : false, // Poll every 2 seconds when tracking
  });

  // Navigation functions
  const navigateToToday = () => setSelectedDate(new Date());
  const navigateToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1));
  const navigateToNextDay = () => setSelectedDate(prev => addDays(prev, 1));

  // Totals cache rebuild mutation
  const rebuildCacheMutation = useMutation({
    mutationFn: () => apiRequest('/api/tddf1/rebuild-totals-cache', {
      method: 'POST',
    }),
    onSuccess: () => {
      toast({
        title: "Cache Rebuilt",
        description: "TDDF1 totals cache has been successfully rebuilt with fresh Net Deposit calculations",
      });
      // Refresh all queries to get fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/tddf1/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf1/day-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf1/recent-activity'] });
    },
    onError: (error: any) => {
      toast({
        title: "Cache Rebuild Failed",
        description: error.message || "Failed to rebuild TDDF1 totals cache",
        variant: "destructive",
      });
    }
  });

  // Progress tracking functions
  const startProgressTracking = (uploadId: string) => {
    setTrackingUploadId(uploadId);
    setShowProgressTracking(true);
    toast({
      title: "Progress Tracking Started",
      description: `Now tracking encoding progress for ${uploadId}`,
    });
  };

  const stopProgressTracking = () => {
    setShowProgressTracking(false);
    setTrackingUploadId(null);
  };

  // Auto-stop tracking when encoding completes
  useEffect(() => {
    if (encodingProgress?.status === 'completed') {
      setTimeout(() => {
        stopProgressTracking();
        toast({
          title: "Encoding Complete!",
          description: `File ${encodingProgress.filename} has finished encoding with ${encodingProgress.currentRecords} records`,
        });
      }, 3000); // Show completion for 3 seconds before auto-stopping
    }
  }, [encodingProgress?.status]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => setLocation('/')} 
              variant="outline" 
              size="sm"
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">TDDF1 Dashboard</h1>
              <p className="text-gray-600 mt-1">File-based TDDF processing with day-level analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={navigateToToday} variant="outline">
              <Calendar className="h-4 w-4 mr-2" />
              Today
            </Button>
            {!showProgressTracking && (
              <Button 
                onClick={() => startProgressTracking('uploader_1754109681308_4m2wdlwnj')} 
                variant="default"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Activity className="h-4 w-4 mr-2 animate-pulse" />
                Track Live Encoding
              </Button>
            )}
          </div>
        </div>

        {/* Totals Band */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Files</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (stats?.totalFiles ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records Processed</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (stats?.totalRecords ?? 0).toLocaleString()}
              </div>
              {stats?.totalTddfLines && stats.totalTddfLines > 0 && (
                <p className="text-xs text-muted-foreground">
                  of {stats.totalTddfLines.toLocaleString()} total lines processed
                  {stats.totalTddfLines > 0 && stats.totalRecords && (
                    <span className="text-blue-600 font-medium">
                      {' '}({((stats.totalRecords / stats.totalTddfLines) * 100).toFixed(1)}% extraction rate)
                    </span>
                  )}
                  {stats.totalJsonLinesInserted && stats.totalJsonLinesInserted !== stats.totalRecords && (
                    <span> • {stats.totalJsonLinesInserted.toLocaleString()} inserted</span>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transaction Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : `$${(stats?.totalTransactionValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tables</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (stats?.activeTables?.length ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pre-Cache Totals Widget */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Pre-Cache Totals Management
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchStats()}
                  disabled={statsLoading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
                  Refresh Data
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rebuildCacheMutation.mutate()}
                  disabled={rebuildCacheMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${rebuildCacheMutation.isPending ? 'animate-spin' : ''}`} />
                  Rebuild Cache
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {stats?.cached ? 'Cached' : 'Real-time'}
                </div>
                <div className="text-sm text-gray-500">Data Source</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {stats?.totalRecords?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-gray-500">Records Processed</div>
                {stats?.totalTddfLines && (
                  <div className="text-xs text-gray-400">
                    of {stats.totalTddfLines.toLocaleString()} total lines
                    {stats.totalTddfLines > 0 && stats.totalRecords && (
                      <span className="ml-1 text-blue-500">
                        ({((stats.totalRecords / stats.totalTddfLines) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {stats?.totalTddfLines?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-gray-500">Total Lines Processed</div>
                {stats?.performanceMetrics?.lineExtractionRate && (
                  <div className="text-xs text-gray-400">
                    {stats.performanceMetrics.lineExtractionRate} extraction rate
                  </div>
                )}
              </div>
            </div>
            {rebuildCacheMutation.isPending && (
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <div className="text-sm text-blue-800">
                  Rebuilding TDDF1 totals cache... This may take a few moments.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day Navigation */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Day Navigation
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToPreviousDay}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToNextDay}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={isToday(selectedDate) ? "default" : "secondary"}>
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </Badge>
              {dayBreakdown && (
                <span className="text-sm text-gray-600">
                  {dayBreakdown.totalRecords} records • {dayBreakdown.fileCount} files
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                onClick={navigateToPreviousDay}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous Day
              </Button>
              <Button
                onClick={navigateToToday}
                variant={isToday(selectedDate) ? "default" : "outline"}
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Today
              </Button>
              <Button
                variant="outline"
                onClick={navigateToNextDay}
                className="flex items-center gap-2"
              >
                Next Day
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Day Breakdown Widget */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Daily Breakdown - {format(selectedDate, 'MMM d, yyyy')}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchDayBreakdown()}
                  disabled={dayLoading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${dayLoading ? 'animate-spin' : ''}`} />
                  Refresh Day
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dayLoading ? (
                <div className="text-center py-8 text-gray-500">Loading day data...</div>
              ) : dayBreakdown ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{dayBreakdown.totalRecords.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Records Processed</div>
                      {dayBreakdown.filesProcessed && dayBreakdown.filesProcessed.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {dayBreakdown.filesProcessed.reduce((sum, file) => sum + (file.recordCount || 0), 0).toLocaleString()} total
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{dayBreakdown.fileCount}</div>
                      <div className="text-sm text-gray-600">Files Processed</div>
                      {dayBreakdown.filesProcessed && dayBreakdown.filesProcessed.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {dayBreakdown.filesProcessed.filter(f => f.processingTime).length} completed
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        ${dayBreakdown.transactionValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-sm text-gray-600">Transaction Value</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{dayBreakdown.tables.length}</div>
                      <div className="text-sm text-gray-600">Active Tables</div>
                    </div>
                  </div>

                  {/* Record Type Breakdown */}
                  <div>
                    <h4 className="font-semibold mb-3">Record Types</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {(() => {
                        // Define consistent order and colors for record types
                        const recordTypeConfig = {
                          'BH': { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'BH', description: 'Batch Header' },
                          'DT': { color: 'bg-green-100 text-green-800 border-green-200', label: 'DT', description: 'Detail Transaction' },
                          'G2': { color: 'bg-purple-100 text-purple-800 border-purple-200', label: 'G2', description: 'Geographic Data' },
                          'E1': { color: 'bg-orange-100 text-orange-800 border-orange-200', label: 'E1', description: 'Extension 1' },
                          'P1': { color: 'bg-cyan-100 text-cyan-800 border-cyan-200', label: 'P1', description: 'Purchasing Card 1' },
                          'P2': { color: 'bg-pink-100 text-pink-800 border-pink-200', label: 'P2', description: 'Purchasing Card 2' },
                          'DR': { color: 'bg-red-100 text-red-800 border-red-200', label: 'DR', description: 'Detail Reversal' },
                          'AD': { color: 'bg-indigo-100 text-indigo-800 border-indigo-200', label: 'AD', description: 'Adjustment' },
                          'UNK': { color: 'bg-gray-100 text-gray-800 border-gray-200', label: 'UNK', description: 'Unknown' }
                        };
                        
                        const orderedTypes = Object.keys(recordTypeConfig);
                        return orderedTypes
                          .filter(type => dayBreakdown.recordTypes[type])
                          .map(type => {
                            const count = dayBreakdown.recordTypes[type];
                            const config = recordTypeConfig[type as keyof typeof recordTypeConfig];
                            const displayCount = typeof count === 'number' ? count : (typeof count === 'object' && count !== null && 'count' in count ? (count as any).count : count);
                            
                            // Net Deposit functionality removed for now
                            
                            // Standard layout for other record types
                            return (
                              <div key={type} className={`flex items-center justify-between rounded-lg p-3 border ${config.color}`}>
                                <div>
                                  <span className="text-sm font-bold">{config.label}</span>
                                  <div className="text-xs opacity-80">{config.description}</div>
                                </div>
                                <div className="text-lg font-bold">{displayCount.toLocaleString()}</div>
                              </div>
                            );
                          });
                      })()}
                    </div>
                  </div>

                  {/* Files Processed on This Day */}
                  {dayBreakdown.filesProcessed && dayBreakdown.filesProcessed.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">Files Processed ({dayBreakdown.filesProcessed.length})</h4>
                      <div className="space-y-2">
                        {dayBreakdown.filesProcessed.map((file, index) => (
                          <div key={index} className="bg-blue-50 rounded-lg p-3 border">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-blue-900">{file.fileName}</div>
                                <div className="text-sm text-blue-700">
                                  <span className="font-semibold">{file.recordCount.toLocaleString()} records processed</span>
                                  {file.fileSize && ` • Size: ${file.fileSize}`}
                                  {file.processingTime && ` • Duration: ${file.processingTime}s`}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {file.tableName.replace('dev_tddf1_', '')}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Tables (fallback) */}
                  {(!dayBreakdown.filesProcessed || dayBreakdown.filesProcessed.length === 0) && dayBreakdown.tables.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">Active Tables</h4>
                      <div className="flex flex-wrap gap-2">
                        {dayBreakdown.tables.map(table => (
                          <Badge key={table} variant="outline">{table}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No data available for {format(selectedDate, 'MMM d, yyyy')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress Tracking Widget */}
          {showProgressTracking && encodingProgress && (
            <Card className="border-2 border-blue-200 bg-blue-50/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-600 animate-pulse" />
                    Live Encoding Progress
                  </CardTitle>
                  <Button 
                    onClick={stopProgressTracking} 
                    variant="outline" 
                    size="sm"
                  >
                    Stop
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm truncate">{encodingProgress.filename}</span>
                      <Badge variant={encodingProgress.status === 'completed' ? 'default' : 'secondary'}>
                        {encodingProgress.status}
                      </Badge>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                        style={{ width: `${encodingProgress.progress}%` }}
                      />
                    </div>
                    
                    <div className="text-xs text-gray-600">
                      {encodingProgress.currentRecords.toLocaleString()} / {encodingProgress.estimatedTotal.toLocaleString()} records ({encodingProgress.progress}%)
                    </div>
                  </div>
                  
                  {/* Record Type Breakdown */}
                  {Object.keys(encodingProgress.recordBreakdown).length > 0 && (
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(encodingProgress.recordBreakdown).map(([type, count]) => (
                        <div key={type} className="flex justify-between bg-white/70 px-2 py-1 rounded text-xs">
                          <span>{type}:</span>
                          <span>{count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    Updated: {format(new Date(encodingProgress.lastUpdated), 'HH:mm:ss')}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Activity Widget */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchActivity()}
                  disabled={activityLoading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${activityLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="text-center py-4 text-gray-500">Loading...</div>
              ) : recentActivity && recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.slice(0, 10).map(activity => (
                    <div key={activity.id} className="border-l-2 border-blue-200 pl-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{activity.fileName}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={activity.status === 'completed' ? 'default' : 'secondary'}>
                            {activity.status}
                          </Badge>
                          {activity.status === 'encoding' && (
                            <Button 
                              onClick={() => startProgressTracking(activity.id)} 
                              variant="outline" 
                              size="sm"
                              className="text-xs h-6 px-2"
                            >
                              Track
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {activity.recordCount} records • {activity.tableName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(activity.processedAt), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">No recent activity</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Record Type Breakdown Widget */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Overall Record Type Breakdown
            </CardTitle>
            {stats?.fileName && (
              <p className="text-sm text-gray-600 mt-1">
                Latest File: {stats.fileName} • 
                {stats.processingDurationMs && ` Processed in ${(stats.processingDurationMs / 1000).toFixed(2)}s`}
                {stats.validationSummary?.validation_passed && ` • ${stats.validationSummary.validation_passed} validated`}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-center py-4 text-gray-500">Loading...</div>
            ) : stats?.recordTypeBreakdown ? (
              <div className="space-y-6">
                {/* Record Type Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {(() => {
                    // Define consistent order and colors for record types
                    const recordTypeConfig = {
                      'BH': { color: 'bg-blue-100 text-blue-800 border-blue-200', bgColor: 'bg-blue-50', textColor: 'text-blue-600', label: 'BH', description: 'Batch Header' },
                      'DT': { color: 'bg-green-100 text-green-800 border-green-200', bgColor: 'bg-green-50', textColor: 'text-green-600', label: 'DT', description: 'Detail Transaction' },
                      'G2': { color: 'bg-purple-100 text-purple-800 border-purple-200', bgColor: 'bg-purple-50', textColor: 'text-purple-600', label: 'G2', description: 'Geographic Data' },
                      'E1': { color: 'bg-orange-100 text-orange-800 border-orange-200', bgColor: 'bg-orange-50', textColor: 'text-orange-600', label: 'E1', description: 'Extension 1' },
                      'P1': { color: 'bg-cyan-100 text-cyan-800 border-cyan-200', bgColor: 'bg-cyan-50', textColor: 'text-cyan-600', label: 'P1', description: 'Purchasing Card 1' },
                      'P2': { color: 'bg-pink-100 text-pink-800 border-pink-200', bgColor: 'bg-pink-50', textColor: 'text-pink-600', label: 'P2', description: 'Purchasing Card 2' },
                      'DR': { color: 'bg-red-100 text-red-800 border-red-200', bgColor: 'bg-red-50', textColor: 'text-red-600', label: 'DR', description: 'Detail Reversal' },
                      'AD': { color: 'bg-indigo-100 text-indigo-800 border-indigo-200', bgColor: 'bg-indigo-50', textColor: 'text-indigo-600', label: 'AD', description: 'Adjustment' },
                      'UNK': { color: 'bg-gray-100 text-gray-800 border-gray-200', bgColor: 'bg-gray-50', textColor: 'text-gray-600', label: 'UNK', description: 'Unknown' }
                    };
                    
                    const orderedTypes = Object.keys(recordTypeConfig);
                    return orderedTypes
                      .filter(type => stats.recordTypeBreakdown[type])
                      .map(type => {
                        const count = stats.recordTypeBreakdown[type];
                        const config = recordTypeConfig[type as keyof typeof recordTypeConfig];
                        
                        return (
                          <div key={type} className={`text-center rounded-lg p-4 border ${config.bgColor} ${config.color.split(' ')[2]}`}>
                            <div className={`text-2xl font-bold ${config.textColor}`}>{count.toLocaleString()}</div>
                            <div className="text-sm font-bold text-gray-700">{config.label}</div>
                            <div className="text-xs text-gray-600 mb-1">{config.description}</div>
                            <div className="text-xs text-gray-500">
                              {((count / (stats.totalRecords || 1)) * 100).toFixed(1)}%
                            </div>
                          </div>
                        );
                      });
                  })()}
                </div>

                {/* Enhanced Processing Metrics */}
                {(stats.totalTddfLines || stats.totalJsonLinesInserted || stats.performanceMetrics) && (
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3 text-gray-700">Processing Metrics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {stats.totalTddfLines && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="text-lg font-bold text-blue-700">{stats.totalTddfLines.toLocaleString()}</div>
                          <div className="text-xs text-blue-600">TDDF Lines Read</div>
                        </div>
                      )}
                      {stats.totalJsonLinesInserted && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-lg font-bold text-green-700">{stats.totalJsonLinesInserted.toLocaleString()}</div>
                          <div className="text-xs text-green-600">JSON Lines Inserted</div>
                        </div>
                      )}
                      {stats.performanceMetrics?.records_per_second && (
                        <div className="bg-purple-50 rounded-lg p-3">
                          <div className="text-lg font-bold text-purple-700">{parseFloat(stats.performanceMetrics.records_per_second).toFixed(1)}</div>
                          <div className="text-xs text-purple-600">Records/Second</div>
                        </div>
                      )}
                      {stats.performanceMetrics?.memory_usage_mb && (
                        <div className="bg-orange-50 rounded-lg p-3">
                          <div className="text-lg font-bold text-orange-700">{parseFloat(stats.performanceMetrics.memory_usage_mb).toFixed(1)} MB</div>
                          <div className="text-xs text-orange-600">Memory Used</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Validation Summary */}
                {stats.validationSummary && Object.keys(stats.validationSummary).length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3 text-gray-700">Validation Results</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {stats.validationSummary.validation_passed && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-lg font-bold text-green-700">{stats.validationSummary.validation_passed.toLocaleString()}</div>
                          <div className="text-xs text-green-600">Records Validated</div>
                        </div>
                      )}
                      {stats.validationSummary.validation_failed !== undefined && (
                        <div className="bg-red-50 rounded-lg p-3">
                          <div className="text-lg font-bold text-red-700">{stats.validationSummary.validation_failed}</div>
                          <div className="text-xs text-red-600">Validation Failures</div>
                        </div>
                      )}
                      {stats.validationSummary.row_by_row_validation && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="text-lg font-bold text-blue-700">✓</div>
                          <div className="text-xs text-blue-600">Row-by-Row Validation</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">No record type data available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Tddf1Page;