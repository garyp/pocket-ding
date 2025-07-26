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
    
    // Use persistent implementations that won't be cleared by vi.restoreAllMocks()
    const persistentObserve = () => {};
    const persistentUnobserve = () => {};
    const persistentDisconnect = () => {};
    
    global.IntersectionObserver = function(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
      return {
        observe: persistentObserve,
        unobserve: persistentUnobserve,
        disconnect: persistentDisconnect,
      };
    } as any;
    
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

  function createTestElement(): BookmarkList {
    const el = new BookmarkList();
    el.bookmarks = mockBookmarks;
    el.isLoading = false;
    el.syncedBookmarkIds = new Set();
    el.faviconCache = new Map();
    el.bookmarksWithAssets = new Set();
    return el;
  }

  describe('End-to-End State Persistence', () => {
    it('should persist user session across browser navigation simulation', async () => {
      // Simulate first page visit
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // User changes filter to 'unread'
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      unreadBtn.click();
      await element.updateComplete;

      // User scrolls down
      const mockScrollContainer = { 
        scrollTop: 250,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;
      (element as any).saveCurrentScrollPosition();

      // Verify content is filtered correctly
      let bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Unread Bookmark');

      // Simulate navigation away (component destruction)
      element.remove();

      // Simulate navigation back (component recreation) - state should be restored
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Verify filter state was restored
      const newButtons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const restoredUnreadBtn = newButtons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      expect(restoredUnreadBtn?.tagName.toLowerCase()).toBe('md-filled-button');

      // Verify content is still filtered correctly
      bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Unread Bookmark');

      // Verify scroll position was restored
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(250);
    });

    it('should handle filter changes and maintain state consistency', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Test filter sequence: all -> unread -> archived -> all
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      const archivedBtn = buttons.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;

      // Start with 'all' filter (default)
      let bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(2); // Non-archived bookmarks

      // Switch to 'unread'
      unreadBtn.click();
      await element.updateComplete;
      bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Unread Bookmark');

      // Switch to 'archived'
      archivedBtn.click();
      await element.updateComplete;
      bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Archived Bookmark');

      // Switch back to 'all'
      allBtn.click();
      await element.updateComplete;
      bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(2); // Back to non-archived bookmarks

      // Verify final state is persisted
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.selectedFilter).toBe('all');
    });

    it('should maintain state during bookmark data updates', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Set filter to unread
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      unreadBtn.click();
      await element.updateComplete;

      // Update bookmarks data (simulate sync)
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

      // Filter should still be active and show both unread bookmarks
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(2); // Both unread bookmarks

      // Filter button should still be active
      const currentButtons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const currentUnreadBtn = currentButtons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      expect(currentUnreadBtn?.tagName.toLowerCase()).toBe('md-filled-button');
    });

    it('should handle storage errors and continue functioning', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Store original setItem function
      const originalSetItem = localStorage.setItem;
      
      // Mock localStorage to fail BEFORE creating component
      Object.defineProperty(global.localStorage, 'setItem', {
        value: vi.fn(() => {
          throw new Error('Storage quota exceeded');
        }),
        writable: true
      });

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Component should still function despite storage errors
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      
      unreadBtn.click();
      await element.updateComplete;

      // Filter should still work in memory
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      expect(bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent).toBe('Unread Bookmark');

      // Should have logged the error (either during init or during the filter change)
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Restore original localStorage functionality
      Object.defineProperty(global.localStorage, 'setItem', {
        value: originalSetItem,
        writable: true
      });
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle corrupted localStorage data gracefully', async () => {
      // Set corrupted data in localStorage
      localStorage.setItem('bookmark-list-state', 'corrupted-json-data');

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Should fall back to default state
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button, md-icon-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      expect(allBtn?.tagName.toLowerCase()).toBe('md-filled-button');

      // Should display all non-archived bookmarks
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(2);
    });
  });
});