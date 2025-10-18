import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncWorkerManager, type SyncWorkerCallbacks } from '../../services/sync-worker-manager';
import type { AppSettings } from '../../types';
import type { SyncWorkerResponseMessage } from '../../types/worker-messages';

// Skip test setup imports to avoid fake-indexeddb dependency
// import '../setup';

// Mock Worker constructor
const mockWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onerror: null,
  onmessage: null,
  onmessageerror: null,
};

const mockWorkerConstructor = vi.fn(() => mockWorkerInstance);
Object.defineProperty(global, 'Worker', {
  value: mockWorkerConstructor,
  writable: true,
});

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-123'),
  },
  writable: true,
});

// Mock ErrorEvent for Node.js environment
class MockErrorEvent extends Event {
  message: string;
  filename?: string;
  lineno?: number;
  constructor(type: string, options: { message: string; filename?: string; lineno?: number } = { message: '' }) {
    super(type);
    this.message = options.message;
    this.filename = options.filename || '';
    this.lineno = options.lineno || 0;
  }
}
Object.defineProperty(global, 'ErrorEvent', {
  value: MockErrorEvent,
  writable: true,
});

describe('SyncWorkerManager', () => {
  let syncWorkerManager: SyncWorkerManager;
  let mockCallbacks: SyncWorkerCallbacks;
  let testSettings: AppSettings;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup test data
    mockCallbacks = {
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onCancelled: vi.fn(),
    };
    testSettings = {
      linkding_url: 'https://test.linkding.com',
      linkding_token: 'test-token',
      auto_sync: true,
      reading_mode: 'original' as const,
    };

    // Create manager instance
    syncWorkerManager = new SyncWorkerManager(mockCallbacks);
  });

  afterEach(() => {
    // Clean up
    syncWorkerManager.cleanup();
  });

  describe('Constructor', () => {
    it('should initialize with message callback', () => {
      expect(syncWorkerManager).toBeDefined();
      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();
    });

    it('should accept callback object as optional parameter', () => {
      // Test that TypeScript allows empty constructor
      expect(() => new SyncWorkerManager()).not.toThrow();
      expect(() => new SyncWorkerManager({})).not.toThrow();
    });
  });

  describe('Sync State Management', () => {
    it('should transition from idle to syncing state when sync starts', async () => {
      // Initial state
      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();

      // Start sync
      const syncId = await syncWorkerManager.startSync(testSettings);

      // State should change
      expect(syncWorkerManager.isSyncing).toBe(true);
      expect(syncWorkerManager.currentSyncId).toBe(syncId);
      expect(typeof syncId).toBe('string');
      expect(syncId.length).toBeGreaterThan(0);
    });

    it('should maintain syncing state across multiple operations', async () => {
      await syncWorkerManager.startSync(testSettings);
      const firstSyncId = syncWorkerManager.currentSyncId;

      // Starting another sync should maintain the same state
      await syncWorkerManager.startSync(testSettings, true);

      expect(syncWorkerManager.isSyncing).toBe(true);
      expect(syncWorkerManager.currentSyncId).toBe(firstSyncId);
    });

    it('should reset state when cleaned up', async () => {
      await syncWorkerManager.startSync(testSettings);
      expect(syncWorkerManager.isSyncing).toBe(true);

      syncWorkerManager.cleanup();

      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();
    });
  });

  describe('Message-Based Communication', () => {
    it('should accept settings and return sync ID when starting sync', async () => {
      const syncId = await syncWorkerManager.startSync(testSettings);

      expect(typeof syncId).toBe('string');
      expect(syncId.length).toBeGreaterThan(0);
      expect(syncWorkerManager.currentSyncId).toBe(syncId);
    });

    it('should differentiate between regular and full sync', async () => {
      // Test that both regular and full sync work without errors
      const regularSyncId = await syncWorkerManager.startSync(testSettings, false);
      expect(typeof regularSyncId).toBe('string');
      expect(syncWorkerManager.isSyncing).toBe(true);

      syncWorkerManager.cleanup();
      expect(syncWorkerManager.isSyncing).toBe(false);

      const fullSyncId = await syncWorkerManager.startSync(testSettings, true);
      expect(typeof fullSyncId).toBe('string');
      expect(syncWorkerManager.isSyncing).toBe(true);
    });

    it('should handle cancellation gracefully', () => {
      // Should not crash when cancelling without active sync
      expect(() => syncWorkerManager.cancelSync()).not.toThrow();

      // Should not change state when no sync is active
      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();
    });
  });

  describe('Callback Handling', () => {
    let messageHandler: (event: MessageEvent) => void;

    beforeEach(async () => {
      await syncWorkerManager.startSync(testSettings);

      // Get the message handler that was registered
      const addEventListenerCalls = mockWorkerInstance.addEventListener.mock.calls;
      const messageCall = addEventListenerCalls.find(call => call[0] === 'message');
      messageHandler = messageCall![1];
    });

    it('should call onProgress callback for SYNC_PROGRESS messages', () => {
      const testMessage: SyncWorkerResponseMessage = {
        type: 'SYNC_PROGRESS',
        payload: { current: 5, total: 10, phase: 'bookmarks' },
        id: 'test-uuid-123',
      };

      messageHandler(new MessageEvent('message', { data: testMessage }));

      expect(mockCallbacks.onProgress).toHaveBeenCalledWith(5, 10, 'bookmarks');
    });

    it('should call onComplete callback for SYNC_COMPLETE messages', () => {
      const testMessage: SyncWorkerResponseMessage = {
        type: 'SYNC_COMPLETE',
        payload: { processed: 5, timestamp: Date.now() },
        id: 'test-uuid-123',
      };

      messageHandler(new MessageEvent('message', { data: testMessage }));

      expect(mockCallbacks.onComplete).toHaveBeenCalledWith(5);
    });

    it('should call onError callback for SYNC_ERROR messages', () => {
      const testMessage: SyncWorkerResponseMessage = {
        type: 'SYNC_ERROR',
        payload: { error: 'Test error', recoverable: true },
        id: 'test-uuid-123',
      };

      messageHandler(new MessageEvent('message', { data: testMessage }));

      expect(mockCallbacks.onError).toHaveBeenCalledWith('Test error', true);
    });

    it('should call onCancelled callback for SYNC_CANCELLED messages', () => {
      const testMessage: SyncWorkerResponseMessage = {
        type: 'SYNC_CANCELLED',
        payload: { processed: 3 },
        id: 'test-uuid-123',
      };

      messageHandler(new MessageEvent('message', { data: testMessage }));

      expect(mockCallbacks.onCancelled).toHaveBeenCalledWith(3);
    });
  });

  describe('Error Handling', () => {
    let errorHandler: (event: ErrorEvent) => void;

    beforeEach(async () => {
      await syncWorkerManager.startSync(testSettings);

      // Get the error handler that was registered
      const addEventListenerCalls = mockWorkerInstance.addEventListener.mock.calls;
      const errorCall = addEventListenerCalls.find(call => call[0] === 'error');
      errorHandler = errorCall![1];
    });

    it('should handle worker errors', () => {
      const errorEvent = new ErrorEvent('error', {
        message: 'Worker crashed',
        filename: 'sync-worker.js',
        lineno: 42,
      });

      errorHandler(errorEvent);

      expect(mockCallbacks.onError).toHaveBeenCalledWith('Worker error: Worker crashed', false);

      // Should clean up after error
      expect(mockWorkerInstance.terminate).toHaveBeenCalled();
      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();
    });

    it('should log worker errors to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorEvent = new ErrorEvent('error', {
        message: 'Test error',
      });

      errorHandler(errorEvent);

      expect(consoleSpy).toHaveBeenCalledWith('[SyncWorkerManager] Sync worker error:', errorEvent);

      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('should terminate worker and reset state', async () => {
      await syncWorkerManager.startSync(testSettings);
      expect(syncWorkerManager.isSyncing).toBe(true);

      syncWorkerManager.cleanup();

      expect(mockWorkerInstance.terminate).toHaveBeenCalled();
      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();
    });

    it('should handle cleanup when no worker exists', () => {
      expect(() => syncWorkerManager.cleanup()).not.toThrow();
      expect(mockWorkerInstance.terminate).not.toHaveBeenCalled();
    });

    it('should cleanup on multiple calls safely', async () => {
      await syncWorkerManager.startSync(testSettings);

      syncWorkerManager.cleanup();
      syncWorkerManager.cleanup(); // Second call should be safe

      expect(mockWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });
  });

  describe('State Management', () => {
    it('should track sync state correctly', async () => {
      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();

      const syncId = await syncWorkerManager.startSync(testSettings);

      expect(syncWorkerManager.isSyncing).toBe(true);
      expect(syncWorkerManager.currentSyncId).toBe(syncId);

      syncWorkerManager.cleanup();

      expect(syncWorkerManager.isSyncing).toBe(false);
      expect(syncWorkerManager.currentSyncId).toBeNull();
    });

    it('should generate unique sync IDs', async () => {
      // Override crypto.randomUUID to return different values
      let callCount = 0;
      vi.mocked(crypto.randomUUID).mockImplementation(() => {
        const id = `${++callCount}`;
        return `${id.padStart(8, '0')}-0000-4000-8000-000000000000`;
      });

      const syncId1 = await syncWorkerManager.startSync(testSettings);
      syncWorkerManager.cleanup();

      const syncId2 = await syncWorkerManager.startSync(testSettings);

      expect(syncId1).toBe('00000001-0000-4000-8000-000000000000');
      expect(syncId2).toBe('00000002-0000-4000-8000-000000000000');
      expect(syncId1).not.toBe(syncId2);
    });
  });
});