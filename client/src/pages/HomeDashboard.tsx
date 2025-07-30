import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  TrendingUp
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

// Interface for dashboard metrics
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
  // Fetch real dashboard metrics from API
  const { data: dashboardMetrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['/api/dashboard/metrics'],
    refetchInterval: 30000, // Refresh every 30 seconds
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
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Merchant Management</h1>
          <p className="text-muted-foreground">
            Manage your merchants, upload data, and view statistics
          </p>
        </div>

        {/* Key Performance Indicators */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Key Performance Indicators</h2>
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
        </div>

        {/* Additional Metrics */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Additional Metrics</h2>
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
        </div>
      </div>
    </MainLayout>
  );
}