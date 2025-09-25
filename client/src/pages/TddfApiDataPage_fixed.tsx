function RawDataTab() {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [recordType, setRecordType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showRecords, setShowRecords] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);
  
  // Tree view state
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('flat');
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  
  // Selection state for bulk operations
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  
  // Pagination options
  const pageSizeOptions = [
    { value: 10, label: '10' },
    { value: 100, label: '100' },
    { value: 500, label: '500' },
    { value: 1000, label: '1K' },
    { value: 3000, label: '3K' },
    { value: 5000, label: '5K' }
  ];

  // Tree view supporting functions
  const getRecordTypeBadgeColor = (recordType: string) => {
    switch (recordType) {
      case '01': case 'BH': return 'bg-green-500 hover:bg-green-600';
      case '47': case 'DT': return 'bg-blue-500 hover:bg-blue-600';
      case '98': case 'TR': return 'bg-red-500 hover:bg-red-600';
      case 'P1': return 'bg-purple-500 hover:bg-purple-600';
      case 'P2': return 'bg-purple-600 hover:bg-purple-700';
      case 'G2': return 'bg-indigo-500 hover:bg-indigo-600';
      case 'A1': return 'bg-yellow-500 hover:bg-yellow-600';
      case 'E1': return 'bg-pink-500 hover:bg-pink-600';
      case 'LG': return 'bg-teal-500 hover:bg-teal-600';
      case '10': return 'bg-green-600 hover:bg-green-700';
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

  const formatFieldValue = (key: string, value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string' && value.trim() === '') return '-';
    
    if (key === 'merchantAccountNumber' && value) {
      return value.toString().trim();
    }
    
    if (typeof value === 'number') {
      if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('fee')) {
        return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      }
      return value.toLocaleString();
    }
    
    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      } catch (e) {
        // Not a valid date, return as string
      }
    }
    
    return value.toString();
  };

  // Group records into hierarchical structure
  const groupRecordsHierarchically = (records: any[]) => {
    console.log(`[TREE-VIEW] Grouping ${records.length} records hierarchically`);
    
    const recordTypes = Array.from(new Set(records.map(r => r.record_type)));
    console.log(`[TREE-VIEW] Record types found: ${recordTypes.join(', ')}`);
    
    const batches: Array<{
      batchHeader: any | null;
      transactions: Array<{
        dtRecord: any;
        extensions: any[];
      }>;
      trailer: any | null;
    }> = [];

    let currentBatch: any = null;
    let currentTransaction: any = null;

    for (const record of records) {
      const recordType = record.record_type;

      if (['01', 'BH', '10', '02'].includes(recordType)) {
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
      else if (['47', 'DT'].includes(recordType)) {
        if (!currentBatch) {
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
        console.log(`[TREE-VIEW] Added transaction record type ${recordType} to batch`);
      }
      else if (['98', 'TR', '99'].includes(recordType)) {
        if (currentBatch) {
          currentBatch.trailer = record;
        }
      }
      else {
        if (currentTransaction) {
          currentTransaction.extensions.push(record);
          console.log(`[TREE-VIEW] Added extension record type ${recordType} to current transaction`);
        }
      }
    }

    if (currentBatch) {
      batches.push(currentBatch);
    }

    console.log(`[TREE-VIEW] Created ${batches.length} batches`);
    return batches;
  };

  // Toggle handlers
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

  // Selection handlers for bulk operations
  const handleSelectRecord = (recordId: number) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedRecords(newSelected);
    
    // Update select all state
    if (newSelected.size === 0) {
      setIsSelectAllChecked(false);
    } else if (newSelected.size === records.length) {
      setIsSelectAllChecked(true);
    }
  };

  const handleSelectAll = () => {
    if (isSelectAllChecked || selectedRecords.size === records.length) {
      // Deselect all
      setSelectedRecords(new Set());
      setIsSelectAllChecked(false);
    } else {
      // Select all visible records
      const allRecordIds = new Set(records.map((record: any) => record.id) as number[]);
      setSelectedRecords(allRecordIds);
      setIsSelectAllChecked(true);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.size === 0) {
      toast({
        title: "No Records Selected",
        description: "Please select records to delete.",
        variant: "destructive"
      });
      return;
    }

    try {
      const recordIds = Array.from(selectedRecords);
      await apiRequest('/api/tddf-api/records/bulk-delete', {
        method: 'DELETE',
        body: JSON.stringify({ recordIds }),
        headers: { 'Content-Type': 'application/json' }
      });

      toast({
        title: "Records Deleted",
        description: `Successfully deleted ${recordIds.length} records.`,
      });

      // Refresh data and reset selection
      refetch();
      setSelectedRecords(new Set());
      setIsSelectAllChecked(false);
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete records.",
        variant: "destructive"
      });
    }
  };

  // Data fetching
  const { data: rawData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/tddf-api/all-records', { 
      limit: pageSize, 
      offset: currentPage * pageSize,
      recordType: recordType === 'all' ? undefined : recordType,
      search: searchQuery || undefined
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });
      
      if (recordType !== 'all') {
        params.append('recordType', recordType);
      }
      
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      return await apiRequest(`/api/tddf-api/all-records?${params}`);
    },
    enabled: showRecords,
    refetchOnWindowFocus: false
  });

  const summary = (rawData as any)?.summary || {
    totalRecords: 0,
    bhRecords: 0,
    dtRecords: 0,
    totalFiles: 0
  };

  const records = (rawData as any)?.data || [];
  const totalPages = (rawData as any)?.pagination?.total ? Math.ceil((rawData as any).pagination.total / pageSize) : 0;

  const handleShowAllRecords = () => {
    setShowRecords(true);
    setCurrentPage(0);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(0);
  };

  const handleSearch = () => {
    setCurrentPage(0);
    refetch();
  };

  const formatRecordContent = (record: any) => {
    if (record.parsed_data && Object.keys(record.parsed_data).length > 0) {
      return Object.entries(record.parsed_data)
        .slice(0, 3) // Show first 3 parsed fields
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
    }
    return record.raw_data ? record.raw_data.substring(0, 100) + '...' : 'No data';
  };

  return (
    <div className="space-y-6">
      {/* This will be the rest of the RawDataTab implementation */}
      <div>Raw Data Tab - Implementation in progress</div>
    </div>
  );
}