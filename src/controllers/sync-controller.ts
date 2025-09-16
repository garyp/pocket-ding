import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { SettingsService } from '../services/settings-service';
import { ReactiveQueryController } from './reactive-query-controller';
import { SyncMessages, type SyncMessage } from '../types/sync-messages';
import { DebugService } from '../services/debug-service';
import type { AppSettings, SyncState, SyncControllerOptions } from '../types';


/**
 * Reactive controller that manages sync service integration and state.
 * Handles all sync-related event listeners, state management, and provides
 * methods for triggering sync operations.
 */
export class SyncController implements ReactiveController {
  #host: ReactiveControllerHost;
  #serviceWorkerReady = false;
  #messageHandler: ((event: MessageEvent) => void) | null = null;
  #options: SyncControllerOptions;
  #settingsQuery: ReactiveQueryController<AppSettings | undefined>;

  // Reactive sync state
  private _syncState: SyncState = {
    isSyncing: false,
    syncProgress: 0,
    syncTotal: 0,
    syncedBookmarkIds: new Set<number>(),
    syncStatus: 'idle',
    getPercentage(): number {
      return this.syncTotal > 0 ? Math.round((this.syncProgress / this.syncTotal) * 100) : 0;
    }
  };

  constructor(host: ReactiveControllerHost, options: SyncControllerOptions = {}) {
    this.#host = host;
    this.#options = options;

    // Initialize reactive query for settings data
    this.#settingsQuery = new ReactiveQueryController(
      host,
      () => SettingsService.getSettings()
    );

