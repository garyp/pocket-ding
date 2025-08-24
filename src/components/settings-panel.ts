import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { createLinkdingAPI } from '../services/linkding-api';
import { DatabaseService } from '../services/database';
import { SyncService } from '../services/sync-service';
import { ThemeService } from '../services/theme-service';
import { DataManagementController } from '../controllers/data-management-controller';
import type { AppSettings } from '../types';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/labs/card/outlined-card.js';
import '@material/web/switch/switch.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/progress/linear-progress.js';

@customElement('settings-panel')
export class SettingsPanel extends LitElement {
  @property({ type: Object }) settings: AppSettings | null = null;
  @state() private formData: Partial<AppSettings> = {};
  @state() private isLoading = false;
  @state() private testStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
  @state() private testMessage = '';
  @state() private isFullSyncing = false;
  @state() private fullSyncProgress = 0;
  @state() private fullSyncTotal = 0;

  private dataManagementController = new DataManagementController(this);

  static override styles = css`
    :host {
      display: block;
      padding: 1rem;
      max-width: 37.5rem; /* 600px - responsive max width */
      margin: 0 auto;
    }

    .settings-card {
      margin-bottom: 1.5rem;
      background: var(--md-sys-color-surface-container-low);
      border-radius: 0.75rem; /* 12px - Material Design card radius */
    }

    .form-section {
      margin-bottom: 2rem;
      padding: 1rem;
    }

    .form-section h3 {
      margin: 0 0 1rem 0;
      color: var(--md-sys-color-on-surface);
      font-size: 1.25rem; /* 20px - Material Design title-medium */
      font-weight: 500;
      line-height: 1.75rem; /* 28px */
      letter-spacing: 0.009375rem; /* 0.15px */
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem; /* 14px - Material Design body-medium */
      line-height: 1.25rem; /* 20px */
      letter-spacing: 0.015625rem; /* 0.25px */
      color: var(--md-sys-color-on-surface-variant);
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 1.5rem;
      padding: 0 1rem 1rem;
    }

    .test-connection {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .status-message {
      margin-top: 1rem;
    }

    .danger-zone {
      border: 1px solid var(--md-sys-color-error);
      background: var(--md-sys-color-error-container);
      padding: 1rem;
      border-radius: 12px;
      margin-top: 2rem;
    }

    .danger-zone h3 {
      color: var(--md-sys-color-on-error-container);
      margin-bottom: 1rem;
    }

    .danger-zone p {
      color: var(--md-sys-color-on-error-container);
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    .sync-actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .sync-progress {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--md-sys-color-primary-container);
      border-radius: 12px;
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    .sync-progress-text {
      color: var(--md-sys-color-on-primary-container);
      margin-bottom: 0.5rem;
    }

    @media (max-width: 48rem) { /* 768px breakpoint */
      :host {
        padding: 0.75rem; /* 12px - reduced for mobile */
      }
      
      .form-section {
        padding: 0.75rem;
        margin-bottom: 1.5rem;
      }
      
      .form-section h3 {
        font-size: 1.125rem; /* 18px - slightly smaller on mobile */
        line-height: 1.5rem; /* 24px */
        margin-bottom: 0.75rem;
      }
      
      .form-group {
        margin-bottom: 0.75rem;
      }
      
      .form-actions {
        flex-direction: column;
        padding: 0 0.75rem 0.75rem;
        gap: 0.75rem;
      }
      
      .settings-card {
        margin-bottom: 1rem;
      }
    }

    /* Utility classes */
    .circular-progress-16 {
      width: 16px;
      height: 16px;
    }

    .status-message {
      padding: 0.75rem;
      border-radius: 8px;
    }

    .status-success {
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
    }

    .status-error {
      background: var(--md-sys-color-error-container);
      color: var(--md-sys-color-on-error-container);
    }

    .error-button {
      --md-filled-button-container-color: var(--md-sys-color-error);
      --md-filled-button-label-text-color: var(--md-sys-color-on-error);
    }

    .data-management {
      border: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-variant);
      padding: 1rem;
      border-radius: 12px;
      margin-top: 2rem;
    }

    .data-management h3 {
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 1rem;
    }

    .data-management p {
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    .data-actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .import-result {
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.9rem;
    }

    .import-result-success {
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
    }

    .import-result-error {
      background: var(--md-sys-color-error-container);
      color: var(--md-sys-color-on-error-container);
    }

    .import-details {
      margin-top: 0.5rem;
      font-size: 0.8rem;
      opacity: 0.8;
    }

    .hidden-file-input {
      display: none;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.initializeForm();
  }

  private initializeForm() {
    this.formData = {
      linkding_url: this.settings?.linkding_url || '',
      linkding_token: this.settings?.linkding_token || '',
      sync_interval: this.settings?.sync_interval || 60,
      auto_sync: this.settings?.auto_sync ?? true,
      reading_mode: this.settings?.reading_mode || 'readability',
      theme_mode: this.settings?.theme_mode || 'system',
      debug_mode: this.settings?.debug_mode ?? false
    };
  }

  private handleInputChange(field: keyof AppSettings, value: any) {
    this.formData = {
      ...this.formData,
      [field]: value
    };
  }

  private async handleTestConnection() {
    if (!this.formData.linkding_url || !this.formData.linkding_token) {
      this.testStatus = 'error';
      this.testMessage = 'Please enter both URL and token';
      return;
    }

    this.testStatus = 'testing';
    this.testMessage = '';

    try {
      const testSettings = this.formData as AppSettings;
      const api = createLinkdingAPI(testSettings.linkding_url, testSettings.linkding_token);
      const isConnected = await api.testConnection();
      
      if (isConnected) {
        this.testStatus = 'success';
        this.testMessage = 'Connection successful!';
      } else {
        this.testStatus = 'error';
        this.testMessage = 'Connection failed. Please check your settings.';
      }
    } catch (error) {
      this.testStatus = 'error';
      this.testMessage = `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async handleSave() {
    if (!this.formData.linkding_url || !this.formData.linkding_token) {
      this.testStatus = 'error';
      this.testMessage = 'Please enter both URL and token';
      return;
    }

    this.isLoading = true;

    try {
      const settings: AppSettings = {
        linkding_url: this.formData.linkding_url!,
        linkding_token: this.formData.linkding_token!,
        sync_interval: this.formData.sync_interval || 60,
        auto_sync: this.formData.auto_sync ?? true,
        reading_mode: this.formData.reading_mode || 'readability',
        theme_mode: this.formData.theme_mode || 'system',
        debug_mode: this.formData.debug_mode ?? false
      };

      await DatabaseService.saveSettings(settings);
      
      // Apply theme setting immediately
      if (settings.theme_mode) {
        ThemeService.setThemeFromSettings(settings.theme_mode);
      }
      
      this.dispatchEvent(new CustomEvent('settings-saved', {
        detail: { settings }
      }));
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.testStatus = 'error';
      this.testMessage = 'Failed to save settings. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  private async handleClearData() {
    if (confirm('Are you sure you want to clear all data? This will remove all bookmarks and reading progress.')) {
      try {
        await DatabaseService.clearAll();
        this.testStatus = 'success';
        this.testMessage = 'All data cleared successfully.';
      } catch (error) {
        console.error('Failed to clear data:', error);
        this.testStatus = 'error';
        this.testMessage = 'Failed to clear data. Please try again.';
      }
    }
  }

  private async handleFullSync() {
    if (!this.settings?.linkding_url || !this.settings?.linkding_token) {
      this.testStatus = 'error';
      this.testMessage = 'Please save your Linkding settings first.';
      return;
    }

    if (!confirm('This will perform a complete resync of all bookmarks. Continue?')) {
      return;
    }

    this.isFullSyncing = true;
    this.fullSyncProgress = 0;
    this.fullSyncTotal = 0;
    this.testStatus = 'idle';

    try {
      await SyncService.fullSync(this.settings, (current, total) => {
        this.fullSyncProgress = current;
        this.fullSyncTotal = total;
      });

      this.testStatus = 'success';
      this.testMessage = 'Full sync completed successfully!';
      
      this.dispatchEvent(new CustomEvent('sync-completed'));
    } catch (error) {
      console.error('Full sync failed:', error);
      this.testStatus = 'error';
      this.testMessage = `Full sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      this.isFullSyncing = false;
      this.fullSyncProgress = 0;
      this.fullSyncTotal = 0;
    }
  }

  private async handleExportData() {
    await this.dataManagementController.exportData();
  }

  private handleImportClick() {
    this.dataManagementController.startImport();
  }

  override render() {
    return html`
      <md-outlined-card class="settings-card">
        <div slot="header">
          <h2>Settings</h2>
        </div>
        
        <div class="form-section">
          <h3>Linkding Server</h3>
          
          <div class="form-group">
            <label for="url">Server URL</label>
            <md-outlined-text-field
              id="url"
              placeholder="https://your-linkding-instance.com"
              .value=${this.formData.linkding_url || ''}
              @input=${(e: any) => this.handleInputChange('linkding_url', e.target.value)}
            ></md-outlined-text-field>
          </div>
          
          <div class="form-group">
            <label for="token">API Token</label>
            <md-outlined-text-field
              id="token"
              type="password"
              placeholder="Your API token"
              .value=${this.formData.linkding_token || ''}
              @input=${(e: any) => this.handleInputChange('linkding_token', e.target.value)}
            ></md-outlined-text-field>
          </div>
          
          <div class="test-connection">
            <md-text-button
              @click=${this.handleTestConnection}
              ?disabled=${this.testStatus === 'testing'}
            >
              ${this.testStatus === 'testing' ? html`
                <md-circular-progress indeterminate slot="icon" class="circular-progress-16"></md-circular-progress>
                Testing...
              ` : 'Test Connection'}
            </md-text-button>
          </div>
          
          ${this.testStatus !== 'idle' ? html`
            <div class="status-message ${this.testStatus === 'success' ? 'status-success' : 'status-error'}">
              ${this.testMessage}
            </div>
          ` : ''}
        </div>
        
        <div class="form-section">
          <h3>Sync Settings</h3>
          
          <div class="form-group">
            <label for="auto-sync">Auto Sync</label>
            <md-switch
              id="auto-sync"
              ?selected=${this.formData.auto_sync}
              @change=${(e: any) => this.handleInputChange('auto_sync', e.target.selected)}
            >
              Automatically sync bookmarks
            </md-switch>
          </div>
          
          <div class="form-group">
            <label for="sync-interval">Sync Interval (minutes)</label>
            <md-outlined-text-field
              id="sync-interval"
              type="number"
              min="5"
              max="1440"
              .value=${this.formData.sync_interval?.toString() || '60'}
              @input=${(e: any) => this.handleInputChange('sync_interval', parseInt(e.target.value))}
            ></md-outlined-text-field>
          </div>

          <div class="sync-actions">
            <md-text-button
              @click=${this.handleFullSync}
              ?disabled=${this.isFullSyncing || !this.settings?.linkding_url || !this.settings?.linkding_token}
            >
              ${this.isFullSyncing ? 'Syncing...' : 'Force Full Sync'}
            </md-text-button>
            
            ${this.isFullSyncing ? html`
              <div class="sync-progress">
                <div class="sync-progress-text md-typescale-body-medium">
                  Syncing bookmarks... ${this.fullSyncProgress} / ${this.fullSyncTotal}
                </div>
                <md-linear-progress
                  .value=${this.fullSyncTotal > 0 ? (this.fullSyncProgress / this.fullSyncTotal) : 0}
                ></md-linear-progress>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="form-section">
          <h3>Reading Preferences</h3>
          
          <div class="form-group">
            <label for="reading-mode">Default Reading Mode</label>
            <md-outlined-select
              id="reading-mode"
              .value=${this.formData.reading_mode || 'readability'}
              @change=${(e: any) => this.handleInputChange('reading_mode', e.target.value)}
            >
              <md-select-option value="readability">Reader Mode</md-select-option>
              <md-select-option value="original">Original</md-select-option>
            </md-outlined-select>
          </div>
          
          <div class="form-group">
            <label for="theme-mode">Theme</label>
            <md-outlined-select
              id="theme-mode"
              .value=${this.formData.theme_mode || 'system'}
              @change=${(e: any) => this.handleInputChange('theme_mode', e.target.value)}
            >
              <md-select-option value="system">Follow System</md-select-option>
              <md-select-option value="light">Light</md-select-option>
              <md-select-option value="dark">Dark</md-select-option>
            </md-outlined-select>
          </div>
        </div>
        
        <div class="form-section">
          <h3>Developer Options</h3>
          
          <div class="form-group">
            <label for="debug-mode">Debug Mode</label>
            <md-switch
              id="debug-mode"
              ?selected=${this.formData.debug_mode}
              @change=${(e: any) => this.handleInputChange('debug_mode', e.target.selected)}
            >
              Enable debugging for sync troubleshooting
            </md-switch>
          </div>
        </div>
        
        <div class="form-actions">
          <md-filled-button
            @click=${this.handleSave}
            ?disabled=${this.isLoading}
          >
            Save Settings
          </md-filled-button>
        </div>
      </md-outlined-card>
      
      <div class="data-management">
        <h3>Data Management</h3>
        <p>Export and import your reading progress and app settings. This does not include your bookmarks (which are stored on the Linkding server) or cached website content.</p>
        
        <div class="data-actions">
          <md-text-button
            @click=${this.handleExportData}
            ?disabled=${this.dataManagementController.state.isExporting || this.dataManagementController.state.isImporting}
          >
            ${this.dataManagementController.state.isExporting ? html`
              <md-circular-progress indeterminate slot="icon" class="circular-progress-16"></md-circular-progress>
              Exporting...
            ` : 'Export Data'}
          </md-text-button>
          
          <md-text-button
            @click=${this.handleImportClick}
            ?disabled=${this.dataManagementController.state.isExporting || this.dataManagementController.state.isImporting}
          >
            ${this.dataManagementController.state.isImporting ? html`
              <md-circular-progress indeterminate slot="icon" class="circular-progress-16"></md-circular-progress>
              Importing...
            ` : 'Import Data'}
          </md-text-button>
        </div>
        
        ${this.dataManagementController.state.importResult ? html`
          <div class="import-result ${this.dataManagementController.state.importResult.success ? 'import-result-success' : 'import-result-error'}">
            <div>Import ${this.dataManagementController.state.importResult.success ? 'completed' : 'failed'}</div>
            <div class="import-details">
              Reading progress: ${this.dataManagementController.state.importResult.imported_progress_count} imported, ${this.dataManagementController.state.importResult.skipped_progress_count} skipped<br>
              ${this.dataManagementController.state.importResult.orphaned_progress_count > 0 ? html`Orphaned progress: ${this.dataManagementController.state.importResult.orphaned_progress_count} bookmarks not found<br>` : ''}
              Settings: ${this.dataManagementController.state.importResult.imported_settings ? 'updated' : 'not updated'}<br>
              Sync metadata: ${this.dataManagementController.state.importResult.imported_sync_metadata ? 'updated' : 'not updated'}
              ${this.dataManagementController.state.importResult.errors.length > 0 ? html`<br>Errors: ${this.dataManagementController.state.importResult.errors.join(', ')}` : ''}
            </div>
          </div>
        ` : ''}
      </div>
      
      <div class="danger-zone">
        <h3>Danger Zone</h3>
        <p>This will permanently delete all your bookmarks and reading progress stored locally.</p>
        <md-filled-button
          @click=${this.handleClearData}
          class="error-button"
        >
          Clear All Data
        </md-filled-button>
      </div>
    `;
  }
}