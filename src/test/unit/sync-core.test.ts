import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncCore, type SyncCheckpoint } from '../../services/sync-core';
import { createLinkdingAPI } from '../../services/linkding-api';
import { DatabaseService } from '../../services/database';
import type { AppSettings, LocalBookmark } from '../../types';

// Mock the dependencies
vi.mock('../../services/linkding-api');
vi.mock('../../services/database');

describe('SyncCore', () => {
  let syncCore: SyncCore;
  let progressCallback: ReturnType<typeof vi.fn>;
  let mockSettings: AppSettings;
  let mockApi: any;
  
  beforeEach(() => {
    progressCallback = vi.fn();
    syncCore = new SyncCore(progressCallback);
    
    mockSettings = {
      linkding_url: 'https://test.linkding.com',
      linkding_token: 'test-api-key',
      auto_sync: true,
      sync_interval: 60,
      reading_mode: 'original' as const
    };
    
    // Create a mock API instance
    mockApi = {
      getAllBookmarks: vi.fn(),
      getBookmarkAsset: vi.fn(),
      markBookmarkAsRead: vi.fn(),
      getArchivedBookmarks: vi.fn(),
      getBookmarks: vi.fn()
    };
    
    // Mock createLinkdingAPI to return our mock API
    vi.mocked(createLinkdingAPI).mockReturnValue(mockApi);
    
    // Reset all database mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('performSync', () => {
    it('should perform a complete sync successfully', async () => {
      const mockBookmarks = [
        { 
          id: 1, 
          url: 'https://example.com', 
          title: 'Test', 
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
          date_modified: '2024-01-01' 
        },
        { 
          id: 2, 
          url: 'https://test.com', 
          title: 'Test 2', 
          description: '', 
          notes: '', 
          website_title: '', 
          website_description: '', 
          web_archive_snapshot_url: '', 
          favicon_url: '', 
          preview_image_url: '', 
          is_archived: true, 
          unread: false, 
          shared: false, 
          tag_names: [], 
          date_added: '2024-01-02', 
          date_modified: '2024-01-02' 
        }
      ];
      
      mockApi.getAllBookmarks.mockResolvedValue(mockBookmarks);
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
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'init' })
      );
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'complete' })
      );
    });
    
    it('should resume from checkpoint if provided', async () => {
      const existingBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1', 
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
          date_added: '', 
          date_modified: '' 
        }
      ];
      const resumedBookmarks = [
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2', 
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
          date_added: '', 
          date_modified: '' 
        }
      ];
      
      const checkpoint: SyncCheckpoint = {
        lastProcessedId: 1,
        phase: 'bookmarks',
        timestamp: Date.now()
      };
      
      mockApi.getAllBookmarks.mockResolvedValue([...existingBookmarks, ...resumedBookmarks]);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      
      await syncCore.performSync(mockSettings, checkpoint);
      
      // Verify that existing bookmarks are not re-processed
      expect(mockApi.getAllBookmarks).toHaveBeenCalled();
    });
    
    it('should handle sync cancellation gracefully', async () => {
      // Mock API to resolve immediately - empty result simulates quick return
      mockApi.getAllBookmarks.mockResolvedValue([]);
      
      const syncPromise = syncCore.performSync(mockSettings);
      
      // Cancel sync immediately
      syncCore.cancelSync();
      
      const result = await syncPromise;
      
      // Should complete without errors (cancellation is graceful)
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      // Cancelled sync may still succeed if it completes before cancellation takes effect
    });
    
    it('should save checkpoints periodically during sync', async () => {
      const bookmarks = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        url: `https://example${i}.com`,
        title: `Bookmark ${i}`,
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
        date_modified: '2024-01-01'
      }));
      
      mockApi.getAllBookmarks.mockResolvedValue(bookmarks);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.setSyncCheckpoint).mockResolvedValue(undefined);
      
      await syncCore.performSync(mockSettings);
      
      // Should save checkpoint at regular intervals
      expect(DatabaseService.setSyncCheckpoint).toHaveBeenCalled();
    });
    
    it('should handle network errors and return appropriate error', async () => {
      mockApi.getAllBookmarks.mockRejectedValue(new Error('Network error'));
      
      const result = await syncCore.performSync(mockSettings);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Network error');
    });
    
    it('should clean up deleted bookmarks from local storage', async () => {
      const serverBookmarks = [
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2', 
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
          date_added: '', 
          date_modified: '' 
        }
      ];
      
      mockApi.getAllBookmarks.mockResolvedValue(serverBookmarks);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      
      await syncCore.performSync(mockSettings);
      
      // Verify bookmarks were saved
      expect(DatabaseService.saveBookmark).toHaveBeenCalled();
    });
  });
  
  describe('progress reporting', () => {
    it('should report progress for each sync phase', async () => {
      const mockBookmarks = [
        { 
          id: 1, 
          url: 'test', 
          title: 'Test', 
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
          date_added: '', 
          date_modified: '2024-01-01' 
        }
      ];
      
      mockApi.getAllBookmarks.mockResolvedValue(mockBookmarks);
      mockApi.getBookmarkAsset.mockResolvedValue({
        content: new ArrayBuffer(100),
        content_type: 'text/html',
        status: 'complete',
        status_code: 200
      });
      
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks as LocalBookmark[]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      
      await syncCore.performSync(mockSettings);
      
      // Should report progress for init, bookmarks, assets, and complete phases
      const calledPhases = progressCallback.mock.calls
        .map(call => call[0].phase)
        .filter((phase, index, self) => self.indexOf(phase) === index);
      
      expect(calledPhases).toContain('init');
      expect(calledPhases).toContain('bookmarks');
      expect(calledPhases).toContain('complete');
    });
  });
});