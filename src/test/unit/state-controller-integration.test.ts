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

      // Should fall back to default scroll position of 0
      expect((element as any).scrollPosition).toBe(0);
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

      // Mock scroll container and trigger scroll position save
      const mockScrollContainer = { 
        scrollTop: 100,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element as any).scrollContainer = mockScrollContainer;
      
      // Try to save scroll position (this should trigger storage error)
      (element as any).saveCurrentScrollPosition();
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
    it('should maintain scroll position across component recreation', async () => {
      // Create first instance with archived filter
      let element1 = createTestElement('archived');
      document.body.appendChild(element1);
      await element1.updateComplete;

      // Verify it shows archived filter (from props)
      const buttons1 = Array.from(element1.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const archivedBtn1 = buttons1.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;
      expect(archivedBtn1?.tagName.toLowerCase()).toBe('md-filled-button');

      // Set scroll position
      (element1 as any).scrollContainer = { 
        scrollTop: 400,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      (element1 as any).saveCurrentScrollPosition();

      // Remove first instance
      element1.remove();

      // Create second instance with same filter (simulating container maintaining filter state)
      let element2 = createTestElement('archived');
      document.body.appendChild(element2);
      await element2.updateComplete;

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

  describe('Filter Functionality with Props', () => {
    it('should filter bookmarks correctly based on paginationState prop', async () => {
      element = createTestElement('unread');
      document.body.appendChild(element);
      await element.updateComplete;

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

      // Should only show archived bookmarks (bookmark 2)
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBe(1);
      
      const displayedTitle = bookmarkCards?.[0]?.querySelector('.bookmark-title')?.textContent;
      expect(displayedTitle).toBe('Test Bookmark 2');
    });

    it('should update filter counts based on paginationState prop', async () => {
      element = createTestElement('all');
      document.body.appendChild(element);
      await element.updateComplete;

      // Check filter button counts - only the active filter shows the count
      const buttons = Array.from(element.shadowRoot?.querySelectorAll('md-filled-button, md-text-button') || []);
      const allBtn = buttons.find(btn => btn.textContent?.includes('All')) as HTMLElement;
      const unreadBtn = buttons.find(btn => btn.textContent?.includes('Unread')) as HTMLElement;
      const archivedBtn = buttons.find(btn => btn.textContent?.includes('Archived')) as HTMLElement;

      expect(allBtn?.textContent).toContain('All (1)'); // Active filter shows count
      expect(unreadBtn?.textContent).toContain('Unread (0)'); // Inactive filters show 0
      expect(archivedBtn?.textContent).toContain('Archived (0)'); // Inactive filters show 0
    });
  });
});
