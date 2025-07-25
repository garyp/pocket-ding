import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncController } from '../controllers/sync-controller';
import { FaviconController } from '../controllers/favicon-controller';
import type { LocalBookmark, PaginationState } from '../types';
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
  @state() private containerState: {
    bookmarks: LocalBookmark[];
    isLoading: boolean;
    bookmarksWithAssets: Set<number>;
    pagination: PaginationState;
  } = {
    bookmarks: [],
    isLoading: true,
    bookmarksWithAssets: new Set<number>(),
    pagination: {
      currentPage: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 1,
      filter: 'all'
    }
  };

  // Reactive controllers
  private syncController = new SyncController(this, {
    onBookmarkSynced: (bookmarkId: number, updatedBookmark: LocalBookmark) => this.handleBookmarkSynced(bookmarkId, updatedBookmark),
    onSyncCompleted: () => this.handleSyncCompleted(),
  });

  private faviconController = new FaviconController(this);

  // Persistent state properties
  @state() private persistentCurrentPage: number = 1;
  @state() private persistentPageSize: number = 25;
  @state() private persistentFilter: 'all' | 'unread' | 'archived' = 'all';
  @state() private persistentAnchorBookmarkId?: number;

  // TODO: State controller for pagination persistence - implement if needed
  // private stateController = new StateController<BookmarkListContainerState>(this, {
  //   storageKey: 'bookmark-list-container-state',
  //   defaultState: {
  //     currentPage: 1,
  //     pageSize: 25,
  //     filter: 'all'
  //   },
  //   observedProperties: [],
  //   validator: (state: any): state is BookmarkListContainerState => {
  //     return (
  //       state &&
  //       typeof state === 'object' &&
  //       typeof state.currentPage === 'number' &&
  //       typeof state.pageSize === 'number' &&
  //       typeof state.filter === 'string' &&
  //       ['all', 'unread', 'archived'].includes(state.filter) &&
  //       state.currentPage >= 1 &&
  //       state.pageSize > 0
  //     );
  //   }
  // });

  override connectedCallback() {
    super.connectedCallback();
    this.initializeFromPersistedState();
    this.loadBookmarks();
  }

  private initializeFromPersistedState() {
    // Initialize containerState from persisted values
    this.containerState = {
      ...this.containerState,
      pagination: {
        currentPage: this.persistentCurrentPage,
        pageSize: this.persistentPageSize,
        totalCount: 0,
        totalPages: 1,
        filter: this.persistentFilter,
        ...(this.persistentAnchorBookmarkId ? { anchorBookmarkId: this.persistentAnchorBookmarkId } : {})
      }
    };
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
  }


  private async loadBookmarks() {
    try {
      this.containerState = {
        ...this.containerState,
        isLoading: true,
      };

      // Use anchor bookmark ID to determine the correct page
      const targetPage = await DatabaseService.getPageFromAnchorBookmark(
        this.containerState.pagination.anchorBookmarkId,
        this.containerState.pagination.filter,
        this.containerState.pagination.pageSize,
        this.containerState.pagination.currentPage
      );

      await this.loadBookmarksPage(this.containerState.pagination.filter, targetPage);
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
      const pageSize = this.containerState.pagination.pageSize;
      
      // Get paginated bookmarks, total count for current filter, and counts for all filters
      const [bookmarks, totalCount, allCount, unreadCount, archivedCount] = await Promise.all([
        DatabaseService.getBookmarksPaginated(filter, page, pageSize),
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

      const totalPages = Math.ceil(totalCount / pageSize);

      this.containerState = {
        ...this.containerState,
        bookmarks,
        isLoading: false,
        bookmarksWithAssets,
        pagination: {
          ...this.containerState.pagination,
          currentPage: page,
          totalCount,
          totalPages,
          filter,
          filterCounts: {
            all: allCount,
            unread: unreadCount,
            archived: archivedCount
          }
        }
      };

      console.log(`Loaded page ${page} of ${totalPages} (${bookmarks.length} bookmarks, ${totalCount} total for filter '${filter}')`);
      
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
        this.containerState.pagination.filter,
        this.containerState.pagination.currentPage,
        this.containerState.pagination.pageSize
      );
      
      // If the new bookmark should be visible on current page, reload the page
      if (currentPageBookmarks.some(b => b.id === bookmarkId)) {
        await this.loadBookmarksPage(
          this.containerState.pagination.filter, 
          this.containerState.pagination.currentPage
        );
        return; // Early return since loadBookmarksPage handles everything
      }
    }
    
    // If this is the anchor bookmark, ensure we're on the correct page to show it
    if (bookmarkId === this.containerState.pagination.anchorBookmarkId) {
      const targetPage = await DatabaseService.getPageFromAnchorBookmark(
        bookmarkId,
        this.containerState.pagination.filter,
        this.containerState.pagination.pageSize,
        this.containerState.pagination.currentPage
      );
      
      // If the anchor bookmark is now on a different page, navigate to that page
      if (targetPage !== this.containerState.pagination.currentPage) {
        this.persistentCurrentPage = targetPage;
        await this.loadBookmarksPage(this.containerState.pagination.filter, targetPage);
      }
    }
  }

  // Callback handlers
  private handleBookmarkSelect = (bookmarkId: number) => {
    // Set the selected bookmark as the anchor for position memory
    this.persistentAnchorBookmarkId = bookmarkId;
    this.containerState = {
      ...this.containerState,
      pagination: {
        ...this.containerState.pagination,
        anchorBookmarkId: bookmarkId
      }
    };

    this.dispatchEvent(new CustomEvent('bookmark-selected', {
      detail: { bookmarkId },
      bubbles: true,
    }));
  };

  private handleSyncRequested = async () => {
    await this.syncController.requestSync();
  };

  private handleFaviconLoadRequested = async (bookmarkId: number, faviconUrl: string) => {
    await this.faviconController.loadFavicon(bookmarkId, faviconUrl);
  };

  private handleVisibilityChanged = (visibleBookmarkIds: number[]) => {
    this.faviconController.handleVisibilityChanged(visibleBookmarkIds, this.containerState.bookmarks);
  };

  private handlePageChange = async (page: number) => {
    if (page !== this.containerState.pagination.currentPage) {
      this.persistentCurrentPage = page;
      await this.loadBookmarksPage(this.containerState.pagination.filter, page);
    }
  };

  private handleFilterChange = async (filter: 'all' | 'unread' | 'archived') => {
    if (filter !== this.containerState.pagination.filter) {
      this.persistentFilter = filter;
      
      // Use anchor bookmark ID to find the correct page in the new filter
      const anchorBookmarkId = this.containerState.pagination.anchorBookmarkId;
      const targetPage = await DatabaseService.getPageFromAnchorBookmark(
        anchorBookmarkId,
        filter,
        this.containerState.pagination.pageSize,
        1 // fallback to page 1
      );
      
      this.persistentCurrentPage = targetPage;
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
            <md-badge class="sync-badge">
              <md-icon slot="icon">sync</md-icon>
              Syncing
            </md-badge>
          </div>
          <md-linear-progress 
            .value=${syncState.syncTotal > 0 ? (syncState.syncProgress / syncState.syncTotal) : 0}
            ?indeterminate=${syncState.syncTotal === 0}
          ></md-linear-progress>
        </div>
      ` : ''}
      
      <bookmark-list
        .bookmarks=${this.containerState.bookmarks}
        .isLoading=${this.containerState.isLoading}
        .bookmarksWithAssets=${this.containerState.bookmarksWithAssets}
        .faviconCache=${faviconState.faviconCache}
        .syncedBookmarkIds=${syncState.syncedBookmarkIds}
        .paginationState=${this.containerState.pagination}
        .onBookmarkSelect=${this.handleBookmarkSelect}
        .onSyncRequested=${this.handleSyncRequested}
        .onFaviconLoadRequested=${this.handleFaviconLoadRequested}
        .onVisibilityChanged=${this.handleVisibilityChanged}
        .onPageChange=${this.handlePageChange}
        .onFilterChange=${this.handleFilterChange}
      ></bookmark-list>
    `;
  }
}
