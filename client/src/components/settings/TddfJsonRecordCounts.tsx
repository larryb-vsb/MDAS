import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Database, Clock, FileJson, Activity } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface TddfJsonRecordCountsData {
  totalRecords: number;
  recordTypes: {
    DT: number;
    BH: number;
    P1: number;
    P2: number;
    E1: number;
    G2: number;
    AD: number;
    DR: number;
    Other: number;
  };
  fromCache: boolean;
  lastRefreshed: string;
  cacheAgeMinutes: number;
  processingTimeMs: number;
  queryTimeMs: number;
  metadata: any;
}

interface RefreshResponse {
  success: boolean;
  totalRecords: number;
  recordTypes: {
    DT: number;
    BH: number;
    P1: number;
    P2: number;
    E1: number;
    G2: number;
    AD: number;
    DR: number;
    Other: number;
  };
  refreshTimeMs: number;
  message: string;
  timestamp: string;
}

export default function TddfJsonRecordCounts() {
  const [refreshKey, setRefreshKey] = useState(0);
  const queryClient = useQueryClient();

  // Query for TDDF JSON record type counts
  const { data: recordCounts, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['/api/settings/tddf-json-record-counts', refreshKey],
    queryFn: async (): Promise<TddfJsonRecordCountsData> => {
      const response = await fetch('/api/settings/tddf-json-record-counts');
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF JSON record counts');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Mutation for refreshing the cache
  const refreshMutation = useMutation({
    mutationFn: async (): Promise<RefreshResponse> => {
      return apiRequest('/api/settings/refresh-tddf-json-record-counts', {
        method: 'POST',
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Cache Refreshed",
        description: `Updated ${data.totalRecords.toLocaleString()} records in ${data.refreshTimeMs}ms`,
      });
      setRefreshKey(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['/api/settings/tddf-json-record-counts'] });
    },
    onError: (error) => {
      toast({
        title: "Refresh Failed",
        description: error instanceof Error ? error.message : "Failed to refresh cache",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  // Format cache age
  const formatCacheAge = (ageMinutes: number) => {
    if (ageMinutes < 1) {
      return "< 1 minute ago";
    } else if (ageMinutes < 60) {
      return `${Math.round(ageMinutes)} minute${Math.round(ageMinutes) !== 1 ? 's' : ''} ago`;
    } else {
      const hours = Math.round(ageMinutes / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
  };

  // Get record type badge color
  const getRecordTypeBadgeColor = (recordType: string) => {
    const colors: { [key: string]: string } = {
      DT: "bg-blue-500",
      BH: "bg-green-500", 
      P1: "bg-purple-500",
      P2: "bg-orange-500",
      E1: "bg-red-500",
      G2: "bg-yellow-500",
      AD: "bg-pink-500",
      DR: "bg-indigo-500",
      Other: "bg-gray-500"
    };
    return colors[recordType] || "bg-gray-500";
  };

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <FileJson className="h-5 w-5" />
            TDDF JSON Record Counts
          </CardTitle>
          <CardDescription>Error loading record type statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-red-600 text-sm">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle>TDDF JSON Record Counts</CardTitle>
              <CardDescription>Complete record type breakdown from TDDF JSON table</CardDescription>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshMutation.isPending || isLoading}
            size="sm"
            className="ml-4"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <Database className="h-5 w-5 mr-2 animate-pulse" />
            Loading record counts...
          </div>
        ) : recordCounts ? (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {recordCounts.totalRecords.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Total Records</div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>Last refreshed {formatCacheAge(recordCounts.cacheAgeMinutes)}</span>
                  {recordCounts.fromCache && (
                    <Badge variant="secondary" className="ml-2">
                      <Activity className="h-3 w-3 mr-1" />
                      Cached
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Record Types Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Record Type</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Percentage</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(recordCounts.recordTypes)
                  .filter(([_, count]) => count > 0)
                  .sort(([_, a], [__, b]) => b - a)
                  .map(([recordType, count]) => {
                    const percentage = ((count / recordCounts.totalRecords) * 100).toFixed(1);
                    const description = {
                      DT: "Detail Transaction Records",
                      BH: "Batch Header Records", 
                      P1: "Purchasing Card Extension 1",
                      P2: "Purchasing Card Extension 2",
                      E1: "Electronic Commerce Records",
                      G2: "General Records Type 2",
                      AD: "Merchant Adjustment Records",
                      DR: "Detail Record Extensions",
                      Other: "Other Record Types"
                    }[recordType] || "Unknown Record Type";

                    return (
                      <TableRow key={recordType}>
                        <TableCell>
                          <Badge className={`${getRecordTypeBadgeColor(recordType)} text-white`}>
                            {recordType}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {percentage}%
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {description}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="text-center p-2">
                <div className="text-lg font-semibold text-green-600">
                  {recordCounts.processingTimeMs}ms
                </div>
                <div className="text-xs text-gray-600">Processing Time</div>
              </div>
              <div className="text-center p-2">
                <div className="text-lg font-semibold text-blue-600">
                  {recordCounts.queryTimeMs}ms
                </div>
                <div className="text-xs text-gray-600">Query Time</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-500 text-center p-4">
            No record count data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}