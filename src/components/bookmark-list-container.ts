import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { db } from '../services/database';
import { DatabaseService } from '../services/database';
import { FilterService } from '../services/filter-service';
import { SyncController } from '../controllers/sync-controller';
import { FaviconController } from '../controllers/favicon-controller';
import { StateController } from '../controllers/state-controller';
import { ReactiveQueryController } from '../controllers/reactive-query-controller';
import type { LocalBookmark, PaginationState, BookmarkListContainerState, BookmarkFilter, FilterState } from '../types';
import '@material/web/labs/badge/badge.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/linear-progress.js';
import './bookmark-list';
import './pagination-controls';
import './paginated-list';
import './sync-progress';
import './sync-error-notification';
import './filter-dialog';

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
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding: 0 0.25rem;
    }

    .filter-summary {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 0.875rem;
      font-weight: 500;
    }

    .filter-summary-text {
      flex: 1;
    }

    .clear-filters-btn {
      font-size: 0.75rem;
    }

    sync-progress {
      margin-bottom: 1rem;
    }

    sync-error-notification {
      margin-bottom: 1rem;
    }

    @media (max-width: 48rem) { /* 768px breakpoint */
      :host {
        padding: 0.75rem; /* 12px - reduced for mobile */
      }

      .filters {
        padding: 0;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }

      .filter-summary {
        font-size: 0.8125rem;
      }
    }
  `;
  // Persistent state properties (automatically observed by StateController)
  @state() private currentPage: number = 1;
  @state() private pageSize: number = 25;
  @state() private filter: 'all' | 'unread' | 'archived' = 'all';
  @state() private anchorBookmarkId?: number;

  // Advanced filter state (private state - no decorators on # fields)
  #filterState: FilterState = FilterService.getDefaultFilterState();
  #filterDialogOpen = false;
  #filteredBookmarks: LocalBookmark[] = [];
  #isApplyingFilters = false;

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
    // Load filter state from database
    this.#loadFilterState();
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

  #handleSyncErrorDismiss = async () => {
    try {
      await this.#syncController.dismissSyncError();
    } catch (error) {
      console.error('Failed to dismiss sync error:', error);
    }
  };

  #handleSyncErrorRetry = async () => {
    try {
      await this.#syncController.requestSync(true); // Force a full sync on retry
    } catch (error) {
      console.error('Failed to retry sync:', error);
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

  // Advanced filter handlers
  async #loadFilterState() {
    try {
      const savedState = await FilterService.loadFilterState();
      this.#filterState = savedState || FilterService.getDefaultFilterState();
      await this.#applyFilters();
    } catch (error) {
      // Gracefully handle database errors (e.g., in test environments)
      this.#filterState = FilterService.getDefaultFilterState();
    }
  }

  #handleFilterDialogOpen = () => {
    this.#filterDialogOpen = true;
    this.requestUpdate();
  };

  #handleFilterDialogClose = () => {
    this.#filterDialogOpen = false;
    this.requestUpdate();
  };

  #handleApplyFilters = async (event: CustomEvent<FilterState>) => {
    this.#filterState = event.detail;
    await FilterService.saveFilterState(this.#filterState);
    await this.#applyFilters();
    this.currentPage = 1; // Reset to first page when filters change
    this.requestUpdate();
  };

  #handleClearFilters = async () => {
    this.#filterState = FilterService.getDefaultFilterState();
    await FilterService.clearFilterState();
    await this.#applyFilters();
    this.currentPage = 1; // Reset to first page when filters are cleared
    this.requestUpdate();
  };

  async #applyFilters() {
    this.#isApplyingFilters = true;
    this.requestUpdate();

    const rawBookmarks = this.bookmarks;

    // First apply synchronous filters (tags, read status, archived status, date)
    let filtered = FilterService.applyFilters(rawBookmarks, this.#filterState);

    // Then apply asynchronous has assets filter
    if (this.#filterState.hasAssetsStatus !== 'all') {
      const bookmarkIds = filtered.map(b => b.id);
      const allowedIds = await FilterService.applyHasAssetsFilter(
        bookmarkIds,
        this.#filterState.hasAssetsStatus
      );
      filtered = filtered.filter(b => allowedIds.has(b.id));
    }

    this.#filteredBookmarks = filtered;
    this.#isApplyingFilters = false;
    this.requestUpdate();
  }

  #getFilterSummary(): string {
    if (!FilterService.hasActiveFilters(this.#filterState)) {
      return 'All bookmarks';
    }

    const parts: string[] = [];

    if (this.#filterState.tags.length > 0) {
      parts.push(`${this.#filterState.tags.length} tag${this.#filterState.tags.length > 1 ? 's' : ''}`);
    }

    if (this.#filterState.readStatus !== 'all') {
      parts.push(this.#filterState.readStatus === 'read' ? 'Read' : 'Unread');
    }

    if (this.#filterState.archivedStatus !== 'all') {
      parts.push(this.#filterState.archivedStatus === 'archived' ? 'Archived' : 'Active');
    }

    if (this.#filterState.hasAssetsStatus !== 'all') {
      parts.push(
        this.#filterState.hasAssetsStatus === 'has-assets'
          ? 'With offline content'
          : 'No offline content'
      );
    }

    if (this.#filterState.dateFilter.type !== 'all') {
      if (this.#filterState.dateFilter.type === 'preset' && this.#filterState.dateFilter.preset) {
        const presetLabels = {
          today: 'Today',
          last7days: 'Last 7 days',
          last30days: 'Last 30 days',
          thisyear: 'This year'
        } as const;
        const preset = this.#filterState.dateFilter.preset;
        // Non-null assertion safe because we check preset exists above
        parts.push(presetLabels[preset!]);
      } else if (this.#filterState.dateFilter.type === 'custom') {
        parts.push('Custom date range');
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'All bookmarks';
  }


  get filterCounts() {
    return this.#filterCountsQuery.value || { all: 0, unread: 0, archived: 0 };
  }

  get bookmarks(): LocalBookmark[] {
    const rawBookmarks = this.#bookmarksQuery.value || [];

    // Apply filters if any are active
    if (FilterService.hasActiveFilters(this.#filterState)) {
      // Return filtered bookmarks (computed asynchronously via #applyFilters)
      // Trigger re-application if raw bookmarks changed
      if (rawBookmarks.length > 0 && this.#filteredBookmarks.length === 0 && !this.#isApplyingFilters) {
        queueMicrotask(() => this.#applyFilters());
      }
      return this.#filteredBookmarks;
    }

    return rawBookmarks;
  }

  get isLoading(): boolean {
    return this.#bookmarksQuery.loading || this.#filterCountsQuery.loading || this.#isApplyingFilters;
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
      <sync-progress .syncState=${syncState}></sync-progress>

      ${this.#syncController.hasSyncError() ? html`
        <sync-error-notification
          .error=${syncState.lastError || ''}
          .retryCount=${syncState.retryCount || 0}
          .onDismiss=${this.#handleSyncErrorDismiss}
          .onRetry=${this.#handleSyncErrorRetry}
        ></sync-error-notification>
      ` : ''}

      <div class="filters">
        <div class="filter-summary">
          <span class="filter-summary-text">${this.#getFilterSummary()}</span>
          ${FilterService.hasActiveFilters(this.#filterState) ? html`
            <md-text-button
              class="clear-filters-btn"
              @click=${this.#handleClearFilters}
            >
              Clear filters
            </md-text-button>
          ` : ''}
        </div>
        <md-icon-button @click=${this.#handleFilterDialogOpen}>
          <md-icon>filter_list</md-icon>
        </md-icon-button>
      </div>

      <filter-dialog
        .open=${this.#filterDialogOpen}
        .filters=${this.#filterState}
        @apply-filters=${this.#handleApplyFilters}
        @close=${this.#handleFilterDialogClose}
      ></filter-dialog>

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
          .hasActiveFilters=${FilterService.hasActiveFilters(this.#filterState)}
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
