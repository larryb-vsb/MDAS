import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, HelpCircle } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TransactionData {
  name: string;
  transactions: number;
  revenue: number;
  year?: number;
}

interface TransactionValueChartProps {
  data: TransactionData[] | undefined;
  isLoading: boolean;
  title?: string;
  description?: string;
}

export default function TransactionValueChart({
  data,
  isLoading,
  title = "Average Transaction Value",
  description = "Average value per transaction over time",
}: TransactionValueChartProps) {
  
  const calculateAverageValues = () => {
    if (!data || data.length === 0) return [];
    
    // Check if we have year data for year-over-year comparison
    const hasYearData = data.some(item => item.year !== undefined);
    
    if (hasYearData) {
      // Group by month and year for year-over-year comparison
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const results: { name: string; avgValue2024?: number; avgValue2025?: number }[] = [];
      
      // Process data by month for each year
      monthNames.forEach(month => {
        const dataFor2024 = data.find(d => d.name === month && d.year === 2024);
        const dataFor2025 = data.find(d => d.name === month && d.year === 2025);
        
        const avg2024 = dataFor2024 && dataFor2024.transactions > 0
          ? Math.round((dataFor2024.revenue / dataFor2024.transactions) * 100) / 100
          : 0;
          
        const avg2025 = dataFor2025 && dataFor2025.transactions > 0
          ? Math.round((dataFor2025.revenue / dataFor2025.transactions) * 100) / 100
          : 0;
        
        // May is the current month (index 4)
        // For months after May, set 2025 value to 0 (future months)
        const monthIndex = monthNames.indexOf(month);
        const isFutureMonth = monthIndex > 4; // May is index 4
        
        results.push({
          name: month,
          avgValue2024: avg2024,
          avgValue2025: isFutureMonth ? 0 : avg2025
        });
      });
      
      return results;
    }
    
    // Default behavior for non-year data
    return data.map(item => ({
      name: item.name,
      avgValue: item.transactions > 0 
        ? Math.round((item.revenue / item.transactions) * 100) / 100
        : 0
    }));
  };
  
  const avgValueData = calculateAverageValues();
  
  // Check if we have the year-over-year format data
  const hasYearComparison = avgValueData.length > 0 && 'avgValue2024' in avgValueData[0];
  
  // Calculate overall average for the current year (2025)
  const overallAverage = hasYearComparison
    ? avgValueData.reduce((sum, item: any) => sum + (item.avgValue2025 || 0), 0) / avgValueData.length
    : (avgValueData.length > 0
        ? avgValueData.reduce((sum, item: any) => sum + (item.avgValue || 0), 0) / avgValueData.length
        : 0);
  
  // Check if there's a trend (increasing or decreasing)
  const getTrend = () => {
    if (hasYearComparison) {
      // For year comparison, calculate the average difference between 2024 and 2025 values
      const validMonths = avgValueData.filter((item: any) => item.avgValue2024 > 0 && item.avgValue2025 > 0);
      if (validMonths.length === 0) return { direction: 'neutral', percentage: 0 };
      
      const totalPercentageChange = validMonths.reduce((sum, item: any) => {
        const change = item.avgValue2025 > 0 && item.avgValue2024 > 0
          ? ((item.avgValue2025 - item.avgValue2024) / item.avgValue2024) * 100
          : 0;
        return sum + change;
      }, 0);
      
      const avgPercentageChange = totalPercentageChange / validMonths.length;
      const direction = avgPercentageChange > 0 ? 'up' : avgPercentageChange < 0 ? 'down' : 'neutral';
      
      return { direction, percentage: Math.abs(avgPercentageChange) };
    } else {
      // Standard trend calculation
      if (avgValueData.length < 2) return { direction: 'neutral', percentage: 0 };
      
      const first = (avgValueData[0] as any).avgValue;
      const last = (avgValueData[avgValueData.length - 1] as any).avgValue;
      
      if (first === 0) return { direction: 'neutral', percentage: 0 };
      
      const percentage = ((last - first) / first) * 100;
      const direction = percentage > 0 ? 'up' : percentage < 0 ? 'down' : 'neutral';
      
      return { direction, percentage: Math.abs(percentage) };
    }
  };
  
  const trend = getTrend();
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      if (hasYearComparison) {
        // For year comparison, show both years
        return (
          <div className="bg-background border rounded shadow-sm p-3">
            <p className="font-medium">{label}</p>
            {payload.map((entry: any) => {
              const isFor2024 = entry.dataKey === 'avgValue2024';
              const year = isFor2024 ? '2024' : '2025';
              return (
                <p key={entry.dataKey} className={`text-sm ${isFor2024 ? 'text-blue-500' : 'text-green-500'}`}>
                  {`${year}: $${entry.value.toFixed(2)}`}
                </p>
              );
            })}
          </div>
        );
      }
      
      // Standard tooltip
      return (
        <div className="bg-background border rounded shadow-sm p-3">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-green-500">
            {`Average: $${payload[0].value.toFixed(2)}`}
          </p>
        </div>
      );
    }
    return null;
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Average transaction value calculated by dividing total revenue by number of transactions</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 space-y-1">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-muted-foreground">Average Value</h3>
            {trend.direction !== 'neutral' && (
              <span className={`text-sm font-medium ${trend.direction === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                {trend.direction === 'up' ? '↑' : '↓'} {trend.percentage.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-2xl font-bold">${overallAverage.toFixed(2)}</p>
        </div>
        
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={avgValueData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
              barGap={4}
              barCategoryGap={16}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#E0E0E0' }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#E0E0E0' }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              {hasYearComparison ? (
                <>
                  <Bar
                    dataKey="avgValue2024"
                    name="2024 Average"
                    fill="#93c5fd"
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                  <Bar
                    dataKey="avgValue2025"
                    name="2025 Average"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                </>
              ) : (
                <Bar
                  dataKey="avgValue"
                  name="Average Value"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}