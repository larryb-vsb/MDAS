import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { APP_VERSION, BUILD_DATE } from "@shared/version";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, ArchiveRestore, Database, Download, DownloadCloud, HardDrive, Info, List, RefreshCw, ScrollText, Server, Trash2, AlertTriangle, Activity } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import BackupHistoryDialog from "@/components/settings/BackupHistoryDialog";
import SchemaVersionInfo from "@/components/settings/SchemaVersionInfo";
import FileProcessingHistory from "@/components/settings/FileProcessingHistory";
import UserManagement from "@/components/settings/UserManagement";
import ApiUserManagement from "@/components/settings/ApiUserManagement";
import { PoolStatus } from "@/components/settings/PoolStatus";
import DatabaseConnectionSettings from "@/components/settings/DatabaseConnectionSettings";
import S3BackupSettings from "@/components/settings/S3BackupSettings";
import BackupScheduleManager from "@/components/settings/BackupScheduleManager";
import BackupUploadRestore from "@/components/settings/BackupUploadRestore";
import HierarchicalTddfMigration from "@/components/migration/HierarchicalTddfMigration";
import MainLayout from "@/components/layout/MainLayout";
import TddfJsonActivityHeatMap from "@/components/tddf/TddfJsonActivityHeatMap";
import RefreshStatusIndicator from "@/components/shared/RefreshStatusIndicator";
import TddfObjectStorageReport from "@/components/reports/TddfObjectStorageReport";
import UploaderDataStatus from "@/components/settings/UploaderDataStatus";
import TddfJsonRecordCounts from "@/components/settings/TddfJsonRecordCounts";

interface DatabaseStats {
  connectionStatus: "connected" | "error";
  version: string;
  tables: {
    name: string;
    rowCount: number;
    sizeBytes: number;
  }[];
  totalRows: number;
  totalSizeBytes: number;
  lastBackup: string | null;
}

