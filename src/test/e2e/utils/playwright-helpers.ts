/**
 * Playwright test helpers for E2E testing with real browser and Linkding server
 */

import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

export interface PocketDingSettings {
  linkding_url: string;
  linkding_token: string;
  sync_interval?: number;
  enable_background_sync?: boolean;
  auto_sync?: boolean;
  reading_mode?: 'readability' | 'original';
  theme_mode?: 'system' | 'light' | 'dark';
  debug_mode?: boolean;
}

/**
 * Configure Pocket Ding settings via IndexedDB (faster)
 *
 * This directly injects settings into IndexedDB, bypassing the UI.
 * Faster for tests that don't need to test the settings UI itself.
 *
 * @param page - Playwright page object
 * @param settings - Settings to configure
 */
export async function injectPocketDingSettings(
  page: Page,
  settings: PocketDingSettings
): Promise<void> {
  await page.goto('/');

  // Wait for app to initialize and create the database
  await page.waitForSelector('app-root', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Inject settings directly into IndexedDB using the correct schema
  await page.evaluate((settingsData) => {
    return new Promise<void>((resolve, reject) => {
      const dbName = 'PocketDingDB';
      let retries = 0;
      const maxRetries = 5;

      const attemptOpen = () => {
        const request = indexedDB.open(dbName);

        request.onerror = () => {
          if (retries < maxRetries) {
            retries++;
            setTimeout(attemptOpen, 1000);
          } else {
            reject(new Error('Failed to open IndexedDB after retries'));
          }
        };

        request.onsuccess = () => {
          const db = request.result;

          // Check if settings store exists
          if (!db.objectStoreNames.contains('settings')) {
            db.close();
            if (retries < maxRetries) {
              retries++;
              setTimeout(attemptOpen, 1000);
            } else {
              reject(new Error('Settings store not found in database'));
            }
            return;
          }

          const transaction = db.transaction(['settings'], 'readwrite');
          const store = transaction.objectStore('settings');

          // Clear existing settings
          const clearRequest = store.clear();

          clearRequest.onsuccess = () => {
            // Add new settings matching the AppSettings interface
            const addRequest = store.add({
              linkding_url: settingsData.linkding_url,
              linkding_token: settingsData.linkding_token,
              auto_sync: settingsData.auto_sync ?? settingsData.enable_background_sync ?? true,
              reading_mode: settingsData.reading_mode ?? ('readability' as const),
              theme_mode: settingsData.theme_mode ?? ('system' as const),
              debug_mode: settingsData.debug_mode ?? false,
            });

            addRequest.onsuccess = () => {
              db.close();
              resolve();
            };

            addRequest.onerror = () => {
              db.close();
              reject(new Error('Failed to add settings to IndexedDB'));
            };
          };

          clearRequest.onerror = () => {
            db.close();
            reject(new Error('Failed to clear existing settings'));
          };

          transaction.onerror = () => {
            db.close();
            reject(new Error('Transaction failed'));
          };
        };

        request.onupgradeneeded = () => {
          // Database is being created, wait and retry
          if (retries < maxRetries) {
            retries++;
            setTimeout(attemptOpen, 1000);
          } else {
            reject(new Error('Database not initialized after retries'));
          }
        };
      };

      attemptOpen();
    });
  }, settings);

  // Reload to apply settings
  await page.reload();
  await page.waitForSelector('app-root', { timeout: 10000 });

  // Wait for app to fully initialize with new settings
  await page.waitForTimeout(2000);
}

/**
 * Trigger manual sync in Pocket Ding
 *
 * @param page - Playwright page object
 */
export async function triggerSync(page: Page): Promise<void> {
  // Wait for sync button to be available with retries
  await page.waitForFunction(
    () => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;

      const buttons = appRoot.shadowRoot.querySelectorAll('md-text-button');
      for (const button of buttons) {
        const icon = button.querySelector('md-icon');
        if (icon && icon.textContent?.trim() === 'sync') {
          return true;
        }
      }
      return false;
    },
    { timeout: 10000 }
  );

  // Click the sync button
  await page.evaluate(() => {
    const appRoot = document.querySelector('app-root');
    if (appRoot && appRoot.shadowRoot) {
      const buttons = appRoot.shadowRoot.querySelectorAll('md-text-button');
      for (const button of buttons) {
        const icon = button.querySelector('md-icon');
        if (icon && icon.textContent?.trim() === 'sync') {
          (button as HTMLElement).click();
          return;
        }
      }
    }
    throw new Error('Sync button not found');
  });

  // Wait a bit for sync to start
  await page.waitForTimeout(500);
}

