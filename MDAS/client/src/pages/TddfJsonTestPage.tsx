import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Database, TestTube } from 'lucide-react';
import TddfJsonActivityHeatMap from '@/components/tddf/TddfJsonActivityHeatMap';
import MainLayout from '@/components/layout/MainLayout';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';

interface TddfStatsResponse {
  totalRecords: number;
  uniqueFiles: number;
  recordTypeBreakdown: Record<string, number>;
  dateRange: {
    earliest: string;
    latest: string;
  };
}

export default function TddfJsonTestPage() {
  const [dateFilter, setDateFilter] = useState<string>('');
  const queryClient = useQueryClient();

  // Fetch TDDF JSON statistics for testing
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<TddfStatsResponse>({
    queryKey: ['/api/tddf-json/stats'],
    queryFn: () => apiRequest('/api/tddf-json/stats'),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const handleDateSelect = (date: string) => {
    console.log('[TDDF-JSON-TEST-PAGE] Date selected for filtering:', date);
    console.log('[TDDF-JSON-TEST-PAGE] Previous dateFilter:', dateFilter);
    setDateFilter(date);
  };

  const clearDateFilter = () => {
    console.log('[TDDF-JSON-TEST-PAGE] Clearing date filter');
    setDateFilter('');
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy');
    } catch {
      return dateStr;
    }
  };

  // Add debug=true to URL for testing
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('debug')) {
      url.searchParams.set('debug', 'true');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <TestTube className="w-8 h-8 text-blue-600" />
              TDDF JSON Heat Map Test Page
            </h1>
            <p className="text-muted-foreground">
              Testing page with debug logging enabled - Check browser console for detailed logs
            </p>
            <div className="mt-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                Debug Mode: Enabled
              </Badge>
            </div>
          </div>
          <Button 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/tddf-json'] });
              queryClient.invalidateQueries({ queryKey: ['/api/tddf-json/stats'] });
              queryClient.invalidateQueries({ queryKey: ['/api/tddf-json/activity'] });
            }} 
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Data
          </Button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? '...' : stats?.totalRecords?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                From {stats?.uniqueFiles || 0} files
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Date Range
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {statsLoading ? '...' : 
                 stats?.dateRange ? 
                   `${formatDate(stats.dateRange.earliest)} - ${formatDate(stats.dateRange.latest)}` : 
                   'No data'
                }
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Current Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {dateFilter ? formatDate(dateFilter) : 'No filter applied'}
              </div>
              {dateFilter && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearDateFilter}
                  className="text-xs mt-2"
                >
                  Clear Filter
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* TDDF JSON Activity Heat Map with Debug Logging */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              TDDF JSON Activity Heat Map (Debug Mode)
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Click on any day to test date selection functionality - check browser console for debug logs
            </p>
          </CardHeader>
          <CardContent>
            <TddfJsonActivityHeatMap 
              onDateSelect={handleDateSelect}
              selectedDate={dateFilter}
              enableDebugLogging={true}
            />
            {dateFilter && (
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="secondary">
                  Filtered by: {formatDate(dateFilter)}
                </Badge>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearDateFilter}
                  className="text-xs"
                >
                  Clear Filter
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debug Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-2 font-mono">
              <div><strong>Current URL:</strong> {window.location.href}</div>
              <div><strong>Debug Parameter:</strong> {new URLSearchParams(window.location.search).get('debug') || 'Not set'}</div>
              <div><strong>Selected Date:</strong> {dateFilter || 'None'}</div>
              <div><strong>Stats Loading:</strong> {statsLoading.toString()}</div>
              <div><strong>Stats Error:</strong> {statsError ? 'Yes' : 'No'}</div>
            </div>
            <div className="mt-3 p-3 bg-gray-50 rounded text-xs">
              <strong>Instructions:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Open browser developer console (F12)</li>
                <li>Click on any day in the heat map above</li>
                <li>Watch for debug log messages with [TDDF-JSON-HEATMAP] and [TDDF-JSON-TEST-PAGE] prefixes</li>
                <li>Compare with production TDDF JSON page which has no debug logging</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}