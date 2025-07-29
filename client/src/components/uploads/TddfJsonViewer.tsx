import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, FileJson, Database, Eye } from 'lucide-react';

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
  created_at: string;
}

export default function TddfJsonViewer({ uploadId, filename, isOpen, onClose }: TddfJsonViewerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedRecordType, setSelectedRecordType] = useState<string>('');
  const [pageSize] = useState(25);

  const { data: jsonbData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/uploader', uploadId, 'jsonb-data', { 
      limit: pageSize, 
      offset: currentPage * pageSize,
      recordType: selectedRecordType || undefined 
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });
      
      if (selectedRecordType && selectedRecordType !== 'all') {
        params.append('recordType', selectedRecordType);
      }
      
      const response = await fetch(`/api/uploader/${uploadId}/jsonb-data?${params}`);
      if (!response.ok) throw new Error('Failed to fetch JSONB data');
      return response.json();
    },
    enabled: isOpen && !!uploadId,
    refetchOnWindowFocus: false
  });

  // Get unique record types for filtering
  const { data: allRecordTypes } = useQuery({
    queryKey: ['/api/uploader', uploadId, 'jsonb-data', 'types'],
    queryFn: async () => {
      const response = await fetch(`/api/uploader/${uploadId}/jsonb-data?limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch record types');
      const data = await response.json();
      const types = [...new Set(data.data.map((record: JsonbRecord) => record.record_type))];
      return types.sort();
    },
    enabled: isOpen && !!uploadId,
    refetchOnWindowFocus: false
  });

  const records: JsonbRecord[] = jsonbData?.data || [];
  const totalRecords = jsonbData?.pagination?.total || 0;
  const totalPages = Math.ceil(totalRecords / pageSize);

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

  const getRecordTypeBadgeColor = (recordType: string) => {
    switch (recordType) {
      case 'DT': return 'bg-blue-500 hover:bg-blue-600';
      case 'BH': return 'bg-green-500 hover:bg-green-600';
      case 'P1': return 'bg-orange-500 hover:bg-orange-600';
      case 'P2': return 'bg-purple-500 hover:bg-purple-600';
      default: return 'bg-gray-500 hover:bg-gray-600';
    }
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
            {jsonbData?.tableName && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                {jsonbData.tableName}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          {/* Filters and Pagination */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Select value={selectedRecordType || 'all'} onValueChange={handleRecordTypeChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {allRecordTypes?.map((type: string) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="text-sm text-gray-600">
                Showing {records.length} of {totalRecords} records
                {selectedRecordType && ` (${selectedRecordType} type)`}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePreviousPage}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm px-2">
                Page {currentPage + 1} of {Math.max(totalPages, 1)}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNextPage}
                disabled={currentPage >= totalPages - 1}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Loading and Error States */}
          {isLoading && (
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
              <div className="text-center text-gray-500">
                <FileJson className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No JSONB records found for this upload</p>
                <p className="text-sm">Try encoding the file first</p>
              </div>
            </div>
          )}

          {!isLoading && !error && records.length > 0 && (
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                {records.map((record, index) => (
                  <Card key={record.id} className="border-l-4 border-l-blue-500">
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
                    
                    <CardContent>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}