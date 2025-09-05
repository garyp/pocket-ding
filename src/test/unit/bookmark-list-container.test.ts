import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';
import { BookmarkListContainer } from '../../components/bookmark-list-container';
import type { LocalBookmark } from '../../types';

// Mock the services - must be static for Vitest hoisting
vi.mock('../../services/database', () => ({
  DatabaseService: {
    // Promise-based methods only
    getBookmarksPaginated: vi.fn(),
    getBookmarkCount: vi.fn(),
    getPageFromAnchorBookmark: vi.fn(),
    getBookmarksWithAssetCounts: vi.fn(),
    getCompletedAssetsByBookmarkId: vi.fn(),
    getSettings: vi.fn(),
    getBookmark: vi.fn(),
    saveBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
    updateBookmarkReadStatus: vi.fn(),
    saveReadProgress: vi.fn(),
    getReadProgress: vi.fn(),
    saveAsset: vi.fn(),
    getAssetsByBookmarkId: vi.fn(),
    getLastSyncTimestamp: vi.fn(),
    setLastSyncTimestamp: vi.fn(),
    getAllFilterCounts: vi.fn(),
  },
}));

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

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup database mocks - now using Promise-based API only
    vi.mocked(DatabaseService.getBookmarksPaginated).mockResolvedValue(mockBookmarks);
    vi.mocked(DatabaseService.getBookmarkCount).mockResolvedValue(1);
    vi.mocked(DatabaseService.getPageFromAnchorBookmark).mockResolvedValue(1);
    vi.mocked(DatabaseService.getBookmarksWithAssetCounts).mockResolvedValue(new Map([[1, false]]));
    vi.mocked(DatabaseService.getCompletedAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({ all: 1, unread: 1, archived: 0 });
    
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

    it('should not load bookmarks on connect (data handled by reactive queries)', async () => {
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      await element.updateComplete;
      
      // Wait for any potential async operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Database methods should NOT be called by container anymore - reactive queries handle this
      expect(DatabaseService.getPageFromAnchorBookmark).not.toHaveBeenCalled();
      expect(DatabaseService.getBookmarksPaginated).not.toHaveBeenCalled();
      expect(DatabaseService.getBookmarkCount).not.toHaveBeenCalled();
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
    it('should render presentation component with simplified pagination state', async () => {
      element = new BookmarkListContainer();
      document.body.appendChild(element);
      
      await element.updateComplete;
      
      const presentationComponent = element.shadowRoot?.querySelector('bookmark-list');
      expect(presentationComponent).toBeTruthy();
      
      // Check that simplified pagination state is passed correctly
      // Data counts (totalCount, totalPages, filterCounts) are now computed by reactive queries
      const paginationStateProp = (presentationComponent as any).paginationState;
      expect(paginationStateProp).toEqual({
        currentPage: 1,
        pageSize: 25,
        totalCount: 0, // Now handled by reactive queries
        totalPages: 1, // Now handled by reactive queries
        filter: 'all'
        // filterCounts removed - now handled by reactive queries
      });
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

    // NOTE: onSyncRequested callback test removed because reactive BookmarkList 
    // no longer requires manual sync callbacks - it automatically updates when database changes
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