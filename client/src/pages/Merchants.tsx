import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import MerchantFilters from "@/components/merchants/MerchantFilters";
import MerchantList from "@/components/merchants/MerchantList";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
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
  
  // State for filters and pagination
  const [statusFilter, setStatusFilter] = useState("All");
  const [uploadFilter, setUploadFilter] = useState("Any time");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  
  // Reset page to 1 when search query, status filter, or upload filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, uploadFilter]);
  
  // Query merchants with filters
  const { data, isLoading, error } = useQuery<MerchantsResponse>({
    queryKey: ['/api/merchants', currentPage, statusFilter, uploadFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', '10');  // Default limit
      
      if (statusFilter !== "All") {
        params.append('status', statusFilter);
      }
      
      if (uploadFilter !== "Any time") {
        params.append('lastUpload', uploadFilter);
      }
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
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
      const response = await apiRequest('POST', `/api/merchants/merge`, {
        targetMerchantId, 
        sourceMerchantIds
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
  
  const handleDeleteSelected = () => {
    if (selectedMerchants.length > 0) {
      deleteMutation.mutate(selectedMerchants);
    }
  };
  
  return (
    <MainLayout>
      <div className="container py-6 mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Merchants</h1>
          <div className="flex space-x-2">
            <Button 
              onClick={() => setLocation('/merchants/new')}
              className="bg-gradient-to-r from-blue-500 to-blue-700"
            >
              Add Merchant
            </Button>
          </div>
        </div>
        
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
            itemsPerPage: 10
          }}
          isLoading={isLoading}
          error={error}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          selectedMerchants={selectedMerchants}
          setSelectedMerchants={setSelectedMerchants}
          onDeleteSelected={handleDeleteSelected}
          deleteMutation={deleteMutation}
          mergeMutation={mergeMutation}
        />
      </div>
    </MainLayout>
  );
}