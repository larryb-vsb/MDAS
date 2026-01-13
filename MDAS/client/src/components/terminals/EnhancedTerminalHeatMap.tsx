import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Activity, Database, Clock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ActivityData {
  date: string;
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
  
  // Enhanced performance-optimized gradient mapping
  const getBackgroundColor = (count: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1 transform scale-105';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200 border border-gray-200';
    }
    
    // Enhanced scale for terminal activity data
    if (count <= 100) {
      if (count <= 25) return 'bg-green-100 hover:bg-green-200 border border-green-200';
      if (count <= 50) return 'bg-green-300 hover:bg-green-400 border border-green-300';
      if (count <= 75) return 'bg-green-500 hover:bg-green-600 border border-green-500';
      return 'bg-green-700 hover:bg-green-800 border border-green-700';
    }
    
    // Medium activity: 100-500 transactions
    if (count <= 500) {
      if (count <= 200) return 'bg-blue-300 hover:bg-blue-400 border border-blue-300';
      if (count <= 350) return 'bg-blue-500 hover:bg-blue-600 border border-blue-500';
      return 'bg-blue-700 hover:bg-blue-800 border border-blue-700';
    }
    
    // High activity: 500+ transactions
    if (count <= 750) return 'bg-purple-400 hover:bg-purple-500 border border-purple-400';
    if (count <= 1000) return 'bg-purple-600 hover:bg-purple-700 border border-purple-600';
    return 'bg-purple-800 hover:bg-purple-900 border border-purple-800';
  };

  const handleClick = () => {
    if (onDateSelect) {
      onDateSelect(dateString);
    }
  };

  return (
    <div
      className={`
        w-4 h-4 rounded-sm cursor-pointer transition-all duration-200 flex items-center justify-center
        ${getBackgroundColor(count, isSelected)}
        ${!isCurrentMonth ? 'opacity-30' : ''}
        hover:scale-110 hover:z-10 relative
      `}
      onClick={handleClick}
      title={`${dateString}: ${count.toLocaleString()} transactions${
        activity?.aggregation_level ? ` (${activity.aggregation_level})` : ''
      }`}
    >
      {count > 0 && (
        <div className="text-xs font-bold text-white opacity-0 hover:opacity-100 transition-opacity duration-200">
          {count > 999 ? `${Math.round(count/1000)}k` : count > 99 ? '99+' : ''}
        </div>
      )}
    </div>
  );
};

interface MonthViewProps {
  year: number;
  month: number;
  activities: ActivityData[];
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
}

