import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import { BookmarkList } from '../../components/bookmark-list';
import type { LocalBookmark } from '../../types';

// Mock liveQuery from Dexie
vi.mock('dexie', () => ({
  liveQuery: vi.fn(),
  default: vi.fn(), // Mock default Dexie export
  Table: vi.fn() // Mock Table export
}));

// Mock DatabaseService - must be before imports for Vitest hoisting
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getBookmarksPaginated: vi.fn(),
    getAllFilterCounts: vi.fn(),
    getBookmarksWithAssetCounts: vi.fn(),
    getSettings: vi.fn(),
    getAllBookmarks: vi.fn(),
    getCompletedAssetsByBookmarkId: vi.fn(),
  },
}));

import { DatabaseService } from '../../services/database';
import { liveQuery } from 'dexie';

describe('BookmarkList Controller Integration', () => {
  let element: BookmarkList;
  let mockBookmarks: LocalBookmark[];

  beforeEach(async () => {
    // Clear mock call history but keep module mocks
    vi.clearAllMocks();
    localStorage.clear();
    
    // Ensure IntersectionObserver is properly mocked
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
    
    mockBookmarks = [
      {
        id: 1,
        url: 'https://example.com/1',
        title: 'Test Bookmark 1',
        description: 'Description 1',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: ['test'],
        date_added: '2024-01-01T00:00:00Z',
        date_modified: '2024-01-01T00:00:00Z'
      },
      {
        id: 2,
        url: 'https://example.com/2',
        title: 'Test Bookmark 2',
        description: 'Description 2',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: true,
        unread: false,
        shared: false,
        tag_names: ['archived'],
        date_added: '2024-01-02T00:00:00Z',
        date_modified: '2024-01-02T00:00:00Z'
      }
    ];
    
    // Mock DatabaseService methods for reactive queries
    vi.mocked(DatabaseService.getBookmarksPaginated).mockImplementation(async (filter) => {
      if (filter === 'unread') {
        return mockBookmarks.filter(b => b.unread && !b.is_archived);
      }
      if (filter === 'archived') {
        return mockBookmarks.filter(b => b.is_archived);
      }
      return mockBookmarks.filter(b => !b.is_archived); // 'all' filter
    });
    
    vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({
      all: mockBookmarks.filter(b => !b.is_archived).length,
      unread: mockBookmarks.filter(b => b.unread && !b.is_archived).length,
      archived: mockBookmarks.filter(b => b.is_archived).length
    });
    
    vi.mocked(DatabaseService.getBookmarksWithAssetCounts).mockResolvedValue(new Map());
    
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
    // Only clear mocks set in specific tests
    vi.clearAllMocks();
    localStorage.clear();
  });

  function createTestElement(filter: 'all' | 'unread' | 'archived' = 'all'): BookmarkList {
    const el = new BookmarkList();
    // Remove old property assignments - these are now reactive getters
    // el.bookmarks = mockBookmarks;  // Now a getter from reactive query
    // el.isLoading = false;          // Now a getter from reactive query
    // el.bookmarksWithAssets = new Set(); // Now a getter from reactive query
    el.syncedBookmarkIds = new Set();
    el.faviconCache = new Map();
    el.paginationState = {
      currentPage: 1,
      pageSize: 25,
      totalCount: filter === 'all' ? 1 : filter === 'unread' ? 1 : 1,
      totalPages: 1,
      filter
    };
    return el;
  }

  describe('State Controller Integration', () => {
    it('should initialize with default scroll position when no saved state exists', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should show the filter passed via props
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      
      expect(allBtn?.tagName.toLowerCase()).toBe('md-filled-button');
    });

    it('should restore previously saved scroll position', async () => {
      // Save state before creating component
      localStorage.setItem('bookmark-list-state', JSON.stringify({
        scrollPosition: 150
      }));

      element = createTestElement('unread');
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should show the unread filter (passed via props)
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      
      expect(unreadBtn?.tagName.toLowerCase()).toBe('md-filled-button');
      expect(allBtn?.tagName.toLowerCase()).toBe('md-text-button');
      
      // Check that scroll position was restored from state controller
      expect((element as any).scrollPosition).toBe(150);
    });

    it('should call filter change callback when filter button is clicked', async () => {
      const onFilterChange = vi.fn();
      element = createTestElement();
      element.onFilterChange = onFilterChange;
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Click unread filter
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      
      expect(unreadBtn).toBeTruthy();
      unreadBtn.click();
      await element.updateComplete;

      // Should have called the callback instead of managing state internally
      expect(onFilterChange).toHaveBeenCalledWith('unread');
    });

    it('should validate saved state and reject invalid scroll position', async () => {
      // Save invalid state
      localStorage.setItem('bookmark-list-state', JSON.stringify({
        scrollPosition: -100
      }));

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should fall back to default scroll position of 0
      expect((element as any).scrollPosition).toBe(0);
    });

    it('should handle storage errors gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Create a local mock that only affects this test
      // Store original localStorage for this test only
      const originalLocalStorage = localStorage;
      
      // Mock localStorage.setItem to fail
      const setItemMock = vi.fn(() => {
        throw new Error('Storage quota exceeded');
      });
      
      // Replace the entire localStorage object to ensure StateController gets the mock
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          ...localStorage,
          setItem: setItemMock,
          clear: vi.fn() // Ensure clear method exists for test cleanup
        },
        writable: true
      });

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Mock scroll container and trigger scroll position save
      const mockScrollContainer = { 
        scrollTop: 100,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;
      
      // Verify initial state
      expect(element.scrollPosition).toBe(0);
      
      // Try to set scroll position which should trigger storage error
      element.scrollPosition = 100;
      await element.updateComplete;
      
      // Verify the property was set
      expect(element.scrollPosition).toBe(100);

      // Should have logged warning but not crashed
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Restore localStorage for this test only
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        writable: true
      });
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Scroll Position Integration', () => {
    it('should persist scroll position through controller', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Mock scroll container with event methods
      const mockScrollContainer = { 
        scrollTop: 250,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;

      // Save scroll position - set the property directly
      element.scrollPosition = 250;
      await element.updateComplete; // Wait for StateController auto-sync

      // Check localStorage
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(250);
    });

    it('should restore scroll position from controller', async () => {
      // Save state with scroll position
      localStorage.setItem('bookmark-list-state', JSON.stringify({
        selectedFilter: 'all',
        scrollPosition: 300
      }));

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // The scroll position is restored automatically when the component connects
      // Check that the internal scrollPosition property was set correctly
      expect(element.scrollPosition).toBe(300);
    });

    it('should enforce minimum scroll position of 0', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Set negative scroll position and let component handle it
      element.scrollPosition = -50;
      await element.updateComplete;
      
      // The component should clamp to minimum of 0
      expect(element.scrollPosition).toBe(0);
    });
  });

  describe('Component Lifecycle Integration', () => {
    it('should maintain scroll position across component recreation', async () => {
      // Create first instance with archived filter
      let element1 = createTestElement('archived');
      document.body.appendChild(element1);
      await element1.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify it shows archived filter (from props)
      const buttons1 = Array.from(element1.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const archivedBtn1 = buttons1.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;
      expect(archivedBtn1?.tagName.toLowerCase()).toBe('md-filled-button');

      // Set scroll position through the property
      element1.scrollPosition = 400;
      await element1.updateComplete;

      // Remove first instance
      element1.remove();

      // Create second instance with same filter (simulating container maintaining filter state)
      let element2 = createTestElement('archived');
      document.body.appendChild(element2);
      await element2.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify filter state is maintained (via props, not localStorage)
      const buttons2 = Array.from(element2.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const archivedBtn2 = buttons2.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;
      expect(archivedBtn2?.tagName.toLowerCase()).toBe('md-filled-button');

      // Verify scroll position was restored from localStorage
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(400);
      expect((element2 as any).scrollPosition).toBe(400);

      element2.remove();
    });

    it('should save scroll position on disconnect', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Set scroll position before disconnect
      element.scrollPosition = 150;
      await element.updateComplete;

      // Disconnect component (should trigger save)
      element.remove();

      // Check that scroll position was saved
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(150);
    });
  });

  describe('Filter Functionality with Props', () => {
    it('should filter bookmarks correctly based on paginationState prop', async () => {
      element = createTestElement('unread');
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should only show unread, non-archived bookmarks (bookmark 1)
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      
      const displayedTitle = bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent;
      expect(displayedTitle).toBe('Test Bookmark 1');
    });

    it('should show archived bookmarks when archived filter is set via props', async () => {
      element = createTestElement('archived');
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should only show archived bookmarks (bookmark 2)
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      
      const displayedTitle = bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent;
      expect(displayedTitle).toBe('Test Bookmark 2');
    });

    it('should update filter counts based on reactive queries', async () => {
      element = createTestElement('all');
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive queries to load
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check filter button counts - reactive queries now provide all counts
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      const archivedBtn = buttons.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;

      // All filters now show correct counts from reactive queries
      expect(allBtn?.textContent).toContain('All (1)'); // All non-archived bookmarks
      expect(unreadBtn?.textContent).toContain('Unread (1)'); // Unread non-archived bookmarks
      expect(archivedBtn?.textContent).toContain('Archived (1)'); // Archived bookmarks
    });
  });
});
