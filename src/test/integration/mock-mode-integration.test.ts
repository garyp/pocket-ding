import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AppSettings } from '../../types';
import { mockBookmarks, MOCK_URL } from '../../services/mock-data';

// Setup DOM environment
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
setBasePath('/node_modules/@shoelace-style/shoelace/dist/');

// Mock DatabaseService to avoid actual database operations
vi.mock('../../services/database', () => ({
  DatabaseService: {
    saveSettings: vi.fn(),
    getSettings: vi.fn(),
    clearAll: vi.fn(),
    getBookmarks: vi.fn().mockResolvedValue([]),
    saveBookmarks: vi.fn(),
    clearBookmarks: vi.fn(),
  },
}));

// Import services after mocking
import { createLinkdingAPI } from '../../services/linkding-api';
import '../../components/settings-panel';

describe('Mock Mode Integration', () => {
  let settingsPanel: any;
  
  const mockSettings: AppSettings = {
    linkding_url: MOCK_URL,
    linkding_token: 'any-token-value',
    sync_interval: 60,
    auto_sync: true,
    reading_mode: 'readability',
  };

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Create settings panel component
    settingsPanel = document.createElement('settings-panel');
    document.body.appendChild(settingsPanel);
    
    // Wait for component to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    if (settingsPanel) {
      document.body.removeChild(settingsPanel);
    }
  });

  describe('Mock API Integration', () => {
    it('should successfully test connection with mock URL', async () => {
      const { testLinkdingConnection } = await import('../../services/linkding-api');
      const result = await testLinkdingConnection(mockSettings);
      
      expect(result).toBe(true);
    });

    it('should fetch mock bookmarks without network requests', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      
      // Mock global fetch to ensure it's not called
      const mockFetch = vi.fn();
      global.fetch = mockFetch;
      
      const result = await api.getBookmarks();
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.results).toEqual(mockBookmarks.filter(b => !b.is_archived));
      expect(result.count).toBeGreaterThan(0);
    });

    it('should fetch all mock bookmarks without network requests', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      
      // Mock global fetch to ensure it's not called
      const mockFetch = vi.fn();
      global.fetch = mockFetch;
      
      const result = await api.getAllBookmarks();
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(mockBookmarks);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle bookmark operations without network requests', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      
      // Mock global fetch to ensure it's not called
      const mockFetch = vi.fn();
      global.fetch = mockFetch;
      
      // Get first bookmark
      const firstBookmark = mockBookmarks[0];
      if (!firstBookmark) throw new Error('No mock bookmarks available');
      
      const bookmark = await api.getBookmark(firstBookmark.id);
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(bookmark).toEqual(firstBookmark);
      
      // Mark as read
      const readBookmark = await api.markBookmarkAsRead(firstBookmark.id);
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(readBookmark.unread).toBe(false);
      expect(readBookmark.id).toBe(firstBookmark.id);
    });

    it('should handle asset operations without network requests', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      
      // Mock global fetch to ensure it's not called
      const mockFetch = vi.fn();
      global.fetch = mockFetch;
      
      // Get bookmark assets
      const assets = await api.getBookmarkAssets(1);
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(Array.isArray(assets)).toBe(true);
      expect(assets.length).toBeGreaterThan(0);
      
      // Download asset
      const assetData = await api.downloadAsset(1, 1);
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(assetData).toBeInstanceOf(ArrayBuffer);
      
      const text = new TextDecoder().decode(assetData);
      expect(text).toContain('<html>');
      expect(text).toContain('Lorem ipsum');
    });
  });

  describe('Mock Mode Sync Integration', () => {
    it('should create API instance for mock mode without network calls', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      
      // Mock global fetch to ensure it's not called
      const mockFetch = vi.fn();
      global.fetch = mockFetch;
      
      // Basic API operations should work without network
      const bookmarks = await api.getAllBookmarks();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(bookmarks.length).toBeGreaterThan(0);
      
      // Verify some bookmarks have Lorem Ipsum content
      const hasLoremIpsum = bookmarks.some((bookmark: any) => 
        bookmark.title.includes('Lorem') || 
        bookmark.description.includes('Lorem ipsum')
      );
      expect(hasLoremIpsum).toBe(true);
    });
  });

  describe('Mock Mode Content Validation', () => {
    it('should provide realistic Lorem Ipsum content', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      const bookmarks = await api.getAllBookmarks();
      
      // Check that content looks realistic
      bookmarks.forEach(bookmark => {
        expect(bookmark.title).toBeTruthy();
        expect(bookmark.description).toBeTruthy();
        expect(bookmark.url).toMatch(/^https?:\/\//);
        expect(bookmark.date_added).toBeTruthy();
        expect(bookmark.date_modified).toBeTruthy();
        expect(Array.isArray(bookmark.tag_names)).toBe(true);
      });
      
      // Check for Lorem Ipsum content
      const totalText = bookmarks.map(b => `${b.title} ${b.description} ${b.notes}`).join(' ');
      expect(totalText).toContain('Lorem ipsum');
      expect(totalText).toContain('consectetur adipiscing');
      expect(totalText).toContain('dolor sit amet');
    });

    it('should have diverse bookmark types and states', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      const bookmarks = await api.getAllBookmarks();
      
      // Check for diversity
      const hasArchived = bookmarks.some(b => b.is_archived);
      const hasUnarchived = bookmarks.some(b => !b.is_archived);
      const hasRead = bookmarks.some(b => !b.unread);
      const hasUnread = bookmarks.some(b => b.unread);
      const hasShared = bookmarks.some(b => b.shared);
      const hasUnshared = bookmarks.some(b => !b.shared);
      const hasNotes = bookmarks.some(b => b.notes);
      const hasNoNotes = bookmarks.some(b => !b.notes);
      
      expect(hasArchived).toBe(true);
      expect(hasUnarchived).toBe(true);
      expect(hasRead).toBe(true);
      expect(hasUnread).toBe(true);
      expect(hasShared).toBe(true);
      expect(hasUnshared).toBe(true);
      expect(hasNotes).toBe(true);
      expect(hasNoNotes).toBe(true);
    });
  });

  describe('Mock Mode Error Handling', () => {
    it('should handle non-existent bookmark gracefully', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      
      await expect(api.getBookmark(999999)).rejects.toThrow('Bookmark not found: 999999');
      await expect(api.markBookmarkAsRead(999999)).rejects.toThrow('Bookmark not found: 999999');
    });

    it('should maintain consistent behavior with real API', async () => {
      const api = createLinkdingAPI(MOCK_URL, 'any-token');
      
      // Test pagination behavior
      const page1 = await api.getBookmarks(3, 0);
      const page2 = await api.getBookmarks(3, 3);
      
      expect(page1.results.length).toBeLessThanOrEqual(3);
      expect(page2.results.length).toBeGreaterThanOrEqual(0);
      
      // No duplicate bookmarks between pages
      const page1Ids = page1.results.map(b => b.id);
      const page2Ids = page2.results.map(b => b.id);
      const intersection = page1Ids.filter(id => page2Ids.includes(id));
      expect(intersection.length).toBe(0);
    });
  });
});