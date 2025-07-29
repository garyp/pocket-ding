import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { waitFor } from '@testing-library/dom';
import '../setup';

import { AppRoot } from '../../components/app-root';
import { BookmarkReader } from '../../components/bookmark-reader';
import { DatabaseService } from '../../services/database';
import { ThemeService } from '../../services/theme-service';
import type { AppSettings } from '../../types';

// Mock services
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    getBookmark: vi.fn(),
    getReadProgress: vi.fn(),
    saveReadProgress: vi.fn(),
    createSettingsQuery: vi.fn(),
    createBookmarkQuery: vi.fn(),
  },
}));

vi.mock('../../services/theme-service', () => ({
  ThemeService: {
    init: vi.fn(),
    setThemeFromSettings: vi.fn(),
    getCurrentTheme: vi.fn(() => 'light'),
    getResolvedTheme: vi.fn(() => 'light'),
    addThemeChangeListener: vi.fn(),
    removeThemeChangeListener: vi.fn(),
    reset: vi.fn(),
  }
}));

// Mock ReactiveQueryController to prevent hanging
vi.mock('../../controllers/reactive-query-controller', () => ({
  ReactiveQueryController: vi.fn().mockImplementation((host, options) => ({
    hostConnected: vi.fn(),
    hostDisconnected: vi.fn(),
    value: null,
    loading: false,
    hasError: false,
    errorMessage: '',
    render: vi.fn((callbacks) => {
      if (callbacks.complete) return callbacks.complete(null);
      return undefined;
    }),
    setEnabled: vi.fn(),
    updateQuery: vi.fn(),
  }))
}));

// Mock browser APIs
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/reader',
    hash: '',
    search: '?id=1'
  },
  writable: true
});

Object.defineProperty(window, 'history', {
  value: {
    pushState: vi.fn(),
    replaceState: vi.fn()
  },
  writable: true
});

const mockBookmark = {
  id: 1,
  url: 'https://example.com/long-article',
  title: 'Very Long Article',
  description: 'This is a very long article that will definitely overflow',
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
  content: '<div style="height: 2000px;"><h1>Very Long Article</h1><p>This is a very long article that will definitely overflow the viewport and require scrolling.</p>' + 
           '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100) + '</p></div>',
  readability_content: '<div style="height: 2000px;"><h1>Very Long Article</h1><p>This is a very long article that will definitely overflow the viewport and require scrolling.</p>' + 
                       '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100) + '</p></div>',
};

