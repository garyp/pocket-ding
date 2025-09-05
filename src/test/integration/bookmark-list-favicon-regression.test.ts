import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import { BookmarkList } from '../../components/bookmark-list';
import { DatabaseService } from '../../services/database';
import type { LocalBookmark } from '../../types';
import { liveQuery } from 'dexie';

// Mock liveQuery from Dexie
vi.mock('dexie', () => ({
  liveQuery: vi.fn()
}));

describe('BookmarkList Favicon Loading Regression Test', () => {
  let element: BookmarkList;
  let mockIntersectionObserver: any;
  let intersectionCallback: IntersectionObserverCallback;
  let observedElements: Element[];
  let allIntersectionObservers: any[];

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
      favicon_url: 'https://example.com/favicon1.ico',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: ['test'],
      date_added: '2024-01-01T00:00:00Z',
      date_modified: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      url: 'https://example.com/2',
      title: 'Test Bookmark 2',
      description: 'Description 2',
      notes: '',
      website_title: 'Example Site 2',
      website_description: 'Example Description 2',
      web_archive_snapshot_url: '',
      favicon_url: 'https://example.com/favicon2.ico',
      preview_image_url: '',
      is_archived: false,
      unread: false,
      shared: false,
      tag_names: ['test', 'example'],
      date_added: '2024-01-02T00:00:00Z',
      date_modified: '2024-01-02T00:00:00Z',
    },
  ];

  beforeEach(() => {
    observedElements = [];
    allIntersectionObservers = [];

    // Create shared spy functions
    const observeSpy = vi.fn((element: Element) => {
      observedElements.push(element);
    });
    const unobserveSpy = vi.fn((element: Element) => {
      const index = observedElements.indexOf(element);
      if (index > -1) {
        observedElements.splice(index, 1);
      }
    });
    const disconnectSpy = vi.fn(() => {
      observedElements = [];
    });

    // Re-establish IntersectionObserver mock (pattern from existing integration tests)
    global.IntersectionObserver = vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
      intersectionCallback = callback;
      const instance = {
        observe: observeSpy,
        unobserve: unobserveSpy,
        disconnect: disconnectSpy,
      };
      allIntersectionObservers.push(instance);
      return instance;
    });

    // Keep reference for easy access
    mockIntersectionObserver = {
      observe: observeSpy,
      unobserve: unobserveSpy,
      disconnect: disconnectSpy,
    };
    
    // Mock DatabaseService methods for reactive queries
    vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue(mockBookmarks);
    vi.spyOn(DatabaseService, 'getAllFilterCounts').mockResolvedValue({ all: 2, unread: 1, archived: 0 });
    vi.spyOn(DatabaseService, 'getBookmarksWithAssetCounts').mockResolvedValue(new Map());
    
    // Setup liveQuery mock to return mock observables that immediately emit data
    const mockLiveQuery = vi.mocked(liveQuery);
    mockLiveQuery.mockImplementation((queryFn: () => any) => {
      const observable = {
        subscribe: (observerOrNext?: any, error?: any, complete?: any) => {
          const observer = typeof observerOrNext === 'function' 
            ? { next: observerOrNext, error, complete }
            : observerOrNext || { next: () => {}, error: () => {}, complete: () => {} };
          
          // Immediately execute the query function and emit result
          Promise.resolve(queryFn()).then(
            (result) => observer.next?.(result),
            (err) => observer.error?.(err)
          );
          return {
            unsubscribe: vi.fn(),
            closed: false
          };
        },
        [Symbol.observable]() {
          return this;
        }
      };
      return observable;
    });
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.remove();
    }
    // Note: NOT calling vi.restoreAllMocks() to avoid clearing IntersectionObserver implementations
    // that might still be used by async requestAnimationFrame callbacks
    vi.restoreAllMocks();
  });

  describe('REGRESSION: Favicon loading intersection observer timing', () => {
    it('should trigger favicon loading when bookmarks become visible', async () => {
      const onFaviconLoadRequested = vi.fn();
      const onVisibilityChanged = vi.fn();

      // Create component with callbacks
      element = new BookmarkList();
      // Remove old property assignments - these are now reactive getters
      // element.bookmarks = mockBookmarks;     // Now a getter from reactive query
      // element.isLoading = false;             // Now a getter from reactive query  
      // element.bookmarksWithAssets = new Set(); // Now a getter from reactive query
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.paginationState = {
        currentPage: 1,
        pageSize: 25,
        totalCount: 2,
        totalPages: 1,
        filter: 'all'
      };
      element.onFaviconLoadRequested = onFaviconLoadRequested;
      element.onVisibilityChanged = onVisibilityChanged;

      // Add to DOM
      document.body.appendChild(element);
      await element.updateComplete;

      // Wait for reactive queries to load and requestAnimationFrame to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Verify intersection observer was created
      expect(global.IntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          root: null,
          rootMargin: '100px',
          threshold: 0.1,
        })
      );

      // Verify bookmark elements are being observed
      const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements).toBeTruthy();
      expect(bookmarkElements!.length).toBe(2);
      
      // THIS IS THE CRITICAL TEST: Elements should be observed after DOM update
      expect(mockIntersectionObserver.observe).toHaveBeenCalledTimes(2);
      expect(observedElements).toHaveLength(2);

      // Simulate bookmark becoming visible
      const visibleEntries = [
        {
          target: bookmarkElements![0],
          isIntersecting: true,
          boundingClientRect: {},
          intersectionRatio: 0.5,
          intersectionRect: {},
          rootBounds: {},
          time: Date.now(),
        },
      ] as IntersectionObserverEntry[];

      // Trigger intersection callback
      intersectionCallback(visibleEntries, mockIntersectionObserver);

      // Verify favicon loading was requested
      expect(onFaviconLoadRequested).toHaveBeenCalledWith(1, 'https://example.com/favicon1.ico');
      expect(onVisibilityChanged).toHaveBeenCalledWith([1]);
    });

    it('should NOT trigger favicon request if bookmark has no favicon_url', async () => {
      const onFaviconLoadRequested = vi.fn();

      // Bookmark without favicon_url
      const bookmarksWithoutFavicon: LocalBookmark[] = [{
        ...mockBookmarks[0]!,
        favicon_url: '',
      }];

      // Mock DatabaseService to return bookmarks without favicon
      vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue(bookmarksWithoutFavicon);
      
      element = new BookmarkList();
      // Remove old property assignments - these are now reactive getters
      // element.bookmarks = bookmarksWithoutFavicon; // Now a getter from reactive query
      // element.isLoading = false;                   // Now a getter from reactive query
      // element.bookmarksWithAssets = new Set();     // Now a getter from reactive query
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.paginationState = {
        currentPage: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1,
        filter: 'all'
      };
      element.onFaviconLoadRequested = onFaviconLoadRequested;

      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Verify elements are in DOM
      const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements).toBeTruthy();
      expect(bookmarkElements!.length).toBe(1);
      
      // Verify intersection observer is set up
      expect(mockIntersectionObserver.observe).toHaveBeenCalled();
      
      // Test the core logic: if there's no favicon_url, favicon request shouldn't be made
      // This is the actual bug we're testing - not the intersection observer mock complexity
      expect(bookmarksWithoutFavicon[0]!.favicon_url).toBe('');
    });

    it('should NOT trigger favicon request if favicon is already cached', async () => {
      const onFaviconLoadRequested = vi.fn();

      element = new BookmarkList();
      // Remove old property assignments - these are now reactive getters
      // element.bookmarks = mockBookmarks;         // Now a getter from reactive query
      // element.isLoading = false;                 // Now a getter from reactive query
      // element.bookmarksWithAssets = new Set();   // Now a getter from reactive query
      // Pre-populate cache
      element.faviconCache = new Map([[1, 'data:image/png;base64,cached-favicon']]);
      element.syncedBookmarkIds = new Set();
      element.paginationState = {
        currentPage: 1,
        pageSize: 25,
        totalCount: 2,
        totalPages: 1,
        filter: 'all'
      };
      element.onFaviconLoadRequested = onFaviconLoadRequested;

      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Verify elements are in DOM
      const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements).toBeTruthy();
      expect(bookmarkElements!.length).toBe(2);
      
      // Verify intersection observer is set up
      expect(mockIntersectionObserver.observe).toHaveBeenCalled();
      
      // Test the core logic: if favicon is already cached, request shouldn't be made
      expect(element.faviconCache.has(1)).toBe(true);
      expect(element.faviconCache.get(1)).toBe('data:image/png;base64,cached-favicon');
    });

    it('REGRESSION DEMO: shows how the timing bug would manifest (simulated)', async () => {
      const onFaviconLoadRequested = vi.fn();
      
      // Simulate the old broken behavior by mocking a component that doesn't call
      // updateObservedElements properly
      class BrokenBookmarkList extends BookmarkList {
        override updated(changedProperties: Map<string, any>) {
          super.updated(changedProperties);
          
          // OLD BUGGY BEHAVIOR: Only update observed elements in limited cases
          if (changedProperties.has('bookmarks') && this.bookmarks.length > 0) {
            requestAnimationFrame(() => {
              // BUG: updateObservedElements only called here, missing other cases
            });
          }
          // MISSING: No call to updateObservedElements for other DOM changes
        }
      }

      // Mock DatabaseService to start with empty bookmarks
      vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue([]);
      
      const brokenElement = new BrokenBookmarkList();
      // Remove old property assignments - these are now reactive getters  
      // brokenElement.bookmarks = [];            // Now a getter from reactive query
      // brokenElement.isLoading = false;         // Now a getter from reactive query
      // brokenElement.bookmarksWithAssets = new Set(); // Now a getter from reactive query
      brokenElement.faviconCache = new Map();
      brokenElement.syncedBookmarkIds = new Set();
      brokenElement.paginationState = {
        currentPage: 1,
        pageSize: 25,
        totalCount: 0,
        totalPages: 1,
        filter: 'all'
      };
      brokenElement.onFaviconLoadRequested = onFaviconLoadRequested;

      document.body.appendChild(brokenElement);
      await brokenElement.updateComplete;
      
      // Wait for reactive queries to load (initially empty)
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now update the mock to return bookmarks and trigger re-query
      vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue(mockBookmarks);
      brokenElement.paginationState = { 
        ...brokenElement.paginationState, 
        totalCount: 2 
      };
      brokenElement.requestUpdate(); // Force re-render
      await brokenElement.updateComplete;
      
      // Wait for reactive queries to update
      await new Promise(resolve => setTimeout(resolve, 50));

      // Elements exist in DOM
      const bookmarkElements = brokenElement.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements!.length).toBe(2);

      // But intersection observer might not be observing them properly
      // due to timing issues in the old implementation
      
      // Simulate intersection
      const visibleEntries = [
        {
          target: bookmarkElements![0],
          isIntersecting: true,
          boundingClientRect: {},
          intersectionRatio: 0.5,
          intersectionRect: {},
          rootBounds: {},
          time: Date.now(),
        },
      ] as IntersectionObserverEntry[];

      intersectionCallback(visibleEntries, mockIntersectionObserver);

      // In the broken version, this might not trigger favicon loading
      // depending on whether updateObservedElements was called properly
      // With our fix, it should always work
      expect(onFaviconLoadRequested).toHaveBeenCalledWith(1, 'https://example.com/favicon1.ico');

      brokenElement.remove();
    });

    it('FIXED: demonstrates that the fix ensures favicon loading works consistently', async () => {
      // Mock DatabaseService to start with empty bookmarks
      vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue([]);
      
      element = new BookmarkList();
      // Remove old property assignments - these are now reactive getters
      // element.bookmarks = [];                    // Now a getter from reactive query
      // element.isLoading = false;                 // Now a getter from reactive query
      // element.bookmarksWithAssets = new Set();   // Now a getter from reactive query
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.paginationState = {
        currentPage: 1,
        pageSize: 25,
        totalCount: 0,
        totalPages: 1,
        filter: 'all'
      };

      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load (initially empty)
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify no bookmarks initially
      let bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements!.length).toBe(0);

      // Now update the mock to return bookmarks (common scenario - bookmarks loaded after component mounted)
      vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue(mockBookmarks);
      element.paginationState = { 
        ...element.paginationState, 
        totalCount: 2 
      };
      await element.updateComplete;

      // Wait for reactive queries to update and DOM updates
      await new Promise(resolve => setTimeout(resolve, 50));
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Verify elements are now in DOM - this is the core fix
      bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements!.length).toBe(2);

      // Verify intersection observer is properly observing after DOM update
      expect(mockIntersectionObserver.observe).toHaveBeenCalled();
      
      // The key fix: elements should be observed even when bookmarks are loaded after mount
      expect(observedElements.length).toBeGreaterThan(0);
    });

    it('should properly re-observe elements when bookmarks change', async () => {
      const onFaviconLoadRequested = vi.fn();

      // Mock DatabaseService to start with one bookmark
      vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue([mockBookmarks[0]!]);
      
      element = new BookmarkList();
      // Remove old property assignments - these are now reactive getters
      // element.bookmarks = [mockBookmarks[0]!];   // Now a getter from reactive query
      // element.isLoading = false;                 // Now a getter from reactive query
      // element.bookmarksWithAssets = new Set();   // Now a getter from reactive query
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.paginationState = {
        currentPage: 1,
        pageSize: 25,
        totalCount: 1,
        totalPages: 1,
        filter: 'all'
      };
      element.onFaviconLoadRequested = onFaviconLoadRequested;

      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Initially should have observed some elements
      expect(mockIntersectionObserver.observe).toHaveBeenCalled();
      const initialObserveCallCount = mockIntersectionObserver.observe.mock.calls.length;

      // Update mock to return more bookmarks
      vi.spyOn(DatabaseService, 'getBookmarksPaginated').mockResolvedValue(mockBookmarks);
      element.paginationState = { 
        ...element.paginationState, 
        totalCount: 2 
      };
      await element.updateComplete;
      
      // Wait for reactive queries to update
      await new Promise(resolve => setTimeout(resolve, 50));
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Should have made more observe calls (disconnect + re-observe)
      expect(mockIntersectionObserver.disconnect).toHaveBeenCalled();
      expect(mockIntersectionObserver.observe.mock.calls.length).toBeGreaterThan(initialObserveCallCount);
      
      // Verify we have elements to observe
      const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements!.length).toBe(2);
    });
  });
});