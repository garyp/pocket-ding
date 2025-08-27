import { describe, it, expect } from 'vitest';
import { SecurityService } from '../../services/security-service';

describe('SecurityService', () => {
  describe('prepareSingleFileContent', () => {
    it('should inject CSP meta tag into head', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(result).toContain('default-src \'none\'');
      expect(result).toContain('connect-src \'none\'');
      expect(result).toContain('form-action \'none\'');
    });

    it('should inject progress tracking script into body', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).toContain('progressTracker');
      expect(result).toContain('calculateProgress');
      expect(result).toContain('sendProgressUpdate');
      expect(result).toContain('window.parent.postMessage');
    });

    it('should remove base tags for security', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <base href="https://malicious.com/">
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).not.toContain('<base');
      expect(result).not.toContain('malicious.com');
    });

    it('should remove meta refresh redirects', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta http-equiv="refresh" content="0;url=https://malicious.com">
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).not.toContain('meta http-equiv="refresh"');
      expect(result).not.toContain('malicious.com');
    });

    it('should remove external script tags', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <script src="https://malicious.com/script.js"></script>
          <script>console.log('inline script should stay');</script>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).not.toContain('malicious.com/script.js');
      expect(result).not.toContain('<script src="https://');
      expect(result).toContain('inline script should stay');
    });

    it('should remove external link tags', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="https://malicious.com/style.css">
          <link rel="icon" href="data:image/svg+xml,<svg/>">
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).not.toContain('malicious.com/style.css');
      expect(result).not.toContain('<link rel="stylesheet" href="https://');
      expect(result).toContain('data:image/svg+xml');
    });

    it('should block external images', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <img src="https://malicious.com/tracker.gif" alt="external">
          <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="data url">
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).not.toContain('malicious.com/tracker.gif');
      expect(result).toContain('External image blocked for security');
      expect(result).toContain('data:image/gif;base64');
    });

    it('should clean external URLs from CSS styles', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <div style="background: url('https://malicious.com/bg.jpg'); color: red;">
            Test Content
          </div>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).not.toContain('malicious.com/bg.jpg');
      expect(result).toContain('color: red');
    });

    it('should wrap HTML fragments in complete HTML structure', async () => {
      const htmlFragment = '<div>No html or body tags</div>';
      
      const result = await SecurityService.prepareSingleFileContent(htmlFragment);
      
      expect(result).toContain('<html>');
      expect(result).toContain('<body>');
      expect(result).toContain('<div>No html or body tags</div>');
      expect(result).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(result).toContain('progressTracker');
    });

    it('should preserve legitimate content', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <style>
            body { font-family: Arial, sans-serif; }
            .content { margin: 20px; }
          </style>
        </head>
        <body>
          <h1>Test Article</h1>
          <p class="content">This is legitimate content that should be preserved.</p>
          <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="data image">
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml);
      
      expect(result).toContain('Test Article');
      expect(result).toContain('legitimate content');
      expect(result).toContain('font-family: Arial');
      expect(result).toContain('data:image/gif;base64');
    });
  });

  describe('Dark Mode Support', () => {
    it('should not inject dark mode CSS when isDarkMode is false', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
          <p>Regular content</p>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml, false);
      
      expect(result).not.toContain('background: #121212');
      expect(result).not.toContain('color: #e0e0e0');
      expect(result).not.toContain('Dark mode styles for readability content');
    });

    it('should inject dark mode CSS when isDarkMode is true', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
          <p>Regular content</p>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml, true);
      
      expect(result).toContain('background: #121212 !important');
      expect(result).toContain('color: #e0e0e0 !important');
      expect(result).toContain('Dark mode styles for readability content');
      expect(result).toContain('color: #bb86fc !important'); // Links
      expect(result).toContain('background: #1e1e1e !important'); // Blockquotes/code
    });

    it('should inject dark mode CSS in correct order (before progress tracking)', async () => {
      const inputHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <h1>Test Content</h1>
        </body>
        </html>
      `;

      const result = await SecurityService.prepareSingleFileContent(inputHtml, true);
      
      // Dark mode CSS should come before progress tracking script in the output
      const darkModeIndex = result.indexOf('Dark mode styles for readability content');
      const progressTrackerIndex = result.indexOf('progressTracker');
      
      expect(darkModeIndex).toBeGreaterThan(0);
      expect(progressTrackerIndex).toBeGreaterThan(0);
      expect(darkModeIndex).toBeLessThan(progressTrackerIndex);
    });
  });

});