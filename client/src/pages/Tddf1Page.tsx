import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight, BarChart3, Database, FileText, TrendingUp, DollarSign, Activity } from "lucide-react";
import { format, addDays, subDays, startOfMonth, endOfMonth, isToday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface Tddf1Stats {
  totalFiles: number;
  totalRecords: number;
  totalTransactionValue: number;
  recordTypeBreakdown: Record<string, number>;
  activeTables: string[];
  lastProcessedDate: string | null;
}

interface Tddf1DayBreakdown {
  date: string;
  totalRecords: number;
  recordTypes: Record<string, number>;
  transactionValue: number;
  fileCount: number;
  tables: string[];
}

interface Tddf1RecentActivity {
  id: string;
  fileName: string;
  recordCount: number;
  processedAt: string;
  status: string;
  tableName: string;
}

function Tddf1Page() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Format dates for API calls
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const currentMonthStr = format(currentMonth, 'yyyy-MM');

  // API Queries
  const { data: stats, isLoading: statsLoading } = useQuery<Tddf1Stats>({
    queryKey: ['/api/tddf1/stats'],
  });

  const { data: dayBreakdown, isLoading: dayLoading } = useQuery<Tddf1DayBreakdown>({
    queryKey: ['/api/tddf1/day-breakdown', selectedDateStr],
    enabled: !!selectedDateStr,
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<Tddf1RecentActivity[]>({
    queryKey: ['/api/tddf1/recent-activity'],
  });

  // Navigation functions
  const navigateToToday = () => setSelectedDate(new Date());
  const navigateToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1));
  const navigateToNextDay = () => setSelectedDate(prev => addDays(prev, 1));
  const navigateToPreviousMonth = () => setCurrentMonth(prev => subDays(startOfMonth(prev), 1));
  const navigateToNextMonth = () => setCurrentMonth(prev => addDays(endOfMonth(prev), 1));

  // Get days in current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = [];
  for (let date = monthStart; date <= monthEnd; date = addDays(date, 1)) {
    daysInMonth.push(new Date(date));
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">TDDF1 Dashboard</h1>
            <p className="text-gray-600 mt-1">File-based TDDF processing with day-level analytics</p>
          </div>
          <Button onClick={navigateToToday} variant="outline">
            <Calendar className="h-4 w-4 mr-2" />
            Today
          </Button>
        </div>

        {/* Totals Band */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Files</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (stats?.totalFiles ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (stats?.totalRecords ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transaction Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : `$${(stats?.totalTransactionValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tables</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (stats?.activeTables?.length ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Day Navigation */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Day Navigation
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToPreviousDay}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToNextDay}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={isToday(selectedDate) ? "default" : "secondary"}>
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </Badge>
              {dayBreakdown && (
                <span className="text-sm text-gray-600">
                  {dayBreakdown.totalRecords} records • {dayBreakdown.fileCount} files
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Month Calendar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={navigateToPreviousMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={navigateToNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 p-2">
                    {day}
                  </div>
                ))}
                {daysInMonth.map(date => (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={cn(
                      "text-center p-2 text-sm rounded hover:bg-gray-100 transition-colors",
                      isSameDay(date, selectedDate) && "bg-blue-100 text-blue-700 font-semibold",
                      isToday(date) && "ring-2 ring-blue-500"
                    )}
                  >
                    {format(date, 'd')}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Day Breakdown Widget */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Daily Breakdown - {format(selectedDate, 'MMM d, yyyy')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dayLoading ? (
                <div className="text-center py-8 text-gray-500">Loading day data...</div>
              ) : dayBreakdown ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{dayBreakdown.totalRecords}</div>
                      <div className="text-sm text-gray-600">Total Records</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{dayBreakdown.fileCount}</div>
                      <div className="text-sm text-gray-600">Files</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        ${dayBreakdown.transactionValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-sm text-gray-600">Value</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{dayBreakdown.tables.length}</div>
                      <div className="text-sm text-gray-600">Tables</div>
                    </div>
                  </div>

                  {/* Record Type Breakdown */}
                  <div>
                    <h4 className="font-semibold mb-3">Record Types</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(dayBreakdown.recordTypes).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between bg-gray-50 rounded p-2">
                          <span className="text-sm font-medium">{type}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Tables */}
                  <div>
                    <h4 className="font-semibold mb-3">Active Tables</h4>
                    <div className="flex flex-wrap gap-2">
                      {dayBreakdown.tables.map(table => (
                        <Badge key={table} variant="outline">{table}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No data available for {format(selectedDate, 'MMM d, yyyy')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity Widget */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="text-center py-4 text-gray-500">Loading...</div>
              ) : recentActivity && recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.slice(0, 10).map(activity => (
                    <div key={activity.id} className="border-l-2 border-blue-200 pl-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{activity.fileName}</span>
                        <Badge variant={activity.status === 'completed' ? 'default' : 'secondary'}>
                          {activity.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {activity.recordCount} records • {activity.tableName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(activity.processedAt), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">No recent activity</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Record Type Breakdown Widget */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Overall Record Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-center py-4 text-gray-500">Loading...</div>
            ) : stats?.recordTypeBreakdown ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Object.entries(stats.recordTypeBreakdown).map(([type, count]) => (
                  <div key={type} className="text-center bg-gray-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">{count.toLocaleString()}</div>
                    <div className="text-sm font-medium text-gray-700">{type}</div>
                    <div className="text-xs text-gray-500">
                      {((count / (stats.totalRecords || 1)) * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">No record type data available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Tddf1Page;