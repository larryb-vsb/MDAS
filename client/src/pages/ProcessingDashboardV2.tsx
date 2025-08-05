import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  RefreshCw, 
  Database, 
  Activity, 
  Clock, 
  TrendingUp, 
  FileJson, 
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import RefreshStatusIndicator from '@/components/shared/RefreshStatusIndicator';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface UploaderStats {
  totalUploads: number;
  completedUploads: number;
  warningUploads: number;
  activeUploads: number;
  byPhase: Record<string, number>;
  storageFileCount: number;
  sessionStats: {
    activeSessions: number;
    completedSessions: number;
    avgFilesPerSession: number;
  };
}

interface JsonbStats {
  totalRecords: number;
  recordTypes: Record<string, number>;
  processingTime: {
    avgTimePerFile: number;
    totalProcessingTime: number;
    recordsPerSecond: number;
  };
  dataVolume: {
    totalFileSize: number;
    avgFileSize: number;
    totalLines: number;
  };
}

interface PerformanceMetrics {
  queryPerformance: {
    avgResponseTime: number;
    cacheHitRate: number;
    queriesPerMinute: number;
  };
  systemHealth: {
    memoryUsage: number;
    diskUsage: number;
    activeConnections: number;
  };
  recentActivity: Array<{
    timestamp: string;
    action: string;
    recordCount: number;
    processingTime: number;
  }>;
}

