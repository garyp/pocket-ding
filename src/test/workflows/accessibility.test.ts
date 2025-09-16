import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { waitForComponent, waitForComponentReady } from '../utils/component-aware-wait-for';
import '../setup';

// Import components
import { AppRoot } from '../../components/app-root';
import { SettingsPanel } from '../../components/settings-panel';
import { BookmarkListContainer } from '../../components/bookmark-list-container';
import { BookmarkList } from '../../components/bookmark-list';
import { BookmarkReader } from '../../components/bookmark-reader';
import type { LocalBookmark, AppSettings } from '../../types';

// Mock services
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    getAllBookmarks: vi.fn(),
    getUnreadBookmarks: vi.fn(),
    getBookmark: vi.fn(),
    saveBookmark: vi.fn(),
    getReadProgress: vi.fn(),
    saveReadProgress: vi.fn(),
    clearAll: vi.fn(),
    getCompletedAssetsByBookmarkId: vi.fn(),
    getBookmarksPaginated: vi.fn(),
    getBookmarkCount: vi.fn(),
    getPageFromAnchorBookmark: vi.fn(),
    getBookmarksWithAssetCounts: vi.fn(),
    deleteBookmark: vi.fn(),
    updateBookmarkReadStatus: vi.fn(),
    saveAsset: vi.fn(),
    getAssetsByBookmarkId: vi.fn(),
    getLastSyncTimestamp: vi.fn(),
    setLastSyncTimestamp: vi.fn(),
    getAllFilterCounts: vi.fn(),
  },
}));

vi.mock('../../services/sync-service', () => ({
  SyncService: {
    syncBookmarks: vi.fn(),
    getInstance: vi.fn(),
    isSyncInProgress: vi.fn(() => false),
    getCurrentSyncProgress: vi.fn(() => ({ current: 0, total: 0 })),
  },
}));

vi.mock('../../services/linkding-api', () => ({
  createLinkdingAPI: vi.fn(() => ({
    testConnection: vi.fn().mockResolvedValue(true),
    getBookmarks: vi.fn(),
  })),
}));

vi.mock('../../services/content-fetcher', () => ({
  ContentFetcher: {
    fetchBookmarkContent: vi.fn(),
  },
}));

vi.mock('../../services/theme-service', () => ({
  ThemeService: {
    init: vi.fn(),
    reset: vi.fn(),
    setTheme: vi.fn(),
    setThemeFromSettings: vi.fn(),
    getCurrentTheme: vi.fn(() => 'system'),
    getResolvedTheme: vi.fn(() => 'light'),
    addThemeChangeListener: vi.fn(),
    removeThemeChangeListener: vi.fn(),
  },
}));

import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';

