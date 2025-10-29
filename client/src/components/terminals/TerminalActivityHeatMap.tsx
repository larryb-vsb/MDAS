import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivityData {
  transaction_date: string;
  transaction_count: number;
}

interface TerminalActivityHeatMapProps {
  terminalId: string;
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
  title?: string;
  description?: string;
}

const TerminalActivityHeatMap: React.FC<TerminalActivityHeatMapProps> = ({ 
  terminalId, 
  onDateSelect, 
  selectedDate,
  title = "Terminal Activity Heat Map",
  description = "Daily transaction volume over time - darker squares indicate more transactions"
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Fetch activity data for current month
  const { data: activityResponse, isLoading } = useQuery({
    queryKey: [`/api/tddf/activity-heatmap`, terminalId, currentDate.getFullYear(), currentDate.getMonth()],
    queryFn: async () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const response = await fetch(`/api/tddf/activity-heatmap?terminal_id=${terminalId}&year=${year}&month=${month}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch activity data');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const activityData = activityResponse || [];

  // Process data for calendar view
  const { calendarDays, maxCount, totalTransactions, monthStart, monthEnd } = React.useMemo(() => {
    // Create a map of date to count
    const dataByDate: Record<string, number> = {};
    activityData.forEach((item: ActivityData) => {
      if (item.transaction_date) {
        const dateKey = new Date(item.transaction_date).toISOString().split('T')[0];
        dataByDate[dateKey] = item.transaction_count;
      }
    });

    // Calculate max count for intensity
    const maxCount = Math.max(...Object.values(dataByDate), 1);
    
    // Get first and last day of current month
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    
    // Get the first Sunday of the calendar (might be in previous month)
    const firstCalendarDay = new Date(monthStart);
    firstCalendarDay.setDate(firstCalendarDay.getDate() - firstCalendarDay.getDay());
    
    // Get the last Saturday of the calendar (might be in next month)
    const lastCalendarDay = new Date(monthEnd);
    lastCalendarDay.setDate(lastCalendarDay.getDate() + (6 - lastCalendarDay.getDay()));
    
    // Generate calendar grid
    const calendarDays = [];
    let currentDay = new Date(firstCalendarDay);
    
    while (currentDay <= lastCalendarDay) {
      const dateKey = currentDay.toISOString().split('T')[0];
      const count = dataByDate[dateKey] || 0;
      const isCurrentMonth = currentDay.getMonth() === month;
      
      calendarDays.push({
        date: dateKey,
        count: count,
        dateObj: new Date(currentDay),
        dayOfMonth: currentDay.getDate(),
        month: currentDay.getMonth(),
        year: currentDay.getFullYear(),
        isCurrentMonth: isCurrentMonth
      });
      
      currentDay.setDate(currentDay.getDate() + 1);
    }

    const totalTransactions = Object.values(dataByDate).reduce((sum, count) => sum + count, 0);

    return { calendarDays, maxCount, totalTransactions, monthStart, monthEnd };
  }, [activityData, currentDate]);

  // Get background color for a day square - adjusted for lower thresholds
  const getBackgroundColor = (count: number, isSelected: boolean, isCurrentMonth: boolean) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
    }
    
    if (!isCurrentMonth) {
      return 'bg-gray-50 hover:bg-gray-100 opacity-40';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    // Lower thresholds to show colors with fewer transactions
    const intensity = count / Math.max(maxCount, 10); // Use at least 10 as denominator
    
    if (count === 1) return 'bg-green-100 hover:bg-green-200';
    if (count <= 3) return 'bg-green-200 hover:bg-green-300';
    if (count <= 5) return 'bg-green-400 hover:bg-green-500';
    if (count <= 10) return 'bg-green-600 hover:bg-green-700';
    if (count <= 15) return 'bg-blue-500 hover:bg-blue-600';
    if (count <= 20) return 'bg-blue-700 hover:bg-blue-800';
    if (count <= 30) return 'bg-purple-600 hover:bg-purple-700';
    return 'bg-purple-800 hover:bg-purple-900';
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: [`/api/tddf/activity-heatmap`, terminalId]
      });
    } finally {
      setIsRefreshing(false);
    }
  };

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

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading heat map...</div>
          </div>
        </div>
      </div>
    );
  }

  // Group days into weeks
  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <div className="bg-white rounded border border-gray-200 p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-900">{title}</h3>
      </div>

      <div className="bg-gray-50 rounded p-2">
        {/* Month Navigation */}
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth('prev')}
              className="h-4 w-4 p-0"
              data-testid="button-prev-month"
            >
              <ChevronLeft className="h-2.5 w-2.5" />
            </Button>
            <span className="font-semibold text-[10px] min-w-[80px] text-center">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth('next')}
              className="h-4 w-4 p-0"
              data-testid="button-next-month"
            >
              <ChevronRight className="h-2.5 w-2.5" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="ml-1 h-4 px-1 text-[9px]"
              data-testid="button-refresh-heatmap"
            >
              <RefreshCw className={`h-2 w-2 mr-0.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          
          <div className="text-[9px] text-gray-600">
            <span className="font-medium">{totalTransactions}</span> txns
            <span className="mx-0.5">•</span>
            <span>Peak: <span className="font-medium">{maxCount}</span></span>
          </div>
        </div>

        {/* Calendar Grid - Compact GitHub-style heat map */}
        <div className="overflow-x-auto">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-0.5 min-w-full">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-[7px] font-semibold text-gray-600 py-px">
                {day.substring(0, 1)}
              </div>
            ))}
          </div>

          {/* Calendar days - Compact squares */}
          <div className="space-y-0.5">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-0.5 min-w-full">
                {week.map((day, dayIndex) => {
                  const isSelected = selectedDate === day.date;
                  const bgColor = getBackgroundColor(day.count, isSelected, day.isCurrentMonth);
                  const isToday = new Date().toISOString().split('T')[0] === day.date;
                  
                  // Show all days but hide non-current month with lower opacity
                  return (
                    <button
                      key={dayIndex}
                      onClick={() => day.isCurrentMonth && onDateSelect && onDateSelect(day.date)}
                      disabled={!day.isCurrentMonth}
                      className={`
                        relative h-8 aspect-square rounded border border-gray-300 
                        transition-all duration-150 group
                        flex items-center justify-center
                        ${bgColor}
                        ${isToday && day.isCurrentMonth ? 'ring-2 ring-blue-500' : ''}
                        ${isSelected ? 'ring-2 ring-orange-500' : ''}
                        ${!day.isCurrentMonth ? 'opacity-30 cursor-default' : 'cursor-pointer'}
                      `}
                      title={`${monthNames[day.month]} ${day.dayOfMonth}: ${day.count} transactions`}
                      data-testid={`heatmap-day-${day.date}`}
                    >
                      {/* Day number */}
                      <span className={`
                        text-[11px] font-semibold
                        ${day.count > 0 && day.isCurrentMonth ? 'text-white' : 'text-gray-700'}
                        ${!day.isCurrentMonth ? 'text-gray-400' : ''}
                      `}>
                        {day.dayOfMonth}
                      </span>
                      
                      {/* Tooltip on hover */}
                      {day.isCurrentMonth && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap pointer-events-none">
                          <div className="font-semibold">{monthNames[day.month]} {day.dayOfMonth}</div>
                          <div className="text-gray-300">{day.count} transactions</div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-200">
          <div className="flex items-center gap-1 text-[8px] text-gray-600">
            <span>Less</span>
            <div className="flex gap-px">
              <div className="w-2 h-2 bg-gray-100 border border-gray-300 rounded-sm"></div>
              <div className="w-2 h-2 bg-green-100 border border-gray-300 rounded-sm"></div>
              <div className="w-2 h-2 bg-green-400 border border-gray-300 rounded-sm"></div>
              <div className="w-2 h-2 bg-green-600 border border-gray-300 rounded-sm"></div>
              <div className="w-2 h-2 bg-blue-500 border border-gray-300 rounded-sm"></div>
              <div className="w-2 h-2 bg-blue-700 border border-gray-300 rounded-sm"></div>
              <div className="w-2 h-2 bg-purple-600 border border-gray-300 rounded-sm"></div>
              <div className="w-2 h-2 bg-purple-800 border border-gray-300 rounded-sm"></div>
            </div>
            <span>More</span>
          </div>
          
          <div className="text-[8px] text-gray-500">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerminalActivityHeatMap;
