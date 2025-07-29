import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { SyncService } from '../services/sync-service';
import { DatabaseService } from '../services/database';

export interface SyncState {
  isSyncing: boolean;
  syncProgress: number;
  syncTotal: number;
  syncedBookmarkIds: Set<number>;
}

export interface SyncControllerOptions {
  onBookmarkSynced?: (bookmarkId: number, bookmark: any) => void;
  onSyncCompleted?: () => void;
  onSyncError?: (error: any) => void;
}

/**
 * Reactive controller that manages sync service integration and state.
 * Handles all sync-related event listeners, state management, and provides
 * methods for triggering sync operations.
 */
export class SyncController implements ReactiveController {
  private host: ReactiveControllerHost;
  private syncService: SyncService | null = null;
  private options: SyncControllerOptions;
  private highlightClearTimeout: number | null = null;

  // Reactive sync state
  private _syncState: SyncState = {
    isSyncing: false,
    syncProgress: 0,
    syncTotal: 0,
    syncedBookmarkIds: new Set<number>(),
  };

  constructor(host: ReactiveControllerHost, options: SyncControllerOptions = {}) {
    this.host = host;
    this.options = options;
    host.addController(this);
  }

  hostConnected(): void {
    this.initializeSync();
  }

  hostDisconnected(): void {
    this.cleanupSync();
  }

  private initializeSync() {
    // Initialize sync service
    this.syncService = SyncService.getInstance();
    
    // Setup event listeners
    this.setupSyncEventListeners();
    
    // Check for ongoing sync
    this.checkOngoingSync();
  }

  private cleanupSync() {
    // Clean up event listeners
    if (this.syncService) {
      this.syncService.removeEventListener('sync-initiated', this.handleSyncInitiated);
      this.syncService.removeEventListener('sync-started', this.handleSyncStarted);
      this.syncService.removeEventListener('sync-progress', this.handleSyncProgress);
      this.syncService.removeEventListener('sync-completed', this.handleSyncCompleted);
      this.syncService.removeEventListener('sync-error', this.handleSyncError);
      this.syncService.removeEventListener('bookmark-synced', this.handleBookmarkSynced);
    }
    
    // Clean up timeout
    if (this.highlightClearTimeout) {
      clearTimeout(this.highlightClearTimeout);
      this.highlightClearTimeout = null;
    }
  }

  private setupSyncEventListeners() {
    if (!this.syncService) return;

    this.syncService.addEventListener('sync-initiated', this.handleSyncInitiated);
    this.syncService.addEventListener('sync-started', this.handleSyncStarted);
    this.syncService.addEventListener('sync-progress', this.handleSyncProgress);
    this.syncService.addEventListener('sync-completed', this.handleSyncCompleted);
    this.syncService.addEventListener('sync-error', this.handleSyncError);
    this.syncService.addEventListener('bookmark-synced', this.handleBookmarkSynced);
  }

  private checkOngoingSync() {
    if (SyncService.isSyncInProgress()) {
      const progress = SyncService.getCurrentSyncProgress();
      this._syncState = {
        ...this._syncState,
        isSyncing: true,
        syncProgress: progress.current,
        syncTotal: progress.total,
        syncedBookmarkIds: new Set<number>(),
      };
      this.host.requestUpdate();
    }
  }

  // Event handlers
  private handleSyncInitiated = () => {
    // Show immediate feedback with indeterminate progress
    this._syncState = {
      ...this._syncState,
      isSyncing: true,
      syncProgress: 0,
      syncTotal: 0,
      syncedBookmarkIds: new Set<number>(),
    };
    this.host.requestUpdate();
  };

  private handleSyncStarted = (event: Event) => {
    const customEvent = event as CustomEvent;
    this._syncState = {
      ...this._syncState,
      isSyncing: true,
      syncProgress: 0,
      syncTotal: customEvent.detail.total || 0,
      syncedBookmarkIds: new Set<number>(),
    };
    this.host.requestUpdate();
  };

  private handleSyncProgress = (event: Event) => {
    const customEvent = event as CustomEvent;
    this._syncState = {
      ...this._syncState,
      syncProgress: customEvent.detail.current || customEvent.detail.progress || 0,
      syncTotal: customEvent.detail.total || 0,
    };
    this.host.requestUpdate();
  };

  private handleSyncCompleted = async () => {
    this._syncState = {
      ...this._syncState,
      isSyncing: false,
      syncProgress: 0,
      syncTotal: 0,
    };
    this.host.requestUpdate();

    // Notify host component
    if (this.options.onSyncCompleted) {
      this.options.onSyncCompleted();
    }
    
    // Clear synced highlights after delay (3 seconds)
    // Use vitest fake timers in tests for deterministic timing
    if (this.highlightClearTimeout) {
      clearTimeout(this.highlightClearTimeout);
    }
    this.highlightClearTimeout = window.setTimeout(() => {
      this.clearSyncedHighlights();
      this.highlightClearTimeout = null;
    }, 3000);
  };

  private handleSyncError = (event: Event) => {
    const customEvent = event as CustomEvent;
    console.error('Sync error:', customEvent.detail);
    this._syncState = {
      ...this._syncState,
      isSyncing: false,
      syncProgress: 0,
      syncTotal: 0,
    };
    this.host.requestUpdate();

    // Notify host component
    if (this.options.onSyncError) {
      this.options.onSyncError(customEvent.detail);
    }
  };

  private handleBookmarkSynced = async (event: Event) => {
    const customEvent = event as CustomEvent;
    const updatedBookmark = customEvent.detail.bookmark;
    const bookmarkId = updatedBookmark?.id || customEvent.detail.bookmarkId;
    
    if (!updatedBookmark || !bookmarkId) return;
    
    // Update synced bookmark IDs
    this._syncState = {
      ...this._syncState,
      syncedBookmarkIds: new Set([...this._syncState.syncedBookmarkIds, bookmarkId]),
    };
    this.host.requestUpdate();

    // Notify host component
    if (this.options.onBookmarkSynced) {
      this.options.onBookmarkSynced(bookmarkId, updatedBookmark);
    }
  };

  // Public API methods
  
  /**
   * Get the current sync state
   */
  getSyncState(): SyncState {
    return { ...this._syncState };
  }

  /**
   * Request a sync operation
   */
  async requestSync(): Promise<void> {
    if (this._syncState.isSyncing) return;

    try {
      const settings = await DatabaseService.getSettings();
      if (settings) {
        // Update sync state to indicate we're starting sync
        this._syncState = {
          ...this._syncState,
          isSyncing: true,
          syncProgress: 0,
          syncTotal: 0,
          syncedBookmarkIds: new Set<number>(),
        };
        this.host.requestUpdate();
        
        await SyncService.syncBookmarks(settings);
        // Don't dispatch sync-requested event to avoid infinite loop
        // The sync service itself will dispatch the necessary events
      }
    } catch (error) {
      console.error('Failed to sync bookmarks:', error);
      // Reset sync state on error
      this._syncState = {
        ...this._syncState,
        isSyncing: false,
        syncProgress: 0,
        syncTotal: 0,
      };
      this.host.requestUpdate();
    }
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
    this.host.requestUpdate();
  }
}