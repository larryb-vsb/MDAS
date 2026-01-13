import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MerchantActivityData {
  date: string;
  transactionCount: number;
}

interface DaySquareProps {
  date: Date;
  activity?: MerchantActivityData;
  isCurrentMonth?: boolean;
  onClick?: (date: string) => void;
  isSelected?: boolean;
}

const DaySquare: React.FC<DaySquareProps> = ({ date, activity, isCurrentMonth = true, onClick, isSelected = false }) => {
  const count = activity?.transactionCount || 0;
  
  // Enhanced gradient mapping for merchant transactions: 0-50 Green, 50-100 Blue, 100+ Purple
  const getBackgroundColor = (count: number) => {
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    // Green gradient: 0-50 transactions
    if (count <= 50) {
      if (count <= 10) return 'bg-green-100 hover:bg-green-200';
      if (count <= 25) return 'bg-green-300 hover:bg-green-400';
      if (count <= 40) return 'bg-green-500 hover:bg-green-600';
      return 'bg-green-700 hover:bg-green-800';
    }
    
    // Blue gradient: 50-100 transactions
    if (count <= 100) {
      if (count <= 65) return 'bg-blue-300 hover:bg-blue-400';
      if (count <= 80) return 'bg-blue-500 hover:bg-blue-600';
      if (count <= 95) return 'bg-blue-700 hover:bg-blue-800';
      return 'bg-blue-900 hover:bg-blue-950';
    }
    
    // Purple gradient: 100+ transactions
    if (count <= 120) return 'bg-purple-400 hover:bg-purple-500';
    if (count <= 150) return 'bg-purple-600 hover:bg-purple-700';
    if (count <= 200) return 'bg-purple-800 hover:bg-purple-900';
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
    if (onClick && count > 0) {
      const dateStr = date.toISOString().split('T')[0];
      onClick(dateStr);
    }
  };

  return (
    <div
      className={`w-4 h-4 rounded-sm relative group transition-colors ${
        count > 0 ? 'cursor-pointer' : 'cursor-help'
      } ${getBackgroundColor(count)} ${!isCurrentMonth ? 'opacity-30' : ''} ${
        isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
      }`}
      title={`${formatDate(date)}: ${count} transactions${count > 0 ? ' (click to filter)' : ''}`}
      onClick={handleClick}
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

interface MerchantActivityHeatMapProps {
  merchantAccountNumber: string;
  onDateFilter?: (date: string | null) => void;
  selectedDate?: string | null;
}

const MerchantActivityHeatMap: React.FC<MerchantActivityHeatMapProps> = ({ 
  merchantAccountNumber, 
  onDateFilter, 
  selectedDate 
}) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const handleDateClick = (dateStr: string) => {
    if (onDateFilter) {
      // If same date is clicked, clear filter; otherwise set new filter
      const newFilter = selectedDate === dateStr ? null : dateStr;
      onDateFilter(newFilter);
    }
  };
  
  // Fetch merchant info to get last transaction year
  const { data: merchantInfo } = useQuery({
    queryKey: ['/api/tddf/merchants/single', merchantAccountNumber],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/merchants/details/${merchantAccountNumber}`);
      if (!response.ok) throw new Error('Failed to fetch merchant info');
      return response.json();
    },
  });

  // Set initial year to last transaction year when merchant data loads
  React.useEffect(() => {
    if (merchantInfo && merchantInfo.lastTransactionDate) {
      const lastTxnYear = new Date(merchantInfo.lastTransactionDate).getFullYear();
      setCurrentYear(lastTxnYear);
    }
  }, [merchantInfo]);

  const { data: activityData, isLoading, error } = useQuery<MerchantActivityData[]>({
    queryKey: ['/api/tddf/merchant-activity-heatmap', merchantAccountNumber, currentYear],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/merchant-activity-heatmap/${merchantAccountNumber}?year=${currentYear}`);
      if (!response.ok) throw new Error('Failed to fetch merchant activity data');
      return response.json();
    },
    enabled: true,
  });

  // Create a map for quick lookup of activity data by date
  const activityMap = new Map<string, MerchantActivityData>();
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
    acc.totalCount += parseInt(day.transactionCount.toString());
    acc.activeDays += 1;
    return acc;
  }, { totalCount: 0, activeDays: 0 }) : { totalCount: 0, activeDays: 0 };

  const peakDay = activityData ? Math.max(...activityData.map(d => parseInt(d.transactionCount.toString()))) : 0;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekDays = ['Mon', 'Wed', 'Fri'];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        {/* Header - exact same structure as loaded state */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-6 bg-gray-200 rounded w-64 mb-1 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-96 animate-pulse"></div>
          </div>
        </div>

        {/* Heat Map Grid Container with Box - Same structure as loaded state */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
          <div className="overflow-x-auto">
            <div className="relative" style={{ minWidth: `${53 * 20 + 60}px` }}>
              {/* Year Navigation Placeholder - exact same positioning */}
              <div className="flex justify-end mb-4" style={{ width: `${53 * 20 + 32}px` }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-16 h-6 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
              
              {/* Month labels placeholder - exact same positioning */}
              <div className="relative mb-2" style={{ height: '16px', marginLeft: '32px' }}>
                <div className="w-8 h-3 bg-gray-200 rounded animate-pulse absolute" style={{ left: '0px' }}></div>
                <div className="w-8 h-3 bg-gray-200 rounded animate-pulse absolute" style={{ left: '200px' }}></div>
                <div className="w-8 h-3 bg-gray-200 rounded animate-pulse absolute" style={{ left: '400px' }}></div>
                <div className="w-8 h-3 bg-gray-200 rounded animate-pulse absolute" style={{ left: '600px' }}></div>
              </div>
              
              <div className="flex">
                {/* Day labels - exact same structure */}
                <div className="flex flex-col justify-around text-xs text-gray-500 w-8" style={{ height: '140px' }}>
                  <div className="w-6 h-3 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-6 h-3 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-6 h-3 bg-gray-200 rounded animate-pulse"></div>
                </div>
                
                {/* Grid skeleton - exact same size (4x4 pixels) */}
                <div className="flex gap-1">
                  {Array.from({ length: 53 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <div key={j} className="w-4 h-4 bg-gray-200 rounded-sm animate-pulse"></div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Legend placeholder - exact same positioning */}
              <div className="flex justify-end mt-4" style={{ width: `${53 * 20 + 32}px` }}>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="w-3 h-3 bg-gray-200 rounded-sm animate-pulse"></div>
                      ))}
                    </div>
                    <div className="w-8 h-3 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="text-red-600">
          Error loading activity data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Transaction Activity Heat Map
          </h3>
          <p className="text-sm text-gray-600">
            Daily transaction volume over time - darker squares indicate more transactions
          </p>
          {merchantInfo && (
            <div className="flex items-center gap-2 text-sm mt-2">
              <span className="text-gray-500">Total Transactions:</span>
              <span className="font-semibold text-blue-600">
                {merchantInfo.totalTransactions?.toLocaleString() || 'N/A'}
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-500">Last Transaction Year:</span>
              <span className="font-semibold text-green-600">
                {merchantInfo.lastTransactionDate ? 
                  new Date(merchantInfo.lastTransactionDate).getFullYear() : 'N/A'}
              </span>
            </div>
          )}
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
                  disabled={currentYear >= new Date().getFullYear()}
                  className="p-1 h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Month labels with precise alignment */}
            <div className="relative mb-2" style={{ height: '16px', marginLeft: '32px' }}>
              {monthNames.map((month, index) => {
                if (index % 2 === 0) {
                  const position = (weeks.length / 12) * index * 20;
                  return (
                    <div
                      key={month}
                      className="text-xs text-gray-500 font-medium absolute"
                      style={{ left: `${position}px` }}
                    >
                      {month}
                    </div>
                  );
                }
                return null;
              })}
            </div>
            
            <div className="flex">
              {/* Day labels */}
              <div className="flex flex-col justify-around text-xs text-gray-500 w-8" style={{ height: '140px' }}>
                <div>Mon</div>
                <div>Wed</div>
                <div>Fri</div>
              </div>
              
              {/* Heat map grid */}
              <div className="flex gap-1">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-1">
                    {week.map((day, dayIndex) => (
                      <DaySquare
                        key={`${day.dateStr}-${dayIndex}`}
                        date={day.date}
                        activity={day.activity}
                        isCurrentMonth={day.isCurrentYear}
                        onClick={handleDateClick}
                        isSelected={selectedDate === day.dateStr}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Legend - Right aligned with heat map */}
            <div className="flex justify-end mt-4" style={{ width: `${weeks.length * 20 + 32}px` }}>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">{yearStats.totalCount}</span> transactions in {currentYear}
                  <span className="mx-2">•</span>
                  <span>Peak day: <span className="font-medium">{peakDay}</span> transactions</span>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Less</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-gray-100 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-300 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                    <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                    <div className="w-3 h-3 bg-purple-600 rounded-sm"></div>
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

export default MerchantActivityHeatMap;