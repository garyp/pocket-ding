import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { SettingsService } from '../services/settings-service';
import { DatabaseService } from '../services/database';
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
  #syncErrorQuery: ReactiveQueryController<string | null>;
  #syncRetryCountQuery: ReactiveQueryController<number>;

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

    // Initialize reactive queries for settings and error data
    this.#settingsQuery = new ReactiveQueryController(
      host,
      () => SettingsService.getSettings()
    );

    this.#syncErrorQuery = new ReactiveQueryController(
      host,
      () => DatabaseService.getLastSyncError()
    );

    this.#syncRetryCountQuery = new ReactiveQueryController(
      host,
      () => DatabaseService.getSyncRetryCount()
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

    // Give the service worker a brief moment to respond with current state
    // If no response comes within 100ms, check if we need to resume sync
    setTimeout(() => {
      // Only update if we haven't received any sync status updates yet
      if (this._syncState.syncStatus === 'idle' && !this._syncState.isSyncing) {
        DebugService.logInfo('sync', 'No sync status response from service worker - checking if sync needs to resume');
        this.#checkAndResumeSync();
      }
    }, 100);
  }

  /**
   * Check if there are bookmarks that still need syncing and resume if necessary
   */
  async #checkAndResumeSync() {
    try {
      // Check if there are bookmarks that still need asset sync
      const bookmarksNeedingAssetSync = await DatabaseService.getBookmarksNeedingAssetSync();
      const bookmarksNeedingReadSync = await DatabaseService.getBookmarksNeedingReadSync();

      if (bookmarksNeedingAssetSync.length > 0 || bookmarksNeedingReadSync.length > 0) {
        DebugService.logInfo('sync', `Resuming sync: ${bookmarksNeedingAssetSync.length} assets, ${bookmarksNeedingReadSync.length} read status`);
        await this.requestSync(false);
      }
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'sync', 'Failed to check for resume sync');
    }
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
          isSyncing: message.status === 'starting' || message.status === 'syncing' || message.status === 'paused'
        };

        // Handle special sync statuses
        if (message.status === 'interrupted') {
          DebugService.logInfo('sync', 'Interrupted sync detected - resuming');
          this.#checkAndResumeSync();
        }

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

        // Log progress restoration for debugging
        DebugService.logInfo('sync', `Sync progress restored: ${message.current}/${message.total} (${message.phase})`);

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
   * Get the current sync state including error information
   */
  getSyncState(): SyncState {
    const state: SyncState = { ...this._syncState };

    const lastError = this.#syncErrorQuery.value;
    if (lastError) {
      state.lastError = lastError;
    }

    const retryCount = this.#syncRetryCountQuery.value;
    if (retryCount && retryCount > 0) {
      state.retryCount = retryCount;
    }

    return state;
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
   * Pause ongoing sync operation
   */
  async pauseSync(): Promise<void> {
    if (!this._syncState.isSyncing || this._syncState.syncStatus === 'paused') return;

    await this.postToServiceWorker(SyncMessages.pauseSync('User requested pause'));
  }

  /**
   * Resume paused sync operation
   */
  async resumeSync(): Promise<void> {
    if (this._syncState.syncStatus !== 'paused') return;

    await this.postToServiceWorker(SyncMessages.resumeSync());
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
   * Dismiss the current sync error
   */
  async dismissSyncError(): Promise<void> {
    try {
      await DatabaseService.setLastSyncError(null);
      await DatabaseService.resetSyncRetryCount();
      this.#host.requestUpdate();
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'sync', 'Failed to dismiss sync error');
    }
  }

  /**
   * Check if there's a current sync error to display
   */
  hasSyncError(): boolean {
    return !!(this.#syncErrorQuery.value && !this.isSyncing());
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
