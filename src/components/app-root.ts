import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DatabaseService } from '../services/database';
import type { AppSettings } from '../types';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import './bookmark-list';
import './bookmark-reader';
import './settings-panel';

@customElement('app-root')
export class AppRoot extends LitElement {
  @state() private currentView: 'bookmarks' | 'reader' | 'settings' = 'bookmarks';
  @state() private selectedBookmarkId: number | null = null;
  @state() private settings: AppSettings | null = null;
  @state() private isLoading = true;

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--sl-color-neutral-50);
      font-family: var(--sl-font-sans);
    }

    .app-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .app-header {
      background: var(--sl-color-primary-600);
      color: white;
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

    .app-content {
      flex: 1;
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
      background: white;
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .setup-card h2 {
      margin-top: 0;
      color: var(--sl-color-neutral-700);
    }

    .setup-card p {
      color: var(--sl-color-neutral-600);
      margin-bottom: 1.5rem;
    }

    @media (max-width: 768px) {
      .app-header {
        padding: 0.75rem;
      }
      
      .app-title {
        font-size: 1.1rem;
      }
      
      .header-actions sl-button {
        --sl-button-font-size-medium: 0.875rem;
      }
    }
  `;

  override async connectedCallback() {
    super.connectedCallback();
    await this.loadSettings();
    this.isLoading = false;
  }

  private async loadSettings() {
    try {
      this.settings = await DatabaseService.getSettings() || null;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  private handleBackClick() {
    if (this.currentView === 'reader') {
      this.currentView = 'bookmarks';
      this.selectedBookmarkId = null;
    } else if (this.currentView === 'settings') {
      this.currentView = 'bookmarks';
    }
  }

  private handleSettingsClick() {
    this.currentView = 'settings';
  }

  private handleBookmarkSelect(e: CustomEvent) {
    this.selectedBookmarkId = e.detail.bookmarkId;
    this.currentView = 'reader';
  }

  private async handleSettingsSave(e: CustomEvent) {
    this.settings = e.detail.settings;
    this.currentView = 'bookmarks';
    
    // Wait for the bookmark list to render, then trigger sync
    await this.updateComplete;
    const bookmarkList = this.shadowRoot?.querySelector('bookmark-list');
    if (bookmarkList) {
      bookmarkList.dispatchEvent(new CustomEvent('sync-requested'));
    }
  }

  private handleSyncClick() {
    const bookmarkList = this.shadowRoot?.querySelector('bookmark-list');
    if (bookmarkList) {
      bookmarkList.dispatchEvent(new CustomEvent('sync-requested'));
    }
  }

  private renderHeader() {
    const showBack = this.currentView !== 'bookmarks';
    
    return html`
      <div class="app-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          ${showBack ? html`
            <sl-button
              variant="text"
              size="medium"
              @click=${this.handleBackClick}
            >
              <sl-icon name="arrow-left"></sl-icon>
            </sl-button>
          ` : ''}
          <h1 class="app-title">
            ${this.currentView === 'bookmarks' ? 'My Bookmarks' : 
              this.currentView === 'reader' ? 'Reading' : 'Settings'}
          </h1>
        </div>
        
        <div class="header-actions">
          ${this.currentView === 'bookmarks' && this.settings ? html`
            <sl-button
              variant="text"
              size="medium"
              @click=${this.handleSyncClick}
            >
              <sl-icon name="arrow-clockwise"></sl-icon>
            </sl-button>
          ` : ''}
          ${this.currentView === 'bookmarks' ? html`
            <sl-button
              variant="text"
              size="medium"
              @click=${this.handleSettingsClick}
            >
              <sl-icon name="gear"></sl-icon>
            </sl-button>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderContent() {
    if (this.isLoading) {
      return html`
        <div class="loading-container">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
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
                <sl-button
                  variant="primary"
                  @click=${this.handleSettingsClick}
                >
                  Configure Settings
                </sl-button>
              </div>
            </div>
          `;
        }
        return html`
          <bookmark-list
            @bookmark-selected=${this.handleBookmarkSelect}
          ></bookmark-list>
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
      default:
        return html`<div>Unknown view</div>`;
    }
  }

  override render() {
    return html`
      <div class="app-container">
        ${this.renderHeader()}
        <div class="app-content">
          ${this.renderContent()}
        </div>
      </div>
    `;
  }
}