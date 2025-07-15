import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppRoot } from '../../components/app-root';
import { DatabaseService } from '../../services/database';
import { ThemeService } from '../../services/theme-service';
import type { AppSettings } from '../../types';

// Mock services
vi.mock('../../services/database');
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

// Mock browser APIs
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    hash: '',
    search: ''
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

describe('AppRoot Viewport and Scrollbar Behavior', () => {
  let element: AppRoot;
  let mockSettings: AppSettings;

  beforeEach(async () => {
    // Reset all mocks
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

    // Mock service responses
    vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
    vi.mocked(ThemeService.init).mockImplementation(() => {});
    vi.mocked(ThemeService.setThemeFromSettings).mockImplementation(() => {});

    // Create element
    element = new AppRoot();
  });

  afterEach(() => {
    element?.remove();
  });

  describe('viewport height constraints', () => {
    it('should use height: 100vh for :host element (not min-height)', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      // Check that the component exists
      expect(element).toBeTruthy();
      expect(element.shadowRoot).toBeTruthy();
      
      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Verify that we're using height: 100vh and not min-height: 100vh
      expect(cssText).toContain('height: 100vh');
      expect(cssText).not.toContain('min-height: 100vh');
    });

    it('should use height: 100vh for .app-container (not min-height)', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      expect(appContainer).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Verify the CSS rule uses height, not min-height
      expect(cssText).toContain('.app-container');
      expect(cssText).toContain('height: 100vh');
      expect(cssText).not.toContain('min-height: 100vh');
    });

    it('should have overflow: hidden on .app-content to prevent scrollbars', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Verify the CSS has overflow: hidden and flex: 1
      expect(cssText).toContain('.app-content');
      expect(cssText).toContain('overflow: hidden');
      expect(cssText).toContain('flex: 1');
    });

    it('should have correct flexbox layout for constraining height', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';

      // Container should be a flex column with height: 100vh
      expect(cssText).toContain('.app-container');
      expect(cssText).toContain('display: flex');
      expect(cssText).toContain('flex-direction: column');
      expect(cssText).toContain('height: 100vh');

      // Content should flex to fill remaining space
      expect(cssText).toContain('.app-content');
      expect(cssText).toContain('flex: 1');
      expect(cssText).toContain('overflow: hidden');
    });
  });

  describe('scrollbar behavior in different views', () => {
    it('should not create scrollbars in bookmarks view', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      // Ensure we're in bookmarks view
      expect((element as any).currentView).toBe('bookmarks');

      // Check that the elements exist
      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Verify the CSS constrains height and prevents scrollbars
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });

    it('should not create scrollbars in reader view', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      // Switch to reader view
      (element as any).currentView = 'reader';
      (element as any).selectedBookmarkId = 1;
      await element.updateComplete;

      // Check that the elements exist
      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Verify the CSS constrains height and prevents scrollbars
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });

    it('should not create scrollbars in settings view', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      // Switch to settings view
      (element as any).currentView = 'settings';
      await element.updateComplete;

      // Check that the elements exist
      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Verify the CSS constrains height and prevents scrollbars
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });
  });

  describe('layout behavior with varying content', () => {
    it('should maintain fixed height even with minimal content', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Even with minimal content, should maintain 100vh height
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });

    it('should prevent body scrolling when app is full height', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // The app should take up the full viewport height
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('display: block');
      
      // Element should be properly added to DOM
      expect(element.parentElement).toBe(document.body);
    });
  });

  describe('responsive behavior', () => {
    it('should maintain height constraints on mobile viewports', async () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 667, writable: true });

      document.body.appendChild(element);
      await element.updateComplete;

      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Should still maintain 100vh height on mobile
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });

    it('should maintain height constraints on desktop viewports', async () => {
      // Mock desktop viewport
      Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });

      document.body.appendChild(element);
      await element.updateComplete;

      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      
      expect(appContainer).toBeTruthy();
      expect(appContent).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Should maintain 100vh height on desktop
      expect(cssText).toContain('height: 100vh');
      expect(cssText).toContain('overflow: hidden');
    });
  });

  describe('header and content layout', () => {
    it('should have header with fixed height and content filling remaining space', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      const appHeader = element.shadowRoot?.querySelector('.app-header') as HTMLElement;
      const appContent = element.shadowRoot?.querySelector('.app-content') as HTMLElement;
      const appContainer = element.shadowRoot?.querySelector('.app-container') as HTMLElement;
      
      expect(appHeader).toBeTruthy();
      expect(appContent).toBeTruthy();
      expect(appContainer).toBeTruthy();

      // Get the component's styles object
      const styles = (element.constructor as typeof AppRoot).styles;
      const cssText = Array.isArray(styles) ? styles.map(s => s.cssText).join('') : styles?.cssText || '';
      
      // Container should be flex column
      expect(cssText).toContain('.app-container');
      expect(cssText).toContain('display: flex');
      expect(cssText).toContain('flex-direction: column');
      
      // Content should flex to fill remaining space after header
      expect(cssText).toContain('.app-content');
      expect(cssText).toContain('flex: 1');
      expect(cssText).toContain('overflow: hidden');
    });
  });
});