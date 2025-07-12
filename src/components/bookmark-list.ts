import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncService } from '../services/sync-service';
import type { LocalBookmark, AppSettings } from '../types';
import '@shoelace-style/shoelace/dist/components/card/card.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/progress-bar/progress-bar.js';

@customElement('bookmark-list')
export class BookmarkList extends LitElement {
  @state() private bookmarks: LocalBookmark[] = [];
  @state() private isLoading = true;
  @state() private selectedFilter: 'all' | 'unread' | 'archived' = 'all';
  @state() private isSyncing = false;
  @state() private syncProgress = 0;
  @state() private syncTotal = 0;
  @state() private bookmarksWithAssets = new Set<number>();
  @state() private syncedBookmarkIds = new Set<number>();
  
  private syncService: SyncService | null = null;

  static override styles = css`
    :host {
      display: block;
      padding: 1rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .filters {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding: 0 0.5rem;
    }

    .sync-progress {
      position: sticky;
      top: 0;
      z-index: 10;
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: var(--sl-color-primary-50);
      border-radius: 8px;
      border: 1px solid var(--sl-color-primary-200);
      backdrop-filter: blur(8px);
    }

    .sync-progress-text {
      font-size: 0.875rem;
      color: var(--sl-color-primary-700);
      margin-bottom: 0.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .sync-badge {
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .bookmark-card.synced {
      animation: highlight 1s ease-out;
    }

    @keyframes highlight {
      0% { background-color: var(--sl-color-success-100); }
      100% { background-color: transparent; }
    }

    .bookmark-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .bookmark-card {
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      border: 1px solid var(--sl-color-neutral-200);
    }

    .bookmark-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .bookmark-content {
      padding: 1rem;
    }

    .bookmark-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }

    .bookmark-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--sl-color-neutral-900);
      margin: 0;
      line-height: 1.3;
    }

    .bookmark-meta {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 0.5rem;
    }

    .bookmark-meta sl-badge sl-icon {
      margin-right: 0.25rem;
    }

    .bookmark-meta .unread-icon {
      color: var(--sl-color-primary-600);
      font-size: 1.1rem;
    }

    .bookmark-meta .read-icon {
      color: var(--sl-color-neutral-500);
      font-size: 1.1rem;
    }

    .bookmark-description {
      color: var(--sl-color-neutral-600);
      font-size: 0.9rem;
      margin: 0.5rem 0;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .bookmark-url {
      color: var(--sl-color-primary-600);
      font-size: 0.8rem;
      text-decoration: none;
      word-break: break-all;
    }

    .bookmark-tags {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
    }

    .bookmark-progress {
      margin-top: 0.5rem;
    }

    .progress-text {
      font-size: 0.75rem;
      color: var(--sl-color-neutral-600);
      margin-bottom: 0.25rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--sl-color-neutral-600);
    }

    .empty-state h3 {
      margin-bottom: 0.5rem;
      color: var(--sl-color-neutral-700);
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      flex-direction: column;
      gap: 1rem;
    }

    @media (max-width: 768px) {
      :host {
        padding: 0.5rem;
      }
      
      .bookmark-content {
        padding: 0.75rem;
      }
      
      .bookmark-title {
        font-size: 1rem;
      }
      
      .filters {
        padding: 0;
      }
    }
  `;

  override async connectedCallback() {
    super.connectedCallback();
    await this.loadBookmarks();
    this.setupSyncListener();
    this.setupSyncEventListeners();
    this.checkOngoingSync();
  }

  private setupSyncListener() {
    // Listen for sync requests from the app root
    this.addEventListener('sync-requested', this.handleSyncRequest);
  }

  private setupSyncEventListeners() {
    this.syncService = SyncService.getInstance();
    
    this.syncService.addEventListener('sync-initiated', this.handleSyncInitiated as EventListener);
    this.syncService.addEventListener('sync-started', this.handleSyncStarted as EventListener);
    this.syncService.addEventListener('sync-progress', this.handleSyncProgress as EventListener);
    this.syncService.addEventListener('bookmark-synced', this.handleBookmarkSynced as any);
    this.syncService.addEventListener('sync-completed', this.handleSyncCompleted as EventListener);
    this.syncService.addEventListener('sync-error', this.handleSyncError as EventListener);
  }

