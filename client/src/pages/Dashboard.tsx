import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import MainLayout from "@/components/layout/MainLayout";
import DashboardStats from "@/components/dashboard/DashboardStats";
import MerchantList from "@/components/merchants/MerchantList";
import MerchantFilters from "@/components/merchants/MerchantFilters";
import FileUploadModal from "@/components/uploads/FileUploadModal";
import { Button } from "@/components/ui/button";
import { PlusCircle, RefreshCw, Upload } from "lucide-react";
import { DashboardStats as DashboardStatsType } from "@/lib/types";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [uploadFilter, setUploadFilter] = useState("Any time");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);

  // Reset page to 1 when search query, status filter, upload filter, or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, uploadFilter, itemsPerPage]);

  // Fetch dashboard stats
  const { data: stats, isLoading: isLoadingStats } = useQuery<DashboardStatsType>({
    queryKey: ["/api/stats"],
  });

  // Fetch merchants list with filters
  const { data: merchantsData, isLoading: isLoadingMerchants } = useQuery({
    queryKey: ["/api/merchants", statusFilter, uploadFilter, searchQuery, currentPage, itemsPerPage],
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
      
      const res = await fetch(`/api/merchants?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch merchants');
      return res.json();
    }
  });

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const toggleUploadModal = () => {
    setShowUploadModal(!showUploadModal);
  };

  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Delete selected merchants mutation
  const deleteMutation = useMutation({
    mutationFn: async (merchantIds: string[]) => {
      console.log('[FRONTEND DELETE] Attempting to delete merchants:', merchantIds);
      try {
        const response = await apiRequest(`/api/merchants`, { method: 'DELETE', body: { merchantIds } });
        console.log('[FRONTEND DELETE] Delete response:', response);
        return response;
      } catch (error) {
        console.error('[FRONTEND DELETE] Delete error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('[FRONTEND DELETE] Delete successful');
      toast({
        title: "Merchants deleted",
        description: `Successfully deleted ${selectedMerchants.length} merchant${selectedMerchants.length > 1 ? 's' : ''}`,
      });
      setSelectedMerchants([]);
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      console.error('[FRONTEND DELETE] Delete mutation error:', error);
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
      const response = await apiRequest('POST', `/api/merchants/merge`, {
        targetMerchantId, 
        sourceMerchantIds
      });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Merchants merged successfully",
        description: `Merged ${data.merchantsRemoved} merchants into ${data.targetMerchant?.name || 'target merchant'}. Transferred ${data.transactionsTransferred} transactions.`,
      });
      setSelectedMerchants([]);
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to merge merchants: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Handle delete selected merchants
  const handleDeleteSelected = () => {
    if (selectedMerchants.length === 0) return;
    deleteMutation.mutate(selectedMerchants);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };
  
  // Function to refresh merchant data
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/merchants"] })
      ]);
      toast({
        title: "Data refreshed",
        description: "The merchant data has been refreshed.",
        duration: 3000
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Failed to refresh the data. Please try again.",
        variant: "destructive",
        duration: 3000
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Content */}
        <div className="relative">
          <div className="py-4 sm:py-6">
            <div className="mx-auto">
              {/* Page header - Mobile Optimized */}
              <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">Merchant Management</h2>
                  <p className="mt-1 text-xs sm:text-sm text-gray-500">
                    Manage your merchants, upload data, and view statistics
                  </p>
                </div>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3 md:mt-0">
                  <Button
                    variant="outline"
                    onClick={() => navigate('/merchants/new')}
                    className="inline-flex items-center justify-center text-sm"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    New Merchant
                  </Button>
                  <Button
                    onClick={toggleUploadModal}
                    className="inline-flex items-center justify-center text-sm"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Data
                  </Button>
                </div>
              </div>

              {/* Dashboard Stats */}
              <DashboardStats isLoading={isLoadingStats} stats={stats} />

              {/* Filters with Refresh Button */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mt-6">
                <MerchantFilters 
                  statusFilter={statusFilter} 
                  setStatusFilter={setStatusFilter}
                  uploadFilter={uploadFilter}
                  setUploadFilter={setUploadFilter}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                />
                <Button 
                  onClick={refreshData}
                  disabled={isRefreshing}
                  variant="outline" 
                  size="sm"
                  className="ml-auto flex items-center gap-2 whitespace-nowrap"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                </Button>
              </div>

              {/* Merchant List */}
              <MerchantList 
                isLoading={isLoadingMerchants} 
                merchants={merchantsData?.merchants || []}
                pagination={merchantsData?.pagination || {
                  currentPage: 1,
                  totalPages: 1,
                  totalItems: 0,
                  itemsPerPage: itemsPerPage
                }}
                onPageChange={handlePageChange}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={handleItemsPerPageChange}
                selectedMerchants={selectedMerchants}
                setSelectedMerchants={setSelectedMerchants}
                onDeleteSelected={handleDeleteSelected}
                deleteMutation={deleteMutation}
                mergeMutation={mergeMutation}
              />
            </div>
          </div>
        </div>
      </div>

      {/* File Upload Modal */}
      {showUploadModal && (
        <FileUploadModal onClose={toggleUploadModal} />
      )}
    </MainLayout>
  );
}
