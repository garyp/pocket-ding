import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { LocalBookmark } from '../types';
import '@shoelace-style/shoelace/dist/components/card/card.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/progress-bar/progress-bar.js';

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
  @state() private selectedFilter: 'all' | 'unread' | 'archived' = 'all';
  
  private intersectionObserver: IntersectionObserver | null = null;

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
      border-radius: 0.5rem;
      background: var(--sl-color-primary-50);
      border: 1px solid var(--sl-color-primary-200);
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
      border: 1px solid var(--sl-color-neutral-200);
    }

    .bookmark-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .bookmark-card.synced {
      border-color: var(--sl-color-success-500);
      background: var(--sl-color-success-50);
      animation: syncFlash 0.5s ease-in-out;
    }

    @keyframes syncFlash {
      0% { background: var(--sl-color-success-200); }
      100% { background: var(--sl-color-success-50); }
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
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--sl-color-neutral-900);
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
      color: var(--sl-color-primary-500);
    }

    .read-icon {
      color: var(--sl-color-neutral-400);
    }

    .bookmark-description {
      margin: 0 0 0.75rem 0;
      color: var(--sl-color-neutral-600);
      line-height: 1.4;
    }

    .bookmark-url {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--sl-color-neutral-500);
      text-decoration: none;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
      padding: 0.25rem 0;
      border-radius: 0.25rem;
      transition: background-color 0.2s ease;
    }

    .bookmark-url:hover {
      background-color: var(--sl-color-neutral-50);
      color: var(--sl-color-primary-600);
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
      color: var(--sl-color-neutral-600);
      margin-bottom: 0.25rem;
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
      color: var(--sl-color-neutral-600);
      padding: 2rem;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      color: var(--sl-color-neutral-700);
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
      
      .bookmark-title {
        font-size: 1rem;
      }
      
      .filters {
        padding: 0;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.setupIntersectionObserver();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
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

  private handleFilterChange(filter: 'all' | 'unread' | 'archived') {
    this.selectedFilter = filter;
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
      <sl-card 
        class="bookmark-card ${isRecentlySynced ? 'synced' : ''}"
        data-bookmark-id="${bookmark.id}"
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
              ${this.faviconState.bookmarksWithAssets.has(bookmark.id) ? html`
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
      ${this.syncState.isSyncing ? html`
        <div class="sync-progress">
          <div class="sync-progress-text">
            <span>
              ${this.syncState.syncTotal > 0 
                ? `Syncing bookmarks... ${this.syncState.syncProgress}/${this.syncState.syncTotal}`
                : 'Starting sync...'
              }
            </span>
            <sl-badge variant="primary" size="small" class="sync-badge">
              <sl-icon name="arrow-repeat"></sl-icon>
              Syncing
            </sl-badge>
          </div>
          <sl-progress-bar 
            value=${this.syncState.syncTotal > 0 ? (this.syncState.syncProgress / this.syncState.syncTotal) * 100 : 0}
            ?indeterminate=${this.syncState.syncTotal === 0}
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
          <sl-button variant="primary" @click=${() => this.onSyncRequested()}>
            <sl-icon name="arrow-repeat"></sl-icon>
            Sync Now
          </sl-button>
        </div>
      ` : html`
        <div class="bookmark-list">
          ${bookmarks.map(bookmark => this.renderBookmark(bookmark))}
        </div>
      `}
    `;
  }
}