import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SecurityService } from '../services/security-service';

@customElement('secure-iframe')
export class SecureIframe extends LitElement {
  @property({ type: String }) content = '';
  @property({ type: Boolean }) isLoading = false;
  @property({ type: Function }) onContentLoad: () => void = () => {};
  @property({ type: Function }) onContentError: (error: string) => void = () => {};

  @state() private secureContent = '';
  @state() private readProgress = 0;
  @state() private scrollPosition = 0;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .iframe-container {
      width: 100%;
      height: 100%;
      position: relative;
    }

    .secure-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }

    .error-container {
      padding: 2rem;
      text-align: center;
      color: var(--sl-color-danger-600);
      background: var(--sl-color-danger-50);
      border: 1px solid var(--sl-color-danger-200);
      border-radius: 8px;
      margin: 1rem;
    }
  `;

  private messageHandler = (event: MessageEvent) => {
    // Security: Only accept messages from same origin
    if (event.origin !== window.location.origin) {
      return;
    }

    switch (event.data.type) {
      case 'progress-update':
        this.handleProgressUpdate(event.data.progress, event.data.scrollPosition);
        break;
      case 'request-scroll-position':
        this.handleScrollPositionRequest(event.source as Window);
        break;
      case 'content-loaded':
        this.handleContentLoaded();
        break;
      case 'content-error':
        this.handleContentError(event.data.error);
        break;
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this.messageHandler);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this.messageHandler);
  }

  override updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('content') && this.content) {
      this.processContent();
    }
  }

  private handleProgressUpdate(progress: number, scrollPosition: number) {
    this.readProgress = progress;
    this.scrollPosition = scrollPosition;

    // Dispatch event to parent
    this.dispatchEvent(new CustomEvent('progress-update', {
      detail: { progress, scrollPosition },
      bubbles: true,
    }));
  }

  private handleScrollPositionRequest(source: Window) {
    // Send the current scroll position to the iframe
    if (source) {
      source.postMessage({
        type: 'restore-scroll-position',
        scrollPosition: this.scrollPosition,
      }, '*');
    }
  }

  private handleContentLoaded() {
    this.onContentLoad();
    this.dispatchEvent(new CustomEvent('content-loaded', {
      bubbles: true,
    }));
  }

  private handleContentError(error: string) {
    this.onContentError(error);
    this.dispatchEvent(new CustomEvent('content-error', {
      detail: { error },
      bubbles: true,
    }));
  }

  // Method to update scroll position from parent
  public updateScrollPosition(scrollPosition: number) {
    this.scrollPosition = scrollPosition;
  }

  // Method to get current progress
  public getCurrentProgress(): { progress: number; scrollPosition: number } {
    return {
      progress: this.readProgress,
      scrollPosition: this.scrollPosition,
    };
  }

  private async processContent() {
    if (!this.content) {
      this.secureContent = '';
      return;
    }

    try {
      this.secureContent = await SecurityService.prepareSingleFileContent(this.content);
      await this.updateComplete;
      this.setupIframe();
    } catch (error) {
      console.error('Failed to process content:', error);
      this.onContentError(error instanceof Error ? error.message : 'Failed to process content');
    }
  }

  private setupIframe() {
    const iframe = this.shadowRoot?.querySelector('.secure-iframe') as HTMLIFrameElement;
    if (!iframe) return;

    // Handle iframe load event
    iframe.addEventListener('load', () => {
      this.onContentLoad();
    });

    // Handle iframe error event
    iframe.addEventListener('error', (event) => {
      console.error('Iframe error:', event);
      this.onContentError('Failed to load content in iframe');
    });
  }

  private renderError() {
    return html`
      <div class="error-container">
        <h3>Content Error</h3>
        <p>The content could not be loaded in secure mode.</p>
        <p>This may be due to security restrictions or malformed content.</p>
      </div>
    `;
  }

  private renderLoading() {
    return html`
      <div class="loading-overlay">
        <div>Loading secure content...</div>
      </div>
    `;
  }

  override render() {
    if (!this.content) {
      return html`
        <div class="error-container">
          <h3>No Content</h3>
          <p>No content available for secure rendering.</p>
        </div>
      `;
    }

    return html`
      <div class="iframe-container">
        <iframe
          class="secure-iframe"
          sandbox="allow-scripts allow-same-origin"
          srcdoc=${this.secureContent}
          style="width: 100%; height: 100%; border: none;"
        ></iframe>
        ${this.isLoading ? this.renderLoading() : ''}
      </div>
    `;
  }
}