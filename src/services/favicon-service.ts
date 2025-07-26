import { DatabaseService } from './database';
import { appFetch } from '../utils/fetch-helper';
import type { LocalAsset } from '../types';

export class FaviconService extends EventTarget {
  private static readonly FAVICON_ASSET_TYPE = 'favicon';
  private static readonly DEFAULT_FAVICON_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMyIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEwIiByeD0iMiIgZmlsbD0iIzk0YTNiOCIvPgo8L3N2Zz4K';
  
  private static instance: FaviconService | null = null;
  private faviconCache = new Map<number, string>();
  private loadingSet = new Set<number>();
  private initializationPromise: Promise<void> | null = null;

  static getInstance(): FaviconService {
    if (!this.instance) {
      this.instance = new FaviconService();
      // Initialize cache from database on first access
      this.instance.initializationPromise = this.instance.initializeCache();
    }
    return this.instance;
  }

  /**
   * Wait for cache to be initialized
   */
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Check if initialization is complete (for testing)
   */
  isInitialized(): boolean {
    return this.initializationPromise !== null;
  }

  /**
   * Initialize cache from database
   */
  private async initializeCache(): Promise<void> {
    try {
      // Get all bookmarks and their cached favicons
      const bookmarks = await DatabaseService.getAllBookmarks();
      
      for (const bookmark of bookmarks) {
        if (bookmark.favicon_url) {
          const cachedFavicon = await FaviconService.getCachedFavicon(bookmark.id);
          if (cachedFavicon) {
            this.faviconCache.set(bookmark.id, cachedFavicon);
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize favicon cache:', error);
    }
  }

  /**
   * Get cached favicon URL (synchronous, for UI)
   */
  getCachedFaviconUrl(bookmarkId: number): string {
    return this.faviconCache.get(bookmarkId) || FaviconService.DEFAULT_FAVICON_DATA_URL;
  }

  /**
   * Get all cached favicon URLs
   */
  getAllCachedFaviconUrls(): Map<number, string> {
    return new Map(this.faviconCache);
  }

  /**
   * Load favicons for visible bookmarks with concurrency control
   */
  async loadFaviconsForBookmarks(bookmarks: { id: number; favicon_url?: string }[], maxVisible = 20): Promise<void> {
    const visibleBookmarks = bookmarks.slice(0, maxVisible);
    await this.loadWithConcurrencyLimit(visibleBookmarks, 2); // Reduced from 3 to 2 to prevent resource exhaustion
  }

  /**
   * Load favicon for a single bookmark (for lazy loading)
   */
  async loadFaviconForBookmark(bookmarkId: number, faviconUrl?: string): Promise<void> {
    if (this.faviconCache.has(bookmarkId) || this.loadingSet.has(bookmarkId)) {
      return;
    }

    this.loadingSet.add(bookmarkId);
    
    try {
      const url = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      this.faviconCache.set(bookmarkId, url);
      
      // Emit event for reactive components
      this.dispatchEvent(new CustomEvent('favicon-loaded', {
        detail: { bookmarkId, faviconUrl: url }
      }));
    } catch (error) {
      console.debug(`Failed to load favicon for bookmark ${bookmarkId}:`, error);
      this.faviconCache.set(bookmarkId, FaviconService.DEFAULT_FAVICON_DATA_URL);
      
      this.dispatchEvent(new CustomEvent('favicon-loaded', {
        detail: { bookmarkId, faviconUrl: FaviconService.DEFAULT_FAVICON_DATA_URL }
      }));
    } finally {
      this.loadingSet.delete(bookmarkId);
    }
  }

  private async loadWithConcurrencyLimit(bookmarks: { id: number; favicon_url?: string }[], maxConcurrent: number): Promise<void> {
    const semaphore = new Array(maxConcurrent).fill(Promise.resolve());
    let index = 0;

    const loadNext = async (): Promise<void> => {
      if (index >= bookmarks.length) return;
      
      const bookmark = bookmarks[index++];
      if (bookmark) {
        await this.loadFaviconForBookmark(bookmark.id, bookmark.favicon_url);
        // Longer delay to prevent resource exhaustion
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return loadNext();
    };

    await Promise.allSettled(semaphore.map(() => loadNext()));
  }

  static async getFaviconForBookmark(bookmarkId: number, faviconUrl?: string): Promise<string> {
    // First check if we have a cached favicon
    const cachedFavicon = await this.getCachedFavicon(bookmarkId);
    if (cachedFavicon) {
      return cachedFavicon;
    }

    // If no cached favicon and no URL provided, return default
    if (!faviconUrl) {
      return this.DEFAULT_FAVICON_DATA_URL;
    }

    // Check if we're in demo mode - provide mock favicons for example.com URLs
    if (faviconUrl.startsWith('https://example.com/')) {
      return this.getMockFavicon(bookmarkId);
    }

    // Try to fetch and cache the favicon
    try {
      const dataUrl = await this.fetchAndCacheFavicon(bookmarkId, faviconUrl);
      return dataUrl;
    } catch (error) {
      // Only log errors that aren't network/CORS related to reduce console noise
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.debug(`Network error fetching favicon for bookmark ${bookmarkId} (likely CORS):`, faviconUrl);
      } else {
        console.warn(`Failed to fetch favicon for bookmark ${bookmarkId}:`, error);
      }
      return this.DEFAULT_FAVICON_DATA_URL;
    }
  }

  private static async getCachedFavicon(bookmarkId: number): Promise<string | null> {
    try {
      const assets = await DatabaseService.getAssetsByBookmarkId(bookmarkId);
      const faviconAsset = assets.find(asset => 
        asset.asset_type === this.FAVICON_ASSET_TYPE && 
        asset.status === 'complete' && 
        asset.content
      );
      
      if (faviconAsset && faviconAsset.content) {
        // Convert ArrayBuffer to data URL
        return this.arrayBufferToDataUrl(faviconAsset.content, faviconAsset.content_type);
      }
      
      return null;
    } catch (error) {
      console.error(`Error retrieving cached favicon for bookmark ${bookmarkId}:`, error);
      return null;
    }
  }

  private static async fetchAndCacheFavicon(bookmarkId: number, faviconUrl: string): Promise<string> {
    try {
      // Validate URL before attempting fetch
      let validUrl: URL;
      try {
        validUrl = new URL(faviconUrl);
        // Only allow http/https protocols
        if (!['http:', 'https:'].includes(validUrl.protocol)) {
          throw new Error(`Invalid protocol: ${validUrl.protocol}`);
        }
      } catch (urlError) {
        throw new Error(`Invalid favicon URL: ${faviconUrl} - ${urlError}`);
      }
      
      // Add request timeout and abort controller to prevent resource exhaustion
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await appFetch(faviconUrl, {
        signal: controller.signal,
        // Add headers to be more respectful to servers
        headers: {
          'User-Agent': 'Pocket-Ding/1.0 (+favicon-fetcher)',
          'Accept': 'image/*,*/*;q=0.8'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/x-icon';
      
      // Save to database
      const faviconAsset: LocalAsset = {
        id: 0, // Will be auto-generated
        bookmark_id: bookmarkId,
        asset_type: this.FAVICON_ASSET_TYPE,
        content_type: contentType,
        display_name: 'favicon',
        file_size: arrayBuffer.byteLength,
        status: 'complete',
        date_created: new Date().toISOString(),
        content: arrayBuffer,
        cached_at: new Date().toISOString()
      };

      await DatabaseService.saveAsset(faviconAsset);
      
      return this.arrayBufferToDataUrl(arrayBuffer, contentType);
    } catch (error) {
      // Log the actual error and URL for debugging
      console.error(`Favicon fetch failed for bookmark ${bookmarkId}:`, {
        url: faviconUrl,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Save failed attempt to avoid repeated requests, but with shorter retry time for CORS errors
      const isNetworkError = error instanceof TypeError && error.message.includes('Failed to fetch');
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      const isInsufficientResources = error instanceof Error && error.message.includes('ERR_INSUFFICIENT_RESOURCES');
      
      const failedAsset: LocalAsset = {
        id: 0,
        bookmark_id: bookmarkId,
        asset_type: this.FAVICON_ASSET_TYPE,
        content_type: 'text/plain',
        display_name: 'favicon',
        file_size: 0,
        status: 'failure',
        date_created: new Date().toISOString(),
        cached_at: new Date().toISOString()
      };

      await DatabaseService.saveAsset(failedAsset);
      
      // Provide more specific error information for debugging
      if (isAbortError) {
        throw new Error(`Favicon request timeout for: ${faviconUrl}`);
      } else if (isInsufficientResources) {
        throw new Error(`Resource exhaustion fetching favicon: ${faviconUrl}`);
      } else if (isNetworkError) {
        throw new Error(`Network/CORS error fetching favicon: ${faviconUrl}`);
      } else {
        throw error;
      }
    }
  }

  private static arrayBufferToDataUrl(buffer: ArrayBuffer, contentType: string): string {
    const uint8Array = new Uint8Array(buffer);
    const base64String = btoa(String.fromCharCode(...uint8Array));
    return `data:${contentType};base64,${base64String}`;
  }

  /**
   * Generate mock favicon for demo mode
   */
  private static getMockFavicon(bookmarkId: number): string {
    // Create a simple colored circle favicon based on bookmark ID
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
      '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
    ];
    const color = colors[bookmarkId % colors.length];
    
    // Simple SVG circle favicon
    const svg = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" fill="${color}"/>
      <text x="8" y="12" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">${bookmarkId}</text>
    </svg>`;
    
    const base64 = btoa(svg);
    return `data:image/svg+xml;base64,${base64}`;
  }

  static async preloadFavicon(bookmarkId: number, faviconUrl?: string): Promise<void> {
    if (!faviconUrl) return;
    
    // Check if already cached or failed
    const existingAssets = await DatabaseService.getAssetsByBookmarkId(bookmarkId);
    const existingFavicon = existingAssets.find(asset => asset.asset_type === this.FAVICON_ASSET_TYPE);
    
    if (existingFavicon) {
      // Skip if we already have a successful cache or recent failure
      const hoursSinceCache = existingFavicon.cached_at 
        ? (Date.now() - new Date(existingFavicon.cached_at).getTime()) / (1000 * 60 * 60)
        : Infinity;
      
      // For successful cache, never retry. For failures, retry after 24 hours (could be network issues)
      if (existingFavicon.status === 'complete' || hoursSinceCache < 24) {
        return;
      }
    }

    // Fetch in background without waiting
    this.fetchAndCacheFavicon(bookmarkId, faviconUrl).catch(error => {
      console.debug(`Background favicon fetch failed for bookmark ${bookmarkId}:`, error);
    });
  }

  static async clearFaviconCache(bookmarkId: number): Promise<void> {
    const assets = await DatabaseService.getAssetsByBookmarkId(bookmarkId);
    const faviconAssets = assets.filter(asset => asset.asset_type === this.FAVICON_ASSET_TYPE);
    
    for (const asset of faviconAssets) {
      await DatabaseService.deleteAssetsByBookmarkId(asset.bookmark_id);
    }
  }
}