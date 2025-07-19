import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { LocalBookmark, BookmarkFilter, BookmarkListState } from '../types';
import { StateController } from '../controllers/state-controller';
import '@material/web/labs/card/outlined-card.js';
import '@material/web/labs/badge/badge.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/progress/linear-progress.js';

@customElement('bookmark-list')
export class BookmarkList extends LitElement {
  // Data props
  @property({ type: Array }) bookmarks: LocalBookmark[] = [];
  @property({ type: Boolean }) isLoading = false;
  
  // Sync state props
  @property({ type: Object }) syncState = {
    isSyncing: false,
    syncProgress: 0,
    syncTotal: 0,
    syncedBookmarkIds: new Set<number>(),
  };
  
  // Favicon state props
  @property({ type: Object }) faviconState = {
    faviconCache: new Map<number, string>(),
    bookmarksWithAssets: new Set<number>(),
  };
  
  // Callback props
  @property({ type: Function }) onBookmarkSelect: (bookmarkId: number) => void = () => {};
  @property({ type: Function }) onSyncRequested: () => void = () => {};
  @property({ type: Function }) onFaviconLoadRequested: (bookmarkId: number, faviconUrl: string) => void = () => {};
  @property({ type: Function }) onVisibilityChanged: (visibleBookmarkIds: number[]) => void = () => {};
  
  // UI state (internal only)
  @state() private selectedFilter: BookmarkFilter = 'all';
  @state() private scrollPosition: number = 0;
  
  private intersectionObserver: IntersectionObserver | null = null;
  private scrollContainer: Element | null = null;
  
  // State controller for persistence with automatic observation
  private stateController = new StateController<BookmarkListState>(this, {
    storageKey: 'bookmark-list-state',
    defaultState: { selectedFilter: 'all', scrollPosition: 0 },
    observedProperties: ['selectedFilter', 'scrollPosition'],
    validator: (state: any): state is BookmarkListState => {
      return (
        state &&
        typeof state === 'object' &&
        ['all', 'unread', 'archived'].includes(state.selectedFilter) &&
        typeof state.scrollPosition === 'number' &&
        state.scrollPosition >= 0
      );
    }
  });

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

    .bookmark-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .bookmark-card {
      cursor: pointer;
      transition: transform 0.2s ease;
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    .bookmark-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .bookmark-card.synced {
      border-color: var(--md-sys-color-primary);
      background: var(--md-sys-color-primary-container);
      animation: syncFlash 0.5s ease-in-out;
    }

    @keyframes syncFlash {
      0% { background: var(--md-sys-color-primary); }
      100% { background: var(--md-sys-color-primary-container); }
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
      margin: 0;
      color: var(--md-sys-color-on-surface);
      flex: 1;
      margin-right: 1rem;
    }

    .bookmark-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .unread-icon {
      color: var(--md-sys-color-primary);
    }

    .read-icon {
      color: var(--md-sys-color-outline);
    }

    .bookmark-description {
      margin: 0 0 0.75rem 0;
      color: var(--md-sys-color-on-surface-variant);
      line-height: 1.4;
    }

    .bookmark-url {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--md-sys-color-outline);
      text-decoration: none;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
      padding: 0.25rem 0;
      border-radius: 0.25rem;
      transition: background-color 0.2s ease;
    }

    .bookmark-url:hover {
      background-color: var(--md-sys-color-surface-container);
      color: var(--md-sys-color-primary);
    }