export default function Settings() {
  const [_, navigate] = useLocation();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [hasBackup, setHasBackup] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [useS3Storage, setUseS3Storage] = useState(false);
  const [isClearingTddfJson, setIsClearingTddfJson] = useState(false);
  const [showClearConfirmDialog, setShowClearConfirmDialog] = useState(false);
  const [showPerformanceTest, setShowPerformanceTest] = useState(false);
  const [heatMapRefreshKey, setHeatMapRefreshKey] = useState(0);
  const [refreshingTable, setRefreshingTable] = useState<string | null>(null);
  const [lastRefreshDetails, setLastRefreshDetails] = useState<{[key: string]: any}>({});
  
  // Query for heat map testing - uses dedicated pre-cache table
  const { data: heatMapActivity, isLoading: heatMapLoading, dataUpdatedAt } = useQuery({
    queryKey: ['/api/heat-map-testing/cached', new Date().getFullYear(), heatMapRefreshKey],
    queryFn: async () => {
      const response = await fetch(`/api/heat-map-testing/cached?year=${new Date().getFullYear()}`);
      if (!response.ok) throw new Error('Failed to fetch heat map testing cache data');
      return response.json();
    },
    enabled: showPerformanceTest,
    staleTime: 30 * 1000, // 30 seconds - faster refresh for testing
    refetchOnWindowFocus: false,
  });

  // Query for last new data date
  const { data: lastNewDataDate } = useQuery({
    queryKey: ['/api/uploader/last-new-data-date', heatMapRefreshKey],
    queryFn: async () => {
      const response = await fetch('/api/uploader/last-new-data-date');
      if (!response.ok) throw new Error('Failed to fetch last new data date');
      return response.json();
    },
    enabled: showPerformanceTest,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Query for comprehensive pre-cache table tracking
  const { data: preCacheStatus, isLoading: preCacheLoading } = useQuery({
    queryKey: ['/api/settings/pre-cache-status', heatMapRefreshKey],
    queryFn: async () => {
      const response = await fetch('/api/settings/pre-cache-status');
      if (!response.ok) throw new Error('Failed to fetch pre-cache status');
      return response.json();
    },
    enabled: showPerformanceTest,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
  });

  // Query for cached tables list with age information
  const { data: cachedTables, isLoading: cachedTablesLoading, refetch: refetchCachedTables } = useQuery({
    queryKey: ['/api/settings/cached-tables', heatMapRefreshKey],
    queryFn: async () => {
      const response = await fetch('/api/settings/cached-tables');
      if (!response.ok) throw new Error('Failed to fetch cached tables');
      return response.json();
    },
    enabled: showPerformanceTest,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Handler for refreshing individual cache tables
  const handleRefreshCacheTable = async (tableName: string) => {
    setRefreshingTable(tableName);
    try {
      const response = await fetch('/api/settings/refresh-cache-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tableName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh cache table: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Store detailed timing information for display
      if (result.timing) {
        setLastRefreshDetails(prev => ({
          ...prev,
          [tableName]: {
            ...result.timing,
            refreshType: result.refreshType || 'specific',
            completedAt: Date.now()
          }
        }));
        
        console.log(`✅ Cache table ${tableName} refreshed successfully:`, {
          duration: result.timing.durationHuman,
          started: result.timing.startTimeLocal,
          completed: result.timing.endTimeLocal,
          method: result.refreshType || 'specific'
        });
      }
      
      // Refresh the cached tables list
      await refetchCachedTables();
      
    } catch (error) {
      console.error(`❌ Error refreshing cache table ${tableName}:`, error);
    } finally {
      setRefreshingTable(null);
    }
  };
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };
  
  const toggleUploadModal = () => {
    setIsUploadModalOpen(prev => !prev);
  };
  
  // Fetch database statistics
  const {
    data: dbStats,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<DatabaseStats>({
    queryKey: ["/api/settings/database"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Fetch S3 config
  const s3ConfigQuery = useQuery({
    queryKey: ["/api/settings/s3config"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Fetch system information
  const systemInfoQuery = useQuery({
    queryKey: ["/api/system/info"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Fetch schema version information
  const schemaVersionQuery = useQuery({
    queryKey: ["/api/schema/versions"],
    staleTime: 1000 * 60 * 2, // 2 minutes - schema changes frequently
  });
  
  const createBackup = async () => {
    try {
      setIsBackingUp(true);
      setBackupProgress(10);
      
      // Simulate progress for better UX (real progress would come from the server)
      const interval = setInterval(() => {
        setBackupProgress(prev => {
          const nextProgress = prev + Math.floor(Math.random() * 15);
          return nextProgress > 90 ? 90 : nextProgress;
        });
      }, 500);
      
      try {
        const response = await fetch("/api/settings/backup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            useS3: useS3Storage,
            notes: "Created from settings page"
          }),
          credentials: "include"
        });
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const responseData = await response.json();
        
        clearInterval(interval);
        setBackupProgress(100);
        
        // Set hasBackup to true if the backup was created successfully
        if (responseData && responseData.success) {
          setHasBackup(true);
          
          const storageType = useS3Storage ? "S3 cloud storage" : "local storage";
          
          toast({
            title: "Backup created successfully",
            description: `Your database has been backed up to ${storageType}.`,
          });
          
          // Refresh statistics
          refetch();
        } else {
          throw new Error("Backup creation failed");
        }
      } catch (error) {
        clearInterval(interval);
        console.error("Backup error:", error);
        
        toast({
          title: "Backup failed",
          description: "Failed to create backup. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Outer error:", err);
      toast({
        title: "Backup failed",
        description: "Failed to create backup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => {
        setIsBackingUp(false);
        setBackupProgress(0);
      }, 1000);
    }
  };
  
  const downloadBackup = () => {
    // Create a direct download link to the backup file
    window.location.href = "/api/settings/backup/download";
  };

  const clearTddfJsonDatabase = async () => {
    try {
      setIsClearingTddfJson(true);
      setShowClearConfirmDialog(false);
      
      console.log('[SETTINGS] Starting TDDF JSON database clear...');
      
      const response = await fetch('/api/tddf-json/clear-database', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (result.success) {
        const recordsCleared = result.recordsDeleted || 0;
        const precacheTablesCleared = result.precacheTablesCleared || 0;
        
        toast({
          title: "TDDF Database Cleared",
          description: `Successfully cleared ${recordsCleared} records and ${precacheTablesCleared} precache tables`,
          variant: "default",
        });
        
        console.log(`[SETTINGS] TDDF database cleared: ${recordsCleared} records deleted, ${precacheTablesCleared} precache tables cleared`);
        
        // Refresh database statistics
        refetch();
        
      } else {
        throw new Error(result.error || "Failed to clear TDDF JSON database");
      }
      
    } catch (error) {
      console.error('[SETTINGS] Error clearing TDDF JSON database:', error);
      toast({
        title: "Clear Failed",
        description: error instanceof Error ? error.message : "Failed to clear TDDF JSON database. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsClearingTddfJson(false);
    }
  };
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Never";
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };
  
  return (
    <MainLayout>
      <div className="container mx-auto">
        <div className="flex-1 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="text-muted-foreground">
                Manage your application database and settings
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          
          <Separator />
          
          {/* System Information Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Server className="mr-2 h-5 w-5 text-primary" />
                  System Information
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.href = "/logs"}
                  className="ml-auto"
                >
                  <ScrollText className="w-4 h-4 mr-2" />
                  View App Logs
                </Button>
              </CardTitle>
              <CardDescription>
                Current application system details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Application Version:</span>
                  <Badge variant="outline" className="text-primary">
                    {APP_VERSION}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Build Date:</span>
                  <span>{BUILD_DATE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Application:</span>
                  <span>Merchant Management System</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Environment:</span>
                  <Badge variant="outline" className={import.meta.env.MODE === "production" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                    {import.meta.env.MODE === "production" ? "Production" : "Development"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Database:</span>
                  <span>{import.meta.env.MODE === "production" ? "Production DB" : "Development DB"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Database Schema Version:</span>
                  {schemaVersionQuery.isLoading ? (
                    <span className="text-muted-foreground text-sm">Loading...</span>
                  ) : schemaVersionQuery.data?.currentVersion ? (
                    <Badge variant="outline" className="text-primary">
                      {schemaVersionQuery.data.currentVersion.version}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">Unknown</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Schema Applied:</span>
                  {schemaVersionQuery.isLoading ? (
                    <span className="text-muted-foreground text-sm">Loading...</span>
                  ) : schemaVersionQuery.data?.currentVersion?.appliedAt ? (
                    <span className="text-sm">
                      {new Date(schemaVersionQuery.data.currentVersion.appliedAt).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not recorded</span>
                  )}
                </div>

                {/* Storage Mode */}
                {systemInfoQuery.data && (
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Storage Mode:</span>
                    {(systemInfoQuery.data as any)?.storage?.fallbackMode ? (
                      <Badge variant="destructive">
                        Memory Fallback
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Database
                      </Badge>
                    )}
                  </div>
                )}

                {/* Show a warning about fallback storage if active */}
                {systemInfoQuery.data && (systemInfoQuery.data as any)?.storage?.fallbackMode && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Memory Fallback Mode Active</AlertTitle>
                    <AlertDescription>
                      The system is currently running with in-memory storage. All data will be lost when the server is restarted.
                      This mode is activated when the database is unavailable.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-between">
                  <span className="font-medium">Database Type:</span>
                  <span>PostgreSQL</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Frontend Framework:</span>
                  <span>React + Vite</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Host:</span>
                  <span>Replit</span>
                </div>
              </div>
              
              {/* Heat Map Performance Testing Button */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Dialog open={showPerformanceTest} onOpenChange={setShowPerformanceTest}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 bg-purple-50"
                    >
                      <Activity className="mr-2 h-4 w-4" />
                      UI Performance Test Page
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
                    <DialogHeader>
                      <DialogTitle className="flex items-center text-purple-700">
                        <Activity className="mr-2 h-5 w-5" />
                        UI Performance Test Page
                      </DialogTitle>
                      <DialogDescription>
                        Test UI performance system with dedicated pre-caching tables and performance metrics.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 overflow-auto max-h-[70vh]">
                      {/* Last New Data Status - New section at top */}
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-blue-900">Last New Data Status</h5>
                          <div className="flex items-center gap-2 text-sm text-blue-600">
                            <DownloadCloud className="h-4 w-4" />
                            Uploader Data
                          </div>
                        </div>
                        
                        {/* Query uploader dashboard metrics for last upload info */}
                        <UploaderDataStatus />
                      </div>

                      {/* Heat Map Status - Moved to top */}
                      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-gray-900">Performance Page - Pre-Cache Status</h5>
                          {heatMapLoading && (
                            <div className="flex items-center gap-2 text-sm text-blue-600">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Loading...
                            </div>
                          )}
                        </div>
                        <RefreshStatusIndicator
                          lastRefreshed={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : new Date().toISOString()}
                          refreshStatus={heatMapLoading ? "loading" : (heatMapActivity?.fromCache ? "cached" : "fresh")}
                          ageMinutes={dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 60000) : 0}
                          recordCount={heatMapActivity?.metadata?.totalRecords || heatMapActivity?.records?.length || 0}
                          duration={heatMapActivity?.metadata?.performanceMetrics?.totalQueryTime || heatMapActivity?.queryTime}
                          compact={false}
                        />
                        {heatMapActivity?.metadata && (
                          <div className="mt-2 text-xs text-gray-600">
                            <div>Aggregation: <span className="font-medium">{heatMapActivity.metadata.aggregationLevel}</span></div>
                            <div>Performance: {heatMapActivity.metadata.performanceMetrics?.totalQueryTime}ms total</div>
                          </div>
                        )}
                        
                        {/* Last New Data Date */}
                        {lastNewDataDate?.lastNewDataDate && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-600">
                              <div className="flex items-center justify-between">
                                <span>Last New Data:</span>
                                <span className="font-medium text-green-700">
                                  {new Date(lastNewDataDate.lastNewDataDate).toLocaleString('en-US', {
                                    timeZone: 'America/Chicago',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })} CST
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Pre-Cache Tables Status */}
                        {preCacheStatus && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <h6 className="text-sm font-medium text-gray-800">Pre-Cache Tables ({preCacheStatus.summary?.available}/{preCacheStatus.summary?.totalTables})</h6>
                              {preCacheLoading && (
                                <div className="flex items-center gap-1 text-xs text-blue-600">
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  Checking...
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>Fresh: {preCacheStatus.summary?.fresh || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                <span>Stale: {preCacheStatus.summary?.stale || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                <span>Expired: {preCacheStatus.summary?.expired || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                <span>Unavailable: {preCacheStatus.summary?.unavailable || 0}</span>
                              </div>
                            </div>
                            {preCacheStatus.summary && preCacheStatus.summary.available > 0 && (
                              <div className="mt-2 space-y-1">
                                <div className="text-xs text-gray-600 font-medium">
                                  Cache Naming: target-source_cache_yyyy format
                                </div>
                                <div className="grid grid-cols-1 gap-1 text-xs">
                                  <div className="flex justify-between items-center bg-white rounded px-2 py-1 border border-gray-100">
                                    <span className="font-mono text-blue-600">dashboard-merchants_cache_2025</span>
                                    <span className="text-gray-500">Dashboard metrics</span>
                                  </div>
                                  <div className="flex justify-between items-center bg-white rounded px-2 py-1 border border-gray-100">
                                    <span className="font-mono text-green-600">heat_map-tddf_jsonb_cache_2025</span>
                                    <span className="text-gray-500">Heat map data</span>
                                  </div>
                                  {preCacheStatus.summary.totalTables > 2 && (
                                    <div className="text-xs text-center text-gray-400 py-1">
                                      + {preCacheStatus.summary.totalTables - 2} more cache tables
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Pre-Cache Builder Section */}
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-green-900">Pre-Cache Builder</h5>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const response = await fetch('/api/system/build-pre-cache', {
                                    method: 'POST',
                                    credentials: 'include'
                                  });
                                  const result = await response.json();
                                  if (result.success) {
                                    toast({
                                      title: "Pre-cache built successfully",
                                      description: `Built in ${result.buildTimeMs}ms`,
                                    });
                                    refetchPreCacheStatus();
                                  } else {
                                    throw new Error(result.error || 'Failed to build pre-cache');
                                  }
                                } catch (error) {
                                  toast({
                                    title: "Pre-cache build failed",
                                    description: error.message,
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                            >
                              Build Pre-Cache Tables
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-green-700">
                          Build comprehensive pre-cache tables for all pages to ensure instant loading performance.
                        </div>
                      </div>
                      
                      {/* Cached Tables List */}
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-blue-900">Cached Tables</h5>
                          <div className="flex items-center gap-2">
                            {cachedTablesLoading && (
                              <RefreshCw className="animate-spin h-4 w-4 text-blue-600" />
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => refetchCachedTables()}
                              className="text-blue-700 border-blue-200 hover:bg-blue-100 h-7"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {cachedTables && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span><strong>Fresh:</strong> {cachedTables.summary?.freshTables || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                <span><strong>Stale:</strong> {cachedTables.summary?.staleTables || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                <span><strong>Expired:</strong> {cachedTables.summary?.expiredTables || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <span><strong>Active:</strong> {cachedTables.summary?.activeNoTimestamp || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                                <span><strong>Empty:</strong> {cachedTables.summary?.emptyTables || 0}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                <span><strong>Total:</strong> {cachedTables.summary?.totalTables || 0}</span>
                              </div>
                            </div>
                            {cachedTables.tables && cachedTables.tables.length > 0 && (
                              <div className="mt-2">
                                <div className="text-xs text-blue-700 font-medium mb-1">Individual Cache Tables:</div>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {cachedTables.tables.map((table: any) => (
                                    <div key={table.name} className="text-xs bg-white rounded border">
                                      <div className="flex justify-between items-center py-2 px-2">
                                        <div className="flex flex-col flex-1">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${
                                              table.status === 'fresh' ? 'bg-green-500' :
                                              table.status === 'stale' ? 'bg-yellow-500' :
                                              table.status === 'expired' ? 'bg-red-500' :
                                              table.status === 'active' ? 'bg-blue-500' :
                                              table.status === 'empty' ? 'bg-gray-300' :
                                              'bg-gray-400'
                                            }`}></div>
                                            <span className={`font-mono font-medium ${table.isActive ? 'text-blue-700' : 'text-gray-500'}`}>
                                              {table.name}
                                            </span>
                                            {lastRefreshDetails[table.name] && (
                                              <span className="px-1 py-0.5 text-xs rounded bg-green-100 text-green-700 border border-green-200">
                                                Recently refreshed
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 mt-1">
                                            {table.lastUpdated ? (
                                              <span className={`text-xs ${
                                                table.ageInMinutes < 30 ? 'text-green-600' : 
                                                table.ageInMinutes < 120 ? 'text-yellow-600' : 
                                                'text-red-600'
                                              }`}>
                                                {table.ageInMinutes < 60 ? `${table.ageInMinutes}m ago` :
                                                 table.ageInMinutes < 1440 ? `${Math.floor(table.ageInMinutes / 60)}h ago` :
                                                 `${Math.floor(table.ageInMinutes / 1440)}d ago`}
                                              </span>
                                            ) : (
                                              <span className={`text-xs ${
                                                table.status === 'active' ? 'text-blue-600' :
                                                table.status === 'empty' ? 'text-gray-500' :
                                                'text-gray-400'
                                              }`}>
                                                {table.status === 'active' ? 'Active (no timestamp)' :
                                                 table.status === 'empty' ? 'Empty table' :
                                                 'No age info'}
                                              </span>
                                            )}
                                            <span className="text-gray-600">{table.rowCount.toLocaleString()} rows</span>
                                            <span className="text-gray-500">{table.tableSize}</span>
                                          </div>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleRefreshCacheTable(table.name)}
                                          disabled={refreshingTable === table.name}
                                          className="ml-2 h-6 px-2 text-xs border-gray-300 hover:bg-gray-50"
                                        >
                                          {refreshingTable === table.name ? (
                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <RefreshCw className="h-3 w-3" />
                                          )}
                                        </Button>
                                      </div>
                                      {lastRefreshDetails[table.name] && (
                                        <div className="px-2 pb-2 border-t border-green-100 bg-green-50">
                                          <div className="grid grid-cols-2 gap-2 text-xs text-green-700 mt-1">
                                            <div>
                                              <span className="font-medium">Duration:</span> {lastRefreshDetails[table.name].durationHuman}
                                            </div>
                                            <div>
                                              <span className="font-medium">Method:</span> {lastRefreshDetails[table.name].refreshType}
                                            </div>
                                            <div>
                                              <span className="font-medium">Started:</span> {lastRefreshDetails[table.name].startTimeLocal?.slice(-8)}
                                            </div>
                                            <div>
                                              <span className="font-medium">Completed:</span> {lastRefreshDetails[table.name].endTimeLocal?.slice(-8)}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <TddfJsonActivityHeatMap key={heatMapRefreshKey} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setShowPerformanceTest(false)}
                      >
                        Close Testing Panel
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
      
          <div className="grid grid-cols-1 gap-6 mb-6">
            <DatabaseConnectionSettings />
            {systemInfoQuery.data && (systemInfoQuery.data as any)?.storage?.fallbackMode && (
              <BackupUploadRestore />
            )}
          </div>
          
          <div className="grid grid-cols-1 gap-6 mb-6">
            <S3BackupSettings />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2 h-5 w-5 text-primary" />
                  Database Status
                </CardTitle>
                <CardDescription>
                  Current status of your PostgreSQL database
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Loading database information...</p>
                  </div>
                ) : isError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to fetch database information. {error?.toString()}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Connection:</span>
                      <Badge variant={dbStats?.connectionStatus === "connected" ? "default" : "destructive"}>
                        {dbStats?.connectionStatus === "connected" ? "Connected" : "Error"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">PostgreSQL Version:</span>
                      <span>{dbStats?.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total Tables:</span>
                      <span>{dbStats?.tables.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total Rows:</span>
                      <span>{dbStats?.totalRows.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Database Size:</span>
                      <span>{formatBytes(dbStats?.totalSizeBytes || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Last Backup:</span>
                      <span>{formatDate(dbStats?.lastBackup)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="use-s3-storage"
                      checked={useS3Storage}
                      onCheckedChange={setUseS3Storage}
                    />
                    <Label htmlFor="use-s3-storage">Use S3 cloud storage for backups</Label>
                  </div>
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                        <Info className="h-4 w-4" />
                        <span className="sr-only">More info</span>
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Backup storage options</h4>
                        <p className="text-sm">
                          Backups can be stored locally on the server or in Amazon S3 cloud storage.
                          To use S3, configure your credentials in the S3 Backup Settings section below.
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                
                <Button 
                  className="w-full" 
                  onClick={createBackup} 
                  disabled={isBackingUp || isLoading || isError || (useS3Storage && (!s3ConfigQuery.data || !(s3ConfigQuery.data as any).accessKeyId))}
                >
                  {isBackingUp ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Creating Backup...
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="mr-2 h-4 w-4" />
                      Create Backup {useS3Storage ? "to S3" : "locally"}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <HardDrive className="mr-2 h-5 w-5 text-primary" />
                  Storage Details
                </CardTitle>
                <CardDescription>
                  Database tables and their storage information
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Loading storage details...</p>
                  </div>
                ) : isError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to fetch storage information.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-auto max-h-[320px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Table</TableHead>
                          <TableHead className="text-right">Rows</TableHead>
                          <TableHead className="text-right">Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dbStats?.tables.map((table) => (
                          <TableRow key={table.name}>
                            <TableCell className="font-medium">{table.name}</TableCell>
                            <TableCell className="text-right">{table.rowCount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatBytes(table.sizeBytes)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col space-y-2">
                {isBackingUp && (
                  <div className="w-full space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Backup progress</span>
                      <span>{backupProgress}%</span>
                    </div>
                    <Progress value={backupProgress} className="w-full" />
                  </div>
                )}
                
                {/* Link to view backups page */}
                {!isBackingUp && (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex gap-2 w-full">
                      <Button 
                        className="flex-1" 
                        variant="outline" 
                        onClick={downloadBackup}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download Latest Backup
                      </Button>
                      
                      <Button
                        className="flex-1"
                        variant="outline"
                        onClick={() => navigate("/backups")}
                      >
                        <ArchiveRestore className="mr-2 h-4 w-4" />
                        View Backup Management
                      </Button>
                    </div>
                    
                    {/* Clear TDDF JSON Database Button with Warning Dialog */}
                    <Dialog open={showClearConfirmDialog} onOpenChange={setShowClearConfirmDialog}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          className="w-full"
                          disabled={isClearingTddfJson}
                        >
                          {isClearingTddfJson ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Clearing TDDF Database & Cache...
                            </>
                          ) : (
                            <>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Clear TDDF Database & Cache
                            </>
                          )}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle className="flex items-center text-destructive">
                            <AlertTriangle className="mr-2 h-5 w-5" />
                            Clear TDDF Database & Cache
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="font-medium text-destructive">
                            ⚠️ WARNING: This action cannot be undone!
                          </div>
                          <div>
                            This will permanently delete all TDDF data and cache, including:
                          </div>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            <li>All DT (transaction) records</li>
                            <li>All BH (batch header) records</li>
                            <li>All P1 (purchasing card) records</li>
                            <li>All other TDDF record types</li>
                            <li>All extracted field data</li>
                            <li><strong>All precache tables (heat maps, statistics, charts)</strong></li>
                            <li><strong>All performance cache data</strong></li>
                          </ul>
                          <div className="text-sm text-muted-foreground">
                            You will need to re-process and re-encode your TDDF files to restore this data.
                            All TDDF pages will show empty until new data is processed.
                          </div>
                        </div>
                        <DialogFooter className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowClearConfirmDialog(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={clearTddfJsonDatabase}
                            disabled={isClearingTddfJson}
                          >
                            {isClearingTddfJson ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Clearing...
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Clear Database
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    
                    {/* TDDF Object Storage Report Button */}
                    <TddfObjectStorageReport />
                  </div>
                )}
              </CardFooter>
            </Card>
          </div>
          
          
          <div className="grid grid-cols-1 gap-6">
            <UserManagement />
            <ApiUserManagement />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SchemaVersionInfo />
            <FileProcessingHistory />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <UploaderDataStatus />
            <TddfJsonRecordCounts />
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <HierarchicalTddfMigration />
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <PoolStatus />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}