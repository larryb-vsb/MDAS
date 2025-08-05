import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, FileText, BarChart3, Download, RefreshCw } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { isNonProcessingDay, isFederalHoliday } from "@/lib/federal-holidays";

interface DailyFileConsumption {
  date: string;
  dayOfWeek: string;
  filesProcessed: number;
  totalRecords: number;
  transactionValue: number;
  netDepositValue: number;
  processingTimeMs: number;
  averageFileSize: string;
  recordTypes: Record<string, number>;
  files: Array<{
    fileName: string;
    recordCount: number;
    transactionValue: number;
    netDepositValue: number;
    processingTime: number;
    fileSize: string;
  }>;
  isNonProcessingDay: boolean;
  holidayName?: string;
}

export default function FileConsumptionReport() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { toast } = useToast();

  // Fetch daily consumption data for the selected month
  const { data: consumptionData, isLoading, refetch } = useQuery({
    queryKey: ['/api/reports/file-consumption', format(selectedMonth, 'yyyy-MM')],
    queryFn: async () => {
      const response = await fetch(`/api/reports/file-consumption?month=${format(selectedMonth, 'yyyy-MM')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch consumption data');
      }
      return response.json();
    }
  });

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else {
      setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Generate all days for the month with consumption data
  const monthDays = eachDayOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth)
  });

  const consumptionByDay = consumptionData?.reduce((acc: Record<string, DailyFileConsumption>, item: any) => {
    acc[item.date] = item;
    return acc;
  }, {}) || {};

  // Calculate month totals
  const monthTotals = consumptionData?.reduce((totals: any, day: DailyFileConsumption) => ({
    filesProcessed: totals.filesProcessed + day.filesProcessed,
    totalRecords: totals.totalRecords + day.totalRecords,
    transactionValue: totals.transactionValue + day.transactionValue,
    netDepositValue: totals.netDepositValue + day.netDepositValue,
    processingTimeMs: totals.processingTimeMs + day.processingTimeMs,
    processingDays: totals.processingDays + (day.filesProcessed > 0 ? 1 : 0)
  }), {
    filesProcessed: 0,
    totalRecords: 0,
    transactionValue: 0,
    netDepositValue: 0,
    processingTimeMs: 0,
    processingDays: 0
  });

  const exportToCSV = () => {
    if (!consumptionData) return;

    const csvHeaders = [
      'Date', 'Day of Week', 'Files Processed', 'Total Records', 
      'Transaction Value', 'Net Deposit Value', 'Processing Time (ms)',
      'Average File Size', 'Non-Processing Day', 'Holiday'
    ];

    const csvRows = monthDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayData = consumptionByDay[dateStr];
      const nonProcessingInfo = isNonProcessingDay(day);
      const holiday = isFederalHoliday(day);

      return [
        dateStr,
        format(day, 'EEEE'),
        dayData?.filesProcessed || 0,
        dayData?.totalRecords || 0,
        dayData?.transactionValue || 0,
        dayData?.netDepositValue || 0,
        dayData?.processingTimeMs || 0,
        dayData?.averageFileSize || 'N/A',
        nonProcessingInfo.isNonProcessing ? 'Yes' : 'No',
        holiday?.name || ''
      ];
    });

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `file-consumption-report-${format(selectedMonth, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Report Exported",
      description: `File consumption report for ${format(selectedMonth, 'MMMM yyyy')} has been downloaded.`,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-8 w-8" />
            File Consumption Report
          </h1>
          <p className="text-gray-600">Daily file processing consumption analysis</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigateMonth('prev')}
            className="flex items-center gap-1"
          >
            ← Previous
          </Button>
          
          <div className="text-lg font-semibold text-gray-900 px-4">
            {format(selectedMonth, 'MMMM yyyy')}
          </div>
          
          <Button
            variant="outline"
            onClick={() => navigateMonth('next')}
            className="flex items-center gap-1"
          >
            Next →
          </Button>
          
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            onClick={exportToCSV}
            disabled={!consumptionData}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Month Summary Cards */}
      {monthTotals && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Total Files Processed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{formatNumber(monthTotals.filesProcessed)}</div>
              <p className="text-sm text-gray-500">{monthTotals.processingDays} processing days</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Total Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatNumber(monthTotals.totalRecords)}</div>
              <p className="text-sm text-gray-500">Avg: {formatNumber(Math.round(monthTotals.totalRecords / (monthTotals.processingDays || 1)))} per day</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Transaction Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{formatCurrency(monthTotals.transactionValue)}</div>
              <p className="text-sm text-gray-500">DT record totals</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Net Deposit Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">{formatCurrency(monthTotals.netDepositValue)}</div>
              <p className="text-sm text-gray-500">BH record totals</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily Consumption Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily File Consumption
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">Loading consumption data...</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Files</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead className="text-right">Transaction Value</TableHead>
                    <TableHead className="text-right">Net Deposits</TableHead>
                    <TableHead className="text-right">Processing Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayData = consumptionByDay[dateStr];
                    const nonProcessingInfo = isNonProcessingDay(day);
                    const holiday = isFederalHoliday(day);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                    return (
                      <TableRow 
                        key={dateStr}
                        className={`
                          ${dayData?.filesProcessed > 0 ? 'bg-green-50' : ''}
                          ${nonProcessingInfo.isNonProcessing ? 'bg-orange-50' : ''}
                          ${holiday ? 'bg-red-50' : ''}
                        `}
                      >
                        <TableCell className="font-medium">
                          {format(day, 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <span className={day.getDay() === 0 ? 'text-orange-500 font-bold' : ''}>
                            {format(day, 'EEEE')}
                          </span>
                          {isWeekend && (
                            <Badge variant="outline" className="ml-2 text-xs border-orange-300 bg-orange-50 text-orange-700">
                              Weekend
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {dayData?.filesProcessed || 0}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(dayData?.totalRecords || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(dayData?.transactionValue || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(dayData?.netDepositValue || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {dayData?.processingTimeMs ? `${(dayData.processingTimeMs / 1000).toFixed(1)}s` : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {holiday ? (
                            <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                              🏛️ {holiday.name}
                            </Badge>
                          ) : dayData?.filesProcessed > 0 ? (
                            <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">
                              ✅ Processed
                            </Badge>
                          ) : nonProcessingInfo.isNonProcessing ? (
                            <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700">
                              🚫 {nonProcessingInfo.reason}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-gray-300 bg-gray-50 text-gray-700">
                              ⭕ No Data
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}