    .favicon {
      width: 16px;
      height: 16px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .bookmark-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .bookmark-progress {
      margin-bottom: 0.5rem;
    }

    .progress-text {
      font-size: 0.75rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 0.25rem;
    }

    .bookmark-date {
      font-size: 0.75rem;
      color: var(--md-sys-color-outline);
      margin-top: 0.5rem;
    }

    .circular-progress-48 {
      width: 48px;
      height: 48px;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      flex-direction: column;
      gap: 1rem;
    }

    .empty-state {
      text-align: center;
      color: var(--md-sys-color-on-surface-variant);
      padding: 2rem;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      color: var(--md-sys-color-on-surface);
    }

    .empty-state p {
      margin: 0;
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
      
      
      .filters {
        padding: 0;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.initializeState();
    this.setupIntersectionObserver();
    this.setupScrollTracking();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.saveCurrentScrollPosition();
    
    // Clean up scroll event listener
    if (this.scrollContainer && (this as any)._scrollHandler) {
      this.scrollContainer.removeEventListener('scroll', (this as any)._scrollHandler);
    }
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
  }

  private initializeState() {
    // State is automatically restored by StateController to observed properties
    // No manual restoration needed
  }

  private saveCurrentScrollPosition() {
    if (this.scrollContainer) {
      this.scrollPosition = Math.max(0, this.scrollContainer.scrollTop);
      // State is automatically saved by StateController observing scrollPosition property
      // Manual trigger to ensure state is saved in test environments
      this.stateController.setProp('scrollPosition', this.scrollPosition);
    }
  }

  private restoreScrollPosition() {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop = this.scrollPosition;
    }
  }

  private setupScrollTracking() {
    // Find the scroll container (the host element itself or parent container)
    this.scrollContainer = this.closest('.app-content') || document.documentElement;
    
    if (this.scrollContainer) {
      // Set up scroll event listener to save position
      const scrollHandler = () => {
        this.saveCurrentScrollPosition();
      };
      
      this.scrollContainer.addEventListener('scroll', scrollHandler, { passive: true });
      
      // Save the handler so we can remove it later
      (this as any)._scrollHandler = scrollHandler;
    }
  }

  private setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver(
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

        if (visibleBookmarkIds.length > 0) {
          this.onVisibilityChanged(visibleBookmarkIds);
        }
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );
  }

