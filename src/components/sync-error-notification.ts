import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';
import '@material/web/labs/card/outlined-card.js';

/**
 * Component that displays sync error notifications with dismiss and retry options.
 * Shows persistent notifications for background sync failures that users should be aware of.
 */
@customElement('sync-error-notification')
export class SyncErrorNotification extends LitElement {
  @property({ type: String }) error: string = '';
  @property({ type: Number }) retryCount: number = 0;
  @property({ type: Function }) onDismiss: (() => void) = () => {};
  @property({ type: Function }) onRetry: (() => void) = () => {};

  static override styles = css`
    :host {
      display: block;
      margin-bottom: 1rem;
    }

    .error-card {
      background: var(--md-sys-color-error-container);
      border: 1px solid var(--md-sys-color-error);
      border-radius: 12px;
      padding: 1rem;
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .error-icon {
      color: var(--md-sys-color-error);
      font-size: 1.25rem;
    }

    .error-title {
      color: var(--md-sys-color-on-error-container);
      font-weight: 500;
      font-size: 1rem;
      flex: 1;
    }

    .error-message {
      color: var(--md-sys-color-on-error-container);
      font-size: 0.875rem;
      line-height: 1.4;
      margin-bottom: 1rem;
    }

    .error-details {
      color: var(--md-sys-color-on-error-container);
      font-size: 0.75rem;
      opacity: 0.8;
      margin-bottom: 1rem;
    }

    .error-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .error-actions md-text-button {
      --md-text-button-container-color: transparent;
      --md-text-button-label-text-color: var(--md-sys-color-on-error-container);
      --md-text-button-hover-label-text-color: var(--md-sys-color-on-error-container);
      --md-text-button-focus-label-text-color: var(--md-sys-color-on-error-container);
      --md-text-button-pressed-label-text-color: var(--md-sys-color-on-error-container);
    }

    @media (max-width: 48rem) {
      .error-actions {
        flex-direction: column-reverse;
        align-items: stretch;
      }

      .error-actions md-text-button {
        justify-content: center;
      }
    }
  `;

  #getErrorDisplayText(error: string): string {
    // Convert technical error messages to user-friendly text
    if (error.includes('fetch')) {
      return 'Unable to connect to Linkding server. Please check your internet connection and server settings.';
    }
    if (error.includes('network') || error.includes('NetworkError')) {
      return 'Network connection error. Sync will automatically retry when connection is restored.';
    }
    if (error.includes('401') || error.includes('Unauthorized')) {
      return 'Authentication failed. Please check your API token in settings.';
    }
    if (error.includes('403') || error.includes('Forbidden')) {
      return 'Access denied. Please verify your API token has the required permissions.';
    }
    if (error.includes('404') || error.includes('Not Found')) {
      return 'Linkding server not found. Please check your server URL in settings.';
    }
    if (error.includes('timeout')) {
      return 'Connection timed out. The server may be busy or unreachable.';
    }

    // For other errors, show the original message but make it more user-friendly
    return error.replace(/^Error:\s*/, '').replace(/\.$/, '') + '.';
  }

  #handleDismiss() {
    this.onDismiss();
  }

  #handleRetry() {
    this.onRetry();
  }

  override render() {
    if (!this.error) {
      return html``;
    }

    const isNetworkError = this.error.includes('fetch') ||
                          this.error.includes('network') ||
                          this.error.includes('NetworkError') ||
                          this.error.includes('timeout');

    return html`
      <md-outlined-card class="error-card">
        <div class="error-header">
          <md-icon class="error-icon">error</md-icon>
          <div class="error-title">Sync Failed</div>
        </div>

        <div class="error-message">
          ${this.#getErrorDisplayText(this.error)}
        </div>

        ${this.retryCount > 0 ? html`
          <div class="error-details">
            Automatic retry attempts: ${this.retryCount}
            ${isNetworkError ? ' • Will retry automatically when connection is restored' : ''}
          </div>
        ` : ''}

        <div class="error-actions">
          <md-text-button @click=${this.#handleDismiss}>
            <md-icon slot="icon">close</md-icon>
            Dismiss
          </md-text-button>
          <md-text-button @click=${this.#handleRetry}>
            <md-icon slot="icon">refresh</md-icon>
            Retry Now
          </md-text-button>
        </div>
      </md-outlined-card>
    `;
  }
}