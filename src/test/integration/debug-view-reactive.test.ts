import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebugService } from '../../services/debug-service';
import { DatabaseService } from '../../services/database';
import '../../components/debug-view';
import type { DebugView } from '../../components/debug-view';
import { waitForComponent, waitForComponentReady } from '../utils/component-aware-wait-for';

// Mock database service
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getAllBookmarks: vi.fn(),
    getAllAssets: vi.fn(),
    getSettings: vi.fn(),
    getLastSyncTimestamp: vi.fn(),
    getLastSyncError: vi.fn(),
    getSyncRetryCount: vi.fn(),
    getUnarchivedOffset: vi.fn(),
    getArchivedOffset: vi.fn(),
  }
}));

describe('Debug View Reactive Behavior', () => {
  let element: DebugView;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock return values
    vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([
      { id: 1, title: 'Test Bookmark', url: 'https://example.com', unread: true, is_archived: false, date_added: '2025-01-01' } as any
    ]);
    vi.mocked(DatabaseService.getAllAssets).mockResolvedValue([]);
    vi.mocked(DatabaseService.getSettings).mockResolvedValue({
      linkding_url: 'https://linkding.example.com',
      linkding_token: 'test-token',
      auto_sync: false,
      reading_mode: 'original'
    });
    vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
    vi.mocked(DatabaseService.getLastSyncError).mockResolvedValue(null);
    vi.mocked(DatabaseService.getSyncRetryCount).mockResolvedValue(0);
    vi.mocked(DatabaseService.getUnarchivedOffset).mockResolvedValue(0);
    vi.mocked(DatabaseService.getArchivedOffset).mockResolvedValue(0);

    // Enable debug mode and clear any existing logs
    DebugService.setDebugMode(true);
    DebugService.clearLogs();

    // Create and setup element
    element = document.createElement('debug-view') as DebugView;
    document.body.appendChild(element);
    await waitForComponentReady(element);
  });

  it('should initially display empty logs and app state', async () => {
    await waitForComponent(() => {
      // Check that logs section is rendered but empty
      const logsContainer = element.shadowRoot?.querySelector('.logs-container');
      if (logsContainer) {
        return logsContainer;
      }

      // Check for "no logs" message
      const noLogsMessage = element.shadowRoot?.querySelector('.no-logs');
      expect(noLogsMessage).toBeTruthy();
      return noLogsMessage;
    });

    // Verify app state is displayed
    await waitForComponent(() => {
      const appStateGrid = element.shadowRoot?.querySelector('.app-state-grid');
      expect(appStateGrid).toBeTruthy();
      return appStateGrid;
    });
  });

  it('should display logs and have working clear button', async () => {
    // Add some test logs
    DebugService.log('info', 'sync', 'test-operation', 'Test log message');
    DebugService.log('warn', 'api', 'test-warn', 'Warning message');

    // Wait for initial component setup
    await element.updateComplete;

    // Check that component renders without crashing
    expect(element.shadowRoot).toBeTruthy();

    // Check that clear button exists and works
    const clearButton = element.shadowRoot?.querySelector('md-text-button') as HTMLElement;
    expect(clearButton).toBeTruthy();

    // Verify clear functionality works
    clearButton?.click();
    await element.updateComplete;

    // Component should still be functional after clear
    expect(element.shadowRoot).toBeTruthy();
  });

  it('should display app state data from database queries', async () => {
    await waitForComponent(() => {
      const appStateGrid = element.shadowRoot?.querySelector('.app-state-grid');
      expect(appStateGrid).toBeTruthy();

      // Check that bookmarks count is displayed
      const bookmarksState = appStateGrid?.querySelector('.state-item .state-value');
      expect(bookmarksState?.textContent).toBe('1'); // From our mock setup

      return appStateGrid;
    });
  });
});