import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, TrendingUp, DollarSign, Calendar, Users, Upload, Database, Activity, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface ChartData {
  dailyData: Array<{
    date: string;
    transactionAmount: number;
    authAmount: number;
    transactionCount: number;
    uniqueMerchants: number;
  }>;
  merchantTrends: Array<{
    merchantName: string;
    merchantNumber: string;
    totalAmount: number;
    transactionCount: number;
    avgAmount: number;
  }>;
  authAmountTrends: Array<{
    date: string;
    transactionAmount: number;
    authAmount: number;
    difference: number;
    percentDifference: number;
  }>;
  cardTypeTrends: Array<{
    cardType: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }>;
  summary: {
    totalRecords: number;
    totalTransactionAmount: number;
    totalAuthAmount: number;
    uniqueMerchants: number;
    dateRange: {
      startDate: string;
      endDate: string;
    };
    processingTimeMs: number;
    lastRefreshDatetime: string;
  };
}

// TDDF Processing interfaces matching actual API responses
interface DashboardStats {
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
  lastNewDataDate: string;
  lastUpdated: string;
}

interface ProcessingStatus {
  activeProcessing: boolean;
  queuedFiles: number;
  recentlyCompleted: number;
  systemStatus: string;
  tddfRecordsCount: number;
  lastActivity: string;
  timestamp: string;
}

interface JsonbStats {
  totalRecords: number;
  recordTypes: Record<string, number>;
  lastUpdated: string;
}

