import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import MainLayout from '@/components/layout/MainLayout';
import { RawDataTooltip } from '@/components/raw-data-tooltip';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { SubMerchantTerminals } from '@/components/merchants/SubMerchantTerminals';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

// Define the merchant form schema
const merchantSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  clientMID: z.string().optional(),
  otherClientNumber1: z.string().optional(),
  otherClientNumber2: z.string().optional(),
  clientSinceDate: z.string().optional(),
  status: z.string(),
  merchantType: z.string().nullable().optional(),
  salesChannel: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  asOfDate: z.string().optional(),
  closeDate: z.string().optional(),
  association: z.string().optional(),
  mcc: z.string().optional(),
  bank: z.string().optional(),
  associateMerchantNumber: z.string().optional(),
  dbaNameCwob: z.string().optional(),
  cwobDebitRisk: z.string().optional(),
  vwobEbtReturn: z.string().optional(),
  bypassEa: z.string().optional(),
  bypassCo: z.string().optional(),
  merchantRecordSt: z.string().optional(),
  boardDt: z.string().optional(),
  saleAmt: z.string().optional(),
  creditAmt: z.string().optional(),
  negativeAmount: z.string().optional(),
  numberO: z.string().optional(),
  bypassForce: z.string().optional(),
  feeVisa: z.string().optional(),
  visaMcc: z.string().optional(),
  dailyAuthLimit: z.string().optional(),
  bypassEx: z.string().optional(),
  excessiveDepositAmount: z.string().optional(),
  threshold: z.string().optional(),
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
    merchantType: string | null;
    salesChannel: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string | null;
    category: string;
    asOfDate: string | null; // As of date from demographic import
    association: string | null; // Business association field
    mcc: string | null; // Merchant Category Code
    editDate: string | null; // System-controlled last edit date
    updatedBy: string | null; // System-controlled updated by field
    bank: string | null;
    associateMerchantNumber: string | null;
    dbaNameCwob: string | null;
    cwobDebitRisk: string | null;
    vwobEbtReturn: string | null;
    bypassEa: string | null;
    bypassCo: string | null;
    merchantRecordSt: string | null;
    boardDt: string | null;
    saleAmt: number | null;
    creditAmt: number | null;
    negativeAmount: number | null;
    numberO: string | null;
    bypassForce: string | null;
    feeVisa: number | null;
    visaMcc: string | null;
    dailyAuthLimit: number | null;
    bypassEx: string | null;
    excessiveDepositAmount: number | null;
    threshold: number | null;
    groupLevel1: string | null;
    associationNumber: string | null;
    accountNumber: string | null;
    associationName: string | null;
    groupLevel1Name: string | null;
    sic: string | null;
    class: string | null;
    dbaName: string | null;
    phone1: string | null;
    phone2: string | null;
    businessLicense: string | null;
    bankOfficer1: string | null;
    bankOfficer2: string | null;
    federalTaxId: string | null;
    stateTaxId: string | null;
    ownerName: string | null;
    managerName: string | null;
    lastActivityDate: string | null;
    dailyFeeIndicator: string | null;
    mcRegId: string | null;
    customerServiceNumber: string | null;
    updateDateTime: string | null;
    statusChangeDate: string | null;
    discoverMapFlag: string | null;
    amexOptblueFlag: string | null;
    visaDescriptor: string | null;
    mcDescriptor: string | null;
    url: string | null;
    closeDate: string | null;
    dateOfLastAuth: string | null;
    dunsNumber: string | null;
    printStatementIndicator: string | null;
    visaBin: string | null;
    mcBin: string | null;
    mcIca: string | null;
    amexCapId: string | null;
    discoverAiid: string | null;
    ddaNumber: string | null;
    transitRoutingNumber: string | null;
    transDestination: string | null;
    merchantEmailAddress: string | null;
    chargebackEmailAddress: string | null;
    merchantStatus: string | null;
  };
  transactions: {
    transactionId: string;
    merchantId: string;
    amount: string; // Changed from number to string to maintain precision
    date: string;
    type: string;
    traceNumber: string; // Added trace number field
  }[];
  analytics: {
    dailyStats: {
      transactions: number;
      revenue: string; // Changed from number to string to maintain precision
    };
    monthlyStats: {
      transactions: number;
      revenue: string; // Changed from number to string to maintain precision
    };
    transactionHistory: {
      name: string;
      transactions: number;
      revenue: string; // Changed from number to string to maintain precision
    }[];
  };
}

