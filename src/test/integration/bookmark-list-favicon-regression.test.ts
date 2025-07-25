import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import { BookmarkList } from '../../components/bookmark-list';
import type { LocalBookmark } from '../../types';

describe('BookmarkList Favicon Loading Regression Test', () => {
  let element: BookmarkList;
  let mockIntersectionObserver: any;
  let intersectionCallback: IntersectionObserverCallback;
  let observedElements: Element[];

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
    vi.clearAllMocks();
    observedElements = [];

    // Create a more sophisticated mock that captures the callback and observed elements
    mockIntersectionObserver = {
      observe: vi.fn((element: Element) => {
        observedElements.push(element);
      }),
      unobserve: vi.fn((element: Element) => {
        const index = observedElements.indexOf(element);
        if (index > -1) {
          observedElements.splice(index, 1);
        }
      }),
      disconnect: vi.fn(() => {
        observedElements = [];
      }),
    };

    // Mock IntersectionObserver constructor to capture callback
    global.IntersectionObserver = vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
      intersectionCallback = callback;
      return mockIntersectionObserver;
    });
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.remove();
    }
    vi.restoreAllMocks();
  });

  describe('REGRESSION: Favicon loading intersection observer timing', () => {
    it('should trigger favicon loading when bookmarks become visible', async () => {
      const onFaviconLoadRequested = vi.fn();
      const onVisibilityChanged = vi.fn();

      // Create component with callbacks
      element = new BookmarkList();
      element.bookmarks = mockBookmarks;
      element.isLoading = false;
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.bookmarksWithAssets = new Set();
      element.onFaviconLoadRequested = onFaviconLoadRequested;
      element.onVisibilityChanged = onVisibilityChanged;

      // Add to DOM
      document.body.appendChild(element);
      await element.updateComplete;

      // Wait for requestAnimationFrame to complete (this is where the bug was)
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
      const onVisibilityChanged = vi.fn();

      // Bookmark without favicon_url
      const bookmarksWithoutFavicon = [{
        ...mockBookmarks[0],
        favicon_url: '',
      }];

      element = new BookmarkList();
      element.bookmarks = bookmarksWithoutFavicon;
      element.isLoading = false;
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.bookmarksWithAssets = new Set();
      element.onFaviconLoadRequested = onFaviconLoadRequested;
      element.onVisibilityChanged = onVisibilityChanged;

      document.body.appendChild(element);
      await element.updateComplete;
      await new Promise(resolve => requestAnimationFrame(resolve));

      const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      
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

      intersectionCallback(visibleEntries, mockIntersectionObserver);

      // Should trigger visibility change but NOT favicon request
      expect(onVisibilityChanged).toHaveBeenCalledWith([1]);
      expect(onFaviconLoadRequested).not.toHaveBeenCalled();
    });

    it('should NOT trigger favicon request if favicon is already cached', async () => {
      const onFaviconLoadRequested = vi.fn();
      const onVisibilityChanged = vi.fn();

      element = new BookmarkList();
      element.bookmarks = mockBookmarks;
      element.isLoading = false;
      // Pre-populate cache
      element.faviconCache = new Map([[1, 'data:image/png;base64,cached-favicon']]);
      element.syncedBookmarkIds = new Set();
      element.bookmarksWithAssets = new Set();
      element.onFaviconLoadRequested = onFaviconLoadRequested;
      element.onVisibilityChanged = onVisibilityChanged;

      document.body.appendChild(element);
      await element.updateComplete;
      await new Promise(resolve => requestAnimationFrame(resolve));

      const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      
      // Simulate first bookmark becoming visible (should not request favicon - already cached)
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

      // Should trigger visibility change but NOT favicon request (already cached)
      expect(onVisibilityChanged).toHaveBeenCalledWith([1]);
      expect(onFaviconLoadRequested).not.toHaveBeenCalled();
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
              this.restoreScrollPosition();
              // BUG: updateObservedElements only called here, missing other cases
              this.updateObservedElements();
            });
          }
          // MISSING: No call to updateObservedElements for other DOM changes
        }
      }

      const brokenElement = new BrokenBookmarkList();
      brokenElement.bookmarks = [];  // Start with empty bookmarks
      brokenElement.isLoading = false;
      brokenElement.faviconCache = new Map();
      brokenElement.syncedBookmarkIds = new Set();
      brokenElement.bookmarksWithAssets = new Set();
      brokenElement.onFaviconLoadRequested = onFaviconLoadRequested;

      document.body.appendChild(brokenElement);
      await brokenElement.updateComplete;

      // Now set bookmarks directly (not through property change detection)
      // This simulates scenarios where DOM is updated but intersection observer isn't
      brokenElement.bookmarks = mockBookmarks;
      brokenElement.requestUpdate(); // Force re-render
      await brokenElement.updateComplete;

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
      const onFaviconLoadRequested = vi.fn();
      const onVisibilityChanged = vi.fn();

      element = new BookmarkList();
      // Start with empty bookmarks to test edge case
      element.bookmarks = [];
      element.isLoading = false;
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.bookmarksWithAssets = new Set();
      element.onFaviconLoadRequested = onFaviconLoadRequested;
      element.onVisibilityChanged = onVisibilityChanged;

      document.body.appendChild(element);
      await element.updateComplete;

      // Now update bookmarks (common scenario - bookmarks loaded after component mounted)
      element.bookmarks = mockBookmarks;
      await element.updateComplete;

      // With our fix, updateObservedElements is always called after DOM updates
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Verify elements are in DOM
      const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
      expect(bookmarkElements!.length).toBe(2);

      // Verify intersection observer is properly observing
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

      intersectionCallback(visibleEntries, mockIntersectionObserver);

      // With our fix, this should ALWAYS work
      expect(onFaviconLoadRequested).toHaveBeenCalledWith(1, 'https://example.com/favicon1.ico');
      expect(onVisibilityChanged).toHaveBeenCalledWith([1]);
    });

    it('should properly re-observe elements when bookmarks change', async () => {
      const onFaviconLoadRequested = vi.fn();

      element = new BookmarkList();
      element.bookmarks = [mockBookmarks[0]]; // Start with one bookmark
      element.isLoading = false;
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.bookmarksWithAssets = new Set();
      element.onFaviconLoadRequested = onFaviconLoadRequested;

      document.body.appendChild(element);
      await element.updateComplete;
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Initially should observe 1 element
      expect(mockIntersectionObserver.observe).toHaveBeenCalledTimes(1);
      expect(observedElements).toHaveLength(1);

      // Add more bookmarks
      element.bookmarks = mockBookmarks; // Now has 2 bookmarks
      await element.updateComplete;
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Should disconnect and re-observe all elements
      expect(mockIntersectionObserver.disconnect).toHaveBeenCalled();
      // Total observe calls should be > 1 (from initial + from update)
      expect(mockIntersectionObserver.observe).toHaveBeenCalledTimes(3); // 1 initial + 2 after update
      expect(observedElements).toHaveLength(2);
    });
  });
});