import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { LocalBookmark, BookmarkFilter, BookmarkListState, PaginationState } from '../types';
import { StateController } from '../controllers/state-controller';
import { ReactiveQueryController } from '../controllers/reactive-query-controller';
import { DatabaseService } from '../services/database';
import '@material/web/labs/card/outlined-card.js';
import '@material/web/labs/badge/badge.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/progress/linear-progress.js';
import './pagination-controls.js';

@customElement('bookmark-list')
export class BookmarkList extends LitElement {
  // Reactive query controllers
  #bookmarksQuery = new ReactiveQueryController(
    this,
    () => DatabaseService.getBookmarksPaginated(
      this.paginationState.filter,
      this.paginationState.currentPage,
      this.paginationState.pageSize
    )
  );

  #filterCountsQuery = new ReactiveQueryController(
    this,
    () => DatabaseService.getAllFilterCounts()
  );

  // Assets query - uses pagination state to determine which bookmarks to check
  #assetsQuery = new ReactiveQueryController(
    this,
    () => DatabaseService.getBookmarksWithAssetCounts(this.#getCurrentBookmarkIds())
  );

  // Remove old data props that are now handled by reactive controllers
  // @property({ type: Array }) bookmarks: LocalBookmark[] = [];
  // @property({ type: Boolean }) isLoading = false;
  // @property({ type: Set }) bookmarksWithAssets: Set<number> = new Set<number>();
  
  // Favicon props
  @property({ type: Map }) faviconCache: Map<number, string> = new Map<number, string>();
  
  // Sync state props
  @property({ type: Set }) syncedBookmarkIds: Set<number> = new Set<number>();
  
  // Pagination state props
  @property({ type: Object }) paginationState: PaginationState = {
    currentPage: 1,
    pageSize: 25,
    totalCount: 0,
    totalPages: 1,
    filter: 'all'
  };
  
  // Callback props (simplified - no more sync callbacks needed)
  @property({ type: Function }) onBookmarkSelect: (bookmarkId: number) => void = () => {};
  @property({ type: Function }) onFaviconLoadRequested: (bookmarkId: number, faviconUrl: string) => void = () => {};
  @property({ type: Function }) onVisibilityChanged: (visibleBookmarkIds: number[]) => void = () => {};
  @property({ type: Function }) onPageChange: (page: number) => void = () => {};
  @property({ type: Function }) onFilterChange: (filter: BookmarkFilter) => void = () => {};

  // Getter methods for reactive data
  get bookmarks(): LocalBookmark[] {
    return this.#bookmarksQuery.value || [];
  }

  get isLoading(): boolean {
    return this.#bookmarksQuery.loading || this.#filterCountsQuery.loading;
  }

  get bookmarksWithAssets(): Set<number> {
    const assetMap = this.#assetsQuery.value || new Map<number, boolean>();
    const assetsSet = new Set<number>();
    for (const [bookmarkId, hasAssets] of assetMap) {
      if (hasAssets) {
        assetsSet.add(bookmarkId);
      }
    }
    return assetsSet;
  }

  get filterCounts() {
    return this.#filterCountsQuery.value || { all: 0, unread: 0, archived: 0 };
  }
  
  // UI state (persisted via StateController)
  @state()
  private _scrollPosition: number = 0;
  @state() private isOnline: boolean = navigator.onLine;

  get scrollPosition(): number {
    return this._scrollPosition;
  }

  set scrollPosition(value: number) {
    this._scrollPosition = Math.max(0, value);
    // Trigger update to sync state with StateController
    this.requestUpdate('scrollPosition', this._scrollPosition);
  }
  
  #scrollContainer: Element | null = null;
  #intersectionObserver: IntersectionObserver | null = null;
  #observedElements: Set<Element> = new Set();
  
  // State controller for persistence (auto-sync scrollPosition)
  // @ts-expect-error - Used automatically by Lit's ReactiveController pattern
  private stateController = new StateController<BookmarkListState>(this, {
    storageKey: 'bookmark-list-state',
    defaultState: { 
      scrollPosition: 0
    },
    observedProperties: ['scrollPosition'],
    validator: (state: any): state is BookmarkListState => {
      return (
        state &&
        typeof state === 'object' &&
        typeof state.scrollPosition === 'number' &&
        state.scrollPosition >= 0
      );
    }
  });

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

    .bookmark-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .bookmark-card {
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
      border: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-container-low);
      border-radius: 0.75rem; /* 12px - Material Design card radius */
      min-height: 3rem; /* 48px - minimum touch target */
    }

    .bookmark-card:hover {
      background: var(--md-sys-color-surface-container);
      box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.15);
      border-color: var(--md-sys-color-outline);
    }

    .bookmark-card:active {
      background: var(--md-sys-color-surface-container-high);
      transform: scale(0.98);
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

    .bookmark-with-preview {
      position: relative;
    }

    .bookmark-preview {
      float: right;
      width: 120px;
      height: 80px;
      border-radius: 0.5rem;
      object-fit: cover;
      margin-left: 1rem;
      margin-bottom: 0.5rem;
      clear: right;
    }

    .bookmark-text-content {
      overflow: hidden; /* This ensures proper text wrapping around floated image */
    }

    .bookmark-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }

    .bookmark-title {
      margin: 0;
      color: var(--md-sys-color-on-surface);
      flex: 1;
      margin-right: 1rem;
      font-size: 1rem; /* 16px - Material Design body-large */
      font-weight: 400;
      line-height: 1.5rem; /* 24px */
      letter-spacing: 0.03125rem; /* 0.5px */
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
      font-size: 0.875rem; /* 14px - Material Design body-medium */
      line-height: 1.25rem; /* 20px */
      letter-spacing: 0.015625rem; /* 0.25px */
    }

    .bookmark-url {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--md-sys-color-on-surface-variant);
      text-decoration: none;
      font-size: 0.75rem; /* 12px - Material Design body-small */
      line-height: 1rem; /* 16px */
      letter-spacing: 0.025rem; /* 0.4px */
      margin-bottom: 0.5rem;
      padding: 0.25rem 0;
      border-radius: 0.25rem;
      transition: all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
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
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .tag-badge {
      background: var(--md-sys-color-secondary-container);
      color: var(--md-sys-color-on-secondary-container);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.25rem 0.5rem;
      border-radius: 1rem;
      white-space: nowrap;
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    .status-icons {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .status-icon {
      color: var(--md-sys-color-primary);
    }

    .status-icon.archived {
      color: var(--md-sys-color-tertiary);
    }

    .status-icon.cached {
      color: var(--md-sys-color-secondary);
    }

    .bookmark-progress {
      margin-bottom: 0.5rem;
    }

    .progress-text {
      font-size: 0.75rem; /* 12px - Material Design body-small */
      line-height: 1rem; /* 16px */
      letter-spacing: 0.025rem; /* 0.4px */
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 0.25rem;
      font-weight: 500;
    }

    .bookmark-date {
      font-size: 0.75rem; /* 12px - Material Design body-small */
      line-height: 1rem; /* 16px */
      letter-spacing: 0.025rem; /* 0.4px */
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
      background: var(--md-sys-color-surface-container-low);
      border-radius: 1rem; /* 16px - larger radius for emphasis */
      margin: 1rem 0;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      color: var(--md-sys-color-on-surface);
      font-size: 1.25rem; /* 20px - Material Design title-medium */
      font-weight: 500;
      line-height: 1.75rem; /* 28px */
      letter-spacing: 0.009375rem; /* 0.15px */
    }

    .empty-state p {
      margin: 0 0 1rem 0;
      font-size: 0.875rem; /* 14px - Material Design body-medium */
      line-height: 1.25rem; /* 20px */
      letter-spacing: 0.015625rem; /* 0.25px */
    }

    @media (max-width: 48rem) { /* 768px breakpoint */
      :host {
        padding: 0.75rem; /* 12px - reduced for mobile */
      }
      
      .bookmark-content {
        padding: 0.75rem;
      }

      .bookmark-preview {
        width: 80px;
        height: 60px;
        margin-left: 0.75rem;
      }
      
      .bookmark-header {
        margin-bottom: 0.5rem;
      }
      
      .bookmark-title {
        font-size: 0.875rem; /* 14px - smaller on mobile */
        line-height: 1.25rem; /* 20px */
        margin-right: 0.75rem;
      }
      
      .bookmark-description {
        margin-bottom: 0.5rem;
        font-size: 0.75rem; /* 12px - smaller on mobile */
        line-height: 1rem; /* 16px */
      }
      
      .filters {
        padding: 0;
        gap: 0.375rem; /* 6px - tighter on mobile */
        margin-bottom: 0.75rem;
      }
      
      .bookmark-list {
        gap: 0.75rem; /* 12px - tighter spacing on mobile */
      }
      
      .empty-state {
        padding: 1.5rem; /* 24px - reduced on mobile */
        margin: 0.75rem 0;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.#initializeState();
    this.#setupScrollTracking();
    this.#setupIntersectionObserver();
    this.#setupOnlineDetection();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    // Only save from scroll container if we have a real scroll container
    // In tests, the scroll position is managed directly via the property
    if (this.#scrollContainer && this.#scrollContainer.scrollTop !== undefined) {
      this.#saveCurrentScrollPosition();
    }
    
    // Clean up scroll event listener
    if (this.#scrollContainer && (this as any)._scrollHandler) {
      this.#scrollContainer.removeEventListener('scroll', (this as any)._scrollHandler);
    }
    
    // Clean up intersection observer
    this.#cleanupIntersectionObserver();

    // Clean up online detection
    this.#cleanupOnlineDetection();
  }

  #initializeState() {
    // State is automatically restored by StateController when observedProperties is configured
    // No manual restoration needed - the StateController will sync saved state to component properties
  }

  #saveCurrentScrollPosition() {
    if (this.#scrollContainer) {
      const currentScrollTop = this.#scrollContainer.scrollTop;
      // Only update scroll position if container actually has scroll content
      // This prevents overwriting restored state with 0 from fresh/empty containers
      if (currentScrollTop > 0 || this.#scrollContainer.scrollHeight > this.#scrollContainer.clientHeight) {
        this.scrollPosition = currentScrollTop;
        // ScrollPosition is auto-synced by StateController
      }
    }
  }

  #restoreScrollPosition() {
    if (this.#scrollContainer) {
      this.#scrollContainer.scrollTop = this.scrollPosition;
    }
  }

  #setupScrollTracking() {
    // Find the scroll container (the host element itself or parent container)
    this.#scrollContainer = this.closest('.app-content') || document.documentElement;
    
    if (this.#scrollContainer) {
      // Set up scroll event listener to save position
      const scrollHandler = () => {
        this.#saveCurrentScrollPosition();
      };
      
      this.#scrollContainer.addEventListener('scroll', scrollHandler, { passive: true });
      
      // Save the handler so we can remove it later
      (this as any)._scrollHandler = scrollHandler;
    }
  }

  #setupIntersectionObserver() {
    this.#intersectionObserver = new IntersectionObserver(
      (entries) => {
        const visibleBookmarkIds: number[] = [];
        
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const bookmarkId = parseInt(entry.target.getAttribute('data-bookmark-id') || '0');
            if (bookmarkId > 0) {
              visibleBookmarkIds.push(bookmarkId);
              
              // Find the bookmark and request favicon loading if needed
              const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
              if (bookmark?.favicon_url && !this.faviconCache.has(bookmarkId)) {
                this.onFaviconLoadRequested(bookmarkId, bookmark.favicon_url);
              }
            }
          }
        });
        
        // Notify parent of visibility changes
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

  #cleanupIntersectionObserver() {
    if (this.#intersectionObserver) {
      this.#intersectionObserver.disconnect();
      this.#intersectionObserver = null;
    }
    this.#observedElements.clear();
  }

  #setupOnlineDetection() {
    const handleOnline = () => {
      this.isOnline = true;
    };

    const handleOffline = () => {
      this.isOnline = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Store the handlers so we can remove them later
    (this as any)._onlineHandler = handleOnline;
    (this as any)._offlineHandler = handleOffline;
  }

  #cleanupOnlineDetection() {
    if ((this as any)._onlineHandler) {
      window.removeEventListener('online', (this as any)._onlineHandler);
    }
    if ((this as any)._offlineHandler) {
      window.removeEventListener('offline', (this as any)._offlineHandler);
    }
  }

  #updateObservedElements() {
    if (!this.#intersectionObserver) {
      // Lazy initialization if observer doesn't exist
      this.#setupIntersectionObserver();
    }

    // Get current bookmark elements
    const bookmarkCards = this.renderRoot.querySelectorAll('[data-bookmark-id]');
    const currentElements = new Set(bookmarkCards);
    
    // Unobserve elements that are no longer in the DOM
    for (const observedElement of this.#observedElements) {
      if (!currentElements.has(observedElement)) {
        if (this.#intersectionObserver) {
          this.#intersectionObserver.unobserve(observedElement);
        }
        this.#observedElements.delete(observedElement);
      }
    }
    
    // Observe new elements that aren't already being observed
    bookmarkCards.forEach((card) => {
      if (!this.#observedElements.has(card) && this.#intersectionObserver) {
        this.#intersectionObserver.observe(card);
        this.#observedElements.add(card);
      }
    });
  }


  override updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    
    // Update reactive queries when pagination state changes
    if (changedProperties.has('paginationState')) {
      this.#bookmarksQuery.updateQuery(() => 
        DatabaseService.getBookmarksPaginated(
          this.paginationState.filter,
          this.paginationState.currentPage,
          this.paginationState.pageSize
        )
      );
      
      // Also update assets query when pagination changes since bookmarks will change
      this.#assetsQuery.updateQuery(() => 
        DatabaseService.getBookmarksWithAssetCounts(this.#getCurrentBookmarkIds())
      );
    }
    
    // Restore scroll position after the first render
    if (changedProperties.has('paginationState') && this.bookmarks.length > 0) {
      // Use requestAnimationFrame to ensure the DOM is fully rendered
      requestAnimationFrame(() => {
        try {
          if (this.isConnected) {
            this.#restoreScrollPosition();
          }
        } catch (error) {
          console.error('Failed to restore scroll position:', error);
        }
      });
    }
    
    // Always update observed elements after DOM changes to ensure intersection observer works
    requestAnimationFrame(() => {
      try {
        if (this.isConnected && this.#intersectionObserver) {
          this.#updateObservedElements();
        }
      } catch (error) {
        console.error('Failed to update observed elements:', error);
      }
    });
  }

  /**
   * Get current bookmark IDs for assets query
   * Uses bookmarks data without creating circular dependency
   */
  #getCurrentBookmarkIds(): number[] {
    const currentBookmarks = this.#bookmarksQuery.value || [];
    return currentBookmarks.map(bookmark => bookmark.id);
  }

  get filteredBookmarks() {
    if (this.paginationState.filter === 'unread') {
      return this.bookmarks.filter(bookmark => bookmark.unread && !bookmark.is_archived);
    }
    if (this.paginationState.filter === 'archived') {
      return this.bookmarks.filter(bookmark => bookmark.is_archived);
    }
    // Default 'all' filter shows only unarchived bookmarks
    return this.bookmarks.filter(bookmark => !bookmark.is_archived);
  }

  #handleFilterChange(filter: BookmarkFilter) {
    this.onFilterChange(filter);
  }

  #handlePageChange = (page: number) => {
    this.onPageChange(page);
  };

  #handleBookmarkClick(bookmark: LocalBookmark) {
    this.onBookmarkSelect(bookmark.id);
  }

  #formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  #renderStatusIcons(bookmark: LocalBookmark) {
    return html`
      <div class="status-icons">
        ${bookmark.unread ? html`
          <md-icon class="unread-icon" title="Unread">email</md-icon>
        ` : html`
          <md-icon class="read-icon" title="Read">drafts</md-icon>
        `}
        ${bookmark.is_archived ? html`
          <md-icon class="status-icon archived" title="Archived">archive</md-icon>
        ` : ''}
        ${this.bookmarksWithAssets.has(bookmark.id) ? html`
          <md-icon class="status-icon cached" title="Cached">download_done</md-icon>
        ` : ''}
      </div>
    `;
  }

  #renderBookmarkContent(bookmark: LocalBookmark, hasProgress: boolean) {
    return html`
      <div class="bookmark-header">
        <h3 class="bookmark-title md-typescale-title-medium">${bookmark.title}</h3>
        <div class="bookmark-meta">
          ${this.#renderStatusIcons(bookmark)}
        </div>
      </div>

      ${bookmark.description ? html`
        <p class="bookmark-description">${bookmark.description}</p>
      ` : ''}

      <a class="bookmark-url" href=${bookmark.url} target="_blank" @click=${(e: Event) => e.stopPropagation()}>
        <img
          class="favicon"
          src=${this.faviconCache.get(bookmark.id) || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMyIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEwIiByeD0iMiIgZmlsbD0iIzk0YTNiOCIvPgo8L3N2Zz4K'}
          alt="Favicon"
          loading="lazy"
        />
        ${bookmark.url}
      </a>

      ${bookmark.tag_names.length > 0 ? html`
        <div class="bookmark-tags">
          ${bookmark.tag_names.map(tag => html`
            <span class="tag-badge">${tag}</span>
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
        Added ${this.#formatDate(bookmark.date_added)}
      </div>
    `;
  }

  #renderRestOfBookmarkContent(bookmark: LocalBookmark, hasProgress: boolean) {
    return html`
      ${bookmark.description ? html`
        <p class="bookmark-description">${bookmark.description}</p>
      ` : ''}

      <a class="bookmark-url" href=${bookmark.url} target="_blank" @click=${(e: Event) => e.stopPropagation()}>
        <img
          class="favicon"
          src=${this.faviconCache.get(bookmark.id) || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMyIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEwIiByeD0iMiIgZmlsbD0iIzk0YTNiOCIvPgo8L3N2Zz4K'}
          alt="Favicon"
          loading="lazy"
        />
        ${bookmark.url}
      </a>

      ${bookmark.tag_names.length > 0 ? html`
        <div class="bookmark-tags">
          ${bookmark.tag_names.map(tag => html`
            <span class="tag-badge">${tag}</span>
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
        Added ${this.#formatDate(bookmark.date_added)}
      </div>
    `;
  }

  #renderBookmark(bookmark: LocalBookmark) {
    const hasProgress = Boolean(bookmark.read_progress && bookmark.read_progress > 0);
    const hasPreviewImage = this.isOnline && bookmark.preview_image_url && bookmark.preview_image_url.trim() !== '';
    
    return html`
      <md-outlined-card 
        class="bookmark-card ${this.syncedBookmarkIds.has(bookmark.id) ? 'synced' : ''}"
        data-bookmark-id="${bookmark.id}"
        @click=${() => this.#handleBookmarkClick(bookmark)}
      >
        <div class="bookmark-content ${hasPreviewImage ? 'bookmark-with-preview' : ''}">
          ${hasPreviewImage ? html`
            <div class="bookmark-text-content">
              <div class="bookmark-header">
                <h3 class="bookmark-title md-typescale-title-medium">${bookmark.title}</h3>
                <div class="bookmark-meta">
                  ${this.#renderStatusIcons(bookmark)}
                </div>
              </div>
              <img
                class="bookmark-preview"
                src=${bookmark.preview_image_url}
                alt="Preview of ${bookmark.title}"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
              ${this.#renderRestOfBookmarkContent(bookmark, hasProgress)}
            </div>
          ` : html`
            ${this.#renderBookmarkContent(bookmark, hasProgress)}
          `}
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
      <div class="filters">
        ${this.paginationState.filter === 'all' ? html`
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
        ${this.paginationState.filter === 'unread' ? html`
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
        ${this.paginationState.filter === 'archived' ? html`
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

      ${bookmarks.length === 0 ? html`
        <div class="empty-state">
          <h3>No bookmarks found</h3>
          <p>
            ${this.paginationState.filter === 'unread' 
              ? 'You have no unread bookmarks.' 
              : this.paginationState.filter === 'archived'
              ? 'You have no archived bookmarks.'
              : 'Your bookmarks will appear here after syncing.'}
          </p>
        </div>
      ` : html`
        <div class="bookmark-list">
          ${bookmarks.map(bookmark => this.#renderBookmark(bookmark))}
        </div>
        
        <pagination-controls
          .currentPage=${this.paginationState.currentPage}
          .totalPages=${this.paginationState.totalPages}
          .disabled=${this.isLoading}
          .onPageChange=${this.#handlePageChange}
        ></pagination-controls>
      `}
    `;
  }
}