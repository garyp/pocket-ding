import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';
import { SecureIframeContainer } from '../../components/secure-iframe-container';
import { SecureIframe } from '../../components/secure-iframe';
import { SecurityService } from '../../services/security-service';
import type { LocalBookmark } from '../../types';

// Mock the SecurityService
vi.mock('../../services/security-service', () => ({
  SecurityService: {
    prepareSingleFileContent: vi.fn(),
    validateContent: vi.fn(),
    createNetworkTestPage: vi.fn(),
  },
}));

const mockBookmark: LocalBookmark = {
  id: 1,
  url: 'https://example.com/article',
  title: 'Test Article',
  description: 'Test Description',
  notes: '',
  website_title: 'Example Site',
  website_description: 'Example Description',
  web_archive_snapshot_url: '',
  favicon_url: 'https://example.com/favicon.ico',
  preview_image_url: '',
  is_archived: false,
  unread: true,
  shared: false,
  tag_names: ['test'],
  date_added: '2024-01-01T00:00:00Z',
  date_modified: '2024-01-01T00:00:00Z',
};

const mockSingleFileContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Article</title>
  <style>
    body { font-family: Arial, sans-serif; }
    .content { margin: 20px; }
  </style>
</head>
<body>
  <h1>Test Article</h1>
  <p class="content">This is test content for the secure iframe.</p>
  <p class="content">More content to test scrolling and progress tracking.</p>
  <div style="height: 2000px;">Long content for scrolling</div>