// MCC Schema field interface
interface MccSchemaField {
  position: string;
  fieldName: string;
  fieldLength: number;
  format: string;
  description: string | null;
  mmsEnabled: number;
}

// Field mapping utility: maps MCC schema fieldName to merchant database field names (camelCase)
const fieldNameMapping: Record<string, string> = {
  'Bank': 'bankNumber',
  'Bank Number': 'bankNumber',
  'Association': 'association',
  'Group (Level 1)': 'groupLevel1',
  'Association Number': 'associationNumber',
  'Account Number': 'accountNumber',
  'Association Name': 'associationName',
  'Group Level 1 Name': 'groupLevel1Name',
  'MCC': 'mcc',
  'CLASS': 'class',
  'SIC': 'sic',
  'Merchant Category Code': 'mcc',
  'DBA Name': 'dbaName',
  'Phone 1': 'phone1',
  'Phone 2': 'phone2',
  'Business License': 'businessLicense',
  'Bank Officer 1': 'bankOfficer1',
  'Bank Officer 2': 'bankOfficer2',
  'Federal Tax ID': 'federalTaxId',
  'State Tax ID': 'stateTaxId',
  'Owner Name': 'ownerName',
  'Manager Name': 'managerName',
  'Last Activity Date': 'lastActivityDate',
  'Daily Fee Indicator': 'dailyFeeIndicator',
  'MC Reg ID': 'mcRegId',
  'Customer Service Number': 'customerServiceNumber',
  'Update Date Time': 'updateDateTime',
  'Status Change Date': 'statusChangeDate',
  'Discover MAP Flag': 'discoverMapFlag',
  'Amex OptBlue Flag': 'amexOptblueFlag',
  'Visa Descriptor': 'visaDescriptor',
  'MC Descriptor': 'mcDescriptor',
  'URL': 'url',
  'Close Date': 'closeDate',
  'Date of Last Auth': 'dateOfLastAuth',
  'DUNS Number': 'dunsNumber',
  'Print Statement Indicator': 'printStatementIndicator',
  'Visa BIN': 'visaBin',
  'MC BIN': 'mcBin',
  'MC ICA': 'mcIca',
  'Amex CAP ID': 'amexCapId',
  'Discover AIID': 'discoverAiid',
  'DDA Number': 'ddaNumber',
  'Transit Routing Number': 'transitRoutingNumber',
  'Trans Destination': 'transDestination',
  'Merchant Email Address': 'merchantEmailAddress',
  'Chargeback Email Address': 'chargebackEmailAddress',
  'Associate Merchant Number': 'associateMerchantNumber',
  'DBA Name CWOB': 'dbaNameCwob',
  'CWOB Debit Risk': 'cwobDebitRisk',
  'VWOB EBT Return': 'vwobEbtReturn',
  'Bypass EA': 'bypassEa',
  'Bypass Co': 'bypassCo',
  'Merchant Record St': 'merchantRecordSt',
  'Merchant Record Status': 'merchantRecordSt',
  'Board Dt': 'boardDt',
  'Board Date': 'boardDt',
  'Merchant Activation Date': 'merchantActivationDate',
  'Sale Amt': 'saleAmt',
  'Sale Amount': 'saleAmt',
  'Credit Amt': 'creditAmt',
  'Credit Amount': 'creditAmt',
  'Negative Amount': 'negativeAmount',
  'Number O': 'numberO',
  'Bypass Force': 'bypassForce',
  'Fee Visa': 'feeVisa',
  'Visa MCC': 'visaMcc',
  'Daily Auth Limit': 'dailyAuthLimit',
  'Bypass Ex': 'bypassEx',
  'Exposure Amount': 'exposureAmount',
  'Excessive Deposit Amount': 'excessiveDepositAmount',
  'Threshold': 'threshold',
  'Date of First Deposit': 'dateOfFirstDeposit',
  'Date of Last Deposit': 'dateOfLastDeposit',
  'As of Date': 'asOfDate',
  'Last Statement Date': 'lastStatementDate',
  'Open Date': 'openDate',
  'Last Credit Check Date': 'lastCreditCheckDate',
  'Fin Statement Due Date': 'finStatementDueDate',
  'Merchant Status': 'merchantStatus'
};

// Helper function to get input type based on MCC schema format
const getInputType = (format: string): 'text' | 'number' | 'date' => {
  if (format === 'N') return 'number';
  if (format === 'D') return 'date';
  return 'text';
};

