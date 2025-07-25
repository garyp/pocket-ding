import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import { BookmarkListContainer } from '../../components/bookmark-list-container';
import { BookmarkList } from '../../components/bookmark-list';
import type { LocalBookmark } from '../../types';

// Mock DatabaseService
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getAllBookmarks: vi.fn(),
    getCompletedAssetsByBookmarkId: vi.fn(),
    getAssetsByBookmarkId: vi.fn(),
    saveAsset: vi.fn(),
  },
}));

// Mock SyncService 
vi.mock('../../services/sync-service', () => ({
  SyncService: {
    getInstance: vi.fn(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestSync: vi.fn(),
      getSyncProgress: vi.fn(() => ({ current: 0, total: 0 })),
      isSyncing: vi.fn(() => false),
    })),
    isSyncInProgress: vi.fn(() => false),
    getCurrentSyncProgress: vi.fn(() => ({ current: 0, total: 0 })),
  },
}));

// Mock FaviconService
vi.mock('../../services/favicon-service', () => ({
  FaviconService: {
    getFaviconForBookmark: vi.fn(),
    preloadFavicon: vi.fn(),
  },
}));

// Import after mocking
import { DatabaseService } from '../../services/database';
import { FaviconService } from '../../services/favicon-service';

describe('BookmarkList Favicon Integration', () => {
  let container: BookmarkListContainer;
  
  const testBookmarks: LocalBookmark[] = [
    {
      id: 1,
      url: 'https://example1.com',
      title: 'Test Bookmark 1',
      description: 'First test bookmark',
      notes: '',
      website_title: 'Example 1',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: 'https://example1.com/favicon.ico',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: ['test'],
      date_added: '2024-01-01T00:00:00Z',
      date_modified: '2024-01-01T00:00:00Z',
      is_synced: true
    },
    {
      id: 2,
      url: 'https://example2.com',
      title: 'Test Bookmark 2', 
      description: 'Second test bookmark',
      notes: '',
      website_title: 'Example 2',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: 'https://example2.com/favicon.ico',
      preview_image_url: '',
      is_archived: false,
      unread: false,
      shared: false,
      tag_names: ['test'],
      date_added: '2024-01-02T00:00:00Z',
      date_modified: '2024-01-02T00:00:00Z',
      is_synced: true
    }
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock DatabaseService responses
    vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(testBookmarks);
    vi.mocked(DatabaseService.getCompletedAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.saveAsset).mockResolvedValue(undefined);
    
    // Mock FaviconService responses
    vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue('data:image/png;base64,testfavicon');
    vi.mocked(FaviconService.preloadFavicon).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.clearAllMocks();
  });

  it('should load favicons when bookmarks become visible', async () => {
    // Create the container component
    container = new BookmarkListContainer();
    document.body.appendChild(container);
    
    // Wait for bookmarks to load
    await container.updateComplete;
    
    // Wait a bit more for the async loadBookmarks to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    await container.updateComplete;

    // Get the BookmarkList child component
    const bookmarkList = container.shadowRoot?.querySelector('bookmark-list') as BookmarkList;
    expect(bookmarkList).toBeDefined();

    // Wait for the component to render
    await bookmarkList.updateComplete;

    // Debug: Check if BookmarkList is still in loading state
    console.log('BookmarkList isLoading:', bookmarkList.isLoading);
    console.log('BookmarkList bookmarks length:', bookmarkList.bookmarks.length);
    
    // Find bookmark cards in the DOM
    const bookmarkCards = bookmarkList.shadowRoot?.querySelectorAll('[data-bookmark-id]');
    console.log('Found bookmark cards:', bookmarkCards?.length);
    expect(bookmarkCards?.length).toBe(2);

    // Simulate intersection observer detecting visible bookmarks
    // First get the intersection observer by accessing the private property
    const observer = (bookmarkList as any).intersectionObserver as IntersectionObserver;
    console.log('Intersection observer exists:', !!observer);
    expect(observer).toBeDefined();

    // Check if the bookmark elements have the correct data attributes
    console.log('Bookmark card data-bookmark-id attributes:', 
      Array.from(bookmarkCards!).map(card => card.getAttribute('data-bookmark-id')));

    // Create mock intersection entries
    const mockEntries = [
      {
        isIntersecting: true,
        target: bookmarkCards![0],
      },
      {
        isIntersecting: true,
        target: bookmarkCards![1],
      }
    ] as IntersectionObserverEntry[];

    // Check callback existence
    const observerCallback = (observer as any).callback;
    console.log('Observer callback exists:', !!observerCallback);

    // Check if the onFaviconLoadRequested callback is set
    console.log('onFaviconLoadRequested callback exists:', !!bookmarkList.onFaviconLoadRequested);

    // Simulate the intersection observer callback
    if (observerCallback) {
      console.log('Calling intersection observer callback with', mockEntries.length, 'entries');
      observerCallback(mockEntries);
    }

    // Wait for async favicon loading to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify that favicon loading was requested
    expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(1, 'https://example1.com/favicon.ico');
    expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(2, 'https://example2.com/favicon.ico');

    // Verify that favicon cache is populated in the component
    const bookmarkListElement = container.shadowRoot?.querySelector('bookmark-list') as BookmarkList;
    const faviconCache = bookmarkListElement.faviconCache;
    expect(faviconCache.size).toBe(2);
    expect(faviconCache.get(1)).toBe('data:image/png;base64,testfavicon');
    expect(faviconCache.get(2)).toBe('data:image/png;base64,testfavicon');
  });

  it('should not load favicons for bookmarks without favicon_url', async () => {
    // Create bookmarks with one missing favicon_url
    const bookmarksWithMissingFavicon = [
      ...testBookmarks,
      {
        id: 3,
        url: 'https://example3.com',
        title: 'Test Bookmark 3',
        description: 'Third test bookmark',
        notes: '',
        website_title: 'Example 3',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '', // Empty favicon URL
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: ['test'],
        date_added: '2024-01-03T00:00:00Z',
        date_modified: '2024-01-03T00:00:00Z',
        is_synced: true
      }
    ];

    vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(bookmarksWithMissingFavicon);

    container = new BookmarkListContainer();
    document.body.appendChild(container);
    await container.updateComplete;
    
    // Wait for async loadBookmarks to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    await container.updateComplete;

    const bookmarkList = container.shadowRoot?.querySelector('bookmark-list') as BookmarkList;
    await bookmarkList.updateComplete;

    const bookmarkCards = bookmarkList.shadowRoot?.querySelectorAll('[data-bookmark-id]');
    expect(bookmarkCards?.length).toBe(3);

    // Simulate all bookmarks becoming visible
    const observer = (bookmarkList as any).intersectionObserver as IntersectionObserver;
    const mockEntries = Array.from(bookmarkCards!).map(card => ({
      isIntersecting: true,
      target: card,
    })) as IntersectionObserverEntry[];

    const observerCallback = (observer as any).callback;
    if (observerCallback) {
      observerCallback(mockEntries);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should only request favicons for bookmarks with favicon_url
    expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledTimes(2);
    expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(1, 'https://example1.com/favicon.ico');
    expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(2, 'https://example2.com/favicon.ico');
    expect(FaviconService.getFaviconForBookmark).not.toHaveBeenCalledWith(3, '');
  });

  it('should not load favicons that are already cached', async () => {
    container = new BookmarkListContainer();
    document.body.appendChild(container);
    await container.updateComplete;
    
    // Wait for async loadBookmarks to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    await container.updateComplete;

    const bookmarkList = container.shadowRoot?.querySelector('bookmark-list') as BookmarkList;
    await bookmarkList.updateComplete;

    // Pre-populate favicon cache
    bookmarkList.faviconCache.set(1, 'data:image/png;base64,cached');

    const bookmarkCards = bookmarkList.shadowRoot?.querySelectorAll('[data-bookmark-id]');
    const observer = (bookmarkList as any).intersectionObserver as IntersectionObserver;
    
    const mockEntries = Array.from(bookmarkCards!).map(card => ({
      isIntersecting: true,
      target: card,
    })) as IntersectionObserverEntry[];

    const observerCallback = (observer as any).callback;
    if (observerCallback) {
      observerCallback(mockEntries);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should only request favicon for bookmark 2 (bookmark 1 is already cached)
    // Note: getFaviconForBookmark may be called by the FaviconController.loadFavicon method 
    // which calls FaviconService.getFaviconForBookmark, so we check that bookmark 1 (cached) is not loaded
    expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(2, 'https://example2.com/favicon.ico');
    
    // The key test is that the cached favicon (bookmark 1) should not trigger loading
    const calls = vi.mocked(FaviconService.getFaviconForBookmark).mock.calls;
    const bookmark1Calls = calls.filter(call => call[0] === 1 && call[1] === 'https://example1.com/favicon.ico');
    expect(bookmark1Calls.length).toBe(0);
  });
});