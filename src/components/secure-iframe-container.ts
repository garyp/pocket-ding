import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './secure-iframe';
import type { LocalBookmark } from '../types';

export interface SecureIframeContainerState {
  content: string;
  isLoading: boolean;
  readProgress: number;
  scrollPosition: number;
  iframeHeight: number;
}

export interface SecureIframeProps {
  content: string;
  isLoading: boolean;
  readProgress: number;
  scrollPosition: number;
  iframeHeight: number;
  onProgressUpdate: (progress: number, scrollPosition: number) => void;
  onContentLoad: () => void;
  onContentError: (error: string) => void;
}

@customElement('secure-iframe-container')
export class SecureIframeContainer extends LitElement {
  @property({ type: Object }) bookmark: LocalBookmark | null = null;
  @property({ type: String }) content = '';
  @property({ type: String }) readingMode: 'original' | 'readability' = 'readability';
  
  @state() private containerState: SecureIframeContainerState = {
    content: '',
    isLoading: false,
    readProgress: 0,
    scrollPosition: 0,
    iframeHeight: 0,
  };

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
    this.loadContent();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this.messageHandler);
  }

  override updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('content') || changedProperties.has('readingMode')) {
      this.loadContent();
    }
  }

  private loadContent() {
    if (!this.content) {
      this.containerState = {
        ...this.containerState,
        content: '',
        isLoading: false,
      };
      return;
    }

    this.containerState = {
      ...this.containerState,
      content: this.content,
      isLoading: true,
    };

    // Content is loaded, let the iframe component handle the rest
    this.containerState = {
      ...this.containerState,
      isLoading: false,
    };
  }

  private handleProgressUpdate(progress: number, scrollPosition: number) {
    this.containerState = {
      ...this.containerState,
      readProgress: progress,
      scrollPosition: scrollPosition,
    };

    // Dispatch event to parent (BookmarkReader)
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
        scrollPosition: this.containerState.scrollPosition,
      }, '*');
    }
  }

  private handleContentLoaded() {
    this.containerState = {
      ...this.containerState,
      isLoading: false,
    };

    this.dispatchEvent(new CustomEvent('content-loaded', {
      bubbles: true,
    }));
  }

  private handleContentError(error: string) {
    this.containerState = {
      ...this.containerState,
      isLoading: false,
    };

    this.dispatchEvent(new CustomEvent('content-error', {
      detail: { error },
      bubbles: true,
    }));
  }

  // Method to update scroll position from parent
  public updateScrollPosition(scrollPosition: number) {
    this.containerState = {
      ...this.containerState,
      scrollPosition,
    };
  }

  // Method to get current progress
  public getCurrentProgress(): { progress: number; scrollPosition: number } {
    return {
      progress: this.containerState.readProgress,
      scrollPosition: this.containerState.scrollPosition,
    };
  }

  override render() {
    return html`
      <secure-iframe
        .content=${this.containerState.content}
        .isLoading=${this.containerState.isLoading}
        .readProgress=${this.containerState.readProgress}
        .scrollPosition=${this.containerState.scrollPosition}
        .iframeHeight=${this.containerState.iframeHeight}
        .onProgressUpdate=${(progress: number, scrollPosition: number) => 
          this.handleProgressUpdate(progress, scrollPosition)}
        .onContentLoad=${() => this.handleContentLoaded()}
        .onContentError=${(error: string) => this.handleContentError(error)}
      ></secure-iframe>
    `;
  }
}