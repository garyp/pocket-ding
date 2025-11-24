import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SettingsService } from '../services/settings-service';
import { ThemeService } from '../services/theme-service';
import { DebugService } from '../services/debug-service';
import { ReactiveQueryController } from '../controllers/reactive-query-controller';
import { configureFetchHelper } from '../utils/fetch-helper';
import { getBasePath } from '../utils/base-path';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';
import './bookmark-list-container';
import './bookmark-reader';
import './settings-panel';
import './debug-view';

@customElement('app-root')
export class AppRoot extends LitElement {
  // Reactive query controller for settings data
  #settingsQuery = new ReactiveQueryController(
    this,
    () => SettingsService.getSettings()
  );

  @state() private currentView: 'bookmarks' | 'reader' | 'settings' | 'debug' | 'not-found' = 'bookmarks';
  @state() private selectedBookmarkId: number | null = null;
  @state() private isLoading = true;

  // Getter methods for reactive data
  get settings() {
    return this.#settingsQuery.value ?? null;
  }

  get isSettingsLoading() {
    return this.#settingsQuery.loading;
  }

  static override styles = css`
    :host {
      display: block;
      height: 100vh;
      background: var(--md-sys-color-surface);
      font-family: 'Roboto', sans-serif;
    }

    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .app-header {
      background: var(--md-sys-color-surface-container);
      color: var(--md-sys-color-on-surface);
      padding: 0 1rem;
      height: 4rem; /* 64px at 16px root font size */
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.12), 0 1px 2px 0 rgba(0, 0, 0, 0.24);
      position: relative;
      z-index: 4;
    }

    .app-header.hidden {
      display: none;
    }

    .app-title {
      margin: 0;
      font-size: 1.375rem; /* 22px at 16px root - Material Design title-large */
      font-weight: 400;
      line-height: 1.75rem; /* 28px */
      letter-spacing: 0;
    }

    .header-actions {
      display: flex;
      gap: 0.25rem; /* 4px - minimal spacing for icon buttons */
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 1rem; /* 16px - standard component spacing */
      min-width: 0;
      flex: 1;
    }

    .header-actions md-text-button {
      --md-text-button-label-text-color: var(--md-sys-color-on-surface);
      --md-text-button-with-icon-spacing: 0.5rem;
      --md-text-button-container-height: 2.5rem; /* 40px */
      --md-text-button-container-shape: 1.25rem; /* 20px border radius */
      min-width: 2.5rem; /* 40px minimum touch target */
    }

    .app-header md-text-button {
      --md-text-button-label-text-color: var(--md-sys-color-on-surface);
      --md-text-button-with-icon-spacing: 0.5rem;
      --md-text-button-container-height: 2.5rem;
      --md-text-button-container-shape: 1.25rem;
      min-width: 2.5rem;
    }

    .header-actions md-text-button md-icon,
    .app-header md-text-button md-icon {
      color: var(--md-sys-color-on-surface);
      font-size: 1.5rem; /* 24px - Material Design icon size */
    }

    .app-content {
      flex: 1;
      overflow-y: auto;
    }
    
    .app-content.no-scroll {
      overflow: hidden;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      flex-direction: column;
      gap: 1rem;
    }

    .setup-required {
      padding: 2rem;
      text-align: center;
      max-width: 400px;
      margin: 2rem auto;
    }

    .setup-card {
      background: var(--md-sys-color-surface-container);
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .setup-card h2 {
      margin-top: 0;
      color: var(--md-sys-color-on-surface);
    }

    .setup-card p {
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 1.5rem;
    }

    .not-found {
      padding: 2rem;
      text-align: center;
      max-width: 400px;
      margin: 2rem auto;
    }

    .not-found-content {
      background: var(--md-sys-color-surface-container);
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .not-found-content h2 {
      margin-top: 0;
      color: var(--md-sys-color-on-surface);
    }

    .not-found-content p {
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 1.5rem;
    }

    @media (max-width: 48rem) { /* 768px breakpoint */
      .app-header {
        padding: 0 0.75rem; /* 12px - reduced for mobile */
        height: 3.5rem; /* 56px - standard mobile header height */
      }
      
      .app-title {
        font-size: 1.25rem; /* 20px - slightly smaller on mobile */
        line-height: 1.5rem; /* 24px */
      }
      
      .header-content {
        gap: 0.75rem; /* 12px - tighter spacing on mobile */
      }
      
      .header-actions {
        gap: 0.125rem; /* 2px - minimal gap for mobile */
      }
      
      .header-actions md-text-button,
      .app-header md-text-button {
        --md-text-button-container-height: 2.25rem; /* 36px - smaller on mobile */
        --md-text-button-container-shape: 1.125rem; /* 18px border radius */
        min-width: 2.25rem; /* 36px minimum */
      }
      
      .header-actions md-text-button md-icon,
      .app-header md-text-button md-icon {
        font-size: 1.25rem; /* 20px - smaller icons on mobile */
      }
    }

    /* Utility classes */
    .circular-progress-48 {
      width: 48px;
      height: 48px;
    }
  `;

  override async connectedCallback() {
    super.connectedCallback();
    this.#initializeApp();
    this.setupRouting();
    this.isLoading = false;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this.handlePopState);
    SettingsService.cleanup();
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    // Configure services when settings are loaded reactively
    if (!this.#settingsQuery.loading && this.settings) {
      this.#configureServicesFromSettings();
    }
  }

  #initializeApp() {
    try {
      // Initialize services
      ThemeService.init();
      DebugService.initialize();
      SettingsService.initialize();

      // The reactive query controller will handle settings loading,
      // and we'll configure services when settings become available
    } catch (error) {
      console.error('Failed to initialize app:', error);
      DebugService.log('error', 'app', 'initializeApp', 'Failed to initialize app', undefined, error instanceof Error ? error : new Error(String(error)));
    }
  }

  #configureServicesFromSettings() {
    try {
      // Configure fetch helper with Linkding URL if available
      if (this.settings?.linkding_url) {
        configureFetchHelper(this.settings.linkding_url);
      }

      // Apply theme from settings if available
      if (this.settings?.theme_mode) {
        ThemeService.setThemeFromSettings(this.settings.theme_mode);
      }

      // Set debug mode if enabled
      if (this.settings?.debug_mode) {
        DebugService.setDebugMode(true);
        DebugService.logAppEvent('startup', { settings: this.settings });
      }
    } catch (error) {
      console.error('Failed to configure services from settings:', error);
      DebugService.log('error', 'app', 'configureServicesFromSettings', 'Failed to configure services from settings', undefined, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Detects if we're running in a Vitest unit test environment (Happy DOM).
   * E2E tests in real browsers (Playwright) should NOT be detected as unit tests.
   *
   * Detection strategy:
   * - Check for window.__VITEST__ (set by Vitest)
   * - Check for Happy DOM navigator signature
   * - Do NOT rely on process.env which doesn't exist in real browsers
   */
  #isUnitTestEnvironment(): boolean {
    // Check if running in Vitest
    if (typeof window !== 'undefined' && (window as any).__VITEST__) {
      return true;
    }

    // Check for Happy DOM (used by Vitest unit tests)
    if (typeof navigator !== 'undefined' && navigator.userAgent?.includes('happy-dom')) {
      return true;
    }

    // Real browsers (including E2E tests) should return false
    return false;
  }

  private setupRouting() {
    // Only skip routing in Vitest unit tests, not E2E tests in real browsers
    if (this.#isUnitTestEnvironment()) {
      return;
    }

    // Handle initial route
    this.handleRoute();
    // Listen for browser back/forward buttons
    window.addEventListener('popstate', this.handlePopState);
  }

  private handlePopState = () => {
    this.handleRoute();
  };


  private getRouteFromPath(fullPath: string): string {
    // Strip the base path from the full path to get the route
    const basePath = getBasePath();
    
    // If base path is '/', return the full path as-is
    if (basePath === '/') {
      return fullPath;
    }
    
    // Remove trailing slash from base path for comparison
    const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    
    // If the path starts with the base path, strip it
    if (fullPath.startsWith(normalizedBasePath)) {
      const route = fullPath.substring(normalizedBasePath.length);
      return route || '/';
    }
    
    // If path doesn't start with base path, return as-is
    return fullPath;
  }

  private handleRoute() {
    const fullPath = window.location.pathname;
    const path = this.getRouteFromPath(fullPath);
    const params = new URLSearchParams(window.location.search);
    
    if (path === '/' || path === '/bookmarks') {
      this.currentView = 'bookmarks';
      this.selectedBookmarkId = null;
    } else if (path === '/settings') {
      this.currentView = 'settings';
    } else if (path === '/debug') {
      this.currentView = 'debug';
    } else if (path === '/reader') {
      this.currentView = 'reader';
      const bookmarkId = params.get('id');
      if (bookmarkId) {
        this.selectedBookmarkId = parseInt(bookmarkId, 10);
      }
    } else {
      // Unknown path - show 404
      this.currentView = 'not-found';
      this.selectedBookmarkId = null;
    }
  }

  private updateUrl(view: string, bookmarkId?: number) {
    // Only skip URL updates in Vitest unit tests, not E2E tests in real browsers
    if (this.#isUnitTestEnvironment()) {
      return;
    }

    const basePath = getBasePath();
    let route = '/';
    let title = 'Pocket Ding';
    
    switch (view) {
      case 'settings':
        route = '/settings';
        title = 'Settings - Pocket Ding';
        break;
      case 'debug':
        route = '/debug';
        title = 'Debug - Pocket Ding';
        break;
      case 'reader':
        route = bookmarkId ? `/reader?id=${bookmarkId}` : '/reader';
        title = 'Reading - Pocket Ding';
        break;
      case 'bookmarks':
      default:
        route = '/';
        title = 'Pocket Ding';
        break;
    }
    
    // Construct the full URL with the base path
    const url = basePath === '/' ? route : (basePath.replace(/\/$/, '') + route);
    
    window.history.pushState({ view, bookmarkId }, title, url);
    document.title = title;
  }

  private handleBackClick() {
    if (this.currentView === 'reader') {
      this.currentView = 'bookmarks';
      this.selectedBookmarkId = null;
      this.updateUrl('bookmarks');
    } else if (this.currentView === 'settings' || this.currentView === 'debug') {
      this.currentView = 'bookmarks';
      this.updateUrl('bookmarks');
    }
  }

  private handleSettingsClick() {
    this.currentView = 'settings';
    this.updateUrl('settings');
  }

  private handleDebugClick() {
    this.currentView = 'debug';
    this.updateUrl('debug');
  }

  private handleBookmarkSelect(e: CustomEvent) {
    const bookmarkId = e.detail.bookmarkId;
    if (!bookmarkId) {
      console.error('Invalid bookmark ID in handleBookmarkSelect');
      return;
    }
    this.selectedBookmarkId = bookmarkId;
    this.currentView = 'reader';
    this.updateUrl('reader', bookmarkId);
  }

  private handleNavigateBack() {
    this.handleBackClick();
  }

  private async handleSettingsSave(e: CustomEvent) {
    // The reactive query controller will automatically update with new settings
    const newSettings = e.detail.settings;

    // Configure fetch helper with updated Linkding URL
    if (newSettings?.linkding_url) {
      configureFetchHelper(newSettings.linkding_url);
    }

    // Apply theme from updated settings
    if (newSettings?.theme_mode) {
      ThemeService.setThemeFromSettings(newSettings.theme_mode);
    }

    // Update debug mode
    DebugService.setDebugMode(newSettings?.debug_mode ?? false);
    if (newSettings?.debug_mode) {
      DebugService.logAppEvent('settingsUpdated', { debug_mode: true });
    }

    this.currentView = 'bookmarks';
    this.updateUrl('bookmarks');

    // Wait for the bookmark list to render, then trigger sync
    await this.updateComplete;
    const bookmarkList = this.shadowRoot?.querySelector('bookmark-list-container');
    if (bookmarkList) {
      bookmarkList.dispatchEvent(new CustomEvent('sync-requested'));
    }
  }

  private handleSyncClick() {
    const bookmarkList = this.shadowRoot?.querySelector('bookmark-list-container');
    if (bookmarkList) {
      bookmarkList.dispatchEvent(new CustomEvent('sync-requested'));
    }
  }

  private renderHeader() {
    const showBack = this.currentView !== 'bookmarks' && this.currentView !== 'not-found';
    const hideHeader = this.currentView === 'reader';

    return html`
      <div class="app-header ${hideHeader ? 'hidden' : ''}">
        <div class="header-content">
          ${showBack ? html`
            <md-text-button
              @click=${this.handleBackClick}
            >
              <md-icon slot="icon">arrow_back</md-icon>
            </md-text-button>
          ` : ''}
          <h1 class="app-title md-typescale-title-large">
            ${this.currentView === 'bookmarks' ? 'My Bookmarks' :
              this.currentView === 'reader' ? 'Reading' :
              this.currentView === 'settings' ? 'Settings' :
              this.currentView === 'debug' ? 'Debug' : 'Page Not Found'}
          </h1>
        </div>

        <div class="header-actions">
          ${this.currentView === 'bookmarks' && this.settings ? html`
            <md-text-button
              @click=${this.handleSyncClick}
            >
              <md-icon slot="icon">sync</md-icon>
            </md-text-button>
          ` : ''}
          ${this.currentView === 'bookmarks' && this.settings?.debug_mode ? html`
            <md-text-button
              @click=${this.handleDebugClick}
            >
              <md-icon slot="icon">bug_report</md-icon>
            </md-text-button>
          ` : ''}
          ${this.currentView === 'bookmarks' ? html`
            <md-text-button
              @click=${this.handleSettingsClick}
            >
              <md-icon slot="icon">settings</md-icon>
            </md-text-button>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderContent() {
    if (this.isLoading || this.isSettingsLoading) {
      return html`
        <div class="loading-container">
          <md-circular-progress indeterminate class="circular-progress-48"></md-circular-progress>
          <p>Loading...</p>
        </div>
      `;
    }

    switch (this.currentView) {
      case 'bookmarks':
        if (!this.settings) {
          return html`
            <div class="setup-required">
              <div class="setup-card">
                <h2>Welcome to Pocket Ding</h2>
                <p>To get started, you need to configure your Linkding server connection.</p>
                <md-filled-button
                  @click=${this.handleSettingsClick}
                >
                  Configure Settings
                </md-filled-button>
              </div>
            </div>
          `;
        }
        return html`
          <bookmark-list-container
            @bookmark-selected=${this.handleBookmarkSelect}
          ></bookmark-list-container>
        `;
      case 'reader':
        if (!this.selectedBookmarkId) {
          return html`
            <div class="error-message">
              <h3>No bookmark selected</h3>
              <p>Please select a bookmark to read.</p>
            </div>
          `;
        }
        return html`
          <bookmark-reader
            .bookmarkId=${this.selectedBookmarkId}
            @navigate-back=${this.handleNavigateBack}
          ></bookmark-reader>
        `;
      case 'settings':
        return html`
          <settings-panel
            @settings-saved=${this.handleSettingsSave}
          ></settings-panel>
        `;
      case 'debug':
        return html`
          <debug-view></debug-view>
        `;
      case 'not-found':
      default:
        return html`
          <div class="not-found">
            <div class="not-found-content">
              <h2>404 - Page Not Found</h2>
              <p>The page you're looking for doesn't exist.</p>
              <md-filled-button
                @click=${() => {
                  this.currentView = 'bookmarks';
                  this.updateUrl('bookmarks');
                }}
              >
                Go to Bookmarks
              </md-filled-button>
            </div>
          </div>
        `;
    }
  }

  override render() {
    const contentClasses = 'app-content'; // Remove no-scroll for unified scrolling in reader
    
    return html`
      <div class="app-container">
        ${this.renderHeader()}
        <div class="${contentClasses}">
          ${this.renderContent()}
        </div>
      </div>
    `;
  }
}