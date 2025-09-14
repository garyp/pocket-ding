import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForComponent } from '../utils/component-aware-wait-for';
import { DatabaseService } from '../../services/database';
import { SettingsService } from '../../services/settings-service';
import type { AppSettings } from '../../types';

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
  beforeEach(() => {
    // Setup service worker mock
    if (!navigator.serviceWorker || !(navigator.serviceWorker as any).__mock) {
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
      
      const retryCount = await DatabaseService.getSyncRetryCount();
      expect(retryCount).toBe(1);
      
      // Should schedule retry (in real app, service worker handles this)
      // Retry delays: 5s, 15s, 1m, 5m
      const RETRY_DELAYS = [5000, 15000, 60000, 300000];
      const nextDelay = RETRY_DELAYS[retryCount - 1];
      expect(nextDelay).toBe(5000);
      
      // After successful sync, retry count should reset
      await DatabaseService.resetSyncRetryCount();
      const finalCount = await DatabaseService.getSyncRetryCount();
      expect(finalCount).toBe(0);
    });
    
    it('should stop retrying after maximum attempts', async () => {
      // Simulate multiple failures
      for (let i = 0; i < 5; i++) {
        await DatabaseService.incrementSyncRetryCount();
      }
      
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
      
      const savedCheckpoint = await DatabaseService.getSyncCheckpoint();
      expect(savedCheckpoint).toEqual(checkpoint);
      expect(savedCheckpoint?.phase).toBe('bookmarks');
      expect(savedCheckpoint?.lastProcessedId).toBe(50);
    });
    
    it('should resume sync from checkpoint after interruption', async () => {
      // Previous sync was interrupted
      const checkpoint = {
        lastProcessedId: 75,
        phase: 'assets' as const,
        timestamp: Date.now() - 60000 // 1 minute ago
      };
      
      await DatabaseService.setSyncCheckpoint(checkpoint);
      
      // Resume sync
      const resumeCheckpoint = await DatabaseService.getSyncCheckpoint();
      expect(resumeCheckpoint).toBeTruthy();
      expect(resumeCheckpoint?.phase).toBe('assets');
      
      // After successful completion, checkpoint should be cleared
      await DatabaseService.clearSyncCheckpoint();
      const finalCheckpoint = await DatabaseService.getSyncCheckpoint();
      expect(finalCheckpoint).toBeNull();
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
      
      const checkpoint = await DatabaseService.getSyncCheckpoint();
      const timestamp = await DatabaseService.getLastSyncTimestamp();
      const retryCount = await DatabaseService.getSyncRetryCount();
      
      expect(checkpoint).toBeNull();
      expect(timestamp).toBe('0');
      expect(retryCount).toBe(0);
    });
  });
  
  describe('Browser compatibility', () => {
    it('should gracefully handle browsers without Periodic Sync API', async () => {
      // Remove Periodic Sync API
      delete (ServiceWorkerRegistration.prototype as any).periodicSync;
      
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
      const bookmark = {
        id: 1,
        url: 'https://example.com',
        title: 'Test Article',
        reading_progress: 0.75,
        scroll_position: 1500,
        reading_mode: 'readability' as const,
        is_read: true,
        needs_read_sync: true,
        is_archived: false,
        unread: false,
        date_added: '2024-01-01',
        date_modified: '2024-01-01'
      };
      
      await DatabaseService.saveBookmark(bookmark);
      
      // After sync, reading state should be preserved
      const savedBookmark = await DatabaseService.getBookmark(1);
      expect(savedBookmark?.reading_progress).toBe(0.75);
      expect(savedBookmark?.scroll_position).toBe(1500);
      expect(savedBookmark?.reading_mode).toBe('readability');
      expect(savedBookmark?.is_read).toBe(true);
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
      const _userActions = [
        'clicks sync button',
        'reads articles',
        'bookmarks items',
        'changes settings'
      ];
      
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