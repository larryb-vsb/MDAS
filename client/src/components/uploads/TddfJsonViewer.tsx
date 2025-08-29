import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, FileJson, Database, Eye, RefreshCw, AlertTriangle, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface TddfJsonViewerProps {
  uploadId: string;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
}

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
            </div>
            <div className="text-xs text-gray-500">
              #{record.id} • {new Date(record.created_at).toLocaleString()}
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent className={compact ? "p-3" : ""}>
        <Tabs defaultValue="fields" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fields" className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Extracted Fields
            </TabsTrigger>
            <TabsTrigger value="raw" className="flex items-center gap-1">
              <FileJson className="w-3 h-3" />
              Raw Line
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="fields" className="mt-3">
            {record.extracted_fields && Object.keys(record.extracted_fields).length > 0 ? (
              <div className={`grid gap-3 ${compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                {Object.entries(record.extracted_fields).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 p-2 rounded text-sm">
                    <div className="font-medium text-gray-700 mb-1">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </div>
                    <div className={`font-mono ${key === 'recordIdentifier' ? 'text-red-600 font-bold' : 'text-gray-900'}`}>
                      {formatFieldValue(key, value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No extracted fields available</p>
            )}
          </TabsContent>
          
          <TabsContent value="raw" className="mt-3">
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

export default function TddfJsonViewer({ uploadId, filename, isOpen, onClose }: TddfJsonViewerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedRecordType, setSelectedRecordType] = useState<string>('');
  const [pageSize] = useState(25);
  const [isReEncoding, setIsReEncoding] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());

  const { data: jsonbData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/uploader', uploadId, 'jsonb-data', { 
      limit: pageSize, 
      offset: currentPage * pageSize,
      recordType: selectedRecordType || undefined 
    }],
    queryFn: async () => {
      console.log(`[TDDF-JSON-VIEWER] Fetching JSONB data for upload ${uploadId}`);
      
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });
      
      if (selectedRecordType && selectedRecordType !== 'all') {
        params.append('recordType', selectedRecordType);
      }
      
      try {
        const result = await apiRequest(`/api/uploader/${uploadId}/jsonb-data?${params}`);
        console.log(`[TDDF-JSON-VIEWER] Successfully fetched data:`, result);
        return result;
      } catch (error: any) {
        console.error(`[TDDF-JSON-VIEWER] API Error:`, error);
        throw error;
      }
    },
    enabled: isOpen && !!uploadId,
    refetchOnWindowFocus: false
  });

  // Get unique record types for filtering
  const { data: allRecordTypes } = useQuery({
    queryKey: ['/api/uploader', uploadId, 'jsonb-data', 'types'],
    queryFn: async () => {
      const data: any = await apiRequest(`/api/uploader/${uploadId}/jsonb-data?limit=1000`);
      const types = Array.from(new Set(data.data.map((record: JsonbRecord) => record.record_type)));
      return types.sort();
    },
    enabled: isOpen && !!uploadId,
    refetchOnWindowFocus: false
  });

  const records: JsonbRecord[] = (jsonbData as any)?.data || [];
  const totalRecords = (jsonbData as any)?.pagination?.total || 0;
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

      // Batch header records (01, BH, 10)
      if (['01', 'BH', '10'].includes(recordType)) {
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
        }
        currentTransaction = {
          dtRecord: record,
          extensions: []
        };
        currentBatch.transactions.push(currentTransaction);
      }
      // Trailer records (98, TR)
      else if (['98', 'TR'].includes(recordType)) {
        if (currentBatch) {
          currentBatch.trailer = record;
        }
      }
      // Extension records
      else {
        if (currentTransaction) {
          currentTransaction.extensions.push(record);
        } else if (currentBatch) {
          // If no current transaction, add as batch-level extension
          if (!currentBatch.extensions) {
            currentBatch.extensions = [];
          }
          currentBatch.extensions.push(record);
        }
      }
    }

    // Add the last batch
    if (currentBatch) {
      batches.push(currentBatch);
    }

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
    if (typeof value === 'number') {
      // Format amounts with proper decimal places
      if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('fee')) {
        return `$${value.toFixed(2)}`;
      }
      return value.toString();
    }
    return value.toString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl h-[90vh] flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-lg">TDDF JSONB Data Viewer</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
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
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          {/* Timing Information Summary */}
          {timingMetadata && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-800">Encoding Performance Summary</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(timingMetadata.recordTypeBreakdown).map(([type, count]) => (
                    <Badge key={type} variant="outline" className={`text-xs ${getRecordTypeBadgeColor(type)} text-white`}>
                      {type}: {(count as number).toLocaleString()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filters and Pagination */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Select value={viewMode} onValueChange={(value: 'tree' | 'flat') => setViewMode(value)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tree">Tree View</SelectItem>
                  <SelectItem value="flat">Flat View</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedRecordType || 'all'} onValueChange={handleRecordTypeChange}>
                <SelectTrigger className="w-32">
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
              
              <div className="text-sm text-gray-600">
                {viewMode === 'tree' ? 'Hierarchical view' : `Showing ${records.length} of ${totalRecords} records`}
                {selectedRecordType && ` (${selectedRecordType} type)`}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePreviousPage}
                disabled={currentPage === 0 || viewMode === 'tree'}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm px-2">
                {viewMode === 'tree' ? 'All' : `Page ${currentPage + 1} of ${Math.max(totalPages, 1)}`}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNextPage}
                disabled={currentPage >= totalPages - 1 || viewMode === 'tree'}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Error State with Re-encode Option */}
          {error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg max-w-md mx-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span className="font-medium text-red-800">JSONB Data Not Available</span>
                  </div>
                  <p className="text-sm text-red-700 mb-4">
                    This file may contain test/sample data instead of real TDDF content.
                  </p>
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
                </div>
              </div>
            </div>
          )}

          {/* Loading and Error States */}
          {isLoading && !error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-600">Loading JSONB data...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-red-600">
                <p>Error loading JSONB data: {(error as Error).message}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Data Display */}
          {!isLoading && !error && records.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <FileJson className="w-12 h-12 text-gray-400 mx-auto" />
                <h3 className="text-lg font-medium text-gray-900">No JSONB Records Found</h3>
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
            </div>
          )}

          {!isLoading && !error && records.length > 0 && (
            <ScrollArea className="flex-1">
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
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}