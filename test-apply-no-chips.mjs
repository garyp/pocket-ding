#!/usr/bin/env node

import { chromium } from '@playwright/test';

async function test() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu', '--single-process']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-root', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Inject mock data
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const request = indexedDB.open('PocketDingDB');
      request.onsuccess = () => {
        const db = request.result;
        const settingsTx = db.transaction(['settings'], 'readwrite');
        settingsTx.objectStore('settings').put({
          id: 1, apiUrl: 'https://demo.linkding.link', apiToken: 'mock-token',
          syncInterval: 30, enableBackgroundSync: false, autoSync: false
        });
        const bookmarks = [
          { id: 1, title: 'Test', url: 'https://test.com', tag_names: ['test', 'programming'],
            date_added: '2024-01-15T10:00:00Z', date_modified: '2024-01-15T10:00:00Z',
            unread: true, shared: false, archived: false }
        ];
        const bookmarksTx = db.transaction(['bookmarks'], 'readwrite');
        bookmarks.forEach(b => bookmarksTx.objectStore('bookmarks').put(b));
        bookmarksTx.oncomplete = () => resolve();
      };
    });
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Take initial screenshot
  console.log('1. Initial list screenshot');
  await page.screenshot({ path: '/tmp/01-initial.png' });

  // Open filter dialog
  console.log('2. Opening filter dialog');
  await page.evaluate(() => {
    const appRoot = document.querySelector('app-root');
    const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
    const iconButtons = container?.shadowRoot?.querySelectorAll('md-icon-button');
    for (const btn of iconButtons || []) {
      const icon = btn.querySelector('md-icon');
      if (icon?.textContent === 'filter_list' || icon?.textContent === 'tune') {
        btn.click();
        return;
      }
    }
  });

  await page.waitForSelector('md-dialog[open]', { timeout: 5000 });
  await page.waitForTimeout(500);
  console.log('3. Dialog opened');
  await page.screenshot({ path: '/tmp/02-dialog.png' });

  // Click Apply WITHOUT clicking any chips
  console.log('4. Clicking Apply (without selecting any filters)');
  const applyButton = page.getByRole('button', { name: /Apply/i });
  const isVisible = await applyButton.isVisible();
  console.log(`   Apply button visible: ${isVisible}`);

  await applyButton.evaluate(node => node.click());
  console.log('5. Apply clicked successfully!');

  await page.waitForTimeout(2000);
  console.log('6. Taking final screenshot');
  await page.screenshot({ path: '/tmp/03-after-apply.png' });

  console.log('Test complete!');
  await browser.close();
}

test().catch(err => console.error('Failed:', err.message));
