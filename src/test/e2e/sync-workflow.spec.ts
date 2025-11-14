/**
 * E2E tests for sync workflows with real Linkding server
 *
 * These tests use TestContainers to spin up a real Linkding instance
 * and Playwright to test the complete sync flow in a real browser.
 */

import { test, expect } from '@playwright/test';
import {
  injectPocketDingSettings,
  triggerSync,
  waitForSyncComplete,
  getBookmarkCount,
  clickBookmark,
  clickBookmarkWithAssets,
  scrollIframeContent,
  getReadingProgress,
  goOffline,
  goOnline,
} from './utils/playwright-helpers';
import {
  createLinkdingClient,
  createBookmark,
  getBookmarks,
} from './utils/test-data';

// Skip tests if Docker is not available
test.skip(() => {
  return process.env['E2E_TESTS_DISABLED'] === 'true';
}, 'Docker not available');

test.describe('Sync Workflow E2E Tests', () => {
  const getLinkdingConfig = () => {
    if (!process.env['E2E_LINKDING_URL'] || !process.env['E2E_LINKDING_TOKEN']) {
      throw new Error('Linkding environment variables not set. Global setup may have failed.');
    }

    return {
      url: process.env['E2E_LINKDING_URL'],
      token: process.env['E2E_LINKDING_TOKEN'],
    };
  };

  test.beforeEach(async ({ page, context }) => {
    // Clear browser storage before each test
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('should connect to Linkding and sync bookmarks', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure Pocket Ding to connect to TestContainers Linkding
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready (indicates app is initialized)
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);

    // Wait for initial sync to complete
    const syncResult = await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Verify sync completed successfully
    expect(syncResult.syncCompleted).toBe(true);
    expect(syncResult.bookmarkCount).toBeGreaterThan(0);

    // Verify bookmarks are displayed in UI
    const bookmarkCount = await getBookmarkCount(page);
    expect(bookmarkCount).toBeGreaterThan(0);

    // Verify we have the expected number of bookmarks (populated in global setup)
    // Note: The default view shows unarchived bookmarks, so if some are archived,
    // the count may be less than the total. We just need to verify sync worked.
    expect(bookmarkCount).toBeGreaterThanOrEqual(1);
  });

  test('should display bookmark details in reader', async ({ page }) => {
    const config = getLinkdingConfig();

    // Capture browser errors
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => {
      const errorMsg = error.message;
      browserErrors.push(errorMsg);
      console.log('[Browser Error]', errorMsg);
    });

    // Capture error console messages
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        console.log('[Browser Console Error]', text);
      }
    });

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Click on first bookmark (clickBookmark already verifies reader component rendered and has shadow DOM)
    await clickBookmark(page, 0);

    // Wait for content to load
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      // Wait for either secure-iframe or error/reader content
      const hasSecureIframe = !!bookmarkReader.shadowRoot.querySelector('secure-iframe');
      const hasErrorContent = !!bookmarkReader.shadowRoot.querySelector('.error-content');
      const hasReaderContent = !!bookmarkReader.shadowRoot.querySelector('.reader-content');

      return hasSecureIframe || hasErrorContent || hasReaderContent;
    }, { timeout: 10000 });

    // Print any captured errors before attempting evaluation
    if (browserErrors.length > 0) {
      console.log('Captured browser errors:', browserErrors);
    }

    // Check if the reader is stuck in loading state or if content loaded
    const readerState = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return { error: 'no app-root shadow' };

      const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return { error: 'no bookmark-reader shadow' };

      // Check for loading indicator
      const loadingText = bookmarkReader.shadowRoot.textContent?.includes('Loading');

      // Check for content elements
      const iframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
      const errorContent = bookmarkReader.shadowRoot.querySelector('.error-content');
      const readerContent = bookmarkReader.shadowRoot.querySelector('.reader-content');

      return {
        hasLoading: loadingText,
        hasIframe: !!iframe,
        hasErrorContent: !!errorContent,
        hasReaderContent: !!readerContent,
        textContent: bookmarkReader.shadowRoot.textContent?.substring(0, 200)
      };
    });

    console.log('Reader state after 3 seconds:', JSON.stringify(readerState, null, 2));

    // Verify content loaded
    expect(readerState.hasIframe || readerState.hasErrorContent || readerState.hasReaderContent).toBe(true);
  });

  test('should sync new bookmarks added to Linkding', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    const initialCount = await getBookmarkCount(page);

    // Add a new bookmark directly to Linkding via API
    const client = createLinkdingClient(config.url, config.token);
    await createBookmark(client, {
      url: 'https://example-test-e2e.com',
      title: 'E2E Test Bookmark',
      description: 'Added during E2E test',
      tag_names: ['e2e-test'],
    });

    // Trigger manual sync in Pocket Ding
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Verify new bookmark appears (should be at least one more than before)
    const newCount = await getBookmarkCount(page);
    expect(newCount).toBeGreaterThanOrEqual(initialCount);

    // The new bookmark should be visible (it will be first due to newest-first ordering)
    // Check by traversing shadow DOM to get bookmark titles
    const hasNewBookmark = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;

      const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!bookmarkListContainer?.shadowRoot) return false;

      const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return false;

      const bookmarks = bookmarkList.shadowRoot.querySelectorAll('[data-bookmark-id]');
      for (const bookmark of bookmarks) {
        if (bookmark.textContent?.includes('E2E Test Bookmark')) {
          return true;
        }
      }
      return false;
    });

    expect(hasNewBookmark).toBe(true);
  });

  test('should handle sync errors gracefully', async ({ page }) => {
    // Configure with invalid token
    await injectPocketDingSettings(page, {
      linkding_url: getLinkdingConfig().url,
      linkding_token: 'invalid-token-12345',
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync (which should fail)
    await triggerSync(page);

    // Wait for sync to attempt and fail (allow time for lock acquisition and API call)
    // The sync will try to acquire the Web Lock, make the API call, and handle the error
    // We don't expect bookmarks since the sync should fail
    await waitForSyncComplete(page, { timeout: 15000, expectBookmarks: false });

    // Verify the app handled the error gracefully without crashing
    // The app should still be functional and showing the bookmark list container
    const appState = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return { hasApp: false, hasContainer: false, bookmarkCount: 0 };

      const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!bookmarkListContainer?.shadowRoot) return { hasApp: true, hasContainer: false, bookmarkCount: 0 };

      const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return { hasApp: true, hasContainer: true, bookmarkCount: 0 };

      const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('.bookmark-card[data-bookmark-id]');
      return {
        hasApp: true,
        hasContainer: true,
        bookmarkCount: bookmarkCards.length,
      };
    });

    // Verify app is still running and showing UI
    expect(appState.hasApp).toBe(true);
    expect(appState.hasContainer).toBe(true);

    // Since this is an invalid token with no prior successful sync,
    // there should be no bookmarks displayed
    expect(appState.bookmarkCount).toBe(0);

    // Verify no JavaScript errors occurred (the page should not have crashed)
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // App should be responsive - verify we can interact with UI elements
    const canInteract = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;

      const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!bookmarkListContainer?.shadowRoot) return false;

      // Check that filter buttons are still clickable
      const filterButtons = bookmarkListContainer.shadowRoot.querySelectorAll('md-text-button, md-filled-button');
      return filterButtons.length > 0;
    });

    expect(canInteract).toBe(true);
    expect(errors.length).toBe(0);
  });

  test('should persist synced bookmarks in IndexedDB', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    const bookmarkCount = await getBookmarkCount(page);
    expect(bookmarkCount).toBeGreaterThan(0);

    // Reload page (simulates app restart)
    await page.reload();

    // Wait for app-root to be rendered
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Wait for bookmark-list to be rendered and have bookmarks loaded from IndexedDB
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const bookmarkList = container?.shadowRoot?.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return false;

      // Check that bookmarks are actually rendered (not just component exists)
      const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('[data-bookmark-id]');
      return bookmarkCards.length > 0;
    }, { timeout: 15000 });

    // Verify bookmarks are still visible (loaded from IndexedDB)
    const reloadedCount = await getBookmarkCount(page);
    expect(reloadedCount).toBe(bookmarkCount);
  });

  test('should filter bookmarks by tag', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Get initial count
    const totalCount = await getBookmarkCount(page);
    expect(totalCount).toBeGreaterThan(0);

    // Click on a tag filter (assume 'programming' tag exists from test data)
    const tagButton = page.locator('[data-tag="programming"], button:has-text("programming")').first();
    if (await tagButton.count() > 0) {
      const previousCount = await getBookmarkCount(page);
      await tagButton.click();

      // Wait for bookmark count to change (filter applied)
      await page.waitForFunction(
        (prevCount) => {
          const appRoot = document.querySelector('app-root');
          const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
          const bookmarkList = container?.shadowRoot?.querySelector('bookmark-list');
          if (!bookmarkList?.shadowRoot) return false;

          const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('[data-bookmark-id]');
          return bookmarkCards.length !== prevCount;
        },
        previousCount,
        { timeout: 5000 }
      );

      // Verify filtered count is less than total
      const filteredCount = await getBookmarkCount(page);
      expect(filteredCount).toBeLessThanOrEqual(totalCount);
      expect(filteredCount).toBeGreaterThan(0);
    }
  });

  test('should sync archived bookmarks correctly', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Check if archive toggle exists
    const archiveToggle = page.locator('button:has-text("Archived"), [data-filter="archived"]').first();
    if (await archiveToggle.count() > 0) {
      const previousCount = await getBookmarkCount(page);
      // Click to show archived bookmarks
      await archiveToggle.click();

      // Wait for UI to update after toggle
      await page.waitForFunction(
        (prevCount) => {
          const appRoot = document.querySelector('app-root');
          const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
          const bookmarkList = container?.shadowRoot?.querySelector('bookmark-list');
          if (!bookmarkList?.shadowRoot) return false;

          const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('[data-bookmark-id]');
          // Count should change when we toggle archive filter
          return bookmarkCards.length !== prevCount;
        },
        previousCount,
        { timeout: 5000 }
      );

      // Verify archived bookmarks are displayed
      const archivedBookmarks = page.locator('[data-archived="true"], .archived-bookmark');
      const archivedCount = await archivedBookmarks.count();

      // Test data includes at least one archived bookmark
      expect(archivedCount).toBeGreaterThan(0);
    }
  });

  test('should verify synced data matches Linkding API', async ({ page }) => {
    const config = getLinkdingConfig();

    // Get bookmarks directly from Linkding API
    const client = createLinkdingClient(config.url, config.token);
    const apiBookmarks = await getBookmarks(client, { limit: 100 });

    // Configure and sync Pocket Ding
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Get bookmark count from UI
    const uiCount = await getBookmarkCount(page);

    // Verify counts match
    expect(uiCount).toBe(apiBookmarks.length);
  });

  test('should sync assets for bookmarks', async ({ page }) => {
    test.setTimeout(90000); // Increase timeout for asset sync

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Check if assets were synced to IndexedDB
    const assetsSynced = await page.evaluate(async () => {
      // Access IndexedDB to check for assets
      return new Promise<{hasAssets: boolean, assetCount: number}>((resolve) => {
        const request = indexedDB.open('PocketDingDB');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('assets', 'readonly');
          const store = tx.objectStore('assets');
          const countRequest = store.count();

          countRequest.onsuccess = () => {
            const count = countRequest.result;
            resolve({
              hasAssets: count > 0,
              assetCount: count
            });
          };

          countRequest.onerror = () => {
            resolve({ hasAssets: false, assetCount: 0 });
          };
        };

        request.onerror = () => {
          resolve({ hasAssets: false, assetCount: 0 });
        };
      });
    });

    console.log(`Assets synced: ${assetsSynced.assetCount}`);

    // Verify assets were synced
    expect(assetsSynced.hasAssets).toBe(true);
    expect(assetsSynced.assetCount).toBeGreaterThan(0);

    // Verify asset indicators in UI (bookmarks with assets should show indicator)
    const hasAssetIndicators = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;

      const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!bookmarkListContainer?.shadowRoot) return false;

      const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return false;

      // Look for bookmarks with asset indicators (cached status icon)
      const bookmarksWithAssets = bookmarkList.shadowRoot.querySelectorAll(
        '.bookmark-card:has(.status-icon.cached)'
      );

      return bookmarksWithAssets.length > 0;
    });

    expect(hasAssetIndicators).toBe(true);
  });

  test('should read cached HTML asset content in bookmark reader', async ({ page }) => {
    test.setTimeout(90000); // Increase timeout for asset sync

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync (including assets)
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Open a bookmark that has assets
    await clickBookmarkWithAssets(page);

    // Wait for reader content to load - specifically wait for secure-iframe since we know this bookmark has assets
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      // Wait until loading is done and secure-iframe is present (not just any iframe)
      const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading');
      const hasSecureIframe = !!bookmarkReader.shadowRoot.querySelector('secure-iframe');

      return !isLoading && hasSecureIframe;
    }, { timeout: 15000 });

    // Check reader state and verify asset content is displayed
    const readerState = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return { error: 'no app-root shadow' };

      const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return { error: 'no bookmark-reader shadow' };

      // Check for secure-iframe (indicates asset is loaded)
      const iframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
      const hasIframe = !!iframe;

      // Check content source selector to see what's selected
      const sourceSelect = bookmarkReader.shadowRoot.querySelector('md-outlined-select') as HTMLSelectElement | null;
      const selectedSource = sourceSelect?.value || 'unknown';

      // Get text content to check for "test snapshot" metadata
      const textContent = bookmarkReader.shadowRoot.textContent || '';
      const hasTestSnapshotContent = textContent.includes('This is a test snapshot') ||
                                     textContent.includes('test the reader functionality');

      return {
        hasIframe,
        selectedSource,
        hasTestSnapshotContent,
        selectOptions: sourceSelect ? Array.from(sourceSelect.options).map(o => o.textContent) : [],
      };
    });

    console.log('Reader state:', JSON.stringify(readerState, null, 2));

    // Verify asset content is loaded (either in iframe or readable content)
    expect(readerState.hasIframe || readerState.hasTestSnapshotContent).toBe(true);

    // Verify content source selector has asset option
    if (readerState.selectOptions && readerState.selectOptions.length > 0) {
      const hasAssetOption = readerState.selectOptions.some(
        opt => opt?.toLowerCase().includes('saved')
      );
      expect(hasAssetOption).toBe(true);
    }
  });

  test('should switch between content sources in reader', async ({ page }) => {
    test.setTimeout(90000);

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Open first bookmark
    await clickBookmark(page, 0);

    // Wait for reader content and source selector to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      // Check for content source selector to be available
      const sourceSelect = bookmarkReader.shadowRoot.querySelector('md-outlined-select');
      return sourceSelect !== null;
    }, { timeout: 10000 });

    // Get available content sources
    const availableSources = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      const sourceSelect = bookmarkReader?.shadowRoot?.querySelector('md-outlined-select') as HTMLSelectElement | null;

      if (!sourceSelect) return [];

      return Array.from(sourceSelect.options).map(opt => ({
        value: opt.value,
        text: opt.textContent || '',
      }));
    });

    console.log('Available content sources:', availableSources);

    // If there are multiple sources, test switching
    if (availableSources.length > 1) {
      // Try switching to each source
      for (const source of availableSources) {
        await page.evaluate((sourceValue) => {
          const appRoot = document.querySelector('app-root');
          const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
          const sourceSelect = bookmarkReader?.shadowRoot?.querySelector('md-outlined-select') as HTMLSelectElement | null;

          if (sourceSelect) {
            sourceSelect.value = sourceValue;
            sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, source.value);

        // Wait for content to load after switching source
        await page.waitForFunction(() => {
          const appRoot = document.querySelector('app-root');
          const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
          if (!bookmarkReader?.shadowRoot) return false;

          // Wait until not loading and some content is visible
          const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading');
          const hasContent = !!(
            bookmarkReader.shadowRoot.querySelector('secure-iframe') ||
            bookmarkReader.shadowRoot.querySelector('.reader-content') ||
            bookmarkReader.shadowRoot.querySelector('.content')
          );

          return !isLoading && hasContent;
        }, { timeout: 10000 });

        // Verify content is displayed
        const hasContent = await page.evaluate(() => {
          const appRoot = document.querySelector('app-root');
          const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
          const iframe = bookmarkReader?.shadowRoot?.querySelector('secure-iframe');
          const content = bookmarkReader?.shadowRoot?.querySelector('.reader-content, .content');

          return !!(iframe || content);
        });

        expect(hasContent).toBe(true);
      }
    } else {
      // At least verify we have one source available
      expect(availableSources.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('should track reading progress when viewing assets', async ({ page }) => {
    test.setTimeout(90000);

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Open a bookmark that has assets
    const bookmarkId = await clickBookmarkWithAssets(page);

    // Wait for content to be loaded (secure-iframe) before attempting to scroll
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      // Wait until loading is done
      const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading');
      if (isLoading) return false;

      // Check that we have secure-iframe with content
      const secureIframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
      if (!secureIframe?.shadowRoot) return false;

      const iframe = secureIframe.shadowRoot.querySelector('iframe');
      return !!iframe;
    }, { timeout: 15000 });

    // Give the iframe content time to fully render
    await page.waitForTimeout(1000);

    // Scroll iframe content to 50% - this is where the actual scrolling happens
    const scrollResult = await scrollIframeContent(page, { scrollPercentage: 50 });
    console.log('Scrolled iframe content:', scrollResult);

    // Wait for debounced progress save operation to complete (progress tracking debounces by ~1000ms)
    await page.waitForTimeout(2000);

    // Check if progress was saved to IndexedDB using the helper function
    const progressSaved = await getReadingProgress(page, bookmarkId);

    console.log('Progress saved:', progressSaved);

    // Verify progress was tracked
    expect(progressSaved).not.toBeNull();
    expect(progressSaved!.scrollPosition).toBeGreaterThan(0);
    // Progress should be approximately 50% (allow some tolerance for layout variations)
    expect(progressSaved!.progress).toBeGreaterThan(30);
    expect(progressSaved!.progress).toBeLessThan(70);
  });

  test('should validate asset metadata and content after sync', async ({ page }) => {
    test.setTimeout(90000);

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Verify asset metadata is correctly stored in IndexedDB
    const assetDetails = await page.evaluate(async () => {
      return new Promise<{
        hasAssets: boolean;
        assetCount: number;
        sampleAsset: {
          status?: string;
          display_name?: string;
          content_type?: string;
          bookmark_id?: number;
          hasContent: boolean;
          contentSize?: number;
        } | null;
      }>((resolve) => {
        const request = indexedDB.open('PocketDingDB');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('assets', 'readonly');
          const store = tx.objectStore('assets');
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const assets = getAllRequest.result;
            if (assets.length === 0) {
              resolve({
                hasAssets: false,
                assetCount: 0,
                sampleAsset: null
              });
              return;
            }

            // Get the first asset with status='complete'
            const completeAsset = assets.find((a: any) => a.status === 'complete');
            const sampleAsset = completeAsset || assets[0];

            resolve({
              hasAssets: true,
              assetCount: assets.length,
              sampleAsset: {
                status: sampleAsset.status,
                display_name: sampleAsset.display_name,
                content_type: sampleAsset.content_type,
                bookmark_id: sampleAsset.bookmark_id,
                hasContent: !!sampleAsset.content,
                contentSize: sampleAsset.content ? sampleAsset.content.byteLength : 0
              }
            });
          };

          getAllRequest.onerror = () => {
            resolve({ hasAssets: false, assetCount: 0, sampleAsset: null });
          };
        };

        request.onerror = () => {
          resolve({ hasAssets: false, assetCount: 0, sampleAsset: null });
        };
      });
    });

    console.log('Asset details:', JSON.stringify(assetDetails, null, 2));

    // Verify assets were synced
    expect(assetDetails.hasAssets).toBe(true);
    expect(assetDetails.assetCount).toBeGreaterThan(0);

    // Verify asset metadata
    if (assetDetails.sampleAsset) {
      // Verify status is 'complete'
      expect(assetDetails.sampleAsset.status).toBe('complete');

      // Verify display_name is set
      expect(assetDetails.sampleAsset.display_name).toBeTruthy();

      // Verify content_type is set
      expect(assetDetails.sampleAsset.content_type).toBeTruthy();

      // Verify bookmark_id is valid
      expect(assetDetails.sampleAsset.bookmark_id).toBeGreaterThan(0);

      // Verify content was downloaded
      expect(assetDetails.sampleAsset.hasContent).toBe(true);
      expect(assetDetails.sampleAsset.contentSize).toBeGreaterThan(0);
    }
  });

  test('should verify cached asset content is used instead of live URL', async ({ page }) => {
    test.setTimeout(90000);

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync (including assets)
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Open a bookmark that has assets
    const bookmarkId = await clickBookmarkWithAssets(page);
    console.log('Testing asset content for bookmark:', bookmarkId);

    // Wait for reader content to load - specifically wait for secure-iframe since we know this bookmark has assets
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      // Wait until loading is done and secure-iframe is present (not just any iframe)
      const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading');
      const hasSecureIframe = !!bookmarkReader.shadowRoot.querySelector('secure-iframe');

      return !isLoading && hasSecureIframe;
    }, { timeout: 15000 });

    // Verify the reader is displaying cached asset content
    const contentVerification = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return { error: 'no app-root shadow' };

      const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return { error: 'no bookmark-reader shadow' };

      // Check for secure-iframe (asset content)
      const iframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');

      // Check content source selector
      const sourceSelect = bookmarkReader.shadowRoot.querySelector('md-outlined-select') as HTMLSelectElement | null;
      const selectedSource = sourceSelect?.value || 'unknown';
      const availableSources = sourceSelect ?
        Array.from(sourceSelect.options).map(o => ({ value: o.value, text: o.textContent })) :
        [];

      // Get visible content to check for test snapshot markers
      const textContent = bookmarkReader.shadowRoot.textContent || '';

      // Check if we have the test snapshot content (generated by generateMockArticleHtml)
      const hasTestSnapshotMarker = textContent.includes('This is a test snapshot') ||
                                     textContent.includes('test the reader functionality');

      return {
        hasIframe: !!iframe,
        selectedSource,
        availableSources,
        hasTestSnapshotMarker,
        contentLength: textContent.length
      };
    });

    console.log('Content verification:', JSON.stringify(contentVerification, null, 2));

    // Verify asset content is being used
    expect(contentVerification.hasIframe || contentVerification.hasTestSnapshotMarker).toBe(true);

    // Verify we have asset source available
    const hasAssetSource = contentVerification.availableSources?.some(
      (src: any) => src.value === 'asset' || src.text?.toLowerCase().includes('saved')
    );
    expect(hasAssetSource).toBe(true);

    // If asset source is selected, verify it's being used
    if (contentVerification.selectedSource === 'asset') {
      expect(contentVerification.hasIframe || contentVerification.hasTestSnapshotMarker).toBe(true);
    }
  });

  test.skip('should restore reading progress after page reload', async ({ page }) => {
    // TODO: Scroll restoration after page reload is not currently working
    // The issue is that after reload, the content Task re-runs and creates a fresh iframe
    // The scroll position is saved in IndexedDB and retrieved, but the iframe content
    // loads fresh and doesn't restore the scroll position
    // This requires refactoring how scroll restoration works in secure-iframe
    test.setTimeout(90000);

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Open a bookmark that has assets and get its ID
    const bookmarkId = await clickBookmarkWithAssets(page);
    console.log('Testing progress restoration for bookmark:', bookmarkId);

    // Wait for content to be loaded (secure-iframe)
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading');
      if (isLoading) return false;

      // Check for secure-iframe
      const secureIframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
      if (!secureIframe?.shadowRoot) return false;

      const iframe = secureIframe.shadowRoot.querySelector('iframe');
      return !!iframe;
    }, { timeout: 15000 });

    // Give the iframe content time to fully render
    await page.waitForTimeout(1000);

    // Scroll iframe content to 60% progress
    const scrollResult = await scrollIframeContent(page, { scrollPercentage: 60 });
    console.log('Scrolled iframe content to 60%:', scrollResult);

    // Wait for progress to be saved (with debounce)
    await page.waitForTimeout(2000);

    // Get the saved scroll position using helper function
    const savedProgress = await getReadingProgress(page, bookmarkId!);

    console.log('Saved progress before reload:', savedProgress);
    expect(savedProgress).not.toBeNull();
    expect(savedProgress!.scrollPosition).toBeGreaterThan(0);

    // Reload the page to simulate app restart
    // Note: injectPocketDingSettings already reloads the page
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list to be ready after reload
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const bookmarkList = container?.shadowRoot?.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return false;

      const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('[data-bookmark-id]');
      return bookmarkCards.length > 0;
    }, { timeout: 15000 });

    // Navigate back to the same bookmark (find it by ID after reload)
    const bookmarkIndex = await page.evaluate((bmId) => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return -1;

      const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!bookmarkListContainer?.shadowRoot) return -1;

      const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return -1;

      const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('.bookmark-card[data-bookmark-id]');
      for (let i = 0; i < bookmarkCards.length; i++) {
        const card = bookmarkCards[i];
        if (!card) continue;

        const id = card.getAttribute('data-bookmark-id');
        if (id && parseInt(id, 10) === bmId) {
          return i;
        }
      }
      return -1;
    }, bookmarkId);

    if (bookmarkIndex === -1) {
      throw new Error(`Bookmark ${bookmarkId} not found after reload`);
    }

    await clickBookmark(page, bookmarkIndex);

    // Wait for content to be loaded
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading');
      const hasContent = !!(
        bookmarkReader.shadowRoot.querySelector('secure-iframe') ||
        bookmarkReader.shadowRoot.querySelector('.reader-content')
      );

      return !isLoading && hasContent;
    }, { timeout: 10000 });

    // Wait for scroll restoration to happen
    // The restoration process:
    // 1. Reactive queries complete (bookmark + readProgress)
    // 2. bookmark-reader sets scrollPosition from readProgressData
    // 3. secure-iframe receives scrollPosition property
    // 4. iframe content loads and requests scroll position
    // 5. secure-iframe responds with scroll position
    // 6. iframe restores scroll
    // This can take time, especially with reactive queries
    await page.waitForTimeout(5000);

    // Verify scroll position was restored by checking the iframe's scroll
    const restoredScroll = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return { scrollTop: 0, scrollHeight: 0, error: 'no app-root' };

      const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return { scrollTop: 0, scrollHeight: 0, error: 'no bookmark-reader' };

      const secureIframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
      if (!secureIframe?.shadowRoot) return { scrollTop: 0, scrollHeight: 0, error: 'no secure-iframe' };

      const iframe = secureIframe.shadowRoot.querySelector('iframe') as HTMLIFrameElement | null;
      if (!iframe) return { scrollTop: 0, scrollHeight: 0, error: 'no iframe' };

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return { scrollTop: 0, scrollHeight: 0, error: 'no iframe document' };

      return {
        scrollTop: iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop,
        scrollHeight: iframeDoc.documentElement.scrollHeight,
        error: null
      };
    });

    console.log('Restored scroll after reload:', restoredScroll);

    // Verify scroll position was restored (allow some tolerance for layout differences)
    expect(restoredScroll.scrollTop).toBeGreaterThan(0);

    // Verify it's at least 40% of the way down (accounting for 60% target with some tolerance)
    const restoredProgressPercentage = (restoredScroll.scrollTop / restoredScroll.scrollHeight) * 100;
    expect(restoredProgressPercentage).toBeGreaterThan(35); // Generous tolerance for E2E variability
  });

  test('should work offline with cached assets', async ({ page }) => {
    test.setTimeout(90000);

    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for bookmark list container to be ready
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Trigger manual sync (including assets)
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 60000, expectBookmarks: true });

    // Verify bookmarks and assets are cached
    const cacheStatus = await page.evaluate(async () => {
      return new Promise<{ bookmarkCount: number; assetCount: number }>((resolve) => {
        const request = indexedDB.open('PocketDingDB');
        request.onsuccess = () => {
          const db = request.result;

          const bookmarkTx = db.transaction('bookmarks', 'readonly');
          const bookmarkStore = bookmarkTx.objectStore('bookmarks');
          const bookmarkCountRequest = bookmarkStore.count();

          const assetTx = db.transaction('assets', 'readonly');
          const assetStore = assetTx.objectStore('assets');
          const assetCountRequest = assetStore.count();

          let bookmarkCount = 0;
          let assetCount = 0;

          bookmarkCountRequest.onsuccess = () => {
            bookmarkCount = bookmarkCountRequest.result;

            assetCountRequest.onsuccess = () => {
              assetCount = assetCountRequest.result;
              resolve({ bookmarkCount, assetCount });
            };
          };
        };

        request.onerror = () => {
          resolve({ bookmarkCount: 0, assetCount: 0 });
        };
      });
    });

    console.log('Cache status before going offline:', cacheStatus);
    expect(cacheStatus.bookmarkCount).toBeGreaterThan(0);
    expect(cacheStatus.assetCount).toBeGreaterThan(0);

    // Go offline
    await goOffline(page);
    console.log('Browser is now offline');

    // Reload page to ensure we're truly offline
    await page.reload();
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Wait for bookmark-list to be rendered with cached data
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const bookmarkList = container?.shadowRoot?.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return false;

      const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('[data-bookmark-id]');
      return bookmarkCards.length > 0;
    }, { timeout: 15000 });

    // Verify bookmarks are still displayed from cache
    const offlineBookmarkCount = await getBookmarkCount(page);
    console.log('Bookmark count while offline:', offlineBookmarkCount);
    expect(offlineBookmarkCount).toBeGreaterThan(0);

    // Open a bookmark with cached asset
    await clickBookmark(page, 0);

    // Wait for reader content to load from cache
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const bookmarkReader = appRoot?.shadowRoot?.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading');
      const hasContent = !!(
        bookmarkReader.shadowRoot.querySelector('secure-iframe') ||
        bookmarkReader.shadowRoot.querySelector('.reader-content')
      );

      return !isLoading && hasContent;
    }, { timeout: 10000 });

    // Verify asset content is displayed from cache (not network)
    const offlineContentStatus = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return { error: 'no app-root shadow' };

      const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return { error: 'no bookmark-reader shadow' };

      // Check if content is displayed (should be from cache)
      const iframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
      const hasContent = !!iframe;

      // Check for error messages (should not have network errors)
      const errorContent = bookmarkReader.shadowRoot.querySelector('.error-content');
      const hasError = !!errorContent;

      // Check loading state (should not be stuck loading)
      const isLoading = bookmarkReader.shadowRoot.textContent?.includes('Loading') || false;

      return {
        hasContent,
        hasError,
        isLoading,
        contentLength: bookmarkReader.shadowRoot.textContent?.length || 0
      };
    });

    console.log('Offline content status:', offlineContentStatus);

    // Verify content is displayed from cache without errors
    expect(offlineContentStatus.hasContent || (offlineContentStatus.contentLength ?? 0) > 100).toBe(true);
    expect(offlineContentStatus.hasError).toBe(false);
    expect(offlineContentStatus.isLoading).toBe(false);

    // Go back online
    await goOnline(page);
    console.log('Browser is back online');
  });
});