  private checkOngoingSync() {
    // Check if there's a sync in progress when component connects
    if (SyncService.isSyncInProgress()) {
      const progress = SyncService.getCurrentSyncProgress();
      this.isSyncing = true;
      this.syncProgress = progress.current;
      this.syncTotal = progress.total;
      this.syncedBookmarkIds.clear(); // Clear stale highlights
      this.requestUpdate();
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('sync-requested', this.handleSyncRequest);
    
    if (this.syncService) {
      this.syncService.removeEventListener('sync-initiated', this.handleSyncInitiated as EventListener);
      this.syncService.removeEventListener('sync-started', this.handleSyncStarted as EventListener);
      this.syncService.removeEventListener('sync-progress', this.handleSyncProgress as EventListener);
      this.syncService.removeEventListener('bookmark-synced', this.handleBookmarkSynced as any);
      this.syncService.removeEventListener('sync-completed', this.handleSyncCompleted as EventListener);
      this.syncService.removeEventListener('sync-error', this.handleSyncError as EventListener);
    }
  }

  private handleSyncRequest = async () => {
    const settings = await DatabaseService.getSettings();
    if (settings) {
      await this.syncBookmarks(settings);
    }
  }

  private handleSyncInitiated = () => {
    // Show immediate feedback - sync starting but don't know total yet
    this.isSyncing = true;
    this.syncProgress = 0;
    this.syncTotal = 0; // Will be updated when sync-started fires
    this.syncedBookmarkIds.clear();
  }

  private handleSyncStarted = (event: CustomEvent) => {
    // Update with actual total once we know it
    this.isSyncing = true;
    this.syncProgress = 0;
    this.syncTotal = event.detail.total;
    this.syncedBookmarkIds.clear();
  }

  private handleSyncProgress = (event: CustomEvent) => {
    this.syncProgress = event.detail.current;
    this.syncTotal = event.detail.total;
  }

  private handleBookmarkSynced = async (event: CustomEvent) => {
    const { bookmark } = event.detail;
    this.syncedBookmarkIds.add(bookmark.id);
    
    // Update the bookmark in our local list (create new array for reactivity)
    const existingIndex = this.bookmarks.findIndex(b => b.id === bookmark.id);
    if (existingIndex >= 0) {
      // Update existing bookmark
      this.bookmarks = [
        ...this.bookmarks.slice(0, existingIndex),
        bookmark,
        ...this.bookmarks.slice(existingIndex + 1)
      ];
    } else {
      // Add new bookmark to the beginning
      this.bookmarks = [bookmark, ...this.bookmarks];
    }
    
    // Check if this bookmark has assets
    const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmark.id);
    if (assets.length > 0) {
      this.bookmarksWithAssets.add(bookmark.id);
    }
    
    this.requestUpdate();
  }

  private handleSyncCompleted = () => {
    this.isSyncing = false;
    this.syncedBookmarkIds.clear();
  }

  private handleSyncError = (event: CustomEvent) => {
    this.isSyncing = false;
    console.error('Sync error:', event.detail.error);
  }


