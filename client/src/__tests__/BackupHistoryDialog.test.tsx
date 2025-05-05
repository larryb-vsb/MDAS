import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as queryCalls from '@/lib/queryClient';
import { mockBackupHistory } from './__mocks__/handlers';
import { render } from './utils/test-utils';
import BackupHistoryDialog from '@/components/settings/BackupHistoryDialog';

// Create a mock of the queryClient module
jest.mock('@/lib/queryClient', () => ({
  ...jest.requireActual('@/lib/queryClient'),
  apiRequest: jest.fn(),
}));

// Mock Tabs component from @radix-ui/react-tabs
jest.mock('@radix-ui/react-tabs', () => ({
  Root: ({ children, defaultValue }: any) => (
    <div data-testid="tabs-root" data-default-value={defaultValue}>
      {children}
    </div>
  ),
  List: ({ children }: any) => (
    <div data-testid="tabs-list">
      {children}
    </div>
  ),
  Trigger: ({ children, value, onClick }: any) => (
    <button data-testid={`tab-${value}`} onClick={onClick}>
      {children}
    </button>
  ),
  Content: ({ children, value }: any) => (
    <div data-testid={`content-${value}`}>
      {children}
    </div>
  ),
}));

// Set up mock data
describe('BackupHistoryDialog Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the useQuery hook response
    jest.mock('@tanstack/react-query', () => ({
      ...jest.requireActual('@tanstack/react-query'),
      useQuery: (options: any) => {
        if (options.queryKey[0] === '/api/settings/backup/history') {
          return {
            data: mockBackupHistory.filter(backup => !backup.deleted),
            isLoading: false,
            error: null,
            isError: false,
          };
        }
        if (options.queryKey[0] === '/api/settings/backup/history/trash') {
          return {
            data: mockBackupHistory.filter(backup => backup.deleted),
            isLoading: false,
            error: null,
            isError: false,
          };
        }
        return {
          data: null,
          isLoading: true,
          error: null,
          isError: false,
        };
      },
    }));
    
    // Mock the API request
    jest.spyOn(queryCalls, 'apiRequest').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    });
  });

  it('renders the dialog with tabs', async () => {
    render(<BackupHistoryDialog onClose={() => {}} />);
    
    // Check for tab structure
    expect(screen.getByTestId('tabs-root')).toBeInTheDocument();
    expect(screen.getByTestId('tabs-list')).toBeInTheDocument();
    expect(screen.getByTestId('tab-active')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trash')).toBeInTheDocument();
  });

  it('handles backup delete operation', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    
    render(<BackupHistoryDialog onClose={onClose} />);
    
    // Find and click a delete button
    const deleteButtons = screen.getAllByTitle('Delete backup');
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0]);
      
      // The confirmation dialog should appear
      const confirmButton = screen.getByText('Yes, delete it');
      await user.click(confirmButton);
      
      // Check if API was called with correct parameters
      expect(queryCalls.apiRequest).toHaveBeenCalledWith(
        'PATCH',
        expect.stringContaining('/api/settings/backup/'),
        { deleted: true }
      );
    }
  });

  it('handles backup restore operation in trash tab', async () => {
    const user = userEvent.setup();
    
    render(<BackupHistoryDialog onClose={() => {}} />);
    
    // Switch to trash tab
    const trashTab = screen.getByTestId('tab-trash');
    await user.click(trashTab);
    
    // Find and click a restore button in the trash tab
    await waitFor(() => {
      const restoreButtons = screen.getAllByTitle('Restore backup');
      if (restoreButtons.length > 0) {
        user.click(restoreButtons[0]);
      }
    });
    
    // Check if API was called with correct parameters
    expect(queryCalls.apiRequest).toHaveBeenCalledWith(
      'PATCH',
      expect.stringContaining('/api/settings/backup/'),
      { deleted: false }
    );
  });

  it('displays backup details correctly', async () => {
    render(<BackupHistoryDialog onClose={() => {}} />);
    
    // Check if backup date is formatted correctly
    const formattedDate = new Date(mockBackupHistory[0].timestamp).toLocaleDateString();
    expect(screen.getByText(formattedDate, { exact: false })).toBeInTheDocument();
    
    // Check for file size formatting
    const formattedSize = `${(mockBackupHistory[0].size / 1024).toFixed(2)} KB`;
    expect(screen.getByText(formattedSize, { exact: false })).toBeInTheDocument();
  });
});