import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, RotateCcw, Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatTableDate } from "@/lib/date-utils";
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

interface TddfRecord {
  id: number;
  txnId: string;
  merchantId: string;
  txnAmount: number;
  txnDate: string | Date;
  txnType: string;
  txnDesc?: string;
  merchantName?: string;
  batchId?: string;
  authCode?: string;
  cardType?: string;
  entryMethod?: string;
  responseCode?: string;
  sourceFileId?: string;
  sourceRowNumber?: number;
  recordedAt: string | Date;
  rawData?: any;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface TddfFilters {
  search: string;
  txnDateFrom: string;
  txnDateTo: string;
  merchantId: string;
}

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100, 500];

export default function TddfPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [detailsRecord, setDetailsRecord] = useState<TddfRecord | null>(null);
  const [filters, setFilters] = useState<TddfFilters>({
    search: "",
    txnDateFrom: "",
    txnDateTo: "",
    merchantId: "",
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
      });

      const response = await fetch(`/api/tddf?${params}`);
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
    if (checked && data?.records) {
      setSelectedRecords(new Set(data.records.map((record: TddfRecord) => record.id)));
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
    });
    setCurrentPage(1);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const records = data?.records || [];
  const totalRecords = data?.total || 0;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TDDF Records</h1>
          <p className="text-muted-foreground">
            Transaction Daily Detail File records from fixed-width format processing
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RotateCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Transaction ID, Reference Number..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">From Date</label>
              <Input
                type="date"
                value={filters.txnDateFrom}
                onChange={(e) => handleFilterChange("txnDateFrom", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">To Date</label>
              <Input
                type="date"
                value={filters.txnDateTo}
                onChange={(e) => handleFilterChange("txnDateTo", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Merchant ID</label>
              <Input
                placeholder="Enter Merchant ID"
                value={filters.merchantId}
                onChange={(e) => handleFilterChange("merchantId", e.target.value)}
              />
            </div>
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

      {/* Records Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>
              TDDF Records ({totalRecords})
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
              {/* Table Header */}
              <div className="flex items-center space-x-4 text-sm font-medium text-muted-foreground border-b pb-2">
                <Checkbox
                  checked={selectedRecords.size === records.length && records.length > 0}
                  onCheckedChange={handleSelectAll}
                  className="ml-4"
                />
                <div className="w-32">Transaction ID</div>
                <div className="w-24">Merchant ID</div>
                <div className="w-28">Amount</div>
                <div className="w-24">Date</div>
                <div className="w-32">Transaction Type</div>
                <div className="w-32">Merchant Name</div>
                <div className="w-20">Actions</div>
              </div>

              {/* Table Rows */}
              {records.map((record: TddfRecord) => (
                <div
                  key={record.id}
                  className="flex items-center space-x-4 text-sm py-3 border-b hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedRecords.has(record.id)}
                    onCheckedChange={(checked) => handleSelectRecord(record.id, checked as boolean)}
                    className="ml-4"
                  />
                  <div className="w-32 font-mono text-xs">
                    {record.txnId}
                  </div>
                  <div className="w-24 font-mono text-xs">
                    {record.merchantId}
                  </div>
                  <div className="w-28 font-medium">
                    {formatCurrency(record.txnAmount)}
                  </div>
                  <div className="w-24 text-xs">
                    {formatTableDate(record.txnDate.toString())}
                  </div>
                  <div className="w-32 font-mono text-xs">
                    {record.txnType}
                  </div>
                  <div className="w-32 text-xs">
                    {record.merchantName || 'N/A'}
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

      {/* Details Modal */}
      <Dialog open={!!detailsRecord} onOpenChange={() => setDetailsRecord(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>TDDF Record Details</DialogTitle>
          </DialogHeader>
          {detailsRecord && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Transaction Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Transaction Information</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Transaction ID</label>
                      <div className="font-mono text-sm">{detailsRecord.txnId}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Transaction Type</label>
                      <div className="font-mono text-sm">{detailsRecord.txnType}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Transaction Amount</label>
                      <div className="font-semibold text-lg">{formatCurrency(detailsRecord.txnAmount)}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Transaction Date</label>
                      <div>{formatTableDate(detailsRecord.txnDate.toString())}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Transaction Description</label>
                      <div className="font-mono text-sm">{detailsRecord.txnDesc || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Authorization Code</label>
                      <div className="font-mono text-sm">{detailsRecord.authCode || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Response Code</label>
                      <div className="font-mono text-sm">{detailsRecord.responseCode || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Merchant Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Merchant Information</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Merchant ID</label>
                      <div className="font-mono text-sm">{detailsRecord.merchantId}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Batch ID</label>
                      <div className="font-mono text-sm">{detailsRecord.batchId || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Merchant Name</label>
                      <div>{detailsRecord.merchantName || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Source File ID</label>
                      <div className="font-mono text-sm">{detailsRecord.sourceFileId || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Card Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Card Information</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Card Type</label>
                      <div className="font-mono text-sm">{detailsRecord.cardType || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Entry Method</label>
                      <div className="font-mono text-sm">{detailsRecord.entryMethod || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Source Row Number</label>
                      <div className="font-mono text-sm">{detailsRecord.sourceRowNumber || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Additional Information</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Created At</label>
                      <div>{formatTableDate(detailsRecord.createdAt.toString())}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Updated At</label>
                      <div>{formatTableDate(detailsRecord.updatedAt.toString())}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Raw Data Available</label>
                      <div>{detailsRecord.rawData ? 'Yes' : 'No'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">System Information</h3>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Recorded At</label>
                    <div>{formatTableDate(detailsRecord.recordedAt.toString())}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}