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
});