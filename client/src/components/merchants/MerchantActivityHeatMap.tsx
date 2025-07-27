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
}

const DaySquare: React.FC<DaySquareProps> = ({ date, activity, isCurrentMonth = true }) => {
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

  return (
    <div
      className={`w-3 h-3 rounded-sm cursor-help relative group transition-colors ${getBackgroundColor(count)} ${!isCurrentMonth ? 'opacity-30' : ''}`}
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

interface MerchantActivityHeatMapProps {
  merchantAccountNumber: string;
}

const MerchantActivityHeatMap: React.FC<MerchantActivityHeatMapProps> = ({ merchantAccountNumber }) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
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
          <h3 className="text-lg font-semibold text-gray-900">Transaction Activity Heat Map</h3>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm text-gray-600">
              Daily transaction volume over time - darker squares indicate more transactions
            </p>
            {merchantInfo && (
              <div className="flex items-center gap-2 text-sm">
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentYear(currentYear - 1)}
            className="flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-gray-900 min-w-[60px] text-center">
            {currentYear}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentYear(currentYear + 1)}
            disabled={currentYear >= new Date().getFullYear()}
            className="flex items-center gap-1"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {/* Month labels */}
        <div className="flex gap-1 mb-2 ml-6">
          {monthNames.map((month, index) => (
            <div
              key={month}
              className="text-xs text-gray-500 font-medium"
              style={{ width: `${(weeks.length / 12) * 13}px`, minWidth: '20px' }}
            >
              {index % 2 === 0 ? month : ''}
            </div>
          ))}
        </div>

        <div className="flex gap-1">
          {/* Weekday labels */}
          <div className="flex flex-col gap-1 mr-2">
            {weekDays.map((day, index) => (
              <div key={day} className="h-3 text-xs text-gray-500 font-medium flex items-center">
                {index === 0 && 'Mon'}
                {index === 1 && 'Wed'}
                {index === 2 && 'Fri'}
              </div>
            ))}
            <div className="h-3"></div>
            <div className="h-3"></div>
            <div className="h-3"></div>
            <div className="h-3"></div>
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
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend and stats */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
        <div className="text-sm text-gray-600">
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
  );
};

export default MerchantActivityHeatMap;