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
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import MainLayout from '@/components/layout/MainLayout';

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
            <h1 className="text-3xl font-bold tracking-tight">Merchant Management</h1>
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

        {/* Key Performance Indicators */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Key Performance Indicators</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
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
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Failed to load dashboard metrics</p>
              <Button
                onClick={() => refreshMutation.mutate()}
                className="mt-2"
                variant="outline"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
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