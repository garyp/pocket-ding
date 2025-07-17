import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SecurityService } from '../services/security-service';

@customElement('secure-iframe')
export class SecureIframe extends LitElement {
  @property({ type: String }) content = '';
  @property({ type: Boolean }) isLoading = false;
  @property({ type: Number }) readProgress = 0;
  @property({ type: Number }) scrollPosition = 0;
  @property({ type: Number }) iframeHeight = 0;
  @property({ type: Function }) onProgressUpdate: (progress: number, scrollPosition: number) => void = () => {};
  @property({ type: Function }) onContentLoad: () => void = () => {};
  @property({ type: Function }) onContentError: (error: string) => void = () => {};

  @state() private secureContent = '';
  @state() private iframeRef: HTMLIFrameElement | null = null;

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

  override updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('content') && this.content) {
      this.processContent();
    }
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

    this.iframeRef = iframe;

    // Set up iframe with secure content
    iframe.sandbox.add('allow-scripts', 'allow-same-origin');
    iframe.srcdoc = this.secureContent;

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