  private async loadBookmarks() {
    try {
      this.isLoading = true;
      this.bookmarks = await DatabaseService.getAllBookmarks();
      
      // Debug logging for archived bookmarks
      const archivedCount = this.bookmarks.filter(b => b.is_archived).length;
      console.log(`Local bookmarks loaded: ${this.bookmarks.length} total, ${archivedCount} archived`);
      
      // Check which bookmarks have assets
      const bookmarksWithAssets = new Set<number>();
      for (const bookmark of this.bookmarks) {
        const assets = await DatabaseService.getCompletedAssetsByBookmarkId(bookmark.id);
        if (assets.length > 0) {
          bookmarksWithAssets.add(bookmark.id);
        }
      }
      this.bookmarksWithAssets = bookmarksWithAssets;
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async syncBookmarks(settings: AppSettings) {
    if (this.isSyncing) return;
    
    try {
      await SyncService.syncBookmarks(settings);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  private handleBookmarkClick(bookmark: LocalBookmark) {
    this.dispatchEvent(new CustomEvent('bookmark-selected', {
      detail: { bookmarkId: bookmark.id }
    }));
  }

  private handleFilterChange(filter: 'all' | 'unread' | 'archived') {
    this.selectedFilter = filter;
  }

  private get filteredBookmarks() {
    if (this.selectedFilter === 'unread') {
      return this.bookmarks.filter(bookmark => bookmark.unread && !bookmark.is_archived);
    }
    if (this.selectedFilter === 'archived') {
      return this.bookmarks.filter(bookmark => bookmark.is_archived);
    }
    // Default 'all' filter shows only unarchived bookmarks
    return this.bookmarks.filter(bookmark => !bookmark.is_archived);
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  private renderBookmark(bookmark: LocalBookmark) {
    const hasProgress = bookmark.read_progress && bookmark.read_progress > 0;
    const isRecentlySynced = this.syncedBookmarkIds.has(bookmark.id);
    
    return html`
      <sl-card 
        class="bookmark-card ${isRecentlySynced ? 'synced' : ''}"
        @click=${() => this.handleBookmarkClick(bookmark)}
      >
        <div class="bookmark-content">
          <div class="bookmark-header">
            <h3 class="bookmark-title">${bookmark.title}</h3>
            <div class="bookmark-meta">
              ${bookmark.unread ? html`
                <sl-icon name="envelope" class="unread-icon" title="Unread"></sl-icon>
              ` : html`
                <sl-icon name="envelope-open" class="read-icon" title="Read"></sl-icon>
              `}
              ${bookmark.is_archived ? html`
                <sl-badge variant="neutral" size="small">Archived</sl-badge>
              ` : ''}
              ${this.bookmarksWithAssets.has(bookmark.id) ? html`
                <sl-badge variant="success" size="small">
                  <sl-icon name="download"></sl-icon>
                  Cached
                </sl-badge>
              ` : ''}
            </div>
          </div>
          
          ${bookmark.description ? html`
            <p class="bookmark-description">${bookmark.description}</p>
          ` : ''}
          
          <a class="bookmark-url" href=${bookmark.url} target="_blank" @click=${(e: Event) => e.stopPropagation()}>
            ${bookmark.url}
          </a>
          
          ${bookmark.tag_names.length > 0 ? html`
            <div class="bookmark-tags">
              ${bookmark.tag_names.map(tag => html`
                <sl-badge variant="neutral" size="small">${tag}</sl-badge>
              `)}
            </div>
          ` : ''}
          
          ${hasProgress ? html`
            <div class="bookmark-progress">
              <div class="progress-text">
                ${Math.round(bookmark.read_progress!)}% read
              </div>
              <sl-progress-bar value=${bookmark.read_progress}></sl-progress-bar>
            </div>
          ` : ''}
          
          <div style="font-size: 0.75rem; color: var(--sl-color-neutral-500); margin-top: 0.5rem;">
            Added ${this.formatDate(bookmark.date_added)}
          </div>
        </div>
      </sl-card>
    `;
  }

  override render() {
    if (this.isLoading) {
      return html`
        <div class="loading-container">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
          <p>Loading bookmarks...</p>
        </div>
      `;
    }


    const bookmarks = this.filteredBookmarks;

    return html`
      ${this.isSyncing ? html`
        <div class="sync-progress">
          <div class="sync-progress-text">
            <span>
              ${this.syncTotal > 0 
                ? `Syncing bookmarks... ${this.syncProgress}/${this.syncTotal}`
                : 'Starting sync...'
              }
            </span>
            <sl-badge variant="primary" size="small" class="sync-badge">
              <sl-icon name="arrow-repeat"></sl-icon>
              Syncing
            </sl-badge>
          </div>
          <sl-progress-bar 
            value=${this.syncTotal > 0 ? (this.syncProgress / this.syncTotal) * 100 : 0}
            ?indeterminate=${this.syncTotal === 0}
          ></sl-progress-bar>
        </div>
      ` : ''}
      
      <div class="filters">
        <sl-button
          variant=${this.selectedFilter === 'all' ? 'primary' : 'default'}
          size="small"
          @click=${() => this.handleFilterChange('all')}
        >
          All (${this.bookmarks.filter(b => !b.is_archived).length})
        </sl-button>
        <sl-button
          variant=${this.selectedFilter === 'unread' ? 'primary' : 'default'}
          size="small"
          @click=${() => this.handleFilterChange('unread')}
        >
          Unread (${this.bookmarks.filter(b => b.unread && !b.is_archived).length})
        </sl-button>
        <sl-button
          variant=${this.selectedFilter === 'archived' ? 'primary' : 'default'}
          size="small"
          @click=${() => this.handleFilterChange('archived')}
        >
          Archived (${this.bookmarks.filter(b => b.is_archived).length})
        </sl-button>
      </div>

      ${bookmarks.length === 0 ? html`
        <div class="empty-state">
          <h3>No bookmarks found</h3>
          <p>
            ${this.selectedFilter === 'unread' 
              ? 'You have no unread bookmarks.' 
              : this.selectedFilter === 'archived'
              ? 'You have no archived bookmarks.'
              : 'Sync your bookmarks to get started.'}
          </p>
        </div>
      ` : html`
        <div class="bookmark-list">
          ${bookmarks.map(bookmark => this.renderBookmark(bookmark))}
        </div>
      `}
    `;
  }
}
