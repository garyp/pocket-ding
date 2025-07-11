import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LinkdingAPI } from '../services/linkding-api';
import { DatabaseService } from '../services/database';
import { AppSettings } from '../types';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/card/card.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';

@customElement('settings-panel')
export class SettingsPanel extends LitElement {
  @property({ type: Object }) settings: AppSettings | null = null;
  @state() private formData: Partial<AppSettings> = {};
  @state() private isLoading = false;
  @state() private testStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
  @state() private testMessage = '';

  static styles = css`
    :host {
      display: block;
      padding: 1rem;
      max-width: 600px;
      margin: 0 auto;
    }

    .settings-card {
      margin-bottom: 2rem;
    }

    .form-section {
      margin-bottom: 2rem;
    }

    .form-section h3 {
      margin-bottom: 1rem;
      color: var(--sl-color-neutral-900);
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--sl-color-neutral-700);
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
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
      border: 1px solid var(--sl-color-danger-300);
      background: var(--sl-color-danger-50);
      padding: 1rem;
      border-radius: 8px;
      margin-top: 2rem;
    }

    .danger-zone h3 {
      color: var(--sl-color-danger-700);
      margin-bottom: 1rem;
    }

    .danger-zone p {
      color: var(--sl-color-danger-600);
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      :host {
        padding: 0.5rem;
      }
      
      .form-actions {
        flex-direction: column;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.initializeForm();
  }

  private initializeForm() {
    this.formData = {
      linkding_url: this.settings?.linkding_url || '',
      linkding_token: this.settings?.linkding_token || '',
      sync_interval: this.settings?.sync_interval || 60,
      auto_sync: this.settings?.auto_sync ?? true,
      reading_mode: this.settings?.reading_mode || 'readability'
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
      const isConnected = await LinkdingAPI.testConnection(testSettings);
      
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
        reading_mode: this.formData.reading_mode || 'readability'
      };

      await DatabaseService.saveSettings(settings);
      
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

  render() {
    return html`
      <sl-card class="settings-card">
        <div slot="header">
          <h2>Settings</h2>
        </div>
        
        <div class="form-section">
          <h3>Linkding Server</h3>
          
          <div class="form-group">
            <label for="url">Server URL</label>
            <sl-input
              id="url"
              placeholder="https://your-linkding-instance.com"
              .value=${this.formData.linkding_url || ''}
              @sl-input=${(e: any) => this.handleInputChange('linkding_url', e.target.value)}
            ></sl-input>
          </div>
          
          <div class="form-group">
            <label for="token">API Token</label>
            <sl-input
              id="token"
              type="password"
              placeholder="Your API token"
              .value=${this.formData.linkding_token || ''}
              @sl-input=${(e: any) => this.handleInputChange('linkding_token', e.target.value)}
            ></sl-input>
          </div>
          
          <div class="test-connection">
            <sl-button
              variant="default"
              size="small"
              @click=${this.handleTestConnection}
              ?disabled=${this.testStatus === 'testing'}
            >
              ${this.testStatus === 'testing' ? html`
                <sl-spinner style="font-size: 1rem;"></sl-spinner>
                Testing...
              ` : 'Test Connection'}
            </sl-button>
          </div>
        </div>
        
        <div class="form-section">
          <h3>Sync Settings</h3>
          
          <div class="form-group">
            <label for="auto-sync">Auto Sync</label>
            <sl-switch
              id="auto-sync"
              ?checked=${this.formData.auto_sync}
              @sl-change=${(e: any) => this.handleInputChange('auto_sync', e.target.checked)}
            >
              Automatically sync bookmarks
            </sl-switch>
          </div>
          
          <div class="form-group">
            <label for="sync-interval">Sync Interval (minutes)</label>
            <sl-input
              id="sync-interval"
              type="number"
              min="5"
              max="1440"
              .value=${this.formData.sync_interval?.toString() || '60'}
              @sl-input=${(e: any) => this.handleInputChange('sync_interval', parseInt(e.target.value))}
            ></sl-input>
          </div>
        </div>
        
        <div class="form-section">
          <h3>Reading Preferences</h3>
          
          <div class="form-group">
            <label for="reading-mode">Default Reading Mode</label>
            <sl-select
              id="reading-mode"
              .value=${this.formData.reading_mode || 'readability'}
              @sl-change=${(e: any) => this.handleInputChange('reading_mode', e.target.value)}
            >
              <sl-option value="readability">Reader Mode</sl-option>
              <sl-option value="original">Original</sl-option>
            </sl-select>
          </div>
        </div>

        ${this.testStatus !== 'idle' ? html`
          <sl-alert
            variant=${this.testStatus === 'success' ? 'success' : this.testStatus === 'error' ? 'danger' : 'neutral'}
            open
            class="status-message"
          >
            ${this.testMessage}
          </sl-alert>
        ` : ''}
        
        <div class="form-actions">
          <sl-button
            variant="primary"
            @click=${this.handleSave}
            ?loading=${this.isLoading}
            ?disabled=${this.isLoading}
          >
            Save Settings
          </sl-button>
        </div>
      </sl-card>
      
      <div class="danger-zone">
        <h3>Danger Zone</h3>
        <p>This will permanently delete all your bookmarks and reading progress stored locally.</p>
        <sl-button
          variant="danger"
          @click=${this.handleClearData}
        >
          Clear All Data
        </sl-button>
      </div>
    `;
  }
}