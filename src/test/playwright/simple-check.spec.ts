import { test } from '@playwright/test';

test('App loads successfully', async ({ page }) => {
  await page.goto('/');
  
  // Wait for the app to load
  await page.waitForSelector('app-root', { timeout: 10000 });
  
  // Take a screenshot to see what's happening
  await page.screenshot({ path: 'images/app-loaded.png', fullPage: true });
  
  // Check if we can enter mock mode
  await page.evaluate(() => {
    localStorage.setItem('mockMode', 'true');
  });
  
  await page.reload();
  await page.waitForSelector('bookmark-list', { timeout: 15000 });
  
  // Take another screenshot
  await page.screenshot({ path: 'images/mock-mode.png', fullPage: true });
  
  console.log('App loaded successfully in mock mode');
});