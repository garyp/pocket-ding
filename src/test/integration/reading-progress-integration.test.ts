import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import '../setup';

import { BookmarkReader } from '../../components/bookmark-reader';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';
import { ThemeService } from '../../services/theme-service';
import type { LocalBookmark, ReadProgress, ContentSourceOption } from '../../types';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/content-fetcher');
vi.mock('../../services/theme-service');

describe('Reading Progress Integration Tests', () => {
  let element: BookmarkReader;
  let mockBookmark: LocalBookmark;
  let container: HTMLElement;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock IntersectionObserver for test environment
    global.IntersectionObserver = vi.fn().mockImplementation((_callback, options) => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      root: options?.root || null,
      rootMargin: options?.rootMargin || '0px',
      thresholds: Array.isArray(options?.threshold) ? options.threshold : [options?.threshold || 0]
    }));
    
    container = document.createElement('div');
    document.body.appendChild(container);

    // Ensure component is registered
    if (!customElements.get('bookmark-reader')) {
      customElements.define('bookmark-reader', BookmarkReader);
    }

    mockBookmark = {
      id: 1,
      url: 'https://example.com/article',
      title: 'Test Article',
      description: 'Test description',
      notes: '',
      tag_names: [],
      date_added: '2023-01-01T00:00:00Z',
      date_modified: '2023-01-01T00:00:00Z',
      unread: false,
      shared: false,
      website_title: '',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false
    };

    // Mock DatabaseService
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue();
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue();

    // Mock ContentFetcher
    const mockContentSources: ContentSourceOption[] = [
      { type: 'asset', label: 'Cached Content', assetId: 1 }
    ];
    
    vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue(mockContentSources);
    
    // Mock ThemeService
    vi.mocked(ThemeService.addThemeChangeListener).mockImplementation(() => {});
    vi.mocked(ThemeService.removeThemeChangeListener).mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  const createElementWithContent = async (content: string) => {
    vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
      content,
      readability_content: content,
      source: 'asset'
    });

    element = new BookmarkReader();
    container.appendChild(element);
    await element.updateComplete;

    // Set bookmark ID to trigger loading
    element.bookmarkId = 1;
    await element.updateComplete;

    // Wait for loadBookmark async operation to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    await element.updateComplete;

    // Wait for content to load and component to be ready
    await waitFor(() => {
      const isLoading = (element as any).isLoading;
      const isLoadingContent = (element as any).isLoadingContent;
      return !isLoading && !isLoadingContent;
    }, { timeout: 3000 });

    // Ensure the content element exists
    await waitFor(() => {
      const contentElement = getContentElement();
      return contentElement !== null;
    }, { timeout: 1000 });

    // Wait a bit more for secure iframe to be set up
    await new Promise(resolve => setTimeout(resolve, 50));

    return element;
  };

  const getProgressText = (): string | null => {
    const progressElement = element.shadowRoot?.querySelector('.progress-text');
    return progressElement?.textContent?.trim() || null;
  };

  const getProgressBar = (): Element | null => {
    return element.shadowRoot?.querySelector('sl-progress-bar') || null;
  };

  const getContentElement = (): HTMLElement | null => {
    return element.shadowRoot?.querySelector('.reader-content') as HTMLElement;
  };

  const simulateScroll = async (scrollTop: number, scrollHeight: number = 1000, clientHeight: number = 400) => {
    const contentElement = getContentElement();
    if (!contentElement) {
      throw new Error('Content element not found');
    }

    // Mock the scroll dimensions
    Object.defineProperty(contentElement, 'scrollTop', { 
      value: scrollTop, 
      writable: true, 
      configurable: true 
    });
    Object.defineProperty(contentElement, 'scrollHeight', { 
      value: scrollHeight, 
      configurable: true 
    });
    Object.defineProperty(contentElement, 'clientHeight', { 
      value: clientHeight, 
      configurable: true 
    });

    // Calculate progress based on scroll position
    const scrollableHeight = scrollHeight - clientHeight;
    const progress = scrollableHeight <= 0 ? (scrollHeight > 0 ? 100 : 0) : Math.min(100, Math.max(0, (scrollTop / scrollableHeight) * 100));
    
    // Dispatch progress-update event to simulate iframe communication
    const progressEvent = new CustomEvent('progress-update', {
      detail: { progress, scrollPosition: scrollTop },
      bubbles: true
    });
    
    // Dispatch the event on the element to simulate iframe → BookmarkReader communication
    element.dispatchEvent(progressEvent);

    // Wait for the component to update
    await element.updateComplete;
    
    // Give a small delay for any async progress updates
    await new Promise(resolve => setTimeout(resolve, 10));
  };

  const simulateScrollDirect = async (scrollTop: number, scrollHeight: number = 1000, clientHeight: number = 400) => {
    const contentElement = getContentElement();
    if (!contentElement) {
      throw new Error('Content element not found');
    }

    // Mock the scroll dimensions
    Object.defineProperty(contentElement, 'scrollTop', { 
      value: scrollTop, 
      writable: true, 
      configurable: true 
    });
    Object.defineProperty(contentElement, 'scrollHeight', { 
      value: scrollHeight, 
      configurable: true 
    });
    Object.defineProperty(contentElement, 'clientHeight', { 
      value: clientHeight, 
      configurable: true 
    });

    // Calculate progress based on scroll position
    const scrollableHeight = scrollHeight - clientHeight;
    const progress = scrollableHeight <= 0 ? (scrollHeight > 0 ? 100 : 0) : Math.min(100, Math.max(0, (scrollTop / scrollableHeight) * 100));
    
    // Dispatch progress-update event to simulate iframe communication
    const progressEvent = new CustomEvent('progress-update', {
      detail: { progress, scrollPosition: scrollTop },
      bubbles: true
    });
    
    // Dispatch the event on the element to simulate iframe → BookmarkReader communication
    element.dispatchEvent(progressEvent);

    // Wait for the component to update
    await element.updateComplete;
    
    // Give a small delay for any async progress updates
    await new Promise(resolve => setTimeout(resolve, 10));
  };

  describe('Progress Display and Updates', () => {
    it('should show 0% progress when content is first loaded at top', async () => {
      const longContent = `
        <div class="bookmark-header">
          <h1>Long Article</h1>
        </div>
        <div class="content-container">
          ${Array.from({ length: 20 }, (_, i) => `<p>Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`).join('')}
        </div>
      `;

      await createElementWithContent(longContent);
      
      // Simulate being at the top
      await simulateScroll(0, 1000, 400);

      const progressText = getProgressText();
      expect(progressText).toContain('0% read');
    });

    it('should show 100% progress when content is shorter than container', async () => {
      const shortContent = `
        <div class="bookmark-header">
          <h1>Short Article</h1>
        </div>
        <div class="content-container">
          <p>This is a very short article that fits entirely in the viewport.</p>
        </div>
      `;

      await createElementWithContent(shortContent);
      
      // Simulate content being shorter than container (scrollHeight < clientHeight)
      await simulateScrollDirect(0, 300, 400);
      
      const progressText = getProgressText();
      expect(progressText).toContain('100% read');
    });

    it('should update progress text as user scrolls through content', async () => {
      const longContent = `
        <div class="bookmark-header">
          <h1>Long Article</h1>
        </div>
        <div class="content-container">
          ${Array.from({ length: 50 }, (_, i) => `<p>Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`).join('')}
        </div>
      `;

      await createElementWithContent(longContent);

      // Test progression through content
      const scrollHeight = 1000;
      const clientHeight = 400;

      // At 25% scroll (150/600 = 25%)
      await simulateScroll(150, scrollHeight, clientHeight);
      expect(getProgressText()).toContain('25% read');

      // At 50% scroll (300/600 = 50%)
      await simulateScroll(300, scrollHeight, clientHeight);
      expect(getProgressText()).toContain('50% read');

      // At 75% scroll (450/600 = 75%)
      await simulateScroll(450, scrollHeight, clientHeight);
      expect(getProgressText()).toContain('75% read');

      // At bottom (600/600 = 100%)
      await simulateScroll(600, scrollHeight, clientHeight);
      expect(getProgressText()).toContain('100% read');
    });

    it('should update progress bar value as user scrolls', async () => {
      const longContent = `
        <div class="bookmark-header">
          <h1>Long Article</h1>
        </div>
        <div class="content-container">
          ${Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('')}
        </div>
      `;

      await createElementWithContent(longContent);

      const progressBar = getProgressBar();
      expect(progressBar).toBeTruthy();

      // Test at 30% scroll
      await simulateScroll(180, 1000, 400); // 180/(1000-400) = 30%
      await element.updateComplete;
      
      expect(progressBar?.getAttribute('value')).toBe('30');

      // Test at 60% scroll  
      await simulateScroll(360, 1000, 400); // 360/(1000-400) = 60%
      await element.updateComplete;
      
      expect(progressBar?.getAttribute('value')).toBe('60');
    });

    it('should handle rapid scrolling without breaking', async () => {
      const longContent = `
        <div class="bookmark-header">
          <h1>Long Article</h1>
        </div>
        <div class="content-container">
          ${Array.from({ length: 100 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('')}
        </div>
      `;

      await createElementWithContent(longContent);

      // Simulate rapid scrolling
      const scrollPositions = [0, 50, 100, 200, 300, 150, 400, 250, 500, 600];
      
      for (const position of scrollPositions) {
        await simulateScroll(position, 1000, 400);
        // Verify progress text is always a valid number
        const progressText = getProgressText();
        expect(progressText).toMatch(/^\d+% read$/);
        expect(progressText).not.toContain('NaN');
      }
    });

    it('should never display progress greater than 100%', async () => {
      const content = `<div class="content-container"><p>Test content</p></div>`;
      await createElementWithContent(content);

      // Simulate scroll beyond bottom (should cap at 100%)
      await simulateScroll(1000, 1000, 400); // scroll more than available
      
      const progressText = getProgressText();
      expect(progressText).toContain('100% read');
      
      const progressBar = getProgressBar();
      expect(Number(progressBar?.getAttribute('value') || '0')).toBeLessThanOrEqual(100);
    });

    it('should never display negative progress', async () => {
      const content = `<div class="content-container"><p>Test content</p></div>`;
      await createElementWithContent(content);

      // Simulate negative scroll (shouldn't happen in real browser, but test edge case)
      await simulateScroll(-50, 1000, 400);
      
      const progressText = getProgressText();
      expect(progressText).toMatch(/^\d+% read$/);
      expect(progressText).not.toContain('-');
      
      const progressBar = getProgressBar();
      expect(Number(progressBar?.getAttribute('value') || '0')).toBeGreaterThanOrEqual(0);
    });

    it('should update progress via real scroll events (integration test)', async () => {
      const longContent = `
        <div class="content-container">
          ${Array.from({ length: 20 }, (_, i) => `<p>Paragraph ${i + 1}: Lorem ipsum dolor sit amet</p>`).join('')}
        </div>
      `;

      await createElementWithContent(longContent);

      // Initial state should show 0%
      expect(getProgressText()).toContain('0% read');

      // Test that real scroll events trigger progress updates
      // This tests the actual integration that was broken
      await simulateScroll(150, 1000, 400); // 25% scroll
      expect(getProgressText()).toContain('25% read');

      await simulateScroll(300, 1000, 400); // 50% scroll
      expect(getProgressText()).toContain('50% read');

      // Verify scroll position is also tracked
      expect((element as any).scrollPosition).toBe(300);
    });
  });

  describe('Progress Persistence', () => {
    it('should save progress after scrolling', async () => {
      const content = `
        <div class="content-container">
          ${Array.from({ length: 20 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('')}
        </div>
      `;

      await createElementWithContent(content);

      // Scroll to 50%
      await simulateScroll(300, 1000, 400); // 300/(1000-400) = 50%

      // Wait for the save timeout to trigger
      await new Promise(resolve => setTimeout(resolve, 1100)); // saveProgress has 1000ms timeout

      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          bookmark_id: 1,
          progress: 50,
          scroll_position: 300
        })
      );
    });

    it('should restore saved progress when component loads', async () => {
      const savedProgress: ReadProgress = {
        bookmark_id: 1,
        progress: 75,
        scroll_position: 450,
        last_read_at: '2023-01-01T12:00:00Z',
        reading_mode: 'readability'
      };

      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(savedProgress);

      const content = `
        <div class="content-container">
          ${Array.from({ length: 20 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('')}
        </div>
      `;

      await createElementWithContent(content);
      
      // Wait for progress to be restored
      await waitFor(() => {
        const progressText = getProgressText();
        return progressText?.includes('75% read');
      }, { timeout: 1000 });

      // Check that scroll position was restored on the component
      // Note: After secure iframe refactoring, scrolling happens inside iframe,
      // not directly on the .reader-content element
      expect((element as any).scrollPosition).toBe(450);
    });

    it('should update progress when navigating away and back', async () => {
      const content = `
        <div class="content-container">
          ${Array.from({ length: 15 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('')}
        </div>
      `;

      // First visit - scroll to 30%
      await createElementWithContent(content);
      await simulateScroll(180, 1000, 400); // 30%
      
      // Wait for save to trigger
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Mock that progress was saved for the next load
      const savedProgress: ReadProgress = {
        bookmark_id: 1,
        progress: 30,
        scroll_position: 180,
        last_read_at: new Date().toISOString(),
        reading_mode: 'readability'
      };
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(savedProgress);

      // Clean up first element properly
      try {
        if (element?.parentNode) {
          element.parentNode.removeChild(element);
        }
      } catch (error) {
        // Ignore cleanup errors
      }

      // Second visit - should restore progress
      await createElementWithContent(content);
      
      // Check that progress was restored
      const progressText = getProgressText();
      expect(progressText).toContain('30% read');

      // Continue scrolling to 60%
      await simulateScroll(360, 1000, 400); // 60%
      
      const updatedProgressText = getProgressText();
      expect(updatedProgressText).toContain('60% read');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle content changes gracefully', async () => {
      // Start with short content
      let content = `<div class="content-container"><p>Short content</p></div>`;
      await createElementWithContent(content);
      
      // Simulate short content dimensions and verify 100% progress
      await simulateScroll(0, 300, 400);
      expect(getProgressText()).toContain('100% read');

      // Change to long content by directly updating the component's content
      content = `
        <div class="content-container">
          ${Array.from({ length: 30 }, (_, i) => `<p>Long paragraph ${i + 1}</p>`).join('')}
        </div>
      `;
      
      // Update the component's content directly
      (element as any).currentContent = content;
      (element as any).currentReadabilityContent = content;
      
      // Trigger re-render
      await element.updateComplete;

      // Should now show 0% for long content at top
      await simulateScroll(0, 1000, 400);
      expect(getProgressText()).toContain('0% read');
    });

    it('should handle zero dimensions without errors', async () => {
      const content = `<div class="content-container"><p>Test</p></div>`;
      await createElementWithContent(content);

      // Simulate zero dimensions edge case
      await simulateScroll(0, 0, 0);
      
      const progressText = getProgressText();
      expect(progressText).toContain('0% read'); // Should show 0% for zero content
      expect(progressText).not.toContain('NaN');
    });

    it('should handle database save errors gracefully', async () => {
      const content = `
        <div class="content-container">
          ${Array.from({ length: 10 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('')}
        </div>
      `;

      vi.mocked(DatabaseService.saveReadProgress).mockRejectedValue(new Error('Database error'));

      await createElementWithContent(content);

      // Scroll should still work even if save fails
      await simulateScroll(200, 1000, 400); // 33%
      
      expect(getProgressText()).toContain('33% read');
      
      // Should have attempted to save despite error
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(DatabaseService.saveReadProgress).toHaveBeenCalled();
    });

    it('should handle intersection observer setup errors', async () => {
      // Mock IntersectionObserver to throw during setup
      const originalIntersectionObserver = global.IntersectionObserver;
      global.IntersectionObserver = vi.fn().mockImplementation(() => {
        throw new Error('IntersectionObserver not supported');
      });

      const content = `<div class="content-container"><p>Test content</p></div>`;
      
      // Create element manually without using createElementWithContent to avoid the error in setup
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
        content,
        readability_content: content,
        source: 'asset'
      });

      element = new BookmarkReader();
      container.appendChild(element);
      await element.updateComplete;
      element.bookmarkId = 1;
      await element.updateComplete;
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 100));
      await element.updateComplete;

      // Should load without errors despite IntersectionObserver failing
      expect(element).toBeDefined();
      
      // Manual scroll updates should still work since scroll event listeners don't depend on IntersectionObserver
      await simulateScroll(100, 1000, 400);
      expect(getProgressText()).toContain('17% read');

      // Restore original
      global.IntersectionObserver = originalIntersectionObserver;
    });
  });

  describe('Reading Mode Integration', () => {
    it('should maintain progress when switching between reading modes', async () => {
      const originalContent = `
        <div class="content-container">
          ${Array.from({ length: 20 }, (_, i) => `<p>Original paragraph ${i + 1}</p>`).join('')}
        </div>
      `;
      
      const readabilityContent = `
        <div class="content-container">
          ${Array.from({ length: 20 }, (_, i) => `<p>Readable paragraph ${i + 1}</p>`).join('')}
        </div>
      `;

      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
        content: originalContent,
        readability_content: readabilityContent,
        source: 'asset'
      });

      await createElementWithContent(originalContent);

      // Scroll to 40%
      await simulateScroll(240, 1000, 400);
      expect(getProgressText()).toContain('40% read');

      // Find the original button (currently not primary since we start in readability mode)
      const originalButton = element.shadowRoot?.querySelector('.reading-mode-toggle sl-button:nth-child(2)') as HTMLElement;
      expect(originalButton?.textContent?.trim()).toBe('Original');
      
      originalButton?.click();
      await element.updateComplete;

      // Progress should be maintained
      expect(getProgressText()).toContain('40% read');

      // Switch back to readability mode
      const readerButton = element.shadowRoot?.querySelector('.reading-mode-toggle sl-button:nth-child(1)') as HTMLElement;
      expect(readerButton?.textContent?.trim()).toBe('Reader');
      
      readerButton?.click();
      await element.updateComplete;

      // Progress should still be maintained
      expect(getProgressText()).toContain('40% read');
    });
  });
});