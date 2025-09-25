import { DebugService } from './debug-service';
import { SyncMessages } from '../types/sync-messages';

/**
 * Global service for managing page visibility and coordinating sync behavior.
 * Prevents service worker sync blocking when the app is in the foreground.
 */
export class PageVisibilityService {
  #isPageVisible = !document.hidden;
  #visibilityHandler: (() => void) | null = null;
  #serviceWorkerReady = false;
  #isInitialized = false;

  /**
   * Initialize the service and start monitoring page visibility
   */
  async initialize(): Promise<void> {
    if (this.#isInitialized) {
      return;
    }

    DebugService.logInfo('app', 'Initializing Page Visibility Service');

    // Setup page visibility monitoring
    this.#setupPageVisibilityHandler();

    // Wait for service worker to be ready
    await this.#setupServiceWorker();

    this.#isInitialized = true;
    DebugService.logInfo('app', 'Page Visibility Service initialized');
  }

  /**
   * Clean up event handlers
   */
  cleanup(): void {
    if (this.#visibilityHandler) {
      document.removeEventListener('visibilitychange', this.#visibilityHandler);
      this.#visibilityHandler = null;
    }
    this.#isInitialized = false;
  }

  /**
   * Get current page visibility state
   */
  isPageVisible(): boolean {
    return this.#isPageVisible;
  }

  /**
   * Setup service worker ready state
   */
  async #setupServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      DebugService.logWarning('app', 'Service Worker not supported');
      return;
    }

    try {
      await navigator.serviceWorker.ready;
      this.#serviceWorkerReady = true;
      DebugService.logInfo('app', 'Service worker ready for page visibility coordination');

      // Send initial visibility state
      this.#sendVisibilityMessage();
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'app', 'Failed to setup service worker');
    }
  };

  /**
   * Setup page visibility change handler
   */
  #setupPageVisibilityHandler(): void {
    this.#visibilityHandler = () => {
      const wasVisible = this.#isPageVisible;
      this.#isPageVisible = !document.hidden;

      if (wasVisible !== this.#isPageVisible) {
        DebugService.logInfo('app', `Page visibility changed: ${this.#isPageVisible ? 'visible' : 'hidden'}`);

        // Send visibility message to service worker
        this.#sendVisibilityMessage();
      }
    };

    document.addEventListener('visibilitychange', this.#visibilityHandler);
  };


  /**
   * Send visibility message to service worker
   */
  #sendVisibilityMessage(): void {
    if (!this.#serviceWorkerReady) {
      return;
    }

    try {
      const message = this.#isPageVisible
        ? SyncMessages.appForeground()
        : SyncMessages.appBackground();

      this.#postToServiceWorker(message);
      DebugService.logInfo('app', `Sent visibility message: ${message.type}`);
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'app', 'Failed to send visibility message to service worker');
    }
  };

  /**
   * Post message to service worker
   */
  async #postToServiceWorker(message: any): Promise<void> {
    if (!this.#serviceWorkerReady) {
      DebugService.logWarning('app', 'Service worker not ready for message posting');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        registration.active.postMessage(message);
      }
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'app', 'Failed to post message to service worker');
    }
  };

}

// Global singleton instance
export const pageVisibilityService = new PageVisibilityService();