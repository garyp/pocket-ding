import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../setup';
import { waitForComponent, waitForComponentReady } from '../utils/component-aware-wait-for';
import { BookmarkReader } from '../../components/bookmark-reader';

/**
 * This test runs the reader with minimal mocking to catch real bugs
 * that over-mocked tests miss. It should catch the "Loading article..." bug.
 */
describe('Reader Real Behavior Test - Minimal Mocking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('should expose the loading bug with minimal mocking', async () => {
    // Only mock ContentFetcher to prevent network calls, but leave database/reactive queries intact
    vi.doMock('../../services/content-fetcher', () => ({
      ContentFetcher: {
        fetchBookmarkContent: vi.fn().mockResolvedValue({
          source: 'url',
          content_type: 'html',
          html_content: '<html><body>Test content</body></html>',
          readability_content: 'Test content',
          metadata: {}
        }),
        getAvailableContentSources: vi.fn().mockReturnValue([
          { type: 'url', label: 'Live URL' }
        ]),
      },
    }));

    // Create the reader component like in real usage
    const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
    bookmarkReader.bookmarkId = 1; // Set a real bookmark ID
    document.body.appendChild(bookmarkReader);

    await waitForComponentReady(bookmarkReader);

    // Wait and check if we get stuck in loading state (this should catch the bug)
    let iterations = 0;
    const maxIterations = 20; // Give it reasonable time, but not infinite

    try {
      await waitForComponent(() => {
        iterations++;
        const loadingContainer = bookmarkReader.shadowRoot?.querySelector('.loading-container');
        const readerContent = bookmarkReader.shadowRoot?.querySelector('.reader-content');
        const secureIframe = readerContent?.querySelector('secure-iframe');

        console.log(`Iteration ${iterations}: Loading=${!!loadingContainer}, Content=${!!readerContent}, Iframe=${!!secureIframe}`);

        // If stuck in "Loading article..." state for too many iterations, we caught the bug
        if (loadingContainer?.textContent?.includes('Loading article...')) {
          if (iterations > maxIterations) {
            throw new Error(`BUG DETECTED: Component stuck in "Loading article..." state after ${iterations} iterations`);
          }
          return null; // Keep waiting
        }

        // Success case: we have content and no loading
        if (secureIframe && !loadingContainer) {
          console.log(`✓ Success: Content loaded after ${iterations} iterations`);
          return secureIframe;
        }

        // Some other state - might be error, loading content, etc.
        return null;
      }, {
        timeout: 10000, // 10 second timeout
        interval: 100   // Check every 100ms
      });

      // If we get here, the component worked correctly
      console.log('✓ Test passed: Component loaded content successfully');
    } catch (error) {
      // This should catch the bug if it exists
      console.error('❌ Test caught an issue:', (error as Error).message);
      throw error;
    }
  });

  it('should work with completely unmocked component (integration test)', async () => {
    // This is the most realistic test - no mocks at all except to prevent network calls
    // It will fail if the real database isn't set up, but that's expected

    const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
    bookmarkReader.bookmarkId = 999; // Non-existent bookmark ID
    document.body.appendChild(bookmarkReader);

    await waitForComponentReady(bookmarkReader);

    // Wait for the component to handle the missing bookmark gracefully
    await waitForComponent(() => {
      const loadingContainer = bookmarkReader.shadowRoot?.querySelector('.loading-container');
      const errorContainer = bookmarkReader.shadowRoot?.querySelector('.error-message');
      const readerContent = bookmarkReader.shadowRoot?.querySelector('.reader-content');

      // Should NOT be stuck in "Loading article..." state
      if (loadingContainer?.textContent?.includes('Loading article...')) {
        throw new Error('Component stuck in loading state with non-existent bookmark');
      }

      // Should show either error or some fallback content
      expect(errorContainer || readerContent).toBeTruthy();
      return errorContainer || readerContent;
    }, { timeout: 5000 });
  });
});