const MonthView: React.FC<MonthViewProps> = ({ year, month, activities, onDateSelect, selectedDate }) => {
  const activityMap = useMemo(() => {
    const map = new Map<string, ActivityData>();
    activities.forEach(activity => {
      const key = activity.date.split('T')[0];
      map.set(key, activity);
    });
    return map;
  }, [activities]);

  const { weeks, monthName } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    
    for (let d = new Date(startDate); d <= lastDay || currentWeek.length < 7; d.setDate(d.getDate() + 1)) {
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(new Date(d));
    }
    
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return {
      weeks,
      monthName: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  }, [year, month]);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-center text-muted-foreground">
        {monthName}
      </div>
      <div className="space-y-1">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <div key={index} className="text-center font-medium">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((date, dayIndex) => {
              const dateString = date.toISOString().split('T')[0];
              const activity = activityMap.get(dateString);
              const isCurrentMonth = date.getMonth() === month;
              
              return (
                <DaySquare
                  key={dayIndex}
                  date={date}
                  activity={activity}
                  isCurrentMonth={isCurrentMonth}
                  onDateSelect={onDateSelect}
                  selectedDate={selectedDate}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

interface EnhancedTerminalHeatMapProps {
  onDateSelect?: (date: string | null) => void;
  selectedDate?: string | null;
}

const EnhancedTerminalHeatMap: React.FC<EnhancedTerminalHeatMapProps> = ({ onDateSelect, selectedDate }) => {
  // Fetch latest transaction year first
  const { data: latestYearData } = useQuery<{latestYear: number, transactionCount: number}>({
    queryKey: ['/api/terminals/latest-transaction-year'],
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });

  // Use latest transaction year or current year as fallback
  const [currentDate, setCurrentDate] = useState(() => {
    const latestYear = latestYearData?.latestYear || new Date().getFullYear();
    return new Date(latestYear, new Date().getMonth());
  });

  // Update currentDate when latestYearData is available
  useEffect(() => {
    if (latestYearData?.latestYear) {
      setCurrentDate(new Date(latestYearData.latestYear, new Date().getMonth()));
    }
  }, [latestYearData]);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Fetch optimized terminal activity data
  const { data: activityData, isLoading, error } = useQuery<ActivityResponse>({
    queryKey: ['/api/tddf-json/activity-heatmap-optimized', currentYear],
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: !!currentYear, // Only fetch when we have a year
  });

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleDateSelect = (date: string) => {
    const newSelectedDate = selectedDate === date ? null : date;
    if (onDateSelect) {
      onDateSelect(newSelectedDate);
    }
  };

  const performanceMetrics = activityData?.metadata?.performanceMetrics;
  const totalRecords = activityData?.metadata?.totalRecords || 0;
  const aggregationLevel = activityData?.metadata?.aggregationLevel || 'daily';

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Terminal Activity Heat Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Unable to load activity data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <CardTitle>Terminal Activity Heat Map</CardTitle>
            {activityData?.fromCache && (
              <Badge variant="outline" className="text-xs">
                <Database className="h-3 w-3 mr-1" />
                Cached
              </Badge>
            )}
          </div>
          
          {/* Performance indicators */}
          {performanceMetrics && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {performanceMetrics.totalQueryTime}ms
              </div>
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                {totalRecords.toLocaleString()} records
              </div>
              <Badge variant="secondary" className="text-xs">
                {aggregationLevel}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-4" />
                ))}
              </div>
              {Array.from({ length: 6 }).map((_, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-4" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Year Navigation */}
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(prev => new Date(prev.getFullYear() - 1, prev.getMonth()))}
              >
                <ChevronLeft className="h-4 w-4" />
                {currentYear - 1}
              </Button>
              
              <div className="text-lg font-semibold">
                {currentYear}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(prev => new Date(prev.getFullYear() + 1, prev.getMonth()))}
              >
                {currentYear + 1}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* GitHub-style yearly heat map */}
            <div className="space-y-2">
              {/* Month labels */}
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => (
                  <div key={index} className="text-center">{month}</div>
                ))}
              </div>
              
              {/* Days grid */}
              <div className="grid grid-cols-12 gap-2">
                {Array.from({ length: 12 }, (_, monthIndex) => {
                  const monthData = (activityData?.records || []).filter((item: ActivityData) => {
                    const itemDate = new Date(item.date);
                    return itemDate.getFullYear() === currentYear && itemDate.getMonth() === monthIndex;
                  });

                  // Create activity map for the month
                  const monthActivityMap = new Map();
                  monthData.forEach((item: ActivityData) => {
                    const dateKey = new Date(item.date).toISOString().split('T')[0];
                    monthActivityMap.set(dateKey, item.transaction_count);
                  });

                  const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
                  const firstDayOfMonth = new Date(currentYear, monthIndex, 1).getDay();
                  
                  // Generate calendar weeks for the month
                  const weeks = [];
                  let currentWeek = [];
                  
                  // Add empty cells for days before the first of the month
                  for (let i = 0; i < firstDayOfMonth; i++) {
                    currentWeek.push(null);
                  }
                  
                  // Add all days of the month
                  for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(currentYear, monthIndex, day);
                    const dateString = date.toISOString().split('T')[0];
                    const count = monthActivityMap.get(dateString) || 0;
                    
                    currentWeek.push({
                      date: dateString,
                      count,
                      dateObj: date
                    });
                    
                    // Start new week on Sunday
                    if (currentWeek.length === 7) {
                      weeks.push(currentWeek);
                      currentWeek = [];
                    }
                  }
                  
                  // Add the last partial week if it exists
                  if (currentWeek.length > 0) {
                    while (currentWeek.length < 7) {
                      currentWeek.push(null);
                    }
                    weeks.push(currentWeek);
                  }

                  return (
                    <div key={monthIndex} className="space-y-1">
                      {weeks.map((week, weekIndex) => (
                        <div key={weekIndex} className="grid grid-cols-7 gap-1">
                          {week.map((day, dayIndex) => {
                            if (!day) {
                              return <div key={`${weekIndex}-${dayIndex}`} className="w-4 h-4" />;
                            }
                            
                            const isSelected = selectedDate === day.date;
                            
                            // Enhanced performance-optimized gradient mapping
                            const getBackgroundColor = (count: number, isSelected: boolean) => {
                              if (isSelected) {
                                return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
                              }
                              
                              if (count === 0) {
                                return 'bg-gray-100 hover:bg-gray-200';
                              }
                              
                              // Enhanced scale for terminal activity data
                              if (count <= 100) {
                                if (count <= 25) return 'bg-green-100 hover:bg-green-200';
                                if (count <= 50) return 'bg-green-300 hover:bg-green-400';
                                if (count <= 75) return 'bg-green-500 hover:bg-green-600';
                                return 'bg-green-700 hover:bg-green-800';
                              }
                              
                              // Medium activity: 100-500 transactions
                              if (count <= 500) {
                                if (count <= 200) return 'bg-blue-300 hover:bg-blue-400';
                                if (count <= 350) return 'bg-blue-500 hover:bg-blue-600';
                                return 'bg-blue-700 hover:bg-blue-800';
                              }
                              
                              // High activity: 500+ transactions
                              if (count <= 750) return 'bg-purple-400 hover:bg-purple-500';
                              if (count <= 1000) return 'bg-purple-600 hover:bg-purple-700';
                              return 'bg-purple-800 hover:bg-purple-900';
                            };
                            
                            return (
                              <div
                                key={day.date}
                                className={`w-4 h-4 rounded-sm transition-all duration-200 ${getBackgroundColor(day.count, isSelected)} ${day.count > 0 ? 'cursor-pointer' : 'cursor-help'}`}
                                title={`${day.dateObj.toLocaleDateString('en-US', { 
                                  weekday: 'short', 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })}: ${day.count} transaction${day.count !== 1 ? 's' : ''}${day.count > 0 && onDateSelect ? ' (Click to filter)' : ''}`}
                                onClick={() => {
                                  if (onDateSelect && day.count > 0) {
                                    handleDateSelect(day.date);
                                  }
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Less</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded-sm" />
                  <div className="w-3 h-3 bg-green-100 border border-green-200 rounded-sm" />
                  <div className="w-3 h-3 bg-green-300 border border-green-300 rounded-sm" />
                  <div className="w-3 h-3 bg-blue-500 border border-blue-500 rounded-sm" />
                  <div className="w-3 h-3 bg-purple-700 border border-purple-700 rounded-sm" />
                </div>
                <span>More</span>
              </div>
              
              {selectedDate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDateSelect(selectedDate)}
                >
                  Clear Selection
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EnhancedTerminalHeatMap;