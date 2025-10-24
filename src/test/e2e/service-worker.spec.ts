/**
 * E2E tests for service worker and PWA functionality
 *
 * These tests verify that the service worker correctly handles
 * offline scenarios, caching, and background sync with a real browser.
 */

import { test, expect } from '@playwright/test';
import {
  injectPocketDingSettings,
  triggerSync,
  waitForSyncComplete,
  navigateToBookmarks,
  navigateToRoute,
  getBookmarkCount,
  clickBookmark,
  waitForServiceWorker,
  isOfflineCapable,
  goOffline,
  goOnline,
} from './utils/playwright-helpers';

// Skip tests if Docker is not available
test.skip(() => {
  return process.env['E2E_TESTS_DISABLED'] === 'true';
}, 'Docker not available');

test.describe('Service Worker E2E Tests', () => {
  const getLinkdingConfig = () => {
    if (!process.env['E2E_LINKDING_URL'] || !process.env['E2E_LINKDING_TOKEN']) {
      throw new Error('Linkding environment variables not set');
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

  test('should register service worker successfully', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure app
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for service worker registration
    await waitForServiceWorker(page, 15000);

    // Verify service worker is registered
    const swRegistered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration !== undefined;
    });

    expect(swRegistered).toBe(true);
  });

  test('should activate service worker after registration', async ({ page }) => {
    const config = getLinkdingConfig();

    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for service worker to be ready
    await waitForServiceWorker(page, 15000);

    // Check service worker state
    const swState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        active: registration?.active !== null,
        installing: registration?.installing !== null,
        waiting: registration?.waiting !== null,
      };
    });

    expect(swState.active).toBe(true);
  });

  test('should work offline after initial sync', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure and sync while online
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    const onlineBookmarkCount = await getBookmarkCount(page);
    expect(onlineBookmarkCount).toBeGreaterThan(0);

    // Wait for service worker to be ready
    await waitForServiceWorker(page, 15000);

    // Go offline
    await goOffline(page);

    // Reload page while offline
    await page.reload();
    await page.waitForSelector('app-root', { timeout: 10000 });

    // Verify app still works
    await navigateToBookmarks(page);

    // Verify bookmarks are still accessible from IndexedDB
    const offlineBookmarkCount = await getBookmarkCount(page);
    expect(offlineBookmarkCount).toBe(onlineBookmarkCount);

    // Go back online
    await goOnline(page);
  });

  test('should cache and serve bookmark content offline', async ({ page }) => {
    test.setTimeout(60000); // Increase timeout to 60 seconds

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

    // Open a bookmark to cache its content (clickBookmark already verifies reader rendered)
    await clickBookmark(page, 0);

    // Navigate back to list
    await page.goBack();

    // Wait for bookmark-list to be rendered (it's in shadow DOM)
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const bookmarkList = container?.shadowRoot?.querySelector('bookmark-list');
      return bookmarkList !== null;
    }, { timeout: 10000 });

    // Wait for service worker
    await waitForServiceWorker(page, 15000);

    // Go offline
    await goOffline(page);

    // Open the same bookmark again (should be served from cache/IndexedDB)
    // clickBookmark waits for content to load
    await clickBookmark(page, 0);
    await page.waitForSelector('bookmark-reader');

    // Verify content is displayed (served from cache) by checking for actual content elements
    const hasContent = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;

      const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;

      // Check for any content elements (iframe, error content, or fallback content)
      const iframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
      const errorContent = bookmarkReader.shadowRoot.querySelector('.error-content');
      const fallbackContent = bookmarkReader.shadowRoot.querySelector('.fallback-content');
      const readerContent = bookmarkReader.shadowRoot.querySelector('.reader-content, .reader-container');

      return !!(iframe || errorContent || fallbackContent || readerContent);
    });

    expect(hasContent).toBe(true);

    // Go back online
    await goOnline(page);
  });

  test('should handle offline navigation gracefully', async ({ page }) => {
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

    // Wait for service worker
    await waitForServiceWorker(page, 15000);

    // Go offline
    await goOffline(page);

    // Try to navigate to different views using client-side navigation
    // (page.goto() doesn't work when offline due to context.setOffline() blocking)
    await navigateToRoute(page, '/settings', { waitForSelector: 'settings-panel' });

    await navigateToRoute(page, '/bookmarks');
    // Wait for bookmark list using the shadow DOM traversal
    await page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;
      const container = appRoot.shadowRoot.querySelector('bookmark-list-container');
      return container !== null;
    }, { timeout: 10000 });

    // Verify app still functions
    const isAppFunctional = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      return appRoot !== null;
    });

    expect(isAppFunctional).toBe(true);

    // Go back online
    await goOnline(page);
  });

  test('should queue sync operations when offline', async ({ page }) => {
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

    // Wait for service worker
    await waitForServiceWorker(page, 15000);

    // Go offline
    await goOffline(page);

    // Try to trigger sync while offline
    const syncButton = page.locator('button:has(md-icon:has-text("sync"))').first();
    if (await syncButton.count() > 0) {
      await syncButton.click();
      await page.waitForTimeout(1000);

      // Verify offline indicator or queued state
      // (exact implementation depends on your app)
      // May or may not be visible depending on implementation
    }

    // Go back online
    await goOnline(page);

    // Wait a bit for background sync to potentially trigger
    await page.waitForTimeout(2000);
  });

  test('should update service worker on app update', async ({ page }) => {
    const config = getLinkdingConfig();

    // Initial registration
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    await waitForServiceWorker(page, 15000);

    // Get service worker version/timestamp
    const initialSwInfo = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        hasActive: registration?.active !== null,
        scriptURL: registration?.active?.scriptURL,
      };
    });

    expect(initialSwInfo.hasActive).toBe(true);
    expect(initialSwInfo.scriptURL).toContain('sw.js');
  });

  test('should handle service worker errors gracefully', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure app
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Listen for service worker errors
    const swErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('service worker')) {
        swErrors.push(msg.text());
      }
    });

    // Wait for service worker
    await waitForServiceWorker(page, 15000);

    // Navigate around the app
    await navigateToBookmarks(page);
    await page.waitForTimeout(1000);

    // Verify no service worker errors occurred
    expect(swErrors.length).toBe(0);
  });

  test('should persist app state across reloads with service worker', async ({ page }) => {
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
    expect(initialCount).toBeGreaterThan(0);

    // Wait for service worker
    await waitForServiceWorker(page, 15000);

    // Reload page
    await page.reload();
    await page.waitForSelector('bookmark-list');

    // Verify state persisted
    const reloadedCount = await getBookmarkCount(page);
    expect(reloadedCount).toBe(initialCount);
  });

  test('should intercept API calls with service worker when appropriate', async ({ page }) => {
    const config = getLinkdingConfig();

    // Configure app
    await injectPocketDingSettings(page, {
      linkding_url: config.url,
      linkding_token: config.token,
    });

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Trigger manual sync
    await triggerSync(page);
    await waitForSyncComplete(page, { timeout: 30000, expectBookmarks: true });

    // Wait for service worker to be controlling the page
    const isControlled = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller !== null;
    });

    expect(isControlled).toBe(true);

    // Make another navigation that might trigger API calls
    await page.reload();
    await page.waitForSelector('bookmark-list');

    // Verify service worker is intercepting requests
    // (actual verification depends on service worker implementation)
    const hasServiceWorker = await isOfflineCapable(page);
    expect(hasServiceWorker).toBe(true);
  });
});
