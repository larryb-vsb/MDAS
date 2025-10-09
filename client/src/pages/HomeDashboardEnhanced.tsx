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
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import MainLayout from '@/components/layout/MainLayout';
import { Link } from 'wouter';
import CacheControlWidget from '@/components/shared/CacheControlWidget';

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

// Enhanced MetricCard with clickable navigation
interface ClickableMetricCardProps {
  title: string;
  total?: number | string;
  ach?: number | string;
  mmc?: number | string;
  icon: React.ReactNode;
  achTooltip?: string;
  mmcTooltip?: string;
  format?: 'number' | 'currency';
  achLink?: string;
  mmcLink?: string;
  terminalLink?: string;
  isClickable?: boolean;
}

function ClickableMetricCard({ 
  title, 
  total, 
  ach, 
  mmc, 
  icon, 
  achTooltip, 
  mmcTooltip, 
  format = 'number',
  achLink,
  mmcLink,
  terminalLink,
  isClickable = false
}: ClickableMetricCardProps) {
  const formatValue = (value: number | string | undefined) => {
    if (value === undefined) return '0';
    if (format === 'currency') {
      return typeof value === 'string' ? value : `$${value.toLocaleString()}`;
    }
    return typeof value === 'string' ? value : value.toLocaleString();
  };

  const CardWrapper = isClickable && terminalLink ? 
    ({ children }: { children: React.ReactNode }) => (
      <Link href={terminalLink}>
        <Card className="h-full cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:border-blue-300">
          {children}
        </Card>
      </Link>
    ) : 
    ({ children }: { children: React.ReactNode }) => (
      <Card className="h-full">
        {children}
      </Card>
    );

  return (
    <CardWrapper>
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
          <div className="text-2xl font-bold mb-3">
            {formatValue(total)}
          </div>
        )}
        
        {/* ACH/MMC Breakdown with Links */}
        <div className="space-y-2">
          {ach !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {achLink ? (
                    <Link href={achLink}>
                      <div className="flex justify-between items-center text-sm cursor-pointer hover:bg-blue-50 p-1 rounded">
                        <span className="text-blue-600 font-medium">ACH</span>
                        <span className="font-medium">{formatValue(ach)}</span>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex justify-between items-center text-sm cursor-help">
                      <span className="text-blue-600 font-medium">ACH</span>
                      <span className="font-medium">{formatValue(ach)}</span>
                    </div>
                  )}
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
                  {mmcLink ? (
                    <Link href={mmcLink}>
                      <div className="flex justify-between items-center text-sm cursor-pointer hover:bg-green-50 p-1 rounded">
                        <span className="text-green-600 font-medium">MCC</span>
                        <span className="font-medium">{formatValue(mmc)}</span>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex justify-between items-center text-sm cursor-help">
                      <span className="text-green-600 font-medium">MCC</span>
                      <span className="font-medium">{formatValue(mmc)}</span>
                    </div>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <p>{mmcTooltip || 'from TDDF and csv update'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </CardWrapper>
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
                <span className="font-medium">{duplicateMetrics.duplicateCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Scanned:</span>
                <span className="font-medium">{duplicateMetrics.totalScanned.toLocaleString()}</span>
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
              {refreshCacheMutation.isPending ? 'Refreshing...' : 'Refresh Data'}
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
              <div className="text-sm mt-2">
                <CacheControlWidget initialExpiration="never" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Merchants Total - Clickable to respective pages */}
              <ClickableMetricCard
                title="Merchants Total"
                total={metrics.merchants.total}
                ach={metrics.merchants.ach}
                mmc={480} // Fixed MCC count as requested
                icon={<Users className="h-4 w-4" />}
                achTooltip="from csv files"
                mmcTooltip="from TDDF and csv update"
                achLink="/merchants"
                mmcLink="/merchants?tab=tddf"
              />

              {/* New Merchants (30 day) */}
              <ClickableMetricCard
                title="New Merchant (30day)"
                total={metrics.newMerchants30Day.total}
                ach={metrics.newMerchants30Day.ach}
                mmc={metrics.newMerchants30Day.mmc}
                icon={<Calendar className="h-4 w-4" />}
                achTooltip="from csv files"
                mmcTooltip="from TDDF and csv update"
              />

              {/* Monthly Processing Amount - Links to Transactions */}
              <ClickableMetricCard
                title="Monthly Processing Amount"
                ach={metrics.monthlyProcessingAmount.ach}
                mmc={metrics.monthlyProcessingAmount.mmc}
                icon={<DollarSign className="h-4 w-4" />}
                achTooltip="from csv files"
                mmcTooltip="from TDDF and csv update"
                format="currency"
                achLink="/transactions"
                mmcLink="/tddf-json"
              />

              {/* Today's Transactions Processed */}
              <ClickableMetricCard
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Average Transaction Value */}
            <ClickableMetricCard
              title="Avg Trans Value"
              total={metrics.avgTransValue.total}
              ach={metrics.avgTransValue.ach}
              mmc={metrics.avgTransValue.mmc}
              icon={<BarChart3 className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />

            {/* Daily Processing Amount */}
            <ClickableMetricCard
              title="Daily Processing Amount"
              ach={metrics.dailyProcessingAmount.ach}
              mmc={metrics.dailyProcessingAmount.mmc}
              icon={<DollarSign className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
              format="currency"
            />

            {/* Today's Total Transaction */}
            <ClickableMetricCard
              title="Todays Total Transaction"
              ach={metrics.todayTotalTransaction.ach}
              mmc={metrics.todayTotalTransaction.mmc}
              icon={<CreditCard className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
              format="currency"
            />

            {/* Total Records */}
            <ClickableMetricCard
              title="Total Records"
              ach={metrics.totalRecords.ach}
              mmc={metrics.totalRecords.mmc}
              icon={<Building2 className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
            />

            {/* Total Terminals - Clickable to Terminals page */}
            <ClickableMetricCard
              title="Total Terminals"
              total={metrics.totalTerminals.total}
              ach={metrics.totalTerminals.ach}
              mmc={metrics.totalTerminals.mmc}
              icon={<Terminal className="h-4 w-4" />}
              achTooltip="from csv files"
              mmcTooltip="from TDDF and csv update"
              isClickable={true}
              terminalLink="/terminals"
            />

            {/* Placeholder for additional metric if needed */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  System Health
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-3 text-green-600">Healthy</div>
                <div className="text-sm text-muted-foreground">
                  All systems operational
                </div>
              </CardContent>
            </Card>
          </div>
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