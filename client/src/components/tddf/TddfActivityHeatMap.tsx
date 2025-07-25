import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivityData {
  date: string;
  dtCount: number;
  bhCount: number;
  p1Count: number;
  otherCount: number;
  totalCount: number;
}

interface DaySquareProps {
  date: Date;
  activity?: ActivityData;
  size?: number;
}

const DaySquare: React.FC<DaySquareProps> = ({ date, activity, size = 12 }) => {
  const totalActivity = activity?.totalCount || 0;
  
  // Determine intensity level for background color
  const getIntensityLevel = (count: number) => {
    if (count === 0) return 0;
    if (count <= 5) return 1;
    if (count <= 15) return 2;
    if (count <= 30) return 3;
    return 4;
  };

  const intensityLevel = getIntensityLevel(totalActivity);
  
  // Color mapping based on activity levels
  const getBackgroundColor = (level: number) => {
    switch (level) {
      case 0: return 'bg-gray-100 border-gray-200';
      case 1: return 'bg-blue-100 border-blue-200';
      case 2: return 'bg-blue-200 border-blue-300';
      case 3: return 'bg-blue-400 border-blue-500';
      case 4: return 'bg-blue-600 border-blue-700';
      default: return 'bg-gray-100 border-gray-200';
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

  const tooltipContent = activity ? (
    <div className="text-xs">
      <div className="font-semibold">{formatDate(date)}</div>
      <div className="mt-1">
        <div className="text-blue-600">DT Records: {activity.dtCount}</div>
        <div className="text-green-600">BH Records: {activity.bhCount}</div>
        <div className="text-orange-600">P1 Records: {activity.p1Count}</div>
        <div className="text-red-600">Other Records: {activity.otherCount}</div>
        <div className="font-semibold border-t pt-1 mt-1">Total: {activity.totalCount}</div>
      </div>
    </div>
  ) : (
    <div className="text-xs">
      <div className="font-semibold">{formatDate(date)}</div>
      <div className="text-gray-500">No activity</div>
    </div>
  );

  return (
    <div
      className={`${getBackgroundColor(intensityLevel)} border rounded-sm cursor-help relative group`}
      style={{ width: size, height: size }}
    >
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
        {tooltipContent}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black"></div>
      </div>
    </div>
  );
};

const TddfActivityHeatMap: React.FC = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());

  const { data: activityData, isLoading, error } = useQuery<ActivityData[]>({
    queryKey: ['/api/tddf/activity-heatmap', currentYear],
    enabled: true,
  });

  // Create a map for quick lookup of activity data by date
  const activityMap = new Map<string, ActivityData>();
  if (activityData) {
    activityData.forEach(item => {
      activityMap.set(item.date, item);
    });
  }

  // Generate calendar grid for the current month
  const generateCalendarGrid = () => {
    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);
    const startOfWeek = new Date(startDate);
    startOfWeek.setDate(startDate.getDate() - startDate.getDay());
    
    const days = [];
    const current = new Date(startOfWeek);
    
    // Generate 6 weeks (42 days) to cover the month
    for (let i = 0; i < 42; i++) {
      const dateStr = current.toISOString().split('T')[0];
      const isCurrentMonth = current.getMonth() === currentMonth;
      
      days.push({
        date: new Date(current),
        dateStr,
        activity: activityMap.get(dateStr),
        isCurrentMonth
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  };

  const days = generateCalendarGrid();

  // Calculate summary statistics for current month
  const currentMonthStats = days
    .filter(day => day.isCurrentMonth && day.activity)
    .reduce((acc, day) => {
      if (day.activity) {
        acc.dtCount += day.activity.dtCount;
        acc.bhCount += day.activity.bhCount;
        acc.p1Count += day.activity.p1Count;
        acc.otherCount += day.activity.otherCount;
        acc.totalCount += day.activity.totalCount;
        acc.activeDays += 1;
      }
      return acc;
    }, { dtCount: 0, bhCount: 0, p1Count: 0, otherCount: 0, totalCount: 0, activeDays: 0 });

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(currentYear + 1);
      } else {
        setCurrentMonth(currentMonth + 1);
      }
    }
  };

  const navigateToLatest = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 42 }).map((_, i) => (
              <div key={i} className="w-12 h-12 bg-gray-200 rounded-sm"></div>
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Daily transaction volume over time - darker squares indicate more transactions
          </h3>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <Button
              variant="outline"
              size="sm"
              onClick={navigateToLatest}
              className="text-xs"
            >
              Show Latest
            </Button>
          </div>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth('prev')}
          className="p-1 h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <h4 className="text-lg font-semibold text-gray-900">
          {monthNames[currentMonth]} {currentYear}
        </h4>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth('next')}
          className="p-1 h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="mb-4">
        {/* Week day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-xs font-medium text-gray-500 text-center py-1">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => (
            <div key={index} className="flex justify-center">
              <DaySquare
                date={day.date}
                activity={day.activity}
                size={32}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Summary */}
      <div className="border-t pt-4">
        <div className="text-sm text-gray-600 mb-2">
          <span className="font-medium">{currentMonthStats.totalCount}</span> transactions in {monthNames[currentMonth]} {currentYear}
        </div>
        <div className="text-sm text-gray-600">
          Peak day: <span className="font-medium">{Math.max(...days.filter(d => d.isCurrentMonth && d.activity).map(d => d.activity!.totalCount), 0)}</span> transactions
        </div>
        
        {/* Record type breakdown */}
        <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <span>DT: {currentMonthStats.dtCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span>BH: {currentMonthStats.bhCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
            <span>P1: {currentMonthStats.p1Count}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span>Other: {currentMonthStats.otherCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TddfActivityHeatMap;