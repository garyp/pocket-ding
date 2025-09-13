import { Readability } from '@mozilla/readability';
import { DatabaseService } from './database';
import { createLinkdingAPI } from './linkding-api';
import { DebugService } from './debug-service';
import type { LocalBookmark, ContentSource, ContentSourceOption, LocalAsset, ContentResult } from '../types';
export class ContentFetcher {

  static async fetchBookmarkContent(bookmark: LocalBookmark, preferredSource?: ContentSource, assetId?: number): Promise<ContentResult> {
    // Handle live URL content - return iframe approach to bypass CORS issues
    if (preferredSource === 'url') {
      return {
        source: 'url',
        content_type: 'iframe',
        iframe_url: bookmark.url,
        metadata: {
          url: bookmark.url
        }
      };
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

  private static async tryGetAssetContent(bookmark: LocalBookmark): Promise<ContentResult | null> {
    try {
      const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmark.id);
      
      if (assets.length === 0) {
        return null;
      }

      // Find the first HTML asset or fallback to the first asset
      const htmlAsset = assets.find(asset => asset.content_type?.startsWith('text/html')) || assets[0];
      
      if (!htmlAsset) {
        return null;
      }

      // If asset has cached content, use it directly
      if (htmlAsset.content) {
        return this.processAssetContent(htmlAsset, bookmark);
      }

      // For assets without cached content (e.g., archived bookmarks), fetch on-demand
      if (!htmlAsset.content && htmlAsset.status === 'complete') {
        DebugService.logInfo('app', `Fetching asset ${htmlAsset.id} on-demand for ${bookmark.is_archived ? 'archived' : 'uncached'} bookmark ${bookmark.id}`, {
          asset_id: htmlAsset.id,
          bookmark_id: bookmark.id,
          bookmark_archived: bookmark.is_archived
        });
        const settings = await DatabaseService.getSettings();
        if (!settings) {
          DebugService.logError(new Error('No settings found for on-demand asset fetching'), 'app', 'Missing settings for asset fetching', { asset_id: htmlAsset.id, bookmark_id: bookmark.id });
          return null;
        }

        try {
          const api = createLinkdingAPI(settings.linkding_url, settings.linkding_token);
          const content = await api.downloadAsset(bookmark.id, htmlAsset.id);
          
          // For archived bookmarks, don't cache the content
          if (!bookmark.is_archived) {
            // Cache content for unarchived bookmarks
            htmlAsset.content = content;
            htmlAsset.cached_at = new Date().toISOString();
            await DatabaseService.saveAsset(htmlAsset);
          }

          // Process the fetched content
          const tempAsset = { ...htmlAsset, content };
          return this.processAssetContent(tempAsset, bookmark);
        } catch (error) {
          DebugService.logError(error as Error, 'app', `Failed to fetch asset ${htmlAsset.id} on-demand`, { asset_id: htmlAsset.id, bookmark_id: bookmark.id, bookmark_archived: bookmark.is_archived });
          
          // Return a specific offline/network error message for archived bookmarks
          if (bookmark.is_archived) {
            return this.createOfflineArchivedContent(bookmark, htmlAsset, error);
          }
          
          return null;
        }
      }

      return null;
    } catch (error) {
      DebugService.logError(error as Error, 'app', 'Failed to get asset content', { bookmark_id: bookmark.id });
      return null;
    }
  }

  private static isSupportedContentType(contentType: string): boolean {
    return contentType?.startsWith('text/html') || contentType?.startsWith('text/plain');
  }




  private static arrayBufferToText(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }


  private static async tryGetSpecificAssetContent(bookmark: LocalBookmark, assetId: number): Promise<ContentResult | null> {
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
        DebugService.logInfo('app', `Fetching asset ${assetId} on-demand for ${bookmark.is_archived ? 'archived' : 'uncached'} bookmark ${bookmark.id}`, { asset_id: assetId, bookmark_id: bookmark.id, bookmark_archived: bookmark.is_archived });
        const settings = await DatabaseService.getSettings();
        if (!settings) {
          DebugService.logError(new Error('No settings found for on-demand asset fetching'), 'app', 'Missing settings for asset fetching', { asset_id: assetId, bookmark_id: bookmark.id });
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
          DebugService.logError(error as Error, 'app', `Failed to fetch asset ${assetId} on-demand`, { asset_id: assetId, bookmark_id: bookmark.id, bookmark_archived: bookmark.is_archived });
          
          // Return a specific offline/network error message for archived bookmarks
          if (bookmark.is_archived) {
            return this.createOfflineArchivedContent(bookmark, asset, error);
          }
          
          return null;
        }
      }

      return null;
    } catch (error) {
      DebugService.logError(error as Error, 'app', 'Failed to get specific asset content', { asset_id: assetId, bookmark_id: bookmark.id });
      return null;
    }
  }

  private static processAssetContent(asset: LocalAsset, bookmark?: LocalBookmark): ContentResult | null {
    if (!asset.content) return null;

    // Check if this content type is supported
    if (!this.isSupportedContentType(asset.content_type)) {
      return {
        source: 'asset',
        content_type: 'unsupported',
        error: {
          type: 'unsupported',
          message: `This asset contains ${asset.content_type} content which is not yet supported for inline viewing.`,
          details: 'Support for this content type will be added in a future update.',
          suggestions: ['Try opening the original URL directly']
        },
        metadata: {
          content_type: asset.content_type,
          file_size: asset.file_size,
          asset_id: asset.id,
          display_name: asset.display_name
        }
      };
    }

    // Convert ArrayBuffer to text for HTML content
    const textContent = this.arrayBufferToText(asset.content);
    const readabilityContent = this.processWithReadability(textContent, bookmark);
    
    return {
      source: 'asset',
      content_type: 'html',
      html_content: textContent,
      readability_content: readabilityContent,
      metadata: {
        content_type: asset.content_type,
        file_size: asset.file_size,
        asset_id: asset.id,
        display_name: asset.display_name
      }
    };
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
        DebugService.logWarning('app', 'Readability failed to extract content', { bookmark_id: bookmark?.id });
        return '';
      }
      
      // Inject bookmark header for readability content
      let content = article.content;
      if (bookmark) {
        content = this.injectBookmarkHeader(content, bookmark);
      }
      
      return content;
    } catch (error) {
      DebugService.logError(error as Error, 'app', 'Failed to process with Readability', { bookmark_id: bookmark?.id });
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



  private static createOfflineArchivedContent(_bookmark: LocalBookmark, asset: LocalAsset, error: any): ContentResult {
    const isNetworkError = this.isNetworkError(error);
    const statusText = isNetworkError ? 'offline or network connection failed' : 'server error occurred';
    
    return {
      source: 'asset',
      content_type: 'error',
      error: {
        type: isNetworkError ? 'network' : 'server_error',
        message: `This archived bookmark requires an internet connection to load content. ${isNetworkError ? 'Please check your network connection and try again.' : 'Please try again later.'}`,
        details: `Failed to fetch "${asset.display_name}" - ${statusText}`,
        suggestions: [
          'Check your internet connection',
          'Try again later',
          'Contact your Linkding administrator'
        ]
      },
      metadata: {
        asset_id: asset.id,
        display_name: asset.display_name,
        content_type: asset.content_type
      }
    };
  }


  private static createFallbackContent(bookmark: LocalBookmark): ContentResult {
    return {
      source: 'asset',
      content_type: 'error',
      error: {
        type: 'not_found',
        message: 'No cached content available for offline reading.',
        details: bookmark.description || '',
        suggestions: [
          'Ask your Linkding administrator to enable content archiving',
          'Open the original URL to read online',
          'Use the bookmarklet when adding bookmarks to save content'
        ]
      }
    };
  }

  static getAvailableContentSources(bookmark: LocalBookmark, assets: LocalAsset[]): ContentSourceOption[] {
    const sources: ContentSourceOption[] = [];
    
    // Add asset sources
    for (const asset of assets) {
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