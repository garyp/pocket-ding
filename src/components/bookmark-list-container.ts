import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncController } from '../controllers/sync-controller';
import { FaviconController } from '../controllers/favicon-controller';
import { StateController } from '../controllers/state-controller';
import { ReactiveQueryController } from '../controllers/reactive-query-controller';
import type { LocalBookmark, PaginationState, BookmarkListContainerState } from '../types';
import '@material/web/labs/badge/badge.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/progress/circular-progress.js';
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

  // Reactive data query that automatically updates when data changes
  private paginationDataQuery = new ReactiveQueryController<{
    bookmarks: LocalBookmark[];
    totalCount: number;
    totalPages: number;
    filterCounts: { all: number; unread: number; archived: number };
    bookmarksWithAssets: Set<number>;
  }>(this, {
    query: DatabaseService.createPaginationDataQuery(this.filter, this.currentPage, this.pageSize)
  });

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

  // Build pagination state from reactive data
  private buildPaginationState(paginationData: {
    bookmarks: LocalBookmark[];
    totalCount: number;
    totalPages: number;
    filterCounts: { all: number; unread: number; archived: number };
    bookmarksWithAssets: Set<number>;
  }): PaginationState {
    return {
      currentPage: this.currentPage,
      pageSize: this.pageSize,
      totalCount: paginationData.totalCount,
      totalPages: paginationData.totalPages,
      filter: this.filter,
      ...(this.anchorBookmarkId ? { anchorBookmarkId: this.anchorBookmarkId } : {}),
      filterCounts: paginationData.filterCounts
    };
  }

  override connectedCallback() {
    super.connectedCallback();
    // StateController automatically handles persistence via observedProperties
    void this.stateController; // Suppress TS6133: declared but never read warning
    // All data loading now happens reactively - no manual loading needed!
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
  }




  // Controller event handlers
  private async handleSyncCompleted() {
    // With reactive queries, bookmarks automatically update when sync completes
    console.log('Sync completed');
  }
 
  private async handleBookmarkSynced(bookmarkId: number, updatedBookmark: LocalBookmark) {
    if (!updatedBookmark || !bookmarkId) return;
    
    // With reactive queries, the UI automatically updates when database changes.
    // We only need to handle navigation for anchor bookmarks.
    
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
        this.currentPage = targetPage; // StateController will automatically persist
        // Update the reactive query to navigate to the correct page
        this.paginationDataQuery.updateQuery(
          DatabaseService.createPaginationDataQuery(this.filter, this.currentPage, this.pageSize)
        );
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
    const paginationData = this.paginationDataQuery.value!;
    this.faviconController.handleVisibilityChanged(visibleBookmarkIds, paginationData.bookmarks);
  };

  private handlePageChange = async (page: number) => {
    if (page !== this.currentPage) {
      this.currentPage = page; // StateController persists this
      // Update the reactive query - this triggers automatic re-render
      this.paginationDataQuery.updateQuery(
        DatabaseService.createPaginationDataQuery(this.filter, this.currentPage, this.pageSize)
      );
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
      
      this.filter = filter; // StateController persists this
      this.currentPage = targetPage; // StateController persists this
      // Update the reactive query - this triggers automatic re-render
      this.paginationDataQuery.updateQuery(
        DatabaseService.createPaginationDataQuery(this.filter, this.currentPage, this.pageSize)
      );
    }
  };

  override render() {
    const syncState = this.syncController.getSyncState();
    const faviconState = this.faviconController.getFaviconState();
    
    return this.paginationDataQuery.render({
      pending: () => html`
        <div style="display: flex; justify-content: center; padding: 2rem;">
          <md-circular-progress indeterminate></md-circular-progress>
        </div>
      `,
      error: (error) => html`
        <div style="text-align: center; padding: 2rem; color: var(--md-sys-color-error);">
          <h3>Failed to load bookmarks</h3>
          <p>${error.message}</p>
        </div>
      `,
      value: (paginationData) => html`
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
          .bookmarks=${paginationData.bookmarks}
          .isLoading=${this.paginationDataQuery.loading}
          .bookmarksWithAssets=${paginationData.bookmarksWithAssets}
          .faviconCache=${faviconState.faviconCache}
          .syncedBookmarkIds=${syncState.syncedBookmarkIds}
          .paginationState=${this.buildPaginationState(paginationData)}
          .onBookmarkSelect=${this.handleBookmarkSelect}
          .onSyncRequested=${this.handleSyncRequested}
          .onFaviconLoadRequested=${this.handleFaviconLoadRequested}
          .onVisibilityChanged=${this.handleVisibilityChanged}
          .onPageChange=${this.handlePageChange}
          .onFilterChange=${this.handleFilterChange}
        ></bookmark-list>
      `
    });
  }
}
