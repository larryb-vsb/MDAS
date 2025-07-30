import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Database, FileJson, ArrowUpDown, RefreshCw, ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Link } from "wouter";
import MainLayout from "@/components/layout/MainLayout";
import TddfJsonActivityHeatMap from "@/components/tddf/TddfJsonActivityHeatMap";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TddfJsonRecord {
  id: number;
  upload_id: string;
  filename: string;
  record_type: string;
  line_number: number;
  raw_line: string;
  extracted_fields: {
    transactionDate?: string;
    transactionAmount?: string;
    merchantName?: string;
    merchantAccountNumber?: string;
    authorizationNumber?: string;
    cardType?: string;
    terminalId?: string;
    referenceNumber?: string;
    [key: string]: any;
  };
  record_identifier?: string;
  processing_time_ms?: number;
  created_at: string;
}

interface TddfJsonResponse {
  records: TddfJsonRecord[];
  total: number;
  totalPages: number;
}

interface TddfStatsResponse {
  totalRecords: number;
  recordTypeBreakdown: { [key: string]: number };
  uniqueFiles: number;
  totalAmount: number;
}

interface ActivityResponse {
  records: Array<{
    transaction_date: string;
    transaction_count: number;
  }>;
}

interface BatchRelationship {
  batch_id: number;
  upload_id: string;
  filename: string;
  batch_line_number: number;
  batch_fields: {
    batchId?: string;
    merchantAccountNumber?: string;
    netDeposit?: string | number;
    batchDate?: string;
    transactionCount?: number;
    totalAmount?: number;
    [key: string]: any;
  };
  batch_created_at: string;
  related_transactions: Array<{
    id: number;
    line_number: number;
    extracted_fields: {
      transactionAmount?: string;
      merchantName?: string;
      transactionDate?: string;
      cardType?: string;
      referenceNumber?: string;
      [key: string]: any;
    };
    raw_line: string;
  }>;
}

interface BatchRelationshipsResponse {
  batches: BatchRelationship[];
  total: number;
  totalPages: number;
  currentPage: number;
}



