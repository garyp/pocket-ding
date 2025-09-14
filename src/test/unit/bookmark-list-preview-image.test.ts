import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';
import { BookmarkList } from '../../components/bookmark-list';
import type { LocalBookmark } from '../../types';

// Mock Database Service to provide test data
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getBookmarksWithAssetCounts: vi.fn(),
  },
}));

import { DatabaseService } from '../../services/database';

// Store original navigator.onLine value
const originalOnLine = navigator.onLine;

const mockBookmarkWithPreview: LocalBookmark = {
  id: 1,
  url: 'https://example.com/article',
  title: 'Article with Preview',
  description: 'This article has a preview image',
  notes: '',
  website_title: 'Example Site',
  website_description: 'Example Description',
  web_archive_snapshot_url: '',
  favicon_url: 'https://example.com/favicon.ico',
  preview_image_url: 'https://example.com/preview.jpg',
  is_archived: false,
  unread: true,
  shared: false,
  tag_names: ['test', 'preview'],
  date_added: '2024-01-01T00:00:00Z',
  date_modified: '2024-01-01T00:00:00Z',
};

const mockBookmarkWithoutPreview: LocalBookmark = {
  id: 2,
  url: 'https://example.com/no-preview',
  title: 'Article without Preview',
  description: 'This article has no preview image',
  notes: '',
  website_title: 'Example Site 2',
  website_description: 'Example Description 2',
  web_archive_snapshot_url: '',
  favicon_url: 'https://example.com/favicon2.ico',
  preview_image_url: '',
  is_archived: false,
  unread: false,
  shared: false,
  tag_names: ['test', 'no-preview'],
  date_added: '2024-01-02T00:00:00Z',
  date_modified: '2024-01-02T00:00:00Z',
};

const mockBookmarkWithEmptyPreview: LocalBookmark = {
  id: 3,
  url: 'https://example.com/empty-preview',
  title: 'Article with Empty Preview',
  description: 'This article has an empty preview image URL',
  notes: '',
  website_title: 'Example Site 3',
  website_description: 'Example Description 3',
  web_archive_snapshot_url: '',
  favicon_url: 'https://example.com/favicon3.ico',
  preview_image_url: '   ',
  is_archived: false,
  unread: true,
  shared: false,
  tag_names: ['test', 'empty-preview'],
  date_added: '2024-01-03T00:00:00Z',
  date_modified: '2024-01-03T00:00:00Z',
};

