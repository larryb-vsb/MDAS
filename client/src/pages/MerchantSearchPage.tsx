import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, FileText, Calendar, Hash, Eye } from 'lucide-react';
import { format } from 'date-fns';

interface MerchantSearchRecord {
  id: number;
  uploadId: number;
  filename: string;
  recordType: string;
  lineNumber: number;
  merchantAccount: string;
  extractedFields: Record<string, any>;
  createdAt: string;
  tddfProcessingDatetime?: string;
  parsedDatetime?: string;
  recordIdentifier: string;
  fieldCount: number;
}

interface MerchantAccount {
  accountNumber: string;
  recordCount: number;
  recordTypes: number;
  fileCount: number;
  firstSeen: string;
  lastSeen: string;
}

interface SearchFilters {
  account: string;
  recordType: string;
  filename: string;
  limit: number;
}

const RECORD_TYPE_OPTIONS = [
  { value: 'all', label: 'All Record Types' },
  { value: 'BH', label: 'BH - Batch Header' },
  { value: 'DT', label: 'DT - Detail Transaction' },
  { value: 'P1', label: 'P1 - Purchasing Card 1' },
  { value: 'P2', label: 'P2 - Purchasing Card 2' },
  { value: 'G2', label: 'G2 - Geographic Data' },
];

const LIMIT_OPTIONS = [
  { value: 25, label: '25 Records' },
  { value: 50, label: '50 Records' },
  { value: 100, label: '100 Records' },
  { value: 250, label: '250 Records' },
];

