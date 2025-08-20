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

describe('BookmarkReader Dark Mode Bug Detection', () => {
  let element: BookmarkReader;
  let mockBookmark: LocalBookmark;
  let mockProgress: ReadProgress;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock bookmark data that matches what users would typically see
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
      reading_mode: 'readability', // This is what would normally be set
    };

    mockProgress = {
      bookmark_id: 1,
      progress: 0,
      last_read_at: '2024-01-01T00:00:00Z',
      reading_mode: 'readability', // User is in readability mode
      scroll_position: 0,
      dark_mode_override: null, // No override set initially
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
      content: '<div><h1>Test Article</h1><p>Content here</p></div>',
      readability_content: '<div><h1>Test Article</h1><p>Readability processed content</p></div>',
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

  it('should detect if dark mode toggle is not visible when it should be', async () => {
    // Load bookmark just like a user would
    element.bookmarkId = 1;
    await element.updateComplete;
    
    // Wait for async bookmark loading
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    // Verify we're in readability mode (prerequisite for dark mode toggle)
    expect(element['readingMode']).toBe('readability');
    
    // Check if dark mode toggle button is rendered
    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');
    
    console.log('Reading mode:', element['readingMode']);
    console.log('System theme:', element['systemTheme']);
    console.log('Dark mode override:', element['darkModeOverride']);
    console.log('Dark mode button found:', !!darkModeButton);
    console.log('Button HTML:', darkModeButton?.outerHTML || 'not found');
    
    // The button should exist in readability mode
    expect(darkModeButton).toBeTruthy();
    
    // Take note of the current dark mode class state
    const initialDarkMode = element.classList.contains('reader-dark-mode');
    console.log('Initial dark mode class:', initialDarkMode);
    expect(initialDarkMode).toBe(false); // Should start in light mode
    
    // Now simulate clicking the dark mode button
    if (darkModeButton) {
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      darkModeButton.dispatchEvent(clickEvent);
      
      // Wait for any async operations
      await element.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Check if the dark mode was actually applied
      const finalDarkMode = element.classList.contains('reader-dark-mode');
      console.log('Final dark mode class after click:', finalDarkMode);
      
      // This should be true if the toggle worked
      if (!finalDarkMode) {
        console.error('DARK MODE BUG DETECTED: Button click did not toggle dark mode');
        console.error('Dark mode override after click:', element['darkModeOverride']);
        
        // Try to debug what's going wrong
        console.log('Full element state after click:');
        console.log('- readingMode:', element['readingMode']);
        console.log('- systemTheme:', element['systemTheme']);
        console.log('- darkModeOverride:', element['darkModeOverride']);
        console.log('- classList:', Array.from(element.classList));
      }
      
      expect(finalDarkMode).toBe(true);
    } else {
      throw new Error('Dark mode button not found - this indicates a rendering issue');
    }
  });

  it('should verify the button click handler is properly bound', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    
    // Wait for async bookmark loading
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    // Test direct method call vs button click
    const initialState = element['darkModeOverride'];
    console.log('Initial override state:', initialState);
    
    // Call the method directly
    element['handleDarkModeToggle']();
    await element.updateComplete;
    
    const afterDirectCall = element['darkModeOverride'];
    console.log('After direct method call:', afterDirectCall);
    
    // Reset state
    element['darkModeOverride'] = null;
    element['updateReaderTheme']();
    await element.updateComplete;
    
    // Now try button click
    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button[title*="System Theme"], md-icon-button[title*="Mode Active"]');
    expect(darkModeButton).toBeTruthy();
    
    if (darkModeButton) {
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      darkModeButton.dispatchEvent(clickEvent);
      await element.updateComplete;
      
      const afterButtonClick = element['darkModeOverride'];
      console.log('After button click:', afterButtonClick);
      
      // Both should have the same effect
      expect(afterButtonClick).toBe(afterDirectCall);
    }
  });

  it('should detect if Material Web Components are intercepting events', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    
    // Wait for async bookmark loading
    await new Promise(resolve => setTimeout(resolve, 10));
    await element.updateComplete;

    const darkModeButton = element.shadowRoot?.querySelector('md-icon-button');
    expect(darkModeButton).toBeTruthy();
    
    if (darkModeButton) {
      console.log('Button tag name:', darkModeButton.tagName);
      console.log('Button attributes:', Array.from(darkModeButton.attributes).map(a => `${a.name}="${a.value}"`));
      
      // Check if the Material Web Component has its own shadow root that might be interfering
      const materialShadowRoot = (darkModeButton as any).shadowRoot;
      if (materialShadowRoot) {
        console.log('Material button has shadow root');
        const actualButton = materialShadowRoot.querySelector('button');
        console.log('Actual button element:', actualButton?.outerHTML || 'not found');
        
        if (actualButton) {
          // Try clicking the actual inner button
          const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
          actualButton.dispatchEvent(clickEvent);
          await element.updateComplete;
          
          const darkModeAfterInnerClick = element.classList.contains('reader-dark-mode');
          console.log('Dark mode after inner button click:', darkModeAfterInnerClick);
        }
      }
    }
  });
});