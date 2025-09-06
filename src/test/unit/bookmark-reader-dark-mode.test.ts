import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BookmarkReader } from '../../components/bookmark-reader';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';
import { ThemeService } from '../../services/theme-service';
import { liveQuery } from 'dexie';
import type { LocalBookmark, ReadProgress } from '../../types';

// Mock Dexie liveQuery
vi.mock('dexie', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    liveQuery: vi.fn()
  };
});

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/content-fetcher');
vi.mock('../../services/theme-service');

// Component is auto-registered by the @customElement decorator

describe('BookmarkReader Dark Mode', () => {
  let element: BookmarkReader;
  let mockBookmark: LocalBookmark;
  let mockProgress: ReadProgress;

  beforeEach(async () => {
    // Clean setup
    vi.clearAllMocks();

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

    mockProgress = {
      bookmark_id: 1,
      progress: 50,
      last_read_at: '2024-01-01T00:00:00Z',
      reading_mode: 'readability',
      scroll_position: 100,
      dark_mode_override: null,
    };

    // Mock service responses
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(mockProgress);
    vi.mocked(DatabaseService.getCompletedAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue();
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue();
    vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue([
      { type: 'asset', label: 'Cached Content', assetId: 1 }
    ]);
    vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
      source: 'asset',
      content_type: 'html',
      html_content: '<p>Test content</p>',
      readability_content: '<p>Readability content</p>'
    });

    // Mock liveQuery to work with ReactiveQueryController
    const mockSubscription = { unsubscribe: vi.fn() };
    const mockObservable = {
      subscribe: vi.fn((observer) => {
        // Immediately call the query function and resolve with its result
        const queryFn = vi.mocked(liveQuery).mock.calls[vi.mocked(liveQuery).mock.calls.length - 1]?.[0];
        if (queryFn) {
          const result = queryFn();
          if (result && typeof (result as any).then === 'function') {
            (result as Promise<any>).then((value: any) => observer.next(value));
          } else {
            observer.next(result);
          }
        }
        return mockSubscription;
      })
    };
    vi.mocked(liveQuery).mockReturnValue(mockObservable as any);

    // Mock ThemeService
    vi.mocked(ThemeService.addThemeChangeListener).mockImplementation((listener) => {
      listener('light'); // Default to light theme
    });
    vi.mocked(ThemeService.removeThemeChangeListener).mockImplementation(() => {});

    // Create element
    element = new BookmarkReader();
    element.bookmarkId = 1;
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    // Safe cleanup
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
    element = null as any;
    vi.restoreAllMocks();
  });

  describe('dark mode override initialization', () => {
    it('should initialize with null dark mode override by default', async () => {
      await element.updateComplete;

      expect(element['darkModeOverride']).toBeNull();
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
    });

    it('should load saved dark mode override from progress', async () => {
      // Create a new progress object with dark override
      const progressWithDark = { ...mockProgress, dark_mode_override: 'dark' as const };
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(progressWithDark);

      // Create new element to pick up the mock change
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      element = new BookmarkReader();
      element.bookmarkId = 1;
      document.body.appendChild(element);
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      expect(element['darkModeOverride']).toBe('dark');
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
    });

    it('should apply light override correctly', async () => {
      // Create a new progress object with light override
      const progressWithLight = { ...mockProgress, dark_mode_override: 'light' as const };
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(progressWithLight);

      // Create new element to pick up the mock change
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      element = new BookmarkReader();
      element.bookmarkId = 1;
      document.body.appendChild(element);
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      expect(element['darkModeOverride']).toBe('light');
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
    });
  });

  describe('theme change listener', () => {
    it('should add theme change listener on connect', async () => {
      await element.updateComplete;

      expect(ThemeService.addThemeChangeListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should update system theme when listener is called', async () => {
      let themeListener: any;
      vi.mocked(ThemeService.addThemeChangeListener).mockImplementation((listener) => {
        themeListener = listener;
        listener('light');
      });

      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      // Simulate theme change
      if (themeListener) {
        themeListener('dark');
        await element.updateComplete;
        expect(element['systemTheme']).toBe('dark');
      }
    });

    it('should apply dark mode when system changes and no override', async () => {
      let themeListener: any;
      vi.mocked(ThemeService.addThemeChangeListener).mockImplementation((listener) => {
        themeListener = listener;
        listener('light');
      });

      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      expect(element.classList.contains('reader-dark-mode')).toBe(false);

      // Change system theme to dark
      if (themeListener) {
        themeListener('dark');
        await element.updateComplete;
        expect(element.classList.contains('reader-dark-mode')).toBe(true);
      }
    });

    it('should not change when override is set and system changes', async () => {
      // Create a new progress object with light override
      const progressWithLight = { ...mockProgress, dark_mode_override: 'light' as const };
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(progressWithLight);

      let themeListener: any;
      vi.mocked(ThemeService.addThemeChangeListener).mockImplementation((listener) => {
        themeListener = listener;
        listener('light');
      });

      // Create new element to pick up the mock change
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      element = new BookmarkReader();
      element.bookmarkId = 1;
      document.body.appendChild(element);
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      expect(element.classList.contains('reader-dark-mode')).toBe(false);

      // Change system theme to dark (should not affect reader due to override)
      if (themeListener) {
        themeListener('dark');
        await element.updateComplete;
        expect(element.classList.contains('reader-dark-mode')).toBe(false);
      }
    });
  });

  describe('dark mode toggle functionality', () => {
    beforeEach(async () => {
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
    });

    it('should toggle from no override to opposite of system', () => {
      element['systemTheme'] = 'light';
      element['darkModeOverride'] = null;

      element['handleDarkModeToggle']();

      expect(element['darkModeOverride']).toBe('dark');
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
    });

    it('should toggle from override matching system to opposite', () => {
      element['systemTheme'] = 'dark';
      element['darkModeOverride'] = 'dark';

      element['handleDarkModeToggle']();

      expect(element['darkModeOverride']).toBe('light');
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
    });

    it('should remove override when it is opposite of system', () => {
      element['systemTheme'] = 'light';
      element['darkModeOverride'] = 'dark';

      element['handleDarkModeToggle']();

      expect(element['darkModeOverride']).toBeNull();
      expect(element.classList.contains('reader-dark-mode')).toBe(false);
    });

    it('should save progress after toggling', () => {
      element['systemTheme'] = 'light';
      element['darkModeOverride'] = null;

      element['handleDarkModeToggle']();

      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          dark_mode_override: 'dark'
        })
      );
    });

    it('should properly handle button click events with arrow functions', async () => {
      element['systemTheme'] = 'light';
      element['darkModeOverride'] = null;
      await element.updateComplete;

      // Find the dark mode toggle button
      const button = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');
      expect(button).toBeTruthy();
      
      // Simulate button click
      const clickEvent = new MouseEvent('click', { bubbles: true });
      button?.dispatchEvent(clickEvent);
      await element.updateComplete;

      // Verify the toggle worked (should set dark override when system is light)
      expect(element['darkModeOverride']).toBe('dark');
      expect(element.classList.contains('reader-dark-mode')).toBe(true);
      
      // Verify progress was saved with the new override
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          dark_mode_override: 'dark'
        })
      );
    });
  });

  describe('theme rendering', () => {
    it('should render correct icon for light mode', async () => {
      element['systemTheme'] = 'light';
      element['darkModeOverride'] = null;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      const iconElement = element.shadowRoot?.querySelector('md-icon-button md-icon');
      expect(iconElement?.textContent).toBe('light_mode');
    });

    it('should render correct icon for dark mode', async () => {
      element['systemTheme'] = 'dark';
      element['darkModeOverride'] = null;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      const iconElement = element.shadowRoot?.querySelector('md-icon-button md-icon');
      expect(iconElement?.textContent).toBe('dark_mode');
    });

    it('should render correct icon for dark override', async () => {
      element['systemTheme'] = 'light';
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      // Set dark override and trigger update
      element['darkModeOverride'] = 'dark';
      element['updateReaderTheme']();
      await element.updateComplete;

      const iconElement = element.shadowRoot?.querySelector('md-icon-button md-icon');
      expect(iconElement?.textContent).toBe('dark_mode');
    });

    it('should render correct button title for no override', async () => {
      element['systemTheme'] = 'light';
      element['darkModeOverride'] = null;
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector('md-icon-button[title]');
      expect(button?.getAttribute('title')).toBe('Follow System Theme');
    });

    it('should render correct button title for dark override', async () => {
      element['systemTheme'] = 'light';
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      // Set dark override and trigger update
      element['darkModeOverride'] = 'dark';
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector('md-icon-button[title]');
      expect(button?.getAttribute('title')).toBe('Dark Mode Active');
    });

    it('should render correct button title for light override', async () => {
      element['systemTheme'] = 'dark';
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
      
      // Set light override and trigger update
      element['darkModeOverride'] = 'light';
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector('md-icon-button[title]');
      expect(button?.getAttribute('title')).toBe('Light Mode Active');
    });
  });

  describe('progress saving with dark mode', () => {
    beforeEach(async () => {
      await element.updateComplete;
      // Wait for loadBookmark to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;
    });

    it('should save dark mode override in progress', async () => {
      element['darkModeOverride'] = 'dark';
      element['readProgress'] = 75;

      await element['saveProgress']();

      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: 1,
          progress: 75,
          dark_mode_override: 'dark'
        })
      );
    });

    it('should save null dark mode override in progress', async () => {
      element['darkModeOverride'] = null;

      await element['saveProgress']();

      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          dark_mode_override: null
        })
      );
    });
  });

  describe('cleanup', () => {
    it('should remove theme change listener on disconnect', () => {
      element.remove();

      expect(ThemeService.removeThemeChangeListener).toHaveBeenCalled();
    });
  });
});