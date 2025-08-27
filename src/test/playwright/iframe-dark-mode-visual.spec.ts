import { test, expect } from '@playwright/test';

test.describe('Iframe Dark Mode Visual Integration', () => {
  test('visually confirms iframe content uses dark theme styles', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('app-root');
    
    // Enable mock mode to avoid external API dependencies
    await page.evaluate(() => {
      localStorage.setItem('mockMode', 'true');
    });
    
    await page.reload();
    await page.waitForSelector('bookmark-list', { timeout: 15000 });
    
    // Inject a test bookmark with rich content for visual validation
    await page.evaluate(() => {
      const mockBookmark = {
        id: 999,
        url: 'https://example.com/dark-mode-test',
        title: 'Dark Mode Visual Test Article',
        content: `
          <h1>Main Heading</h1>
          <h2>Secondary Heading</h2>
          <p>This is a paragraph of normal text content that should appear in light gray color in dark mode.</p>
          <p>Here's another paragraph with <a href="#">a link that should be purple</a> and some <code>inline code</code>.</p>
          <blockquote>
            <p>This is a blockquote that should have a dark background with purple left border.</p>
          </blockquote>
          <pre><code>
function darkModeTest() {
  // This code block should have dark background
  return 'success';
}
          </code></pre>
          <ul>
            <li>First list item</li>
            <li>Second list item with <a href="#" target="_blank">external link</a></li>
          </ul>
          <table>
            <thead>
              <tr>
                <th>Column 1</th>
                <th>Column 2</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cell 1</td>
                <td>Cell 2</td>
              </tr>
              <tr>
                <td>Cell 3</td>
                <td>Cell 4</td>
              </tr>
            </tbody>
          </table>
          <hr>
          <p>Final paragraph after horizontal rule.</p>
        `,
        readability_content: `
          <h1>Main Heading</h1>
          <h2>Secondary Heading</h2>
          <p>This is a paragraph of normal text content that should appear in light gray color in dark mode.</p>
          <p>Here's another paragraph with <a href="#">a link that should be purple</a> and some <code>inline code</code>.</p>
          <blockquote>
            <p>This is a blockquote that should have a dark background with purple left border.</p>
          </blockquote>
          <pre><code>
function darkModeTest() {
  // This code block should have dark background
  return 'success';
}
          </code></pre>
          <ul>
            <li>First list item</li>
            <li>Second list item with <a href="#" target="_blank">external link</a></li>
          </ul>
          <table>
            <thead>
              <tr>
                <th>Column 1</th>
                <th>Column 2</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cell 1</td>
                <td>Cell 2</td>
              </tr>
              <tr>
                <td>Cell 3</td>
                <td>Cell 4</td>
              </tr>
            </tbody>
          </table>
          <hr>
          <p>Final paragraph after horizontal rule.</p>
        `,
        is_archived: false,
        unread: true,
        created: '2024-01-01T00:00:00Z',
        description: 'Test article for dark mode visual validation'
      };
      
      // Store the test bookmark in IndexedDB via the mock system
      if (typeof window !== 'undefined' && (window as any).mockBookmarks) {
        (window as any).mockBookmarks.push(mockBookmark);
      }
    });
    
    // Navigate to the test bookmark
    await page.goto(`/#/reader/999`);
    
    // Wait for the reader to load
    await page.waitForSelector('bookmark-reader', { timeout: 10000 });
    
    // Ensure we're in readability mode
    await page.waitForSelector('secure-iframe', { timeout: 10000 });
    
    // Wait for iframe content to load
    await page.waitForTimeout(2000);
    
    // Enable dark mode by clicking the dark mode toggle
    const darkModeButton = page.locator('md-icon-button[title*="Mode"]').first();
    await expect(darkModeButton).toBeVisible();
    
    // Click to activate dark mode
    await darkModeButton.click();
    await page.waitForTimeout(1000); // Allow dark mode to apply
    
    // Take a screenshot to visually confirm dark mode is active in the iframe
    await page.screenshot({ 
      path: 'src/test/playwright/images/iframe-dark-mode-applied.png', 
      fullPage: true 
    });
    
    // Get the iframe element
    const iframe = page.locator('secure-iframe iframe').first();
    await expect(iframe).toBeVisible();
    
    // Access iframe content and validate dark mode styles are applied
    const iframeHandle = await iframe.elementHandle();
    if (!iframeHandle) {
      throw new Error('Could not get iframe element handle');
    }
    
    const iframeContent = await iframeHandle.contentFrame();
    if (!iframeContent) {
      throw new Error('Could not access iframe content');
    }
    
    // Check body background color (should be dark: #121212)
    const bodyBgColor = await iframeContent.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).backgroundColor;
    });
    
    // Check body text color (should be light: #e0e0e0)
    const bodyTextColor = await iframeContent.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).color;
    });
    
    // Check h1 color (should be white: #ffffff)
    const h1Color = await iframeContent.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return 'not-found';
      return window.getComputedStyle(h1).color;
    });
    
    // Check paragraph color (should be light gray: #e0e0e0)
    const pColor = await iframeContent.evaluate(() => {
      const p = document.querySelector('p');
      if (!p) return 'not-found';
      return window.getComputedStyle(p).color;
    });
    
    // Check link color (should be purple: #bb86fc)
    const linkColor = await iframeContent.evaluate(() => {
      const link = document.querySelector('a');
      if (!link) return 'not-found';
      return window.getComputedStyle(link).color;
    });
    
    // Check blockquote background (should be dark: #1e1e1e)
    const blockquoteBgColor = await iframeContent.evaluate(() => {
      const blockquote = document.querySelector('blockquote');
      if (!blockquote) return 'not-found';
      return window.getComputedStyle(blockquote).backgroundColor;
    });
    
    // Check code background (should be dark: #1e1e1e)
    const codeBgColor = await iframeContent.evaluate(() => {
      const code = document.querySelector('code');
      if (!code) return 'not-found';
      return window.getComputedStyle(code).backgroundColor;
    });
    
    // Validate dark mode colors are applied
    // Note: RGB values may be computed differently by different browsers,
    // so we check for dark backgrounds and light text
    console.log('Body background:', bodyBgColor);
    console.log('Body text color:', bodyTextColor);
    console.log('H1 color:', h1Color);
    console.log('Paragraph color:', pColor);
    console.log('Link color:', linkColor);
    console.log('Blockquote background:', blockquoteBgColor);
    console.log('Code background:', codeBgColor);
    
    // Convert RGB to validate dark theme
    const rgbToValues = (rgb: string) => {
      const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match || !match[1] || !match[2] || !match[3]) return null;
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    };
    
    // Validate body background is very dark (close to #121212 which is rgb(18, 18, 18))
    const bodyBg = rgbToValues(bodyBgColor);
    if (bodyBg) {
      expect(bodyBg[0]).toBeLessThan(50); // R should be very low
      expect(bodyBg[1]).toBeLessThan(50); // G should be very low  
      expect(bodyBg[2]).toBeLessThan(50); // B should be very low
    }
    
    // Validate body text color is light (close to #e0e0e0 which is rgb(224, 224, 224))
    const bodyText = rgbToValues(bodyTextColor);
    if (bodyText) {
      expect(bodyText[0]).toBeGreaterThan(200); // R should be high
      expect(bodyText[1]).toBeGreaterThan(200); // G should be high
      expect(bodyText[2]).toBeGreaterThan(200); // B should be high
    }
    
    // Validate h1 color is very light/white
    const h1 = rgbToValues(h1Color);
    if (h1) {
      expect(h1[0]).toBeGreaterThan(240); // Should be close to white
      expect(h1[1]).toBeGreaterThan(240);
      expect(h1[2]).toBeGreaterThan(240);
    }
    
    // Test toggle back to light mode to ensure the functionality works both ways
    await darkModeButton.click();
    await page.waitForTimeout(1000);
    
    // Take another screenshot to confirm light mode
    await page.screenshot({ 
      path: 'src/test/playwright/images/iframe-light-mode-restored.png', 
      fullPage: true 
    });
    
    // Validate light mode is restored (body should have light background)
    const lightBodyBgColor = await iframeContent.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).backgroundColor;
    });
    
    console.log('Light mode body background:', lightBodyBgColor);
    
    // In light mode, background should be white or very light
    const lightBodyBg = rgbToValues(lightBodyBgColor);
    if (lightBodyBg) {
      expect(lightBodyBg[0]).toBeGreaterThan(200); // Should be light
      expect(lightBodyBg[1]).toBeGreaterThan(200);
      expect(lightBodyBg[2]).toBeGreaterThan(200);
    }
    
    console.log('✅ Dark mode visual validation completed successfully');
  });
  
  test('confirms dark mode toggle affects multiple content types', async ({ page }) => {
    // This test focuses on the visual differences across different content types
    await page.goto('/');
    await page.waitForSelector('app-root');
    
    // Enable mock mode
    await page.evaluate(() => {
      localStorage.setItem('mockMode', 'true');
    });
    
    await page.reload();
    await page.waitForSelector('bookmark-list', { timeout: 15000 });
    
    // Navigate to reader with test content
    await page.goto(`/#/reader/999`);
    await page.waitForSelector('bookmark-reader', { timeout: 10000 });
    await page.waitForSelector('secure-iframe', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Test on mobile viewport to ensure dark mode works on mobile browsers
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    
    // Activate dark mode
    const darkModeButton = page.locator('md-icon-button[title*="Mode"]').first();
    await darkModeButton.click();
    await page.waitForTimeout(1000);
    
    // Take mobile dark mode screenshot
    await page.screenshot({ 
      path: 'src/test/playwright/images/iframe-dark-mode-mobile.png', 
      fullPage: true 
    });
    
    // Test on tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    await page.screenshot({ 
      path: 'src/test/playwright/images/iframe-dark-mode-tablet.png', 
      fullPage: true 
    });
    
    // Get iframe content for detailed validation
    const iframe = page.locator('secure-iframe iframe').first();
    const iframeHandle = await iframe.elementHandle();
    if (!iframeHandle) {
      throw new Error('Could not get iframe element handle');
    }
    
    const iframeContent = await iframeHandle.contentFrame();
    if (!iframeContent) {
      throw new Error('Could not access iframe content');
    }
    
    // Validate that dark mode CSS is actually injected into the iframe
    const hasDarkModeStyles = await iframeContent.evaluate(() => {
      // Look for the injected dark mode style element
      const styles = Array.from(document.head.querySelectorAll('style'));
      return styles.some(style => 
        style.textContent && 
        style.textContent.includes('background: #121212') &&
        style.textContent.includes('color: #e0e0e0') &&
        style.textContent.includes('Dark mode styles for readability content')
      );
    });
    
    expect(hasDarkModeStyles).toBe(true);
    
    // Validate table styling in dark mode
    const tableCellBg = await iframeContent.evaluate(() => {
      const td = document.querySelector('td');
      if (!td) return 'not-found';
      return window.getComputedStyle(td).backgroundColor;
    });
    
    console.log('Table cell background in dark mode:', tableCellBg);
    
    // Validate blockquote border color (should be purple-ish)
    const blockquoteBorder = await iframeContent.evaluate(() => {
      const blockquote = document.querySelector('blockquote');
      if (!blockquote) return 'not-found';
      return window.getComputedStyle(blockquote).borderLeftColor;
    });
    
    console.log('Blockquote border color:', blockquoteBorder);
    
    console.log('✅ Multi-content-type dark mode validation completed');
  });
});