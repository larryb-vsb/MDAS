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
    
    return data.map(item => ({
      name: item.name,
      avgValue: item.transactions > 0 
        ? Math.round((item.revenue / item.transactions) * 100) / 100
        : 0
    }));
  };
  
  const avgValueData = calculateAverageValues();
  
  // Calculate overall average
  const overallAverage = avgValueData.length > 0
    ? avgValueData.reduce((sum, item) => sum + item.avgValue, 0) / avgValueData.length
    : 0;
  
  // Check if there's a trend (increasing or decreasing)
  const getTrend = () => {
    if (avgValueData.length < 2) return { direction: 'neutral', percentage: 0 };
    
    const first = avgValueData[0].avgValue;
    const last = avgValueData[avgValueData.length - 1].avgValue;
    
    if (first === 0) return { direction: 'neutral', percentage: 0 };
    
    const percentage = ((last - first) / first) * 100;
    const direction = percentage > 0 ? 'up' : percentage < 0 ? 'down' : 'neutral';
    
    return { direction, percentage: Math.abs(percentage) };
  };
  
  const trend = getTrend();
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
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
              <Bar
                dataKey="avgValue"
                name="Average Value"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}