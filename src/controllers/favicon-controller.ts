import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { FaviconService } from '../services/favicon-service';

export interface FaviconState {
  faviconCache: Map<number, string>;
  isLoading: Set<number>;
}

export interface FaviconControllerOptions {
  rootMargin?: string;
  threshold?: number;
  onFaviconLoaded?: (bookmarkId: number, faviconUrl: string) => void;
  onError?: (bookmarkId: number, error: any) => void;
}

/**
 * Reactive controller that manages favicon loading and caching.
 * Uses intersection observer to optimize loading based on viewport visibility
 * and provides centralized favicon cache management.
 */
export class FaviconController implements ReactiveController {
  private host: ReactiveControllerHost;
  private options: FaviconControllerOptions;
  
  // Reactive favicon state
  private _faviconState: FaviconState = {
    faviconCache: new Map<number, string>(),
    isLoading: new Set<number>(),
  };

  // Service event listener
  private faviconService: FaviconService | null = null;
  private faviconLoadedHandler: ((event: Event) => void) | null = null;


  constructor(host: ReactiveControllerHost, options: FaviconControllerOptions = {}) {
    this.host = host;
    this.options = {
      rootMargin: '100px',
      threshold: 0.1,
      ...options,
    };
    host.addController(this);
  }

  hostConnected(): void {
    // Initialize cache with existing cached favicons from the service
    // This also sets up the service event listener
    this.initializeCacheFromService();
    // No intersection observer setup needed - handled by BookmarkList component
  }

  hostDisconnected(): void {
    // Clean up service event listener
    this.cleanupServiceEventListener();
    // No cleanup needed - intersection observer is in BookmarkList component
  }

  hostUpdated(): void {
    // No element re-observation needed - handled by BookmarkList component
  }


  // Public API methods

  /**
   * Get the current favicon state
   */
  getFaviconState(): FaviconState {
    return {
      faviconCache: new Map(this._faviconState.faviconCache),
      isLoading: new Set(this._faviconState.isLoading),
    };
  }

  /**
   * Load favicon for a specific bookmark
   */
  async loadFavicon(bookmarkId: number, faviconUrl: string): Promise<void> {
    // Skip if already cached or loading
    if (this._faviconState.faviconCache.has(bookmarkId) || 
        this._faviconState.isLoading.has(bookmarkId)) {
      return;
    }

    // Mark as loading
    this._faviconState.isLoading.add(bookmarkId);
    this.host.requestUpdate();

    try {
      // Use the service instance to load favicon
      if (this.faviconService) {
        await this.faviconService.loadFaviconForBookmark(bookmarkId, faviconUrl);
        // The service will fire 'favicon-loaded' event which our listener will handle
        // This ensures the cache is synchronized
      } else {
        // Fallback to direct service call if not initialized
        const faviconDataUrl = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
        this._faviconState.faviconCache.set(bookmarkId, faviconDataUrl);
        this._faviconState.isLoading.delete(bookmarkId);
        this.host.requestUpdate();

        // Notify host component
        if (this.options.onFaviconLoaded) {
          this.options.onFaviconLoaded(bookmarkId, faviconDataUrl);
        }
      }
    } catch (error) {
      console.error('Failed to load favicon:', error);
      
      // Remove from loading on error
      this._faviconState.isLoading.delete(bookmarkId);
      this.host.requestUpdate();

      // Notify host component of error
      if (this.options.onError) {
        this.options.onError(bookmarkId, error);
      }
    }
  }

  /**
   * Get cached favicon for a bookmark
   */
  getFavicon(bookmarkId: number): string | undefined {
    return this._faviconState.faviconCache.get(bookmarkId);
  }

  /**
   * Check if a favicon is currently loading
   */
  isLoading(bookmarkId: number): boolean {
    return this._faviconState.isLoading.has(bookmarkId);
  }

  /**
   * Preload favicons for multiple bookmarks
   */
  async preloadFavicons(bookmarks: Array<{ id: number; favicon_url?: string }>): Promise<void> {
    const loadPromises = bookmarks
      .filter(bookmark => bookmark.favicon_url && !this._faviconState.faviconCache.has(bookmark.id))
      .map(bookmark => this.loadFavicon(bookmark.id, bookmark.favicon_url!));
    
    await Promise.allSettled(loadPromises);
  }

  /**
   * Clear favicon cache
   */
  clearCache(): void {
    this._faviconState.faviconCache.clear();
    this._faviconState.isLoading.clear();
    this.host.requestUpdate();
  }



  /**
   * Initialize cache with existing cached favicons from the service
   */
  private async initializeCacheFromService(): Promise<void> {
    try {
      this.faviconService = FaviconService.getInstance();
      await this.faviconService.waitForInitialization();
      const existingCachedFavicons = this.faviconService.getAllCachedFaviconUrls();
      
      // Update our cache with existing cached favicons
      existingCachedFavicons.forEach((faviconUrl, bookmarkId) => {
        this._faviconState.faviconCache.set(bookmarkId, faviconUrl);
      });
      
      // Set up event listener now that service is ready
      this.setupServiceEventListener();
      
      // Trigger update if we have cached favicons
      if (existingCachedFavicons.size > 0) {
        this.host.requestUpdate();
      }
    } catch (error) {
      console.error('Failed to initialize favicon cache from service:', error);
    }
  }

  /**
   * Setup service event listener to sync cache when favicons are loaded
   */
  private setupServiceEventListener(): void {
    if (this.faviconService) {
      this.faviconLoadedHandler = (event: Event) => {
        const customEvent = event as CustomEvent<{ bookmarkId: number; faviconUrl: string }>;
        const { bookmarkId, faviconUrl } = customEvent.detail;
        
        // Update our cache with the newly loaded favicon
        this._faviconState.faviconCache.set(bookmarkId, faviconUrl);
        this._faviconState.isLoading.delete(bookmarkId);
        this.host.requestUpdate();
      };
      
      this.faviconService.addEventListener('favicon-loaded', this.faviconLoadedHandler);
    }
  }

  /**
   * Clean up service event listener
   */
  private cleanupServiceEventListener(): void {
    if (this.faviconService && this.faviconLoadedHandler) {
      this.faviconService.removeEventListener('favicon-loaded', this.faviconLoadedHandler);
      this.faviconLoadedHandler = null;
      this.faviconService = null;
    }
  }

  /**
   * Handle visibility changes from external observers
   */
  handleVisibilityChanged(visibleBookmarkIds: number[], bookmarks: Array<{ id: number; favicon_url?: string }>): void {
    visibleBookmarkIds.forEach(bookmarkId => {
      const bookmark = bookmarks.find(b => b.id === bookmarkId);
      if (bookmark?.favicon_url && !this._faviconState.faviconCache.has(bookmarkId)) {
        this.loadFavicon(bookmarkId, bookmark.favicon_url);
      }
    });
  }
}