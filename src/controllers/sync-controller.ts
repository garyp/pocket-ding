import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { SettingsService } from '../services/settings-service';
import { ReactiveQueryController } from './reactive-query-controller';
import { SyncMessages, type SyncMessage } from '../services/sync-messages';
import type { AppSettings } from '../types';

export interface SyncState {
  isSyncing: boolean;
  syncProgress: number;
  syncTotal: number;
  syncedBookmarkIds: Set<number>;
  syncPhase?: 'init' | 'bookmarks' | 'assets' | 'read-status' | 'complete';
  syncStatus?: 'idle' | 'starting' | 'syncing' | 'completed' | 'failed' | 'cancelled';
}

export interface SyncControllerOptions {
  onSyncCompleted?: () => void;
  onSyncError?: (error: any) => void;
  onBookmarkSynced?: (bookmarkId: number, bookmark: any) => void;
}

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
    syncStatus: 'idle'
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
      console.warn('Service Worker not supported');
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
        this.postToServiceWorker(SyncMessages.registerPeriodicSync(
          true,
          settings.sync_interval
        ));
      }
    } catch (error) {
      console.error('Failed to setup service worker:', error);
    }
  }

  private async checkSyncStatus() {
    // Request current sync status from service worker
    this.postToServiceWorker(SyncMessages.checkSyncPermission());
  }

  private handleServiceWorkerMessage(message: SyncMessage) {
    switch (message.type) {
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
        console.error('Sync error:', message.error);
        this._syncState = {
          ...this._syncState,
          isSyncing: false,
          syncProgress: 0,
          syncTotal: 0,
          syncStatus: 'failed'
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
      console.warn('Service worker not ready');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        registration.active.postMessage(message);
      }
    } catch (error) {
      console.error('Failed to post message to service worker:', error);
    }
  }

  // Bookmark synced tracking for visual highlights
  private _trackBookmarkSynced(_bookmarkId: number) {
    this._syncState = {
      ...this._syncState,
      syncedBookmarkIds: new Set([...this._syncState.syncedBookmarkIds, _bookmarkId]),
    };
    this.#host.requestUpdate();
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
        console.warn('Cannot sync while settings are loading');
        return;
      }

      // Check if service worker is ready
      if (!this.#serviceWorkerReady) {
        console.warn('Service worker not ready');
        return;
      }

      // Use reactive settings instead of direct DatabaseService call
      const settings = this.settings;
      if (settings) {
        // Show immediate UI feedback
        this._syncState = {
          ...this._syncState,
          isSyncing: true,
          syncProgress: 0,
          syncTotal: 0,
          syncedBookmarkIds: new Set<number>(),
          syncPhase: 'init',
          syncStatus: 'starting'
        };
        this.#host.requestUpdate();

        // Request sync from service worker
        await this.postToServiceWorker(SyncMessages.requestSync(true, fullSync));
      } else {
        console.warn('Cannot sync without valid settings');
      }
    } catch (error) {
      console.error('Failed to request sync:', error);
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
  async setPeriodicSync(enabled: boolean, minInterval?: number): Promise<void> {
    await this.postToServiceWorker(SyncMessages.registerPeriodicSync(enabled, minInterval));
  }

  /**
   * Check if sync is currently in progress
   */
  isSyncing(): boolean {
    return this._syncState.isSyncing;
  }

  /**
   * Get current sync progress
   */
  getProgress(): { current: number; total: number } {
    return {
      current: this._syncState.syncProgress,
      total: this._syncState.syncTotal,
    };
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
}