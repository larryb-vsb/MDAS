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
  const [currentYear, setCurrentYear] = useState(2024);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Fetch activity data with terminal filtering
  const { data: activityResponse, isLoading } = useQuery({
    queryKey: [`/api/tddf/activity-heatmap`, currentYear, terminalId],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/activity-heatmap?year=${currentYear}&terminal_id=${terminalId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch activity data');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const activityData = activityResponse || [];

  // Process data for heat map
  const { weeks, maxCount, totalTransactions } = React.useMemo(() => {
    // Group data by date
    const dataByDate: Record<string, number> = {};
    activityData.forEach((item: ActivityData) => {
      if (item.transaction_date) {
        const dateKey = new Date(item.transaction_date).toISOString().split('T')[0];
        dataByDate[dateKey] = item.transaction_count;
      }
    });

    // Calculate max count for intensity
    const maxCount = Math.max(...Object.values(dataByDate), 1);
    
    // Generate weeks for the year (53 weeks)
    const weeks = [];
    const startOfYear = new Date(currentYear, 0, 1);
    const firstSunday = new Date(startOfYear);
    firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());
    
    let currentDate = new Date(firstSunday);
    
    for (let weekIndex = 0; weekIndex < 53; weekIndex++) {
      const week = [];
      
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const count = dataByDate[dateKey] || 0;
        
        week.push({
          date: dateKey,
          count: count,
          dateObj: new Date(currentDate)
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      weeks.push(week);
    }

    const totalTransactions = Object.values(dataByDate).reduce((sum, count) => sum + count, 0);

    return { weeks, maxCount, totalTransactions };
  }, [activityData, currentYear]);

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

  // Navigate years
  const navigateYear = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentYear(prev => prev + 1);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: [`/api/tddf/activity-heatmap`, currentYear, terminalId]
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const monthLabels = ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'];
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        {/* Year Navigation */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateYear('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-lg min-w-[80px] text-center">{currentYear}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateYear('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{totalTransactions}</span> transactions in {currentYear}
              <span className="mx-2">•</span>
              <span>Peak day: <span className="font-medium">{maxCount}</span> transactions</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Month Labels */}
        <div className="mb-2 overflow-x-auto">
          <div className="flex justify-between text-xs text-gray-600 font-medium" style={{ marginLeft: '32px', width: `${53 * 16}px` }}>
            {monthLabels.map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
        </div>

        {/* Heat Map Grid */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex gap-1 min-w-fit">
            {/* Day Labels */}
            <div className="flex flex-col gap-1 mr-2">
              {dayNames.map((day, i) => (
                <div key={i} className="text-xs text-gray-600 font-medium h-3 flex items-center w-6">
                  {i % 2 === 1 ? day : ''}
                </div>
              ))}
            </div>
            
            {/* Grid */}
            <div className="flex gap-1">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((day, dayIndex) => {
                    const dateString = day.date;
                    const isSelected = selectedDate === dateString;
                    const count = day.count;
                    
                    return (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        className={`w-3 h-3 rounded-sm transition-all duration-200 ${getBackgroundColor(count, isSelected)} ${count > 0 ? 'cursor-pointer' : 'cursor-help'}`}
                        title={`${day.dateObj.toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}: ${count} transaction${count !== 1 ? 's' : ''}${count > 0 && onDateSelect ? ' (Click to filter)' : ''}`}
                        onClick={() => {
                          if (onDateSelect && count > 0) {
                            onDateSelect(dateString);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex justify-end">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 bg-gray-100 rounded-sm"></div>
              <div className="w-3 h-3 bg-green-100 rounded-sm"></div>
              <div className="w-3 h-3 bg-green-200 rounded-sm"></div>
              <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
              <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
              <div className="w-3 h-3 bg-blue-700 rounded-sm"></div>
              <div className="w-3 h-3 bg-purple-600 rounded-sm"></div>
              <div className="w-3 h-3 bg-purple-800 rounded-sm"></div>
            </div>
            <span>More</span>
          </div>
        </div>

        {/* Selected date info */}
        {selectedDate && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-orange-800">
                Filtered to: {new Date(selectedDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDateSelect?.('')}
              >
                Clear Filter
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalActivityHeatMap;