import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import { BookmarkList } from '../../components/bookmark-list';
import { DatabaseService } from '../../services/database';
import type { LocalBookmark, AppSettings } from '../../types';

describe('BookmarkList Controller Integration', () => {
  let element: BookmarkList;
  let mockBookmarks: LocalBookmark[];
  let mockSettings: AppSettings;

  beforeEach(async () => {
    localStorage.clear();
    
    // Ensure IntersectionObserver is properly mocked (re-establish after vi.clearAllMocks())
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
    
    mockSettings = {
      linkding_url: 'https://example.com',
      linkding_token: 'test-token',
      sync_interval: 30,
      auto_sync: false,
      reading_mode: 'readability'
    };

    mockBookmarks = [
      {
        id: 1,
        url: 'https://example.com/1',
        title: 'Unread Bookmark',
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
        title: 'Read Bookmark',
        description: 'Description 2',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: false,
        shared: false,
        tag_names: ['read'],
        date_added: '2024-01-02T00:00:00Z',
        date_modified: '2024-01-02T00:00:00Z'
      },
      {
        id: 3,
        url: 'https://example.com/3',
        title: 'Archived Bookmark',
        description: 'Description 3',
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
        date_added: '2024-01-03T00:00:00Z',
        date_modified: '2024-01-03T00:00:00Z'
      }
    ];

    // Mock database service
    vi.spyOn(DatabaseService, 'getSettings').mockResolvedValue(mockSettings);
    vi.spyOn(DatabaseService, 'getAllBookmarks').mockResolvedValue(mockBookmarks);
    vi.spyOn(DatabaseService, 'getCompletedAssetsByBookmarkId').mockResolvedValue([]);
  });

  afterEach(() => {
    localStorage.clear();
    if (element && element.parentNode) {
      element.remove();
    }
    vi.restoreAllMocks();
  });

  function createTestElement(filter: 'all' | 'unread' | 'archived' = 'all'): BookmarkList {
    const el = new BookmarkList();
    el.bookmarks = mockBookmarks;
    el.isLoading = false;
    el.syncedBookmarkIds = new Set();
    el.faviconCache = new Map();
    el.bookmarksWithAssets = new Set();
    el.paginationState = {
      currentPage: 1,
      pageSize: 25,
      totalCount: filter === 'all' ? 2 : filter === 'unread' ? 1 : 1,
      totalPages: 1,
      filter
    };
    return el;
  }

  describe('End-to-End State Persistence', () => {
    it('should persist scroll position across browser navigation simulation', async () => {
      // Simulate first page visit with 'unread' filter
      element = createTestElement('unread');
      document.body.appendChild(element);
      await element.updateComplete;

      // Verify content is filtered correctly (via props)
      let bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Unread Bookmark');

      // Verify filter buttons show correct state (via props)
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      expect(unreadBtn?.tagName.toLowerCase()).toBe('md-filled-button');

      // User scrolls down
      const mockScrollContainer = { 
        scrollTop: 250,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;
      (element as any).saveCurrentScrollPosition();

      // Simulate navigation away (component destruction)
      element.remove();

      // Simulate navigation back (component recreation) - scroll state should be restored
      element = createTestElement('unread');
      document.body.appendChild(element);
      await element.updateComplete;

      // Verify content is still filtered correctly (via props)
      bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Unread Bookmark');

      // Verify scroll position was restored
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(250);
    });

    it('should call filter change callbacks for each filter', async () => {
      const onFilterChange = vi.fn();
      element = createTestElement('all');
      element.onFilterChange = onFilterChange;
      document.body.appendChild(element);
      await element.updateComplete;

      // Test filter sequence: call callbacks for unread -> archived -> all
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      const archivedBtn = buttons.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;

      // Start with 'all' filter (via props)
      let bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(2); // Non-archived bookmarks

      // Click unread filter - should call the callback
      unreadBtn.click();
      await element.updateComplete;
      expect(onFilterChange).toHaveBeenCalledWith('unread');

      // Click archived filter - should call the callback
      archivedBtn.click();  
      await element.updateComplete;
      expect(onFilterChange).toHaveBeenCalledWith('archived');

      // Click all filter - should call the callback
      allBtn.click();
      await element.updateComplete;
      expect(onFilterChange).toHaveBeenCalledWith('all');

      // Should have called callback 3 times total
      expect(onFilterChange).toHaveBeenCalledTimes(3);
    });

    it('should update display when bookmark data changes', async () => {
      element = createTestElement('unread');
      document.body.appendChild(element);
      await element.updateComplete;

      // Initially should show 1 unread bookmark
      let bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Unread Bookmark');

      // Update bookmarks data (simulate sync with new bookmark)
      const updatedBookmarks = [...mockBookmarks, {
        id: 4,
        url: 'https://example.com/4',
        title: 'New Unread Bookmark',
        description: 'New Description',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: ['new'],
        date_added: '2024-01-04T00:00:00Z',
        date_modified: '2024-01-04T00:00:00Z'
      }];

      element.bookmarks = updatedBookmarks;
      await element.updateComplete;

      // Filter should show both unread bookmarks now
      bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(2); // Both unread bookmarks

      // Filter button should still show active state (unread filter via props)
      const currentButtons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const currentUnreadBtn = currentButtons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      expect(currentUnreadBtn?.tagName.toLowerCase()).toBe('md-filled-button');
    });

    it('should handle storage errors and continue functioning', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onFilterChange = vi.fn();

      // Store original setItem function
      const originalSetItem = localStorage.setItem;
      
      // Mock localStorage to fail BEFORE creating component
      Object.defineProperty(global.localStorage, 'setItem', {
        value: vi.fn(() => {
          throw new Error('Storage quota exceeded');
        }),
        writable: true
      });

      element = createTestElement('all');
      element.onFilterChange = onFilterChange;
      document.body.appendChild(element);
      await element.updateComplete;

      // Component should still function despite storage errors
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      
      unreadBtn.click();
      await element.updateComplete;

      // Filter callbacks should still work despite storage errors
      expect(onFilterChange).toHaveBeenCalledWith('unread');

      // Trigger scroll position save which should fail and log error
      const mockScrollContainer = { 
        scrollTop: 100,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;
      (element as any).saveCurrentScrollPosition();

      // Should have logged the error (scroll position save attempts will fail)
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Restore original localStorage functionality
      Object.defineProperty(global.localStorage, 'setItem', {
        value: originalSetItem,
        writable: true
      });
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle corrupted localStorage data gracefully', async () => {
      // Set corrupted data in localStorage first
      localStorage.setItem('bookmark-list-state', 'corrupted-json-data');

      element = createTestElement('all');
      document.body.appendChild(element);
      await element.updateComplete;

      // Should still show filter state correctly (via props, not localStorage)
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      expect(allBtn?.tagName.toLowerCase()).toBe('md-filled-button');

      // Should display all non-archived bookmarks
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(2);
      
      // Scroll position should fall back to default (0) due to corrupted data
      expect((element as any).scrollPosition).toBe(0);
    });
  });
});
