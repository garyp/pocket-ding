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
      const readabilityContent = this.processWithReadability(textContent);
      
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
        return this.processAssetContent(asset);
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
          return this.processAssetContent(tempAsset);
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

  private static processAssetContent(asset: LocalAsset): { content: string; readability_content: string; source: ContentSource } | null {
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
    const readabilityContent = this.processWithReadability(textContent);
    
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


  private static processWithReadability(html: string): string {
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
      return article?.content || html;
    } catch (error) {
      console.error('Failed to process with Readability:', error);
      return html;
    }
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
    
    // Readability is available when there are assets to process
    if (completedAssets.length > 0) {
      sources.push({
        type: 'readability',
        label: 'Readability'
      });
    }
    
    return sources;
  }
}