import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivityData {
  date: string;
  count: number;
}

interface DaySquareProps {
  date: Date;
  activity?: ActivityData;
  isCurrentMonth?: boolean;
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
  maxCount?: number;
}

interface ActivityHeatMapProps {
  data: ActivityData[];
  title: string;
  description: string;
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
  isLoading?: boolean;
  timeRange?: string;
}

const DaySquare: React.FC<DaySquareProps> = ({ 
  date, 
  activity, 
  isCurrentMonth = true, 
  onDateSelect, 
  selectedDate,
  maxCount = 1
}) => {
  const count = activity?.count || 0;
  const dateString = date.toISOString().split('T')[0];
  const isSelected = selectedDate === dateString;
  
  // Enhanced gradient mapping using intensity calculation
  const getBackgroundColor = (count: number, isSelected: boolean, maxCount: number) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    const intensity = count / maxCount;
    
    // Green gradient for low activity (0-25%)
    if (intensity <= 0.125) return 'bg-green-100 hover:bg-green-200';
    if (intensity <= 0.25) return 'bg-green-200 hover:bg-green-300';
    
    // Medium green for moderate activity (25-50%)
    if (intensity <= 0.375) return 'bg-green-400 hover:bg-green-500';
    if (intensity <= 0.5) return 'bg-green-600 hover:bg-green-700';
    
    // Blue for high activity (50-75%)
    if (intensity <= 0.625) return 'bg-blue-500 hover:bg-blue-600';
    if (intensity <= 0.75) return 'bg-blue-700 hover:bg-blue-800';
    
    // Purple for peak activity (75-100%)
    if (intensity <= 0.875) return 'bg-purple-600 hover:bg-purple-700';
    return 'bg-purple-800 hover:bg-purple-900';
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
      className={`w-4 h-4 rounded-sm relative group transition-all duration-200 ${getBackgroundColor(count, isSelected, maxCount)} ${!isCurrentMonth ? 'opacity-30' : ''} ${count > 0 ? 'cursor-pointer' : 'cursor-help'}`}
      title={`${formatDate(date)}: ${count} transaction${count !== 1 ? 's' : ''}${count > 0 && onDateSelect ? ' (Click to filter)' : ''}`}
      onClick={handleClick}
    />
  );
};

function ActivityHeatMapSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-80 animate-pulse"></div>
        </div>
      </div>

      {/* Heat Map Grid Skeleton */}
      <div className="bg-gray-50 rounded-lg p-6">
        {/* Year Navigation Skeleton */}
        <div className="flex justify-between items-center mb-6">
          <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>

        {/* Month Labels Skeleton */}
        <div className="flex justify-between mb-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded w-6 animate-pulse"></div>
          ))}
        </div>

        {/* Heat Map Grid Skeleton */}
        <div className="mb-6">
          <div className="flex gap-1">
            {/* Day Labels */}
            <div className="flex flex-col gap-1 mr-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <div key={i} className="h-4 bg-gray-200 rounded w-6 animate-pulse text-xs"></div>
              ))}
            </div>
            
            {/* Weeks Grid */}
            {Array.from({ length: 53 }).map((_, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, dayIndex) => (
                  <div key={dayIndex} className="w-4 h-4 bg-gray-200 rounded-sm animate-pulse"></div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend Skeleton */}
        <div className="flex justify-end">
          <div className="flex items-center gap-4">
            <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
            <div className="flex gap-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="w-3 h-3 bg-gray-200 rounded-sm animate-pulse"></div>
              ))}
            </div>
            <div className="h-4 bg-gray-200 rounded w-8 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ActivityHeatMap({ 
  data, 
  title, 
  description, 
  onDateSelect, 
  selectedDate,
  isLoading = false,
  timeRange
}: ActivityHeatMapProps) {
  
  // Show skeleton while loading
  if (isLoading) {
    return <ActivityHeatMapSkeleton />;
  }

  // Get available years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach(item => {
      if (item.date) {
        const date = new Date(item.date);
        if (!isNaN(date.getTime())) {
          years.add(date.getFullYear());
        }
      }
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [data]);

  // Current year state - will be updated when availableYears changes
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  // Update selectedYear when availableYears change (when data loads)
  useEffect(() => {
    if (availableYears.length > 0) {
      setSelectedYear(availableYears[0]); // Most recent year with data
    }
  }, [availableYears]);

  // Calculate heat map data
  const heatMapData = useMemo(() => {
    // Filter data for selected year
    const yearData = data.filter(item => {
      if (!item.date) return false;
      const date = new Date(item.date);
      return date.getFullYear() === selectedYear;
    });

    // Set date range for the selected year
    const startDate = new Date(selectedYear, 0, 1); // January 1st of selected year
    const endDate = new Date(selectedYear, 11, 31); // December 31st of selected year
    const now = new Date();
    const actualEndDate = endDate > now ? now : endDate;

    // Group data by date
    const dataByDate = yearData.reduce((acc, item) => {
      if (item.date) {
        const itemDate = new Date(item.date);
        if (itemDate >= startDate && itemDate <= actualEndDate) {
          const dateKey = itemDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          acc[dateKey] = (acc[dateKey] || 0) + item.count;
        }
      }
      return acc;
    }, {} as Record<string, number>);

    // Generate grid data for heat map
    const weeks: Array<Array<{ date: string; count: number; dateObj: Date }>> = [];
    let currentDate = new Date(startDate);
    
    // Start from the most recent Sunday
    const dayOfWeek = currentDate.getDay();
    currentDate.setDate(currentDate.getDate() - dayOfWeek);
    
    let weekIndex = 0;
    while (currentDate <= actualEndDate && weekIndex < 53) { // Limit to 53 weeks
      const week: Array<{ date: string; count: number; dateObj: Date }> = [];
      
      for (let day = 0; day < 7; day++) {
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
      weekIndex++;
    }

    // Calculate max count for color intensity
    const maxCount = Math.max(...Object.values(dataByDate).map(Number), 1);

    return { weeks, maxCount, totalDays: weeks.length * 7 };
  }, [data, selectedYear]);

  // Navigate years
  const navigateYear = (direction: 'prev' | 'next') => {
    const currentIndex = availableYears.indexOf(selectedYear);
    if (direction === 'prev' && currentIndex < availableYears.length - 1) {
      setSelectedYear(availableYears[currentIndex + 1]);
    } else if (direction === 'next' && currentIndex > 0) {
      setSelectedYear(availableYears[currentIndex - 1]);
    }
  };

  // Month names for labels
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>

      {/* Heat Map Container */}
      <div className="bg-gray-50 rounded-lg p-6">
        {/* Year Navigation - Right aligned inside container */}
        <div className="flex justify-end items-center mb-6" style={{ width: `${heatMapData.weeks.length * 20 + 32}px` }}>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateYear('prev')}
              disabled={availableYears.indexOf(selectedYear) >= availableYears.length - 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-lg min-w-[80px] text-center">{selectedYear}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateYear('next')}
              disabled={availableYears.indexOf(selectedYear) <= 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Month Labels - Positioned to align with grid */}
        <div className="flex justify-between mb-2" style={{ 
          width: `${heatMapData.weeks.length * 20 + 32}px`,
          paddingLeft: '32px' 
        }}>
          {monthNames.map((month, index) => {
            const monthPosition = (index * heatMapData.weeks.length * 20) / 12;
            return (
              <div 
                key={month} 
                className="text-xs text-gray-600 font-medium"
                style={{ 
                  position: 'absolute',
                  left: `${monthPosition}px`,
                  transform: 'translateX(-50%)'
                }}
              >
                {month}
              </div>
            );
          })}
        </div>

        {/* Heat Map Grid */}
        <div className="mb-6">
          <div className="flex gap-1">
            {/* Day Labels */}
            <div className="flex flex-col gap-1 mr-2 justify-between">
              {dayNames.map((day, i) => (
                <div key={i} className="text-xs text-gray-600 font-medium h-4 flex items-center">
                  {i % 2 === 1 ? day : ''} {/* Show only alternate days for space */}
                </div>
              ))}
            </div>
            
            {/* Heat Map Grid */}
            <div className="flex gap-1">
              {heatMapData.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((day, dayIndex) => (
                    <DaySquare
                      key={`${weekIndex}-${dayIndex}`}
                      date={day.dateObj}
                      activity={{ date: day.date, count: day.count }}
                      onDateSelect={onDateSelect}
                      selectedDate={selectedDate}
                      maxCount={heatMapData.maxCount}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Legend - Right aligned with heat map inside container */}
        <div className="flex justify-end" style={{ width: `${heatMapData.weeks.length * 20 + 32}px` }}>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium">{data.filter(item => {
                if (!item.date) return false;
                const itemDate = new Date(item.date);
                return itemDate.getFullYear() === selectedYear;
              }).reduce((sum, item) => sum + item.count, 0)}</span> transactions in {selectedYear}
              <span className="mx-2">•</span>
              <span>Peak day: <span className="font-medium">{heatMapData.maxCount}</span> transactions</span>
            </div>
            
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
        </div>
      </div>
    </div>
  );
}