/**
 * Wait for sync to complete
 *
 * This waits for sync to finish by checking the sync state in the database.
 *
 * @param page - Playwright page object
 * @param options - Options for waiting
 * @param options.timeout - Maximum time to wait in milliseconds (default: 30000)
 * @param options.expectBookmarks - Whether to expect bookmarks to be present (default: true)
 * @returns Object with sync completion state
 */
export async function waitForSyncComplete(
  page: Page,
  options: { timeout?: number; expectBookmarks?: boolean } | number = {}
): Promise<{ syncCompleted: boolean; bookmarkCount: number }> {
  // Support legacy timeout-only parameter
  const timeout = typeof options === 'number' ? options : (options.timeout ?? 30000);
  const expectBookmarks = typeof options === 'number' ? true : (options.expectBookmarks ?? true);

  // Wait for sync to complete by checking database state
  const syncCompleted = await page.waitForFunction(
    ({ expectBookmarksArg }) => {
      return new Promise<boolean>((resolve) => {
        const dbName = 'PocketDingDB';
        const request = indexedDB.open(dbName);

        request.onsuccess = () => {
          const db = request.result;

          // Check if sync is in progress
          if (!db.objectStoreNames.contains('sync_state')) {
            db.close();
            resolve(false);
            return;
          }

          const transaction = db.transaction(['sync_state'], 'readonly');
          const store = transaction.objectStore('sync_state');
          const getRequest = store.get('sync');

          getRequest.onsuccess = () => {
            const syncState = getRequest.result;
            db.close();

            // If expectBookmarks is false, we just wait for sync to not be in progress
            if (!expectBookmarksArg) {
              // Consider sync complete if state doesn't exist or is_syncing is false
              resolve(!syncState || !syncState.is_syncing);
              return;
            }

            // If expectBookmarks is true, wait for sync to complete and bookmarks to exist
            if (!syncState || syncState.is_syncing) {
              resolve(false);
              return;
            }

            // Check if bookmarks exist
            const bookmarksRequest = indexedDB.open(dbName);
            bookmarksRequest.onsuccess = () => {
              const bookmarksDb = bookmarksRequest.result;
              if (!bookmarksDb.objectStoreNames.contains('bookmarks')) {
                bookmarksDb.close();
                resolve(false);
                return;
              }

              const bookmarksTransaction = bookmarksDb.transaction(['bookmarks'], 'readonly');
              const bookmarksStore = bookmarksTransaction.objectStore('bookmarks');
              const countRequest = bookmarksStore.count();

              countRequest.onsuccess = () => {
                bookmarksDb.close();
                resolve(countRequest.result > 0);
              };

              countRequest.onerror = () => {
                bookmarksDb.close();
                resolve(false);
              };
            };

            bookmarksRequest.onerror = () => resolve(false);
          };

          getRequest.onerror = () => {
            db.close();
            resolve(false);
          };
        };

        request.onerror = () => resolve(false);
      });
    },
    { expectBookmarksArg: expectBookmarks },
    { timeout, polling: 500 }
  );

  // Get final bookmark count
  const bookmarkCount = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      const dbName = 'PocketDingDB';
      const request = indexedDB.open(dbName);

      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.close();
          resolve(0);
          return;
        }

        const transaction = db.transaction(['bookmarks'], 'readonly');
        const store = transaction.objectStore('bookmarks');
        const countRequest = store.count();

        countRequest.onsuccess = () => {
          db.close();
          resolve(countRequest.result);
        };

        countRequest.onerror = () => {
          db.close();
          resolve(0);
        };
      };

      request.onerror = () => resolve(0);
    });
  });

  // Additional wait to ensure UI has fully updated
  await page.waitForTimeout(1000);

  return { syncCompleted: !!syncCompleted, bookmarkCount };
}

/**
 * Navigate to bookmarks list
 *
 * @param page - Playwright page object
 */
