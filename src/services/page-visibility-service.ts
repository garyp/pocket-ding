import { DebugService } from './debug-service';
import { SettingsService } from './settings-service';
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
  #setupServiceWorker = async (): Promise<void> => {
    if (!('serviceWorker' in navigator)) {
      DebugService.logWarning('app', 'Service Worker not supported');
      return;
    }

    try {
      await navigator.serviceWorker.ready;
      this.#serviceWorkerReady = true;
      DebugService.logInfo('app', 'Service worker ready for page visibility coordination');

      // Send initial visibility state and set periodic sync
      this.#sendVisibilityMessage();
      await this.updatePeriodicSyncState();
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'app', 'Failed to setup service worker');
    }
  };

  /**
   * Setup page visibility change handler
   */
  #setupPageVisibilityHandler = (): void => {
    this.#visibilityHandler = () => {
      const wasVisible = this.#isPageVisible;
      this.#isPageVisible = !document.hidden;

      if (wasVisible !== this.#isPageVisible) {
        DebugService.logInfo('app', `Page visibility changed: ${this.#isPageVisible ? 'visible' : 'hidden'}`);

        // Send visibility message to service worker
        this.#sendVisibilityMessage();

        // Update periodic sync state
        this.updatePeriodicSyncState();
      }
    };

    document.addEventListener('visibilitychange', this.#visibilityHandler);
  };

  /**
   * Update periodic sync state based on page visibility and settings
   */
  async updatePeriodicSyncState(): Promise<void> {
    if (!this.#serviceWorkerReady) {
      return;
    }

    try {
      const settings = await SettingsService.getSettings();

      if (!settings?.auto_sync) {
        // Auto sync is disabled, ensure periodic sync is off
        await this.#postToServiceWorker(SyncMessages.registerPeriodicSync(false));
        DebugService.logInfo('app', 'Periodic sync disabled (auto_sync=false)');
        return;
      }

      // Enable periodic sync only when page is hidden (background)
      // When page is visible (foreground), disable it to prevent service worker blocking
      const enablePeriodicSync = !this.#isPageVisible;
      await this.#postToServiceWorker(SyncMessages.registerPeriodicSync(enablePeriodicSync));

      DebugService.logInfo('app', `Periodic sync ${enablePeriodicSync ? 'enabled' : 'disabled'} (page ${this.#isPageVisible ? 'visible' : 'hidden'})`);
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'app', 'Failed to update periodic sync state');
    }
  }

  /**
   * Send visibility message to service worker
   */
  #sendVisibilityMessage = (): void => {
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
  #postToServiceWorker = async (message: any): Promise<void> => {
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

  /**
   * Test-specific interface that provides safe access to internal methods
   * without creating memory leaks through `this` references
   */
  get testInterface() {
    if (process.env['NODE_ENV'] === 'test') {
      return {
        setupPageVisibilityHandler: () => this.#setupPageVisibilityHandler(),
        postToServiceWorker: (message: any) => this.#postToServiceWorker(message),
      };
    }
    return null;
  }
}

// Global singleton instance
export const pageVisibilityService = new PageVisibilityService();