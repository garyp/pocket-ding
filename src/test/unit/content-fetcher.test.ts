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
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue(mockAssets);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources).toHaveLength(3); // 2 assets + Readability
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
        type: 'readability',
        label: 'Readability',
      });
    });

    it('should return empty sources when no assets available', async () => {
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);

      const sources = await ContentFetcher.getAvailableContentSources(mockBookmark);

      expect(sources).toHaveLength(0); // No assets, no readability
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
});