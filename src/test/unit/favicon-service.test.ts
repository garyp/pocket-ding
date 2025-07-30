import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FaviconService } from '../../services/favicon-service';
import { DatabaseService } from '../../services/database';
import { appFetch } from '../../utils/fetch-helper';
import type { LocalAsset } from '../../types';

// Mock the DatabaseService
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getAssetsByBookmarkId: vi.fn(),
    saveAsset: vi.fn(),
    deleteAssetsByBookmarkId: vi.fn(),
    getSettings: vi.fn()
  }
}));

// Mock the fetch helper
vi.mock('../../utils/fetch-helper', () => ({
  appFetch: vi.fn(),
  configureFetchHelper: vi.fn()
}));

describe('FaviconService', () => {
  beforeEach(() => {
    // Use fake timers for deterministic testing
    vi.useFakeTimers();
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Always restore real timers
    vi.useRealTimers();
  });

  describe('getFaviconForBookmark', () => {
    it('should return cached favicon if available', async () => {
      const bookmarkId = 1;
      const mockArrayBuffer = new ArrayBuffer(16);
      const mockAsset: LocalAsset = {
        id: 1,
        bookmark_id: bookmarkId,
        asset_type: 'favicon',
        content_type: 'image/png',
        display_name: 'favicon',
        file_size: 16,
        status: 'complete',
        date_created: '2024-01-01T00:00:00Z',
        content: mockArrayBuffer,
        cached_at: '2024-01-01T00:00:00Z'
      };

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([mockAsset]);

      const result = await FaviconService.getFaviconForBookmark(bookmarkId);
      
      expect(result).toMatch(/^data:image\/png;base64,/);
      expect(DatabaseService.getAssetsByBookmarkId).toHaveBeenCalledWith(bookmarkId);
    });

    it('should return default favicon when no favicon URL provided', async () => {
      const bookmarkId = 1;

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);

      const result = await FaviconService.getFaviconForBookmark(bookmarkId);
      
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should fetch and cache favicon when not cached for Linkding-served URL', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://linkding.example.com/static/favicon.ico';
      const mockArrayBuffer = new ArrayBuffer(16);
      const mockUint8Array = new Uint8Array(16);
      mockUint8Array.fill(255); // Fill with data for base64 encoding

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      // Mock settings to make it appear as Linkding-served
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'test-token',
        sync_interval: 5,
        auto_sync: true,
        reading_mode: 'original'
      });

      // Mock successful fetch
      vi.mocked(appFetch).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
        headers: new Headers({
          'content-type': 'image/x-icon'
        })
      } as Response);

      const result = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      expect(result).toMatch(/^data:image\/x-icon;base64,/);
      expect(appFetch).toHaveBeenCalledWith(faviconUrl, expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'User-Agent': 'Pocket-Ding/1.0 (+favicon-fetcher)',
          'Accept': 'image/*,*/*;q=0.8'
        })
      }));
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: bookmarkId,
          asset_type: 'favicon',
          content_type: 'image/x-icon',
          status: 'complete',
          content: mockArrayBuffer
        })
      );
    });

    it('should generate fallback favicon for external URLs', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://external-website.com/favicon.ico';

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      // Mock settings to make it appear as external (not Linkding-served)
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'test-token',
        sync_interval: 5,
        auto_sync: true,
        reading_mode: 'original'
      });

      const result = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      // External favicons should return generated SVG fallback
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      // Should not attempt to fetch external favicons
      expect(appFetch).not.toHaveBeenCalled();
      // Should not save failure to database for external favicons (they use fallback)
      expect(DatabaseService.saveAsset).not.toHaveBeenCalled();
    });

    it('should return default favicon and cache failure when Linkding-served fetch fails', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://linkding.example.com/static/favicon.ico';

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      // Mock settings to make it appear as Linkding-served
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'test-token',
        sync_interval: 5,
        auto_sync: true,
        reading_mode: 'original'
      });

      // Mock failed fetch
      vi.mocked(appFetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      const result = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: bookmarkId,
          asset_type: 'favicon',
          status: 'failure'
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://external-website.com/favicon.ico';

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockRejectedValue(new Error('Database error'));

      const result = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should return mock favicon for example.com URLs in demo mode', async () => {
      const bookmarkId = 5;
      const faviconUrl = 'https://example.com/favicon.ico';

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);

      const result = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      // Should return mock favicon (SVG with colored circle)
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      // Should not attempt to fetch or save to database for mock favicons
      expect(appFetch).not.toHaveBeenCalled();
      expect(DatabaseService.saveAsset).not.toHaveBeenCalled();
    });
  });

  describe('preloadFavicon', () => {
    it('should skip preload if no favicon URL provided', async () => {
      const bookmarkId = 1;

      await FaviconService.preloadFavicon(bookmarkId);

      expect(DatabaseService.getAssetsByBookmarkId).not.toHaveBeenCalled();
      expect(appFetch).not.toHaveBeenCalled();
    });

    it('should skip preload if favicon already cached successfully', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://example.com/favicon.ico';
      const mockAsset: LocalAsset = {
        id: 1,
        bookmark_id: bookmarkId,
        asset_type: 'favicon',
        content_type: 'image/png',
        display_name: 'favicon',
        file_size: 16,
        status: 'complete',
        date_created: '2024-01-01T00:00:00Z',
        cached_at: '2024-01-01T00:00:00Z'
      };

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([mockAsset]);

      await FaviconService.preloadFavicon(bookmarkId, faviconUrl);

      expect(appFetch).not.toHaveBeenCalled();
    });

    it('should skip preload if recent failure (within 24 hours)', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://example.com/favicon.ico';
      const recentFailure: LocalAsset = {
        id: 1,
        bookmark_id: bookmarkId,
        asset_type: 'favicon',
        content_type: 'text/plain',
        display_name: 'favicon',
        file_size: 0,
        status: 'failure',
        date_created: '2024-01-01T00:00:00Z',
        cached_at: new Date().toISOString() // Recent failure
      };

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([recentFailure]);

      await FaviconService.preloadFavicon(bookmarkId, faviconUrl);

      expect(appFetch).not.toHaveBeenCalled();
    });

    it('should retry preload after 24 hours from failure for Linkding-served URLs', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://linkding.example.com/static/favicon.ico';
      const oldFailure: LocalAsset = {
        id: 1,
        bookmark_id: bookmarkId,
        asset_type: 'favicon',
        content_type: 'text/plain',
        display_name: 'favicon',
        file_size: 0,
        status: 'failure',
        date_created: '2024-01-01T00:00:00Z',
        cached_at: '2024-01-01T00:00:00Z' // Old failure
      };

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([oldFailure]);
      // Mock settings to make it appear as Linkding-served
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'test-token',
        sync_interval: 5,
        auto_sync: true,
        reading_mode: 'original'
      });

      // Mock successful fetch
      vi.mocked(appFetch).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
        headers: new Headers({
          'content-type': 'image/x-icon'
        })
      } as Response);

      // Don't await - this should run in background
      FaviconService.preloadFavicon(bookmarkId, faviconUrl);

      // Give it a moment to start the async operation
      await vi.runAllTicks();

      expect(appFetch).toHaveBeenCalledWith(faviconUrl, expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'User-Agent': 'Pocket-Ding/1.0 (+favicon-fetcher)',
          'Accept': 'image/*,*/*;q=0.8'
        })
      }));
    });
  });

  describe('clearFaviconCache', () => {
    it('should delete favicon assets for bookmark', async () => {
      const bookmarkId = 1;
      const faviconAsset: LocalAsset = {
        id: 1,
        bookmark_id: bookmarkId,
        asset_type: 'favicon',
        content_type: 'image/png',
        display_name: 'favicon',
        file_size: 16,
        status: 'complete',
        date_created: '2024-01-01T00:00:00Z',
        cached_at: '2024-01-01T00:00:00Z'
      };

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([faviconAsset]);

      await FaviconService.clearFaviconCache(bookmarkId);

      expect(DatabaseService.deleteAssetsByBookmarkId).toHaveBeenCalledWith(bookmarkId);
    });

    it('should handle empty asset list', async () => {
      const bookmarkId = 1;

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);

      await FaviconService.clearFaviconCache(bookmarkId);

      expect(DatabaseService.deleteAssetsByBookmarkId).not.toHaveBeenCalled();
    });
  });

  describe('arrayBufferToDataUrl', () => {
    it('should convert ArrayBuffer to data URL for Linkding-served favicon', async () => {
      const bookmarkId = 1;
      const faviconUrl = 'https://linkding.example.com/static/favicon.ico';
      
      // Create a known ArrayBuffer
      const buffer = new ArrayBuffer(4);
      const view = new Uint8Array(buffer);
      view[0] = 0x89; // PNG signature start
      view[1] = 0x50;
      view[2] = 0x4E;
      view[3] = 0x47;

      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      // Mock settings to make it appear as Linkding-served
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'test-token',
        sync_interval: 5,
        auto_sync: true,
        reading_mode: 'original'
      });

      vi.mocked(appFetch).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(buffer),
        headers: new Headers({
          'content-type': 'image/png'
        })
      } as Response);

      const result = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      expect(result).toBe('data:image/png;base64,iVBORw==');
    });
  });
});