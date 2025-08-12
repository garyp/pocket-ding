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
  
  // Only track loading state - cache is managed by service
  private isLoadingSet = new Set<number>();

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
    // Initialize service and set up event listener
    this.initializeService();
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
    if (!this.faviconService) {
      return {
        faviconCache: new Map(),
        isLoading: new Set(),
      };
    }

    return {
      faviconCache: new Map(this.faviconService.getAllCachedFaviconUrls()),
      isLoading: new Set(this.isLoadingSet),
    };
  }

  /**
   * Load favicon for a specific bookmark
   */
  async loadFavicon(bookmarkId: number, faviconUrl: string): Promise<void> {
    if (!this.faviconService) {
      console.warn('FaviconService not initialized');
      return;
    }

    // Skip if already cached or loading
    const faviconCache = this.faviconService.getAllCachedFaviconUrls();
    if (faviconCache.has(bookmarkId) || this.isLoadingSet.has(bookmarkId)) {
      return;
    }

    // Mark as loading
    this.isLoadingSet.add(bookmarkId);
    this.host.requestUpdate();

    try {
      await this.faviconService.loadFaviconForBookmark(bookmarkId, faviconUrl);
      // Clear loading state and trigger update
      this.isLoadingSet.delete(bookmarkId);
      this.host.requestUpdate();
    } catch (error) {
      console.error('Failed to load favicon:', error);
      
      // Remove from loading on error
      this.isLoadingSet.delete(bookmarkId);
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
    return this.faviconService?.getAllCachedFaviconUrls().get(bookmarkId);
  }

  /**
   * Check if a favicon is currently loading
   */
  isLoading(bookmarkId: number): boolean {
    return this.isLoadingSet.has(bookmarkId);
  }

  /**
   * Preload favicons for multiple bookmarks
   */
  async preloadFavicons(bookmarks: Array<{ id: number; favicon_url?: string }>): Promise<void> {
    if (!this.faviconService) return;

    const faviconCache = this.faviconService.getAllCachedFaviconUrls();
    const loadPromises = bookmarks
      .filter(bookmark => bookmark.favicon_url && !faviconCache.has(bookmark.id))
      .map(bookmark => this.loadFavicon(bookmark.id, bookmark.favicon_url!));
    
    await Promise.allSettled(loadPromises);
  }

  /**
   * Clear favicon cache
   */
  clearCache(): void {
    // Clear loading state (service cache is managed separately)
    this.isLoadingSet.clear();
    this.host.requestUpdate();
  }



  /**
   * Initialize service and set up event listener
   */
  private async initializeService(): Promise<void> {
    try {
      this.faviconService = FaviconService.getInstance();
      await this.faviconService.waitForInitialization();
      
      // Set up event listener now that service is ready
      this.setupServiceEventListener();
      
      // Trigger update since we may have cached favicons
      this.host.requestUpdate();
    } catch (error) {
      console.error('Failed to initialize favicon service:', error);
    }
  }

  /**
   * Preload favicons for all bookmarks with favicon URLs (for immediate availability)
   */
  async preloadFaviconsForBookmarks(bookmarks: Array<{ id: number; favicon_url?: string }>): Promise<void> {
    if (!this.faviconService) {
      return; // Service not ready yet
    }

    const faviconCache = this.faviconService.getAllCachedFaviconUrls();
    const loadPromises = bookmarks
      .filter(bookmark => bookmark.favicon_url && !faviconCache.has(bookmark.id) && !this.isLoadingSet.has(bookmark.id))
      .map(bookmark => this.loadFavicon(bookmark.id, bookmark.favicon_url!));
    
    await Promise.allSettled(loadPromises);
  }

  /**
   * Setup service event listener for reactive updates
   */
  private setupServiceEventListener(): void {
    if (this.faviconService) {
      this.faviconLoadedHandler = (event: Event) => {
        const customEvent = event as CustomEvent<{ bookmarkId: number; faviconUrl: string }>;
        const { bookmarkId, faviconUrl } = customEvent.detail;
        
        // Remove from loading and trigger UI update
        this.isLoadingSet.delete(bookmarkId);
        this.host.requestUpdate();

        // Notify host component
        if (this.options.onFaviconLoaded) {
          this.options.onFaviconLoaded(bookmarkId, faviconUrl);
        }
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
    if (!this.faviconService) return;

    const faviconCache = this.faviconService.getAllCachedFaviconUrls();
    visibleBookmarkIds.forEach(bookmarkId => {
      const bookmark = bookmarks.find(b => b.id === bookmarkId);
      if (bookmark?.favicon_url && !faviconCache.has(bookmarkId)) {
        this.loadFavicon(bookmarkId, bookmark.favicon_url);
      }
    });
  }
}