import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Search, ExternalLink } from "lucide-react";
import { Link } from "wouter";
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
import { formatTableDate } from "@/lib/date-utils";

interface TddfMerchant {
  merchantName: string;
  merchantAccountNumber: string;
  mccCode: string;
  transactionTypeIdentifier: string;
  terminalCount: number;
  totalTransactions: number;
  totalAmount: number;
  lastTransactionDate: string;
  posRelativeCode?: string;
}

interface TddfMerchantsResponse {
  data: TddfMerchant[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export default function TddfMerchantsTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("totalTransactions");
  const [sortOrder, setSortOrder] = useState("desc");
  const [detailsRecord, setDetailsRecord] = useState<TddfMerchant | null>(null);

  const { data, isLoading, error, refetch } = useQuery<TddfMerchantsResponse>({
    queryKey: ["/api/tddf/merchants", { 
      page: currentPage, 
      limit: itemsPerPage, 
      search, 
      sortBy, 
      sortOrder 
    }],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return formatTableDate(date.toISOString());
    } catch (error) {
      return 'N/A';
    }
  };

  const merchants = data?.data || [];
  const totalRecords = data?.pagination?.totalItems || 0;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  const handleSearch = (value: string) => {
    setSearch(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>
            TDDF Merchants ({totalRecords})
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
                {[10, 20, 50, 100].map((option) => (
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
        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search merchants, MCC code, account number..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merchantName">Merchant Name</SelectItem>
                <SelectItem value="merchantAccountNumber">Account Number</SelectItem>
                <SelectItem value="mccCode">MCC Code</SelectItem>
                <SelectItem value="totalTransactions">Total Transactions</SelectItem>
                <SelectItem value="totalAmount">Total Amount</SelectItem>
                <SelectItem value="lastTransactionDate">Last Transaction</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Asc</SelectItem>
                <SelectItem value="desc">Desc</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">Loading TDDF merchants...</div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">
            Error loading merchants: {error.message}
          </div>
        ) : merchants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No merchants found
          </div>
        ) : (
          <div className="space-y-4">
            {/* Merchants Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3">Merchant Name</th>
                    <th className="text-left p-3">Account Number</th>
                    <th className="text-left p-3">MCC Code</th>
                    <th className="text-left p-3">Transaction Type</th>
                    <th className="text-left p-3">Terminal Count</th>
                    <th className="text-left p-3">Total Transactions</th>
                    <th className="text-left p-3">Total Amount</th>
                    <th className="text-left p-3">Last Transaction</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((merchant, index) => (
                    <tr key={`${merchant.merchantAccountNumber}-${index}`} className="border-b hover:bg-muted/20">
                      <td className="p-3 font-medium max-w-48 truncate">
                        {merchant.merchantName || 'N/A'}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {merchant.merchantAccountNumber || 'N/A'}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {merchant.mccCode || 'N/A'}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {merchant.transactionTypeIdentifier || 'N/A'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{merchant.terminalCount}</span>
                          {merchant.terminalCount > 0 && merchant.posRelativeCode && (
                            <Link href={`/terminals?search=${merchant.posRelativeCode}`}>
                              <Button variant="outline" size="sm" className="h-6 w-6 p-0">
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono">
                        {merchant.totalTransactions.toLocaleString()}
                      </td>
                      <td className="p-3 font-mono">
                        {formatCurrency(merchant.totalAmount)}
                      </td>
                      <td className="p-3 text-xs">
                        {formatDate(merchant.lastTransactionDate)}
                      </td>
                      <td className="p-3">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setDetailsRecord(merchant)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords} merchants
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
          </div>
        )}

        {/* Details Modal */}
        <Dialog open={!!detailsRecord} onOpenChange={() => setDetailsRecord(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>TDDF Merchant Details</DialogTitle>
            </DialogHeader>
            {detailsRecord && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Merchant Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Merchant Name:</span>
                        <p className="font-medium">{detailsRecord.merchantName || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Account Number:</span>
                        <p className="font-mono text-sm">{detailsRecord.merchantAccountNumber || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">MCC Code:</span>
                        <p className="font-mono text-sm">{detailsRecord.mccCode || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Transaction Type Identifier:</span>
                        <p className="font-mono text-sm">{detailsRecord.transactionTypeIdentifier || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Terminal Count:</span>
                        <p className="font-mono">{detailsRecord.terminalCount}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Total Transactions:</span>
                        <p className="font-mono">{detailsRecord.totalTransactions.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
                        <p className="font-mono text-lg">{formatCurrency(detailsRecord.totalAmount)}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Last Transaction Date:</span>
                        <p className="text-sm">{formatDate(detailsRecord.lastTransactionDate)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {detailsRecord.posRelativeCode && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Terminal Integration</h3>
                    <div className="bg-muted/30 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">POS Relative Code:</p>
                          <p className="font-mono text-sm">{detailsRecord.posRelativeCode}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Used for linking with terminal records via POS Merchant Number
                          </p>
                        </div>
                        <Link href={`/terminals?search=${detailsRecord.posRelativeCode}`}>
                          <Button variant="outline">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Terminals
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}