export default function ProcessingDashboardV2() {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const queryClient = useQueryClient();
  const [tableStatus, setTableStatus] = useState<any>(null);
  const [showTableManager, setShowTableManager] = useState(false);

  // Fetch processing table status first
  const { data: tableStatusData, isLoading: tableStatusLoading } = useQuery({
    queryKey: ['/api/processing/table-status'],
    staleTime: 60000,
    retry: 1
  });

  // Update table status when data changes
  React.useEffect(() => {
    if (tableStatusData) {
      setTableStatus(tableStatusData);
      setShowTableManager(!(tableStatusData as any)?.allHealthy);
    }
  }, [tableStatusData]);

  // Fetch uploader statistics - only if tables are healthy
  const { data: uploaderStats, refetch: refetchUploader, isLoading: uploaderLoading, error: uploaderError } = useQuery<UploaderStats>({
    queryKey: ['/api/uploader/dashboard-stats'],
    refetchInterval: 30000, // 30 seconds
    enabled: tableStatus?.allHealthy !== false
  });

  // Fetch JSONB statistics
  const { data: jsonbStats, refetch: refetchJsonb, isLoading: jsonbLoading, error: jsonbError } = useQuery<JsonbStats>({
    queryKey: ['/api/uploader/jsonb-stats'],
    refetchInterval: 30000,
    enabled: tableStatus?.allHealthy !== false
  });

  // Fetch performance metrics
  const { data: performanceMetrics, refetch: refetchPerformance, isLoading: performanceLoading, error: performanceError } = useQuery<PerformanceMetrics>({
    queryKey: ['/api/uploader/performance-metrics'],
    refetchInterval: 60000, // 1 minute
    enabled: tableStatus?.allHealthy !== false
  });

  // Fetch real-time processing stats (fallback for table issues)
  const { data: realTimeStats, isLoading: realTimeLoading, error: realTimeError } = useQuery({
    queryKey: ['/api/processing/real-time-stats'],
    staleTime: 15000,
    refetchInterval: 15000,
    retry: 1
  });

  // Fetch global table usage status
  const { data: tableUsageStatus, isLoading: tableUsageStatusLoading } = useQuery({
    queryKey: ['/api/table-usage/status'],
    staleTime: 30000,
    refetchInterval: 30000
  });

  // Fetch cached table usage data
  const { data: tableUsageData, isLoading: tableUsageLoading, refetch: refetchTableUsage } = useQuery({
    queryKey: ['/api/table-usage/cached'],
    staleTime: 60000,
    enabled: (tableUsageStatus as any)?.hasCache || false
  });

  // Create missing tables mutation
  const { mutate: createMissingTables, isPending: isCreatingTables } = useMutation({
    mutationFn: async (tables: any[]) => {
      const response = await apiRequest('/api/processing/create-missing-tables', {
        method: 'POST',
        body: { tables }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing/table-status'] });
      setShowTableManager(false);
    }
  });

  // Table usage scan mutation
  const { mutate: scanTableUsage, isPending: isScanningTables } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/table-usage/scan', {
        method: 'POST'
      });
      return response;
    },
    onSuccess: (data: any) => {
      console.log('[TABLE-USAGE] Scan completed:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/table-usage/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/table-usage/cached'] });
      toast({
        title: "Table Usage Scan Complete",
        description: `Scanned ${data.totalTables} tables (${data.totalSizeGB} GB total)`
      });
    },
    onError: (error) => {
      console.error('[TABLE-USAGE] Scan failed:', error);
      toast({
        title: "Scan Failed",
        description: "Failed to scan table usage. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Cache refresh mutation - builds pre-cached data like style guide
  const { mutate: refreshCache, isPending: isRefreshing } = useMutation({
    mutationFn: async () => {
      console.log('[V2-DASHBOARD] Manual cache refresh triggered...');
      const response = await fetch('/api/uploader/refresh-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Cache refresh failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      console.log('[V2-DASHBOARD] Cache refresh completed:', data);
      // Invalidate all queries to fetch fresh cached data
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/jsonb-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/performance-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/processing/real-time-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/table-usage/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/table-usage/cached'] });
      setLastRefresh(new Date());
    },
    onError: (error) => {
      console.error('[V2-DASHBOARD] Cache refresh failed:', error);
    }
  });

  const { toast } = useToast();

  const handleManualRefresh = () => {
    refreshCache();
  };

  const handleCreateMissingTables = () => {
    if (tableStatus?.tables) {
      const tablesToCreate = tableStatus.tables.filter((t: any) => !t.exists || (t.missingColumns && t.missingColumns.length > 0));
      createMissingTables(tablesToCreate);
    }
  };

  // Helper functions for chart colors
  const getPhaseColor = (phase: string): string => {
    const colors: Record<string, string> = {
      started: '#3b82f6',
      uploading: '#8b5cf6', 
      uploaded: '#06b6d4',
      identified: '#f97316',
      encoding: '#ec4899',
      completed: '#10b981',
      warning: '#ef4444'
    };
    return colors[phase] || '#6b7280';
  };

  const getRecordTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      DT: '#3b82f6',
      BH: '#10b981', 
      P1: '#f97316',
      P2: '#8b5cf6',
      G2: '#06b6d4',
      E1: '#ef4444'
    };
    return colors[type] || '#6b7280';
  };

  // Prepare chart data for upload phases
  const phaseChartData = uploaderStats ? Object.entries(uploaderStats.byPhase).map(([phase, count]) => ({
    phase: phase.charAt(0).toUpperCase() + phase.slice(1),
    count,
    color: getPhaseColor(phase)
  })) : [];

  // Prepare chart data for record types
  const recordTypeChartData = jsonbStats ? Object.entries(jsonbStats.recordTypes).map(([type, count]) => ({
    type,
    count,
    color: getRecordTypeColor(type)
  })) : [];

  return (
    <MainLayout>
      <div className="space-y-4 p-4 max-w-full">
        {/* Header - Mobile First */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Processing Dashboard V2</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Session-based uploads & JSONB processing metrics
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="text-xs text-muted-foreground order-2 sm:order-1">
              Last updated: {format(lastRefresh, 'HH:mm:ss')}
            </div>
            <Button 
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              size="sm"
              className="order-1 sm:order-2"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isRefreshing ? 'Building Cache...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Table Status Management */}
        {showTableManager && tableStatus && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-orange-600" />
                Processing Tables Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-orange-700">
                  {tableStatus.summary}
                </div>
                
                {tableStatus.tables && (
                  <div className="grid gap-2">
                    {tableStatus.tables.map((table: any) => (
                      <div key={table.tableName} className="flex items-center justify-between p-2 bg-white rounded border">
                        <div className="flex items-center gap-2">
                          <Badge variant={table.exists ? "default" : "destructive"}>
                            {table.exists ? "Exists" : "Missing"}
                          </Badge>
                          <span className="text-sm font-mono">{table.tableName}</span>
                          {table.missingColumns && table.missingColumns.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {table.missingColumns.length} missing columns
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {table.exists && table.rowCount !== undefined && `${table.rowCount.toLocaleString()} rows`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleCreateMissingTables}
                    disabled={isCreatingTables}
                    size="sm"
                  >
                    {isCreatingTables ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Create Missing Tables/Columns
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowTableManager(false)}
                  >
                    Hide
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Global Table Usage Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Global Table Usage
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => scanTableUsage()}
                  disabled={isScanningTables}
                  size="sm"
                  variant="outline"
                >
                  {isScanningTables ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isScanningTables ? 'Scanning...' : 'Manual Scan'}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tableUsageStatus && !(tableUsageStatus as any).hasCache && (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No scan data available</p>
                <p className="text-sm mb-4">Run a manual scan to see table usage information</p>
                <Button 
                  onClick={() => scanTableUsage()}
                  disabled={isScanningTables}
                  size="sm"
                >
                  {isScanningTables ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isScanningTables ? 'Scanning Tables...' : 'Start Manual Scan'}
                </Button>
              </div>
            )}

            {tableUsageData && (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {(tableUsageData as any).totalTables}
                    </div>
                    <div className="text-sm text-blue-600">Total Tables</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {(tableUsageData as any).totalSizeGB < 1 
                        ? `${(tableUsageData as any).totalSizeMB} MB`
                        : `${(tableUsageData as any).totalSizeGB} GB`
                      }
                    </div>
                    <div className="text-sm text-green-600">Total Size</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {(tableUsageStatus as any)?.environment || 'Unknown'}
                    </div>
                    <div className="text-sm text-purple-600">Environment</div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {(tableUsageData as any).scanAge ? `${Math.round((tableUsageData as any).scanAge / 60)}m` : 'Just now'}
                    </div>
                    <div className="text-sm text-orange-600">Scan Age</div>
                  </div>
                </div>

                {/* Last Scan Info */}
                <div className="text-sm text-muted-foreground">
                  Last scan: {format(new Date((tableUsageData as any).lastScan), 'MMM dd, yyyy HH:mm:ss')}
                  {(tableUsageData as any).scanAge && ` (${Math.round((tableUsageData as any).scanAge / 60)} minutes ago)`}
                </div>

                {/* Top Tables by Size */}
                <div>
                  <h4 className="font-medium mb-3">Largest Tables</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(tableUsageData as any).tables
                      ?.sort((a: any, b: any) => b.sizeBytes - a.sizeBytes)
                      .slice(0, 10)
                      .map((table: any) => (
                        <div key={table.tableName} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex-1">
                            <div className="font-mono text-sm">{table.tableName}</div>
                            <div className="text-xs text-muted-foreground">
                              {table.rowCount.toLocaleString()} rows
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              {table.sizeGB > 1 
                                ? `${table.sizeGB} GB`
                                : `${table.sizeMB} MB`
                              }
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {table.sizeBytes.toLocaleString()} bytes
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Key Metrics Grid - Mobile Responsive */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-lg font-bold text-blue-600">
                  {uploaderStats?.totalUploads || 0}
                </div>
                <div className="text-xs text-muted-foreground">Total Files</div>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <div>
                <div className="text-lg font-bold text-green-600">
                  {uploaderStats?.completedUploads || 0}
                </div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-purple-500" />
              <div>
                <div className="text-lg font-bold text-purple-600">
                  {jsonbStats?.totalRecords.toLocaleString() || 0}
                </div>
                <div className="text-xs text-muted-foreground">JSONB Records</div>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              <div>
                <div className="text-lg font-bold text-orange-600">
                  {jsonbStats?.processingTime.recordsPerSecond.toFixed(0) || 0}
                </div>
                <div className="text-xs text-muted-foreground">Records/sec</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Charts Section - Mobile First Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upload Phases Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Upload Phases Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={phaseChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="phase" 
                      fontSize={12}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {phaseChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Record Types Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                JSONB Record Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={recordTypeChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {recordTypeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Metrics - Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Session Statistics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Session Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Active Sessions</span>
                <Badge variant="outline">{uploaderStats?.sessionStats.activeSessions || 0}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Completed Sessions</span>
                <Badge variant="outline">{uploaderStats?.sessionStats.completedSessions || 0}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Avg Files/Session</span>
                <Badge variant="outline">{uploaderStats?.sessionStats.avgFilesPerSession.toFixed(1) || '0.0'}</Badge>
              </div>
              <div className="pt-2">
                <div className="text-xs text-muted-foreground mb-1">Storage Utilization</div>
                <Progress 
                  value={uploaderStats ? (uploaderStats.totalUploads / uploaderStats.storageFileCount) * 100 : 0} 
                  className="h-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {uploaderStats?.totalUploads || 0} / {uploaderStats?.storageFileCount || 0} files
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Processing Performance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Processing Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Avg Processing Time</span>
                <Badge variant="outline">
                  {jsonbStats?.processingTime.avgTimePerFile.toFixed(2) || 0}s
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Processing Time</span>
                <Badge variant="outline">
                  {formatDuration(jsonbStats?.processingTime.totalProcessingTime || 0)}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total File Size</span>
                <Badge variant="outline">
                  {formatFileSize(jsonbStats?.dataVolume.totalFileSize || 0)}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Lines Processed</span>
                <Badge variant="outline">
                  {jsonbStats?.dataVolume.totalLines.toLocaleString() || 0}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">System Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Cache Hit Rate</span>
                  <Badge variant="outline">
                    {performanceMetrics?.queryPerformance.cacheHitRate.toFixed(1) || 0}%
                  </Badge>
                </div>
                <Progress 
                  value={performanceMetrics?.queryPerformance.cacheHitRate || 0} 
                  className="h-2"
                />
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Avg Response Time</span>
                <Badge variant="outline">
                  {performanceMetrics?.queryPerformance.avgResponseTime.toFixed(0) || 0}ms
                </Badge>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Queries/Min</span>
                <Badge variant="outline">
                  {performanceMetrics?.queryPerformance.queriesPerMinute || 0}
                </Badge>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Active Connections</span>
                <Badge variant="outline">
                  {performanceMetrics?.systemHealth.activeConnections || 0}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Processing Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {performanceMetrics?.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{activity.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(activity.timestamp), 'HH:mm:ss')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{activity.recordCount.toLocaleString()} records</div>
                    <div className="text-xs text-muted-foreground">{activity.processingTime}ms</div>
                  </div>
                </div>
              )) || (
                <div className="text-center text-muted-foreground py-4">
                  No recent activity
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

// Helper functions
function getPhaseColor(phase: string): string {
  const colors: Record<string, string> = {
    started: '#6B7280',
    uploading: '#3B82F6',
    uploaded: '#10B981',
    identified: '#8B5CF6',
    encoding: '#F59E0B',
    encoded: '#059669',
    processing: '#DC2626',
    completed: '#059669',
    warning: '#F59E0B',
    failed: '#DC2626',
    error: '#DC2626'
  };
  return colors[phase] || '#6B7280';
}

function getRecordTypeColor(type: string): string {
  const colors: Record<string, string> = {
    DT: '#3B82F6',
    BH: '#10B981',
    P1: '#F59E0B',
    P2: '#EF4444',
    E1: '#8B5CF6',
    G2: '#06B6D4',
    AD: '#84CC16',
    DR: '#F97316',
    CK: '#6366F1',
    LG: '#EC4899',
    GE: '#14B8A6'
  };
  return colors[type] || '#6B7280';
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}