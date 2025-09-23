import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { SettingsService } from '../services/settings-service';
import { DatabaseService } from '../services/database';
import { ReactiveQueryController } from './reactive-query-controller';
import type { SyncMessage } from '../types/sync-messages';
import { DebugService } from '../services/debug-service';
import { SyncWorkerManager } from '../services/sync-worker-manager';
import { pageVisibilityService } from '../services/page-visibility-service';
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
  #syncWorkerManager: SyncWorkerManager;

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

    // Initialize sync worker manager with typed callbacks
    this.#syncWorkerManager = new SyncWorkerManager({
      onProgress: (current, total, phase) => {
        this._syncState = {
          ...this._syncState,
          syncProgress: current,
          syncTotal: total,
          syncPhase: phase,
          syncStatus: 'syncing'
        };
        this.#host.requestUpdate();
      },
      onComplete: (processed) => {
        this._syncState = {
          ...this._syncState,
          isSyncing: false,
          syncProgress: processed || this._syncState.syncProgress,
          syncTotal: processed || this._syncState.syncTotal,
          syncPhase: 'complete',
          syncStatus: 'completed'
        };
        this.#host.requestUpdate();

        if (this.#options.onSyncCompleted) {
          this.#options.onSyncCompleted();
        }

        // Clear synced highlights after delay
        setTimeout(() => {
          this.clearSyncedHighlights();
        }, 3000);
      },
      onError: (error, _recoverable) => {
        DebugService.logSyncError(new Error(error), { phase: this._syncState.syncPhase });
        this.#notifyError('Unable to sync your bookmarks. Please check your connection and try again.');
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
          this.#options.onSyncError(new Error(error));
        }
      },
      onCancelled: (processed) => {
        this._syncState = {
          ...this._syncState,
          isSyncing: false,
          syncProgress: processed || 0,
          syncTotal: processed || 0,
          syncStatus: 'idle',
          syncPhase: undefined,
        };
        this.#host.requestUpdate();
      }
    });

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

    // Clean up sync worker manager
    this.#syncWorkerManager.cleanup();
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

      // Note: Periodic sync state is now managed globally by PageVisibilityService
      // based on page visibility to prevent service worker blocking when app is visible
    } catch (error) {
      DebugService.logSyncError(error instanceof Error ? error : new Error(String(error)), { context: 'Service worker setup failed' });
      this.#notifyError('Unable to set up background sync. Please refresh the page and try again.');
    }
  }

  private async checkSyncStatus() {
    // Check if there are pending sync operations that need to be resumed
    DebugService.logInfo('sync', 'Checking if sync needs to resume after app startup');
    this.#checkAndResumeSync();
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
        // Forward service worker logs to DebugService for debugging
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
        // Only handle interrupted status for resuming sync when app returns from background
        if (message.status === 'interrupted') {
          DebugService.logInfo('sync', 'Interrupted sync detected - resuming');
          this.#checkAndResumeSync();
        }
        // Note: Other status updates (syncing, completed, failed) from background sync are ignored
        // since background sync should be invisible to the user. Foreground sync uses SyncWorkerManager.
        break;

      case 'SYNC_PROGRESS':
      case 'SYNC_COMPLETE':
      case 'SYNC_ERROR':
        // Background sync progress/complete/error messages are ignored for UI updates
        // Background sync should be invisible to the user. Foreground sync uses SyncWorkerManager.
        DebugService.logInfo('sync', `Background sync message ignored: ${message.type}`, { messageType: message.type });
        break;
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
   * Request a sync operation (directly via sync worker, bypassing service worker)
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

        // Start sync directly via sync worker manager (bypasses service worker)
        DebugService.logInfo('sync', 'Starting manual sync directly via worker', { fullSync });
        await this.#syncWorkerManager.startSync(settings, fullSync);
      } else {
        DebugService.logWarning('sync', 'Cannot sync without valid Linkding settings');
        this.#notifyError('Please configure your Linkding settings first');
      }
    } catch (error) {
      DebugService.logSyncError(error instanceof Error ? error : new Error(String(error)), { fullSync });
      this.#notifyError('Unable to start sync. Please check your connection and settings.');
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

    // Cancel sync directly via worker manager
    DebugService.logInfo('sync', 'Cancelling manual sync via worker');
    this.#syncWorkerManager.cancelSync();
  }

  /**
   * Refresh periodic sync state coordination
   * Triggers PageVisibilityService to re-evaluate periodic sync state based on current settings and page visibility
   */
  async refreshPeriodicSyncState(): Promise<void> {
    // Trigger coordination update which will read current settings and apply visibility-based logic
    try {
      await pageVisibilityService.updatePeriodicSyncState();
    } catch (error) {
      // Log error for debugging but re-throw to let callers handle failures appropriately
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'sync', 'Failed to refresh periodic sync state');
      throw error;
    }
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
