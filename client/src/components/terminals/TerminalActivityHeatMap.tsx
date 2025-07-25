import { useMemo, useState } from "react";
import { Transaction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TerminalActivityHeatMapProps {
  transactions: any[]; // TDDF transactions with transactionDate field
  timeRange: string;
}

export default function TerminalActivityHeatMap({ 
  transactions, 
  timeRange 
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

  // Current year state - default to most recent year with data
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return availableYears.length > 0 ? availableYears[0] : new Date().getFullYear();
  });
  
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
    const maxCount = Math.max(...Object.values(transactionsByDate), 1);

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
    <div className="space-y-4">
      {/* Year Navigation */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousYear}
            disabled={!canGoToPrevious}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold min-w-[80px] text-center">{selectedYear}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextYear}
            disabled={!canGoToNext}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
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

      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: `${heatMapData.weeks.length * 14 + 60}px` }}>
          {/* Month labels */}
          <div className="flex relative mb-2" style={{ marginLeft: '40px' }}>
            {monthLabels.map((label, index) => (
              <div
                key={index}
                className="absolute text-xs text-muted-foreground"
                style={{ left: `${label.position * 14}px` }}
              >
                {label.month}
              </div>
            ))}
          </div>

          <div className="flex">
            {/* Day labels */}
            <div className="flex flex-col justify-between text-xs text-muted-foreground w-10">
              {dayLabels.map((day, index) => (
                index % 2 === 1 && (
                  <div key={day} className="h-3 flex items-center">
                    {day}
                  </div>
                )
              ))}
            </div>

            {/* Heat map grid */}
            <div className="flex gap-1">
              {heatMapData.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((day, dayIndex) => (
                    <div
                      key={`${weekIndex}-${dayIndex}`}
                      className={`w-3 h-3 rounded-sm cursor-pointer transition-all hover:ring-2 hover:ring-blue-300 ${getIntensity(day.count)}`}
                      title={`${day.count} transaction${day.count !== 1 ? 's' : ''} on ${day.dateObj.toLocaleDateString('en-US', { 
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="text-sm text-muted-foreground space-y-1">
        <div>
          <strong>{transactions.filter(t => {
            const transactionDate = new Date(t.transactionDate || t.date);
            return transactionDate.getFullYear() === selectedYear;
          }).length}</strong> transactions in {selectedYear}
        </div>
        <div>
          Peak day: <strong>{heatMapData.maxCount}</strong> transactions
        </div>
      </div>
    </div>
  );
}