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

// Transaction type colors
const TRANSACTION_COLORS = {
  Credit: "#10b981", // Green
  Debit: "#ef4444",  // Red
  Sale: "#10b981",   // Green (legacy label)
  Refund: "#ef4444"  // Red (legacy label)
};

interface TransactionData {
  name: string;
  transactions: number;
  revenue: number;
}

interface TransactionTypeChartProps {
  data: TransactionData[] | undefined;
  isLoading: boolean;
  title?: string;
  description?: string;
}

export default function TransactionTypeChart({
  data,
  isLoading,
  title = "ACH Transaction Types",
  description = "Distribution of credit vs. debit transactions",
}: TransactionTypeChartProps) {
  
  const prepareData = () => {
    if (!data || data.length === 0) return [];
    
    // For real implementation, we'd use actual transaction type data
    // For now, let's simulate a distribution from the existing data
    const totalTransactions = data.reduce((sum, item) => sum + item.transactions, 0);
    
    // Simulate a credit/debit split based on revenue
    // In a real implementation, we would fetch actual transaction type data from the API
    const creditRatio = 0.65; // Simulate 65% credit transactions
    
    return [
      { name: "Credit", value: Math.round(totalTransactions * creditRatio) },
      { name: "Debit", value: Math.round(totalTransactions * (1 - creditRatio)) }
    ];
  };
  
  const typeData = prepareData();
  const totalTransactions = typeData.reduce((sum, item) => sum + item.value, 0);
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const percentage = ((payload[0].value / totalTransactions) * 100).toFixed(1);
      return (
        <div className="bg-background border rounded shadow-sm p-3">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-sm">
            {`${payload[0].value.toLocaleString()} transactions (${percentage}%)`}
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
    
    return (
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
                <p className="max-w-xs">Distribution between credit (money in) and debit (money out) transactions</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">Total Transactions</h3>
          <p className="text-2xl font-bold">{totalTransactions.toLocaleString()}</p>
        </div>
        
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={90}
                fill="#8884d8"
                dataKey="value"
              >
                {typeData.map((entry) => (
                  <Cell 
                    key={`cell-${entry.name}`} 
                    fill={TRANSACTION_COLORS[entry.name as keyof typeof TRANSACTION_COLORS] || "#8884d8"} 
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => {
                  const item = typeData.find(item => item.name === value);
                  return (
                    <span className="text-sm">
                      {value}: {item ? item.value.toLocaleString() : 0} transactions
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