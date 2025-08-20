import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BookmarkReader } from '../../components/bookmark-reader';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';
import { ThemeService } from '../../services/theme-service';
import type { LocalBookmark, ReadProgress } from '../../types';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/content-fetcher');
vi.mock('../../services/theme-service');

describe('BookmarkReader Dark Mode Fix', () => {
  let element: BookmarkReader;
  let mockBookmark: LocalBookmark;
  let mockProgress: ReadProgress;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock bookmark data
    mockBookmark = {
      id: 1,
      url: 'https://example.com/article',
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
      progress: 0,
      last_read_at: '2024-01-01T00:00:00Z',
      reading_mode: 'readability',
      scroll_position: 0,
      dark_mode_override: null,
    };

    // Mock service responses
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(mockProgress);
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue();
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue();
    vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue([
      { type: 'asset', label: 'Cached Content', assetId: 1 }
    ]);
    vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
      content: '<div><h1>Test</h1><p>Content</p></div>',
      readability_content: '<div><h1>Test</h1><p>Readability content</p></div>',
      source: 'asset'
    });

    // Mock ThemeService - simulate light mode system
    vi.mocked(ThemeService.addThemeChangeListener).mockImplementation((listener) => {
      listener('light'); // System is in light mode
    });
    vi.mocked(ThemeService.removeThemeChangeListener).mockImplementation(() => {});

    // Create element and add to DOM
    element = new BookmarkReader();
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  it('should properly attach custom event listeners to Material Web Components', async () => {
    // Load bookmark
    element.bookmarkId = 1;
    await element.updateComplete;
    
    // Wait for async bookmark loading
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    // Verify dark mode button exists
    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');
    expect(darkModeButton).toBeTruthy();

    // Verify custom event binding marker is set
    expect((darkModeButton as any).__customListenersAttached).toBe(true);

    // Test that custom event listener works
    const initialDarkMode = element.classList.contains('reader-dark-mode');
    expect(initialDarkMode).toBe(false);

    // Trigger custom click event
    if (darkModeButton) {
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      darkModeButton.dispatchEvent(clickEvent);
      
      await element.updateComplete;
      
      const finalDarkMode = element.classList.contains('reader-dark-mode');
      expect(finalDarkMode).toBe(true);
    }
  });

  it('should not duplicate event listeners on multiple renders', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');
    expect(darkModeButton).toBeTruthy();

    // Force multiple updates to ensure no duplicate listeners
    element.requestUpdate();
    await element.updateComplete;
    
    element.requestUpdate();
    await element.updateComplete;

    // Custom binding marker should still be true (not duplicated)
    expect((darkModeButton as any).__customListenersAttached).toBe(true);

    // Functionality should still work
    if (darkModeButton) {
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      darkModeButton.dispatchEvent(clickEvent);
      
      await element.updateComplete;
      
      const darkMode = element.classList.contains('reader-dark-mode');
      expect(darkMode).toBe(true);
    }
  });

  it('should work even if Lit event binding fails', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');
    expect(darkModeButton).toBeTruthy();

    // Simulate the scenario where the original @click binding doesn't work
    // by directly testing our custom event handler
    if (darkModeButton) {
      // Remove the original Lit event listener (simulate it not working)
      const originalOnClick = (darkModeButton as any).onclick;
      (darkModeButton as any).onclick = null;
      
      // Our custom listener should still work
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      darkModeButton.dispatchEvent(clickEvent);
      
      await element.updateComplete;
      
      const darkMode = element.classList.contains('reader-dark-mode');
      expect(darkMode).toBe(true);
      
      // Restore original onclick (cleanup)
      (darkModeButton as any).onclick = originalOnClick;
    }
  });

  it('should handle all toolbar buttons with custom event binding', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    // Check that all buttons get custom event binding
    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');
    const processingButton = element.shadowRoot?.querySelector('.processing-mode-button');
    const openButton = element.shadowRoot?.querySelector('md-icon-button[title="Open original website"]');

    expect(darkModeButton).toBeTruthy();
    expect(processingButton).toBeTruthy();
    expect(openButton).toBeTruthy();

    // All buttons should have custom listeners attached
    expect((darkModeButton as any).__customListenersAttached).toBe(true);
    expect((processingButton as any).__customListenersAttached).toBe(true);
    expect((openButton as any).__customListenersAttached).toBe(true);
  });

  it('should work with info button in original mode', async () => {
    // Set up bookmark to load in original mode
    mockProgress.reading_mode = 'original';
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(mockProgress);
    
    element.bookmarkId = 1;
    await element.updateComplete;
    
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    // In original mode, we should see info button instead of dark mode button
    const infoButton = element.shadowRoot?.querySelector('md-icon-button[title="Show bookmark info"]');
    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');

    expect(infoButton).toBeTruthy();
    expect(darkModeButton).toBeFalsy(); // Should not be present in original mode

    expect((infoButton as any).__customListenersAttached).toBe(true);
  });
});