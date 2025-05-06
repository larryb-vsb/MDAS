import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import DashboardStats from "@/components/dashboard/DashboardStats";
import MerchantList from "@/components/merchants/MerchantList";
import MerchantFilters from "@/components/merchants/MerchantFilters";
import FileUploadModal from "@/components/uploads/FileUploadModal";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { DashboardStats as DashboardStatsType } from "@/lib/types";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [uploadFilter, setUploadFilter] = useState("Any time");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch dashboard stats
  const { data: stats, isLoading: isLoadingStats } = useQuery<DashboardStatsType>({
    queryKey: ["/api/stats"],
  });

  // Fetch merchants list with filters
  const { data: merchantsData, isLoading: isLoadingMerchants } = useQuery({
    queryKey: ["/api/merchants", statusFilter, uploadFilter, currentPage],
  });

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const toggleUploadModal = () => {
    setShowUploadModal(!showUploadModal);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar isVisible={showMobileMenu} className="hidden md:flex md:flex-shrink-0" />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        {/* Header */}
        <Header 
          toggleMobileMenu={toggleMobileMenu} 
          toggleUploadModal={toggleUploadModal} 
        />

        {/* Main Content */}
        <main className="relative flex-1 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="px-4 mx-auto max-w-7xl sm:px-6 md:px-8">
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
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload Data
                  </Button>
                </div>
              </div>

              {/* Dashboard Stats */}
              <DashboardStats isLoading={isLoadingStats} stats={stats} />

              {/* Filters */}
              <MerchantFilters 
                statusFilter={statusFilter} 
                setStatusFilter={setStatusFilter}
                uploadFilter={uploadFilter}
                setUploadFilter={setUploadFilter}
              />

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
        </main>
      </div>

      {/* File Upload Modal */}
      {showUploadModal && (
        <FileUploadModal onClose={toggleUploadModal} />
      )}
    </div>
  );
}