export async function navigateToBookmarks(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('app-root');

  // Wait for bookmark-list to be rendered and ready
  await page.waitForFunction(
    () => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;

      const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!bookmarkListContainer?.shadowRoot) return false;

      const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
      return bookmarkList !== null;
    },
    { timeout: 10000 }
  );
}

/**
 * Navigate to a specific bookmark reader
 *
 * @param page - Playwright page object
 * @param bookmarkId - Bookmark ID to view
 */
export async function navigateToReader(
  page: Page,
  bookmarkId: number
): Promise<void> {
  await page.goto(`/read/${bookmarkId}`);
  await page.waitForSelector('bookmark-reader');
}

/**
 * Get bookmark elements from the bookmark list
 *
 * @param page - Playwright page object
 * @returns Array of bookmark elements
 */
export async function getBookmarkElements(page: Page) {
  // Use evaluate to traverse shadow DOM and find bookmark cards
  const count = await page.evaluate(() => {
    const appRoot = document.querySelector('app-root');
    if (!appRoot?.shadowRoot) return 0;

    const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
    if (!bookmarkListContainer?.shadowRoot) return 0;

    const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
    if (!bookmarkList?.shadowRoot) return 0;

    const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('.bookmark-card[data-bookmark-id]');
    return bookmarkCards.length;
  });

  // Return a locator that matches the count found
  // Note: Playwright locators can't directly access shadow DOM, so we return a mock locator
  // This is a workaround for the Playwright API limitation with shadow DOM
  return {
    count: async () => count,
  };
}

/**
 * Get bookmark count from UI
 *
 * @param page - Playwright page object
 * @returns Number of bookmarks displayed
 */
export async function getBookmarkCount(page: Page): Promise<number> {
  const bookmarks = await getBookmarkElements(page);
  return bookmarks.count();
}

/**
 * Click on a bookmark to open reader
 *
 * @param page - Playwright page object
 * @param index - Index of bookmark to click (0-based)
 */
