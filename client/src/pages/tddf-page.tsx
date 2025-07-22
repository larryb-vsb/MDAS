import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, RotateCcw, Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatTableDate } from "@/lib/date-utils";
import MainLayout from "@/components/layout/MainLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TddfRecord {
  id: number;
  // Core TDDF header fields (positions 1-23)
  sequenceNumber?: string;
  entryRunNumber?: string;
  sequenceWithinRun?: string;
  recordIdentifier?: string;
  bankNumber?: string;
  
  // Account and merchant fields (positions 24-61)
  merchantAccountNumber?: string;
  associationNumber1?: string;
  groupNumber?: string;
  transactionCode?: string;
  associationNumber2?: string;
  
  // Core transaction fields (positions 62-142)
  referenceNumber?: string;
  transactionDate?: string | Date;
  transactionAmount?: string | number;
  batchJulianDate?: string;
  netDeposit?: string | number;
  cardholderAccountNumber?: string;
  
  // Transaction details (positions 143-187)
  bestInterchangeEligible?: string;
  transactionDataConditionCode?: string;
  downgradeReason1?: string;
  downgradeReason2?: string;
  downgradeReason3?: string;
  onlineEntry?: string;
  achFlag?: string;
  authSource?: string;
  cardholderIdMethod?: string;
  catIndicator?: string;
  reimbursementAttribute?: string;
  mailOrderTelephoneIndicator?: string;
  authCharInd?: string;
  banknetReferenceNumber?: string;
  
  // Additional transaction info (positions 188-242)
  draftAFlag?: string;
  authCurrencyCode?: string;
  authAmount?: string | number;
  validationCode?: string;
  authResponseCode?: string;
  networkIdentifierDebit?: string;
  switchSettledIndicator?: string;
  posEntryMode?: string;
  debitCreditIndicator?: string;
  reversalFlag?: string;
  merchantName?: string;
  
  // Authorization and card details (positions 243-268)
  authorizationNumber?: string;
  rejectReason?: string;
  cardType?: string;
  currencyCode?: string;
  originalTransactionAmount?: string | number;
  
  // Additional flags and codes (positions 269-284)
  foreignCardIndicator?: string;
  carryoverIndicator?: string;
  extensionRecordIndicator?: string;
  mccCode?: string;
  terminalId?: string;
  
  // Extended fields (positions 285+)
  discoverPosEntryMode?: string;
  purchaseId?: string;
  cashBackAmount?: string | number;
  cashBackAmountSign?: string;
  posDataCode?: string;
  transactionTypeIdentifier?: string;
  cardTypeExtended?: string;
  productId?: string;
  submittedInterchange?: string;
  systemTraceAuditNumber?: string;
  discoverTransactionType?: string;
  localTransactionTime?: string;
  discoverProcessingCode?: string;
  commercialCardServiceIndicator?: string;
  
  // Fee and regulatory fields (positions 370+)
  mastercardCrossBorderFee?: string | number;
  cardBrandFeeCode?: string;
  dccIndicator?: string;
  regulatedIndicator?: string;
  visaIntegrityFee?: string | number;
  foreignExchangeFlag?: string;
  visaFeeProgramIndicator?: string;
  transactionFeeDebitCreditIndicator?: string;
  transactionFeeAmount?: string | number;
  transactionFeeAmountCardholder?: string | number;
  
  // IASF and additional fees (positions 425+)
  iasfFeeType?: string;
  iasfFeeAmount?: string | number;
  iasfFeeDebitCreditIndicator?: string;
  merchantAssignedReferenceNumber?: string;
  netDepositAdjustmentAmount?: string | number;
  netDepositAdjustmentDc?: string;
  mcCashBackFee?: string;
  mcCashBackFeeSign?: string;
  
  // American Express fields (positions 483-628)
  amexIndustrySeNumber?: string;
  amexMerchantSellerId?: string;
  amexMerchantSellerName?: string;
  amexMerchantSellerAddress?: string;
  amexMerchantSellerPhone?: string;
  amexMerchantSellerPostalCode?: string;
  amexMerchantSellerEmail?: string;
  
  // Advanced transaction classification (positions 629-650+)
  mastercardTransactionIntegrityClass?: string;
  equipmentSourceIdentification?: string;
  operatorId?: string;
  requestedPaymentService?: string;
  totalAuthorizedAmount?: string | number;
  interchangeFeeAmount?: string | number;
  mastercardWalletIdentifier?: string;
  visaSpecialConditionIndicator?: string;
  interchangePercentRate?: string | number;
  interchangePerItemRate?: string | number;
  
  // System and audit fields
  sourceFileId?: string;
  sourceRowNumber?: number;
  recordedAt?: string | Date;
  rawData?: any;
  mmsRawLine?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface TddfFilters {
  search: string;
  txnDateFrom: string;
  txnDateTo: string;
  merchantId: string;
}

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

