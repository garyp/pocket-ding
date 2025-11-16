/**
 * Visual tests for the filtering feature
 * These tests capture screenshots to showcase the UI
 */

import { test, expect } from '@playwright/test';

test.describe('Filter Feature Visual Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API to provide bookmarks with various tags and statuses
    await page.route('**/api/bookmarks**', async route => {
      const bookmarks = [
        {
          id: 1,
          title: 'Introduction to Web Components',
          url: 'https://example.com/web-components',
          description: 'Learn about custom elements and shadow DOM',
          tag_names: ['tech', 'webdev', 'frontend'],
          date_added: new Date().toISOString(),
          date_modified: new Date().toISOString(),
          unread: true,
          shared: false,
          is_archived: false,
          notes: '',
          website_title: '',
          website_description: '',
          web_archive_snapshot_url: '',
          favicon_url: '',
          preview_image_url: ''
        },
        {
          id: 2,
          title: 'Advanced TypeScript Patterns',
          url: 'https://example.com/typescript',
          description: 'Deep dive into TypeScript advanced types',
          tag_names: ['tech', 'typescript', 'programming'],
          date_added: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          date_modified: new Date().toISOString(),
          unread: false,
          shared: false,
          is_archived: false,
          notes: '',
          website_title: '',
          website_description: '',
          web_archive_snapshot_url: '',
          favicon_url: '',
          preview_image_url: ''
        },
        {
          id: 3,
          title: 'Building Progressive Web Apps',
          url: 'https://example.com/pwa',
          description: 'Complete guide to PWA development',
          tag_names: ['tech', 'pwa', 'mobile'],
          date_added: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          date_modified: new Date().toISOString(),
          unread: false,
          shared: false,
          is_archived: true,
          notes: '',
          website_title: '',
          website_description: '',
          web_archive_snapshot_url: '',
          favicon_url: '',
          preview_image_url: ''
        },
        {
          id: 4,
          title: 'React vs Vue Performance',
          url: 'https://example.com/frameworks',
          description: 'Comparing framework performance',
          tag_names: ['frontend', 'frameworks', 'performance'],
          date_added: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          date_modified: new Date().toISOString(),
          unread: true,
          shared: false,
          is_archived: false,
          notes: '',
          website_title: '',
          website_description: '',
          web_archive_snapshot_url: '',
          favicon_url: '',
          preview_image_url: ''
        },
        {
          id: 5,
          title: 'CSS Grid Layout Guide',
          url: 'https://example.com/css-grid',
          description: 'Master CSS Grid with examples',
          tag_names: ['css', 'frontend', 'design'],
          date_added: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          date_modified: new Date().toISOString(),
          unread: false,
          shared: false,
          is_archived: false,
          notes: '',
          website_title: '',
          website_description: '',
          web_archive_snapshot_url: '',
          favicon_url: '',
          preview_image_url: ''
        }
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: bookmarks.length,
          next: null,
          previous: null,
          results: bookmarks
        })
      });
    });

    // Mock settings
    await page.addInitScript(() => {
      localStorage.setItem('linkding-settings', JSON.stringify({
        apiUrl: 'https://demo.linkding.link',
        apiToken: 'test-token'
      }));
    });

    await page.goto('/');
    await page.waitForSelector('bookmark-list-container', { timeout: 10000 });
  });

  test('Desktop - Filter summary in default state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Wait for the filter summary to be visible
    await page.waitForTimeout(500);

    // Take screenshot of the entire filter area
    await page.screenshot({
      path: 'screenshots/filter-summary-default-desktop.png',
      fullPage: false
    });
  });

  test('Desktop - Filter dialog open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Click filter button to open dialog
    await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const filterButton = container?.shadowRoot?.querySelector('md-icon-button');
      if (filterButton) (filterButton as HTMLElement).click();
    });

    // Wait for dialog animation
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: 'screenshots/filter-dialog-open-desktop.png',
      fullPage: false
    });
  });

  test('Desktop - Filter dialog with tag selection', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Open filter dialog
    await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const filterButton = container?.shadowRoot?.querySelector('md-icon-button');
      if (filterButton) (filterButton as HTMLElement).click();
    });

    await page.waitForTimeout(500);

    // Select some tags
    await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const filterDialog = container?.shadowRoot?.querySelector('filter-dialog');

      // Click on filter chips
      const chips = filterDialog?.shadowRoot?.querySelectorAll('md-filter-chip');
      if (chips && chips.length > 0) {
        // Select first two tags
        (chips[0] as HTMLElement)?.click();
        setTimeout(() => (chips[1] as HTMLElement)?.click(), 100);
      }
    });

    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: 'screenshots/filter-dialog-with-tags-desktop.png',
      fullPage: false
    });
  });

  test('Desktop - Filter dialog with all options selected', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Open filter dialog
    await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const filterButton = container?.shadowRoot?.querySelector('md-icon-button');
      if (filterButton) (filterButton as HTMLElement).click();
    });

    await page.waitForTimeout(500);

    // Select various filters
    await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const filterDialog = container?.shadowRoot?.querySelector('filter-dialog');

      // Select a tag
      const chips = filterDialog?.shadowRoot?.querySelectorAll('md-filter-chip');
      if (chips && chips.length > 0) {
        (chips[0] as HTMLElement)?.click();
      }

      // Select "Unread only"
      const radios = filterDialog?.shadowRoot?.querySelectorAll('md-radio');
      const unreadRadio = Array.from(radios || []).find((r: any) => r.value === 'unread');
      if (unreadRadio) (unreadRadio as HTMLElement).click();

      // Select "Last 7 days"
      const dateButtons = filterDialog?.shadowRoot?.querySelectorAll('.date-preset-btn');
      const last7DaysBtn = Array.from(dateButtons || []).find((btn: any) =>
        btn.textContent?.includes('Last 7 days')
      );
      if (last7DaysBtn) (last7DaysBtn as HTMLElement).click();
    });

    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: 'screenshots/filter-dialog-full-selection-desktop.png',
      fullPage: false
    });
  });

  test('Mobile - Filter summary and button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size

    // Wait for render
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: 'screenshots/filter-summary-mobile.png',
      fullPage: true
    });
  });

  test('Mobile - Filter dialog open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Open filter dialog
    await page.evaluate(() => {
      const appRoot = document.querySelector('app-root');
      const container = appRoot?.shadowRoot?.querySelector('bookmark-list-container');
      const filterButton = container?.shadowRoot?.querySelector('md-icon-button');
      if (filterButton) (filterButton as HTMLElement).click();
    });

    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: 'screenshots/filter-dialog-mobile.png',
      fullPage: true
    });
  });
});
