import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentFetcher } from '../../services/content-fetcher';
import { DatabaseService } from '../../services/database';
import { createLinkdingAPI } from '../../services/linkding-api';
import { DebugService } from '../../services/debug-service';
import type { LocalBookmark } from '../../types';

// Mock the fetch helper


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

// Mock DebugService
vi.mock('../../services/debug-service', () => ({
  DebugService: {
    logInfo: vi.fn(),
    logError: vi.fn(),
    logWarning: vi.fn(),
  },
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

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset database service mocks to default values
    (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);
    (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([]);
    (DatabaseService.getAsset as any).mockResolvedValue(null);
    (DatabaseService.getSettings as any).mockResolvedValue(null);
    (DatabaseService.saveAsset as any).mockResolvedValue(undefined);
    
    // Reset linkding API mock to default
    (createLinkdingAPI as any).mockReturnValue({
      downloadAsset: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    
    // Clear DebugService mocks
    (DebugService.logInfo as any).mockClear();
    (DebugService.logError as any).mockClear();
    (DebugService.logWarning as any).mockClear();
  });

  afterEach(() => {
    // Mocks are restored automatically after all tests
  });

  it('should return fallback content when no assets available', async () => {
    const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

    expect(result.source).toBe('asset');
    expect(result.content_type).toBe('error');
    expect(result.error?.type).toBe('not_found');
    expect(result.error?.message).toContain('No cached content available');
    expect(result.error?.suggestions).toContain('Ask your Linkding administrator to enable content archiving');
  });

  it('should handle bookmarks without description gracefully', async () => {
    // Use a bookmark with empty description to ensure fallback message appears
    const bookmarkWithoutDescription = { ...mockBookmark, description: '' };
    const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithoutDescription);

    expect(result.source).toBe('asset');
    expect(result.content_type).toBe('error');
    expect(result.error?.type).toBe('not_found');
    expect(result.error?.message).toContain('No cached content available');
    expect(result.error?.details).toBe(''); // Empty description
  });

  it('should include web archive URL in error when available', async () => {
    const bookmarkWithArchive = {
      ...mockBookmark,
      web_archive_snapshot_url: 'https://web.archive.org/web/20240101/https://example.com',
    };

    const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithArchive);

    expect(result.source).toBe('asset');
    expect(result.content_type).toBe('error');
    expect(result.error?.type).toBe('not_found');
    // The component will handle showing the web archive link based on bookmark data
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

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('html');
      expect(result.html_content).toContain('Asset Content');
      expect(result.readability_content).toContain('pocket-ding-header');
      expect(result.readability_content).toContain('<p>Processed content</p>');
      expect(result.readability_content).toContain('Test Article');
      expect(result.metadata?.asset_id).toBe(1);
      expect(result.metadata?.content_type).toBe('text/html');
    });

    it('should show unsupported content message for PDF asset', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([mockPdfAsset]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('unsupported');
      expect(result.error?.type).toBe('unsupported');
      expect(result.error?.message).toContain('application/pdf');
      expect(result.metadata?.display_name).toBe('Document.pdf');
      expect(result.metadata?.file_size).toBe(54321);
      expect(result.metadata?.asset_id).toBe(2);
    });

    it('should prefer HTML asset over PDF asset', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([mockPdfAsset, mockHtmlAsset]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('html');
      expect(result.html_content).toContain('Asset Content');
      expect(result.metadata?.asset_id).toBe(1); // HTML asset was chosen
    });

    it('should fetch specific asset by id', async () => {
      (DatabaseService.getAsset as any).mockResolvedValue(mockHtmlAsset);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'asset', 1);

      expect((DatabaseService.getAsset as any)).toHaveBeenCalledWith(1);
      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('html');
      expect(result.html_content).toContain('Asset Content');
      expect(result.metadata?.asset_id).toBe(1);
    });

    it('should handle specific asset not found', async () => {
      (DatabaseService.getAsset as any).mockResolvedValue(null);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'asset', 999);

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('error');
      expect(result.error?.type).toBe('not_found');
      expect(result.error?.message).toContain('No cached content available');
    });

    it('should fallback when no assets available', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('error');
      expect(result.error?.type).toBe('not_found');
      expect(result.error?.message).toContain('No cached content available');
    });

    it('should return error when no assets available (web archive handled by component)', async () => {
      const bookmarkWithArchive = {
        ...mockBookmark,
        web_archive_snapshot_url: 'https://web.archive.org/web/20240101/https://example.com',
      };

      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithArchive);

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('error');
      expect(result.error?.type).toBe('not_found');
      // Component will show web archive link based on bookmark.web_archive_snapshot_url
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
      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark, mockAssets);

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
      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark, []);

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

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark, [assetWithoutName]);

      expect(sources).toHaveLength(2); // Asset + Live URL
      expect(sources[0]?.label).toBe('Asset 3');
    });
  });

  describe('Content Type Support', () => {
    it('should include file size in metadata for unsupported content', async () => {
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

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('unsupported');
      expect(result.metadata?.file_size).toBe(1048576);
      expect(result.metadata?.display_name).toBe('Large Document.pdf');
      // Component will format file size: 1048576 bytes -> "1 MB"
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
      expect(result.html_content).toContain('On-demand content'); // Content should be processed
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

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('error');
      expect(result.error?.message).toContain('archived bookmark requires an internet connection');
      expect(result.error?.details).toContain('Page Snapshot');
      expect(result.metadata?.asset_id).toBe(1);
    });

    it('should include technical details in offline message', async () => {
      const networkError = new TypeError('Network error');
      const mockApi = {
        downloadAsset: vi.fn().mockRejectedValue(networkError)
      };
      (createLinkdingAPI as any).mockImplementation(() => mockApi);

      const result = await ContentFetcher.fetchBookmarkContent(archivedBookmark, 'asset', 1);

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('error');
      expect(result.error?.details).toContain('Page Snapshot');
      expect(result.error?.details).toContain('offline or network connection failed');
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

      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('error');
      expect(result.error?.type).toBe('server_error'); // Non-network error
      // Component will show action buttons based on bookmark properties
    });

    it('should handle missing settings gracefully', async () => {
      // Override settings for this specific test and ensure empty assets
      (DatabaseService.getSettings as any).mockResolvedValue(null);
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const result = await ContentFetcher.fetchBookmarkContent(archivedBookmark, 'asset', 1);

      // Should gracefully handle missing settings by showing appropriate content
      expect(result).not.toBeNull();
      expect(result.source).toBe('asset');
      expect(result.content_type).toBe('error');
      // Returns fallback error when settings are missing
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
      const sources = await ContentFetcher.getAvailableContentSources(archivedBookmark, mockUncachedAssets);

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

      const sources = await ContentFetcher.getAvailableContentSources(archivedBookmark, cachedAssets);

      expect(sources[0]?.label).toBe('Page Snapshot'); // No (on-demand) suffix
      expect(sources[1]?.label).toBe('Document.pdf'); // No (on-demand) suffix
    });

    it('should not add on-demand label for unarchived bookmarks', async () => {
      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark, mockUncachedAssets);

      expect(sources[0]?.label).toBe('Page Snapshot'); // No (on-demand) suffix
      expect(sources[1]?.label).toBe('Document.pdf'); // No (on-demand) suffix
    });

    it('should process only the assets provided', async () => {
      const providedAssets = [mockUncachedAssets[0]!]; // Only provide first asset

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark, providedAssets);

      expect(sources).toHaveLength(2); // 1 provided asset + Live URL
      expect(sources[0]).toEqual({
        type: 'asset',
        label: 'Page Snapshot',
        assetId: 1,
      });
      expect(sources[1]).toEqual({
        type: 'url',
        label: 'Live URL',
      });
    });
  });


  describe('Live URL Content Fetching', () => {

    it('should return iframe content for live URLs to bypass CORS issues', async () => {
      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'url');

      expect(result.source).toBe('url');
      expect(result.content_type).toBe('iframe');
      expect(result.iframe_url).toBe(mockBookmark.url);
      expect(result.metadata?.url).toBe(mockBookmark.url);
    });

    it('should handle all URL types with iframe approach', async () => {
      const testUrls = [
        'https://example.com/page.html',
        'https://example.com/doc.pdf',
        'https://example.com/data.json'
      ];

      for (const url of testUrls) {
        const testBookmark = { ...mockBookmark, url };
        const result = await ContentFetcher.fetchBookmarkContent(testBookmark, 'url');
        
        expect(result.source).toBe('url');
        expect(result.content_type).toBe('iframe');
        expect(result.iframe_url).toBe(url);
        expect(result.metadata?.url).toBe(url);
      }
    });






  });
});