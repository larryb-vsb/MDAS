import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  HardDrive
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

export default function PreCacheManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCache, setSelectedCache] = useState<string | null>(null);

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
        <Button 
          onClick={() => initializeDefaultsMutation.mutate()}
          disabled={initializeDefaultsMutation.isPending}
          variant="outline"
        >
          <Settings className="w-4 h-4 mr-2" />
          Initialize Defaults
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
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
    </div>
  );
}