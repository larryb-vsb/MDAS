import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ArrowUpDown, Building2, CreditCard, Monitor, ExternalLink, Eye, Search, Calendar, X, FileText, Trash2 } from "lucide-react";
import { useLocation, Link } from "wouter";
import { formatTableDate } from "@/lib/date-utils";
import MerchantActivityHeatMap from "@/components/merchants/MerchantActivityHeatMap";
import Tddf1MerchantVolumeTab from "@/components/Tddf1MerchantVolumeTab";

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

export default function MMSMerchants() {
  const [, setLocation] = useLocation();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("tddf");
  
  // State for filters and pagination for TDDF tab
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("totalTransactions");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedMerchant, setSelectedMerchant] = useState<TddfMerchant | null>(null);
  
  // Group selection state
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset page to 1 when search query or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  // Selection handlers
  const handleSelectMerchant = (merchantId: string, checked: boolean) => {
    setSelectedMerchants(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(merchantId);
      } else {
        newSet.delete(merchantId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = merchants.map(m => m.id || m.merchantAccountNumber || m.client_mid);
      setSelectedMerchants(new Set(allIds.filter(Boolean)));
    } else {
      setSelectedMerchants(new Set());
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedMerchants.size === 0) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch('/api/mms/merchants/bulk-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          merchantIds: Array.from(selectedMerchants)
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete merchants');
      }

      toast({
        title: "Success",
        description: `Successfully deleted ${selectedMerchants.size} merchant(s)`,
      });

      // Clear selection and refresh data
      setSelectedMerchants(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/mms/merchants'] });
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete merchants. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Query MMS merchants from imported data
  const { data, isLoading, error } = useQuery<TddfMerchantsResponse>({
    queryKey: ['/api/mms/merchants', currentPage, itemsPerPage, searchQuery, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const response = await fetch(`/api/mms/merchants?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch MMS merchants');
      }
      return response.json();
    }
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const pagination = data?.pagination;
  const merchants = data?.data || [];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              MMS Merchants
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage merchants from TDDF transaction data
            </p>
          </div>
        </div>

        {selectedMerchant ? (
          <MerchantDetailView 
            merchant={selectedMerchant} 
            onBack={() => setSelectedMerchant(null)}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-[600px]">
              <TabsTrigger value="tddf" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                TDDF Merchants
              </TabsTrigger>
              <TabsTrigger value="tddf1" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                TDDF1 Merchants
              </TabsTrigger>
              <TabsTrigger value="ach" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                ACH Merchants
              </TabsTrigger>
            </TabsList>

            {/* Bulk Actions Bar - only show for ACH tab when items are selected */}
            {activeTab === "ach" && selectedMerchants.size > 0 && (
              <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg mt-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedMerchants.size} merchant(s) selected
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? 'Deleting...' : 'Delete Selected'}
                </Button>
              </div>
            )}
            
            <TabsContent value="tddf" className="mt-6">
              <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    TDDF Merchants ({pagination?.totalItems || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Search and Controls */}
                  <div className="flex flex-col space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0 mb-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search merchants by name, account number, or MCC..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-white border-gray-200 focus:border-blue-300 focus:ring-blue-200"
                      />
                    </div>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
                      <SelectTrigger className="w-32 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 per page</SelectItem>
                        <SelectItem value="20">20 per page</SelectItem>
                        <SelectItem value="50">50 per page</SelectItem>
                        <SelectItem value="100">100 per page</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Merchants Table */}
                  {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <p className="text-red-600">Error loading merchants: {error.message}</p>
                    </div>
                  ) : merchants.length === 0 ? (
                    <div className="text-center py-12">
                      <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-500">No merchants found</p>
                    </div>
                  ) : (
                    <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead>
                              <Button
                                variant="ghost"
                                onClick={() => handleSort('merchantName')}
                                className="h-auto p-0 font-medium flex items-center gap-1"
                              >
                                Merchant Name
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                onClick={() => handleSort('merchantAccountNumber')}
                                className="h-auto p-0 font-medium flex items-center gap-1"
                              >
                                Account Number
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                onClick={() => handleSort('totalTransactions')}
                                className="h-auto p-0 font-medium flex items-center gap-1"
                              >
                                Transactions
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                onClick={() => handleSort('totalAmount')}
                                className="h-auto p-0 font-medium flex items-center gap-1"
                              >
                                Total Amount
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                onClick={() => handleSort('terminalCount')}
                                className="h-auto p-0 font-medium flex items-center gap-1"
                              >
                                Terminals
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                onClick={() => handleSort('lastTransactionDate')}
                                className="h-auto p-0 font-medium flex items-center gap-1"
                              >
                                Last Transaction
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            </TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {merchants.map((merchant, index) => (
                            <TableRow 
                              key={index}
                              className="hover:bg-gray-50 transition-colors"
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-blue-500" />
                                  {merchant.merchantName || merchant.name || 'Unknown Merchant'}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {merchant.merchantAccountNumber || merchant.client_mid || 'N/A'}
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {merchant.totalTransactions?.toLocaleString() || '0'}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium text-green-600">
                                {formatCurrency(merchant.totalAmount || merchant.sale_amt || 0)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Monitor className="h-3 w-3 text-gray-400" />
                                  {merchant.terminalCount || 0}
                                </div>
                              </TableCell>
                              <TableCell>
                                {formatTableDate(merchant.lastTransactionDate || merchant.created_at)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedMerchant(merchant)}
                                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Pagination */}
                      {pagination && pagination.totalPages > 1 && (
                        <div className="flex flex-col items-center space-y-4 md:flex-row md:justify-between md:space-y-0 mt-6">
                          <p className="text-sm text-gray-600">
                            Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
                            {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
                            {pagination.totalItems} merchants
                          </p>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                              disabled={currentPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
                              disabled={currentPage === pagination.totalPages}
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
            
            <TabsContent value="tddf1" className="mt-6">
              <Tddf1MerchantVolumeTab />
            </TabsContent>

            <TabsContent value="ach" className="mt-6">
              <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    ACH Merchants ({data?.pagination?.totalItems || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Search and Controls */}
                  <div className="flex flex-col space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0 mb-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search ACH merchants by name, MID, or city..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-white border-gray-200 focus:border-blue-300 focus:ring-blue-200"
                      />
                    </div>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
                      <SelectTrigger className="w-32 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 per page</SelectItem>
                        <SelectItem value="20">20 per page</SelectItem>
                        <SelectItem value="50">50 per page</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ACH Merchants Table */}
                  {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <p className="text-red-600">Error loading ACH merchants: {error.message}</p>
                    </div>
                  ) : merchants.filter(m => m.merchant_type === 'ACH' || true).length === 0 ? (
                    <div className="text-center py-12">
                      <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-500">No ACH merchants found</p>
                      <p className="text-sm text-gray-400 mt-2">Upload VSB merchant files to see ACH merchants here</p>
                    </div>
                  ) : (
                    <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectedMerchants.size === merchants.length && merchants.length > 0}
                                onCheckedChange={handleSelectAll}
                                aria-label="Select all merchants"
                              />
                            </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Client MID</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Sale Amount</TableHead>
                            <TableHead>Credit Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {merchants.filter(m => m.merchant_type === 'ACH' || true).map((merchant: any) => {
                            const merchantId = merchant.id || merchant.client_mid;
                            return (
                              <TableRow 
                                key={merchantId} 
                                className={`hover:bg-gray-50 transition-colors ${
                                  selectedMerchants.has(merchantId) ? 'bg-blue-50' : ''
                                }`}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={selectedMerchants.has(merchantId)}
                                    onCheckedChange={(checked) => handleSelectMerchant(merchantId, checked as boolean)}
                                    aria-label={`Select ${merchant.name}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{merchant.name}</TableCell>
                                <TableCell>{merchant.client_mid}</TableCell>
                                <TableCell>{merchant.city}</TableCell>
                                <TableCell>{merchant.state}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    merchant.status === 'Active' 
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {merchant.status}
                                  </span>
                                </TableCell>
                                <TableCell>{merchant.sale_amt ? formatCurrency(merchant.sale_amt) : '-'}</TableCell>
                                <TableCell>{merchant.credit_amt ? formatCurrency(merchant.credit_amt) : '-'}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6">
                      <div className="text-sm text-gray-700">
                        Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
                        {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
                        {pagination.totalItems} ACH merchants
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={pagination.currentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm font-medium">
                          Page {pagination.currentPage} of {pagination.totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                          disabled={pagination.currentPage === pagination.totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
}

// Merchant Detail View Component
interface MerchantDetailViewProps {
  merchant: TddfMerchant;
  onBack: () => void;
}

function MerchantDetailView({ merchant, onBack }: MerchantDetailViewProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleDateFilter = (date: string | null) => {
    setSelectedDate(date);
    // Switch to transactions tab when date is selected
    if (date) {
      setActiveTab("transactions");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Merchants
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {merchant.merchantName}
          </h1>
          <p className="text-muted-foreground">
            Account: {merchant.merchantAccountNumber}
          </p>
        </div>
      </div>

      {/* Transaction Activity Heat Map - Visible on all tabs */}
      <MerchantActivityHeatMap 
        merchantAccountNumber={merchant.merchantAccountNumber} 
        onDateFilter={handleDateFilter}
        selectedDate={selectedDate}
      />

      {/* Placeholder for detailed merchant information */}
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">Merchant Details</h3>
            <p className="text-gray-500">
              Detailed merchant information and analytics will be displayed here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}