import { useState, useEffect, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Users, Store, Smartphone } from 'lucide-react';

interface FilterBarProps {
  month: string; // Format: YYYY-MM
  filters: {
    group?: string;
    association?: string;
    merchant?: string;
    merchantName?: string;
    terminal?: string;
  };
  onFilterChange: (filters: {
    group?: string;
    association?: string;
    merchant?: string;
    merchantName?: string;
    terminal?: string;
  }) => void;
  isDarkMode?: boolean;
}

interface FilterOptions {
  groups: string[];
  associations: string[];
  merchants: string[];
  terminals: string[];
}

interface MerchantOption {
  id: number;
  name: string;
  accountNumber: string;
  status: string;
  merchantType: string;
}

export function FilterBar({ month, filters, onFilterChange, isDarkMode = false }: FilterBarProps) {
  const [options, setOptions] = useState<FilterOptions>({
    groups: [],
    associations: [],
    merchants: [],
    terminals: []
  });
  const [merchantOptions, setMerchantOptions] = useState<MerchantOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch filter options when month changes
  useEffect(() => {
    const fetchOptions = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/tddf1/filter-options?month=${month}`);
        if (response.ok) {
          const data = await response.json();
          setOptions(data);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (month) {
      fetchOptions();
    }
  }, [month]);

  // Fetch merchant names for merchant name filter (independent of month)
  useEffect(() => {
    const fetchMerchants = async () => {
      try {
        const response = await fetch('/api/merchants/for-filter');
        if (response.ok) {
          const data = await response.json();
          setMerchantOptions(data);
        }
      } catch (error) {
        console.error('Error fetching merchant options:', error);
      }
    };

    fetchMerchants();
  }, []);

  // Memoized lookup: merchant ID -> account number
  const merchantLookup = useMemo(() => {
    const lookup: Record<string, string> = {};
    merchantOptions.forEach(m => {
      lookup[m.id.toString()] = m.accountNumber;
    });
    return lookup;
  }, [merchantOptions]);

  // Reverse lookup: account number -> merchant ID
  const accountToMerchantId = useMemo(() => {
    const lookup: Record<string, string> = {};
    merchantOptions.forEach(m => {
      lookup[m.accountNumber] = m.id.toString();
    });
    return lookup;
  }, [merchantOptions]);

  // Auto-populate merchant account number when merchantName is set (e.g., from URL restoration)
  // Only fires when merchantName changes, merchant is missing/mismatched, or lookup updates
  useEffect(() => {
    if (filters.merchantName && merchantLookup[filters.merchantName]) {
      const expectedAccountNumber = merchantLookup[filters.merchantName];
      // Only update if merchant is missing or doesn't match the expected account number
      if (filters.merchant !== expectedAccountNumber) {
        onFilterChange({ ...filters, merchant: expectedAccountNumber });
      }
    }
  }, [filters.merchantName, filters.merchant, merchantLookup, onFilterChange]);

  // Bidirectional sync: Auto-populate merchant name when account number is set
  useEffect(() => {
    if (filters.merchant && accountToMerchantId[filters.merchant]) {
      const expectedMerchantId = accountToMerchantId[filters.merchant];
      // Only update if merchantName is missing or doesn't match
      if (filters.merchantName !== expectedMerchantId) {
        onFilterChange({ ...filters, merchantName: expectedMerchantId });
      }
    }
  }, [filters.merchant, filters.merchantName, accountToMerchantId, onFilterChange]);

  // Get filtered options based on cascading filters
  const getFilteredAssociations = () => {
    // If group is selected, we should filter associations based on the data
    // For now, return all associations (can be enhanced with backend support)
    return options.associations;
  };

  const getFilteredMerchants = () => {
    // If association is selected, filter merchants accordingly
    return options.merchants;
  };

  const getFilteredTerminals = () => {
    // If merchant is selected, filter terminals accordingly
    return options.terminals;
  };

  const handleFilterChange = (type: 'group' | 'association' | 'merchant' | 'merchantName' | 'terminal', value: string) => {
    const newFilters = { ...filters };
    
    // Handle "All" selection (clear filter)
    if (value === 'all') {
      delete newFilters[type];
      
      // Special handling for merchant name - also clear merchant account number
      if (type === 'merchantName') {
        delete newFilters.merchant;
      }
      
      // Clear dependent filters when parent changes
      if (type === 'group') {
        delete newFilters.association;
        delete newFilters.merchant;
        delete newFilters.merchantName;
        delete newFilters.terminal;
      } else if (type === 'association') {
        delete newFilters.merchant;
        delete newFilters.merchantName;
        delete newFilters.terminal;
      } else if (type === 'merchant') {
        delete newFilters.terminal;
      }
    } else {
      newFilters[type] = value;
      
      // Bidirectional sync: merchant name <-> account number
      if (type === 'merchantName') {
        const selectedMerchant = merchantOptions.find(m => m.id.toString() === value);
        if (selectedMerchant) {
          newFilters.merchant = selectedMerchant.accountNumber;
        }
      } else if (type === 'merchant') {
        const merchantId = accountToMerchantId[value];
        if (merchantId) {
          newFilters.merchantName = merchantId;
        }
      }
    }
    
    onFilterChange(newFilters);
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 p-4 rounded-lg border ${
      isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    }`}>
      {/* Group Filter */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Building2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} data-testid="icon-group" />
        <Select
          value={filters.group || 'all'}
          onValueChange={(value) => handleFilterChange('group', value)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full" data-testid="select-group">
            <SelectValue placeholder="All Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {options.groups.map((group) => (
              <SelectItem key={group} value={group}>
                {group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Association Filter */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Users className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} data-testid="icon-association" />
        <Select
          value={filters.association || 'all'}
          onValueChange={(value) => handleFilterChange('association', value)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full" data-testid="select-association">
            <SelectValue placeholder="All Associations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Associations</SelectItem>
            {getFilteredAssociations().map((association) => (
              <SelectItem key={association} value={association}>
                {association}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Merchant Name Filter */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Store className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} data-testid="icon-merchant-name" />
        <Select
          value={filters.merchantName || 'all'}
          onValueChange={(value) => handleFilterChange('merchantName', value)}
          disabled={merchantOptions.length === 0}
        >
          <SelectTrigger className="w-full" data-testid="select-merchant-name">
            <SelectValue placeholder="All Merch Names" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Merch Names</SelectItem>
            {merchantOptions.map((merchant) => (
              <SelectItem key={merchant.id} value={merchant.id.toString()}>
                {merchant.name} {merchant.status !== 'Active/Open' && `(${merchant.status})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Merchant Account Number Filter (auto-populated by Merchant Name) */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Store className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} data-testid="icon-merchant" />
        <Select
          value={filters.merchant || 'all'}
          onValueChange={(value) => handleFilterChange('merchant', value)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full" data-testid="select-merchant">
            <SelectValue placeholder="All Merch Accts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Merch Accts</SelectItem>
            {getFilteredMerchants().map((merchant) => (
              <SelectItem key={merchant} value={merchant}>
                {merchant}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Terminal Filter */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Smartphone className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} data-testid="icon-terminal" />
        <Select
          value={filters.terminal || 'all'}
          onValueChange={(value) => handleFilterChange('terminal', value)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full" data-testid="select-terminal">
            <SelectValue placeholder="All Terminals" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terminals</SelectItem>
            {getFilteredTerminals().map((terminal) => (
              <SelectItem key={terminal} value={terminal}>
                {terminal}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active Filters Count */}
      {(filters.group || filters.association || filters.merchant || filters.merchantName || filters.terminal) && (
        <div className={`ml-auto px-3 py-1 rounded-full text-sm font-medium ${
          isDarkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-700'
        }`}>
          {Object.keys(filters).filter(k => filters[k as keyof typeof filters] && k !== 'merchant').length} filter(s) active
        </div>
      )}
    </div>
  );
}
