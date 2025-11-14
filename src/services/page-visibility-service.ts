import { DebugService } from './debug-service';
import { SyncMessages } from '../types/sync-messages';

/**
 * Listener function for page visibility changes
 * @param isVisible - true if page is visible, false if hidden
 */
export type VisibilityChangeListener = (isVisible: boolean) => void;

/**
 * Global service for managing page visibility and coordinating sync behavior.
 * Prevents service worker sync blocking when the app is in the foreground.
 *
 * Uses a pub/sub pattern where components can subscribe to visibility changes
 * instead of adding their own event listeners, ensuring a single source of truth.
 */
export class PageVisibilityService {
  #isPageVisible = !document.hidden;
  #visibilityHandler: (() => void) | null = null;
  #serviceWorkerReady = false;
  #isInitialized = false;
  #listeners: Set<VisibilityChangeListener> = new Set();

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
    this.#listeners.clear();
    this.#isInitialized = false;
  }

  /**
   * Get current page visibility state
   */
  isPageVisible(): boolean {
    return this.#isPageVisible;
  }

  /**
   * Subscribe to page visibility changes
   * @param listener - Function to call when visibility changes
   * @returns Unsubscribe function
   */
  subscribe(listener: VisibilityChangeListener): () => void {
    this.#listeners.add(listener);

    // Call immediately with current state
    listener(this.#isPageVisible);

    // Return unsubscribe function
    return () => {
      this.#listeners.delete(listener);
    };
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
   * Also registers a default listener for service worker messaging
   */
  #setupPageVisibilityHandler(): void {
    // Register default listener for service worker messaging
    this.subscribe(() => {
      // Send visibility message to service worker
      this.#sendVisibilityMessage();
    });

    this.#visibilityHandler = () => {
      const wasVisible = this.#isPageVisible;
      this.#isPageVisible = !document.hidden;

      if (wasVisible !== this.#isPageVisible) {
        DebugService.logInfo('app', `Page visibility changed: ${this.#isPageVisible ? 'visible' : 'hidden'}`);

        // Notify all listeners
        this.#notifyListeners();
      }
    };

    document.addEventListener('visibilitychange', this.#visibilityHandler);
  };

  /**
   * Notify all subscribed listeners of visibility change
   */
  #notifyListeners(): void {
    this.#listeners.forEach(listener => {
      try {
        listener(this.#isPageVisible);
      } catch (error) {
        DebugService.logError(
          error instanceof Error ? error : new Error(String(error)),
          'app',
          'Error in visibility change listener'
        );
      }
    });
  }

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