import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FaviconService } from '../../services/favicon-service';
import { DatabaseService } from '../../services/database';
import type { LocalBookmark, LocalAsset } from '../../types';

// Mock fetch for favicon requests (CI trigger)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock DatabaseService
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getAssetsByBookmarkId: vi.fn(),
    saveAsset: vi.fn(),
    saveBookmark: vi.fn(),
    deleteAssetsByBookmarkId: vi.fn(),
  },
}));

describe('Favicon Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.saveAsset).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.deleteAssetsByBookmarkId).mockResolvedValue(undefined);
  });

  describe('Favicon caching during sync', () => {
    it('should cache favicons during bookmark sync', async () => {

      // Create a test bookmark with favicon URL
      const testBookmark: LocalBookmark = {
        id: 1,
        url: 'https://example.com',
        title: 'Test Bookmark',
        description: 'Test description',
        notes: '',
        website_title: 'Example Site',
        website_description: 'Example description',
        web_archive_snapshot_url: '',
        favicon_url: 'https://example.com/favicon.ico',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: ['test'],
        date_added: '2024-01-01T00:00:00Z',
        date_modified: '2024-01-01T00:00:00Z',
        is_synced: true
      };

      // Mock saving the bookmark (simulating sync process)
      vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);

      // Mock successful favicon fetch
      const mockFaviconBuffer = new ArrayBuffer(16);
      const mockUint8Array = new Uint8Array(mockFaviconBuffer);
      mockUint8Array.fill(255);

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockFaviconBuffer),
        headers: {
          get: (name: string) => name === 'content-type' ? 'image/x-icon' : null
        }
      });

      // Preload favicon (simulating what happens during sync)
      await FaviconService.preloadFavicon(testBookmark.id, testBookmark.favicon_url);

      // Wait a moment for the background operation to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify favicon was cached
      const faviconUrl = await FaviconService.getFaviconForBookmark(testBookmark.id, testBookmark.favicon_url);
      expect(faviconUrl).toMatch(/^data:image\/x-icon;base64,/);

      // Verify favicon asset was saved to database
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: testBookmark.id,
          asset_type: 'favicon',
          status: 'complete',
          content_type: 'image/x-icon'
        })
      );
    });

    it('should handle favicon fetch failures gracefully', async () => {
      const testBookmark: LocalBookmark = {
        id: 2,
        url: 'https://example.com',
        title: 'Test Bookmark',
        description: 'Test description',
        notes: '',
        website_title: 'Example Site',
        website_description: 'Example description',
        web_archive_snapshot_url: '',
        favicon_url: 'https://example.com/nonexistent-favicon.ico',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: ['test'],
        date_added: '2024-01-01T00:00:00Z',
        date_modified: '2024-01-01T00:00:00Z',
        is_synced: true
      };

      // Mock failed favicon fetch
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      // Preload favicon (simulating what happens during sync)
      await FaviconService.preloadFavicon(testBookmark.id, testBookmark.favicon_url);

      // Wait a moment for the background operation to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should return default favicon
      const faviconUrl = await FaviconService.getFaviconForBookmark(testBookmark.id, testBookmark.favicon_url);
      expect(faviconUrl).toMatch(/^data:image\/svg\+xml;base64,/);

      // Verify failure was recorded in database
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: testBookmark.id,
          asset_type: 'favicon',
          status: 'failure'
        })
      );
    });

    it('should not fetch favicon multiple times for same bookmark', async () => {
      const testBookmark: LocalBookmark = {
        id: 3,
        url: 'https://example.com',
        title: 'Test Bookmark',
        description: 'Test description',
        notes: '',
        website_title: 'Example Site',
        website_description: 'Example description',
        web_archive_snapshot_url: '',
        favicon_url: 'https://example.com/favicon.ico',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: ['test'],
        date_added: '2024-01-01T00:00:00Z',
        date_modified: '2024-01-01T00:00:00Z',
        is_synced: true
      };

      // Mock successful favicon fetch
      const mockFaviconBuffer = new ArrayBuffer(16);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockFaviconBuffer),
        headers: {
          get: () => 'image/x-icon'
        }
      });

      // First preload - mock that favicon gets cached successfully
      await FaviconService.preloadFavicon(testBookmark.id, testBookmark.favicon_url);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mock that favicon is now cached
      const cachedFaviconAsset: LocalAsset = {
        id: 1,
        bookmark_id: testBookmark.id,
        asset_type: 'favicon',
        content_type: 'image/x-icon',
        display_name: 'favicon',
        file_size: 16,
        status: 'complete',
        date_created: '2024-01-01T00:00:00Z',
        cached_at: '2024-01-01T00:00:00Z',
        content: new ArrayBuffer(16)
      };
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([cachedFaviconAsset]);

      // Second preload should not trigger fetch
      await FaviconService.preloadFavicon(testBookmark.id, testBookmark.favicon_url);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Favicon display in bookmark list', () => {
    it('should provide favicon URLs for display', async () => {
      const testBookmarks: LocalBookmark[] = [
        {
          id: 1,
          url: 'https://example1.com',
          title: 'Test Bookmark 1',
          description: '',
          notes: '',
          website_title: '',
          website_description: '',
          web_archive_snapshot_url: '',
          favicon_url: 'https://example1.com/favicon.ico',
          preview_image_url: '',
          is_archived: false,
          unread: true,
          shared: false,
          tag_names: [],
          date_added: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
          is_synced: true
        },
        {
          id: 2,
          url: 'https://example2.com',
          title: 'Test Bookmark 2',
          description: '',
          notes: '',
          website_title: '',
          website_description: '',
          web_archive_snapshot_url: '',
          favicon_url: '', // No favicon URL
          preview_image_url: '',
          is_archived: false,
          unread: false,
          shared: false,
          tag_names: [],
          date_added: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
          is_synced: true
        }
      ];

      // Mock test bookmarks are already saved (simulating sync process)

      // Mock favicon fetch for first bookmark
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
        headers: {
          get: () => 'image/x-icon'
        }
      });

      // Get favicon URLs for display
      const favicon1 = await FaviconService.getFaviconForBookmark(1, testBookmarks[0]?.favicon_url || '');
      const favicon2 = await FaviconService.getFaviconForBookmark(2, testBookmarks[1]?.favicon_url || '');

      // First bookmark should have cached favicon
      expect(favicon1).toMatch(/^data:image\/x-icon;base64,/);
      
      // Second bookmark should have default favicon
      expect(favicon2).toMatch(/^data:image\/svg\+xml;base64,/);
    });
  });

  describe('Favicon cache management', () => {
    it('should clear favicon cache for specific bookmark', async () => {
      const testBookmark: LocalBookmark = {
        id: 1,
        url: 'https://example.com',
        title: 'Test Bookmark',
        description: '',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: 'https://example.com/favicon.ico',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: [],
        date_added: '2024-01-01T00:00:00Z',
        date_modified: '2024-01-01T00:00:00Z',
        is_synced: true
      };

      // Cache a favicon
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
        headers: {
          get: () => 'image/x-icon'
        }
      });

      await FaviconService.getFaviconForBookmark(testBookmark.id, testBookmark.favicon_url);

      // Verify favicon was cached
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: testBookmark.id,
          asset_type: 'favicon'
        })
      );

      // Mock that favicon assets exist
      const faviconAsset: LocalAsset = {
        id: 1,
        bookmark_id: testBookmark.id,
        asset_type: 'favicon',
        content_type: 'image/x-icon',
        display_name: 'favicon',
        file_size: 16,
        status: 'complete',
        date_created: '2024-01-01T00:00:00Z',
        cached_at: '2024-01-01T00:00:00Z'
      };
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([faviconAsset]);

      // Clear favicon cache
      await FaviconService.clearFaviconCache(testBookmark.id);

      // Verify favicon was removed
      expect(DatabaseService.deleteAssetsByBookmarkId).toHaveBeenCalledWith(testBookmark.id);
    });
  });
});