import React, { useState } from 'react';
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
}

const DaySquare: React.FC<DaySquareProps> = ({ date, activity, isCurrentMonth = true }) => {
  const count = activity?.dtCount || 0;
  
  // Determine intensity level for background color
  const getIntensityLevel = (count: number) => {
    if (count === 0) return 0;
    if (count <= 3) return 1;
    if (count <= 6) return 2;
    if (count <= 12) return 3;
    return 4;
  };

  const intensityLevel = getIntensityLevel(count);
  
  // Color mapping based on activity levels
  const getBackgroundColor = (level: number) => {
    switch (level) {
      case 0: return 'bg-gray-100 hover:bg-gray-200';
      case 1: return 'bg-green-100 hover:bg-green-200';
      case 2: return 'bg-green-300 hover:bg-green-400';
      case 3: return 'bg-green-500 hover:bg-green-600';
      case 4: return 'bg-green-700 hover:bg-green-800';
      default: return 'bg-gray-100 hover:bg-gray-200';
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div
      className={`w-3 h-3 rounded-sm cursor-help relative group transition-colors ${getBackgroundColor(intensityLevel)} ${!isCurrentMonth ? 'opacity-30' : ''}`}
      title={`${formatDate(date)}: ${count} transactions`}
    >
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
        <div>{formatDate(date)}</div>
        <div>{count} transactions</div>
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black"></div>
      </div>
    </div>
  );
};

const TddfActivityHeatMap: React.FC = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const { data: activityData, isLoading, error } = useQuery<ActivityData[]>({
    queryKey: ['/api/tddf/activity-heatmap', currentYear],
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

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
        
        {/* Year Navigation */}
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

      {/* Heat Map Grid */}
      <div className="mb-4">
        {/* Month labels */}
        <div className="flex mb-2 ml-6">
          {monthNames.map((month, index) => (
            <div key={month} className="text-xs text-gray-500 flex-1 text-center first:text-left">
              {index % 2 === 0 ? month : ''}
            </div>
          ))}
        </div>
        
        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col mr-2 justify-between text-xs text-gray-500 h-21">
            {weekDays.map((day, index) => (
              <div key={day} className={index === 1 ? 'my-1' : ''}>
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar grid */}
          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((day, dayIndex) => (
                  <DaySquare
                    key={`${weekIndex}-${dayIndex}`}
                    date={day.date}
                    activity={day.activity}
                    isCurrentMonth={day.isCurrentYear}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend and Stats */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          <span className="font-medium">{yearStats.totalCount}</span> transactions in {currentYear}
        </div>
        <div>
          Peak day: <span className="font-medium">{peakDay}</span> transactions
        </div>
        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-gray-100 rounded-sm"></div>
            <div className="w-3 h-3 bg-green-100 rounded-sm"></div>
            <div className="w-3 h-3 bg-green-300 rounded-sm"></div>
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-green-700 rounded-sm"></div>
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

export default TddfActivityHeatMap;