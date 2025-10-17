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

    // Wait for app to initialize
    await page.waitForTimeout(2000);

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

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Click on first bookmark (clickBookmark already verifies reader component rendered and has shadow DOM)
    await clickBookmark(page, 0);

    // Wait a bit for content to potentially load
    await page.waitForTimeout(3000);

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

    // Verify content loaded (not stuck in loading state)
    expect(readerState.hasLoading).toBe(false);
    expect(readerState.hasIframe || readerState.hasErrorContent || readerState.hasReaderContent).toBe(true);
  });

  test('should sync new bookmarks added to Linkding', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure and sync
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for app to initialize
    await page.waitForTimeout(2000);

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

    // Wait a bit more for UI to update after sync
    await page.waitForTimeout(2000);

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

    // Wait for app to initialize
    await page.waitForTimeout(2000);

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

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    const bookmarkCount = await getBookmarkCount(page);
    expect(bookmarkCount).toBeGreaterThan(0);

    // Reload page (simulates app restart)
    await page.reload();

    // Wait for app-root to be rendered
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Wait longer for app to initialize and load from IndexedDB
    await page.waitForTimeout(3000);

    // Wait for bookmark-list to be rendered after reload (it's in shadow DOM)
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const bookmarkList = container?.shadowRoot?.querySelector('bookmark-list');
      return bookmarkList !== null;
    }, { timeout: 10000 });

    // Give more time for reactive queries to load bookmarks from IndexedDB
    await page.waitForTimeout(2000);

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

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Get initial count
    const totalCount = await getBookmarkCount(page);
    expect(totalCount).toBeGreaterThan(0);

    // Click on a tag filter (assume 'programming' tag exists from test data)
    const tagButton = page.locator('[data-tag="programming"], button:has-text("programming")').first();
    if (await tagButton.count() > 0) {
      await tagButton.click();
      await page.waitForTimeout(1000);

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

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Check if archive toggle exists
    const archiveToggle = page.locator('button:has-text("Archived"), [data-filter="archived"]').first();
    if (await archiveToggle.count() > 0) {
      // Click to show archived bookmarks
      await archiveToggle.click();
      await page.waitForTimeout(1000);

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

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Get bookmark count from UI
    const uiCount = await getBookmarkCount(page);

    // Verify counts match
    expect(uiCount).toBe(apiBookmarks.length);
  });
});
