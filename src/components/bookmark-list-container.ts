import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { db } from '../services/database';
import { DatabaseService } from '../services/database';
import { SyncController } from '../controllers/sync-controller';
import { FaviconController } from '../controllers/favicon-controller';
import { StateController } from '../controllers/state-controller';
import { ReactiveQueryController } from '../controllers/reactive-query-controller';
import type { LocalBookmark, PaginationState, BookmarkListContainerState, BookmarkFilter } from '../types';
import '@material/web/labs/badge/badge.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/linear-progress.js';
import './bookmark-list';
import './pagination-controls';
import './paginated-list';

@customElement('bookmark-list-container')
export class BookmarkListContainer extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 1rem;
      max-width: 50rem; /* 800px - responsive max width */
      margin: 0 auto;
    }

    .filters {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding: 0 0.25rem;
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

    @media (max-width: 48rem) { /* 768px breakpoint */
      :host {
        padding: 0.75rem; /* 12px - reduced for mobile */
      }

      .filters {
        padding: 0;
        gap: 0.375rem; /* 6px - tighter on mobile */
        margin-bottom: 0.75rem;
      }
    }
  `;
  // Persistent state properties (automatically observed by StateController)
  @state() private currentPage: number = 1;
  @state() private pageSize: number = 25;
  @state() private filter: 'all' | 'unread' | 'archived' = 'all';
  @state() private anchorBookmarkId?: number;

  // Removed containerState - data now handled by reactive queries in bookmark-list
  // Removed totalCount, totalPages, filterCounts - computed by reactive queries


  // Reactive controllers
  #syncController = new SyncController(this, {
    onSyncCompleted: () => this.#handleSyncCompleted(),
    onBookmarkSynced: (bookmarkId: number, bookmark: any) => this.#handleBookmarkSynced(bookmarkId, bookmark),
  });

  #faviconController = new FaviconController(this);

  // Reactive query for filter counts
  #filterCountsQuery = new ReactiveQueryController(
    this,
    () => DatabaseService.getAllFilterCounts()
  );

  // Reactive query to track bookmark positions for pagination calculations
  #bookmarkPositionsQuery = new ReactiveQueryController(
    this,
    (filter: 'all' | 'unread' | 'archived') => this.#getBookmarkPositions(filter),
    (): ['all' | 'unread' | 'archived'] => [this.filter]
  );

  // Reactive query to get filtered bookmarks for the current page
  #bookmarksQuery = new ReactiveQueryController<any, [BookmarkFilter, number, number]>(
    this,
    () => DatabaseService.getBookmarksPaginated(
      this.filter,
      this.currentPage,
      this.pageSize
    ),
    () => [this.filter, this.currentPage, this.pageSize]
  );

  // State controller for pagination persistence with automatic observation
  // The controller automatically observes and persists state changes via observedProperties
  #stateController = new StateController<BookmarkListContainerState>(this, {
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

  // Helper method to get bookmark positions for reactive query
  async #getBookmarkPositions(filter: 'all' | 'unread' | 'archived'): Promise<number[]> {
    // Use the same filtering logic as DatabaseService but only get IDs
    const query = this.#buildFilteredQuery(filter);
    const bookmarks = await query.toArray();
    return bookmarks.map(bookmark => bookmark.id);
  }

  // Helper method to build filtered query (mirrors DatabaseService logic)
  #buildFilteredQuery(filter: 'all' | 'unread' | 'archived') {
    if (filter === 'unread') {
      return db.bookmarks
        .orderBy('date_added')
        .reverse()
        .filter((bookmark: any) => bookmark.unread && !bookmark.is_archived);
    } else if (filter === 'archived') {
      return db.bookmarks
        .orderBy('date_added')
        .reverse()
        .filter((bookmark: any) => bookmark.is_archived);
    } else {
      return db.bookmarks
        .orderBy('date_added')
        .reverse();
    }
  }

  // Helper method to calculate page number from bookmark positions
  #getPageFromAnchorBookmark(anchorBookmarkId: number | undefined, fallbackPage: number = 1): number {
    if (!anchorBookmarkId) {
      return fallbackPage;
    }

    const positions = this.#bookmarkPositionsQuery.value;
    if (!positions) {
      return fallbackPage;
    }

    const index = positions.indexOf(anchorBookmarkId);
    if (index === -1) {
      return fallbackPage;
    }

    return Math.floor(index / this.pageSize) + 1;
  }

  // Pagination state computed from reactive filter counts
  private get paginationState(): PaginationState {
    const filterCounts = this.filterCounts;
    const totalCount = this.filter === 'all' ? filterCounts.all :
                      this.filter === 'unread' ? filterCounts.unread :
                      filterCounts.archived;
    const totalPages = Math.max(1, Math.ceil(totalCount / this.pageSize));

    return {
      currentPage: this.currentPage,
      pageSize: this.pageSize,
      totalCount,
      totalPages,
      filter: this.filter,
      filterCounts,
      ...(this.anchorBookmarkId ? { anchorBookmarkId: this.anchorBookmarkId } : {})
    };
  }

  override connectedCallback() {
    super.connectedCallback();
    // StateController automatically handles persistence via observedProperties
    void this.#stateController; // Suppress TS6133: declared but never read warning
    this.addEventListener('sync-requested', this.#handleSyncRequested);
    // No need to loadBookmarks - data now handled by reactive queries in bookmark-list
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('sync-requested', this.#handleSyncRequested);
  }


  // Controller event handlers
  async #handleSyncCompleted() {
    // No need to reload bookmarks - they're updated automatically via reactive queries
    console.log('Sync completed');
  }

 
  #handleBookmarkSynced(bookmarkId: number, updatedBookmark: LocalBookmark) {
    if (!updatedBookmark || !bookmarkId) return;

    // If this is the anchor bookmark, ensure we're on the correct page to show it
    if (bookmarkId === this.anchorBookmarkId) {
      const targetPage = this.#getPageFromAnchorBookmark(bookmarkId, this.currentPage);

      // If the anchor bookmark is now on a different page, navigate to that page
      if (targetPage !== this.currentPage) {
        // Update currentPage property (StateController will automatically persist)
        this.currentPage = targetPage;
      }
    }
  }

  // Callback handlers
  #handleBookmarkSelect = (bookmarkId: number) => {
    // Set the selected bookmark as the anchor for position memory
    // StateController will automatically persist this change
    this.anchorBookmarkId = bookmarkId;

    this.dispatchEvent(new CustomEvent('bookmark-selected', {
      detail: { bookmarkId },
      bubbles: true,
    }));
  };

  #handleSyncRequested = async () => {
    try {
      await this.#syncController.requestSync();
    } catch (error) {
      console.error('Failed to request sync:', error);
    }
  };

  #handleFaviconLoadRequested = async (bookmarkId: number, faviconUrl: string) => {
    try {
      await this.#faviconController.loadFavicon(bookmarkId, faviconUrl);
    } catch (error) {
      console.error('Failed to load favicon:', error);
    }
  };

  #handleVisibilityChanged = (visibleBookmarks: Array<{ id: number; favicon_url?: string }>) => {
    // Pass bookmark data directly to avoid database coupling
    this.#faviconController.handleVisibilityChanged(visibleBookmarks);
  };

  #handlePageChange = async (page: number) => {
    if (page !== this.currentPage) {
      // StateController will automatically persist these changes
      this.currentPage = page;
      // No need to manually load bookmarks - reactive queries handle this
    }
  };

  #handleFilterChange = (filter: BookmarkFilter) => {
    if (filter !== this.filter) {
      // StateController will automatically persist these changes
      this.filter = filter;

      // Use anchor bookmark ID to find the correct page in the new filter
      // The reactive query will update when filter changes, so we defer this calculation
      // to the next microtask when the new positions are available
      queueMicrotask(() => {
        const targetPage = this.#getPageFromAnchorBookmark(this.anchorBookmarkId, 1);
        if (targetPage !== this.currentPage) {
          this.currentPage = targetPage;
        }
      });

      // No need to manually load bookmarks - reactive queries handle this
    }
  };


  get filterCounts() {
    return this.#filterCountsQuery.value || { all: 0, unread: 0, archived: 0 };
  }

  get bookmarks(): LocalBookmark[] {
    return this.#bookmarksQuery.value || [];
  }

  get isLoading(): boolean {
    return this.#bookmarksQuery.loading || this.#filterCountsQuery.loading;
  }

  get totalCount(): number {
    const counts = this.filterCounts;
    switch (this.filter) {
      case 'unread':
        return counts.unread;
      case 'archived':
        return counts.archived;
      case 'all':
      default:
        return counts.all;
    }
  }

  override render() {
    const syncState = this.#syncController.getSyncState();
    const faviconState = this.#faviconController.getFaviconState();

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

      <div class="filters">
        ${this.filter === 'all' ? html`
          <md-filled-button
            @click=${() => this.#handleFilterChange('all')}
          >
            All (${this.filterCounts.all})
          </md-filled-button>
        ` : html`
          <md-text-button
            @click=${() => this.#handleFilterChange('all')}
          >
            All (${this.filterCounts.all})
          </md-text-button>
        `}
        ${this.filter === 'unread' ? html`
          <md-filled-button
            @click=${() => this.#handleFilterChange('unread')}
          >
            Unread (${this.filterCounts.unread})
          </md-filled-button>
        ` : html`
          <md-text-button
            @click=${() => this.#handleFilterChange('unread')}
          >
            Unread (${this.filterCounts.unread})
          </md-text-button>
        `}
        ${this.filter === 'archived' ? html`
          <md-filled-button
            @click=${() => this.#handleFilterChange('archived')}
          >
            Archived (${this.filterCounts.archived})
          </md-filled-button>
        ` : html`
          <md-text-button
            @click=${() => this.#handleFilterChange('archived')}
          >
            Archived (${this.filterCounts.archived})
          </md-text-button>
        `}
      </div>

      <paginated-list
        .totalCount=${this.totalCount}
        .currentPage=${this.currentPage}
        .pageSize=${this.pageSize}
        .loading=${this.isLoading}
        .onPageChange=${this.#handlePageChange}
      >
        <bookmark-list
          .bookmarks=${this.bookmarks}
          .isLoading=${false}
          .faviconCache=${faviconState.faviconCache}
          .paginationState=${this.paginationState}
          .syncedBookmarkIds=${syncState.syncedBookmarkIds}
          .onBookmarkSelect=${this.#handleBookmarkSelect}
          .onFaviconLoadRequested=${this.#handleFaviconLoadRequested}
          .onVisibilityChanged=${this.#handleVisibilityChanged}
        ></bookmark-list>
      </paginated-list>
    `;
  }
}
