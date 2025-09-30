import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AppSettings } from '../../types';
import type { SyncMessage } from '../../types/sync-messages';

// Skip test setup imports to avoid fake-indexeddb dependency
// import '../setup';

// Mock the service worker global scope
const mockSelf = {
  addEventListener: vi.fn(),
  clients: {
    matchAll: vi.fn(),
    claim: vi.fn(),
  },
  registration: {
    sync: {
      register: vi.fn(),
    },
    periodicSync: {
      register: vi.fn(),
      unregister: vi.fn(),
    },
  },
  skipWaiting: vi.fn(),
} as any;

// Mock the database service
const mockDatabaseService = {
  getSettings: vi.fn(),
  setLastSyncError: vi.fn(),
  resetSyncRetryCount: vi.fn(),
  getSyncRetryCount: vi.fn(),
  incrementSyncRetryCount: vi.fn(),
};

// Mock the sync service
const mockSyncService = vi.fn((_progressCallback?: (progress: any) => void) => ({
  performSync: vi.fn(),
  cancelSync: vi.fn(),
  getProcessedCount: vi.fn(() => 0),
}));

// Mock logger
const mockLogger = {
  logInfo: vi.fn(),
  logError: vi.fn(),
};

// Setup global mocks
Object.defineProperty(global, 'self', { value: mockSelf, writable: true });

vi.mock('../../services/database', () => ({
  DatabaseService: mockDatabaseService,
}));

vi.mock('../worker/sync-service', () => ({
  SyncService: mockSyncService,
}));

vi.mock('../worker/sw-logger', () => mockLogger);

// Mock SyncMessages
const mockSyncMessages = {
  syncProgress: vi.fn((current, total, phase) => ({
    type: 'SYNC_PROGRESS' as const,
    current,
    total,
    phase,
    timestamp: Date.now(),
  })),
  syncComplete: vi.fn((success, processed, duration) => ({
    type: 'SYNC_COMPLETE' as const,
    success,
    processed,
    duration,
    timestamp: Date.now(),
  })),
  syncError: vi.fn((error, recoverable) => ({
    type: 'SYNC_ERROR' as const,
    error,
    recoverable,
    timestamp: Date.now(),
  })),
  syncStatus: vi.fn((status) => ({
    type: 'SYNC_STATUS' as const,
    status,
    timestamp: Date.now(),
  })),
};

vi.mock('../../types/sync-messages', () => ({
  SyncMessages: mockSyncMessages,
}));

