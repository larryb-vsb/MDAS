import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Timer, TrendingUp, Database, Clock, CheckCircle, AlertTriangle, Calendar } from "lucide-react";

interface ProcessingStats {
  id: number;
  job_id: string;
  year: number;
  month: number;
  record_type: string;
  started_at: string;
  completed_at: string | null;
  processing_time_ms: number | null;
  record_count: number;
  records_per_second: string;
  cache_entries_created: number;
  status: string;
  error_message: string | null;
  job_started_at: string | null;
  job_completed_at: string | null;
  total_months_in_job: number;
  job_status: string;
  database_query_time_ms: number | null;
  cache_write_time_ms: number | null;
  memory_usage_mb: string | null;
  server_id: string | null;
  environment: string;
  created_at: string;
  updated_at: string;
}

interface ProcessingStatsResponse {
  success: boolean;
  stats: ProcessingStats[];
  count: number;
}

export function HeatMapProcessingStats() {
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [limit, setLimit] = useState<string>("50");
  
  const { data, isLoading, error, refetch } = useQuery<ProcessingStatsResponse>({
    queryKey: ['/api/heat-map-cache/processing-stats', selectedYear, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedYear !== "all") {
        params.append('year', selectedYear);
      }
      params.append('limit', limit);
      
      const response = await fetch(`/api/heat-map-cache/processing-stats?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch processing stats');
      return response.json();
    },
    refetchInterval: 5000 // Refresh every 5 seconds
  });

  const formatDuration = (ms: number | null) => {
    if (!ms) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>;
      case 'building':
        return <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-200">
          <Timer className="h-3 w-3 mr-1" />
          Building
        </Badge>;
      case 'error':
        return <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Error
        </Badge>;
      case 'pending':
        return <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Heat Map Processing Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-sm text-muted-foreground">Loading processing statistics...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Heat Map Processing Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-600 p-4">
            Error loading processing statistics: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Heat Map Processing Statistics
        </CardTitle>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Year:</label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Limit:</label>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {data?.stats && data.stats.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stats.map((stat) => (
                  <TableRow key={stat.id}>
                    <TableCell className="font-mono text-xs">
                      {stat.job_id.split('_').pop()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {stat.year}-{stat.month.toString().padStart(2, '0')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(stat.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {stat.record_count.toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDuration(stat.processing_time_ms)}
                    </TableCell>
                    <TableCell>
                      {stat.records_per_second && parseFloat(stat.records_per_second) > 0 
                        ? `${parseFloat(stat.records_per_second).toLocaleString()}/s`
                        : "N/A"
                      }
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTimestamp(stat.started_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {stat.completed_at ? formatTimestamp(stat.completed_at) : "In Progress"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center text-muted-foreground p-8">
            No processing statistics found.
          </div>
        )}
        
        {data?.stats && data.stats.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {data.count} records {selectedYear !== "all" && `for ${selectedYear}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}