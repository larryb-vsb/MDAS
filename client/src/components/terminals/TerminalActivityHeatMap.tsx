import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Fetch activity data for last 30 days (no year parameter needed)
  const { data: activityResponse, isLoading } = useQuery({
    queryKey: [`/api/tddf/activity-heatmap`, terminalId],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/activity-heatmap?terminal_id=${terminalId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch activity data');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const activityData = activityResponse || [];

  // Process data for 30-day heat map
  const { days, maxCount, totalTransactions } = React.useMemo(() => {
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
    
    // Generate last 30 days
    const days = [];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29); // 30 days total including today
    
    let currentDate = new Date(startDate);
    
    for (let i = 0; i < 30; i++) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const count = dataByDate[dateKey] || 0;
      
      days.push({
        date: dateKey,
        count: count,
        dateObj: new Date(currentDate),
        dayOfWeek: currentDate.getDay(),
        dayOfMonth: currentDate.getDate(),
        month: currentDate.getMonth()
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalTransactions = Object.values(dataByDate).reduce((sum, count) => sum + count, 0);

    return { days, maxCount, totalTransactions };
  }, [activityData]);

  // Get background color for a day square
  const getBackgroundColor = (count: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    const intensity = count / maxCount;
    
    if (intensity <= 0.125) return 'bg-green-100 hover:bg-green-200';
    if (intensity <= 0.25) return 'bg-green-200 hover:bg-green-300';
    if (intensity <= 0.375) return 'bg-green-400 hover:bg-green-500';
    if (intensity <= 0.5) return 'bg-green-600 hover:bg-green-700';
    if (intensity <= 0.625) return 'bg-blue-500 hover:bg-blue-600';
    if (intensity <= 0.75) return 'bg-blue-700 hover:bg-blue-800';
    if (intensity <= 0.875) return 'bg-purple-600 hover:bg-purple-700';
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

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
          <div className="flex justify-center items-center h-32">
            <div className="text-gray-500">Loading heat map...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        {/* Header with stats and refresh */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Last 30 Days</span>
              <span className="mx-2">•</span>
              <span className="font-medium">{totalTransactions}</span> transactions
              <span className="mx-2">•</span>
              <span>Peak day: <span className="font-medium">{maxCount}</span> transactions</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 px-3 text-xs"
            data-testid="button-refresh-heatmap"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* 30-day strip visualization */}
        <div className="space-y-3">
          {/* Day squares */}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {days.map((day, index) => {
              const isSelected = selectedDate === day.date;
              const bgColor = getBackgroundColor(day.count, isSelected);
              
              return (
                <div key={index} className="flex-shrink-0">
                  <button
                    onClick={() => onDateSelect && onDateSelect(day.date)}
                    className={`
                      w-10 h-10 rounded border border-gray-200 transition-all duration-200
                      ${bgColor}
                      flex items-center justify-center
                      relative group
                    `}
                    title={`${day.date}: ${day.count} transactions`}
                    data-testid={`heatmap-day-${day.date}`}
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                      <div className="font-medium">{monthNames[day.month]} {day.dayOfMonth}</div>
                      <div>{day.count} transactions</div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </button>
                  
                  {/* Day of week label below */}
                  <div className="text-[10px] text-gray-400 text-center mt-1 font-medium">
                    {dayNames[day.dayOfWeek].substring(0, 1)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
                <div className="w-4 h-4 bg-green-100 border border-gray-200 rounded"></div>
                <div className="w-4 h-4 bg-green-400 border border-gray-200 rounded"></div>
                <div className="w-4 h-4 bg-green-600 border border-gray-200 rounded"></div>
                <div className="w-4 h-4 bg-blue-500 border border-gray-200 rounded"></div>
                <div className="w-4 h-4 bg-blue-700 border border-gray-200 rounded"></div>
                <div className="w-4 h-4 bg-purple-600 border border-gray-200 rounded"></div>
                <div className="w-4 h-4 bg-purple-800 border border-gray-200 rounded"></div>
              </div>
              <span>More</span>
            </div>
            
            <div className="text-xs text-gray-500">
              {days.length > 0 && (
                <>
                  {monthNames[days[0].month]} {days[0].dayOfMonth} - {monthNames[days[days.length - 1].month]} {days[days.length - 1].dayOfMonth}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerminalActivityHeatMap;
