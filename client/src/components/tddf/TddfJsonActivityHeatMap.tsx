import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivityData {
  transaction_date: string;
  transaction_count: number;
  aggregation_level?: string;
}

interface ActivityResponse {
  records: ActivityData[];
  queryTime: number;
  fromCache?: boolean;
  metadata?: {
    year: number;
    recordType: string;
    totalRecords: number;
    aggregationLevel: string;
    recordCount: number;
    performanceMetrics: {
      sizeCheckTime: number;
      aggregationTime: number;
      totalQueryTime: number;
    };
  };
}

interface DaySquareProps {
  date: Date;
  activity?: ActivityData;
  isCurrentMonth?: boolean;
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
}

const DaySquare: React.FC<DaySquareProps> = ({ date, activity, isCurrentMonth = true, onDateSelect, selectedDate }) => {
  const count = activity?.transaction_count || 0;
  const dateString = date.toISOString().split('T')[0];
  const isSelected = selectedDate === dateString;
  
  // Enhanced gradient mapping for TDDF JSON data
  const getBackgroundColor = (count: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    // Scale for TDDF JSON data (typically smaller numbers)
    if (count <= 50) {
      if (count <= 10) return 'bg-green-100 hover:bg-green-200';
      if (count <= 20) return 'bg-green-300 hover:bg-green-400';
      if (count <= 35) return 'bg-green-500 hover:bg-green-600';
      return 'bg-green-700 hover:bg-green-800';
    }
    
    // Medium activity: 50-150 transactions
    if (count <= 150) {
      if (count <= 75) return 'bg-blue-300 hover:bg-blue-400';
      if (count <= 100) return 'bg-blue-500 hover:bg-blue-600';
      if (count <= 125) return 'bg-blue-700 hover:bg-blue-800';
      return 'bg-blue-900 hover:bg-blue-950';
    }
    
    // High activity: 150+ transactions
    if (count <= 200) return 'bg-purple-400 hover:bg-purple-500';
    if (count <= 250) return 'bg-purple-600 hover:bg-purple-700';
    if (count <= 300) return 'bg-purple-800 hover:bg-purple-900';
    return 'bg-purple-950 hover:bg-purple-950';
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
    if (onDateSelect && count > 0) {
      onDateSelect(dateString);
    }
  };

  return (
    <div
      className={`w-4 h-4 rounded-sm relative group transition-all duration-200 ${getBackgroundColor(count, isSelected)} ${!isCurrentMonth ? 'opacity-30' : ''} ${count > 0 ? 'cursor-pointer' : 'cursor-help'}`}
      title={`${formatDate(date)}: ${count} JSON records${count > 0 ? ' (Click to filter)' : ''}`}
      onClick={handleClick}
    />
  );
};

interface TddfJsonActivityHeatMapProps {
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
}

const TddfJsonActivityHeatMap: React.FC<TddfJsonActivityHeatMapProps> = ({ onDateSelect, selectedDate }) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const { data: activityResponse, isLoading, error, isFetching } = useQuery<ActivityResponse>({
    queryKey: ['/api/tddf-json/activity', currentYear],
    queryFn: async () => {
      const response = await fetch(`/api/tddf-json/activity?year=${currentYear}&recordType=DT`);
      if (!response.ok) throw new Error('Failed to fetch TDDF JSON activity data');
      return response.json();
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // Dynamic cache from backend (5-15 mins)
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
  });

  // Create a map for quick lookup of activity data by date
  const activityMap = new Map<string, ActivityData>();
  if (activityResponse?.records) {
    activityResponse.records.forEach(item => {
      // Handle both formats: transaction_date field or date field
      const dateStr = item.transaction_date?.split('T')[0];
      if (dateStr) {
        activityMap.set(dateStr, item);
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

  // Progressive loading states
  if (isLoading || isFetching) {
    return (
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 bg-gray-200 rounded w-32"></div>
            <div className="h-4 bg-gray-200 rounded w-48"></div>
          </div>
          {/* Visual Loading State Indicator */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="text-sm text-blue-700 font-medium">
                {isLoading ? `Loading ${currentYear} activity data...` : 'Refreshing heat map...'}
              </div>
            </div>
            {totalRecords > 500000 && (
              <div className="text-xs text-blue-600 mt-1">
                Processing {totalRecords.toLocaleString()} records • Using smart aggregation for optimal performance
              </div>
            )}
          </div>
          <div className="grid grid-cols-12 gap-2">
            {Array.from({ length: 365 }, (_, i) => (
              <div key={i} className="w-4 h-4 bg-gray-200 rounded-sm"></div>
            ))}
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
      {/* Header with year navigation */}
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
                      onDateSelect={onDateSelect}
                      selectedDate={selectedDate}
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
    </div>
  );
};

export default TddfJsonActivityHeatMap;