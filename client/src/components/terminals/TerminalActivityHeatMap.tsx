import { useMemo, useState, useEffect } from "react";
import { Transaction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TerminalActivityHeatMapProps {
  transactions: any[]; // TDDF transactions with transactionDate field
  timeRange: string;
  onDateClick?: (date: string) => void;
}

export default function TerminalActivityHeatMap({ 
  transactions, 
  timeRange,
  onDateClick 
}: TerminalActivityHeatMapProps) {
  
  // Get available years from transactions
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    transactions.forEach(t => {
      const date = new Date(t.transactionDate || t.date);
      if (!isNaN(date.getTime())) {
        years.add(date.getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [transactions]);

  // Current year state - will be updated when availableYears changes
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  // Update selectedYear when availableYears change (when transactions load)
  useEffect(() => {
    if (availableYears.length > 0) {
      setSelectedYear(availableYears[0]); // Most recent year with data
    }
  }, [availableYears]);
  
  // Calculate heat map data
  const heatMapData = useMemo(() => {
    // Filter transactions for selected year
    const yearTransactions = transactions.filter(t => {
      const date = new Date(t.transactionDate || t.date);
      return date.getFullYear() === selectedYear;
    });

    // Set date range for the selected year
    const startDate = new Date(selectedYear, 0, 1); // January 1st of selected year
    const endDate = new Date(selectedYear, 11, 31); // December 31st of selected year
    const now = new Date();
    const actualEndDate = endDate > now ? now : endDate;

    // Group transactions by date
    const transactionsByDate = yearTransactions.reduce((acc, transaction) => {
      const transactionDate = new Date(transaction.transactionDate || transaction.date);
      if (transactionDate >= startDate && transactionDate <= actualEndDate) {
        const dateKey = transactionDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        acc[dateKey] = (acc[dateKey] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Generate grid data for heat map
    const weeks: Array<Array<{ date: string; count: number; dateObj: Date }>> = [];
    let currentDate = new Date(startDate);
    
    // Start from the most recent Sunday
    const dayOfWeek = currentDate.getDay();
    currentDate.setDate(currentDate.getDate() - dayOfWeek);
    
    while (currentDate <= actualEndDate) {
      const week: Array<{ date: string; count: number; dateObj: Date }> = [];
      
      for (let day = 0; day < 7; day++) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const count = transactionsByDate[dateKey] || 0;
        
        week.push({
          date: dateKey,
          count: count,
          dateObj: new Date(currentDate)
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      weeks.push(week);
    }

    // Calculate max count for color intensity
    const maxCount = Math.max(...Object.values(transactionsByDate).map(Number), 1);

    return { weeks, maxCount, totalDays: weeks.length * 7 };
  }, [transactions, selectedYear]);

  // Get color intensity based on transaction count
  const getIntensity = (count: number): string => {
    if (count === 0) return "bg-gray-100";
    
    const intensity = count / heatMapData.maxCount;
    
    if (intensity <= 0.25) return "bg-green-200";
    if (intensity <= 0.5) return "bg-green-400";
    if (intensity <= 0.75) return "bg-green-600";
    return "bg-green-800";
  };

  // Get month labels for the timeline
  const monthLabels = useMemo(() => {
    if (heatMapData.weeks.length === 0) return [];
    
    const labels: Array<{ month: string; position: number }> = [];
    let lastMonth = "";
    
    heatMapData.weeks.forEach((week, weekIndex) => {
      const firstDayOfWeek = week[0].dateObj;
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
  }, [heatMapData.weeks]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Navigation handlers
  const goToPreviousYear = () => {
    const currentIndex = availableYears.indexOf(selectedYear);
    if (currentIndex < availableYears.length - 1) {
      setSelectedYear(availableYears[currentIndex + 1]);
    }
  };

  const goToNextYear = () => {
    const currentIndex = availableYears.indexOf(selectedYear);
    if (currentIndex > 0) {
      setSelectedYear(availableYears[currentIndex - 1]);
    }
  };

  const canGoToPrevious = availableYears.indexOf(selectedYear) < availableYears.length - 1;
  const canGoToNext = availableYears.indexOf(selectedYear) > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Terminal Activity Heat Map
          </h3>
          <p className="text-sm text-gray-600">
            Daily transaction volume over time - darker squares indicate more transactions
          </p>
        </div>
      </div>

      {/* Heat Map Grid Container with Box */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
        <div className="overflow-x-auto">
          <div className="relative" style={{ minWidth: `${heatMapData.weeks.length * 20 + 60}px` }}>
            {/* Year Navigation - Right aligned with heat map */}
            <div className="flex justify-end mb-4" style={{ width: `${heatMapData.weeks.length * 20 + 32}px` }}>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPreviousYear}
                  disabled={!canGoToPrevious}
                  className="p-1 h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <span className="text-lg font-semibold text-gray-900 min-w-[60px] text-center">
                  {selectedYear}
                </span>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNextYear}
                  disabled={!canGoToNext}
                  className="p-1 h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Month labels with precise alignment */}
            <div className="relative mb-2" style={{ height: '16px', marginLeft: '32px' }}>
              {monthLabels.map((label, index) => {
                const position = label.position * 20;
                return (
                  <div
                    key={index}
                    className="text-xs text-gray-500 font-medium absolute"
                    style={{ left: `${position}px` }}
                  >
                    {label.month}
                  </div>
                );
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
                {heatMapData.weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-1">
                    {week.map((day, dayIndex) => (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        className={`w-4 h-4 rounded-sm cursor-pointer transition-all hover:ring-2 hover:ring-blue-300 ${getIntensity(day.count)}`}
                        title={`${day.count} transaction${day.count !== 1 ? 's' : ''} on ${day.dateObj.toLocaleDateString('en-US', { 
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}`}
                        onClick={() => onDateClick && onDateClick(day.date)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Legend - Right aligned with heat map */}
            <div className="flex justify-end mt-4" style={{ width: `${heatMapData.weeks.length * 20 + 32}px` }}>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">{transactions.filter(t => {
                    const transactionDate = new Date(t.transactionDate || t.date);
                    return transactionDate.getFullYear() === selectedYear;
                  }).length}</span> transactions in {selectedYear}
                  <span className="mx-2">•</span>
                  <span>Peak day: <span className="font-medium">{heatMapData.maxCount}</span> transactions</span>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Less</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-gray-100 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-200 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
                    <div className="w-3 h-3 bg-green-800 rounded-sm"></div>
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
}