  override updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    
    // Re-observe bookmark cards after updates
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      const bookmarkCards = this.renderRoot.querySelectorAll('.bookmark-card');
      bookmarkCards.forEach(card => {
        this.intersectionObserver!.observe(card);
      });
    }
    
    // Restore scroll position after the first render
    if (changedProperties.has('bookmarks') && this.bookmarks.length > 0) {
      // Use requestAnimationFrame to ensure the DOM is fully rendered
      requestAnimationFrame(() => {
        this.restoreScrollPosition();
      });
    }
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

  private handleFilterChange(filter: BookmarkFilter) {
    this.selectedFilter = filter;
    // State is automatically saved by StateController observing selectedFilter property
  }

  private handleBookmarkClick(bookmark: LocalBookmark) {
    this.onBookmarkSelect(bookmark.id);
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
    const isRecentlySynced = this.syncState.syncedBookmarkIds.has(bookmark.id);
    
    return html`
      <md-outlined-card 
        class="bookmark-card ${isRecentlySynced ? 'synced' : ''}"
        data-bookmark-id="${bookmark.id}"
        @click=${() => this.handleBookmarkClick(bookmark)}
      >
        <div class="bookmark-content">
          <div class="bookmark-header">
            <h3 class="bookmark-title md-typescale-title-medium">${bookmark.title}</h3>
            <div class="bookmark-meta">
              ${bookmark.unread ? html`
                <md-icon class="unread-icon" title="Unread">email</md-icon>
              ` : html`
                <md-icon class="read-icon" title="Read">drafts</md-icon>
              `}
              ${bookmark.is_archived ? html`
                <md-badge>Archived</md-badge>
              ` : ''}
              ${this.faviconState.bookmarksWithAssets.has(bookmark.id) ? html`
                <md-badge>
                  <md-icon slot="icon">download</md-icon>
                  Cached
                </md-badge>
              ` : ''}
            </div>
          </div>
          
          ${bookmark.description ? html`
            <p class="bookmark-description">${bookmark.description}</p>
          ` : ''}
          
          <a class="bookmark-url" href=${bookmark.url} target="_blank" @click=${(e: Event) => e.stopPropagation()}>
            <img 
              class="favicon" 
              src=${this.faviconState.faviconCache.get(bookmark.id) || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMyIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEwIiByeD0iMiIgZmlsbD0iIzk0YTNiOCIvPgo8L3N2Zz4K'} 
              alt="Favicon"
              loading="lazy"
            />
            ${bookmark.url}
          </a>
          
          ${bookmark.tag_names.length > 0 ? html`
            <div class="bookmark-tags">
              ${bookmark.tag_names.map(tag => html`
                <md-badge>${tag}</md-badge>
              `)}
            </div>
          ` : ''}
          
          ${hasProgress ? html`
            <div class="bookmark-progress">
              <div class="progress-text">
                ${Math.round(bookmark.read_progress!)}% read
              </div>
              <md-linear-progress .value=${bookmark.read_progress! / 100}></md-linear-progress>
            </div>
          ` : ''}
          
          <div class="bookmark-date">
            Added ${this.formatDate(bookmark.date_added)}
          </div>
        </div>
      </md-outlined-card>
    `;
  }

  override render() {
    if (this.isLoading) {
      return html`
        <div class="loading-container">
          <md-circular-progress indeterminate class="circular-progress-48"></md-circular-progress>
          <p>Loading bookmarks...</p>
        </div>
      `;
    }

    const bookmarks = this.filteredBookmarks;

    return html`
      ${this.syncState.isSyncing ? html`
        <div class="sync-progress">
          <div class="sync-progress-text">
            <span>
              ${this.syncState.syncTotal > 0 
                ? `Syncing bookmarks... ${this.syncState.syncProgress}/${this.syncState.syncTotal}`
                : 'Starting sync...'
              }
            </span>
            <md-badge class="sync-badge">
              <md-icon slot="icon">sync</md-icon>
              Syncing
            </md-badge>
          </div>
          <md-linear-progress 
            .value=${this.syncState.syncTotal > 0 ? (this.syncState.syncProgress / this.syncState.syncTotal) : 0}
            ?indeterminate=${this.syncState.syncTotal === 0}
          ></md-linear-progress>
        </div>
      ` : ''}
      
      <div class="filters">
        ${this.selectedFilter === 'all' ? html`
          <md-filled-button
            @click=${() => this.handleFilterChange('all')}
          >
            All (${this.bookmarks.filter(b => !b.is_archived).length})
          </md-filled-button>
        ` : html`
          <md-text-button
            @click=${() => this.handleFilterChange('all')}
          >
            All (${this.bookmarks.filter(b => !b.is_archived).length})
          </md-text-button>
        `}
        ${this.selectedFilter === 'unread' ? html`
          <md-filled-button
            @click=${() => this.handleFilterChange('unread')}
          >
            Unread (${this.bookmarks.filter(b => b.unread && !b.is_archived).length})
          </md-filled-button>
        ` : html`
          <md-text-button
            @click=${() => this.handleFilterChange('unread')}
          >
            Unread (${this.bookmarks.filter(b => b.unread && !b.is_archived).length})
          </md-text-button>
        `}
        ${this.selectedFilter === 'archived' ? html`
          <md-filled-button
            @click=${() => this.handleFilterChange('archived')}
          >
            Archived (${this.bookmarks.filter(b => b.is_archived).length})
          </md-filled-button>
        ` : html`
          <md-text-button
            @click=${() => this.handleFilterChange('archived')}
          >
            Archived (${this.bookmarks.filter(b => b.is_archived).length})
          </md-text-button>
        `}
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
          <md-filled-button @click=${() => this.onSyncRequested()}>
            <md-icon slot="icon">sync</md-icon>
            Sync Now
          </md-filled-button>
        </div>
      ` : html`
        <div class="bookmark-list">
          ${bookmarks.map(bookmark => this.renderBookmark(bookmark))}
        </div>
      `}
    `;
  }
}