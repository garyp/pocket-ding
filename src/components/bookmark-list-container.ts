import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncController } from '../controllers/sync-controller';
import { FaviconController } from '../controllers/favicon-controller';
import type { LocalBookmark } from '../types';
import './bookmark-list';

@customElement('bookmark-list-container')
export class BookmarkListContainer extends LitElement {
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
    onBookmarkSynced: this.handleBookmarkSynced.bind(this),
    onSyncCompleted: this.handleSyncCompleted.bind(this),
  });

  private faviconController = new FaviconController(this);

  override connectedCallback() {
    super.connectedCallback();
    this.loadBookmarks();
    
    // Listen for external sync-requested events for backward compatibility
    this.addEventListener('sync-requested', this.handleExternalSyncRequest);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    
    // Remove external event listeners
    this.removeEventListener('sync-requested', this.handleExternalSyncRequest);
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
    // Reload bookmarks after sync
    await this.loadBookmarks();
  }

  private async handleBookmarkSynced(bookmarkId: number, updatedBookmark: any) {
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

  // External event handler for backward compatibility
  private handleExternalSyncRequest = (event: Event) => {
    event.preventDefault();
    this.handleSyncRequested();
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
      <bookmark-list
        .bookmarks=${this.containerState.bookmarks}
        .isLoading=${this.containerState.isLoading}
        .syncState=${syncState}
        .faviconState=${{
          faviconCache: faviconState.faviconCache,
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