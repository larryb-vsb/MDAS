import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Database, 
  Activity, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Settings,
  RefreshCw,
  TrendingUp,
  FileText,
  Zap,
  Timer,
  HardDrive,
  Edit,
  Shield,
  Eye
} from "lucide-react";

interface PreCacheSettings {
  id: number;
  cache_name: string;
  page_name: string;
  table_name: string;
  cache_type: string;
  cache_status: string;
  health_status: string;
  update_policy: string;
  expiration_policy: string;
  auto_refresh_enabled: boolean;
  current_record_count: number;
  average_build_time_ms: number;
  last_build_time_ms: number;
  last_successful_update: string;
  priority_level: number;
  configuration_notes: string;
  error_count_24h: number;
  consecutive_failures: number;
  last_error_message: string;
  cache_hit_rate: number;
  total_cache_hits: number;
  total_cache_misses: number;
}

interface PerformanceDashboard {
  overallStats: {
    total_caches: number;
    active_caches: number;
    error_caches: number;
    healthy_caches: number;
    critical_caches: number;
    avg_build_time: number;
    total_records: number;
    total_cache_size: number;
  };
  performanceByType: Array<{
    cache_type: string;
    cache_count: number;
    avg_build_time: number;
    total_records: number;
    active_count: number;
  }>;
  recentErrors: Array<{
    cache_name: string;
    page_name: string;
    last_error_message: string;
    last_error_timestamp: string;
    consecutive_failures: number;
  }>;
  slowCaches: Array<{
    cache_name: string;
    page_name: string;
    average_build_time_ms: number;
    last_build_time_ms: number;
    current_record_count: number;
  }>;
  lastUpdated: string;
}

