import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import { ThemeService } from '../services/theme-service';
import { configureFetchHelper } from '../utils/fetch-helper';
import { getBasePath } from '../utils/base-path';
import type { AppSettings } from '../types';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';
import './bookmark-list-container';
import './bookmark-reader';
import './settings-panel';

@customElement('app-root')
export class AppRoot extends LitElement {
  @state() private currentView: 'bookmarks' | 'reader' | 'settings' | 'not-found' = 'bookmarks';
  @state() private selectedBookmarkId: number | null = null;
  @state() private settings: AppSettings | null = null;
  @state() private isLoading = true;

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
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      padding: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .app-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: 0.5rem;
    }

    .header-actions md-text-button {
      --md-text-button-label-text-color: var(--md-sys-color-on-primary);
    }

    .app-header md-text-button {
      --md-text-button-label-text-color: var(--md-sys-color-on-primary);
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

    @media (max-width: 768px) {
      .app-header {
        padding: 0.75rem;
      }
      
      .app-title {
        font-size: 1.1rem;
      }
      
      .header-actions md-text-button {
        font-size: 0.875rem;
      }
    }
  `;

  override async connectedCallback() {
    super.connectedCallback();
    await this.loadSettings();
    this.setupRouting();
    this.isLoading = false;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this.handlePopState);
  }

  private async loadSettings() {
    try {
      this.settings = await DatabaseService.getSettings() || null;
      
      // Configure fetch helper with Linkding URL if available
      if (this.settings?.linkding_url) {
        configureFetchHelper(this.settings.linkding_url);
      }
      
      // Initialize theme service
      ThemeService.init();
      
      // Apply theme from settings if available
      if (this.settings?.theme_mode) {
        ThemeService.setThemeFromSettings(this.settings.theme_mode);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  private setupRouting() {
    // Skip routing in test environments
    const isTestEnvironment = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
    if (isTestEnvironment) {
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
    // Skip URL updates in test environments
    const isTestEnvironment = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
    if (isTestEnvironment) {
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
    } else if (this.currentView === 'settings') {
      this.currentView = 'bookmarks';
      this.updateUrl('bookmarks');
    }
  }

  private handleSettingsClick() {
    this.currentView = 'settings';
    this.updateUrl('settings');
  }

  private handleBookmarkSelect(e: CustomEvent) {
    this.selectedBookmarkId = e.detail.bookmarkId;
    this.currentView = 'reader';
    this.updateUrl('reader', this.selectedBookmarkId || undefined);
  }

  private async handleSettingsSave(e: CustomEvent) {
    this.settings = e.detail.settings;
    
    // Configure fetch helper with updated Linkding URL
    if (this.settings?.linkding_url) {
      configureFetchHelper(this.settings.linkding_url);
    }
    
    // Apply theme from updated settings
    if (this.settings?.theme_mode) {
      ThemeService.setThemeFromSettings(this.settings.theme_mode);
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
    
    return html`
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          ${showBack ? html`
            <md-text-button
              @click=${this.handleBackClick}
            >
              <md-icon slot="icon">arrow_back</md-icon>
            </md-text-button>
          ` : ''}
          <h1 class="app-title">
            ${this.currentView === 'bookmarks' ? 'My Bookmarks' : 
              this.currentView === 'reader' ? 'Reading' : 
              this.currentView === 'settings' ? 'Settings' : 'Page Not Found'}
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
    if (this.isLoading) {
      return html`
        <div class="loading-container">
          <md-circular-progress indeterminate style="width: 48px; height: 48px;"></md-circular-progress>
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
        return html`
          <bookmark-reader
            .bookmarkId=${this.selectedBookmarkId}
          ></bookmark-reader>
        `;
      case 'settings':
        return html`
          <settings-panel
            .settings=${this.settings}
            @settings-saved=${this.handleSettingsSave}
          ></settings-panel>
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
    const contentClasses = this.currentView === 'reader' ? 'app-content no-scroll' : 'app-content';
    
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