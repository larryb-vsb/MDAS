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
import { AlertCircle, Database, DownloadCloud, HardDrive, Info, RefreshCw, ScrollText, Server, Trash2, AlertTriangle, Activity, Copy, FileWarning, CheckCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import UserManagement from "@/components/settings/UserManagement";
import ApiUserManagement from "@/components/settings/ApiUserManagement";
import { PoolStatus } from "@/components/settings/PoolStatus";
import DatabaseConnectionSettings from "@/components/settings/DatabaseConnectionSettings";
import HierarchicalTddfMigration from "@/components/migration/HierarchicalTddfMigration";
import MainLayout from "@/components/layout/MainLayout";
import TddfJsonActivityHeatMap from "@/components/tddf/TddfJsonActivityHeatMap";
import RefreshStatusIndicator from "@/components/shared/RefreshStatusIndicator";
import TddfObjectStorageReport from "@/components/reports/TddfObjectStorageReport";

import { useMutation } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

function LogDumpSection() {
  const [selectedMinutes, setSelectedMinutes] = useState<string>("30");
  const [lastDumpResult, setLastDumpResult] = useState<{
    success: boolean;
    storageKey?: string;
    systemLogCount?: number;
    securityLogCount?: number;
    totalSize?: number;
    error?: string;
  } | null>(null);

  const dumpLogsMutation = useMutation({
    mutationFn: async (minutes: number) => {
      const response = await apiRequest('/api/system/dump-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setLastDumpResult({
        success: true,
        storageKey: data.storageKey,
        systemLogCount: data.systemLogCount,
        securityLogCount: data.securityLogCount,
        totalSize: data.totalSize,
      });
      toast({
        title: "Logs Dumped Successfully",
        description: `Exported ${data.systemLogCount} system logs and ${data.securityLogCount} security logs to object storage.`,
      });
    },
    onError: (error: any) => {
      setLastDumpResult({
        success: false,
        error: error.message || "Failed to dump logs",
      });
      toast({
        title: "Log Dump Failed",
        description: error.message || "Failed to dump logs to object storage",
        variant: "destructive",
      });
    },
  });

  const handleDumpLogs = () => {
    dumpLogsMutation.mutate(parseInt(selectedMinutes));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label htmlFor="dump-minutes" className="text-sm font-medium mb-2 block">
            Time Range
          </Label>
          <Select value={selectedMinutes} onValueChange={setSelectedMinutes}>
            <SelectTrigger id="dump-minutes" className="w-full" data-testid="select-dump-minutes">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">Last 5 minutes</SelectItem>
              <SelectItem value="15">Last 15 minutes</SelectItem>
              <SelectItem value="30">Last 30 minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-shrink-0 pt-6">
          <Button
            onClick={handleDumpLogs}
            disabled={dumpLogsMutation.isPending}
            data-testid="button-dump-logs"
          >
            {dumpLogsMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Dumping...
              </>
            ) : (
              <>
                <DownloadCloud className="mr-2 h-4 w-4" />
                Dump Logs
              </>
            )}
          </Button>
        </div>
      </div>

      {lastDumpResult && (
        <div className={`p-4 rounded-lg border ${lastDumpResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          {lastDumpResult.success ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <Info className="h-4 w-4" />
                Log Dump Complete
              </div>
              <div className="text-sm text-green-600 space-y-1">
                <div>System Logs: {lastDumpResult.systemLogCount}</div>
                <div>Security Logs: {lastDumpResult.securityLogCount}</div>
                <div>Total Size: {formatBytes(lastDumpResult.totalSize || 0)}</div>
                <div className="text-xs font-mono bg-green-100 p-2 rounded mt-2 break-all">
                  {lastDumpResult.storageKey}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{lastDumpResult.error}</span>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Logs are saved to object storage in the <code className="bg-muted px-1 rounded">{import.meta.env.MODE === 'production' ? 'prod' : 'dev'}-logs/</code> folder as JSON files.
      </div>
    </div>
  );
}

interface DuplicateFile {
  filename: string;
  uploadCount: number;
  uploadIds: string[];
  uploadTimes: string[];
  firstUpload: string;
  lastUpload: string;
  recordCounts: Record<string, number>;
  totalRecords: number;
  duplicateRecords: number;
}

interface DuplicateFilesResponse {
  success: boolean;
  duplicates: DuplicateFile[];
  summary: {
    filesWithDuplicates: number;
    totalDuplicateUploads: number;
    totalDuplicateRecords: number;
  };
}

function DuplicateFileCleanupSection() {
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showCleanupConfirmDialog, setShowCleanupConfirmDialog] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateFilesResponse | null>(null);
  const [lastCleanupResult, setLastCleanupResult] = useState<{
    success: boolean;
    duplicateFilesRemoved?: number;
    tddfRecordsRemoved?: number;
    error?: string;
  } | null>(null);

  const scanForDuplicates = async () => {
    setIsScanning(true);
    setLastCleanupResult(null);
    
    try {
      const response = await fetch('/api/tddf/duplicate-files');
      if (!response.ok) throw new Error('Failed to scan for duplicates');
      const data = await response.json();
      setDuplicates(data);
      
      if (data.duplicates.length === 0) {
        toast({
          title: "No Duplicates Found",
          description: "All files are unique - no cleanup needed.",
        });
      } else {
        toast({
          title: "Duplicates Found",
          description: `Found ${data.summary.filesWithDuplicates} files with ${(data.summary.totalDuplicateRecords || 0).toLocaleString()} duplicate records.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Failed to scan for duplicates",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const cleanupDuplicates = async () => {
    setIsCleaning(true);
    setShowCleanupConfirmDialog(false);
    
    try {
      const response = await fetch('/api/tddf/cleanup-duplicate-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepOldest: false }), // Keep newest upload
      });
      
      if (!response.ok) throw new Error('Failed to cleanup duplicates');
      const result = await response.json();
      
      setLastCleanupResult({
        success: true,
        duplicateFilesRemoved: result.summary.duplicateFilesRemoved,
        tddfRecordsRemoved: result.summary.tddfRecordsRemoved,
      });
      
      // Clear duplicates list since they're now cleaned up
      setDuplicates(null);
      
      toast({
        title: "Cleanup Complete",
        description: `Removed ${result.summary.duplicateFilesRemoved || 0} duplicate files and ${(result.summary.tddfRecordsRemoved || 0).toLocaleString()} TDDF records.`,
      });
    } catch (error) {
      setLastCleanupResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to cleanup duplicates",
      });
      toast({
        title: "Cleanup Failed",
        description: error instanceof Error ? error.message : "Failed to cleanup duplicates",
        variant: "destructive",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Copy className="mr-2 h-5 w-5 text-orange-500" />
          Duplicate File Cleanup
        </CardTitle>
        <CardDescription>
          Detect and remove duplicate TDDF file uploads and their associated records
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={scanForDuplicates}
            disabled={isScanning || isCleaning}
            variant="outline"
            data-testid="button-scan-duplicates"
          >
            {isScanning ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <FileWarning className="mr-2 h-4 w-4" />
                Scan for Duplicates
              </>
            )}
          </Button>
          
          {duplicates && duplicates.duplicates.length > 0 && (
            <Dialog open={showCleanupConfirmDialog} onOpenChange={setShowCleanupConfirmDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={isScanning || isCleaning}
                  data-testid="button-cleanup-duplicates"
                >
                  {isCleaning ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Cleaning...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Cleanup Duplicates
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center text-destructive">
                    <AlertTriangle className="mr-2 h-5 w-5" />
                    Confirm Duplicate Cleanup
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="font-medium text-destructive">
                    This will permanently delete duplicate records!
                  </div>
                  <div className="text-sm space-y-2">
                    <p>The cleanup will:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Keep the <strong>newest</strong> upload for each file</li>
                      <li>Remove <strong>{duplicates.summary.totalDuplicateUploads || 0}</strong> duplicate file uploads</li>
                      <li>Delete approximately <strong>{(duplicates.summary.totalDuplicateRecords || 0).toLocaleString()}</strong> duplicate TDDF records</li>
                    </ul>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    This action cannot be undone. The newest version of each file will be preserved.
                  </div>
                </div>
                <DialogFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCleanupConfirmDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={cleanupDuplicates}
                    disabled={isCleaning}
                  >
                    {isCleaning ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Cleaning...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clean Up Duplicates
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Last cleanup result */}
        {lastCleanupResult && (
          <Alert variant={lastCleanupResult.success ? "default" : "destructive"}>
            {lastCleanupResult.success ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Cleanup Complete</AlertTitle>
                <AlertDescription>
                  Removed {lastCleanupResult.duplicateFilesRemoved} duplicate file uploads and {lastCleanupResult.tddfRecordsRemoved?.toLocaleString()} TDDF records.
                </AlertDescription>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Cleanup Failed</AlertTitle>
                <AlertDescription>{lastCleanupResult.error}</AlertDescription>
              </>
            )}
          </Alert>
        )}

        {/* Duplicate files table */}
        {duplicates && duplicates.duplicates.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="destructive" className="text-sm">
                {duplicates.summary.filesWithDuplicates} duplicate files found
              </Badge>
              <span className="text-sm text-muted-foreground">
                ~{(duplicates.summary.totalDuplicateRecords || 0).toLocaleString()} extra records
              </span>
            </div>
            
            <div className="overflow-auto max-h-[300px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead className="text-center">Copies</TableHead>
                    <TableHead className="text-right">Extra Records</TableHead>
                    <TableHead className="text-right">First Upload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicates.duplicates.map((dup, index) => (
                    <TableRow key={index} data-testid={`row-duplicate-${index}`}>
                      <TableCell className="font-mono text-xs max-w-[300px] truncate" title={dup.filename}>
                        {dup.filename}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{dup.uploadCount}x</Badge>
                      </TableCell>
                      <TableCell className="text-right text-destructive font-medium">
                        {(dup.duplicateRecords || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDate(dup.firstUpload)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {duplicates && duplicates.duplicates.length === 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>No Duplicates</AlertTitle>
            <AlertDescription>
              All uploaded files are unique. No cleanup is needed.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground">
          Duplicate files occur when the same file is uploaded multiple times. Cleanup removes older uploads and their TDDF records, keeping only the newest version.
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const [_, navigate] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  
  // Fetch system information
  const systemInfoQuery = useQuery({
    queryKey: ["/api/system/info"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Fetch schema version information - only when Settings page is in view
  const schemaVersionQuery = useQuery<{
    currentVersion: { version: string; appliedAt: string } | null;
    expectedVersion: string;
    tracking: {
      dev: { timestamp: string; version: string; notes: string } | null;
      prod: { timestamp: string; version: string; notes: string } | null;
      environment: string;
    } | null;
  }>({
    queryKey: ["/api/schema/versions"],
    staleTime: 1000 * 60 * 2, // 2 minutes - schema changes frequently
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: true, // Only fetch when Settings page is opened
  });
  
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
                  <span>Merchant Datawarehouse and Automation System (MDAS)</span>
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
                {/* Schema Version Grid - Show both Dev and Prod */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Development Schema */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          Development
                        </Badge>
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          Auto-tracked
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <span className="text-xs text-muted-foreground">Version:</span>
                          {schemaVersionQuery.isLoading ? (
                            <div className="text-sm mt-0.5">Loading...</div>
                          ) : schemaVersionQuery.data?.tracking?.dev?.version ? (
                            <div className="font-semibold text-sm mt-0.5">
                              v{schemaVersionQuery.data.tracking.dev.version}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground mt-0.5">Not recorded</div>
                          )}
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Last Change:</span>
                          {schemaVersionQuery.isLoading ? (
                            <div className="text-sm mt-0.5">Loading...</div>
                          ) : schemaVersionQuery.data?.tracking?.dev?.timestamp ? (
                            <div className="text-xs mt-0.5">
                              {new Date(schemaVersionQuery.data.tracking.dev.timestamp).toLocaleString()}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-0.5">Not recorded</div>
                          )}
                        </div>
                        {schemaVersionQuery.data?.tracking?.dev?.notes && (
                          <div>
                            <span className="text-xs text-muted-foreground">Last Event:</span>
                            <div className="text-xs mt-0.5 font-mono text-blue-600">
                              {schemaVersionQuery.data.tracking.dev.notes}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Production Schema */}
                    <div className="space-y-2 border-l pl-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          Production
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <span className="text-xs text-muted-foreground">Version:</span>
                          {schemaVersionQuery.isLoading ? (
                            <div className="text-sm mt-0.5">Loading...</div>
                          ) : schemaVersionQuery.data?.tracking?.prod?.version ? (
                            <div className="font-semibold text-sm mt-0.5">
                              v{schemaVersionQuery.data.tracking.prod.version}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground mt-0.5">Not synced</div>
                          )}
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Last Synced:</span>
                          {schemaVersionQuery.isLoading ? (
                            <div className="text-sm mt-0.5">Loading...</div>
                          ) : schemaVersionQuery.data?.tracking?.prod?.timestamp ? (
                            <div className="text-xs mt-0.5">
                              {new Date(schemaVersionQuery.data.tracking.prod.timestamp).toLocaleString()}
                            </div>
                          ) : (
                            <div className="text-xs text-orange-600 mt-0.5">Never synced</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
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
                                  } else {
                                    throw new Error(result.error || 'Failed to build pre-cache');
                                  }
                                } catch (error) {
                                  toast({
                                    title: "Pre-cache build failed",
                                    description: error instanceof Error ? error.message : 'Unknown error',
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

          {/* Log Dump to Object Storage Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DownloadCloud className="mr-2 h-5 w-5 text-primary" />
                Log Dump to Object Storage
              </CardTitle>
              <CardDescription>
                Export system and security logs to object storage for analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogDumpSection />
            </CardContent>
          </Card>

          {/* Duplicate File Cleanup Section */}
          <DuplicateFileCleanupSection />
      
          <div className="grid grid-cols-1 gap-6 mb-6">
            <DatabaseConnectionSettings />
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
                  </div>
                )}
              </CardContent>
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
                <div className="flex flex-col gap-2 w-full">
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
              </CardFooter>
            </Card>
          </div>
          
          
          <div className="grid grid-cols-1 gap-6">
            <UserManagement />
            <ApiUserManagement />
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