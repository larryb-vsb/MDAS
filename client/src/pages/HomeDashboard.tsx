import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Users, 
  Calendar,
  DollarSign,
  Activity,
  BarChart3,
  Building2,
  Terminal,
  CreditCard,
  TrendingUp,
  RefreshCw,
  Database,
  Clock,
  Upload,
  Search,
  Lightbulb,
  Cloud,
  HardDrive,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import MainLayout from '@/components/layout/MainLayout';
import { Link } from 'wouter';

// Interface for system information
interface SystemInfo {
  environment: {
    name: string;
    isProd: boolean;
    isDev: boolean;
    isTest: boolean;
  };
  storage: {
    fallbackMode: boolean;
    storageType: string;
    type: string;
  };
  version: {
    appVersion: string;
    buildDate: string;
  };
  uptime: number;
}

// Interface for dashboard metrics with cache metadata
interface DashboardMetrics {
  merchants: {
    total: number;
    ach: number;
    mmc: number;
  };
  newMerchants30Day: {
    total: number;
    ach: number;
    mmc: number;
  };
  monthlyProcessingAmount: {
    ach: string;
    mmc: string;
  };
  todayTransactions: {
    total: number;
    ach: number;
    mmc: number;
  };
  avgTransValue: {
    total: number;
    ach: number;
    mmc: number;
  };
  dailyProcessingAmount: {
    ach: string;
    mmc: string;
  };
  todayTotalTransaction: {
    ach: string;
    mmc: string;
  };
  totalRecords: {
    ach: string;
    mmc: string;
  };
  totalTerminals: {
    total: number;
    ach: number;
    mmc: number;
  };
  cacheMetadata?: {
    lastRefreshed: string;
    refreshedBy: string;
    buildTime: number;
    fromCache: boolean;
  };
}

// Metric card component with ACH/MMC breakdown and hover tooltips
interface MetricCardProps {
  title: string;
  total?: number | string;
  ach?: number | string;
  mmc?: number | string;
  icon: React.ReactNode;
  achTooltip?: string;
  mmcTooltip?: string;
  format?: 'number' | 'currency';
}

