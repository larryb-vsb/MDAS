import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, BarChart3, DollarSign, LineChart as LineChartIcon, PieChart as PieChartIcon, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// Mock data for charts (would be fetched from API in a real implementation)
const transactionData = [
  { name: "Jan", transactions: 400, revenue: 2400 },
  { name: "Feb", transactions: 300, revenue: 1398 },
  { name: "Mar", transactions: 520, revenue: 3908 },
  { name: "Apr", transactions: 278, revenue: 2780 },
  { name: "May", transactions: 189, revenue: 1890 },
  { name: "Jun", transactions: 239, revenue: 2390 },
  { name: "Jul", transactions: 349, revenue: 3490 },
  { name: "Aug", transactions: 428, revenue: 4280 },
  { name: "Sep", transactions: 389, revenue: 3890 },
  { name: "Oct", transactions: 499, revenue: 4990 },
  { name: "Nov", transactions: 601, revenue: 6010 },
  { name: "Dec", transactions: 730, revenue: 7300 }
];

const merchantCategoryData = [
  { name: "Restaurant", value: 35 },
  { name: "Retail", value: 25 },
  { name: "Services", value: 20 },
  { name: "Entertainment", value: 10 },
  { name: "Other", value: 10 }
];

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#A569BD"];

export default function Analytics() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [timeframe, setTimeframe] = useState("year");
  const [chartType, setChartType] = useState("transactions");
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };
  
  const toggleUploadModal = () => {
    setIsUploadModalOpen(prev => !prev);
  };
  
  // Simulating data fetching
  const {
    data: analyticsData,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["/api/analytics", timeframe],
    queryFn: () => {
      // In a real app, this would be an API call
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            transactionData,
            merchantCategoryData,
            summary: {
              totalTransactions: 4728,
              totalRevenue: 42536,
              avgTransactionValue: 89.96,
              growthRate: 12.7
            }
          });
        }, 500);
      });
    },
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar isVisible={!isMobileMenuOpen} />
      
      <div className="flex-1 flex flex-col h-full overflow-auto">
        <Header toggleMobileMenu={toggleMobileMenu} toggleUploadModal={toggleUploadModal} />
        
        <div className="flex-1 p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
              <p className="text-muted-foreground">
                View performance metrics and transaction trends
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select Timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
          
          <Separator />
          
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading analytics data...</span>
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to load analytics data. Please try again later.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      Total Transactions
                    </CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {analyticsData?.summary.totalTransactions.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +{analyticsData?.summary.growthRate}% from previous period
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      Total Revenue
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${analyticsData?.summary.totalRevenue.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +{analyticsData?.summary.growthRate}% from previous period
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      Average Transaction
                    </CardTitle>
                    <LineChartIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${analyticsData?.summary.avgTransactionValue.toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +{(analyticsData?.summary.growthRate * 0.8).toFixed(1)}% from previous period
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      Merchant Categories
                    </CardTitle>
                    <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {analyticsData?.merchantCategoryData.length}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Active merchant categories
                    </p>
                  </CardContent>
                </Card>
              </div>
              
              <Tabs value={chartType} onValueChange={setChartType}>
                <div className="flex justify-between items-center mb-4">
                  <TabsList>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="categories">Categories</TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="transactions" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Transaction Volume</CardTitle>
                      <CardDescription>
                        Number of transactions processed over time
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={analyticsData?.transactionData}
                            margin={{
                              top: 5,
                              right: 30,
                              left: 20,
                              bottom: 5,
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line 
                              type="monotone" 
                              dataKey="transactions" 
                              stroke="#8884d8" 
                              strokeWidth={2}
                              activeDot={{ r: 8 }} 
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="revenue" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue Analysis</CardTitle>
                      <CardDescription>
                        Monthly revenue trends
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={analyticsData?.transactionData}
                            margin={{
                              top: 5,
                              right: 30,
                              left: 20,
                              bottom: 5,
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="revenue" fill="#82ca9d" name="Revenue ($)" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="categories" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Merchant Categories</CardTitle>
                      <CardDescription>
                        Distribution of merchants by category
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                      <div className="h-[400px] w-full max-w-[500px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analyticsData?.merchantCategoryData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              outerRadius={150}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {analyticsData?.merchantCategoryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}