import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkdingAPI } from '../../services/linkding-api';
import { mockBookmarks, MOCK_URL } from '../../services/mock-data';

describe('LinkdingAPI Mock Mode', () => {
  let mockApi: LinkdingAPI;
  let realApi: LinkdingAPI;

  beforeEach(() => {
    mockApi = new LinkdingAPI(MOCK_URL, 'any-token');
    realApi = new LinkdingAPI('https://real-linkding.com', 'real-token');
    vi.clearAllMocks();
  });

  describe('Mock Mode Detection', () => {
    it('should detect mock mode when using mock URL', () => {
      expect(mockApi['isMockMode']()).toBe(true);
    });

    it('should not detect mock mode when using real URL', () => {
      expect(realApi['isMockMode']()).toBe(false);
    });

    it('should detect mock mode regardless of trailing slash', () => {
      const apiWithSlash = new LinkdingAPI(`${MOCK_URL}/`, 'any-token');
      expect(apiWithSlash['isMockMode']()).toBe(true);
    });
  });

  describe('Mock Data Responses', () => {
    it('should return mock bookmarks from getBookmarks', async () => {
      const result = await mockApi.getBookmarks();
      
      expect(result.results).toEqual(mockBookmarks.filter(b => !b.is_archived));
      expect(result.count).toBe(mockBookmarks.filter(b => !b.is_archived).length);
      expect(result.next).toBeNull();
      expect(result.previous).toBeNull();
    });

    it('should return mock archived bookmarks from getArchivedBookmarks', async () => {
      const result = await mockApi.getArchivedBookmarks();
      
      expect(result.results).toEqual(mockBookmarks.filter(b => b.is_archived));
      expect(result.count).toBe(mockBookmarks.filter(b => b.is_archived).length);
      expect(result.next).toBeNull();
      expect(result.previous).toBeNull();
    });

    it('should return all mock bookmarks from getAllBookmarks', async () => {
      const result = await mockApi.getAllBookmarks();
      
      expect(result).toEqual(mockBookmarks);
      expect(result.length).toBe(mockBookmarks.length);
    });

    it('should return specific mock bookmark from getBookmark', async () => {
      const firstBookmark = mockBookmarks[0];
      if (!firstBookmark) throw new Error('No mock bookmarks available');
      
      const result = await mockApi.getBookmark(firstBookmark.id);
      
      expect(result).toEqual(firstBookmark);
    });

    it('should throw error for non-existent bookmark in getBookmark', async () => {
      await expect(mockApi.getBookmark(999)).rejects.toThrow('Bookmark not found: 999');
    });

    it('should return bookmark with unread=false from markBookmarkAsRead', async () => {
      const unreadBookmark = mockBookmarks.find(b => b.unread);
      if (!unreadBookmark) throw new Error('No unread bookmark found in mock data');
      
      const result = await mockApi.markBookmarkAsRead(unreadBookmark.id);
      
      expect(result.id).toBe(unreadBookmark.id);
      expect(result.unread).toBe(false);
      expect(result.title).toBe(unreadBookmark.title);
    });

    it('should throw error for non-existent bookmark in markBookmarkAsRead', async () => {
      await expect(mockApi.markBookmarkAsRead(999)).rejects.toThrow('Bookmark not found: 999');
    });

    it('should return mock assets from getBookmarkAssets', async () => {
      const result = await mockApi.getBookmarkAssets(1);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('asset_type');
      expect(result[0]).toHaveProperty('content_type');
      expect(result[0]).toHaveProperty('display_name');
      expect(result[0]).toHaveProperty('file_size');
      expect(result[0]).toHaveProperty('status');
      expect(result[0]).toHaveProperty('date_created');
    });

    it('should return mock HTML content from downloadAsset', async () => {
      const result = await mockApi.downloadAsset(1, 1);
      
      expect(result).toBeInstanceOf(ArrayBuffer);
      const text = new TextDecoder().decode(result);
      expect(text).toContain('<html>');
      expect(text).toContain('Mock Asset Content');
      expect(text).toContain('Lorem ipsum dolor sit amet');
    });
  });

  describe('Mock Mode Pagination', () => {
    it('should handle pagination for unarchived bookmarks', async () => {
      const limit = 2;
      const unreadBookmarks = mockBookmarks.filter(b => !b.is_archived);
      
      // First page
      const firstPage = await mockApi.getBookmarks(limit, 0);
      expect(firstPage.results.length).toBe(Math.min(limit, unreadBookmarks.length));
      expect(firstPage.count).toBe(unreadBookmarks.length);
      
      if (unreadBookmarks.length > limit) {
        expect(firstPage.next).toContain(`offset=${limit}`);
        expect(firstPage.previous).toBeNull();
        
        // Second page
        const secondPage = await mockApi.getBookmarks(limit, limit);
        expect(secondPage.results.length).toBe(Math.min(limit, unreadBookmarks.length - limit));
        expect(secondPage.count).toBe(unreadBookmarks.length);
        expect(secondPage.previous).toContain(`offset=${Math.max(0, limit - limit)}`);
      }
    });

    it('should handle pagination for archived bookmarks', async () => {
      const limit = 1;
      const archivedBookmarks = mockBookmarks.filter(b => b.is_archived);
      
      // First page
      const firstPage = await mockApi.getArchivedBookmarks(limit, 0);
      expect(firstPage.results.length).toBe(Math.min(limit, archivedBookmarks.length));
      expect(firstPage.count).toBe(archivedBookmarks.length);
      
      if (archivedBookmarks.length > limit) {
        expect(firstPage.next).toContain(`offset=${limit}`);
        expect(firstPage.previous).toBeNull();
      }
    });
  });

  describe('Mock Mode Date Filtering', () => {
    it('should filter bookmarks by modified date in getAllBookmarks', async () => {
      const modifiedSince = '2024-01-05T00:00:00Z';
      const result = await mockApi.getAllBookmarks(modifiedSince);
      
      const expectedBookmarks = mockBookmarks.filter(bookmark => 
        new Date(bookmark.date_modified) >= new Date(modifiedSince)
      );
      
      expect(result).toEqual(expectedBookmarks);
    });

    it('should return all bookmarks when no date filter provided', async () => {
      const result = await mockApi.getAllBookmarks();
      
      expect(result).toEqual(mockBookmarks);
    });
  });

  describe('Mock Mode Connection Test', () => {
    it('should always return true for connection test in mock mode', async () => {
      const result = await LinkdingAPI.testConnection({
        linkding_url: MOCK_URL,
        linkding_token: 'any-value',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability',
      });
      
      expect(result).toBe(true);
    });
  });

  describe('Mock Data Content Validation', () => {
    it('should have bookmarks with Lorem Ipsum content', () => {
      const hasLoremIpsum = mockBookmarks.some(bookmark => 
        bookmark.title.includes('Lorem') || 
        bookmark.description.includes('Lorem ipsum') ||
        bookmark.notes.includes('Lorem')
      );
      expect(hasLoremIpsum).toBe(true);
    });

    it('should have both archived and unarchived bookmarks', () => {
      const hasArchived = mockBookmarks.some(b => b.is_archived);
      const hasUnarchived = mockBookmarks.some(b => !b.is_archived);
      expect(hasArchived).toBe(true);
      expect(hasUnarchived).toBe(true);
    });

    it('should have both read and unread bookmarks', () => {
      const hasRead = mockBookmarks.some(b => !b.unread);
      const hasUnread = mockBookmarks.some(b => b.unread);
      expect(hasRead).toBe(true);
      expect(hasUnread).toBe(true);
    });

    it('should have bookmarks with various tag combinations', () => {
      const allTags = mockBookmarks.flatMap(b => b.tag_names);
      const uniqueTags = [...new Set(allTags)];
      expect(uniqueTags.length).toBeGreaterThan(3);
    });
  });

  describe('Non-Mock Mode Behavior', () => {
    it('should not use mock mode for real API calls', async () => {
      // Mock fetch to verify it's called for real API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          count: 0,
          next: null,
          previous: null,
          results: [],
        }),
      });
      global.fetch = mockFetch;

      await realApi.getBookmarks();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://real-linkding.com/api/bookmarks/?limit=100&offset=0&q=',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Token real-token',
          }),
        })
      );
    });

    it('should use real connection test for non-mock URLs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      global.fetch = mockFetch;

      const result = await LinkdingAPI.testConnection({
        linkding_url: 'https://real-linkding.com',
        linkding_token: 'real-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability',
      });
      
      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});