import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SyncState } from '../types';
import '@material/web/icon/icon.js';
import '@material/web/progress/linear-progress.js';

/**
 * Shared sync progress component that displays phase-aware sync progress.
 * Shows current phase name and progress with cycling 0-100% per phase.
 * Also displays multi-tab coordination status.
 */
@customElement('sync-progress')
export class SyncProgress extends LitElement {
  @property({ type: Object }) syncState?: SyncState;
  @property({ type: Boolean }) showIcon = true;
  @property({ type: Boolean }) syncLockAvailable = true;

  static override styles = css`
    :host {
      display: block;
    }

    .sync-progress-container {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 0.75rem;
      border-radius: 12px;
      background: var(--md-sys-color-primary-container);
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    .sync-progress-text {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      color: var(--md-sys-color-on-primary-container);
    }

    .sync-phase-text {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .sync-badge {
      animation: pulse 2s infinite;
    }

    .multi-tab-message {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--md-sys-color-on-primary-container);
    }

    .multi-tab-message md-icon {
      color: var(--md-sys-color-primary);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;

  #getPhaseDisplayText(phase?: string): string {
    switch (phase) {
      case 'bookmarks':
        return 'Syncing bookmarks';
      case 'archived-bookmarks':
        return 'Syncing archived bookmarks';
      case 'assets':
        return 'Downloading assets';
      case 'read-status':
        return 'Syncing read status';
      case 'complete':
        return 'Sync complete';
      default:
        return 'Starting sync';
    }
  }

  override render() {
    // Show multi-tab message if sync lock is not available (sync running in another tab)
    if (!this.syncLockAvailable && (!this.syncState || !this.syncState.isSyncing)) {
      return html`
        <div class="sync-progress-container">
          <div class="multi-tab-message">
            <md-icon>sync</md-icon>
            <span>Sync in progress in another tab</span>
          </div>
        </div>
      `;
    }

    // Show progress for syncing or paused states
    if (!this.syncState || this.syncState.syncStatus === 'failed') {
      return html``;
    }

    // Show UI for manually paused state even when not syncing
    const isPaused = this.syncState.syncStatus === 'paused';
    if (!this.syncState.isSyncing && !isPaused) {
      return html``;
    }

    const phaseText = this.#getPhaseDisplayText(this.syncState.syncPhase);
    const hasProgress = this.syncState.syncTotal > 0;

    return html`
      <div class="sync-progress-container">
        <div class="sync-progress-text">
          <span class="sync-phase-text">
            ${phaseText}${hasProgress ? `: ${this.syncState.syncProgress}/${this.syncState.syncTotal}` : '...'}
          </span>
          ${this.showIcon ? html`<md-icon class="sync-badge">sync</md-icon>` : ''}
        </div>
        <md-linear-progress
          .value=${hasProgress ? (this.syncState.syncProgress / this.syncState.syncTotal) : 0}
          ?indeterminate=${!hasProgress}
        ></md-linear-progress>
      </div>
    `;
  }
}