import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { Toaster } from '@/components/ui/toaster';
import Merchants from '@/pages/Merchants';

// Mock the API request function
const mockApiRequest = jest.fn();
jest.mock('@/lib/queryClient', () => ({
  ...jest.requireActual('@/lib/queryClient'),
  apiRequest: mockApiRequest,
}));

// Mock the useAuth hook
jest.mock('@/hooks/use-auth', () => ({
  ...jest.requireActual('@/hooks/use-auth'),
  useAuth: () => ({
    user: { id: 1, username: 'admin', role: 'admin' },
    isLoading: false,
    error: null,
  }),
}));

// Mock data for testing
const mockMerchantData = {
  merchants: [
    {
      id: 'AHCAI',
      name: 'Alternate Health Collective Association Inc',
      clientMid: 'AY3KOP954A8D5384539A54013D59OCT18',
      status: 'Active',
      lastUpload: '5/16/2025',
      transactions: 0,
      revenue: '$0',
      totalTransactions: 0,
      totalRevenue: 0,
    },
    {
      id: 'CRL',
      name: 'Catalyst Retail LLC',
      clientMid: 'AY3804EA025924C49K2917D5636ACG638',
      status: 'Active',
      lastUpload: '5/16/2025',
      transactions: 0,
      revenue: '$0',
      totalTransactions: 0,
      totalRevenue: 0,
    },
    {
      id: 'GDDL',
      name: 'Golden Door Dispensary LLC',
      clientMid: 'AY3244E3FD8501C4230966154DC3870E17',
      status: 'Active',
      lastUpload: '5/16/2025',
      transactions: 0,
      revenue: '$0',
      totalTransactions: 0,
      totalRevenue: 0,
    },
  ],
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalItems: 3,
    itemsPerPage: 10,
  },
};

// Mock search results for "Cat" (should match Catalyst Retail LLC)
const mockSearchResults = {
  merchants: [
    {
      id: 'CRL',
      name: 'Catalyst Retail LLC',
      clientMid: 'AY3804EA025924C49K2917D5636ACG638',
      status: 'Active',
      lastUpload: '5/16/2025',
      transactions: 0,
      revenue: '$0',
      totalTransactions: 0,
      totalRevenue: 0,
    },
  ],
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalItems: 1,
    itemsPerPage: 10,
  },
};

describe('Merchant Search Functionality', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    
    // Reset mocks
    mockApiRequest.mockClear();
    
    // Mock the initial merchants fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMerchantData,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderMerchantsPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Merchants />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    );
  };

  test('displays search input field', async () => {
    renderMerchantsPage();
    
    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by merchant name or ID/MID...')).toBeInTheDocument();
    });
  });

  test('searches for "Cat" and filters results correctly', async () => {
    renderMerchantsPage();
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alternate Health Collective Association Inc')).toBeInTheDocument();
    });

    // Find the search input
    const searchInput = screen.getByPlaceholderText('Search by merchant name or ID/MID...');
    expect(searchInput).toBeInTheDocument();

    // Mock the search API call - this should return "Catalyst Retail LLC" when searching for "Cat"
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    // Type "Cat" in the search input
    fireEvent.change(searchInput, { target: { value: 'Cat' } });

    // Wait for search to trigger (debounced)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/merchants?page=1&limit=10&status=All&lastUpload=Any%20time&search=Cat'),
        expect.any(Object)
      );
    }, { timeout: 3000 });

    // Verify search results show only Catalyst Retail LLC
    await waitFor(() => {
      expect(screen.getByText('Catalyst Retail LLC')).toBeInTheDocument();
      expect(screen.queryByText('Alternate Health Collective Association Inc')).not.toBeInTheDocument();
      expect(screen.queryByText('Golden Door Dispensary LLC')).not.toBeInTheDocument();
    });
  });

  test('searches by merchant ID', async () => {
    renderMerchantsPage();
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alternate Health Collective Association Inc')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by merchant name or ID/MID...');

    // Mock search results for ID "CRL"
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    // Type "CRL" in the search input
    fireEvent.change(searchInput, { target: { value: 'CRL' } });

    // Wait for search to trigger
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=CRL'),
        expect.any(Object)
      );
    }, { timeout: 3000 });

    // Verify search results
    await waitFor(() => {
      expect(screen.getByText('Catalyst Retail LLC')).toBeInTheDocument();
      expect(screen.queryByText('Alternate Health Collective Association Inc')).not.toBeInTheDocument();
    });
  });

  test('searches by client MID', async () => {
    renderMerchantsPage();
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alternate Health Collective Association Inc')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by merchant name or ID/MID...');

    // Mock search results for partial MID
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    // Type part of a MID in the search input
    fireEvent.change(searchInput, { target: { value: 'AY3804EA' } });

    // Wait for search to trigger
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=AY3804EA'),
        expect.any(Object)
      );
    }, { timeout: 3000 });

    // Verify search results
    await waitFor(() => {
      expect(screen.getByText('Catalyst Retail LLC')).toBeInTheDocument();
      expect(screen.queryByText('Alternate Health Collective Association Inc')).not.toBeInTheDocument();
    });
  });

  test('shows no results message when search returns empty', async () => {
    renderMerchantsPage();
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alternate Health Collective Association Inc')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by merchant name or ID/MID...');

    // Mock empty search results
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        merchants: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: 10,
        },
      }),
    });

    // Search for something that doesn't exist
    fireEvent.change(searchInput, { target: { value: 'NonExistentMerchant' } });

    // Wait for search to trigger
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=NonExistentMerchant'),
        expect.any(Object)
      );
    }, { timeout: 3000 });

    // Verify no results message
    await waitFor(() => {
      expect(screen.getByText('No merchants found')).toBeInTheDocument();
    });
  });

  test('clears search and shows all merchants when search is cleared', async () => {
    renderMerchantsPage();
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alternate Health Collective Association Inc')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by merchant name or ID/MID...');

    // First, perform a search
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    fireEvent.change(searchInput, { target: { value: 'Cat' } });

    // Wait for search results
    await waitFor(() => {
      expect(screen.getByText('Catalyst Retail LLC')).toBeInTheDocument();
      expect(screen.queryByText('Alternate Health Collective Association Inc')).not.toBeInTheDocument();
    });

    // Now clear the search
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMerchantData,
    });

    fireEvent.change(searchInput, { target: { value: '' } });

    // Wait for all merchants to be shown again
    await waitFor(() => {
      expect(screen.getByText('Alternate Health Collective Association Inc')).toBeInTheDocument();
      expect(screen.getByText('Catalyst Retail LLC')).toBeInTheDocument();
      expect(screen.getByText('Golden Door Dispensary LLC')).toBeInTheDocument();
    });
  });

  test('search works with filters combined', async () => {
    renderMerchantsPage();
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alternate Health Collective Association Inc')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by merchant name or ID/MID...');

    // Mock search results with filters
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    // Type search term
    fireEvent.change(searchInput, { target: { value: 'Cat' } });

    // Wait for search with filters to trigger
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=Cat'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=All'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('lastUpload=Any%20time'),
        expect.any(Object)
      );
    }, { timeout: 3000 });
  });
});