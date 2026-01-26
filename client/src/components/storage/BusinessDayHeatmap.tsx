import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, eachDayOfInterval, startOfWeek, endOfWeek, startOfYear, endOfYear, subMonths } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ActivityData {
  date: string;
  count: number;
}

interface HeatmapResponse {
  data: ActivityData[];
  year?: number | null;
  months?: number | null;
}

interface BusinessDayHeatmapProps {
  className?: string;
}

const CELL_SIZE = 10;
const CELL_GAP = 2;
const WEEK_WIDTH = CELL_SIZE + CELL_GAP;

function getIntensityLevel(count: number, maxCount: number): number {
  if (count === 0) return 0;
  if (maxCount === 0) return 0;
  
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function getIntensityColor(level: number): string {
  switch (level) {
    case 0: return 'bg-gray-100 dark:bg-gray-800';
    case 1: return 'bg-blue-200 dark:bg-blue-900';
    case 2: return 'bg-blue-400 dark:bg-blue-700';
    case 3: return 'bg-blue-500 dark:bg-blue-600';
    case 4: return 'bg-blue-700 dark:bg-blue-500';
    default: return 'bg-gray-100 dark:bg-gray-800';
  }
}

export function BusinessDayHeatmap({ className }: BusinessDayHeatmapProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const isCurrentYear = selectedYear === currentYear;
  
  const { data, isLoading } = useQuery<HeatmapResponse>({
    queryKey: [isCurrentYear 
      ? `/api/storage/master-keys/business-day-heatmap?months=12` 
      : `/api/storage/master-keys/business-day-heatmap?year=${selectedYear}`
    ],
  });
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!data || !data.data) {
    return (
      <div className="text-sm text-muted-foreground text-center py-2">
        No activity data available
      </div>
    );
  }
  
  const activityData = data.data;
  
  const activityMap = new Map<string, number>();
  activityData.forEach(item => {
    const dateStr = format(new Date(item.date), 'yyyy-MM-dd');
    activityMap.set(dateStr, item.count);
  });
  
  const maxCount = Math.max(...activityData.map(d => d.count), 1);
  
  const today = new Date();
  
  let rangeStart: Date;
  let rangeEnd: Date;
  
  if (isCurrentYear) {
    rangeStart = subMonths(today, 12);
    rangeEnd = today;
  } else {
    rangeStart = startOfYear(new Date(selectedYear, 0, 1));
    rangeEnd = endOfYear(new Date(selectedYear, 0, 1));
  }
  
  const allDays = eachDayOfInterval({
    start: startOfWeek(rangeStart, { weekStartsOn: 0 }),
    end: endOfWeek(rangeEnd, { weekStartsOn: 0 })
  });
  
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  
  allDays.forEach((day) => {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }
  
  const monthLabels: { label: string; weekIndex: number }[] = [];
  let lastMonth = -1;
  
  weeks.forEach((week, weekIndex) => {
    const firstDayOfWeek = week[0];
    const month = firstDayOfWeek.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({
        label: format(firstDayOfWeek, 'MMM'),
        weekIndex
      });
      lastMonth = month;
    }
  });
  
  const totalCount = activityData.reduce((sum, d) => sum + d.count, 0);
  const gridWidth = weeks.length * WEEK_WIDTH;
  const dayLabelWidth = 28;
  
  return (
    <TooltipProvider>
      <div className={cn("flex items-start gap-6", className)}>
        <div className="border border-border rounded-lg p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">
              {totalCount.toLocaleString()} files by business day {isCurrentYear ? 'in the last year' : `in ${selectedYear}`}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-4">
              <span>Less</span>
              <div className={cn("w-[10px] h-[10px] rounded-sm", getIntensityColor(0))} />
              <div className={cn("w-[10px] h-[10px] rounded-sm", getIntensityColor(1))} />
              <div className={cn("w-[10px] h-[10px] rounded-sm", getIntensityColor(2))} />
              <div className={cn("w-[10px] h-[10px] rounded-sm", getIntensityColor(3))} />
              <div className={cn("w-[10px] h-[10px] rounded-sm", getIntensityColor(4))} />
              <span>More</span>
            </div>
          </div>
          
          <div className="flex">
            <div className="flex flex-col text-[10px] text-muted-foreground pr-1" style={{ width: dayLabelWidth, paddingTop: 15 }}>
              <div style={{ height: CELL_SIZE + CELL_GAP }} />
              <div className="flex items-center" style={{ height: CELL_SIZE }}>Mon</div>
              <div style={{ height: CELL_SIZE + CELL_GAP }} />
              <div className="flex items-center" style={{ height: CELL_SIZE }}>Wed</div>
              <div style={{ height: CELL_SIZE + CELL_GAP }} />
              <div className="flex items-center" style={{ height: CELL_SIZE }}>Fri</div>
            </div>
            
            <div style={{ width: gridWidth }}>
              <div className="relative" style={{ height: 14, marginBottom: 1 }}>
                {monthLabels.map((monthInfo, i) => (
                  <span 
                    key={i}
                    className="text-[10px] text-muted-foreground absolute"
                    style={{ left: monthInfo.weekIndex * WEEK_WIDTH }}
                  >
                    {monthInfo.label}
                  </span>
                ))}
              </div>
              
              <div className="flex" style={{ gap: CELL_GAP }}>
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col" style={{ gap: CELL_GAP }}>
                    {week.map((day, dayIndex) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const count = activityMap.get(dateStr) || 0;
                      const level = getIntensityLevel(count, maxCount);
                      const isInRange = day >= rangeStart && day <= rangeEnd;
                      
                      return (
                        <Tooltip key={dayIndex}>
                          <TooltipTrigger asChild>
                            <div 
                              className={cn(
                                "rounded-sm cursor-pointer transition-colors",
                                isInRange ? getIntensityColor(level) : 'bg-transparent',
                                isInRange && "hover:ring-1 hover:ring-gray-400"
                              )}
                              style={{ width: CELL_SIZE, height: CELL_SIZE }}
                            />
                          </TooltipTrigger>
                          {isInRange && (
                            <TooltipContent side="top" className="text-xs">
                              <div className="font-medium">{format(day, 'MMM d, yyyy')}</div>
                              <div className="text-muted-foreground">
                                {count} {count === 1 ? 'file' : 'files'}
                              </div>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col gap-1 pt-1">
          {availableYears.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors text-right",
                year === selectedYear
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
