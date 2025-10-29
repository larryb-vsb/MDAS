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
  
  console.log('[HEATMAP DEBUG] Component mounted with terminalId:', terminalId);
  console.log('[HEATMAP DEBUG] Current date:', currentDate.getFullYear(), currentDate.getMonth());

  // Fetch activity data for current month
  const { data: activityResponse, isLoading } = useQuery({
    queryKey: [`/api/tddf/activity-heatmap`, terminalId, currentDate.getFullYear(), currentDate.getMonth()],
    queryFn: async () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const url = `/api/tddf/activity-heatmap?terminal_id=${terminalId}&year=${year}&month=${month}`;
      console.log('[HEATMAP DEBUG] Fetching data from:', url);
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch activity data');
      const data = await response.json();
      console.log('[HEATMAP DEBUG] API response:', data);
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const activityData = activityResponse || [];
  console.log('[HEATMAP DEBUG] Activity data:', activityData.length, 'records');

  // Process data for calendar view - ONLY current month days
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
    
    // Get first and last day of current month ONLY
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    
    // Generate ONLY current month days (1 through last day of month)
    const calendarDays = [];
    const firstDayOfWeek = monthStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const currentDay = new Date(year, month, day);
      const dateKey = currentDay.toISOString().split('T')[0];
      const count = dataByDate[dateKey] || 0;
      
      calendarDays.push({
        date: dateKey,
        count: count,
        dateObj: currentDay,
        dayOfMonth: day,
        month: month,
        year: year,
        isCurrentMonth: true,
        gridColumn: day === 1 ? firstDayOfWeek + 1 : undefined // Position first day correctly
      });
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
        queryKey: [`/api/tddf/activity-heatmap`, terminalId, currentDate.getFullYear(), currentDate.getMonth()]
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
        <div className="flex justify-center px-6">
          <div className="inline-block">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0 mb-2">
              {dayNames.map((day) => (
                <div key={day} className="text-center text-xs font-semibold text-gray-600 w-12">
                  {day.substring(0, 1)}
                </div>
              ))}
            </div>

            {/* Calendar days - Single grid showing ONLY current month */}
            <div className="grid grid-cols-7 gap-0">
              {calendarDays.map((day, index) => {
                const isSelected = selectedDate === day.date;
                const bgColor = getBackgroundColor(day.count, isSelected, true);
                const isToday = new Date().toISOString().split('T')[0] === day.date;
                
                return (
                  <button
                    key={day.date}
                    onClick={() => onDateSelect && onDateSelect(day.date)}
                    style={day.gridColumn ? { gridColumnStart: day.gridColumn } : undefined}
                    className={`
                      relative h-12 w-12 rounded border-2 border-gray-300 
                      transition-all duration-150 group
                      flex items-center justify-center
                      ${bgColor}
                      ${isToday ? 'ring-2 ring-blue-500' : ''}
                      ${isSelected ? 'ring-2 ring-orange-500' : ''}
                      cursor-pointer
                    `}
                    title={`${monthNames[day.month]} ${day.dayOfMonth}: ${day.count} transactions`}
                    data-testid={`heatmap-day-${day.date}`}
                  >
                    {/* Day number */}
                    <span className={`
                      text-sm font-bold
                      ${day.count > 0 ? 'text-white' : 'text-gray-700'}
                    `}>
                      {day.dayOfMonth}
                    </span>
                    
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 bg-gray-900 text-white text-xs rounded px-3 py-1.5 whitespace-nowrap pointer-events-none shadow-lg">
                      <div className="font-semibold">{monthNames[day.month]} {day.dayOfMonth}</div>
                      <div className="text-gray-300">{day.count} transactions</div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </button>
                );
              })}
            </div>
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
