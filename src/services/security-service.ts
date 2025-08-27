/**
 * SecurityService handles secure content preparation for iframe rendering
 * Implements CSP injection, content sanitization, and progress tracking
 */
export class SecurityService {
  /**
   * Prepares SingleFile HTML content for secure iframe rendering
   * Uses DOMParser approach as specified in requirements
   */
  static async prepareSingleFileContent(
    singleFileHtml: string,
    isDarkMode?: boolean
  ): Promise<string> {
    let contentToProcess = singleFileHtml;
    
    // Check if input contains basic HTML structure, if not, wrap it
    if (!singleFileHtml.includes('<html') || !singleFileHtml.includes('<body')) {
      // This is likely an HTML fragment, wrap it in a complete HTML structure
      contentToProcess = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Content</title>
</head>
<body>
  ${singleFileHtml}
</body>
</html>`;
    }
    
    // Parse HTML using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(contentToProcess, 'text/html');
    
    // Check if parsing was successful
    if (!doc.head || !doc.body) {
      throw new Error('Invalid HTML structure - missing head or body');
    }

    // Add CSP meta tag to head
    this.injectCSP(doc);
    
    // Add progress tracking script to body
    this.injectProgressTracking(doc);
    
    // Inject dark mode styles if needed
    if (isDarkMode) {
      this.injectDarkModeStyles(doc);
    }
    
    // Apply content sanitization
    this.sanitizeContent(doc);
    
    // Serialize back to HTML
    return doc.documentElement.outerHTML;
  }

  /**
   * Injects Content Security Policy via meta tag
   */
  private static injectCSP(doc: Document): void {
    const cspMeta = doc.createElement('meta');
    cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
    cspMeta.setAttribute('content', 
      "default-src 'none'; " +
      "script-src 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'unsafe-inline'; " +
      "img-src data: blob:; " +
      "font-src data:; " +
      "connect-src 'none'; " +
      "form-action 'none'; " +
      "frame-src 'none'; " +
      "object-src 'none'; " +
      "media-src 'none';"
    );
    doc.head.appendChild(cspMeta);
  }

  /**
   * Injects progress tracking script into document body
   */
  private static injectProgressTracking(doc: Document): void {
    const progressScript = doc.createElement('script');
    progressScript.textContent = `
(function() {
  'use strict';
  
  const progressTracker = {
    lastProgress: 0,
    isInitialized: false,
    
    init() {
      if (this.isInitialized) return;
      this.isInitialized = true;
      
      this.setupScrollTracking();
      this.requestInitialPosition();
    },
    
    setupScrollTracking() {
      let scrollTimeout;
      
      const handleScroll = () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          try {
            if (typeof window === 'undefined') return; // Guard against test environment teardown
            const progress = this.calculateProgress();
            
            // Throttle updates to prevent excessive messaging
            if (Math.abs(progress - this.lastProgress) > 0.5) {
              this.lastProgress = progress;
              this.sendProgressUpdate(progress);
            }
          } catch (error) {
            // Silently ignore errors during test teardown
          }
        }, 50); // Debounce scroll events
      };
      
      window.addEventListener('scroll', handleScroll, { passive: true });
    },
    
    calculateProgress() {
      if (typeof window === 'undefined') return 0; // Guard against test environment teardown
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const maxScroll = scrollHeight - clientHeight;
      
      if (maxScroll <= 0) {
        // Content fits entirely in viewport
        return scrollHeight > 0 ? 100 : 0;
      }
      
      // Calculate progress as percentage
      const progress = (scrollTop / maxScroll) * 100;
      return Math.min(100, Math.max(0, progress));
    },
    
    sendProgressUpdate(progress) {
      try {
        window.parent.postMessage({
          type: 'progress-update',
          progress: progress,
          scrollPosition: window.pageYOffset || document.documentElement.scrollTop
        }, '*');
      } catch (error) {
        console.warn('Failed to send progress update:', error);
      }
    },
    
    requestInitialPosition() {
      try {
        window.parent.postMessage({
          type: 'request-scroll-position'
        }, '*');
      } catch (error) {
        console.warn('Failed to request scroll position:', error);
      }
    },
    
    restoreScrollPosition(scrollPosition) {
      try {
        window.scrollTo(0, scrollPosition || 0);
        
        // Send initial progress after restoration
        setTimeout(() => {
          try {
            if (typeof window === 'undefined') return; // Guard against test environment teardown
            const progress = this.calculateProgress();
            this.sendProgressUpdate(progress);
          } catch (error) {
            // Silently ignore errors during test teardown
          }
        }, 100);
      } catch (error) {
        console.warn('Failed to restore scroll position:', error);
      }
    }
  };
  
  // Listen for scroll position restore messages
  window.addEventListener('message', (event) => {
    if (event.data.type === 'restore-scroll-position') {
      progressTracker.restoreScrollPosition(event.data.scrollPosition);
    }
  });
  
  // Send content loaded signal
  const sendContentLoaded = () => {
    try {
      window.parent.postMessage({
        type: 'content-loaded'
      }, '*');
    } catch (error) {
      console.warn('Failed to send content loaded signal:', error);
    }
  };
  
  // Initialize progress tracking when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      progressTracker.init();
      sendContentLoaded();
    });
  } else {
    progressTracker.init();
    sendContentLoaded();
  }
})();
`;
    
    doc.body.appendChild(progressScript);
  }

  /**
   * Injects dark mode styles into document head
   */
  private static injectDarkModeStyles(doc: Document): void {
    const darkModeStyle = doc.createElement('style');
    darkModeStyle.textContent = `
      /* Dark mode styles for iframe content */
      body {
        background-color: #121212 !important;
        color: #e0e0e0 !important;
      }
      
      h1, h2, h3, h4, h5, h6 {
        color: #e0e0e0 !important;
      }
      
      p, div, span, li, td, th {
        color: #b0b0b0 !important;
      }
      
      a {
        color: #90caf9 !important;
      }
      
      a:visited {
        color: #ce93d8 !important;
      }
      
      blockquote {
        background-color: #2c2c2c !important;
        border-left-color: #90caf9 !important;
        color: #b0b0b0 !important;
      }
      
      pre {
        background-color: #2c2c2c !important;
        color: #e0e0e0 !important;
      }
      
      code {
        background-color: #2c2c2c !important;
        color: #e0e0e0 !important;
      }
      
      table {
        border-color: #555 !important;
      }
      
      th {
        background-color: #2c2c2c !important;
        border-color: #555 !important;
      }
      
      td {
        border-color: #555 !important;
      }
      
      hr {
        border-color: #555 !important;
      }
      
      /* Override any inline styles that force light colors */
      * {
        color: inherit !important;
      }
      
      /* But preserve specific background colors for better contrast */
      [style*="background-color: #"] {
        background-color: #2c2c2c !important;
      }
    `;
    
    doc.head.appendChild(darkModeStyle);
  }

  /**
   * Applies minimal content sanitization on parsed DOM
   * Removes potentially dangerous elements that could bypass security
   */
  private static sanitizeContent(doc: Document): void {
    // Remove base tags that could redirect resources
    const baseTags = doc.querySelectorAll('base');
    baseTags.forEach(tag => tag.remove());
    
    // Remove meta refresh redirects
    const metaRefreshTags = doc.querySelectorAll('meta[http-equiv="refresh"]');
    metaRefreshTags.forEach(tag => tag.remove());
    
    // Remove external script tags (CSP should block these anyway)
    const externalScripts = doc.querySelectorAll('script[src]');
    externalScripts.forEach(script => {
      const src = script.getAttribute('src');
      if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'))) {
        script.remove();
      }
    });
    
    // Remove external link tags (stylesheets, etc.)
    const externalLinks = doc.querySelectorAll('link[href]');
    externalLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//'))) {
        link.remove();
      }
    });
    
    // Remove external image sources (replace with placeholder)
    const externalImages = doc.querySelectorAll('img[src]');
    externalImages.forEach(img => {
      const src = img.getAttribute('src');
      if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'))) {
        img.removeAttribute('src');
        img.setAttribute('alt', 'External image blocked for security');
        (img as HTMLElement).style.display = 'none';
      }
    });
    
    // Clean up any remaining external URLs in CSS
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(element => {
      if (element.getAttribute('style')) {
        const style = element.getAttribute('style');
        if (style) {
          const cleanStyle = style.replace(/url\(["']?https?:\/\/[^"')]*["']?\)/gi, '');
          element.setAttribute('style', cleanStyle);
        }
      }
    });
  }


}