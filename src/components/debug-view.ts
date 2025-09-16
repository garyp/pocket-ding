import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DebugService } from '../services/debug-service';
import type { DebugLogEntry, DebugAppState } from '../types';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/labs/card/outlined-card.js';
import '@material/web/icon/icon.js';
import '@material/web/progress/circular-progress.js';

@customElement('debug-view')
export class DebugView extends LitElement {
  @state() private logs: DebugLogEntry[] = [];
  @state() private appState: DebugAppState | null = null;
  @state() private isLoading = false;
  @state() private isAutoRefresh = false;
  private refreshInterval?: number;

  static override styles = css`
    :host {
      display: block;
      padding: 1rem;
      max-width: 50rem;
      margin: 0 auto;
    }

    .debug-section {
      margin-bottom: 2rem;
    }

    .debug-card {
      margin-bottom: 1.5rem;
      background: var(--md-sys-color-surface-container-low);
      border-radius: 0.75rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      padding: 0 1rem;
    }

    .section-header h3 {
      margin: 0;
      color: var(--md-sys-color-on-surface);
      font-size: 1.25rem;
      font-weight: 500;
    }

    .section-controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .app-state-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
      padding: 1rem;
    }

    .state-item {
      background: var(--md-sys-color-surface-variant);
      padding: 1rem;
      border-radius: 0.5rem;
    }

    .state-item h4 {
      margin: 0 0 0.5rem 0;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 0.875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .state-value {
      color: var(--md-sys-color-on-surface);
      font-size: 1.125rem;
      font-weight: 400;
    }

    .state-details {
      margin-top: 0.5rem;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 0.75rem;
    }

    .logs-container {
      max-height: 400px;
      overflow-y: auto;
      background: var(--md-sys-color-surface);
      border-radius: 0.5rem;
      margin: 1rem;
    }

    .log-entry {
      display: flex;
      flex-direction: column;
      padding: 0.75rem;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }

    .log-entry:last-child {
      border-bottom: none;
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .log-timestamp {
      font-size: 0.75rem;
      color: var(--md-sys-color-on-surface-variant);
      font-family: monospace;
    }

    .log-level {
      padding: 0.125rem 0.5rem;
      border-radius: 1rem;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
    }

    .log-level.info {
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
    }

    .log-level.warn {
      background: var(--md-sys-color-tertiary-container);
      color: var(--md-sys-color-on-tertiary-container);
    }

    .log-level.error {
      background: var(--md-sys-color-error-container);
      color: var(--md-sys-color-on-error-container);
    }

    .log-category {
      font-size: 0.75rem;
      color: var(--md-sys-color-on-surface-variant);
      text-transform: uppercase;
      font-weight: 500;
    }

    .log-operation {
      font-size: 0.75rem;
      color: var(--md-sys-color-on-surface-variant);
      background: var(--md-sys-color-surface-variant);
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
    }

    .log-message {
      color: var(--md-sys-color-on-surface);
      margin: 0.25rem 0;
    }

    .log-details {
      font-size: 0.75rem;
      color: var(--md-sys-color-on-surface-variant);
      background: var(--md-sys-color-surface-container);
      padding: 0.5rem;
      border-radius: 0.25rem;
      margin-top: 0.5rem;
      font-family: monospace;
      white-space: pre-wrap;
      overflow-x: auto;
    }

    .log-error {
      font-size: 0.75rem;
      color: var(--md-sys-color-on-error-container);
      background: var(--md-sys-color-error-container);
      padding: 0.5rem;
      border-radius: 0.25rem;
      margin-top: 0.5rem;
      font-family: monospace;
      white-space: pre-wrap;
    }

    .no-logs {
      text-align: center;
      padding: 2rem;
      color: var(--md-sys-color-on-surface-variant);
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      gap: 1rem;
    }

    @media (max-width: 48rem) {
      :host {
        padding: 0.75rem;
      }
      
      .app-state-grid {
        grid-template-columns: 1fr;
      }
      
      .section-header {
        flex-direction: column;
        align-items: stretch;
        gap: 1rem;
      }
      
      .section-controls {
        justify-content: center;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.refreshData();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private async refreshData() {
    this.isLoading = true;
    try {
      this.logs = DebugService.getLogs();
      this.appState = await DebugService.getAppState();
    } catch (error) {
      console.error('Failed to refresh debug data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private handleClearLogs() {
    DebugService.clearLogs();
    this.logs = [];
  }

  private toggleAutoRefresh() {
    this.isAutoRefresh = !this.isAutoRefresh;
    
    if (this.isAutoRefresh) {
      this.refreshInterval = window.setInterval(() => {
        this.refreshData();
      }, 2000) as unknown as number; // Refresh every 2 seconds
    } else if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined as any;
    }
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  private formatDetails(details: any): string {
    if (!details) return '';
    
    try {
      return JSON.stringify(details, null, 2);
    } catch (error) {
      return String(details);
    }
  }

  private formatError(error: Error): string {
    return `${error.name}: ${error.message}\n\n${error.stack || 'No stack trace available'}`;
  }

  private formatBytes(bytes?: number): string {
    if (!bytes) return 'Unknown';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private renderServiceWorkerInfo() {
    if (!this.appState?.sync.serviceWorker) return html``;

    const sw = this.appState.sync.serviceWorker;

    return html`
      <div class="state-item">
        <h4>Service Worker</h4>
        <div class="state-value">
          ${sw.supported ? (sw.active ? 'Active' : (sw.registered ? 'Registered' : 'Inactive')) : 'Not Supported'}
        </div>
        <div class="state-details">
          ${sw.supported ? html`
            Background Sync: ${sw.backgroundSyncSupported ? 'Supported' : 'Not Supported'}<br>
            Periodic Sync: ${sw.periodicSyncSupported ? 'Supported' : 'Not Supported'}
            ${sw.periodicSyncSupported ? html`<br>Permission: ${sw.permissionState}` : ''}
            ${sw.scope ? html`<br>Scope: ${sw.scope}` : ''}
            ${sw.syncTags && sw.syncTags.length > 0 ? html`<br>Sync tags: ${sw.syncTags.join(', ')}` : ''}
            ${sw.periodicTags && sw.periodicTags.length > 0 ? html`<br>Periodic tags: ${sw.periodicTags.join(', ')}` : ''}
          ` : 'Service Workers not supported in this browser'}
        </div>
      </div>
    `;
  }

  private renderAppState() {
    if (!this.appState) return html``;

    return html`
      <div class="app-state-grid">
        <div class="state-item">
          <h4>Bookmarks</h4>
          <div class="state-value">${this.appState.bookmarks.total}</div>
          <div class="state-details">
            Unread: ${this.appState.bookmarks.unread} |
            Archived: ${this.appState.bookmarks.archived} |
            With Assets: ${this.appState.bookmarks.withAssets}
          </div>
        </div>

