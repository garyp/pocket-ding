import { Readability } from '@mozilla/readability';
import { DatabaseService } from './database';
import type { LocalBookmark, ContentSource, ContentSourceOption, LocalAsset } from '../types';

export class ContentFetcher {
  private static async fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkdingReader/1.0)'
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

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

    // Try to get content from assets first (unless specifically requested otherwise)
    if (preferredSource !== 'url' && preferredSource !== 'web_archive') {
      const assetContent = await this.tryGetAssetContent(bookmark);
      if (assetContent) {
        return assetContent;
      }
    }

    // Try original URL next (unless web archive is preferred)
    if (preferredSource !== 'web_archive') {
      const urlContent = await this.tryGetUrlContent(bookmark.url);
      if (urlContent) {
        return { ...urlContent, source: 'url' };
      }
    }

    // Try web archive snapshot as fallback
    if (bookmark.web_archive_snapshot_url) {
      const archiveContent = await this.tryGetUrlContent(bookmark.web_archive_snapshot_url);
      if (archiveContent) {
        return { ...archiveContent, source: 'web_archive' };
      }
    }

    // Final fallback
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
      
      if (!asset || asset.bookmark_id !== bookmark.id || !asset.content) {
        return null;
      }

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
    } catch (error) {
      console.error('Failed to get specific asset content:', error);
      return null;
    }
  }

  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private static async tryGetUrlContent(url: string): Promise<{ content: string; readability_content: string } | null> {
    try {
      const response = await this.fetchWithTimeout(url);
      
      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const readabilityContent = this.processWithReadability(html);
      
      return {
        content: html,
        readability_content: readabilityContent
      };
    } catch (error) {
      console.error(`Failed to fetch content from ${url}:`, error);
      return null;
    }
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

  private static createFallbackContent(bookmark: LocalBookmark): { content: string; readability_content: string; source: ContentSource } {
    const fallbackContent = `
      <div class="fallback-content">
        <h1>${bookmark.title}</h1>
        <p>${bookmark.description || 'Content could not be loaded for offline reading.'}</p>
        <p><a href="${bookmark.url}" target="_blank">Read online</a></p>
      </div>
    `;
    
    return {
      content: fallbackContent,
      readability_content: fallbackContent,
      source: 'url'
    };
  }

  static async getAvailableContentSources(bookmark: LocalBookmark): Promise<ContentSourceOption[]> {
    const sources: ContentSourceOption[] = [];
    
    // Check for assets and add each one individually
    const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmark.id);
    for (const asset of assets) {
      sources.push({
        type: 'asset',
        label: asset.display_name || `Asset ${asset.id}`,
        assetId: asset.id
      });
    }
    
    // URL is always available
    sources.push({
      type: 'url',
      label: 'Original URL'
    });
    
    // Check for web archive
    if (bookmark.web_archive_snapshot_url) {
      sources.push({
        type: 'web_archive',
        label: 'Web Archive'
      });
    }
    
    // Readability is always available
    sources.push({
      type: 'readability',
      label: 'Readability'
    });
    
    return sources;
  }
}