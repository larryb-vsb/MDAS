import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, FileJson, Database, Eye, RefreshCw, AlertTriangle, ChevronDown, ChevronRight as ChevronRightIcon, ArrowLeft, Info, FileText, BarChart3, Search, X, CreditCard } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface JsonbRecord {
  id: number;
  upload_id: string;
  filename: string;
  record_type: string;
  line_number: number;
  raw_line: string;
  extracted_fields: any;
  record_identifier: string;
  processing_time_ms?: number;
  created_at: string;
}

interface EncodingTimingData {
  startTime: string;
  finishTime: string;
  totalProcessingTime: number;
  batchTimes: Array<{
    batchNumber: number;
    recordsInBatch: number;
    insertTimeMs: number;
    cumulativeRecords: number;
  }>;
}

// Card type badge configuration
function getCardTypeBadges(cardType: string) {
  const badges: Record<string, { label: string; className: string }> = {
    'VD': { label: 'Visa Debit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'VC': { label: 'Visa Credit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'MD': { label: 'Mastercard Debit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'MC': { label: 'Mastercard Credit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'AX': { label: 'American Express', className: 'bg-green-50 text-green-700 border-green-200' },
    'DS': { label: 'Discover', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    'DI': { label: 'Diners Club', className: 'bg-gray-50 text-gray-700 border-gray-200' },
    'JC': { label: 'JCB', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  };
  return badges[cardType] || { label: cardType, className: 'bg-gray-50 text-gray-700 border-gray-200' };
}

// Helper function to extract card type from record
function extractCardType(record: JsonbRecord): string | null {
  // First try extracted_fields, then dynamically extract from raw line
  let cardType = record.extracted_fields?.cardType;
  
  // Dynamic extraction from positions 253-254 (1-based inclusive)
  if (!cardType && record.raw_line && record.raw_line.length >= 254) {
    cardType = record.raw_line.substring(252, 254).trim() || null;
  }
  
  // Normalize to uppercase and trim
  return cardType ? cardType.toUpperCase().trim() : null;
}

// Record Card Component
interface RecordCardProps {
  record: JsonbRecord;
  getRecordTypeBadgeColor: (type: string) => string;
  formatFieldValue: (key: string, value: any) => string;
  compact?: boolean;
}

function RecordCard({ record, getRecordTypeBadgeColor, formatFieldValue, compact = false }: RecordCardProps) {
  return (
    <Card className={compact ? "border border-gray-200" : "border-l-4 border-l-blue-500"}>
      {!compact && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className={`text-white ${getRecordTypeBadgeColor(record.record_type)}`}>
                {record.record_type}
              </Badge>
              <span className="text-sm text-gray-600">Line {record.line_number}</span>
              {record.record_identifier && (
                <Badge variant="outline" className="text-red-600 border-red-200">
                  ID: {record.record_identifier}
                </Badge>
              )}
              {/* Show card type badge for DT records (with dynamic extraction) */}
              {(record.record_type === 'DT' || record.record_type === '47') && (() => {
                const cardType = extractCardType(record);
                
                return cardType ? (
                  <span 
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getCardTypeBadges(cardType).className}`}
                    data-testid={`badge-card-type-${cardType.toLowerCase()}`}
                  >
                    <CreditCard className="h-3 w-3" />
                    {getCardTypeBadges(cardType).label}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="text-xs text-gray-500">
              #{record.id} • {new Date(record.created_at).toLocaleString()}
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent className={compact ? "p-2" : ""}>
        <Tabs defaultValue="fields" className="w-full">
          <TabsList className={`grid w-full grid-cols-2 ${compact ? 'h-8' : ''}`}>
            <TabsTrigger value="fields" className={`flex items-center gap-1 ${compact ? 'text-xs' : ''}`}>
              <Eye className="w-3 h-3" />
              Fields
            </TabsTrigger>
            <TabsTrigger value="raw" className={`flex items-center gap-1 ${compact ? 'text-xs' : ''}`}>
              <FileJson className="w-3 h-3" />
              Raw
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="fields" className={compact ? "mt-2" : "mt-3"}>
            {record.extracted_fields && Object.keys(record.extracted_fields).length > 0 ? (
              <div className={`grid gap-2 ${compact ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
                {/* Always show Transaction Type Identifier for DT records (dynamic extraction) */}
                {record.record_type === 'DT' && (
                  <div className={`bg-gray-50 rounded ${compact ? 'p-1 text-xs' : 'p-2 text-sm'}`} data-testid="text-transaction-type-identifier">
                    <div className="font-medium text-gray-700 mb-1">
                      Transaction Type Identifier (336-338)
                    </div>
                    <div className="font-mono text-purple-600 font-semibold">
                      {(() => {
                        // First try extracted_fields, then dynamically extract from raw line
                        if (record.extracted_fields?.transactionTypeIdentifier) {
                          return formatFieldValue('transactionTypeIdentifier', record.extracted_fields.transactionTypeIdentifier);
                        }
                        // Dynamic extraction from positions 336-338 (1-based inclusive)
                        if (record.raw_line && record.raw_line.length >= 338) {
                          const ttiValue = record.raw_line.substring(335, 338).trim();
                          return ttiValue || 'N/A';
                        }
                        return 'N/A';
                      })()} 
                    </div>
                  </div>
                )}
                
                {/* Display other extracted fields (excluding TTI to avoid duplication) */}
                {Object.entries(record.extracted_fields)
                  .filter(([key]) => key !== 'transactionTypeIdentifier') // Skip TTI since we show it above
                  .map(([key, value]) => (
                  <div key={key} className={`bg-gray-50 rounded ${compact ? 'p-1 text-xs' : 'p-2 text-sm'}`}>
                    <div className="font-medium text-gray-700 mb-1">
                      {key === 'merchantAccountNumber' ? 'Merchant Account Number' : 
                       key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </div>
                    <div className={`font-mono ${
                      key === 'recordIdentifier' ? 'text-red-600 font-bold' : 
                      key === 'merchantAccountNumber' ? 'text-blue-600 font-semibold' : 
                      'text-gray-900'
                    }`}>
                      {formatFieldValue(key, value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No extracted fields available</p>
            )}
          </TabsContent>
          
          <TabsContent value="raw" className={compact ? "mt-2" : "mt-3"}>
            <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs whitespace-pre-wrap overflow-x-auto">
              {record.raw_line}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Length: {record.raw_line.length} characters
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Tree View Display Component
interface TreeViewDisplayProps {
  records: JsonbRecord[];
  expandedBatches: Set<string>;
  expandedTransactions: Set<string>;
  onToggleBatch: (index: number) => void;
  onToggleTransaction: (batchIndex: number, transactionIndex: number) => void;
  getRecordTypeBadgeColor: (type: string) => string;
  getRecordTypeName: (type: string) => string;
  formatFieldValue: (key: string, value: any) => string;
  groupRecordsHierarchically: (records: JsonbRecord[]) => any[];
}

function TreeViewDisplay({ 
  records, 
  expandedBatches, 
  expandedTransactions, 
  onToggleBatch, 
  onToggleTransaction, 
  getRecordTypeBadgeColor, 
  getRecordTypeName, 
  formatFieldValue, 
  groupRecordsHierarchically 
}: TreeViewDisplayProps) {
  const hierarchicalData = groupRecordsHierarchically(records);

  return (
    <div className="space-y-3">
      {hierarchicalData.map((batch, batchIndex) => {
        const batchKey = `batch-${batchIndex}`;
        const isExpanded = expandedBatches.has(batchKey);
        
        return (
          <Card key={batchIndex} className="border-l-4 border-l-green-500">
            {/* Batch Header */}
            <CardHeader className="pb-2">
              <div 
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -m-3 p-3 rounded"
                onClick={() => onToggleBatch(batchIndex)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                )}
                
                {batch.batchHeader ? (
                  <>
                    <Badge className={`text-white ${getRecordTypeBadgeColor(batch.batchHeader.record_type)}`}>
                      {batch.batchHeader.record_type}
                    </Badge>
                    <span className="font-medium">{getRecordTypeName(batch.batchHeader.record_type)}</span>
                    <span className="text-sm text-gray-600">Line {batch.batchHeader.line_number}</span>
                  </>
                ) : (
                  <>
                    <Badge className="bg-gray-500 text-white">Batch</Badge>
                    <span className="font-medium">Implicit Batch {batchIndex + 1}</span>
                  </>
                )}
                
                <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
                  <span>{batch.transactions.length} transaction{batch.transactions.length !== 1 ? 's' : ''}</span>
                  {batch.trailer && <span>• Has Trailer</span>}
                </div>
              </div>
            </CardHeader>

            {/* Expanded Batch Content */}
            {isExpanded && (
              <CardContent className="pt-0">
                {/* Batch Header Details */}
                {batch.batchHeader && (
                  <div className="mb-4 ml-6">
                    <RecordCard 
                      record={batch.batchHeader}
                      getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                      formatFieldValue={formatFieldValue}
                      compact={true}
                    />
                  </div>
                )}

                {/* Transactions */}
                <div className="space-y-2 ml-6">
                  {batch.transactions.map((transaction: any, transactionIndex: number) => {
                    const transactionKey = `transaction-${batchIndex}-${transactionIndex}`;
                    const isTransactionExpanded = expandedTransactions.has(transactionKey);
                    
                    return (
                      <Card key={transactionIndex} className="border-l-4 border-l-blue-500 bg-blue-50/30">
                        <CardHeader className="pb-2">
                          <div 
                            className="flex items-center gap-2 cursor-pointer hover:bg-blue-100/50 -m-3 p-3 rounded"
                            onClick={() => onToggleTransaction(batchIndex, transactionIndex)}
                          >
                            {isTransactionExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                            )}
                            
                            <Badge className={`text-white ${getRecordTypeBadgeColor(transaction.dtRecord.record_type)}`}>
                              {transaction.dtRecord.record_type}
                            </Badge>
                            
                            {/* Card Type Badge for DT records in tree view header */}
                            {(transaction.dtRecord.record_type === 'DT' || transaction.dtRecord.record_type === '47') && (() => {
                              const cardType = extractCardType(transaction.dtRecord);
                              
                              return cardType ? (
                                <span 
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getCardTypeBadges(cardType).className}`}
                                  data-testid={`badge-card-type-${cardType.toLowerCase()}`}
                                >
                                  <CreditCard className="h-3 w-3" />
                                  {getCardTypeBadges(cardType).label}
                                </span>
                              ) : null;
                            })()}
                            
                            <span className="font-medium">{getRecordTypeName(transaction.dtRecord.record_type)}</span>
                            <span className="text-sm text-gray-600">Line {transaction.dtRecord.line_number}</span>
                            
                            {transaction.extensions.length > 0 && (
                              <div className="ml-auto flex items-center gap-1">
                                <span className="text-xs text-gray-600">{transaction.extensions.length} extension{transaction.extensions.length !== 1 ? 's' : ''}</span>
                                <div className="flex gap-1">
                                  {transaction.extensions.slice(0, 3).map((ext: JsonbRecord, i: number) => (
                                    <Badge key={i} variant="outline" className={`text-xs ${getRecordTypeBadgeColor(ext.record_type)} text-white`}>
                                      {ext.record_type}
                                    </Badge>
                                  ))}
                                  {transaction.extensions.length > 3 && (
                                    <Badge variant="outline" className="text-xs">+{transaction.extensions.length - 3}</Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardHeader>

                        {/* Expanded Transaction Content */}
                        {isTransactionExpanded && (
                          <CardContent className="pt-0">
                            {/* DT Record Details */}
                            <div className="mb-3">
                              <RecordCard 
                                record={transaction.dtRecord}
                                getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                                formatFieldValue={formatFieldValue}
                                compact={true}
                              />
                            </div>

                            {/* Extension Records */}
                            {transaction.extensions.length > 0 && (
                              <div className="ml-4 space-y-2">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Extensions:</h4>
                                {transaction.extensions.map((extension: JsonbRecord, extIndex: number) => (
                                  <div key={extIndex} className="ml-2">
                                    <RecordCard 
                                      record={extension}
                                      getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                                      formatFieldValue={formatFieldValue}
                                      compact={true}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>

                {/* Trailer */}
                {batch.trailer && (
                  <div className="mt-4 ml-6">
                    <Card className="border-l-4 border-l-red-500 bg-red-50/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-white ${getRecordTypeBadgeColor(batch.trailer.record_type)}`}>
                            {batch.trailer.record_type}
                          </Badge>
                          <span className="font-medium">{getRecordTypeName(batch.trailer.record_type)}</span>
                          <span className="text-sm text-gray-600">Line {batch.trailer.line_number}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <RecordCard 
                          record={batch.trailer}
                          getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                          formatFieldValue={formatFieldValue}
                          compact={true}
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default function TddfJsonViewerPage() {
  const [, params] = useRoute('/tddf-viewer/:uploadId/:filename');
  const [, setLocation] = useLocation();
  
  const uploadId = params?.uploadId || '';
  const filename = decodeURIComponent(params?.filename || '');
  
  // Check for unlimited query parameter
  const searchParams = new URLSearchParams(window.location.search);
  const isUnlimited = searchParams.get('unlimited') === 'true';
  
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedRecordType, setSelectedRecordType] = useState<string>('');
  const [merchantAccountFilter, setMerchantAccountFilter] = useState<string>('');
  const [terminalIdFilter, setTerminalIdFilter] = useState<string>('');
  const [pageSize, setPageSize] = useState(isUnlimited ? 100000 : 10000); // Unlimited shows up to 100K records
  const [isReEncoding, setIsReEncoding] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'all' | 'metadata'>('all');

  const { data: jsonbData, isLoading, error, refetch } = useQuery({
    queryKey: [isUnlimited ? '/api/tddf-api/records' : '/api/uploader', uploadId, 'jsonb-data', { 
      limit: pageSize, 
      offset: currentPage * pageSize,
      recordType: selectedRecordType || undefined 
    }],
    queryFn: async () => {
      console.log(`[TDDF-JSON-VIEWER] Fetching JSONB data for upload ${uploadId}, isUnlimited: ${isUnlimited}`);
      
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });
      
      if (selectedRecordType && selectedRecordType !== 'all') {
        params.append('recordType', selectedRecordType);
      }
      
      try {
        // Use different endpoints for archive vs regular files
        const endpoint = isUnlimited 
          ? `/api/tddf-api/records/${uploadId}?${params}`
          : `/api/uploader/${uploadId}/jsonb-data?${params}`;
        
        console.log(`[TDDF-JSON-VIEWER] Using endpoint: ${endpoint}`);
        const result = await apiRequest(endpoint);
        console.log(`[TDDF-JSON-VIEWER] Successfully fetched data:`, result);
        return result;
      } catch (error: any) {
        console.error(`[TDDF-JSON-VIEWER] API Error:`, error);
        
        // For archive files, provide helpful error message when no JSONB data exists
        if (isUnlimited && (error.message?.includes('500') || error.message?.includes('no records found') || error.message?.includes('Internal Server Error'))) {
          throw new Error('JSONB data not available for this archive file. The Step 6 processing may not have completed successfully. Please contact support to re-process this archive file.');
        }
        
        throw error;
      }
    },
    enabled: !!uploadId,
    refetchOnWindowFocus: false
  });

  // Get unique record types for filtering
  const { data: allRecordTypes } = useQuery({
    queryKey: [isUnlimited ? '/api/tddf-api/records' : '/api/uploader', uploadId, 'jsonb-data', 'types'],
    queryFn: async () => {
      try {
        // Use different endpoints for archive vs regular files
        const endpoint = isUnlimited 
          ? `/api/tddf-api/records/${uploadId}?limit=1000`
          : `/api/uploader/${uploadId}/jsonb-data?limit=1000`;
        
        const data: any = await apiRequest(endpoint);
        const types = Array.from(new Set(data.data.map((record: JsonbRecord) => record.record_type)));
        return types.sort();
      } catch (error: any) {
        // Return empty array if JSONB data is not available
        console.warn('[TDDF-JSON-VIEWER] Record types fetch failed:', error);
        return [];
      }
    },
    enabled: !!uploadId,
    refetchOnWindowFocus: false
  });

  // Get upload details for file size and line count
  const { data: uploadDetails } = useQuery({
    queryKey: [isUnlimited ? '/api/tddf-api/files' : '/api/uploader', uploadId, 'details'],
    queryFn: async () => {
      try {
        // For archive files, we don't need upload details since they're already processed
        if (isUnlimited) {
          return { 
            filename: filename,
            isArchiveFile: true,
            // Archive files don't have uploader details, but we'll show the filename
          };
        }
        return await apiRequest(`/api/uploader/${uploadId}`);
      } catch (error) {
        console.warn('[TDDF-JSON-VIEWER] Upload details fetch failed');
        return null;
      }
    },
    enabled: !!uploadId,
    refetchOnWindowFocus: false
  });

  const allRecords: JsonbRecord[] = (jsonbData as any)?.data || [];
  
  const filteredRecords = allRecords.filter(record => {
    // Record type filter
    if (selectedRecordType && record.record_type !== selectedRecordType) {
      return false;
    }
    
    // Merchant account filter
    if (merchantAccountFilter && merchantAccountFilter.trim() !== '') {
      const merchantAccountNumber = record.extracted_fields?.merchantAccountNumber;
      if (!merchantAccountNumber || 
          !merchantAccountNumber.toString().toLowerCase().includes(merchantAccountFilter.toLowerCase())) {
        return false;
      }
    }
    
    // Terminal ID filter
    if (terminalIdFilter && terminalIdFilter.trim() !== '') {
      const terminalId = record.extracted_fields?.terminalId;
      if (!terminalId || 
          !terminalId.toString().toLowerCase().includes(terminalIdFilter.toLowerCase())) {
        return false;
      }
    }
    
    return true;
  });
  
  const records = filteredRecords;
  const totalRecords = records.length;
  const totalPages = Math.ceil(totalRecords / pageSize);
  const timingMetadata = (jsonbData as any)?.timingMetadata;

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleRecordTypeChange = (value: string) => {
    setSelectedRecordType(value === 'all' ? '' : value);
    setCurrentPage(0); // Reset to first page when filtering
  };

  const handleMerchantAccountFilterChange = (value: string) => {
    setMerchantAccountFilter(value);
    setCurrentPage(0); // Reset to first page when filtering
  };

  const clearMerchantAccountFilter = () => {
    setMerchantAccountFilter('');
    setCurrentPage(0);
  };

  const handleTerminalIdFilterChange = (value: string) => {
    setTerminalIdFilter(value);
    setCurrentPage(0); // Reset to first page when filtering
  };

  const clearTerminalIdFilter = () => {
    setTerminalIdFilter('');
    setCurrentPage(0);
  };

  // Check cache status
  const { data: cacheStatus } = useQuery({
    queryKey: ['tddf-cache-status', uploadId],
    queryFn: async () => {
      try {
        return await apiRequest(`/api/tddf-jsonb/cache-status/${uploadId}`);
      } catch (error) {
        console.warn('[TDDF-JSON-VIEWER] Cache status check failed, assuming no cache');
        return { isCached: false };
      }
    },
    enabled: !!uploadId,
    staleTime: 30000,
  });

  const [isBuildingCache, setIsBuildingCache] = useState(false);
  const [showCacheOption, setShowCacheOption] = useState(false);

  const handleBuildCache = async () => {
    setIsBuildingCache(true);
    try {
      console.log(`[TDDF-JSON-VIEWER] Building cache for upload ${uploadId}`);
      
      const result = await apiRequest(`/api/tddf-jsonb/build-cache/${uploadId}`, {
        method: 'POST'
      });
      
      console.log(`[TDDF-JSON-VIEWER] Cache build successful:`, result);
      
      // Refresh the data after cache building
      setTimeout(() => {
        refetch();
        setShowCacheOption(false);
      }, 2000);
      
    } catch (error: any) {
      console.error(`[TDDF-JSON-VIEWER] Cache build failed:`, error);
    } finally {
      setIsBuildingCache(false);
    }
  };

  const handleReEncode = async () => {
    setIsReEncoding(true);
    try {
      console.log(`[TDDF-JSON-VIEWER] Starting re-encode for upload ${uploadId}`);
      
      const result = await apiRequest(`/api/uploader/${uploadId}/re-encode`, {
        method: 'POST'
      });
      
      console.log(`[TDDF-JSON-VIEWER] Re-encode successful:`, result);
      
      // Refresh the data after re-encoding
      await refetch();
      
    } catch (error: any) {
      console.error(`[TDDF-JSON-VIEWER] Re-encode failed:`, error);
    } finally {
      setIsReEncoding(false);
    }
  };

  const getRecordTypeBadgeColor = (recordType: string) => {
    switch (recordType) {
      case 'DT': case '47': return 'bg-blue-500 hover:bg-blue-600';
      case 'BH': case '01': return 'bg-green-500 hover:bg-green-600';
      case 'TR': case '98': return 'bg-red-500 hover:bg-red-600';
      case 'P1': return 'bg-orange-500 hover:bg-orange-600';
      case 'P2': return 'bg-purple-500 hover:bg-purple-600';
      case 'G2': return 'bg-indigo-500 hover:bg-indigo-600';
      case 'A1': return 'bg-yellow-500 hover:bg-yellow-600';
      case 'E1': return 'bg-pink-500 hover:bg-pink-600';
      case 'LG': return 'bg-teal-500 hover:bg-teal-600';
      case '10': return 'bg-green-600 hover:bg-green-700'; // Header records
      default: return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getRecordTypeName = (recordType: string) => {
    switch (recordType) {
      case '01': case 'BH': return 'Batch Header';
      case '10': return 'File Header';
      case '47': case 'DT': return 'Detail Transaction';
      case '98': case 'TR': return 'Trailer';
      case 'G2': return 'Geographic Extension';
      case 'A1': return 'Airline Extension';
      case 'E1': return 'E-Commerce Extension';
      case 'P1': return 'Purchasing Card';
      case 'P2': return 'Purchasing Card Ext';
      case 'LG': return 'Lodge/Hotel';
      default: return `Record ${recordType}`;
    }
  };

  // Group records into hierarchical structure
  const groupRecordsHierarchically = (records: JsonbRecord[]) => {
    console.log(`[TREE-VIEW] Grouping ${records.length} records hierarchically`);
    
    // Debug: Log all record types present
    const recordTypes = [...new Set(records.map(r => r.record_type))];
    console.log(`[TREE-VIEW] Record types found: ${recordTypes.join(', ')}`);
    
    // For TDDF files where all records are type "02", treat every 1-3 records as a batch
    // This is common in certain TDDF formats where 02 records contain different data types
    if (recordTypes.length === 1 && recordTypes[0] === '02') {
      console.log(`[TREE-VIEW] Special handling: All records are type 02, creating logical batches`);
      
      const batches: Array<{
        batchHeader: JsonbRecord | null;
        transactions: Array<{
          dtRecord: JsonbRecord;
          extensions: JsonbRecord[];
        }>;
        trailer: JsonbRecord | null;
      }> = [];

      // Group every 1-2 records as a logical batch for display
      for (let i = 0; i < records.length; i += 2) {
        const headerRecord = records[i];
        const transactionRecord = records[i + 1];
        
        const batch = {
          batchHeader: headerRecord,
          transactions: transactionRecord ? [{
            dtRecord: transactionRecord,
            extensions: []
          }] : [],
          trailer: null
        };
        
        batches.push(batch);
        console.log(`[TREE-VIEW] Created logical batch ${batches.length}: Header line ${headerRecord.line_number}, Transaction line ${transactionRecord?.line_number || 'none'}`);
      }

      console.log(`[TREE-VIEW] Created ${batches.length} logical batches for type-02 records`);
      return batches;
    }
    
    // Original hierarchical grouping for mixed record types
    const batches: Array<{
      batchHeader: JsonbRecord | null;
      transactions: Array<{
        dtRecord: JsonbRecord;
        extensions: JsonbRecord[];
      }>;
      trailer: JsonbRecord | null;
    }> = [];

    let currentBatch: any = null;
    let currentTransaction: any = null;

    for (const record of records) {
      const recordType = record.record_type;

      // Batch header records (01, BH, 10, 02)
      if (['01', 'BH', '10', '02'].includes(recordType)) {
        // Start new batch
        if (currentBatch) {
          batches.push(currentBatch);
        }
        currentBatch = {
          batchHeader: record,
          transactions: [],
          trailer: null
        };
        currentTransaction = null;
        console.log(`[TREE-VIEW] Started new batch with header record type ${recordType}`);
      }
      // Detail transaction records (47, DT)
      else if (['47', 'DT'].includes(recordType)) {
        if (!currentBatch) {
          // Create implicit batch if no header found
          currentBatch = {
            batchHeader: null,
            transactions: [],
            trailer: null
          };
          console.log(`[TREE-VIEW] Created implicit batch for transaction record type ${recordType}`);
        }
        currentTransaction = {
          dtRecord: record,
          extensions: []
        };
        currentBatch.transactions.push(currentTransaction);
        console.log(`[TREE-VIEW] Added transaction record type ${recordType} to batch`);
      }
      // Trailer records (98, TR, 99)
      else if (['98', 'TR', '99'].includes(recordType)) {
        if (currentBatch) {
          currentBatch.trailer = record;
          console.log(`[TREE-VIEW] Added trailer record type ${recordType} to batch`);
        }
      }
      // Extension records - all other types
      else {
        if (currentTransaction) {
          currentTransaction.extensions.push(record);
          console.log(`[TREE-VIEW] Added extension record type ${recordType} to current transaction`);
        } else if (currentBatch) {
          // If no current transaction, add as batch-level extension
          if (!currentBatch.extensions) {
            currentBatch.extensions = [];
          }
          currentBatch.extensions.push(record);
          console.log(`[TREE-VIEW] Added extension record type ${recordType} to batch level`);
        } else {
          // No batch or transaction, create implicit batch
          currentBatch = {
            batchHeader: null,
            transactions: [],
            trailer: null,
            extensions: [record]
          };
          console.log(`[TREE-VIEW] Created implicit batch for orphaned record type ${recordType}`);
        }
      }
    }

    // Add the last batch
    if (currentBatch) {
      batches.push(currentBatch);
    }

    console.log(`[TREE-VIEW] Created ${batches.length} batches`);
    batches.forEach((batch, i) => {
      console.log(`[TREE-VIEW] Batch ${i}: Header=${batch.batchHeader?.record_type || 'none'}, Transactions=${batch.transactions.length}, Trailer=${batch.trailer?.record_type || 'none'}`);
    });

    return batches;
  };

  const toggleBatchExpansion = (batchIndex: number) => {
    const batchKey = `batch-${batchIndex}`;
    setExpandedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchKey)) {
        newSet.delete(batchKey);
      } else {
        newSet.add(batchKey);
      }
      return newSet;
    });
  };

  const toggleTransactionExpansion = (batchIndex: number, transactionIndex: number) => {
    const transactionKey = `transaction-${batchIndex}-${transactionIndex}`;
    setExpandedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionKey)) {
        newSet.delete(transactionKey);
      } else {
        newSet.add(transactionKey);
      }
      return newSet;
    });
  };

  const formatFieldValue = (key: string, value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string' && value.trim() === '') return '-';
    
    // Special formatting for Merchant Account Number
    if (key === 'merchantAccountNumber' && value) {
      return value.toString().trim(); // Keep as-is but ensure clean display
    }
    
    if (typeof value === 'number') {
      // Format amounts with proper decimal places
      if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('fee')) {
        return `$${value.toFixed(2)}`;
      }
      return value.toString();
    }
    return value.toString();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setLocation('/mms-uploader')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Uploader
            </Button>
            <div className="flex items-center gap-2">
              <FileJson className="w-6 h-6 text-blue-500" />
              <h1 className="text-2xl font-bold">TDDF JSONB Data Viewer</h1>
              {isUnlimited && (
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs ml-2">
                  <Eye className="w-3 h-3 mr-1" />
                  Unlimited Mode
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="font-medium">{filename}</span>
            <Badge variant="outline">Upload ID: {uploadId}</Badge>
            {(jsonbData as any)?.tableName && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                {(jsonbData as any).tableName}
              </Badge>
            )}
            {isUnlimited && (
              <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">
                Showing up to 100K records (no 10K limit)
              </Badge>
            )}
          </div>
        </div>

        {/* Timing Information Summary */}
        {timingMetadata && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-800">Encoding Performance Summary</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Total Records:</span>
                <span className="ml-1 font-medium">{timingMetadata.totalRecords?.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-600">Processing Time:</span>
                <span className="ml-1 font-medium">{(timingMetadata.totalEncodingTimeMs / 1000).toFixed(2)}s</span>
              </div>
              <div>
                <span className="text-gray-600">Records/sec:</span>
                <span className="ml-1 font-medium">{Math.round(timingMetadata.totalRecords / (timingMetadata.totalEncodingTimeMs / 1000)).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-600">Started:</span>
                <span className="ml-1 font-medium">{timingMetadata.encodingStartTime ? new Date(timingMetadata.encodingStartTime).toLocaleTimeString() : 'N/A'}</span>
              </div>
            </div>
            {timingMetadata.recordTypeBreakdown && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(timingMetadata.recordTypeBreakdown).map(([type, count]) => (
                  <Badge key={type} variant="outline" className={`text-xs ${getRecordTypeBadgeColor(type)} text-white`}>
                    {type}: {(count as number).toLocaleString()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Record Summary Cards */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">BH Records</p>
                  <p className="text-2xl font-bold text-green-900">
                    {allRecords.filter(r => ['BH', '01'].includes(r.record_type)).length}
                  </p>
                  <p className="text-xs text-green-600">Batch Headers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Database className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-800">DT Records</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {allRecords.filter(r => ['DT', '47'].includes(r.record_type)).length}
                  </p>
                  <p className="text-xs text-blue-600">Detail Transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-gray-200 bg-gray-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <FileText className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Total Records</p>
                  <p className="text-2xl font-bold text-gray-900">{allRecords.length}</p>
                  <p className="text-xs text-gray-600">All Types</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section Navigation Tabs */}
        <div className="mb-6">
          <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                All Records
              </TabsTrigger>
              <TabsTrigger value="metadata" className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                File Metadata
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-6 p-4 bg-white rounded-lg border">
          <div className="flex items-center gap-4">
            <Select value={viewMode} onValueChange={(value: 'tree' | 'flat') => setViewMode(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tree">Tree View</SelectItem>
                <SelectItem value="flat">Flat View</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedRecordType || 'all'} onValueChange={handleRecordTypeChange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {allRecordTypes?.map((type) => (
                  <SelectItem key={type as string} value={type as string}>
                    {type as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Merchant Account Number Filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Filter by Merchant Account..."
                value={merchantAccountFilter}
                onChange={(e) => handleMerchantAccountFilterChange(e.target.value)}
                className="pl-10 pr-10 w-64"
              />
              {merchantAccountFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearMerchantAccountFilter}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>


            {/* Terminal ID Filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Filter by Terminal ID..."
                value={terminalIdFilter}
                onChange={(e) => handleTerminalIdFilterChange(e.target.value)}
                className="pl-10 pr-10 w-64"
                data-testid="input-terminal-id-filter"
              />
              {terminalIdFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearTerminalIdFilter}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
                  data-testid="button-clear-terminal-filter"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>

            {/* Page Size Selector for Large Files */}
            {totalRecords > 1000 && (
              <Select value={pageSize.toString()} onValueChange={(value) => {
                setPageSize(parseInt(value));
                setCurrentPage(0);
              }}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1000</SelectItem>
                  <SelectItem value="2000">2000</SelectItem>
                  <SelectItem value="5000">5000</SelectItem>
                  <SelectItem value="10000">All (10K)</SelectItem>
                </SelectContent>
              </Select>
            )}
            
            <div className="text-sm text-gray-600">
              {viewMode === 'tree' ? 'Hierarchical view' : 
                `Showing ${(currentPage * pageSize) + 1}-${Math.min((currentPage + 1) * pageSize, totalRecords)} of ${totalRecords.toLocaleString()} records`}
              {selectedRecordType && ` (${selectedRecordType} type)`}
              {merchantAccountFilter && ` (Merchant: ${merchantAccountFilter})`}
              {terminalIdFilter && ` (Terminal: ${terminalIdFilter})`}
              {totalRecords > 10000 && (
                <span className="ml-2 text-blue-600 font-medium">Large dataset - use filters and pagination</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Database Access Status */}
            {totalRecords > 0 && (
              <Badge 
                variant="outline" 
                className="text-green-700 bg-green-50 border-green-200 flex items-center gap-1"
              >
                <Database className="w-3 h-3" />
                Direct Access ({totalRecords.toLocaleString()} records)
              </Badge>
            )}
            
            {/* Re-process Button */}
            {totalRecords > 1000 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleBuildCache}
                disabled={isBuildingCache}
                className="flex items-center gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                {isBuildingCache ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Re-process with Real Data
                  </>
                )}
              </Button>
            )}
            
            {/* Enhanced Pagination for Large Datasets */}
            {viewMode === 'flat' && (
              <>
                {/* First/Previous */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(0)}
                  disabled={currentPage === 0}
                  className="flex items-center gap-1"
                >
                  First
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handlePreviousPage}
                  disabled={currentPage === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                {/* Page Info with Jump */}
                <div className="flex items-center gap-2">
                  <span className="text-sm">Page</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={currentPage + 1}
                    onChange={(e) => {
                      const page = parseInt(e.target.value) - 1;
                      if (page >= 0 && page < totalPages) {
                        setCurrentPage(page);
                      }
                    }}
                    className="w-16 px-2 py-1 text-sm border rounded text-center"
                  />
                  <span className="text-sm">of {totalPages.toLocaleString()}</span>
                </div>
                
                {/* Next/Last */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(totalPages - 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="flex items-center gap-1"
                >
                  Last
                </Button>
              </>
            )}
            
            {viewMode === 'tree' && (
              <span className="text-sm px-3">Hierarchical View</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg border">
          {/* Error State with Re-encode Option */}
          {error && (
            <div className="p-8 text-center">
              <div className="p-6 bg-red-50 border border-red-200 rounded-lg max-w-md mx-auto">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                  <span className="font-medium text-red-800">JSONB Data Not Available</span>
                </div>
                <p className="text-sm text-red-700 mb-4">
                  {isUnlimited 
                    ? "JSONB data not available for this archive file. The Step 6 processing may not have completed successfully. Please contact support to re-process this archive file."
                    : "This file may contain test/sample data instead of real TDDF content."
                  }
                </p>
                {!isUnlimited && (
                  <Button 
                    onClick={handleReEncode}
                    disabled={isReEncoding}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    {isReEncoding ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Re-encoding with Real Data...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Re-encode with Real Data
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && !error && (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading JSONB data...</p>
            </div>
          )}

          {/* No Data State */}
          {!isLoading && !error && records.length === 0 && (
            <div className="p-8 text-center space-y-4">
              <FileJson className="w-16 h-16 text-gray-400 mx-auto" />
              <h3 className="text-xl font-medium text-gray-900">No JSONB Records Found</h3>
              <p className="text-gray-600">This file hasn't been processed with real data yet.</p>
              <Button 
                onClick={handleReEncode}
                disabled={isReEncoding}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {isReEncoding ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing Real Data...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Process with Real Data
                  </>
                )}
              </Button>
            </div>
          )}

          {/* File Metadata Display */}
          {!isLoading && !error && activeSection === 'metadata' && (
            <div className="p-6">
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-medium text-gray-900">File Metadata</h3>
                </div>
                
                {/* File Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      File Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Filename:</label>
                        <p className="text-sm text-gray-900 font-mono">{filename}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Upload ID:</label>
                        <p className="text-sm text-gray-900 font-mono">{uploadId}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">File Size:</label>
                        <p className="text-sm text-gray-900">
                          {uploadDetails?.file_size ? 
                            `${(uploadDetails.file_size / 1024 / 1024).toFixed(2)} MB` : 
                            'N/A'
                          }
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Total Lines:</label>
                        <p className="text-sm text-gray-900">
                          {uploadDetails?.line_count ? 
                            uploadDetails.line_count.toLocaleString() : 
                            'N/A'
                          }
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Total Records:</label>
                        <p className="text-sm text-gray-900">{allRecords.length.toLocaleString()}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Database Table:</label>
                        <p className="text-sm text-gray-900 font-mono">{(jsonbData as any)?.tableName || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Upload Date:</label>
                        <p className="text-sm text-gray-900">
                          {uploadDetails?.start_time ? 
                            new Date(uploadDetails.start_time).toLocaleString() : 
                            'N/A'
                          }
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Status:</label>
                        <p className="text-sm text-gray-900">
                          <Badge className={`
                            ${uploadDetails?.current_phase === 'encoded' ? 'bg-green-500' : 
                              uploadDetails?.current_phase === 'encoding' ? 'bg-yellow-500' :
                              uploadDetails?.current_phase === 'uploaded' ? 'bg-blue-500' :
                              'bg-gray-500'
                            } text-white
                          `}>
                            {uploadDetails?.current_phase || 'Unknown'}
                          </Badge>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Record Type Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Record Type Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {allRecordTypes?.map((type) => {
                        const count = allRecords.filter(r => r.record_type === type).length;
                        return (
                          <div key={type as string} className="text-center p-3 border rounded-lg">
                            <Badge className={`mb-2 text-white ${getRecordTypeBadgeColor(type as string)}`}>
                              {type as string}
                            </Badge>
                            <p className="text-lg font-semibold">{count.toLocaleString()}</p>
                            <p className="text-sm text-gray-600">{getRecordTypeName(type as string)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Processing Information */}
                {timingMetadata && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        Processing Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Processing Time:</label>
                          <p className="text-sm text-gray-900">{(timingMetadata.totalEncodingTimeMs / 1000).toFixed(2)}s</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Records/sec:</label>
                          <p className="text-sm text-gray-900">{Math.round(timingMetadata.totalRecords / (timingMetadata.totalEncodingTimeMs / 1000)).toLocaleString()}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Started:</label>
                          <p className="text-sm text-gray-900">{timingMetadata.encodingStartTime ? new Date(timingMetadata.encodingStartTime).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Query Time:</label>
                          <p className="text-sm text-gray-900">{timingMetadata.queryTime || 'N/A'}ms</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}



          {/* Data Display */}
          {!isLoading && !error && activeSection !== 'metadata' && records.length > 0 && (
            <div className="p-6">
              {/* Re-encode button always available when there's data */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    TDDF Records ({records.length} total)
                  </h3>
                  {records.length <= 10 && (
                    <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                      Sample Data
                    </span>
                  )}
                </div>
                <Button 
                  onClick={handleReEncode}
                  disabled={isReEncoding}
                  size="sm"
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {isReEncoding ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Re-processing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Re-process with Real Data
                    </>
                  )}
                </Button>
              </div>

              {viewMode === 'tree' ? (
                <TreeViewDisplay 
                  records={records}
                  expandedBatches={expandedBatches}
                  expandedTransactions={expandedTransactions}
                  onToggleBatch={toggleBatchExpansion}
                  onToggleTransaction={toggleTransactionExpansion}
                  getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                  getRecordTypeName={getRecordTypeName}
                  formatFieldValue={formatFieldValue}
                  groupRecordsHierarchically={groupRecordsHierarchically}
                />
              ) : (
                <div className="space-y-4">
                  {records.map((record, index) => (
                    <RecordCard 
                      key={record.id}
                      record={record}
                      getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                      formatFieldValue={formatFieldValue}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}