// Truncated Reference Number Component
function TruncatedRefNumber({ refNumber }: { refNumber: string | null }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!refNumber) return <span className="text-muted-foreground">-</span>;
  
  if (refNumber.length <= 12) {
    return <span className="font-mono text-xs">{refNumber}</span>;
  }
  
  const start = refNumber.substring(0, 4);
  const end = refNumber.substring(refNumber.length - 5);
  const truncated = `${start}.....${end}`;
  
  return (
    <div className="flex items-center gap-1">
      <span 
        className="font-mono text-xs cursor-pointer hover:text-blue-600" 
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? "Click to truncate" : "Click to expand full number"}
      >
        {isExpanded ? refNumber : truncated}
      </span>
      {refNumber.length > 12 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-500 hover:text-blue-700 text-xs"
          title={isExpanded ? "Truncate" : "Expand"}
        >
          {isExpanded ? '−' : '+'}
        </button>
      )}
    </div>
  );
}

// Comprehensive TDDF Record Details Component
function TddfRecordDetails({ record, formatCurrency, formatTableDate }: { 
  record: TddfRecord; 
  formatCurrency: (amount?: string | number) => string;
  formatTableDate: (date: string) => string;
}) {
  const [showDetailView, setShowDetailView] = useState(false);

  const formatValue = (value: any) => {
    if (value === undefined || value === null || value === '') return 'N/A';
    if (typeof value === 'number') return value.toString();
    return String(value);
  };

  const summaryFields = [
    { label: 'Transaction Code', value: record.transactionCode, mono: true },
    { label: 'Reference Number', value: record.referenceNumber, mono: true },
    { label: 'Transaction Amount', value: formatCurrency(record.transactionAmount), highlight: true },
    { label: 'Transaction Date', value: record.transactionDate ? formatTableDate(record.transactionDate.toString()) : 'N/A' },
    { label: 'Merchant Account Number', value: record.merchantAccountNumber, mono: true },
    { label: 'Merchant Name', value: record.merchantName },
    { label: 'Batch Julian Date', value: record.batchJulianDate, mono: true },
    { label: 'Cardholder Account Number', value: record.cardholderAccountNumber, mono: true },
    { label: 'Auth Response Code', value: record.authResponseCode, mono: true },
    { label: 'Validation Code', value: record.validationCode, mono: true },
    { label: 'Online Entry', value: record.onlineEntry, mono: true },
    { label: 'Auth Source', value: record.authSource, mono: true },
    { label: 'Source File ID', value: record.sourceFileId, mono: true },
    { label: 'Source Row Number', value: record.sourceRowNumber },
    { label: 'Created At', value: record.createdAt ? formatTableDate(record.createdAt.toString()) : 'N/A' },
    { label: 'Updated At', value: record.updatedAt ? formatTableDate(record.updatedAt.toString()) : 'N/A' },
  ];

  const allFields = [
    // Core TDDF header fields (positions 1-23)
    { label: 'ID', value: record.id },
    { label: 'Sequence Number', value: record.sequenceNumber, mono: true },
    { label: 'Entry Run Number', value: record.entryRunNumber, mono: true },
    { label: 'Sequence Within Run', value: record.sequenceWithinRun, mono: true },
    { label: 'Record Identifier', value: record.recordIdentifier, mono: true },
    { label: 'Bank Number', value: record.bankNumber, mono: true },
    
    // Account and merchant fields (positions 24-61)
    { label: 'Merchant Account Number', value: record.merchantAccountNumber, mono: true },
    { label: 'Association Number 1', value: record.associationNumber1, mono: true },
    { label: 'Group Number', value: record.groupNumber, mono: true },
    { label: 'Transaction Code', value: record.transactionCode, mono: true },
    { label: 'Association Number 2', value: record.associationNumber2, mono: true },
    
    // Core transaction fields (positions 62-142)
    { label: 'Reference Number', value: record.referenceNumber, mono: true },
    { label: 'Transaction Date', value: record.transactionDate ? formatTableDate(record.transactionDate.toString()) : 'N/A' },
    { label: 'Transaction Amount', value: formatCurrency(record.transactionAmount), highlight: true },
    { label: 'Batch Julian Date', value: record.batchJulianDate, mono: true },
    { label: 'Net Deposit', value: record.netDeposit ? formatCurrency(record.netDeposit) : 'N/A' },
    { label: 'Cardholder Account Number', value: record.cardholderAccountNumber, mono: true },
    
    // Transaction details (positions 143-187)
    { label: 'Best Interchange Eligible', value: record.bestInterchangeEligible, mono: true },
    { label: 'Transaction Data Condition Code', value: record.transactionDataConditionCode, mono: true },
    { label: 'Downgrade Reason 1', value: record.downgradeReason1, mono: true },
    { label: 'Downgrade Reason 2', value: record.downgradeReason2, mono: true },
    { label: 'Downgrade Reason 3', value: record.downgradeReason3, mono: true },
    { label: 'Online Entry', value: record.onlineEntry, mono: true },
    { label: 'ACH Flag', value: record.achFlag, mono: true },
    { label: 'Auth Source', value: record.authSource, mono: true },
    { label: 'Cardholder ID Method', value: record.cardholderIdMethod, mono: true },
    { label: 'CAT Indicator', value: record.catIndicator, mono: true },
    { label: 'Reimbursement Attribute', value: record.reimbursementAttribute, mono: true },
    { label: 'Mail Order Telephone Indicator', value: record.mailOrderTelephoneIndicator, mono: true },
    { label: 'Auth Char Ind', value: record.authCharInd, mono: true },
    { label: 'Banknet Reference Number', value: record.banknetReferenceNumber, mono: true },
    
    // Additional transaction info (positions 188-242)
    { label: 'Draft A Flag', value: record.draftAFlag, mono: true },
    { label: 'Auth Currency Code', value: record.authCurrencyCode, mono: true },
    { label: 'Auth Amount', value: record.authAmount ? formatCurrency(record.authAmount) : 'N/A' },
    { label: 'Validation Code', value: record.validationCode, mono: true },
    { label: 'Auth Response Code', value: record.authResponseCode, mono: true },
    { label: 'Network Identifier Debit', value: record.networkIdentifierDebit, mono: true },
    { label: 'Switch Settled Indicator', value: record.switchSettledIndicator, mono: true },
    { label: 'POS Entry Mode', value: record.posEntryMode, mono: true },
    { label: 'Debit Credit Indicator', value: record.debitCreditIndicator, mono: true },
    { label: 'Reversal Flag', value: record.reversalFlag, mono: true },
    { label: 'Merchant Name', value: record.merchantName },
    
    // Authorization and card details (positions 243-268)
    { label: 'Authorization Number', value: record.authorizationNumber, mono: true },
    { label: 'Reject Reason', value: record.rejectReason, mono: true },
    { label: 'Card Type', value: record.cardType, mono: true },
    { label: 'Currency Code', value: record.currencyCode, mono: true },
    { label: 'Original Transaction Amount', value: record.originalTransactionAmount ? formatCurrency(record.originalTransactionAmount) : 'N/A' },
    
    // Additional flags and codes (positions 269-284)
    { label: 'Foreign Card Indicator', value: record.foreignCardIndicator, mono: true },
    { label: 'Carryover Indicator', value: record.carryoverIndicator, mono: true },
    { label: 'Extension Record Indicator', value: record.extensionRecordIndicator, mono: true },
    { label: 'MCC Code', value: record.mccCode, mono: true },
    { label: 'Terminal ID', value: record.terminalId, mono: true },
    
    // Extended fields (positions 285+)
    { label: 'Discover POS Entry Mode', value: record.discoverPosEntryMode, mono: true },
    { label: 'Purchase ID', value: record.purchaseId, mono: true },
    { label: 'Cash Back Amount', value: record.cashBackAmount ? formatCurrency(record.cashBackAmount) : 'N/A' },
    { label: 'Cash Back Amount Sign', value: record.cashBackAmountSign, mono: true },
    { label: 'POS Data Code', value: record.posDataCode, mono: true },
    { label: 'Transaction Type Identifier', value: record.transactionTypeIdentifier, mono: true },
    { label: 'Card Type Extended', value: record.cardTypeExtended, mono: true },
    { label: 'Product ID', value: record.productId, mono: true },
    { label: 'Submitted Interchange', value: record.submittedInterchange, mono: true },
    { label: 'System Trace Audit Number', value: record.systemTraceAuditNumber, mono: true },
    { label: 'Discover Transaction Type', value: record.discoverTransactionType, mono: true },
    { label: 'Local Transaction Time', value: record.localTransactionTime, mono: true },
    { label: 'Discover Processing Code', value: record.discoverProcessingCode, mono: true },
    { label: 'Commercial Card Service Indicator', value: record.commercialCardServiceIndicator, mono: true },
    
    // Fee and regulatory fields (positions 370+)
    { label: 'Mastercard Cross Border Fee', value: record.mastercardCrossBorderFee ? formatCurrency(record.mastercardCrossBorderFee) : 'N/A' },
    { label: 'Card Brand Fee Code', value: record.cardBrandFeeCode, mono: true },
    { label: 'DCC Indicator', value: record.dccIndicator, mono: true },
    { label: 'Regulated Indicator', value: record.regulatedIndicator, mono: true },
    { label: 'Visa Integrity Fee', value: record.visaIntegrityFee ? formatCurrency(record.visaIntegrityFee) : 'N/A' },
    { label: 'Foreign Exchange Flag', value: record.foreignExchangeFlag, mono: true },
    { label: 'Visa Fee Program Indicator', value: record.visaFeeProgramIndicator, mono: true },
    { label: 'Transaction Fee Debit Credit Indicator', value: record.transactionFeeDebitCreditIndicator, mono: true },
    { label: 'Transaction Fee Amount', value: record.transactionFeeAmount ? formatCurrency(record.transactionFeeAmount) : 'N/A' },
    { label: 'Transaction Fee Amount Cardholder', value: record.transactionFeeAmountCardholder ? formatCurrency(record.transactionFeeAmountCardholder) : 'N/A' },
    
    // IASF and additional fees (positions 425+)
    { label: 'IASF Fee Type', value: record.iasfFeeType, mono: true },
    { label: 'IASF Fee Amount', value: record.iasfFeeAmount ? formatCurrency(record.iasfFeeAmount) : 'N/A' },
    { label: 'IASF Fee Debit Credit Indicator', value: record.iasfFeeDebitCreditIndicator, mono: true },
    { label: 'Merchant Assigned Reference Number', value: record.merchantAssignedReferenceNumber, mono: true },
    { label: 'Net Deposit Adjustment Amount', value: record.netDepositAdjustmentAmount ? formatCurrency(record.netDepositAdjustmentAmount) : 'N/A' },
    { label: 'Net Deposit Adjustment DC', value: record.netDepositAdjustmentDc, mono: true },
    { label: 'MC Cash Back Fee', value: record.mcCashBackFee, mono: true },
    { label: 'MC Cash Back Fee Sign', value: record.mcCashBackFeeSign, mono: true },
    
    // American Express fields (positions 483-628)
    { label: 'AMEX Industry SE Number', value: record.amexIndustrySeNumber, mono: true },
    { label: 'AMEX Merchant Seller ID', value: record.amexMerchantSellerId, mono: true },
    { label: 'AMEX Merchant Seller Name', value: record.amexMerchantSellerName },
    { label: 'AMEX Merchant Seller Address', value: record.amexMerchantSellerAddress },
    { label: 'AMEX Merchant Seller Phone', value: record.amexMerchantSellerPhone, mono: true },
    { label: 'AMEX Merchant Seller Postal Code', value: record.amexMerchantSellerPostalCode, mono: true },
    { label: 'AMEX Merchant Seller Email', value: record.amexMerchantSellerEmail },
    
    // Advanced transaction classification (positions 629-650+)
    { label: 'Mastercard Transaction Integrity Class', value: record.mastercardTransactionIntegrityClass, mono: true },
    { label: 'Equipment Source Identification', value: record.equipmentSourceIdentification, mono: true },
    { label: 'Operator ID', value: record.operatorId, mono: true },
    { label: 'Requested Payment Service', value: record.requestedPaymentService, mono: true },
    { label: 'Total Authorized Amount', value: record.totalAuthorizedAmount ? formatCurrency(record.totalAuthorizedAmount) : 'N/A' },
    { label: 'Interchange Fee Amount', value: record.interchangeFeeAmount ? formatCurrency(record.interchangeFeeAmount) : 'N/A' },
    { label: 'Mastercard Wallet Identifier', value: record.mastercardWalletIdentifier, mono: true },
    { label: 'Visa Special Condition Indicator', value: record.visaSpecialConditionIndicator, mono: true },
    { label: 'Interchange Percent Rate', value: record.interchangePercentRate ? `${record.interchangePercentRate}%` : 'N/A' },
    { label: 'Interchange Per Item Rate', value: record.interchangePerItemRate ? formatCurrency(record.interchangePerItemRate) : 'N/A' },
    
    // System and audit fields
    { label: 'Source File ID', value: record.sourceFileId, mono: true },
    { label: 'Source Row Number', value: record.sourceRowNumber },
    { label: 'Recorded At', value: record.recordedAt ? formatTableDate(record.recordedAt.toString()) : 'N/A' },
    { label: 'Created At', value: record.createdAt ? formatTableDate(record.createdAt.toString()) : 'N/A' },
    { label: 'Updated At', value: record.updatedAt ? formatTableDate(record.updatedAt.toString()) : 'N/A' },
    { label: 'Raw Data Available', value: record.rawData ? 'Yes' : 'No' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {showDetailView ? 'Complete TDDF Field Details' : 'Summary View'}
        </h3>
        <Button
          onClick={() => setShowDetailView(!showDetailView)}
          variant="outline"
          size="sm"
        >
          {showDetailView ? 'Show Summary' : 'Expand All Fields'}
        </Button>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {(showDetailView ? allFields : summaryFields).map((field, index) => (
          <div key={index} className="flex justify-between items-start py-2 border-b border-gray-100">
            <label className="text-sm font-medium text-muted-foreground w-1/3 flex-shrink-0">
              {field.label}
            </label>
            <div className={`text-sm w-2/3 text-right ${
              field.highlight ? 'font-bold text-lg text-green-700' : 
              field.mono ? 'font-mono' : ''
            }`}>
              {formatValue(field.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Always show raw data in summary, and also in detail view */}
      {record.mmsRawLine && (
        <div className="mt-6 space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Raw Line Data</label>
          <div className="font-mono text-xs bg-gray-100 p-3 rounded max-h-24 overflow-y-auto break-all">
            {record.mmsRawLine}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TddfPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [detailsRecord, setDetailsRecord] = useState<TddfRecord | null>(null);
  const [filters, setFilters] = useState<TddfFilters>({
    search: "",
    txnDateFrom: "",
    txnDateTo: "",
    merchantId: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch TDDF records with pagination and filters
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/tddf", currentPage, itemsPerPage, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        ...(filters.search && { search: filters.search }),
        ...(filters.txnDateFrom && { txnDateFrom: filters.txnDateFrom }),
        ...(filters.txnDateTo && { txnDateTo: filters.txnDateTo }),
        ...(filters.merchantId && { merchantId: filters.merchantId }),
      });

      const response = await fetch(`/api/tddf?${params}`, {
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error("Failed to fetch TDDF records");
      }
      return response.json();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (recordIds: number[]) => {
      const response = await fetch("/api/tddf", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recordIds })
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Deleted ${selectedRecords.size} TDDF record(s)`,
      });
      setSelectedRecords(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/tddf"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.data) {
      setSelectedRecords(new Set(data.data.map((record: TddfRecord) => record.id)));
    } else {
      setSelectedRecords(new Set());
    }
  };

  const handleSelectRecord = (recordId: number, checked: boolean) => {
    const newSelected = new Set(selectedRecords);
    if (checked) {
      newSelected.add(recordId);
    } else {
      newSelected.delete(recordId);
    }
    setSelectedRecords(newSelected);
  };

  const handleDelete = () => {
    if (selectedRecords.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedRecords.size} TDDF record(s)? This action cannot be undone.`)) {
      deleteMutation.mutate(Array.from(selectedRecords));
    }
  };

  const handleFilterChange = (key: keyof TddfFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      txnDateFrom: "",
      txnDateTo: "",
      merchantId: "",
    });
    setCurrentPage(1);
  };

  const formatCurrency = (amount?: string | number) => {
    if (amount === undefined || amount === null) return 'N/A';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  const records = data?.data || [];
  const totalRecords = data?.pagination?.totalItems || 0;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  return (
    <MainLayout>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TDDF Records</h1>
          <p className="text-muted-foreground">
            Transaction Daily Detail File records from fixed-width format processing
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RotateCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Transaction ID, Reference Number..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">From Date</label>
              <Input
                type="date"
                value={filters.txnDateFrom}
                onChange={(e) => handleFilterChange("txnDateFrom", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">To Date</label>
              <Input
                type="date"
                value={filters.txnDateTo}
                onChange={(e) => handleFilterChange("txnDateTo", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Merchant ID</label>
              <Input
                placeholder="Enter Merchant ID"
                value={filters.merchantId}
                onChange={(e) => handleFilterChange("merchantId", e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={clearFilters} variant="outline" size="sm">
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Selection Summary */}
      {selectedRecords.size > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedRecords.size} record(s) selected
              </span>
              <Button
                onClick={handleDelete}
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>
              TDDF Records ({totalRecords})
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(parseInt(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option.toString()}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="text-muted-foreground">Loading TDDF records...</div>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No TDDF records found
            </div>
          ) : (
            <div className="space-y-4">
              {/* Table Header */}
              <div className="flex items-center space-x-4 text-sm font-medium text-muted-foreground border-b pb-2">
                <Checkbox
                  checked={selectedRecords.size === records.length && records.length > 0}
                  onCheckedChange={handleSelectAll}
                  className="ml-4"
                />
                <div className="w-40">Reference Number</div>
                <div className="w-32">Transaction Code</div>
                <div className="w-24">Merchant ID</div>
                <div className="w-28">Amount</div>
                <div className="w-32">Merchant Name</div>
                <div className="w-32">Card Number</div>
                <div className="w-20">Actions</div>
              </div>

              {/* Table Rows */}
              {records.map((record: TddfRecord) => (
                <div
                  key={record.id}
                  className="flex items-center space-x-4 text-sm py-3 border-b hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedRecords.has(record.id)}
                    onCheckedChange={(checked) => handleSelectRecord(record.id, checked as boolean)}
                    className="ml-4"
                  />
                  <div className="w-40">
                    <TruncatedRefNumber refNumber={record.referenceNumber} />
                  </div>
                  <div className="w-32 font-mono text-xs">
                    {record.transactionCode || '-'}
                  </div>
                  <div className="w-24 font-mono text-xs">
                    {record.merchantAccountNumber || '-'}
                  </div>
                  <div className="w-28 font-medium">
                    {formatCurrency(record.transactionAmount)}
                  </div>
                  <div className="w-32 text-xs">
                    {record.merchantName || 'N/A'}
                  </div>
                  <div className="w-32 font-mono text-xs">
                    {record.cardholderAccountNumber || 'N/A'}
                  </div>
                  <div className="w-20">
                    <Button
                      onClick={() => setDetailsRecord(record)}
                      variant="ghost"
                      size="sm"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords} records
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={!!detailsRecord} onOpenChange={() => setDetailsRecord(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>TDDF Record Details</DialogTitle>
          </DialogHeader>
          {detailsRecord && <TddfRecordDetails record={detailsRecord} formatCurrency={formatCurrency} formatTableDate={formatTableDate} />}
        </DialogContent>
      </Dialog>
      </div>
    </MainLayout>
  );
}