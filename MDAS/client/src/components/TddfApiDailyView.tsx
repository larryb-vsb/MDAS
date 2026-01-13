import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, BarChart3, Database, FileText, TrendingUp, DollarSign, Activity, RefreshCw, Loader2 } from "lucide-react";
import { format, addDays, subDays, isToday, setMonth, setYear } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Interface matching History page's DailyBreakdown - using /api/tddf1/day-breakdown endpoint
interface DailyBreakdown {
  date: string;
  totalRecords: number;
  recordTypeBreakdown: Record<string, number>;
  totalTransactionValue: number;
  netDeposits?: number;
  fileCount: number;
  filesProcessed: Array<{
    fileName: string;
    tableName: string;
    recordCount: number;
  }>;
  batchCount?: number;
  authorizationCount?: number;
}

// Record type configuration for visualization (same as History page)
const recordTypeConfig: Record<string, { label: string; color: string; bgColor: string; textColor: string; description: string }> = {
  BH: { label: 'BH', color: 'bg-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20', textColor: 'text-blue-700 dark:text-blue-300', description: 'Batch Headers' },
  DT: { label: 'DT', color: 'bg-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20', textColor: 'text-green-700 dark:text-green-300', description: 'Detail Transactions' },
  G2: { label: 'G2', color: 'bg-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/20', textColor: 'text-purple-700 dark:text-purple-300', description: 'Gateway Records' },
  E1: { label: 'E1', color: 'bg-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20', textColor: 'text-yellow-700 dark:text-yellow-300', description: 'Extension Records' },
  P1: { label: 'P1', color: 'bg-pink-500', bgColor: 'bg-pink-50 dark:bg-pink-900/20', textColor: 'text-pink-700 dark:text-pink-300', description: 'Purchasing 1' },
  P2: { label: 'P2', color: 'bg-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-900/20', textColor: 'text-orange-700 dark:text-orange-300', description: 'Purchasing 2' },
  DR: { label: 'DR', color: 'bg-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20', textColor: 'text-red-700 dark:text-red-300', description: 'Disputes/Rejects' },
  AD: { label: 'AD', color: 'bg-gray-500', bgColor: 'bg-gray-50 dark:bg-gray-900/20', textColor: 'text-gray-700 dark:text-gray-300', description: 'Additional Data' }
};

// Currency formatter
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
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
  
  // Query day breakdown using same endpoint as History page
  const { data: dailyData, isLoading: dailyLoading } = useQuery<DailyBreakdown>({
    queryKey: ["/api/tddf1/day-breakdown", formattedDate],
    queryFn: async () => {
      const response = await fetch(`/api/tddf1/day-breakdown?date=${formattedDate}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch daily data');
      return response.json();
    }
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
  
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tddf1/day-breakdown", formattedDate] });
    toast({ title: "Daily data refreshed" });
  };
  
  return (
    <div className="space-y-4">
      {/* Date Selector Header - Matching History page */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {format(selectedDate, 'EEEE, MMMM dd, yyyy')}
                </CardTitle>
                <p className="text-sm mt-1 text-muted-foreground">
                  {dailyData ? `${dailyData.totalRecords.toLocaleString()} records • ${dailyData.fileCount} files` : 'Loading...'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousDay}
                  data-testid="button-prev-day"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <Popover 
                  open={isCalendarOpen} 
                  onOpenChange={(open) => {
                    setIsCalendarOpen(open);
                    if (open) {
                      setCalendarMonth(selectedDate);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                      data-testid="button-calendar-trigger"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex items-center gap-2 p-3 border-b">
                      <Select
                        value={String(calendarMonth.getMonth())}
                        onValueChange={(value) => {
                          setCalendarMonth(setMonth(calendarMonth, parseInt(value)));
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {monthNames.map((name, idx) => (
                            <SelectItem key={idx} value={String(idx)}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Select
                        value={String(calendarMonth.getFullYear())}
                        onValueChange={(value) => {
                          setCalendarMonth(setYear(calendarMonth, parseInt(value)));
                        }}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {yearOptions.map((year) => (
                            <SelectItem key={year} value={String(year)}>{year}</SelectItem>
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
                  data-testid="button-next-day"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs - Matching History page layout */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview" data-testid="tab-daily-overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Daily Overview
          </TabsTrigger>
          <TabsTrigger value="table" data-testid="tab-table-view">
            <FileText className="h-4 w-4 mr-2" />
            Table View
          </TabsTrigger>
        </TabsList>

        {/* Daily Overview Tab - Matching History page */}
        <TabsContent value="overview" className="space-y-4">
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Files
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dailyLoading ? '...' : dailyData?.fileCount.toLocaleString() || '0'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Records
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dailyLoading ? '...' : dailyData?.totalRecords.toLocaleString() || '0'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Authorizations
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dailyLoading ? '...' : formatCurrency(dailyData?.totalTransactionValue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">DT Transaction Amounts</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net Deposits
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dailyLoading ? '...' : formatCurrency(dailyData?.netDeposits || 0)}
                </div>
                <p className="text-xs text-muted-foreground">BH Net Deposits</p>
              </CardContent>
            </Card>
          </div>

          {/* Record Type Breakdown - Matching History page */}
          <Card>
            <CardHeader>
              <CardTitle>Record Type Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : dailyData?.recordTypeBreakdown && Object.keys(dailyData.recordTypeBreakdown).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(dailyData.recordTypeBreakdown)
                    .filter(([_, count]) => count > 0)
                    .map(([type, count]) => {
                      const config = recordTypeConfig[type] || {
                        label: type,
                        bgColor: 'bg-gray-50 dark:bg-gray-900/20',
                        textColor: 'text-gray-700 dark:text-gray-300',
                        description: type
                      };

                      return (
                        <div
                          key={type}
                          className={`text-center rounded-lg p-4 border ${config.bgColor}`}
                        >
                          <div className={`text-2xl font-bold ${config.textColor}`}>
                            {count.toLocaleString()}
                          </div>
                          <div className="text-sm font-bold">
                            {config.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {config.description}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {((count / (dailyData.totalRecords || 1)) * 100).toFixed(1)}%
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No record type data available for this date
                </div>
              )}
            </CardContent>
          </Card>

          {/* Toolbox */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Toolbox</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Table View Tab */}
        <TabsContent value="table" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Files Processed - {format(selectedDate, 'MMM d, yyyy')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dailyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : dailyData?.filesProcessed && dailyData.filesProcessed.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead className="text-right">Record Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyData.filesProcessed.map((file, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{file.fileName}</TableCell>
                          <TableCell className="text-right">
                            {file.recordCount.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No files processed on {format(selectedDate, 'MMMM d, yyyy')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
