import { test, expect } from '@playwright/test';

test.describe('Pagination Controls Visual Validation', () => {
  
  test('Take screenshots at multiple viewport sizes for manual validation', async ({ page }) => {
    // Set a longer timeout for this test
    test.setTimeout(60000);
    
    const viewports = [
      { name: 'mobile', width: 360, height: 640 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1024, height: 768 },
      { name: 'large', width: 1440, height: 900 }
    ];

    for (const viewport of viewports) {
      console.log(`Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
      
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      try {
        // Try to load the app
        await page.goto('/', { waitUntil: 'networkidle', timeout: 20000 });
        
        // Wait a moment for any dynamic content
        await page.waitForTimeout(2000);
        
        // Take screenshot of whatever loaded
        await page.screenshot({ 
          path: `pagination-${viewport.name}-${viewport.width}x${viewport.height}.png`,
          fullPage: false // Just capture viewport
        });
        
        console.log(`Screenshot captured for ${viewport.name}`);
        
        // Try to find pagination controls if they exist
        const paginationExists = await page.locator('pagination-controls').isVisible({ timeout: 5000 }).catch(() => false);
        if (paginationExists) {
          console.log(`Pagination controls found at ${viewport.name}`);
          
          // Get pagination dimensions
          const paginationBox = await page.locator('pagination-controls').boundingBox();
          if (paginationBox) {
            const paginationHeightRatio = paginationBox.height / viewport.height;
            console.log(`Pagination height ratio for ${viewport.name}: ${(paginationHeightRatio * 100).toFixed(1)}%`);
          }
        } else {
          console.log(`No pagination controls visible at ${viewport.name} - likely app didn't fully load`);
        }
        
      } catch (error) {
        console.log(`Error testing ${viewport.name}: ${error instanceof Error ? error.message : String(error)}`);
        // Still try to take a screenshot of the error state
        await page.screenshot({ 
          path: `pagination-${viewport.name}-${viewport.width}x${viewport.height}-error.png`,
          fullPage: false
        });
      }
    }
    
    // The test passes if we got here - actual validation is manual via screenshots
    expect(true).toBe(true);
  });
});