// Convert TSYS merchant status code to display text
const convertTsysStatus = (tsysStatusCode: string | null | undefined): string => {
  if (!tsysStatusCode || tsysStatusCode.trim() === '') return 'Active/Open';
  
  const code = tsysStatusCode.trim().toUpperCase();
  switch (code) {
    case 'I': return 'I - Inactive';
    case 'F': return 'F - Fraud';
    case 'S': return 'S - Suspect';
    case 'Z': return 'Z - Merchant do not auth';
    case 'C': return 'C - Closed (nothing goes through)';
    case 'D': return 'D - Delete (Only Chargebacks and Adjustments)';
    case 'B': return 'B - Do not post';
    default: return 'Active/Open';
  }
};

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
  
  // Pagination and sorting state for ACH Transactions
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<'traceNumber' | 'date' | 'type' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination state for TSYS Risk & Configuration Fields
  const [tsysCurrentPage, setTsysCurrentPage] = useState(1);
  const [tsysItemsPerPage, setTsysItemsPerPage] = useState(5);
  
  // Fetch merchant details
  const { data, isLoading, error } = useQuery<MerchantDetailsResponse>({
    queryKey: ['/api/merchants', id],
    queryFn: () => fetch(`/api/merchants/${id}`).then(res => {
      if (!res.ok) throw new Error('Failed to fetch merchant');
      return res.json();
    })
  });

  // Fetch MCC schema fields where mmsEnabled = 1
  // Auto-refresh every 5 minutes when page is visible
  const { data: mccSchemaFields, isLoading: mccSchemaLoading, refetch: refetchMccSchema } = useQuery<MccSchemaField[]>({
    queryKey: ['/api/mcc-schema'],
    queryFn: () => fetch('/api/mcc-schema').then(res => {
      if (!res.ok) throw new Error('Failed to fetch MCC schema');
      return res.json();
    }),
    select: (data) => data.filter(field => field.mmsEnabled === 1),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    refetchIntervalInBackground: false, // Only refresh when page is visible
    refetchOnMount: true, // Always fetch fresh data when component mounts
    refetchOnWindowFocus: true // Refetch when user returns to tab
  });

  // Frontend displays real-time merchant data with user tracking
  
  // Calculate paginated TSYS fields
  const paginatedTsysFields = useMemo(() => {
    if (!mccSchemaFields) return { fields: [], totalItems: 0, totalPages: 1 };
    
    // Show all enabled fields from MCC schema (already filtered by mmsEnabled=1)
    // Don't filter by mapping - show all fields even if no data available
    const validFields = mccSchemaFields;
    
    const totalItems = validFields.length;
    const totalPages = Math.ceil(totalItems / tsysItemsPerPage) || 1;
    const startIndex = (tsysCurrentPage - 1) * tsysItemsPerPage;
    const endIndex = startIndex + tsysItemsPerPage;
    const fields = validFields.slice(startIndex, endIndex);
    
    return { fields, totalItems, totalPages };
  }, [mccSchemaFields, tsysCurrentPage, tsysItemsPerPage]);
  
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
  
  // Sort and paginate transactions using useMemo for better performance
  const sortedAndPaginatedData = useMemo(() => {
    if (!data?.transactions) {
      return { transactions: [], totalItems: 0, totalPages: 1, currentPage: 1 };
    }
    
    // Sort transactions with stable tiebreaker
    const sortedTransactions = [...data.transactions].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'traceNumber':
          aValue = ((a as any).traceNumber || a.transactionId || '').toLowerCase();
          bValue = ((b as any).traceNumber || b.transactionId || '').toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.date);
          bValue = new Date(b.date);
          break;
        case 'type':
          aValue = a.type.toLowerCase();
          bValue = b.type.toLowerCase();
          break;
        case 'amount':
          aValue = parseFloat(a.amount);
          bValue = parseFloat(b.amount);
          break;
        default:
          aValue = new Date(a.date);
          bValue = new Date(b.date);
      }
      
      let comparison = 0;
      if (sortOrder === 'asc') {
        comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        comparison = aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
      
      // Add stable tiebreaker using transactionId to prevent visual jitter
      if (comparison === 0) {
        return a.transactionId.localeCompare(b.transactionId);
      }
      
      return comparison;
    });
    
    // Calculate pagination with clamping
    const totalItems = sortedTransactions.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const clampedCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (clampedCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);
    
    return {
      transactions: paginatedTransactions,
      totalItems,
      totalPages,
      currentPage: clampedCurrentPage
    };
  }, [data?.transactions, sortField, sortOrder, currentPage, itemsPerPage]);

  // Effect to update currentPage if it becomes invalid due to data changes
  useEffect(() => {
    if (sortedAndPaginatedData.currentPage && sortedAndPaginatedData.currentPage !== currentPage) {
      setCurrentPage(sortedAndPaginatedData.currentPage);
    }
  }, [sortedAndPaginatedData.currentPage, currentPage]);

  // Effect to clear selections when transaction data changes
  useEffect(() => {
    if (data?.transactions) {
      setSelectedTransactions(prev => 
        prev.filter(id => data.transactions?.some(t => t.transactionId === id))
      );
    }
  }, [data?.transactions]);
  
  // Get transactions filtered by the selected date range (keeping for analytics)
  const getFilteredTransactions = useCallback(() => {
    if (!data?.transactions) {
      return [];
    }
    
    // For VSB merchants with ACH transactions, show all transactions by default
    // The complex date filtering was designed for different data structures
    return data.transactions;
  }, [data?.transactions]);

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
      merchantType: data?.merchant.merchantType || "none",
      salesChannel: data?.merchant.salesChannel || '',
      address: data?.merchant.address || '',
      city: data?.merchant.city || '',
      state: data?.merchant.state || '',
      zipCode: data?.merchant.zipCode || '',
      country: data?.merchant.country || '',
      category: data?.merchant.category || data?.merchant.class || '',
      asOfDate: data?.merchant.asOfDate ? new Date(data.merchant.asOfDate).toISOString().split('T')[0] : '',
      closeDate: data?.merchant.closeDate ? new Date(data.merchant.closeDate).toISOString().split('T')[0] : '',
      association: data?.merchant.association || '',
      mcc: data?.merchant.mcc || '',
      bank: data?.merchant.bank || '',
      associateMerchantNumber: data?.merchant.associateMerchantNumber || '',
      dbaNameCwob: data?.merchant.dbaNameCwob || '',
      cwobDebitRisk: data?.merchant.cwobDebitRisk || '',
      vwobEbtReturn: data?.merchant.vwobEbtReturn || '',
      bypassEa: data?.merchant.bypassEa || '',
      bypassCo: data?.merchant.bypassCo || '',
      merchantRecordSt: data?.merchant.merchantRecordSt || '',
      boardDt: data?.merchant.boardDt ? new Date(data.merchant.boardDt).toISOString().split('T')[0] : '',
      saleAmt: data?.merchant.saleAmt?.toString() || '',
      creditAmt: data?.merchant.creditAmt?.toString() || '',
      negativeAmount: data?.merchant.negativeAmount?.toString() || '',
      numberO: data?.merchant.numberO || '',
      bypassForce: data?.merchant.bypassForce || '',
      feeVisa: data?.merchant.feeVisa?.toString() || '',
      visaMcc: data?.merchant.visaMcc || '',
      dailyAuthLimit: data?.merchant.dailyAuthLimit?.toString() || '',
      bypassEx: data?.merchant.bypassEx || '',
      excessiveDepositAmount: data?.merchant.excessiveDepositAmount?.toString() || '',
      threshold: data?.merchant.threshold?.toString() || '',
    },
    values: {
      name: data?.merchant.name || '',
      clientMID: data?.merchant.clientMID || '',
      otherClientNumber1: data?.merchant.otherClientNumber1 || '',
      otherClientNumber2: data?.merchant.otherClientNumber2 || '',
      clientSinceDate: data?.merchant.clientSinceDate ? new Date(data.merchant.clientSinceDate).toISOString().split('T')[0] : '',
      status: data?.merchant.status || '',
      merchantType: data?.merchant.merchantType || "none",
      salesChannel: data?.merchant.salesChannel || '',
      address: data?.merchant.address || '',
      city: data?.merchant.city || '',
      state: data?.merchant.state || '',
      zipCode: data?.merchant.zipCode || '',
      country: data?.merchant.country || '',
      category: data?.merchant.category || data?.merchant.class || '',
      asOfDate: data?.merchant.asOfDate ? new Date(data.merchant.asOfDate).toISOString().split('T')[0] : '',
      closeDate: data?.merchant.closeDate ? new Date(data.merchant.closeDate).toISOString().split('T')[0] : '',
      association: data?.merchant.association || '',
      mcc: data?.merchant.mcc || '',
      bank: data?.merchant.bank || '',
      associateMerchantNumber: data?.merchant.associateMerchantNumber || '',
      dbaNameCwob: data?.merchant.dbaNameCwob || '',
      cwobDebitRisk: data?.merchant.cwobDebitRisk || '',
      vwobEbtReturn: data?.merchant.vwobEbtReturn || '',
      bypassEa: data?.merchant.bypassEa || '',
      bypassCo: data?.merchant.bypassCo || '',
      merchantRecordSt: data?.merchant.merchantRecordSt || '',
      boardDt: data?.merchant.boardDt ? new Date(data.merchant.boardDt).toISOString().split('T')[0] : '',
      saleAmt: data?.merchant.saleAmt?.toString() || '',
      creditAmt: data?.merchant.creditAmt?.toString() || '',
      negativeAmount: data?.merchant.negativeAmount?.toString() || '',
      numberO: data?.merchant.numberO || '',
      bypassForce: data?.merchant.bypassForce || '',
      feeVisa: data?.merchant.feeVisa?.toString() || '',
      visaMcc: data?.merchant.visaMcc || '',
      dailyAuthLimit: data?.merchant.dailyAuthLimit?.toString() || '',
      bypassEx: data?.merchant.bypassEx || '',
      excessiveDepositAmount: data?.merchant.excessiveDepositAmount?.toString() || '',
      threshold: data?.merchant.threshold?.toString() || '',
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
    onError: (error: any) => {
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
          // Keep amount as string to maintain precision
          amount: values.amount
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
  
  // Handle sorting column clicks
  const handleSort = (field: 'traceNumber' | 'date' | 'type' | 'amount') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1); // Reset to first page when sorting
    setSelectedTransactions([]); // Clear selections when sorting to avoid confusion
  };
  
  // Handle pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedTransactions([]); // Clear selections when changing pages
  };
  
  // Handle items per page change
  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1); // Reset to first page
    setSelectedTransactions([]); // Clear selections
  };
  
  // Render sort icon and get aria-sort attribute
  const getSortIcon = (field: 'traceNumber' | 'date' | 'type' | 'amount') => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  // Get aria-sort attribute for accessibility
  const getAriaSort = (field: 'traceNumber' | 'date' | 'type' | 'amount'): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortOrder === 'asc' ? 'ascending' : 'descending';
  };

  // Helper function to format currency
  const formatCurrency = (amount: string | number) => {
    // Convert string to number if needed
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(numericAmount);
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
            onClick={() => setLocation('/merchants')}
          >
            Back to Merchant List
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
            <div className="text-gray-500">
              {isLoading ? (
                <Skeleton className="w-24 h-6 mt-1" />
              ) : (
                `ID: ${data?.merchant.id}`
              )}
            </div>
          </div>
          <Button 
            variant="outline"
            onClick={() => setLocation('/merchants')}
          >
            Back to Merchant List
          </Button>
        </div>

        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="terminals">Terminals</TabsTrigger>
            <TabsTrigger value="transactions">ACH Transactions</TabsTrigger>
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
                    {/* Core fields - always visible */}
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 border-b pb-6">
                      <div className="md:col-span-2">
                        <h3 className="text-lg font-semibold mb-4">Core Information</h3>
                      </div>
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
                                <SelectItem value="Active/Open">Active/Open</SelectItem>
                                <SelectItem value="I - Inactive">I - Inactive</SelectItem>
                                <SelectItem value="F - Fraud">F - Fraud</SelectItem>
                                <SelectItem value="S - Suspect">S - Suspect</SelectItem>
                                <SelectItem value="Z - Merchant do not auth">Z - Merchant do not auth</SelectItem>
                                <SelectItem value="C - Closed (nothing goes through)">C - Closed (nothing goes through)</SelectItem>
                                <SelectItem value="D - Delete (Only Chargebacks and Adjustments)">D - Delete (Only Chargebacks and Adjustments)</SelectItem>
                                <SelectItem value="B - Do not post">B - Do not post</SelectItem>
                                <SelectItem value="Closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="merchantType"
                        render={({ field }) => {
                          const [isCustomType, setIsCustomType] = useState(
                            !["none", "0", "1", "2", "3"].includes(field.value || "none")
                          );
                          const [customValue, setCustomValue] = useState(
                            isCustomType ? (field.value || "") : ""
                          );
                          
                          // Handle changes in the select/custom input
                          const handleValueChange = (value: string) => {
                            if (value === "custom") {
                              setIsCustomType(true);
                              field.onChange(customValue || "");
                            } else {
                              setIsCustomType(false);
                              field.onChange(value);
                            }
                          };
                          
                          // Handle changes in the custom input
                          const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                            const newValue = e.target.value;
                            setCustomValue(newValue);
                            field.onChange(newValue);
                          };
                          
                          return (
                            <FormItem className="space-y-2">
                              <FormLabel>Merchant Type</FormLabel>
                              <div className="space-y-2">
                                <Select 
                                  onValueChange={handleValueChange}
                                  value={isCustomType ? "custom" : (field.value || "none")}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select merchant type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="0">Type 0</SelectItem>
                                    <SelectItem value="1">Type 1</SelectItem>
                                    <SelectItem value="2">Type 2</SelectItem>
                                    <SelectItem value="3">Type 3</SelectItem>
                                    <SelectItem value="custom">Custom...</SelectItem>
                                  </SelectContent>
                                </Select>
                                
                                {isCustomType && (
                                  <FormControl>
                                    <Input 
                                      placeholder="Enter custom merchant type" 
                                      value={customValue || ""}
                                      onChange={handleCustomChange}
                                    />
                                  </FormControl>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
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
                            <FormLabel>Parent MID (MID2)</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Enter parent MID" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="association"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Association</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Enter business association" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mcc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MCC (Merchant Category Code)</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Enter MCC code" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Key Dates Section - Grouped at Top */}
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-4 border-b pb-6">
                      <div className="md:col-span-4">
                        <h3 className="text-lg font-semibold mb-4">Key Dates</h3>
                      </div>
                      
                      <div>
                        <FormLabel>Merchant Activation Date (Opened Date)</FormLabel>
                        <div className="p-2 border rounded-md bg-gray-50 dark:bg-gray-900 text-sm">
                          {data?.merchant.merchantActivationDate ? new Date(data.merchant.merchantActivationDate).toLocaleDateString() : 'Not available'}
                        </div>
                      </div>

                      <div>
                        <FormLabel>Date of First Deposit</FormLabel>
                        <div className="p-2 border rounded-md bg-gray-50 dark:bg-gray-900 text-sm">
                          {data?.merchant.dateOfFirstDeposit ? new Date(data.merchant.dateOfFirstDeposit).toLocaleDateString() : 'Not available'}
                        </div>
                      </div>

                      <div>
                        <FormLabel>Date of Last Deposit</FormLabel>
                        <div className="p-2 border rounded-md bg-gray-50 dark:bg-gray-900 text-sm">
                          {data?.merchant.dateOfLastDeposit ? new Date(data.merchant.dateOfLastDeposit).toLocaleDateString() : 'Not available'}
                        </div>
                      </div>

                      <div>
                        <FormLabel>Closed Date</FormLabel>
                        <div className="p-2 border rounded-md bg-gray-50 dark:bg-gray-900 text-sm">
                          {data?.merchant.closeDate ? new Date(data.merchant.closeDate).toLocaleDateString() : 'Not available'}
                        </div>
                      </div>
                    </div>

                    {/* Dynamic MCC Schema Fields - Name/Value List Display */}
                    {mccSchemaLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="w-full h-8" />
                        <Skeleton className="w-full h-32" />
                      </div>
                    ) : (
                      paginatedTsysFields.totalItems > 0 && (
                        <div className="border-b pb-6">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-semibold">TSYS Risk & Configuration Fields</h3>
                              <p className="text-sm text-gray-500">
                                Fields configured in MCC TSYS Config (showing {paginatedTsysFields.totalItems} enabled fields)
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => refetchMccSchema()}
                              className="flex items-center gap-2"
                              data-testid="button-refresh-tsys-fields"
                            >
                              <RefreshCw className="h-4 w-4" />
                              Refresh
                            </Button>
                          </div>
                          
                          {/* Simple Name-Value List */}
                          <div className="space-y-2 bg-gray-50 dark:bg-gray-900 p-4 rounded-md">
                            {paginatedTsysFields.fields.map((schemaField) => {
                              const fieldKey = fieldNameMapping[schemaField.fieldName];
                              const value = data?.merchant[fieldKey as keyof typeof data.merchant];
                              let displayValue = '—';
                              if (value !== null && value !== undefined) {
                                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                                  // ISO date string
                                  displayValue = new Date(value).toLocaleDateString();
                                } else {
                                  displayValue = String(value);
                                }
                              }

                              return (
                                <div key={schemaField.position} className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800 last:border-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{schemaField.fieldName}</span>
                                    {schemaField.description && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="text-xs text-gray-400 cursor-help">ℹ</span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{schemaField.description}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                  <span className="text-sm text-gray-600 dark:text-gray-400">{displayValue}</span>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Pagination Controls */}
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 dark:text-gray-400">Items per page:</span>
                              <Select
                                value={tsysItemsPerPage.toString()}
                                onValueChange={(value) => {
                                  setTsysItemsPerPage(parseInt(value));
                                  setTsysCurrentPage(1);
                                }}
                              >
                                <SelectTrigger className="w-20" data-testid="select-tsys-page-size">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="5">5</SelectItem>
                                  <SelectItem value="10">10</SelectItem>
                                  <SelectItem value="20">20</SelectItem>
                                  <SelectItem value="50">50</SelectItem>
                                  <SelectItem value="75">75</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                Page {tsysCurrentPage} of {paginatedTsysFields.totalPages}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setTsysCurrentPage(prev => Math.max(1, prev - 1))}
                                  disabled={tsysCurrentPage === 1}
                                  data-testid="button-tsys-prev-page"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setTsysCurrentPage(prev => Math.min(paginatedTsysFields.totalPages, prev + 1))}
                                  disabled={tsysCurrentPage === paginatedTsysFields.totalPages}
                                  data-testid="button-tsys-next-page"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    )}

                    {/* Display-only fields for edit date and updated by */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <FormLabel>Last Updated</FormLabel>
                        <div className="p-2 border rounded-md bg-gray-50 text-sm">
                          {data?.merchant.editDate ? new Date(data.merchant.editDate).toLocaleString() : 'Not available'}
                        </div>
                      </div>
                      <div>
                        <FormLabel>Updated By</FormLabel>
                        <div className="p-2 border rounded-md bg-gray-50 text-sm">
                          {data?.merchant.updatedBy || 'System'}
                        </div>
                      </div>
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

        {/* Terminals Tab */}
        <TabsContent value="terminals">
          <SubMerchantTerminals 
            merchantId={id!} 
            merchantName={data?.merchant.name}
          />
        </TabsContent>

        {/* ACH Transactions Tab */}
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
                <>
                  <div className="border rounded-md">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox 
                            checked={
                              sortedAndPaginatedData.transactions.length > 0 && 
                              selectedTransactions.length === sortedAndPaginatedData.transactions.length
                            }
                            onCheckedChange={(checked) => {
                              if (checked && sortedAndPaginatedData.transactions.length > 0) {
                                setSelectedTransactions(sortedAndPaginatedData.transactions.map(t => t.transactionId));
                              } else {
                                setSelectedTransactions([]);
                              }
                            }}
                            aria-label="Select all visible transactions"
                          />
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            onClick={() => handleSort('traceNumber')}
                            className="p-0 h-auto font-medium justify-start"
                            data-testid="sort-trace-number"
                            role="columnheader"
                            aria-sort={getAriaSort('traceNumber')}
                          >
                            Trace Number
                            {getSortIcon('traceNumber')}
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            onClick={() => handleSort('date')}
                            className="p-0 h-auto font-medium justify-start"
                            data-testid="sort-date"
                            role="columnheader"
                            aria-sort={getAriaSort('date')}
                          >
                            Date
                            {getSortIcon('date')}
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            onClick={() => handleSort('type')}
                            className="p-0 h-auto font-medium justify-start"
                            data-testid="sort-type"
                            role="columnheader"
                            aria-sort={getAriaSort('type')}
                          >
                            Type
                            {getSortIcon('type')}
                          </Button>
                        </TableHead>
                        <TableHead className="text-right">
                          <Button
                            variant="ghost"
                            onClick={() => handleSort('amount')}
                            className="p-0 h-auto font-medium justify-end"
                            data-testid="sort-amount"
                            role="columnheader"
                            aria-sort={getAriaSort('amount')}
                          >
                            Amount
                            {getSortIcon('amount')}
                          </Button>
                        </TableHead>
                        <TableHead>CSV Info</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const { transactions, totalItems } = sortedAndPaginatedData;
                        
                        if (totalItems > 0) {
                          if (transactions.length > 0) {
                            return transactions.map(transaction => (
                              <TableRow key={transaction.transactionId || `temp-${Math.random()}`}>
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
                                <TableCell className="font-mono text-sm font-medium">{(transaction as any).traceNumber || transaction.transactionId}</TableCell>
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
                                <TableCell>
                                  {(transaction as any).sourceFileName || (transaction as any).rawData ? (
                                    <RawDataTooltip 
                                      rawData={(transaction as any).rawData}
                                      sourceRowNumber={(transaction as any).sourceRowNumber}
                                      recordedAt={(transaction as any).recordedAt}
                                      sourceFileName={(transaction as any).sourceFileName}
                                    />
                                  ) : (
                                    <span className="text-gray-400 text-sm">-</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ));
                          } else {
                            return (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                                  No transactions found on this page.
                                </TableCell>
                              </TableRow>
                            );
                          }
                        } else {
                          return (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                                No transactions found for this merchant.
                              </TableCell>
                            </TableRow>
                          );
                        }
                      })()}
                    </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {(() => {
                    const { totalItems, totalPages } = sortedAndPaginatedData;
                    
                    if (totalItems > 0) {
                      return (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                          {/* Items per page selector */}
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-700">Items per page:</span>
                            <Select 
                              value={itemsPerPage.toString()} 
                              onValueChange={(value) => handleItemsPerPageChange(parseInt(value))}
                            >
                              <SelectTrigger className="w-[70px]" data-testid="items-per-page">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5</SelectItem>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Page info and navigation */}
                          <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-700">
                              Page {sortedAndPaginatedData.currentPage} of {totalPages} ({totalItems} total items)
                            </span>
                            
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(sortedAndPaginatedData.currentPage - 1)}
                                disabled={sortedAndPaginatedData.currentPage === 1}
                                data-testid="prev-page"
                              >
                                <ChevronLeft className="w-4 h-4" />
                                Previous
                              </Button>
                              
                              {/* Page numbers */}
                              <div className="flex items-center space-x-1">
                                {(() => {
                                  const pages = [];
                                  const showPages = 5; // Show 5 page numbers at most
                                  let startPage = Math.max(1, sortedAndPaginatedData.currentPage - 2);
                                  let endPage = Math.min(totalPages, startPage + showPages - 1);
                                  
                                  if (endPage - startPage < showPages - 1) {
                                    startPage = Math.max(1, endPage - showPages + 1);
                                  }
                                  
                                  for (let i = startPage; i <= endPage; i++) {
                                    pages.push(
                                      <Button
                                        key={i}
                                        variant={i === sortedAndPaginatedData.currentPage ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => handlePageChange(i)}
                                        className="w-8 h-8 p-0"
                                        data-testid={`page-${i}`}
                                      >
                                        {i}
                                      </Button>
                                    );
                                  }
                                  
                                  return pages;
                                })()}
                              </div>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(sortedAndPaginatedData.currentPage + 1)}
                                disabled={sortedAndPaginatedData.currentPage === totalPages}
                                data-testid="next-page"
                              >
                                Next
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
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
                      <h3 className="text-sm font-medium text-gray-500">Monthly Transactions</h3>
                      <p className="mt-1 text-2xl font-semibold">{data?.analytics.monthlyStats.transactions || 0}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-500">Monthly Revenue</h3>
                      <p className="mt-1 text-2xl font-semibold text-green-600">{formatCurrency(parseFloat(data?.analytics.monthlyStats.revenue || '0'))}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-500">Merchant Type</h3>
                      <p className="mt-1 text-2xl font-semibold">{data?.merchant.merchantType || 'N/A'}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h3 className="text-sm font-medium text-gray-500">Merchant Status</h3>
                      <p className="mt-1 text-2xl font-semibold text-blue-600">{convertTsysStatus(data?.merchant.merchantStatus)}</p>
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
                          <RechartsTooltip formatter={(value, name) => {
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
                <CardTitle>Key Dates</CardTitle>
                <CardDescription>
                  Important merchant milestone dates.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="w-full h-24" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Merchant Activation Date</h3>
                      <p className="mt-1 text-base font-semibold">
                        {data?.merchant.merchantActivationDate ? new Date(data.merchant.merchantActivationDate).toLocaleDateString() : 'Not available'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Date of First Deposit</h3>
                      <p className="mt-1 text-base font-semibold">
                        {data?.merchant.dateOfFirstDeposit ? new Date(data.merchant.dateOfFirstDeposit).toLocaleDateString() : 'Not available'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Date of Last Deposit</h3>
                      <p className="mt-1 text-base font-semibold">
                        {data?.merchant.dateOfLastDeposit ? new Date(data.merchant.dateOfLastDeposit).toLocaleDateString() : 'Not available'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Closed Date</h3>
                      <p className="mt-1 text-base font-semibold">
                        {data?.merchant.closeDate ? new Date(data.merchant.closeDate).toLocaleDateString() : 'Not available'}
                      </p>
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
                          <RechartsTooltip formatter={(value) => [
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