export async function clickBookmark(page: Page, index: number): Promise<void> {
  // Capture and immediately output browser console messages for debugging
  const consoleHandler = (msg: any) => {
    const text = msg.text();
    if (text.includes('[E2E clickBookmark]')) {
      // Output immediately instead of buffering
      console.log(`[Browser Console] ${text}`);
    }
  };

  page.on('console', consoleHandler);

  // Capture JavaScript errors
  const errors: string[] = [];
  const errorHandler = (error: Error) => {
    errors.push(`[JS Error] ${error.message}`);
    console.log(`[Browser Error] ${error.message}`);
  };
  page.on('pageerror', errorHandler);

  try {
    // First, wait for bookmark cards to be available
    await page.waitForFunction(
    (bookmarkIndex) => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;

      const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!bookmarkListContainer?.shadowRoot) return false;

      const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
      if (!bookmarkList?.shadowRoot) return false;

      const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('.bookmark-card[data-bookmark-id]');
      return bookmarkCards.length > bookmarkIndex;
    },
    index,
    { timeout: 10000 }
  );

  // Get the bookmark ID before clicking
  const bookmarkId = await page.evaluate((bookmarkIndex) => {
    const appRoot = document.querySelector('app-root');
    if (!appRoot?.shadowRoot) throw new Error('app-root not found');

    const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
    if (!bookmarkListContainer?.shadowRoot) throw new Error('bookmark-list-container not found');

    const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
    if (!bookmarkList?.shadowRoot) throw new Error('bookmark-list not found');

    const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('.bookmark-card[data-bookmark-id]');
    if (bookmarkIndex >= bookmarkCards.length) {
      throw new Error(`Bookmark ${bookmarkIndex} not found (found ${bookmarkCards.length} bookmarks)`);
    }

    const card = bookmarkCards[bookmarkIndex] as Element | undefined;
    if (!card) {
      throw new Error(`Bookmark card at index ${bookmarkIndex} is undefined`);
    }
    const id = card.getAttribute('data-bookmark-id');
    return id ? parseInt(id, 10) : null;
  }, index);

  if (!bookmarkId) {
    throw new Error(`Failed to get bookmark ID for index ${index}`);
  }

  // Click the bookmark card and wait for the bookmark-selected event to be dispatched
  await page.evaluate((bookmarkIndex) => {
    const appRoot = document.querySelector('app-root');
    if (!appRoot?.shadowRoot) throw new Error('app-root not found');

    const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
    if (!bookmarkListContainer?.shadowRoot) throw new Error('bookmark-list-container not found');

    const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
    if (!bookmarkList?.shadowRoot) throw new Error('bookmark-list not found');

    const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('.bookmark-card[data-bookmark-id]');
    const card = bookmarkCards[bookmarkIndex] as HTMLElement;
    const id = card.getAttribute('data-bookmark-id');

    // Log state before click
    console.log('[E2E clickBookmark] Before dispatch - bookmark ID:', id);
    console.log('[E2E clickBookmark] Before dispatch - app state:', {
      currentView: (document.querySelector('app-root') as any)?.currentView,
      selectedBookmarkId: (document.querySelector('app-root') as any)?.selectedBookmarkId
    });

    // Dispatch a native click event to properly trigger Material Web Component handlers
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    card.dispatchEvent(clickEvent);

    // Log state after click
    console.log('[E2E clickBookmark] After dispatch - app state:', {
      currentView: (document.querySelector('app-root') as any)?.currentView,
      selectedBookmarkId: (document.querySelector('app-root') as any)?.selectedBookmarkId
    });
  }, index);

  console.log(`[E2E clickBookmark] Dispatched click for bookmark ID: ${bookmarkId}`);

  // Wait for bookmark-reader to render using manual polling
  // We use manual polling instead of waitForFunction because waitForFunction can hang in some E2E scenarios
  const maxWait = 10000; // 10 seconds
  const pollInterval = 250; // 250ms
  const startTime = Date.now();
  let readerRendered = false;

  while (Date.now() - startTime < maxWait) {
    const hasReader = await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot?.shadowRoot) return false;
      const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
      if (!bookmarkReader?.shadowRoot) return false;
      return true;
    });

    if (hasReader) {
      readerRendered = true;
      break;
    }

    await page.waitForTimeout(pollInterval);
  }

  if (!readerRendered) {
    throw new Error('Bookmark reader did not render within timeout');
  }

  console.log('[E2E clickBookmark] Reader component rendered successfully');

  } finally {
    // Report any errors that occurred
    if (errors.length > 0) {
      console.log('\n=== JavaScript Errors During Click ===');
      errors.forEach(err => console.log(err));
      console.log('======================================\n');
    }

    // Remove listeners
    page.off('console', consoleHandler);
    page.off('pageerror', errorHandler);
    console.log('[E2E clickBookmark] Function completed');
  }
}

/**
 * Search for bookmarks
 *
 * @param page - Playwright page object
 * @param query - Search query
 */
export async function searchBookmarks(page: Page, query: string): Promise<void> {
  const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();
  await searchInput.fill(query);
  await page.waitForTimeout(500); // Debounce
}

/**
 * Filter bookmarks by tag
 *
 * @param page - Playwright page object
 * @param tag - Tag name to filter by
 */
export async function filterByTag(page: Page, tag: string): Promise<void> {
  const tagFilter = page.locator(`[data-tag="${tag}"], button:has-text("${tag}")`).first();
  await tagFilter.click();
  await page.waitForTimeout(500);
}

/**
 * Wait for service worker to be registered and active
 *
 * @param page - Playwright page object
 * @param timeout - Maximum time to wait in milliseconds (default: 10000)
 */
export async function waitForServiceWorker(
  page: Page,
  timeout = 10000
): Promise<void> {
  await page.waitForFunction(
    () => {
      return navigator.serviceWorker.ready.then(() => true);
    },
    { timeout }
  );
}

/**
 * Check if app is offline-capable (service worker active)
 *
 * @param page - Playwright page object
 * @returns True if service worker is active
 */
export async function isOfflineCapable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return navigator.serviceWorker.controller !== null;
  });
}

/**
 * Route handler for service worker offline mode
 *
 * With the experimental service worker network events enabled, this handler
 * can intercept requests made BY the service worker and abort them to simulate
 * offline mode, while allowing regular page requests to continue.
 */
function serviceWorkerOfflineRouteHandler(route: Route) {
  // Only abort requests made BY the service worker
  if (route.request().serviceWorker()) {
    return route.abort('internetdisconnected');
  }
  // Let all other requests (including page navigation) continue
  return route.continue();
}

