import React from "react";
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
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Eye, Upload, Edit } from "lucide-react";
import MerchantPagination from "./MerchantPagination";
import { Merchant, Pagination } from "@/lib/types";

interface MerchantListProps {
  isLoading: boolean;
  merchants: Merchant[];
  pagination: Pagination;
  onPageChange: (page: number) => void;
  toggleUploadModal: () => void;
}

export default function MerchantList({
  isLoading,
  merchants,
  pagination,
  onPageChange,
  toggleUploadModal,
}: MerchantListProps) {
  const [, setLocation] = useLocation();
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

  return (
    <div className="flex flex-col mt-4">
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <div className="overflow-hidden shadow sm:rounded-lg">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                    Merchant
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                    Client MID
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                    Status
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                    Last Upload
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                    Daily Stats
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                    Monthly Stats
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
                      <button 
                        onClick={toggleUploadModal}
                        className="px-4 py-2 mt-4 text-sm font-medium text-white bg-primary rounded-md"
                      >
                        Upload Data
                      </button>
                    </TableCell>
                  </TableRow>
                ) : (
                  merchants.map((merchant) => (
                    <TableRow key={merchant.id} className="hover:bg-gray-50">
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 w-10 h-10">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${getAvatarBgColor(merchant.name)}`}>
                              <span className="text-lg font-medium">{getInitials(merchant.name)}</span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{merchant.name}</div>
                            <div className="text-sm text-gray-500">ID: #{merchant.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {merchant.clientMID || '-'}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full ${getStatusBadgeColor(merchant.status)}`}>
                          {merchant.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {merchant.lastUpload}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{merchant.dailyStats.transactions.toLocaleString()} transactions</div>
                        <div className="text-sm text-gray-500">${merchant.dailyStats.revenue.toLocaleString()} revenue</div>
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{merchant.monthlyStats.transactions.toLocaleString()} transactions</div>
                        <div className="text-sm text-gray-500">${merchant.monthlyStats.revenue.toLocaleString()} revenue</div>
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
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                                  onClick={() => setLocation(`/merchants/${merchant.id}?tab=details`)}
                                >
                                  <Edit className="w-5 h-5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit Merchant</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
                                  onClick={toggleUploadModal}
                                >
                                  <Upload className="w-5 h-5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Upload Data</p>
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
        itemsPerPage={pagination.itemsPerPage}
        onPageChange={onPageChange}
      />
    </div>
  );
}
