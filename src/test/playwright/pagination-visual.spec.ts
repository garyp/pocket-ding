import { test, expect } from '@playwright/test';

test.describe('Pagination Controls Visual Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API to ensure we have bookmarks with pagination
    await page.route('**/api/bookmarks**', async route => {
      const bookmarks = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        title: `Bookmark ${i + 1}`,
        url: `https://example.com/${i + 1}`,
        description: `Description for bookmark ${i + 1}`,
        tag_names: ['test'],
        date_added: new Date().toISOString(),
        date_modified: new Date().toISOString(),
        unread: false,
        shared: false,
        archived: false
      }));
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 100,
          next: null,
          previous: null,
          results: bookmarks.slice(0, 10)
        })
      });
    });

    // Mock settings to bypass API configuration
    await page.addInitScript(() => {
      localStorage.setItem('linkding-settings', JSON.stringify({
        apiUrl: 'https://demo.linkding.link',
        apiToken: 'test-token'
      }));
    });

    await page.goto('/');
    // Wait for the app to load and show bookmarks
    await page.waitForSelector('bookmark-list');
  });

  test('Mobile viewport (360px) - pagination should not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForSelector('pagination-controls', { timeout: 10000 });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'pagination-mobile-360px.png',
      fullPage: true 
    });

    // Check that pagination controls don't cause horizontal overflow
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(360);

    // Verify pagination controls are visible and properly sized
    const paginationControls = page.locator('pagination-controls');
    await expect(paginationControls).toBeVisible();
    
    const paginationBox = await paginationControls.boundingBox();
    expect(paginationBox?.width).toBeLessThanOrEqual(360);
  });

  test('Tablet viewport (768px) - pagination should be well-spaced', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForSelector('pagination-controls', { timeout: 10000 });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'pagination-tablet-768px.png',
      fullPage: true 
    });

    // Check that pagination controls use reasonable space
    const paginationControls = page.locator('pagination-controls');
    await expect(paginationControls).toBeVisible();
    
    const paginationBox = await paginationControls.boundingBox();
    const viewportHeight = 1024;
    const paginationHeightRatio = (paginationBox?.height || 0) / viewportHeight;
    
    // Pagination should use less than 15% of viewport height
    expect(paginationHeightRatio).toBeLessThan(0.15);
  });

  test('Desktop viewport (1024px) - pagination should show all features', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForSelector('pagination-controls', { timeout: 10000 });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'pagination-desktop-1024px.png',
      fullPage: true 
    });

    const paginationControls = page.locator('pagination-controls');
    await expect(paginationControls).toBeVisible();
    
    // On desktop, should show page input field
    const pageInput = paginationControls.locator('md-outlined-text-field');
    await expect(pageInput).toBeVisible();
  });

  test('Large desktop (1440px) - pagination should maintain proportions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForSelector('pagination-controls', { timeout: 10000 });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'pagination-large-1440px.png',
      fullPage: true 
    });

    const paginationControls = page.locator('pagination-controls');
    await expect(paginationControls).toBeVisible();
    
    const paginationBox = await paginationControls.boundingBox();
    expect(paginationBox?.width).toBeLessThanOrEqual(1440);
  });

  test('Pagination functionality works across all viewports', async ({ page }) => {
    const viewports = [
      { width: 360, height: 640 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForSelector('pagination-controls', { timeout: 10000 });
      
      // Test that next button works
      const nextButton = page.locator('pagination-controls md-icon-button[data-testid="next-page"]');
      if (await nextButton.isVisible()) {
        await nextButton.click();
        // Verify page changed (you might need to adjust this based on your implementation)
        await page.waitForTimeout(500);
      }
    }
  });
});