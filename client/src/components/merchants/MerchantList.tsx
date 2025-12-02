import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Upload, Edit, Trash2, CheckSquare, GitMerge, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import MerchantPagination from "./MerchantPagination";
import MergeModal from "./MergeModal";
import { Merchant, Pagination } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface MerchantListProps {
  isLoading: boolean;
  merchants: Merchant[];
  pagination: Pagination;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  selectedMerchants: string[];
  setSelectedMerchants: (merchants: string[]) => void;
  onDeleteSelected: () => void;
  deleteMutation: any;
  mergeMutation: any;
  sortColumn: string;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
}

export default function MerchantList({
  isLoading,
  merchants,
  pagination,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
  selectedMerchants,
  setSelectedMerchants,
  onDeleteSelected,
  deleteMutation,
  mergeMutation,
  sortColumn,
  sortDirection,
  onSort,
}: MerchantListProps) {
  const [, setLocation] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Render sort icon based on column state
  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-40" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };
  
  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const getAvatarBgColor = (name: string) => {
    const colors = [
      "bg-blue-100 text-blue-600",
      "bg-green-100 text-green-600",
      "bg-purple-100 text-purple-600",
      "bg-red-100 text-red-600",
      "bg-yellow-100 text-yellow-600",
    ];
    const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };
  
  // Handler for selecting/deselecting a merchant
  const toggleMerchantSelection = (merchantId: string) => {
    const current = selectedMerchants || [];
    if (current.includes(merchantId)) {
      setSelectedMerchants(current.filter((id: string) => id !== merchantId));
    } else {
      setSelectedMerchants([...current, merchantId]);
    }
  };
  
  // Handler for selecting/deselecting all merchants
  const toggleSelectAll = () => {
    if ((selectedMerchants || []).length === merchants.length) {
      setSelectedMerchants([]);
    } else {
      setSelectedMerchants(merchants.map(m => m.id));
    }
  };

  // Handler for merge confirmation
  const handleMergeConfirm = (targetMerchantId: string, sourceMerchantIds: string[]) => {
    if (mergeMutation?.mutate) {
      mergeMutation.mutate({ targetMerchantId, sourceMerchantIds });
    }
    setShowMergeModal(false);
  };
  


  // Mobile card component for each merchant
  const MobileCard = ({ merchant }: { merchant: Merchant }) => (
    <div 
      className={`bg-white border rounded-lg p-4 mb-3 ${(selectedMerchants || []).includes(merchant.id) ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
      data-testid={`mobile-merchant-card-${merchant.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Checkbox 
            checked={(selectedMerchants || []).includes(merchant.id)}
            onCheckedChange={() => toggleMerchantSelection(merchant.id)}
            aria-label={`Select ${merchant.name}`}
          />
          <div className="flex-shrink-0">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${getAvatarBgColor(merchant.name)}`}>
              <span className="text-sm font-medium">{getInitials(merchant.name)}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div 
              className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
              onClick={() => setLocation(`/merchants/${merchant.id}`)}
            >
              {merchant.name}
            </div>
            <div className="text-xs text-gray-500 truncate">ID: #{merchant.id}</div>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 flex-shrink-0"
          onClick={() => setLocation(`/merchants/${merchant.id}`)}
          data-testid={`view-merchant-${merchant.id}`}
        >
          <Eye className="w-5 h-5" />
        </Button>
      </div>
      
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Status:</span>
          <span className={`ml-1 inline-flex px-1.5 py-0.5 text-xs font-semibold leading-4 rounded-full ${getStatusBadgeColor(merchant.status)}`}>
            {merchant.status}
          </span>
        </div>
        <div>
          <span className="text-gray-500">MID:</span>
          <span className="ml-1 text-gray-700">{merchant.clientMID || '-'}</span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500">Last Batch:</span>
          <span className="ml-1 text-gray-700">
            {merchant.lastBatch?.date 
              ? new Date(merchant.lastBatch.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'No data'}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500">Last Transaction:</span>
          <span className="ml-1 text-gray-700">
            {merchant.lastTransaction?.date 
              ? new Date(merchant.lastTransaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'No data'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col mt-4">
      {/* Selection actions */}
      {merchants.length > 0 && (
        <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">
              {(selectedMerchants || []).length > 0 
                ? `${(selectedMerchants || []).length} merchant${(selectedMerchants || []).length > 1 ? 's' : ''} selected` 
                : ''}
            </span>
          </div>
          
          {(selectedMerchants || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(selectedMerchants || []).length >= 2 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowMergeModal(true)}
                  className="flex items-center bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                  disabled={mergeMutation?.isPending}
                >
                  <GitMerge className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Merge Selected</span>
                  <span className="sm:hidden">Merge</span>
                </Button>
              )}
              <Button 
                variant="destructive" 
                size="sm"
                onClick={onDeleteSelected}
                className="flex items-center"
                disabled={deleteMutation?.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Delete Selected</span>
                <span className="sm:hidden">Delete</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Card View - visible only on small screens */}
      <div className="block md:hidden">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="w-32 h-4 mb-1" />
                  <Skeleton className="w-20 h-3" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))
        ) : merchants.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500">No merchants found</p>
            <Button 
              onClick={() => setLocation('/uploads')}
              className="mt-4"
            >
              Upload Data
            </Button>
          </div>
        ) : (
          <>
            {/* Select All for mobile */}
            <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
              <Checkbox 
                checked={(selectedMerchants || []).length === merchants.length && merchants.length > 0} 
                onCheckedChange={toggleSelectAll}
                aria-label="Select all"
              />
              <span className="text-sm text-gray-600">Select all</span>
            </div>
            {merchants.map((merchant) => (
              <MobileCard key={merchant.id} merchant={merchant} />
            ))}
          </>
        )}
      </div>

      {/* Desktop Table View - hidden on small screens */}
      <div className="hidden md:block -mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <div className="overflow-hidden shadow sm:rounded-lg">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-8 px-6 py-3">
                    {merchants.length > 0 && (
                      <Checkbox 
                        checked={(selectedMerchants || []).length === merchants.length && merchants.length > 0} 
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    )}
                  </TableHead>
                  <TableHead 
                    className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort("name")}
                  >
                    <div className="flex items-center">
                      Merchant
                      {renderSortIcon("name")}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort("clientMID")}
                  >
                    <div className="flex items-center">
                      Client MID
                      {renderSortIcon("clientMID")}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort("status")}
                  >
                    <div className="flex items-center">
                      Status
                      {renderSortIcon("status")}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort("lastUpload")}
                  >
                    <div className="flex items-center">
                      Last Upload
                      {renderSortIcon("lastUpload")}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort("lastBatchDate")}
                  >
                    <div className="flex items-center">
                      Last Batch
                      {renderSortIcon("lastBatchDate")}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => onSort("lastTransactionDate")}
                  >
                    <div className="flex items-center">
                      Last Transaction
                      {renderSortIcon("lastTransactionDate")}
                    </div>
                  </TableHead>
                  <TableHead className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Skeleton className="w-10 h-10 rounded-full" />
                          <div className="ml-4">
                            <Skeleton className="w-32 h-4" />
                            <Skeleton className="w-24 h-3 mt-1" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="w-20 h-4" />
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="w-16 h-5 rounded-full" />
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="w-24 h-4" />
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="w-28 h-4" />
                        <Skeleton className="w-24 h-3 mt-1" />
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <Skeleton className="w-28 h-4" />
                        <Skeleton className="w-24 h-3 mt-1" />
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right whitespace-nowrap">
                        <Skeleton className="w-20 h-6 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : merchants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="px-6 py-10 text-center">
                      <p className="text-gray-500">No merchants found</p>
                      <Button 
                        onClick={() => setLocation('/uploads')}
                        className="mt-4"
                      >
                        Upload Data
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  merchants.map((merchant) => (
                    <TableRow 
                      key={merchant.id} 
                      className={`hover:bg-gray-50 ${(selectedMerchants || []).includes(merchant.id) ? 'bg-blue-50' : ''}`}
                    >
                      <TableCell className="w-8 px-6 py-4">
                        <Checkbox 
                          checked={(selectedMerchants || []).includes(merchant.id)}
                          onCheckedChange={() => toggleMerchantSelection(merchant.id)}
                          aria-label={`Select ${merchant.name}`}
                        />
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 w-10 h-10">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${getAvatarBgColor(merchant.name)}`}>
                              <span className="text-lg font-medium">{getInitials(merchant.name)}</span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div 
                              className="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600"
                              onClick={() => setLocation(`/merchants/${merchant.id}`)}
                            >
                              {merchant.name}
                            </div>
                            <div className="text-sm text-gray-500">ID: #{merchant.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {merchant.clientMID || '-'}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <span 
                          className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full cursor-pointer ${getStatusBadgeColor(merchant.status)}`}
                          onClick={() => setLocation(`/merchants/${merchant.id}`)}
                        >
                          {merchant.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {merchant.lastUpload}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{merchant.lastBatch?.filename || 'No data'}</div>
                        <div className="text-sm text-gray-500">
                          {merchant.lastBatch?.date 
                            ? new Date(merchant.lastBatch.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '-'
                          }
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {merchant.lastTransaction?.amount 
                            ? `$${merchant.lastTransaction.amount.toFixed(2)}` 
                            : 'No data'
                          }
                        </div>
                        <div className="text-sm text-gray-500">
                          {merchant.lastTransaction?.date 
                            ? new Date(merchant.lastTransaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '-'
                          }
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm font-medium text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-3">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                                  onClick={() => setLocation(`/merchants/${merchant.id}`)}
                                >
                                  <Eye className="w-5 h-5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Details</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      
      <MerchantPagination 
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
        onItemsPerPageChange={onItemsPerPageChange}
      />
      
      {/* Merge Modal */}
      <MergeModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        onConfirm={handleMergeConfirm}
        selectedMerchants={merchants.filter(m => (selectedMerchants || []).includes(m.id))}
        isLoading={mergeMutation?.isPending || false}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedMerchants.length} merchants?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected merchants
              and remove their data from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteSelected}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
