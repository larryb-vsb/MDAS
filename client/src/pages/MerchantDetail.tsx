import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Define the merchant form schema
const merchantSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  clientMID: z.string().optional(),
  status: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  category: z.string().optional()
});

type MerchantFormValues = z.infer<typeof merchantSchema>;

// Define the types for merchant details API response
interface MerchantDetailsResponse {
  merchant: {
    id: string;
    name: string;
    clientMID: string | null;
    status: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    category: string;
  };
  transactions: {
    transactionId: string;
    merchantId: string;
    amount: number;
    date: string;
    type: string;
  }[];
  analytics: {
    dailyStats: {
      transactions: number;
      revenue: number;
    };
    monthlyStats: {
      transactions: number;
      revenue: number;
    };
    transactionHistory: {
      name: string;
      transactions: number;
      revenue: number;
    }[];
  };
}

export default function MerchantDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('details');

  // Fetch merchant details
  const { data, isLoading, error } = useQuery<MerchantDetailsResponse>({
    queryKey: ['/api/merchants', id],
    queryFn: () => fetch(`/api/merchants/${id}`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch merchant');
      return res.json();
    })
  });

  // Create form with validation
  const form = useForm<MerchantFormValues>({
    resolver: zodResolver(merchantSchema),
    defaultValues: {
      name: data?.merchant.name || '',
      clientMID: data?.merchant.clientMID || '',
      status: data?.merchant.status || '',
      address: data?.merchant.address || '',
      city: data?.merchant.city || '',
      state: data?.merchant.state || '',
      zipCode: data?.merchant.zipCode || '',
      category: data?.merchant.category || ''
    },
    values: {
      name: data?.merchant.name || '',
      clientMID: data?.merchant.clientMID || '',
      status: data?.merchant.status || '',
      address: data?.merchant.address || '',
      city: data?.merchant.city || '',
      state: data?.merchant.state || '',
      zipCode: data?.merchant.zipCode || '',
      category: data?.merchant.category || ''
    },
  });

  // Update merchant mutation
  const updateMerchant = useMutation({
    mutationFn: (values: MerchantFormValues) => {
      return apiRequest(`/api/merchants/${id}`, {
        method: 'PUT',
        body: values
      });
    },
    onSuccess: () => {
      toast({
        title: 'Merchant updated',
        description: 'Merchant details have been successfully updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/merchants'] });
    },
    onError: () => {
      toast({
        title: 'Update failed',
        description: 'Failed to update merchant details. Please try again.',
        variant: 'destructive',
      });
    }
  });

  // Form submission handler
  const onSubmit = (values: MerchantFormValues) => {
    updateMerchant.mutate(values);
  };

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <h1 className="text-2xl font-bold text-red-600">Error</h1>
        <p className="mt-2 text-gray-600">Failed to load merchant details.</p>
        <Button 
          className="mt-4" 
          variant="outline"
          onClick={() => setLocation('/')}
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            {isLoading ? (
              <Skeleton className="w-48 h-10" />
            ) : (
              data?.merchant.name
            )}
          </h1>
          <p className="text-gray-500">
            {isLoading ? (
              <Skeleton className="w-24 h-6 mt-1" />
            ) : (
              `ID: ${data?.merchant.id}`
            )}
          </p>
        </div>
        <Button 
          variant="outline"
          onClick={() => setLocation('/')}
        >
          Back to Dashboard
        </Button>
      </div>

      <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details">Merchant Details</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Merchant Information</CardTitle>
              <CardDescription>
                View and update merchant details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="w-full h-10" />
                  <Skeleton className="w-full h-10" />
                  <Skeleton className="w-full h-10" />
                  <Skeleton className="w-full h-10" />
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="clientMID"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client MID</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Enter client MID" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button 
                        type="submit" 
                        disabled={updateMerchant.isPending}
                      >
                        {updateMerchant.isPending ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                View recent transactions for this merchant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="w-full h-64" />
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.transactions && data.transactions.length > 0 ? (
                        data.transactions.map(transaction => (
                          <TableRow key={transaction.transactionId}>
                            <TableCell className="font-medium">{transaction.transactionId}</TableCell>
                            <TableCell>{formatDate(transaction.date)}</TableCell>
                            <TableCell>
                              <span 
                                className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full ${
                                  transaction.type === 'Sale' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {transaction.type}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={transaction.type === 'Sale' ? 'text-green-600' : 'text-red-600'}>
                                {transaction.type === 'Sale' ? '+' : '-'}{formatCurrency(transaction.amount)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-gray-500">
                            No transactions found for this merchant.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
                <CardDescription>
                  Transaction volume and revenue statistics.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="w-full h-24" />
                    <Skeleton className="w-full h-24" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-500">Daily Transactions</h3>
                      <p className="mt-1 text-2xl font-semibold">{data?.analytics.dailyStats.transactions}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-500">Daily Revenue</h3>
                      <p className="mt-1 text-2xl font-semibold text-green-600">{formatCurrency(data?.analytics.dailyStats.revenue || 0)}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-500">Monthly Transactions</h3>
                      <p className="mt-1 text-2xl font-semibold">{data?.analytics.monthlyStats.transactions}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-500">Monthly Revenue</h3>
                      <p className="mt-1 text-2xl font-semibold text-green-600">{formatCurrency(data?.analytics.monthlyStats.revenue || 0)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Transaction Trend</CardTitle>
                <CardDescription>
                  Monthly transaction volume for the last 6 months.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="w-full h-[300px]" />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        width={500}
                        height={300}
                        data={data?.analytics.transactionHistory}
                        margin={{
                          top: 5,
                          right: 30,
                          left: 20,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                        <Tooltip formatter={(value, name) => {
                          if (name === "revenue") return [formatCurrency(value as number), "Revenue"];
                          return [value, "Transactions"];
                        }} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="transactions" fill="#8884d8" name="Transactions" />
                        <Bar yAxisId="right" dataKey="revenue" fill="#82ca9d" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>
                  Monthly revenue performance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="w-full h-[300px]" />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        width={500}
                        height={300}
                        data={data?.analytics.transactionHistory}
                        margin={{
                          top: 10,
                          right: 30,
                          left: 0,
                          bottom: 0,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis 
                          tickFormatter={(value) => 
                            new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              maximumFractionDigits: 0,
                              notation: 'compact'
                            }).format(value as number)
                          }
                        />
                        <Tooltip formatter={(value) => [
                          formatCurrency(value as number), 
                          "Revenue"
                        ]} />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#8884d8"
                          fill="url(#colorRevenue)"
                        />
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}