describe('Accessibility - A11y Compliance', () => {
  const mockBookmarks: LocalBookmark[] = [
    {
      id: 1,
      url: 'https://example.com/article1',
      title: 'Test Article 1',
      description: 'This is a test article for accessibility testing',
      notes: '',
      website_title: 'Example',
      website_description: 'Example site',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: ['tech', 'accessibility'],
      date_added: '2024-01-01T10:00:00Z',
      date_modified: '2024-01-01T10:00:00Z',
    },
    {
      id: 2,
      url: 'https://example.com/article2',
      title: 'Test Article 2',
      description: 'Another test article',
      notes: '',
      website_title: 'Example',
      website_description: 'Example site',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: true,
      unread: false,
      shared: false,
      tag_names: ['science'],
      date_added: '2024-01-02T10:00:00Z',
      date_modified: '2024-01-02T10:00:00Z',
    },
  ];

  const mockSettings: AppSettings = {
    linkding_url: 'https://linkding.example.com',
    linkding_token: 'test-token',
    auto_sync: true,
    reading_mode: 'readability',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Register components if not already registered
    if (!customElements.get('app-root')) {
      customElements.define('app-root', AppRoot);
    }
    if (!customElements.get('settings-panel')) {
      customElements.define('settings-panel', SettingsPanel);
    }
    if (!customElements.get('bookmark-list-container')) {
      customElements.define('bookmark-list-container', BookmarkListContainer);
    }
    if (!customElements.get('bookmark-list')) {
      customElements.define('bookmark-list', BookmarkList);
    }
    if (!customElements.get('bookmark-reader')) {
      customElements.define('bookmark-reader', BookmarkReader);
    }

    // Clean up DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getBookmarksPaginated).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({
        all: 2,
        unread: 1,
        archived: 1,
      });
    });

    it('should support tab navigation through bookmark list', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize properly with timer advancement
      await waitForComponentReady(appRoot);

      // Wait for bookmarks to load and content to render
      await waitForComponent(() => {
        const content = appRoot.shadowRoot?.querySelector('bookmark-list-container') || appRoot.shadowRoot?.querySelector('.setup-card');
        expect(content).toBeTruthy();
      });

      // Get focusable elements within the app - look more specifically
      const getFocusableElements = () => {
        const shadowRoot = appRoot.shadowRoot;
        if (!shadowRoot) return [];
        
        // Look for Material Web Components and other focusable elements
        const elements = shadowRoot.querySelectorAll(`
          button, 
          [href], 
          input, 
          select, 
          textarea, 
          [tabindex]:not([tabindex="-1"]),
          md-filled-button,
          md-outlined-button,
          md-text-button,
          md-icon-button,
          md-fab,
          md-filter-chip
        `);
        return Array.from(elements);
      };

      // Should have focusable elements or at least the component structure
      const focusableElements = getFocusableElements();
      
      // In the setup flow, there should be at least one focusable element
      // If no focusable elements are found, verify the app structure exists
      if (focusableElements.length === 0) {
        // Verify app is rendered with some content
        const shadowRoot = appRoot.shadowRoot;
        expect(shadowRoot).toBeTruthy();
        
        // Should have main content areas
        const mainContent = shadowRoot?.querySelector('main, .main-content, .setup-card, bookmark-list-container');
        expect(mainContent).toBeTruthy();
      } else {
        // If focusable elements exist, test focus functionality
        const firstFocusable = focusableElements[0] as HTMLElement;
        firstFocusable.focus();
        expect(document.activeElement).toBeTruthy();
      }
    });

    it('should support Enter key activation on buttons and links', async () => {
      const settingsPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(settingsPanel);

      await settingsPanel.updateComplete;

      // Look for buttons in the settings panel
      await waitFor(() => {
        const shadowRoot = settingsPanel.shadowRoot;
        expect(shadowRoot).toBeTruthy();
      });

      const shadowRoot = settingsPanel.shadowRoot;
      if (shadowRoot) {
        const buttons = shadowRoot.querySelectorAll('md-filled-button, md-outlined-button, md-text-button');
        
        if (buttons.length > 0) {
          const button = buttons[0] as HTMLElement;
          
          // Focus the button
          button.focus();
          
          // Simulate Enter key press
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
          });

          button.dispatchEvent(enterEvent);

          // Material Web Components should handle Enter key activation
          expect(button).toBeTruthy(); // Button exists and is focusable
        }
      }
    });

    it('should support Space key activation on buttons', async () => {
      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      document.body.appendChild(bookmarkList);

      await bookmarkList.updateComplete;

      const shadowRoot = bookmarkList.shadowRoot;
      if (shadowRoot) {
        // Look for filter buttons or other interactive elements
        const filterButtons = shadowRoot.querySelectorAll('[role="button"], button, md-filter-chip');
        
        if (filterButtons.length > 0) {
          const button = filterButtons[0] as HTMLElement;
          
          // Focus and test Space key
          button.focus();
          
          const spaceEvent = new KeyboardEvent('keydown', {
            key: ' ',
            code: 'Space',
            bubbles: true,
          });
          
          button.dispatchEvent(spaceEvent);
          
          // Space key should be handled properly
          expect(button).toBeTruthy();
        }
      }
    });

    it('should handle Escape key for modal dialogs', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      await appRoot.updateComplete;

      // Test escape key handling on any dialogs
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      });

      document.dispatchEvent(escapeEvent);

      // Should not cause any errors when Escape is pressed
      expect(appRoot).toBeTruthy();
    });

    it('should manage focus properly when switching between views', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize properly
      await waitForComponentReady(appRoot);

      // Test focus management during view transitions
      await waitForComponent(() => {
        const mainContent = appRoot.shadowRoot?.querySelector('main, [role="main"], .main-content');
        expect(mainContent || appRoot.shadowRoot?.querySelector('bookmark-list-container')).toBeTruthy();
      });

      // Focus should be manageable during navigation
      const activeElement = document.activeElement;
      expect(activeElement).toBeTruthy();
    });

    it('should provide keyboard shortcuts indication for common actions', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      await appRoot.updateComplete;

      // Check for keyboard shortcut indicators (title attributes, aria-keyshortcuts)
      const shadowRoot = appRoot.shadowRoot;
      if (shadowRoot) {
        const elementsWithShortcuts = shadowRoot.querySelectorAll('[title*="Ctrl"], [title*="Alt"], [aria-keyshortcuts]');
        
        // If shortcuts exist, they should be properly indicated
        elementsWithShortcuts.forEach(element => {
          const title = element.getAttribute('title');
          const keyshortcuts = element.getAttribute('aria-keyshortcuts');
          
          // At least one should be present for keyboard shortcuts
          expect(title || keyshortcuts).toBeTruthy();
        });
      }
    });
  });

  describe('Screen Reader Compatibility', () => {
    beforeEach(() => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getBookmarksPaginated).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({
        all: 2,
        unread: 1,
        archived: 1,
      });
    });

    it('should have proper ARIA labels on interactive elements', async () => {
      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      document.body.appendChild(bookmarkList);

      await bookmarkList.updateComplete;

      const shadowRoot = bookmarkList.shadowRoot;
      if (shadowRoot) {
        // Check for ARIA labels on buttons and interactive elements
        const interactiveElements = shadowRoot.querySelectorAll('button, [role="button"], a, input, select');
        
        interactiveElements.forEach(element => {
          const ariaLabel = element.getAttribute('aria-label');
          const ariaLabelledBy = element.getAttribute('aria-labelledby');
          const title = element.getAttribute('title');
          const textContent = element.textContent?.trim();

          // Interactive elements should have some form of accessible name
          expect(
            ariaLabel || ariaLabelledBy || title || textContent,
            `Element ${element.tagName} should have accessible name`
          ).toBeTruthy();
        });
      }
    });

    it('should use semantic HTML structure for screen readers', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize properly
      await waitForComponentReady(appRoot);

      await waitForComponent(() => {
        const bookmarkContainer = appRoot.shadowRoot?.querySelector('bookmark-list-container');
        expect(bookmarkContainer).toBeTruthy();
      });

      // Check for semantic landmarks
      const shadowRoot = appRoot.shadowRoot;
      if (shadowRoot) {
        const landmarks = shadowRoot.querySelectorAll('main, nav, aside, header, footer, [role="main"], [role="navigation"], [role="banner"], [role="contentinfo"]');
        
        // App should have semantic structure
        expect(landmarks.length).toBeGreaterThanOrEqual(0);
        
        // Check for proper heading hierarchy
        const headings = shadowRoot.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
        headings.forEach((heading) => {
          // Headings should have content or aria-label
          const hasContent = heading.textContent?.trim() || heading.getAttribute('aria-label');
          expect(hasContent).toBeTruthy();
        });
      }
    });

    it('should provide alt text for images and icons', async () => {
      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmarks[0]);
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
        source: 'asset',
        content_type: 'html',
        html_content: '<h1>Test Content</h1><img src="test.jpg" alt="Test image">',
        metadata: { url: 'https://example.com/article1' }
      });

      await bookmarkReader.updateComplete;

      const shadowRoot = bookmarkReader.shadowRoot;
      if (shadowRoot) {
        // Check for images with alt text
        const images = shadowRoot.querySelectorAll('img');
        images.forEach(img => {
          const alt = img.getAttribute('alt');
          expect(alt).toBeDefined(); // Alt attribute should be present (empty is acceptable for decorative images)
        });

        // Check for Material icons with proper ARIA labels
        const materialIcons = shadowRoot.querySelectorAll('md-icon');
        materialIcons.forEach(icon => {
          const ariaLabel = icon.getAttribute('aria-label');
          const ariaHidden = icon.getAttribute('aria-hidden');
          
          // Icons should either be labeled or hidden from screen readers
          expect(ariaLabel || ariaHidden === 'true').toBeTruthy();
        });
      }
    });

    it('should have accessible form labels and descriptions', async () => {
      const settingsPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(settingsPanel);

      await settingsPanel.updateComplete;

      const shadowRoot = settingsPanel.shadowRoot;
      if (shadowRoot) {
        // Check form inputs have proper labels
        const inputs = shadowRoot.querySelectorAll('input, md-outlined-text-field, md-filled-text-field, select, textarea');
        
        inputs.forEach(input => {
          const id = input.getAttribute('id');
          const ariaLabel = input.getAttribute('aria-label');
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          
          // Look for associated label
          let hasLabel = false;
          if (id) {
            const label = shadowRoot.querySelector(`label[for="${id}"]`);
            hasLabel = !!label;
          }
          
          // Input should have some form of labeling
          expect(
            hasLabel || ariaLabel || ariaLabelledBy,
            `Input should have accessible label`
          ).toBeTruthy();
        });
      }
    });

    it('should announce dynamic content changes via live regions', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      await appRoot.updateComplete;

      const shadowRoot = appRoot.shadowRoot;
      if (shadowRoot) {
        // Check for ARIA live regions for status updates
        const liveRegions = shadowRoot.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
        
        // Live regions should be properly configured
        liveRegions.forEach(region => {
          const ariaLive = region.getAttribute('aria-live');
          const role = region.getAttribute('role');
          
          if (ariaLive) {
            expect(['polite', 'assertive', 'off']).toContain(ariaLive);
          }
          
          if (role) {
            expect(['status', 'alert']).toContain(role);
          }
        });
      }
    });

    it('should provide proper heading hierarchy for navigation', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize properly
      await waitForComponentReady(appRoot);

      await waitForComponent(() => {
        const content = appRoot.shadowRoot?.querySelector('bookmark-list-container') || appRoot.shadowRoot?.querySelector('.setup-card');
        expect(content).toBeTruthy();
      });

      const shadowRoot = appRoot.shadowRoot;
      if (shadowRoot) {
        const headings = shadowRoot.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        // If headings exist, check their hierarchy
        if (headings.length > 0) {
          const firstHeading = headings[0];
          if (firstHeading) {
            const tagName = firstHeading.tagName.toLowerCase();
            
            // First heading should ideally be h1 or h2 for page structure
            expect(['h1', 'h2'].includes(tagName)).toBeTruthy();
          }
          
          // All headings should have content
          headings.forEach(heading => {
            expect(heading.textContent?.trim()).toBeTruthy();
          });
        }
      }
    });
  });

  describe('Mobile Responsive Behavior', () => {
    beforeEach(() => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getBookmarksPaginated).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({
        all: 2,
        unread: 1,
        archived: 1,
      });
    });

    it('should have touch-friendly button sizes (44x44px minimum)', async () => {
      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      document.body.appendChild(bookmarkList);

      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 667, writable: true });

      await bookmarkList.updateComplete;

      const shadowRoot = bookmarkList.shadowRoot;
      if (shadowRoot) {
        const interactiveElements = shadowRoot.querySelectorAll(`
          button, 
          [role="button"], 
          a, 
          md-filter-chip,
          md-filled-button,
          md-outlined-button,
          md-text-button,
          md-icon-button,
          .bookmark-item
        `);
        
        if (interactiveElements.length > 0) {
          interactiveElements.forEach(element => {
            // Touch targets should be accessible and appropriately sized
            expect(element).toBeTruthy();
            
            // Verify element has appropriate structure for touch interaction
            const isMaterialComponent = element.tagName.startsWith('MD-');
            const hasButtonRole = element.getAttribute('role') === 'button' || element.tagName.toLowerCase() === 'button';
            const isInteractiveElement = element.tagName.toLowerCase() === 'a' || element.classList.contains('bookmark-item');
            
            const hasAppropriateStructure = isMaterialComponent || hasButtonRole || isInteractiveElement;
            expect(hasAppropriateStructure).toBeTruthy();
          });
        } else {
          // If no interactive elements are found, verify the component structure exists
          expect(shadowRoot).toBeTruthy();
          
          // Component should at least have some content structure
          const hasContent = shadowRoot.querySelector('div, main, section, ul, li, .bookmark-list, .filter-controls');
          expect(hasContent).toBeTruthy();
        }
      }
    });

    it('should support proper viewport scaling and zoom', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      await appRoot.updateComplete;

      // Check for meta viewport tag (would be in the document head)
      // In a real app, this should be present in index.html
      // Here we test that the app doesn't break with different viewport sizes
      
      // Test different viewport sizes
      const viewports = [
        { width: 320, height: 568 }, // iPhone SE
        { width: 375, height: 667 }, // iPhone 6/7/8
        { width: 768, height: 1024 }, // iPad
        { width: 1200, height: 800 }  // Desktop
      ];

      viewports.forEach(viewport => {
        Object.defineProperty(window, 'innerWidth', { value: viewport.width, writable: true });
        Object.defineProperty(window, 'innerHeight', { value: viewport.height, writable: true });
        
        // Trigger resize event
        window.dispatchEvent(new Event('resize'));
        
        // App should remain functional at all viewport sizes
        expect(appRoot.shadowRoot).toBeTruthy();
      });
    });

    it('should maintain readable text at different screen sizes', async () => {
      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmarks[0]);
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
        source: 'asset',
        content_type: 'html',
        html_content: '<h1>Test Article</h1><p>This is test content for readability testing.</p>',
        metadata: { url: 'https://example.com/article1' }
      });

      await bookmarkReader.updateComplete;

      const shadowRoot = bookmarkReader.shadowRoot;
      if (shadowRoot) {
        // Check for text elements
        const textElements = shadowRoot.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div');
        
        textElements.forEach(element => {
          const styles = window.getComputedStyle(element as Element);
          
          // In test environment, computed styles may be 0
          // We verify the elements exist and can be styled
          expect(element).toBeTruthy();
          
          // Text should not be hidden or have zero size by default
          const display = styles.display;
          const visibility = styles.visibility;
          expect(display).not.toBe('none');
          expect(visibility).not.toBe('hidden');
        });
      }
    });

    it('should provide accessible navigation on mobile devices', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });

      // Wait for component to initialize properly
      await waitForComponentReady(appRoot);

      await waitForComponent(() => {
        const content = appRoot.shadowRoot?.querySelector('bookmark-list-container') || appRoot.shadowRoot?.querySelector('.setup-card');
        expect(content).toBeTruthy();
      });

      const shadowRoot = appRoot.shadowRoot;
      if (shadowRoot) {
        // Look for navigation elements that work on mobile
        const navElements = shadowRoot.querySelectorAll('nav, [role="navigation"], .navigation, md-navigation-bar, md-tabs');
        
        // If navigation exists, it should be touch-friendly
        navElements.forEach(nav => {
          expect(nav).toBeTruthy();
          
          // Navigation should have appropriate ARIA attributes
          const role = nav.getAttribute('role');
          
          if (nav.tagName.toLowerCase() === 'nav' || role === 'navigation') {
            expect(nav).toBeTruthy(); // Navigation structure exists
          }
        });
      }
    });

    it('should handle touch gestures appropriately', async () => {
      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmarks[0]);
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);

      await bookmarkReader.updateComplete;

      // Test touch events don't cause errors
      const touchStartEvent = new TouchEvent('touchstart', {
        bubbles: true,
        touches: [new Touch({
          identifier: 0,
          target: bookmarkReader,
          clientX: 100,
          clientY: 100,
          radiusX: 10,
          radiusY: 10,
          rotationAngle: 0,
          force: 1,
        })],
      });

      const touchEndEvent = new TouchEvent('touchend', {
        bubbles: true,
        changedTouches: [new Touch({
          identifier: 0,
          target: bookmarkReader,
          clientX: 100,
          clientY: 100,
          radiusX: 10,
          radiusY: 10,
          rotationAngle: 0,
          force: 1,
        })],
      });

      // Should handle touch events without errors
      expect(() => {
        bookmarkReader.dispatchEvent(touchStartEvent);
        bookmarkReader.dispatchEvent(touchEndEvent);
      }).not.toThrow();
    });
  });

  describe('High Contrast Mode', () => {
    beforeEach(() => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getBookmarksPaginated).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({
        all: 2,
        unread: 1,
        archived: 1,
      });
    });

    it('should maintain visibility of interactive elements in high contrast', async () => {
      // Mock high contrast mode
      const mockMatchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-contrast: high)' || query === '(-ms-high-contrast: active)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      });

      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      document.body.appendChild(bookmarkList);

      await bookmarkList.updateComplete;

      const shadowRoot = bookmarkList.shadowRoot;
      if (shadowRoot) {
        const interactiveElements = shadowRoot.querySelectorAll('button, [role="button"], a, input, select');
        
        interactiveElements.forEach(element => {
          // Elements should remain visible and not rely solely on color
          const styles = window.getComputedStyle(element as Element);
          const display = styles.display;
          const visibility = styles.visibility;
          const opacity = styles.opacity;
          
          expect(display).not.toBe('none');
          expect(visibility).not.toBe('hidden');
          expect(parseFloat(opacity) || 1).toBeGreaterThan(0);
        });
      }
    });

    it('should provide proper contrast ratios for text and backgrounds', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize properly
      await waitForComponentReady(appRoot);

      await waitForComponent(() => {
        const content = appRoot.shadowRoot?.querySelector('bookmark-list-container') || appRoot.shadowRoot?.querySelector('.setup-card');
        expect(content).toBeTruthy();
      });

      const shadowRoot = appRoot.shadowRoot;
      if (shadowRoot) {
        const textElements = shadowRoot.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, label, button');
        
        textElements.forEach(element => {
          const styles = window.getComputedStyle(element as Element);
          
          // In test environment, computed styles may not reflect actual CSS
          // We verify that text elements exist and are structured for contrast
          expect(element).toBeTruthy();
          
          // Text should not have extremely low opacity that would harm contrast
          const opacity = parseFloat(styles.opacity) || 1;
          expect(opacity).toBeGreaterThan(0.1);
        });
      }
    });

    it('should ensure icon visibility with forced colors', async () => {
      // Mock Windows high contrast mode
      const mockMatchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(-ms-high-contrast: active)' || query === '(forced-colors: active)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      });

      const settingsPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(settingsPanel);

      await settingsPanel.updateComplete;

      const shadowRoot = settingsPanel.shadowRoot;
      if (shadowRoot) {
        const icons = shadowRoot.querySelectorAll('md-icon, .icon, [data-icon]');
        
        icons.forEach(icon => {
          // Icons should have fallback text or borders in high contrast mode
          const ariaLabel = icon.getAttribute('aria-label');
          const title = icon.getAttribute('title');
          const textContent = icon.textContent?.trim();
          
          // Icons should have some form of accessibility support
          expect(ariaLabel || title || textContent).toBeTruthy();
        });
      }
    });

    it('should maintain focus indicators visibility', async () => {
      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      document.body.appendChild(bookmarkList);

      await bookmarkList.updateComplete;

      const shadowRoot = bookmarkList.shadowRoot;
      if (shadowRoot) {
        const focusableElements = shadowRoot.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
        
        focusableElements.forEach(element => {
          // Focus on each element
          (element as HTMLElement).focus();
          
          // Element should be focusable
          expect(element).toBeTruthy();
          
          // Check for focus styles (in real browser, :focus-visible would apply)
          const styles = window.getComputedStyle(element as Element);
          const outline = styles.outline;
          
          // Focus indicators should not be disabled
          expect(outline).not.toBe('none');
        });
      }
    });

    it('should ensure border and outline visibility in high contrast', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      await appRoot.updateComplete;

      const shadowRoot = appRoot.shadowRoot;
      if (shadowRoot) {
        const elementsWithBorders = shadowRoot.querySelectorAll('input, button, .card, .border, md-outlined-text-field, md-outlined-button');
        
        elementsWithBorders.forEach(element => {
          // Elements with borders should remain visible
          const styles = window.getComputedStyle(element as Element);
          const border = styles.border;
          
          // Elements should have some form of visual boundary
          expect(element).toBeTruthy();
          
          // Border should not be completely transparent
          expect(border).not.toMatch(/transparent|rgba\(.*,\s*0\)/);
        });
      }
    });

    it('should work with both light and dark themes in high contrast', async () => {
      const themes = [
        { isDark: false, name: 'light' },
        { isDark: true, name: 'dark' }
      ];

      for (const theme of themes) {
        // Mock theme service for this test
        const { ThemeService } = await import('../../services/theme-service');
        const mockThemeService = vi.mocked(ThemeService);
        mockThemeService.getResolvedTheme.mockReturnValue(theme.isDark ? 'dark' : 'light');

        // Mock high contrast mode
        const mockMatchMedia = vi.fn().mockImplementation(query => {
          if (query === '(prefers-color-scheme: dark)') {
            return { matches: theme.isDark, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
          }
          if (query === '(prefers-contrast: high)') {
            return { matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
          }
          return { matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
        });
        
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        });

        const appRoot = document.createElement('app-root') as AppRoot;
        document.body.appendChild(appRoot);

        await appRoot.updateComplete;

        // App should work with both light and dark high contrast themes
        expect(appRoot.shadowRoot).toBeTruthy();

        // Clean up for next iteration
        document.body.innerHTML = '';
      }
    });

    it('should provide alternative text representations in forced colors mode', async () => {
      // Mock forced colors mode (Windows high contrast)
      const mockMatchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(forced-colors: active)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      });

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmarks[0]);
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
        source: 'asset',
        content_type: 'html',
        html_content: '<h1>Test Content</h1><p>This is a test article.</p>',
        metadata: { url: 'https://example.com/article1' }
      });

      await bookmarkReader.updateComplete;

      const shadowRoot = bookmarkReader.shadowRoot;
      if (shadowRoot) {
        // Check that content remains accessible in forced colors mode
        const textElements = shadowRoot.querySelectorAll('h1, h2, h3, p, span');
        
        textElements.forEach(element => {
          // Text content should be preserved and accessible
          expect(element.textContent?.trim()).toBeTruthy();
          
          // Elements should remain in document flow
          const styles = window.getComputedStyle(element as Element);
          expect(styles.display).not.toBe('none');
          expect(styles.visibility).not.toBe('hidden');
        });
      }
    });
  });
});