import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import MerchantFilters from "@/components/merchants/MerchantFilters";
import MerchantList from "@/components/merchants/MerchantList";
import TddfMerchantsTable from "@/components/tddf/TddfMerchantsTable";
import MccSchemaConfig from "@/components/merchants/MccSchemaConfig";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, Building2, CreditCard, FileText, Settings, Store } from "lucide-react";
import type { Merchant } from "@/lib/types";

interface MerchantsResponse {
  merchants: Merchant[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export default function Merchants() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("all");
  
  // State for filters and pagination
  const [statusFilter, setStatusFilter] = useState("Active/Open");
  const [uploadFilter, setUploadFilter] = useState("Any time");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  
  // State for sorting
  const [sortColumn, setSortColumn] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  
  // Handle URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const status = params.get('status');
    
    if (tab) {
      setActiveTab(tab);
    }
    if (status) {
      setStatusFilter(status);
    }
  }, []);
  
  // Reset page to 1 when search query, status filter, upload filter, or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, uploadFilter, itemsPerPage]);
  
  // Determine merchantType based on active tab
  // MCC merchants are all non-ACH merchants (backend filters by excluding type '3')
  const merchantType = activeTab === "ach" ? "3" : activeTab === "mcc" ? "mcc" : "All";
  
  // Query merchants with filters
  const { data, isLoading, error } = useQuery<MerchantsResponse>({
    queryKey: ['/api/merchants', currentPage, itemsPerPage, statusFilter, uploadFilter, searchQuery, merchantType, sortColumn, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      
      if (statusFilter !== "All") {
        params.append('status', statusFilter);
      }
      
      if (uploadFilter !== "Any time") {
        params.append('lastUpload', uploadFilter);
      }
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      if (merchantType !== "All") {
        params.append('merchantType', merchantType);
      }
      
      if (sortColumn) {
        params.append('sortBy', sortColumn);
        params.append('sortOrder', sortDirection);
      }
      
      const response = await fetch(`/api/merchants?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch merchants');
      }
      return response.json();
    }
  });
  
  // Delete selected merchants mutation
  const deleteMutation = useMutation({
    mutationFn: async (merchantIds: string[]) => {
      console.log('[MERCHANTS DELETE] Attempting to delete merchants:', merchantIds);
      try {
        const response = await apiRequest(`/api/merchants`, { method: 'DELETE', body: { merchantIds } });
        console.log('[MERCHANTS DELETE] Delete response:', response);
        return response;
      } catch (error) {
        console.error('[MERCHANTS DELETE] Delete error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('[MERCHANTS DELETE] Delete successful');
      toast({
        title: "Merchants deleted",
        description: `Successfully deleted ${selectedMerchants.length} merchant${selectedMerchants.length > 1 ? 's' : ''}`,
      });
      setSelectedMerchants([]);
      queryClient.invalidateQueries({ queryKey: ['/api/merchants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error) => {
      console.error('[MERCHANTS DELETE] Delete mutation error:', error);
      toast({
        title: "Error",
        description: `Failed to delete merchants: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Merge merchants mutation
  const mergeMutation = useMutation({
    mutationFn: async ({ targetMerchantId, sourceMerchantIds }: { targetMerchantId: string; sourceMerchantIds: string[] }) => {
      const response = await apiRequest<{
        merchantsRemoved: number;
        targetMerchant: { name: string };
        transactionsTransferred: number;
      }>(`/api/merchants/merge`, {
        method: 'POST',
        body: {
          targetMerchantId, 
          sourceMerchantIds
        }
      });
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Merchants merged successfully",
        description: `Merged ${data.merchantsRemoved} merchants into ${data.targetMerchant?.name || 'target merchant'}. Transferred ${data.transactionsTransferred} transactions.`,
      });
      setSelectedMerchants([]);
      queryClient.invalidateQueries({ queryKey: ['/api/merchants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to merge merchants: ${error}`,
        variant: "destructive",
      });
    },
  });
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };
  
  const handleDeleteSelected = () => {
    if (selectedMerchants.length > 0) {
      deleteMutation.mutate(selectedMerchants);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/merchants'] });
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    toast({
      title: "Refreshing",
      description: "Reloading merchant data...",
    });
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };
  
  return (
    <MainLayout>
      <div className="container py-6 mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold">Merchants</h1>
          <div className="flex space-x-2">
            <Button 
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading}
              className="hover:bg-blue-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {(activeTab === "all" || activeTab === "mcc" || activeTab === "ach") && (
              <Button 
                onClick={() => setLocation('/merchants/new')}
                className="bg-gradient-to-r from-blue-500 to-blue-700"
              >
                Add Merchant
              </Button>
            )}
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 max-w-[1000px]">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              All Merchants
            </TabsTrigger>
            <TabsTrigger value="mcc" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              MCC Merchants
            </TabsTrigger>
            <TabsTrigger value="ach" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              ACH Merchants
            </TabsTrigger>
            <TabsTrigger value="tddf" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              TDDF Merchants
            </TabsTrigger>
            <TabsTrigger value="mcc-config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              MCC TSYS Config
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-6">
            <MerchantFilters
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              uploadFilter={uploadFilter}
              setUploadFilter={setUploadFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
            
            <MerchantList
              merchants={data?.merchants || []}
              pagination={data?.pagination || {
                currentPage: 1,
                totalPages: 1,
                totalItems: 0,
                itemsPerPage: itemsPerPage
              }}
              isLoading={isLoading}
              onPageChange={handlePageChange}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={handleItemsPerPageChange}
              selectedMerchants={selectedMerchants}
              setSelectedMerchants={setSelectedMerchants}
              onDeleteSelected={handleDeleteSelected}
              deleteMutation={deleteMutation}
              mergeMutation={mergeMutation}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </TabsContent>
          
          <TabsContent value="mcc" className="mt-6">
            <MerchantFilters
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              uploadFilter={uploadFilter}
              setUploadFilter={setUploadFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
            
            <MerchantList
              merchants={data?.merchants || []}
              pagination={data?.pagination || {
                currentPage: 1,
                totalPages: 1,
                totalItems: 0,
                itemsPerPage: itemsPerPage
              }}
              isLoading={isLoading}
              onPageChange={handlePageChange}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={handleItemsPerPageChange}
              selectedMerchants={selectedMerchants}
              setSelectedMerchants={setSelectedMerchants}
              onDeleteSelected={handleDeleteSelected}
              deleteMutation={deleteMutation}
              mergeMutation={mergeMutation}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </TabsContent>
          
          <TabsContent value="ach" className="mt-6">
            <MerchantFilters
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              uploadFilter={uploadFilter}
              setUploadFilter={setUploadFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
            
            <MerchantList
              merchants={data?.merchants || []}
              pagination={data?.pagination || {
                currentPage: 1,
                totalPages: 1,
                totalItems: 0,
                itemsPerPage: itemsPerPage
              }}
              isLoading={isLoading}
              onPageChange={handlePageChange}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={handleItemsPerPageChange}
              selectedMerchants={selectedMerchants}
              setSelectedMerchants={setSelectedMerchants}
              onDeleteSelected={handleDeleteSelected}
              deleteMutation={deleteMutation}
              mergeMutation={mergeMutation}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </TabsContent>
          
          
          <TabsContent value="tddf" className="mt-6">
            <TddfMerchantsTable />
          </TabsContent>

          <TabsContent value="mcc-config" className="mt-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">MCC TSYS Merchant Configuration</h2>
              <p className="text-gray-600">Manage which TSYS merchant fields are enabled in the MMS system</p>
            </div>
            <MccSchemaConfig />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}