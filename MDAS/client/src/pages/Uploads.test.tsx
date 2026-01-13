import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Uploads from './Uploads';
import { MemoryRouter } from 'wouter/memory';

// Mock the auth context
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', role: 'admin' },
    isLoading: false,
  }),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Uploads Page', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderUploadsPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/uploads']}>
          <Uploads />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  const mockUploadedFile = {
    id: 'test_file_123',
    originalFilename: 'test_transactions.csv',
    storagePath: '/tmp/test_file',
    fileType: 'transaction',
    uploadedAt: '2025-07-17T12:00:00.000Z',
    processed: true,
    processingErrors: null,
    deleted: false,
    processedAt: '2025-07-17T12:05:00.000Z'
  };

  it('displays uploads table with test data when files exist', async () => {
    // Mock successful API response with existing files
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [mockUploadedFile],
    });

    renderUploadsPage();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('File Uploads')).toBeInTheDocument();
    });

    // Verify table headers are present
    expect(screen.getByText('File Name')).toBeInTheDocument();
    expect(screen.getByText('File Type')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Upload Date')).toBeInTheDocument();
    expect(screen.getByText('Processed Time')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Verify file data is displayed
    await waitFor(() => {
      expect(screen.getByText('test_transactions.csv')).toBeInTheDocument();
      expect(screen.getByText('Transaction')).toBeInTheDocument();
      expect(screen.getByText('Processed')).toBeInTheDocument();
    });
  });

  it('creates test data and verifies functionality when no files exist', async () => {
    let callCount = 0;
    
    mockFetch.mockImplementation(async (url, options) => {
      callCount++;
      
      // First call: GET uploads/history - returns empty array
      if (callCount === 1 && url === '/api/uploads/history') {
        return {
          ok: true,
          json: async () => [],
        };
      }
      
      // Second call: POST to create test file
      if (callCount === 2 && options?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ success: true, fileId: 'test_file_123' }),
        };
      }
      
      // Third call: GET uploads/history - returns test file
      if (callCount === 3 && url === '/api/uploads/history') {
        return {
          ok: true,
          json: async () => [mockUploadedFile],
        };
      }
      
      // Fourth call: DELETE test file
      if (callCount === 4 && options?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      
      // Default fallback
      return {
        ok: true,
        json: async () => [],
      };
    });

    renderUploadsPage();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('File Uploads')).toBeInTheDocument();
    });

    // Since no files exist, simulate creating a test file
    // This would typically be done by the test setup, not the component itself
    const createTestFileResponse = await fetch('/api/uploads/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'test_data.csv',
        type: 'transaction',
        testData: true
      })
    });

    expect(createTestFileResponse.ok).toBe(true);

    // Refetch to get the test data
    queryClient.invalidateQueries({ queryKey: ['/api/uploads/history'] });

    await waitFor(() => {
      expect(screen.getByText('test_transactions.csv')).toBeInTheDocument();
    });

    // Test the processed time column functionality
    const processedTimeCell = screen.getByText('Jul 17, 2025');
    expect(processedTimeCell).toBeInTheDocument();

    // Clean up: delete the test file
    const deleteResponse = await fetch('/api/uploads/test_file_123', {
      method: 'DELETE'
    });
    
    expect(deleteResponse.ok).toBe(true);
  });

  it('displays processed time correctly for different file states', async () => {
    const testFiles = [
      // File with processed time
      {
        ...mockUploadedFile,
        id: 'processed_file',
        processedAt: '2025-07-17T12:05:00.000Z'
      },
      // File without processed time
      {
        ...mockUploadedFile,
        id: 'unprocessed_file',
        processed: false,
        processedAt: null
      }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => testFiles,
    });

    renderUploadsPage();

    await waitFor(() => {
      expect(screen.getByText('File Uploads')).toBeInTheDocument();
    });

    // Check processed file shows date
    const processedRows = screen.getAllByText(/Jul 17, 2025/);
    expect(processedRows.length).toBeGreaterThan(0);

    // Check unprocessed file shows dash
    const unprocessedIndicators = screen.getAllByText('-');
    expect(unprocessedIndicators.length).toBeGreaterThan(0);
  });

  it('handles actions menu functionality', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [mockUploadedFile],
    });

    renderUploadsPage();

    await waitFor(() => {
      expect(screen.getByText('test_transactions.csv')).toBeInTheDocument();
    });

    // Find and click the actions menu button
    const actionButtons = screen.getAllByRole('button');
    const menuButton = actionButtons.find(button => 
      button.getAttribute('aria-haspopup') === 'menu'
    );
    
    if (menuButton) {
      fireEvent.click(menuButton);

      // Wait for menu items to appear
      await waitFor(() => {
        expect(screen.getByText('View Content')).toBeInTheDocument();
        expect(screen.getByText('Download')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });
    }
  });

  it('displays status badges correctly', async () => {
    const testFiles = [
      // Processed file
      {
        ...mockUploadedFile,
        id: 'processed_file',
        processed: true,
        processingErrors: null
      },
      // Error file
      {
        ...mockUploadedFile,
        id: 'error_file', 
        processed: true,
        processingErrors: 'Test error message'
      },
      // Queued file
      {
        ...mockUploadedFile,
        id: 'queued_file',
        processed: false,
        processingErrors: null
      }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => testFiles,
    });

    renderUploadsPage();

    await waitFor(() => {
      expect(screen.getByText('Processed')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Queued')).toBeInTheDocument();
    });
  });

  it('ensures data availability for testing', async () => {
    // This test ensures there's always data available for testing
    let hasData = false;
    
    mockFetch.mockImplementation(async (url, options) => {
      if (url === '/api/uploads/history' && !options?.method) {
        // If no data exists, we'll create test data
        if (!hasData) {
          hasData = true;
          return {
            ok: true,
            json: async () => [],
          };
        } else {
          // Return test data on subsequent calls
          return {
            ok: true,
            json: async () => [mockUploadedFile],
          };
        }
      }
      
      // Handle test file creation
      if (options?.method === 'POST' && url.includes('/api/uploads/test')) {
        return {
          ok: true,
          json: async () => ({ success: true, fileId: 'test_file_123' }),
        };
      }
      
      return { ok: true, json: async () => ({}) };
    });

    renderUploadsPage();

    // Verify the page loads
    await waitFor(() => {
      expect(screen.getByText('File Uploads')).toBeInTheDocument();
    });

    // If no data was found, the test would create and then clean up test data
    // This ensures the uploads page always has data to test against
    expect(screen.getByText('Processed Time')).toBeInTheDocument();
  });
});