import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentFetcher } from '../../services/content-fetcher';
import { LocalBookmark } from '../../types';

// Mock @mozilla/readability
vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation(() => ({
    parse: vi.fn().mockReturnValue({
      content: '<p>Processed content</p>',
      title: 'Test Article',
    }),
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
  });

  it('should handle fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    // Use a bookmark with empty description to ensure fallback message appears
    const bookmarkWithoutDescription = { ...mockBookmark, description: '' };
    const result = await ContentFetcher.fetchBookmarkContent(bookmarkWithoutDescription);

    expect(result.content).toContain('Content could not be loaded');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch bookmark content:', expect.any(Error));
    expect(result.content).toContain(bookmarkWithoutDescription.title);
    expect(result.readability_content).toContain('Content could not be loaded');
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
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch bookmark content:', expect.any(Error));
  });
});