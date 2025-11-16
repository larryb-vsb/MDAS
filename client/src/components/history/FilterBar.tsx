import { useState, useEffect } from 'react';
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
    terminal?: string;
  };
  onFilterChange: (filters: {
    group?: string;
    association?: string;
    merchant?: string;
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

export function FilterBar({ month, filters, onFilterChange, isDarkMode = false }: FilterBarProps) {
  const [options, setOptions] = useState<FilterOptions>({
    groups: [],
    associations: [],
    merchants: [],
    terminals: []
  });
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

  const handleFilterChange = (type: 'group' | 'association' | 'merchant' | 'terminal', value: string) => {
    const newFilters = { ...filters };
    
    // Handle "All" selection (clear filter)
    if (value === 'all') {
      delete newFilters[type];
      
      // Clear dependent filters when parent changes
      if (type === 'group') {
        delete newFilters.association;
        delete newFilters.merchant;
        delete newFilters.terminal;
      } else if (type === 'association') {
        delete newFilters.merchant;
        delete newFilters.terminal;
      } else if (type === 'merchant') {
        delete newFilters.terminal;
      }
    } else {
      newFilters[type] = value;
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

      {/* Merchant Filter */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Store className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} data-testid="icon-merchant" />
        <Select
          value={filters.merchant || 'all'}
          onValueChange={(value) => handleFilterChange('merchant', value)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full" data-testid="select-merchant">
            <SelectValue placeholder="All Merchants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Merchants</SelectItem>
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
      {(filters.group || filters.association || filters.merchant || filters.terminal) && (
        <div className={`ml-auto px-3 py-1 rounded-full text-sm font-medium ${
          isDarkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-700'
        }`}>
          {Object.keys(filters).filter(k => filters[k as keyof typeof filters]).length} filter(s) active
        </div>
      )}
    </div>
  );
}
