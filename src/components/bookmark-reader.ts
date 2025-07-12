import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { DatabaseService } from '../services/database';
import { ContentFetcher } from '../services/content-fetcher';
import { ThemeService } from '../services/theme-service';
import type { LocalBookmark, ReadProgress, ContentSourceOption } from '../types';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/progress-bar/progress-bar.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';

@customElement('bookmark-reader')
export class BookmarkReader extends LitElement {
  @property({ type: Number }) bookmarkId: number | null = null;
  @state() private bookmark: LocalBookmark | null = null;
  @state() private isLoading = true;
  @state() private readingMode: 'original' | 'readability' = 'readability';
  @state() private readProgress = 0;
  @state() private scrollPosition = 0;
  @state() private selectedContentSource: ContentSourceOption | null = null;
  @state() private availableContentSources: ContentSourceOption[] = [];
  @state() private currentContent = '';
  @state() private currentReadabilityContent = '';
  @state() private isLoadingContent = false;
  @state() private darkModeOverride: 'light' | 'dark' | null = null;
  @state() private systemTheme: 'light' | 'dark' = 'light';

  private scrollObserver: IntersectionObserver | null = null;
  private progressSaveTimeout: number | null = null;
  private readMarkTimeout: number | null = null;
  private hasBeenMarkedAsRead = false;