function MetricCard({ title, total, ach, mmc, icon, achTooltip, mmcTooltip, format = 'number' }: MetricCardProps) {
  const formatValue = (value: number | string | undefined) => {
    if (value === undefined) return '0';
    if (format === 'currency') {
      return typeof value === 'string' ? value : `$${value.toLocaleString()}`;
    }
    return typeof value === 'string' ? value : value.toLocaleString();
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-4 w-4 text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {/* Total Value */}
        {total !== undefined && (
          <div className="text-2xl font-bold mb-3">
            {formatValue(total)}
          </div>
        )}
        
        {/* ACH/MMC Breakdown */}
        <div className="space-y-2">
          {ach !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between items-center text-sm cursor-help">
                    <span className="text-blue-600 font-medium">ACH</span>
                    <span className="font-medium">{formatValue(ach)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{achTooltip || 'from csv files'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {mmc !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between items-center text-sm cursor-help">
                    <span className="text-green-600 font-medium">MMC (TDDF)</span>
                    <span className="font-medium">{formatValue(mmc)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{mmcTooltip || 'from TDDF and csv update'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomeDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pre-cached dashboard metrics
  const { data: dashboardMetrics, isLoading, error } = useQuery<DashboardMetrics>({
    queryKey: ['/api/dashboard/cached-metrics'],
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000, // 30 minutes - data refreshed only when needed
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  // Fetch system information for environment badge
  const { data: systemInfo } = useQuery<SystemInfo>({
    queryKey: ['/api/system/info'],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Manual refresh mutation
  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('/api/dashboard/refresh-cache', {
      method: 'POST',
    }),
    onMutate: () => {
      setIsRefreshing(true);
    },
    onSuccess: (data: any) => {
      // Invalidate and refetch the cached metrics
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/cached-metrics'] });
      
      toast({
        title: "Dashboard Refreshed",
        description: `Cache updated in ${data.buildTime}ms. Fresh data loaded.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh dashboard cache. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsRefreshing(false);
    },
  });

  // Fallback data while loading
  const fallbackMetrics: DashboardMetrics = {
    merchants: { total: 0, ach: 0, mmc: 0 },
    newMerchants30Day: { total: 0, ach: 0, mmc: 0 },
    monthlyProcessingAmount: { ach: '$0.00', mmc: '$0.00' },
    todayTransactions: { total: 0, ach: 0, mmc: 0 },
    avgTransValue: { total: 0, ach: 0, mmc: 0 },
    dailyProcessingAmount: { ach: '$0.00', mmc: '$0.00' },
    todayTotalTransaction: { ach: '$0.00', mmc: '$0.00' },
    totalRecords: { ach: '0', mmc: '0' },
    totalTerminals: { total: 0, ach: 0, mmc: 0 }
  };

  const metrics = dashboardMetrics || fallbackMetrics;

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        {/* Header with Refresh Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">Merchant Management</h1>
              {/* Environmental Badge - Always show with fallback */}
              <Badge 
                variant="outline" 
                className={
                  systemInfo?.environment?.name === 'production' 
                    ? "bg-orange-100 text-orange-800 border-orange-300 font-semibold px-3 py-1 shadow-sm"
                    : "bg-blue-100 text-blue-800 border-blue-300 font-semibold px-3 py-1 shadow-sm"
                }
              >
                {systemInfo?.environment?.name === 'production' ? '🟠 Production' : '🔵 Development'}
              </Badge>
              {/* Loading badge if system info not loaded yet */}
              {!systemInfo && (
                <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 animate-pulse px-3 py-1">
                  ⚪ Loading...
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Manage your merchants, upload data, and view statistics
            </p>
            {/* Cache Status */}
            {metrics?.cacheMetadata && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <Database className="h-3 w-3" />
                <span>
                  Last refreshed: {new Date(metrics.cacheMetadata.lastRefreshed).toLocaleDateString()} {new Date(metrics.cacheMetadata.lastRefreshed).toLocaleTimeString()}
                </span>
                {metrics.cacheMetadata.fromCache && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Cached
                  </Badge>
                )}
              </div>
            )}
          </div>
          
          {/* Refresh Button */}
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={isRefreshing || refreshMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${(isRefreshing || refreshMutation.isPending) ? 'animate-spin' : ''}`} />
            {isRefreshing || refreshMutation.isPending ? 'Refreshing...' : 'Refresh Data'}
          </Button>
        </div>

        {/* Loading/Error State Banner */}
        {(isLoading || error || !dashboardMetrics) && (
          <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {isLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-800">Loading Dashboard Data...</p>
                      <p className="text-sm text-blue-600">
                        Building comprehensive metrics from database - typically takes 30-180 seconds for complete data compilation
                      </p>
                    </div>
                  </>
                ) : error ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <div className="flex-1">
                      <p className="font-medium text-red-800">Failed to Load Dashboard Data</p>
                      <p className="text-sm text-red-600">
                        Unable to connect to dashboard API. Click "Refresh Data" to retry.
                      </p>
                    </div>
                    <Button
                      onClick={() => refreshMutation.mutate()}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry Now
                    </Button>
                  </>
                ) : (
                  <>
                    <Database className="h-5 w-5 text-amber-600" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-800">Dashboard Cache Building...</p>
                      <p className="text-sm text-amber-600">
                        First-time setup detected. Cache is being built from {metrics.merchants?.total || 0} merchants and transaction data.
                      </p>
                    </div>
                    <Button
                      onClick={() => refreshMutation.mutate()}
                      size="sm"
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Build Cache
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key Performance Indicators */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Key Performance Indicators</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="animate-pulse">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-[80px] mb-3" />
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-4 w-[40px]" />
                        <Skeleton className="h-4 w-[60px]" />
                      </div>
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-4 w-[70px]" />
                        <Skeleton className="h-4 w-[60px]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Merchants Total */}
            <MetricCard
              title="Merchants Total"
              total={metrics.merchants.total}
              ach={metrics.merchants.ach}
              mmc={metrics.merchants.mmc}
              icon={<Users className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />

            {/* New Merchants (30 day) */}
            <MetricCard
              title="New Merchant (30day)"
              total={metrics.newMerchants30Day.total}
              ach={metrics.newMerchants30Day.ach}
              mmc={metrics.newMerchants30Day.mmc}
              icon={<Calendar className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />

            {/* Monthly Processing Amount */}
            <MetricCard
              title="Monthly Processing Amount"
              ach={metrics.monthlyProcessingAmount.ach}
              mmc={metrics.monthlyProcessingAmount.mmc}
              icon={<DollarSign className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
              format="currency"
            />

            {/* Today's Transactions Processed */}
            <MetricCard
              title="Today's Transaction Processed"
              total={metrics.todayTransactions.total}
              ach={metrics.todayTransactions.ach}
              mmc={metrics.todayTransactions.mmc}
              icon={<Activity className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />
          </div>
          )}
        </div>

        {/* Additional Metrics */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Additional Metrics</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-4 w-4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-[80px] mb-3" />
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-4 w-[40px]" />
                        <Skeleton className="h-4 w-[60px]" />
                      </div>
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-4 w-[70px]" />
                        <Skeleton className="h-4 w-[60px]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Average Transaction Value */}
            <MetricCard
              title="Avg Trans Value"
              total={metrics.avgTransValue.total}
              ach={metrics.avgTransValue.ach}
              mmc={metrics.avgTransValue.mmc}
              icon={<BarChart3 className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />

            {/* Daily Processing Amount */}
            <MetricCard
              title="Daily Processing Amount"
              ach={metrics.dailyProcessingAmount.ach}
              mmc={metrics.dailyProcessingAmount.mmc}
              icon={<DollarSign className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
              format="currency"
            />

            {/* Today's Total Transaction */}
            <MetricCard
              title="Todays Total Transaction"
              ach={metrics.todayTotalTransaction.ach}
              mmc={metrics.todayTotalTransaction.mmc}
              icon={<CreditCard className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
              format="currency"
            />

            {/* Total Records */}
            <MetricCard
              title="Total Records"
              ach={metrics.totalRecords.ach}
              mmc={metrics.totalRecords.mmc}
              icon={<Building2 className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />

            {/* Total Terminals */}
            <MetricCard
              title="Total Terminals"
              total={metrics.totalTerminals.total}
              ach={metrics.totalTerminals.ach}
              mmc={metrics.totalTerminals.mmc}
              icon={<Terminal className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />
          </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}