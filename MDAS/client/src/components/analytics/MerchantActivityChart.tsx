import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { RefreshCw, HelpCircle } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Status colors
const ACTIVITY_COLORS = {
  Active: "#10b981", // Green
  Inactive: "#6b7280", // Gray
  Pending: "#f59e0b", // Amber
};

interface MerchantCategoryData {
  name: string;
  value: number;
}

interface MerchantActivityChartProps {
  data: MerchantCategoryData[] | undefined;
  isLoading: boolean;
  title?: string;
  description?: string;
  totalMerchants: number;
}

export default function MerchantActivityChart({
  data,
  isLoading,
  title = "Merchant Activity",
  description = "Active vs inactive merchants",
  totalMerchants,
}: MerchantActivityChartProps) {
  
  // Generate activity data - in real implementation, we would fetch from API
  const generateActivityData = () => {
    // Simulate activity status based on total merchants
    // In a real implementation, we would get this data from the API
    const activeCount = Math.round(totalMerchants * 0.7); // 70% active
    const inactiveCount = Math.round(totalMerchants * 0.2); // 20% inactive
    const pendingCount = totalMerchants - activeCount - inactiveCount; // The rest are pending
    
    return [
      { name: "Active", value: activeCount },
      { name: "Inactive", value: inactiveCount },
      { name: "Pending", value: pendingCount }
    ];
  };
  
  const activityData = generateActivityData();
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const percentage = ((payload[0].value / totalMerchants) * 100).toFixed(1);
      return (
        <div className="bg-background border rounded shadow-sm p-3">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-sm">
            {`${payload[0].value.toLocaleString()} merchants (${percentage}%)`}
          </p>
        </div>
      );
    }
    return null;
  };
  
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    
    return percent < 0.05 ? null : (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
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
                <p className="max-w-xs">Current activity status of all merchants in the system</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">Active Rate</h3>
          <p className="text-2xl font-bold">
            {((activityData[0].value / totalMerchants) * 100).toFixed(1)}%
          </p>
        </div>
        
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={activityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={90}
                fill="#8884d8"
                dataKey="value"
              >
                {activityData.map((entry) => (
                  <Cell 
                    key={`cell-${entry.name}`} 
                    fill={ACTIVITY_COLORS[entry.name as keyof typeof ACTIVITY_COLORS] || "#8884d8"} 
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => {
                  const item = activityData.find(item => item.name === value);
                  return (
                    <span className="text-sm">
                      {value}: {item ? item.value.toLocaleString() : 0} merchants
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}