  static override styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .reader-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .reader-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--sl-color-neutral-50);
      border-bottom: 1px solid var(--sl-color-neutral-200);
      gap: 1rem;
    }

    .reading-mode-toggle {
      display: flex;
      gap: 0.5rem;
    }

    .content-source-selector {
      min-width: 120px;
    }

    .toolbar-section {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .progress-section {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      min-width: 0;
    }

    .progress-text {
      font-size: 0.875rem;
      color: var(--sl-color-neutral-600);
      white-space: nowrap;
    }

    .reader-content {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }

    .content-container {
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.6;
    }

    /* Dark mode overrides for reader content */
    :host(.reader-dark-mode) .reader-content {
      background: #1a1a1a;
      color: #e0e0e0;
    }

    :host(.reader-dark-mode) .content-container {
      color: #e0e0e0;
    }

    :host(.reader-dark-mode) .content-container h1,
    :host(.reader-dark-mode) .content-container h2,
    :host(.reader-dark-mode) .content-container h3,
    :host(.reader-dark-mode) .content-container h4,
    :host(.reader-dark-mode) .content-container h5,
    :host(.reader-dark-mode) .content-container h6 {
      color: #ffffff;
    }

    :host(.reader-dark-mode) .content-container p {
      color: #d0d0d0;
    }

    :host(.reader-dark-mode) .content-container a {
      color: #4d9eff;
    }

    :host(.reader-dark-mode) .content-container blockquote {
      background: #2a2a2a;
      border-left-color: #4d9eff;
      color: #d0d0d0;
    }

    :host(.reader-dark-mode) .content-container pre {
      background: #2a2a2a;
      color: #e0e0e0;
    }

    :host(.reader-dark-mode) .content-container code {
      background: #2a2a2a;
      color: #e0e0e0;
    }

    :host(.reader-dark-mode) .bookmark-header {
      border-bottom-color: #404040;
    }

    :host(.reader-dark-mode) .bookmark-title {
      color: #ffffff;
    }

    :host(.reader-dark-mode) .bookmark-meta {
      color: #a0a0a0;
    }

    :host(.reader-dark-mode) .bookmark-url {
      color: #4d9eff;
    }

    .content-container h1,
    .content-container h2,
    .content-container h3,
    .content-container h4,
    .content-container h5,
    .content-container h6 {
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: var(--sl-color-neutral-900);
    }

    .content-container p {
      margin-bottom: 1rem;
      color: var(--sl-color-neutral-700);
    }

    .content-container img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 1rem 0;
    }

    .content-container a {
      color: var(--sl-color-primary-600);
      text-decoration: none;
    }

    .content-container a:hover {
      text-decoration: underline;
    }

    .content-container blockquote {
      margin: 1rem 0;
      padding: 1rem;
      background: var(--sl-color-neutral-50);
      border-left: 4px solid var(--sl-color-primary-600);
      border-radius: 4px;
    }

    .content-container pre {
      background: var(--sl-color-neutral-100);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.875rem;
    }

    .content-container code {
      background: var(--sl-color-neutral-100);
      padding: 0.125rem 0.25rem;
      border-radius: 2px;
      font-size: 0.875rem;
    }

    .bookmark-header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    .bookmark-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--sl-color-neutral-900);
      margin: 0 0 0.5rem 0;
      line-height: 1.2;
    }

    .bookmark-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
      color: var(--sl-color-neutral-600);
    }

    .bookmark-url {
      color: var(--sl-color-primary-600);
      text-decoration: none;
      word-break: break-all;
    }

    .bookmark-url:hover {
      text-decoration: underline;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      flex-direction: column;
      gap: 1rem;
    }

    .error-message {
      text-align: center;
      padding: 2rem;
      color: var(--sl-color-danger-600);
    }

    .fallback-content {
      text-align: center;
      padding: 2rem;
      background: var(--sl-color-neutral-50);
      border-radius: 8px;
      margin: 2rem 0;
    }

    .fallback-content h1 {
      color: var(--sl-color-neutral-900);
      margin-bottom: 1rem;
    }

    .fallback-content p {
      color: var(--sl-color-neutral-600);
      margin-bottom: 1rem;
    }

    .fallback-content a {
      color: var(--sl-color-primary-600);
      text-decoration: none;
      font-weight: 500;
    }

    .fallback-content a:hover {
      text-decoration: underline;
    }

    .unsupported-content {
      text-align: center;
      padding: 2rem;
      background: var(--sl-color-neutral-50);
      border: 2px dashed var(--sl-color-neutral-300);
      border-radius: 8px;
      margin: 2rem 0;
    }

    .unsupported-content h2 {
      color: var(--sl-color-warning-600);
      margin-bottom: 1rem;
    }

    .unsupported-content p {
      color: var(--sl-color-neutral-600);
      margin-bottom: 0.5rem;
    }

    @media (max-width: 768px) {
      .reader-toolbar {
        padding: 0.5rem;
        flex-wrap: wrap;
      }
      
      .progress-section {
        order: 3;
        flex-basis: 100%;
        margin-top: 0.5rem;
      }
      
      .reader-content {
        padding: 0.75rem;
      }
      
      .bookmark-title {
        font-size: 1.5rem;
      }
      
      .bookmark-meta {
        font-size: 0.8rem;
      }
    }
  `;

  override async connectedCallback() {
    super.connectedCallback();
    
    // Listen for system theme changes
    ThemeService.addThemeChangeListener((theme) => {
      this.systemTheme = theme;
      this.updateReaderTheme();
    });
    
    if (this.bookmarkId) {
      await this.loadBookmark();
    }
  }

  override updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('bookmarkId') && this.bookmarkId) {
      this.loadBookmark();
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.saveProgress();
    this.cleanupObserver();
    
    // Remove theme change listener
    ThemeService.removeThemeChangeListener((theme) => {
      this.systemTheme = theme;
      this.updateReaderTheme();
    });
  }

  private async loadBookmark() {
    if (!this.bookmarkId) return;

    try {
      this.isLoading = true;
      this.hasBeenMarkedAsRead = false; // Reset for new bookmark
      this.bookmark = await DatabaseService.getBookmark(this.bookmarkId) || null;
      
      if (this.bookmark) {
        // Load saved reading progress
        const progress = await DatabaseService.getReadProgress(this.bookmarkId);
        if (progress) {
          this.readProgress = progress.progress;
          this.scrollPosition = progress.scroll_position;
          this.readingMode = progress.reading_mode;
          this.darkModeOverride = progress.dark_mode_override || null;
        } else {
          this.readingMode = this.bookmark.reading_mode || 'readability';
          this.darkModeOverride = null;
        }

        // Load available content sources
        this.availableContentSources = await ContentFetcher.getAvailableContentSources(this.bookmark);
        
        // Set default content source (prefer first asset if available, otherwise URL)
        const firstAsset = this.availableContentSources.find(source => source.type === 'asset');
        this.selectedContentSource = firstAsset || this.availableContentSources[0] || null;
        
        // Load content with preferred source
        await this.loadContent();
      }
    } catch (error) {
      console.error('Failed to load bookmark:', error);
    } finally {
      this.isLoading = false;
    }

    // Set up scroll tracking after content loads
    await this.updateComplete;
    this.setupScrollTracking();
    this.setupReadMarking();
    this.updateReaderTheme();
  }

  private async loadContent() {
    if (!this.bookmark || !this.selectedContentSource) return;

    try {
      this.isLoadingContent = true;
      
      // Content now comes only from assets through ContentFetcher

      // Fetch content using the selected source
      const result = await ContentFetcher.fetchBookmarkContent(
        this.bookmark, 
        this.selectedContentSource.type, 
        this.selectedContentSource.assetId
      );
      this.currentContent = result.content;
      this.currentReadabilityContent = result.readability_content;
      
      console.log(`Loaded content from source: ${result.source}${this.selectedContentSource.assetId ? ` (asset ${this.selectedContentSource.assetId})` : ''}`);
    } catch (error) {
      console.error('Failed to load content:', error);
      this.currentContent = this.createErrorContent();
      this.currentReadabilityContent = this.currentContent;
    } finally {
      this.isLoadingContent = false;
    }
  }

  private createErrorContent(): string {
    return `
      <div class="fallback-content">
        <h1>Content Unavailable</h1>
        <p>Failed to load content from the selected source.</p>
        <p>Try selecting a different content source or <a href="${this.bookmark?.url}" target="_blank">read online</a>.</p>
      </div>
    `;
  }

  private setupScrollTracking() {
    this.cleanupObserver();
    
    const contentElement = this.shadowRoot?.querySelector('.reader-content');
    if (!contentElement) return;

    // Restore scroll position
    if (this.scrollPosition > 0) {
      contentElement.scrollTop = this.scrollPosition;
    }

    // Set up intersection observer for progress tracking
    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.updateReadProgress();
          }
        });
      },
      {
        root: contentElement,
        rootMargin: '0px',
        threshold: 0.1
      }
    );

    // Observe content paragraphs
    const paragraphs = contentElement.querySelectorAll('p');
    paragraphs.forEach(p => this.scrollObserver?.observe(p));

    // Track scroll position
    contentElement.addEventListener('scroll', () => {
      this.scrollPosition = contentElement.scrollTop;
      this.scheduleProgressSave();
    });
  }

  private updateReadProgress() {
    const contentElement = this.shadowRoot?.querySelector('.reader-content');
    if (!contentElement) return;

    const scrollTop = contentElement.scrollTop;
    const scrollHeight = contentElement.scrollHeight;
    const clientHeight = contentElement.clientHeight;
    
    const progress = Math.min(100, Math.max(0, (scrollTop / (scrollHeight - clientHeight)) * 100));
    this.readProgress = progress;
    
    this.scheduleProgressSave();
  }

  private scheduleProgressSave() {
    if (this.progressSaveTimeout) {
      clearTimeout(this.progressSaveTimeout);
    }
    
    this.progressSaveTimeout = window.setTimeout(() => {
      this.saveProgress();
    }, 1000);
  }

  private updateReaderTheme() {
    const effectiveTheme = this.darkModeOverride || this.systemTheme;
    
    if (effectiveTheme === 'dark') {
      this.classList.add('reader-dark-mode');
    } else {
      this.classList.remove('reader-dark-mode');
    }
  }

  private handleDarkModeToggle() {
    if (this.darkModeOverride === null) {
      // No override set, set to opposite of system
      this.darkModeOverride = this.systemTheme === 'dark' ? 'light' : 'dark';
    } else if (this.darkModeOverride === this.systemTheme) {
      // Override matches system, set to opposite
      this.darkModeOverride = this.systemTheme === 'dark' ? 'light' : 'dark';
    } else {
      // Override is opposite of system, remove override
      this.darkModeOverride = null;
    }
    
    this.updateReaderTheme();
    this.saveProgress();
  }

  private async saveProgress() {
    if (!this.bookmark) return;

    const progress: ReadProgress = {
      bookmark_id: this.bookmark.id,
      progress: this.readProgress,
      last_read_at: new Date().toISOString(),
      reading_mode: this.readingMode,
      scroll_position: this.scrollPosition,
      dark_mode_override: this.darkModeOverride
    };

    try {
      await DatabaseService.saveReadProgress(progress);
      
      // Update bookmark with progress info
      this.bookmark.read_progress = this.readProgress;
      this.bookmark.reading_mode = this.readingMode;
      this.bookmark.last_read_at = progress.last_read_at;
      await DatabaseService.saveBookmark(this.bookmark);
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }

  private setupReadMarking() {
    // Mark bookmark as read after 3 seconds of viewing
    if (this.bookmark && this.bookmark.unread && !this.hasBeenMarkedAsRead) {
      this.readMarkTimeout = window.setTimeout(async () => {
        if (this.bookmark && this.bookmark.unread) {
          try {
            await DatabaseService.markBookmarkAsRead(this.bookmark.id);
            this.hasBeenMarkedAsRead = true;
            console.log(`Marked bookmark ${this.bookmark.id} as read`);
          } catch (error) {
            console.error('Failed to mark bookmark as read:', error);
          }
        }
      }, 3000); // 3 seconds
    }
  }

  private cleanupObserver() {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
    if (this.progressSaveTimeout) {
      clearTimeout(this.progressSaveTimeout);
      this.progressSaveTimeout = null;
    }
    if (this.readMarkTimeout) {
      clearTimeout(this.readMarkTimeout);
      this.readMarkTimeout = null;
    }
  }

  private handleReadingModeChange(mode: 'original' | 'readability') {
    this.readingMode = mode;
    this.saveProgress();
  }

  private async handleContentSourceChange(event: any) {
    const selectedValue = event.target.value;
    
    // Parse the value which contains both type and optional assetId
    const [type, assetIdStr] = selectedValue.split(':');
    const assetId = assetIdStr ? parseInt(assetIdStr, 10) : undefined;
    
    const newSource = this.availableContentSources.find(source => 
      source.type === type && source.assetId === assetId
    );
    
    if (newSource && newSource !== this.selectedContentSource) {
      this.selectedContentSource = newSource;
      await this.loadContent();
      
      // Reset scroll position when changing content source
      const contentElement = this.shadowRoot?.querySelector('.reader-content');
      if (contentElement) {
        contentElement.scrollTop = 0;
      }
      
      this.saveProgress();
    }
  }

  private handleOpenOriginal() {
    if (this.bookmark) {
      window.open(this.bookmark.url, '_blank');
    }
  }

  private renderContent() {
    if (!this.bookmark) return '';

    if (this.isLoadingContent) {
      return html`
        <div class="loading-container">
          <sl-spinner style="font-size: 1.5rem;"></sl-spinner>
          <p>Loading content...</p>
        </div>
      `;
    }

    const content = this.readingMode === 'original' 
      ? this.currentContent 
      : this.currentReadabilityContent;

    if (!content) {
      return html`
        <div class="fallback-content">
          <h1>${this.bookmark.title}</h1>
          <p>Content is not available for offline reading.</p>
          <p>
            <a href="${this.bookmark.url}" target="_blank">
              Read online
            </a>
          </p>
        </div>
      `;
    }

    return html`
      <div class="bookmark-header">
        <h1 class="bookmark-title">${this.bookmark.title}</h1>
        <div class="bookmark-meta">
          <a href="${this.bookmark.url}" target="_blank" class="bookmark-url">
            ${this.bookmark.url}
          </a>
          <span>•</span>
          <span>Added ${new Date(this.bookmark.date_added).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="content-container">
        ${unsafeHTML(content)}
      </div>
    `;
  }

  private getSourceValue(source: ContentSourceOption): string {
    return source.assetId ? `${source.type}:${source.assetId}` : source.type;
  }

  override render() {
    if (this.isLoading) {
      return html`
        <div class="loading-container">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
          <p>Loading article...</p>
        </div>
      `;
    }

    if (!this.bookmark) {
      return html`
        <div class="error-message">
          <h3>Bookmark not found</h3>
          <p>The requested bookmark could not be loaded.</p>
        </div>
      `;
    }

    return html`
      <div class="reader-container">
        <div class="reader-toolbar">
          <div class="toolbar-section">
            <sl-select
              class="content-source-selector"
              value=${this.selectedContentSource ? this.getSourceValue(this.selectedContentSource) : ''}
              size="small"
              @sl-change=${this.handleContentSourceChange}
            >
              ${this.availableContentSources.map(source => html`
                <sl-option value=${this.getSourceValue(source)}>
                  ${source.label}
                </sl-option>
              `)}
            </sl-select>
            
            <div class="reading-mode-toggle">
              <sl-button
                variant=${this.readingMode === 'readability' ? 'primary' : 'default'}
                size="small"
                @click=${() => this.handleReadingModeChange('readability')}
              >
                Reader
              </sl-button>
              <sl-button
                variant=${this.readingMode === 'original' ? 'primary' : 'default'}
                size="small"
                @click=${() => this.handleReadingModeChange('original')}
              >
                Original
              </sl-button>
            </div>
            
            <sl-dropdown>
              <sl-button slot="trigger" variant="text" size="small" caret>
                <sl-icon name=${this.darkModeOverride === 'dark' || (this.darkModeOverride === null && this.systemTheme === 'dark') ? 'moon-fill' : 'sun-fill'}></sl-icon>
              </sl-button>
              <sl-menu>
                <sl-menu-item 
                  @click=${this.handleDarkModeToggle}
                  ?checked=${this.darkModeOverride !== null}
                >
                  <sl-icon slot="prefix" name=${this.darkModeOverride === 'dark' ? 'moon-fill' : this.darkModeOverride === 'light' ? 'sun-fill' : 'circle-half'}></sl-icon>
                  ${this.darkModeOverride === null ? 'Follow System' : this.darkModeOverride === 'dark' ? 'Dark Mode' : 'Light Mode'}
                </sl-menu-item>
              </sl-menu>
            </sl-dropdown>
          </div>
          
          <div class="progress-section">
            <span class="progress-text">
              ${Math.round(this.readProgress)}% read
            </span>
            <sl-progress-bar 
              value=${this.readProgress}
              style="flex: 1;"
            ></sl-progress-bar>
          </div>
          
          <sl-button
            variant="text"
            size="small"
            @click=${this.handleOpenOriginal}
          >
            <sl-icon name="box-arrow-up-right"></sl-icon>
          </sl-button>
        </div>
        
        <div class="reader-content">
          ${this.renderContent()}
        </div>
      </div>
    `;
  }
}