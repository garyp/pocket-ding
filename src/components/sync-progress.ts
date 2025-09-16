import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SyncState } from '../types';
import '@material/web/icon/icon.js';
import '@material/web/progress/linear-progress.js';

/**
 * Shared sync progress component that displays phase-aware sync progress.
 * Shows current phase name and progress with cycling 0-100% per phase.
 */
@customElement('sync-progress')
export class SyncProgress extends LitElement {
  @property({ type: Object }) syncState?: SyncState;
  @property({ type: Boolean }) showIcon = true;

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
    // Don't show sync progress if sync failed - let error notification handle it
    if (!this.syncState || !this.syncState.isSyncing || this.syncState.syncStatus === 'failed') {
      return html``;
    }

    const phaseText = this.#getPhaseDisplayText(this.syncState.syncPhase);
    const hasProgress = this.syncState.syncTotal > 0;
    const percentage = this.syncState.getPercentage();

    return html`
      <div class="sync-progress-container">
        <div class="sync-progress-text">
          <span class="sync-phase-text">
            ${phaseText}${hasProgress ? `: ${percentage}%` : '...'}
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