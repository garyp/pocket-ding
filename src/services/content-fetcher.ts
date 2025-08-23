import { Readability } from '@mozilla/readability';
import { DatabaseService } from './database';
import { createLinkdingAPI } from './linkding-api';
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

  private static createUnsupportedContentMessage(asset: LocalAsset): string {
    return `
      <div class="unsupported-content">
        <h2>Unsupported Content Type</h2>
        <p>This asset contains <strong>${asset.content_type}</strong> content which is not yet supported for inline viewing.</p>
        <p><strong>Asset:</strong> ${asset.display_name}</p>
        <p><strong>Size:</strong> ${this.formatFileSize(asset.file_size)}</p>
        <p>Support for this content type will be added in a future update.</p>
      </div>
    `;
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

  private static createOfflineArchivedContent(bookmark: LocalBookmark, asset: LocalAsset, error: any): { content: string; readability_content: string; source: ContentSource } {
    const isNetworkError = error?.message?.includes('fetch') || 
                          error?.name === 'TypeError' || 
                          error?.name === 'NetworkError' ||
                          !navigator.onLine;

    const statusText = isNetworkError ? 'offline or network connection failed' : 'server error occurred';
    
    const offlineContent = `
      <div class="offline-archived-content">
        <sl-alert variant="warning" open>
          <sl-icon slot="icon" name="wifi-off"></sl-icon>
          <h3>Content Unavailable</h3>
          <p><strong>${bookmark.title}</strong></p>
          <p>
            This archived bookmark requires an internet connection to load content. 
            ${isNetworkError ? 'Please check your network connection and try again.' : 'Please try again later.'}
          </p>
        </sl-alert>
        
        <sl-details summary="Technical Details" style="margin: 1rem 0;">
          <p>Failed to fetch "${asset.display_name}" - ${statusText}</p>
        </sl-details>
        
        <sl-card style="margin: 1rem 0;">
          <h4 slot="header">Alternative Access</h4>
          <p>You can still access this content directly:</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
            <sl-button variant="primary" href="${bookmark.url}" target="_blank" rel="noopener noreferrer">
              <sl-icon slot="prefix" name="box-arrow-up-right"></sl-icon>
              Open Original URL
            </sl-button>
            ${bookmark.web_archive_snapshot_url ? `
              <sl-button variant="neutral" href="${bookmark.web_archive_snapshot_url}" target="_blank" rel="noopener noreferrer">
                <sl-icon slot="prefix" name="archive"></sl-icon>
                Web Archive
              </sl-button>
            ` : ''}
          </div>
        </sl-card>
        
        ${bookmark.description ? `
          <sl-card>
            <h4 slot="header">Description</h4>
            <p style="font-style: italic;">${bookmark.description}</p>
          </sl-card>
        ` : ''}
      </div>
      
      <style>
        .offline-archived-content {
          padding: 2rem;
          max-width: 600px;
          margin: 0 auto;
        }
        
        .offline-archived-content sl-alert {
          text-align: center;
          margin-bottom: 1rem;
        }
        
        .offline-archived-content sl-card {
          margin-bottom: 1rem;
        }
        
        .offline-archived-content h3 {
          margin: 0 0 1rem 0;
          color: var(--sl-color-warning-700);
        }
        
        .offline-archived-content h4 {
          margin: 0;
          color: var(--sl-color-neutral-700);
        }
        
        .offline-archived-content p {
          margin: 0.5rem 0;
          color: var(--sl-color-neutral-600);
          line-height: 1.5;
        }
      </style>
    `;

    return {
      content: offlineContent,
      readability_content: offlineContent,
      source: 'asset'
    };
  }

  private static async tryGetLiveUrlContent(bookmark: LocalBookmark): Promise<{ content: string; readability_content: string; source: ContentSource }> {
    try {
      // Attempt to fetch the live URL content
      const response = await fetch(bookmark.url, {
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
      
      // Only handle HTML content for live URLs
      if (!contentType.includes('text/html')) {
        return this.createUnsupportedLiveContentMessage(bookmark, contentType);
      }

      const html = await response.text();
      const readabilityContent = this.processWithReadability(html, bookmark);
      
      return {
        content: html,
        readability_content: readabilityContent,
        source: 'url'
      };
    } catch (error) {
      console.error('Failed to fetch live URL content:', error);
      return this.createLiveUrlErrorContent(bookmark, error);
    }
  }

  private static createUnsupportedLiveContentMessage(bookmark: LocalBookmark, contentType: string): { content: string; readability_content: string; source: ContentSource } {
    const content = `
      <div class="unsupported-live-content">
        <h2>Unsupported Content Type</h2>
        <p>The live URL contains <strong>${contentType}</strong> content which cannot be displayed inline.</p>
        <p><strong>URL:</strong> <a href="${bookmark.url}" target="_blank">${bookmark.url}</a></p>
        <p>Please open the link directly to view this content.</p>
      </div>
      
      <style>
        .unsupported-live-content {
          text-align: center;
          padding: 2rem;
          background: var(--md-sys-color-surface-container);
          border: 2px dashed var(--md-sys-color-outline-variant);
          border-radius: 8px;
          margin: 2rem 0;
        }
        
        .unsupported-live-content h2 {
          color: var(--md-sys-color-secondary);
          margin-bottom: 1rem;
        }
        
        .unsupported-live-content p {
          color: var(--md-sys-color-on-surface-variant);
          margin-bottom: 0.5rem;
        }
        
        .unsupported-live-content a {
          color: var(--md-sys-color-primary);
          text-decoration: none;
          word-break: break-all;
        }
        
        .unsupported-live-content a:hover {
          text-decoration: underline;
        }
      </style>
    `;
    
    return {
      content,
      readability_content: content,
      source: 'url'
    };
  }

  private static createLiveUrlErrorContent(bookmark: LocalBookmark, error: any): { content: string; readability_content: string; source: ContentSource } {
    const isNetworkError = error?.message?.includes('fetch') || 
                          error?.name === 'TypeError' || 
                          error?.name === 'NetworkError' ||
                          !navigator.onLine;

    const isCorsError = error?.message?.includes('CORS') || 
                       error?.message?.includes('cors') ||
                       (error?.name === 'TypeError' && error?.message?.includes('Failed to fetch'));

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

    const content = `
      <div class="live-url-error">
        <h2>Live URL Content Unavailable</h2>
        <p><strong>${bookmark.title}</strong></p>
        <p>${errorMessage}</p>
        
        ${troubleshooting}
        
        <div class="error-actions">
          <a href="${bookmark.url}" target="_blank" rel="noopener noreferrer" class="primary-button">
            Open Original Website
          </a>
          ${bookmark.web_archive_snapshot_url ? `
            <a href="${bookmark.web_archive_snapshot_url}" target="_blank" rel="noopener noreferrer" class="secondary-button">
              Try Web Archive Version
            </a>
          ` : ''}
        </div>
      </div>
      
      <style>
        .live-url-error {
          padding: 2rem;
          max-width: 600px;
          margin: 0 auto;
          text-align: center;
        }
        
        .live-url-error h2 {
          color: var(--md-sys-color-error);
          margin-bottom: 1rem;
        }
        
        .live-url-error h4 {
          color: var(--md-sys-color-on-surface);
          margin: 1.5rem 0 0.5rem 0;
          text-align: left;
        }
        
        .live-url-error p {
          color: var(--md-sys-color-on-surface-variant);
          margin-bottom: 1rem;
          line-height: 1.5;
        }
        
        .live-url-error ul {
          text-align: left;
          color: var(--md-sys-color-on-surface-variant);
          margin: 0.5rem 0;
        }
        
        .live-url-error code {
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

    return {
      content,
      readability_content: content,
      source: 'url'
    };
  }

  private static createFallbackContent(bookmark: LocalBookmark): { content: string; readability_content: string; source: ContentSource } {
    const fallbackContent = `
      <div class="fallback-content">
        <sl-alert variant="neutral" open>
          <sl-icon slot="icon" name="info-circle"></sl-icon>
          <h3>No Cached Content Available</h3>
          <p><strong>${bookmark.title}</strong></p>
          <p>${bookmark.description || 'No cached content available for offline reading.'}</p>
        </sl-alert>
        
        <sl-card>
          <h4 slot="header">Access Content</h4>
          <p>This bookmark doesn't have cached content. To read the full article:</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
            <sl-button variant="primary" href="${bookmark.url}" target="_blank" rel="noopener noreferrer">
              <sl-icon slot="prefix" name="box-arrow-up-right"></sl-icon>
              Open in New Tab
            </sl-button>
            ${bookmark.web_archive_snapshot_url ? `
              <sl-button variant="neutral" href="${bookmark.web_archive_snapshot_url}" target="_blank" rel="noopener noreferrer">
                <sl-icon slot="prefix" name="archive"></sl-icon>
                Open Web Archive Version
              </sl-button>
            ` : ''}
          </div>
        </sl-card>
        
        <sl-alert variant="primary" open style="margin-top: 1rem;">
          <sl-icon slot="icon" name="lightbulb"></sl-icon>
          <strong>Tip:</strong> Ask your Linkding administrator to enable content archiving for better offline reading.
        </sl-alert>
      </div>
      
      <style>
        .fallback-content {
          padding: 2rem;
          max-width: 600px;
          margin: 0 auto;
        }
        
        .fallback-content sl-alert {
          text-align: center;
          margin-bottom: 1rem;
        }
        
        .fallback-content h3 {
          margin: 0 0 1rem 0;
          color: var(--sl-color-neutral-700);
        }
        
        .fallback-content h4 {
          margin: 0;
          color: var(--sl-color-neutral-700);
        }
        
        .fallback-content p {
          margin: 0.5rem 0;
          color: var(--sl-color-neutral-600);
          line-height: 1.5;
        }
      </style>
    `;
    
    return {
      content: fallbackContent,
      readability_content: fallbackContent,
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