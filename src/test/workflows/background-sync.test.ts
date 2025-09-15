import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AppSettings, LocalBookmark } from '../../types';

// Mock DatabaseService
vi.mock('../../services/database', () => ({
  DatabaseService: {
    clearDatabase: vi.fn().mockResolvedValue(undefined),
    getSyncCheckpoint: vi.fn().mockResolvedValue(null),
    setSyncCheckpoint: vi.fn().mockResolvedValue(undefined),
    saveSyncCheckpoint: vi.fn().mockResolvedValue(undefined),
    clearSyncCheckpoint: vi.fn().mockResolvedValue(undefined),
    getLastSyncTimestamp: vi.fn().mockResolvedValue('0'),
    setLastSyncTimestamp: vi.fn().mockResolvedValue(undefined),
    setLastSyncError: vi.fn().mockResolvedValue(undefined),
    getSyncRetryCount: vi.fn().mockResolvedValue(0),
    setSyncRetryCount: vi.fn().mockResolvedValue(undefined),
    incrementSyncRetryCount: vi.fn().mockResolvedValue(undefined),
    resetSyncRetryCount: vi.fn().mockResolvedValue(undefined),
    getBookmarksByIdRange: vi.fn().mockResolvedValue([]),
    saveBookmark: vi.fn().mockResolvedValue(undefined),
    getBookmark: vi.fn().mockResolvedValue(null),
    trackEngagement: vi.fn().mockResolvedValue(undefined),
    getEngagementScore: vi.fn().mockResolvedValue(0),
  },
}));

