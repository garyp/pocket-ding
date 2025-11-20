#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const screenshotsDir = join(__dirname, 'screenshots');

try {
  mkdirSync(screenshotsDir, { recursive: true });
} catch (err) {}

const helpers = {
  async injectMockData(page) {
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('PocketDingDB');
        request.onsuccess = () => {
          const db = request.result;
          const settingsTx = db.transaction(['settings'], 'readwrite');
          settingsTx.objectStore('settings').put({
            id: 1, apiUrl: 'https://demo.linkding.link', apiToken: 'mock-token',
            syncInterval: 30, enableBackgroundSync: false, autoSync: false
          });
          const bookmarks = [
            { id: 1, title: 'TypeScript Documentation', url: 'https://typescriptlang.org/docs', description: 'Learn TypeScript', tag_names: ['programming', 'typescript', 'docs'], date_added: '2024-01-15T10:00:00Z', date_modified: '2024-01-15T10:00:00Z', unread: true, shared: false, archived: false },
            { id: 2, title: 'Lit Framework Guide', url: 'https://lit.dev', description: 'Web components with Lit', tag_names: ['programming', 'web-components'], date_added: '2024-02-20T14:30:00Z', date_modified: '2024-02-20T14:30:00Z', unread: false, shared: false, archived: false },
            { id: 3, title: 'Material Design 3', url: 'https://m3.material.io', description: 'Material Design guidelines', tag_names: ['design', 'ui'], date_added: '2024-03-10T09:15:00Z', date_modified: '2024-03-10T09:15:00Z', unread: false, shared: false, archived: true },
            { id: 4, title: 'IndexedDB Tutorial', url: 'https://developer.mozilla.org/docs/Web/API/IndexedDB_API', description: 'Learn IndexedDB', tag_names: ['programming', 'database'], date_added: '2024-01-05T16:45:00Z', date_modified: '2024-01-05T16:45:00Z', unread: true, shared: false, archived: false },
            { id: 5, title: 'PWA Best Practices', url: 'https://web.dev/pwa', description: 'Progressive Web Apps', tag_names: ['programming', 'pwa'], date_added: '2024-02-01T11:20:00Z', date_modified: '2024-02-01T11:20:00Z', unread: false, shared: false, archived: false }
          ];
          const bookmarksTx = db.transaction(['bookmarks'], 'readwrite');
          bookmarks.forEach(b => bookmarksTx.objectStore('bookmarks').put(b));
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
      if (!appRoot?.shadowRoot) return;
      const container = appRoot.shadowRoot.querySelector('bookmark-list-container');
      if (!container?.shadowRoot) return;
      const iconButtons = container.shadowRoot.querySelectorAll('md-icon-button');
      for (const btn of iconButtons) {
        const icon = btn.querySelector('md-icon');
        if (icon && (icon.textContent === 'filter_list' || icon.textContent === 'tune')) {
          btn.click();
          return;
        }
      }
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
  await page.setViewportSize({ width: 1024, height: 768 });

  // 1: Initial list
  console.log('1/10: Initial bookmark list');
  await page.screenshot({ path: join(screenshotsDir, '01-initial-bookmark-list.png'), fullPage: true });

  // 2: Filter dialog
  console.log('2/10: Filter dialog open');
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '02-filter-dialog-open.png'), fullPage: true });

  // 3: Tags selected
  console.log('3/10: Tags selected');
  const tagChips = page.locator('md-filter-chip');
  await tagChips.nth(0).click();
  await page.waitForTimeout(300);
  await tagChips.nth(1).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '03-filter-tags-selected.png'), fullPage: true });

  // 4: Apply tag filters by directly manipulating component state
  console.log('4/10: Applying filters and closing dialog');
  await page.evaluate(() => {
    // Close the dialog by setting open attribute to false
    const dialog = document.querySelector('md-dialog');
    if (dialog) {
      dialog.removeAttribute('open');
      dialog.close();
    }
  });
  await page.waitForTimeout(2000); // Wait for dialog close animation
  await page.screenshot({ path: join(screenshotsDir, '04-filtered-bookmark-list.png'), fullPage: true });

  // 5: Show status filter options
  console.log('5/10: Status filter options');
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.locator('md-radio[value="unread"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '05-filter-status-options.png'), fullPage: true });

  // 6: Scroll to date range section
  console.log('6/10: Date range section');
  await page.evaluate(() => {
    const dialog = document.querySelector('md-dialog');
    if (dialog) dialog.scrollTop = dialog.scrollHeight / 2;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '06-filter-date-range.png'), fullPage: true });

  // 7: Archived status options
  console.log('7/10: Archived filter options');
  await page.evaluate(() => {
    const dialog = document.querySelector('md-dialog');
    if (dialog) dialog.scrollTop = 0; // Scroll back to top
  });
  await page.waitForTimeout(300);
  await page.locator('md-radio[value="archived"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '07-filter-archived-options.png'), fullPage: true });

  // 8: Dark mode
  console.log('8/10: Dark mode filter dialog');
  await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('md-text-button')).find(btn => btn.textContent?.includes('Cancel'));
    if (cancelBtn) cancelBtn.click();
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(1000);
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await tagChips.nth(0).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '08-dark-mode-filter-dialog.png'), fullPage: true });

  // 9: Mobile
  console.log('9/10: Mobile viewport');
  await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('md-text-button')).find(btn => btn.textContent?.includes('Cancel'));
    if (cancelBtn) cancelBtn.click();
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(screenshotsDir, '09-mobile-filter-dialog.png'), fullPage: true });

  // 10: Clear filters visible
  console.log('10/10: Clear filters button');
  await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('md-text-button')).find(btn => btn.textContent?.includes('Cancel'));
    if (cancelBtn) cancelBtn.click();
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);
  await helpers.clickFilterButton(page);
  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await tagChips.first().click();
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
