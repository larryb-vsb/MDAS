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
    { label: 'Reference Number (62-84)', value: record.referenceNumber, mono: true },
    { label: 'Transaction Date (85-92)', value: record.transactionDate ? formatTableDate(record.transactionDate.toString()) : 'N/A' },
    { label: 'Terminal ID (279-284)', value: record.terminalId, mono: true },
    { label: 'MCC Code (275-278)', value: record.mccCode, mono: true },
    { label: 'Transaction Type Identifier (335-338)', value: record.transactionTypeIdentifier, mono: true },
    { label: 'Merchant Account Number (24-39)', value: record.merchantAccountNumber, mono: true },
    { label: 'Merchant Name (218-242)', value: record.merchantName },
    { label: 'Batch Julian Date (104-108)', value: record.batchJulianDate, mono: true },
    { label: 'Cardholder Account Number (109-142)', value: record.cardholderAccountNumber, mono: true },
    { label: 'Transaction Amount (93-103)', value: formatCurrency(record.transactionAmount), highlight: true },
    { label: 'Auth Source (176-176)', value: record.authSource, mono: true },
    { label: 'Auth Amount (200-210)', value: record.authAmount ? formatCurrency(record.authAmount) : 'N/A' },
    { label: 'Authorization Number (243-250)', value: record.authorizationNumber, mono: true },
    { label: 'Card Type (251-256)', value: record.cardType, mono: true },
    { label: 'Reject Reason (251-254)', value: record.rejectReason, mono: true },
    { label: 'Cash Back Amount (312-322)', value: record.cashBackAmount ? formatCurrency(record.cashBackAmount) : 'N/A' },
    { label: 'Source Row Number', value: record.sourceRowNumber },
    { label: 'Recorded At', value: record.recordedAt ? formatTableDate(record.recordedAt.toString()) : 'N/A' },
    { label: 'Created At', value: record.createdAt ? formatTableDate(record.createdAt.toString()) : 'N/A' },
    { label: 'Updated At', value: record.updatedAt ? formatTableDate(record.updatedAt.toString()) : 'N/A' },
    { label: 'Raw Data Available', value: record.mmsRawLine ? 'Yes' : 'No' },
  ];

  const allFields = [
    // Core TDDF header fields (positions 1-23)
    { label: 'ID', value: record.id },
    { label: 'Sequence Number (1-7)', value: record.sequenceNumber, mono: true },
    { label: 'Entry Run Number (8-13)', value: record.entryRunNumber, mono: true },
    { label: 'Sequence Within Run (14-17)', value: record.sequenceWithinRun, mono: true },
    { label: 'Record Identifier (18-19)', value: record.recordIdentifier, mono: true },
    { label: 'Bank Number (20-23)', value: record.bankNumber, mono: true },
    
    // Account and merchant fields (positions 24-61)
    { label: 'Merchant Account Number (24-39)', value: record.merchantAccountNumber, mono: true },
    { label: 'Association Number 1 (40-45)', value: record.associationNumber1, mono: true },
    { label: 'Group Number (46-51)', value: record.groupNumber, mono: true },
    { label: 'Transaction Code (52-55)', value: record.transactionCode, mono: true },
    { label: 'Association Number 2 (56-61)', value: record.associationNumber2, mono: true },
    
    // Core transaction fields (positions 62-142)
    { label: 'Reference Number (62-84)', value: record.referenceNumber, mono: true },
    { label: 'Transaction Date (85-92)', value: record.transactionDate ? formatTableDate(record.transactionDate.toString()) : 'N/A' },
    { label: 'Transaction Amount (93-103)', value: formatCurrency(record.transactionAmount), highlight: true },
    { label: 'Batch Julian Date (104-108)', value: record.batchJulianDate, mono: true },
    { label: 'Net Deposit (109-109)', value: record.netDeposit ? formatCurrency(record.netDeposit) : 'N/A' },
    { label: 'Cardholder Account Number (109-142)', value: record.cardholderAccountNumber, mono: true },
    
    // Transaction details (positions 143-187)
    { label: 'Best Interchange Eligible (143-143)', value: record.bestInterchangeEligible, mono: true },
    { label: 'Transaction Data Condition Code (144-147)', value: record.transactionDataConditionCode, mono: true },
    { label: 'Downgrade Reason 1 (148-149)', value: record.downgradeReason1, mono: true },
    { label: 'Downgrade Reason 2 (150-151)', value: record.downgradeReason2, mono: true },
    { label: 'Downgrade Reason 3 (152-153)', value: record.downgradeReason3, mono: true },
    { label: 'Online Entry (154-154)', value: record.onlineEntry, mono: true },
    { label: 'ACH Flag (155-155)', value: record.achFlag, mono: true },
    { label: 'Auth Source (176-176)', value: record.authSource, mono: true },
    { label: 'Cardholder ID Method (177-177)', value: record.cardholderIdMethod, mono: true },
    { label: 'CAT Indicator (178-178)', value: record.catIndicator, mono: true },
    { label: 'Reimbursement Attribute (179-179)', value: record.reimbursementAttribute, mono: true },
    { label: 'Mail Order Telephone Indicator (180-180)', value: record.mailOrderTelephoneIndicator, mono: true },
    { label: 'Auth Char Ind (181-181)', value: record.authCharInd, mono: true },
    { label: 'Banknet Reference Number (182-187)', value: record.banknetReferenceNumber, mono: true },
    
    // Additional transaction info (positions 188-242)
    { label: 'Draft A Flag (188-188)', value: record.draftAFlag, mono: true },
    { label: 'Auth Currency Code (189-191)', value: record.authCurrencyCode, mono: true },
    { label: 'Auth Amount (200-210)', value: record.authAmount ? formatCurrency(record.authAmount) : 'N/A' },
    { label: 'Validation Code (211-214)', value: record.validationCode, mono: true },
    { label: 'Auth Response Code (215-216)', value: record.authResponseCode, mono: true },
    { label: 'Network Identifier Debit (217-217)', value: record.networkIdentifierDebit, mono: true },
    { label: 'Switch Settled Indicator (217-217)', value: record.switchSettledIndicator, mono: true },
    { label: 'POS Entry Mode (217-217)', value: record.posEntryMode, mono: true },
    { label: 'Debit Credit Indicator (217-217)', value: record.debitCreditIndicator, mono: true },
    { label: 'Reversal Flag (217-217)', value: record.reversalFlag, mono: true },
    { label: 'Merchant Name (218-242)', value: record.merchantName },
    
    // Authorization and card details (positions 243-268)
    { label: 'Authorization Number (243-250)', value: record.authorizationNumber, mono: true },
    { label: 'Reject Reason (251-254)', value: record.rejectReason, mono: true },
    { label: 'Card Type (251-256)', value: record.cardType, mono: true },
    { label: 'Currency Code (257-259)', value: record.currencyCode, mono: true },
    { label: 'Original Transaction Amount (260-268)', value: record.originalTransactionAmount ? formatCurrency(record.originalTransactionAmount) : 'N/A' },
    
    // Additional flags and codes (positions 269-284)
    { label: 'Foreign Card Indicator (269-269)', value: record.foreignCardIndicator, mono: true },
    { label: 'Carryover Indicator (270-270)', value: record.carryoverIndicator, mono: true },
    { label: 'Extension Record Indicator (271-274)', value: record.extensionRecordIndicator, mono: true },
    { label: 'MCC Code (275-278)', value: record.mccCode, mono: true },
    { label: 'Terminal ID (279-284)', value: record.terminalId, mono: true },
    
    // Extended fields (positions 285+)
    { label: 'Discover POS Entry Mode (285-287)', value: record.discoverPosEntryMode, mono: true },
    { label: 'Purchase ID (288-312)', value: record.purchaseId, mono: true },
    { label: 'Cash Back Amount (313-321)', value: record.cashBackAmount ? formatCurrency(record.cashBackAmount) : 'N/A' },
    { label: 'Cash Back Amount Sign (322-322)', value: record.cashBackAmountSign, mono: true },
    { label: 'POS Data Code (323-335)', value: record.posDataCode, mono: true },
    { label: 'Transaction Type Identifier (336-338)', value: record.transactionTypeIdentifier, mono: true },
    { label: 'Card Type Extended (339-341)', value: record.cardTypeExtended, mono: true },
    { label: 'Product ID (342-343)', value: record.productId, mono: true },
    { label: 'Submitted Interchange (344-348)', value: record.submittedInterchange, mono: true },
    { label: 'System Trace Audit Number (349-354)', value: record.systemTraceAuditNumber, mono: true },
    { label: 'Discover Transaction Type (355-356)', value: record.discoverTransactionType, mono: true },
    { label: 'Local Transaction Time (357-362)', value: record.localTransactionTime || 'N/A', mono: true, highlight: !!record.localTransactionTime },
    { label: 'Discover Processing Code (363-368)', value: record.discoverProcessingCode, mono: true },
    { label: 'Commercial Card Service Indicator (369-369)', value: record.commercialCardServiceIndicator, mono: true },
    
    // Fee and regulatory fields (positions 370+)
    { label: 'Mastercard Cross Border Fee (370-378)', value: record.mastercardCrossBorderFee ? formatCurrency(record.mastercardCrossBorderFee) : 'N/A' },
    { label: 'Card Brand Fee Code (379-379)', value: record.cardBrandFeeCode, mono: true },
    { label: 'DCC Indicator (380-380)', value: record.dccIndicator, mono: true },
    { label: 'Regulated Indicator (381-381)', value: record.regulatedIndicator, mono: true },
    { label: 'Visa Integrity Fee (382-390)', value: record.visaIntegrityFee ? formatCurrency(record.visaIntegrityFee) : 'N/A' },
    { label: 'Foreign Exchange Flag (391-391)', value: record.foreignExchangeFlag, mono: true },
    { label: 'Visa Fee Program Indicator (392-394)', value: record.visaFeeProgramIndicator, mono: true },
    { label: 'Transaction Fee Debit Credit Indicator (395-396)', value: record.transactionFeeDebitCreditIndicator, mono: true },
    { label: 'Transaction Fee Amount (397-413)', value: record.transactionFeeAmount ? formatCurrency(record.transactionFeeAmount) : 'N/A' },
    { label: 'Transaction Fee Amount Cardholder (414-424)', value: record.transactionFeeAmountCardholder ? formatCurrency(record.transactionFeeAmountCardholder) : 'N/A' },
    
    // IASF and additional fees (positions 425+)
    { label: 'IASF Fee Type (425-426)', value: record.iasfFeeType, mono: true },
    { label: 'IASF Fee Amount (427-437)', value: record.iasfFeeAmount ? formatCurrency(record.iasfFeeAmount) : 'N/A' },
    { label: 'IASF Fee Debit Credit Indicator (438-438)', value: record.iasfFeeDebitCreditIndicator, mono: true },
    { label: 'Merchant Assigned Reference Number (439-450)', value: record.merchantAssignedReferenceNumber, mono: true },
    { label: 'Net Deposit Adjustment Amount (451-465)', value: record.netDepositAdjustmentAmount ? formatCurrency(record.netDepositAdjustmentAmount) : 'N/A' },
    { label: 'Net Deposit Adjustment DC (466-466)', value: record.netDepositAdjustmentDc, mono: true },
    { label: 'MC Cash Back Fee (467-481)', value: record.mcCashBackFee, mono: true },
    { label: 'MC Cash Back Fee Sign (482-482)', value: record.mcCashBackFeeSign, mono: true },
    
    // American Express fields (positions 483-628)
    { label: 'AMEX Industry SE Number (483-492)', value: record.amexIndustrySeNumber, mono: true },
    { label: 'AMEX Merchant Seller ID (493-512)', value: record.amexMerchantSellerId, mono: true },
    { label: 'AMEX Merchant Seller Name (513-537)', value: record.amexMerchantSellerName },
    { label: 'AMEX Merchant Seller Address (538-562)', value: record.amexMerchantSellerAddress || 'N/A', highlight: !!record.amexMerchantSellerAddress },
    { label: 'AMEX Merchant Seller Phone (563-578)', value: record.amexMerchantSellerPhone, mono: true },
    { label: 'AMEX Merchant Seller Postal Code (579-588)', value: record.amexMerchantSellerPostalCode || 'N/A', mono: true, highlight: !!record.amexMerchantSellerPostalCode },
    { label: 'AMEX Merchant Seller Email (589-628)', value: record.amexMerchantSellerEmail || 'N/A', highlight: !!record.amexMerchantSellerEmail },
    
    // Advanced transaction classification (positions 629-682)
    { label: 'Mastercard Transaction Integrity Class (629-630)', value: record.mastercardTransactionIntegrityClass, mono: true },
    { label: 'Equipment Source Identification (631-633)', value: record.equipmentSourceIdentification, mono: true },
    { label: 'Operator ID (634-636)', value: record.operatorId, mono: true },
    { label: 'Requested Payment Service (637-637)', value: record.requestedPaymentService, mono: true },
    { label: 'Total Authorized Amount (638-649)', value: record.totalAuthorizedAmount ? formatCurrency(record.totalAuthorizedAmount) : 'N/A' },
    { label: 'Interchange Fee Amount (650-666)', value: record.interchangeFeeAmount ? formatCurrency(record.interchangeFeeAmount) : 'N/A' },
    { label: 'Mastercard Wallet Identifier (667-669)', value: record.mastercardWalletIdentifier, mono: true },
    { label: 'Visa Special Condition Indicator (670-670)', value: record.visaSpecialConditionIndicator, mono: true },
    { label: 'Interchange Percent Rate (671-676)', value: record.interchangePercentRate ? `${record.interchangePercentRate}%` : 'N/A' },
    { label: 'Interchange Per Item Rate (677-682)', value: record.interchangePerItemRate ? formatCurrency(record.interchangePerItemRate) : 'N/A' },
    
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
                <div className="w-40">Merchant Name</div>
                <div className="w-24">Merchant ID</div>
                <div className="w-28">Amount</div>
                <div className="w-36">Transaction Date/Time</div>
                <div className="w-32">Association Number</div>
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
                    <TruncatedRefNumber refNumber={record.referenceNumber || null} />
                  </div>
                  <div className="w-40 text-xs">
                    {record.merchantName || 'N/A'}
                  </div>
                  <div className="w-24 font-mono text-xs">
                    {record.merchantAccountNumber || '-'}
                  </div>
                  <div className="w-28 font-medium">
                    {formatCurrency(record.transactionAmount)}
                  </div>
                  <div className="w-36 text-xs">
                    {record.transactionDate ? formatTableDate(record.transactionDate.toString()) : 'N/A'}
                  </div>
                  <div className="w-32 font-mono text-xs">
                    {record.associationNumber1 || 'N/A'}
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