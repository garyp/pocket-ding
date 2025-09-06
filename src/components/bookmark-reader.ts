import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ReactiveQueryController } from '../controllers/reactive-query-controller';
import { DatabaseService } from '../services/database';
import { ContentFetcher } from '../services/content-fetcher';
import { ThemeService } from '../services/theme-service';
import type { LocalBookmark, ReadProgress, ContentSourceOption, ContentError, ContentResult } from '../types';
import './secure-iframe';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/iconbutton/filled-icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import '@material/web/dialog/dialog.js';

@customElement('bookmark-reader')
export class BookmarkReader extends LitElement {
  @property({ type: Number }) bookmarkId!: number;

  // Reactive query for bookmark data  
  #bookmarkQuery = new ReactiveQueryController(
    this,
    (bookmarkId: number) => DatabaseService.getBookmark(bookmarkId),
    (): [number] => [this.bookmarkId]
  );

  // Reactive query for read progress
  #readProgressQuery = new ReactiveQueryController(
    this,
    (bookmarkId: number) => DatabaseService.getReadProgress(bookmarkId),
    (): [number] => [this.bookmarkId]
  );

  // Reactive query for available content sources (assets)
  #assetsQuery = new ReactiveQueryController(
    this,
    (bookmarkId: number) => DatabaseService.getCompletedAssetsByBookmarkId(bookmarkId),
    (): [number] => [this.bookmarkId]
  );

  // Getter methods for reactive data
  get bookmark(): LocalBookmark | undefined {
    return this.#bookmarkQuery.value;
  }

  get readProgressData(): ReadProgress | undefined {
    return this.#readProgressQuery.value;
  }

  get assets(): any[] {
    return this.#assetsQuery.value || [];
  }

  get isDataLoading(): boolean {
    return this.#bookmarkQuery.loading || this.#readProgressQuery.loading || this.#assetsQuery.loading;
  }

  #initialized = false;


  @state() private readingMode: 'original' | 'readability' = 'readability';
  @state() private readProgress = 0;
  @state() private scrollPosition = 0;
  @state() private selectedContentSource: ContentSourceOption | null = null;
  @state() private availableContentSources: ContentSourceOption[] = [];
  @state() private isLoadingContent = false;
  @state() private contentResult: ContentResult | null = null;
  @state() private contentSourceType: 'saved' | 'live' = 'saved';
  @state() private darkModeOverride: 'light' | 'dark' | null = null;
  @state() private systemTheme: 'light' | 'dark' = 'light';
  @state() private showInfoModal = false;
  @state() private iframeLoadError = false;

  private progressSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private readMarkTimeout: ReturnType<typeof setTimeout> | null = null;
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
      min-width: 80px;
      max-width: 120px;
    }

    .processing-mode-toggle {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .processing-mode-button {
      --md-icon-button-icon-size: 20px;
    }

    .toolbar-section md-icon-button {
      --md-icon-button-icon-size: 20px;
    }

    .toolbar-section {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
    }

    .progress-section {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
    }

    .progress-text {
      font-size: 0.875rem; /* 14px - Material Design body-medium */
      line-height: 1.25rem; /* 20px */
      letter-spacing: 0.015625rem; /* 0.25px */
      color: var(--md-sys-color-on-surface-variant);
      white-space: nowrap;
      font-weight: 500;
      flex-shrink: 0;
    }

    .reader-content {
      flex: 1;
      min-height: 0;
      position: relative;
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
        gap: 0.375rem; /* Increased from 0.25rem for better spacing */
      }
      
      .content-source-selector {
        min-width: 70px; /* Slightly increased from 60px */
        max-width: 90px; /* Increased from 80px to prevent text cutoff */
        flex-shrink: 0; /* Prevent shrinking that could cause overlap */
      }
      
      .processing-mode-toggle {
        gap: 0.25rem; /* Increased from 0.125rem */
        flex-shrink: 0; /* Prevent shrinking */
      }
      
      .toolbar-section md-icon-button {
        --md-icon-button-icon-size: 18px;
        flex-shrink: 0; /* Prevent icon buttons from shrinking */
      }
      
      .processing-mode-button {
        --md-icon-button-icon-size: 18px;
        flex-shrink: 0; /* Prevent shrinking */
      }
      
      .progress-section {
        flex: 1 1 0;
        min-width: 0;
        overflow: hidden;
        /* Add margin to create separation from adjacent elements */
        margin-left: 0.25rem;
        margin-right: 0.25rem;
      }
      
      .toolbar-section {
        gap: 0.375rem; /* Increased from 0.25rem */
        flex-shrink: 0; /* Prevent toolbar sections from shrinking */
      }
      
      .reading-mode-toggle {
        gap: 0.25rem; /* Increased from 0.125rem */
      }
    }

    /* Info Modal styles */
    .info-modal-body {
      padding: 1.5rem;
    }

    .info-field {
      margin-bottom: 1.5rem;
    }

    .info-field:last-child {
      margin-bottom: 0;
    }

    .info-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .info-value {
      font-size: 1rem;
      color: var(--md-sys-color-on-surface);
      line-height: 1.5;
      word-break: break-all;
    }

    .info-url {
      color: var(--md-sys-color-primary);
      text-decoration: none;
    }

    .info-url:hover {
      text-decoration: underline;
    }

    /* Error content styles */
    .error-content {
      padding: 2rem;
      max-width: 600px;
      margin: 0 auto;
      text-align: center;
    }

    .error-header h2 {
      margin-bottom: 1rem;
    }

    .error-title {
      color: var(--md-sys-color-error);
    }

    .warning-title {
      color: var(--md-sys-color-tertiary);
    }

    .bookmark-title {
      margin-bottom: 1rem;
      color: var(--md-sys-color-on-surface);
      font-size: 1rem;
    }

    .error-message {
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 1rem;
      line-height: 1.5;
    }

    .error-details {
      text-align: left;
      margin: 1.5rem 0;
      padding: 1rem;
      background: var(--md-sys-color-surface-container);
      border-radius: 8px;
    }

    .error-details summary {
      cursor: pointer;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
      margin-bottom: 0.5rem;
    }

    .details-content {
      margin-top: 0.5rem;
    }

    .details-content p {
      color: var(--md-sys-color-on-surface-variant);
      margin: 0.5rem 0;
      line-height: 1.5;
    }

    .error-suggestions {
      text-align: left;
      margin: 1.5rem 0;
    }

    .error-suggestions h4 {
      color: var(--md-sys-color-on-surface);
      margin: 0 0 0.5rem 0;
    }

    .error-suggestions ul {
      color: var(--md-sys-color-on-surface-variant);
      margin: 0.5rem 0;
    }

    .error-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 1.5rem;
    }

    .primary-button, .secondary-button {
      padding: 0.75rem 1.5rem;
      border-radius: 24px;
      text-decoration: none;
      font-weight: 500;
      transition: background-color 0.2s ease;
    }

    .primary-button {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
    }

    .primary-button:hover {
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
    }

    .secondary-button {
      background: var(--md-sys-color-secondary-container);
      color: var(--md-sys-color-on-secondary-container);
    }

    .secondary-button:hover {
      background: var(--md-sys-color-secondary);
      color: var(--md-sys-color-on-secondary);
    }

    /* Live iframe styles */
    .live-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
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
  }

  override willUpdate(changedProperties: Map<string, any>) {
    // Reset initialization when bookmark ID changes
    if (changedProperties.has('bookmarkId') && this.#initialized) {
      this.#initialized = false;
    }
  }

  override updated(changedProperties: Map<string, any>) {
    // Get reference to secure iframe after render
    if (!this.secureIframe) {
      this.secureIframe = this.shadowRoot?.querySelector('secure-iframe');
    }
    
    // Ensure select value is set after rendering
    if (changedProperties.has('availableContentSources') || 
        changedProperties.has('selectedContentSource') || 
        changedProperties.has('contentSourceType')) {
      this.updateSelectValue();
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

  // loadBookmark method removed - replaced by reactive queries

  private async loadContent() {
    if (!this.bookmark || !this.selectedContentSource) return;

    try {
      this.isLoadingContent = true;
      
      // Fetch content using the selected source
      const result = await ContentFetcher.fetchBookmarkContent(
        this.bookmark, 
        this.selectedContentSource.type, 
        this.selectedContentSource.assetId
      );
      
      // Store the content result for template rendering
      this.contentResult = result;
      
      // Switch to original mode if readability is not available but user is in readability mode
      if (!result.readability_content && this.readingMode === 'readability') {
        this.readingMode = 'original';
      }
      
      console.log(`Loaded content from source: ${result.source}${this.selectedContentSource.assetId ? ` (asset ${this.selectedContentSource.assetId})` : ''}`);
    } catch (error) {
      console.error('Failed to load content:', error);
      // Create a generic error result for template rendering
      this.contentResult = {
        source: 'asset',
        content_type: 'error',
        error: {
          type: 'server_error',
          message: 'Failed to load content from the selected source.',
          suggestions: ['Try selecting a different content source', 'Read online']
        }
      };
      // Switch to original mode if readability is not available but user is in readability mode
      if (!this.contentResult?.readability_content && this.readingMode === 'readability') {
        this.readingMode = 'original';
      }
    } finally {
      this.isLoadingContent = false;
    }
  }



  private getErrorTitle(type: ContentError['type']): string {
    switch (type) {
      case 'cors': return 'CORS Restriction';
      case 'network': return 'Network Error';
      case 'not_found': return 'Content Not Available';
      case 'unsupported': return 'Unsupported Content';
      case 'server_error': return 'Server Error';
      default: return 'Error';
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }


  private handleIframeProgressUpdate = (event: CustomEvent) => {
    const { progress, scrollPosition } = event.detail;
    
    this.readProgress = progress;
    this.scrollPosition = scrollPosition;
    
    this.scheduleProgressSave();
  }

  private handleIframeContentLoaded = (_event: CustomEvent) => {
    // Content loaded in iframe, no additional action needed
    console.log('Iframe content loaded successfully');
  }

  private handleIframeContentError = (event: CustomEvent) => {
    const { error } = event.detail;
    console.error('Iframe content error:', error);
  }

  private handleIframeLoad = (_event: Event) => {
    console.log('Live URL iframe loaded successfully');
    this.iframeLoadError = false;
    // Note: We cannot detect HTTP errors within cross-origin iframes due to security restrictions
  }

  private handleIframeError = (_event: Event) => {
    console.error('Live URL iframe failed to load');
    this.iframeLoadError = true;
    // Note: This event is limited and may not capture all loading failures for cross-origin content
  }


  private scheduleProgressSave() {
    if (this.progressSaveTimeout) {
      clearTimeout(this.progressSaveTimeout);
    }
    
    this.progressSaveTimeout = setTimeout(() => {
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

  private getEffectiveTheme(): 'light' | 'dark' {
    return this.darkModeOverride || this.systemTheme;
  }

  /**
   * Injects theme styles into readability content
   */
  private injectThemeStyles(content: string, theme: 'light' | 'dark'): string {
    const themeStyles = this.getThemeStyles(theme);
    const styleTag = `<style data-theme-injected="${theme}">${themeStyles}</style>`;
    
    // Insert the style tag at the beginning of the content
    return styleTag + content;
  }

  /**
   * Gets theme-specific CSS styles
   */
  private getThemeStyles(theme: 'light' | 'dark'): string {
    if (theme === 'dark') {
      return `
        /* Dark theme styles for readability content */
        body {
          background: #121212 !important;
          color: #e0e0e0 !important;
        }
        
        h1, h2, h3, h4, h5, h6 {
          color: #ffffff !important;
        }
        
        p, div, span {
          color: #e0e0e0 !important;
        }
        
        a {
          color: #90caf9 !important;
        }
        
        a:visited {
          color: #ce93d8 !important;
        }
        
        blockquote {
          background: #1e1e1e !important;
          border-left-color: #90caf9 !important;
          color: #b0b0b0 !important;
        }
        
        pre, code {
          background: #1e1e1e !important;
          color: #ffffff !important;
          border: 1px solid #333333 !important;
        }
        
        table {
          background: #1e1e1e !important;
          color: #e0e0e0 !important;
        }
        
        th, td {
          border-color: #333333 !important;
          color: #e0e0e0 !important;
        }
        
        th {
          background: #333333 !important;
          color: #ffffff !important;
        }
        
        /* Override any inline styles that might interfere */
        * {
          background-color: inherit !important;
        }
        
        /* Ensure readability content styling */
        article, main, .content, .post-content, .entry-content {
          background: #121212 !important;
          color: #e0e0e0 !important;
        }
      `;
    } else {
      // Light theme - minimal overrides to ensure good contrast
      return `
        /* Light theme styles for readability content */
        body {
          background: #ffffff !important;
          color: #1d1d1d !important;
        }
        
        h1, h2, h3, h4, h5, h6 {
          color: #1d1d1d !important;
        }
        
        p, div, span {
          color: #1d1d1d !important;
        }
        
        a {
          color: #1976d2 !important;
        }
        
        a:visited {
          color: #7b1fa2 !important;
        }
        
        blockquote {
          background: #f5f5f5 !important;
          border-left-color: #1976d2 !important;
          color: #424242 !important;
        }
        
        pre, code {
          background: #f5f5f5 !important;
          color: #1d1d1d !important;
          border: 1px solid #e0e0e0 !important;
        }
        
        table {
          background: #ffffff !important;
          color: #1d1d1d !important;
        }
        
        th, td {
          border-color: #e0e0e0 !important;
          color: #1d1d1d !important;
        }
        
        th {
          background: #f5f5f5 !important;
          color: #1d1d1d !important;
        }
        
        /* Ensure readability content styling */
        article, main, .content, .post-content, .entry-content {
          background: #ffffff !important;
          color: #1d1d1d !important;
        }
      `;
    }
  }

  private handleDarkModeToggle = () => {
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
      
      // Update bookmark with progress info - reactive queries will update UI automatically
      const bookmarkUpdate = { ...this.bookmark };
      bookmarkUpdate.read_progress = this.readProgress;
      bookmarkUpdate.reading_mode = this.readingMode;
      bookmarkUpdate.last_read_at = progress.last_read_at;
      await DatabaseService.saveBookmark(bookmarkUpdate);
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }

  private setupReadMarking() {
    // Mark bookmark as read after 3 seconds of viewing
    if (this.bookmark && this.bookmark.unread && !this.hasBeenMarkedAsRead) {
      this.readMarkTimeout = setTimeout(async () => {
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



  /**
   * Initialize component data when all reactive queries are loaded
   */
  async #initializeComponent() {
    if (!this.bookmark) return;
    try {
      // Update local state from reactive read progress data
      const progressData = this.readProgressData;
      if (progressData) {
        this.readProgress = progressData.progress;
        this.scrollPosition = progressData.scroll_position;
        this.readingMode = progressData.reading_mode;
        this.darkModeOverride = progressData.dark_mode_override || null;
      } else {
        // Reset to defaults for new bookmarks with no saved progress
        this.readProgress = 0;
        this.scrollPosition = 0;
        this.readingMode = this.bookmark.reading_mode || 'readability';
        this.darkModeOverride = null;
      }

      // Load available content sources from reactive assets query
      await this.#loadAvailableContentSources();
      
      // Load content
      await this.loadContent();

      // Set up read marking and theme
      this.setupReadMarking();
      this.updateReaderTheme();
      
      // Ensure theme is applied after component update
      this.requestUpdate();
    } catch (error) {
      console.error('Failed to initialize component:', error);
    }
  }

  /**
   * Load available content sources from reactive assets data
   */
  async #loadAvailableContentSources() {
    if (!this.bookmark) return;
    
    this.availableContentSources = await ContentFetcher.getAvailableContentSources(this.bookmark);
    
    // Determine content source type (prefer saved artifacts if available)
    const assetSources = this.availableContentSources.filter(source => source.type === 'asset');
    this.contentSourceType = assetSources.length > 0 ? 'saved' : 'live';
    
    // Set default content source - prefer first asset or URL
    if (assetSources.length > 0) {
      this.selectedContentSource = assetSources[0] || null;
    } else {
      this.selectedContentSource = this.availableContentSources.find(source => source.type === 'url') || null;
    }
    
    // Trigger re-render and then update select value
    this.requestUpdate();
    await this.updateComplete;
    this.updateSelectValue();
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

  // Remove the old handleReadingModeChange method since we now use handleProcessingModeToggle

  private handleContentSourceChange = async (event: any) => {
    const selectedValue = event.target.value;
    
    // Check if it's a general type selection (saved/live) or specific source selection
    if (selectedValue === 'saved' || selectedValue === 'live') {
      // Handle type-based selection (for single asset case)
      const selectedType = selectedValue as 'saved' | 'live';
      if (selectedType !== this.contentSourceType) {
        this.contentSourceType = selectedType;
        
        // Select appropriate content source based on type
        if (selectedType === 'saved') {
          this.selectedContentSource = this.availableContentSources.find(source => source.type === 'asset') || null;
        } else {
          this.selectedContentSource = this.availableContentSources.find(source => source.type === 'url') || null;
        }
        
        if (this.selectedContentSource) {
          await this.loadContent();
          this.scrollPosition = 0;
          this.saveProgress();
        }
      }
    } else {
      // Handle specific source selection (for multiple assets)
      const sourceKey = selectedValue;
      let newSource: ContentSourceOption | null = null;
      
      if (sourceKey === 'live') {
        newSource = this.availableContentSources.find(source => source.type === 'url') || null;
        this.contentSourceType = 'live';
      } else {
        // Parse asset ID from value like "asset-123"
        const assetId = parseInt(sourceKey.replace('asset-', ''));
        newSource = this.availableContentSources.find(source => 
          source.type === 'asset' && source.assetId === assetId
        ) || null;
        this.contentSourceType = 'saved';
      }
      
      if (newSource && newSource !== this.selectedContentSource) {
        this.selectedContentSource = newSource;
        await this.loadContent();
        this.scrollPosition = 0;
        this.saveProgress();
      }
    }
  }

  private handleProcessingModeToggle = () => {
    this.readingMode = this.readingMode === 'readability' ? 'original' : 'readability';
    this.saveProgress();
  }

  private handleOpenOriginal = () => {
    if (this.bookmark) {
      window.open(this.bookmark.url, '_blank');
    }
  }

  private handleInfoClick = () => {
    this.showInfoModal = true;
  }

  private handleInfoModalClose = () => {
    this.showInfoModal = false;
  }

  private renderInfoModal() {
    return html`
      <!-- Info Modal -->
      <md-dialog 
        ?open=${this.showInfoModal}
        @close=${this.handleInfoModalClose}
      >
        <div slot="headline">Bookmark Information</div>
        <div slot="content">
          <div class="info-modal-body">
            ${this.bookmark ? html`
              <div class="info-field">
                <span class="info-label">Title</span>
                <div class="info-value">${this.bookmark.title}</div>
              </div>
              <div class="info-field">
                <span class="info-label">URL</span>
                <div class="info-value">
                  <a href="${this.bookmark.url}" target="_blank" class="info-url">
                    ${this.bookmark.url}
                  </a>
                </div>
              </div>
              <div class="info-field">
                <span class="info-label">Date Added</span>
                <div class="info-value">
                  ${new Date(this.bookmark.date_added).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric'
                  })}
                </div>
              </div>
              ${this.bookmark.description ? html`
                <div class="info-field">
                  <span class="info-label">Description</span>
                  <div class="info-value">${this.bookmark.description}</div>
                </div>
              ` : ''}
              ${this.bookmark.tag_names && this.bookmark.tag_names.length > 0 ? html`
                <div class="info-field">
                  <span class="info-label">Tags</span>
                  <div class="info-value">${this.bookmark.tag_names.join(', ')}</div>
                </div>
              ` : ''}
            ` : html`
              <div class="loading-container">
                <md-circular-progress indeterminate class="circular-progress-24"></md-circular-progress>
                <p>Loading bookmark information...</p>
              </div>
            `}
          </div>
        </div>
        <div slot="actions">
          <md-text-button @click=${this.handleInfoModalClose}>
            Close
          </md-text-button>
        </div>
      </md-dialog>
    `;
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

    // Handle error and unsupported content with Lit templates
    if (this.contentResult?.content_type === 'error') {
      return this.renderErrorContent(this.contentResult.error!, this.bookmark);
    }
    
    if (this.contentResult?.content_type === 'unsupported') {
      return this.renderUnsupportedContent(this.contentResult.error!, this.contentResult.metadata!, this.bookmark);
    }

    // Handle iframe content directly to avoid nested iframes
    if (this.contentResult?.content_type === 'iframe') {
      return this.renderIframeContent(this.contentResult.iframe_url!);
    }

    // Handle HTML content based on reading mode
    if (this.contentResult?.content_type === 'html') {
      const content = this.readingMode === 'original' 
        ? this.contentResult.html_content
        : this.contentResult.readability_content;

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
        <secure-iframe
          class="secure-iframe"
          .content=${this.readingMode === 'readability' ? 
            this.injectThemeStyles(content, this.getEffectiveTheme()) : 
            content}
          .scrollPosition=${this.scrollPosition}
          @progress-update=${this.handleIframeProgressUpdate}
          @content-loaded=${this.handleIframeContentLoaded}
          @content-error=${this.handleIframeContentError}
        ></secure-iframe>
      `;
    }

    // Fallback for any other cases
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

  private renderIframeContent(url: string) {
    if (this.iframeLoadError) {
      return this.renderErrorContent({
        type: 'network',
        message: 'Failed to load live content. This may be due to network issues or the website blocking embedded access.',
        details: 'Some websites prevent their content from being displayed in iframes for security reasons.',
        suggestions: [
          'Check your internet connection',
          'Try refreshing the page',
          'Open the original website directly'
        ]
      }, this.bookmark!);
    }

    return html`
      <iframe 
        src="${url}" 
        class="live-iframe"
        sandbox="allow-scripts allow-same-origin"
        referrerpolicy="no-referrer-when-downgrade"
        @load=${this.handleIframeLoad}
        @error=${this.handleIframeError}
        style="width: 100%; height: 100%; border: none; background: white;">
      </iframe>
    `;
  }

  private renderErrorContent(error: ContentError, bookmark: LocalBookmark) {
    return html`
      <div class="error-content">
        <div class="error-header">
          <h2 class="error-title">${this.getErrorTitle(error.type)}</h2>
          <p class="bookmark-title"><strong>${bookmark.title}</strong></p>
          <p class="error-message">${error.message}</p>
        </div>
        
        ${error.details ? html`
          <details class="error-details">
            <summary>Technical Details</summary>
            <div class="details-content">
              <p>${error.details}</p>
            </div>
          </details>
        ` : ''}
        
        ${error.suggestions ? html`
          <div class="error-suggestions">
            <h4>Suggested Solutions:</h4>
            <ul>
              ${error.suggestions.map(suggestion => html`<li>${suggestion}</li>`)}
            </ul>
          </div>
        ` : ''}
        
        <div class="error-actions">
          <a href="${bookmark.url}" target="_blank" rel="noopener noreferrer" class="primary-button">
            Open Original Website
          </a>
        </div>
      </div>
    `;
  }

  private renderUnsupportedContent(error: ContentError, metadata: any, bookmark: LocalBookmark) {
    return html`
      <div class="unsupported-content">
        <div class="unsupported-header">
          <h2 class="unsupported-title">Content Type Not Supported</h2>
          <p class="bookmark-title"><strong>${bookmark.title}</strong></p>
          <p class="unsupported-message">${error.message}</p>
        </div>
        
        ${metadata ? html`
          <div class="content-metadata">
            <h4>Content Information:</h4>
            <ul class="metadata-list">
              ${metadata.content_type ? html`<li><strong>Type:</strong> ${metadata.content_type}</li>` : ''}
              ${metadata.file_size ? html`<li><strong>Size:</strong> ${this.formatFileSize(metadata.file_size)}</li>` : ''}
              ${metadata.display_name ? html`<li><strong>File:</strong> ${metadata.display_name}</li>` : ''}
            </ul>
          </div>
        ` : ''}
        
        ${error.details ? html`
          <div class="error-details-small">
            <p>${error.details}</p>
          </div>
        ` : ''}
        
        ${error.suggestions ? html`
          <div class="error-suggestions">
            <h4>What you can do:</h4>
            <ul>
              ${error.suggestions.map(suggestion => html`<li>${suggestion}</li>`)}
            </ul>
          </div>
        ` : ''}
        
        <div class="error-actions">
          <a href="${bookmark.url}" target="_blank" rel="noopener noreferrer" class="primary-button">
            Open Original Website
          </a>
        </div>
      </div>
    `;
  }

  private getContentSourceLabel(type: 'saved' | 'live'): string {
    if (type === 'saved') {
      const assetCount = (this.availableContentSources || []).filter(s => s.type === 'asset').length;
      return assetCount > 1 ? `Saved (${assetCount})` : 'Saved';
    }
    return 'Live URL';
  }
  
  private getCurrentSourceValue(): string {
    if (this.selectedContentSource?.type === 'asset' && this.selectedContentSource.assetId) {
      // For single asset case, use simplified "saved" value
      // For multiple assets case, use specific asset ID
      if (this.shouldShowIndividualAssets()) {
        return `asset-${this.selectedContentSource.assetId}`;
      } else {
        return 'saved';
      }
    }
    return this.contentSourceType;
  }
  
  private updateSelectValue() {
    // Use multiple frames to ensure Material Web Components is fully initialized
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const select = this.shadowRoot?.querySelector('md-outlined-select') as any;
        if (select) {
          const expectedValue = this.getCurrentSourceValue();
          if (select.value !== expectedValue) {
            select.value = expectedValue;
            // Trigger change detection if needed
            select.requestUpdate?.();
          }
        }
      });
    });
  }
  
  private shouldShowIndividualAssets(): boolean {
    const assetSources = (this.availableContentSources || []).filter(s => s.type === 'asset');
    return assetSources.length > 1;
  }

  override render() {
    // Show loading spinner when data is loading
    if (this.isDataLoading) {
      return html`
        <div class="loading-container">
          <md-circular-progress indeterminate class="circular-progress-48"></md-circular-progress>
          <p>Loading article...</p>
        </div>
        ${this.renderInfoModal()}
      `;
    }

    if (!this.bookmark) {
      return html`
        <div class="error-message">
          <h3>Bookmark not found</h3>
          <p>The requested bookmark could not be loaded.</p>
        </div>
        ${this.renderInfoModal()}
      `;
    }

    // Initialize component data once all reactive queries are loaded
    if (this.bookmark && !this.isDataLoading && !this.#initialized) {
      this.#initialized = true;
      queueMicrotask(() => this.#initializeComponent());
    }

    return html`
      <div class="reader-container">
        <div class="reader-toolbar">
          <div class="toolbar-section">
            <!-- Content Source Selection -->
            <md-outlined-select
              class="content-source-selector"
              .value=${this.getCurrentSourceValue()}
              @change=${this.handleContentSourceChange}
            >
              ${this.shouldShowIndividualAssets() ? 
                // Show individual assets when multiple exist
                (this.availableContentSources || []).filter(s => s.type === 'asset').map(source => html`
                  <md-select-option value="asset-${source.assetId}">
                    ${source.label}
                  </md-select-option>
                `) :
                // Show simple "Saved" option when only one asset
                (this.availableContentSources || []).some(s => s.type === 'asset') ? html`
                  <md-select-option value="saved">
                    ${this.getContentSourceLabel('saved')}
                  </md-select-option>
                ` : ''
              }
              <md-select-option value="live">
                ${this.getContentSourceLabel('live')}
              </md-select-option>
            </md-outlined-select>
            
            <!-- Processing Mode Toggle -->
            <div class="processing-mode-toggle">
              ${this.readingMode === 'readability' ? html`
                <md-filled-icon-button
                  class="processing-mode-button"
                  @click=${this.handleProcessingModeToggle}
                  title="Readable view (click for raw)"
                  ?disabled=${!this.contentResult?.readability_content}
                >
                  <md-icon>auto_stories</md-icon>
                </md-filled-icon-button>
              ` : html`
                <md-icon-button
                  class="processing-mode-button"
                  @click=${this.handleProcessingModeToggle}
                  title=${this.contentResult?.readability_content ? "Raw view (click for readable)" : "Raw view (readable mode not available)"}
                  ?disabled=${!this.contentResult?.readability_content}
                >
                  <md-icon>code</md-icon>
                </md-icon-button>
              `}
            </div>
            
            <!-- Dark Mode Toggle (readability only) OR Info Button (non-readability) -->
            ${this.readingMode === 'readability' ? html`
              <md-icon-button
                @click=${this.handleDarkModeToggle}
                title=${this.darkModeOverride === null ? 'Follow System Theme' : this.darkModeOverride === 'dark' ? 'Dark Mode Active' : 'Light Mode Active'}
              >
                <md-icon>${this.darkModeOverride === 'dark' || (this.darkModeOverride === null && this.systemTheme === 'dark') ? 'dark_mode' : 'light_mode'}</md-icon>
              </md-icon-button>
            ` : html`
              <md-icon-button
                @click=${this.handleInfoClick}
                title="Show bookmark info"
              >
                <md-icon>info</md-icon>
              </md-icon-button>
            `}
          </div>
          
          ${this.contentResult?.content_type !== 'iframe' ? html`
            <div class="progress-section">
              <span class="progress-text">
                ${Math.round(this.readProgress)}% read
              </span>
              <md-linear-progress 
                .value=${this.readProgress / 100}
                class="flex-1"
              ></md-linear-progress>
            </div>
          ` : ''}
          
          <!-- Open External Link -->
          <div style="flex-shrink: 0;">
            <md-icon-button
              @click=${this.handleOpenOriginal}
              title="Open original website"
            >
              <md-icon>open_in_new</md-icon>
            </md-icon-button>
          </div>
        </div>
        
        <div class="reader-content">
          ${this.renderContent()}
        </div>
      </div>
      ${this.renderInfoModal()}
    `;
  }
}