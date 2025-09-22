import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, BarChart3, Database, FileText, TrendingUp, DollarSign, Activity, RefreshCw, Upload, Loader2 } from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";
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
  
  // Format selected date for API calls
  const formattedDate = format(selectedDate, 'yyyy-MM-dd');
  
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
            
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) setSelectedDate(date);
                    setIsCalendarOpen(false);
                  }}
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
      
      {/* Import from TDDF API Files */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import from TDDF API Files
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select processed TDDF API files to import into the daily view system
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Upload className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="mb-2">Import functionality will be available here</p>
            <p className="text-xs">This will allow importing from the TDDF API files system into the daily view tables</p>
            <Button variant="outline" disabled className="mt-4">
              <Upload className="mr-2 h-4 w-4" />
              Import Selected Files
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Record Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Record Type Distribution</CardTitle>
          <p className="text-sm text-muted-foreground">
            Breakdown of TDDF record types across all imported data
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(dailyStats?.recordTypeBreakdown || {}).map(([type, count]) => {
              const total = dailyStats?.totalRecords || 1;
              const percentage = total > 0 ? ((count as number / total) * 100) : 0;
              return (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{type}</Badge>
                    <span className="text-sm text-muted-foreground">{(count as number).toLocaleString()} records</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 flex-1 ml-4">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[200px]">
                      <div 
                        className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium min-w-[3rem] text-right">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
            
            {(!dailyStats?.recordTypeBreakdown || Object.keys(dailyStats.recordTypeBreakdown).length === 0) && (
              <div className="text-center py-6 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No record type data available</p>
                <p className="text-xs">Import TDDF files to see record distribution</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}