    host.addController(this);
  }

  hostConnected(): void {
    this.initializeSync();
  }

  hostDisconnected(): void {
    this.cleanupSync();
  }

  private async initializeSync() {
    // Setup service worker message handler
    await this.setupServiceWorker();
    
    // Check for ongoing sync status
    if (this.#serviceWorkerReady) {
      await this.checkSyncStatus();
    }
  }

  private cleanupSync() {
    // Clean up message handler
    if (this.#messageHandler && 'serviceWorker' in navigator && navigator.serviceWorker?.removeEventListener) {
      navigator.serviceWorker.removeEventListener('message', this.#messageHandler);
      this.#messageHandler = null;
    }
  }

  private async setupServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      DebugService.logWarning('sync', 'Service Worker not supported');
      this.#notifyError('Background sync is not supported in your browser');
      return;
    }

    try {
      await navigator.serviceWorker.ready;
      this.#serviceWorkerReady = true;

      // Setup message handler
      this.#messageHandler = (event: MessageEvent) => {
        this.handleServiceWorkerMessage(event.data as SyncMessage);
      };
      navigator.serviceWorker.addEventListener('message', this.#messageHandler);

      // Check if periodic sync should be enabled based on settings
      const settings = this.settings;
      if (settings?.auto_sync) {
        this.postToServiceWorker(SyncMessages.registerPeriodicSync(true));
      }
    } catch (error) {
      DebugService.logSyncError(error instanceof Error ? error : new Error(String(error)), { context: 'Service worker setup failed' });
      this.#notifyError('Failed to initialize sync service');
    }
  }

  private async checkSyncStatus() {
    // Request current sync status from service worker
    this.postToServiceWorker(SyncMessages.checkSyncPermission());
  }

  private handleServiceWorkerMessage(message: SyncMessage) {
    switch (message.type) {
      case 'SW_LOG':
        // Forward service worker logs to DebugService
        switch (message.level) {
          case 'info':
            DebugService.logInfo('sync', `[SW] ${message.operation}: ${message.message}`, message.details);
            break;
          case 'warn':
            DebugService.logWarning('sync', `[SW] ${message.operation}: ${message.message}`, message.details);
            break;
          case 'error':
            DebugService.logError(new Error(`[SW] ${message.operation}: ${message.message}`), 'sync', 'Service worker error', { details: message.error || message.details });
            break;
        }
        break;

      case 'SYNC_STATUS':
        this._syncState = {
          ...this._syncState,
          syncStatus: message.status,
          isSyncing: message.status === 'starting' || message.status === 'syncing'
        };
        this.#host.requestUpdate();
        break;

      case 'SYNC_PROGRESS':
        this._syncState = {
          ...this._syncState,
          isSyncing: true,
          syncProgress: message.current,
          syncTotal: message.total,
          syncPhase: message.phase,
          syncStatus: 'syncing'
        };
        this.#host.requestUpdate();
        break;

      case 'SYNC_COMPLETE':
        // Reset phase tracking on completion
        this._syncState = {
          ...this._syncState,
          isSyncing: false,
          syncProgress: 0,
          syncTotal: 0,
          syncPhase: 'complete',
          syncStatus: message.success ? 'completed' : 'failed'
        };
        this.#host.requestUpdate();

        if (message.success && this.#options.onSyncCompleted) {
          this.#options.onSyncCompleted();
        }

        // Clear synced highlights after delay
        setTimeout(() => {
          this.clearSyncedHighlights();
        }, 3000);
        break;

      case 'SYNC_ERROR':
        DebugService.logSyncError(new Error(message.error || 'Unknown sync error'), { phase: this._syncState.syncPhase });
        this.#notifyError(`Sync failed: ${message.error || 'Unknown error'}`);
        // Reset phase tracking on error
        this._syncState = {
          ...this._syncState,
          isSyncing: false,
          syncProgress: 0,
          syncTotal: 0,
          syncStatus: 'failed',
          syncPhase: undefined,
        };
        this.#host.requestUpdate();

        if (this.#options.onSyncError) {
          this.#options.onSyncError(new Error(message.error));
        }
        break;
    }
  }

  private async postToServiceWorker(message: SyncMessage) {
    if (!this.#serviceWorkerReady) {
      DebugService.logWarning('sync', 'Service worker not ready for message posting');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        registration.active.postMessage(message);
      }
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'sync', 'Failed to post message to service worker');
    }
  }

  // Public API methods

  /**
   * Get current settings from the reactive query
   */
  get settings() {
    return this.#settingsQuery.value ?? null;
  }

  /**
   * Check if settings are currently loading
   */
  get isSettingsLoading() {
    return this.#settingsQuery.loading;
  }

  /**
   * Get the current sync state
   */
  getSyncState(): SyncState {
    return { ...this._syncState };
  }

  /**
   * Request a sync operation
   */
  async requestSync(fullSync = false): Promise<void> {
    if (this._syncState.isSyncing) return;

    try {
      // Check if settings are still loading
      if (this.isSettingsLoading) {
        DebugService.logWarning('sync', 'Cannot sync while settings are loading');
        this.#notifyError('Please wait for settings to load');
        return;
      }

      // Check if service worker is ready
      if (!this.#serviceWorkerReady) {
        DebugService.logWarning('sync', 'Service worker not ready for sync request');
        this.#notifyError('Sync service is not ready. Please try again.');
        return;
      }

      // Use reactive settings instead of direct DatabaseService call
      const settings = this.settings;
      if (settings) {
        // Show immediate UI feedback and reset phase tracking
        this._syncState = {
          ...this._syncState,
          isSyncing: true,
          syncProgress: 0,
          syncTotal: 0,
          syncedBookmarkIds: new Set<number>(),
          syncStatus: 'starting',
          syncPhase: undefined,
        };
        this.#host.requestUpdate();

        // Request sync from service worker
        await this.postToServiceWorker(SyncMessages.requestSync(true, fullSync));
      } else {
        DebugService.logWarning('sync', 'Cannot sync without valid Linkding settings');
        this.#notifyError('Please configure your Linkding settings first');
      }
    } catch (error) {
      DebugService.logSyncError(error instanceof Error ? error : new Error(String(error)), { fullSync });
      this.#notifyError('Failed to start sync');
      // Reset sync state on error
      this._syncState = {
        ...this._syncState,
        isSyncing: false,
        syncProgress: 0,
        syncTotal: 0,
        syncStatus: 'failed'
      };
      this.#host.requestUpdate();
    }
  }

  /**
   * Cancel ongoing sync operation
   */
  async cancelSync(): Promise<void> {
    if (!this._syncState.isSyncing) return;

    await this.postToServiceWorker(SyncMessages.cancelSync('User requested cancellation'));
  }

  /**
   * Enable or disable periodic background sync
   */
  async setPeriodicSync(enabled: boolean): Promise<void> {
    await this.postToServiceWorker(SyncMessages.registerPeriodicSync(enabled));
  }

  /**
   * Check if sync is currently in progress
   */
  isSyncing(): boolean {
    return this._syncState.isSyncing;
  }


  /**
   * Get IDs of recently synced bookmarks
   */
  getSyncedBookmarkIds(): Set<number> {
    return new Set(this._syncState.syncedBookmarkIds);
  }

  /**
   * Clear the synced bookmark highlights immediately
   */
  clearSyncedHighlights(): void {
    this._syncState = {
      ...this._syncState,
      syncedBookmarkIds: new Set<number>(),
    };
    this.#host.requestUpdate();
  }

  /**
   * Notify the host about errors
   */
  #notifyError(message: string): void {
    // Call the error callback if provided
    if (this.#options.onSyncError) {
      this.#options.onSyncError(new Error(message));
    }
    
    // Dispatch a custom event that components can listen to
    if ('dispatchEvent' in this.#host) {
      (this.#host as unknown as EventTarget).dispatchEvent(new CustomEvent('sync-error', { 
        detail: { message },
        bubbles: true,
        composed: true
      }));
    }
  }
}
