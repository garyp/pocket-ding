import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import { BookmarkList } from '../../components/bookmark-list';
import type { LocalBookmark } from '../../types';

describe('BookmarkList Controller Integration', () => {
  let element: BookmarkList;
  let mockBookmarks: LocalBookmark[];

  beforeEach(async () => {
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
  });

  afterEach(() => {
    localStorage.clear();
    if (element && element.parentNode) {
      element.remove();
    }
  });

  function createTestElement(): BookmarkList {
    const el = new BookmarkList();
    el.bookmarks = mockBookmarks;
    el.isLoading = false;
    el.syncState = {
      isSyncing: false,
      syncProgress: 0,
      syncTotal: 0,
      syncedBookmarkIds: new Set()
    };
    el.faviconState = {
      faviconCache: new Map(),
      bookmarksWithAssets: new Set()
    };
    return el;
  }

  describe('State Controller Integration', () => {
    it('should initialize with default state when no saved state exists', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Should default to 'all' filter
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('sl-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      
      expect(allBtn?.getAttribute('variant')).toBe('primary');
    });

    it('should restore previously saved filter state', async () => {
      // Save state before creating component
      localStorage.setItem('bookmark-list-state', JSON.stringify({
        selectedFilter: 'unread',
        scrollPosition: 0
      }));

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Should restore 'unread' filter
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('sl-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      
      expect(unreadBtn?.getAttribute('variant')).toBe('primary');
      expect(allBtn?.getAttribute('variant')).toBe('default');
    });

    it('should persist filter changes through the controller', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Click archived filter
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('sl-button') || []);
      const archivedBtn = buttons.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;
      
      expect(archivedBtn).toBeTruthy();
      archivedBtn.click();
      await element.updateComplete;

      // Check localStorage was updated
      const savedData = localStorage.getItem('bookmark-list-state');
      expect(savedData).toBeTruthy();
      const savedState = JSON.parse(savedData!);
      expect(savedState.selectedFilter).toBe('archived');
    });

    it('should validate saved state and reject invalid data', async () => {
      // Save invalid state
      localStorage.setItem('bookmark-list-state', JSON.stringify({
        selectedFilter: 'invalid-filter',
        scrollPosition: -100
      }));

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Should fall back to default 'all' filter
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('sl-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      
      expect(allBtn?.getAttribute('variant')).toBe('primary');
    });

    it('should handle storage errors gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock setItem to throw error
      const setItemMock = vi.fn(() => {
        throw new Error('Storage quota exceeded');
      });
      
      Object.defineProperty(global.localStorage, 'setItem', {
        value: setItemMock,
        writable: true
      });

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Try to change filter (this should trigger save)
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('sl-button') || []);
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      unreadBtn.click();
      await element.updateComplete;

      // Should have logged warning but not crashed
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Restore localStorage
      Object.defineProperty(global.localStorage, 'setItem', {
        value: Storage.prototype.setItem,
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

      // Mock scroll container with event methods
      const mockScrollContainer = { 
        scrollTop: 250,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;

      // Trigger scroll position save
      (element as any).saveCurrentScrollPosition();

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

      // Mock scroll container with event methods
      const mockScrollContainer = { 
        scrollTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;

      // Trigger scroll position restore
      (element as any).restoreScrollPosition();

      expect(mockScrollContainer.scrollTop).toBe(300);
    });

    it('should enforce minimum scroll position of 0', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Mock scroll container with negative position and event methods
      const mockScrollContainer = { 
        scrollTop: -50,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;

      // Trigger scroll position save
      (element as any).saveCurrentScrollPosition();

      // Check that negative position was clamped to 0
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(0);
    });
  });

  describe('Component Lifecycle Integration', () => {
    it('should maintain state across component recreation', async () => {
      // Create first instance
      let element1 = createTestElement();
      document.body.appendChild(element1);
      await element1.updateComplete;

      // Change filter
      const buttons1 = Array.from(element1.shadowRoot?.querySelectorAll('sl-button') || []);
      const archivedBtn1 = buttons1.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;
      archivedBtn1.click();
      await element1.updateComplete;

      // Set scroll position with event methods
      (element1 as any).scrollContainer = { 
        scrollTop: 400,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element1 as any).saveCurrentScrollPosition();

      // Remove first instance
      element1.remove();

      // Create second instance
      let element2 = createTestElement();
      document.body.appendChild(element2);
      await element2.updateComplete;

      // Verify state was restored
      const buttons2 = Array.from(element2.shadowRoot?.querySelectorAll('sl-button') || []);
      const archivedBtn2 = buttons2.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;
      expect(archivedBtn2?.getAttribute('variant')).toBe('primary');

      // Verify scroll position in localStorage
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(400);

      element2.remove();
    });

    it('should save scroll position on disconnect', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Mock scroll container with event methods
      const mockScrollContainer = { 
        scrollTop: 150,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;

      // Disconnect component (should trigger save)
      element.remove();

      // Check that scroll position was saved
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(150);
    });
  });

  describe('Filter Functionality with Controller', () => {
    it('should filter bookmarks correctly based on controller state', async () => {
      // Set filter to unread through localStorage
      localStorage.setItem('bookmark-list-state', JSON.stringify({
        selectedFilter: 'unread',
        scrollPosition: 0
      }));

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Should only show unread, non-archived bookmarks (bookmark 1)
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      
      const displayedTitle = bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent;
      expect(displayedTitle).toBe('Test Bookmark 1');
    });

    it('should show archived bookmarks when archived filter is selected', async () => {
      // Set filter to archived
      localStorage.setItem('bookmark-list-state', JSON.stringify({
        selectedFilter: 'archived',
        scrollPosition: 0
      }));

      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Should only show archived bookmarks (bookmark 2)
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      
      const displayedTitle = bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent;
      expect(displayedTitle).toBe('Test Bookmark 2');
    });

    it('should update filter counts based on controller state', async () => {
      element = createTestElement();
      document.body.appendChild(element);
      await element.updateComplete;

      // Check filter button counts
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('sl-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      const archivedBtn = buttons.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;

      expect(allBtn?.textContent).toContain('All (1)'); // Only non-archived count
      expect(unreadBtn?.textContent).toContain('Unread (1)'); // Only unread, non-archived
      expect(archivedBtn?.textContent).toContain('Archived (1)'); // Only archived
    });
  });
});