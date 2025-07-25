import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';
import { BookmarkList } from '../../components/bookmark-list';
import type { LocalBookmark } from '../../types';

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
    date_added: '2024-01-01T00:00:00Z',
    date_modified: '2024-01-01T00:00:00Z',
  },
];

describe('BookmarkList', () => {
  let element: BookmarkList;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (element) {
      element.remove();
    }
  });

  describe('Rendering', () => {
    it('should create a pure presentation component', () => {
      element = new BookmarkList();
      expect(element).toBeTruthy();
      expect(element.tagName.toLowerCase()).toBe('bookmark-list');
    });

    it('should show loading state when isLoading is true', async () => {
      element = new BookmarkList();
      element.isLoading = true;
      document.body.appendChild(element);
      
      await element.updateComplete;
      
      const loadingContainer = element.shadowRoot?.querySelector('.loading-container');
      expect(loadingContainer).toBeTruthy();
      
      const spinner = element.shadowRoot?.querySelector('md-circular-progress');
      expect(spinner).toBeTruthy();
    });

    it('should render bookmarks when provided', async () => {
      element = new BookmarkList();
      element.bookmarks = mockBookmarks;
      element.isLoading = false;
      element.bookmarksWithAssets = new Set();
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      
      document.body.appendChild(element);
      await element.updateComplete;
      
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards).toHaveLength(2);
      
      // Check that bookmark titles are rendered
      const titles = element.shadowRoot?.querySelectorAll('.bookmark-title');
      expect(titles).toHaveLength(2);
      expect(titles?.[0]?.textContent).toBe('Test Bookmark 1');
      expect(titles?.[1]?.textContent).toBe('Test Bookmark 2');
    });

    it('should not render sync progress in presentation component', async () => {
      element = new BookmarkList();
      element.bookmarks = mockBookmarks;
      element.isLoading = false;
      element.bookmarksWithAssets = new Set();
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Sync progress bar should not be in BookmarkList anymore
      const syncProgress = element.shadowRoot?.querySelector('.sync-progress');
      expect(syncProgress).toBeFalsy();
    });

    it('should show empty state when no bookmarks', async () => {
      element = new BookmarkList();
      element.bookmarks = [];
      element.isLoading = false;
      element.bookmarksWithAssets = new Set();
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      
      document.body.appendChild(element);
      await element.updateComplete;
      
      const emptyState = element.shadowRoot?.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      
      const syncButton = element.shadowRoot?.querySelector('.empty-state md-filled-button');
      expect(syncButton).toBeTruthy();
    });
  });

  describe('Callback Handling', () => {
    it('should call onBookmarkSelect when bookmark is clicked', async () => {
      const onBookmarkSelect = vi.fn();
      
      element = new BookmarkList();
      element.bookmarks = mockBookmarks;
      element.isLoading = false;
      element.bookmarksWithAssets = new Set();
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.onBookmarkSelect = onBookmarkSelect;
      
      document.body.appendChild(element);
      await element.updateComplete;
      
      const firstBookmark = element.shadowRoot?.querySelector('.bookmark-card');
      (firstBookmark as HTMLElement)?.click();
      
      expect(onBookmarkSelect).toHaveBeenCalledWith(1);
    });

    it('should call onSyncRequested when sync button is clicked', async () => {
      const onSyncRequested = vi.fn();
      
      element = new BookmarkList();
      element.bookmarks = [];
      element.isLoading = false;
      element.bookmarksWithAssets = new Set();
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      element.onSyncRequested = onSyncRequested;
      
      document.body.appendChild(element);
      await element.updateComplete;
      
      const syncButton = element.shadowRoot?.querySelector('.empty-state md-filled-button');
      (syncButton as HTMLElement)?.click();
      
      expect(onSyncRequested).toHaveBeenCalled();
    });
  });

  describe('Bookmark Display', () => {
    it('should display bookmark metadata correctly', async () => {
      element = new BookmarkList();
      element.bookmarks = mockBookmarks;
      element.isLoading = false;
      element.bookmarksWithAssets = new Set();
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Check descriptions are rendered
      const descriptions = element.shadowRoot?.querySelectorAll('.bookmark-description');
      expect(descriptions).toHaveLength(2);
      expect(descriptions?.[0]?.textContent).toBe('Description 1');
      
      // Check URLs are rendered
      const urls = element.shadowRoot?.querySelectorAll('.bookmark-url');
      expect(urls).toHaveLength(2);
      expect(urls?.[0]?.textContent?.trim()).toBe('https://example.com/1');
      
      // Check tags are rendered
      const tags = element.shadowRoot?.querySelectorAll('.bookmark-tags');
      expect(tags).toHaveLength(2);
      
      const firstBookmarkTags = tags?.[0]?.querySelectorAll('md-badge');
      expect(firstBookmarkTags).toHaveLength(1);
      expect(firstBookmarkTags?.[0]?.textContent).toBe('test');
    });

    it('should show read/unread status correctly', async () => {
      element = new BookmarkList();
      element.bookmarks = mockBookmarks;
      element.isLoading = false;
      element.bookmarksWithAssets = new Set();
      element.faviconCache = new Map();
      element.syncedBookmarkIds = new Set();
      
      document.body.appendChild(element);
      await element.updateComplete;
      
      // First bookmark is unread
      const unreadIcon = element.shadowRoot?.querySelector('.bookmark-card:first-child .unread-icon');
      expect(unreadIcon).toBeTruthy();
      expect(unreadIcon?.textContent).toBe('email');
      
      // Second bookmark is read
      const readIcon = element.shadowRoot?.querySelector('.bookmark-card:last-child .read-icon');
      expect(readIcon).toBeTruthy();
      expect(readIcon?.textContent).toBe('drafts');
    });
  });
});