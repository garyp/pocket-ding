import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncController } from '../controllers/sync-controller';
import { FaviconController } from '../controllers/favicon-controller';
import type { LocalBookmark } from '../types';
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
  } = {
    bookmarks: [],
    isLoading: true,
    bookmarksWithAssets: new Set<number>(),
  };

  // Reactive controllers
  private syncController = new SyncController(this, {
    onBookmarkSynced: (bookmarkId: number, updatedBookmark: LocalBookmark) => this.handleBookmarkSynced(bookmarkId, updatedBookmark),
    onSyncCompleted: () => this.handleSyncCompleted(),
  });

  private faviconController = new FaviconController(this);

  override connectedCallback() {
    super.connectedCallback();
    this.loadBookmarks();
    
    // Add event listener for sync-requested events (needed for tests and legacy compatibility)
    this.addEventListener('sync-requested', this.handleSyncRequested);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    
    // Remove event listener
    this.removeEventListener('sync-requested', this.handleSyncRequested);
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
      
      // Initialize favicon controller with bookmark data
      this.faviconController.observeBookmarks(bookmarks);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
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
        bookmarksWithAssets: updatedBookmarksWithAssets,
      };
    } else {
      // If bookmark doesn't exist, add it to the list
      const updatedBookmarksWithAssets = new Set(this.containerState.bookmarksWithAssets);
      if (hasAssets) {
        updatedBookmarksWithAssets.add(bookmarkId);
      }
      
      const newBookmarks = [...this.containerState.bookmarks, updatedBookmark];
      this.containerState = {
        ...this.containerState,
        bookmarks: newBookmarks,
        bookmarksWithAssets: updatedBookmarksWithAssets,
      };
    }
  }

  // Callback handlers
  private handleBookmarkSelect = (bookmarkId: number) => {
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
        .onBookmarkSelect=${this.handleBookmarkSelect}
        .onSyncRequested=${this.handleSyncRequested}
        .onFaviconLoadRequested=${this.handleFaviconLoadRequested}
        .onVisibilityChanged=${this.handleVisibilityChanged}
      ></bookmark-list>
    `;
  }
}