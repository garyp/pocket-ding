import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncController } from '../../controllers/sync-controller';
import type { ReactiveControllerHost } from 'lit';

// Mock dependencies
vi.mock('../../services/sync-service', () => ({
  SyncService: {
    getInstance: vi.fn(),
    isSyncInProgress: vi.fn(() => false),
    getCurrentSyncProgress: vi.fn(() => ({ current: 0, total: 0 })),
    syncBookmarks: vi.fn(),
  },
}));

vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
  },
}));

// Import after mocking
import { SyncService } from '../../services/sync-service';
import { DatabaseService } from '../../services/database';

describe('SyncController', () => {
  let mockHost: ReactiveControllerHost;
  let controller: SyncController;
  let mockSyncService: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock host
    mockHost = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
      removeController: vi.fn(),
      updateComplete: Promise.resolve(true),
    };

    // Create mock sync service
    mockSyncService = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    // Mock SyncService.getInstance to return our mock
    vi.mocked(SyncService.getInstance).mockReturnValue(mockSyncService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should register itself with the host', () => {
      controller = new SyncController(mockHost);
      expect(mockHost.addController).toHaveBeenCalledWith(controller);
    });

    it('should accept options', () => {
      const options = {
        onBookmarkSynced: vi.fn(),
        onSyncCompleted: vi.fn(),
        onSyncError: vi.fn(),
      };

      controller = new SyncController(mockHost, options);
      expect(mockHost.addController).toHaveBeenCalledWith(controller);
    });

    it('should initialize with default sync state', () => {
      controller = new SyncController(mockHost);
      const syncState = controller.getSyncState();

      expect(syncState).toEqual({
        isSyncing: false,
        syncProgress: 0,
        syncTotal: 0,
        syncedBookmarkIds: new Set(),
      });
    });
  });

  describe('hostConnected', () => {
    beforeEach(() => {
      controller = new SyncController(mockHost);
    });

    it('should initialize sync service and setup event listeners', () => {
      controller.hostConnected();

      expect(SyncService.getInstance).toHaveBeenCalled();
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-initiated', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
    });

    it('should check for ongoing sync', () => {
      vi.mocked(SyncService.isSyncInProgress).mockReturnValue(true);
      vi.mocked(SyncService.getCurrentSyncProgress).mockReturnValue({ current: 5, total: 10 });

      controller.hostConnected();

      const syncState = controller.getSyncState();
      expect(syncState.isSyncing).toBe(true);
      expect(syncState.syncProgress).toBe(5);
      expect(syncState.syncTotal).toBe(10);
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });
  });

  describe('hostDisconnected', () => {
    beforeEach(() => {
      controller = new SyncController(mockHost);
      controller.hostConnected();
    });

    it('should remove all event listeners', () => {
      controller.hostDisconnected();

      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-initiated', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
    });
  });

  describe('event handling', () => {
    let onBookmarkSynced: any;
    let onSyncCompleted: any;
    let onSyncError: any;

    beforeEach(() => {
      onBookmarkSynced = vi.fn();
      onSyncCompleted = vi.fn();
      onSyncError = vi.fn();

      controller = new SyncController(mockHost, {
        onBookmarkSynced,
        onSyncCompleted,
        onSyncError,
      });
      controller.hostConnected();
    });

    it('should handle sync-initiated event', () => {
      const event = new CustomEvent('sync-initiated');
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-initiated'
      )?.[1];

      handler?.(event);

      const syncState = controller.getSyncState();
      expect(syncState.isSyncing).toBe(true);
      expect(syncState.syncProgress).toBe(0);
      expect(syncState.syncTotal).toBe(0);
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });

    it('should handle sync-started event', () => {
      const event = new CustomEvent('sync-started', { detail: { total: 20 } });
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-started'
      )?.[1];

      handler?.(event);

      const syncState = controller.getSyncState();
      expect(syncState.isSyncing).toBe(true);
      expect(syncState.syncProgress).toBe(0);
      expect(syncState.syncTotal).toBe(20);
    });

    it('should handle sync-progress event', () => {
      const event = new CustomEvent('sync-progress', { detail: { current: 8, total: 20 } });
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-progress'
      )?.[1];

      handler?.(event);

      const syncState = controller.getSyncState();
      expect(syncState.syncProgress).toBe(8);
      expect(syncState.syncTotal).toBe(20);
    });

    it('should handle sync-completed event', () => {
      // Set initial syncing state
      controller.hostConnected();
      const initEvent = new CustomEvent('sync-initiated');
      const initHandler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-initiated'
      )?.[1];
      initHandler?.(initEvent);

      // Get the sync-completed handler before clearing mocks
      const completedHandler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-completed'
      )?.[1];

      vi.clearAllMocks();

      const event = new CustomEvent('sync-completed');
      completedHandler?.(event);

      const syncState = controller.getSyncState();
      expect(syncState.isSyncing).toBe(false);
      expect(syncState.syncProgress).toBe(0);
      expect(syncState.syncTotal).toBe(0);
      expect(onSyncCompleted).toHaveBeenCalled();
    });

    it('should handle sync-error event', () => {
      const error = new Error('Sync failed');
      const event = new CustomEvent('sync-error', { detail: error });
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-error'
      )?.[1];

      handler?.(event);

      const syncState = controller.getSyncState();
      expect(syncState.isSyncing).toBe(false);
      expect(onSyncError).toHaveBeenCalledWith(error);
    });

    it('should handle bookmark-synced event', () => {
      const bookmark = { id: 123, title: 'Test Bookmark' };
      const event = new CustomEvent('bookmark-synced', { 
        detail: { bookmark, bookmarkId: 123 } 
      });
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'bookmark-synced'
      )?.[1];

      handler?.(event);

      const syncState = controller.getSyncState();
      expect(syncState.syncedBookmarkIds.has(123)).toBe(true);
      expect(onBookmarkSynced).toHaveBeenCalledWith(123, bookmark);
    });
  });

  describe('public API', () => {
    beforeEach(() => {
      controller = new SyncController(mockHost);
    });

    it('should return current sync state', () => {
      const syncState = controller.getSyncState();
      expect(syncState).toEqual({
        isSyncing: false,
        syncProgress: 0,
        syncTotal: 0,
        syncedBookmarkIds: new Set(),
      });
    });

    it('should return whether sync is in progress', () => {
      expect(controller.isSyncing()).toBe(false);

      // Simulate sync start
      controller.hostConnected();
      const event = new CustomEvent('sync-initiated');
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-initiated'
      )?.[1];
      handler?.(event);

      expect(controller.isSyncing()).toBe(true);
    });

    it('should return current progress', () => {
      const progress = controller.getProgress();
      expect(progress).toEqual({ current: 0, total: 0 });
    });

    it('should return synced bookmark IDs', () => {
      const ids = controller.getSyncedBookmarkIds();
      expect(ids).toEqual(new Set());
    });

    it('should clear synced highlights', () => {
      // Add some synced bookmark IDs first
      controller.hostConnected();
      const event = new CustomEvent('bookmark-synced', { 
        detail: { bookmark: { id: 123 }, bookmarkId: 123 } 
      });
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'bookmark-synced'
      )?.[1];
      handler?.(event);

      expect(controller.getSyncedBookmarkIds().has(123)).toBe(true);

      controller.clearSyncedHighlights();
      expect(controller.getSyncedBookmarkIds().size).toBe(0);
    });
  });

  describe('requestSync', () => {
    beforeEach(() => {
      controller = new SyncController(mockHost);
    });

    it('should request sync when not already syncing', async () => {
      const mockSettings = { 
        linkding_url: 'test', 
        linkding_token: 'token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability' as const
      };
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);

      await controller.requestSync();

      expect(DatabaseService.getSettings).toHaveBeenCalled();
      expect(SyncService.syncBookmarks).toHaveBeenCalledWith(mockSettings);
    });

    it('should not request sync when already syncing', async () => {
      // Set syncing state
      controller.hostConnected();
      const event = new CustomEvent('sync-initiated');
      const handler = vi.mocked(mockSyncService.addEventListener).mock.calls.find(
        (call: any) => call[0] === 'sync-initiated'
      )?.[1];
      handler?.(event);

      await controller.requestSync();

      expect(DatabaseService.getSettings).not.toHaveBeenCalled();
      expect(SyncService.syncBookmarks).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      const mockSettings = { 
        linkding_url: 'test', 
        linkding_token: 'token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability' as const
      };
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(SyncService.syncBookmarks).mockRejectedValue(new Error('Sync failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await controller.requestSync();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to sync bookmarks:', expect.any(Error));
      
      // Should reset sync state
      const syncState = controller.getSyncState();
      expect(syncState.isSyncing).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should handle missing settings', async () => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

      await controller.requestSync();

      expect(SyncService.syncBookmarks).not.toHaveBeenCalled();
    });
  });
});