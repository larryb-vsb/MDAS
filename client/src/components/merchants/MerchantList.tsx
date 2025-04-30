import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
                    <TableCell colSpan={6} className="px-6 py-10 text-center">
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
                          <button className="text-blue-600 hover:text-blue-900">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button className="text-gray-600 hover:text-gray-900">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button 
                            className="text-blue-600 hover:text-blue-900"
                            onClick={toggleUploadModal}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                          </button>
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
