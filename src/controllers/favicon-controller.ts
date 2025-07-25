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
    // No intersection observer setup needed - handled by BookmarkList component
  }

  hostDisconnected(): void {
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
      const faviconDataUrl = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      // Update cache and remove from loading
      this._faviconState.faviconCache.set(bookmarkId, faviconDataUrl);
      this._faviconState.isLoading.delete(bookmarkId);
      this.host.requestUpdate();

      // Notify host component
      if (this.options.onFaviconLoaded) {
        this.options.onFaviconLoaded(bookmarkId, faviconDataUrl);
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