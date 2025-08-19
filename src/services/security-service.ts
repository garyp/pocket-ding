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
    bookmark?: { id: number; title: string; url: string; date_added: string },
    isReadabilityMode: boolean = false
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
    
    // Inject bookmark header if in readability mode
    if (bookmark && isReadabilityMode) {
      this.injectBookmarkHeader(doc, bookmark);
    }
    
    // Add progress tracking script to body
    this.injectProgressTracking(doc);
    
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
          const progress = this.calculateProgress();
          
          // Throttle updates to prevent excessive messaging
          if (Math.abs(progress - this.lastProgress) > 0.5) {
            this.lastProgress = progress;
            this.sendProgressUpdate(progress);
          }
        }, 50); // Debounce scroll events
      };
      
      window.addEventListener('scroll', handleScroll, { passive: true });
    },
    
    calculateProgress() {
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
          const progress = this.calculateProgress();
          this.sendProgressUpdate(progress);
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
   * Injects bookmark header for readability mode only
   * Uses inline styles to avoid CSS conflicts
   */
  private static injectBookmarkHeader(doc: Document, bookmark: { id: number; title: string; url: string; date_added: string }): void {
    const headerHtml = `
      <div class="pocket-ding-header" style="
        margin: 0 0 2rem 0 !important;
        padding: 1rem !important;
        border-bottom: 1px solid #cac4d0 !important;
        background: transparent !important;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif !important;
        line-height: 1.5 !important;
        position: relative !important;
        z-index: 1000 !important;
      ">
        <h1 class="pocket-ding-title" style="
          color: var(--md-sys-color-on-surface, #1d1b20) !important;
          margin: 0 0 0.5rem 0 !important;
          font-size: 1.75rem !important;
          font-weight: 400 !important;
          line-height: 2.25rem !important;
          letter-spacing: 0 !important;
          font-family: inherit !important;
        ">${this.escapeHtml(bookmark.title)}</h1>
        <div class="pocket-ding-meta" style="
          display: flex !important;
          align-items: center !important;
          gap: 1rem !important;
          flex-wrap: wrap !important;
          font-size: 0.875rem !important;
          line-height: 1.25rem !important;
          color: var(--md-sys-color-on-surface-variant, #49454f) !important;
          font-family: inherit !important;
        ">
          <a href="${this.escapeHtml(bookmark.url)}" target="_blank" style="
            color: var(--md-sys-color-primary, #6750a4) !important;
            text-decoration: none !important;
            word-break: break-all !important;
            font-family: inherit !important;
          ">${this.escapeHtml(bookmark.url)}</a>
          <span style="color: var(--md-sys-color-on-surface-variant, #49454f) !important;">•</span>
          <span style="color: var(--md-sys-color-on-surface-variant, #49454f) !important; font-family: inherit !important;">
            Added ${new Date(bookmark.date_added).toLocaleDateString()}
          </span>
        </div>
      </div>
    `;
    
    // Insert header at the beginning of body content
    doc.body.insertAdjacentHTML('afterbegin', headerHtml);
  }

  /**
   * Escapes HTML to prevent XSS attacks
   */
  private static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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