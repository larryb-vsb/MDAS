import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Area,
  AreaChart,
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

interface MerchantGrowthChartProps {
  isLoading: boolean;
  title?: string;
  description?: string;
  totalMerchants: number;
}

export default function MerchantGrowthChart({
  isLoading,
  title = "Merchant Growth",
  description = "Merchant acquisition over time",
  totalMerchants,
}: MerchantGrowthChartProps) {
  
  // Generate simulated growth data based on the current total
  // In a real implementation, we would fetch this data from the API
  const generateGrowthData = () => {
    // Generate simulated merchant growth data based on the current total
    const data = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    
    // We'll simulate 12 months of growth data ending at the current total
    let runningTotal = Math.max(totalMerchants - 70, 0); // Start from a reasonable number
    
    for (let i = 0; i < 12; i++) {
      let monthIndex = (currentMonth - 11 + i) % 12;
      if (monthIndex < 0) monthIndex += 12;
      
      // Simulate some growth pattern (faster in more recent months)
      const growthFactor = 1 + (i * 0.2);
      const newMerchants = Math.round(5 * growthFactor);
      runningTotal += newMerchants;
      
      // Cap at the current total for the most recent month
      const total = i === 11 ? totalMerchants : Math.min(runningTotal, totalMerchants);
      
      data.push({
        name: months[monthIndex],
        total,
        new: newMerchants
      });
    }
    
    return data;
  };
  
  const growthData = generateGrowthData();
  
  // Calculate growth percentage from first to last month
  const calculateGrowth = () => {
    if (growthData.length < 2) return 0;
    
    const firstValue = growthData[0].total;
    const lastValue = growthData[growthData.length - 1].total;
    
    if (firstValue === 0) return 0;
    return ((lastValue - firstValue) / firstValue) * 100;
  };
  
  const growthPercentage = calculateGrowth();
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded shadow-sm p-3">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-blue-500">
            {`Total: ${payload[0].value} merchants`}
          </p>
          {payload[1] && (
            <p className="text-sm text-green-500">
              {`New: ${payload[1].value} merchants`}
            </p>
          )}
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
                <p className="max-w-xs">Merchant growth rate over the past year</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 space-y-1">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-muted-foreground">Total Merchants</h3>
            <span className="text-sm font-medium text-green-500">
              +{growthPercentage.toFixed(1)}% growth
            </span>
          </div>
          <p className="text-2xl font-bold">{totalMerchants.toLocaleString()}</p>
        </div>
        
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={growthData}
              margin={{
                top: 10,
                right: 30,
                left: 0,
                bottom: 0,
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
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="total"
                name="Total Merchants"
                stroke="#3b82f6"
                fill="#93c5fd"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="new"
                name="New Merchants"
                stroke="#10b981"
                fill="#6ee7b7"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}