import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentFetcher } from '../../services/content-fetcher';
import { DatabaseService } from '../../services/database';
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
    getAsset: vi.fn().mockResolvedValue(null),
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

  it('should fetch and process bookmark content', async () => {
    const mockHtml = '<html><body><h1>Test Article</h1><p>Content</p></body></html>';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });
    global.fetch = mockFetch;

    const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

    expect(mockFetch).toHaveBeenCalledWith(
      mockBookmark.url,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        mode: 'cors',
        headers: expect.objectContaining({
          'User-Agent': 'Mozilla/5.0 (compatible; LinkdingReader/1.0)',
        }),
      })
    );
    expect(result.content).toBe(mockHtml);
    expect(result.readability_content).toBe('<p>Processed content</p>');
    expect(result.source).toBe('url');
  });

  it('should handle fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    // Use a bookmark with empty description to ensure fallback message appears
    const bookmarkWithoutDescription = { ...mockBookmark, description: '' };
    const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithoutDescription);

    expect(result.content).toContain('Content could not be loaded');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch content from https://example.com/article:', expect.any(Error));
    expect(result.content).toContain(bookmarkWithoutDescription.title);
    expect(result.readability_content).toContain('Content could not be loaded');
    expect(result.source).toBe('url');
  });

  it('should handle HTTP errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    global.fetch = mockFetch;

    // Use a bookmark with empty description to ensure fallback message appears
    const bookmarkWithoutDescription = { ...mockBookmark, description: '' };
    const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithoutDescription);

    expect(result.content).toContain('Content could not be loaded');
    expect(result.readability_content).toContain('Content could not be loaded');
    expect(result.source).toBe('url');
    // HTTP errors (like 404) don't trigger console.error, they just return null
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
      expect(result.readability_content).toBe('<p>Processed content</p>');
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
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><body>URL content</body></html>'),
      });
      global.fetch = mockFetch;

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark, 'asset', 999);

      expect(result.content).toContain('URL content');
      expect(result.source).toBe('url');
    });

    it('should fallback to URL when no assets available', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><body>URL content</body></html>'),
      });
      global.fetch = mockFetch;

      const result = await ContentFetcher.fetchBookmarkContent(mockBookmark);

      expect(result.content).toContain('URL content');
      expect(result.source).toBe('url');
    });

    it('should use web archive when URL fails and web archive is available', async () => {
      const bookmarkWithArchive = {
        ...mockBookmark,
        web_archive_snapshot_url: 'https://web.archive.org/web/20240101/https://example.com',
      };

      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 404 }) // URL fails
        .mockResolvedValueOnce({ // Web archive succeeds
          ok: true,
          text: () => Promise.resolve('<html><body>Archive content</body></html>'),
        });
      global.fetch = mockFetch;

      const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithArchive);

      expect(result.content).toContain('Archive content');
      expect(result.source).toBe('web_archive');
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
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue(mockAssets);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources).toHaveLength(4); // 2 assets + URL + Readability
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
        label: 'Original URL',
      });
      expect(sources[3]).toEqual({
        type: 'readability',
        label: 'Readability',
      });
    });

    it('should return content sources with web archive when available', async () => {
      const bookmarkWithArchive = {
        ...mockBookmark,
        web_archive_snapshot_url: 'https://web.archive.org/web/20240101/https://example.com',
      };

      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const sources = await ContentFetcher.getAvailableContentSources(bookmarkWithArchive);

      expect(sources).toHaveLength(3); // URL + Web Archive + Readability
      expect(sources).toContainEqual({
        type: 'web_archive',
        label: 'Web Archive',
      });
    });

    it('should return minimal sources when no assets or web archive', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources).toHaveLength(2); // URL + Readability
      expect(sources).toEqual([
        { type: 'url', label: 'Original URL' },
        { type: 'readability', label: 'Readability' },
      ]);
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

      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([assetWithoutName]);

      const sourcesWithAsset = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sourcesWithAsset[0]?.label).toBe('Asset 3');
    });
  });
});