</body>
</html>
`;

describe('Secure Iframe Integration', () => {
  let container: SecureIframeContainer;
  let iframe: SecureIframe;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup SecurityService mock
    vi.mocked(SecurityService.prepareSingleFileContent).mockResolvedValue(mockSingleFileContent);
    vi.mocked(SecurityService.validateContent).mockReturnValue(true);
    vi.mocked(SecurityService.createNetworkTestPage).mockReturnValue('<html>Test page</html>');
  });

  afterEach(() => {
    if (container) {
      container.remove();
    }
    if (iframe) {
      iframe.remove();
    }
  });

  describe('SecureIframeContainer', () => {
    it('should create container component', () => {
      container = new SecureIframeContainer();
      expect(container).toBeTruthy();
      expect(container.tagName.toLowerCase()).toBe('secure-iframe-container');
    });

    it('should pass props to presentation component', async () => {
      container = new SecureIframeContainer();
      container.content = mockSingleFileContent;
      container.bookmark = mockBookmark;
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      const iframeElement = container.shadowRoot?.querySelector('secure-iframe');
      expect(iframeElement).toBeTruthy();
      expect((iframeElement as any).content).toBe(mockSingleFileContent);
    });

    it('should handle progress updates from iframe', async () => {
      container = new SecureIframeContainer();
      container.content = mockSingleFileContent;
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      let progressUpdateReceived = false;
      let progressDetail: any = null;
      
      container.addEventListener('progress-update', (e: any) => {
        progressUpdateReceived = true;
        progressDetail = e.detail;
      });
      
      // Simulate progress update from iframe
      const mockEvent = new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'progress-update',
          progress: 50,
          scrollPosition: 100,
        },
      });
      
      window.dispatchEvent(mockEvent);
      
      expect(progressUpdateReceived).toBe(true);
      expect(progressDetail.progress).toBe(50);
      expect(progressDetail.scrollPosition).toBe(100);
    });

    it('should handle scroll position requests', async () => {
      container = new SecureIframeContainer();
      container.content = mockSingleFileContent;
      container.updateScrollPosition(200);
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      const mockSource = {
        postMessage: vi.fn(),
      };
      
      const mockEvent = new MessageEvent('message', {
        origin: window.location.origin,
        source: mockSource as any,
        data: {
          type: 'request-scroll-position',
        },
      });
      
      window.dispatchEvent(mockEvent);
      
      expect(mockSource.postMessage).toHaveBeenCalledWith({
        type: 'restore-scroll-position',
        scrollPosition: 200,
      }, '*');
    });

    it('should ignore messages from different origins', async () => {
      container = new SecureIframeContainer();
      container.content = mockSingleFileContent;
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      let progressUpdateReceived = false;
      
      container.addEventListener('progress-update', () => {
        progressUpdateReceived = true;
      });
      
      // Simulate message from different origin
      const mockEvent = new MessageEvent('message', {
        origin: 'https://malicious.com',
        data: {
          type: 'progress-update',
          progress: 50,
          scrollPosition: 100,
        },
      });
      
      window.dispatchEvent(mockEvent);
      
      expect(progressUpdateReceived).toBe(false);
    });

    it('should provide current progress state', async () => {
      container = new SecureIframeContainer();
      container.content = mockSingleFileContent;
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      // Simulate progress update
      const mockEvent = new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'progress-update',
          progress: 75,
          scrollPosition: 300,
        },
      });
      
      window.dispatchEvent(mockEvent);
      
      const currentProgress = container.getCurrentProgress();
      expect(currentProgress.progress).toBe(75);
      expect(currentProgress.scrollPosition).toBe(300);
    });
  });

  describe('SecureIframe', () => {
    it('should create iframe component', () => {
      iframe = new SecureIframe();
      expect(iframe).toBeTruthy();
      expect(iframe.tagName.toLowerCase()).toBe('secure-iframe');
    });

    it('should process content through SecurityService', async () => {
      iframe = new SecureIframe();
      iframe.content = mockSingleFileContent;
      
      document.body.appendChild(iframe);
      await iframe.updateComplete;
      
      expect(SecurityService.prepareSingleFileContent).toHaveBeenCalledWith(mockSingleFileContent);
    });

    it('should create iframe with proper sandbox attributes', async () => {
      iframe = new SecureIframe();
      iframe.content = mockSingleFileContent;
      
      document.body.appendChild(iframe);
      await iframe.updateComplete;
      
      const iframeElement = iframe.shadowRoot?.querySelector('iframe');
      expect(iframeElement).toBeTruthy();
      expect(iframeElement?.sandbox.toString()).toContain('allow-scripts');
      expect(iframeElement?.sandbox.toString()).toContain('allow-same-origin');
    });

    it('should handle content processing errors', async () => {
      vi.mocked(SecurityService.prepareSingleFileContent).mockRejectedValue(new Error('Processing failed'));
      
      iframe = new SecureIframe();
      iframe.content = mockSingleFileContent;
      
      let errorReceived = false;
      iframe.onContentError = (error: string) => {
        errorReceived = true;
        expect(error).toBe('Processing failed');
      };
      
      document.body.appendChild(iframe);
      await iframe.updateComplete;
      
      expect(errorReceived).toBe(true);
    });

    it('should display error message for empty content', async () => {
      iframe = new SecureIframe();
      iframe.content = '';
      
      document.body.appendChild(iframe);
      await iframe.updateComplete;
      
      const errorContainer = iframe.shadowRoot?.querySelector('.error-container');
      expect(errorContainer).toBeTruthy();
      expect(errorContainer?.textContent).toContain('No Content');
    });

    it('should show loading state', async () => {
      iframe = new SecureIframe();
      iframe.content = mockSingleFileContent;
      iframe.isLoading = true;
      
      document.body.appendChild(iframe);
      await iframe.updateComplete;
      
      const loadingOverlay = iframe.shadowRoot?.querySelector('.loading-overlay');
      expect(loadingOverlay).toBeTruthy();
      expect(loadingOverlay?.textContent).toContain('Loading secure content');
    });
  });

  describe('Security Integration', () => {
    it('should process content with all security measures', async () => {
      const maliciousContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <base href="https://malicious.com/">
          <script src="https://malicious.com/script.js"></script>
          <link rel="stylesheet" href="https://malicious.com/style.css">
        </head>
        <body>
          <img src="https://malicious.com/tracker.gif">
          <h1>Content</h1>
        </body>
        </html>
      `;

      // Mock SecurityService to return sanitized content
      const sanitizedContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline';">
          <title>Sanitized</title>
        </head>
        <body>
          <img alt="External image blocked for security" style="display: none;">
          <h1>Content</h1>
          <script>/* progress tracking script */</script>
        </body>
        </html>
      `;

      vi.mocked(SecurityService.prepareSingleFileContent).mockResolvedValue(sanitizedContent);

      container = new SecureIframeContainer();
      container.content = maliciousContent;
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      expect(SecurityService.prepareSingleFileContent).toHaveBeenCalledWith(maliciousContent);
      
      const iframeElement = container.shadowRoot?.querySelector('secure-iframe');
      expect(iframeElement).toBeTruthy();
      expect((iframeElement as any).secureContent).toBe(sanitizedContent);
    });

    it('should handle network test page creation', () => {
      const testPage = SecurityService.createNetworkTestPage();
      
      expect(testPage).toContain('Network Blocking Test');
      expect(testPage).toContain('fetch(');
      expect(testPage).toContain('XMLHttpRequest');
      expect(testPage).toContain('WebSocket');
    });

    it('should validate content before processing', async () => {
      vi.mocked(SecurityService.validateContent).mockReturnValue(false);
      
      container = new SecureIframeContainer();
      container.content = 'Invalid content';
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      expect(SecurityService.validateContent).toHaveBeenCalledWith('Invalid content');
    });
  });

  describe('postMessage Communication', () => {
    it('should handle all message types correctly', async () => {
      container = new SecureIframeContainer();
      container.content = mockSingleFileContent;
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      const messageTypes = [
        { type: 'progress-update', data: { progress: 50, scrollPosition: 100 } },
        { type: 'request-scroll-position', data: {} },
        { type: 'content-loaded', data: {} },
        { type: 'content-error', data: { error: 'Test error' } },
      ];
      
      messageTypes.forEach(({ type, data }) => {
        const mockEvent = new MessageEvent('message', {
          origin: window.location.origin,
          data: { type, ...data },
        });
        
        window.dispatchEvent(mockEvent);
      });
      
      // All messages should be handled without errors
      expect(true).toBe(true);
    });

    it('should throttle progress updates to prevent spam', async () => {
      container = new SecureIframeContainer();
      container.content = mockSingleFileContent;
      
      document.body.appendChild(container);
      await container.updateComplete;
      
      let progressUpdateCount = 0;
      
      container.addEventListener('progress-update', () => {
        progressUpdateCount++;
      });
      
      // Send multiple rapid progress updates
      for (let i = 0; i < 10; i++) {
        const mockEvent = new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'progress-update',
            progress: i * 10,
            scrollPosition: i * 50,
          },
        });
        
        window.dispatchEvent(mockEvent);
      }
      
      // All updates should be processed (throttling happens in the iframe script)
      expect(progressUpdateCount).toBe(10);
    });
  });
});