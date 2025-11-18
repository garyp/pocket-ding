#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const screenshotsDir = join(__dirname, 'screenshots');

// Ensure screenshots directory exists
try {
  mkdirSync(screenshotsDir, { recursive: true });
} catch (err) {
  // Directory already exists
}

// Helper functions
const helpers = {
  async injectMockData(page) {
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const dbName = 'PocketDingDB';
        const request = indexedDB.open(dbName);

        request.onsuccess = () => {
          const db = request.result;

          const settingsTx = db.transaction(['settings'], 'readwrite');
          const settingsStore = settingsTx.objectStore('settings');
          settingsStore.put({
            id: 1,
            apiUrl: 'https://demo.linkding.link',
            apiToken: 'mock-token',
            syncInterval: 30,
            enableBackgroundSync: false,
            autoSync: false
          });

          const bookmarks = [
            { id: 1, title: 'TypeScript Documentation', url: 'https://typescriptlang.org/docs', description: 'Learn TypeScript', tag_names: ['programming', 'typescript', 'docs'], date_added: '2024-01-15T10:00:00Z', date_modified: '2024-01-15T10:00:00Z', unread: true, shared: false, archived: false },
            { id: 2, title: 'Lit Framework Guide', url: 'https://lit.dev', description: 'Web components with Lit', tag_names: ['programming', 'web-components'], date_added: '2024-02-20T14:30:00Z', date_modified: '2024-02-20T14:30:00Z', unread: false, shared: false, archived: false },
            { id: 3, title: 'Material Design 3', url: 'https://m3.material.io', description: 'Material Design guidelines', tag_names: ['design', 'ui'], date_added: '2024-03-10T09:15:00Z', date_modified: '2024-03-10T09:15:00Z', unread: false, shared: false, archived: true },
            { id: 4, title: 'IndexedDB Tutorial', url: 'https://developer.mozilla.org/docs/Web/API/IndexedDB_API', description: 'Learn IndexedDB', tag_names: ['programming', 'database'], date_added: '2024-01-05T16:45:00Z', date_modified: '2024-01-05T16:45:00Z', unread: true, shared: false, archived: false },
            { id: 5, title: 'PWA Best Practices', url: 'https://web.dev/pwa', description: 'Progressive Web Apps', tag_names: ['programming', 'pwa'], date_added: '2024-02-01T11:20:00Z', date_modified: '2024-02-01T11:20:00Z', unread: false, shared: false, archived: false }
          ];

          const bookmarksTx = db.transaction(['bookmarks'], 'readwrite');
          const bookmarksStore = bookmarksTx.objectStore('bookmarks');
          bookmarks.forEach(bookmark => bookmarksStore.put(bookmark));

          bookmarksTx.oncomplete = () => resolve();
          bookmarksTx.onerror = () => reject(bookmarksTx.error);
        };

        request.onerror = () => reject(request.error);
      });
    });
  },

  async clickFilterButton(page) {
    await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot || !appRoot.shadowRoot) return;
      const container = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!container || !container.shadowRoot) return;
      const iconButtons = container.shadowRoot.querySelectorAll('md-icon-button');
      for (const btn of iconButtons) {
        const icon = btn.querySelector('md-icon');
        if (icon && (icon.textContent === 'filter_list' || icon.textContent === 'tune')) {
          btn.click();
          return;
        }
      }
    });
  },

  async closeDialog(page) {
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('md-text-button')).find(btn => btn.textContent?.includes('Cancel'));
      if (cancelBtn) cancelBtn.click();
    });
  }
};

async function captureScreenshots() {
  console.log('Launching browser...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu', '--single-process']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Setting up app...');
  await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('app-root', { timeout: 10000 });
  await page.waitForTimeout(2000);
  await helpers.injectMockData(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Screenshot 1: Initial list
  console.log('1/10: Initial bookmark list');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '01-initial-bookmark-list.png'), fullPage: true });

  // Screenshot 2: Filter dialog
  console.log('2/10: Filter dialog open');
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '02-filter-dialog-open.png'), fullPage: true });

  // Screenshot 3: Tags selected
  console.log('3/10: Tags selected');
  const tagChips = page.locator('md-filter-chip');
  await tagChips.nth(0).click();
  await page.waitForTimeout(300);
  await tagChips.nth(1).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '03-filter-tags-selected.png'), fullPage: true });

  // Screenshot 4: Status filter
  console.log('4/10: Status filter');
  await helpers.closeDialog(page);
  await page.waitForTimeout(500);
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.locator('md-radio[value="unread"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '04-filter-status-options.png'), fullPage: true });

  // Screenshot 5: Date range (scroll down in dialog)
  console.log('5/10: Date range');
  await page.evaluate(() => {
    const dialog = document.querySelector('md-dialog');
    if (dialog) dialog.scrollTop = dialog.scrollHeight / 2;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '05-filter-date-range.png'), fullPage: true });

  // Screenshot 6: Filter applied - just click Apply button from current state
  console.log('6/10: Filter applied');
  await page.evaluate(() => {
    const applyBtn = Array.from(document.querySelectorAll('md-filled-button, md-text-button')).find(btn => btn.textContent?.trim() === 'Apply');
    if (applyBtn) applyBtn.click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(screenshotsDir, '06-filter-applied-summary.png'), fullPage: true });

  // Screenshot 7: Just the filtered list (same as 6 essentially)
  console.log('7/10: Filtered results');
  await page.screenshot({ path: join(screenshotsDir, '07-filtered-results.png'), fullPage: true });

  // Screenshot 8: Dark mode
  console.log('8/10: Dark mode');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(1000);
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '08-dark-mode-filter-dialog.png'), fullPage: true });

  // Screenshot 9: Mobile
  console.log('9/10: Mobile viewport');
  await helpers.closeDialog(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '09-mobile-filter-dialog.png'), fullPage: true });

  // Screenshot 10: Clear filters
  console.log('10/10: Clear filters button');
  await helpers.closeDialog(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.locator('md-text-button').filter({ hasText: 'Clear All' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '10-clear-filters.png'), fullPage: true });

  console.log('\n✅ All screenshots captured successfully!');
  console.log(`📁 Screenshots saved to: ${screenshotsDir}\n`);

  await browser.close();
}

captureScreenshots().catch(err => {
  console.error('❌ Error capturing screenshots:', err);
  process.exit(1);
});
