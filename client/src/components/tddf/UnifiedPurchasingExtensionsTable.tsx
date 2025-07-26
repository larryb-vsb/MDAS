import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTableDate } from "@/lib/date-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TddfPurchasingExtension, TddfPurchasingExtension2 } from "@shared/schema";

interface UnifiedPurchasingRecord {
  id: number;
  type: 'P1' | 'P2';
  sequenceNumber?: string | null;
  recordIdentifier?: string | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
  freightAmount?: number | null;
  dutyAmount?: number | null;
  purchaseIdentifier?: string | null;
  productCode?: string | null;
  itemDescription?: string | null;
  itemQuantity?: number | null;
  unitCost?: number | null;
  lineItemTotal?: number | null;
  createdAt?: string | null;
  [key: string]: any; // For additional fields from both record types
}

export default function UnifiedPurchasingExtensionsTable() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const limit = 50;

  // Fetch P1 records
  const { data: p1Data, isLoading: p1Loading, refetch: refetchP1 } = useQuery({
    queryKey: ["/api/tddf/purchasing-extensions", page, limit, refreshKey],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      const response = await fetch(`/api/tddf/purchasing-extensions?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch P1 records');
      return response.json();
    },
  });

  // Fetch P2 records
  const { data: p2Data, isLoading: p2Loading, refetch: refetchP2 } = useQuery({
    queryKey: ["/api/tddf/purchasing-extensions-2", page, limit, refreshKey],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      const response = await fetch(`/api/tddf/purchasing-extensions-2?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch P2 records');
      return response.json();
    },
  });

  const isLoading = p1Loading || p2Loading;

  // Combine and process data from both record types
  const unifiedRecords: UnifiedPurchasingRecord[] = [];
  
  if (p1Data?.data) {
    p1Data.data.forEach((record: any) => {
      unifiedRecords.push({
        ...record,
        type: 'P1' as const,
      } as UnifiedPurchasingRecord);
    });
  }

  if (p2Data?.data) {
    p2Data.data.forEach((record: any) => {
      unifiedRecords.push({
        ...record,
        type: 'P2' as const,
      } as UnifiedPurchasingRecord);
    });
  }

  // Filter records based on search term
  const filteredRecords = unifiedRecords.filter(record => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      record.sequenceNumber?.toLowerCase().includes(searchLower) ||
      record.purchaseIdentifier?.toLowerCase().includes(searchLower) ||
      record.productCode?.toLowerCase().includes(searchLower) ||
      record.itemDescription?.toLowerCase().includes(searchLower) ||
      record.type.toLowerCase().includes(searchLower)
    );
  });

  // Calculate total counts and pagination info
  const totalP1 = p1Data?.pagination?.totalItems || 0;
  const totalP2 = p2Data?.pagination?.totalItems || 0;
  const totalRecords = totalP1 + totalP2;
  const totalPages = Math.max(p1Data?.pagination?.totalPages || 1, p2Data?.pagination?.totalPages || 1);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    refetchP1();
    refetchP2();
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-medium">
              Purchasing Extensions (P1 & P2 Records)
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Combined view of P1 ({totalP1.toLocaleString()}) and P2 ({totalP2.toLocaleString()}) purchasing extension records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Sequence #</TableHead>
                    <TableHead>Purchase ID</TableHead>
                    <TableHead>Tax Amount</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Freight</TableHead>
                    <TableHead>Product/Item</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center">
                        {searchTerm ? "No records match your search." : "No purchasing extension records found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={`${record.type}-${record.id}`}>
                        <TableCell>
                          <Badge 
                            variant={record.type === 'P1' ? 'default' : 'secondary'}
                            className={record.type === 'P1' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-500 hover:bg-purple-600'}
                          >
                            {record.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.sequenceNumber || 'N/A'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.purchaseIdentifier || record.productCode || 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.taxAmount ? `$${record.taxAmount.toFixed(2)}` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.discountAmount ? `$${record.discountAmount.toFixed(2)}` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.freightAmount ? `$${record.freightAmount.toFixed(2)}` : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {record.itemDescription || record.productCode || 'N/A'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {record.lineItemTotal ? `$${record.lineItemTotal.toFixed(2)}` : 
                           record.unitCost ? `$${record.unitCost.toFixed(2)}` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.createdAt ? formatTableDate(record.createdAt) : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between space-x-2 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing page {page} of {totalPages} ({totalRecords.toLocaleString()} total records)
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}