describe('BookmarkList - Preview Images', () => {
  let element: BookmarkList;

  // Helper function to set up element with bookmarks
  const setupElementWithBookmarks = (bookmarkData: LocalBookmark[]) => {
    element = new BookmarkList();
    element.bookmarks = bookmarkData;
    element.isLoading = false;
    element.faviconCache = new Map();
    element.syncedBookmarkIds = new Set();
    // Pagination state removed - handled by container
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock data
    vi.mocked(DatabaseService.getBookmarksWithAssetCounts).mockResolvedValue(new Map());
  });

  afterEach(() => {
    // Restore original navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: originalOnLine
    });
    
    if (element) {
      element.remove();
    }
  });

  describe('Online State Detection', () => {
    it('should initialize with navigator.onLine value', () => {
      // Set navigator.onLine to false
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false
      });

      element = new BookmarkList();
      expect((element as any).isOnline).toBe(false);

      // Set navigator.onLine to true
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: true
      });

      element.remove();
      element = new BookmarkList();
      expect((element as any).isOnline).toBe(true);
    });

    it('should setup online/offline event listeners on connect', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      element = new BookmarkList();
      document.body.appendChild(element);
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
      
      addEventListenerSpy.mockRestore();
    });

    it('should remove online/offline event listeners on disconnect', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      element = new BookmarkList();
      document.body.appendChild(element);
      element.remove();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
      
      removeEventListenerSpy.mockRestore();
    });

    it('should update isOnline when online event fires', () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false
      });

      element = new BookmarkList();
      document.body.appendChild(element);
      
      expect((element as any).isOnline).toBe(false);
      
      // Simulate going online
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
      
      expect((element as any).isOnline).toBe(true);
    });

    it('should update isOnline when offline event fires', () => {
      // Start online
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: true
      });

      element = new BookmarkList();
      document.body.appendChild(element);
      
      expect((element as any).isOnline).toBe(true);
      
      // Simulate going offline
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
      
      expect((element as any).isOnline).toBe(false);
    });
  });

  describe('Preview Image Display - Online', () => {
    beforeEach(() => {
      // Set navigator.onLine to true for online tests
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: true
      });
    });

    it('should display preview image when online and preview_image_url is available', async () => {
      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const previewImage = element.shadowRoot?.querySelector('.bookmark-preview') as HTMLImageElement;
      expect(previewImage).toBeTruthy();
      expect(previewImage.src).toBe('https://example.com/preview.jpg');
      expect(previewImage.alt).toBe('Preview of Article with Preview');
      expect(previewImage.loading).toBe('lazy');
      expect(previewImage.referrerPolicy).toBe('no-referrer');
    });

    it('should add bookmark-with-preview class when preview image is shown', async () => {
      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent).toBeTruthy();
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(true);
    });

    it('should wrap content in bookmark-text-content div when preview is shown', async () => {
      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const textContent = element.shadowRoot?.querySelector('.bookmark-text-content');
      expect(textContent).toBeTruthy();

      const title = textContent?.querySelector('.bookmark-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Article with Preview');
    });

    it('should not display preview image when preview_image_url is empty', async () => {
      setupElementWithBookmarks([mockBookmarkWithoutPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const previewImage = element.shadowRoot?.querySelector('.bookmark-preview');
      expect(previewImage).toBeFalsy();

      const bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(false);
    });

    it('should not display preview image when preview_image_url is whitespace only', async () => {
      setupElementWithBookmarks([mockBookmarkWithEmptyPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const previewImage = element.shadowRoot?.querySelector('.bookmark-preview');
      expect(previewImage).toBeFalsy();

      const bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(false);
    });

    it('should display both preview image and regular content layout together', async () => {
      setupElementWithBookmarks([mockBookmarkWithPreview, mockBookmarkWithoutPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      // First bookmark should have preview
      const firstBookmarkContent = element.shadowRoot?.querySelector('.bookmark-card:first-child .bookmark-content');
      expect(firstBookmarkContent?.classList.contains('bookmark-with-preview')).toBe(true);

      const firstPreviewImage = element.shadowRoot?.querySelector('.bookmark-card:first-child .bookmark-preview');
      expect(firstPreviewImage).toBeTruthy();

      // Second bookmark should not have preview
      const secondBookmarkContent = element.shadowRoot?.querySelector('.bookmark-card:last-child .bookmark-content');
      expect(secondBookmarkContent?.classList.contains('bookmark-with-preview')).toBe(false);

      const secondPreviewImage = element.shadowRoot?.querySelector('.bookmark-card:last-child .bookmark-preview');
      expect(secondPreviewImage).toBeFalsy();
    });
  });

  describe('Preview Image Display - Offline', () => {
    beforeEach(() => {
      // Set navigator.onLine to false for offline tests
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false
      });
    });

    it('should not display preview image when offline even with valid preview_image_url', async () => {
      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const previewImage = element.shadowRoot?.querySelector('.bookmark-preview');
      expect(previewImage).toBeFalsy();

      const bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(false);
    });

    it('should not add bookmark-with-preview class when offline', async () => {
      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(false);
    });

    it('should render normal layout when offline', async () => {
      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      // Should render title directly in content, not wrapped in bookmark-text-content
      const title = element.shadowRoot?.querySelector('.bookmark-content .bookmark-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Article with Preview');

      // Should not have the wrapper div
      const textContent = element.shadowRoot?.querySelector('.bookmark-text-content');
      expect(textContent).toBeFalsy();
    });
  });

  describe('Online/Offline State Changes', () => {
    it('should show preview images when going from offline to online', async () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false
      });

      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      // Should not show preview when offline
      let previewImage = element.shadowRoot?.querySelector('.bookmark-preview');
      expect(previewImage).toBeFalsy();

      // Go online
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
      await element.updateComplete;

      // Should now show preview when online
      previewImage = element.shadowRoot?.querySelector('.bookmark-preview');
      expect(previewImage).toBeTruthy();
      expect((previewImage as HTMLImageElement).src).toBe('https://example.com/preview.jpg');
    });

    it('should hide preview images when going from online to offline', async () => {
      // Start online
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: true
      });

      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      // Should show preview when online
      let previewImage = element.shadowRoot?.querySelector('.bookmark-preview');
      expect(previewImage).toBeTruthy();

      // Go offline
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
      await element.updateComplete;

      // Should hide preview when offline
      previewImage = element.shadowRoot?.querySelector('.bookmark-preview');
      expect(previewImage).toBeFalsy();
    });

    it('should update layout classes when going online/offline', async () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false
      });

      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      // Should not have preview class when offline
      let bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(false);

      // Go online
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
      await element.updateComplete;

      // Should have preview class when online
      bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(true);

      // Go offline again
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
      await element.updateComplete;

      // Should remove preview class when offline again
      bookmarkContent = element.shadowRoot?.querySelector('.bookmark-content');
      expect(bookmarkContent?.classList.contains('bookmark-with-preview')).toBe(false);
    });
  });

  describe('No Caching Verification', () => {
    it('should not cache preview images (verify loading="lazy" and no cache attributes)', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: true
      });

      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      const previewImage = element.shadowRoot?.querySelector('.bookmark-preview') as HTMLImageElement;
      expect(previewImage).toBeTruthy();

      // Verify lazy loading is enabled (helps with performance and indicates no eager caching)
      expect(previewImage.loading).toBe('lazy');

      // Verify no-referrer policy (security best practice)
      expect(previewImage.referrerPolicy).toBe('no-referrer');

      // Verify image loads directly from URL (no data: URL indicating caching)
      expect(previewImage.src).toBe('https://example.com/preview.jpg');
      expect(previewImage.src.startsWith('data:')).toBe(false);
    });

    it('should load new image URLs when bookmark preview_image_url changes', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: true
      });

      // First test: verify initial image loads correctly
      setupElementWithBookmarks([mockBookmarkWithPreview]);

      document.body.appendChild(element);
      await element.updateComplete;

      let previewImage = element.shadowRoot?.querySelector('.bookmark-preview') as HTMLImageElement;
      expect(previewImage.src).toBe('https://example.com/preview.jpg');

      // Clean up first element
      element.remove();

      // Second test: verify component with different data shows different image
      const updatedBookmark = {
        ...mockBookmarkWithPreview,
        preview_image_url: 'https://example.com/new-preview.jpg'
      };

      setupElementWithBookmarks([updatedBookmark]);

      document.body.appendChild(element);
      await element.updateComplete;

      const newPreviewImage = element.shadowRoot?.querySelector('.bookmark-preview') as HTMLImageElement;
      expect(newPreviewImage.src).toBe('https://example.com/new-preview.jpg');
    });
  });
});