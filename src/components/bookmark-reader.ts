import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { ContentFetcher } from '../services/content-fetcher';
import { ThemeService } from '../services/theme-service';
import type { LocalBookmark, ReadProgress, ContentSourceOption } from '../types';
import './secure-iframe';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';

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

  private progressSaveTimeout: number | null = null;
  private readMarkTimeout: number | null = null;
  private hasBeenMarkedAsRead = false;
  private secureIframe: any = null;

  static override styles = css`
    :host {
      display: block;
      height: 100vh;
      max-height: 100vh;
    }

    .reader-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-height: 100vh;
    }

    .reader-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background: var(--md-sys-color-surface-container);
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      gap: 0.5rem;
      min-height: 3rem; /* 48px - reduced from 3.5rem */
    }

    .reading-mode-toggle {
      display: flex;
      gap: 0.5rem;
    }

    .content-source-selector {
      min-width: 120px;
      max-width: 200px;
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
      font-size: 0.875rem; /* 14px - Material Design body-medium */
      line-height: 1.25rem; /* 20px */
      letter-spacing: 0.015625rem; /* 0.25px */
      color: var(--md-sys-color-on-surface-variant);
      white-space: nowrap;
      font-weight: 500;
    }

    .reader-content {
      flex: 1;
      min-height: 0;
      position: relative;
      overflow-y: auto;
    }

    .secure-iframe {
      height: 100%;
      width: 100%;
    }

    .content-container {
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.6;
    }

    /* Dark mode overrides for reader content using Material Design tokens */
    :host(.reader-dark-mode) .reader-content {
      background: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface);
    }

    :host(.reader-dark-mode) .content-container {
      color: var(--md-sys-color-on-surface);
    }

    :host(.reader-dark-mode) .content-container h1,
    :host(.reader-dark-mode) .content-container h2,
    :host(.reader-dark-mode) .content-container h3,
    :host(.reader-dark-mode) .content-container h4,
    :host(.reader-dark-mode) .content-container h5,
    :host(.reader-dark-mode) .content-container h6 {
      color: var(--md-sys-color-on-surface);
    }

    :host(.reader-dark-mode) .content-container p {
      color: var(--md-sys-color-on-surface-variant);
    }

    :host(.reader-dark-mode) .content-container a {
      color: var(--md-sys-color-primary);
    }

    :host(.reader-dark-mode) .content-container blockquote {
      background: var(--md-sys-color-surface-container);
      border-left-color: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-surface-variant);
    }

    :host(.reader-dark-mode) .content-container pre {
      background: var(--md-sys-color-surface-container);
      color: var(--md-sys-color-on-surface);
    }

    :host(.reader-dark-mode) .content-container code {
      background: var(--md-sys-color-surface-container);
      color: var(--md-sys-color-on-surface);
    }

    :host(.reader-dark-mode) .bookmark-header {
      border-bottom-color: var(--md-sys-color-outline-variant);
    }

    :host(.reader-dark-mode) .bookmark-title {
      color: var(--md-sys-color-on-surface);
    }

    :host(.reader-dark-mode) .bookmark-meta {
      color: var(--md-sys-color-on-surface-variant);
    }

    :host(.reader-dark-mode) .bookmark-url {
      color: var(--md-sys-color-primary);
    }

    .content-container h1,
    .content-container h2,
    .content-container h3,
    .content-container h4,
    .content-container h5,
    .content-container h6 {
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: var(--md-sys-color-on-surface);
    }

    .content-container p {
      margin-bottom: 1rem;
      color: var(--md-sys-color-on-surface-variant);
    }

    .content-container img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 1rem 0;
    }

    .content-container a {
      color: var(--md-sys-color-primary);
      text-decoration: none;
    }

    .content-container a:hover {
      text-decoration: underline;
    }

    .content-container blockquote {
      margin: 1rem 0;
      padding: 1rem;
      background: var(--md-sys-color-surface-container);
      border-left: 4px solid var(--md-sys-color-primary);
      border-radius: 4px;
    }

    .content-container pre {
      background: var(--md-sys-color-surface-container-high);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.875rem;
    }

    .content-container code {
      background: var(--md-sys-color-surface-container-high);
      padding: 0.125rem 0.25rem;
      border-radius: 2px;
      font-size: 0.875rem;
    }

    .bookmark-header {
      margin-bottom: 2rem;
      padding: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }

    .bookmark-title {
      color: var(--md-sys-color-on-surface);
      margin: 0 0 0.5rem 0;
      font-size: 1.75rem; /* 28px - Material Design headline-small */
      font-weight: 400;
      line-height: 2.25rem; /* 36px */
      letter-spacing: 0;
    }

    .bookmark-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.875rem; /* 14px - Material Design body-medium */
      line-height: 1.25rem; /* 20px */
      letter-spacing: 0.015625rem; /* 0.25px */
      color: var(--md-sys-color-on-surface-variant);
    }

    .bookmark-url {
      color: var(--md-sys-color-primary);
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
      color: var(--md-sys-color-error);
    }

    .fallback-content {
      text-align: center;
      padding: 2rem;
      background: var(--md-sys-color-surface-container);
      border-radius: 8px;
      margin: 2rem 0;
    }

    .fallback-content h1 {
      color: var(--md-sys-color-on-surface);
      margin-bottom: 1rem;
    }

    .fallback-content p {
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 1rem;
    }

    .fallback-content a {
      color: var(--md-sys-color-primary);
      text-decoration: none;
      font-weight: 500;
    }

    .fallback-content a:hover {
      text-decoration: underline;
    }

    .unsupported-content {
      text-align: center;
      padding: 2rem;
      background: var(--md-sys-color-surface-container);
      border: 2px dashed var(--md-sys-color-outline-variant);
      border-radius: 8px;
      margin: 2rem 0;
    }

    .unsupported-content h2 {
      color: var(--md-sys-color-secondary);
      margin-bottom: 1rem;
    }

    .unsupported-content p {
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 0.5rem;
    }

    @media (max-width: 48rem) { /* 768px breakpoint */
      .reader-toolbar {
        padding: 0.25rem 0.5rem;
        flex-wrap: nowrap;
        min-height: 2.75rem; /* 44px - reduced from 3rem */
        gap: 0.25rem;
      }
      
      .content-source-selector {
        min-width: 80px;
        max-width: 140px;
      }
      
      .progress-section {
        /* Remove wrapping - keep inline */
        /* order: 3; */
        /* flex-basis: 100%; */
        /* margin-top: 0.5rem; */
        flex: 1;
        min-width: 0;
      }
      
      .toolbar-section {
        gap: 0.25rem;
      }
      
      .reading-mode-toggle {
        gap: 0.125rem;
      }
      
      .bookmark-header {
        padding: 0.75rem;
        margin-bottom: 1.5rem;
      }
      
      .bookmark-title {
        font-size: 1.5rem; /* 24px - smaller on mobile */
        line-height: 2rem; /* 32px */
        margin-bottom: 0.375rem;
      }
      
      .bookmark-meta {
        font-size: 0.75rem; /* 12px - smaller on mobile */
        line-height: 1rem; /* 16px */
        gap: 0.75rem;
      }
    }

    /* Utility classes */
    .circular-progress-24 {
      width: 24px;
      height: 24px;
    }

    .circular-progress-48 {
      width: 48px;
      height: 48px;
    }

    .flex-1 {
      flex: 1;
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
    
    // Get reference to secure iframe after render
    if (!this.secureIframe) {
      this.secureIframe = this.shadowRoot?.querySelector('secure-iframe');
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.saveProgress();
    this.cleanupTimeouts();
    
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
      
      // Reset progress state to prevent carryover from previous bookmarks
      this.readProgress = 0;
      this.scrollPosition = 0;
      this.bookmark = await DatabaseService.getBookmark(this.bookmarkId) || null;
      
      if (this.bookmark) {
        // Load saved reading progress
        const progress = await DatabaseService.getReadProgress(this.bookmarkId);
        if (progress) {
          // Always restore saved position (remove reset logic for now)
          this.readProgress = progress.progress;
          this.scrollPosition = progress.scroll_position;
          this.readingMode = progress.reading_mode;
          this.darkModeOverride = progress.dark_mode_override || null;
        } else {
          // Reset to defaults for new bookmarks with no saved progress
          this.readProgress = 0;
          this.scrollPosition = 0;
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

    // Set up read marking and theme after content loads
    await this.updateComplete;
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

  private handleIframeProgressUpdate(event: CustomEvent) {
    const { progress, scrollPosition } = event.detail;
    
    this.readProgress = progress;
    this.scrollPosition = scrollPosition;
    
    this.scheduleProgressSave();
  }

  private handleIframeContentLoaded(_event: CustomEvent) {
    // Content loaded in iframe, no additional action needed
    console.log('Iframe content loaded successfully');
  }

  private handleIframeContentError(event: CustomEvent) {
    const { error } = event.detail;
    console.error('Iframe content error:', error);
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

  private cleanupTimeouts() {
    if (this.progressSaveTimeout) {
      clearTimeout(this.progressSaveTimeout);
      this.progressSaveTimeout = null;
    }
    if (this.readMarkTimeout) {
      clearTimeout(this.readMarkTimeout);
      this.readMarkTimeout = null;
    }
  }

  // Debug method removed to protect user data

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
      this.scrollPosition = 0;
      
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
          <md-circular-progress indeterminate class="circular-progress-24"></md-circular-progress>
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
        <h1 class="bookmark-title md-typescale-headline-medium">${this.bookmark.title}</h1>
        <div class="bookmark-meta">
          <a href="${this.bookmark.url}" target="_blank" class="bookmark-url">
            ${this.bookmark.url}
          </a>
          <span>•</span>
          <span>Added ${new Date(this.bookmark.date_added).toLocaleDateString()}</span>
        </div>
      </div>
      <secure-iframe
        class="secure-iframe"
        .content=${content}
        .scrollPosition=${this.scrollPosition}
        @progress-update=${this.handleIframeProgressUpdate}
        @content-loaded=${this.handleIframeContentLoaded}
        @content-error=${this.handleIframeContentError}
      ></secure-iframe>
    `;
  }

  private getSourceValue(source: ContentSourceOption): string {
    return source.assetId ? `${source.type}:${source.assetId}` : source.type;
  }

  override render() {
    if (this.isLoading) {
      return html`
        <div class="loading-container">
          <md-circular-progress indeterminate class="circular-progress-48"></md-circular-progress>
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
            <md-outlined-select
              class="content-source-selector"
              .value=${this.selectedContentSource ? this.getSourceValue(this.selectedContentSource) : ''}
              @change=${this.handleContentSourceChange}
            >
              ${this.availableContentSources.map(source => html`
                <md-select-option value=${this.getSourceValue(source)}>
                  ${source.label}
                </md-select-option>
              `)}
            </md-outlined-select>
            
            <div class="reading-mode-toggle">
              ${this.readingMode === 'readability' ? html`
                <md-filled-button
                  @click=${() => this.handleReadingModeChange('readability')}
                >
                  Reader
                </md-filled-button>
              ` : html`
                <md-text-button
                  @click=${() => this.handleReadingModeChange('readability')}
                >
                  Reader
                </md-text-button>
              `}
              ${this.readingMode === 'original' ? html`
                <md-filled-button
                  @click=${() => this.handleReadingModeChange('original')}
                >
                  Original
                </md-filled-button>
              ` : html`
                <md-text-button
                  @click=${() => this.handleReadingModeChange('original')}
                >
                  Original
                </md-text-button>
              `}
            </div>
            
            <md-text-button
              @click=${this.handleDarkModeToggle}
              title=${this.darkModeOverride === null ? 'Follow System' : this.darkModeOverride === 'dark' ? 'Dark Mode' : 'Light Mode'}
            >
              <md-icon slot="icon">${this.darkModeOverride === 'dark' || (this.darkModeOverride === null && this.systemTheme === 'dark') ? 'dark_mode' : 'light_mode'}</md-icon>
            </md-text-button>
          </div>
          
          <div class="progress-section">
            <span class="progress-text">
              ${Math.round(this.readProgress)}% read
            </span>
            <md-linear-progress 
              .value=${this.readProgress / 100}
              class="flex-1"
            ></md-linear-progress>
          </div>
          
          <md-text-button
            @click=${this.handleOpenOriginal}
            title="Open original"
          >
            <md-icon slot="icon">open_in_new</md-icon>
          </md-text-button>
        </div>
        
        <div class="reader-content">
          ${this.renderContent()}
        </div>
      </div>
    `;
  }
}