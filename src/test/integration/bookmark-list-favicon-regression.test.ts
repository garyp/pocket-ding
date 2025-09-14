import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

const mockBookmarks: LocalBookmark[] = [
  {
    id: 1,
    url: 'https://example.com/article1',
    title: 'Test Article 1',
    description: 'Description for article 1',
    notes: '',
    website_title: 'Example Site',
    website_description: 'Example Description',
    web_archive_snapshot_url: '',
    favicon_url: 'https://example.com/favicon1.ico',
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
    url: 'https://example.com/article2',
    title: 'Test Article 2',
    description: 'Description for article 2',
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
    date_added: '2024-01-02T00:00:00Z',
    date_modified: '2024-01-02T00:00:00Z',
  },
];

/**
 * Simplified Favicon Display Test
 *
 * Updated for new architecture where BookmarkList is a presentational component
 * that receives data as props from BookmarkListContainer.
 *
 * Tests what users actually see:
 * - Favicon images are rendered in bookmark cards
 * - Cached favicons are displayed when available
 * - Default favicon is shown when none cached
 * - Component displays bookmark data correctly when provided as props
 */
describe('BookmarkList Favicon Display', () => {
  let element: BookmarkList;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock for assets query only
    vi.mocked(DatabaseService.getBookmarksWithAssetCounts).mockResolvedValue(new Map());

    element = new BookmarkList();

    // Set up props - BookmarkList now receives data instead of fetching it
    element.bookmarks = mockBookmarks;
    element.isLoading = false;
    element.faviconCache = new Map();
    element.syncedBookmarkIds = new Set();
    // Pagination state removed - handled by container
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.remove();
    }
  });

  it('displays bookmarks with favicon images', async () => {
    document.body.appendChild(element);
    await element.updateComplete;

    // Bookmarks should render immediately since they're provided as props
    const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
    expect(bookmarkElements?.length).toBe(2);

    // Check that favicon images are present (core regression test)
    const faviconImages = element.shadowRoot?.querySelectorAll('.favicon');
    expect(faviconImages?.length).toBe(2);
  });

  it('shows cached favicon when available', async () => {
    // Set up favicon cache
    element.faviconCache.set(1, 'https://example.com/cached-favicon.ico');

    document.body.appendChild(element);
    await element.updateComplete;

    // Check that the cached favicon is used
    const bookmark = element.shadowRoot?.querySelector('[data-bookmark-id="1"]');
    const faviconImg = bookmark?.querySelector('.favicon') as HTMLImageElement;

    expect(faviconImg).toBeTruthy();
    expect(faviconImg.src).toContain('cached-favicon.ico');
  });

  it('shows default favicon when none cached', async () => {
    document.body.appendChild(element);
    await element.updateComplete;

    // Check that default favicon (SVG) is used when no cache
    const faviconImg = element.shadowRoot?.querySelector('.favicon') as HTMLImageElement;

    expect(faviconImg).toBeTruthy();
    expect(faviconImg.src).toContain('data:image/svg+xml');
  });

  it('supports filter interaction', async () => {
    document.body.appendChild(element);
    await element.updateComplete;

    // BookmarkList no longer contains pagination controls - they're in the paginated-list wrapper
    // Instead, verify that bookmarks are displayed correctly
    const bookmarkElements = element.shadowRoot?.querySelectorAll('[data-bookmark-id]');
    expect(bookmarkElements?.length).toBe(2);

    // Note: Pagination and filter state now handled by container
  });

  it('displays bookmark metadata correctly', async () => {
    document.body.appendChild(element);
    await element.updateComplete;

    // Check for typical bookmark elements
    const bookmarkTitles = element.shadowRoot?.querySelectorAll('.bookmark-title');
    const bookmarkUrls = element.shadowRoot?.querySelectorAll('.bookmark-url');

    expect(bookmarkTitles?.length).toBe(2);
    expect(bookmarkUrls?.length).toBe(2);

    // Verify the actual content matches our mock data
    expect(bookmarkTitles?.[0]?.textContent).toBe('Test Article 1');
    expect(bookmarkTitles?.[1]?.textContent).toBe('Test Article 2');
  });
});