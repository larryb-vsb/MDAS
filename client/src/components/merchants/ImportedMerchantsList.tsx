import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface ImportedMerchant {
  mid: string;
  name: string;
  dba_name: string;
  mcc: string;
  sales_channel: string;
  zip_code: string;
  edit_date: string;
  updated_by: string;
}

interface ImportedMerchantsResponse {
  data: ImportedMerchant[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export default function ImportedMerchantsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Reset page to 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Query imported merchants
  const { data, isLoading, error, refetch } = useQuery<ImportedMerchantsResponse>({
    queryKey: ['/api/imported-merchants', currentPage, itemsPerPage, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const response = await fetch(`/api/imported-merchants?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch imported merchants');
      }
      return response.json();
    }
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRefresh = () => {
    refetch();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Imported Merchants</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Merchants imported from CSV uploads ({data?.pagination.totalItems || 0} total)
          </p>
        </div>
        <Button 
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading}
          className="hover:bg-blue-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by MID, name, or DBA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
              data-testid="input-search-imported-merchants"
            />
          </div>
        </CardContent>
      </Card>

      {/* Merchants Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isLoading ? 'Loading...' : `${data?.data.length || 0} of ${data?.pagination.totalItems || 0} merchants`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-red-600 dark:text-red-400 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg mb-4">
              Error loading imported merchants: {error.message}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading imported merchants...
            </div>
          ) : data?.data.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No merchants found matching your search.' : 'No imported merchants found.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-mid">MID</TableHead>
                    <TableHead data-testid="header-name">Name</TableHead>
                    <TableHead data-testid="header-dba">DBA Name</TableHead>
                    <TableHead data-testid="header-mcc">MCC</TableHead>
                    <TableHead data-testid="header-sales-channel">Sales Channel</TableHead>
                    <TableHead data-testid="header-zip">ZIP Code</TableHead>
                    <TableHead data-testid="header-edit-date">Last Updated</TableHead>
                    <TableHead data-testid="header-updated-by">Updated By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((merchant, index) => (
                    <TableRow key={merchant.mid} data-testid={`row-merchant-${merchant.mid}`}>
                      <TableCell data-testid={`text-mid-${merchant.mid}`}>
                        <Badge variant="outline" className="font-mono">
                          {merchant.mid}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-name-${merchant.mid}`}>
                        <div className="font-medium">{merchant.name || 'N/A'}</div>
                      </TableCell>
                      <TableCell data-testid={`text-dba-${merchant.mid}`}>
                        {merchant.dba_name || 'N/A'}
                      </TableCell>
                      <TableCell data-testid={`text-mcc-${merchant.mid}`}>
                        <Badge variant="secondary">
                          {merchant.mcc || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-sales-channel-${merchant.mid}`}>
                        {merchant.sales_channel || 'N/A'}
                      </TableCell>
                      <TableCell data-testid={`text-zip-${merchant.mid}`}>
                        {merchant.zip_code || 'N/A'}
                      </TableCell>
                      <TableCell data-testid={`text-edit-date-${merchant.mid}`}>
                        {formatDate(merchant.edit_date)}
                      </TableCell>
                      <TableCell data-testid={`text-updated-by-${merchant.mid}`}>
                        {merchant.updated_by || 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Page {data.pagination.currentPage} of {data.pagination.totalPages}
                {' '}({data.pagination.totalItems} total merchants)
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(data.pagination.currentPage - 1)}
                  disabled={data.pagination.currentPage <= 1}
                  data-testid="button-previous-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(data.pagination.currentPage + 1)}
                  disabled={data.pagination.currentPage >= data.pagination.totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}