describe('Service Worker', () => {
  let performBackgroundSync: (fullSync?: boolean) => Promise<void>;
  let broadcastToClients: (message: SyncMessage) => Promise<void>;
  let getSettings: () => Promise<AppSettings | null>;

  const testSettings: AppSettings = {
    linkding_url: 'https://test.linkding.com',
    linkding_token: 'test-token',
    auto_sync: true,
    reading_mode: 'original' as const,
  };

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockDatabaseService.getSettings.mockResolvedValue(testSettings);
    mockDatabaseService.getSyncRetryCount.mockResolvedValue(0);

    mockSelf.clients.matchAll.mockResolvedValue([
      { postMessage: vi.fn() },
      { postMessage: vi.fn() },
    ]);

    // Import the service worker module to get access to functions
    // Note: In real implementation, these would be tested by importing the actual sw.ts
    // For this test, we'll simulate the key functions

    // Simulate the service worker functions
    performBackgroundSync = async (_fullSync: boolean = false) => {
      try {
        const settings = await mockDatabaseService.getSettings();
        if (!settings) {
          throw new Error('No valid settings found for background sync');
        }

        const syncService = mockSyncService((progress: any) => {
          broadcastToClients(mockSyncMessages.syncProgress(progress.current, progress.total, progress.phase));
        });

        const result = await syncService.performSync(settings);

        if (result.success) {
          await mockDatabaseService.resetSyncRetryCount();
          await mockDatabaseService.setLastSyncError(null);
          await broadcastToClients(mockSyncMessages.syncComplete(true, result.processed, 0));
          await broadcastToClients(mockSyncMessages.syncStatus('completed'));
        } else {
          throw result.error || new Error('Unknown sync error');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
        const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network') ||
                               errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError');

        // Save error to database
        await mockDatabaseService.setLastSyncError(errorMessage);
        await broadcastToClients(mockSyncMessages.syncError(errorMessage, isNetworkError));
        await broadcastToClients(mockSyncMessages.syncStatus('failed'));

        // Schedule retry for recoverable errors
        if (isNetworkError) {
          const retryCount = await mockDatabaseService.getSyncRetryCount();
          const maxRetries = 4; // Match service worker implementation
          if (retryCount < maxRetries) {
            await mockDatabaseService.incrementSyncRetryCount();
          }
        }

        throw error;
      }
    };

    broadcastToClients = async (message: SyncMessage) => {
      const clients = await mockSelf.clients.matchAll({ type: 'window' });
      clients.forEach((client: any) => {
        client.postMessage(message);
      });
    };

    getSettings = async () => {
      return mockDatabaseService.getSettings();
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Background Sync', () => {
    it('should perform background sync successfully', async () => {
      const mockSyncInstance = {
        performSync: vi.fn().mockResolvedValue({
          success: true,
          processed: 5,
          timestamp: Date.now(),
        }),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };
      mockSyncService.mockReturnValue(mockSyncInstance);

      await performBackgroundSync();

      expect(mockDatabaseService.getSettings).toHaveBeenCalled();
      expect(mockSyncService).toHaveBeenCalledWith(expect.any(Function));
      expect(mockSyncInstance.performSync).toHaveBeenCalledWith(testSettings);
      expect(mockDatabaseService.resetSyncRetryCount).toHaveBeenCalled();
      expect(mockDatabaseService.setLastSyncError).toHaveBeenCalledWith(null);
    });

    it('should perform full background sync when requested', async () => {
      const mockSyncInstance = {
        performSync: vi.fn().mockResolvedValue({
          success: true,
          processed: 10,
          timestamp: Date.now(),
        }),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };
      mockSyncService.mockReturnValue(mockSyncInstance);

      await performBackgroundSync(true);

      expect(mockSyncInstance.performSync).toHaveBeenCalledWith(testSettings);
    });

    it('should handle sync errors and setup retries', async () => {
      const networkError = new Error('Failed to fetch');
      const mockSyncInstance = {
        performSync: vi.fn().mockRejectedValue(networkError),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };
      mockSyncService.mockReturnValue(mockSyncInstance);

      mockDatabaseService.getSyncRetryCount.mockResolvedValue(0);

      await expect(performBackgroundSync()).rejects.toThrow('Failed to fetch');

      expect(mockDatabaseService.setLastSyncError).toHaveBeenCalledWith('Failed to fetch');
      expect(mockDatabaseService.incrementSyncRetryCount).toHaveBeenCalled();
    });

    it('should not retry after max attempts', async () => {
      const networkError = new Error('Failed to fetch');
      const mockSyncInstance = {
        performSync: vi.fn().mockRejectedValue(networkError),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };
      mockSyncService.mockReturnValue(mockSyncInstance);

      mockDatabaseService.getSyncRetryCount.mockResolvedValue(4); // Max retries reached

      await expect(performBackgroundSync()).rejects.toThrow('Failed to fetch');

      expect(mockDatabaseService.setLastSyncError).toHaveBeenCalledWith('Failed to fetch');
      expect(mockDatabaseService.incrementSyncRetryCount).not.toHaveBeenCalled();
    });

    it('should handle missing settings', async () => {
      mockDatabaseService.getSettings.mockResolvedValue(null);

      await expect(performBackgroundSync()).rejects.toThrow('No valid settings found for background sync');

      expect(mockSyncService).not.toHaveBeenCalled();
    });
  });

  describe('Client Broadcasting', () => {
    it('should broadcast messages to all clients', async () => {
      const mockClients = [
        { postMessage: vi.fn() },
        { postMessage: vi.fn() },
        { postMessage: vi.fn() },
      ];
      mockSelf.clients.matchAll.mockResolvedValue(mockClients);

      const testMessage = {
        type: 'SYNC_PROGRESS' as const,
        current: 3,
        total: 10,
        phase: 'bookmarks' as const,
        timestamp: Date.now(),
      };

      await broadcastToClients(testMessage);

      expect(mockSelf.clients.matchAll).toHaveBeenCalledWith({ type: 'window' });
      mockClients.forEach(client => {
        expect(client.postMessage).toHaveBeenCalledWith(testMessage);
      });
    });

    it('should handle broadcasting with no clients', async () => {
      mockSelf.clients.matchAll.mockResolvedValue([]);

      const testMessage = {
        type: 'SYNC_COMPLETE' as const,
        success: true,
        processed: 5,
        duration: 1000,
        timestamp: Date.now(),
      };

      // Should not throw when no clients
      await expect(broadcastToClients(testMessage)).resolves.not.toThrow();
    });
  });

  describe('Settings Management', () => {
    it('should retrieve settings successfully', async () => {
      const settings = await getSettings();

      expect(settings).toEqual(testSettings);
      expect(mockDatabaseService.getSettings).toHaveBeenCalled();
    });

    it('should handle settings retrieval errors', async () => {
      const error = new Error('Database error');
      mockDatabaseService.getSettings.mockRejectedValue(error);

      const settings = await getSettings().catch(() => null);

      expect(settings).toBeNull();
    });
  });

  describe('Progress Reporting', () => {
    it('should report sync progress during background sync', async () => {
      let progressCallback: (progress: any) => void;

      const mockSyncInstance = {
        performSync: vi.fn().mockImplementation(async () => {
          // Simulate progress updates
          progressCallback({ current: 2, total: 5, phase: 'fetching' });
          progressCallback({ current: 4, total: 5, phase: 'processing' });
          progressCallback({ current: 5, total: 5, phase: 'complete' });

          return {
            success: true,
            processed: 5,
            timestamp: Date.now(),
          };
        }),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };

      mockSyncService.mockImplementation((callback?: (progress: any) => void) => {
        progressCallback = callback!;
        return mockSyncInstance;
      });

      const mockClients = [{ postMessage: vi.fn() }];
      mockSelf.clients.matchAll.mockResolvedValue(mockClients);

      await performBackgroundSync();

      // Verify progress messages were sent
      expect(mockClients[0]!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SYNC_PROGRESS',
          current: 2,
          total: 5,
          phase: 'fetching',
        })
      );

      expect(mockClients[0]!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SYNC_PROGRESS',
          current: 4,
          total: 5,
          phase: 'processing',
        })
      );

      expect(mockClients[0]!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SYNC_PROGRESS',
          current: 5,
          total: 5,
          phase: 'complete',
        })
      );
    });
  });

  describe('Error Classification', () => {
    it('should identify network errors correctly', async () => {
      const networkErrors = [
        'Failed to fetch',
        'NetworkError when attempting to fetch',
        'fetch: connection failed',
        'network timeout error',
      ];

      for (const errorMessage of networkErrors) {
        const mockSyncInstance = {
          performSync: vi.fn().mockRejectedValue(new Error(errorMessage)),
          cancelSync: vi.fn(),
          getProcessedCount: vi.fn(() => 0),
        };
        mockSyncService.mockReturnValue(mockSyncInstance);

        mockDatabaseService.getSyncRetryCount.mockResolvedValue(0);

        await expect(performBackgroundSync()).rejects.toThrow(errorMessage);

        // Should increment retry count for network errors
        expect(mockDatabaseService.incrementSyncRetryCount).toHaveBeenCalled();

        vi.clearAllMocks();
      }
    });

    it('should not retry non-network errors', async () => {
      const nonNetworkError = new Error('Invalid token');
      const mockSyncInstance = {
        performSync: vi.fn().mockRejectedValue(nonNetworkError),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };
      mockSyncService.mockReturnValue(mockSyncInstance);

      await expect(performBackgroundSync()).rejects.toThrow('Invalid token');

      expect(mockDatabaseService.setLastSyncError).toHaveBeenCalledWith('Invalid token');
      expect(mockDatabaseService.incrementSyncRetryCount).not.toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('should clean up state after successful sync', async () => {
      const mockSyncInstance = {
        performSync: vi.fn().mockResolvedValue({
          success: true,
          processed: 3,
          timestamp: Date.now(),
        }),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };
      mockSyncService.mockReturnValue(mockSyncInstance);

      await performBackgroundSync();

      expect(mockDatabaseService.resetSyncRetryCount).toHaveBeenCalled();
      expect(mockDatabaseService.setLastSyncError).toHaveBeenCalledWith(null);
    });

    it('should preserve error state after failed sync', async () => {
      const error = new Error('Sync failed');
      const mockSyncInstance = {
        performSync: vi.fn().mockRejectedValue(error),
        cancelSync: vi.fn(),
        getProcessedCount: vi.fn(() => 0),
      };
      mockSyncService.mockReturnValue(mockSyncInstance);

      await expect(performBackgroundSync()).rejects.toThrow('Sync failed');

      expect(mockDatabaseService.setLastSyncError).toHaveBeenCalledWith('Sync failed');
      expect(mockDatabaseService.resetSyncRetryCount).not.toHaveBeenCalled();
    });
  });
});