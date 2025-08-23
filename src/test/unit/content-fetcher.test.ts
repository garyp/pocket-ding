import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentFetcher } from '../../services/content-fetcher';
import { DatabaseService } from '../../services/database';
import { createLinkdingAPI } from '../../services/linkding-api';
import type { LocalBookmark } from '../../types';

// Mock @mozilla/readability
vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation(() => ({
    parse: vi.fn().mockReturnValue({
      content: '<p>Processed content</p>',
      title: 'Test Article',
    }),
  })),
}));

// Mock DatabaseService
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getCompletedAssetsByBookmarkId: vi.fn().mockResolvedValue([]),
    getAssetsByBookmarkId: vi.fn().mockResolvedValue([]),
    getAsset: vi.fn().mockResolvedValue(null),
    getSettings: vi.fn().mockResolvedValue(null),
    saveAsset: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock createLinkdingAPI
vi.mock('../../services/linkding-api', () => ({
  createLinkdingAPI: vi.fn().mockImplementation(() => ({
    downloadAsset: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  })),
}));

describe('ContentFetcher', () => {
  const mockBookmark: LocalBookmark = {
    id: 1,
    url: 'https://example.com/article',
    title: 'Test Article',
    description: '',
    notes: '',
    website_title: 'Example',
    website_description: 'Example site',
    web_archive_snapshot_url: '',
    favicon_url: '',
    preview_image_url: '',
    is_archived: false,
    unread: true,
    shared: false,
    tag_names: ['test'],
    date_added: '2024-01-01T10:00:00Z',
    date_modified: '2024-01-01T10:00:00Z',
  };

  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.error to prevent cluttering test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should return fallback content when no assets available', async () => {
    const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

    expect(result.content).toContain('Test Article');
    expect(result.content).toContain('Open in New Tab');
    expect(result.readability_content).toContain('Test Article');
    expect(result.source).toBe('asset');
  });

  it('should handle bookmarks without description gracefully', async () => {
    // Use a bookmark with empty description to ensure fallback message appears
    const bookmarkWithoutDescription = { ...mockBookmark, description: '' };
    const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithoutDescription);

    expect(result.content).toContain('No cached content available');
    expect(result.content).toContain(bookmarkWithoutDescription.title);
    expect(result.content).toContain('Open in New Tab');
    expect(result.readability_content).toContain('No cached content available');
    expect(result.source).toBe('asset');
  });

  it('should show web archive link when available', async () => {
    const bookmarkWithArchive = {
      ...mockBookmark,
      web_archive_snapshot_url: 'https://web.archive.org/web/20240101/https://example.com',
    };

    const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithArchive);

    expect(result.content).toContain('Open Web Archive Version');
    expect(result.content).toContain('web.archive.org');
    expect(result.source).toBe('asset');
  });

  describe('Asset Content Handling', () => {
    const mockHtmlAsset = {
      id: 1,
      bookmark_id: 1,
      asset_type: 'snapshot',
      content_type: 'text/html',
      display_name: 'Page Snapshot',
      file_size: 12345,
      status: 'complete' as const,
      date_created: '2024-01-01T10:00:00Z',
      content: new TextEncoder().encode('<html><body><h1>Asset Content</h1></body></html>').buffer,
      cached_at: '2024-01-01T10:30:00Z',
    };

    const mockPdfAsset = {
      id: 2,
      bookmark_id: 1,
      asset_type: 'document',
      content_type: 'application/pdf',
      display_name: 'Document.pdf',
      file_size: 54321,
      status: 'complete' as const,
      date_created: '2024-01-01T10:00:00Z',
      content: new ArrayBuffer(8),
      cached_at: '2024-01-01T10:30:00Z',
    };

    beforeEach(() => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);
      (DatabaseService.getAsset as any).mockResolvedValue(null);
    });

    it('should fetch content from HTML asset', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([mockHtmlAsset]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.content).toContain('Asset Content');
      expect(result.readability_content).toContain('pocket-ding-header');
      expect(result.readability_content).toContain('<p>Processed content</p>');
      expect(result.readability_content).toContain('Test Article');
      expect(result.source).toBe('asset');
    });

    it('should show unsupported content message for PDF asset', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([mockPdfAsset]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.content).toContain('Unsupported Content Type');
      expect(result.content).toContain('application/pdf');
      expect(result.content).toContain('Document.pdf');
      expect(result.content).toContain('53.05 KB'); // 54321 bytes formatted
      expect(result.source).toBe('asset');
    });

    it('should prefer HTML asset over PDF asset', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([mockPdfAsset, mockHtmlAsset]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.content).toContain('Asset Content');
      expect(result.source).toBe('asset');
    });

    it('should fetch specific asset by id', async () => {
      (DatabaseService.getAsset as any).mockResolvedValue(mockHtmlAsset);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'asset', 1);

      expect((DatabaseService.getAsset as any)).toHaveBeenCalledWith(1);
      expect(result.content).toContain('Asset Content');
      expect(result.source).toBe('asset');
    });

    it('should handle specific asset not found', async () => {
      (DatabaseService.getAsset as any).mockResolvedValue(null);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'asset', 999);

      expect(result.content).toContain('No cached content available');
      expect(result.content).toContain('Open in New Tab');
      expect(result.source).toBe('asset');
    });

    it('should fallback when no assets available', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.content).toContain('No cached content available');
      expect(result.content).toContain('Open in New Tab');
      expect(result.source).toBe('asset');
    });

    it('should show web archive link when no assets available', async () => {
      const bookmarkWithArchive = {
        ...mockBookmark,
        web_archive_snapshot_url: 'https://web.archive.org/web/20240101/https://example.com',
      };

      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithArchive);

      expect(result.content).toContain('Open Web Archive Version');
      expect(result.content).toContain('web.archive.org');
      expect(result.source).toBe('asset');
    });
  });

  describe('Content Source Options', () => {
    const mockAssets = [
      {
        id: 1,
        bookmark_id: 1,
        asset_type: 'snapshot',
        content_type: 'text/html',
        display_name: 'Page Snapshot',
        file_size: 12345,
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
        content: new ArrayBuffer(8),
        cached_at: '2024-01-01T10:30:00Z',
      },
      {
        id: 2,
        bookmark_id: 1,
        asset_type: 'document',
        content_type: 'application/pdf',
        display_name: 'Document.pdf',
        file_size: 54321,
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
        content: new ArrayBuffer(8),
        cached_at: '2024-01-01T10:30:00Z',
      },
    ];

    it('should return available content sources with assets', async () => {
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue(mockAssets);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources).toHaveLength(3); // 2 assets + Live URL
      expect(sources[0]).toEqual({
        type: 'asset',
        label: 'Page Snapshot',
        assetId: 1,
      });
      expect(sources[1]).toEqual({
        type: 'asset',
        label: 'Document.pdf',
        assetId: 2,
      });
      expect(sources[2]).toEqual({
        type: 'url',
        label: 'Live URL',
      });
    });

    it('should return empty sources when no assets available', async () => {
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([]);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources).toHaveLength(1); // No assets, but still have Live URL
      expect(sources[0]).toEqual({
        type: 'url',
        label: 'Live URL',
      });
    });

    it('should handle assets with missing display name', async () => {
      const assetWithoutName = {
        id: 3,
        bookmark_id: 1,
        asset_type: 'unknown',
        content_type: 'application/octet-stream',
        display_name: '',
        file_size: 1000,
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
        content: new ArrayBuffer(8),
        cached_at: '2024-01-01T10:30:00Z',
      };

      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([assetWithoutName]);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources).toHaveLength(2); // Asset + Readability
      expect(sources[0]?.label).toBe('Asset 3');
    });
  });

  describe('Content Type Support', () => {
    it('should format file sizes correctly', async () => {
      const testAsset = {
        id: 1,
        bookmark_id: 1,
        asset_type: 'document',
        content_type: 'application/pdf',
        display_name: 'Large Document.pdf',
        file_size: 1048576, // 1 MB
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
        content: new ArrayBuffer(8),
        cached_at: '2024-01-01T10:30:00Z',
      };

      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([testAsset]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.content).toContain('1 MB');
    });

  });

  describe('Archived Content On-Demand Fetching', () => {
    const archivedBookmark: LocalBookmark = {
      ...mockBookmark,
      is_archived: true
    };

    // Moved to beforeEach hook to prevent mutation between tests

    const mockSettings = {
      linkding_url: 'https://linkding.example.com',
      linkding_token: 'test-token',
      sync_interval: 60,
      auto_sync: true,
      reading_mode: 'readability' as const,
    };

    beforeEach(() => {
      // Reset all mocks for clean state
      vi.clearAllMocks();
      
      // Create a fresh copy of the mock asset for each test to prevent mutation
      const freshMockAsset = {
        id: 1,
        asset_type: 'snapshot',
        content_type: 'text/html',
        display_name: 'Page Snapshot',
        file_size: 12345,
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
        bookmark_id: 1,
        // No content or cached_at - needs on-demand fetching
      };
      
      // Set up fresh mocks for each test
      (DatabaseService.getAsset as any).mockResolvedValue(freshMockAsset);
      (DatabaseService.getSettings as any).mockResolvedValue(mockSettings);
      (DatabaseService.saveAsset as any).mockResolvedValue(undefined);
      
      // Reset LinkdingAPI mock
      (createLinkdingAPI as any).mockImplementation(() => ({
        downloadAsset: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      }));
    });

    it('should fetch archived content on-demand when online', async () => {
      const mockContent = new TextEncoder().encode('<html><body><h1>On-demand content</h1></body></html>').buffer;
      const mockApi = {
        downloadAsset: vi.fn().mockResolvedValue(mockContent)
      };
      (createLinkdingAPI as any).mockImplementation(() => mockApi);

      const result = await ContentFetcher.fetchBookmarkContent(archivedBookmark, 'asset', 1);

      expect(mockApi.downloadAsset).toHaveBeenCalledWith(1, 1);
      expect(result.content).toContain('On-demand content'); // Content should be processed
      expect(result.source).toBe('asset');
    });

    it('should not cache content for archived bookmarks', async () => {
      const mockContent = new TextEncoder().encode('<html><body><h1>Test content</h1></body></html>').buffer;
      const mockApi = {
        downloadAsset: vi.fn().mockResolvedValue(mockContent)
      };
      (createLinkdingAPI as any).mockImplementation(() => mockApi);

      await ContentFetcher.fetchBookmarkContent(archivedBookmark, 'asset', 1);

      // Should not save cached content for archived bookmarks
      expect(DatabaseService.saveAsset).not.toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.any(ArrayBuffer),
          cached_at: expect.any(String)
        })
      );
    });

    it('should cache content for unarchived bookmarks', async () => {
      const mockContent = new TextEncoder().encode('<html><body><h1>Cached content</h1></body></html>').buffer;
      const mockApi = {
        downloadAsset: vi.fn().mockResolvedValue(mockContent)
      };
      (createLinkdingAPI as any).mockImplementation(() => mockApi);

      await ContentFetcher.fetchBookmarkContent(mockBookmark, 'asset', 1);

      // Should save cached content for unarchived bookmarks
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockContent,
          cached_at: expect.any(String)
        })
      );
    });

    it('should show offline message for archived content when network fails', async () => {
      const networkError = new Error('Failed to fetch');
      const mockApi = {
        downloadAsset: vi.fn().mockRejectedValue(networkError)
      };
      (createLinkdingAPI as any).mockImplementation(() => mockApi);

      const result = await ContentFetcher.fetchBookmarkContent(archivedBookmark, 'asset', 1);

      expect(result.content).toContain('Content Unavailable');
      expect(result.content).toContain('archived bookmark requires an internet connection');
      expect(result.content).toContain('sl-alert variant="warning"');
      expect(result.source).toBe('asset');
    });

    it('should include technical details in offline message', async () => {
      const networkError = new TypeError('Network error');
      const mockApi = {
        downloadAsset: vi.fn().mockRejectedValue(networkError)
      };
      (createLinkdingAPI as any).mockImplementation(() => mockApi);

      const result = await ContentFetcher.fetchBookmarkContent(archivedBookmark, 'asset', 1);

      expect(result.content).toContain('Technical Details');
      expect(result.content).toContain('Page Snapshot');
      expect(result.content).toContain('offline or network connection failed');
    });

    it('should include alternative access buttons in offline message', async () => {
      const networkError = new Error('Network error');
      const mockApi = {
        downloadAsset: vi.fn().mockRejectedValue(networkError)
      };
      (createLinkdingAPI as any).mockImplementation(() => mockApi);

      const bookmarkWithArchive = {
        ...archivedBookmark,
        web_archive_snapshot_url: 'https://archive.org/example'
      };

      const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithArchive, 'asset', 1);

      expect(result.content).toContain('Open Original URL');
      expect(result.content).toContain('Web Archive');
      expect(result.content).toContain(bookmarkWithArchive.url);
      expect(result.content).toContain(bookmarkWithArchive.web_archive_snapshot_url);
    });

    it('should handle missing settings gracefully', async () => {
      // Override settings for this specific test
      (DatabaseService.getSettings as any).mockResolvedValue(null);

      const result = await ContentFetcher.fetchBookmarkContent(archivedBookmark, 'asset', 1);

      // Should gracefully handle missing settings by showing appropriate content
      expect(result).not.toBeNull();
      expect(result.source).toBe('asset');
      // Could be fallback content or unsupported content depending on asset state
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe('Content Source Options for Archived Bookmarks', () => {
    const archivedBookmark: LocalBookmark = {
      ...mockBookmark,
      is_archived: true
    };

    const mockUncachedAssets = [
      {
        id: 1,
        asset_type: 'snapshot',
        content_type: 'text/html',
        display_name: 'Page Snapshot',
        file_size: 12345,
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
        bookmark_id: 1,
        // No content - not cached
      },
      {
        id: 2,
        asset_type: 'document',
        content_type: 'application/pdf',
        display_name: 'Document.pdf',
        file_size: 54321,
        status: 'complete' as const,
        date_created: '2024-01-01T10:30:00Z',
        bookmark_id: 1,
        // No content - not cached
      },
    ];

    it('should include on-demand label for archived bookmark assets', async () => {
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue(mockUncachedAssets);

      const sources = await ContentFetcher.getAvailableContentSources(archivedBookmark);

      expect(sources).toHaveLength(3); // 2 assets + Live URL
      expect(sources[0]).toEqual({
        type: 'asset',
        label: 'Page Snapshot (on-demand)',
        assetId: 1,
      });
      expect(sources[1]).toEqual({
        type: 'asset',
        label: 'Document.pdf (on-demand)',
        assetId: 2,
      });
      expect(sources[2]).toEqual({
        type: 'url',
        label: 'Live URL',
      });
    });

    it('should not add on-demand label for cached archived assets', async () => {
      const cachedAssets = mockUncachedAssets.map(asset => ({
        ...asset,
        content: new ArrayBuffer(8),
        cached_at: '2024-01-01T10:00:00Z'
      }));

      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue(cachedAssets);

      const sources = await ContentFetcher.getAvailableContentSources(archivedBookmark);

      expect(sources[0]?.label).toBe('Page Snapshot'); // No (on-demand) suffix
      expect(sources[1]?.label).toBe('Document.pdf'); // No (on-demand) suffix
    });

    it('should not add on-demand label for unarchived bookmarks', async () => {
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue(mockUncachedAssets);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources[0]?.label).toBe('Page Snapshot'); // No (on-demand) suffix
      expect(sources[1]?.label).toBe('Document.pdf'); // No (on-demand) suffix
    });
  });

  describe('Live URL Content Fetching', () => {
    let mockFetch: any;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should fetch live URL content successfully', async () => {
      const mockHtml = '<html><body><h1>Live Content</h1><p>Fresh from the web</p></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => name === 'content-type' ? 'text/html; charset=utf-8' : null
        },
        text: () => Promise.resolve(mockHtml),
      });

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'url');

      expect(mockFetch).toHaveBeenCalledWith(mockBookmark.url, {
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'User-Agent': 'PocketDing/1.0 (Progressive Web App)'
        }
      });
      expect(result.source).toBe('url');
      expect(result.content).toBe(mockHtml);
      expect(result.readability_content).toContain('pocket-ding-header');
      expect(result.readability_content).toContain('<p>Processed content</p>');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'url');

      expect(result.source).toBe('url');
      expect(result.content).toContain('Live URL Content Unavailable');
      expect(result.content).toContain('HTTP 404: Not Found');
      expect(result.content).toContain('Open Original Website');
    });

    it('should handle CORS errors with helpful message', async () => {
      const corsError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValue(corsError);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'url');

      expect(result.source).toBe('url');
      expect(result.content).toContain('CORS (Cross-Origin Resource Sharing) restrictions');
      expect(result.content).toContain('website blocks direct content loading');
      expect(result.content).toContain('Open the link directly');
    });

    it('should handle network errors', async () => {
      const networkError = new TypeError('NetworkError when attempting to fetch resource');
      mockFetch.mockRejectedValue(networkError);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'url');

      expect(result.source).toBe('url');
      expect(result.content).toContain('network connectivity issues');
      expect(result.content).toContain('No internet connection');
    });

    it('should handle unsupported content types', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/pdf' : null
        },
        text: () => Promise.resolve('PDF content'),
      });

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'url');

      expect(result.source).toBe('url');
      expect(result.content).toContain('Unsupported Content Type');
      expect(result.content).toContain('application/pdf');
      expect(result.content).toContain('cannot be displayed inline');
    });

    it('should include web archive link in error messages when available', async () => {
      const bookmarkWithArchive = {
        ...mockBookmark,
        web_archive_snapshot_url: 'https://web.archive.org/web/20240101/https://example.com',
      };

      mockFetch.mockRejectedValue(new Error('Generic error'));

      const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithArchive, 'url');

      expect(result.content).toContain('Try Web Archive Version');
      expect(result.content).toContain('web.archive.org');
    });

    it('should not include web archive link when not available', async () => {
      mockFetch.mockRejectedValue(new Error('Generic error'));

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'url');

      expect(result.content).not.toContain('Try Web Archive Version');
      expect(result.content).not.toContain('web.archive.org');
    });
  });
});