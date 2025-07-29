import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Database, FileJson, ArrowUpDown, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import MainLayout from "@/components/layout/MainLayout";
import SimpleActivityHeatMap from "@/components/shared/SimpleActivityHeatMap";
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

  // Fetch activity data for heat map (DT records only) with caching (staggered after records)
  const { data: activityData } = useQuery<ActivityResponse>({
    queryKey: ['/api/tddf-json/activity'],
    queryFn: () => apiRequest('/api/tddf-json/activity'),
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes - heat map data changes slowly
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    enabled: !!recordsData, // Only load after records are loaded to further stagger API calls
  });

  // Fetch performance statistics for large dataset recommendations
  const { data: performanceStats } = useQuery<any>({
    queryKey: ['/api/tddf-json/performance-stats'],
    queryFn: () => apiRequest('/api/tddf-json/performance-stats'),
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes - performance stats change slowly
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    enabled: !!stats, // Only load after basic stats are loaded
  });



  // Transform activity data for heat map
  const heatMapData = useMemo(() => {
    if (!activityData?.records) return [];
    
    return activityData.records.map((record: any) => ({
      date: record.transaction_date, // Heat map expects 'date' not 'transaction_date'
      count: parseInt(record.transaction_count) || 0
    }));
  }, [activityData]);

  const handleRecordClick = (record: TddfJsonRecord) => {
    setSelectedRecord(record);
  };

  const handleDateClick = (date: string) => {
    setDateFilter(date);
    setCurrentPage(1);
  };

  const clearDateFilter = () => {
    setDateFilter('');
    setCurrentPage(1);
  };



  const formatAmount = (amount: string | number | undefined): string => {
    if (!amount) return 'N/A';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'N/A';
    return `$${numAmount.toFixed(2)}`;
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy');
    } catch {
      return dateStr;
    }
  };

  const getRecordTypeBadgeClass = (recordType: string): string => {
    return RECORD_TYPE_COLORS[recordType as keyof typeof RECORD_TYPE_COLORS] || 
           'bg-gray-500/10 text-gray-700 border-gray-200';
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



        {/* Activity Heat Map */}
        {heatMapData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Transaction Activity Heat Map
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Daily transaction volume from JSON records (click dates to filter)
              </p>
            </CardHeader>
            <CardContent>
              <SimpleActivityHeatMap 
                data={heatMapData}
                title="DT Transaction Activity" 
                description="Daily transaction activity from TDDF JSON records (DT records only)"
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
        )}

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
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Creation Date</SelectItem>
                    <SelectItem value="record_type">Record Type</SelectItem>
                    <SelectItem value="transaction_date">Transaction Date</SelectItem>
                    <SelectItem value="transaction_amount">Amount</SelectItem>
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">All Records</TabsTrigger>
            <TabsTrigger value="DT">DT - Transactions</TabsTrigger>
            <TabsTrigger value="BH">BH - Batch Headers</TabsTrigger>
            <TabsTrigger value="P1">P1 - Purchasing</TabsTrigger>
            <TabsTrigger value="P2">P2 - Purchasing 2</TabsTrigger>
            <TabsTrigger value="other">Other Types</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-6">
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
                      <div className="bg-muted/50 px-4 py-2 grid grid-cols-8 gap-4 text-sm font-medium">
                        <div>Record Type</div>
                        <div>File</div>
                        <div>Transaction Date</div>
                        <div>Amount</div>
                        <div>Merchant</div>
                        <div>Terminal</div>
                        <div>Card Type</div>
                        <div>Actions</div>
                      </div>
                      {recordsData?.records?.map((record: TddfJsonRecord) => (
                        <div key={record.id} className="px-4 py-3 grid grid-cols-8 gap-4 border-t items-center text-sm">
                          <div>
                            <Badge className={getRecordTypeBadgeClass(record.record_type)}>
                              {record.record_type}
                            </Badge>
                          </div>
                          <div className="truncate text-xs font-mono">
                            {record.upload_id}
                          </div>
                          <div>
                            {formatDate(record.extracted_fields?.transactionDate)}
                          </div>
                          <div className="font-mono">
                            {formatAmount(record.extracted_fields?.transactionAmount)}
                          </div>
                          <div className="truncate">
                            {record.extracted_fields?.merchantName || 'N/A'}
                          </div>
                          <div className="font-mono text-xs">
                            {record.extracted_fields?.terminalId || 'N/A'}
                          </div>
                          <div>
                            {record.extracted_fields?.cardType ? (
                              <Badge variant="outline" className="text-xs">
                                {record.extracted_fields.cardType}
                              </Badge>
                            ) : 'N/A'}
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Record Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Record ID:</span>
                        <span className="font-mono">{selectedRecord.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Upload ID:</span>
                        <span className="font-mono text-xs">{selectedRecord.upload_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Line Number:</span>
                        <span>{selectedRecord.line_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Filename:</span>
                        <span className="font-mono text-xs">{selectedRecord.filename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created:</span>
                        <span>{format(new Date(selectedRecord.created_at), 'PPpp')}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Extracted Fields</h3>
                    <ScrollArea className="h-64">
                      <div className="space-y-2 text-sm">
                        {Object.entries(selectedRecord.extracted_fields).map(([key, value]) => (
                          <div key={key} className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}:
                            </span>
                            <span className="font-mono text-xs break-all max-w-48">
                              {value?.toString() || 'N/A'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Raw TDDF Line</h3>
                  <ScrollArea className="h-96">
                    <pre className="text-xs font-mono bg-muted p-4 rounded whitespace-pre-wrap break-all">
                      {selectedRecord.raw_line}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}