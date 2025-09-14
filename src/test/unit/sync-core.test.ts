import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncCore, type SyncProgress, type SyncCheckpoint } from '../../services/sync-core';
import { LinkdingAPIService } from '../../services/linkding-api';
import { DatabaseService } from '../../services/database';
import type { AppSettings, LocalBookmark } from '../../types';

// Mock the dependencies
vi.mock('../../services/linkding-api', () => ({
  LinkdingAPIService: vi.fn().mockImplementation(() => ({
    getAllBookmarks: vi.fn(),
    getBookmarkAsset: vi.fn(),
    markBookmarkAsRead: vi.fn()
  }))
}));
vi.mock('../../services/database');

describe('SyncCore', () => {
  let syncCore: SyncCore;
  let progressCallback: vi.Mock;
  let mockSettings: AppSettings;
  
  beforeEach(() => {
    progressCallback = vi.fn();
    syncCore = new SyncCore(progressCallback);
    
    mockSettings = {
      linkding_url: 'https://test.linkding.com',
      linkding_api_key: 'test-api-key',
      auto_sync: true,
      sync_interval: 60
    };
    
    // Reset all mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('performSync', () => {
    it('should perform a complete sync successfully', async () => {
      // Mock API responses
      const mockBookmarks = [
        { id: 1, url: 'https://example.com', title: 'Test', is_archived: false, date_modified: '2024-01-01' },
        { id: 2, url: 'https://test.com', title: 'Test 2', is_archived: true, date_modified: '2024-01-02' }
      ];
      
      const mockApi = new LinkdingAPIService('', '');
      vi.mocked(mockApi.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(LinkdingAPIService).mockImplementation(() => mockApi);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getUnarchivedBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.setLastSyncTimestamp).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.clearSyncCheckpoint).mockResolvedValue(undefined);
      
      const result = await syncCore.performSync(mockSettings);
      
      expect(result.success).toBe(true);
      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalled();
      expect(DatabaseService.clearSyncCheckpoint).toHaveBeenCalled();
      
      // Verify progress callbacks were made
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'bookmarks',
          total: 2
        })
      );
    });
    
    it('should resume from checkpoint if provided', async () => {
      const checkpoint: SyncCheckpoint = {
        lastProcessedId: 1,
        phase: 'assets',
        timestamp: Date.now()
      };
      
      const mockBookmarks = [
        { id: 1, url: 'https://example.com', title: 'Test', is_archived: false }
      ];
      
      vi.mocked(DatabaseService.getUnarchivedBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.clearSyncCheckpoint).mockResolvedValue(undefined);
      
      const result = await syncCore.performSync(mockSettings, checkpoint);
      
      expect(result.success).toBe(true);
      // Should not fetch bookmarks since we're resuming from assets phase
      expect(LinkdingAPIService.prototype.getAllBookmarks).not.toHaveBeenCalled();
      // Should not update last sync timestamp when using checkpoint
      expect(DatabaseService.setLastSyncTimestamp).not.toHaveBeenCalled();
    });
    
    it('should handle sync cancellation gracefully', async () => {
      const mockBookmarks = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        url: `https://example${i}.com`,
        title: `Test ${i}`,
        is_archived: false,
        date_modified: '2024-01-01'
      }));
      
      vi.mocked(LinkdingAPIService.prototype.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      
      // Mock saveBookmark to simulate cancellation after 5 bookmarks
      let saveCount = 0;
      vi.mocked(DatabaseService.saveBookmark).mockImplementation(async () => {
        saveCount++;
        if (saveCount === 5) {
          syncCore.cancelSync();
        }
      });
      
      const result = await syncCore.performSync(mockSettings);
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('cancelled');
    });
    
    it('should save checkpoints periodically during sync', async () => {
      const mockBookmarks = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        url: `https://example${i}.com`,
        title: `Test ${i}`,
        is_archived: false,
        date_modified: '2024-01-01'
      }));
      
      vi.mocked(LinkdingAPIService.prototype.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getUnarchivedBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.setSyncCheckpoint).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.clearSyncCheckpoint).mockResolvedValue(undefined);
      
      await syncCore.performSync(mockSettings);
      
      // Should save checkpoint every 10 bookmarks
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalledTimes(2);
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'bookmarks',
          lastProcessedId: expect.any(Number)
        })
      );
    });
    
    it('should handle network errors and return appropriate error', async () => {
      vi.mocked(LinkdingAPIService.prototype.getAllBookmarks).mockRejectedValue(
        new Error('Failed to fetch')
      );
      
      const result = await syncCore.performSync(mockSettings);
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to fetch');
    });
    
    it('should clean up deleted bookmarks from local storage', async () => {
      const remoteBookmarks = [
        { id: 1, url: 'https://example.com', title: 'Remote 1', is_archived: false, date_modified: '2024-01-01' }
      ];
      
      const localBookmarks = [
        { id: 1, url: 'https://example.com', title: 'Local 1', is_archived: false } as LocalBookmark,
        { id: 2, url: 'https://deleted.com', title: 'Local 2', is_archived: false } as LocalBookmark
      ];
      
      vi.mocked(LinkdingAPIService.prototype.getAllBookmarks).mockResolvedValue(remoteBookmarks);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      vi.mocked(DatabaseService.deleteBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getUnarchivedBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.clearSyncCheckpoint).mockResolvedValue(undefined);
      
      await syncCore.performSync(mockSettings);
      
      // Should delete bookmark with id 2 as it's not in remote
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(2);
    });
  });
  
  describe('progress reporting', () => {
    it('should report progress for each sync phase', async () => {
      const mockBookmarks = [
        { id: 1, url: 'https://example.com', title: 'Test', is_archived: false, date_modified: '2024-01-01' }
      ];
      
      vi.mocked(LinkdingAPIService.prototype.getAllBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getUnarchivedBookmarks).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      vi.mocked(LinkdingAPIService.prototype.getBookmarkAsset).mockResolvedValue({
        content: 'test content',
        content_type: 'text/html',
        status: 'complete',
        status_code: 200
      });
      vi.mocked(DatabaseService.saveAsset).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.clearSyncCheckpoint).mockResolvedValue(undefined);
      
      await syncCore.performSync(mockSettings);
      
      // Should report progress for bookmarks phase
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'bookmarks' })
      );
      
      // Should report progress for assets phase
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'assets' })
      );
      
      // Should report completion
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'complete' })
      );
    });
  });
});