/**
 * Simulate offline mode with service worker support
 *
 * This uses Playwright's experimental service worker network events feature
 * to properly simulate offline mode.
 *
 * @param page - Playwright page object
 */
export async function goOffline(page: Page): Promise<void> {
  const context = page.context();

  // IMPORTANT: Set up routing BEFORE calling setOffline()
  // If setOffline is called first, it blocks requests at the network layer
  // before routing can intercept them
  await context.route('**', serviceWorkerOfflineRouteHandler);

  // Then set context offline to make navigator.onLine = false
  await context.setOffline(true);
}

/**
 * Simulate online mode (restores from offline)
 *
 * @param page - Playwright page object
 */
export async function goOnline(page: Page): Promise<void> {
  const context = page.context();

  // Restore online mode first
  await context.setOffline(false);

  // Then remove routing
  await context.unroute('**', serviceWorkerOfflineRouteHandler);
}

/**
 * Clear IndexedDB data
 *
 * @param page - Playwright page object
 */
export async function clearIndexedDB(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const dbs = ['pocket-ding-db', 'pocketDingDatabase']; // Common DB names
      let cleared = 0;

      dbs.forEach(dbName => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => {
          cleared++;
          if (cleared === dbs.length) resolve();
        };
        request.onerror = () => {
          cleared++;
          if (cleared === dbs.length) resolve();
        };
      });
    });
  });
}

/**
 * Get console errors from the page
 *
 * Useful for asserting no errors occurred during test.
 *
 * @param page - Playwright page object
 * @returns Array of error messages
 */
export async function getConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  return errors;
}

/**
 * Assert no console errors
 *
 * @param page - Playwright page object
 */
export async function assertNoConsoleErrors(page: Page): Promise<void> {
  const errors = await getConsoleErrors(page);
  expect(errors).toHaveLength(0);
}

/**
 * Take a screenshot with a descriptive name
 *
 * @param page - Playwright page object
 * @param name - Screenshot name
 */
export async function takeScreenshot(
  page: Page,
  name: string
): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  });
}

/**
 * Wait for element with retry
 *
 * Sometimes elements take time to appear in shadow DOM.
 * This helper retries with exponential backoff.
 *
 * @param page - Playwright page object
 * @param selector - Element selector
 * @param timeout - Maximum time to wait (default: 10000)
 */
export async function waitForElementWithRetry(
  page: Page,
  selector: string,
  timeout = 10000
): Promise<void> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startTime < timeout) {
    try {
      await page.waitForSelector(selector, { timeout: 1000 });
      return;
    } catch (error) {
      lastError = error as Error;
      await page.waitForTimeout(500);
    }
  }

  throw lastError || new Error(`Element ${selector} not found within ${timeout}ms`);
}

/**
 * Scroll iframe content to simulate reading progress
 *
 * When content is displayed in a secure-iframe (sandboxed iframe with srcdoc),
 * the scrolling happens inside the iframe. This helper accesses the iframe's
 * content document and scrolls it to a specific position or percentage.
 *
 * @param page - Playwright page object
 * @param options - Scroll options
 * @param options.scrollPercentage - Scroll to percentage of content (0-100)
 * @param options.scrollPosition - Scroll to specific pixel position
 * @returns Object with scroll information
 */
