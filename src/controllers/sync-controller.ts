import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { SettingsService } from '../services/settings-service';
import { DatabaseService } from '../services/database';
import { ReactiveQueryController } from './reactive-query-controller';
import type { SyncMessage } from '../types/sync-messages';
import { DebugService } from '../services/debug-service';
import { SyncWorkerManager } from '../services/sync-worker-manager';
import { pageVisibilityService } from '../services/page-visibility-service';
import { WebLockCoordinator } from '../services/web-lock-coordinator';
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
  #webLockCoordinator: WebLockCoordinator;
  #syncLockStatus: boolean = true; // Assume available until checked
  #lockPollingInterval: number | null = null;
  #beforeUnloadHandler: ((event: BeforeUnloadEvent) => void) | null = null;

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

    // Initialize web lock coordinator for multi-tab safety
    this.#webLockCoordinator = new WebLockCoordinator();

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
      onError: (error) => {
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
    this.#setupBeforeUnloadHandler();
  }

  hostDisconnected(): void {
    this.cleanupSync();
    this.#cleanupBeforeUnloadHandler();
  }

  private async initializeSync() {
    // Setup service worker message handler
    await this.setupServiceWorker();

    // Start lock status polling for multi-tab coordination
    this.#startLockPolling();

    // Check for ongoing sync status
    if (this.#serviceWorkerReady) {
      await this.checkSyncStatus();
    }
  }

  private cleanupSync() {
    // Stop lock polling
    this.#stopLockPolling();

    // Clean up message handler
    if (this.#messageHandler && 'serviceWorker' in navigator && navigator.serviceWorker?.removeEventListener) {
      navigator.serviceWorker.removeEventListener('message', this.#messageHandler);
      this.#messageHandler = null;
    }

    // Clean up sync worker manager
    this.#syncWorkerManager.cleanup();
  }

  /**
   * Setup beforeunload handler to register background sync when sync is in progress
   * Enhanced for Phase 1.2 with comprehensive sync state coordination
   */
  #setupBeforeUnloadHandler(): void {
    this.#beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      // Only register background sync if sync is currently in progress
      if (this._syncState.isSyncing && this.#serviceWorkerReady) {
        try {
          // Phase 1.2: Preserve sync state for service worker resume
          this.#preserveSyncStateForBackgroundResume();

          // Register background sync to continue when app is closed
          this.#registerBackgroundSync();

          // Phase 1.2: Handle sync worker graceful termination
          this.#gracefullyTerminateSyncWorker();

          // Show browser warning that work may be lost
          event.preventDefault();
          event.returnValue = 'Sync is in progress. Closing now may interrupt the sync operation.';
          return event.returnValue;
        } catch (error) {
          DebugService.logWarning('sync', 'Failed to handle beforeunload sync coordination', { error });
        }
      }
    };

    window.addEventListener('beforeunload', this.#beforeUnloadHandler);
  }

  /**
   * Cleanup beforeunload handler
   */
  #cleanupBeforeUnloadHandler(): void {
    if (this.#beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.#beforeUnloadHandler);
      this.#beforeUnloadHandler = null;
    }
  }

  /**
   * Preserve sync state for service worker background resume
   */
  #preserveSyncStateForBackgroundResume(): void {
    if (!this.#serviceWorkerReady || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      // Send current sync state to service worker for background resume
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'PRESERVE_SYNC_STATE',
          syncState: {
            phase: this._syncState.syncPhase,
            progress: this._syncState.syncProgress,
            total: this._syncState.syncTotal,
            status: this._syncState.syncStatus
          },
          settings: this.settings,
          timestamp: Date.now()
        });
        DebugService.logInfo('sync', 'Sync state preserved for background resume');
      }
    } catch (error) {
      DebugService.logWarning('sync', 'Failed to preserve sync state', { error });
    }
  }

  /**
   * Register background sync when app is about to be closed
   * Updated to use REQUEST_SYNC message that service worker handles
   */
  #registerBackgroundSync(): void {
    if (!this.#serviceWorkerReady || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      // Use REQUEST_SYNC message for background sync registration
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'REQUEST_SYNC',
          immediate: false, // Background sync, not immediate
          priority: 'normal',
          fullSync: false // Resume current sync, not full sync
        });
        DebugService.logInfo('sync', 'Background sync registered for continuation');
      }
    } catch (error) {
      DebugService.logWarning('sync', 'Failed to register background sync', { error });
    }
  }

  /**
   * Handle sync worker graceful termination when app is closing
   */
  #gracefullyTerminateSyncWorker(): void {
    try {
      // Cancel sync worker gracefully to release resources
      // The service worker will take over with background sync
      if (this._syncState.isSyncing) {
        DebugService.logInfo('sync', 'Gracefully terminating sync worker for background handoff');
        this.#syncWorkerManager.cancelSync();

        // Update state to indicate interrupted status
        this._syncState = {
          ...this._syncState,
          syncStatus: 'interrupted', // Service worker can detect this and resume
          syncPhase: this._syncState.syncPhase // Preserve current phase
        };
      }
    } catch (error) {
      DebugService.logWarning('sync', 'Failed to gracefully terminate sync worker', { error });
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
        // Phase 1.2: Enhanced status handling for better coordination
        DebugService.logInfo('sync', `Service worker sync status: ${message.status}`);

        if (message.status === 'interrupted') {
          DebugService.logInfo('sync', 'Interrupted sync detected - resuming');
          this.#checkAndResumeSync();
        } else if (message.status === 'starting' && !this._syncState.isSyncing) {
          // Service worker starting background sync while app is in foreground
          // Update UI to show that sync is happening in background
          DebugService.logInfo('sync', 'Background sync starting while app is in foreground');
          this.#updateSyncLockStatus();
        }
        break;

      case 'SYNC_PROGRESS':
        // Phase 1.2: Handle background sync progress for better user awareness
        if (message.current !== undefined && message.total !== undefined) {
          DebugService.logInfo('sync', `Background sync progress: ${message.current}/${message.total} (${message.phase})`);
          // Update lock status to reflect ongoing background sync
          this.#updateSyncLockStatus();
        }
        break;

      case 'SYNC_COMPLETE':
        // Phase 1.2: Enhanced completion handling
        DebugService.logInfo('sync', `Background sync completed: ${message.success ? 'success' : 'failure'}`, {
          processed: message.processed,
          duration: message.duration,
          error: message.error
        });

        if (message.success) {
          // Trigger UI refresh to show new synced data
          this.#host.requestUpdate();

          // Notify completion callback if provided
          if (this.#options.onSyncCompleted) {
            this.#options.onSyncCompleted();
          }
        } else {
          // Handle background sync failure
          this.#handleBackgroundSyncError(message.error || 'Unknown background sync error');
        }

        // Update lock status after completion
        setTimeout(() => {
          this.#updateSyncLockStatus();
        }, 1000); // Brief delay to allow lock release
        break;

      case 'SYNC_ERROR':
        // Phase 1.2: Enhanced error handling
        DebugService.logError(new Error(`Background sync error: ${message.error}`), 'sync', 'Service worker sync error', {
          recoverable: message.recoverable,
          timestamp: message.timestamp
        });

        this.#handleBackgroundSyncError(message.error, message.recoverable);
        break;
    }
  }

  /**
   * Handle background sync errors from service worker
   */
  #handleBackgroundSyncError(errorMessage: string, recoverable = false): void {
    // Only show error if not recoverable or if user needs to know
    if (!recoverable || errorMessage.includes('settings') || errorMessage.includes('permission')) {
      this.#notifyError(`Background sync failed: ${errorMessage}`);
    }

    // Save error to database for persistence
    DatabaseService.setLastSyncError(errorMessage).catch(err => {
      DebugService.logError(err instanceof Error ? err : new Error(String(err)), 'sync', 'Failed to save background sync error');
    });

    // Update UI
    this.#host.requestUpdate();
  }

  /**
   * Update sync lock status for UI display
   */
  async #updateSyncLockStatus(): Promise<void> {
    try {
      const isAvailable = await this.#webLockCoordinator.isLockAvailable();
      if (this.#syncLockStatus !== isAvailable) {
        this.#syncLockStatus = isAvailable;
        this.#host.requestUpdate();
        DebugService.logInfo('sync', `Sync lock status updated: ${isAvailable ? 'available' : 'locked'}`);
      }
    } catch (error) {
      DebugService.logWarning('sync', 'Failed to update sync lock status', { error });
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
   * Start periodic lock status polling for UI updates
   */
  #startLockPolling(): void {
    // Poll lock status every 5 seconds for UI updates
    this.#lockPollingInterval = setInterval(async () => {
      try {
        const isAvailable = await this.#webLockCoordinator.isLockAvailable();
        if (this.#syncLockStatus !== isAvailable) {
          this.#syncLockStatus = isAvailable;
          this.#host.requestUpdate();
        }
      } catch (error) {
        DebugService.logWarning('sync', 'Failed to check lock status during polling', { error });
      }
    }, 5000) as unknown as number;
  }

  /**
   * Stop lock status polling
   */
  #stopLockPolling(): void {
    if (this.#lockPollingInterval !== null) {
      clearInterval(this.#lockPollingInterval);
      this.#lockPollingInterval = null;
    }
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

      // Phase 1.2: Wait for service worker to release Web Lock before starting foreground sync
      DebugService.logInfo('sync', 'Waiting for service worker to release Web Lock before starting foreground sync');
      try {
        await this.#webLockCoordinator.waitForLockRelease({ timeout: 30000 }); // 30 second timeout
        DebugService.logInfo('sync', 'Web Lock is now available for foreground sync');
      } catch (error) {
        DebugService.logWarning('sync', 'Timeout waiting for Web Lock release - sync may be blocked by another tab', { error });
        this.#notifyError('Sync is blocked by another tab or background process. Please wait and try again.');
        return;
      }

      // Double-check lock is still available after waiting
      const lockAvailable = await this.#webLockCoordinator.isLockAvailable();
      if (!lockAvailable) {
        DebugService.logInfo('sync', 'Sync lock not available after waiting - sync in progress in another tab');
        this.#notifyError('Sync is already running in another tab. Please wait for it to complete.');
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
   * Check if sync lock is currently available (not held by another tab)
   */
  isSyncLockAvailable(): boolean {
    return this.#syncLockStatus;
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
