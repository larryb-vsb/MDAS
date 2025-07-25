import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, RotateCcw, Eye, CreditCard, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatTableDate, formatTddfDate } from "@/lib/date-utils";
import MainLayout from "@/components/layout/MainLayout";
import TddfActivityHeatMap from "@/components/tddf/TddfActivityHeatMap";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TddfBatchHeader {
  id: number;
  sequenceNumber?: string;
  entryRunNumber?: string;
  sequenceWithinRun?: string;
  recordIdentifier?: string;
  bankNumber?: string;
  merchantAccountNumber?: string;
  bhRecordNumber?: string;
  transactionCode?: string;
  batchDate?: string;
  batchJulianDate?: string;
  netDeposit?: number;
  rejectReason?: string;
  merchantReferenceNumber?: string;
  sourceFileId?: string;
  sourceRowNumber?: number;
  rawData?: string;
  recordedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

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
  cardType: string;
  vNumber: string;
  sortBy: string;
  sortOrder: string;
}

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

// BH Records Table Component
function BHRecordsTable() {
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [detailsRecord, setDetailsRecord] = useState<TddfBatchHeader | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Completely isolated BH data state (not React Query)
  const [bhData, setBhData] = useState<{
    data: TddfBatchHeader[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  } | null>(null);
  const [bhLoading, setBhLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Manual fetch function for BH data (completely isolated from React Query)
  const fetchBhData = async () => {
    try {
      setBhLoading(true);
      const response = await fetch('/api/tddf/batch-headers', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setBhData(data);
      setError(null);
      console.log('[BH ISOLATED] Data loaded successfully:', data.data?.length, 'records');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      console.error('[BH ISOLATED] Error loading data:', err);
    } finally {
      setBhLoading(false);
    }
  };

  // Load BH data only once on component mount
  useEffect(() => {
    fetchBhData();
  }, []);

  // Debug logging for BH data
  console.log('[BH DEBUG] bhData:', bhData);
  console.log('[BH DEBUG] error:', error);
  console.log('[BH DEBUG] record count:', bhData?.data?.length);
  
  // Manual refresh function for BH data
  const refreshBhData = () => {
    fetchBhData();
    console.log('[BH REFRESH] Manual refresh triggered for isolated BH state');
  };



  const deleteBhMutation = useMutation({
    mutationFn: async (recordIds: number[]) => {
      const response = await apiRequest("/api/tddf/batch-headers", {
        method: "DELETE",
        body: { recordIds }
      });
      return response;
    },
    onSuccess: (data, recordIds) => {
      fetchBhData(); // Refresh using isolated state system
      setSelectedRecords(new Set());
      toast({
        title: "Success",
        description: `Successfully deleted ${recordIds.length} BH record${recordIds.length !== 1 ? 's' : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleBulkDelete = () => {
    if (selectedRecords.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedRecords.size} BH record${selectedRecords.size !== 1 ? 's' : ''}?`)) {
      deleteBhMutation.mutate(Array.from(selectedRecords));
    }
  };

  const handleSelectRecord = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedRecords);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedRecords(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && bhData?.data) {
      setSelectedRecords(new Set(bhData.data.map(record => record.id)));
    } else {
      setSelectedRecords(new Set());
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>BH Records ({bhData?.pagination?.totalItems || 0})</CardTitle>
          <div className="space-x-2">
            {selectedRecords.size > 0 && (
              <Button 
                onClick={handleBulkDelete}
                disabled={deleteBhMutation.isPending}
                variant="destructive" 
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete ({selectedRecords.size})
              </Button>
            )}
            <Button variant="outline" size="sm">
              <Eye className="h-4 w-4 mr-2" />
              View Fields
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {bhLoading ? (
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">Loading BH records...</div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">
            Error loading BH records: {error.message}
          </div>
        ) : bhData?.data?.length === 0 || !bhData?.data ? (
          <div className="text-center py-8 text-muted-foreground">
            No BH records found
          </div>
        ) : (
          <div className="space-y-4">
            {/* Table Header - BH specific columns */}
            <div className="flex items-center space-x-4 text-sm font-medium text-muted-foreground border-b pb-2">
              <Checkbox
                checked={selectedRecords.size === bhData.data.length && bhData.data.length > 0}
                onCheckedChange={handleSelectAll}
                className="ml-4"
              />
              <div className="w-48">BH Record Number</div>
              <div className="w-32">Batch Date (64-68)</div>
              <div className="w-32">Transaction Code (56-63)</div>
              <div className="w-32">Net Deposit (69-83)</div>
              <div className="w-36">Merchant Account (24-39)</div>
              <div className="w-24">Record ID</div>
              <div className="w-20">Actions</div>
            </div>

            {/* Table Rows - BH specific data display */}
            {bhData.data.map((record: TddfBatchHeader) => (
              <div
                key={record.id}
                className="flex items-center space-x-4 text-sm py-3 border-b hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedRecords.has(record.id)}
                  onCheckedChange={(checked) => handleSelectRecord(record.id, checked as boolean)}
                  className="ml-4"
                />
                <div className="w-48 font-mono text-xs">
                  {record.bhRecordNumber ? (
                    <span 
                      title={record.bhRecordNumber}
                      className="cursor-help hover:text-blue-600 transition-colors"
                    >
                      BH_....{record.bhRecordNumber.slice(-4)}
                    </span>
                  ) : 'N/A'}
                </div>
                <div className="w-32 text-xs">
                  {record.batchDate || 'N/A'}
                </div>
                <div className="w-32 font-mono text-xs">
                  {record.transactionCode || 'N/A'}
                </div>
                <div className="w-32 font-medium text-green-600">
                  {record.netDeposit ? `$${Number(record.netDeposit).toFixed(2)}` : 'N/A'}
                </div>
                <div className="w-36 font-mono text-xs">
                  {record.merchantAccountNumber || 'N/A'}
                </div>
                <div className="w-24">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border-green-200 border">
                    {record.recordIdentifier || 'BH'}
                  </span>
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

        {/* BH Record Details Dialog */}
        <Dialog open={!!detailsRecord} onOpenChange={(open) => !open && setDetailsRecord(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>BH Record Details - ID: {detailsRecord?.id}</DialogTitle>
            </DialogHeader>
            {detailsRecord && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">BH Record Identifier</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">BH Record Number:</span> {detailsRecord.bhRecordNumber || 'N/A'}</div>
                      <div><span className="font-medium">Short BHRN:</span> {detailsRecord.bhRecordNumber ? `BH_....${detailsRecord.bhRecordNumber.slice(-4)}` : 'N/A'}</div>
                      <div><span className="font-medium">Record Identifier (18-19):</span> {detailsRecord.recordIdentifier || 'N/A'}</div>
                      <div><span className="font-medium">Record ID:</span> {detailsRecord.id}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">BH Specific Fields</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Net Deposit (69-83):</span> {detailsRecord.netDeposit ? `$${Number(detailsRecord.netDeposit).toFixed(2)}` : 'N/A'}</div>
                      <div><span className="font-medium">Transaction Code (56-63):</span> {detailsRecord.transactionCode || 'N/A'}</div>
                      <div><span className="font-medium">Batch Date (64-68):</span> {detailsRecord.batchDate || 'N/A'}</div>
                      <div><span className="font-medium">Batch Julian Date (69-73):</span> {detailsRecord.batchJulianDate || 'N/A'}</div>
                      <div><span className="font-medium">Reject Reason (84-87):</span> {detailsRecord.rejectReason || 'N/A'}</div>
                      <div><span className="font-medium">Merchant Account (24-39):</span> {detailsRecord.merchantAccountNumber || 'N/A'}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">System & Audit Fields</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Source File ID:</span> {detailsRecord.sourceFileId || 'N/A'}</div>
                      <div><span className="font-medium">Source Row Number:</span> {detailsRecord.sourceRowNumber || 'N/A'}</div>
                      <div><span className="font-medium">Recorded At:</span> {detailsRecord.recordedAt ? formatTableDate(detailsRecord.recordedAt) : 'N/A'}</div>
                      <div><span className="font-medium">Created At:</span> {detailsRecord.createdAt ? formatTableDate(detailsRecord.createdAt) : 'N/A'}</div>
                      <div><span className="font-medium">Updated At:</span> {detailsRecord.updatedAt ? formatTableDate(detailsRecord.updatedAt) : 'N/A'}</div>
                    </div>
                  </div>
                </div>
                
                {detailsRecord.rawData && (
                  <div>
                    <h4 className="font-medium mb-2">Raw TDDF Data</h4>
                    <div className="bg-gray-50 p-3 rounded text-xs font-mono overflow-x-auto">
                      {typeof detailsRecord.rawData === 'string' 
                        ? detailsRecord.rawData 
                        : JSON.stringify(detailsRecord.rawData, null, 2)
                      }
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Card type filter options
const CARD_TYPE_OPTIONS = [
  { value: "all", label: "All Card Types" },
  { value: "MC", label: "Mastercard Credit" },
  { value: "MC-D", label: "Mastercard Debit" },
  { value: "MC-B", label: "Mastercard Business" },
  { value: "VISA", label: "Visa Credit" },
  { value: "VISA-D", label: "Visa Debit" },
  { value: "VISA-B", label: "Visa Business" },
  { value: "AMEX", label: "American Express" },
  { value: "DISC", label: "Discover" },
  { value: "DEBIT", label: "Generic Debit" },
  { value: "CREDIT", label: "Generic Credit" }
];

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
function TddfRecordDetails({ record, formatCurrency, formatTddfDate }: { 
  record: TddfRecord; 
  formatCurrency: (amount?: string | number) => string;
  formatTddfDate: (date: string) => string;
}) {
  const [showDetailView, setShowDetailView] = useState(false);

  const formatValue = (value: any) => {
    if (value === undefined || value === null || value === '') return 'N/A';
    if (typeof value === 'number') return value.toString();
    return String(value);
  };

  const summaryFields = [
    { label: 'Reference Number (62-84)', value: record.referenceNumber, mono: true },
    { label: 'Transaction Date (85-92)', value: record.transactionDate ? formatTddfDate(record.transactionDate.toString()) : 'N/A' },
    { label: 'Terminal ID (277-284)', value: record.terminalId, mono: true },
    { label: 'MCC Code (273-276)', value: record.mccCode, mono: true },
    { label: 'Transaction Type Identifier (336-338)', value: record.transactionTypeIdentifier, mono: true },
    { label: 'Merchant Account Number (24-39)', value: record.merchantAccountNumber, mono: true },
    { label: 'Merchant Name (218-242)', value: record.merchantName },
    { label: 'Batch Julian Date (104-108)', value: record.batchJulianDate, mono: true },
    { label: 'Cardholder Account Number (109-142)', value: record.cardholderAccountNumber, mono: true },
    { label: 'Transaction Amount (93-103)', value: formatCurrency(record.transactionAmount), highlight: true },
    { label: 'Auth Source (176-176)', value: record.authSource, mono: true },
    { label: 'Auth Amount (192-203)', value: record.authAmount ? formatCurrency(record.authAmount) : 'N/A', highlight: true },
    { label: 'Authorization Number (243-250)', value: record.authorizationNumber, mono: true },
    { label: 'Card Type (253-254)', value: record.cardType, mono: true },
    { label: 'Reject Reason (255-258)', value: record.rejectReason, mono: true },
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
    { label: 'Transaction Date (85-92)', value: record.transactionDate ? formatTddfDate(record.transactionDate.toString()) : 'N/A' },
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
    { label: 'Auth Amount (192-203)', value: record.authAmount ? formatCurrency(record.authAmount) : 'N/A', highlight: true },
    { label: 'Validation Code (204-207)', value: record.validationCode, mono: true },
    { label: 'Auth Response Code (215-216)', value: record.authResponseCode, mono: true },
    { label: 'Network Identifier Debit (217-217)', value: record.networkIdentifierDebit, mono: true },
    { label: 'Switch Settled Indicator (217-217)', value: record.switchSettledIndicator, mono: true },
    { label: 'POS Entry Mode (217-217)', value: record.posEntryMode, mono: true },
    { label: 'Debit Credit Indicator (217-217)', value: record.debitCreditIndicator, mono: true },
    { label: 'Reversal Flag (217-217)', value: record.reversalFlag, mono: true },
    { label: 'Merchant Name (218-242)', value: record.merchantName },
    
    // Authorization and card details (positions 243-268)
    { label: 'Authorization Number (243-250)', value: record.authorizationNumber, mono: true },
    { label: 'Reject Reason (251-252)', value: record.rejectReason, mono: true },
    { label: 'Card Type (253-254)', value: record.cardType, mono: true },
    { label: 'Currency Code (257-259)', value: record.currencyCode, mono: true },
    { label: 'Original Transaction Amount (260-268)', value: record.originalTransactionAmount ? formatCurrency(record.originalTransactionAmount) : 'N/A' },
    
    // Additional flags and codes (positions 269-284)
    { label: 'Foreign Card Indicator (269-269)', value: record.foreignCardIndicator, mono: true },
    { label: 'Carryover Indicator (270-270)', value: record.carryoverIndicator, mono: true },
    { label: 'Extension Record Indicator (271-274)', value: record.extensionRecordIndicator, mono: true },
    { label: 'MCC Code (273-276)', value: record.mccCode, mono: true },
    { label: 'Terminal ID (277-284)', value: record.terminalId, mono: true },
    
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
    // Note: Local Transaction Time (357-362) field exists in TDDF spec (HHMMSS format) but is always blank in actual data
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

// Terminal ID Display Component - Shows Terminal ID with styling when V Number doesn't match
function TerminalIdDisplay({ terminalId, recordId }: { terminalId?: string; recordId?: number }) {
  const { data: terminals } = useQuery({
    queryKey: ['/api/terminals'],
    queryFn: () => fetch('/api/terminals', { credentials: 'include' }).then(res => res.json()),
  });

  if (!terminalId) {
    return (
      <span className="text-xs text-muted-foreground font-mono">
        N/A
      </span>
    );
  }

  // Find terminal by VAR mapping pattern: V8912064 → 78912064
  const terminal = terminals?.find((t: any) => {
    if (!terminalId) return false;
    // Extract numeric part from V Number and add "7" prefix for comparison
    const vNumberNumeric = t.vNumber?.replace('V', '');
    const expectedTerminalId = '7' + vNumberNumeric;
    return expectedTerminalId === terminalId;
  });

  // If terminal found and V Number matches Terminal ID
  if (terminal) {
    return (
      <Link href={`/terminals/${terminal.id}`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 p-1 text-xs font-mono text-blue-600 hover:text-blue-800 hover:bg-blue-50"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          {terminal.vNumber}
        </Button>
      </Link>
    );
  }

  // If no matching V Number found, display Terminal ID with light orange styling as link to orphan terminal
  return (
    <Link href={`/orphan-terminals/${terminalId}`}>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 p-1 text-xs font-mono text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 hover:text-orange-800"
      >
        <ExternalLink className="h-3 w-3 mr-1" />
        {terminalId}
      </Button>
    </Link>
  );
}

// Card Type Detection Function - Returns single badge per transaction using Card Type field (251-256)
function getCardTypeBadges(record: TddfRecord) {
  const isDebit = record.debitCreditIndicator === 'D';
  const cardType = record.cardType?.trim();
  
  // Priority 1: Check cardType field (positions 251-256) - most accurate identification
  if (cardType) {
    // Mastercard identification (MC, MD, MB)
    if (cardType === 'MC') {
      return [{ label: 'MC', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
    if (cardType === 'MD') {
      return [{ label: 'MC-D', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
    if (cardType === 'MB') {
      return [{ label: 'MC-B', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
    
    // Visa identification (VS, VD, VB, etc.)
    if (cardType === 'VS') {
      return [{ label: 'VISA', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    if (cardType === 'VD') {
      return [{ label: 'VISA-D', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    if (cardType === 'VB') {
      return [{ label: 'VISA-B', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    if (cardType.startsWith('V')) {
      return [{ label: 'VISA', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    
    // American Express identification (AM, AX, etc.)
    if (cardType === 'AM' || cardType.startsWith('AX')) {
      return [{ label: 'AMEX', className: 'bg-green-100 text-green-800 border-green-200' }];
    }
    
    // Discover identification (DS, DC, etc.)
    if (cardType === 'DS' || cardType.startsWith('DC')) {
      return [{ label: 'DISC', className: 'bg-purple-100 text-purple-800 border-purple-200' }];
    }
    
    // Other specific card types
    if (cardType.startsWith('MC') || cardType.startsWith('M')) {
      return [{ label: 'MC', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
  }
  
  // Priority 2: Check for AMEX data fields (fallback)
  if (record.amexMerchantSellerPostalCode) {
    return [{
      label: 'AMEX',
      className: 'bg-green-100 text-green-800 border-green-200'
    }];
  }
  
  // Priority 3: Check for Visa-specific fields
  if (record.visaIntegrityFee || record.visaFeeProgramIndicator || record.visaSpecialConditionIndicator) {
    return [{
      label: isDebit ? 'VISA-D' : 'VISA',
      className: 'bg-blue-100 text-blue-800 border-blue-200'
    }];
  }
  
  // Priority 4: Check for Mastercard-specific fields
  if (record.mastercardTransactionIntegrityClass || record.mastercardWalletIdentifier || record.mcCashBackFee) {
    return [{
      label: isDebit ? 'MC-D' : 'MC',
      className: 'bg-red-100 text-red-800 border-red-200'
    }];
  }
  
  // Priority 5: Check for Discover-specific fields
  if (record.discoverTransactionType || record.discoverProcessingCode) {
    return [{
      label: 'DISC',
      className: 'bg-purple-100 text-purple-800 border-purple-200'
    }];
  }
  
  // Priority 6: Fallback to transaction code analysis
  const transactionCode = record.transactionCode;
  
  if (transactionCode === '0330') {
    // Network-specific transaction with network identifier
    const networkId = record.networkIdentifierDebit;
    if (networkId === 'IL' || networkId === 'ME') {
      return [{
        label: 'DEBIT',
        className: 'bg-purple-100 text-purple-800 border-purple-200'
      }];
    }
  }
  
  // Priority 7: Generic fallback for standard transactions
  if (transactionCode === '0101') {
    return [{
      label: isDebit ? 'DEBIT' : 'CREDIT',
      className: 'bg-gray-100 text-gray-800 border-gray-200'
    }];
  }
  
  // Default fallback
  return [{
    label: isDebit ? 'DEBIT' : 'CREDIT',
    className: 'bg-gray-100 text-gray-800 border-gray-200'
  }];
}

export default function TddfPage() {
  const [activeTab, setActiveTab] = useState("dt");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [detailsRecord, setDetailsRecord] = useState<TddfRecord | null>(null);
  const [filters, setFilters] = useState<TddfFilters>({
    search: "",
    txnDateFrom: "",
    txnDateTo: "",
    merchantId: "",
    cardType: "all",
    vNumber: "",
    sortBy: "transactionDate",
    sortOrder: "desc",
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
        ...(filters.cardType && filters.cardType !== "all" && { cardType: filters.cardType }),
        ...(filters.vNumber && { vNumber: filters.vNumber }),
        ...(filters.sortBy && { sortBy: filters.sortBy }),
        ...(filters.sortOrder && { sortOrder: filters.sortOrder }),
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
      // Note: Intentionally not invalidating /api/tddf/batch-headers to prevent BH tab clearing
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
      cardType: "all",
      vNumber: "",
      sortBy: "transactionDate",
      sortOrder: "desc",
    });
    setCurrentPage(1);
  };

  // Date filter helpers
  const getDateString = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const setDateFilter = (type: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth') => {
    const now = new Date();
    let fromDate: Date, toDate: Date;

    switch (type) {
      case 'today':
        fromDate = new Date(now);
        toDate = new Date(now);
        break;
      
      case 'yesterday':
        fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        toDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      
      case 'thisWeek':
        // Start of current week (Monday)
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
        startOfWeek.setDate(diff);
        fromDate = startOfWeek;
        toDate = new Date(now);
        break;
      
      case 'thisMonth':
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        toDate = new Date(now);
        break;
    }

    setFilters(prev => ({
      ...prev,
      txnDateFrom: getDateString(fromDate),
      txnDateTo: getDateString(toDate)
    }));
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
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-col space-y-3 sm:flex-row sm:justify-between sm:items-center sm:space-y-0">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">TDDF Records</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Transaction Daily Detail File records from fixed-width format processing
              </p>
            </div>
            <Button onClick={() => {
              refetch(); // Only refresh DT records, not BH records
              console.log('[REFRESH] Only refreshing DT records, preserving BH cache');
            }} variant="outline" size="sm" className="shrink-0">
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh DT
            </Button>
          </div>

          {/* TDDF Activity Heat Map */}
          <div className="mb-4 sm:mb-6">
            <TddfActivityHeatMap />
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
                <div className="sm:col-span-2 md:col-span-1">
                  <label className="text-xs sm:text-sm font-medium mb-2 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Merchant, MCC, Reference..."
                      value={filters.search}
                      onChange={(e) => handleFilterChange("search", e.target.value)}
                      className="pl-10 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-2 block">Card Type</label>
                  <Select
                    value={filters.cardType}
                    onValueChange={(value) => handleFilterChange("cardType", value)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All Cards" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-2 block">From Date</label>
                  <Input
                    type="date"
                    value={filters.txnDateFrom}
                    onChange={(e) => handleFilterChange("txnDateFrom", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-2 block">To Date</label>
                  <Input
                    type="date"
                    value={filters.txnDateTo}
                    onChange={(e) => handleFilterChange("txnDateTo", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-2 block">Merchant ID</label>
                  <Input
                    placeholder="Merchant ID"
                    value={filters.merchantId}
                    onChange={(e) => handleFilterChange("merchantId", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-2 block">Terminal ID</label>
                  <Input
                    placeholder="Terminal ID or V Number"
                    value={filters.vNumber}
                    onChange={(e) => handleFilterChange("vNumber", e.target.value)}
                    className="text-sm"
                  />
                </div>
                
                {/* Sorting Controls */}
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-2 block">Sort By</label>
                  <Select
                    value={filters.sortBy}
                    onValueChange={(value) => handleFilterChange("sortBy", value)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transactionDate">Date</SelectItem>
                      <SelectItem value="terminalId">Terminal</SelectItem>
                      <SelectItem value="merchantName">Merchant</SelectItem>
                      <SelectItem value="transactionAmount">Amount</SelectItem>
                      <SelectItem value="referenceNumber">Reference</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-2 block">Order</label>
                  <Select
                    value={filters.sortOrder}
                    onValueChange={(value) => handleFilterChange("sortOrder", value)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Asc</SelectItem>
                      <SelectItem value="desc">Desc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
          </div>
          
          {/* Date Filter Buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
            <span className="text-sm font-medium text-muted-foreground mr-2 self-center">Quick Date Filters:</span>
            <Button 
              onClick={() => setDateFilter('today')} 
              variant="outline" 
              size="sm"
              className="h-8 px-3"
            >
              Today
            </Button>
            <Button 
              onClick={() => setDateFilter('yesterday')} 
              variant="outline" 
              size="sm"
              className="h-8 px-3"
            >
              Yesterday
            </Button>
            <Button 
              onClick={() => setDateFilter('thisWeek')} 
              variant="outline" 
              size="sm"
              className="h-8 px-3"
            >
              This Week
            </Button>
            <Button 
              onClick={() => setDateFilter('thisMonth')} 
              variant="outline" 
              size="sm"
              className="h-8 px-3"
            >
              This Month
            </Button>
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

      {/* Records Table with Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="dt" className="flex items-center gap-1 text-xs sm:text-sm">
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-blue-500"></span>
                <span className="hidden sm:inline">DT Records</span>
                <span className="sm:hidden">DT</span>
              </TabsTrigger>
              <TabsTrigger value="bh" className="flex items-center gap-1 text-xs sm:text-sm">
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500"></span>
                <span className="hidden sm:inline">BH Records</span>
                <span className="sm:hidden">BH</span>
              </TabsTrigger>
              <TabsTrigger value="p1" className="flex items-center gap-1 text-xs sm:text-sm">
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-orange-500"></span>
                <span className="hidden sm:inline">P1 Records</span>
                <span className="sm:hidden">P1</span>
              </TabsTrigger>
              <TabsTrigger value="other" className="flex items-center gap-1 text-xs sm:text-sm">
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-500"></span>
                <span className="hidden sm:inline">Other</span>
                <span className="sm:hidden">Oth</span>
              </TabsTrigger>
            </TabsList>

        <TabsContent value="dt" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>
                  DT Records ({totalRecords})
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
              {/* Bulk Actions */}
              {selectedRecords.size > 0 && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-sm font-medium text-blue-800">
                    {selectedRecords.size} record{selectedRecords.size !== 1 ? 's' : ''} selected
                  </span>
                  <Button
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    variant="destructive"
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                </div>
              )}

              {/* Clean Table Layout matching Terminal Transaction History */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 sm:p-3 font-medium w-8 sm:w-12">
                        <Checkbox
                          checked={selectedRecords.size === records.length && records.length > 0}
                          onCheckedChange={handleSelectAll}
                          className="w-3 h-3 sm:w-4 sm:h-4"
                        />
                      </th>
                      <th className="text-left p-2 sm:p-3 font-medium text-xs sm:text-sm">Date</th>
                      <th className="text-left p-2 sm:p-3 font-medium text-xs sm:text-sm hidden sm:table-cell">Reference</th>
                      <th className="text-left p-2 sm:p-3 font-medium text-xs sm:text-sm hidden md:table-cell">Merchant</th>
                      <th className="text-right p-2 sm:p-3 font-medium text-xs sm:text-sm">Amount</th>
                      <th className="text-left p-2 sm:p-3 font-medium text-xs sm:text-sm hidden lg:table-cell">Auth #</th>
                      <th className="text-left p-2 sm:p-3 font-medium text-xs sm:text-sm">Terminal ID</th>
                      <th className="text-left p-2 sm:p-3 font-medium text-xs sm:text-sm hidden xl:table-cell">Card Type</th>
                      <th className="text-center p-2 sm:p-3 font-medium text-xs sm:text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record: TddfRecord) => (
                      <tr key={record.id} className="border-t hover:bg-muted/25">
                        <td className="p-3">
                          <Checkbox
                            checked={selectedRecords.has(record.id)}
                            onCheckedChange={(checked) => handleSelectRecord(record.id, checked as boolean)}
                          />
                        </td>
                        <td className="p-3">
                          {record.transactionDate 
                            ? formatTddfDate(record.transactionDate.toString())
                            : 'N/A'
                          }
                        </td>
                        <td className="p-3 font-mono text-xs">
                          <TruncatedRefNumber refNumber={record.referenceNumber || null} />
                        </td>
                        <td className="p-3 max-w-32 truncate">
                          {record.merchantName || 'N/A'}
                        </td>
                        <td className="p-3 text-right font-medium">
                          ${parseFloat(record.transactionAmount?.toString() || '0').toFixed(2)}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {record.authorizationNumber || 'N/A'}
                        </td>
                        <td className="p-3">
                          <TerminalIdDisplay terminalId={record.terminalId} recordId={record.id} />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {getCardTypeBadges(record).map((badge, index) => (
                              <span 
                                key={index}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${badge.className} flex-shrink-0`}
                              >
                                <CreditCard className="h-3 w-3" />
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            onClick={() => setDetailsRecord(record)}
                            variant="ghost"
                            size="sm"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
        </TabsContent>

        <TabsContent value="bh" className="mt-6">
          <BHRecordsTable />
        </TabsContent>

        <TabsContent value="p1" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>P1 Records (Purchasing Extensions)</CardTitle>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  View Fields
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Parent DT ID</th>
                      <th className="text-left p-2">Tax Amount</th>
                      <th className="text-left p-2">Discount Amount</th>
                      <th className="text-left p-2">Freight Amount</th>
                      <th className="text-left p-2">Duty Amount</th>
                      <th className="text-left p-2">Purchase Identifier</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-center text-muted-foreground">
                      <td colSpan={6} className="py-8">
                        <p>6,130 P1 records available in raw data (776 processed + 5,354 pending)</p>
                        <p className="text-xs mt-2">Hierarchical processing needed to move from raw import to P1 table</p>
                        <p className="text-xs">API endpoint: /api/tddf/purchasing-extensions (pending implementation)</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="other" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Other Records (AD, DR, G2, etc.)</CardTitle>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  View Fields
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Record Type</th>
                      <th className="text-left p-2">Reference Number</th>
                      <th className="text-left p-2">Merchant Account</th>
                      <th className="text-left p-2">Transaction Date</th>
                      <th className="text-left p-2">Amount</th>
                      <th className="text-left p-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-center text-muted-foreground">
                      <td colSpan={6} className="py-8">
                        <p>295,000+ Other records available (G2, DR, E1, AD, etc.)</p>
                        <p className="text-xs mt-2">Raw data includes 282,883 G2 + 5,184 DR + others in raw import table</p>
                        <p className="text-xs">Hierarchical processing needed to move from raw import to Other table</p>
                        <p className="text-xs">API endpoint: /api/tddf/other-records (pending implementation)</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Details Modal */}
      <Dialog open={!!detailsRecord} onOpenChange={() => setDetailsRecord(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>TDDF Record Details</DialogTitle>
          </DialogHeader>
          {detailsRecord && <TddfRecordDetails record={detailsRecord} formatCurrency={formatCurrency} formatTddfDate={formatTddfDate} />}
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </MainLayout>
  );
}