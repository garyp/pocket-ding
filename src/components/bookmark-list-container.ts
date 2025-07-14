import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncService } from '../services/sync-service';
import { FaviconService } from '../services/favicon-service';
import type { BookmarkListContainerState } from '../types';
import './bookmark-list';

@customElement('bookmark-list-container')
export class BookmarkListContainer extends LitElement {
  @state() private containerState: BookmarkListContainerState = {
    bookmarks: [],
    isLoading: true,
    isSyncing: false,
    syncProgress: 0,
    syncTotal: 0,
    syncedBookmarkIds: new Set<number>(),
    faviconCache: new Map<number, string>(),
    bookmarksWithAssets: new Set<number>(),
  };

  private syncService: SyncService | null = null;
  private faviconObserver: IntersectionObserver | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.initializeServices();
    this.loadBookmarks();
    
    // Listen for external sync-requested events for backward compatibility
    this.addEventListener('sync-requested', this.handleExternalSyncRequest);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupServices();
    
    // Remove external event listeners
    this.removeEventListener('sync-requested', this.handleExternalSyncRequest);
  }

  private initializeServices() {
    // Initialize services
    this.syncService = SyncService.getInstance();
    
    // Setup event listeners
    this.setupSyncEventListeners();
    this.setupFaviconObserver();
  }

  private cleanupServices() {
    // Clean up event listeners
    if (this.syncService) {
      this.syncService.removeEventListener('sync-started', this.handleSyncStarted);
      this.syncService.removeEventListener('sync-progress', this.handleSyncProgress);
      this.syncService.removeEventListener('sync-completed', this.handleSyncCompleted);
      this.syncService.removeEventListener('sync-error', this.handleSyncError);
      this.syncService.removeEventListener('bookmark-synced', this.handleBookmarkSynced);
    }

    // Clean up intersection observer
    if (this.faviconObserver) {
      this.faviconObserver.disconnect();
      this.faviconObserver = null;
    }
  }

  private setupSyncEventListeners() {
    if (!this.syncService) return;

    this.syncService.addEventListener('sync-started', this.handleSyncStarted);
    this.syncService.addEventListener('sync-progress', this.handleSyncProgress);
    this.syncService.addEventListener('sync-completed', this.handleSyncCompleted);
    this.syncService.addEventListener('sync-error', this.handleSyncError);
    this.syncService.addEventListener('bookmark-synced', this.handleBookmarkSynced);
  }

  private setupFaviconObserver() {
    this.faviconObserver = new IntersectionObserver(
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

        this.handleVisibilityChanged(visibleBookmarkIds);
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );
  }

  private async loadBookmarks() {
    try {
      this.containerState = {
        ...this.containerState,
        isLoading: true,
      };

      const bookmarks = await DatabaseService.getAllBookmarks();
      
      // Check which bookmarks have assets
      const bookmarksWithAssets = new Set<number>();
      for (const bookmark of bookmarks) {
        const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmark.id);
        if (assets.length > 0) {
          bookmarksWithAssets.add(bookmark.id);
        }
      }

      this.containerState = {
        ...this.containerState,
        bookmarks,
        isLoading: false,
        bookmarksWithAssets,
      };

      console.log(`Local bookmarks loaded: ${bookmarks.length} total, ${bookmarks.filter(b => b.is_archived).length} archived`);
      
      // Check for ongoing sync
      this.checkOngoingSync();
      
      // Initialize favicons
      this.initializeFavicons();
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      this.containerState = {
        ...this.containerState,
        isLoading: false,
      };
    }
  }

  private checkOngoingSync() {
    if (SyncService.isSyncInProgress()) {
      const progress = SyncService.getCurrentSyncProgress();
      this.containerState = {
        ...this.containerState,
        isSyncing: true,
        syncProgress: progress.current,
        syncTotal: progress.total,
        syncedBookmarkIds: new Set<number>(),
      };
    }
  }

  private initializeFavicons() {
    // Initialize empty favicon cache - will be populated on demand
    this.containerState = {
      ...this.containerState,
      faviconCache: new Map<number, string>(),
    };
  }

  // Event handlers
  private handleSyncStarted = (event: Event) => {
    const customEvent = event as CustomEvent;
    this.containerState = {
      ...this.containerState,
      isSyncing: true,
      syncProgress: 0,
      syncTotal: customEvent.detail.total || 0,
      syncedBookmarkIds: new Set<number>(),
    };
  };

  private handleSyncProgress = (event: Event) => {
    const customEvent = event as CustomEvent;
    this.containerState = {
      ...this.containerState,
      syncProgress: customEvent.detail.current || customEvent.detail.progress || 0,
      syncTotal: customEvent.detail.total || 0,
    };
  };

  private handleSyncCompleted = async () => {
    this.containerState = {
      ...this.containerState,
      isSyncing: false,
      syncProgress: 0,
      syncTotal: 0,
    };

    // Reload bookmarks after sync
    await this.loadBookmarks();
    
    // Clear synced highlights after delay
    setTimeout(() => {
      this.containerState = {
        ...this.containerState,
        syncedBookmarkIds: new Set<number>(),
      };
    }, 3000);
  };

  private handleSyncError = (event: Event) => {
    const customEvent = event as CustomEvent;
    console.error('Sync error:', customEvent.detail);
    this.containerState = {
      ...this.containerState,
      isSyncing: false,
      syncProgress: 0,
      syncTotal: 0,
    };
  };

  private handleBookmarkSynced = async (event: Event) => {
    const customEvent = event as CustomEvent;
    const updatedBookmark = customEvent.detail.bookmark;
    const bookmarkId = updatedBookmark?.id || customEvent.detail.bookmarkId;
    
    if (!updatedBookmark || !bookmarkId) return;
    
    // Check if bookmark has assets
    const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmarkId);
    const hasAssets = assets.length > 0;
    
    // Update the bookmark in the list
    const bookmarkIndex = this.containerState.bookmarks.findIndex(b => b.id === bookmarkId);
    if (bookmarkIndex !== -1) {
      const updatedBookmarks = [...this.containerState.bookmarks];
      updatedBookmarks[bookmarkIndex] = updatedBookmark;
      
      const updatedBookmarksWithAssets = new Set(this.containerState.bookmarksWithAssets);
      if (hasAssets) {
        updatedBookmarksWithAssets.add(bookmarkId);
      } else {
        updatedBookmarksWithAssets.delete(bookmarkId);
      }
      
      this.containerState = {
        ...this.containerState,
        bookmarks: updatedBookmarks,
        syncedBookmarkIds: new Set([...this.containerState.syncedBookmarkIds, bookmarkId]),
        bookmarksWithAssets: updatedBookmarksWithAssets,
      };
    } else {
      // If bookmark doesn't exist, add it to the list
      const updatedBookmarksWithAssets = new Set(this.containerState.bookmarksWithAssets);
      if (hasAssets) {
        updatedBookmarksWithAssets.add(bookmarkId);
      }
      
      this.containerState = {
        ...this.containerState,
        bookmarks: [...this.containerState.bookmarks, updatedBookmark],
        syncedBookmarkIds: new Set([...this.containerState.syncedBookmarkIds, bookmarkId]),
        bookmarksWithAssets: updatedBookmarksWithAssets,
      };
    }
  };

  // Callback handlers
  private handleBookmarkSelect = (bookmarkId: number) => {
    this.dispatchEvent(new CustomEvent('bookmark-selected', {
      detail: { bookmarkId },
      bubbles: true,
    }));
  };

  // External event handler for backward compatibility
  private handleExternalSyncRequest = (event: Event) => {
    event.preventDefault();
    this.handleSyncRequested();
  };

  private handleSyncRequested = async () => {
    if (this.containerState.isSyncing) return;

    try {
      const settings = await DatabaseService.getSettings();
      if (settings) {
        await SyncService.syncBookmarks(settings);
        // Don't dispatch sync-requested event to avoid infinite loop
        // The sync service itself will dispatch the necessary events
      }
    } catch (error) {
      console.error('Failed to sync bookmarks:', error);
    }
  };

  private handleFaviconLoadRequested = async (bookmarkId: number, faviconUrl: string) => {
    try {
      const faviconDataUrl = await FaviconService.getFaviconForBookmark(bookmarkId, faviconUrl);
      
      // Update cache
      const updatedCache = new Map(this.containerState.faviconCache);
      updatedCache.set(bookmarkId, faviconDataUrl);
      
      this.containerState = {
        ...this.containerState,
        faviconCache: updatedCache,
      };
    } catch (error) {
      console.error('Failed to load favicon:', error);
    }
  };

  private handleVisibilityChanged = (visibleBookmarkIds: number[]) => {
    // Load favicons for visible bookmarks
    visibleBookmarkIds.forEach(bookmarkId => {
      const bookmark = this.containerState.bookmarks.find(b => b.id === bookmarkId);
      if (bookmark && bookmark.favicon_url && !this.containerState.faviconCache.has(bookmarkId)) {
        this.handleFaviconLoadRequested(bookmarkId, bookmark.favicon_url);
      }
    });
  };

  override render() {
    return html`
      <bookmark-list
        .bookmarks=${this.containerState.bookmarks}
        .isLoading=${this.containerState.isLoading}
        .syncState=${{
          isSyncing: this.containerState.isSyncing,
          syncProgress: this.containerState.syncProgress,
          syncTotal: this.containerState.syncTotal,
          syncedBookmarkIds: this.containerState.syncedBookmarkIds,
        }}
        .faviconState=${{
          faviconCache: this.containerState.faviconCache,
          bookmarksWithAssets: this.containerState.bookmarksWithAssets,
        }}
        .onBookmarkSelect=${this.handleBookmarkSelect}
        .onSyncRequested=${this.handleSyncRequested}
        .onFaviconLoadRequested=${this.handleFaviconLoadRequested}
        .onVisibilityChanged=${this.handleVisibilityChanged}
      ></bookmark-list>
    `;
  }
}