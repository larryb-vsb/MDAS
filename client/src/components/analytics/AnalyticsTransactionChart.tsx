import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
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
  revenue?: number;
  year?: number;
}

interface AnalyticsTransactionChartProps {
  data: TransactionData[] | undefined;
  isLoading: boolean;
  title: string;
  description: string;
  dataKey: keyof TransactionData;
  color: string;
  tooltipLabel?: string;
  previousPeriodData?: TransactionData[] | undefined;
}

export default function AnalyticsTransactionChart({
  data,
  isLoading,
  title,
  description,
  dataKey,
  color,
  tooltipLabel,
  previousPeriodData,
}: AnalyticsTransactionChartProps) {
  // Process the data to separate current year (2025) and previous year (2024) data
  const currentYearData = data?.filter(item => item.year === 2025) || [];
  const previousYearData = data?.filter(item => item.year === 2024) || [];

  const formatValue = (value: number) => {
    if (dataKey === 'revenue') {
      return `$${value.toLocaleString('en-US')}`;
    }
    return value.toLocaleString('en-US');
  };

  // Calculate the percentage change year-over-year
  const calculateYearOverYearChange = () => {
    if (!currentYearData.length || !previousYearData.length) return null;
    
    // Sum all values for both years
    const currentYearTotal = currentYearData.reduce((sum, item) => sum + (item[dataKey] as number || 0), 0);
    const previousYearTotal = previousYearData.reduce((sum, item) => sum + (item[dataKey] as number || 0), 0);
    
    if (previousYearTotal === 0) return null;
    return ((currentYearTotal - previousYearTotal) / previousYearTotal) * 100;
  };

  const percentChange = calculateYearOverYearChange();
  const label = tooltipLabel || (dataKey === 'revenue' ? 'Revenue' : 'Transactions');

  // Calculate total value (current year only for display)
  const totalValue = currentYearData.reduce((sum, item) => sum + (item[dataKey] as number || 0), 0) || 0;

  const CustomTooltip = ({ active, payload, label: tooltipLabel }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded shadow-sm p-3">
          <p className="font-medium">{tooltipLabel}</p>
          <p className="text-sm" style={{ color }}>
            {`${payload[0].name}: ${formatValue(payload[0].value)}`}
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
        <CardContent className="h-[400px] flex items-center justify-center">
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
                <p className="max-w-xs">View {dataKey === 'revenue' ? 'revenue' : 'transaction'} trends over time</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 space-y-1">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-muted-foreground">Total {label}</h3>
            <div className="flex items-center space-x-2">
              {percentChange !== null && (
                <span className={`text-sm font-medium ${percentChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold">{formatValue(totalValue)}</p>
        </div>
        
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              margin={{
                top: 20,
                right: 30,
                left: dataKey === 'revenue' ? 60 : 30,
                bottom: 20,
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
                tickFormatter={(value) => {
                  if (dataKey === 'revenue') {
                    return value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`;
                  }
                  return value;
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              <Line 
                type="monotone" 
                data={previousYearData}
                dataKey={dataKey} 
                name={`2024 ${label}`}
                stroke="#CBD5E1" 
                strokeWidth={1.5}
                dot={{ r: 3, strokeWidth: 1, fill: "white" }}
                strokeDasharray="5 5"
              />
              
              <Line 
                type="monotone" 
                data={currentYearData}
                dataKey={dataKey} 
                name={`2025 ${label}`}
                stroke={color} 
                strokeWidth={2.5}
                dot={{ r: 4, strokeWidth: 2, fill: "white" }}
                activeDot={{ r: 6, stroke: color, strokeWidth: 2, fill: "white" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}