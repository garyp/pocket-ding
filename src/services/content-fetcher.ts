import { Readability } from '@mozilla/readability';
import { DatabaseService } from './database';
import { createLinkdingAPI } from './linkding-api';
import { appFetch } from '../utils/fetch-helper';
import type { LocalBookmark, ContentSource, ContentSourceOption, LocalAsset } from '../types';

export class ContentFetcher {

  static async fetchBookmarkContent(bookmark: LocalBookmark, preferredSource?: ContentSource, assetId?: number): Promise<{ 
    content: string; 
    readability_content: string; 
    source: ContentSource;
  }> {
    // Handle live URL content fetching
    if (preferredSource === 'url') {
      return await this.tryGetLiveUrlContent(bookmark);
    }

    // Try to get content from specific asset if requested
    if (preferredSource === 'asset' && assetId) {
      const assetContent = await this.tryGetSpecificAssetContent(bookmark, assetId);
      if (assetContent) {
        return assetContent;
      }
    }

    // Try to get content from assets (the only reliable source in browser)
    const assetContent = await this.tryGetAssetContent(bookmark);
    if (assetContent) {
      return assetContent;
    }

    // No assets available - create fallback that suggests opening URL
    return this.createFallbackContent(bookmark);
  }

  private static async tryGetAssetContent(bookmark: LocalBookmark): Promise<{ content: string; readability_content: string; source: ContentSource } | null> {
    try {
      const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmark.id);
      
      if (assets.length === 0) {
        return null;
      }

      // Find the first HTML asset or fallback to the first asset
      const htmlAsset = assets.find(asset => asset.content_type?.startsWith('text/html')) || assets[0];
      
      if (!htmlAsset || !htmlAsset.content) {
        return null;
      }

      // Check if this content type is supported
      if (!this.isSupportedContentType(htmlAsset.content_type)) {
        return {
          content: this.createUnsupportedContentMessage(htmlAsset),
          readability_content: this.createUnsupportedContentMessage(htmlAsset),
          source: 'asset'
        };
      }

      // Convert ArrayBuffer to text for HTML content
      const textContent = this.arrayBufferToText(htmlAsset.content);
      const readabilityContent = this.processWithReadability(textContent, bookmark);
      
      return {
        content: textContent,
        readability_content: readabilityContent,
        source: 'asset'
      };
    } catch (error) {
      console.error('Failed to get asset content:', error);
      return null;
    }
  }

  private static isSupportedContentType(contentType: string): boolean {
    return contentType?.startsWith('text/html') || contentType?.startsWith('text/plain');
  }

  /**
   * Checks if content type can be displayed by browser (in iframe or directly)
   */
  private static isBrowserSupportedContent(contentType: string): boolean {
    if (!contentType) return false;
    
    // Text content
    if (contentType.startsWith('text/')) return true;
    
    // Images
    if (contentType.startsWith('image/')) return true;
    
    // Video
    if (contentType.startsWith('video/')) return true;
    
    // Audio 
    if (contentType.startsWith('audio/')) return true;
    
    // PDF
    if (contentType.includes('application/pdf')) return true;
    
    // JSON, XML
    if (contentType.includes('application/json') || 
        contentType.includes('application/xml') ||
        contentType.includes('application/xhtml+xml')) return true;
    
    return false;
  }

  /**
   * Creates iframe wrapper for browser-supported content
   */
  private static createIframeContent(bookmark: LocalBookmark, contentType: string): string {
    return this.generateErrorContent({
      title: `${contentType} Content`,
      message: `Displaying ${contentType} content from live URL.`,
      bookmark,
      variant: 'info',
      showTechnicalDetails: false,
      customContent: `
        <div class="iframe-container" style="margin: 1rem 0;">
          <iframe 
            src="${this.escapeHtml(bookmark.url)}" 
            style="
              width: 100%;
              height: 70vh;
              border: 1px solid var(--md-sys-color-outline-variant);
              border-radius: 8px;
            "
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            loading="lazy"
          ></iframe>
        </div>
        <p style="text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem;">
          Content loaded directly from: <strong>${contentType}</strong>
        </p>
      `
    });
  }

  private static createUnsupportedContentMessage(asset: LocalAsset): string {
    return this.generateErrorContent({
      title: 'Unsupported Content Type',
      message: `This asset contains <strong>${asset.content_type}</strong> content which is not yet supported for inline viewing.`,
      variant: 'warning',
      showTechnicalDetails: true,
      technicalDetails: `
        <p><strong>Asset:</strong> ${asset.display_name}</p>
        <p><strong>Size:</strong> ${this.formatFileSize(asset.file_size)}</p>
        <p>Support for this content type will be added in a future update.</p>
      `
    });
  }

  private static arrayBufferToText(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }

  private static async tryGetSpecificAssetContent(bookmark: LocalBookmark, assetId: number): Promise<{ content: string; readability_content: string; source: ContentSource } | null> {
    try {
      const asset = await DatabaseService.getAsset(assetId);
      
      if (!asset || asset.bookmark_id !== bookmark.id) {
        return null;
      }

      // If asset has cached content, use it
      if (asset.content) {
        return this.processAssetContent(asset, bookmark);
      }

      // For archived bookmarks or uncached assets, fetch on-demand
      if (!asset.content && asset.status === 'complete') {
        console.log(`Fetching asset ${assetId} on-demand for ${bookmark.is_archived ? 'archived' : 'uncached'} bookmark ${bookmark.id}`);
        const settings = await DatabaseService.getSettings();
        if (!settings) {
          console.error('No settings found for on-demand asset fetching');
          return null;
        }

        try {
          const api = createLinkdingAPI(settings.linkding_url, settings.linkding_token);
          const content = await api.downloadAsset(bookmark.id, assetId);
          
          // For archived bookmarks, don't cache the content
          if (!bookmark.is_archived) {
            // Cache content for unarchived bookmarks
            asset.content = content;
            asset.cached_at = new Date().toISOString();
            await DatabaseService.saveAsset(asset);
          }

          // Process the fetched content
          const tempAsset = { ...asset, content };
          return this.processAssetContent(tempAsset, bookmark);
        } catch (error) {
          console.error(`Failed to fetch asset ${assetId} on-demand:`, error);
          
          // Return a specific offline/network error message for archived bookmarks
          if (bookmark.is_archived) {
            return this.createOfflineArchivedContent(bookmark, asset, error);
          }
          
          return null;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to get specific asset content:', error);
      return null;
    }
  }

  private static processAssetContent(asset: LocalAsset, bookmark?: LocalBookmark): { content: string; readability_content: string; source: ContentSource } | null {
    if (!asset.content) return null;

    // Check if this content type is supported
    if (!this.isSupportedContentType(asset.content_type)) {
      return {
        content: this.createUnsupportedContentMessage(asset),
        readability_content: this.createUnsupportedContentMessage(asset),
        source: 'asset'
      };
    }

    // Convert ArrayBuffer to text for HTML content
    const textContent = this.arrayBufferToText(asset.content);
    const readabilityContent = this.processWithReadability(textContent, bookmark);
    
    return {
      content: textContent,
      readability_content: readabilityContent,
      source: 'asset'
    };
  }

  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }


  static processWithReadability(html: string, bookmark?: LocalBookmark): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const reader = new Readability(doc, {
        debug: false,
        maxElemsToParse: 1000,
        nbTopCandidates: 5,
        charThreshold: 500,
        classesToPreserve: [],
        keepClasses: false,
        serializer: (el) => (el as Element).innerHTML,
        disableJSONLD: false,
        allowedVideoRegex: /https?:\/\/(www\.)?(youtube|vimeo)\.com/i
      });

      const article = reader.parse();
      
      // Only return readability content if parsing was successful
      if (!article?.content) {
        console.warn('Readability failed to extract content');
        return '';
      }
      
      // Inject bookmark header for readability content
      let content = article.content;
      if (bookmark) {
        content = this.injectBookmarkHeader(content, bookmark);
      }
      
      return content;
    } catch (error) {
      console.error('Failed to process with Readability:', error);
      return '';
    }
  }

  /**
   * Injects bookmark header into readability content
   * Uses simple CSS since we control readability content
   */
  private static injectBookmarkHeader(content: string, bookmark: LocalBookmark): string {
    const headerHtml = `
      <div class="pocket-ding-header" style="
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
        font-family: Roboto, sans-serif;
      ">
        <h1 style="
          color: var(--md-sys-color-on-surface);
          margin: 0 0 0.5rem 0;
          font-size: 1.75rem;
          font-weight: 400;
          line-height: 1.3;
        ">${this.escapeHtml(bookmark.title)}</h1>
        <div style="
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
          font-size: 0.875rem;
          color: var(--md-sys-color-on-surface-variant);
        ">
          <a href="${this.escapeHtml(bookmark.url)}" target="_blank" style="
            color: var(--md-sys-color-primary);
            text-decoration: none;
            word-break: break-all;
          ">${this.escapeHtml(bookmark.url)}</a>
          <span>•</span>
          <span>Added ${new Date(bookmark.date_added).toLocaleDateString()}</span>
        </div>
      </div>
    `;
    
    return headerHtml + content;
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
   * Checks if error is network-related
   */
  private static isNetworkError(error: any): boolean {
    return error?.message?.includes('fetch') || 
           error?.name === 'TypeError' || 
           error?.name === 'NetworkError' ||
           !navigator.onLine;
  }

  /**
   * Checks if error is CORS-related
   */
  private static isCorsError(error: any): boolean {
    return error?.message?.includes('CORS') || 
           error?.message?.includes('cors') ||
           (error?.name === 'TypeError' && error?.message?.includes('Failed to fetch'));
  }

  /**
   * Generates consistent error content with shared styling and structure
   */
  private static generateErrorContent(options: {
    title: string;
    message: string;
    bookmark?: LocalBookmark;
    variant: 'error' | 'warning' | 'info';
    showTechnicalDetails: boolean;
    technicalDetails?: string;
    customContent?: string;
  }): string {
    const { title, message, bookmark, variant, showTechnicalDetails, technicalDetails, customContent } = options;
    
    const variantColors = {
      error: 'var(--md-sys-color-error)',
      warning: 'var(--md-sys-color-tertiary)',
      info: 'var(--md-sys-color-secondary)'
    };
    
    const actionButtons = bookmark ? `
      <div class="error-actions">
        <a href="${this.escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer" class="primary-button">
          Open Original Website
        </a>
        ${bookmark.web_archive_snapshot_url ? `
          <a href="${this.escapeHtml(bookmark.web_archive_snapshot_url)}" target="_blank" rel="noopener noreferrer" class="secondary-button">
            Try Web Archive Version
          </a>
        ` : ''}
      </div>
    ` : '';
    
    return `
      <div class="error-content">
        <div class="error-header">
          <h2 style="color: ${variantColors[variant]}; margin-bottom: 1rem;">${title}</h2>
          ${bookmark ? `<p class="bookmark-title"><strong>${this.escapeHtml(bookmark.title)}</strong></p>` : ''}
          <p class="error-message">${message}</p>
        </div>
        
        ${showTechnicalDetails && technicalDetails ? `
          <details class="technical-details">
            <summary>Technical Details</summary>
            <div class="details-content">${technicalDetails}</div>
          </details>
        ` : ''}
        
        ${customContent || ''}
        ${actionButtons}
      </div>
      
      <style>
        .error-content {
          padding: 2rem;
          max-width: 600px;
          margin: 0 auto;
          text-align: center;
        }
        
        .error-header h2 {
          margin-bottom: 1rem;
        }
        
        .bookmark-title {
          margin-bottom: 1rem;
          color: var(--md-sys-color-on-surface);
        }
        
        .error-message {
          color: var(--md-sys-color-on-surface-variant);
          margin-bottom: 1rem;
          line-height: 1.5;
        }
        
        .technical-details {
          text-align: left;
          margin: 1.5rem 0;
          padding: 1rem;
          background: var(--md-sys-color-surface-container);
          border-radius: 8px;
        }
        
        .technical-details summary {
          cursor: pointer;
          font-weight: 500;
          color: var(--md-sys-color-on-surface);
          margin-bottom: 0.5rem;
        }
        
        .details-content {
          margin-top: 0.5rem;
        }
        
        .details-content h4 {
          color: var(--md-sys-color-on-surface);
          margin: 1rem 0 0.5rem 0;
        }
        
        .details-content p {
          color: var(--md-sys-color-on-surface-variant);
          margin: 0.5rem 0;
          line-height: 1.5;
        }
        
        .details-content ul {
          color: var(--md-sys-color-on-surface-variant);
          margin: 0.5rem 0;
        }
        
        .details-content code {
          background: var(--md-sys-color-surface-container-high);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-family: 'Roboto Mono', monospace;
          font-size: 0.875rem;
        }
        
        .error-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 1.5rem;
        }
        
        .primary-button, .secondary-button {
          padding: 0.75rem 1.5rem;
          border-radius: 24px;
          text-decoration: none;
          font-weight: 500;
          transition: background-color 0.2s ease;
        }
        
        .primary-button {
          background: var(--md-sys-color-primary);
          color: var(--md-sys-color-on-primary);
        }
        
        .primary-button:hover {
          background: var(--md-sys-color-primary-container);
          color: var(--md-sys-color-on-primary-container);
        }
        
        .secondary-button {
          background: var(--md-sys-color-secondary-container);
          color: var(--md-sys-color-on-secondary-container);
        }
        
        .secondary-button:hover {
          background: var(--md-sys-color-secondary);
          color: var(--md-sys-color-on-secondary);
        }
      </style>
    `;
  }

  private static createOfflineArchivedContent(bookmark: LocalBookmark, asset: LocalAsset, error: any): { content: string; readability_content: string; source: ContentSource } {
    const isNetworkError = this.isNetworkError(error);
    const statusText = isNetworkError ? 'offline or network connection failed' : 'server error occurred';
    
    const content = this.generateErrorContent({
      title: 'Content Unavailable',
      message: `This archived bookmark requires an internet connection to load content. ${isNetworkError ? 'Please check your network connection and try again.' : 'Please try again later.'}`,
      bookmark,
      variant: 'warning',
      showTechnicalDetails: true,
      technicalDetails: `Failed to fetch "${asset.display_name}" - ${statusText}`
    });

    return {
      content,
      readability_content: content,
      source: 'asset'
    };
  }

  private static async tryGetLiveUrlContent(bookmark: LocalBookmark): Promise<{ content: string; readability_content: string; source: ContentSource }> {
    try {
      // Attempt to fetch the live URL content using our app's fetch helper
      const response = await appFetch(bookmark.url, {
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'User-Agent': 'PocketDing/1.0 (Progressive Web App)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      
      // Handle HTML content with Readability processing
      if (contentType.includes('text/html')) {
        const html = await response.text();
        const readabilityContent = this.processWithReadability(html, bookmark);
        
        return {
          content: html,
          readability_content: readabilityContent,
          source: 'url'
        };
      }
      
      // For other browser-supported content types, create iframe wrapper
      if (this.isBrowserSupportedContent(contentType)) {
        const iframeContent = this.createIframeContent(bookmark, contentType);
        return {
          content: iframeContent,
          readability_content: iframeContent,
          source: 'url'
        };
      }
      
      // For unsupported content types, provide helpful message
      return this.createUnsupportedLiveContentMessage(bookmark, contentType);
    } catch (error) {
      console.error('Failed to fetch live URL content:', error);
      return this.createLiveUrlErrorContent(bookmark, error);
    }
  }

  private static createUnsupportedLiveContentMessage(bookmark: LocalBookmark, contentType: string): { content: string; readability_content: string; source: ContentSource } {
    const content = this.generateErrorContent({
      title: 'Unsupported Content Type',
      message: `The live URL contains <strong>${contentType}</strong> content which cannot be displayed inline.`,
      bookmark,
      variant: 'info',
      showTechnicalDetails: false,
      customContent: '<p>Please open the link directly to view this content.</p>'
    });
    
    return {
      content,
      readability_content: content,
      source: 'url'
    };
  }

  private static createLiveUrlErrorContent(bookmark: LocalBookmark, error: any): { content: string; readability_content: string; source: ContentSource } {
    const isNetworkError = this.isNetworkError(error);
    const isCorsError = this.isCorsError(error);

    let errorMessage = 'Failed to load content from the live URL.';
    let troubleshooting = '';
    
    if (isCorsError) {
      errorMessage = 'Cannot load content due to CORS (Cross-Origin Resource Sharing) restrictions.';
      troubleshooting = `
        <h4>Why this happens:</h4>
        <p>The website blocks direct content loading from other apps for security reasons.</p>
        <h4>Solutions:</h4>
        <ul>
          <li>Open the link directly in a new tab</li>
          <li>Ask your Linkding administrator to enable content archiving</li>
          <li>Use the bookmarklet to save content when adding bookmarks</li>
        </ul>
      `;
    } else if (isNetworkError) {
      errorMessage = 'Cannot load content due to network connectivity issues.';
      troubleshooting = `
        <h4>Possible causes:</h4>
        <ul>
          <li>No internet connection</li>
          <li>Website is temporarily unavailable</li>
          <li>Network firewall blocking the request</li>
        </ul>
      `;
    } else {
      troubleshooting = `
        <h4>Error details:</h4>
        <p><code>${error?.message || 'Unknown error'}</code></p>
      `;
    }

    const content = this.generateErrorContent({
      title: 'Live URL Content Unavailable',
      message: errorMessage,
      bookmark,
      variant: 'error',
      showTechnicalDetails: true,
      technicalDetails: troubleshooting
    });

    return {
      content,
      readability_content: content,
      source: 'url'
    };
  }

  private static createFallbackContent(bookmark: LocalBookmark): { content: string; readability_content: string; source: ContentSource } {
    const content = this.generateErrorContent({
      title: 'No Cached Content Available',
      message: bookmark.description || 'No cached content available for offline reading.',
      bookmark,
      variant: 'info',
      showTechnicalDetails: false,
      customContent: `
        <div class="tip-section" style="margin-top: 1rem; padding: 1rem; background: var(--md-sys-color-primary-container); border-radius: 8px;">
          <p style="margin: 0; color: var(--md-sys-color-on-primary-container); font-weight: 500;">
            💡 <strong>Tip:</strong> Ask your Linkding administrator to enable content archiving for better offline reading.
          </p>
        </div>
      `
    });
    
    return {
      content,
      readability_content: content,
      source: 'asset'
    };
  }

  static async getAvailableContentSources(bookmark: LocalBookmark): Promise<ContentSourceOption[]> {
    const sources: ContentSourceOption[] = [];
    
    // Check for assets and add each one individually
    // For archived bookmarks, include all assets even if not cached
    const assets = await DatabaseService.getAssetsByBookmarkId(bookmark.id);
    const completedAssets = assets.filter(asset => asset.status === 'complete');
    
    for (const asset of completedAssets) {
      const label = asset.display_name || `Asset ${asset.id}`;
      const sourceLabel = bookmark.is_archived && !asset.content ? 
        `${label} (on-demand)` : label;
      
      sources.push({
        type: 'asset',
        label: sourceLabel,
        assetId: asset.id
      });
    }
    
    // Always add URL source as fallback
    sources.push({
      type: 'url',
      label: 'Live URL'
    });
    
    return sources;
  }
}