interface TddfApiMonitoring {
  stats: {
    total_requests: string;
    avg_response_time: string;
    success_rate: string;
    error_rate: string;
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
  lastUpdated: string;
}

const CARD_TYPE_COLORS = {
  'VISA': '#1f4e79',
  'MC': '#eb001b',
  'AMEX': '#006fcf',
  'DISC': '#ff6000',
  'Other': '#64748b'
};

export default function ChartsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch charts data
  const { data: chartsData, isLoading, error } = useQuery<ChartData>({
    queryKey: ['/api/charts/60day-trends'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Fetch TDDF upload statistics
  const { data: uploadStats, isLoading: uploadStatsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/uploader/dashboard-stats'],
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 2, // Auto-refresh every 2 minutes
  });

  // Fetch JSONB processing statistics
  const { data: jsonbStats, isLoading: jsonbStatsLoading } = useQuery<JsonbStats>({
    queryKey: ['/api/uploader/jsonb-stats'],
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 2, // Auto-refresh every 2 minutes
  });

  // Fetch processing status
  const { data: processingStatus, isLoading: processingStatusLoading } = useQuery<ProcessingStatus>({
    queryKey: ['/api/uploader/processing-status'],
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 30, // Auto-refresh every 30 seconds
  });

  // Fetch TDDF API monitoring data
  const { data: tddfApiMonitoring, isLoading: tddfApiLoading } = useQuery<TddfApiMonitoring>({
    queryKey: ['/api/tddf-api/monitoring'],
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 2, // Auto-refresh every 2 minutes
  });

  // Fetch performance metrics for recent activity
  const { data: performanceMetrics, isLoading: performanceMetricsLoading } = useQuery<PerformanceMetrics>({
    queryKey: ['/api/uploader/performance-metrics'],
    staleTime: 1000 * 60 * 1, // 1 minute
    refetchInterval: 1000 * 60 * 1, // Auto-refresh every 1 minute
  });

  // Check if any TDDF processing data is loading
  const tddfDataLoading = uploadStatsLoading || jsonbStatsLoading || processingStatusLoading || tddfApiLoading || performanceMetricsLoading;

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('/api/charts/refresh', {
      method: 'POST',
      body: JSON.stringify({ requestedBy: 'admin' })
    }),
    onMutate: () => {
      setIsRefreshing(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charts/60day-trends'] });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/jsonb-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/processing-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf-api/monitoring'] });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/performance-metrics'] });
      toast({
        title: "Charts Refreshed",
        description: "All charts and TDDF processing data have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh charts data.",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsRefreshing(false);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading 60-day trend charts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Charts</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to load charts data. Please try refreshing the page.</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/charts/60day-trends'] })}
              className="mt-4"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!chartsData) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Data Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No TDDF data available for charts. Please ensure TDDF files have been uploaded and processed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { dailyData, merchantTrends, authAmountTrends, cardTypeTrends, summary } = chartsData;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TDDF Analytics Charts</h1>
          <p className="text-muted-foreground mt-1">
            60-day trends and statistics from TDDF DT records
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            Last updated: {format(new Date(summary.lastRefreshDatetime), 'MMM d, yyyy h:mm a')}
          </Badge>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={isRefreshing}
            size="sm"
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalRecords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              From {format(new Date(summary.dateRange.startDate), 'MMM d')} to {format(new Date(summary.dateRange.endDate), 'MMM d')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaction Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${summary.totalTransactionAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Auth: ${summary.totalAuthAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Merchants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.uniqueMerchants}</div>
            <p className="text-xs text-muted-foreground">
              Active in 60 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Freshness</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.processingTimeMs}ms</div>
            <p className="text-xs text-muted-foreground">
              Query processing time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Transaction Trends</CardTitle>
          <CardDescription>Transaction and authorization amounts over the last 60 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => format(new Date(value), 'MMM d')}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                  formatter={(value: number, name: string) => [
                    name === 'transactionCount' ? value.toLocaleString() : `$${value.toLocaleString()}`,
                    name === 'transactionAmount' ? 'Transaction Amount' :
                    name === 'authAmount' ? 'Auth Amount' :
                    name === 'transactionCount' ? 'Transaction Count' : 'Unique Merchants'
                  ]}
                />
                <Legend />
                <Line type="monotone" dataKey="transactionAmount" stroke="#8884d8" name="Transaction Amount" strokeWidth={2} />
                <Line type="monotone" dataKey="authAmount" stroke="#82ca9d" name="Auth Amount" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Count and Merchant Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Transaction Count</CardTitle>
            <CardDescription>Number of transactions processed each day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => format(new Date(value), 'M/d')}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                    formatter={(value: number) => [value.toLocaleString(), 'Transactions']}
                  />
                  <Bar dataKey="transactionCount" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Card Type Distribution</CardTitle>
            <CardDescription>Breakdown of transactions by card type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cardTypeTrends}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ cardType, percentage }) => `${cardType} (${percentage.toFixed(1)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {cardTypeTrends.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CARD_TYPE_COLORS[entry.cardType as keyof typeof CARD_TYPE_COLORS] || CARD_TYPE_COLORS.Other} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Transactions']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Merchants */}
      <Card>
        <CardHeader>
          <CardTitle>Top Merchants by Volume</CardTitle>
          <CardDescription>Leading merchants by total transaction amount (last 60 days)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={merchantTrends.slice(0, 10)} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis 
                  dataKey="merchantName" 
                  type="category" 
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Amount']}
                />
                <Bar dataKey="totalAmount" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Auth vs Transaction Amount Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Authorization vs Transaction Amount Trends</CardTitle>
          <CardDescription>Comparison of authorized amounts vs final transaction amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={authAmountTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => format(new Date(value), 'MMM d')}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                  formatter={(value: number, name: string) => [
                    name === 'percentDifference' ? `${value.toFixed(2)}%` : `$${value.toLocaleString()}`,
                    name === 'transactionAmount' ? 'Transaction Amount' :
                    name === 'authAmount' ? 'Auth Amount' :
                    name === 'difference' ? 'Difference' : 'Percent Difference'
                  ]}
                />
                <Legend />
                <Line type="monotone" dataKey="transactionAmount" stroke="#8884d8" name="Transaction Amount" strokeWidth={2} />
                <Line type="monotone" dataKey="authAmount" stroke="#82ca9d" name="Auth Amount" strokeWidth={2} />
                <Line type="monotone" dataKey="difference" stroke="#ffc658" name="Difference" strokeWidth={1} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* TDDF Processing Analytics Section */}
      <div className="border-t pt-8 mt-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">TDDF Processing Pipeline</h2>
            <p className="text-muted-foreground mt-1">
              Real-time file processing, Step 6 analytics, and upload statistics
            </p>
          </div>
          {tddfDataLoading && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Updating processing data...</span>
            </div>
          )}
        </div>

        {/* TDDF Processing Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Uploads</CardTitle>
              <Upload className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {uploadStats?.totalUploads?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                {uploadStats?.completedUploads || 0} completed, {uploadStats?.activeUploads || 0} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Step 6 Processing</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {processingStatus?.queuedFiles?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                {processingStatus?.recentlyCompleted || 0} completed recently
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TDDF Records</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {processingStatus?.tddfRecordsCount?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                In JSONB database
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${processingStatus?.activeProcessing ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <div className="text-lg font-bold">
                  {processingStatus?.systemStatus || 'Unknown'}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {processingStatus?.activeProcessing ? 'Currently processing' : 'System idle'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {performanceMetrics?.queryPerformance?.avgResponseTime?.toFixed(0) || '0'}ms
              </div>
              <p className="text-xs text-muted-foreground">
                {performanceMetrics?.queryPerformance?.cacheHitRate?.toFixed(1) || '0'}% cache hit
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Processing Pipeline and Record Types */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Processing Pipeline Status</CardTitle>
              <CardDescription>Files in different processing phases</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {uploadStats?.byPhase && Object.keys(uploadStats.byPhase).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(uploadStats.byPhase).map(([phase, count]) => ({
                      phase: phase.charAt(0).toUpperCase() + phase.slice(1),
                      count: count as number,
                      percentage: ((count as number) / uploadStats.totalUploads * 100)
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="phase" 
                        tick={{ fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          name === 'count' ? `${value} files` : `${value.toFixed(1)}%`,
                          name === 'count' ? 'Files in Phase' : 'Percentage'
                        ]}
                        labelFormatter={(label) => `Phase: ${label}`}
                      />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No pipeline data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Record Type Distribution</CardTitle>
              <CardDescription>Breakdown of TDDF record types in JSONB database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {jsonbStats?.recordTypes && Object.keys(jsonbStats.recordTypes).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(jsonbStats.recordTypes).map(([type, count]) => ({
                          recordType: type,
                          count: count as number,
                          percentage: ((count as number) / jsonbStats.totalRecords * 100)
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="count"
                        label={({ recordType, percentage }) => `${recordType}: ${percentage.toFixed(1)}%`}
                      >
                        {Object.entries(jsonbStats.recordTypes).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={Object.values(CARD_TYPE_COLORS)[index % Object.values(CARD_TYPE_COLORS).length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Records']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No record type data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity Timeline and System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity Timeline</CardTitle>
              <CardDescription>Latest file processing activity and uploads</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {performanceMetrics?.recentActivity && performanceMetrics.recentActivity.length > 0 ? (
                  performanceMetrics.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center justify-between border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{activity.action}</span>
                          <Badge variant="outline" className="text-xs">
                            {activity.recordCount.toLocaleString()} records
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(activity.timestamp), 'MMM d, h:mm a')} • {activity.processingTime}s processing
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`w-2 h-2 rounded-full ${activity.recordCount > 1000 ? 'bg-green-500' : activity.recordCount > 100 ? 'bg-yellow-500' : 'bg-gray-400'}`}></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    No recent activity data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Health & Performance</CardTitle>
              <CardDescription>Real-time system metrics and API performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      {performanceMetrics?.systemHealth?.memoryUsage?.toFixed(1) || '0'}%
                    </div>
                    <p className="text-xs text-muted-foreground">Memory Usage</p>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {performanceMetrics?.systemHealth?.diskUsage?.toFixed(1) || '0'}%
                    </div>
                    <p className="text-xs text-muted-foreground">Disk Usage</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-600">
                      {performanceMetrics?.systemHealth?.activeConnections || '0'}
                    </div>
                    <p className="text-xs text-muted-foreground">DB Connections</p>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-600">
                      {performanceMetrics?.queryPerformance?.queriesPerMinute?.toFixed(0) || '0'}
                    </div>
                    <p className="text-xs text-muted-foreground">Queries/Min</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">TDDF API Stats</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="text-center">
                      <div className="text-sm font-bold">
                        {tddfApiMonitoring?.stats?.success_rate || '0'}%
                      </div>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold">
                        {tddfApiMonitoring?.stats?.total_requests || '0'}
                      </div>
                      <p className="text-xs text-muted-foreground">Total Requests</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}