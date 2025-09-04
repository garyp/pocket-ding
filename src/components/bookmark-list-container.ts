import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncController } from '../controllers/sync-controller';
import { FaviconController } from '../controllers/favicon-controller';
import { StateController } from '../controllers/state-controller';
import type { LocalBookmark, PaginationState, BookmarkListContainerState, FilterCounts } from '../types';
import '@material/web/labs/badge/badge.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/linear-progress.js';
import './bookmark-list';

@customElement('bookmark-list-container')
export class BookmarkListContainer extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }

    .sync-progress {
      position: sticky;
      top: 0;
      z-index: 10;
      margin-bottom: 1rem;
      padding: 0.75rem;
      border-radius: 12px;
      background: var(--md-sys-color-primary-container);
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    .sync-progress-text {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .sync-badge {
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  // Persistent state properties (automatically observed by StateController)
  @state() private currentPage: number = 1;
  @state() private pageSize: number = 25;
  @state() private filter: 'all' | 'unread' | 'archived' = 'all';
  @state() private anchorBookmarkId?: number;

  // Non-persistent UI state
  @state() private containerState: {
    bookmarks: LocalBookmark[];
    isLoading: boolean;
    bookmarksWithAssets: Set<number>;
  } = {
    bookmarks: [],
    isLoading: true,
    bookmarksWithAssets: new Set<number>()
  };

  // Non-persistent pagination data (computed with persistent @state properties)
  @state() private totalCount: number = 0;
  @state() private totalPages: number = 1;
  @state() private filterCounts?: FilterCounts;

  // Reactive controllers
  private syncController = new SyncController(this, {
    onBookmarkSynced: (bookmarkId: number, updatedBookmark: LocalBookmark) => this.handleBookmarkSynced(bookmarkId, updatedBookmark),
    onSyncCompleted: () => this.handleSyncCompleted(),
  });

  private faviconController = new FaviconController(this);

  // State controller for pagination persistence with automatic observation
  // The controller automatically observes and persists state changes via observedProperties
  private stateController = new StateController<BookmarkListContainerState>(this, {
    storageKey: 'bookmark-list-container-state',
    defaultState: {
      currentPage: 1,
      pageSize: 25,
      filter: 'all'
    },
    observedProperties: ['currentPage', 'pageSize', 'filter', 'anchorBookmarkId'],
    validator: (state: any): state is BookmarkListContainerState => {
      return (
        state &&
        typeof state === 'object' &&
        typeof state.currentPage === 'number' &&
        typeof state.pageSize === 'number' &&
        typeof state.filter === 'string' &&
        ['all', 'unread', 'archived'].includes(state.filter) &&
        state.currentPage >= 1 &&
        state.pageSize > 0 &&
        (state.anchorBookmarkId === undefined || typeof state.anchorBookmarkId === 'number')
      );
    }
  });

  // Computed pagination state combining persistent and non-persistent properties
  private get paginationState(): PaginationState {
    return {
      currentPage: this.currentPage,
      pageSize: this.pageSize,
      totalCount: this.totalCount,
      totalPages: this.totalPages,
      filter: this.filter,
      ...(this.anchorBookmarkId ? { anchorBookmarkId: this.anchorBookmarkId } : {}),
      ...(this.filterCounts ? { filterCounts: this.filterCounts } : {})
    };
  }

  override connectedCallback() {
    super.connectedCallback();
    // StateController automatically handles persistence via observedProperties
    void this.stateController; // Suppress TS6133: declared but never read warning
    this.addEventListener('sync-requested', this.handleSyncRequested);
    this.loadBookmarks();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('sync-requested', this.handleSyncRequested);
  }


  private async loadBookmarks() {
    try {
      this.containerState = {
        ...this.containerState,
        isLoading: true,
      };

      // Use anchor bookmark ID to determine the correct page
      const targetPage = await DatabaseService.getPageFromAnchorBookmark(
        this.anchorBookmarkId,
        this.filter,
        this.pageSize,
        this.currentPage
      );

      await this.loadBookmarksPage(this.filter, targetPage);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      this.containerState = {
        ...this.containerState,
        isLoading: false,
      };
    }
  }

  private async loadBookmarksPage(filter: 'all' | 'unread' | 'archived', page: number) {
    try {
      // Get paginated bookmarks, total count for current filter, and counts for all filters
      const [bookmarks, totalCount, allCount, unreadCount, archivedCount] = await Promise.all([
        DatabaseService.getBookmarksPaginated(filter, page, this.pageSize),
        DatabaseService.getBookmarkCount(filter),
        DatabaseService.getBookmarkCount('all'),
        DatabaseService.getBookmarkCount('unread'),
        DatabaseService.getBookmarkCount('archived')
      ]);
      
      // Get asset information for current page bookmarks
      const bookmarkIds = bookmarks.map(b => b.id);
      const assetCounts = await DatabaseService.getBookmarksWithAssetCounts(bookmarkIds);
      
      // Convert to Set for compatibility with existing code
      const bookmarksWithAssets = new Set<number>();
      assetCounts.forEach((hasAssets, bookmarkId) => {
        if (hasAssets) {
          bookmarksWithAssets.add(bookmarkId);
        }
      });

      const totalPages = Math.ceil(totalCount / this.pageSize);

      // Update persistent properties (StateController will automatically persist)
      this.currentPage = page;
      this.filter = filter;

      // Update non-persistent state
      this.totalCount = totalCount;
      this.totalPages = totalPages;
      this.filterCounts = {
        all: allCount,
        unread: unreadCount,
        archived: archivedCount
      };

      this.containerState = {
        ...this.containerState,
        bookmarks,
        isLoading: false,
        bookmarksWithAssets
      };

      console.log(`Loaded page ${page} of ${totalPages} (${bookmarks.length} bookmarks, ${totalCount} total for filter '${filter}')`);
      
      // Preload favicons for all bookmarks with favicon URLs
      // This ensures favicons are available immediately, especially for demo mode
      this.faviconController.preloadFaviconsForBookmarks(bookmarks);
      
    } catch (error) {
      console.error('Failed to load bookmarks page:', error);
      this.containerState = {
        ...this.containerState,
        isLoading: false,
      };
    }
  }

  // Controller event handlers
  private async handleSyncCompleted() {
    // No need to reload bookmarks - they're updated incrementally via handleBookmarkSynced
    console.log('Sync completed');
  }
 
  private async handleBookmarkSynced(bookmarkId: number, updatedBookmark: LocalBookmark) {
    if (!updatedBookmark || !bookmarkId) return;
    
    // Check if bookmark has assets
    const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmarkId);
    const hasAssets = assets.length > 0;
    
    // Check if the bookmark is already on the current page
    const bookmarkIndex = this.containerState.bookmarks.findIndex(b => b.id === bookmarkId);
    
    if (bookmarkIndex !== -1) {
      // Update existing bookmark in place
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
        bookmarksWithAssets: updatedBookmarksWithAssets,
      };
    } else {
      // For new bookmarks, check if they should be visible on current page
      // by checking if they would appear in a fresh load of this page
      const currentPageBookmarks = await DatabaseService.getBookmarksPaginated(
        this.filter,
        this.currentPage,
        this.pageSize
      );
      
      // If the new bookmark should be visible on current page, reload the page
      if (currentPageBookmarks.some(b => b.id === bookmarkId)) {
        await this.loadBookmarksPage(
          this.filter, 
          this.currentPage
        );
        return; // Early return since loadBookmarksPage handles everything
      }
    }
    
    // If this is the anchor bookmark, ensure we're on the correct page to show it
    if (bookmarkId === this.anchorBookmarkId) {
      const targetPage = await DatabaseService.getPageFromAnchorBookmark(
        bookmarkId,
        this.filter,
        this.pageSize,
        this.currentPage
      );
      
      // If the anchor bookmark is now on a different page, navigate to that page
      if (targetPage !== this.currentPage) {
        // Update currentPage property (StateController will automatically persist)
        this.currentPage = targetPage;
        await this.loadBookmarksPage(this.filter, targetPage);
      }
    }
  }

  // Callback handlers
  private handleBookmarkSelect = (bookmarkId: number) => {
    // Set the selected bookmark as the anchor for position memory
    // StateController will automatically persist this change
    this.anchorBookmarkId = bookmarkId;

    this.dispatchEvent(new CustomEvent('bookmark-selected', {
      detail: { bookmarkId },
      bubbles: true,
    }));
  };

  private handleSyncRequested = async () => {
    try {
      await this.syncController.requestSync();
    } catch (error) {
      console.error('Failed to request sync:', error);
    }
  };

  private handleFaviconLoadRequested = async (bookmarkId: number, faviconUrl: string) => {
    try {
      await this.faviconController.loadFavicon(bookmarkId, faviconUrl);
    } catch (error) {
      console.error('Failed to load favicon:', error);
    }
  };

  private handleVisibilityChanged = (visibleBookmarkIds: number[]) => {
    this.faviconController.handleVisibilityChanged(visibleBookmarkIds, this.containerState.bookmarks);
  };

  private handlePageChange = async (page: number) => {
    if (page !== this.currentPage) {
      // StateController will automatically persist these changes
      this.currentPage = page;
      await this.loadBookmarksPage(this.filter, page);
    }
  };

  private handleFilterChange = async (filter: 'all' | 'unread' | 'archived') => {
    if (filter !== this.filter) {
      // Use anchor bookmark ID to find the correct page in the new filter
      const targetPage = await DatabaseService.getPageFromAnchorBookmark(
        this.anchorBookmarkId,
        filter,
        this.pageSize,
        1 // fallback to page 1
      );
      
      // StateController will automatically persist these changes
      this.filter = filter;
      this.currentPage = targetPage;
      await this.loadBookmarksPage(filter, targetPage);
    }
  };

  override render() {
    const syncState = this.syncController.getSyncState();
    const faviconState = this.faviconController.getFaviconState();
    
    return html`
      ${syncState.isSyncing ? html`
        <div class="sync-progress">
          <div class="sync-progress-text">
            <span>
              ${syncState.syncTotal > 0 
                ? `Syncing bookmarks... ${syncState.syncProgress}/${syncState.syncTotal}`
                : 'Starting sync...'
              }
            </span>
            <md-icon class="sync-badge">sync</md-icon>
          </div>
          <md-linear-progress 
            .value=${syncState.syncTotal > 0 ? (syncState.syncProgress / syncState.syncTotal) : 0}
            ?indeterminate=${syncState.syncTotal === 0}
          ></md-linear-progress>
        </div>
      ` : ''}
      
      <bookmark-list
        .faviconCache=${faviconState.faviconCache}
        .paginationState=${this.paginationState}
        .syncedBookmarkIds=${syncState.syncedBookmarkIds}
        .onBookmarkSelect=${this.handleBookmarkSelect}
        .onFaviconLoadRequested=${this.handleFaviconLoadRequested}
        .onVisibilityChanged=${this.handleVisibilityChanged}
        .onPageChange=${this.handlePageChange}
        .onFilterChange=${this.handleFilterChange}
      ></bookmark-list>
    `;
  }
}
