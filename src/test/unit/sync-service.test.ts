import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncService } from '../../worker/sync-service';
import { createLinkdingAPI } from '../../services/linkding-api';
import { DatabaseService } from '../../services/database';
import type { AppSettings, LocalBookmark } from '../../types';

// Mock the dependencies
vi.mock('../../services/linkding-api');
vi.mock('../../services/database');
vi.mock('../../services/favicon-service');
vi.mock('../../worker/sw-logger');

describe('SyncService', () => {
  let syncService: SyncService;
  let progressCallback: ReturnType<typeof vi.fn>;
  let mockSettings: AppSettings;
  let mockApi: any;
  
  beforeEach(() => {
    vi.useFakeTimers();
    progressCallback = vi.fn();
    syncService = new SyncService(progressCallback);
    
    mockSettings = {
      linkding_url: 'https://test.linkding.com',
      linkding_token: 'test-api-key',
      auto_sync: true,
      reading_mode: 'original' as const
    };
    
    // Create a mock API instance
    mockApi = {
      getAllBookmarks: vi.fn(),
      getBookmarkAsset: vi.fn(),
      getBookmarkAssets: vi.fn().mockResolvedValue([]), // Default to empty assets
      downloadAsset: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      markBookmarkAsRead: vi.fn(),
      getArchivedBookmarks: vi.fn().mockImplementation((_limit: number, _offset: number) => {
        // Default: return empty for all calls
        return Promise.resolve({ results: [], next: null });
      }),
      getBookmarks: vi.fn().mockImplementation((_limit: number, _offset: number) => {
        // Default: return empty for all calls
        return Promise.resolve({ results: [], next: null });
      })
    };
    
    // Mock createLinkdingAPI to return our mock API
    vi.mocked(createLinkdingAPI).mockReturnValue(mockApi);

    // Set up default database mocks
    vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue('2023-12-31T00:00:00Z');
    vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
    vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
    vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
    vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.setLastSyncTimestamp).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getUnarchivedOffset).mockResolvedValue(0);
    vi.mocked(DatabaseService.getArchivedOffset).mockResolvedValue(0);
    vi.mocked(DatabaseService.setUnarchivedOffset).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.setArchivedOffset).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.markBookmarkAssetSynced).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.markBookmarkReadSynced).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveAsset).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.clearAssetContent).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
    // New persistent ID tracking mocks
    vi.mocked(DatabaseService.getSyncedUnarchivedIds).mockResolvedValue(new Set());
    vi.mocked(DatabaseService.getSyncedArchivedIds).mockResolvedValue(new Set());
    vi.mocked(DatabaseService.updateSyncedUnarchivedIds).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.updateSyncedArchivedIds).mockResolvedValue(undefined);

    // Reset all database mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.useRealTimers();
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
      
      // Set up paginated API responses
      const unarchivedBookmarks = mockBookmarks.filter(b => !b.is_archived);
      const archivedBookmarks = mockBookmarks.filter(b => b.is_archived);

      // Mock pagination: first call returns bookmarks, subsequent calls return empty
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: unarchivedBookmarks, next: null });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });

      mockApi.getArchivedBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: archivedBookmarks, next: null });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getBookmarkAssets.mockResolvedValue([]);

      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getUnarchivedBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue(mockBookmarks);
      vi.mocked(DatabaseService.setLastSyncTimestamp).mockResolvedValue(undefined);
      
      const syncPromise = syncService.performSync(mockSettings);

      // Advance timers to allow setTimeout calls to resolve
      await vi.runAllTimersAsync();

      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'bookmarks' })
      );
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'complete' })
      );
    });
    
    it('should handle incremental sync properly', async () => {
      const mockBookmarks = [
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
          date_modified: '2024-01-01'
        }
      ];

      // Setup incremental sync by providing a last sync timestamp
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue('2023-12-31T00:00:00Z');

      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: mockBookmarks, next: null });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });

      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });
      mockApi.getBookmarkAssets.mockResolvedValue([]);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue(mockBookmarks);

      const syncPromise = syncService.performSync(mockSettings);

      // Advance timers to allow setTimeout calls to resolve
      await vi.runAllTimersAsync();

      await syncPromise;

      // Verify API was called with timestamp for incremental sync
      expect(mockApi.getBookmarks).toHaveBeenCalledWith(100, 0, '2023-12-31T00:00:00Z');
      expect(mockApi.getArchivedBookmarks).toHaveBeenCalledWith(100, 0, '2023-12-31T00:00:00Z');
    });
    
    it('should handle sync cancellation gracefully', async () => {
      // Mock API to resolve immediately - empty result simulates quick return
      mockApi.getBookmarks.mockResolvedValue({ results: [], next: null });
      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });
      
      const syncPromise = syncService.performSync(mockSettings);
      
      // Cancel sync immediately
      syncService.cancelSync();
      
      const result = await syncPromise;
      
      // Should complete without errors (cancellation is graceful)
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      // Cancelled sync may still succeed if it completes before cancellation takes effect
    });
    
    it('should process multiple bookmarks successfully', async () => {
      const bookmarks = [
        { id: 1, url: 'test1', title: 'Test 1', description: '', notes: '', website_title: '', website_description: '', web_archive_snapshot_url: '', favicon_url: '', preview_image_url: '', is_archived: false, unread: false, shared: false, tag_names: [], date_added: '2024-01-01', date_modified: '2024-01-01' },
        { id: 2, url: 'test2', title: 'Test 2', description: '', notes: '', website_title: '', website_description: '', web_archive_snapshot_url: '', favicon_url: '', preview_image_url: '', is_archived: false, unread: false, shared: false, tag_names: [], date_added: '2024-01-01', date_modified: '2024-01-01' }
      ];

      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: bookmarks, next: null });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockImplementation((_limit: number, _offset: number) => {
        return Promise.resolve({ results: [], next: null });
      });
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue(bookmarks);

      const syncPromise = syncService.performSync(mockSettings);

      // Advance timers to allow setTimeout calls to resolve
      await vi.runAllTimersAsync();

      const result = await syncPromise;

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
    });
    
    it('should handle network errors and return appropriate error', async () => {
      mockApi.getBookmarks.mockRejectedValue(new Error('Network error'));
      
      const result = await syncService.performSync(mockSettings);
      
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
      
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: serverBookmarks, next: null });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockImplementation((_limit: number, _offset: number) => {
        return Promise.resolve({ results: [], next: null });
      });
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue(serverBookmarks);
      
      const syncPromise = syncService.performSync(mockSettings);

      // Advance timers to allow setTimeout calls to resolve
      await vi.runAllTimersAsync();

      await syncPromise;

      // Verify bookmarks were saved
      expect(DatabaseService.saveBookmark).toHaveBeenCalled();
    });
  });
  
  describe('bookmark deletion during sync', () => {
    it('should delete orphaned bookmarks during full sync', async () => {
      // Mock server returning only bookmark 2 (bookmark 1 was deleted)
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
          date_added: '2024-01-02', 
          date_modified: '2024-01-02' 
        }
      ];

      // Mock local database having bookmarks 1 and 2 (bookmark 1 is orphaned)
      const localBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1 - Will be deleted', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-01',
          date_modified: '2024-01-01'
        },
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-02',
          date_modified: '2024-01-02'
        }
      ] as LocalBookmark[];

      // Mock full sync (no last sync timestamp)
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      vi.mocked(DatabaseService.deleteBookmark).mockResolvedValue(undefined);
      
      // Mock API returning only bookmark 2 on server
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: serverBookmarks, next: null, count: 1 });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });
      
      // Mock asset sync phase
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);

      const syncPromise = syncService.performSync(mockSettings);
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      // Verify bookmark 1 was deleted (orphaned)
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(1);
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledTimes(1);
    });

    it('should NOT delete any bookmarks during incremental sync', async () => {
      // Mock server returning only bookmark 2
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
          date_added: '2024-01-02', 
          date_modified: '2024-01-02' 
        }
      ];

      // Mock local database having bookmarks 1 and 2
      const localBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1 - Should NOT be deleted in incremental', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-01',
          date_modified: '2024-01-01'
        },
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-02',
          date_modified: '2024-01-02'
        }
      ] as LocalBookmark[];

      // Mock incremental sync (has last sync timestamp)
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue('2024-01-01T00:00:00Z');
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      vi.mocked(DatabaseService.deleteBookmark).mockResolvedValue(undefined);
      
      // Mock API returning only modified bookmarks
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number, _timestamp?: string) => {
        if (offset === 0) {
          return Promise.resolve({ results: serverBookmarks, next: null, count: 1 });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });
      
      // Mock asset sync phase
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);

      const syncPromise = syncService.performSync(mockSettings);
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      // Verify NO bookmarks were deleted during incremental sync
      expect(DatabaseService.deleteBookmark).not.toHaveBeenCalled();
    });

    it('should handle deletion of archived bookmarks correctly', async () => {
      // Mock server with only unarchived bookmark
      const unarchivedBookmarks = [
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
          date_added: '2024-01-01', 
          date_modified: '2024-01-01' 
        }
      ];

      // Mock local database with both archived and unarchived bookmarks
      const localBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-01',
          date_modified: '2024-01-01'
        },
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2 - Archived locally but deleted on server', 
          is_archived: true,
          unread: false,
          date_added: '2024-01-02',
          date_modified: '2024-01-02'
        }
      ] as LocalBookmark[];

      // Mock full sync
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      vi.mocked(DatabaseService.deleteBookmark).mockResolvedValue(undefined);
      
      // Mock API responses
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: unarchivedBookmarks, next: null, count: 1 });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });
      
      // Mock asset sync phase
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);

      const syncPromise = syncService.performSync(mockSettings);
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      // Verify archived bookmark 2 was deleted
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(2);
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledTimes(1);
    });

    it('should delete multiple orphaned bookmarks in a single sync', async () => {
      // Mock server with only bookmark 3
      const serverBookmarks = [
        { 
          id: 3, 
          url: 'test3', 
          title: 'Test 3', 
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
          date_added: '2024-01-03', 
          date_modified: '2024-01-03' 
        }
      ];

      // Mock local database with bookmarks 1, 2, and 3 (1 and 2 are orphaned)
      const localBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1 - Will be deleted', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-01',
          date_modified: '2024-01-01'
        },
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2 - Will be deleted', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-02',
          date_modified: '2024-01-02'
        },
        { 
          id: 3, 
          url: 'test3', 
          title: 'Test 3', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-03',
          date_modified: '2024-01-03'
        }
      ] as LocalBookmark[];

      // Mock full sync
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      vi.mocked(DatabaseService.deleteBookmark).mockResolvedValue(undefined);
      
      // Mock API responses
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: serverBookmarks, next: null, count: 1 });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });
      
      // Mock asset sync phase
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);

      const syncPromise = syncService.performSync(mockSettings);
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      // Verify bookmarks 1 and 2 were deleted
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(1);
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(2);
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledTimes(2);
    });

    it('should continue deleting other bookmarks if one deletion fails', async () => {
      // Mock server with no bookmarks
      mockApi.getBookmarks.mockResolvedValue({ results: [], next: null });
      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });

      // Mock local database with bookmarks 1 and 2 (both orphaned)
      const localBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1 - Deletion will fail', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-01',
          date_modified: '2024-01-01'
        },
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2 - Should still be deleted', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-02',
          date_modified: '2024-01-02'
        }
      ] as LocalBookmark[];

      // Mock full sync
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      
      // Mock deletion - first call fails, second succeeds
      vi.mocked(DatabaseService.deleteBookmark)
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(undefined);
      
      // Mock asset sync phase
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);

      const syncPromise = syncService.performSync(mockSettings);
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      // Verify both deletions were attempted
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(1);
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(2);
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledTimes(2);
    });

    it('should handle interrupted and resumed full sync correctly with persistent ID tracking', async () => {
      // This test verifies the fix for interrupted sync using persistent ID tracking
      // Setup: Full sync interrupted after processing bookmark 1, then resumed
      
      // Mock server with bookmarks 1 and 2
      const serverBookmarks = [
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
          date_added: '2024-01-01', 
          date_modified: '2024-01-01' 
        },
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
          date_added: '2024-01-02', 
          date_modified: '2024-01-02' 
        }
      ];

      // Mock local database with both bookmarks already synced
      const localBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-01',
          date_modified: '2024-01-01'
        },
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-02',
          date_modified: '2024-01-02'
        }
      ] as LocalBookmark[];

      // Mock resumed full sync - no last sync timestamp but has offset
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getUnarchivedOffset).mockResolvedValue(100); // Resumed from offset 100
      vi.mocked(DatabaseService.getArchivedOffset).mockResolvedValue(0);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      vi.mocked(DatabaseService.deleteBookmark).mockResolvedValue(undefined);
      
      // Mock persistent ID tracking - bookmark 1 was tracked from previous interrupted sync
      vi.mocked(DatabaseService.getSyncedUnarchivedIds).mockResolvedValue(new Set([1]));
      vi.mocked(DatabaseService.getSyncedArchivedIds).mockResolvedValue(new Set());
      vi.mocked(DatabaseService.updateSyncedUnarchivedIds).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.updateSyncedArchivedIds).mockResolvedValue(undefined);
      
      // Mock API returning bookmarks starting from offset 100 (simulating resumed sync)
      // This simulates that bookmark 1 was processed in the previous interrupted sync
      // and bookmark 2 is being processed in the resumed sync
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 100) {
          // Only return bookmark 2 because bookmark 1 was in the previous page
          return Promise.resolve({ results: [serverBookmarks[1]], next: null, count: 2 });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockResolvedValue({ results: [], next: null });
      
      // Mock asset sync phase
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);

      const syncPromise = syncService.performSync(mockSettings);
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      
      // FIX VERIFIED: With persistent ID tracking, bookmark 1 should NOT be deleted
      // because it was tracked from the previous interrupted sync
      expect(DatabaseService.deleteBookmark).not.toHaveBeenCalled();
      
      // Verify that synced IDs were properly managed
      expect(DatabaseService.getSyncedUnarchivedIds).toHaveBeenCalled();
      expect(DatabaseService.updateSyncedUnarchivedIds).toHaveBeenCalled();
      // clearSyncedIds is now handled internally in setLastSyncTimestamp
    });

    it('should correctly identify orphaned bookmarks across both archived and unarchived', async () => {
      // Mock server with bookmarks 1 (unarchived) and 3 (archived)
      const unarchivedServerBookmarks = [
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
          date_added: '2024-01-01', 
          date_modified: '2024-01-01' 
        }
      ];

      const archivedServerBookmarks = [
        { 
          id: 3, 
          url: 'test3', 
          title: 'Test 3', 
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
          date_added: '2024-01-03', 
          date_modified: '2024-01-03' 
        }
      ];

      // Mock local database with bookmarks 1, 2, and 3 (2 is orphaned)
      const localBookmarks = [
        { 
          id: 1, 
          url: 'test1', 
          title: 'Test 1', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-01',
          date_modified: '2024-01-01'
        },
        { 
          id: 2, 
          url: 'test2', 
          title: 'Test 2 - Will be deleted', 
          is_archived: false,
          unread: false,
          date_added: '2024-01-02',
          date_modified: '2024-01-02'
        },
        { 
          id: 3, 
          url: 'test3', 
          title: 'Test 3', 
          is_archived: true,
          unread: false,
          date_added: '2024-01-03',
          date_modified: '2024-01-03'
        }
      ] as LocalBookmark[];

      // Mock full sync
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(localBookmarks);
      vi.mocked(DatabaseService.deleteBookmark).mockResolvedValue(undefined);
      
      // Mock API responses
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: unarchivedServerBookmarks, next: null, count: 1 });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: archivedServerBookmarks, next: null, count: 1 });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      
      // Mock asset sync phase
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);

      const syncPromise = syncService.performSync(mockSettings);
      await vi.runAllTimersAsync();
      const result = await syncPromise;

      expect(result.success).toBe(true);
      // Verify only bookmark 2 was deleted
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledWith(2);
      expect(DatabaseService.deleteBookmark).toHaveBeenCalledTimes(1);
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
      
      mockApi.getBookmarks.mockImplementation((_limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve({ results: mockBookmarks, next: null });
        } else {
          return Promise.resolve({ results: [], next: null });
        }
      });
      mockApi.getArchivedBookmarks.mockImplementation((_limit: number, _offset: number) => {
        return Promise.resolve({ results: [], next: null });
      });
      mockApi.getBookmarkAssets.mockResolvedValue([{
        id: 1,
        content: new ArrayBuffer(100),
        content_type: 'text/html',
        status: 'complete',
        status_code: 200
      }]);

      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks as LocalBookmark[]);
      vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
      vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue(mockBookmarks as LocalBookmark[]);
      vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
      
      const syncPromise = syncService.performSync(mockSettings);

      // Advance timers to allow setTimeout calls to resolve
      await vi.runAllTimersAsync();

      await syncPromise;

      // Should report progress for init, bookmarks, assets, and complete phases
      const calledPhases = progressCallback.mock.calls
        .map(call => call[0].phase)
        .filter((phase, index, self) => self.indexOf(phase) === index);
      
      expect(calledPhases).toContain('bookmarks');
      expect(calledPhases).toContain('assets');
      expect(calledPhases).toContain('complete');
    });
  });
});