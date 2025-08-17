import { test, expect } from '@playwright/test';

test.describe('Reader Component Direct Test', () => {
  test('Direct reader header measurement', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('app-root');
    
    // Inject a test bookmark and reader directly into the DOM
    await page.evaluate(() => {
      // Create mock bookmark data
      const mockBookmark = {
        id: 1,
        url: 'https://example.com/test',
        title: 'Test Article',
        content: '<h1>Test Article</h1><p>This is test content for measuring the reader header height.</p>'.repeat(50),
        readability_content: '<h1>Test Article</h1><p>This is test content for measuring the reader header height.</p>'.repeat(50),
        is_archived: false,
        unread: true,
        created: '2024-01-01T00:00:00Z',
        description: 'Test description'
      };
      
      // Clear the body and add just the reader component
      document.body.innerHTML = `
        <style>
          body { margin: 0; padding: 0; font-family: Roboto, sans-serif; }
          * { box-sizing: border-box; }
        </style>
        <bookmark-reader 
          .bookmark="${JSON.stringify(mockBookmark)}"
          style="display: block; height: 100vh; width: 100vw;">
        </bookmark-reader>
      `;
      
      // Manually trigger a property update
      const reader = document.querySelector('bookmark-reader') as any;
      if (reader) {
        reader.bookmark = mockBookmark;
      }
    });
    
    // Wait for the reader component to render
    await page.waitForSelector('bookmark-reader .reader-toolbar', { timeout: 10000 });
    
    // Test desktop size
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(500); // Let layout settle
    
    const desktopHeight = await page.locator('.reader-toolbar').evaluate(el => el.getBoundingClientRect().height);
    console.log(`Desktop toolbar height: ${desktopHeight}px`);
    
    // Take desktop screenshot
    await page.screenshot({ path: 'images/reader-desktop-direct.png', fullPage: false });
    
    // Test tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    const tabletHeight = await page.locator('.reader-toolbar').evaluate(el => el.getBoundingClientRect().height);
    console.log(`Tablet toolbar height: ${tabletHeight}px`);
    
    // Take tablet screenshot
    await page.screenshot({ path: 'images/reader-tablet-direct.png', fullPage: false });
    
    // Test mobile size
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    
    const mobileHeight = await page.locator('.reader-toolbar').evaluate(el => el.getBoundingClientRect().height);
    console.log(`Mobile toolbar height: ${mobileHeight}px`);
    
    // Take mobile screenshot
    await page.screenshot({ path: 'images/reader-mobile-direct.png', fullPage: false });
    
    // Verify the heights are within expected ranges
    expect(desktopHeight).toBeLessThan(50); // Should be ~40px
    expect(desktopHeight).toBeGreaterThan(35);
    
    expect(tabletHeight).toBeLessThan(50);
    expect(tabletHeight).toBeGreaterThan(35);
    
    expect(mobileHeight).toBeLessThan(50); // Should be ~44px
    expect(mobileHeight).toBeGreaterThan(40);
    
    // Calculate percentage of viewport
    const mobilePercentage = (mobileHeight / 844) * 100;
    const desktopPercentage = (desktopHeight / 800) * 100;
    
    console.log(`Mobile toolbar: ${mobilePercentage.toFixed(1)}% of viewport`);
    console.log(`Desktop toolbar: ${desktopPercentage.toFixed(1)}% of viewport`);
    
    // Should not take more than 8% of viewport
    expect(mobilePercentage).toBeLessThan(8);
    expect(desktopPercentage).toBeLessThan(8);
    
    // Check that progress section doesn't wrap on mobile
    const progressSection = page.locator('.progress-section');
    const progressHeight = await progressSection.evaluate(el => el.getBoundingClientRect().height);
    console.log(`Mobile progress section height: ${progressHeight}px`);
    
    // Progress section should be single line (less than 35px)
    expect(progressHeight).toBeLessThan(35);
  });
});