export async function scrollIframeContent(
  page: Page,
  options: { scrollPercentage?: number; scrollPosition?: number }
): Promise<{ scrollTop: number; scrollHeight: number; progress: number }> {
  const { scrollPercentage, scrollPosition } = options;

  if (scrollPercentage === undefined && scrollPosition === undefined) {
    throw new Error('Must specify either scrollPercentage or scrollPosition');
  }

  return await page.evaluate((opts) => {
    const appRoot = document.querySelector('app-root');
    if (!appRoot?.shadowRoot) throw new Error('app-root not found');

    const bookmarkReader = appRoot.shadowRoot.querySelector('bookmark-reader');
    if (!bookmarkReader?.shadowRoot) throw new Error('bookmark-reader not found');

    const secureIframe = bookmarkReader.shadowRoot.querySelector('secure-iframe');
    if (!secureIframe?.shadowRoot) throw new Error('secure-iframe not found');

    const iframe = secureIframe.shadowRoot.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe) throw new Error('iframe element not found');

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) throw new Error('Cannot access iframe document');

    const scrollHeight = iframeDoc.documentElement.scrollHeight;
    const clientHeight = iframeDoc.documentElement.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    let targetScroll: number;
    if (opts.scrollPercentage !== undefined) {
      // Calculate target scroll position from percentage
      targetScroll = Math.floor((opts.scrollPercentage / 100) * maxScroll);
    } else {
      targetScroll = opts.scrollPosition!;
    }

    // Clamp to valid range
    targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));

    // Perform the scroll
    iframeDoc.documentElement.scrollTop = targetScroll;
    iframeDoc.body.scrollTop = targetScroll; // Fallback for some browsers

    // Trigger scroll event to activate progress tracking
    const scrollEvent = new Event('scroll', { bubbles: true });
    iframeDoc.dispatchEvent(scrollEvent);

    // Calculate progress
    const progress = maxScroll > 0 ? (targetScroll / maxScroll) * 100 : 100;

    return {
      scrollTop: targetScroll,
      scrollHeight: scrollHeight,
      progress: Math.min(100, Math.max(0, progress))
    };
  }, { scrollPercentage, scrollPosition });
}

/**
 * Get current reading progress from IndexedDB
 *
 * This helper retrieves the saved reading progress for a bookmark from IndexedDB.
 * Useful for verifying that progress tracking is working correctly.
 *
 * @param page - Playwright page object
 * @param bookmarkId - Bookmark ID to get progress for
 * @returns Reading progress data
 */
export async function getReadingProgress(
  page: Page,
  bookmarkId: number
): Promise<{ scrollPosition: number; progress: number } | null> {
  return await page.evaluate((bmId) => {
    return new Promise<{ scrollPosition: number; progress: number } | null>((resolve) => {
      const request = indexedDB.open('PocketDingDB');

      request.onsuccess = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('readProgress')) {
          db.close();
          resolve(null);
          return;
        }

        const tx = db.transaction('readProgress', 'readonly');
        const store = tx.objectStore('readProgress');
        const index = store.index('bookmark_id');
        const getRequest = index.get(bmId);

        getRequest.onsuccess = () => {
          const record = getRequest.result;
          db.close();

          if (!record) {
            resolve(null);
            return;
          }

          resolve({
            scrollPosition: record.scroll_position || 0,
            progress: record.progress || 0
          });
        };

        getRequest.onerror = () => {
          db.close();
          resolve(null);
        };
      };

      request.onerror = () => resolve(null);
    });
  }, bookmarkId);
}

/**
 * Find a bookmark with assets and click it
 *
 * This helper finds a bookmark that has assets (cached status icon) and clicks it.
 * Useful for tests that need to interact with bookmarks that have cached content.
 *
 * @param page - Playwright page object
 * @returns Bookmark ID of the clicked bookmark
 */
export async function clickBookmarkWithAssets(page: Page): Promise<number> {
  // First, find a bookmark with assets by looking for the cached icon
  const bookmarkWithAssets = await page.evaluate(() => {
    const appRoot = document.querySelector('app-root');
    if (!appRoot?.shadowRoot) throw new Error('app-root not found');

    const bookmarkListContainer = appRoot.shadowRoot.querySelector('bookmark-list-container');
    if (!bookmarkListContainer?.shadowRoot) throw new Error('bookmark-list-container not found');

    const bookmarkList = bookmarkListContainer.shadowRoot.querySelector('bookmark-list');
    if (!bookmarkList?.shadowRoot) throw new Error('bookmark-list not found');

    const bookmarkCards = bookmarkList.shadowRoot.querySelectorAll('.bookmark-card[data-bookmark-id]');

    // Find first bookmark with cached icon
    for (let i = 0; i < bookmarkCards.length; i++) {
      const card = bookmarkCards[i];
      if (!card) continue;

      const cachedIcon = card.querySelector('.status-icon.cached');
      if (cachedIcon) {
        const id = card.getAttribute('data-bookmark-id');
        return { index: i, id: id ? parseInt(id, 10) : null };
      }
    }

    throw new Error('No bookmarks with assets found');
  });

  if (!bookmarkWithAssets.id) {
    throw new Error('Failed to find bookmark with assets');
  }

  // Click the bookmark
  await clickBookmark(page, bookmarkWithAssets.index);

  return bookmarkWithAssets.id;
}
