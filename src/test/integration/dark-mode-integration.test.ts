import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeService } from '../../services/theme-service';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';
import { BookmarkReader } from '../../components/bookmark-reader';
import type { LocalBookmark, ReadProgress } from '../../types';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock matchMedia
const mockMatchMedia = vi.fn();
Object.defineProperty(window, 'matchMedia', {
  value: mockMatchMedia,
});

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/content-fetcher');

// Component is auto-registered by the @customElement decorator

describe('Dark Mode Integration', () => {
  let mockMediaQuery: any;
  let element: BookmarkReader;
  let mockBookmark: LocalBookmark;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock media query - ensure it starts with light theme
    mockMediaQuery = {
      matches: false, // false means light theme
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockMatchMedia.mockReturnValue(mockMediaQuery);
    
    // Reset localStorage mock
    mockLocalStorage.getItem.mockReturnValue(null);
    
    // Reset ThemeService to clean state
    ThemeService.reset();
    
    // Clean up document
    document.documentElement.className = '';
    document.querySelectorAll('link[data-shoelace-theme]').forEach(link => link.remove());
    
    // Wait for any pending async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Mock bookmark data
    mockBookmark = {
      id: 1,
      url: 'https://example.com',
      title: 'Test Article',
      description: 'Test description',
      notes: '',
      website_title: 'Example',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: [],
      date_added: '2024-01-01T00:00:00Z',
      date_modified: '2024-01-01T00:00:00Z',
      reading_mode: 'readability',
    };

    // Mock service responses
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue({
      bookmark_id: 1,
      progress: 0,
      last_read_at: '2024-01-01T00:00:00Z',
      reading_mode: 'readability',
      scroll_position: 0,
      dark_mode_override: null,
    });
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue();
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue();
    vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue([
      { type: 'asset', label: 'Cached Content', assetId: 1 }
    ]);
    vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
      content: '<p>Test content</p>',
      readability_content: '<p>Readability content</p>',
      source: 'asset'
    });

    // Create reader element
    element = new BookmarkReader();
    document.body.appendChild(element);
  });

  afterEach(() => {
    element?.remove();
    document.querySelectorAll('link[data-shoelace-theme]').forEach(link => link.remove());
  });

  describe('System theme integration', () => {
    it('should initialize global theme and reader theme together', async () => {
      // System prefers dark
      mockMediaQuery.matches = true;
      
      // Initialize theme service
      ThemeService.init();
      
      // Load reader with bookmark
      element.bookmarkId = 1;
      await element.updateComplete;
      
      // Both global and reader should be dark
      expect(document.documentElement.className).toBe('dark');
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
      
      // Material theme should be dark (allow time for async theme loading)
      await new Promise(resolve => setTimeout(resolve, 100));
      const themeStyle = document.querySelector('style[data-material-theme]');
      expect(themeStyle?.getAttribute('data-material-theme')).toBe('dark');
    });

    it('should sync reader theme when global theme changes', async () => {
      // Start with light theme
      ThemeService.init();
      element.bookmarkId = 1;
      await element.updateComplete;
      
      expect(document.documentElement.className).toBe('light');
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
      
      // Change to dark theme globally
      ThemeService.setTheme('dark');
      await element.updateComplete;
      
      expect(document.documentElement.className).toBe('dark');
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
    });

    it('should handle system preference changes', async () => {
      ThemeService.init();
      element.bookmarkId = 1;
      await element.updateComplete;
      
      // Initially light
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
      
      // Simulate system preference change to dark
      mockMediaQuery.matches = true;
      const changeHandler = mockMediaQuery.addEventListener.mock.calls[0][1];
      changeHandler();
      await element.updateComplete;
      
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
    });
  });

  describe('Per-bookmark theme override persistence', () => {
    it('should persist dark mode override across bookmark loads', async () => {
      ThemeService.init();
      
      // Load first bookmark
      element.bookmarkId = 1;
      await element.updateComplete;
      
      // Set dark override
      element['handleDarkModeToggle']();
      expect(element['darkModeOverride']).toBe('dark');
      
      // Verify it was saved
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: 1,
          dark_mode_override: 'dark'
        })
      );
      
      // Load second bookmark (should not have override)
      const mockProgress2: ReadProgress = {
        bookmark_id: 2,
        progress: 0,
        last_read_at: '2024-01-01T00:00:00Z',
        reading_mode: 'readability',
        scroll_position: 0,
        dark_mode_override: null,
      };
      
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(mockProgress2);
      element.bookmarkId = 2;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      expect(element['darkModeOverride']).toBeNull();
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
      
      // Load first bookmark again (should restore override)
      const mockProgress1: ReadProgress = {
        bookmark_id: 1,
        progress: 50,
        last_read_at: '2024-01-01T00:00:00Z',
        reading_mode: 'readability',
        scroll_position: 100,
        dark_mode_override: 'dark',
      };
      
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(mockProgress1);
      element.bookmarkId = 1;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      expect(element['darkModeOverride']).toBe('dark');
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
    });

    it('should handle multiple bookmarks with different overrides', async () => {
      ThemeService.init();
      
      // Bookmark 1 - dark override
      const progress1: ReadProgress = {
        bookmark_id: 1,
        progress: 0,
        last_read_at: '2024-01-01T00:00:00Z',
        reading_mode: 'readability',
        scroll_position: 0,
        dark_mode_override: 'dark',
      };
      
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(progress1);
      element.bookmarkId = 1;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
      
      // Bookmark 2 - light override
      const progress2: ReadProgress = {
        bookmark_id: 2,
        progress: 0,
        last_read_at: '2024-01-01T00:00:00Z',
        reading_mode: 'readability',
        scroll_position: 0,
        dark_mode_override: 'light',
      };
      
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(progress2);
      element.bookmarkId = 2;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
      
      // Bookmark 3 - no override (follow system)
      const progress3: ReadProgress = {
        bookmark_id: 3,
        progress: 0,
        last_read_at: '2024-01-01T00:00:00Z',
        reading_mode: 'readability',
        scroll_position: 0,
        dark_mode_override: null,
      };
      
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(progress3);
      element.bookmarkId = 3;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      // Should follow system (light in this case)
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
    });
  });

  describe('Theme preference UI workflow', () => {
    beforeEach(async () => {
      ThemeService.init();
      element.bookmarkId = 1;
      await element.updateComplete;
    });

    it('should complete full toggle workflow', async () => {
      // Start with system light, no override
      expect(element['darkModeOverride']).toBeNull();
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
      
      // Click toggle -> should set dark override (opposite of light system)
      element['handleDarkModeToggle']();
      await element.updateComplete;
      
      expect(element['darkModeOverride']).toBe('dark');
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
      
      // Click toggle again -> should remove override (dark override is opposite of light system)
      element['handleDarkModeToggle']();
      await element.updateComplete;
      
      expect(element['darkModeOverride']).toBeNull();
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
    });

    it('should update UI elements when toggling', async () => {
      // Wait for component to fully render and load bookmark
      await new Promise(resolve => setTimeout(resolve, 50));
      await element.updateComplete;
      
      // Check initial state - make sure the element is rendered
      expect(element.shadowRoot).toBeTruthy();
      
      let triggerIcon = element.shadowRoot?.querySelector('md-text-button md-icon');
      expect(triggerIcon?.textContent).toBe('light_mode');
      
      let darkModeButton = element.shadowRoot?.querySelector('md-text-button[title]');
      expect(darkModeButton?.getAttribute('title')).toBe('Follow System');
      
      // Toggle to dark
      element['handleDarkModeToggle']();
      await element.updateComplete;
      
      triggerIcon = element.shadowRoot?.querySelector('md-text-button md-icon');
      expect(triggerIcon?.textContent).toBe('dark_mode');
      
      darkModeButton = element.shadowRoot?.querySelector('md-text-button[title]');
      expect(darkModeButton?.getAttribute('title')).toBe('Dark Mode');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle missing progress gracefully', async () => {
      ThemeService.init();
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      
      element.bookmarkId = 1;
      await element.updateComplete;
      
      expect(element['darkModeOverride']).toBeNull();
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
    });

    it('should handle database save errors gracefully', async () => {
      ThemeService.init();
      element.bookmarkId = 1;
      await element.updateComplete;
      
      // Mock save error
      vi.mocked(DatabaseService.saveReadProgress).mockRejectedValue(new Error('Save failed'));
      
      // Should not throw error
      expect(() => element['handleDarkModeToggle']()).not.toThrow();
      
      // State should still update
      expect(element['darkModeOverride']).toBe('dark');
    });

    it('should handle theme service initialization errors', () => {
      // Mock media query error
      mockMatchMedia.mockImplementation(() => {
        throw new Error('Media query not supported');
      });
      
      // Should not throw error
      expect(() => ThemeService.init()).not.toThrow();
    });
  });
});