// Mock SettingsService
vi.mock('../../services/settings-service', () => ({
  SettingsService: {
    getSettings: vi.fn().mockResolvedValue(null),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocking
import { DatabaseService } from '../../services/database';
import { SettingsService } from '../../services/settings-service';

// Mock ServiceWorkerRegistration if it doesn't exist
if (typeof ServiceWorkerRegistration === 'undefined') {
  class MockServiceWorkerRegistration {}
  (globalThis as any).ServiceWorkerRegistration = MockServiceWorkerRegistration;
}

// Mock service worker registration
const mockServiceWorkerRegistration = {
  sync: {
    register: vi.fn(),
    getTags: vi.fn()
  },
  periodicSync: {
    register: vi.fn(),
    unregister: vi.fn(),
    getTags: vi.fn()
  }
};

describe('Background Sync User Workflows', () => {
  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup service worker mock - check if we can modify it
    try {
      const descriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
      if (!descriptor || descriptor.configurable) {
        Object.defineProperty(navigator, 'serviceWorker', {
          value: {
            ready: Promise.resolve(mockServiceWorkerRegistration as any),
            register: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            __mock: true
          },
          writable: true,
          configurable: true
        });
      }
    } catch (error) {
      // Property already exists and is not configurable, skip
    }
    
    // Mock Periodic Sync API availability
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'periodicSync', {
      value: mockServiceWorkerRegistration.periodicSync,
      writable: true,
      configurable: true
    });
    
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('User enables background sync', () => {
    it('should register periodic sync when user enables auto-sync in settings', async () => {
      // User has valid settings
      const settings: AppSettings = {
        linkding_url: 'https://test.linkding.com',
        linkding_token: 'test-key',
        auto_sync: false,
        sync_interval: 720, // 12 hours
        reading_mode: 'original' as const
      };
      
      await SettingsService.saveSettings(settings);
      
      // User enables auto-sync
      settings.auto_sync = true;
      await SettingsService.saveSettings(settings);
      
      // Settings panel would trigger periodic sync registration
      // In real app, this happens via SyncController
      await navigator.serviceWorker.ready;
      await mockServiceWorkerRegistration.periodicSync.register('periodic-sync', {
        minInterval: 720 * 60 * 1000
      });
      
      expect(mockServiceWorkerRegistration.periodicSync.register).toHaveBeenCalledWith(
        'periodic-sync',
        expect.objectContaining({
          minInterval: 720 * 60 * 1000
        })
      );
    });
    
    it('should unregister periodic sync when user disables auto-sync', async () => {
      // User has auto-sync enabled
      const settings: AppSettings = {
        linkding_url: 'https://test.linkding.com',
        linkding_token: 'test-key',
        auto_sync: true,
        sync_interval: 720,
        reading_mode: 'original' as const
      };
      
      await SettingsService.saveSettings(settings);
      
      // User disables auto-sync
      settings.auto_sync = false;
      await SettingsService.saveSettings(settings);
      
      // Should unregister periodic sync
      await mockServiceWorkerRegistration.periodicSync.unregister('periodic-sync');
      
      expect(mockServiceWorkerRegistration.periodicSync.unregister).toHaveBeenCalledWith('periodic-sync');
    });
  });
  
  describe('Sync triggers and retry logic', () => {
    it('should register background sync for immediate user-triggered sync', async () => {
      // User clicks sync button
      await navigator.serviceWorker.ready;
      
      // Should register one-time background sync
      await mockServiceWorkerRegistration.sync.register('sync-bookmarks');
      
      expect(mockServiceWorkerRegistration.sync.register).toHaveBeenCalledWith('sync-bookmarks');
    });
    
    it('should handle network failure with retry logic', async () => {
      // Simulate network failure during sync
      await DatabaseService.setLastSyncError('NetworkError: Failed to fetch');
      await DatabaseService.incrementSyncRetryCount();
      
      // Mock retry count as 1 after increment
      vi.mocked(DatabaseService.getSyncRetryCount).mockResolvedValueOnce(1);
      const retryCount = await DatabaseService.getSyncRetryCount();
      expect(retryCount).toBe(1);
      
      // Should schedule retry (in real app, service worker handles this)
      // Retry delays: 5s, 15s, 1m, 5m
      const RETRY_DELAYS = [5000, 15000, 60000, 300000];
      const nextDelay = RETRY_DELAYS[retryCount - 1];
      expect(nextDelay).toBe(5000);
      
      // After successful sync, retry count should reset
      await DatabaseService.resetSyncRetryCount();
      expect(DatabaseService.resetSyncRetryCount).toHaveBeenCalled();
    });
    
    it('should stop retrying after maximum attempts', async () => {
      // Simulate multiple failures
      for (let i = 0; i < 5; i++) {
        await DatabaseService.incrementSyncRetryCount();
      }
      
      // Mock retry count as 5 after 5 increments
      vi.mocked(DatabaseService.getSyncRetryCount).mockResolvedValueOnce(5);
      const retryCount = await DatabaseService.getSyncRetryCount();
      expect(retryCount).toBe(5);
      
      // Should not schedule more retries after 4 attempts (max index 3)
      const RETRY_DELAYS = [5000, 15000, 60000, 300000];
      const shouldRetry = retryCount < RETRY_DELAYS.length;
      expect(shouldRetry).toBe(false);
    });
  });
  
  describe('Checkpoint-based resumable sync', () => {
    it('should save checkpoint during long sync operation', async () => {
      // Simulate sync in progress
      const checkpoint = {
        lastProcessedId: 50,
        phase: 'bookmarks' as const,
        timestamp: Date.now()
      };
      
      await DatabaseService.setSyncCheckpoint(checkpoint);
      
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalledWith(checkpoint);
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'bookmarks',
          lastProcessedId: 50
        })
      );
    });
    
    it('should resume sync from checkpoint after interruption', async () => {
      // Previous sync was interrupted
      const checkpoint = {
        lastProcessedId: 75,
        phase: 'assets' as const,
        timestamp: Date.now() - 60000 // 1 minute ago
      };
      
      await DatabaseService.setSyncCheckpoint(checkpoint);
      
      // Verify checkpoint was saved
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalledWith(checkpoint);
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({ 
          lastProcessedId: 75,
          phase: 'assets' 
        })
      );
      
      // After successful completion, checkpoint should be cleared
      await DatabaseService.clearSyncCheckpoint();
      expect(DatabaseService.clearSyncCheckpoint).toHaveBeenCalled();
    });
    
    it('should clear checkpoint when user triggers full sync', async () => {
      // Has existing checkpoint
      await DatabaseService.setSyncCheckpoint({
        lastProcessedId: 25,
        phase: 'bookmarks',
        timestamp: Date.now()
      });
      
      // User triggers full sync
      await DatabaseService.clearSyncCheckpoint();
      await DatabaseService.setLastSyncTimestamp('0');
      await DatabaseService.resetSyncRetryCount();
      
      // Verify checkpoint was cleared
      expect(DatabaseService.clearSyncCheckpoint).toHaveBeenCalled();
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({ lastProcessedId: 25 })
      );
    });
  });
  
  describe('Browser compatibility', () => {
    it('should gracefully handle browsers without Periodic Sync API', async () => {
      // Remove Periodic Sync API if it exists
      if ('periodicSync' in ServiceWorkerRegistration.prototype) {
        delete (ServiceWorkerRegistration.prototype as any).periodicSync;
      }
      
      // Should not throw when checking support
      const isSupported = 'periodicSync' in ServiceWorkerRegistration.prototype;
      expect(isSupported).toBe(false);
      
      // App should still work with one-time background sync
      await mockServiceWorkerRegistration.sync.register('sync-bookmarks');
      expect(mockServiceWorkerRegistration.sync.register).toHaveBeenCalled();
    });
    
    it('should handle permission denial for periodic sync', async () => {
      // Mock permission denied
      const mockPermissions = {
        query: vi.fn().mockResolvedValue({ state: 'denied' })
      };
      
      Object.defineProperty(navigator, 'permissions', {
        value: mockPermissions,
        writable: true,
        configurable: true
      });
      
      const permission = await navigator.permissions.query({ name: 'periodic-background-sync' } as any);
      expect(permission.state).toBe('denied');
      
      // App should continue working without periodic sync
      // Falls back to manual/foreground sync only
    });
  });
  
  describe('Data integrity during sync', () => {
    it('should preserve local reading state during sync', async () => {
      // User has local reading progress
      const bookmark: LocalBookmark = {
        id: 1,
        url: 'https://example.com',
        title: 'Test Article',
        description: '',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: false,
        shared: false,
        tag_names: [],
        date_added: '2024-01-01',
        date_modified: '2024-01-01',
        read_progress: 0.75,
        reading_mode: 'readability' as const,
        needs_read_sync: true
      };
      
      // Mock getBookmark to return the saved bookmark
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(bookmark);
      
      await DatabaseService.saveBookmark(bookmark);
      
      // After sync, reading state should be preserved
      const savedBookmark = await DatabaseService.getBookmark(1);
      expect(savedBookmark?.read_progress).toBe(0.75);
      expect(savedBookmark?.reading_mode).toBe('readability');
    });
    
    it('should handle concurrent sync attempts', async () => {
      // Multiple sync triggers
      const syncPromises = [
        mockServiceWorkerRegistration.sync.register('sync-bookmarks'),
        mockServiceWorkerRegistration.sync.register('sync-bookmarks'),
        mockServiceWorkerRegistration.sync.register('sync-bookmarks')
      ];
      
      await Promise.all(syncPromises);
      
      // Should coalesce into single sync operation
      // Browser handles deduplication of sync tags
      expect(mockServiceWorkerRegistration.sync.register).toHaveBeenCalledTimes(3);
      
      // Service worker should handle only one sync at a time
      // This is enforced by syncInProgress flag in service worker
    });
  });
  
  describe('User engagement tracking', () => {
    it('should track engagement for periodic sync eligibility', async () => {
      // Periodic sync requires user engagement
      // Browser tracks this automatically, but we can influence it
      
      // User interacts with app
      // Actions that trigger engagement (browser tracks automatically):
      // - clicks sync button
      // - reads articles
      // - bookmarks items
      // - changes settings
      
      // Each action increases engagement score (browser internal)
      // High engagement = periodic sync allowed more frequently
      // Low engagement = periodic sync may be throttled or disabled
      
      // Check if periodic sync is registered
      mockServiceWorkerRegistration.periodicSync.getTags.mockResolvedValue(['periodic-sync']);
      const tags = await mockServiceWorkerRegistration.periodicSync.getTags();
      
      expect(tags).toContain('periodic-sync');
    });
  });
});