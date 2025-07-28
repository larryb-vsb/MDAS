import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivityData {
  date: string;
  dtCount: number;
}

interface DaySquareProps {
  date: Date;
  activity?: ActivityData;
  isCurrentMonth?: boolean;
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
}

const DaySquare: React.FC<DaySquareProps> = ({ date, activity, isCurrentMonth = true, onDateSelect, selectedDate }) => {
  const count = activity?.dtCount || 0;
  const dateString = date.toISOString().split('T')[0];
  const isSelected = selectedDate === dateString;
  
  // Enhanced gradient mapping: 0-1000 Green, 1000-2000 Blue, 2000-3000 Purple
  const getBackgroundColor = (count: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    // Green gradient: 0-1000 transactions
    if (count <= 1000) {
      if (count <= 250) return 'bg-green-100 hover:bg-green-200';
      if (count <= 500) return 'bg-green-300 hover:bg-green-400';
      if (count <= 750) return 'bg-green-500 hover:bg-green-600';
      return 'bg-green-700 hover:bg-green-800';
    }
    
    // Blue gradient: 1000-2000 transactions
    if (count <= 2000) {
      if (count <= 1250) return 'bg-blue-300 hover:bg-blue-400';
      if (count <= 1500) return 'bg-blue-500 hover:bg-blue-600';
      if (count <= 1750) return 'bg-blue-700 hover:bg-blue-800';
      return 'bg-blue-900 hover:bg-blue-950';
    }
    
    // Purple gradient: 2000-3000+ transactions
    if (count <= 2250) return 'bg-purple-400 hover:bg-purple-500';
    if (count <= 2500) return 'bg-purple-600 hover:bg-purple-700';
    if (count <= 2750) return 'bg-purple-800 hover:bg-purple-900';
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
      title={`${formatDate(date)}: ${count} transactions${count > 0 ? ' (Click to filter)' : ''}`}
      onClick={handleClick}
    >
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
        <div>{formatDate(date)}</div>
        <div>{count} transactions</div>
        {count > 0 && <div className="text-gray-300">Click to filter</div>}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black"></div>
      </div>
    </div>
  );
};

interface TddfActivityHeatMapProps {
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
}

