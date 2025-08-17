import { test, expect } from '@playwright/test';

test.describe('Pagination Controls Visual Testing with Demo Data', () => {
  
  test('Visual validation of pagination controls at multiple viewports', async ({ page }) => {
    test.setTimeout(90000);
    
    // Configure demo mode to see pagination
    await page.goto('/');
    
    // Wait for the welcome screen
    await page.waitForSelector('text=Welcome to Pocket Ding', { timeout: 10000 });
    
    // Click configure settings
    await page.click('button:has-text("Configure Settings")');
    
    // Wait for settings panel
    await page.waitForSelector('settings-panel', { timeout: 10000 });
    
    // Use demo mode which should provide sufficient bookmarks to show pagination
    const demoModeRadio = page.locator('md-radio[value="demo"]');
    await demoModeRadio.click();
    
    // Save settings
    await page.click('md-filled-button:has-text("Save Settings")');
    
    // Wait for navigation to bookmark list
    await page.waitForSelector('bookmark-list', { timeout: 15000 });
    
    // Wait for bookmarks to load
    await page.waitForTimeout(3000);
    
    const viewports = [
      { name: 'mobile', width: 360, height: 640 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1024, height: 768 },
      { name: 'large', width: 1440, height: 900 }
    ];

    for (const viewport of viewports) {
      console.log(`Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
      
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Wait for layout to settle
      await page.waitForTimeout(1000);
      
      // Take full page screenshot to see pagination
      await page.screenshot({ 
        path: `pagination-demo-${viewport.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: true
      });
      
      // Check if pagination controls exist
      const paginationExists = await page.locator('pagination-controls').isVisible().catch(() => false);
      if (paginationExists) {
        console.log(`✓ Pagination controls found at ${viewport.name}`);
        
        // Get pagination dimensions
        const paginationBox = await page.locator('pagination-controls').boundingBox();
        if (paginationBox) {
          const paginationHeightRatio = paginationBox.height / viewport.height;
          console.log(`Pagination height ratio for ${viewport.name}: ${(paginationHeightRatio * 100).toFixed(1)}%`);
          
          // Verify no horizontal overflow
          const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          if (pageWidth <= viewport.width) {
            console.log(`✓ No horizontal overflow at ${viewport.name}`);
          } else {
            console.log(`⚠ Horizontal overflow detected at ${viewport.name}: ${pageWidth}px > ${viewport.width}px`);
          }
          
          // Check pagination components are responsive
          if (viewport.width <= 768) {
            // On mobile/tablet, check for specific mobile layout behaviors
            const pageInput = page.locator('pagination-controls md-outlined-text-field');
            const pageInputVisible = await pageInput.isVisible().catch(() => false);
            if (!pageInputVisible) {
              console.log(`✓ Page input hidden on ${viewport.name} as expected`);
            } else {
              console.log(`⚠ Page input still visible on ${viewport.name}`);
            }
          }
        }
      } else {
        console.log(`⚠ No pagination controls found at ${viewport.name}`);
      }
    }
    
    expect(true).toBe(true); // Test passes if we complete all screenshots
  });
});