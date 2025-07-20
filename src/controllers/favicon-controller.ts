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
  private intersectionObserver: IntersectionObserver | null = null;
  
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
    this.setupIntersectionObserver();
  }

  hostDisconnected(): void {
    this.cleanupObserver();
  }

  hostUpdated(): void {
    // Re-observe elements after DOM updates
    this.updateObservedElements();
  }

  private setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const visibleBookmarkIds: number[] = [];
        
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const bookmarkId = parseInt(entry.target.getAttribute('data-bookmark-id') || '0');
            if (bookmarkId > 0) {
              visibleBookmarkIds.push(bookmarkId);
            }
          }
        });

        if (visibleBookmarkIds.length > 0) {
          this.handleInternalVisibilityChanged(visibleBookmarkIds);
        }
      },
      {
        root: null,
        rootMargin: this.options.rootMargin!,
        threshold: this.options.threshold!,
      }
    );
  }

  private cleanupObserver() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
  }

  private updateObservedElements() {
    if (!this.intersectionObserver) return;

    // Disconnect and re-observe all bookmark elements
    this.intersectionObserver.disconnect();
    
    const hostElement = this.host as any;
    const bookmarkCards = hostElement.renderRoot?.querySelectorAll?.('[data-bookmark-id]') || 
                         hostElement.querySelectorAll?.('[data-bookmark-id]') || [];
    
    bookmarkCards.forEach((card: Element) => {
      this.intersectionObserver!.observe(card);
    });
  }

  private handleInternalVisibilityChanged(visibleBookmarkIds: number[]) {
    // Load favicons for visible bookmarks that don't have cached favicons
    // Note: This is for internal intersection observer use only
    // For external use, call the public handleVisibilityChanged method
    visibleBookmarkIds.forEach(bookmarkId => {
      if (!this._faviconState.faviconCache.has(bookmarkId) && 
          !this._faviconState.isLoading.has(bookmarkId)) {
        this.requestFaviconLoad(bookmarkId);
      }
    });
  }

  private requestFaviconLoad(bookmarkId: number) {
    // This method is called by the internal intersection observer
    // Since we need the favicon URL, we delegate to the host component
    // through the onFaviconLoaded callback mechanism
    
    // The host component should implement the logic to provide the favicon URL
    // and call loadFavicon(bookmarkId, faviconUrl) directly
    console.debug(`Favicon load requested for bookmark ${bookmarkId}`);
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
   * Observe bookmark elements for intersection
   */
  observeBookmarks(bookmarks: Array<{ id: number; favicon_url?: string }>): void {
    // Store bookmark data for loading favicons when they become visible
    this.updateObservedElements();
    
    // Preload favicons for visible bookmarks
    setTimeout(() => {
      const elements = (this.host as any).renderRoot?.querySelectorAll?.('[data-bookmark-id]') || [];
      const visibleElements = Array.from(elements as NodeListOf<Element>).filter((el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      });

      const visibleIds = visibleElements.map((el: Element) => 
        parseInt(el.getAttribute('data-bookmark-id') || '0')
      ).filter(id => id > 0);

      visibleIds.forEach(bookmarkId => {
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (bookmark?.favicon_url) {
          this.loadFavicon(bookmarkId, bookmark.favicon_url);
        }
      });
    }, 100);
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