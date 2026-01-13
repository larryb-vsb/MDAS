import { useQuery } from '@tanstack/react-query';

/**
 * Custom hook for merchant lookup functionality
 * Provides merchant name lookup from account numbers with proper normalization
 */
export function useMerchantLookup() {
  // Fetch merchant lookup map (account_number -> dba_name)
  const { data: merchantLookupMap = {}, isLoading: merchantLookupLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/merchants/lookup-map"],
    enabled: true,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  /**
   * Get merchant name from account number
   * Handles normalization between TDDF (16-digit with leading zero) and merchant table (15-digit)
   */
  const getMerchantName = (merchantAccountNumber: string | null): string | null => {
    if (!merchantAccountNumber || !merchantLookupMap) return null;
    
    // TDDF uses 16-digit format with leading zero, merchant table uses 15-digit
    // Strip leading zeros to match merchant table format
    const normalizedAccount = merchantAccountNumber.replace(/^0+/, '');
    return merchantLookupMap[normalizedAccount] || null;
  };

  return {
    merchantLookupMap,
    merchantLookupLoading,
    getMerchantName,
  };
}
