import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { SyncService } from '../services/sync-service';
import { LocalBookmark, AppSettings } from '../types';
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
  @state() private selectedFilter: 'all' | 'unread' = 'all';
  @state() private isSyncing = false;
  @state() private syncProgress = 0;
  @state() private syncTotal = 0;

  static styles = css`
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
      margin-bottom: 1rem;
      padding: 1rem;
      background: var(--sl-color-primary-50);
      border-radius: 8px;
      border: 1px solid var(--sl-color-primary-200);
    }

    .sync-progress-text {
      font-size: 0.875rem;
      color: var(--sl-color-primary-700);
      margin-bottom: 0.5rem;
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

  async connectedCallback() {
    super.connectedCallback();
    await this.loadBookmarks();
    this.setupSyncListener();
  }

  private setupSyncListener() {
    // Listen for sync requests from the app root
    this.addEventListener('sync-requested', this.handleSyncRequest);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('sync-requested', this.handleSyncRequest);
  }

  private handleSyncRequest = async () => {
    const settings = await DatabaseService.getSettings();
    if (settings) {
      await this.syncBookmarks(settings);
    }
  }


  private async loadBookmarks() {
    try {
      this.isLoading = true;
      this.bookmarks = await DatabaseService.getAllBookmarks();
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async syncBookmarks(settings: AppSettings) {
    if (this.isSyncing) return;
    
    try {
      this.isSyncing = true;
      this.syncProgress = 0;
      this.syncTotal = 0;
      
      await SyncService.syncBookmarks(settings, (current, total) => {
        this.syncProgress = current;
        this.syncTotal = total;
      });
      
      await this.loadBookmarks();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private handleBookmarkClick(bookmark: LocalBookmark) {
    this.dispatchEvent(new CustomEvent('bookmark-selected', {
      detail: { bookmarkId: bookmark.id }
    }));
  }

  private handleFilterChange(filter: 'all' | 'unread') {
    this.selectedFilter = filter;
  }

  private get filteredBookmarks() {
    if (this.selectedFilter === 'unread') {
      return this.bookmarks.filter(bookmark => bookmark.unread);
    }
    return this.bookmarks;
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
    
    return html`
      <sl-card 
        class="bookmark-card"
        @click=${() => this.handleBookmarkClick(bookmark)}
      >
        <div class="bookmark-content">
          <div class="bookmark-header">
            <h3 class="bookmark-title">${bookmark.title}</h3>
            <div class="bookmark-meta">
              ${bookmark.unread ? html`
                <sl-badge variant="primary" size="small">Unread</sl-badge>
              ` : ''}
              ${bookmark.is_archived ? html`
                <sl-badge variant="neutral" size="small">Archived</sl-badge>
              ` : ''}
              ${bookmark.content ? html`
                <sl-badge variant="success" size="small">
                  <sl-icon name="download"></sl-icon>
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

  render() {
    if (this.isLoading) {
      return html`
        <div class="loading-container">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
          <p>Loading bookmarks...</p>
        </div>
      `;
    }

    if (this.isSyncing) {
      return html`
        <div class="sync-progress">
          <div class="sync-progress-text">
            Syncing bookmarks... ${this.syncProgress}/${this.syncTotal}
          </div>
          <sl-progress-bar 
            value=${this.syncTotal > 0 ? (this.syncProgress / this.syncTotal) * 100 : 0}
          ></sl-progress-bar>
        </div>
      `;
    }

    const bookmarks = this.filteredBookmarks;

    return html`
      <div class="filters">
        <sl-button
          variant=${this.selectedFilter === 'all' ? 'primary' : 'default'}
          size="small"
          @click=${() => this.handleFilterChange('all')}
        >
          All (${this.bookmarks.length})
        </sl-button>
        <sl-button
          variant=${this.selectedFilter === 'unread' ? 'primary' : 'default'}
          size="small"
          @click=${() => this.handleFilterChange('unread')}
        >
          Unread (${this.bookmarks.filter(b => b.unread).length})
        </sl-button>
      </div>

      ${bookmarks.length === 0 ? html`
        <div class="empty-state">
          <h3>No bookmarks found</h3>
          <p>
            ${this.selectedFilter === 'unread' 
              ? 'You have no unread bookmarks.' 
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