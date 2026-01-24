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
  DollarSign,
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
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import MainLayout from '@/components/layout/MainLayout';
import { useLocation } from 'wouter';
import CacheControlWidget from '@/components/shared/CacheControlWidget';

// Interface for dashboard metrics with cache metadata
interface DashboardMetrics {
  merchants: {
    total: number;
    ach: number;
    mcc: number;
  };
  monthlyProcessingAmount: {
    total: string;
    ach: string;
    mcc: string;
  };
  totalRecords: {
    total: string;
    ach: string;
    mcc: string;
  };
  totalTerminals: {
    total: number;
    ach: number;
    mcc: number;
  };
  cacheMetadata?: {
    lastRefreshed: string;
    refreshedBy?: string;
    buildTime?: number;
    fromCache: boolean;
    recordCount?: number;
    dataChangeDetected?: boolean;
  };
}

// Interface for object storage config
interface ObjectStorageConfig {
  available: boolean;
  service: string;
  bucketName: string;
  fileCount: number;
}

// Interface for uploader dashboard metrics
interface UploaderDashboardMetrics {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  processingFiles: number;
  refreshState: 'paused' | 'green_30s' | 'blue_1min' | 'off' | 'red_issues';
  lastRefreshTime: string;
  cacheMetadata?: {
    lastRefreshed: string;
    buildTime: number;
  };
}

// Interface for duplicate finder metrics
interface DuplicateFinderMetrics {
  status: 'gray' | 'red' | 'green';
  duplicateCount: number;
  totalScanned: number;
  lastScanDate?: string;
  scanInProgress: boolean;
  cooldownUntil?: string;
}

// Interface for TDDF processing datetime
interface TddfProcessingDatetime {
  lastProcessingDatetime: string | null;
  lastProcessingDate: string | null;
  filename: string;
  recordType: string;
  createdAt: string;
  environment: string;
}

// Interface for Last Three Days data (MCC and ACH)
interface LastThreeDaysData {
  mcc: Array<{
    date: string;
    authCount: number;
    authAmount: number;
    purchaseAmount: number;
  }>;
  ach: Array<{
    date: string;
    batchCount: number;
    batchAmount: number;
  }>;
  generatedAt: string;
}

// Interface for Daily Activity data
interface DailyActivityData {
  mccActivity: Array<{
    date: string;
    batchCount: number;
    transactionCount: number;
    otherCount: number;
  }>;
  achActivity: Array<{
    date: string;
    batchCount: number;
  }>;
  generatedAt: string;
}

// Interface for Monthly Totals data (lazy loaded - last 3 months)
interface MonthlyTotalsData {
  months: Array<{
    month: string;
    monthKey: string;
    transactionAuthorizations: {
      count: number;
      amount: number;
    };
    netDeposits: {
      count: number;
      amount: number;
    };
    totalFiles: number;
    totalRecords: number;
  }>;
  generatedAt: string;
}

// Enhanced MetricCard with clickable navigation
interface ClickableMetricCardProps {
  title: string;
  total?: number | string;
  ach?: number | string;
  mcc?: number | string;
  icon: React.ReactNode;
  achTooltip?: string;
  mccTooltip?: string;
  format?: 'number' | 'currency';
  achLink?: string;
  mccLink?: string;
  terminalLink?: string;
  isClickable?: boolean;
}