describe('Reader View Scrollbar Integration', () => {
  let container: HTMLElement;
  let mockSettings: AppSettings;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
    
    // Mock settings data
    mockSettings = {
      linkding_url: 'https://example.com',
      linkding_token: 'test-token',
      sync_interval: 60,
      auto_sync: true,
      reading_mode: 'readability',
      theme_mode: 'light'
    };

    // Ensure custom elements are defined
    if (!customElements.get('app-root')) {
      customElements.define('app-root', AppRoot);
    }
    if (!customElements.get('bookmark-reader')) {
      customElements.define('bookmark-reader', BookmarkReader);
    }
    
    // Mock service responses
    vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.createSettingsQuery).mockReturnValue(() => Promise.resolve(mockSettings));
    vi.mocked(DatabaseService.createBookmarkQuery).mockReturnValue(() => Promise.resolve(null));
    vi.mocked(ThemeService.init).mockImplementation(() => {});
    vi.mocked(ThemeService.setThemeFromSettings).mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('app-root scrollbar behavior in reader view', () => {
    it('should not have scrollbars on the main app when in reader view', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await appRoot.updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      // Set reader view
      (appRoot as any).currentView = 'reader';
      (appRoot as any).selectedBookmarkId = 1;
      await appRoot.updateComplete;

      // Check that the main app layout constraints are correct
      const appContainer = appRoot.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = appRoot.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (appRoot.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      // Main app should be constrained to viewport height
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
      expect(cssText).toContain('flex: 1');
    });

    it('should maintain viewport constraints when reader content is loaded', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await appRoot.updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      // Set reader view
      (appRoot as any).currentView = 'reader';
      (appRoot as any).selectedBookmarkId = 1;
      await appRoot.updateComplete;

      // Wait for bookmark reader to be rendered
      await waitFor(() => {
        const bookmarkReader = appRoot.shadowRoot?.querySelector('bookmark-reader');
        expect(bookmarkReader).toBeTruthy();
      });

      const bookmarkReader = appRoot.shadowRoot?.querySelector('bookmark-reader') as BookmarkReader;
      await bookmarkReader.updateComplete;

      // Wait for bookmark content to load
      await waitFor(() => {
        expect((bookmarkReader as any).isLoading).toBe(false);
      });

      // Even with content loaded, main app should remain constrained
      const appContainer = appRoot.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = appRoot.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (appRoot.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      // Main app should be constrained to viewport height
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });
  });

  describe('bookmark-reader scrollbar behavior', () => {
    it('should allow scrolling within the bookmark reader content area', async () => {
      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);

      await bookmarkReader.updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkReader as any).isLoading).toBe(false);
      });

      // Check the component's styles object instead of computed styles
      const styles = (bookmarkReader.constructor as typeof BookmarkReader).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      // Reader content should have overflow-y: auto for scrolling
      expect(cssText).toContain('.reader-content');
      expect(cssText).toContain('overflow-y: auto');
      expect(cssText).toContain('flex: 1');
    });

    it('should handle long content without breaking layout', async () => {
      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);

      await bookmarkReader.updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkReader as any).isLoading).toBe(false);
      });

      // Check the component's styles object instead of computed styles
      const styles = (bookmarkReader.constructor as typeof BookmarkReader).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      // Reader should be constrained to viewport height with internal scrolling
      expect(cssText).toContain(':host');
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('.reader-container');
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('.reader-content');
      expect(cssText).toContain('overflow-y: auto');
      expect(cssText).toContain('flex: 1');
    });
  });

  describe('integration between app-root and bookmark-reader', () => {
    it('should have proper scrolling isolation between app and reader', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await appRoot.updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      // Set reader view
      (appRoot as any).currentView = 'reader';
      (appRoot as any).selectedBookmarkId = 1;
      await appRoot.updateComplete;

      // Wait for bookmark reader to be rendered
      await waitFor(() => {
        const bookmarkReader = appRoot.shadowRoot?.querySelector('bookmark-reader');
        expect(bookmarkReader).toBeTruthy();
      });

      const bookmarkReader = appRoot.shadowRoot?.querySelector('bookmark-reader') as BookmarkReader;
      await bookmarkReader.updateComplete;

      // Wait for bookmark content to load
      await waitFor(() => {
        expect((bookmarkReader as any).isLoading).toBe(false);
      });

      // Check scrolling isolation
      const appContainer = appRoot.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = appRoot.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (appRoot.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      // App should be constrained
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');

      // Reader component should exist
      expect(bookmarkReader).toBeTruthy();
    });

    it('should prevent double scrollbars when switching between modes', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await appRoot.updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      // Test multiple view transitions
      const views = ['bookmarks', 'reader', 'settings', 'bookmarks'];
      
      for (const view of views) {
        (appRoot as any).currentView = view;
        if (view === 'reader') {
          (appRoot as any).selectedBookmarkId = 1;
        }
        await appRoot.updateComplete;

        // Main app should always be constrained
        const appContainer = appRoot.shadowRoot?.querySelector('.app-container') as HTMLElement;
        const appContent = appRoot.shadowRoot?.querySelector('.app-content') as HTMLElement;
        
        expect(appContainer).toBeTruthy();
        expect(appContent).toBeTruthy();

        // Get the component's styles object
        const styles = (appRoot.constructor as typeof AppRoot).styles;
        const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

        expect(cssText).toContain('height: 100vh');
        expect(cssText).toContain('overflow: hidden');
      }
    });
  });

  describe('edge cases and error conditions', () => {
    it('should maintain layout constraints when bookmark fails to load', async () => {
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);

      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await appRoot.updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      // Set reader view with invalid bookmark
      (appRoot as any).currentView = 'reader';
      (appRoot as any).selectedBookmarkId = 999;
      await appRoot.updateComplete;

      // Should still maintain layout constraints
      const appContainer = appRoot.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = appRoot.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (appRoot.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });

    it('should handle very short content without layout issues', async () => {
      const shortBookmark = {
        ...mockBookmark,
        content: '<h1>Short Article</h1><p>This is short.</p>',
        readability_content: '<h1>Short Article</h1><p>This is short.</p>',
      };

      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(shortBookmark);

      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await appRoot.updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      // Set reader view
      (appRoot as any).currentView = 'reader';
      (appRoot as any).selectedBookmarkId = 1;
      await appRoot.updateComplete;

      // Should still maintain layout constraints even with short content
      const appContainer = appRoot.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = appRoot.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (appRoot.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });
  });
});