import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Activity } from "lucide-react";

interface TddfActivityHeatMapProps {
  className?: string;
}

interface ActivityData {
  date: string;
  dtCount: number;
  bhCount: number;
  p1Count: number;
  otherCount: number;
  totalCount: number;
}

export default function TddfActivityHeatMap({ className = "" }: TddfActivityHeatMapProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Fetch TDDF activity data for heat map
  const { data: activityData = [], isLoading } = useQuery({
    queryKey: ['/api/tddf/activity-heatmap', selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/activity-heatmap?year=${selectedYear}`, { 
        credentials: 'include' 
      });
      if (!response.ok) throw new Error('Failed to fetch TDDF activity data');
      return response.json();
    },
  });

  // Get available years from activity data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    activityData.forEach((day: ActivityData) => {
      const date = new Date(day.date);
      if (!isNaN(date.getTime())) {
        years.add(date.getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [activityData]);

  // Update selectedYear when availableYears change
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]); // Most recent year with data
    }
  }, [availableYears, selectedYear]);

  // Calculate heat map data for selected year
  const heatMapData = useMemo(() => {
    const startDate = new Date(selectedYear, 0, 1); // January 1st
    const endDate = new Date(selectedYear, 11, 31); // December 31st
    const now = new Date();
    const actualEndDate = endDate > now ? now : endDate;

    // Create map of dates with activity
    const activityByDate = new Map<string, ActivityData>();
    activityData.forEach((day: ActivityData) => {
      const date = new Date(day.date);
      if (date >= startDate && date <= actualEndDate) {
        const dateKey = date.toISOString().split('T')[0];
        activityByDate.set(dateKey, day);
      }
    });

    // Generate all days for the year
    const days: Array<{ date: Date; activity: ActivityData | null }> = [];
    for (let d = new Date(startDate); d <= actualEndDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      days.push({
        date: new Date(d),
        activity: activityByDate.get(dateKey) || null
      });
    }

    return days;
  }, [activityData, selectedYear]);

  // Calculate intensity levels for colors
  const maxActivity = useMemo(() => {
    return Math.max(...activityData.map((day: ActivityData) => day.totalCount), 1);
  }, [activityData]);

  const getIntensity = (count: number) => {
    if (count === 0) return 0;
    const intensity = Math.ceil((count / maxActivity) * 4);
    return Math.min(intensity, 4);
  };

  const getColorClass = (activity: ActivityData | null, recordType: 'dt' | 'bh' | 'p1' | 'other' | 'total' = 'total') => {
    if (!activity) return 'bg-gray-100';
    
    let count = 0;
    switch (recordType) {
      case 'dt': count = activity.dtCount; break;
      case 'bh': count = activity.bhCount; break;
      case 'p1': count = activity.p1Count; break;
      case 'other': count = activity.otherCount; break;
      default: count = activity.totalCount; break;
    }
    
    const intensity = getIntensity(count);
    
    // Use different color schemes for different record types
    switch (recordType) {
      case 'dt':
        return intensity === 0 ? 'bg-gray-100' : 
               intensity === 1 ? 'bg-blue-100' :
               intensity === 2 ? 'bg-blue-200' :
               intensity === 3 ? 'bg-blue-400' : 'bg-blue-600';
      case 'bh':
        return intensity === 0 ? 'bg-gray-100' : 
               intensity === 1 ? 'bg-green-100' :
               intensity === 2 ? 'bg-green-200' :
               intensity === 3 ? 'bg-green-400' : 'bg-green-600';
      case 'p1':
        return intensity === 0 ? 'bg-gray-100' : 
               intensity === 1 ? 'bg-orange-100' :
               intensity === 2 ? 'bg-orange-200' :
               intensity === 3 ? 'bg-orange-400' : 'bg-orange-600';
      case 'other':
        return intensity === 0 ? 'bg-gray-100' : 
               intensity === 1 ? 'bg-red-100' :
               intensity === 2 ? 'bg-red-200' :
               intensity === 3 ? 'bg-red-400' : 'bg-red-600';
      default:
        return intensity === 0 ? 'bg-gray-100' : 
               intensity === 1 ? 'bg-slate-200' :
               intensity === 2 ? 'bg-slate-300' :
               intensity === 3 ? 'bg-slate-500' : 'bg-slate-700';
    }
  };

  const formatTooltip = (activity: ActivityData | null, date: Date) => {
    if (!activity) {
      return `${date.toLocaleDateString()}: No activity`;
    }
    return `${date.toLocaleDateString()}: ${activity.totalCount} total (DT: ${activity.dtCount}, BH: ${activity.bhCount}, P1: ${activity.p1Count}, Other: ${activity.otherCount})`;
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            TDDF Activity Heat Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading activity data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group days by weeks for display
  const weeks: Array<Array<{ date: Date; activity: ActivityData | null }>> = [];
  let currentWeek: Array<{ date: Date; activity: ActivityData | null }> = [];

  heatMapData.forEach((day, index) => {
    if (index === 0) {
      // Fill beginning of first week with empty days
      const dayOfWeek = day.date.getDay();
      for (let i = 0; i < dayOfWeek; i++) {
        currentWeek.push({ date: new Date(), activity: null });
      }
    }
    
    currentWeek.push(day);
    
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  // Add remaining days to last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: new Date(), activity: null });
    }
    weeks.push(currentWeek);
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            TDDF Activity Heat Map
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedYear(selectedYear - 1)}
              disabled={selectedYear <= 2020}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold min-w-[4rem] text-center">{selectedYear}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedYear(selectedYear + 1)}
              disabled={selectedYear >= new Date().getFullYear() + 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-400 rounded-sm"></div>
                <span>DT Records</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
                <span>BH Records</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-400 rounded-sm"></div>
                <span>P1 Records</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-400 rounded-sm"></div>
                <span>Other Records</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span>Less</span>
              <div className="w-3 h-3 bg-gray-100 rounded-sm"></div>
              <div className="w-3 h-3 bg-slate-200 rounded-sm"></div>
              <div className="w-3 h-3 bg-slate-300 rounded-sm"></div>
              <div className="w-3 h-3 bg-slate-500 rounded-sm"></div>
              <div className="w-3 h-3 bg-slate-700 rounded-sm"></div>
              <span>More</span>
            </div>
          </div>

          {/* Heat map grid */}
          <div className="space-y-1">
            {/* Month labels */}
            <div className="flex pl-8">
              {monthNames.map((month, index) => (
                <div key={month} className="text-xs text-muted-foreground text-center" style={{ width: '39px' }}>
                  {index % 2 === 0 ? month : ''}
                </div>
              ))}
            </div>

            {/* Day labels and grid */}
            <div className="flex">
              {/* Day of week labels */}
              <div className="flex flex-col gap-1 mr-2">
                {dayNames.map((day, index) => (
                  <div key={day} className="h-3 text-xs text-muted-foreground flex items-center">
                    {index % 2 === 1 ? day.slice(0, 3) : ''}
                  </div>
                ))}
              </div>

              {/* Heat map grid */}
              <div className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, dayIndex) => (
                  <div key={dayIndex} className="flex gap-1">
                    {weeks.map((week, weekIndex) => {
                      const day = week[dayIndex];
                      if (!day || !day.date || day.date.getTime() === 0) {
                        return <div key={weekIndex} className="w-3 h-3 bg-transparent"></div>;
                      }
                      
                      return (
                        <div
                          key={weekIndex}
                          className={`w-3 h-3 rounded-sm cursor-pointer hover:ring-2 hover:ring-blue-300 ${getColorClass(day.activity)}`}
                          title={formatTooltip(day.activity, day.date)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="flex items-center justify-between pt-2 border-t text-sm">
            <div className="text-muted-foreground">
              Total records in {selectedYear}: {activityData.reduce((sum: number, day: ActivityData) => sum + day.totalCount, 0).toLocaleString()}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-blue-600">
                DT: {activityData.reduce((sum: number, day: ActivityData) => sum + day.dtCount, 0).toLocaleString()}
              </span>
              <span className="text-green-600">
                BH: {activityData.reduce((sum: number, day: ActivityData) => sum + day.bhCount, 0).toLocaleString()}
              </span>
              <span className="text-orange-600">
                P1: {activityData.reduce((sum: number, day: ActivityData) => sum + day.p1Count, 0).toLocaleString()}
              </span>
              <span className="text-red-600">
                Other: {activityData.reduce((sum: number, day: ActivityData) => sum + day.otherCount, 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}