function ClickableMetricCard({ 
  title, 
  total, 
  ach, 
  mcc, 
  icon, 
  achTooltip, 
  mccTooltip, 
  format = 'number',
  achLink,
  mccLink,
  terminalLink,
  isClickable = false
}: ClickableMetricCardProps) {
  const [, setLocation] = useLocation();
  
  const formatValue = (value: number | string | undefined) => {
    if (value === undefined) return '0';
    if (format === 'currency') {
      return typeof value === 'string' ? value : `$${value.toLocaleString()}`;
    }
    return typeof value === 'string' ? value : value.toLocaleString();
  };

  const hasInnerLinks = achLink || mccLink;
  
  const handleCardClick = () => {
    if (isClickable && terminalLink && !hasInnerLinks) {
      setLocation(terminalLink);
    }
  };

  const handleAchClick = (e: React.MouseEvent) => {
    if (achLink) {
      e.stopPropagation();
      setLocation(achLink);
    }
  };

  const handleMccClick = (e: React.MouseEvent) => {
    if (mccLink) {
      e.stopPropagation();
      setLocation(mccLink);
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isClickable && terminalLink && !hasInnerLinks) {
      e.preventDefault();
      setLocation(terminalLink);
    }
  };

  const isCardClickable = isClickable && terminalLink && !hasInnerLinks;
  const cardClassName = isCardClickable
    ? "h-full cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    : "h-full";

  return (
    <Card 
      className={cardClassName} 
      onClick={handleCardClick}
      role={isCardClickable ? "button" : undefined}
      tabIndex={isCardClickable ? 0 : undefined}
      onKeyDown={isCardClickable ? handleCardKeyDown : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
          {isClickable && <ExternalLink className="h-3 w-3 ml-1 inline" />}
        </CardTitle>
        <div className="h-4 w-4 text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {/* Total Value */}
        {total !== undefined && (
          <div className="font-bold mb-3 text-[20px]">
            {formatValue(total)}
          </div>
        )}
        
        {/* ACH/MMC Breakdown with Click Handlers */}
        <div className="space-y-2">
          {ach !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div 
                    className={`flex justify-between items-center text-sm p-1 rounded ${achLink ? 'cursor-pointer hover:bg-blue-50' : 'cursor-help'}`}
                    onClick={achLink ? handleAchClick : undefined}
                    role={achLink ? "button" : undefined}
                    tabIndex={achLink ? 0 : undefined}
                    onKeyDown={achLink ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleAchClick(e as unknown as React.MouseEvent); } } : undefined}
                  >
                    <span className="text-blue-600 font-medium">ACH</span>
                    <span className="font-medium">{formatValue(ach)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{achTooltip || 'ACH data'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {mcc !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div 
                    className={`flex justify-between items-center text-sm p-1 rounded ${mccLink ? 'cursor-pointer hover:bg-green-50' : 'cursor-help'}`}
                    onClick={mccLink ? handleMccClick : undefined}
                    role={mccLink ? "button" : undefined}
                    tabIndex={mccLink ? 0 : undefined}
                    onKeyDown={mccLink ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleMccClick(e as unknown as React.MouseEvent); } } : undefined}
                  >
                    <span className="text-green-600 font-medium">MCC</span>
                    <span className="font-medium">{formatValue(mcc)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{mccTooltip || 'MCC data'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Uploader Dashboard Widget
function UploaderDashboardWidget() {
  const [refreshState, setRefreshState] = useState<'paused' | 'green_30s' | 'blue_1min' | 'off' | 'red_issues'>('paused');

  const { data: uploaderMetrics, isLoading } = useQuery<UploaderDashboardMetrics>({
    queryKey: ['/api/uploader/dashboard-metrics'],
    refetchInterval: refreshState === 'green_30s' ? 30000 : refreshState === 'blue_1min' ? 60000 : false,
  });

  const toggleRefreshState = () => {
    const states: Array<'paused' | 'green_30s' | 'blue_1min' | 'off' | 'red_issues'> = 
      ['paused', 'green_30s', 'blue_1min', 'off', 'red_issues'];
    const currentIndex = states.indexOf(refreshState);
    const nextIndex = (currentIndex + 1) % states.length;
    setRefreshState(states[nextIndex]);
  };

  const getRefreshIcon = () => {
    switch (refreshState) {
      case 'green_30s': return <Play className="h-4 w-4 text-green-500" />;
      case 'blue_1min': return <Play className="h-4 w-4 text-blue-500" />;
      case 'off': return <Pause className="h-4 w-4 text-gray-500" />;
      case 'red_issues': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Lightbulb className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getRefreshText = () => {
    switch (refreshState) {
      case 'green_30s': return 'Active (30s)';
      case 'blue_1min': return 'Active (1min)';
      case 'off': return 'Off';
      case 'red_issues': return 'Issues';
      default: return 'Paused';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          MMS Uploader Dashboard
        </CardTitle>
        <Upload className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Status:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleRefreshState}
              className="gap-1"
            >
              {getRefreshIcon()}
              {getRefreshText()}
            </Button>
          </div>
          
          {uploaderMetrics && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-center p-2 bg-green-50 rounded">
                  <div className="font-bold text-green-700">{uploaderMetrics.completedFiles}</div>
                  <div className="text-xs text-green-600">Completed</div>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded">
                  <div className="font-bold text-orange-700">{uploaderMetrics.processingFiles}</div>
                  <div className="text-xs text-orange-600">Processing</div>
                </div>
              </div>
              
              {uploaderMetrics.cacheMetadata && (
                <div className="text-xs text-muted-foreground">
                  Last updated: {new Date(uploaderMetrics.cacheMetadata.lastRefreshed).toLocaleTimeString()}
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Duplicate Finder Widget
function DuplicateFinderWidget() {
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();

  const { data: duplicateMetrics, refetch } = useQuery<DuplicateFinderMetrics>({
    queryKey: ['/api/duplicates/status'],
    refetchInterval: 30000, // Check every 30 seconds
  });

  const startScanMutation = useMutation({
    mutationFn: () => apiRequest('/api/duplicates/scan', { method: 'POST' }),
    onMutate: () => setIsScanning(true),
    onSuccess: () => {
      toast({
        title: "Duplicate Scan Started",
        description: "Scanning TDDF records for duplicates...",
      });
      refetch();
    },
    onError: () => {
      toast({
        title: "Scan Failed",
        description: "Failed to start duplicate scan",
        variant: "destructive",
      });
    },
    onSettled: () => setIsScanning(false),
  });

  const getStatusIcon = () => {
    if (isScanning || duplicateMetrics?.scanInProgress) {
      return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    
    switch (duplicateMetrics?.status) {
      case 'green': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'red': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Search className="h-4 w-4 text-gray-500" />;
    }
  };

  const canStartScan = duplicateMetrics && 
    !duplicateMetrics.scanInProgress && 
    !isScanning &&
    (!duplicateMetrics.cooldownUntil || new Date() > new Date(duplicateMetrics.cooldownUntil));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Duplicate Finder
        </CardTitle>
        <Search className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Status:</span>
            <div className="flex items-center gap-1">
              {getStatusIcon()}
              <span className="text-sm font-medium">
                {isScanning || duplicateMetrics?.scanInProgress ? 'Scanning...' : 
                 duplicateMetrics?.status === 'green' ? 'Ready' :
                 duplicateMetrics?.status === 'red' ? 'Issues Found' : 'Waiting'}
              </span>
            </div>
          </div>

          {duplicateMetrics && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Duplicates:</span>
                <span className="font-medium">{duplicateMetrics.duplicateCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Scanned:</span>
                <span className="font-medium">{duplicateMetrics.totalScanned?.toLocaleString() ?? 0}</span>
              </div>
            </div>
          )}

          <Button
            size="sm"
            disabled={!canStartScan}
            onClick={() => startScanMutation.mutate()}
            className="w-full"
          >
            {isScanning || duplicateMetrics?.scanInProgress ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="h-3 w-3 mr-1" />
                Start Scan
              </>
            )}
          </Button>

          {duplicateMetrics?.cooldownUntil && new Date() < new Date(duplicateMetrics.cooldownUntil) && (
            <div className="text-xs text-muted-foreground text-center">
              Cooldown: {Math.ceil((new Date(duplicateMetrics.cooldownUntil).getTime() - Date.now()) / 1000 / 60)}min remaining
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Object Storage Status Widget
function ObjectStorageWidget() {
  const { data: storageConfig, refetch } = useQuery<ObjectStorageConfig>({
    queryKey: ['/api/uploader/storage-config'],
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Object Storage
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Cloud className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 cursor-help">
                  <div className={`w-2 h-2 rounded-full ${storageConfig?.available ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm font-medium">
                    {storageConfig?.available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <p>Provider: {storageConfig?.service || 'Unknown'}</p>
                  <p>Bucket: {storageConfig?.bucketName || 'N/A'}</p>
                  <p>Files: {storageConfig?.fileCount || 0}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {storageConfig && (
            <div className="text-xs text-muted-foreground">
              Files: {storageConfig.fileCount || 0}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// TDDF Processing Datetime Widget
function TddfProcessingDatetimeWidget() {
  const { data: tddfDatetimeData, isLoading } = useQuery<TddfProcessingDatetime>({
    queryKey: ['/api/tddf-json/last-processing-datetime'],
    refetchInterval: 60000 // 1 minute
  });

  const formatDatetime = (datetime: string | null) => {
    if (!datetime) return 'No records found';
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return 'Invalid date format';
    return date.toLocaleString();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Last TDDF Processing
        </CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : tddfDatetimeData?.lastProcessingDatetime ? (
            <>
              <div className="text-sm font-medium">
                {formatDatetime(tddfDatetimeData.lastProcessingDatetime)}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>File: {tddfDatetimeData.filename}</div>
                <div>Type: <Badge variant="outline" className="text-xs">{tddfDatetimeData.recordType}</Badge></div>
                <div>Env: <Badge variant="secondary" className="text-xs">{tddfDatetimeData.environment}</Badge></div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              No TDDF records with processing datetime found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomeDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Main dashboard metrics query - cache set to never expire, only refreshes on server restart
  const { data: dashboardMetrics, isLoading, error } = useQuery<DashboardMetrics>({
    queryKey: ['/api/dashboard/cached-metrics'],
    refetchOnWindowFocus: false,
    staleTime: Infinity, // Never consider data stale
    gcTime: Infinity, // Keep in cache indefinitely
  });

  // Last Three Days data for MCC and ACH
  const { data: lastThreeDaysData, isLoading: isLoadingLastThreeDays } = useQuery<LastThreeDaysData>({
    queryKey: ['/api/dashboard/last-three-days'],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Daily Activity data for MCC and ACH
  const { data: dailyActivityData, isLoading: isLoadingDailyActivity } = useQuery<DailyActivityData>({
    queryKey: ['/api/dashboard/daily-activity'],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Monthly Totals data - loads at lowest priority (last 3 months)
  const { data: monthlyTotalsData, isLoading: isLoadingMonthlyTotals } = useQuery<MonthlyTotalsData>({
    queryKey: ['/api/dashboard/monthly-totals'],
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000, // 10 minutes - lowest priority
  });

  // Cache refresh mutation
  const refreshCacheMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/dashboard/refresh-cache", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      // Invalidate both cache status and metrics queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/cached-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/cache-status-only'] });
      toast({
        title: "Cache Refreshed",
        description: "Dashboard metrics have been updated with the latest terminal counts.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: `Failed to refresh cache: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });

  // Fallback data while loading
  const fallbackMetrics: DashboardMetrics = {
    merchants: { total: 0, ach: 0, mcc: 0 },
    monthlyProcessingAmount: { total: '$0.00', ach: '$0.00', mcc: '$0.00' },
    totalRecords: { total: '0', ach: '0', mcc: '0' },
    totalTerminals: { total: 0, ach: 0, mcc: 0 }
  };

  const metrics = dashboardMetrics || fallbackMetrics;

  // Helper function to format date as short (e.g., "25-Jan")
  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        // Try parsing YYYYMMDD format
        if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
          const year = dateStr.substring(0, 4);
          const month = dateStr.substring(4, 6);
          const day = dateStr.substring(6, 8);
          const parsed = new Date(`${year}-${month}-${day}`);
          return `${parsed.getDate()}-${parsed.toLocaleString('default', { month: 'short' })}`;
        }
        return dateStr;
      }
      return `${date.getDate()}-${date.toLocaleString('default', { month: 'short' })}`;
    } catch {
      return dateStr;
    }
  };

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        {/* Header with Refresh Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">MDAS</h1>
              <Badge variant="outline" className={import.meta.env.MODE === "production" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                {import.meta.env.MODE === "production" ? "Production" : "Development"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-[12px]">Merchant Datawarehouse & Automation System</p>
            {/* Cache Status with Visual Indicators */}
            {metrics?.cacheMetadata && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <Database className="h-3 w-3" />
                
                {/* Visual Cache State Indicator */}
                <div className="flex items-center gap-1">
                  {isLoading ? (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-blue-600 font-medium">Loading...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-green-600 font-medium">Cached</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-1">
                  <span>
                    Last refreshed: {(() => {
                      const date = new Date(metrics.cacheMetadata.lastRefreshed);
                      return isNaN(date.getTime()) ? 'Invalid date' : `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                    })()}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    Cache set to never expire
                  </div>
                </div>
                
                {metrics.cacheMetadata.fromCache && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {metrics.cacheMetadata.recordCount ? `${metrics.cacheMetadata.recordCount.toLocaleString()} records` : 'Cached'}
                  </Badge>
                )}
              </div>
            )}
          </div>
          
          {/* Refresh Button */}
          <div className="flex flex-col items-end gap-2">
            <Button
              onClick={() => refreshCacheMutation.mutate()}
              disabled={refreshCacheMutation.isPending}
              size="sm"
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshCacheMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshCacheMutation.isPending ? 'Refreshing...' : 'Refresh'}
            </Button>
            <CacheControlWidget 
              isDarkMode={false}
              initialExpiration="never"
              className="w-48"
            />
          </div>
          
          {/* Cache Control Widget */}
          <div className="text-sm">
            <CacheControlWidget initialExpiration="never" />
          </div>
        </div>

        {/* Key Performance Indicators - MCC */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Key Performance Indicators</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Last Three Days MCC */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Last Three Days MCC</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingLastThreeDays ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 font-medium"></th>
                        <th className="text-right py-1 font-medium">auths</th>
                        <th className="text-right py-1 font-medium">Purchase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastThreeDaysData?.mcc?.map((day, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-1">{formatShortDate(day.date)}</td>
                          <td className="text-right py-1">{formatCurrency(day.authAmount)}</td>
                          <td className="text-right py-1">{formatCurrency(day.purchaseAmount)}</td>
                        </tr>
                      )) || <tr><td colSpan={3} className="text-center py-2 text-muted-foreground">No data</td></tr>}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Monthly MCC Totals */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Monthly MCC Totals</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingMonthlyTotals ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 font-medium"></th>
                        <th className="text-right py-1 font-medium">Transactions</th>
                        <th className="text-right py-1 font-medium">Net Deposits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyTotalsData?.months?.map((month, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-1">{month.month.split(' ')[0].substring(0, 3)}</td>
                          <td className="text-right py-1">{formatCurrency(month.transactionAuthorizations.amount)}</td>
                          <td className="text-right py-1">{formatCurrency(month.netDeposits.amount)}</td>
                        </tr>
                      )) || <tr><td colSpan={3} className="text-center py-2 text-muted-foreground">No data</td></tr>}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Additional Metrics - ACH */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Additional Metrics</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Last Three Days ACH */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Last Three Days ACH</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingLastThreeDays ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 font-medium"></th>
                        <th className="text-right py-1 font-medium">ACH Batches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastThreeDaysData?.ach?.length ? lastThreeDaysData.ach.map((day, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-1">{formatShortDate(day.date)}</td>
                          <td className="text-right py-1">{formatCurrency(day.batchAmount)}</td>
                        </tr>
                      )) : <tr><td colSpan={2} className="text-center py-2 text-muted-foreground">No ACH data</td></tr>}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Last Months Days ACH */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Monthly Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingMonthlyTotals ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 font-medium"></th>
                        <th className="text-right py-1 font-medium">Files</th>
                        <th className="text-right py-1 font-medium">Records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyTotalsData?.months?.map((month, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-1">{month.month.split(' ')[0].substring(0, 3)}</td>
                          <td className="text-right py-1">{month.totalFiles.toLocaleString()}</td>
                          <td className="text-right py-1">{month.totalRecords.toLocaleString()}</td>
                        </tr>
                      )) || <tr><td colSpan={3} className="text-center py-2 text-muted-foreground">No data</td></tr>}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Merchants and Terminals Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Merchants */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Merchants</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : error ? (
                <div className="text-sm text-muted-foreground">Failed to load</div>
              ) : (
                <>
                  <div className="text-2xl font-bold mb-2">{metrics?.merchants?.total ?? 0}</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-600 font-medium">MCC</span>
                      <span>{metrics?.merchants?.mcc ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600 font-medium">ACH</span>
                      <span>{metrics?.merchants?.ach ?? 0}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Terminals */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Terminals</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : error ? (
                <div className="text-sm text-muted-foreground">Failed to load</div>
              ) : (
                <>
                  <div className="text-2xl font-bold mb-2">{metrics?.totalTerminals?.total ?? 0}</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-600 font-medium">MCC</span>
                      <span>{metrics?.totalTerminals?.mcc ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600 font-medium">ACH</span>
                      <span>{metrics?.totalTerminals?.ach ?? 0}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Daily Activity Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* MCC Daily Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">MCC Daily Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDailyActivity ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 font-medium"></th>
                      <th className="text-right py-1 font-medium">Batches (MCC)</th>
                      <th className="text-right py-1 font-medium">Transaction</th>
                      <th className="text-right py-1 font-medium">Other</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyActivityData?.mccActivity?.map((day, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-1">{formatShortDate(day.date)}</td>
                        <td className="text-right py-1">{day.batchCount.toLocaleString()}</td>
                        <td className="text-right py-1">{day.transactionCount.toLocaleString()}</td>
                        <td className="text-right py-1">{day.otherCount.toLocaleString()}</td>
                      </tr>
                    )) || <tr><td colSpan={4} className="text-center py-2 text-muted-foreground">No data</td></tr>}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* ACH Batch Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">ACH Batch Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDailyActivity ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 font-medium"></th>
                      <th className="text-right py-1 font-medium">Batches (ACH)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyActivityData?.achActivity?.length ? dailyActivityData.achActivity.map((day, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-1">{formatShortDate(day.date)}</td>
                        <td className="text-right py-1">{day.batchCount.toLocaleString()}</td>
                      </tr>
                    )) : <tr><td colSpan={2} className="text-center py-2 text-muted-foreground">No ACH data</td></tr>}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* System Widgets */}
        <div>
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <UploaderDashboardWidget />
            <DuplicateFinderWidget />
            <ObjectStorageWidget />
            <TddfProcessingDatetimeWidget />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}