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

  // Fetch uploader statistics
  const { data: uploaderStats, refetch: refetchUploader } = useQuery<UploaderStats>({
    queryKey: ['/api/uploader/dashboard-stats'],
    refetchInterval: 30000, // 30 seconds
  });

  // Fetch JSONB statistics
  const { data: jsonbStats, refetch: refetchJsonb } = useQuery<JsonbStats>({
    queryKey: ['/api/uploader/jsonb-stats'],
    refetchInterval: 30000,
  });

  // Fetch performance metrics
  const { data: performanceMetrics, refetch: refetchPerformance } = useQuery<PerformanceMetrics>({
    queryKey: ['/api/uploader/performance-metrics'],
    refetchInterval: 60000, // 1 minute
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
      setLastRefresh(new Date());
    },
    onError: (error) => {
      console.error('[V2-DASHBOARD] Cache refresh failed:', error);
    }
  });

  const handleManualRefresh = () => {
    refreshCache();
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