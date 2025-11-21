#!/usr/bin/env node

import { chromium } from '@playwright/test';

async function testApplyButton() {
  console.log('Launching browser...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu', '--single-process']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen for all events
  page.on('console', msg => {
    console.log(`  [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`  [PAGE ERROR] ${err.message}`);
  });

  page.on('crash', () => {
    console.log('  [CRASH] Page crashed!');
  });

  context.on('close', () => {
    console.log('  [CONTEXT CLOSE] Browser context closed!');
  });

  console.log('Loading page...');
  await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-root', { timeout: 10000 });
  await page.waitForTimeout(2000);

  console.log('Injecting mock data...');
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
          { id: 1, title: 'Test', url: 'https://test.com', tag_names: ['test'],
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

  console.log('Opening filter dialog...');
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

  console.log('Attempting to click Apply button...');
  try {
    const applyButton = page.getByRole('button', { name: /Apply/i });
    const isVisible = await applyButton.isVisible({ timeout: 1000 });
    console.log(`  Apply button visible: ${isVisible}`);

    if (isVisible) {
      console.log('  Clicking via evaluate...');
      await applyButton.evaluate(node => {
        console.log('  Inside evaluate, node:', node.tagName, node.textContent);
        node.click();
      });
      console.log('  Click completed!');
      await page.waitForTimeout(2000);
      console.log('  Page still alive after click');
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  await page.waitForTimeout(1000);
  console.log('Test complete!');
  await browser.close();
}

testApplyButton().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