const TddfActivityHeatMap: React.FC<TddfActivityHeatMapProps> = ({ onDateSelect, selectedDate }) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const { data: activityData, isLoading, error } = useQuery<ActivityData[]>({
    queryKey: ['/api/tddf/activity-heatmap', currentYear],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/activity-heatmap?year=${currentYear}`);
      if (!response.ok) throw new Error('Failed to fetch activity data');
      return response.json();
    },
    enabled: true,
  });

  // Create a map for quick lookup of activity data by date
  const activityMap = new Map<string, ActivityData>();
  if (activityData) {
    activityData.forEach(item => {
      activityMap.set(item.date.split('T')[0], item);
    });
  }

  // Generate year grid (GitHub-style contribution chart)
  const generateYearGrid = () => {
    const weeks = [];
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);
    
    // Start from the Sunday of the week containing January 1st
    const startOfWeek = new Date(startDate);
    startOfWeek.setDate(startDate.getDate() - startDate.getDay());
    
    const current = new Date(startOfWeek);
    
    while (current <= endDate || current.getDay() !== 0) {
      const week = [];
      
      for (let day = 0; day < 7; day++) {
        const dateStr = current.toISOString().split('T')[0];
        const isCurrentYear = current.getFullYear() === currentYear;
        
        week.push({
          date: new Date(current),
          dateStr,
          activity: activityMap.get(dateStr),
          isCurrentYear
        });
        
        current.setDate(current.getDate() + 1);
      }
      
      weeks.push(week);
      
      if (current > endDate && current.getDay() === 0) break;
    }
    
    return weeks;
  };

  const weeks = generateYearGrid();

  // Calculate year statistics
  const yearStats = activityData ? activityData.reduce((acc, day) => {
    acc.totalCount += parseInt(day.dtCount.toString());
    acc.activeDays += 1;
    return acc;
  }, { totalCount: 0, activeDays: 0 }) : { totalCount: 0, activeDays: 0 };

  const peakDay = activityData ? Math.max(...activityData.map(d => parseInt(d.dtCount.toString()))) : 0;

  // Generate month labels with proper positioning (similar to terminal heat map)
  const monthLabels = useMemo(() => {
    if (weeks.length === 0) return [];
    
    const labels: Array<{ month: string; position: number }> = [];
    let lastMonth = "";
    
    weeks.forEach((week, weekIndex) => {
      const firstDayOfWeek = week[0].date;
      const monthYear = firstDayOfWeek.toLocaleDateString('en-US', { 
        month: 'short'
      });
      
      if (monthYear !== lastMonth && weekIndex > 0) {
        labels.push({
          month: monthYear,
          position: weekIndex
        });
        lastMonth = monthYear;
      }
    });

    return labels;
  }, [weeks]);

  // Add first month if not covered
  if (monthLabels.length > 0 && weeks.length > 0) {
    const firstWeek = weeks[0];
    const firstMonth = firstWeek[0].date.toLocaleDateString('en-US', { month: 'short' });
    if (monthLabels.length === 0 || monthLabels[0].month !== firstMonth) {
      monthLabels.unshift({ month: firstMonth, position: 0 });
    }
  }

  const weekDays = ['Mon', 'Wed', 'Fri'];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="flex gap-1">
            {Array.from({ length: 53 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className="w-3 h-3 bg-gray-200 rounded-sm"></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-red-600">
          Error loading activity data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Transaction Activity Heat Map
          </h3>
          <p className="text-sm text-gray-600">
            Daily transaction volume over time - darker squares indicate more transactions
          </p>
        </div>
      </div>

      {/* Heat Map Grid Container with Box */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
        <div className="overflow-x-auto">
          <div className="relative" style={{ minWidth: `${weeks.length * 20 + 60}px` }}>
            {/* Year Navigation - Right aligned with heat map */}
            <div className="flex justify-end mb-4" style={{ width: `${weeks.length * 20 + 32}px` }}>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentYear(currentYear - 1)}
                  className="p-1 h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <span className="text-lg font-semibold text-gray-900 min-w-[60px] text-center">
                  {currentYear}
                </span>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentYear(currentYear + 1)}
                  className="p-1 h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Month labels - positioned to align with grid columns */}
            <div className="relative mb-2" style={{ height: '16px', marginLeft: '32px' }}>
              {monthLabels.map((label, index) => (
                <div
                  key={index}
                  className="absolute text-xs text-gray-500"
                  style={{ left: `${label.position * 20}px` }}
                >
                  {label.month}
                </div>
              ))}
            </div>
            
            <div className="flex">
              {/* Day labels - Mon, Wed, Fri on left side */}
              <div className="flex flex-col justify-around text-xs text-gray-500 w-8" style={{ height: '140px' }}>
                <div>Mon</div>
                <div>Wed</div>
                <div>Fri</div>
              </div>
              
              {/* GitHub-style grid - weeks as columns, days as rows */}
              <div className="flex gap-1">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-1">
                    {week.map((day, dayIndex) => (
                      <DaySquare
                        key={`${weekIndex}-${dayIndex}`}
                        date={day.date}
                        activity={day.activity}
                        isCurrentMonth={day.isCurrentYear}
                        onDateSelect={onDateSelect}
                        selectedDate={selectedDate}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Legend and Stats - Right aligned with heat map */}
            <div className="flex justify-end mt-4" style={{ width: `${weeks.length * 20 + 32}px` }}>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">{yearStats.totalCount}</span> transactions in {currentYear}
                </div>
                <div>
                  Peak day: <span className="font-medium">{peakDay}</span> transactions
                </div>
                <div className="flex items-center gap-2">
                  <span>Less</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-gray-100 rounded-sm" title="0 transactions"></div>
                    <div className="w-3 h-3 bg-green-300 rounded-sm" title="1-1000 transactions"></div>
                    <div className="w-3 h-3 bg-green-700 rounded-sm" title="High Green (750-1000)"></div>
                    <div className="w-3 h-3 bg-blue-500 rounded-sm" title="1000-2000 transactions"></div>
                    <div className="w-3 h-3 bg-blue-900 rounded-sm" title="High Blue (1750-2000)"></div>
                    <div className="w-3 h-3 bg-purple-600 rounded-sm" title="2000-3000 transactions"></div>
                    <div className="w-3 h-3 bg-purple-950 rounded-sm" title="3000+ transactions"></div>
                  </div>
                  <span>More</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TddfActivityHeatMap;