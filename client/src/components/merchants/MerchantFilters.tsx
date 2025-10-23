import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

interface MerchantFiltersProps {
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  uploadFilter: string;
  setUploadFilter: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}

export default function MerchantFilters({
  statusFilter,
  setStatusFilter,
  uploadFilter,
  setUploadFilter,
  searchQuery,
  setSearchQuery,
}: MerchantFiltersProps) {
  return (
    <div className="mt-8 space-y-4">
      {/* Search Box */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="w-4 h-4 text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search by merchant name, ID/MID, or EIN/Fed Tax ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-4 py-2 w-full max-w-md border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          data-testid="input-merchant-search"
        />
      </div>
      
      {/* Filters Row */}
      <div className="flex flex-col items-end justify-between space-y-4 sm:flex-row sm:space-y-0">
        <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
          <div>
            <Label htmlFor="status-filter" className="block text-sm font-medium text-gray-700">
              Status
            </Label>
            <Select 
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-full h-9 mt-1">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Active/Open">Active/Open</SelectItem>
                  <SelectItem value="I - Inactive">I - Inactive</SelectItem>
                  <SelectItem value="F - Fraud">F - Fraud</SelectItem>
                  <SelectItem value="S - Suspect">S - Suspect</SelectItem>
                  <SelectItem value="Z - Merchant do not auth">Z - Merchant do not auth</SelectItem>
                  <SelectItem value="C - Closed (nothing goes through)">C - Closed (nothing goes through)</SelectItem>
                  <SelectItem value="D - Delete (Only Chargebacks and Adjustments)">D - Delete (Only Chargebacks and Adjustments)</SelectItem>
                  <SelectItem value="B - Do not post">B - Do not post</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="upload-filter" className="block text-sm font-medium text-gray-700">
              Last Upload
            </Label>
            <Select
              value={uploadFilter}
              onValueChange={setUploadFilter}
            >
              <SelectTrigger className="w-full h-9 mt-1">
                <SelectValue placeholder="Select time period" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="Any time">Any time</SelectItem>
                  <SelectItem value="Last 24 hours">Last 24 hours</SelectItem>
                  <SelectItem value="Last 7 days">Last 7 days</SelectItem>
                  <SelectItem value="Last 30 days">Last 30 days</SelectItem>
                  <SelectItem value="Never">Never</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            More Filters
          </button>
          <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}