import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BookmarkReader } from '../../components/bookmark-reader';
import type { LocalBookmark, ContentSourceOption } from '../../types';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/content-fetcher');
vi.mock('../../services/theme-service', () => ({
  ThemeService: {
    addThemeChangeListener: vi.fn(),
    removeThemeChangeListener: vi.fn(),
  }
}));

describe('BookmarkReader - Asset Selection', () => {
  let element: BookmarkReader;
  let mockBookmark: LocalBookmark;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock bookmark data
    mockBookmark = {
      id: 1,
      url: 'https://example.com/article',
      title: 'Test Article',
      description: 'Test description',
      notes: '',
      website_title: 'Example Site',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: [],
      date_added: '2024-01-01T00:00:00Z',
      date_modified: '2024-01-01T00:00:00Z',
    };

    // Mock common service responses
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue();
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue();
    
    vi.mocked(ContentFetcher.fetchBookmarkContent).mockImplementation(async (bookmark, source) => {
      if (source === 'url') {
        return {
          content: `<div class="live-url-content"><iframe src="${bookmark.url}"></iframe></div>`,
          readability_content: '', // No readability content for iframe
          source: 'url'
        };
      }
      return {
        content: '<div>Test content</div>',
        readability_content: '<div>Readable content</div>',
        source: 'asset'
      };
    });

    // Create element
    element = new BookmarkReader();
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  describe('Single Asset', () => {
    beforeEach(() => {
      const singleAssetSources: ContentSourceOption[] = [
        {
          type: 'asset',
          label: 'HTML snapshot from 08/05/2025',
          assetId: 1
        },
        {
          type: 'url',
          label: 'Live URL'
        }
      ];
      
      vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue(singleAssetSources);
    });

    it('should show simple Saved/Live selector for single asset', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      const select = element.shadowRoot?.querySelector('md-outlined-select');
      expect(select).toBeTruthy();

      const options = Array.from(select?.querySelectorAll('md-select-option') || []);
      expect(options).toHaveLength(2);
      
      // Should show "Saved" for single asset case
      expect(options[0]?.getAttribute('value')).toBe('saved');
      expect(options[0]?.textContent?.trim()).toBe('Saved');
      
      expect(options[1]?.getAttribute('value')).toBe('live');
      expect(options[1]?.textContent?.trim()).toBe('Live URL');
    });

    it('should default to saved content source when asset available', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Access private property for testing
      expect(element['contentSourceType']).toBe('saved');
    });

    it('should have correct select value for single asset case', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      
      // Wait for async operations and DOM updates
      await new Promise(resolve => setTimeout(resolve, 50));
      await element.updateComplete;

      // Verify that getCurrentSourceValue returns the correct value for single asset
      expect(element['getCurrentSourceValue']()).toBe('saved');
    });
  });

  describe('Multiple Assets', () => {
    beforeEach(() => {
      const multipleAssetSources: ContentSourceOption[] = [
        {
          type: 'asset',
          label: 'HTML snapshot from 08/05/2025',
          assetId: 1
        },
        {
          type: 'asset',
          label: 'PDF version',
          assetId: 2
        },
        {
          type: 'asset',
          label: 'Page screenshot',
          assetId: 3
        },
        {
          type: 'url',
          label: 'Live URL'
        }
      ];
      
      vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue(multipleAssetSources);
    });

    it('should show individual asset options when multiple assets exist', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      const select = element.shadowRoot?.querySelector('md-outlined-select');
      expect(select).toBeTruthy();

      const options = Array.from(select?.querySelectorAll('md-select-option') || []);
      expect(options).toHaveLength(4); // 3 assets + live URL

      // Should show specific asset names
      expect(options[0]?.getAttribute('value')).toBe('asset-1');
      expect(options[0]?.textContent?.trim()).toBe('HTML snapshot from 08/05/2025');
      
      expect(options[1]?.getAttribute('value')).toBe('asset-2');
      expect(options[1]?.textContent?.trim()).toBe('PDF version');
      
      expect(options[2]?.getAttribute('value')).toBe('asset-3');
      expect(options[2]?.textContent?.trim()).toBe('Page screenshot');
      
      expect(options[3]?.getAttribute('value')).toBe('live');
      expect(options[3]?.textContent?.trim()).toBe('Live URL');
    });

    it('should default to first asset when multiple assets available', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Access private property for testing
      expect(element['contentSourceType']).toBe('saved');
      expect(element['selectedContentSource']?.assetId).toBe(1);
    });

    it('should have correct select value for multiple assets case', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      
      // Wait for async operations and DOM updates
      await new Promise(resolve => setTimeout(resolve, 50));
      await element.updateComplete;

      // Verify that getCurrentSourceValue returns the correct value for multiple assets
      expect(element['getCurrentSourceValue']()).toBe('asset-1');
    });

    it('should load content from first asset by default', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify ContentFetcher was called with the first asset
      expect(ContentFetcher.fetchBookmarkContent).toHaveBeenCalledWith(
        mockBookmark,
        'asset',
        1 // First asset ID
      );
    });

    it('should switch to different asset when selection changes', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      const select = element.shadowRoot?.querySelector('md-outlined-select') as any;
      
      // Clear previous calls
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockClear();
      
      // Simulate changing selection to second asset
      const changeEvent = new Event('change');
      Object.defineProperty(changeEvent, 'target', {
        writable: false,
        value: { value: 'asset-2' }
      });

      select.dispatchEvent(changeEvent);
      
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify ContentFetcher was called with the second asset
      expect(ContentFetcher.fetchBookmarkContent).toHaveBeenCalledWith(
        mockBookmark,
        'asset',
        2 // Second asset ID
      );
    });

    it('should switch to live URL when selected', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      const select = element.shadowRoot?.querySelector('md-outlined-select') as any;
      
      // Clear previous calls
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockClear();
      
      // Simulate changing selection to live URL
      const changeEvent = new Event('change');
      Object.defineProperty(changeEvent, 'target', {
        writable: false,
        value: { value: 'live' }
      });

      select.dispatchEvent(changeEvent);
      
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify ContentFetcher was called with URL source
      expect(ContentFetcher.fetchBookmarkContent).toHaveBeenCalledWith(
        mockBookmark,
        'url',
        undefined
      );
    });
  });

  describe('No Assets', () => {
    beforeEach(() => {
      const noAssetSources: ContentSourceOption[] = [
        {
          type: 'url',
          label: 'Live URL'
        }
      ];
      
      vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue(noAssetSources);
    });

    it('should show only Live URL option when no assets exist', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      const select = element.shadowRoot?.querySelector('md-outlined-select');
      expect(select).toBeTruthy();

      const options = Array.from(select?.querySelectorAll('md-select-option') || []);
      expect(options).toHaveLength(1);
      
      expect(options[0]?.getAttribute('value')).toBe('live');
      expect(options[0]?.textContent?.trim()).toBe('Live URL');
    });

    it('should default to live URL when no assets available', async () => {
      element.bookmarkId = 1;
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));

      // Access private property for testing
      expect(element['contentSourceType']).toBe('live');
    });
  });
});