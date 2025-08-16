import { test, expect } from '@playwright/test';

test.describe('Reader View Header Height', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForSelector('app-root', { timeout: 10000 });
    
    // Switch to mock mode for consistent testing
    await page.evaluate(() => {
      localStorage.setItem('mockMode', 'true');
    });
    
    // Reload to apply mock mode
    await page.reload();
    await page.waitForSelector('bookmark-list', { timeout: 10000 });
    
    // Wait for bookmarks to load
    await page.waitForSelector('.bookmark-item', { timeout: 10000 });
    
    // Click on first bookmark to enter reader view
    const firstBookmark = page.locator('.bookmark-item').first();
    await firstBookmark.click();
    
    // Wait for reader to load
    await page.waitForSelector('bookmark-reader', { timeout: 10000 });
    await page.waitForSelector('.reader-toolbar', { timeout: 10000 });
  });

  test('Desktop - Reader header height validation', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    
    // Wait for layout to settle
    await page.waitForTimeout(500);
    
    // Take screenshot of reader view
    await expect(page).toHaveScreenshot('reader-desktop.png');
    
    // Measure toolbar height
    const toolbarHeight = await page.locator('.reader-toolbar').evaluate(el => el.getBoundingClientRect().height);
    
    // Verify toolbar height is within expected range (should be ~40px)
    expect(toolbarHeight).toBeLessThan(50);
    expect(toolbarHeight).toBeGreaterThan(35);
    
    console.log(`Desktop toolbar height: ${toolbarHeight}px`);
  });

  test('Tablet - Reader header height validation', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    
    // Wait for layout to settle
    await page.waitForTimeout(500);
    
    // Take screenshot of reader view
    await expect(page).toHaveScreenshot('reader-tablet.png');
    
    // Measure toolbar height
    const toolbarHeight = await page.locator('.reader-toolbar').evaluate(el => el.getBoundingClientRect().height);
    
    // Verify toolbar height is within expected range
    expect(toolbarHeight).toBeLessThan(50);
    expect(toolbarHeight).toBeGreaterThan(35);
    
    console.log(`Tablet toolbar height: ${toolbarHeight}px`);
  });

  test('Mobile - Reader header height validation', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12 Pro dimensions
    
    // Wait for layout to settle
    await page.waitForTimeout(500);
    
    // Take screenshot of reader view
    await expect(page).toHaveScreenshot('reader-mobile.png');
    
    // Measure toolbar height
    const toolbarHeight = await page.locator('.reader-toolbar').evaluate(el => el.getBoundingClientRect().height);
    
    // Verify toolbar height is within expected range (should be ~44px)
    expect(toolbarHeight).toBeLessThan(50);
    expect(toolbarHeight).toBeGreaterThan(40);
    
    console.log(`Mobile toolbar height: ${toolbarHeight}px`);
    
    // Verify no wrapping occurred (height should be single line)
    const progressSection = page.locator('.progress-section');
    const progressSectionHeight = await progressSection.evaluate(el => el.getBoundingClientRect().height);
    
    // Progress section should be single line height
    expect(progressSectionHeight).toBeLessThan(35);
    
    console.log(`Mobile progress section height: ${progressSectionHeight}px`);
  });

  test('Visual comparison across screen sizes', async ({ page }) => {
    const sizes = [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1200, height: 800 }
    ];
    
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(500);
      
      const toolbarHeight = await page.locator('.reader-toolbar').evaluate(el => el.getBoundingClientRect().height);
      const viewportHeight = size.height;
      const toolbarPercentage = (toolbarHeight / viewportHeight) * 100;
      
      console.log(`${size.name}: ${toolbarHeight}px (${toolbarPercentage.toFixed(1)}% of viewport)`);
      
      // Toolbar should not take up more than 8% of viewport height
      expect(toolbarPercentage).toBeLessThan(8);
    }
  });
});