import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppSettings, LinkdingBookmark, LocalBookmark } from '../../types';

// Mock dependencies
vi.mock('../../services/linkding-api', () => ({
  LinkdingAPI: vi.fn().mockImplementation(() => ({
    getAllBookmarks: vi.fn(),
    getBookmarkAssets: vi.fn(),
    downloadAsset: vi.fn(),
    markBookmarkAsRead: vi.fn(),
  })),
}));

vi.mock('../../services/database', () => ({
  DatabaseService: {
    getAllBookmarks: vi.fn(),
    saveBookmark: vi.fn(),
    getLastSyncTimestamp: vi.fn(),
    setLastSyncTimestamp: vi.fn(),
    getAssetsByBookmarkId: vi.fn(),
    saveAsset: vi.fn(),
    clearAssetContent: vi.fn(),
    getBookmarksNeedingReadSync: vi.fn(),
    markBookmarkReadSynced: vi.fn(),
  },
}));

vi.mock('../../services/content-fetcher', () => ({
  ContentFetcher: {
    fetchBookmarkContent: vi.fn(),
  },
}));

// Import after mocking
import { SyncService } from '../../services/sync-service';
import { LinkdingAPI } from '../../services/linkding-api';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';

describe('SyncService', () => {
  const mockSettings: AppSettings = {
    linkding_url: 'https://linkding.example.com',
    linkding_token: 'test-token',
    sync_interval: 60,
    auto_sync: true,
    reading_mode: 'readability',
  };

  const mockRemoteBookmarks: LinkdingBookmark[] = [
    {
      id: 1,
      url: 'https://example.com/article1',
      title: 'Test Article 1',
      description: 'Test description',
      notes: '',
      website_title: 'Example',
      website_description: 'Example site',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: ['test'],
      date_added: '2024-01-01T10:00:00Z',
      date_modified: '2024-01-02T10:00:00Z',
    },
    {
      id: 2,
      url: 'https://example.com/article2',
      title: 'Test Article 2',
      description: 'Another test article',
      notes: '',
      website_title: 'Example',
      website_description: 'Example site',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: false,
      shared: false,
      tag_names: ['design'],
      date_added: '2024-01-01T10:00:00Z',
      date_modified: '2024-01-03T10:00:00Z',
    },
  ];

  const mockLocalBookmarks: LocalBookmark[] = [
    {
      ...mockRemoteBookmarks[0],
      last_read_at: '2024-01-01T12:00:00Z',
      read_progress: 50,
      reading_mode: 'readability',
      is_synced: true,
      date_modified: '2024-01-01T10:00:00Z', // Older than remote
    } as LocalBookmark,
  ];

  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup API mock
    mockApi = {
      getAllBookmarks: vi.fn(),
      getBookmarks: vi.fn().mockResolvedValue({ results: [], next: null }),
      getArchivedBookmarks: vi.fn().mockResolvedValue({ results: [], next: null }),
      getBookmarkAssets: vi.fn(),
      downloadAsset: vi.fn(),
      markBookmarkAsRead: vi.fn(),
    };
    (LinkdingAPI as any).mockImplementation(() => mockApi);

    // Setup database mocks
    (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockLocalBookmarks);
    (DatabaseService.saveBookmark as any).mockResolvedValue(undefined);
    (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);
    (DatabaseService.setLastSyncTimestamp as any).mockResolvedValue(undefined);
    (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([]);
    (DatabaseService.saveAsset as any).mockResolvedValue(undefined);
    (DatabaseService.getBookmarksNeedingReadSync as any).mockResolvedValue([]);
    (DatabaseService.markBookmarkReadSynced as any).mockResolvedValue(undefined);

    // Content fetcher is no longer used in sync
    (ContentFetcher.fetchBookmarkContent as any).mockResolvedValue({
      content: '<html>fetched content</html>',
      readability_content: 'processed content',
    });
  });

  describe('syncBookmarks', () => {
    it('should perform full sync when no last sync timestamp exists', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

      const progressCallback = vi.fn();
      await SyncService.syncBookmarks(mockSettings, progressCallback);

      expect(mockApi.getAllBookmarks).toHaveBeenCalledWith(undefined);
      expect(progressCallback).toHaveBeenCalledWith(0, 2);
      expect(progressCallback).toHaveBeenCalledWith(2, 2);
      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalled();
    });

    it('should perform incremental sync when last sync timestamp exists', async () => {
      const lastSyncTimestamp = '2024-01-01T10:00:00Z';
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(lastSyncTimestamp);

      await SyncService.syncBookmarks(mockSettings);

      expect(mockApi.getAllBookmarks).toHaveBeenCalledWith(lastSyncTimestamp);
      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalled();
    });

    it('should update bookmarks that are newer than local versions', async () => {
      mockApi.getAllBookmarks.mockResolvedValue([mockRemoteBookmarks[0]]);
      
      await SyncService.syncBookmarks(mockSettings);

      expect(DatabaseService.saveBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          date_modified: '2024-01-02T10:00:00Z',
          last_read_at: '2024-01-01T12:00:00Z', // Preserves reading progress
          read_progress: 50,
          is_synced: true,
        })
      );
    });

    it('should skip bookmarks that are not newer than local versions', async () => {
      const olderRemoteBookmark = {
        ...mockRemoteBookmarks[0],
        date_modified: '2023-12-31T10:00:00Z', // Older than local
      };
      
      mockApi.getAllBookmarks.mockResolvedValue([olderRemoteBookmark]);
      
      await SyncService.syncBookmarks(mockSettings);

      // Should not save since remote is older
      expect(DatabaseService.saveBookmark).not.toHaveBeenCalled();
    });

    it('should save new bookmarks without content fetching', async () => {
      const newBookmark = {
        ...mockRemoteBookmarks[1],
        id: 3, // New bookmark not in local storage
      };
      
      mockApi.getAllBookmarks.mockResolvedValue([newBookmark]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]); // No local bookmarks

      await SyncService.syncBookmarks(mockSettings);

      expect(ContentFetcher.fetchBookmarkContent).not.toHaveBeenCalled();
      expect(DatabaseService.saveBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 3,
          is_synced: true,
        })
      );
    });

    it('should save bookmarks without content fetching', async () => {
      const newBookmark = mockRemoteBookmarks[1];
      mockApi.getAllBookmarks.mockResolvedValue([newBookmark]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);

      // Should not throw
      await expect(SyncService.syncBookmarks(mockSettings)).resolves.not.toThrow();
      
      // Should save bookmark without content fetching
      expect(DatabaseService.saveBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 2,
          is_synced: true,
        })
      );
      expect(ContentFetcher.fetchBookmarkContent).not.toHaveBeenCalled();
    });

    it('should set sync timestamp only on successful completion', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);

      await SyncService.syncBookmarks(mockSettings);

      const setTimestampCall = (DatabaseService.setLastSyncTimestamp as any).mock.calls[0];
      expect(setTimestampCall[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(setTimestampCall[0])).toBeInstanceOf(Date);
    });

    it('should not set sync timestamp if sync fails', async () => {
      mockApi.getAllBookmarks.mockRejectedValue(new Error('API error'));

      await expect(SyncService.syncBookmarks(mockSettings)).rejects.toThrow('API error');
      expect(DatabaseService.setLastSyncTimestamp).not.toHaveBeenCalled();
    });

    it('should prevent concurrent syncs', async () => {
      mockApi.getAllBookmarks.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockRemoteBookmarks), 100))
      );

      const sync1 = SyncService.syncBookmarks(mockSettings);
      const sync2 = SyncService.syncBookmarks(mockSettings);

      await Promise.all([sync1, sync2]);

      // API should only be called once
      expect(mockApi.getAllBookmarks).toHaveBeenCalledTimes(1);
    });
  });

  describe('fullSync', () => {
    it('should clear sync timestamp and perform full sync', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);

      await SyncService.fullSync(mockSettings);

      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalledWith('');
      expect(mockApi.getAllBookmarks).toHaveBeenCalledWith(undefined);
    });

    it('should call progress callback during full sync', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      const progressCallback = vi.fn();

      await SyncService.fullSync(mockSettings, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(0, 2);
      expect(progressCallback).toHaveBeenCalledWith(1, 2);
      expect(progressCallback).toHaveBeenCalledWith(2, 2);
    });
  });

  describe('backgroundSync', () => {
    it('should sync when auto_sync is enabled', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      const settingsWithAutoSync = { ...mockSettings, auto_sync: true };

      await SyncService.backgroundSync(settingsWithAutoSync);

      expect(mockApi.getAllBookmarks).toHaveBeenCalled();
    });

    it('should not sync when auto_sync is disabled', async () => {
      const settingsWithoutAutoSync = { ...mockSettings, auto_sync: false };

      await SyncService.backgroundSync(settingsWithoutAutoSync);

      expect(mockApi.getAllBookmarks).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      mockApi.getAllBookmarks.mockRejectedValue(new Error('Network error'));
      const settingsWithAutoSync = { ...mockSettings, auto_sync: true };

      // Should not throw
      await expect(SyncService.backgroundSync(settingsWithAutoSync)).resolves.not.toThrow();
    });
  });

  describe('Asset Syncing', () => {
    const mockAssets = [
      {
        id: 1,
        asset_type: 'snapshot',
        content_type: 'text/html',
        display_name: 'Page Snapshot',
        file_size: 12345,
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
      },
      {
        id: 2,
        asset_type: 'document',
        content_type: 'application/pdf',
        display_name: 'Document.pdf',
        file_size: 54321,
        status: 'pending' as const,
        date_created: '2024-01-01T10:30:00Z',
      },
    ];

    beforeEach(() => {
      // Reset mocks for asset tests
      mockApi.getBookmarkAssets.mockResolvedValue([]);
      mockApi.downloadAsset.mockResolvedValue(new ArrayBuffer(8));
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([]);
      (DatabaseService.saveAsset as any).mockResolvedValue(undefined);
    });

    it('should sync completed assets for bookmarks', async () => {
      mockApi.getAllBookmarks.mockResolvedValue([mockRemoteBookmarks[0]]);
      mockApi.getBookmarkAssets.mockResolvedValue(mockAssets);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

      await SyncService.syncBookmarks(mockSettings);

      expect(mockApi.getBookmarkAssets).toHaveBeenCalledWith(1);
      expect(mockApi.downloadAsset).toHaveBeenCalledWith(1, 1); // Only completed asset
      expect(mockApi.downloadAsset).not.toHaveBeenCalledWith(1, 2); // Pending asset skipped
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          bookmark_id: 1,
          asset_type: 'snapshot',
          content_type: 'text/html',
          display_name: 'Page Snapshot',
          content: expect.any(ArrayBuffer),
          cached_at: expect.any(String),
        })
      );
    });

    it('should skip assets that already exist and are cached', async () => {
      const existingAsset = {
        id: 1,
        bookmark_id: 1,
        asset_type: 'snapshot',
        content_type: 'text/html',
        display_name: 'Page Snapshot',
        file_size: 12345,
        status: 'complete' as const,
        date_created: '2024-01-01T10:00:00Z',
        content: new ArrayBuffer(8),
        cached_at: '2024-01-01T10:30:00Z',
      };

      mockApi.getAllBookmarks.mockResolvedValue([mockRemoteBookmarks[0]]);
      mockApi.getBookmarkAssets.mockResolvedValue([mockAssets[0]]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([existingAsset]);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

      await SyncService.syncBookmarks(mockSettings);

      expect(mockApi.downloadAsset).not.toHaveBeenCalled();
      expect(DatabaseService.saveAsset).not.toHaveBeenCalled();
    });

    it('should handle asset download errors gracefully', async () => {
      mockApi.getAllBookmarks.mockResolvedValue([mockRemoteBookmarks[0]]);
      mockApi.getBookmarkAssets.mockResolvedValue([mockAssets[0]]);
      mockApi.downloadAsset.mockRejectedValue(new Error('Download failed'));
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

      // Should not throw
      await expect(SyncService.syncBookmarks(mockSettings)).resolves.not.toThrow();
      
      expect(DatabaseService.saveAsset).not.toHaveBeenCalled();
    });

    it('should handle asset API errors gracefully', async () => {
      mockApi.getAllBookmarks.mockResolvedValue([mockRemoteBookmarks[0]]);
      mockApi.getBookmarkAssets.mockRejectedValue(new Error('API error'));
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

      // Should not throw
      await expect(SyncService.syncBookmarks(mockSettings)).resolves.not.toThrow();
    });

    it('should only download completed assets', async () => {
      const allStatusAssets = [
        { ...mockAssets[0], status: 'complete' as const },
        { ...mockAssets[1], status: 'pending' as const },
        { id: 3, asset_type: 'test', content_type: 'text/plain', display_name: 'Test', file_size: 100, status: 'failure' as const, date_created: '2024-01-01T11:00:00Z' },
      ];

      mockApi.getAllBookmarks.mockResolvedValue([mockRemoteBookmarks[0]]);
      mockApi.getBookmarkAssets.mockResolvedValue(allStatusAssets);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

      await SyncService.syncBookmarks(mockSettings);

      expect(mockApi.downloadAsset).toHaveBeenCalledTimes(1);
      expect(mockApi.downloadAsset).toHaveBeenCalledWith(1, 1); // Only the completed asset
    });

    it('should sync read status back to Linkding', async () => {
      const bookmarkNeedingSync = { ...mockLocalBookmarks[0], needs_read_sync: true };
      
      mockApi.getAllBookmarks.mockResolvedValue([]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);
      (DatabaseService.getBookmarksNeedingReadSync as any).mockResolvedValue([bookmarkNeedingSync]);
      mockApi.markBookmarkAsRead.mockResolvedValue(mockRemoteBookmarks[0]);

      await SyncService.syncBookmarks(mockSettings);

      expect(mockApi.markBookmarkAsRead).toHaveBeenCalledWith(1);
      expect(DatabaseService.markBookmarkReadSynced).toHaveBeenCalledWith(1);
    });

    it('should handle read sync errors gracefully', async () => {
      const bookmarkNeedingSync = { ...mockLocalBookmarks[0], needs_read_sync: true };
      
      mockApi.getAllBookmarks.mockResolvedValue([]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);
      (DatabaseService.getBookmarksNeedingReadSync as any).mockResolvedValue([bookmarkNeedingSync]);
      mockApi.markBookmarkAsRead.mockRejectedValue(new Error('Read sync failed'));

      // Should not throw
      await expect(SyncService.syncBookmarks(mockSettings)).resolves.not.toThrow();
      
      expect(DatabaseService.markBookmarkReadSynced).not.toHaveBeenCalled();
    });
  });

  describe('Archived Asset Syncing', () => {
    beforeEach(() => {
      // Mock archived bookmark asset response
      mockApi.getBookmarkAssets.mockResolvedValue([
        { id: 1, status: 'complete', display_name: 'Archive Asset', content_type: 'text/html' }
      ]);
    });

    it('should sync metadata only for archived bookmarks', async () => {
      const archivedBookmark = {
        ...mockRemoteBookmarks[0],
        is_archived: true
      };

      mockApi.getAllBookmarks.mockResolvedValue([archivedBookmark]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);

      await SyncService.syncBookmarks(mockSettings);

      // Should save asset metadata without content
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          bookmark_id: 1,
          status: 'complete',
          display_name: 'Archive Asset',
          // content and cached_at should be omitted
        })
      );

      // Should not download asset content
      expect(mockApi.downloadAsset).not.toHaveBeenCalled();
    });

    it('should clean up cached content when bookmark becomes archived', async () => {
      const previouslyUnarchived: LocalBookmark = { 
        ...mockRemoteBookmarks[0], 
        is_archived: false,
        last_read_at: '2024-01-01T12:00:00Z',
        read_progress: 50,
        reading_mode: 'readability',
        is_synced: true,
        date_modified: '2024-01-01T10:00:00Z', // Older than remote
      } as LocalBookmark;
      const nowArchived = { 
        ...mockRemoteBookmarks[0], 
        is_archived: true,
        date_modified: '2024-01-03T10:00:00Z' // Newer than local
      };

      mockApi.getAllBookmarks.mockResolvedValue([nowArchived]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([previouslyUnarchived]);
      
      // Ensure archived asset sync method has assets to work with
      mockApi.getBookmarkAssets.mockResolvedValue([
        { id: 1, status: 'complete', display_name: 'Archive Asset', content_type: 'text/html' }
      ]);

      await SyncService.syncBookmarks(mockSettings);

      // Should clear cached content for newly archived bookmark
      expect(DatabaseService.clearAssetContent).toHaveBeenCalledWith(1);
    });

    it('should not clean up content for bookmarks that were already archived', async () => {
      const alreadyArchived = { ...mockRemoteBookmarks[0], is_archived: true };

      mockApi.getAllBookmarks.mockResolvedValue([alreadyArchived]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([alreadyArchived]);

      await SyncService.syncBookmarks(mockSettings);

      // Should not clean up content if already archived
      expect(DatabaseService.clearAssetContent).not.toHaveBeenCalled();
    });

    it('should sync assets normally for unarchived bookmarks', async () => {
      const unarchivedBookmark = { ...mockRemoteBookmarks[0], is_archived: false };
      
      mockApi.getAllBookmarks.mockResolvedValue([unarchivedBookmark]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([]);
      mockApi.downloadAsset.mockResolvedValue(new ArrayBuffer(8));

      await SyncService.syncBookmarks(mockSettings);

      // Should download and cache content for unarchived bookmarks
      expect(mockApi.downloadAsset).toHaveBeenCalledWith(1, 1);
      expect(DatabaseService.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          bookmark_id: 1,
          content: expect.any(ArrayBuffer),
          cached_at: expect.any(String)
        })
      );
    });

    it('should handle errors during archived asset sync gracefully', async () => {
      const archivedBookmark = { ...mockRemoteBookmarks[0], is_archived: true };
      
      mockApi.getAllBookmarks.mockResolvedValue([archivedBookmark]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      mockApi.getBookmarkAssets.mockRejectedValue(new Error('API Error'));

      // Should not throw error
      await expect(SyncService.syncBookmarks(mockSettings)).resolves.not.toThrow();
      
      // Should still complete sync
      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalled();
    });
  });

  describe('Background Sync Events', () => {
    let syncService: any;
    let eventListeners: { [key: string]: any[] };

    beforeEach(() => {
      syncService = SyncService.getInstance();
      eventListeners = {};
      
      // Mock addEventListener to capture event listeners
      syncService.addEventListener = vi.fn((event: string, listener: any) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(listener);
      });

      // Mock dispatchEvent to call listeners
      syncService.dispatchEvent = vi.fn((event: any) => {
        const listeners = eventListeners[event.type] || [];
        listeners.forEach(listener => listener(event));
      });

      // Setup default mocks
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      (DatabaseService.getAssetsByBookmarkId as any).mockResolvedValue([]);
      (DatabaseService.getBookmarksNeedingReadSync as any).mockResolvedValue([]);
    });

    it('should emit sync-initiated event immediately', async () => {
      const syncInitiatedSpy = vi.fn();
      eventListeners['sync-initiated'] = [syncInitiatedSpy];

      await SyncService.syncBookmarks(mockSettings);

      expect(syncInitiatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-initiated',
          detail: {}
        })
      );
    });

    it('should emit sync-started event with total count', async () => {
      const syncStartedSpy = vi.fn();
      eventListeners['sync-started'] = [syncStartedSpy];

      await SyncService.syncBookmarks(mockSettings);

      expect(syncStartedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-started',
          detail: { total: 2 }
        })
      );
    });

    it('should emit sync-initiated before sync-started', async () => {
      const events: string[] = [];
      eventListeners['sync-initiated'] = [() => events.push('initiated')];
      eventListeners['sync-started'] = [() => events.push('started')];

      await SyncService.syncBookmarks(mockSettings);

      expect(events).toEqual(['initiated', 'started']);
    });

    it('should emit sync-progress events during sync', async () => {
      const syncProgressSpy = vi.fn();
      eventListeners['sync-progress'] = [syncProgressSpy];

      await SyncService.syncBookmarks(mockSettings);

      // Should emit progress for each bookmark
      expect(syncProgressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-progress',
          detail: { current: 1, total: 2 }
        })
      );
      expect(syncProgressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-progress',
          detail: { current: 2, total: 2 }
        })
      );
    });

    it('should emit bookmark-synced events for updated bookmarks', async () => {
      const bookmarkSyncedSpy = vi.fn();
      eventListeners['bookmark-synced'] = [bookmarkSyncedSpy];

      await SyncService.syncBookmarks(mockSettings);

      // Should emit for each synced bookmark
      expect(bookmarkSyncedSpy).toHaveBeenCalledTimes(2);
      expect(bookmarkSyncedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bookmark-synced',
          detail: expect.objectContaining({
            bookmark: expect.objectContaining({ id: 1 }),
            current: 1,
            total: 2
          })
        })
      );
    });

    it('should emit sync-completed event after successful sync', async () => {
      const syncCompletedSpy = vi.fn();
      eventListeners['sync-completed'] = [syncCompletedSpy];

      await SyncService.syncBookmarks(mockSettings);

      expect(syncCompletedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-completed',
          detail: { processed: 2 }
        })
      );
    });

    it('should emit sync-error event when sync fails', async () => {
      const syncErrorSpy = vi.fn();
      const testError = new Error('Sync failed');
      eventListeners['sync-error'] = [syncErrorSpy];

      mockApi.getAllBookmarks.mockRejectedValue(testError);

      await expect(SyncService.syncBookmarks(mockSettings)).rejects.toThrow('Sync failed');

      expect(syncErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync-error',
          detail: { error: testError }
        })
      );
    });

    it('should not emit bookmark-synced for bookmarks that do not need updating', async () => {
      const bookmarkSyncedSpy = vi.fn();
      eventListeners['bookmark-synced'] = [bookmarkSyncedSpy];

      // Mock local bookmarks that are newer than remote
      const newerLocalBookmarks = mockRemoteBookmarks.map(b => ({
        ...b,
        last_read_at: '2024-01-01T12:00:00Z',
        read_progress: 50,
        reading_mode: 'readability' as const,
        is_synced: true,
        date_modified: '2024-01-03T10:00:00Z' // Newer than remote
      }));

      (DatabaseService.getAllBookmarks as any).mockResolvedValue(newerLocalBookmarks);

      await SyncService.syncBookmarks(mockSettings);

      // Should not emit bookmark-synced for up-to-date bookmarks
      expect(bookmarkSyncedSpy).not.toHaveBeenCalled();
    });

    it('should yield control periodically during sync', async () => {
      // Create a large number of bookmarks to test yielding
      const manyBookmarks = Array.from({ length: 10 }, (_, i) => ({
        ...mockRemoteBookmarks[0],
        id: i + 1,
        title: `Bookmark ${i + 1}`
      }));

      mockApi.getAllBookmarks.mockResolvedValue(manyBookmarks);
      
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      
      await SyncService.syncBookmarks(mockSettings);

      // Should call setTimeout for yielding control (every 5 bookmarks)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
      
      setTimeoutSpy.mockRestore();
    });

    it('should maintain singleton instance', () => {
      const instance1 = SyncService.getInstance();
      const instance2 = SyncService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Sync State Persistence', () => {
    it('should track sync progress state across component lifecycle', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);

      // Sync should not be in progress initially
      expect(SyncService.isSyncInProgress()).toBe(false);
      expect(SyncService.getCurrentSyncProgress()).toEqual({ current: 0, total: 0 });

      // Start sync (don't await to check intermediate state)
      const syncPromise = SyncService.syncBookmarks(mockSettings);

      // Allow some async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be in progress now
      expect(SyncService.isSyncInProgress()).toBe(true);
      const progress = SyncService.getCurrentSyncProgress();
      expect(progress.total).toBe(2); // Two mock bookmarks
      expect(progress.current).toBeGreaterThanOrEqual(0);
      expect(progress.current).toBeLessThanOrEqual(2);

      // Wait for completion
      await syncPromise;

      // Should be finished
      expect(SyncService.isSyncInProgress()).toBe(false);
      expect(SyncService.getCurrentSyncProgress()).toEqual({ current: 0, total: 0 });
    });

    it('should maintain progress state during sync', async () => {
      const progressCallback = vi.fn();
      
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);

      await SyncService.syncBookmarks(mockSettings, progressCallback);

      // Progress callback should have been called with state that matches getCurrentSyncProgress
      expect(progressCallback).toHaveBeenCalledWith(0, 2); // Start
      expect(progressCallback).toHaveBeenCalledWith(1, 2); // First bookmark
      expect(progressCallback).toHaveBeenCalledWith(2, 2); // Second bookmark
    });

    it('should reset sync state on error', async () => {
      mockApi.getAllBookmarks.mockRejectedValue(new Error('Sync failed'));

      try {
        await SyncService.syncBookmarks(mockSettings);
      } catch (error) {
        // Expected to throw
      }

      // State should be reset even on error
      expect(SyncService.isSyncInProgress()).toBe(false);
      expect(SyncService.getCurrentSyncProgress()).toEqual({ current: 0, total: 0 });
    });
  });
});