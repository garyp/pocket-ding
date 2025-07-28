import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';
import { BookmarkListContainer } from '../../components/bookmark-list-container';
import type { LocalBookmark } from '../../types';

// Mock the services
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getBookmarksPaginated: vi.fn(),
    getBookmarkCount: vi.fn(),
    getPageFromAnchorBookmark: vi.fn(),
    getBookmarksWithAssetCounts: vi.fn(),
    getCompletedAssetsByBookmarkId: vi.fn(),
    getSettings: vi.fn(),
    createPaginationDataQuery: vi.fn(),
  },
}));

vi.mock('../../controllers/reactive-query-controller');
vi.mock('../../controllers/sync-controller');
vi.mock('../../controllers/favicon-controller');
vi.mock('../../controllers/state-controller');

vi.mock('../../services/sync-service', () => ({
  SyncService: {
    getInstance: vi.fn(),
    isSyncInProgress: vi.fn(),
    getCurrentSyncProgress: vi.fn(),
    syncBookmarks: vi.fn(),
  },
}));

vi.mock('../../services/favicon-service', () => ({
  FaviconService: {
    getFaviconForBookmark: vi.fn(),
  },
}));

import { DatabaseService } from '../../services/database';
import { SyncService } from '../../services/sync-service';
// import { FaviconService } from '../../services/favicon-service';

const mockBookmarks: LocalBookmark[] = [
  {
    id: 1,
    url: 'https://example.com/1',
    title: 'Test Bookmark 1',
    description: 'Description 1',
    notes: '',
    website_title: 'Example Site',
    website_description: 'Example Description',
    web_archive_snapshot_url: '',
    favicon_url: 'https://example.com/favicon.ico',
    preview_image_url: '',
    is_archived: false,
    unread: true,
    shared: false,
    tag_names: ['test'],
    date_added: '2024-01-01T00:00:00Z',
    date_modified: '2024-01-01T00:00:00Z',
  },
];

describe('BookmarkListContainer', () => {
  let element: BookmarkListContainer;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    vi.mocked(DatabaseService.getBookmarksPaginated).mockResolvedValue(mockBookmarks);
    vi.mocked(DatabaseService.getBookmarkCount).mockResolvedValue(1);
    vi.mocked(DatabaseService.getPageFromAnchorBookmark).mockResolvedValue(1);
    vi.mocked(DatabaseService.getBookmarksWithAssetCounts).mockResolvedValue(new Map([[1, false]]));
    vi.mocked(DatabaseService.getCompletedAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.createPaginationDataQuery).mockReturnValue(() => Promise.resolve({
      bookmarks: mockBookmarks,
      totalCount: 1,
      totalPages: 1,
      filterCounts: { all: 1, unread: 1, archived: 0 },
      bookmarksWithAssets: new Set<number>()
    }));

    // Mock ReactiveQueryController
    const { ReactiveQueryController } = await import('../../controllers/reactive-query-controller');
    vi.mocked(ReactiveQueryController).mockImplementation((_host: any, _options: any) => ({
      value: {
        bookmarks: mockBookmarks,
        totalCount: 1,
        totalPages: 1,
        filterCounts: { all: 1, unread: 1, archived: 0 },
        bookmarksWithAssets: new Set<number>()
      },
      loading: false,
      hasError: false,
      errorMessage: null,
      hostConnected: vi.fn(),
      hostDisconnected: vi.fn(),
      setEnabled: vi.fn(),
      updateQuery: vi.fn(),
      render: vi.fn()
    }) as any);

    // Mock other controllers
    const { SyncController } = await import('../../controllers/sync-controller');
    const { FaviconController } = await import('../../controllers/favicon-controller');
    const { StateController } = await import('../../controllers/state-controller');
    
    vi.mocked(SyncController).mockImplementation(() => ({
      hostConnected: vi.fn(),
      hostDisconnected: vi.fn(),
      state: { isRunning: false, progress: 0, total: 0 }
    }) as any);
    
    vi.mocked(FaviconController).mockImplementation(() => ({
      hostConnected: vi.fn(),
      hostDisconnected: vi.fn(),
      getFaviconUrl: vi.fn().mockReturnValue(''),
      updateFavicons: vi.fn()
    }) as any);
    
    vi.mocked(StateController).mockImplementation(() => ({
      hostConnected: vi.fn(),
      hostDisconnected: vi.fn(),
      setState: vi.fn(),
      getState: vi.fn().mockReturnValue({
        currentPage: 1,
        pageSize: 25,
        filter: 'all'
      })
    }) as any);

    vi.mocked(SyncService.getInstance).mockReturnValue({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any);
    vi.mocked(SyncService.isSyncInProgress).mockReturnValue(false);
    vi.mocked(SyncService.getCurrentSyncProgress).mockReturnValue({
      current: 0,
      total: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (element) {
      element.remove();
    }
  });

  describe('Initialization', () => {
    it('should create a container element', () => {
      element = new BookmarkListContainer();
      expect(element).toBeTruthy();
      expect(element.tagName.toLowerCase()).toBe('bookmark-list-container');
    });

    it('should load bookmarks on connect', async () => {
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      await element.updateComplete;
      
      // Wait for async loading to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(DatabaseService.getPageFromAnchorBookmark).toHaveBeenCalled();
      expect(DatabaseService.getBookmarksPaginated).toHaveBeenCalled();
      expect(DatabaseService.getBookmarkCount).toHaveBeenCalled();
    });

    it('should setup event listeners on connect', async () => {
      const mockSyncService = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.mocked(SyncService.getInstance).mockReturnValue(mockSyncService as any);
      
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      await element.updateComplete;
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
    });
  });

  describe('Data Flow', () => {
    it('should render presentation component with props', async () => {
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      await element.updateComplete;
      
      // Wait for the loadBookmarks promise to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      const presentationComponent = element.shadowRoot?.querySelector('bookmark-list');
      expect(presentationComponent).toBeTruthy();
      
      // Check that bookmarks are passed as props
      const bookmarksProp = (presentationComponent as any).bookmarks;
      expect(bookmarksProp).toEqual(mockBookmarks);
    });
  });

  describe('Event Handling', () => {
    it('should emit bookmark-selected event when callback is called', async () => {
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      let eventFired = false;
      let eventDetail: any = null;
      
      element.addEventListener('bookmark-selected', (e: any) => {
        eventFired = true;
        eventDetail = e.detail;
      });
      
      await element.updateComplete;
      
      const presentationComponent = element.shadowRoot?.querySelector('bookmark-list');
      expect(presentationComponent).toBeTruthy();
      
      // Simulate bookmark selection
      const onBookmarkSelect = (presentationComponent as any).onBookmarkSelect;
      onBookmarkSelect(1);
      
      expect(eventFired).toBe(true);
      expect(eventDetail.bookmarkId).toBe(1);
    });

    it('should handle sync request callback', async () => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'test-token',
        sync_interval: 300,
        auto_sync: true,
        reading_mode: 'original',
      });
      
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      await element.updateComplete;
      
      const presentationComponent = element.shadowRoot?.querySelector('bookmark-list');
      expect(presentationComponent).toBeTruthy();
      
      // Simulate sync request
      const onSyncRequested = (presentationComponent as any).onSyncRequested;
      await onSyncRequested();
      
      expect(SyncService.syncBookmarks).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should remove event listeners on disconnect', async () => {
      const mockSyncService = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.mocked(SyncService.getInstance).mockReturnValue(mockSyncService as any);
      
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      await element.updateComplete;
      
      // Disconnect the element
      element.remove();
      
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
    });
  });
});