// Batch Relationships View Component
function BatchRelationshipsView() {
  const [batchPage, setBatchPage] = useState(1);
  const [batchLimit] = useState(10);

  // Format amount utility function
  const formatAmount = (amount: string | number | undefined): string => {
    if (!amount) return '-';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return '-';
    return `$${numAmount.toFixed(2)}`;
  };

  // Fetch batch relationships data
  const { data: batchData, isLoading: batchLoading } = useQuery<BatchRelationshipsResponse>({
    queryKey: ['/api/tddf-json/batch-relationships', { page: batchPage, limit: batchLimit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: batchPage.toString(),
        limit: batchLimit.toString()
      });
      return apiRequest(`/api/tddf-json/batch-relationships?${params}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Batch Relationships (BH → DT)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {batchLoading ? 'Loading...' : 
           `Showing ${batchData?.batches?.length || 0} of ${batchData?.total || 0} batch relationships`}
        </p>
        <div className="text-xs text-muted-foreground mt-2">
          Shows Batch Header (BH) records with their associated Detail Transaction (DT) records based on TDDF specification:
          <span className="font-mono ml-2">Shared Entry Run Number + Merchant Account + Sequential Positioning</span>
        </div>
      </CardHeader>
      <CardContent>
        {batchLoading ? (
          <div className="text-center py-8">Loading batch relationships...</div>
        ) : batchData?.batches?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No batch relationships found
          </div>
        ) : (
          <div className="space-y-6">
            {batchData?.batches?.map((batch) => (
              <div key={batch.batch_id} className="border rounded-lg p-4 space-y-4">
                {/* Batch Header Information */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800 border-green-300">
                        BH - Batch Header
                      </Badge>
                      <span className="text-sm font-mono text-muted-foreground">
                        Line {batch.batch_line_number}
                      </span>
                    </div>
                    <div className="text-xs text-green-700 font-mono">
                      {batch.filename}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-green-800">Entry Run #:</span>
                      <div className="font-mono bg-blue-100 px-2 py-1 rounded text-blue-800 font-semibold">
                        {batch.batch_fields?.entryRunNumber || batch.batch_fields?.batchId || '-'}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-green-800">Net Deposit:</span>
                      <div className="font-mono text-green-600 font-semibold">
                        {batch.batch_fields?.netDeposit ? 
                          formatAmount(batch.batch_fields.netDeposit) : <span className="text-gray-400 text-xs">-</span>}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-green-800">Batch Date:</span>
                      <div className="font-mono">{batch.batch_fields?.batchDate || '-'}</div>
                    </div>
                    <div>
                      <span className="font-medium text-green-800">Merchant Account:</span>
                      <div className="font-mono text-xs">{batch.batch_fields?.merchantAccountNumber || '-'}</div>
                    </div>
                  </div>
                </div>

                {/* Related DT Transactions */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                      Related DT Transactions
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      ({batch.related_transactions?.length || 0} transactions)
                    </span>
                    {/* TDDF Relationship Validation */}
                    {batch.related_transactions?.length > 0 && (
                      <div className="ml-auto flex items-center gap-2">
                        {(() => {
                          const bhAmount = parseFloat(String(batch.batch_fields?.netDeposit || '0'));
                          const dtTotal = batch.related_transactions.reduce((sum, tx) => 
                            sum + parseFloat(tx.extracted_fields?.transactionAmount || '0'), 0
                          );
                          const isMatch = Math.abs(bhAmount - dtTotal) < 0.01;
                          
                          return (
                            <div className="flex items-center gap-1">
                              <Badge className={isMatch 
                                ? "bg-green-100 text-green-800 border-green-300" 
                                : "bg-amber-100 text-amber-800 border-amber-300"
                              }>
                                {isMatch ? "✓ Amount Match" : "⚠ Amount Variance"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                DT Total: ${dtTotal.toFixed(2)}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  
                  {batch.related_transactions?.length > 0 ? (
                    <div className="space-y-2">
                      {batch.related_transactions.slice(0, 5).map((transaction, index) => {
                        // Check TDDF compliance indicators
                        const hasMatchingRunNumber = transaction.extracted_fields?.entryRunNumber === batch.batch_fields?.entryRunNumber;
                        const hasMatchingMerchant = transaction.extracted_fields?.merchantAccountNumber === batch.batch_fields?.merchantAccountNumber;
                        const complianceStrength = (hasMatchingRunNumber ? 1 : 0) + (hasMatchingMerchant ? 1 : 0);
                        
                        return (
                          <div key={transaction.id} className="bg-blue-50 border border-blue-200 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-blue-100 text-blue-800 text-xs">
                                  DT #{index + 1}
                                </Badge>
                                <Badge className={
                                  complianceStrength === 2 ? "bg-green-100 text-green-800 border-green-300" :
                                  complianceStrength === 1 ? "bg-amber-100 text-amber-800 border-amber-300" :
                                  "bg-red-100 text-red-800 border-red-300"
                                }>
                                  {complianceStrength === 2 ? "✓ Full Match" :
                                   complianceStrength === 1 ? "⚠ Partial" : "✗ Weak"}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground font-mono">
                                Line {transaction.line_number}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div>
                                <span className="font-medium text-blue-800">Amount:</span>
                                <div className="font-mono font-semibold">
                                  {transaction.extracted_fields?.transactionAmount ? 
                                    `$${transaction.extracted_fields.transactionAmount}` : '-'}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-blue-800">Date:</span>
                                <div className="font-mono">{transaction.extracted_fields?.transactionDate || '-'}</div>
                              </div>
                              <div>
                                <span className="font-medium text-blue-800">Card:</span>
                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const cardType = transaction.extracted_fields?.cardType;
                                    if (!cardType || cardType === 'N/A') return <span className="text-gray-400 text-xs">-</span>;
                                    
                                    const getCardBadgeStyle = (type: string) => {
                                      const upperType = type.toUpperCase();
                                      if (upperType.includes('VISA') || upperType === 'VI') {
                                        return 'bg-blue-100 text-blue-800 border-blue-300';
                                      } else if (upperType.includes('MC') || upperType === 'MC') {
                                        return 'bg-red-100 text-red-800 border-red-300';
                                      } else if (upperType.includes('AMEX') || upperType === 'AX') {
                                        return 'bg-green-100 text-green-800 border-green-300';
                                      } else if (upperType.includes('DISC') || upperType === 'DI') {
                                        return 'bg-purple-100 text-purple-800 border-purple-300';
                                      } else {
                                        return 'bg-gray-100 text-gray-800 border-gray-300';
                                      }
                                    };
                                    
                                    return (
                                      <Badge className={`text-xs px-2 py-1 ${getCardBadgeStyle(cardType)}`}>
                                        {cardType}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-blue-800">Reference:</span>
                                <div className="font-mono text-[10px]">{transaction.extracted_fields?.referenceNumber || '-'}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {batch.related_transactions.length > 5 && (
                        <div className="text-center text-sm text-muted-foreground py-2">
                          ... and {batch.related_transactions.length - 5} more transactions
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No related DT transactions found for this batch
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {batchData && batchData.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Page {batchData.currentPage} of {batchData.totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={batchPage <= 1}
                    onClick={() => setBatchPage(batchPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={batchPage >= batchData.totalPages}
                    onClick={() => setBatchPage(batchPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Terminal ID Display Component (matches TDDF Records page functionality)
function TerminalIdDisplay({ terminalId }: { terminalId?: string }) {
  const { data: terminals } = useQuery({
    queryKey: ['/api/terminals'],
    queryFn: () => fetch('/api/terminals', { credentials: 'include' }).then(res => res.json()),
  });

  if (!terminalId) {
    return (
      <span className="text-xs text-gray-400">
        -
      </span>
    );
  }

  // Find terminal by VAR mapping pattern: V8912064 → 78912064
  const terminal = terminals?.find((t: any) => {
    if (!terminalId) return false;
    // Extract numeric part from V Number and add "7" prefix for comparison
    const vNumberNumeric = t.v_number?.replace('V', '');
    const expectedTerminalId = '7' + vNumberNumeric;
    return expectedTerminalId === terminalId;
  });

  // If terminal found and V Number matches Terminal ID
  if (terminal) {
    return (
      <Link href={`/terminals/${terminal.id}?referrer=tddf-json`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 p-1 text-xs font-mono text-blue-600 hover:text-blue-800 hover:bg-blue-50"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          {terminal.v_number}
        </Button>
      </Link>
    );
  }

  // If no matching V Number found - convert Terminal ID to V Number and link to orphan terminal
  let displayValue = terminalId;
  if (terminalId.startsWith('7') && terminalId.length >= 8) {
    displayValue = 'V' + terminalId.substring(1);
  }

  return (
    <Link href={`/orphan-terminals/${terminalId}?referrer=tddf-json`}>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 p-1 text-xs font-mono text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 hover:text-orange-800"
      >
        <ExternalLink className="h-3 w-3 mr-1" />
        {displayValue}
      </Button>
    </Link>
  );
}

// P1 Badge Component
function P1Badge({ dtRecordId, checkForP1Extension }: { dtRecordId: number, checkForP1Extension: (id: number) => Promise<any> }) {
  const [hasP1, setHasP1] = useState<boolean | null>(null);

  useEffect(() => {
    const checkP1 = async () => {
      const p1Record = await checkForP1Extension(dtRecordId);
      setHasP1(!!p1Record);
    };
    checkP1();
  }, [dtRecordId, checkForP1Extension]);

  if (hasP1 === null) return null;
  if (!hasP1) return null;

  return (
    <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">
      P1
    </Badge>
  );
}

// Value truncation component with hover tooltip
function TruncatedValue({ value, maxLength = 20 }: { value: string | undefined | null, maxLength?: number }) {
  // Hide N/A, null, undefined, empty values
  if (!value || value === 'undefined' || value === 'null' || value === 'N/A' || value.trim() === '') {
    return <span className="text-gray-400 text-xs">-</span>;
  }
  
  if (value.length <= maxLength) {
    return <span className="font-mono text-xs">{value}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-xs cursor-help border-b border-dotted border-gray-400">
            {value.substring(0, maxLength)}...
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-md break-all">
          <p className="font-mono text-xs">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface TddfJsonStats {
  totalRecords: number;
  recordTypeBreakdown: {
    [key: string]: number;
  };
  uniqueFiles: number;
  totalAmount?: number;
}

const RECORD_TYPE_COLORS = {
  'DT': 'bg-blue-500/10 text-blue-700 border-blue-200',
  'BH': 'bg-green-500/10 text-green-700 border-green-200', 
  'P1': 'bg-orange-500/10 text-orange-700 border-orange-200',
  'P2': 'bg-orange-500/10 text-orange-700 border-orange-200',
  'E1': 'bg-gray-500/10 text-gray-700 border-gray-200',
  'G2': 'bg-gray-500/10 text-gray-700 border-gray-200',
  'AD': 'bg-gray-500/10 text-gray-700 border-gray-200',
  'DR': 'bg-gray-500/10 text-gray-700 border-gray-200',
  'CK': 'bg-gray-500/10 text-gray-700 border-gray-200',
  'LG': 'bg-gray-500/10 text-gray-700 border-gray-200',
  'GE': 'bg-gray-500/10 text-gray-700 border-gray-200',
};

const RECORD_TYPE_NAMES = {
  'DT': 'Transaction Details',
  'BH': 'Batch Headers',
  'P1': 'Purchasing Card 1',
  'P2': 'Purchasing Card 2',
  'E1': 'Electronic Check',
  'G2': 'General Data 2',
  'AD': 'Adjustment',
  'DR': 'Direct Marketing',
  'CK': 'Check',
  'LG': 'Lodge',
  'GE': 'General Extension',
};

export default function TddfJsonPage() {
  const [selectedTab, setSelectedTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecords, setSelectedRecords] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedRecord, setSelectedRecord] = useState<TddfJsonRecord | null>(null);
  const [associatedP1Record, setAssociatedP1Record] = useState<any | null>(null);
  const [loadingP1, setLoadingP1] = useState(false);
  const [p1Records, setP1Records] = useState<Map<number, any>>(new Map());
  const [activeTab, setActiveTab] = useState<'dt' | 'p1'>('dt');
  const [dateFilter, setDateFilter] = useState<string>('');


  const { toast } = useToast();

  // Fetch TDDF JSON statistics with caching optimization
  const { data: stats, isLoading: statsLoading } = useQuery<TddfStatsResponse>({
    queryKey: ['/api/tddf-json/stats'],
    queryFn: () => apiRequest('/api/tddf-json/stats'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to reduce load
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Fetch TDDF JSON records with filtering and pagination (staggered after stats)
  const { data: recordsData, isLoading: recordsLoading, refetch } = useQuery<TddfJsonResponse>({
    queryKey: ['/api/tddf-json/records', {
      page: currentPage,
      limit: pageSize,
      recordType: selectedTab === 'all' ? undefined : selectedTab,
      search: searchTerm || undefined,
      sortBy,
      sortOrder,
      dateFilter: dateFilter || undefined
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        sortBy,
        sortOrder
      });
      
      if (selectedTab !== 'all') params.append('recordType', selectedTab);
      if (searchTerm) params.append('search', searchTerm);
      if (dateFilter) params.append('dateFilter', dateFilter);
      
      return apiRequest(`/api/tddf-json/records?${params}`);
    },
    enabled: !!stats, // Only load after stats are loaded to stagger API calls
  });

  // Fetch performance statistics for large dataset recommendations
  const { data: performanceStats } = useQuery<any>({
    queryKey: ['/api/tddf-json/performance-stats'],
    queryFn: () => apiRequest('/api/tddf-json/performance-stats'),
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes - performance stats change slowly
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    enabled: !!stats, // Only load after basic stats are loaded
  });

  const handleRecordClick = async (record: TddfJsonRecord) => {
    setSelectedRecord(record);
    setAssociatedP1Record(null);
    setLoadingP1(false);
    
    // Set default tab based on record type
    setActiveTab(record.record_type === 'P1' ? 'p1' : 'dt');
    
    // If this is a DT record, look for associated P1 record
    if (record.record_type === 'DT') {
      setLoadingP1(true);
      try {
        const response = await fetch(`/api/tddf-json/records/${record.id}/p1`);
        const data = await response.json();
        setAssociatedP1Record(data.p1Record);
      } catch (error) {
        console.error('Error fetching P1 record:', error);
      } finally {
        setLoadingP1(false);
      }
    }
  };

  // Function to check if a DT record has P1 extension
  const checkForP1Extension = async (dtRecordId: number) => {
    if (p1Records.has(dtRecordId)) {
      return p1Records.get(dtRecordId);
    }
    
    try {
      const response = await fetch(`/api/tddf-json/records/${dtRecordId}/p1`);
      const data = await response.json();
      const p1Record = data.p1Record;
      
      // Cache the result (even if null)
      setP1Records(prev => new Map(prev.set(dtRecordId, p1Record)));
      return p1Record;
    } catch (error) {
      console.error('Error checking P1 record:', error);
      return null;
    }
  };

  const handleDateSelect = (date: string) => {
    console.log('Selected date for filtering:', date);
    setDateFilter(date);
    setCurrentPage(1);
  };

  const clearDateFilter = () => {
    setDateFilter('');
    setCurrentPage(1);
  };

  const handleHeaderSort = (field: string) => {
    if (sortBy === field) {
      // If clicking the same field, toggle sort order
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a different field, set it as sort field with ascending order
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };



  const formatAmount = (amount: string | number | undefined): string => {
    if (!amount) return '-';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return '-';
    return `$${numAmount.toFixed(2)}`;
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy');
    } catch {
      return dateStr;
    }
  };

  // Function to get merchant name from DT records based on merchant account number
  const getMerchantNameFromDT = (merchantAccountNumber: string) => {
    if (!merchantAccountNumber || !recordsData?.records) return null;
    
    // Find a DT record with matching merchant account number that has merchant name
    const dtRecord = recordsData.records.find(r => 
      r.record_type === 'DT' && 
      r.extracted_fields?.merchantAccountNumber === merchantAccountNumber &&
      r.extracted_fields?.merchantName &&
      r.extracted_fields?.merchantName !== '-'
    );
    
    return dtRecord?.extracted_fields?.merchantName || null;
  };

  const getRecordTypeBadgeClass = (recordType: string): string => {
    return RECORD_TYPE_COLORS[recordType as keyof typeof RECORD_TYPE_COLORS] || 
           'bg-gray-500/10 text-gray-700 border-gray-200';
  };

  // Card type badge function to match DT page styling
  const getCardTypeBadge = (cardType: string) => {
    if (!cardType || cardType === 'null' || cardType === 'undefined') return null;
    
    // Clean up double-quoted JSON strings and normalize
    let cleanCardType = cardType;
    if (typeof cardType === 'string') {
      cleanCardType = cardType.replace(/^"+|"+$/g, '').trim().toUpperCase();
    }
    
    const badges: Record<string, { label: string; className: string }> = {
      'AM': { label: 'AMEX', className: 'bg-green-50 text-green-700 border-green-200' },
      'AX': { label: 'AMEX', className: 'bg-green-50 text-green-700 border-green-200' },
      'VS': { label: 'VISA', className: 'bg-blue-50 text-blue-700 border-blue-200' },
      'VD': { label: 'VISA-D', className: 'bg-blue-50 text-blue-700 border-blue-200' },
      'VB': { label: 'VISA-B', className: 'bg-blue-50 text-blue-700 border-blue-200' },
      'MC': { label: 'MC', className: 'bg-red-50 text-red-700 border-red-200' },
      'MD': { label: 'MC-D', className: 'bg-red-50 text-red-700 border-red-200' },
      'MB': { label: 'MC-B', className: 'bg-red-50 text-red-700 border-red-200' },
      'DS': { label: 'DISC', className: 'bg-purple-50 text-purple-700 border-purple-200' },
      'DJ': { label: 'DISC', className: 'bg-purple-50 text-purple-700 border-purple-200' },
      'DZ': { label: 'DISC', className: 'bg-purple-50 text-purple-700 border-purple-200' },
      'DI': { label: 'DINERS', className: 'bg-gray-50 text-gray-700 border-gray-200' },
      'JC': { label: 'JCB', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    };
    
    return badges[cleanCardType] || { label: cleanCardType, className: 'bg-gray-50 text-gray-700 border-gray-200' };
  };

  const recordTypeOptions = stats?.recordTypeBreakdown ? 
    Object.keys(stats.recordTypeBreakdown).sort() : [];

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">TDDF JSON Records</h1>
            <p className="text-muted-foreground">
              View and analyze TDDF records from JSON-encoded MMS Uploader files
            </p>
          </div>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Data
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? '...' : stats?.totalRecords?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                From {stats?.uniqueFiles || 0} files
              </p>
            </CardContent>
          </Card>
          
          {recordTypeOptions.slice(0, 3).map((recordType) => (
            <Card key={recordType}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {RECORD_TYPE_NAMES[recordType as keyof typeof RECORD_TYPE_NAMES] || recordType}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats?.recordTypeBreakdown[recordType]?.toLocaleString() || '0'}
                </div>
                <Badge className={getRecordTypeBadgeClass(recordType)}>
                  {recordType}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>



        {/* TDDF JSON Activity Heat Map - Custom for JSON Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              TDDF JSON Activity Heat Map
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Daily transaction activity from TDDF JSON records (dev_tddf_jsonb table)
            </p>
          </CardHeader>
          <CardContent>
            <TddfJsonActivityHeatMap 
              onDateSelect={handleDateSelect}
              selectedDate={dateFilter}
            />
            {dateFilter && (
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="secondary">
                  Filtered by: {formatDate(dateFilter)}
                </Badge>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearDateFilter}
                  className="text-xs"
                >
                  Clear Filter
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search records..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Creation Date</SelectItem>
                    <SelectItem value="record_type">Record Type</SelectItem>
                    <SelectItem value="upload_id">File ID</SelectItem>
                    <SelectItem value="transaction_date">Transaction Date</SelectItem>
                    <SelectItem value="transaction_amount">Amount</SelectItem>
                    <SelectItem value="merchant_name">Merchant Name</SelectItem>
                    <SelectItem value="terminal_id">Terminal ID</SelectItem>
                    <SelectItem value="card_type">Card Type</SelectItem>
                    <SelectItem value="line_number">Line Number</SelectItem>
                    <SelectItem value="reference_number">Reference Number</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Record Type Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="all">All Records</TabsTrigger>
            <TabsTrigger value="DT">DT - Transactions</TabsTrigger>
            <TabsTrigger value="BH">BH - Batch Headers</TabsTrigger>
            <TabsTrigger value="batch">Batch Relationships</TabsTrigger>
            <TabsTrigger value="P1">P1 - Purchasing</TabsTrigger>
            <TabsTrigger value="P2">P2 - Purchasing 2</TabsTrigger>
            <TabsTrigger value="other">Other Types</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-6">
            {selectedTab === 'batch' ? (
              <BatchRelationshipsView />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileJson className="w-5 h-5" />
                    {selectedTab === 'all' ? 'All TDDF JSON Records' : 
                     selectedTab === 'other' ? 'Other Record Types' :
                     `${selectedTab} Records`}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {recordsLoading ? 'Loading...' : 
                     `Showing ${recordsData?.records?.length || 0} of ${recordsData?.total || 0} records`}
                  </p>
                </CardHeader>
                <CardContent>
                {recordsLoading ? (
                  <div className="text-center py-8">Loading records...</div>
                ) : recordsData?.records?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No records found matching your criteria
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Records Table */}
                    <div className="border rounded-lg overflow-hidden">
                      {/* BH Records - Show authentic TDDF header fields */}
                      {selectedTab === 'BH' ? (
                        <div className="bg-muted/50 px-4 py-2 grid grid-cols-6 gap-4 text-sm font-medium">
                          {[
                            { key: 'sequence_number_area', label: 'Seq A #', tooltip: 'Sequence Number Area (1-7): File-level sequence ID' },
                            { key: 'entry_run_number', label: 'Run #', tooltip: 'Entry Run Number (8-13): Batch ID' },
                            { key: 'sequence_within_run', label: 'Seq R#', tooltip: 'Sequence within Run (14-17): Unique within batch' },
                            { key: 'record_identifier', label: 'Type', tooltip: 'Record Identifier (18-19): BH for Batch Header' },
                            { key: 'net_deposit', label: 'Net Deposit', tooltip: 'Net Deposit (69-83): Batch total amount' }
                          ].map(({ key, label, tooltip }) => (
                            <TooltipProvider key={key}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button 
                                    className={`text-left hover:bg-muted/80 p-1 rounded flex items-center gap-1 transition-colors ${
                                      sortBy === key ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''
                                    }`}
                                    onClick={() => handleHeaderSort(key)}
                                  >
                                    {label}
                                    {sortBy === key ? (
                                      sortOrder === 'asc' ? (
                                        <ChevronUp className="w-3 h-3 text-blue-600" />
                                      ) : (
                                        <ChevronDown className="w-3 h-3 text-blue-600" />
                                      )
                                    ) : (
                                      <ArrowUpDown className="w-3 h-3 opacity-50" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                          <div>Actions</div>
                        </div>
                      ) : selectedTab === 'DT' ? (
                        /* DT Records - Show TDDF header fields plus original DT fields */
                        <div className="bg-muted/50 px-4 py-2 grid grid-cols-10 gap-4 text-sm font-medium">
                          {[
                            { key: 'sequence_number_area', label: 'Seq A #', tooltip: 'Sequence Number Area (1-7): File-level sequence ID' },
                            { key: 'entry_run_number', label: 'Run #', tooltip: 'Entry Run Number (8-13): Batch ID' },
                            { key: 'sequence_within_run', label: 'Seq R#', tooltip: 'Sequence within Run (14-17): Unique within batch' },
                            { key: 'record_identifier', label: 'Type', tooltip: 'Record Identifier (18-19): DT for Detail Transaction' },
                            { key: 'transaction_date', label: 'Transaction Date' },
                            { key: 'transaction_amount', label: 'Amount' },
                            { key: 'merchant_name', label: 'Merchant' },
                            { key: 'terminal_id', label: 'Terminal' },
                            { key: 'card_type', label: 'Card Type' }
                          ].map(({ key, label, tooltip }) => (
                            tooltip ? (
                              <TooltipProvider key={key}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button 
                                      className={`text-left hover:bg-muted/80 p-1 rounded flex items-center gap-1 transition-colors ${
                                        sortBy === key ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''
                                      }`}
                                      onClick={() => handleHeaderSort(key)}
                                    >
                                      {label}
                                      {sortBy === key ? (
                                        sortOrder === 'asc' ? (
                                          <ChevronUp className="w-3 h-3 text-blue-600" />
                                        ) : (
                                          <ChevronDown className="w-3 h-3 text-blue-600" />
                                        )
                                      ) : (
                                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{tooltip}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <button 
                                key={key}
                                className={`text-left hover:bg-muted/80 p-1 rounded flex items-center gap-1 transition-colors ${
                                  sortBy === key ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''
                                }`}
                                onClick={() => handleHeaderSort(key)}
                              >
                                {label}
                                {sortBy === key ? (
                                  sortOrder === 'asc' ? (
                                    <ChevronUp className="w-3 h-3 text-blue-600" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3 text-blue-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                                )}
                              </button>
                            )
                          ))}
                          <div>Actions</div>
                        </div>
                      ) : selectedTab === 'P1' ? (
                        /* P1 Records - Show TDDF header fields matching specification */
                        <div className="bg-muted/50 px-4 py-2 grid grid-cols-6 gap-4 text-sm font-medium">
                          {[
                            { key: 'sequence_number', label: 'Seq A #', tooltip: 'Sequence Number Area (1-7): File-level sequence ID' },
                            { key: 'entry_run_number', label: 'Run #', tooltip: 'Entry Run Number (8-13): Batch ID' },
                            { key: 'sequence_within_run', label: 'Seq R#', tooltip: 'Sequence within Run (14-17): Unique within batch' },
                            { key: 'record_identifier', label: 'Type', tooltip: 'Record Identifier (18-19): P1 for Purchasing Card Extension' },
                            { key: 'merchant_account_number', label: 'Merchant Account Number', tooltip: 'Merchant Account Number (24-39): 16-digit account number' }
                          ].map(({ key, label, tooltip }) => (
                            <TooltipProvider key={key}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button 
                                    className={`text-left hover:bg-muted/80 p-1 rounded flex items-center gap-1 transition-colors ${
                                      sortBy === key ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''
                                    }`}
                                    onClick={() => handleHeaderSort(key)}
                                  >
                                    {label}
                                    {sortBy === key ? (
                                      sortOrder === 'asc' ? (
                                        <ChevronUp className="w-3 h-3 text-blue-600" />
                                      ) : (
                                        <ChevronDown className="w-3 h-3 text-blue-600" />
                                      )
                                    ) : (
                                      <ArrowUpDown className="w-3 h-3 opacity-50" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                          <div>Actions</div>
                        </div>
                      ) : (
                        /* All other record types - Show normalized common headers */
                        <div className="bg-muted/50 px-4 py-2 grid grid-cols-8 gap-4 text-sm font-medium">
                          {[
                            { key: 'record_type', label: 'Type', tooltip: 'TDDF Record Type (18-19)' },
                            { key: 'merchant_account_number', label: 'Merchant Account', tooltip: 'Merchant Account Number (24-39)' },
                            { key: 'transaction_date', label: 'Date', tooltip: 'Transaction Date' },
                            { key: 'transaction_amount', label: 'Amount', tooltip: 'Transaction Amount' },
                            { key: 'merchant_name', label: 'Merchant Name', tooltip: 'Merchant Business Name' },
                            { key: 'terminal_id', label: 'Terminal', tooltip: 'Terminal ID' },
                            { key: 'card_type', label: 'Card Type', tooltip: 'Card Brand Type (253-254) AN 2' }
                          ].map(({ key, label, tooltip }) => (
                            tooltip ? (
                              <TooltipProvider key={key}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button 
                                      className={`text-left hover:bg-muted/80 p-1 rounded flex items-center gap-1 transition-colors ${
                                        sortBy === key ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''
                                      }`}
                                      onClick={() => handleHeaderSort(key)}
                                    >
                                      {label}
                                      {sortBy === key ? (
                                        sortOrder === 'asc' ? (
                                          <ChevronUp className="w-3 h-3 text-blue-600" />
                                        ) : (
                                          <ChevronDown className="w-3 h-3 text-blue-600" />
                                        )
                                      ) : (
                                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{tooltip}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <button 
                                key={key}
                                className={`text-left hover:bg-muted/80 p-1 rounded flex items-center gap-1 transition-colors ${
                                  sortBy === key ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''
                                }`}
                                onClick={() => handleHeaderSort(key)}
                              >
                                {label}
                                {sortBy === key ? (
                                  sortOrder === 'asc' ? (
                                    <ChevronUp className="w-3 h-3 text-blue-600" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3 text-blue-600" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                                )}
                              </button>
                            )
                          ))}
                          <div>Actions</div>
                        </div>
                      )}
                      {recordsData?.records?.map((record: TddfJsonRecord) => (
                        selectedTab === 'BH' ? (
                          /* BH Records - Show authentic TDDF header fields plus Net Deposit */
                          <div key={record.id} className="px-4 py-3 grid grid-cols-6 gap-4 border-t items-center text-sm">
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.sequenceNumberArea || record.extracted_fields?.sequenceNumber || '-'}
                            </div>
                            <div className="font-mono text-xs font-medium text-blue-600">
                              {record.extracted_fields?.entryRunNumber || '-'}
                            </div>
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.sequenceWithinRun || '-'}
                            </div>
                            <div className="font-mono text-xs">
                              <Badge className="bg-green-100 text-green-800 border-green-300">
                                {record.extracted_fields?.recordIdentifier || '-'}
                              </Badge>
                            </div>
                            <div className="font-medium text-green-600">
                              {record.extracted_fields?.netDeposit ? 
                                formatAmount(record.extracted_fields.netDeposit) : <span className="text-gray-400 text-xs">-</span>}
                            </div>
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRecordClick(record)}
                                className="flex items-center gap-1"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </Button>
                            </div>
                          </div>
                        ) : selectedTab === 'DT' ? (
                          /* DT Records - Show TDDF header fields plus original DT fields */
                          <div key={record.id} className="px-4 py-3 grid grid-cols-10 gap-4 border-t items-center text-sm">
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.sequenceNumberArea || record.extracted_fields?.sequenceNumber || '-'}
                            </div>
                            <div className="font-mono text-xs font-medium text-blue-600">
                              {record.extracted_fields?.entryRunNumber || '-'}
                            </div>
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.sequenceWithinRun || '-'}
                            </div>
                            <div className="font-mono text-xs">
                              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                {record.extracted_fields?.recordIdentifier || '-'}
                              </Badge>
                            </div>
                            <div>
                              {formatDate(record.extracted_fields?.transactionDate)}
                            </div>
                            <div className="font-mono text-green-600">
                              {formatAmount(record.extracted_fields?.transactionAmount)}
                            </div>
                            <div className="truncate">

                              {getMerchantNameFromDT(record.extracted_fields?.merchantAccountNumber) || record.extracted_fields?.merchantName || '-'}

                            </div>
                            <div>
                              <TerminalIdDisplay terminalId={record.extracted_fields?.terminalId} />
                            </div>
                            <div>
                              {record.extracted_fields?.cardType ? (
                                <div className="flex flex-col">
                                  {(() => {
                                    const cardBadge = getCardTypeBadge(record.extracted_fields.cardType as string);
                                    return cardBadge ? (
                                      <Badge variant="outline" className={`text-xs ${cardBadge.className}`}>
                                        {cardBadge.label}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">
                                        {record.extracted_fields.cardType}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                              ) : <span className="text-gray-400 text-xs">-</span>}
                            </div>
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRecordClick(record)}
                                className="flex items-center gap-1"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </Button>
                            </div>
                          </div>
                        ) : selectedTab === 'P1' ? (
                          /* P1 Records - Show TDDF header fields matching specification */
                          <div key={record.id} className="px-4 py-3 grid grid-cols-6 gap-4 border-t items-center text-sm">
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.sequenceNumber || '-'}
                            </div>
                            <div className="font-mono text-xs font-medium text-blue-600">
                              {record.extracted_fields?.entryRunNumber || '-'}
                            </div>
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.sequenceWithinRun || '-'}
                            </div>
                            <div className="font-mono text-xs">
                              <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                                {record.extracted_fields?.recordIdentifier || '-'}
                              </Badge>
                            </div>
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.merchantAccountNumber || '-'}
                            </div>
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRecordClick(record)}
                                className="flex items-center gap-1"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* All other record types - Show normalized common data */
                          <div key={record.id} className="px-4 py-3 grid grid-cols-8 gap-4 border-t items-center text-sm">
                            <div className="flex items-center gap-1">
                              <Badge className={getRecordTypeBadgeClass(record.record_type)}>
                                {record.record_type}
                              </Badge>
                              {record.record_type === 'DT' && (
                                <P1Badge dtRecordId={record.id} checkForP1Extension={checkForP1Extension} />
                              )}
                            </div>
                            <div className="font-mono text-xs">
                              {record.extracted_fields?.merchantAccountNumber || '-'}
                            </div>
                            <div>
                              {formatDate(record.extracted_fields?.transactionDate)}
                            </div>
                            <div className="font-mono">
                              {formatAmount(record.extracted_fields?.transactionAmount)}
                            </div>
                            <div className="truncate">

                              {getMerchantNameFromDT(record.extracted_fields?.merchantAccountNumber) || record.extracted_fields?.merchantName || '-'}

                            </div>
                            <div>
                              <TerminalIdDisplay terminalId={record.extracted_fields?.terminalId} />
                            </div>
                            <div>
                              {record.extracted_fields?.cardType ? (
                                <div className="flex flex-col">
                                  {(() => {
                                    const cardBadge = getCardTypeBadge(record.extracted_fields.cardType as string);
                                    return cardBadge ? (
                                      <Badge variant="outline" className={`text-xs ${cardBadge.className}`}>
                                        {cardBadge.label}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">
                                        {record.extracted_fields.cardType}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                              ) : <span className="text-gray-400 text-xs">-</span>}
                            </div>
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRecordClick(record)}
                                className="flex items-center gap-1"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </Button>
                            </div>
                          </div>
                        )
                      ))}
                    </div>

                    {/* Pagination */}
                    {recordsData && recordsData.totalPages > 1 && (
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Page {currentPage} of {recordsData.totalPages}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage(currentPage - 1)}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage >= recordsData.totalPages}
                            onClick={() => setCurrentPage(currentPage + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Record Detail Modal */}
        <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileJson className="w-5 h-5" />
                TDDF JSON Record Details
                {selectedRecord && (
                  <Badge className={getRecordTypeBadgeClass(selectedRecord.record_type)}>
                    {selectedRecord.record_type}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedRecord && (
              <div className="space-y-4">
                {/* Basic Record Info */}
                <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Record ID:</span>
                    <span className="font-mono">{selectedRecord.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Line Number:</span>
                    <span>{selectedRecord.line_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Upload ID:</span>
                    <TruncatedValue value={selectedRecord.upload_id} maxLength={15} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Filename:</span>
                    <TruncatedValue value={selectedRecord.filename} maxLength={25} />
                  </div>
                </div>

                {/* Tabbed Interface */}
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'dt' | 'p1')} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="dt" className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">DT</Badge>
                      {selectedRecord.record_type === 'DT' ? 'Transaction Details' : 'Associated Transaction'}
                    </TabsTrigger>
                    <TabsTrigger 
                      value="p1" 
                      className="flex items-center gap-2" 
                      disabled={!associatedP1Record && selectedRecord.record_type !== 'P1'}
                    >
                      <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">P1</Badge>
                      {selectedRecord.record_type === 'P1' ? 'Purchasing Extension' : 'Purchasing Details'}
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="dt" className="mt-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300">DT</Badge>
                          Transaction Details
                        </h3>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Transaction Date:</span>
                            <TruncatedValue value={formatDate(selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.transactionDate : undefined)} />
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Amount:</span>
                            <span className="font-mono text-xs text-green-600">{formatAmount(selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.transactionAmount : '0')}</span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Card Type:</span>
                            <TruncatedValue value={selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.cardType : undefined} />
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Merchant Name:</span>
                            <TruncatedValue value={selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.merchantName : undefined} maxLength={20} />
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Merchant Account:</span>
                            <TruncatedValue value={selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.merchantAccountNumber : undefined} />
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Terminal ID:</span>
                            <div>
                              <TerminalIdDisplay terminalId={selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.terminalId : undefined} />
                            </div>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Auth Number:</span>
                            <TruncatedValue value={selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.authorizationNumber : undefined} />
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">Reference Number:</span>
                            <TruncatedValue value={selectedRecord.record_type === 'DT' ? selectedRecord.extracted_fields?.referenceNumber : undefined} />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold mb-3">Raw TDDF Line</h3>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <code className="text-xs font-mono break-all text-gray-800">
                            {selectedRecord.record_type === 'DT' ? selectedRecord.raw_line : 'No DT record selected'}
                          </code>
                          <div className="text-xs text-muted-foreground mt-2">
                            {selectedRecord.record_type === 'DT' ? selectedRecord.raw_line.length : 0} characters
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="p1" className="mt-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Badge className="bg-orange-100 text-orange-800 border-orange-300">P1</Badge>
                          Purchasing Extension
                        </h3>
                        <div className="space-y-3 text-sm">
                          {(selectedRecord.record_type === 'P1' || associatedP1Record) ? (
                            <>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Customer Code (101-125):</span>
                                <TruncatedValue value={(selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.extracted_fields?.customerCode} />
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Purchase ID (76-100):</span>
                                <TruncatedValue value={(selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.extracted_fields?.purchaseIdentifier} />
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Tax Amount (56-67):</span>
                                <span className="font-mono text-xs text-green-600">{formatAmount((selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.extracted_fields?.taxAmount)}</span>
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Tax Rate (68-74):</span>
                                <TruncatedValue value={(selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.extracted_fields?.taxRate} />
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Tax Type (75):</span>
                                <TruncatedValue value={(selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.extracted_fields?.taxType} />
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Freight Amount (226-237):</span>
                                <span className="font-mono text-xs text-green-600">{formatAmount((selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.extracted_fields?.freightAmount)}</span>
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Duty Amount (238-249):</span>
                                <span className="font-mono text-xs text-green-600">{formatAmount((selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.extracted_fields?.dutyAmount)}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                              {loadingP1 ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                                  <span className="text-gray-600">Looking for associated P1 purchasing card details...</span>
                                </>
                              ) : (
                                <span className="text-gray-600">No P1 purchasing extension found for this record</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold mb-3">P1 Raw TDDF Line</h3>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <code className="text-xs font-mono break-all text-gray-800">
                            {(selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.raw_line || 'No P1 record available'}
                          </code>
                          <div className="text-xs text-muted-foreground mt-2">
                            {(selectedRecord.record_type === 'P1' ? selectedRecord : associatedP1Record)?.raw_line?.length || 0} characters
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
