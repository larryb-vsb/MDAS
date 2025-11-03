import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, BarChart3, Database, FileText, TrendingUp, DollarSign, Activity, RefreshCw, Upload, Loader2 } from "lucide-react";
import { format, addDays, subDays, isToday, setMonth, setYear, startOfMonth } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Interfaces for TDDF API Daily View
interface TddfApiDailyStats {
  totalFiles: number;
  totalRecords: number;
  totalTransactionValue: number;
  totalNetDeposits: number;
  recordTypeBreakdown: Record<string, number>;
  lastProcessedDate: string | null;
}

interface TddfApiDayBreakdown {
  date: string;
  totalRecords: number;
  recordTypes: Record<string, number>;
  transactionValue: number;
  fileCount: number;
}

interface TddfApiRecentActivity {
  id: string;
  fileName: string;
  recordCount: number;
  processedAt: string;
  status: string;
}

export function TddfApiDailyView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  
  // Format selected date for API calls
  const formattedDate = format(selectedDate, 'yyyy-MM-dd');
  
  // Generate year options (10 years back, current year, 5 years forward)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 16 }, (_, i) => currentYear - 10 + i);
  
  // Month names for dropdown
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  // Query daily stats
  const { data: dailyStats, isLoading: statsLoading } = useQuery<TddfApiDailyStats>({
    queryKey: ["/api/tddf-api/daily/stats"]
  });
  
  // Query day breakdown for selected date
  const { data: dayBreakdown, isLoading: breakdownLoading } = useQuery<TddfApiDayBreakdown>({
    queryKey: ["/api/tddf-api/daily/day-breakdown", formattedDate]
  });
  
  // Query recent activity
  const { data: recentActivity, isLoading: activityLoading } = useQuery<TddfApiRecentActivity[]>({
    queryKey: ["/api/tddf-api/daily/recent-activity"]
  });
  
  // Date navigation handlers
  const handlePreviousDay = () => {
    setSelectedDate(prev => subDays(prev, 1));
  };
  
  const handleNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1));
  };
  
  const handleToday = () => {
    setSelectedDate(new Date());
  };
  
  return (
    <div className="space-y-6">
      {/* Header with Date Navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">TDDF Daily View</h2>
          <p className="text-muted-foreground">Day-by-day analysis of TDDF transaction data from the datamaster system</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousDay}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Popover 
              open={isCalendarOpen} 
              onOpenChange={(open) => {
                setIsCalendarOpen(open);
                // When opening, set calendar to show the selected date's month/year
                if (open) {
                  setCalendarMonth(selectedDate);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                  data-testid="button-calendar-trigger"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                {/* Month and Year Selectors */}
                <div className="flex items-center gap-2 p-3 border-b">
                  <Select
                    value={calendarMonth.getMonth().toString()}
                    onValueChange={(value) => {
                      // Normalize to 1st of month to prevent rollover (e.g., Jan 31 → Feb would become Mar 3)
                      const normalized = startOfMonth(calendarMonth);
                      const newMonth = setMonth(normalized, parseInt(value));
                      setCalendarMonth(newMonth);
                    }}
                  >
                    <SelectTrigger className="w-[140px]" data-testid="select-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthNames.map((month, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select
                    value={calendarMonth.getFullYear().toString()}
                    onValueChange={(value) => {
                      // Normalize to 1st of month to prevent rollover (e.g., Feb 29 2024 → 2023 would become Mar 1)
                      const normalized = startOfMonth(calendarMonth);
                      const newYear = setYear(normalized, parseInt(value));
                      setCalendarMonth(newYear);
                    }}
                  >
                    <SelectTrigger className="w-[100px]" data-testid="select-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setCalendarMonth(date);
                    }
                    setIsCalendarOpen(false);
                  }}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextDay}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            {!isToday(selectedDate) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToday}
              >
                Today
              </Button>
            )}
          </div>
          
          <Button 
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/daily"], exact: false });
              toast({ title: "Daily data refreshed" });
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
      
      {/* Daily Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dailyStats?.totalRecords?.toLocaleString() || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              {Object.keys(dailyStats?.recordTypeBreakdown || {}).length || 0} record types
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaction Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(dailyStats?.totalTransactionValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              Transaction amount total
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Deposits</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(dailyStats?.totalNetDeposits || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              Batch net deposits
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Files Processed</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dailyStats?.totalFiles || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              TDDF files imported
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Daily Breakdown and Activity Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Day Breakdown Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Daily Breakdown - {format(selectedDate, "MMMM d, yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {breakdownLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : dayBreakdown ? (
              <div className="space-y-4">
                {/* Record Types Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Record Types</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(dayBreakdown.recordTypes || {}).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between p-2 bg-muted rounded">
                        <Badge variant="outline">{type}</Badge>
                        <span className="text-sm font-medium">{count?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      ${(dayBreakdown.transactionValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">Transaction Value</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {dayBreakdown.totalRecords?.toLocaleString() || '0'}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Records</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No data available for {format(selectedDate, "MMMM d, yyyy")}</p>
                <p className="text-xs">Try selecting a different date or import TDDF files first</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Recent Activity Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-auto">
                {recentActivity.map((activity: any) => (
                  <div key={activity.id} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.recordCount.toLocaleString()} records • {format(new Date(activity.processedAt), "MMM d, HH:mm")}
                      </p>
                    </div>
                    <Badge variant="outline">{activity.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
                <p className="text-xs">Import activity will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Record Type Distribution */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* BH Records */}
        <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">BH Records</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {(dailyStats?.recordTypeBreakdown?.BH || 0).toLocaleString()}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400">
              Batch Headers
            </p>
          </CardContent>
        </Card>

        {/* DT Records */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">DT Records</CardTitle>
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {(dailyStats?.recordTypeBreakdown?.DT || 0).toLocaleString()}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Detail Transactions
            </p>
          </CardContent>
        </Card>

        {/* Total Records */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(dailyStats?.totalRecords || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              All Types
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}