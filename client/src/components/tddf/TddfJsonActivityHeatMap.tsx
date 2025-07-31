import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X, RefreshCw, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ActivityData {
  transaction_date: string;
  transaction_count: number;
  aggregation_level?: string;
}

interface ActivityResponse {
  records: ActivityData[];
  queryTime: number;
  fromCache?: boolean;
  cacheInfo?: {
    tableName: string;
    recordCount: number;
    totalTransactions: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
    lastUpdated: string;
    ageMinutes: number;
  };
  metadata?: {
    year: number;
    recordType: string;
    totalRecords: number;
    aggregationLevel: string;
    recordCount: number;
    cacheStatus?: string;
    performanceMetrics: {
      sizeCheckTime?: number;
      aggregationTime?: number;
      totalQueryTime: number;
    };
  };
}

interface DaySquareProps {
  date: Date;
  activity?: ActivityData;
  isCurrentMonth?: boolean;
  onDateSelect?: (date: string) => void;
  selectedDates?: string[];
}

const DaySquare: React.FC<DaySquareProps> = ({ date, activity, isCurrentMonth = true, onDateSelect, selectedDates = [] }) => {
  const count = activity?.transaction_count || 0;
  const dateString = date.toISOString().split('T')[0];
  const isSelected = selectedDates.includes(dateString);
  
  // Updated gradient mapping for higher transaction volumes
  const getBackgroundColor = (count: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    // Low activity: 1-2000 transactions (Green)
    if (count <= 2000) {
      if (count <= 500) return 'bg-green-100 hover:bg-green-200';
      if (count <= 1000) return 'bg-green-300 hover:bg-green-400';
      if (count <= 1500) return 'bg-green-500 hover:bg-green-600';
      return 'bg-green-700 hover:bg-green-800';
    }
    
    // Medium activity: 2001-4000 transactions (Blue)
    if (count <= 4000) {
      if (count <= 2500) return 'bg-blue-300 hover:bg-blue-400';
      if (count <= 3000) return 'bg-blue-500 hover:bg-blue-600';
      if (count <= 3500) return 'bg-blue-700 hover:bg-blue-800';
      return 'bg-blue-900 hover:bg-blue-950';
    }
    
    // High activity: 4001-6000 transactions (Purple)
    if (count <= 6000) {
      if (count <= 4500) return 'bg-purple-400 hover:bg-purple-500';
      if (count <= 5000) return 'bg-purple-600 hover:bg-purple-700';
      if (count <= 5500) return 'bg-purple-700 hover:bg-purple-800';
      return 'bg-purple-800 hover:bg-purple-900';
    }
    
    // Very high activity: 6001-10000+ transactions (Red/Pink)
    if (count <= 10000) {
      if (count <= 7000) return 'bg-red-400 hover:bg-red-500';
      if (count <= 8000) return 'bg-red-600 hover:bg-red-700';
      if (count <= 9000) return 'bg-red-700 hover:bg-red-800';
      return 'bg-red-800 hover:bg-red-900';
    }
    
    // Extremely high activity: 10000+ transactions (Pink)
    return 'bg-pink-600 hover:bg-pink-700';
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleClick = () => {
    if (onDateSelect) {
      console.log('[TDDF-JSON-HEATMAP] Clicking date square:', dateString);
      console.log('[TDDF-JSON-HEATMAP] Date object:', date);
      console.log('[TDDF-JSON-HEATMAP] Activity data:', activity);
      onDateSelect(dateString);
    }
  };

  return (
    <div
      className={`w-4 h-4 rounded-sm relative group transition-all duration-200 ${getBackgroundColor(count, isSelected)} ${!isCurrentMonth ? 'opacity-30' : ''} cursor-pointer`}
      title={`${formatDate(date)}: ${count} JSON records (Click to filter)`}
      onClick={handleClick}
    />
  );
};

interface TddfJsonActivityHeatMapProps {
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
  enableDebugLogging?: boolean;
  userId?: number;
  isAdmin?: boolean;
}

interface HeatMapCacheStatus {
  isProcessing: boolean;
  currentMonth: string | null;
  canRefresh: boolean;
  cooldownMinutes: number;
}

const TddfJsonActivityHeatMap: React.FC<TddfJsonActivityHeatMapProps> = ({ 
  onDateSelect, 
  selectedDate, 
  enableDebugLogging = false,
  userId,
  isAdmin = false
}) => {
  const [currentYear, setCurrentYear] = useState(2024); // Start with 2024 where most data exists (134,870 transactions)
  const [internalSelectedDates, setInternalSelectedDates] = useState<string[]>([]);
  // Removed old refresh state - now using admin controls
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Use internal state if no external state is provided
  const selectedDates = selectedDate ? [selectedDate] : internalSelectedDates;
  
  // Heat map cache status query
  const { data: cacheStatus } = useQuery<HeatMapCacheStatus>({
    queryKey: ['/api/heat-map-cache/status'],
    refetchInterval: 10000, // Update every 10 seconds
    enabled: isAdmin
  });
  
  // Admin refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/heat-map-cache/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ year: currentYear })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to refresh heat map cache');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Cache Refresh Started",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/heat-map-cache/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf-json/activity'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const handleDateSelect = (date: string) => {
    if (enableDebugLogging) {
      console.log('[TDDF-JSON-HEATMAP] Date selected:', date);
      console.log('[TDDF-JSON-HEATMAP] onDateSelect callback:', !!onDateSelect);
    }
    
    if (onDateSelect) {
      onDateSelect(date);
    } else {
      // Toggle date selection in internal state
      setInternalSelectedDates(prev => {
        if (prev.includes(date)) {
          return prev.filter(d => d !== date);
        } else {
          return [...prev, date];
        }
      });
    }
  };
  
  const clearSelection = () => {
    if (onDateSelect) {
      onDateSelect('');
    } else {
      setInternalSelectedDates([]);
    }
  };
  
  // Admin-only refresh handler
  const handleAdminRefresh = () => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only administrators can refresh the heat map cache",
        variant: "destructive",
      });
      return;
    }
    
    refreshMutation.mutate();
  };
  
  // Get processing status to show current month being processed
  const { data: processingStatus } = useQuery({
    queryKey: ['/api/heat-map-cache/processing-status'],
    queryFn: async () => {
      const response = await fetch('/api/heat-map-cache/processing-status', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch processing status');
      return response.json();
    },
    refetchInterval: 2000, // Check every 2 seconds for processing updates
    enabled: true
  });

  const { data: activityResponse, isLoading, error, isFetching } = useQuery<ActivityResponse>({
    queryKey: ['/api/tddf-json/activity', currentYear, 'DT'],
    queryFn: async () => {
      const response = await fetch(`/api/tddf-json/activity?year=${currentYear}&recordType=DT`, {
        credentials: 'include' // Add authentication credentials
      });
      if (!response.ok) throw new Error('Failed to fetch activity data');
      return response.json();
    },
    enabled: true,
    staleTime: Infinity, // Never refresh automatically - "never re-fresh" policy
    gcTime: Infinity, // Keep in cache forever (React Query v5 syntax)
    refetchOnWindowFocus: false, // Never refetch on window focus
    refetchOnMount: false, // Never refetch on component mount
    refetchOnReconnect: false, // Never refetch on network reconnect
    refetchInterval: false, // Never refetch on interval
  });

  // Conditional debug logging based on enableDebugLogging flag
  if (enableDebugLogging) {
    console.log('[TDDF-JSON-HEATMAP] Activity response:', activityResponse);
    console.log('[TDDF-JSON-HEATMAP] Current year:', currentYear);
    console.log('[TDDF-JSON-HEATMAP] Loading:', isLoading);
    console.log('[TDDF-JSON-HEATMAP] Error:', error);
  }

  // Create a map for quick lookup of activity data by date
  const activityMap = new Map<string, ActivityData>();
  if (activityResponse?.records) {
    activityResponse.records.forEach(item => {
      // Handle both formats: transaction_date field or date field (pre-cache uses 'date')
      const dateStr = item.transaction_date?.split('T')[0] || (item as any).date;
      if (dateStr) {
        activityMap.set(dateStr, {
          transaction_date: dateStr,
          transaction_count: item.transaction_count || (item as any).transaction_count
        });
      }
    });
  }

  // Generate calendar data for the current year
  const calendarData = useMemo(() => {
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);
    const days = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split('T')[0];
      days.push({
        date: new Date(d),
        activity: activityMap.get(dateString)
      });
    }
    
    return days;
  }, [currentYear, activityMap]);

  // Group days by month for better layout
  const monthlyData = useMemo(() => {
    const months = [];
    for (let month = 0; month < 12; month++) {
      const monthDays = calendarData.filter(day => day.date.getMonth() === month);
      months.push({
        name: new Date(currentYear, month).toLocaleDateString('en-US', { month: 'short' }),
        days: monthDays
      });
    }
    return months;
  }, [calendarData, currentYear]);

  // Calculate stats with enhanced metadata support
  const totalDays = activityResponse?.records?.length || 0;
  const totalTransactions = activityResponse?.records?.reduce((sum, record) => sum + record.transaction_count, 0) || 0;
  const maxDaily = activityResponse?.records?.reduce((max, record) => Math.max(max, record.transaction_count), 0) || 0;
  
  // Extract metadata for performance insights
  const metadata = activityResponse?.metadata;
  const aggregationLevel = metadata?.aggregationLevel || 'daily';
  const totalRecords = metadata?.totalRecords || 0;
  const queryTime = metadata?.performanceMetrics?.totalQueryTime || activityResponse?.queryTime || 0;
  const fromCache = activityResponse?.fromCache || false;

  // Show enhanced loading message for large dataset processing
  if (isLoading && !activityResponse) {
    const currentProcessingMonth = processingStatus?.isProcessing ? processingStatus.currentMonth : null;
    const progressPct = processingStatus?.progress?.percentage || 0;
    const avgMonthTime = processingStatus?.processingStats?.averageTimePerMonth;
    const recordsProcessed = processingStatus?.processingStats?.recordsProcessed || 0;
    
    return (
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex flex-col items-center justify-center py-8 space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <div className="text-center">
            {currentProcessingMonth ? (
              <>
                <div className="font-medium text-gray-900">Building Cache: {currentProcessingMonth}</div>
                <div className="text-sm text-gray-500 mt-1">
                  Processing month {currentProcessingMonth} ({progressPct}% complete)
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {avgMonthTime > 0 
                    ? `Average processing time: ${Math.round(avgMonthTime / 1000)}s per month`
                    : 'Building heat map cache month-by-month for optimal performance'
                  }
                </div>
                {recordsProcessed > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    {recordsProcessed.toLocaleString()} records processed so far
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="font-medium text-gray-900">Processing Complete Dataset</div>
                <div className="text-sm text-gray-500 mt-1">
                  Loading 2.7M+ transaction records - Please wait up to 10 minutes
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  Bypassing incomplete pre-cache for accurate results
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show processing status when refreshing with data already present
  if (isFetching && activityResponse) {
    return (
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex flex-col items-center justify-center py-8 space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <div className="text-center">
            <div className="font-medium text-gray-900">Refreshing Heat Map Cache</div>
            <div className="text-sm text-gray-500 mt-1">
              Processing {totalRecords ? totalRecords.toLocaleString() : '2.7M+'} transaction records
            </div>
            <div className="text-xs text-gray-400 mt-2">
              {aggregationLevel === 'monthly' ? 'Using monthly aggregation for large dataset' : 'Processing data...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 text-sm">Failed to load TDDF JSON activity data</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      {/* Header with year navigation and cache refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentYear(prev => prev - 1)}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold">{currentYear}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentYear(prev => prev + 1)}
            disabled={currentYear >= new Date().getFullYear()}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          {/* Cache Refresh Button */}
          {isAdmin ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAdminRefresh}
                disabled={refreshMutation.isPending || !cacheStatus?.canRefresh}
                className={`ml-4 h-8 px-3 text-xs ${!cacheStatus?.canRefresh ? 'bg-orange-50 text-orange-600 border-orange-200' : 'hover:bg-green-50'}`}
                title={cacheStatus?.canRefresh ? `Admin refresh for ${currentYear}` : `Cooldown: ${cacheStatus?.cooldownMinutes}m remaining`}
              >
                {cacheStatus?.canRefresh ? (
                  <RefreshCw className={`h-3 w-3 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                ) : (
                  <Clock className="h-3 w-3 mr-1" />
                )}
                {cacheStatus?.canRefresh ? `Refresh ${currentYear}` : `Cooldown (${cacheStatus?.cooldownMinutes}m)`}
              </Button>
              {cacheStatus?.isProcessing && cacheStatus.currentMonth && (
                <div className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded border border-blue-200">
                  Processing: {cacheStatus.currentMonth}
                </div>
              )}
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="ml-4 h-8 px-3 text-xs bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
              title="Only administrators can refresh cache"
            >
              <Shield className="h-3 w-3 mr-1" />
              Admin Only
            </Button>
          )}

        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span 
            title={`${totalTransactions?.toLocaleString() || 0} total transactions across ${totalDays} ${aggregationLevel === 'daily' ? 'days' : `${aggregationLevel} periods`}`}
            className="cursor-help"
          >
            {totalDays} active {aggregationLevel === 'daily' ? 'days' : `${aggregationLevel} periods`}
          </span>
          {totalRecords > 100000 && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              {aggregationLevel} aggregation
            </span>
          )}
          
          {/* Visual Cache State Indicator */}
          <div className="flex items-center gap-1">
            {isFetching ? (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-blue-600 font-medium text-xs">Loading...</span>
              </div>
            ) : fromCache ? (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  Cached
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                  Fresh data
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cache Information Display */}
      {activityResponse?.cacheInfo && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h5 className="font-medium text-blue-900">Cache Status</h5>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-blue-700 font-medium">Using Cached Data</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-blue-600">Cache Table:</span>
              <div className="font-mono text-blue-800">{activityResponse.cacheInfo.tableName}</div>
            </div>
            <div>
              <span className="text-blue-600">Query Time:</span>
              <div className="font-medium text-blue-800">{queryTime}ms</div>
            </div>
            <div>
              <span className="text-blue-600">Date Range:</span>
              <div className="font-medium text-blue-800">
                {activityResponse.cacheInfo.dateRange.earliest} to {activityResponse.cacheInfo.dateRange.latest}
              </div>
            </div>
            <div>
              <span className="text-blue-600">Total Days:</span>
              <div className="font-medium text-blue-800">
                {activityResponse.cacheInfo.recordCount} cached days
              </div>
            </div>
            <div>
              <span className="text-blue-600">Cache Created:</span>
              <div className="font-medium text-blue-800">
                {new Date(activityResponse.cacheInfo.lastUpdated).toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-blue-600">Cache Age:</span>
              <div className="font-medium text-blue-800">
                {activityResponse.cacheInfo.ageMinutes < 60 
                  ? `${Math.round(activityResponse.cacheInfo.ageMinutes)}m old`
                  : `${Math.round(activityResponse.cacheInfo.ageMinutes / 60)}h old`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="space-y-2">
        {/* Month labels */}
        <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium">
          {monthlyData.map((month, index) => (
            <div key={index} className="text-center">{month.name}</div>
          ))}
        </div>
        
        {/* Days grid */}
        <div className="grid grid-cols-12 gap-2">
          {monthlyData.map((month, monthIndex) => (
            <div key={monthIndex} className="space-y-1">
              {/* Create weeks for this month */}
              {Array.from({ length: Math.ceil(month.days.length / 7) }, (_, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-1">
                  {month.days.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => (
                    <DaySquare
                      key={`${monthIndex}-${weekIndex}-${dayIndex}`}
                      date={day.date}
                      activity={day.activity}
                      onDateSelect={handleDateSelect}
                      selectedDates={selectedDates}
                    />
                  ))}
                  {/* Fill empty spots in the last week */}
                  {month.days.slice(weekIndex * 7, (weekIndex + 1) * 7).length < 7 &&
                    Array.from({ length: 7 - month.days.slice(weekIndex * 7, (weekIndex + 1) * 7).length }, (_, i) => (
                      <div key={`empty-${i}`} className="w-4 h-4" />
                    ))
                  }
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-gray-100 rounded-sm"></div>
            <div className="w-3 h-3 bg-green-200 rounded-sm"></div>
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-purple-600 rounded-sm"></div>
          </div>
          <span>More</span>
        </div>
        <div>
          Peak: {maxDaily.toLocaleString()} transactions/day
        </div>
      </div>
      
      {/* Enhanced performance metrics footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>Query time: {queryTime}ms</span>
          {totalRecords > 0 && (
            <span>{totalRecords.toLocaleString()} source records</span>
          )}
          {metadata?.performanceMetrics && (
            <span>
              Aggregation: {metadata.performanceMetrics.aggregationTime}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {aggregationLevel !== 'daily' && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
              Smart {aggregationLevel} view for {totalRecords.toLocaleString()} records
            </span>
          )}
          <span>
            Cache TTL: {fromCache ? 'served from cache' : `${aggregationLevel === 'daily' ? '5' : '15'} minutes`}
          </span>
        </div>
      </div>
      
      {/* Raw Output Display Box */}
      {selectedDates.length > 0 && (
        <div className="mt-4 border border-red-200 rounded-lg p-4 bg-red-50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-red-900">Selected Dates ({selectedDates.length})</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              className="h-6 px-2 text-xs border-red-300 text-red-700 hover:bg-red-100"
            >
              <X className="h-3 w-3 mr-1" />Clear Selection
            </Button>
          </div>
          <div className="bg-white border border-red-200 rounded p-3 max-h-32 overflow-y-auto">
            <div className="text-sm font-mono text-gray-800 space-y-1">
              {selectedDates.sort().map((date, index) => {
                const activity = activityMap.get(date);
                const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                });
                return (
                  <div key={index} className="flex justify-between">
                    <span>{formattedDate}</span>
                    <span className="text-blue-600 font-medium">
                      {activity?.transaction_count?.toLocaleString() || 0} records
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TddfJsonActivityHeatMap;