export default function MerchantSearchPage() {
  const [filters, setFilters] = useState<SearchFilters>({
    account: '',
    recordType: 'all',
    filename: 'all',
    limit: 100
  });
  
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<MerchantSearchRecord | null>(null);

  // Search merchant records
  const { 
    data: searchResults, 
    isLoading: isSearching,
    error: searchError
  } = useQuery({
    queryKey: ['merchant-search', filters, searchTrigger],
    queryFn: async () => {
      if (!filters.account.trim()) {
        return null;
      }
      
      const params = new URLSearchParams();
      params.set('account', filters.account.trim());
      params.set('recordType', filters.recordType);
      params.set('filename', filters.filename);
      params.set('limit', filters.limit.toString());
      
      const response = await fetch(`/api/tddf-json/search-merchant?${params}`);
      if (!response.ok) {
        throw new Error('Failed to search merchant records');
      }
      return response.json();
    },
    enabled: searchTrigger > 0 && filters.account.trim().length > 0,
  });

  // Get merchant accounts for autocomplete suggestions
  const { data: merchantAccounts } = useQuery({
    queryKey: ['merchant-accounts', filters.account],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('search', filters.account.trim());
      params.set('limit', '20');
      
      const response = await fetch(`/api/tddf-json/merchant-accounts?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch merchant accounts');
      }
      return response.json();
    },
    enabled: filters.account.trim().length >= 3,
  });

  const handleSearch = useCallback(() => {
    if (filters.account.trim()) {
      setSearchTrigger(prev => prev + 1);
    }
  }, [filters.account]);

  const handleAccountSelect = useCallback((account: string) => {
    setFilters(prev => ({ ...prev, account }));
    setTimeout(() => {
      setSearchTrigger(prev => prev + 1);
    }, 100);
  }, []);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateStr;
    }
  };

  const getRecordTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'BH': return 'default';
      case 'DT': return 'secondary';
      case 'P1': return 'outline';
      case 'P2': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Search className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold">Merchant Account Search</h1>
          <p className="text-gray-600">Search and analyze TDDF records by merchant account number</p>
        </div>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle>Search Filters</CardTitle>
          <CardDescription>
            Enter a merchant account number to search across all TDDF records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Merchant Account Input with Autocomplete */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Merchant Account Number</label>
              <div className="relative">
                <Input
                  placeholder="e.g., 0675900000002881"
                  value={filters.account}
                  onChange={(e) => setFilters(prev => ({ ...prev, account: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pr-10"
                />
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
              
              {/* Autocomplete Suggestions */}
              {merchantAccounts?.accounts?.length > 0 && (
                <Card className="absolute z-10 mt-1 max-h-48 overflow-y-auto">
                  <CardContent className="p-2">
                    {merchantAccounts.accounts.map((account: MerchantAccount) => (
                      <div
                        key={account.accountNumber}
                        className="cursor-pointer p-2 hover:bg-gray-100 rounded text-sm"
                        onClick={() => handleAccountSelect(account.accountNumber)}
                      >
                        <div className="font-medium">{account.accountNumber}</div>
                        <div className="text-gray-500">
                          {account.recordCount} records • {account.fileCount} files
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Record Type Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Record Type</label>
              <Select value={filters.recordType} onValueChange={(value) => setFilters(prev => ({ ...prev, recordType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filename Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Filename Filter</label>
              <Input
                placeholder="Part of filename (optional)"
                value={filters.filename === 'all' ? '' : filters.filename}
                onChange={(e) => setFilters(prev => ({ ...prev, filename: e.target.value || 'all' }))}
              />
            </div>

            {/* Limit */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Results Limit</label>
              <Select value={filters.limit.toString()} onValueChange={(value) => setFilters(prev => ({ ...prev, limit: parseInt(value) }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMIT_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            onClick={handleSearch} 
            disabled={!filters.account.trim() || isSearching}
            className="w-full md:w-auto"
          >
            <Search className="h-4 w-4 mr-2" />
            {isSearching ? 'Searching...' : 'Search Records'}
          </Button>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchError && (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="text-red-600">
              Error: {searchError instanceof Error ? searchError.message : 'Unknown error occurred'}
            </div>
          </CardContent>
        </Card>
      )}

      {searchResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Search Results for: {searchResults.merchantAccount}
            </CardTitle>
            <CardDescription>
              Found {searchResults.totalRecords} records
              {searchResults.appliedFilters.recordType !== 'all' && ` (filtered by ${searchResults.appliedFilters.recordType})`}
              {searchResults.appliedFilters.filename !== 'all' && ` (filename contains "${searchResults.appliedFilters.filename}")`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Summary Stats */}
            {(Object.keys(searchResults.recordTypeSummary).length > 0 || Object.keys(searchResults.filenameSummary).length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Record Types */}
                {Object.keys(searchResults.recordTypeSummary).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Record Types Found</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(searchResults.recordTypeSummary).map(([type, count]) => (
                        <Badge key={type} variant={getRecordTypeBadgeVariant(type)}>
                          {type}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files */}
                {Object.keys(searchResults.filenameSummary).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Files Containing Records</h4>
                    <div className="text-sm text-gray-600 max-h-20 overflow-y-auto">
                      {Object.entries(searchResults.filenameSummary).map(([filename, count]) => (
                        <div key={filename} className="flex justify-between">
                          <span className="truncate mr-2">{filename}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Results Table */}
            {searchResults.records.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record Type</TableHead>
                      <TableHead>Line #</TableHead>
                      <TableHead>Filename</TableHead>
                      <TableHead>Processing Date</TableHead>
                      <TableHead>Fields</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.records.map((record: MerchantSearchRecord) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Badge variant={getRecordTypeBadgeVariant(record.recordType)}>
                            {record.recordType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {record.lineNumber}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="truncate max-w-48" title={record.filename}>
                            {record.filename}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {formatDateTime(record.tddfProcessingDatetime || record.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{record.fieldCount} fields</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedRecord(record)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No records found for merchant account: {searchResults.merchantAccount}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Record Detail Modal */}
      {selectedRecord && (
        <Card className="fixed inset-4 z-50 overflow-auto bg-white shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Record Details</CardTitle>
              <CardDescription>
                {selectedRecord.recordType} record from line {selectedRecord.lineNumber}
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={() => setSelectedRecord(null)}>
              ✕
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <strong>Merchant Account:</strong> {selectedRecord.merchantAccount}
              </div>
              <div>
                <strong>Record Type:</strong> {selectedRecord.recordType}
              </div>
              <div>
                <strong>Line Number:</strong> {selectedRecord.lineNumber}
              </div>
              <div>
                <strong>Filename:</strong> {selectedRecord.filename}
              </div>
              <div>
                <strong>Processing Date:</strong> {formatDateTime(selectedRecord.tddfProcessingDatetime)}
              </div>
              <div>
                <strong>Field Count:</strong> {selectedRecord.fieldCount}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Extracted Fields:</h4>
              <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-auto">
                <pre className="text-sm">
                  {JSON.stringify(selectedRecord.extractedFields, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}