import { useMemo } from "react";
import { Transaction } from "@shared/schema";

interface TerminalActivityHeatMapProps {
  transactions: any[]; // TDDF transactions with transactionDate field
  timeRange: string;
}

export default function TerminalActivityHeatMap({ 
  transactions, 
  timeRange 
}: TerminalActivityHeatMapProps) {
  
  // Calculate heat map data
  const heatMapData = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    
    // Determine date range
    switch (timeRange) {
      case "30days":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "3months":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "6months":
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case "12months":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default: // "all"
        if (transactions.length > 0) {
          const earliestTransaction = transactions.reduce((earliest, t) => 
            new Date(t.transactionDate || t.date) < new Date(earliest.transactionDate || earliest.date) ? t : earliest
          );
          startDate = new Date(earliestTransaction.transactionDate || earliestTransaction.date);
          startDate.setDate(startDate.getDate() - 7); // Add some padding
        } else {
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        }
    }

    // Group transactions by date
    const transactionsByDate = transactions.reduce((acc, transaction) => {
      const transactionDate = new Date(transaction.transactionDate || transaction.date);
      if (transactionDate >= startDate && transactionDate <= now) {
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
    
    while (currentDate <= now) {
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
  }, [transactions, timeRange]);

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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>{heatMapData.weeks.length} weeks of activity</span>
        <div className="flex items-center gap-2">
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
            const startOfRange = heatMapData.weeks[0]?.[0]?.dateObj || new Date();
            return transactionDate >= startOfRange;
          }).length}</strong> transactions in the selected period
        </div>
        <div>
          Peak day: <strong>{heatMapData.maxCount}</strong> transactions
        </div>
      </div>
    </div>
  );
}