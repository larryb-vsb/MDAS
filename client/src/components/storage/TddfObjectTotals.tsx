import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, FileText, Clock, Activity, BarChart3, HardDrive, Search, RefreshCw } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TddfObjectTotalsData {
  success: boolean;
  data?: {
    scanInfo: {
      lastScanDate: string;
      scanCompletionTime: string;
      scanStatus: string;
      scanDurationSeconds: number;
      cacheExpiresAt: string;
      isExpired: boolean;
    };
    storageStats: {
      totalObjects: number;
      analyzedObjects: number;
      analysisPercentage: string;
      totalFileSize: number;
      totalFileSizeGB: string;
    };
    recordStats: {
      totalRecords: number;
      jsonbCount?: number;
      jsonbCountSource?: string;
      averageRecordsPerFile: number;
      largestFileRecords: number;
      largestFileName: string;
      recordTypeBreakdown: Record<string, number>;
      recordTypeBreakdownFromCache?: Record<string, number>;
    };
    dataSources?: {
      storageStats: string;
      jsonbCount: string;
      recordTypeBreakdown: string;
    };
  };
  cache?: {
    lastUpdated: string;
    expiresAt: string;
    isExpired: boolean;
  };
  requiresScan?: boolean;
  message?: string;
}

export default function TddfObjectTotals() {
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for TDDF Object Totals data
  const { data: objectTotals, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/storage/tddf-object-totals'],
    queryFn: async (): Promise<TddfObjectTotalsData> => {
      const response = await fetch('/api/storage/tddf-object-totals');
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF object totals');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Start scan mutation
  const startScanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/storage/start-scan', {
        method: 'POST'
      });
    },
    onSuccess: () => {
      setLastScanTime(new Date());
      setCooldownTimeLeft(8 * 60); // 8 minutes in seconds
      toast({
        title: "Scan Started",
        description: "TDDF object totals scan has been initiated. Results will be updated when complete.",
      });
      // Refetch data after a short delay
      setTimeout(() => {
        refetch();
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to start TDDF object totals scan",
        variant: "destructive",
      });
    }
  });

  // Cooldown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (cooldownTimeLeft > 0) {
      interval = setInterval(() => {
        setCooldownTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cooldownTimeLeft]);

  // Format cooldown time
  const formatCooldown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <HardDrive className="h-5 w-5 text-purple-600" />
            <CardTitle>TDDF Object Totals</CardTitle>
          </div>
          <CardDescription>Loading comprehensive storage analytics...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="animate-pulse bg-gray-200 h-4 rounded w-3/4"></div>
            <div className="animate-pulse bg-gray-200 h-4 rounded w-1/2"></div>
            <div className="animate-pulse bg-gray-200 h-4 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !objectTotals?.success) {
    return (
      <Card className="w-full border-orange-200 bg-orange-50">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <HardDrive className="h-5 w-5 text-orange-600" />
            <CardTitle className="text-orange-800">TDDF Object Totals</CardTitle>
          </div>
          <CardDescription className="text-orange-700">
            {objectTotals?.requiresScan 
              ? "No scan data available - cache needs to be populated"
              : "Error loading storage analytics"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-orange-700">
            <Database className="h-4 w-4" />
            <span>{objectTotals?.message || error?.message || "Unable to load data"}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { data } = objectTotals;
  if (!data) return null;

  // Get scan status badge color
  const getScanStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Sort record types by count for display - prioritize pre-cached JSONB data
  const sortedRecordTypes = (() => {
    // Use detailed record type breakdown from pre-cached JSONB data if available
    const breakdown = data.recordStats.recordTypeBreakdownFromCache && Object.keys(data.recordStats.recordTypeBreakdownFromCache).length > 0
      ? data.recordStats.recordTypeBreakdownFromCache
      : data.recordStats.recordTypeBreakdown;
    
    const total = data.recordStats.jsonbCount || data.recordStats.totalRecords;
    
    return Object.entries(breakdown)
      .filter(([type, count]) => Number(count) > 0) // Only show types with counts > 0
      .sort(([,a], [,b]) => Number(b) - Number(a))
      .map(([type, count]) => ({
        type,
        count: Number(count),
        percentage: ((Number(count) / total) * 100).toFixed(1)
      }));
  })();

  // Get record type description with dynamic discovery
  const getRecordTypeDescription = (type: string) => {
    const descriptions: Record<string, string> = {
      'DT': 'Detail Transaction',
      'G2': 'General 2',
      'E1': 'Electronic Check',
      'BH': 'Batch Header',
      'P1': 'Purchasing Card 1',
      'P2': 'Purchasing Card 2',
      'DR': 'Detail Record (Non-standard)',
      'AD': 'Adjustment',
      'MG': 'Merchant General Data',
      'MG2': 'Merchant General Data 2',
      'LG': 'Lodge Extension',
      'EC': 'Electronic Check Extension',
      'DM': 'Direct Marketing Extension'
    };
    return descriptions[type] || `Record Type ${type}`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <HardDrive className="h-5 w-5 text-purple-600" />
            <CardTitle>TDDF Object Totals</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={getScanStatusColor(data.scanInfo.scanStatus)}>
              {data.scanInfo.scanStatus}
            </Badge>
            <Button
              onClick={() => startScanMutation.mutate()}
              disabled={startScanMutation.isPending || cooldownTimeLeft > 0}
              size="sm"
              variant="outline"
            >
              {startScanMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : cooldownTimeLeft > 0 ? (
                <>
                  <Clock className="h-4 w-4 mr-2" />
                  {formatCooldown(cooldownTimeLeft)}
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Start Scan
                </>
              )}
            </Button>
          </div>
        </div>
        <CardDescription>
          Comprehensive storage analytics with record type breakdown
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scan Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-blue-600" />
            <div className="text-sm">
              <div className="font-medium">Scan Started</div>
              <div className="text-gray-600">
                {format(new Date(data.scanInfo.lastScanDate), 'MMM d, yyyy h:mm a')}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-green-600" />
            <div className="text-sm">
              <div className="font-medium">Scan Completed</div>
              <div className="text-gray-600">
                {format(new Date(data.scanInfo.scanCompletionTime), 'MMM d, yyyy h:mm a')}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-orange-600" />
            <div className="text-sm">
              <div className="font-medium">Scan Duration</div>
              <div className="text-gray-600">{data.scanInfo.scanDurationSeconds}s</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Database className="h-4 w-4 text-purple-600" />
            <div className="text-sm">
              <div className="font-medium">Cache Status</div>
              <div className="text-gray-600">
                {data.scanInfo?.isExpired ? 'Expired' : 'Valid'}
              </div>
            </div>
          </div>
        </div>

        {/* Storage Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-800">
              {data.storageStats.totalObjects.toLocaleString()}
            </div>
            <div className="text-sm text-blue-600">Total Objects</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-800">
              {data.storageStats.analyzedObjects.toLocaleString()}
            </div>
            <div className="text-sm text-green-600">
              Analyzed ({data.storageStats.analysisPercentage}%)
            </div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-800">
              {data.recordStats.totalRecords.toLocaleString()}
            </div>
            <div className="text-sm text-purple-600">Total Records</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-800">
              {data.recordStats.jsonbCount?.toLocaleString() || 'Loading...'}
            </div>
            <div className="text-sm text-green-600">Encoded Records</div>
            <div className="bg-green-600 text-white px-2 py-1 rounded text-xs font-semibold mt-2">
              JSONB COUNT
            </div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-orange-800">
              {data.storageStats.totalFileSizeGB} GB
            </div>
            <div className="text-sm text-orange-600">Storage Size</div>
          </div>
        </div>

        {/* Record Type Breakdown */}
        <div>
          <div className="flex items-center space-x-2 mb-4">
            <BarChart3 className="h-4 w-4 text-gray-600" />
            <h3 className="text-lg font-medium">Record Type Breakdown</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecordTypes.map(({ type, count, percentage }) => (
                <TableRow key={type}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {getRecordTypeDescription(type)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="bg-green-50 px-2 py-1 rounded border border-green-200">
                      <span className="text-green-800 font-semibold">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">
                      {percentage}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Additional Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-gray-600" />
            <div className="text-sm">
              <div className="font-medium">Average Records/File</div>
              <div className="text-gray-600">
                {Math.round(data.recordStats.averageRecordsPerFile).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Database className="h-4 w-4 text-gray-600" />
            <div className="text-sm">
              <div className="font-medium">Largest File</div>
              <div className="text-gray-600 truncate max-w-xs" title={data.recordStats.largestFileName}>
                {data.recordStats.largestFileRecords.toLocaleString()} records
              </div>
            </div>
          </div>
        </div>

        {/* Cache Information and Data Sources */}
        {data.scanInfo?.cacheExpiresAt && (
          <div className="pt-4 border-t space-y-2">
            <div className="text-xs text-gray-500">
              Cache expires: {formatDistanceToNow(new Date(data.scanInfo.cacheExpiresAt), { addSuffix: true })}
            </div>
            {data.dataSources && (
              <div className="text-xs text-gray-500">
                <div className="font-medium mb-1">Pre-cached Data Sources:</div>
                <div className="space-y-1 ml-2">
                  <div>• Storage Stats: <code className="text-blue-600">{data.dataSources.storageStats}</code></div>
                  <div>• JSONB Count: <code className="text-blue-600">{data.dataSources.jsonbCount}</code></div>
                  <div>• Record Types: <code className="text-blue-600">{data.dataSources.recordTypeBreakdown}</code></div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}