        <div class="state-item">
          <h4>Sync Status</h4>
          <div class="state-value">
            ${this.appState.sync.isInProgress ? 'In Progress' : 'Idle'}
          </div>
          <div class="state-details">
            ${this.appState.sync.lastSyncAt ?
              `Last: ${new Date(this.appState.sync.lastSyncAt).toLocaleString()}` :
              'Never synced'}
            ${this.appState.sync.currentProgress ?
              html`<br>Progress: ${this.appState.sync.currentProgress.current}/${this.appState.sync.currentProgress.total}` :
              ''}
            ${this.appState.sync.lastSyncError ?
              html`<br><span style="color: var(--md-sys-color-error)">Error: ${this.appState.sync.lastSyncError}</span>` :
              ''}
          </div>
        </div>

        <div class="state-item">
          <h4>Sync Progress</h4>
          <div class="state-value">
            ${this.appState.sync.retryCount || 0} retries
          </div>
          <div class="state-details">
            Unarchived offset: ${this.appState.sync.unarchivedOffset || 0}<br>
            Archived offset: ${this.appState.sync.archivedOffset || 0}<br>
            Need asset sync: ${this.appState.sync.bookmarksNeedingAssetSync || 0}<br>
            Need read sync: ${this.appState.sync.bookmarksNeedingReadSync || 0}
          </div>
        </div>

        <div class="state-item">
          <h4>API Connection</h4>
          <div class="state-value">
            ${this.appState.api.isConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div class="state-details">
            ${this.appState.api.baseUrl || 'No URL set'}
            ${this.appState.api.lastTestAt ?
              html`<br>Last test: ${new Date(this.appState.api.lastTestAt).toLocaleString()}` :
              ''}
          </div>
        </div>

        <div class="state-item">
          <h4>Storage Usage</h4>
          <div class="state-value">
            ${this.formatBytes(this.appState.storage.sizeEstimate)}
          </div>
          <div class="state-details">
            ${this.appState.storage.quotaAvailable ?
              `Available: ${this.formatBytes(this.appState.storage.quotaAvailable)}` :
              'Quota info unavailable'}
          </div>
        </div>

        ${this.renderServiceWorkerInfo()}
      </div>
    `;
  }

  private renderLogs() {
    if (this.logs.length === 0) {
      return html`
        <div class="no-logs">
          <p>No debug logs available. Enable debug mode in settings and perform some sync operations to see logs here.</p>
        </div>
      `;
    }

    return html`
      <div class="logs-container">
        ${this.logs.map(log => html`
          <div class="log-entry">
            <div class="log-header">
              <span class="log-timestamp">${this.formatTimestamp(log.timestamp)}</span>
              <span class="log-level ${log.level}">${log.level}</span>
              <span class="log-category">${log.category}</span>
              <span class="log-operation">${log.operation}</span>
            </div>
            <div class="log-message">${log.message}</div>
            ${log.details ? html`
              <div class="log-details">${this.formatDetails(log.details)}</div>
            ` : ''}
            ${log.error ? html`
              <div class="log-error">${this.formatError(log.error)}</div>
            ` : ''}
          </div>
        `)}
      </div>
    `;
  }

  override render() {
    return html`
      <div class="debug-section">
        <md-outlined-card class="debug-card">
          <div class="section-header">
            <h3>App State</h3>
            <div class="section-controls">
              <md-text-button
                @click=${this.refreshData}
                ?disabled=${this.isLoading}
              >
                <md-icon slot="icon">refresh</md-icon>
                Refresh
              </md-text-button>
              <md-text-button
                @click=${this.toggleAutoRefresh}
                ?disabled=${this.isLoading}
              >
                <md-icon slot="icon">${this.isAutoRefresh ? 'pause' : 'play_arrow'}</md-icon>
                ${this.isAutoRefresh ? 'Pause' : 'Auto'}
              </md-text-button>
            </div>
          </div>
          
          ${this.isLoading ? html`
            <div class="loading-container">
              <md-circular-progress indeterminate></md-circular-progress>
              <span>Loading debug data...</span>
            </div>
          ` : this.renderAppState()}
        </md-outlined-card>
      </div>
      
      <div class="debug-section">
        <md-outlined-card class="debug-card">
          <div class="section-header">
            <h3>Debug Logs</h3>
            <div class="section-controls">
              <md-text-button @click=${this.handleClearLogs}>
                <md-icon slot="icon">clear_all</md-icon>
                Clear Logs
              </md-text-button>
            </div>
          </div>
          
          ${this.renderLogs()}
        </md-outlined-card>
      </div>
    `;
  }
}