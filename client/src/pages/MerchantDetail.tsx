import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import MainLayout from '@/components/layout/MainLayout';
import { Slider } from "@/components/ui/slider";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  otherClientNumber1: z.string().optional(),
  otherClientNumber2: z.string().optional(),
  clientSinceDate: z.string().optional(), // We'll handle date conversion in the form
  status: z.string(),
  merchantType: z.union([z.number(), z.string()]).optional().transform(val => 
    typeof val === 'string' ? parseInt(val) || 0 : val || 0
  ), // Accept string or number and convert to number
  salesChannel: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  editDate: z.string().optional() // We'll handle date conversion in the form
});

// Define transaction form schema
const transactionSchema = z.object({
  amount: z.string().refine(val => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a valid positive number"
  }),
  type: z.string(),
  date: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Date must be valid"
  })
});

type MerchantFormValues = z.infer<typeof merchantSchema>;
type TransactionFormValues = z.infer<typeof transactionSchema>;

// Define the types for merchant details API response
interface MerchantDetailsResponse {
  merchant: {
    id: string;
    name: string;
    clientMID: string | null;
    otherClientNumber1: string | null;
    otherClientNumber2: string | null;
    clientSinceDate: string | null;
    status: string;
    merchantType: number;
    salesChannel: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string | null;
    category: string;
    editDate: string | null;
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

// Add Transaction Form Component
function AddTransactionForm({ 
  onSubmit, 
  isSubmitting,
  onCancel
}: { 
  onSubmit: (values: TransactionFormValues) => void, 
  isSubmitting: boolean,
  onCancel: () => void
}) {
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: '',
      type: 'Credit',
      date: new Date().toISOString().split('T')[0]
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input {...field} type="number" step="0.01" min="0.01" placeholder="Enter amount" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transaction Type</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select transaction type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Credit">Credit</SelectItem>
                  <SelectItem value="Debit">Debit</SelectItem>
                  <SelectItem value="Fee">Fee</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Transaction"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function MerchantDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [showDeleteTransactionsDialog, setShowDeleteTransactionsDialog] = useState(false);
  
  // Fetch merchant details
  const { data, isLoading, error } = useQuery<MerchantDetailsResponse>({
    queryKey: ['/api/merchants', id],
    queryFn: () => fetch(`/api/merchants/${id}`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch merchant');
      return res.json();
    })
  });
  
  // Date range for transaction history visualization
  const [dateRange, setDateRange] = useState({
    // Default to showing last 12 months 
    monthsToShow: 12,
    // Start position (0 means start from current month and go back)
    startPosition: 0
  });

  // Function to shift the date range window
  const shiftDateRange = useCallback((shift: number) => {
    setDateRange(prev => ({
      ...prev,
      startPosition: Math.max(0, prev.startPosition + shift)
    }));
  }, []);
  
  // Filter transaction history data based on the date range window
  const getFilteredTransactionHistory = useCallback(() => {
    if (!data?.analytics.transactionHistory) return [];
    
    // Clone the data to avoid mutation
    const history = [...data.analytics.transactionHistory];
    
    // Get the total available months
    const totalMonths = history.length;
    
    // If startPosition is beyond available data, reset it
    if (dateRange.startPosition >= totalMonths) {
      setDateRange(prev => ({...prev, startPosition: Math.max(0, totalMonths - prev.monthsToShow)}));
      return history.slice(0, dateRange.monthsToShow);
    }
    
    // Calculate end based on available data
    const start = dateRange.startPosition;
    const end = Math.min(totalMonths, start + dateRange.monthsToShow);
    
    // Return the window of data
    return history.slice(totalMonths - end, totalMonths - start).reverse();
  }, [data?.analytics.transactionHistory, dateRange]);
  
  // Get transactions filtered by the selected date range
  const getFilteredTransactions = useCallback(() => {
    if (!data?.transactions) {
      return [];
    }
    
    if (!data?.analytics.transactionHistory || data.analytics.transactionHistory.length === 0) {
      return data.transactions;
    }
    
    // Get the filtered months from the transaction history
    const filteredHistory = getFilteredTransactionHistory();
    
    if (filteredHistory.length === 0) {
      return data.transactions;
    }
    
    // Extract month names from the history data
    const filteredMonths = filteredHistory.map(monthData => {
      const monthName = monthData.name;
      // Year might be included in the name (e.g. "Jan 2024")
      const yearMatch = monthData.name.match(/\d{4}$/);
      const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
      return { monthName, year };
    });
    
    // Create a mapping of month names to month numbers
    const monthNameToNumber: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    
    // Function to extract month abbreviation from a string that might include a year
    const extractMonthAbbr = (monthStr: string): string => {
      // Extract first 3 characters which should be the month abbreviation
      return monthStr.substring(0, 3);
    };
    
    // Filter transactions based on the selected months
    return data.transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      const transactionMonth = transactionDate.getMonth();
      const transactionYear = transactionDate.getFullYear();
      
      // Check if this transaction's month and year are in our filtered set
      return filteredMonths.some(({ monthName, year }) => {
        // Get the month number from the abbreviated month name
        const monthAbbr = extractMonthAbbr(monthName);
        const monthNumber = monthNameToNumber[monthAbbr];
        
        // Only check if month matches since we're showing the same month across different years
        // The year might be different between analytics and transactions
        return monthNumber === transactionMonth;
      });
    });
  }, [data?.transactions, data?.analytics.transactionHistory, getFilteredTransactionHistory]);

  // Create form with validation
  const form = useForm<MerchantFormValues>({
    resolver: zodResolver(merchantSchema),
    defaultValues: {
      name: data?.merchant.name || '',
      clientMID: data?.merchant.clientMID || '',
      otherClientNumber1: data?.merchant.otherClientNumber1 || '',
      otherClientNumber2: data?.merchant.otherClientNumber2 || '',
      clientSinceDate: data?.merchant.clientSinceDate ? new Date(data.merchant.clientSinceDate).toISOString().split('T')[0] : '',
      status: data?.merchant.status || '',
      merchantType: data?.merchant.merchantType || 0,
      salesChannel: data?.merchant.salesChannel || '',
      address: data?.merchant.address || '',
      city: data?.merchant.city || '',
      state: data?.merchant.state || '',
      zipCode: data?.merchant.zipCode || '',
      country: data?.merchant.country || '',
      category: data?.merchant.category || '',
      editDate: data?.merchant.editDate ? new Date(data.merchant.editDate).toISOString().split('T')[0] : ''
    },
    values: {
      name: data?.merchant.name || '',
      clientMID: data?.merchant.clientMID || '',
      otherClientNumber1: data?.merchant.otherClientNumber1 || '',
      otherClientNumber2: data?.merchant.otherClientNumber2 || '',
      clientSinceDate: data?.merchant.clientSinceDate ? new Date(data.merchant.clientSinceDate).toISOString().split('T')[0] : '',
      status: data?.merchant.status || '',
      merchantType: data?.merchant.merchantType || 0,
      salesChannel: data?.merchant.salesChannel || '',
      address: data?.merchant.address || '',
      city: data?.merchant.city || '',
      state: data?.merchant.state || '',
      zipCode: data?.merchant.zipCode || '',
      country: data?.merchant.country || '',
      category: data?.merchant.category || '',
      editDate: data?.merchant.editDate ? new Date(data.merchant.editDate).toISOString().split('T')[0] : ''
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
  
  // Add transaction mutation
  const addTransaction = useMutation({
    mutationFn: (values: TransactionFormValues) => {
      return apiRequest(`/api/merchants/${id}/transactions`, {
        method: 'POST',
        body: {
          ...values,
          amount: parseFloat(values.amount)
        }
      });
    },
    onSuccess: () => {
      toast({
        title: 'Transaction added',
        description: 'Transaction has been successfully added.',
      });
      setShowAddTransactionDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', id] });
    },
    onError: () => {
      toast({
        title: 'Failed to add transaction',
        description: 'An error occurred while adding the transaction.',
        variant: 'destructive',
      });
    }
  });
  
  // Delete transactions mutation
  const deleteTransactions = useMutation({
    mutationFn: (transactionIds: string[]) => {
      return apiRequest(`/api/merchants/${id}/transactions/delete`, {
        method: 'POST',
        body: { transactionIds }
      });
    },
    onSuccess: () => {
      toast({
        title: 'Transactions deleted',
        description: `${selectedTransactions.length} transaction(s) deleted successfully.`,
      });
      setSelectedTransactions([]);
      setShowDeleteTransactionsDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', id] });
    },
    onError: () => {
      toast({
        title: 'Failed to delete transactions',
        description: 'An error occurred while deleting the selected transactions.',
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
      <MainLayout>
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
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container px-4 py-6 mx-auto">
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

        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

        {/* Demographics Tab */}
        <TabsContent value="demographics">
          <Card>
            <CardHeader>
              <CardTitle>Merchant Demographics</CardTitle>
              <CardDescription>
                View and update merchant demographic information.
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
                        name="merchantType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Merchant Type</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(parseInt(value))} 
                              defaultValue={field.value?.toString() || "0"}
                              value={field.value?.toString() || "0"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select merchant type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="0">None</SelectItem>
                                <SelectItem value="1">Type 1</SelectItem>
                                <SelectItem value="2">Type 2</SelectItem>
                                <SelectItem value="3">Type 3+</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="salesChannel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sales Channel</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter sales channel" />
                            </FormControl>
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

                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="otherClientNumber1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Other Client Number 1</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Enter other client number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="otherClientNumber2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Other Client Number 2</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Enter other client number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="clientSinceDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Since Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="editDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Edit Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>
                  {(() => {
                    const filteredHistory = getFilteredTransactionHistory();
                    if (filteredHistory.length > 0) {
                      const firstMonth = filteredHistory[0].name;
                      const lastMonth = filteredHistory[filteredHistory.length - 1].name;
                      
                      return `Showing transactions from ${firstMonth} to ${lastMonth}`;
                    }
                    return "View and manage transactions for this merchant.";
                  })()}
                </CardDescription>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowAddTransactionDialog(true)}
                >
                  Add Transaction
                </Button>
                <Button 
                  variant="destructive"
                  disabled={selectedTransactions.length === 0}
                  onClick={() => setShowDeleteTransactionsDialog(true)}
                >
                  Delete Selected
                </Button>
              </div>
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
                        <TableHead className="w-[50px]">
                          <Checkbox 
                            checked={
                              data?.transactions && 
                              data.transactions.length > 0 && 
                              selectedTransactions.length === data.transactions.length
                            }
                            onCheckedChange={(checked) => {
                              if (checked && data?.transactions) {
                                setSelectedTransactions(data.transactions.map(t => t.transactionId));
                              } else {
                                setSelectedTransactions([]);
                              }
                            }}
                            aria-label="Select all transactions"
                          />
                        </TableHead>
                        <TableHead>Transaction ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filteredTransactions = getFilteredTransactions();
                        
                        if (data?.transactions && data.transactions.length > 0) {
                          if (filteredTransactions.length > 0) {
                            return filteredTransactions.map(transaction => (
                              <TableRow key={transaction.transactionId}>
                                <TableCell>
                                  <Checkbox 
                                    checked={selectedTransactions.includes(transaction.transactionId)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedTransactions([...selectedTransactions, transaction.transactionId]);
                                      } else {
                                        setSelectedTransactions(selectedTransactions.filter(id => id !== transaction.transactionId));
                                      }
                                    }}
                                    aria-label={`Select transaction ${transaction.transactionId}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{transaction.transactionId}</TableCell>
                                <TableCell>{formatDate(transaction.date)}</TableCell>
                                <TableCell>
                                  <span 
                                    className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full ${
                                      transaction.type === 'Credit' 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {transaction.type}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={transaction.type === 'Credit' ? 'text-green-600' : 'text-red-600'}>
                                    {transaction.type === 'Credit' ? '+' : '-'}{formatCurrency(transaction.amount)}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ));
                          } else {
                            return (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                                  No transactions found for the selected time period.
                                  <div className="mt-2">
                                    <span className="text-sm text-muted-foreground">
                                      Try adjusting the date selection using the navigation controls above.
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          }
                        } else {
                          return (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                                No transactions found for this merchant.
                              </TableCell>
                            </TableRow>
                          );
                        }
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Transaction Dialog */}
          <Dialog open={showAddTransactionDialog} onOpenChange={setShowAddTransactionDialog}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Transaction</DialogTitle>
                <DialogDescription>
                  Enter the details for the new transaction.
                </DialogDescription>
              </DialogHeader>
              <AddTransactionForm 
                onSubmit={(values) => addTransaction.mutate(values)} 
                isSubmitting={addTransaction.isPending}
                onCancel={() => setShowAddTransactionDialog(false)}
              />
            </DialogContent>
          </Dialog>

          {/* Delete Transactions Confirmation Dialog */}
          <AlertDialog open={showDeleteTransactionsDialog} onOpenChange={setShowDeleteTransactionsDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Transactions</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {selectedTransactions.length} transaction(s)? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteTransactions.mutate(selectedTransactions)}
                  disabled={deleteTransactions.isPending}
                >
                  {deleteTransactions.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview">
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
                  Monthly transaction volume for the last 12 months.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="w-full h-[300px]" />
                ) : (
                  <div className="space-y-4">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          width={500}
                          height={300}
                          data={getFilteredTransactionHistory()}
                          margin={{
                            top: 5,
                            right: 30,
                            left: 20,
                            bottom: 25,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="name" 
                            height={50}
                            angle={-45}
                            textAnchor="end"
                            interval={0}
                            tick={{ fontSize: 12 }}
                          />
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
                    
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const currentPosition = dateRange.startPosition;
                          if (currentPosition > 0) {
                            setDateRange(prev => ({
                              ...prev,
                              startPosition: Math.max(0, prev.startPosition - 1)
                            }));
                          }
                        }}
                        disabled={dateRange.startPosition === 0}
                      >
                        ← Previous Month
                      </Button>
                      
                      <div className="text-sm text-gray-500">
                        Slide to navigate through time
                      </div>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const totalMonths = data?.analytics.transactionHistory?.length || 0;
                          const maxPosition = Math.max(0, totalMonths - dateRange.monthsToShow);
                          if (dateRange.startPosition < maxPosition) {
                            setDateRange(prev => ({
                              ...prev,
                              startPosition: Math.min(maxPosition, prev.startPosition + 1)
                            }));
                          }
                        }}
                        disabled={!data?.analytics.transactionHistory || 
                                 dateRange.startPosition >= Math.max(0, (data.analytics.transactionHistory.length - dateRange.monthsToShow))}
                      >
                        Next Month →
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>
                  Monthly revenue performance over 12 months.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="w-full h-[300px]" />
                ) : (
                  <div className="space-y-4">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          width={500}
                          height={300}
                          data={getFilteredTransactionHistory()}
                          margin={{
                            top: 10,
                            right: 30,
                            left: 0,
                            bottom: 25,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="name" 
                            height={50}
                            angle={-45}
                            textAnchor="end"
                            interval={0}
                            tick={{ fontSize: 12 }}
                          />
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
                    
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const currentPosition = dateRange.startPosition;
                          if (currentPosition > 0) {
                            setDateRange(prev => ({
                              ...prev,
                              startPosition: Math.max(0, prev.startPosition - 1)
                            }));
                          }
                        }}
                        disabled={dateRange.startPosition === 0}
                      >
                        ← Previous Month
                      </Button>
                      
                      <div className="text-sm text-gray-500">
                        {data?.analytics.transactionHistory && 
                         dateRange.startPosition <= (data.analytics.transactionHistory.length - dateRange.monthsToShow) ? 
                         `Showing months ${dateRange.startPosition + 1}-${dateRange.startPosition + dateRange.monthsToShow} of ${data.analytics.transactionHistory.length}` : 
                         "Showing most recent months"}
                      </div>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const totalMonths = data?.analytics.transactionHistory?.length || 0;
                          const maxPosition = Math.max(0, totalMonths - dateRange.monthsToShow);
                          if (dateRange.startPosition < maxPosition) {
                            setDateRange(prev => ({
                              ...prev,
                              startPosition: Math.min(maxPosition, prev.startPosition + 1)
                            }));
                          }
                        }}
                        disabled={!data?.analytics.transactionHistory || 
                                 dateRange.startPosition >= Math.max(0, (data.analytics.transactionHistory.length - dateRange.monthsToShow))}
                      >
                        Next Month →
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </MainLayout>
  );
}