function getStatusBadge(status: string) {
  const statusConfig = {
    active: { color: "bg-green-100 text-green-800", icon: CheckCircle },
    inactive: { color: "bg-gray-100 text-gray-800", icon: Clock },
    building: { color: "bg-blue-100 text-blue-800", icon: RefreshCw },
    error: { color: "bg-red-100 text-red-800", icon: AlertTriangle },
    expired: { color: "bg-orange-100 text-orange-800", icon: Timer }
  };
  
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive;
  const IconComponent = config.icon;
  
  return (
    <Badge className={config.color}>
      <IconComponent className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
}

function getHealthBadge(health: string) {
  const healthConfig = {
    healthy: { color: "bg-green-100 text-green-800", icon: CheckCircle },
    warning: { color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
    critical: { color: "bg-red-100 text-red-800", icon: AlertTriangle },
    unknown: { color: "bg-gray-100 text-gray-800", icon: Clock }
  };
  
  const config = healthConfig[health as keyof typeof healthConfig] || healthConfig.unknown;
  const IconComponent = config.icon;
  
  return (
    <Badge className={config.color}>
      <IconComponent className="w-3 h-3 mr-1" />
      {health}
    </Badge>
  );
}

function getCacheTypeBadge(type: string) {
  const typeConfig = {
    page_cache: { color: "bg-blue-100 text-blue-800", icon: FileText },
    api_cache: { color: "bg-purple-100 text-purple-800", icon: Zap },
    heat_map_cache: { color: "bg-orange-100 text-orange-800", icon: TrendingUp },
    system_cache: { color: "bg-gray-100 text-gray-800", icon: Settings }
  };
  
  const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.system_cache;
  const IconComponent = config.icon;
  
  return (
    <Badge className={config.color}>
      <IconComponent className="w-3 h-3 mr-1" />
      {type.replace('_', ' ')}
    </Badge>
  );
}

interface CacheTableInfo {
  name: string;
  status: 'active' | 'stale' | 'expired' | 'empty';
  recordCount: number;
  lastRefresh: string;
  age: string;
  size?: string;
}

// PreCacheTablesOverview Component
function PreCacheTablesOverview({ onViewCache }: { onViewCache: (cacheName: string) => void }) {
  const [tablesLoading, setTablesLoading] = useState(true);
  const [cacheTablesList, setCacheTablesList] = useState<CacheTableInfo[]>([]);
  const [refreshingTable, setRefreshingTable] = useState<string | null>(null);

  // Fetch all cache tables
  const fetchCacheTables = async () => {
    try {
      setTablesLoading(true);
      const response = await fetch('/api/pre-cache/all-tables', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setCacheTablesList(data.tables || []);
      }
    } catch (error) {
      console.error('Failed to fetch cache tables:', error);
    } finally {
      setTablesLoading(false);
    }
  };

  // Refresh individual cache table
  const refreshCacheTable = async (tableName: string) => {
    try {
      setRefreshingTable(tableName);
      const response = await fetch(`/api/pre-cache/refresh-table/${tableName}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        await fetchCacheTables(); // Refresh the list
      }
    } catch (error) {
      console.error(`Failed to refresh table ${tableName}:`, error);
    } finally {
      setRefreshingTable(null);
    }
  };

  // Get status badge
  const getTableStatusBadge = (status: string, recordCount: number) => {
    if (recordCount === 0) {
      return <Badge variant="secondary" className="bg-gray-100 text-gray-600">Empty</Badge>;
    }
    
    switch (status) {
      case 'active': return <Badge className="bg-blue-100 text-blue-700">Active</Badge>;
      case 'stale': return <Badge variant="outline" className="border-yellow-300 text-yellow-700">Stale</Badge>;
      case 'expired': return <Badge variant="destructive" className="bg-red-100 text-red-700">Expired</Badge>;
      default: return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  // Initial load
  useEffect(() => {
    fetchCacheTables();
  }, []);

  return (
    <div className="space-y-6">
      {/* Pre-Cache Tables Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-blue-500" />
              <span>Pre-Cache Tables Status</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Individual cache table status and refresh controls
            </p>
          </div>
          <Button 
            onClick={fetchCacheTables} 
            disabled={tablesLoading}
            variant="outline"
            size="sm"
          >
            {tablesLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh All
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {tablesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin" />
              <span className="ml-2 text-muted-foreground">Loading cache tables...</span>
            </div>
          ) : cacheTablesList.length > 0 ? (
            <div className="space-y-3">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Total Tables</div>
                  <div className="text-lg font-semibold">{cacheTablesList.length}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Active</div>
                  <div className="text-lg font-semibold text-blue-600">
                    {cacheTablesList.filter(t => t.status === 'active').length}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Stale</div>
                  <div className="text-lg font-semibold text-yellow-600">
                    {cacheTablesList.filter(t => t.status === 'stale').length}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Empty</div>
                  <div className="text-lg font-semibold text-gray-600">
                    {cacheTablesList.filter(t => t.recordCount === 0).length}
                  </div>
                </div>
              </div>

              {/* Individual Cache Tables */}
              <div className="space-y-2">
                {cacheTablesList.map((table, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="font-medium text-sm">{table.name}</div>
                        {getTableStatusBadge(table.status, table.recordCount)}
                      </div>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-muted-foreground">
                        <span>{table.recordCount.toLocaleString()} records</span>
                        <span>Updated {table.age}</span>
                        {table.size && <span>{table.size}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewCache(table.name)}
                        className="text-blue-600 hover:bg-blue-50"
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refreshCacheTable(table.name)}
                        disabled={refreshingTable === table.name}
                      >
                        {refreshingTable === table.name ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-muted-foreground">No cache tables found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PreCacheManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCache, setSelectedCache] = useState<string | null>(null);
  const [showDashboardControls, setShowDashboardControls] = useState(false);
  const [showPolicyManagement, setShowPolicyManagement] = useState(false);
  const [selectedCacheForView, setSelectedCacheForView] = useState<string | null>(null);
  const [cacheDetails, setCacheDetails] = useState<any>(null);
  const [loadingCacheDetails, setLoadingCacheDetails] = useState(false);

  // Fetch all pre-cache settings
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['/api/pre-cache/settings-status'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch performance dashboard
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['/api/pre-cache/performance-dashboard'],
    refetchInterval: 60000 // Refresh every minute
  });

  // Initialize defaults mutation
  const initializeDefaultsMutation = useMutation({
    mutationFn: () => apiRequest('/api/pre-cache/initialize-defaults', {
      method: 'POST'
    }),
    onSuccess: (data) => {
      toast({
        title: "Defaults Initialized",
        description: `${data.results.length} configurations processed`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pre-cache/settings-status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Initialization Failed",
        description: error.message || "Failed to initialize defaults",
        variant: "destructive",
      });
    }
  });

  const settings: PreCacheSettings[] = settingsData?.data || [];
  const dashboard: PerformanceDashboard = dashboardData?.dashboard;

  // Fetch cache details for a specific table
  const fetchCacheDetails = async (tableName: string) => {
    setLoadingCacheDetails(true);
    try {
      const response = await fetch(`/api/pre-cache/cache-details/${tableName}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Cache details response:', data);
      
      if (data.success && data.details) {
        setCacheDetails(data.details);
      } else {
        console.error('Failed to fetch cache details:', data.error || 'Unknown error');
        setCacheDetails(null);
      }
    } catch (error) {
      console.error('Error fetching cache details:', error);
      setCacheDetails(null);
    } finally {
      setLoadingCacheDetails(false);
    }
  };

  // Handle cache view with data fetching
  const handleViewCache = (tableName: string) => {
    setSelectedCacheForView(tableName);
    setCacheDetails(null); // Clear previous data
    fetchCacheDetails(tableName);
  };

  const formatBuildTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pre-Cache Management</h1>
          <p className="text-muted-foreground mt-2">
            Monitor and control all pre-cache systems across the application
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => initializeDefaultsMutation.mutate()}
            disabled={initializeDefaultsMutation.isPending}
            variant="outline"
          >
            <Settings className="w-4 h-4 mr-2" />
            Initialize Defaults
          </Button>
          <Button 
            onClick={() => setShowDashboardControls(true)}
            variant="outline"
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Edit className="w-4 h-4 mr-2" />
            Dashboard Edit Controls
          </Button>
          <Button 
            onClick={() => setShowPolicyManagement(true)}
            variant="outline"
            className="text-purple-600 border-purple-200 hover:bg-purple-50"
          >
            <Shield className="w-4 h-4 mr-2" />
            Policy Management
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tables">Pre-Cache Tables</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {dashboard && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Caches</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboard.overallStats.total_caches}</div>
                  <p className="text-xs text-muted-foreground">
                    Active: {dashboard.overallStats.active_caches}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Health Status</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {dashboard.overallStats.healthy_caches}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Critical: {dashboard.overallStats.critical_caches}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Build Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatBuildTime(dashboard.overallStats.avg_build_time || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Average across all caches</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Records</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(dashboard.overallStats.total_records || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Size: {formatBytes(dashboard.overallStats.total_cache_size || 0)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Cache Performance by Type</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard?.performanceByType.length > 0 ? (
                <div className="space-y-4">
                  {dashboard.performanceByType.map((type) => (
                    <div key={type.cache_type} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center space-x-3">
                        {getCacheTypeBadge(type.cache_type)}
                        <div>
                          <div className="font-medium">{type.cache_count} caches</div>
                          <div className="text-sm text-muted-foreground">
                            {type.active_count} active
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBuildTime(type.avg_build_time)}</div>
                        <div className="text-sm text-muted-foreground">
                          {type.total_records.toLocaleString()} records
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No performance data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables" className="space-y-6">
          <PreCacheTablesOverview onViewCache={handleViewCache} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cache Configuration Settings</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage individual cache settings and policies
              </p>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
              ) : settings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cache Name</TableHead>
                      <TableHead>Page</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Priority</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.map((setting) => (
                      <TableRow key={setting.id}>
                        <TableCell className="font-medium">{setting.cache_name}</TableCell>
                        <TableCell>{setting.page_name}</TableCell>
                        <TableCell>{getCacheTypeBadge(setting.cache_type)}</TableCell>
                        <TableCell>{getStatusBadge(setting.cache_status)}</TableCell>
                        <TableCell>{getHealthBadge(setting.health_status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{setting.update_policy}</Badge>
                        </TableCell>
                        <TableCell>{setting.current_record_count.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{setting.priority_level}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">No cache settings found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>



        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Build Time Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {settings.length > 0 ? (
                  <div className="space-y-3">
                    {settings
                      .filter(s => s.average_build_time_ms > 0)
                      .sort((a, b) => b.average_build_time_ms - a.average_build_time_ms)
                      .slice(0, 5)
                      .map((setting) => (
                        <div key={setting.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{setting.cache_name}</div>
                            <div className="text-sm text-muted-foreground">{setting.page_name}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              {formatBuildTime(setting.average_build_time_ms)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Last: {formatBuildTime(setting.last_build_time_ms)}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No performance data available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Hit Rates</CardTitle>
              </CardHeader>
              <CardContent>
                {settings.length > 0 ? (
                  <div className="space-y-3">
                    {settings
                      .filter(s => s.total_cache_hits > 0)
                      .sort((a, b) => (b.cache_hit_rate || 0) - (a.cache_hit_rate || 0))
                      .slice(0, 5)
                      .map((setting) => (
                        <div key={setting.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{setting.cache_name}</div>
                            <div className="text-sm text-muted-foreground">{setting.page_name}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              {(setting.cache_hit_rate || 0).toFixed(1)}%
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {setting.total_cache_hits} hits
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No hit rate data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monitor cache errors and failures
              </p>
            </CardHeader>
            <CardContent>
              {dashboard?.recentErrors.length > 0 ? (
                <div className="space-y-4">
                  {dashboard.recentErrors.map((error, index) => (
                    <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <span className="font-medium">{error.cache_name}</span>
                            <Badge variant="outline">{error.page_name}</Badge>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{error.last_error_message}</p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>
                              {new Date(error.last_error_timestamp).toLocaleString()}
                            </span>
                            <span>
                              {error.consecutive_failures} consecutive failures
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle className="w-6 h-6 mr-2 text-green-600" />
                  No recent errors found
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              {settings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {settings
                    .filter(s => s.error_count_24h > 0 || s.consecutive_failures > 0)
                    .map((setting) => (
                      <div key={setting.id} className="border rounded-lg p-3">
                        <div className="font-medium mb-1">{setting.cache_name}</div>
                        <div className="text-sm text-muted-foreground mb-2">{setting.page_name}</div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>24h errors:</span>
                            <span className="font-medium">{setting.error_count_24h}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consecutive:</span>
                            <span className="font-medium">{setting.consecutive_failures}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No error statistics available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dashboard Edit Controls Modal */}
      <Dialog open={showDashboardControls} onOpenChange={setShowDashboardControls}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Edit className="w-5 h-5 mr-2 text-blue-600" />
              Dashboard Edit Controls
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Widget Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start">
                    <Edit className="w-4 h-4 mr-2" />
                    Add New Widget
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Settings className="w-4 h-4 mr-2" />
                    Rearrange Layout
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Database className="w-4 h-4 mr-2" />
                    Configure Data Sources
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Display Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start">
                    <Clock className="w-4 h-4 mr-2" />
                    Refresh Intervals
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Activity className="w-4 h-4 mr-2" />
                    Performance Mode
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Alert Thresholds
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cache Control</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button variant="destructive" className="w-full">
                    Clear All Caches
                  </Button>
                  <Button variant="outline" className="w-full">
                    Rebuild Dashboard
                  </Button>
                  <Button variant="outline" className="w-full">
                    Export Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Policy Management Modal */}
      <Dialog open={showPolicyManagement} onOpenChange={setShowPolicyManagement}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2 text-purple-600" />
              Policy Management
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Cache Policies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start">
                    <Timer className="w-4 h-4 mr-2" />
                    TTL Management
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Auto-Refresh Rules
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <HardDrive className="w-4 h-4 mr-2" />
                    Storage Policies
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Security & Access</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start">
                    <Shield className="w-4 h-4 mr-2" />
                    Access Controls
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="w-4 h-4 mr-2" />
                    Audit Logs
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Security Rules
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Performance Policies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Button variant="outline" className="w-full">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Optimization
                  </Button>
                  <Button variant="outline" className="w-full">
                    <Zap className="w-4 h-4 mr-2" />
                    Priority Rules
                  </Button>
                  <Button variant="outline" className="w-full">
                    <Activity className="w-4 h-4 mr-2" />
                    Load Balancing
                  </Button>
                  <Button variant="outline" className="w-full">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Health Checks
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cache View/Edit/Refresh Popup */}
      <Dialog open={!!selectedCacheForView} onOpenChange={() => setSelectedCacheForView(null)}>
        <DialogContent className="max-w-md" aria-describedby="cache-status-description">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Eye className="w-5 h-5 text-blue-500" />
              <span>Cache Status</span>
            </DialogTitle>
          </DialogHeader>
          <div id="cache-status-description" className="sr-only">
            View and manage cache status including expiration settings and refresh controls
          </div>
          
          <div className="space-y-4">
            {loadingCacheDetails ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading cache details...</span>
              </div>
            ) : cacheDetails ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <strong>Cache Name:</strong>
                  <div className="font-mono text-sm bg-gray-100 p-2 rounded mt-1">
                    {cacheDetails.cacheName}
                  </div>
                </div>
                
                <div className="text-sm">
                  <strong>Last Refresh:</strong>
                  <div className="text-gray-600">
                    {new Date(cacheDetails.lastRefresh).toLocaleDateString()}
                  </div>
                  <div className="text-gray-600">
                    {new Date(cacheDetails.lastRefresh).toLocaleTimeString()}
                  </div>
                </div>
                
                <div className="text-sm">
                  <strong>Expires:</strong>
                  <div className="text-gray-600">
                    {new Date(cacheDetails.expiresAt).toLocaleDateString()}
                  </div>
                  <div className="text-gray-600">
                    {new Date(cacheDetails.expiresAt).toLocaleTimeString()}
                  </div>
                </div>
                
                <div className="text-sm">
                  <strong>Status:</strong>
                  <div className="mt-1">
                    <Badge 
                      variant="secondary" 
                      className={
                        cacheDetails.status === 'active' ? 'bg-green-100 text-green-800' :
                        cacheDetails.status === 'stale' ? 'bg-yellow-100 text-yellow-800' :
                        cacheDetails.status === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }
                    >
                      {cacheDetails.status.charAt(0).toUpperCase() + cacheDetails.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                
                <div className="text-sm text-gray-500">
                  Age: {cacheDetails.age} | Records: {cacheDetails.records.toLocaleString()} | Size: {cacheDetails.size}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Failed to load cache details
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Cache Expiration:</label>
              <div className="flex items-center space-x-2">
                <select className="flex-1 p-2 border rounded text-sm">
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="240">4 hours</option>
                  <option value="480">8 hours</option>
                  <option value="never">Never expire</option>
                </select>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Set
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}