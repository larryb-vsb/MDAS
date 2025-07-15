import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import MainLayout from "@/components/layout/MainLayout";
import DashboardStats from "@/components/dashboard/DashboardStats";
import MerchantList from "@/components/merchants/MerchantList";
import MerchantFilters from "@/components/merchants/MerchantFilters";
import FileUploadModal from "@/components/uploads/FileUploadModal";
import { Button } from "@/components/ui/button";
import { PlusCircle, RefreshCw, Upload } from "lucide-react";
import { DashboardStats as DashboardStatsType } from "@/lib/types";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [uploadFilter, setUploadFilter] = useState("Any time");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch dashboard stats
  const { data: stats, isLoading: isLoadingStats } = useQuery<DashboardStatsType>({
    queryKey: ["/api/stats"],
  });

  // Fetch merchants list with filters
  const { data: merchantsData, isLoading: isLoadingMerchants } = useQuery({
    queryKey: ["/api/merchants", statusFilter, uploadFilter, searchQuery, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', '10');
      
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
      <div className="container mx-auto">
        {/* Main Content */}
        <div className="relative">
          <div className="py-6">
            <div className="mx-auto">
              {/* Page header */}
              <div className="md:flex md:items-center md:justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-semibold text-gray-800">Merchant Management</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Manage your merchants, upload data, and view statistics
                  </p>
                </div>
                <div className="flex mt-4 space-x-3 md:mt-0 md:ml-4">
                  <Button
                    variant="outline"
                    onClick={() => navigate('/merchants/new')}
                    className="inline-flex items-center"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    New Merchant
                  </Button>
                  <Button
                    onClick={toggleUploadModal}
                    className="inline-flex items-center"
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
                  itemsPerPage: 10
                }}
                onPageChange={setCurrentPage}
                toggleUploadModal={toggleUploadModal}
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
